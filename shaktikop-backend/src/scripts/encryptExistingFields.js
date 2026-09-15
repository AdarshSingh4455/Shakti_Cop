// ============================================================
// एक-बार चलने वाली माइग्रेशन स्क्रिप्ट — पहले से डेटाबेस में मौजूद plain-text
// संवेदनशील डेटा (पीड़ित का नाम/मोबाइल/पिता का नाम/पता, GPS निर्देशांक) को
// encrypted रूप में बदलती है।
//
// नया डेटा (createComplaint/updateLiveLocation आदि से) अपने-आप encrypted सेव
// होता है — यह स्क्रिप्ट सिर्फ़ field-level encryption लागू करने से *पहले* से
// मौजूद पुराने rows के लिए एक-बार चलानी है।
//
// ⚠️ चलाने से पहले:
//   1. FIELD_ENCRYPTION_KEY .env में सेट होनी चाहिए (देखें src/utils/fieldCrypto.js
//      में उसे बनाने का तरीक़ा)।
//   2. अगर latitude/longitude/live_lat/live_lng कॉलम अभी भी DOUBLE PRECISION हैं
//      (पुराना deployed डेटाबेस), तो पहले src/db/field_encryption_gps_columns.sql
//      चलाएं — वरना यह स्क्रिप्ट टाइप-मिसमैच त्रुटि देगी।
//
// चलाएं:
//   node src/scripts/encryptExistingFields.js
//
// सुरक्षित रूप से बार-बार चलाई जा सकती है — जो value पहले से encrypted है
// (enc:v1: से शुरू होती है) उसे दोबारा encrypt नहीं करती।
// ============================================================

require('dotenv').config();
const db = require('../config/db');
const { encryptField, decryptField, blindIndex } = require('../utils/fieldCrypto');

const ENC_PREFIX = 'enc:v1:';

// 🐛 बग फ़िक्स (गंभीर): नीचे "पहले से encrypted है तो छोड़ दो" वाला नियम पहली बार
// migration (plaintext → encrypted) के लिए सही है, पर key-ROTATION में हर मान पहले से
// encrypted होता है (पुरानी key से) — यानी script सब कुछ छोड़ देती और rotation असल में
// होता ही नहीं। fieldCrypto.js में rotation का जो चरण-4 लिखा है, वह चुपचाप कुछ नहीं
// करता था। अब ROTATE_MODE में पुराना मान पहले decrypt (previous-key fallback से) होता
// है, फिर नई key से दोबारा encrypt।
//
// ⛔ सबसे ज़रूरी सुरक्षा: अगर decrypt विफल हो तो fieldCrypto '••••••' लौटाता है। उसे
//    कभी दोबारा encrypt नहीं करना — वरना असली डेटा हमेशा के लिए मिट जाएगा। इसलिए
//    ऐसी पंक्ति को छुआ ही नहीं जाता (और गिनकर अंत में चेतावनी दी जाती है)।
const ROTATE_MODE = !!process.env.FIELD_ENCRYPTION_KEY_PREVIOUS;
const MASKED = '••••••';
let undecryptable = 0;

// encrypted मान को नई key से दोबारा encrypt करता है; न कर सके तो null लौटाता है
function reEncrypt(value) {
  const plain = decryptField(value);
  if (plain === null || plain === MASKED) {
    undecryptable += 1;
    return null; // छुओ मत
  }
  return { encrypted: encryptField(plain), plain };
}

async function migrateColumn(table, column) {
  const result = await db.query(`SELECT id, ${column} FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`);
  let updated = 0;
  let skipped = 0;
  let rotated = 0;
  for (const row of result.rows) {
    const value = row[column];
    if (typeof value === 'string' && value.startsWith(ENC_PREFIX)) {
      if (!ROTATE_MODE) {
        skipped += 1;
        continue; // पहले से encrypted
      }
      const r = reEncrypt(value);
      if (!r) { skipped += 1; continue; }
      await db.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [r.encrypted, row.id]);
      rotated += 1;
      continue;
    }
    const encrypted = encryptField(value);
    await db.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [encrypted, row.id]);
    updated += 1;
  }
  console.log(`✅ ${table}.${column} — ${updated} नए encrypted, ${rotated} rotate हुए, ${skipped} छोड़े गए`);
}

// victim_mobile के लिए अलग — encrypt करने के साथ-साथ victim_mobile_hash
// (deterministic blind index, डुप्लीकेट-मिलान के लिए) भी असली plaintext से बनाना
// ज़रूरी है, ciphertext से नहीं।
async function migrateVictimMobile() {
  const result = await db.query(`SELECT id, victim_mobile FROM complaints WHERE victim_mobile IS NOT NULL AND victim_mobile != ''`);
  let updated = 0;
  let skipped = 0;
  let rotated = 0;
  for (const row of result.rows) {
    const value = row.victim_mobile;
    if (typeof value === 'string' && value.startsWith(ENC_PREFIX)) {
      if (!ROTATE_MODE) {
        skipped += 1;
        continue;
      }
      // 🐛 rotation में यही सबसे ज़रूरी है — hash भी नई key से दोबारा बनना चाहिए,
      // वरना डुप्लीकेट-पहचान चुपचाप काम करना बंद कर देती है
      const r = reEncrypt(value);
      if (!r) { skipped += 1; continue; }
      await db.query('UPDATE complaints SET victim_mobile = $1, victim_mobile_hash = $2 WHERE id = $3', [
        r.encrypted,
        blindIndex(r.plain),
        row.id,
      ]);
      rotated += 1;
      continue;
    }
    await db.query('UPDATE complaints SET victim_mobile = $1, victim_mobile_hash = $2 WHERE id = $3', [
      encryptField(value),
      blindIndex(value),
      row.id,
    ]);
    updated += 1;
  }
  console.log(`✅ complaints.victim_mobile (+ hash) — ${updated} नए encrypted, ${rotated} rotate हुए, ${skipped} छोड़े गए`);
}

// 🐛 बग फ़िक्स: accused_* फ़ील्ड (दोहराए-आरोपी पहचान वाली सुविधा) यह script लिखे जाने
// के बाद जोड़ी गई थीं, इसलिए यहाँ छूट गई थीं। नतीजा: key-rotation के बाद यह script
// चलाने पर भी accused_mobile_hash पुरानी key का ही रह जाता — यानी दोहराए-आरोपी मिलान
// टूटा ही रहता, जबकि यह script चलाने का मक़सद ही उसे ठीक करना है।
async function migrateAccusedFields() {
  const result = await db.query(
    `SELECT id, accused_name, accused_mobile FROM complaints
     WHERE accused_name IS NOT NULL OR accused_mobile IS NOT NULL`
  );
  let updated = 0;
  let skipped = 0;
  let rotated = 0;
  for (const row of result.rows) {
    const nameIsEnc = typeof row.accused_name === 'string' && row.accused_name.startsWith(ENC_PREFIX);
    const mobIsEnc = typeof row.accused_mobile === 'string' && row.accused_mobile.startsWith(ENC_PREFIX);
    const allEnc = (row.accused_name ? nameIsEnc : true) && (row.accused_mobile ? mobIsEnc : true);

    if (allEnc && !ROTATE_MODE) { skipped += 1; continue; }

    let newName = row.accused_name;
    let newMobile = row.accused_mobile;
    let newHash = null;
    let failed = false;

    if (row.accused_name) {
      if (nameIsEnc) {
        if (ROTATE_MODE) { const r = reEncrypt(row.accused_name); if (r) newName = r.encrypted; else failed = true; }
      } else newName = encryptField(row.accused_name);
    }
    if (row.accused_mobile) {
      if (mobIsEnc) {
        if (ROTATE_MODE) {
          const r = reEncrypt(row.accused_mobile);
          if (r) { newMobile = r.encrypted; newHash = blindIndex(r.plain); } else failed = true;
        }
      } else { newMobile = encryptField(row.accused_mobile); newHash = blindIndex(row.accused_mobile); }
    }
    if (failed) { skipped += 1; continue; }

    await db.query(
      `UPDATE complaints SET accused_name = $1, accused_mobile = $2,
         accused_mobile_hash = COALESCE($3, accused_mobile_hash) WHERE id = $4`,
      [newName || null, newMobile || null, newHash, row.id]
    );
    if (allEnc) rotated += 1; else updated += 1;
  }
  console.log(`✅ complaints.accused_* (+ hash) — ${updated} नए encrypted, ${rotated} rotate हुए, ${skipped} छोड़े गए`);
}

async function main() {
  if (!process.env.FIELD_ENCRYPTION_KEY) {
    console.error('❌ FIELD_ENCRYPTION_KEY .env में सेट नहीं है — पहले इसे सेट करें, फिर स्क्रिप्ट चलाएं।');
    console.error('   बनाने के लिए: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  if (ROTATE_MODE) {
    console.log('🔄 ROTATION मोड — FIELD_ENCRYPTION_KEY_PREVIOUS सेट है, इसलिए पहले से');
    console.log('   encrypted डेटा भी पुरानी key से पढ़कर नई key से दोबारा encrypt होगा');
    console.log('   (blind-index hash भी दोबारा बनेंगे — डुप्लीकेट/दोहराए-आरोपी मिलान के लिए ज़रूरी)।');
  } else {
    console.log('🔒 मौजूदा संवेदनशील डेटा को encrypt किया जा रहा है...');
  }
  await migrateColumn('complaints', 'victim_name');
  await migrateVictimMobile();
  await migrateAccusedFields();
  await migrateColumn('complaints', 'victim_father_name');
  await migrateColumn('complaints', 'victim_address');
  await migrateColumn('complaints', 'latitude');
  await migrateColumn('complaints', 'longitude');
  await migrateColumn('complaints', 'live_lat');
  await migrateColumn('complaints', 'live_lng');
  // 🆕 field_visits — यह GPS पहले सादे DOUBLE PRECISION में था (देखें
  // db/field_visit_gps_encryption.sql)। ये निर्देशांक पीड़िता के ठिकाने के होते हैं।
  await migrateColumn('field_visits', 'latitude');
  await migrateColumn('field_visits', 'longitude');
  await migrateColumn('complaint_location_trail', 'latitude');
  await migrateColumn('complaint_location_trail', 'longitude');

  if (undecryptable > 0) {
    // ⚠️ इन्हें जान-बूझकर छुआ नहीं गया — decrypt न हो पाने वाला मान दोबारा encrypt
    // करने का मतलब होता असली डेटा हमेशा के लिए मिटा देना। चुपचाप छोड़ देना भी ग़लत
    // होता, इसलिए साफ़ बताया जा रहा है।
    console.warn(`\n⚠️  ${undecryptable} मान decrypt नहीं हो सके — इन्हें छुआ नहीं गया।`);
    console.warn('   संभव है FIELD_ENCRYPTION_KEY_PREVIOUS ग़लत हो, या वह डेटा किसी');
    console.warn('   तीसरी (और पुरानी) key से encrypt हुआ हो। सही पुरानी key लगाकर');
    console.warn('   यह script दोबारा चलाएं — तब तक वह डेटा ऐप में "••••••" दिखेगा।\n');
  }

  if (ROTATE_MODE && undecryptable === 0) {
    console.log('\n✅ Rotation पूरी हुई — अब .env से FIELD_ENCRYPTION_KEY_PREVIOUS हटा सकते हैं।\n');
  }
  console.log('✅ पूरा हुआ।');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ माइग्रेशन में त्रुटि:', err);
  process.exit(1);
});
