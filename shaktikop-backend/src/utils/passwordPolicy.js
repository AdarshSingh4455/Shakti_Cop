// ============================================================
// पासवर्ड नीति — एक ही जगह, ताकि हर जगह एक जैसा नियम लगे।
//
// seed.sql के डेमो पासवर्ड सार्वजनिक रूप से ज्ञात हैं। production में
// इनसे न लॉगिन हो सकता है, न इन्हें नया पासवर्ड बनाया जा सकता है।
// development में जाँच ढीली रहती है ताकि टेस्टिंग में रुकावट न आए।
// ============================================================

const { isDemoAccount } = require('./demoAccounts');
const DEMO_PASSWORDS = new Set([
  'Admin@123',
  'Officer@123',
  'Citizen@123',
  'admin',
  'admin123',
  'password',
  'password123',
  '123456',
  '12345678',
]);

// ⚠️ जब तक असली SMS gateway नहीं जुड़ता, टेस्टिंग के लिए डेमो पासवर्ड चालू रखने हों
// तो Railway में ALLOW_INSECURE_DEV_LOGIN=true सेट करें। लॉन्च से पहले हटाना ज़रूरी है।
// 🧹 सफ़ाई: पहले यहाँ insecureAllowed() था, जो ALLOW_INSECURE_DEV_LOGIN=true होने पर
// production को "production नहीं" मान लेता — यानी डेमो पासवर्ड हर खाते पर चलने लगते।
// अब वह flag production में सर्वर ही शुरू नहीं होने देता (देखें server.js), इसलिए यह
// शाखा कभी चलती ही नहीं थी — बस भ्रम पैदा करती। डेमो की असली ज़रूरत अब खाते-तक-सीमित
// DEMO_ACCOUNTS से पूरी होती है (देखें utils/demoAccounts.js)।

// production में सख़्ती लागू — पर ऊपर वाला स्विच चालू हो तो ढील मिल जाती है
const isProd = () => process.env.NODE_ENV === 'production';

// लॉगिन के समय — क्या यह ज्ञात डेमो पासवर्ड है?
// 🆕 identifier भी लेता है: DEMO_ACCOUNTS में सूचीबद्ध खातों पर डेमो-पासवर्ड चलते
// रहते हैं (ताकि ऐप दिखाते समय लॉगिन अटके नहीं), बाक़ी सब पर production में बंद।
// पहले यह ढील ALLOW_INSECURE_DEV_LOGIN से मिलती थी, जो हर खाते पर लागू होती —
// यानी किसी भी असली अधिकारी/नागरिक का खाता 'Admin@123' जैसे पासवर्ड से खुल सकता था।
function isBlockedDemoPassword(password, identifier) {
  if (identifier && isDemoAccount(identifier)) return false;
  return isProd() && DEMO_PASSWORDS.has(String(password));
}

const DEMO_PASSWORD_ERROR = {
  error:
    'सुरक्षा कारणों से डिफ़ॉल्ट/डेमो पासवर्ड से लॉगिन बंद है। कृपया "पासवर्ड भूल गए?" से नया पासवर्ड बनाएं, या एडमिन से संपर्क करें।',
};

// नया पासवर्ड सेट करते समय — मान्य है या नहीं?
// लौटाता है: null (सब ठीक) या त्रुटि-संदेश
// 🔒 सुरक्षा सुधार: पहले सिर्फ़ न्यूनतम 6 अक्षर थे, कोई अधिकतम सीमा नहीं थी।
// अब न्यूनतम 8 (ब्रूट-फ़ोर्स के लिए ज़्यादा मुश्किल) और अधिकतम 16 (bcrypt की 72-byte
// सीमा से भी दूर, और बहुत लंबा पासवर्ड टाइप करने में गलती/असुविधा से भी बचाव)।
function validateNewPassword(password) {
  const p = String(password || '');
  if (p.length < 8) return 'पासवर्ड कम से कम 8 अक्षर का होना चाहिए।';
  if (p.length > 16) return 'पासवर्ड अधिकतम 16 अक्षर का हो सकता है।';
  if (isProd() && DEMO_PASSWORDS.has(p)) {
    return 'यह पासवर्ड बहुत आम/असुरक्षित है। कृपया कोई दूसरा मज़बूत पासवर्ड चुनें।';
  }

  // 🔒 सुरक्षा सुधार: पहले सिर्फ़ ऊपर वाली 9 पासवर्ड की सूची से मिलान होता था, और कोई
  // जटिलता (complexity) की शर्त बिल्कुल नहीं थी। नतीजा: "11111111", "aaaaaaaa",
  // "qwertyui", "abcdefgh" जैसे पासवर्ड मान्य थे — जिन्हें मिनटों में तोड़ा जा सकता है।
  // सिर्फ़ एक सूची से काम नहीं चल सकता, क्योंकि ऐसे कमज़ोर पासवर्ड अनगिनत हैं। ये खाते
  // (अधिकारी/एडमिन) घरेलू-हिंसा पीड़िताओं का डेटा सुरक्षित रखते हैं, इसलिए न्यूनतम
  // जटिलता ज़रूरी है।
  //
  // ⚖️ शर्तें जान-बूझकर हल्की रखी हैं (4 में से सिर्फ़ 2 श्रेणियां) — बहुत सख़्त नियम
  // उल्टा असर करते हैं: लोग पासवर्ड कागज़ पर लिख लेते हैं या हर जगह वही दोहराते हैं।
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length;
  if (classes < 2) {
    return 'पासवर्ड में कम से कम दो तरह के अक्षर हों (जैसे अक्षर + अंक)।';
  }
  // सभी अक्षर एक जैसे (aaaaaaaa, 11111111)
  if (/^(.)\1+$/.test(p)) {
    return 'पासवर्ड में सभी अक्षर एक जैसे नहीं हो सकते।';
  }
  // सीधा क्रम (abcdefgh, 12345678) — आगे या पीछे, दोनों तरफ़
  const lower = p.toLowerCase();
  const seq = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const rev = seq.split('').reverse().join('');
  if (seq.includes(lower) || rev.includes(lower)) {
    return 'पासवर्ड सीधे क्रम में (जैसे abcdefgh या 12345678) नहीं हो सकता।';
  }
  return null;
}

module.exports = { isBlockedDemoPassword, DEMO_PASSWORD_ERROR, validateNewPassword, DEMO_PASSWORDS };
