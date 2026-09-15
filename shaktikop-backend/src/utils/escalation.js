const db = require('../config/db');
const { captureException } = require('./sentry');
const { createNotification } = require('./notify');
const { sendPushNotification } = require('./push');
const { decryptField } = require('./fieldCrypto');

// ============================================================
// रात/ऑफ़-आवर escalation — Admin की "ऐप सेटिंग्स" (escalation_rules) के हिसाब से,
// तय समय से ज़्यादा देर बिना कार्यवाही रही शिकायतों को escalate (सभी admins को सूचना) करता है।
// हर 30 मिनट में एक बार चलता है — कोई अलग cron सर्वर नहीं चाहिए।
// ============================================================

// 🐛 बग फ़िक्स (समय-क्षेत्र): पहले यहां new Date().getHours() था, जो सर्वर के अपने
// timezone में घंटा देता है — Railway/AWS जैसे cloud सर्वर पर वह UTC होता है।
// एडमिन "ऐप सेटिंग्स" में after-hours विंडो हमेशा भारतीय समय (IST) सोचकर भरता है
// (जैसे 22 से 6 = रात 10 बजे से सुबह 6 बजे)। नतीजा:
//   • रात 10 बजे IST (= 16:30 UTC) → घंटा 16 मिलता → विंडो में नहीं → escalation चलता ही नहीं
//   • सुबह 3:30 IST (= 22:00 UTC) → घंटा 22 मिलता → विंडो में → escalation चल पड़ता
// यानी पूरी रात-escalation सुविधा लगभग 5:30 घंटे खिसके हुए, ग़लत समय पर चलती थी।
// अब घंटा हमेशा IST में ही निकाला जाता है।
function istHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false,
    }).format(date)
  );
}

function isAfterHours(rules) {
  const hour = istHour();
  const { afterHoursStart, afterHoursEnd } = rules;
  if (afterHoursStart > afterHoursEnd) {
    return hour >= afterHoursStart || hour < afterHoursEnd;
  }
  return hour >= afterHoursStart && hour < afterHoursEnd;
}

async function runEscalationCheck() {
  try {
    const { getCachedSetting } = require('../controllers/appSettingsController');
    const rules = getCachedSetting('escalation_rules');
    if (!rules?.enabled) return { skipped: true, reason: 'escalation बंद है' };
    if (!isAfterHours(rules)) return { skipped: true, reason: 'अभी after-hours विंडो में नहीं है' };

    const hours = rules.escalateAfterHours || 4;
    const result = await db.query(
      `SELECT id, category, district, police_station, created_at, officer_id FROM complaints
       WHERE status NOT IN ('निस्तारित', 'अस्वीकृत')
         AND deleted_at IS NULL
         AND created_at < now() - interval '1 hour' * $1
         AND (escalated_at IS NULL OR escalated_at < now() - interval '6 hours')`,
      [hours]
    );

    if (result.rows.length === 0) return { skipped: false, escalatedCount: 0 };

    // 🐛 बग फ़िक्स: यहाँ एक ही बार पूरे राज्य के सभी admins लाए जाते थे, और फिर हर
    // लंबित शिकायत के लिए उन सबको सूचना भेजी जाती। जैसे 50 लंबित शिकायतें × 40 admins
    // = 2000 सूचनाएं, जिनमें से ज़्यादातर उन admins को जातीं जिनका उस ज़िले से कोई
    // लेना-देना ही नहीं। अब हर शिकायत के लिए सिर्फ़ उसी के ज़िले के admins (और
    // हमेशा राज्य-स्तर के admins, जिनका district NULL होता है)। ज़िले-वार सूची एक
    // बार निकालकर कैश कर लेते हैं ताकि हर शिकायत पर नई query न चले।
    const adminsByDistrict = new Map();
    async function adminsForDistrict(district) {
      const key = (district || '').trim().toLowerCase();
      if (adminsByDistrict.has(key)) return adminsByDistrict.get(key);
      const r = await db.query(
        'SELECT id, push_token FROM admins WHERE is_active = true AND (district IS NULL OR TRIM(LOWER(district)) = $1)',
        [key]
      );
      adminsByDistrict.set(key, r.rows);
      return r.rows;
    }

    for (const complaint of result.rows) {
      const admins = { rows: await adminsForDistrict(complaint.district) };
      const title = '⏰ रात्रि Escalation — बिना कार्यवाही शिकायत';
      const body = `शिकायत ${complaint.id} (${complaint.category}) ${hours} घंटे से लंबित है, अभी तक कार्यवाही नहीं हुई।`;
      for (const a of admins.rows) {
        if (a.push_token) sendPushNotification(a.push_token, title, body, { complaintId: complaint.id, escalation: true });
        createNotification({ recipientRole: 'admin', recipientId: a.id, title, body, data: { complaintId: complaint.id, escalation: true }, priority: 'high' });
      }
      // 🆕 जिस अधिकारी को यह मामला सौंपा गया है, उसे भी बताएं (अगर उनकी preference में
      // "overdue" चालू है) — सिर्फ़ admins को पता चलना काफ़ी नहीं, खुद अधिकारी को भी याद दिलाना ज़रूरी है
      if (complaint.officer_id) {
        const officer = await db.query(
          'SELECT push_token, notification_preferences FROM officers WHERE id = $1 AND is_active = true',
          [complaint.officer_id]
        );
        const o = officer.rows[0];
        if (o && o.notification_preferences?.overdue !== false) {
          if (o.push_token) sendPushNotification(o.push_token, title, body, { complaintId: complaint.id, escalation: true });
          createNotification({ recipientRole: 'officer', recipientId: complaint.officer_id, title, body, data: { complaintId: complaint.id, escalation: true }, priority: 'high' });
        }
      }
      await db.query('UPDATE complaints SET escalated_at = now() WHERE id = $1', [complaint.id]);
    }
    return { skipped: false, escalatedCount: result.rows.length };
  } catch (e) {
    // 🐛 बग फ़िक्स (निगरानी): पहले यह विफलता सिर्फ़ console तक रहती — यानी अगर यह
    // पृष्ठभूमि-कार्य चुपचाप रोज़ विफल होता रहे, किसी को कभी पता ही नहीं चलता। अब
    // Sentry को भी सूचना जाती है (SENTRY_DSN सेट न हो तो कुछ नहीं होता)।
    console.error('Escalation check विफल:', e.message);
    captureException(e);
    return { skipped: true, reason: e.message };
  }
}

// ============================================================
// 🆕 सुरक्षित यात्रा मोड — सुरक्षा-जांच का सर्वर-साइड सुरक्षा-जाल
//
// 🐛 बग फ़िक्स (गंभीर): "क्या आप सुरक्षित पहुंचे?" रिमाइंडर पहले 100% नागरिक के अपने
// फ़ोन पर local notification के भरोसे था — फ़ोन रीस्टार्ट, notification-अनुमति बंद
// होना, बैटरी ख़त्म, या OS द्वारा background task रोक देना — इनमें से कुछ भी हो, तो
// पूरी व्यवस्था चुपचाप विफल हो जाती और किसी को पता ही नहीं चलता। यह पूरी तरह
// escalation_rules (रात्रि/after-hours) से स्वतंत्र चलता है — सुरक्षा किसी admin-सेटिंग
// पर निर्भर नहीं होनी चाहिए, यह हमेशा, दिन हो या रात, सक्रिय रहती है।
// हर 10 मिनट में जांचता है।
// ============================================================
async function runSafeTravelCheckinSafetyNet() {
  try {
    // नागरिक ने फ़ॉर्म में जो अनुमानित यात्रा-समय चुना था (+15 मिनट बफ़र, वैसा ही
    // जैसा device वाले local reminder में है) उसके 20 मिनट बाद तक भी सुरक्षित-पहुंच
    // की पुष्टि न हो — तभी यह जागे। पहले device-रिमाइंडर को मौका मिल जाता है।
    const result = await db.query(
      `SELECT id, victim_name, district, police_station, officer_id, extra_details, created_at
       FROM complaints
       WHERE deleted_at IS NULL
         AND category = 'सुरक्षित यात्रा मोड'
         AND safe_arrival_confirmed = false
         AND sos_triggered = false
         AND status NOT IN ('निस्तारित', 'अस्वीकृत')
         AND created_at < now() - (
           (COALESCE((extra_details->>'travelMinutes')::int, 45) + 15 + 20) || ' minutes'
         )::interval
         AND (checkin_escalated_at IS NULL OR checkin_escalated_at < now() - interval '3 hours')`
    );

    if (result.rows.length === 0) return { skipped: false, checkinEscalatedCount: 0 };

    for (const c of result.rows) {
      const title = '⏰ सुरक्षित यात्रा — सुरक्षा-जांच बाकी है';
      // 🐛 बग फ़िक्स: victim_name डेटाबेस में encrypted है — यहाँ इसे बिना decrypt
      // किए सीधे संदेश में डाला जा रहा था। नतीजा: अधिकारी को सुरक्षित-यात्रा वाली
      // escalation सूचना में पीड़िता के नाम की जगह encrypted कचरा दिखता (जैसे
      // "v1:AbC…xyz ने अभी तक पुष्टि नहीं की")। triggerSos और checkinResponse में
      // decryptField() सही लगा है, बस यह अपने-आप चलने वाला सुरक्षा-जाल छूट गया था —
      // जो असल में Safe Travel Mode की सबसे अहम स्वचालित कड़ी है।
      const body = `${decryptField(c.victim_name)} ने अभी तक सुरक्षित पहुंचने की पुष्टि नहीं की — शिकायत ${c.id}। कृपया संपर्क कर हाल-चाल जानें।`;

      if (c.officer_id) {
        const officer = await db.query('SELECT push_token FROM officers WHERE id = $1 AND is_active = true', [c.officer_id]);
        if (officer.rows[0]?.push_token) sendPushNotification(officer.rows[0].push_token, title, body, { complaintId: c.id });
        if (officer.rows[0]) createNotification({ recipientRole: 'officer', recipientId: c.officer_id, title, body, data: { complaintId: c.id }, priority: 'critical' });
      }
      if (c.district && c.police_station) {
        const shos = await db.query(
          `SELECT id, push_token FROM officers WHERE rank = 'SHO' AND is_active = true
             AND TRIM(LOWER(district)) = TRIM(LOWER($1)) AND TRIM(LOWER(station)) = TRIM(LOWER($2)) AND id != $3`,
          [c.district, c.police_station, c.officer_id || null]
        );
        for (const sho of shos.rows) {
          if (sho.push_token) sendPushNotification(sho.push_token, title, body, { complaintId: c.id });
          createNotification({ recipientRole: 'officer', recipientId: sho.id, title, body, data: { complaintId: c.id }, priority: 'critical' });
        }
      }
      await db.query('UPDATE complaints SET checkin_escalated_at = now() WHERE id = $1', [c.id]);
    }
    return { skipped: false, checkinEscalatedCount: result.rows.length };
  } catch (e) {
    console.error('सुरक्षित यात्रा check-in सुरक्षा-जाल विफल:', e.message);
    captureException(e);
    return { skipped: true, reason: e.message };
  }
}

// 🆕 राज्य-स्तर पर एक से ज़्यादा instance चलेंगे, और setInterval हर instance में
// चलता है। बिना lock के एक ही escalation की कई सूचनाएं जातीं, और "क्या आप सुरक्षित
// हैं?" वाली जाँच पीड़िता को बार-बार भेजी जाती। runIfLeader() से किसी भी समय सिर्फ़
// एक instance यह काम करता है (देखें utils/singleFlight.js)।
const { runIfLeader } = require('./singleFlight');

function startEscalationScheduler() {
  const escalation = () => runIfLeader('escalation', runEscalationCheck);
  const checkin = () => runIfLeader('safeTravelCheckin', runSafeTravelCheckinSafetyNet);
  escalation();
  checkin();
  setInterval(escalation, 30 * 60 * 1000);
  setInterval(checkin, 10 * 60 * 1000);
}

module.exports = { startEscalationScheduler, runEscalationCheck, runSafeTravelCheckinSafetyNet };
