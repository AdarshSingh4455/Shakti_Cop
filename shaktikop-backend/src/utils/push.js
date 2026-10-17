const db = require('../config/db');

// 🔒 अमान्य/हटाए गए टोकनों की सफ़ाई (DeviceNotRegistered) —
// जब Expo push सर्वर यह बताता है कि यह डिवाइस अनरजिस्टर्ड हो चुका है (ऐप अनइंस्टॉल या परमिशन रद्द),
// तो उस टोकन को डेटाबेस से साफ़ कर दिया जाता है ताकि अनावश्यक पुश अनुरोध न भेजे जाएं।
async function cleanupDeadTokens(tokens) {
  const list = (Array.isArray(tokens) ? tokens : [tokens]).filter((t) => t && typeof t === 'string');
  if (list.length === 0) return;
  try {
    for (const token of list) {
      await Promise.allSettled([
        db.query('UPDATE officers SET push_token = NULL WHERE push_token = $1', [token]),
        db.query('UPDATE citizens SET push_token = NULL WHERE push_token = $1', [token]),
        db.query('UPDATE admins SET push_token = NULL WHERE push_token = $1', [token]),
        db.query('UPDATE service_providers SET push_token = NULL WHERE push_token = $1', [token]),
      ]);
    }
  } catch (err) {
    console.error('अमान्य push tokens साफ़ करने में त्रुटि:', err.message);
  }
}

async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!pushToken) return { skipped: true, reason: 'कोई push token नहीं है' };
  // 🐛 बग फ़िक्स (DoS-जोखिम): बाकी हर बाहरी API कॉल (OTP-SMS, Twilio, Overpass) में
  // पहले से timeout था — यहीं छूट गया था। कम से कम एक जगह (alertOfficer) यह
  // await किया जाता है, यानी Expo का push-सर्वर धीमा/अनुत्तरदायी हो तो वह पूरा
  // HTTP अनुरोध हमेशा के लिए रुक सकता था। अब बाक़ी जगहों जैसी ही 8-सेकंड सीमा।
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // 🐛 बग फ़िक्स (सूचना देर से पहुँचना): पहले payload में सिर्फ़ to/sound/title/body
      // जाते थे। FCM की डिफ़ॉल्ट priority "normal" होती है, जिसे Android — ख़ासकर
      // Doze mode में (फ़ोन जेब में पड़ा हो, स्क्रीन बंद) — मिनटों तक टाल सकता है।
      // SOS के लिए यह देरी घातक है: अलर्ट भेजा तो गया, पर अधिकारी के फ़ोन पर देर से
      // बजा। priority: 'high' FCM की high-priority में बदलता है, जो Doze में भी
      // तुरंत पहुँचता है।
      //
      // channelId: Android 8+ में हर सूचना किसी channel से होकर जाती है। SOS को
      // अलग 'sos' channel भेजा जाता है, जो मोबाइल ऐप में MAX importance के साथ बना
      // है (heads-up + आवाज़ + कंपन) — बाक़ी सूचनाएं सामान्य channel से।
      body: JSON.stringify({
        to: pushToken,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId: data && (data.sos || data.checkinComplaintId) ? 'sos' : 'default',
      }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json?.data) {
      const tickets = Array.isArray(json.data) ? json.data : [json.data];
      const deadTokens = [];
      for (const t of tickets) {
        if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') {
          deadTokens.push(pushToken);
        }
      }
      if (deadTokens.length > 0) {
        cleanupDeadTokens(deadTokens).catch(() => {});
      }
    }
    return json;
  } catch (err) {
    return { error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 🚀 Batch Push Notification Dispatch
// कई अधिकारियों/उपयोगकर्ताओं को एक साथ कुशल और सुरक्षित तरीके से नोटिफिकेशन भेजना।
// Expo Push API प्रति बैच 100 संदेशों तक स्वीकार करता है।
// ============================================================
async function sendPushNotificationsBatch(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { sentCount: 0, failedCount: 0, skipped: true };
  }

  const validMessages = [];
  for (const m of messages) {
    if (!m || !m.to || typeof m.to !== 'string') continue;
    const token = m.to.trim();
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      continue;
    }
    validMessages.push({
      to: token,
      sound: m.sound || 'default',
      title: m.title || 'नई सूचना — ShaktiCop',
      body: m.body || '',
      data: m.data || {},
      priority: m.priority || 'high',
      channelId: m.channelId || (m.data && (m.data.sos || m.data.checkinComplaintId) ? 'sos' : 'default'),
    });
  }

  if (validMessages.length === 0) {
    return { sentCount: 0, failedCount: 0, reason: 'कोई वैध push token नहीं मिला' };
  }

  let totalSent = 0;
  let totalFailed = 0;
  const allTickets = [];
  const deadTokens = [];

  const CHUNK_SIZE = 100;
  for (let i = 0; i < validMessages.length; i += CHUNK_SIZE) {
    const chunk = validMessages.slice(i, i + CHUNK_SIZE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
        signal: controller.signal,
      });
      const json = await res.json();
      const tickets = Array.isArray(json?.data) ? json.data : [];
      tickets.forEach((ticket, idx) => {
        allTickets.push(ticket);
        if (ticket.status === 'ok') {
          totalSent++;
        } else {
          totalFailed++;
          if (ticket.details?.error === 'DeviceNotRegistered') {
            const deadToken = chunk[idx]?.to;
            if (deadToken) deadTokens.push(deadToken);
          }
        }
      });
    } catch (err) {
      totalFailed += chunk.length;
    } finally {
      clearTimeout(timer);
    }
  }

  if (deadTokens.length > 0) {
    cleanupDeadTokens(deadTokens).catch(() => {});
  }

  return {
    sentCount: totalSent,
    failedCount: totalFailed,
    tickets: allTickets,
  };
}

module.exports = { sendPushNotification, sendPushNotificationsBatch, cleanupDeadTokens };
