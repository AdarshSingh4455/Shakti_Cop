require('dotenv').config();
const db = require('../config/db');
const { computeEntryHash } = require('../utils/activityLog');

// ============================================================
// audit-लॉग की जाँच — क्या किसी ने उसमें छेड़छाड़ की?
//
// यह script दो अलग चीज़ें पकड़ती है:
//
//  1. बदली गई पंक्ति — हर पंक्ति का entry_hash दोबारा बनाकर मिलाया जाता है।
//     किसी ने details/actor/समय कुछ भी बदला हो, तो hash मेल नहीं खाएगा।
//     (सही hash बनाने के लिए server की गुप्त key चाहिए, जो database में नहीं है।)
//
//  2. मिटाई गई पंक्ति — id क्रम में चलती है, इसलिए बीच से कोई पंक्ति हटाई जाए तो
//     श्रृंखला में छेद (gap) दिख जाता है।
//
// ⚠️ जो यह script नहीं पकड़ सकती (साफ़ बता देना ज़रूरी है):
//     • सबसे नई पंक्तियों को अंत से काट देना — id बस वहीं रुक जाती है, और यह
//       "अभी कोई गतिविधि नहीं हुई" से अलग नहीं दिखता। इसके लिए लॉग को किसी बाहरी
//       जगह भेजना पड़ता है (जैसे SIEM), जो अलग इंतज़ाम है।
//     • JWT_SECRET बदल जाए तो पुरानी सारी पंक्तियां "बदली हुई" दिखेंगी — इसलिए
//       secret बदलते समय यह बात ध्यान में रखें।
//
// चलाने के लिए:
//   node src/scripts/verifyAuditLog.js
// ============================================================

async function main() {
  if (!(process.env.AUDIT_HMAC_KEY || process.env.JWT_SECRET)) {
    console.error('⛔ JWT_SECRET सेट नहीं है — इसके बिना hash की जाँच संभव नहीं।');
    process.exit(1);
  }

  const result = await db.query(
    `SELECT id, actor_role, actor_id, actor_name, action, details, ip_address, created_at, entry_hash
     FROM activity_logs ORDER BY id ASC`
  );
  const rows = result.rows;
  if (rows.length === 0) {
    console.log('audit-लॉग खाली है — जाँचने को कुछ नहीं।');
    process.exit(0);
  }

  let verified = 0;
  let legacy = 0;
  const tampered = [];
  const gaps = [];

  let expectedId = null;
  for (const r of rows) {
    // 1️⃣ id में छेद = कोई पंक्ति मिटाई गई
    if (expectedId !== null && Number(r.id) !== expectedId) {
      gaps.push({ from: expectedId, to: Number(r.id) - 1, count: Number(r.id) - expectedId });
    }
    expectedId = Number(r.id) + 1;

    // 2️⃣ hash की जाँच
    if (!r.entry_hash) {
      legacy += 1; // इस सुविधा से पहले की पंक्ति — इसे "छेड़छाड़" नहीं गिना जाता
      continue;
    }
    const expected = computeEntryHash({
      actorRole: r.actor_role,
      actorId: r.actor_id,
      actorName: r.actor_name,
      action: r.action,
      details: r.details,
      ip: r.ip_address,
      createdAt: new Date(r.created_at).toISOString(),
    });
    if (expected === r.entry_hash) verified += 1;
    else tampered.push({ id: r.id, action: r.action, at: r.created_at });
  }

  console.log('\n──────── audit-लॉग जाँच ────────');
  console.log(`कुल पंक्तियां           : ${rows.length}`);
  console.log(`✅ सही पाई गईं          : ${verified}`);
  if (legacy > 0) {
    console.log(`ℹ️  पुरानी (बिना hash)   : ${legacy}  — इस सुविधा से पहले की, इनकी जाँच संभव नहीं`);
  }

  if (tampered.length === 0 && gaps.length === 0) {
    console.log('\n✅ कोई छेड़छाड़ नहीं मिली।\n');
    process.exit(0);
  }

  if (tampered.length > 0) {
    // 🐛 ज़रूरी फ़र्क़: अगर *हर एक* पंक्ति विफल हो रही है, तो इसकी कहीं ज़्यादा
    // संभावना यह है कि JWT_SECRET बदल गया — न कि किसी ने एक-एक करके सारी पंक्तियां
    // दोबारा लिखीं (जो व्यावहारिक रूप से असंभव है)। इसे "छेड़छाड़" कहकर सबसे ऊँची
    // चेतावनी देना ग़लत होगा: टीम एक ऐसे हमले की जाँच में लग जाएगी जो हुआ ही नहीं।
    if (verified === 0 && legacy === 0 && tampered.length === rows.length) {
      console.error('\n⚠️  हर पंक्ति विफल हो रही है — यह लगभग निश्चित रूप से छेड़छाड़ नहीं है।');
      console.error('   सबसे संभावित कारण: JWT_SECRET बदल गया है (मुहर उसी से बनती है)।');
      console.error('   जो secret इन पंक्तियों के बनते समय लगा था, उसी के साथ यह जाँच चलाएं।');
      console.error(`   (कुल ${rows.length} पंक्तियां — किसी हमलावर का एक-एक करके सब दोबारा`);
      console.error('    लिखना व्यावहारिक रूप से असंभव है।)\n');
      process.exit(3);
    }
    console.error(`\n🔴 ${tampered.length} पंक्तियां बदली हुई मिलीं:`);
    tampered.slice(0, 20).forEach((t) => console.error(`   id=${t.id}  action=${t.action}  ${t.at}`));
    if (tampered.length > 20) console.error(`   … और ${tampered.length - 20}`);
  }
  if (gaps.length > 0) {
    console.error(`\n🔴 ${gaps.length} जगह पंक्तियां मिटाई गई लगती हैं:`);
    gaps.slice(0, 20).forEach((g) => console.error(`   id ${g.from} से ${g.to} तक (${g.count} पंक्तियां) गायब`));
    if (gaps.length > 20) console.error(`   … और ${gaps.length - 20}`);
  }
  console.error('\n⚠️ यह गंभीर है — audit-लॉग वही रिकॉर्ड है जिसके भरोसे बाद में जाँच होती है।\n');
  process.exit(2);
}

main().catch((err) => {
  console.error('जाँच विफल:', err.message);
  process.exit(1);
});
