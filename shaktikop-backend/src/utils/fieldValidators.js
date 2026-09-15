// ============================================================
// आम फ़ील्ड validation — नाम, मोबाइल, ईमेल — एक ही जगह से पूरे बैकएंड में।
//
// जो भी controller किसी व्यक्ति का नाम/मोबाइल/ईमेल लेता है, उसे यहीं से
// जाँच करानी चाहिए, ताकि नियम हर जगह एक जैसा रहे (जैसे नाम में अंक न हों,
// मोबाइल ठीक 10 अंकों का हो)।
// ============================================================

// नाम में सिर्फ़ अक्षर (हिंदी/अंग्रेज़ी), स्पेस, डॉट, अपोस्ट्रॉफ़ी और हाइफ़न — कोई अंक नहीं
const NAME_RE = /^[A-Za-z\u0900-\u097F][A-Za-z\u0900-\u097F.'\- ]{1,79}$/;
const MOBILE_RE = /^[6-9]\d{9}$/; // भारतीय मोबाइल — ठीक 10 अंक, 6-9 से शुरू
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(name) {
  const v = (name || '').trim();
  if (!v) return 'नाम आवश्यक है';
  // 🆕 रक्षा की एक और परत — बहुत लंबा इनपुट (जैसे कई हज़ार/लाख अक्षर) regex तक
  // पहुंचने से पहले ही रोक देते हैं, बजाय हर caller पर भरोसा करने के कि वे पहले
  // लंबाई जांच लेंगे
  if (v.length > 200) return 'नाम बहुत लंबा है';
  if (/\d/.test(v)) return 'नाम में अंक (नंबर) नहीं हो सकते';
  if (!NAME_RE.test(v)) return 'कृपया एक मान्य नाम दर्ज करें';
  return null;
}

function validateMobile(mobile) {
  const v = (mobile || '').trim();
  if (!v) return 'मोबाइल नंबर आवश्यक है';
  if (!/^\d+$/.test(v)) return 'मोबाइल नंबर में सिर्फ़ अंक होने चाहिए';
  if (v.length !== 10) return 'मोबाइल नंबर ठीक 10 अंकों का होना चाहिए';
  if (!MOBILE_RE.test(v)) return 'कृपया एक मान्य भारतीय मोबाइल नंबर दर्ज करें (6-9 से शुरू)';
  return null;
}

function validateEmail(email) {
  const v = (email || '').trim();
  if (!v) return 'ईमेल आईडी आवश्यक है';
  // 🆕 पहले regex-जांच लंबाई-जांच से पहले चलती थी — यानी कोई बहुत लंबा (जैसे कई
  // MB का) इनपुट भी पहले पूरी तरह regex से गुज़रता। अब लंबाई पहले जांचते हैं ताकि
  // स्पष्ट रूप से अमान्य/बहुत बड़ा इनपुट regex चलाए बिना ही जल्दी अस्वीकार हो जाए।
  if (v.length > 254) return 'ईमेल आईडी बहुत लंबी है (अधिकतम 254 अक्षर)'; // RFC 5321 की व्यावहारिक सीमा
  if (!EMAIL_RE.test(v)) return 'कृपया एक मान्य ईमेल आईडी दर्ज करें';
  return null;
}

// 🆕 सामान्य टेक्स्ट फ़ील्ड्स (विवरण/पता/नोट्स आदि) के लिए साझा लंबाई-सीमा जांच —
// पहले ये फ़ील्ड्स database में TEXT (असीमित) थीं, कोई सीमा ही नहीं थी। बहुत बड़ा
// इनपुट (जैसे लाखों अक्षर) DB स्टोरेज और response-size दोनों पर बोझ डाल सकता था।
// required=false हो तो खाली मान्य है (सिर्फ़ ऊपरी सीमा जांची जाती है)।
function validateTextLength(value, { min = 0, max, label, required = false } = {}) {
  const v = (value || '').trim();
  if (!v) {
    if (required) return `${label} आवश्यक है`;
    return null;
  }
  if (v.length < min) return `${label} कम से कम ${min} अक्षर का होना चाहिए`;
  if (max && v.length > max) return `${label} अधिकतम ${max} अक्षर का हो सकता है`;
  return null;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// रंग-कोड — सिर्फ़ #RRGGBB फ़ॉर्मेट (बैनर/श्रेणी/हेल्पलाइन रंग) — ग़लत फ़ॉर्मेट पहले
// चुपचाप DB में सेव हो जाता था, और मोबाइल ऐप में वह रंग टूटा हुआ (काला/डिफ़ॉल्ट) दिखता
function validateHexColor(color, { required = false, label = 'रंग' } = {}) {
  const v = (color || '').trim();
  if (!v) return required ? `${label} आवश्यक है` : null;
  if (!HEX_COLOR_RE.test(v)) return `${label} #RRGGBB फ़ॉर्मेट में होना चाहिए (जैसे #8E2A46)`;
  return null;
}

// URL — सिर्फ़ http(s):// या data: (base64 image) — कभी javascript: जैसा scheme नहीं,
// जो मोबाइल/वेब पर link खोलते समय एक जोखिम बन सकता था
// allowDataUri: false | true (सिर्फ़ सुरक्षित raster image प्रकार) | ['image/', 'audio/'] (कई प्रकार)
//
// 🔒 सुरक्षा सुधार: पहले सिर्फ़ "data:image/" prefix जांचा जाता था — यानी
// "data:image/svg+xml;base64,..." भी "मान्य फ़ोटो" मान लिया जाता। SVG फ़ाइलों में
// <script> या onload= जैसे event-handler embed हो सकते हैं (XSS का रास्ता, अगर
// कहीं भी <img> के अलावा — जैसे <object>/<iframe> — रेंडर हो)। "फ़ोटो सबूत" वाली
// सुविधा में SVG (vector graphic) की कभी वास्तविक ज़रूरत भी नहीं होती — कैमरा/गैलरी
// से हमेशा raster (jpeg/png/webp/heic) ही आता है। अब सिर्फ़ इन्हीं की अनुमति है।
const SAFE_IMAGE_SUBTYPES = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'heic', 'heif'];

// 🔒 सुरक्षा फ़िक्स: पहले सिर्फ़ data-URI में *लिखा हुआ* प्रकार जांचा जाता था — असली
// bytes कभी नहीं देखे जाते। यानी "data:image/jpeg;base64,<कुछ भी>" भेजकर कोई भी
// सामग्री छवि के नाम पर सेव कराई जा सकती थी। अब फ़ाइल की शुरुआती bytes (magic bytes)
// से मिलान होता है, इसलिए लिखा हुआ प्रकार असलियत से मेल खाना ज़रूरी है।
//
// इसका एक और फ़ायदा: अधूरी/ख़राब अपलोड यहीं पकड़ी जाती है, न कि बाद में जब कोई उसे
// दिखाने या PDF में लगाने की कोशिश करे।
const IMAGE_MAGIC = {
  jpeg: [[0xff, 0xd8, 0xff]],
  jpg: [[0xff, 0xd8, 0xff]],
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  gif: [[0x47, 0x49, 0x46, 0x38]], // GIF8
  // WEBP व HEIC/HEIF में पहचान 5वें byte से शुरू होती है, इसलिए इन्हें अलग जांचा जाता है
};

function imageBytesMatchType(base64Data, subtype) {
  try {
    // शुरुआती कुछ bytes ही काफ़ी हैं — पूरी फ़ाइल decode करने की ज़रूरत नहीं
    const head = Buffer.from(base64Data.slice(0, 64), 'base64');
    if (head.length < 12) return false;

    if (subtype === 'webp') {
      return head.slice(0, 4).toString('latin1') === 'RIFF' && head.slice(8, 12).toString('latin1') === 'WEBP';
    }
    if (subtype === 'heic' || subtype === 'heif') {
      return head.slice(4, 8).toString('latin1') === 'ftyp';
    }
    const signatures = IMAGE_MAGIC[subtype];
    if (!signatures) return false;
    return signatures.some((sig) => sig.every((b, i) => head[i] === b));
  } catch (e) {
    return false; // decode ही न हो सके तो मान्य नहीं
  }
}

// 🆕 ऑडियो के लिए भी वैसी ही श्वेत-सूची जैसी छवियों के लिए है (नीचे बग-फ़िक्स नोट देखें)।
// ये वही प्रारूप हैं जो expo-av रिकॉर्डिंग/प्लेबैक में इस्तेमाल होते हैं।
const SAFE_AUDIO_SUBTYPES = ['mpeg', 'mp3', 'mp4', 'm4a', 'aac', 'wav', 'x-wav', 'webm', 'ogg', '3gpp', 'x-m4a'];

function validateUrl(url, { required = false, label = 'लिंक', allowDataUri = false } = {}) {
  const v = (url || '').trim();
  if (!v) return required ? `${label} आवश्यक है` : null;
  if (allowDataUri) {
    const kinds = allowDataUri === true ? ['image'] : allowDataUri.map((p) => p.replace('/', ''));
    for (const kind of kinds) {
      if (kind === 'image') {
        const match = v.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
        if (match && SAFE_IMAGE_SUBTYPES.includes(match[1].toLowerCase())) {
          if (v.length > 8_000_000) return `${label} बहुत बड़ी है`; // ~6MB असली फ़ाइल तक (base64 ओवरहेड सहित)
          // 🔒 लिखा हुआ प्रकार असली bytes से मेल खाता है या नहीं — देखें ऊपर imageBytesMatchType
          const base64Data = v.slice(match[0].length);
          if (!imageBytesMatchType(base64Data, match[1].toLowerCase())) {
            return `${label} एक वैध छवि नहीं लगती — कृपया दोबारा चुनें`;
          }
          return null;
        }
      } else if (kind === 'audio') {
        // 🐛 बग फ़िक्स (सुरक्षा — असंगति): पहले यहाँ सिर्फ़ v.startsWith('data:audio/')
        // जांचा जाता था — यानी छवियों के उलट, न कोई subtype-श्वेतसूची थी और न ही
        // ";base64," ज़रूरी था। इससे "data:audio/x-anything,<कुछ भी>" जैसा कोई भी मान
        // पास होकर डेटाबेस में सेव हो जाता, जबकि ठीक बगल वाली छवि-शाखा दोनों जांचें
        // सख़्ती से करती थी। अब दोनों एक जैसे सख़्त हैं।
        const match = v.match(/^data:audio\/([a-zA-Z0-9.+-]+);base64,/);
        if (match && SAFE_AUDIO_SUBTYPES.includes(match[1].toLowerCase())) {
          if (v.length > 8_000_000) return `${label} बहुत बड़ी है`;
          return null;
        }
      } else if (v.startsWith(`data:${kind}/`)) {
        if (v.length > 8_000_000) return `${label} बहुत बड़ी है`;
        return null;
      }
    }
  }
  if (!/^https?:\/\//i.test(v)) return `${label} http:// या https:// से शुरू होना चाहिए`;
  if (v.length > 2048) return `${label} बहुत लंबी है`;
  return null;
}

// धनात्मक पूर्णांक (जैसे display_order, SLA घंटे) — खाली/undefined मान्य है (डिफ़ॉल्ट
// इस्तेमाल होगा), पर अगर दिया गया हो तो ऋणात्मक/दशमलव/असंख्या नहीं होना चाहिए
function validatePositiveInt(value, { required = false, label, max } = {}) {
  if (value === undefined || value === null || value === '') return required ? `${label} आवश्यक है` : null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return `${label} एक धनात्मक पूर्णांक होना चाहिए`;
  if (max && n > max) return `${label} अधिकतम ${max} हो सकता है`;
  return null;
}

// 🆕 JSON गहराई-सीमा — बग फ़िक्स (गंभीर, टेस्ट से पुष्टि हुई): कोई भी client-आधारित
// nested object (जैसे complaint का extraDetails) बिना जांचे सीधे JSON.stringify()
// किया जाता था। सिर्फ़ ~300KB का बहुत गहरा nested JSON (जैसे {"a":{"a":{"a":...}}}
// 50,000 परतें गहरा) भेजकर JSON.stringify() को "Maximum call stack size exceeded"
// के साथ क्रैश कराया जा सकता था — 5MB की सामान्य आकार-सीमा के अंदर रहते हुए भी।
// यह एक व्यावहारिक Denial-of-Service था (हर दुर्भावनापूर्ण अनुरोध विफल होता, और
// बार-बार भेजे जाने पर सर्वर पर CPU-बोझ बढ़ता)। अब कोई भी nested value स्टोर करने
// से पहले उसकी गहराई जांचते हैं।
function checkJsonDepth(value, maxDepth = 10, currentDepth = 0) {
  if (currentDepth > maxDepth) return false;
  if (value === null || typeof value !== 'object') return true;
  for (const key in value) {
    if (!checkJsonDepth(value[key], maxDepth, currentDepth + 1)) return false;
  }
  return true;
}
function validateJsonDepth(value, { label = 'डेटा', maxDepth = 10 } = {}) {
  if (value === undefined || value === null) return null;
  if (!checkJsonDepth(value, maxDepth)) return `${label} बहुत ज़्यादा nested (गहराई से जुड़ा हुआ) है`;
  return null;
}

// किसी तय सूची में से एक होना चाहिए (जैसे duty-shift, status) — इसके बिना कोई भी
// मनमाना टेक्स्ट DB में जा सकता था, जो मोबाइल/वेब की dropdown/badge logic से मेल न खाता
function validateEnum(value, allowed, { required = false, label } = {}) {
  if (value === undefined || value === null || value === '') return required ? `${label} आवश्यक है` : null;
  if (!allowed.includes(value)) return `${label} इनमें से एक होना चाहिए: ${allowed.join(', ')}`;
  return null;
}

// तारीख़ — YYYY-MM-DD फ़ॉर्मेट और वैध कैलेंडर तारीख़ दोनों जांचता है (जैसे "2026-02-30"
// फ़ॉर्मेट में सही दिखती है पर असल में कोई ऐसी तारीख़ है ही नहीं)
function validateDateString(value, { required = false, label = 'तारीख़' } = {}) {
  const v = (value || '').trim();
  if (!v) return required ? `${label} आवश्यक है` : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} YYYY-MM-DD फ़ॉर्मेट में होनी चाहिए`;
  const d = new Date(v + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return `${label} एक वैध तारीख़ नहीं है`;
  return null;
}


// 🆕 भौगोलिक निर्देशांक (coordinates) — पहले लाइव-लोकेशन endpoint सिर्फ़ इतना जांचता
// था कि latitude/longitude "null नहीं हैं"। इससे "abc" जैसी कोई भी स्ट्रिंग, या
// 999999 जैसा असंभव मान भी पास हो जाता — वह encrypt होकर सेव हो जाता, और बाद में
// अधिकारी के नक़्शे पर NaN/बेतुकी जगह के रूप में उभरता (या Leaflet में गड़बड़ी करता)।
function validateCoordinate(value, { label = 'निर्देशांक', max = 90 } = {}) {
  if (value === undefined || value === null || value === '') return `${label} आवश्यक है`;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} एक वैध संख्या होनी चाहिए`;
  if (n < -max || n > max) return `${label} ${-max} से ${max} के बीच होना चाहिए`;
  return null;
}

// 🔒 push token की जाँच — पहले यहाँ कुछ भी सेव हो सकता था (किसी भी लंबाई की कोई भी
// string), और वही आगे Expo की API को भेज दी जाती।
//
// इससे भी अहम: ऊपर (updatePushToken) साझा-डिवाइस वाला तर्क किसी token को *बाक़ी सभी
// खातों से हटाकर* अपने नाम कर लेता है। यह ज़रूरी है (थानों में फ़ोन साझा होते हैं), पर
// इसका मतलब यह भी है कि किसी और का वैध token भेजकर उस व्यक्ति की सारी सूचनाएं — SOS
// समेत — चुपचाप बंद की जा सकती हैं। सही format माँगना इसे असंभव तो नहीं बनाता (असली
// token जानना अब भी ज़रूरी है), पर आसान/अंधाधुंध कोशिशें रुक जाती हैं, और कचरा न
// database में जाता है, न Expo की API तक।
//
// Expo के token हमेशा इसी रूप में होते हैं: ExponentPushToken[…] या ExpoPushToken[…]
function validatePushToken(token) {
  if (token === null || token === undefined || token === '') return null; // हटाना मान्य है
  const v = String(token).trim();
  if (v.length > 200) return 'push token बहुत लंबा है';
  if (!/^Expo(nent)?PushToken\[[A-Za-z0-9._-]+\]$/.test(v)) {
    return 'push token का प्रारूप मान्य नहीं है';
  }
  return null;
}

module.exports = {
  validatePushToken,
  validateName,
  validateMobile,
  validateEmail,
  validateTextLength,
  validateHexColor,
  validateUrl,
  validatePositiveInt,
  validateEnum,
  validateDateString,
  validateJsonDepth,
  validateCoordinate,
  NAME_RE,
  MOBILE_RE,
  EMAIL_RE,
};
