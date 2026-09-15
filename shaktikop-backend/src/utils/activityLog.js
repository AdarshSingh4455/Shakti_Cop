const db = require('../config/db');
const crypto = require('crypto');

// ============================================================
// हर लॉगिन (सफल व असफल दोनों) और महत्वपूर्ण कार्रवाई पर यह फ़ंक्शन कॉल करें।
// जानबूझकर fire-and-forget रखा गया है (await नहीं करना ज़रूरी) ताकि लॉगिंग में
// कोई गड़बड़ी असली API रिस्पॉन्स को धीमा या असफल न करे — इसलिए त्रुटि सिर्फ़ console
// पर आती है, बाकी कोड नहीं रुकता।
//
// 🆕 SIEM Integration — पहले लॉग सिर्फ़ Postgres की activity_logs तालिका में जाते
// थे, कोई भी बाहरी SIEM/security-monitoring टूल (Splunk, Datadog, ELK आदि) इन्हें
// सीधे नहीं देख पाता (जब तक कोई DB से खींचकर न लाए)। अब हर घटना stdout पर एक
// structured JSON लाइन के रूप में भी लिखी जाती है — किसी भी होस्टिंग प्लेटफ़ॉर्म
// (जैसे Railway) के log-stream से जुड़ा कोई भी SIEM log-forwarding agent इसे
// अपने-आप उठा सकता है, बिना किसी particular vendor की API-key/webhook यहां
// hardcode किए। पहचानना आसान बनाने के लिए हर लाइन "siem":true से शुरू होती है —
// grep/जांच से बाक़ी सामान्य लॉग-लाइनों से अलग किया जा सकता है।
function logToStdout({ actorRole, actorId, actorName, action, details, ip }) {
  try {
    console.log(
      JSON.stringify({
        siem: true,
        timestamp: new Date().toISOString(),
        event: action,
        actorRole,
        actorId,
        actorName,
        details,
        ip,
      })
    );
  } catch (e) {
    // JSON.stringify भी विफल हो (बहुत दुर्लभ) तो भी असली request न रुके
  }
}


// ============================================================
// 🔒 छेड़छाड़ की पहचान (tamper-evidence)
//
// अब तक audit-लॉग सिर्फ़ सादी पंक्तियां थीं — यानी database पर लिखने की पहुँच रखने
// वाला कोई भी व्यक्ति किसी पंक्ति को चुपचाप बदल या मिटा सकता था, और बाद में कोई यह
// जान भी नहीं सकता था। audit का पूरा मक़सद इसी से हार जाता है, क्योंकि लॉग से
// छेड़छाड़ की सबसे बड़ी वजह उसी के पास होती है जिसने कुछ छिपाने लायक़ किया हो।
//
// अब हर पंक्ति के साथ उसका अपना HMAC रखा जाता है (server की गुप्त key से)। पंक्ति
// बाद में बदली जाए तो hash मेल नहीं खाएगा — और key के बिना सही hash बनाया नहीं जा
// सकता, इसलिए बदलाव छिपाया भी नहीं जा सकता।
//
// ⚖️ पूरी hash-chain (हर पंक्ति में पिछली का hash) जान-बूझकर नहीं बनाई: उसके लिए हर
//    audit-insert को क्रम में चलाना पड़ता (पिछली पंक्ति पर lock लेकर), और यह ऐप कई
//    कामों पर audit लिखता है — SOS के समय तो एक साथ कई। यानी वह ठीक उसी वक़्त अड़चन
//    बनती जब सिस्टम सबसे व्यस्त होता। मौजूदा तरीक़ा पंक्ति *बदलने* का पता लगा लेता है;
//    पंक्ति *मिटाने* का पता id की श्रृंखला में छेद से चलता है
//    (देखें scripts/verifyAuditLog.js)।
function computeEntryHash({ actorRole, actorId, actorName, action, details, ip, createdAt }) {
  // 🐛 बग फ़िक्स (audit-trail की अखंडता, गंभीर): यह key पहले सीधे JWT_SECRET से बनती
  // थी। पर JWT_SECRET कभी बदलना पड़ सकता है — जैसे वह कहीं उजागर हो जाए, या नियमित
  // rotation नीति के तहत। उस पल *पूरे पुराने audit-log के hash बेमेल हो जाते*, यानी
  // महीनों का प्रमाण-योग्य रिकॉर्ड एक झटके में असत्यापित हो जाता — और यह तब पता चलता
  // जब किसी विवाद में उसी लॉग की ज़रूरत पड़ती।
  //
  // इसीलिए अब एक अलग AUDIT_HMAC_KEY है। सेट न हो तो JWT_SECRET ही चलता है (यानी
  // मौजूदा पंक्तियाँ जस की तस सत्यापित होती रहेंगी, कुछ नहीं टूटेगा)।
  //
  // ⚠️ JWT_SECRET बदलने से *पहले* यह करें:
  //     railway variables --set AUDIT_HMAC_KEY=<JWT_SECRET का मौजूदा मान>
  //   इससे audit-hash वैसे ही बने रहेंगे, और उसके बाद JWT_SECRET स्वतंत्र रूप से
  //   बदला जा सकता है।
  const secret = process.env.AUDIT_HMAC_KEY || process.env.JWT_SECRET || '';
  const key = crypto.createHash('sha256').update(secret).update('audit-hash-v1').digest();
  const canonical = [actorRole, actorId || '', actorName || '', action, details || '', ip || '', createdAt].join('|');
  return crypto.createHmac('sha256', key).update(canonical).digest('hex');
}

async function logActivity({ actorRole, actorId, actorName, action, details, req }) {
  const ip = req?.ip || req?.headers?.['x-forwarded-for'] || null;
  logToStdout({ actorRole, actorId, actorName, action, details, ip });
  try {
    // created_at यहीं तय करते हैं (DB के default पर नहीं छोड़ते) ताकि hash बिल्कुल
    // उसी मान पर बने जो पंक्ति में सेव होगा — वरना बाद में सत्यापन कभी मेल न खाता
    const createdAt = new Date().toISOString();
    const entryHash = computeEntryHash({ actorRole, actorId, actorName, action, details, ip, createdAt });
    await db.query(
      `INSERT INTO activity_logs (actor_role, actor_id, actor_name, action, details, ip_address, created_at, entry_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [actorRole, actorId || null, actorName || null, action, details || null, ip, createdAt, entryHash]
    );
  } catch (err) {
    console.error('activity log त्रुटि:', err.message);
  }
}


// 🔒 audit-लॉग में पूरा मोबाइल नंबर/ईमेल न जाए। लॉग operations टीम व्यापक रूप से
// पढ़ती है, वे अक्सर किसी तीसरी सेवा (SIEM) तक जाते हैं, और लंबे समय तक रखे जाते
// हैं। इस ऐप में नागरिक का मोबाइल नंबर सीधे घरेलू-हिंसा पीड़िता की पहचान है।
// छिपाने के बाद भी वही पहचान हर बार एक जैसी दिखती है, इसलिए किसी एक खाते पर हो
// रही घटनाओं को जोड़कर देखना पहले जितना ही आसान रहता है।
//
// ⚠️ अधिकारी/एडमिन के *नाम* जान-बूझकर नहीं छिपाए जाते — audit का मक़सद ही यह दर्ज
//    करना है कि किस कर्मचारी ने क्या किया (जवाबदेही)। यह सिर्फ़ उन जगहों के लिए है
//    जहाँ पहचान के रूप में नंबर/ईमेल आता है।
function maskIdentity(value) {
  const v = String(value || '');
  if (!v) return 'अज्ञात';
  if (/^\d{10}$/.test(v)) return `${v.slice(0, 2)}XXXXX${v.slice(-3)}`; // 94XXXXX021
  if (v.includes('@')) {
    const [u, d] = v.split('@');
    return `${u.slice(0, 2)}***@${d}`;
  }
  return v.length > 4 ? `${v.slice(0, 2)}***${v.slice(-2)}` : '***';
}

module.exports = { logActivity, maskIdentity, computeEntryHash };
