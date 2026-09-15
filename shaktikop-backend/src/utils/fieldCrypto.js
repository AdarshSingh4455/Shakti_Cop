const crypto = require('crypto');

// ============================================================
// Field-Level Encryption — संवेदनशील कॉलम (जैसे पीड़ित का पता, पिता का नाम)
// डेटाबेस में plain text की जगह encrypted रूप में सेव होते हैं। अगर कभी पूरा
// डेटाबेस लीक हो जाए (backup चोरी, misconfigured access, आदि), तब भी इन
// कॉलम्स का असली मान बिना key के नहीं पढ़ा जा सकता।
//
// एल्गोरिद्म: AES-256-GCM (authenticated encryption — छेड़छाड़ पकड़ में आ जाती है,
// सिर्फ़ confidentiality नहीं, integrity भी)।
//
// FIELD_ENCRYPTION_KEY .env में 32-byte key का hex-encoded रूप होना चाहिए
// (64 hex characters)। बनाने के लिए:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// ⚠️ यह key कभी भी कोड/git में हार्डकोड न करें, और खोने पर पहले से encrypted
// डेटा हमेशा के लिए अपठनीय (unreadable) हो जाता है — इसे सुरक्षित तरीक़े से
// बैकअप रखें (जैसे किसी secrets manager में)।
//
// 🆕 Key Rotation — पहले सिर्फ़ एक ही key थी; उसे बदलते ही पहले से encrypted सारा
// डेटा हमेशा के लिए अपठनीय हो जाता (नई key से पुराना ciphertext कभी decrypt नहीं
// होता)। अब एक वैकल्पिक FIELD_ENCRYPTION_KEY_PREVIOUS भी सपोर्ट है — rotation इस
// तरह करें:
//   1. मौजूदा FIELD_ENCRYPTION_KEY की वैल्यू FIELD_ENCRYPTION_KEY_PREVIOUS में डालें
//   2. FIELD_ENCRYPTION_KEY में नई (ताज़ा generate की) key डालें
//   3. Deploy करें — नया लिखा जाने वाला डेटा नई key से encrypt होगा, पुराना डेटा
//      पढ़ते समय पहले नई key आज़माई जाती है, न मिले तो पुरानी key से (transparent)
//   4. ⛔ तुरंत (उसी deploy में) src/scripts/encryptExistingFields.js चलाएं — यह
//      सारा डेटा नई key से फिर-encrypt करता है और blind-index hash दोबारा बनाता है।
//      यह "फ़ुर्सत में करने वाला" काम नहीं है, बल्कि rotation का ज़रूरी हिस्सा है:
//      ऊपर वाला previous-key fallback सिर्फ़ decrypt पर लागू होता है, blindIndex पर
//      नहीं (वह हमेशा मौजूदा key से बनता है)। इसलिए rotation के बाद, जब तक यह script
//      नहीं चलती, पुराने hash पुरानी key के और नए hash नई key के होते हैं — यानी एक ही
//      मोबाइल नंबर के दो अलग hash। नतीजा: डुप्लीकेट-शिकायत पहचान और दोहराए-आरोपी
//      (repeat offender) मिलान चुपचाप काम करना बंद कर देते हैं — कोई त्रुटि नहीं आती,
//      बस मिलान मिलना बंद हो जाता है, जो पकड़ में आना बेहद मुश्किल है।
//   5. script चलने के बाद FIELD_ENCRYPTION_KEY_PREVIOUS हटा दें।
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const VERSION_PREFIX = 'enc:v1:'; // भविष्य में key/algorithm rotate करना हो तो version बढ़ाया जा सकता है
const IV_LENGTH = 12; // GCM के लिए मानक 96-bit IV

function parseKey(hex, label) {
  if (!hex) return null;
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    console.error(`⚠️ ${label} अमान्य है — यह 32-byte (64 hex characters) होनी चाहिए।`);
    return null;
  }
  return key;
}

function getKey() {
  return parseKey(process.env.FIELD_ENCRYPTION_KEY, 'FIELD_ENCRYPTION_KEY');
}
function getPreviousKey() {
  return parseKey(process.env.FIELD_ENCRYPTION_KEY_PREVIOUS, 'FIELD_ENCRYPTION_KEY_PREVIOUS');
}

// डेवलपमेंट में key सेट न हो तो ऐप crash नहीं होता (जैसे इस प्रोजेक्ट के बाकी
// optional integrations — SMS/Email gateway) — बस चेतावनी के साथ बिना-encryption
// चलता है, ताकि लोकल टेस्टिंग में रुकावट न आए। production में key ज़रूरी है।
//
// 🐛 बग फ़िक्स: पहले एक ही साझा (shared) 'warned' flag था — जो भी चेतावनी
// (encrypt की या decrypt की) पहले चली, बस वही कभी दिखती; दूसरी अलग स्थिति की
// चेतावनी हमेशा के लिए दब जाती। अब हर अलग संदेश के लिए अलग-अलग एक बार दिखती है।
const warnedMessages = new Set();
function warnOnce(msg) {
  if (!warnedMessages.has(msg)) {
    console.warn(msg);
    warnedMessages.add(msg);
  }
}

// plaintext (string | null | undefined) → encrypted string (या key न हो तो वही plaintext वापस)
function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  const key = getKey();
  if (!key) {
    warnOnce('⚠️ FIELD_ENCRYPTION_KEY सेट नहीं है — संवेदनशील फ़ील्ड्स बिना encryption के सेव हो रही हैं (सिर्फ़ dev/test के लिए ठीक है)।');
    return String(plaintext);
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return VERSION_PREFIX + [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

// encrypted string → plaintext (पुराने/unencrypted डेटा को भी सुरक्षित रूप से पढ़ लेता है —
// अगर मान VERSION_PREFIX से शुरू नहीं होता, तो उसे already-plaintext मानकर वैसे ही लौटाता है।
// यह पुराने (migration से पहले के) rows के साथ backward-compatible बनाता है।)
function decryptField(value) {
  if (value === null || value === undefined || value === '') return value;
  if (!String(value).startsWith(VERSION_PREFIX)) return value; // पुराना plaintext डेटा
  const key = getKey();
  if (!key) {
    warnOnce('⚠️ FIELD_ENCRYPTION_KEY सेट नहीं है — encrypted फ़ील्ड्स डिक्रिप्ट नहीं हो पा रहीं।');
    return '••••••'; // असली डेटा दिखाने के बजाय साफ़ संकेत कि key गायब है
  }
  const [ivB64, tagB64, dataB64] = String(value).slice(VERSION_PREFIX.length).split(':');
  const tryDecrypt = (k) => {
    const decipher = crypto.createDecipheriv(ALGORITHM, k, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  };
  try {
    return tryDecrypt(key);
  } catch (err) {
    // 🆕 मौजूदा key से न खुले तो पुरानी (rotation से पहले वाली) key आज़माते हैं —
    // इसके बिना key rotate करते ही उससे पहले का सारा encrypted डेटा हमेशा के लिए
    // अपठनीय हो जाता
    const prevKey = getPreviousKey();
    if (prevKey) {
      try {
        return tryDecrypt(prevKey);
      } catch (err2) {
        // दोनों key से विफल — नीचे असली त्रुटि दिखाएं
      }
    }
    console.error('फ़ील्ड डिक्रिप्ट करने में त्रुटि (ग़लत key या छेड़छाड़ हुआ डेटा):', err.message);
    return '••••••';
  }
}

module.exports = { encryptField, decryptField, blindIndex };

// ============================================================
// Blind Index — AES-GCM हर बार अलग IV इस्तेमाल करता है, इसलिए एक ही मोबाइल नंबर
// भी हर बार अलग ciphertext देता है (यह जान-बूझकर है — semantic security)। पर इससे
// SQL में बराबरी (equality) से मिलान नहीं हो पाता — जैसे "डुप्लीकेट शिकायत ढूंढना"
// (दो शिकायतों का victim_mobile बराबर है या नहीं)।
//
// इसका हल: value का एक अलग, deterministic (हर बार एक जैसा) HMAC-SHA256 hash भी
// साथ में एक अलग कॉलम (victim_mobile_hash) में रखते हैं। यह hash से असली मोबाइल
// नंबर वापस नहीं निकाला जा सकता (one-way), पर दो बराबर मोबाइल नंबरों का hash हमेशा
// बराबर रहेगा — इसलिए बराबरी-मिलान (JOIN/WHERE =) के लिए इस्तेमाल कर सकते हैं।
// आंशिक/भाग खोज (partial substring search, जैसे ILIKE) अब भी संभव नहीं है — उसके
// लिए listComplaints में डिक्रिप्ट करके, application स्तर पर फ़िल्टर किया जाता है।
function blindIndex(value) {
  if (value === null || value === undefined || value === '') return null;
  const key = getKey();
  if (!key) return null; // key न हो तो हैश नहीं बनेगा — डुप्लीकेट-मिलान बस काम नहीं करेगा, ऐप नहीं टूटेगा
  // मुख्य encryption key से अलग एक sub-key निकालते हैं (domain separation) — ताकि
  // यह hash कभी असली encryption key बताने में मदद न कर सके
  const indexKey = crypto.createHash('sha256').update(key).update('blind-index-v1').digest();
  return crypto.createHmac('sha256', indexKey).update(String(value).trim()).digest('hex');
}
