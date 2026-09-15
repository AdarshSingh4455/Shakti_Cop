// ============================================================
// Expo Push Notifications — officer के फोन पर असली नोटिफिकेशन भेजने के लिए।
// इसके लिए officer के डिवाइस से एक push token लेकर officers.push_token में
// सेव करना होगा (मोबाइल ऐप की तरफ़ से — expo-notifications पैकेज इस्तेमाल करके)।
// यह फ़ंक्शन असल में इंटरनेट पर Expo के push सर्वर को कॉल करता है, इसलिए
// production सर्वर पर आउटबाउंड HTTPS एक्सेस चाहिए।
// ============================================================
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
    return await res.json();
  } catch (err) {
    return { error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendPushNotification };
