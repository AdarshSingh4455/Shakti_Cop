const { runIfLeader } = require('./singleFlight');
const db = require('../config/db');
const { captureException } = require('./sentry');

// ============================================================
// Location Trail Retention — complaint_location_trail की सफ़ाई
//
// यह तालिका पूरे ऐप का सबसे संवेदनशील डेटा रखती है: पीड़िता का पल-पल का GPS
// रास्ता (SOS व सुरक्षित-यात्रा के दौरान)। इस पर अब तक कोई सफ़ाई नहीं थी —
// हर लोकेशन-अपडेट पर एक नई पंक्ति जुड़ती है और हमेशा के लिए बनी रहती है।
//
// यह दो कारणों से ठीक नहीं था:
//
//  1. निजता (सबसे अहम) — DPDP अधिनियम का बुनियादी सिद्धांत है कि व्यक्तिगत डेटा
//     उतने ही समय तक रखा जाए जितना ज़रूरत हो। किसी की महीनों/सालों पुरानी
//     आवाजाही का पूरा नक़्शा जमा रखना उस सिद्धांत के ख़िलाफ़ है — और अगर कभी
//     डेटा लीक हो, तो नुक़सान कहीं ज़्यादा गंभीर होता है।
//
//  2. आकार — एक ही सुरक्षित-यात्रा (मान लें 2 घंटे, हर 15 सेकंड पर अपडेट) से
//     लगभग 480 पंक्तियां बनती हैं। हज़ारों उपयोगकर्ताओं के साथ यह तालिका सबसे
//     तेज़ी से बढ़ने वाली बन जाती है।
//
// कितने दिन रखना है, यह LOCATION_TRAIL_RETENTION_DAYS से तय होता है (डिफ़ॉल्ट
// 90 दिन — जांच के लिए पर्याप्त, पर अनिश्चितकाल नहीं)। activity_logs (365 दिन)
// से कम जान-बूझकर रखा है, क्योंकि GPS-रास्ता कहीं ज़्यादा संवेदनशील है।
//
// ⚠️ सिर्फ़ बंद हो चुकी (निस्तारित/अस्वीकृत) शिकायतों का ट्रेल हटता है — किसी
//    चालू मामले का रास्ता कभी नहीं हटाया जाता, चाहे वह कितना भी पुराना हो।
// ============================================================

const RETENTION_DAYS = Number(process.env.LOCATION_TRAIL_RETENTION_DAYS || 90);

async function cleanupOldLocationTrails() {
  try {
    const result = await db.query(
      `DELETE FROM complaint_location_trail t
       USING complaints c
       WHERE t.complaint_id = c.id
         AND c.status IN ('निस्तारित', 'अस्वीकृत')
         AND t.recorded_at < now() - interval '1 day' * $1`,
      [RETENTION_DAYS]
    );
    if (result.rowCount > 0) {
      console.log(`🧹 location trail सफ़ाई: ${result.rowCount} पुरानी (${RETENTION_DAYS} दिन से ज़्यादा, बंद मामलों की) प्रविष्टियां हटाई गईं`);
    }
    return { deleted: result.rowCount };
  } catch (e) {
    // 🐛 बग फ़िक्स (निगरानी): पहले यह विफलता सिर्फ़ console तक रहती — यानी अगर यह
    // पृष्ठभूमि-कार्य चुपचाप रोज़ विफल होता रहे, किसी को कभी पता ही नहीं चलता। अब
    // Sentry को भी सूचना जाती है (SENTRY_DSN सेट न हो तो कुछ नहीं होता)।
    console.error('location trail सफ़ाई विफल:', e.message);
    captureException(e);
    return { deleted: 0, error: e.message };
  }
}

// 🆕 OTP रिकॉर्ड की सफ़ाई — otp_requests में हर लॉगिन/साइनअप/पासवर्ड-रीसेट पर एक नई
// पंक्ति जुड़ती है। राज्य-स्तर के उपयोगकर्ता-आधार पर यह database की सबसे तेज़ी से
// बढ़ने वाली तालिका बन जाती है, जबकि OTP ख़ुद कुछ ही मिनटों में समाप्त हो जाता है —
// इसलिए एक दिन से पुरानी पंक्तियों का कोई उपयोग नहीं बचता।
async function cleanupOldOtpRequests() {
  try {
    const result = await db.query("DELETE FROM otp_requests WHERE created_at < now() - interval '1 day'");
    if (result.rowCount > 0) {
      console.log(`🧹 otp_requests सफ़ाई: ${result.rowCount} पुरानी प्रविष्टियां हटाई गईं`);
    }
    return { deleted: result.rowCount };
  } catch (e) {
    console.error('otp_requests सफ़ाई विफल:', e.message);
    captureException(e);
    return { deleted: 0, error: e.message };
  }
}

// रोज़ाना एक बार — यह तुरंत-असर वाली सुरक्षा-कार्रवाई नहीं, निजता व storage प्रबंधन है
function startLocationTrailCleanupScheduler() {
  // सफ़ाई एक ही instance से चले — देखें utils/singleFlight.js
  const job = () =>
    runIfLeader('locationTrailCleanup', async () => {
      await cleanupOldLocationTrails();
      await cleanupOldOtpRequests();
    });
  job();
  setInterval(job, 24 * 60 * 60 * 1000);
}

module.exports = { startLocationTrailCleanupScheduler, cleanupOldLocationTrails, cleanupOldOtpRequests };
