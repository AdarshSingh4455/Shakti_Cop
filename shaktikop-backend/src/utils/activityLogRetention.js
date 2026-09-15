const { runIfLeader } = require('./singleFlight');
const db = require('../config/db');
const { captureException } = require('./sentry');

// ============================================================
// Activity Log Retention — पहले activity_logs तालिका पर कोई सफ़ाई (cleanup) नहीं
// थी — हर login/logout/कार्रवाई हमेशा के लिए जमा होती रहती (और अब failed-login
// भी लॉग होने लगी है, इसलिए और तेज़ी से बढ़ेगी)। समय के साथ यह DB storage और
// क्वेरी-गति दोनों पर असर डाल सकता था।
//
// कितने दिन तक रखना है, यह ACTIVITY_LOG_RETENTION_DAYS env variable से तय होता
// है (डिफ़ॉल्ट 365 दिन — 1 साल, अधिकतर जांच/compliance ज़रूरतों के लिए पर्याप्त)।
// असली क़ानूनी/नीतिगत ज़रूरत अलग हो तो .env में बदल सकते हैं — कोड बदलने की ज़रूरत नहीं।
// ============================================================

const RETENTION_DAYS = Number(process.env.ACTIVITY_LOG_RETENTION_DAYS || 365);

async function cleanupOldActivityLogs() {
  try {
    const result = await db.query(
      `DELETE FROM activity_logs WHERE created_at < now() - interval '1 day' * $1`,
      [RETENTION_DAYS]
    );
    if (result.rowCount > 0) {
      console.log(`🧹 activity_logs सफ़ाई: ${result.rowCount} पुरानी (${RETENTION_DAYS} दिन से ज़्यादा) प्रविष्टियां हटाई गईं`);
    }
    return { deleted: result.rowCount };
  } catch (e) {
    // 🐛 बग फ़िक्स (निगरानी): पहले यह विफलता सिर्फ़ console तक रहती — यानी अगर यह
    // पृष्ठभूमि-कार्य चुपचाप रोज़ विफल होता रहे, किसी को कभी पता ही नहीं चलता। अब
    // Sentry को भी सूचना जाती है (SENTRY_DSN सेट न हो तो कुछ नहीं होता)।
    console.error('activity_logs सफ़ाई विफल:', e.message);
    captureException(e);
    return { deleted: 0, error: e.message };
  }
}

// रोज़ाना एक बार काफ़ी है — यह कोई तुरंत-असर वाली सुरक्षा-कार्रवाई नहीं, सिर्फ़
// storage प्रबंधन है
function startActivityLogCleanupScheduler() {
  // सफ़ाई एक ही instance से चले — देखें utils/singleFlight.js
  const job = () => runIfLeader('activityLogCleanup', cleanupOldActivityLogs);
  job();
  setInterval(job, 24 * 60 * 60 * 1000);
}

module.exports = { startActivityLogCleanupScheduler, cleanupOldActivityLogs };
