// ============================================================
// एक ही instance पर चलने वाले काम (single-flight jobs)
//
// समस्या:
//   escalation, safe-travel सुरक्षा-जाँच, रिपोर्ट-ईमेल, पुराना डेटा हटाना — ये सब
//   setInterval से चलते हैं, यानी सर्वर की *हर* प्रति (instance) में चलते हैं।
//   एक ही instance तक तो ठीक है, पर पूरे प्रदेश के लिए 3-4 instance चलाने ही
//   पड़ेंगे — और तब हर काम 3-4 बार होगा:
//     • एक ही escalation की 4 सूचनाएं अधिकारी को जाएंगी
//     • "क्या आप सुरक्षित हैं?" वाली जाँच 4 बार भेजी जाएगी — पीड़िता को बार-बार
//       एक ही सवाल, जिससे असली सुरक्षा-जाँच पर भरोसा घटता है
//     • एक ही PDF रिपोर्ट 4 बार ईमेल होगी
//
//   यह चूक तभी दिखती है जब instance बढ़ाए जाएँ — यानी ठीक उसी दिन जब लोड बढ़ने पर
//   scale करना पड़े। इसलिए scale करने से *पहले* इसे ठीक करना ज़रूरी है।
//
// हल:
//   PostgreSQL का advisory lock। काम शुरू करने से पहले हर instance एक lock माँगता
//   है; जिसे मिल जाए वही चलाता है, बाक़ी चुपचाप छोड़ देते हैं। कोई नया इंफ़्रा
//   (Redis आदि) नहीं चाहिए — वही डेटाबेस काफ़ी है जो पहले से है।
//
//   lock सिर्फ़ उतनी देर रहता है जितनी देर काम चलता है, और instance क्रैश होने पर
//   connection टूटते ही PostgreSQL उसे अपने-आप छोड़ देता है — इसलिए काम हमेशा के
//   लिए अटकता नहीं।
// ============================================================

const db = require('../config/db');

// हर काम की अपनी तयशुदा संख्या (advisory lock इन्हीं से पहचाना जाता है)
const LOCK_IDS = {
  escalation: 4201,
  safeTravelCheckin: 4202,
  reportScheduler: 4203,
  locationTrailCleanup: 4204,
  activityLogCleanup: 4205,
};

async function runIfLeader(jobName, fn) {
  const lockId = LOCK_IDS[jobName];
  if (!lockId) throw new Error(`अज्ञात job: ${jobName}`);

  let client;
  try {
    // lock उसी connection से बँधा होता है, इसलिए pool से एक अलग connection लेकर
    // काम पूरा होने तक उसी पर रखना ज़रूरी है
    client = await db.getClient();
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS got', [lockId]);
    if (!rows[0]?.got) return { skipped: true, reason: 'दूसरा instance यह काम कर रहा है' };

    try {
      return await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {});
    }
  } catch (e) {
    // lock न मिल पाना (जैसे DB क्षण भर के लिए अनुपलब्ध) पूरे काम को तोड़े नहीं —
    // अगला निर्धारित समय फिर कोशिश करेगा
    console.error(`job "${jobName}" के लिए lock लेने में त्रुटि:`, e.message);
    return { skipped: true, reason: e.message };
  } finally {
    if (client) client.release();
  }
}

module.exports = { runIfLeader, LOCK_IDS };
