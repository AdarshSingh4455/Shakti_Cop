const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
// 🐛 IPv6-सुरक्षित key — library के संस्करण पर निर्भर नहीं (देखें utils/ipKey.js)
const { normalizeIpForRateLimit } = require('./utils/ipKey');
// ⚖️ load balancer के पीछे साझा गिनती (वैकल्पिक — REDIS_URL सेट हो तभी)
const { getRateLimitStore } = require('./utils/rateLimitStore');

const authRoutes = require('./routes/authRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const officerRoutes = require('./routes/officerRoutes');
const citizenRoutes = require('./routes/citizenRoutes');
const adminRoutes = require('./routes/adminRoutes');
const messagesRoutes = require('./routes/messagesRoutes');
const nearbyRoutes = require('./routes/nearbyRoutes');
const policeServicesRoutes = require('./routes/policeServicesRoutes');
const trackRoutes = require('./routes/trackRoutes');
const bannersRoutes = require('./routes/bannersRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');
const contentPublicRoutes = require('./routes/contentPublicRoutes');
const counsellingRoutes = require('./routes/counsellingRoutes');
const atrRoutes = require('./routes/atrRoutes');
const backupRoutes = require('./routes/backupRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Railway/Render/किसी भी reverse-proxy के पीछे चलाने के लिए ज़रूरी —
// इसके बिना express-rate-limit "X-Forwarded-For" header को सही से समझ नहीं पाता,
// और गलती से सभी users को एक ही IP मानकर rate-limit लगा सकता है।
app.set('trust proxy', 1);

// 🔒 TLS सुरक्षा
// -----------------------------------------------------------------
// 1) HSTS (HTTP Strict Transport Security) — ब्राउज़र को बताता है कि इस डोमेन
//    से भविष्य में हमेशा सिर्फ़ HTTPS से ही बात करे, कभी भी plain HTTP से नहीं —
//    भले ही उपयोगकर्ता गलती से "http://" टाइप करे या किसी पुराने लिंक पर क्लिक
//    करे। इसके बिना पहला request (जब तक redirect न हो) असुरक्षित नेटवर्क पर जा
//    सकता है, और एक बुरे actor द्वारा उसे HTTP पर बनाए रखा जा सकता है
//    ("SSL-stripping" हमला)। helmet() अपने-आप एक डिफ़ॉल्ट HSTS लगाता है, पर यहाँ
//    इसे स्पष्ट रूप से लंबी अवधि (1 साल) व includeSubDomains के साथ सेट किया है।
app.use(
  helmet({
    hsts: {
      maxAge: 31536000, // 1 साल — जितना लंबा उतना मज़बूत सुरक्षा (browser पहले से याद रखता है)
      includeSubDomains: true,
      preload: true,
    },
  })
);

// 2) असली HTTPS-प्रवर्तन (enforcement) — Railway/Render जैसी सेवाएं TLS को अपने
//    edge/proxy पर terminate करती हैं और ऐप तक plain HTTP से पहुंचाती हैं, इसलिए
//    असली protocol जानने के लिए X-Forwarded-Proto header पढ़ना ज़रूरी है (ऊपर
//    'trust proxy' सेट होने से req.secure यह सही पहचानता है)। अगर कोई क्लाइंट
//    सीधे plain-HTTP से आया हो (जैसे पुराना लिंक, misconfigured client), तो
//    उसे 301 redirect करके HTTPS पर भेजा जाता है, बजाय असुरक्षित रूप से जवाब
//    देने के। /health को छोड़ा गया है ताकि होस्टिंग प्लेटफ़ॉर्म के internal
//    health-check (जो अक्सर plain HTTP से होते हैं) fail न हों।
if (process.env.NODE_ENV === 'production') {
  // 🐛 सुरक्षा बग फ़िक्स (गंभीर): पहले req.headers.host को बिना किसी जांच के सीधे
  // redirect के Location में डाल दिया जाता था। कोई भी अनुरोध भेजते समय मनमाना Host
  // header भेज सकता है (browser इसे रोकता नहीं, यह क्लाइंट के नियंत्रण में है) —
  // नतीजा: "https://asli-app-ka-IP-ya-domain/..." पर भेजा गया अनुरोध किसी नकली/फ़िशिंग
  // साइट पर redirect हो सकता था। अब Host सिर्फ़ तभी भरोसा किया जाता है जब वह
  // ALLOWED_ORIGINS में मौजूद किसी भरोसेमंद डोमेन से मेल खाए — वरना कोई redirect
  // नहीं, सीधे generic जवाब।
  const trustedHosts = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => {
      try {
        return new URL(o.trim()).host;
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);

  app.use((req, res, next) => {
    if (req.path === '/health' || req.secure) return next();
    const host = req.headers.host;
    if (!host || !trustedHosts.includes(host)) {
      return res.status(400).json({ error: 'अमान्य अनुरोध' });
    }
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  });
}

// 🔒 CORS — पहले हर website को API कॉल करने की छूट थी।
// मोबाइल ऐप कोई Origin header नहीं भेजता, इसलिए वह हमेशा चलेगा।
// ब्राउज़र से सिर्फ़ ALLOWED_ORIGINS में लिखे domains ही कॉल कर पाएंगे
// (Railway में ALLOWED_ORIGINS=https://a.com,https://b.com की तरह सेट करें)।
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // मोबाइल ऐप / curl / server-to-server
      // 🐛 बग फ़िक्स (fail-open): पहले ALLOWED_ORIGINS न होने पर हर website को अनुमति
      // मिल जाती थी — यानी सेट करना भूल जाना ही सबसे ढीली सेटिंग बन जाता। सुरक्षा-जाँच
      // अब production में इसके बिना सर्वर शुरू ही नहीं होने देती, पर यह दूसरी परत है:
      // अगर वह जाँच किसी वजह से लांघ दी जाए, तब भी production में ब्राउज़र-origin
      // डिफ़ॉल्ट रूप से मना होगा, अनुमति नहीं। (development में पहले जैसा — काम न रुके।)
      if (allowedOrigins.length === 0) {
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        const err = new Error('इस origin से अनुमति नहीं है — ALLOWED_ORIGINS सेट नहीं है');
        err.status = 403;
        return callback(err);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // 🐛 बग फ़िक्स: पहले यह सादी Error थी, जो errorHandler में 500 बन जाती। अब जब
      // 500-स्तर की त्रुटियां Sentry को भेजी जाती हैं, तो हर ब्लॉक हुई cross-origin
      // कॉल एक Sentry error-event बना देती — और सार्वजनिक API पर bots/scanners लगातार
      // ऐसी कॉल करते रहते हैं, जिससे Sentry में इतना शोर भर जाता कि असली त्रुटियां
      // दब जातीं। रोका गया origin एक अपेक्षित नीति-निर्णय है, सर्वर की ख़राबी नहीं —
      // इसलिए अब यह साफ़ 403 है।
      const err = new Error('इस origin से अनुमति नहीं है');
      err.status = 403;
      return callback(err);
    },
    credentials: true,
  })
);
// 🐛 बग फ़िक्स: असली बैकअप फ़ाइल में हर शिकायत — फ़ोटो व आवाज़ सहित (base64) — होती
// है, जो नीचे वाली 5MB सीमा से आसानी से बड़ी हो जाती है। नतीजा: कोई भी असली बैकअप
// restore करने पर "413 Payload Too Large" मिलता, यानी यह सुविधा ठीक उसी वक़्त बेकार
// साबित होती जब सबसे ज़्यादा ज़रूरत होती है (डेटा खोने के बाद रिकवरी)।
// ⚠️ यह नीचे वाले सामान्य parser से *पहले* होना ज़रूरी है — वरना वही पहले चलकर
// अनुरोध ठुकरा देता है और यहाँ तक बात पहुँचती ही नहीं (यह जाँच असल में चलाकर पकड़ी गई)।
// बड़ी सीमा सिर्फ़ इसी एक route पर है, जो पहले से Super Admin तक सीमित है और पासवर्ड
// की दोबारा पुष्टि मांगता है — बाक़ी हर endpoint पर सख़्त 5MB सीमा जस की तस रहती है।
app.use('/admin/backup/restore', express.json({ limit: '100mb' }));

app.use(express.json({ limit: '5mb' }));

const { getCachedSetting } = require('./controllers/appSettingsController');

// पूरे API पर सामान्य दर-सीमा (bulk abuse/bot traffic से बचाव)
// ⚠️ 'max' अब Admin की "ऐप सेटिंग्स" से dynamically आता है — बिना redeploy किए बदला जा सकता है
const globalLimiter = rateLimit({
  store: getRateLimitStore(),
  windowMs: 15 * 60 * 1000,
  max: (req, res) => getCachedSetting('rate_limit').maxRequests || 300,
  // 🐛 बग फ़िक्स (सुरक्षा-गंभीर): यह सीमा सिर्फ़ IP पर लगती है। भारत में मोबाइल
  // नेटवर्क (CGNAT) के कारण हज़ारों उपयोगकर्ता एक ही सार्वजनिक IP साझा करते हैं —
  // और यह ऐप ख़ुद हर 10-15 सेकंड में poll करता है। यानी एक ही carrier-IP का साझा
  // बजट किसी और के इस्तेमाल से ख़त्म हो सकता है, और उसके बाद अगला 429 ठीक उस महिला
  // पर गिर सकता है जो उसी वक़्त SOS दबा रही हो। (ध्यान दें: OTP-सीमा में लेखक ने यही
  // साझा-IP समस्या पहले ही IP+पहचानकर्ता वाली key से हल की है — पर यहां नहीं।)
  //
  // इसलिए सिर्फ़ SOS-ट्रिगर को इस सामान्य सीमा से बाहर रखा गया है। यह दुरुपयोग का
  // रास्ता नहीं बनता क्योंकि: (1) इसके लिए citizen-लॉगिन ज़रूरी है, (2) शिकायत का
  // मालिक होना जांचा जाता है, और (3) एक ही SOS दोबारा दबाने पर पूरा अलर्ट-कैस्केड
  // दोबारा नहीं भेजा जाता (सिर्फ़ लोकेशन चुपचाप ताज़ा होती है)।
  skip: (req) => req.method === 'POST' && /^\/complaints\/[^/]+\/sos\/?$/.test(req.path),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'बहुत ज़्यादा requests — कृपया कुछ देर बाद कोशिश करें।' },
});
app.use(globalLimiter);

// OTP endपॉइंट्स पर और भी सख़्त सीमा (दुरुपयोग रोकने के लिए) — यहां भी वही IP+पहचानकर्ता
// पैटर्न, ताकि एक थाने के कई अधिकारी एक साथ OTP मांगें तो एक-दूसरे को ब्लॉक न करें
// 🐛 बग फ़िक्स (सुरक्षा): पहले यहां req.ip सीधे इस्तेमाल होता था। IPv6 में हर
// उपयोगकर्ता को आम तौर पर एक पूरा /64 ब्लॉक मिलता है — यानी वह हर कोशिश पर अलग
// IPv6 पता इस्तेमाल करके लॉगिन/OTP की सीमा पूरी तरह बायपास कर सकता था। express-
// rate-limit का ipKeyGenerator पूरे /64 को एक ही key मानता है, जिससे यह रास्ता बंद
// हो जाता है। (यह ग़लती केवल असल में सर्वर चलाने पर पकड़ में आई — static जांच में नहीं।)
const otpKeyGenerator = (req) => {
  const id = req.body?.identifier || req.body?.mobile || '';
  return `${normalizeIpForRateLimit(req.ip)}:${String(id).trim().toLowerCase()}`;
};
const otpLimiter = rateLimit({ store: getRateLimitStore(), windowMs: 10 * 60 * 1000, max: 5, keyGenerator: otpKeyGenerator });

// 🔒 बग फ़िक्स (distributed abuse — login वाली ही श्रेणी की समस्या, यहां भी उतनी ही
// गंभीर): ऊपर वाली सीमा भी IP+मोबाइल दोनों मिलाकर लगती थी — हमलावर अलग-अलग IP से
// आकर किसी एक मोबाइल नंबर पर बार-बार OTP भिजवा सकता था। इसके दो असली नुक़सान हैं —
// (1) SMS gateway का बिल (हर SMS का पैसा लगता है), (2) उस नंबर के मालिक को बार-बार
// SMS से परेशान करना (एक तरह की उत्पीड़न/harassment, ख़ासकर एक सुरक्षा-ऐप के लिए
// गंभीर)। अब एक दूसरी, सिर्फ़ मोबाइल-नंबर पर आधारित (IP से स्वतंत्र) सीमा भी।
const otpAccountOnlyKeyGenerator = (req) => {
  const id = req.body?.identifier || req.body?.mobile || '';
  return String(id).trim().toLowerCase();
};
const otpAccountLimiter = rateLimit({
  store: getRateLimitStore(),
  windowMs: 60 * 60 * 1000,
  max: 10, // प्रति मोबाइल/पहचानकर्ता 1 घंटे में अधिकतम 10 OTP — चाहे कितने भी अलग IP से मांगे जाएं
  message: { error: 'इस नंबर पर बहुत ज़्यादा OTP भेजे जा चुके हैं — कृपया कुछ देर बाद कोशिश करें।' },
  keyGenerator: otpAccountOnlyKeyGenerator,
});

app.use('/auth/citizen/signup/request-otp', otpAccountLimiter, otpLimiter);
app.use('/auth/citizen/forgot-password/request-otp', otpAccountLimiter, otpLimiter);
app.use('/auth/forgot-password/request-otp', otpAccountLimiter, otpLimiter);
app.use('/auth/officer/request-otp', otpAccountLimiter, otpLimiter);
app.use('/auth/staff/request-otp', otpAccountLimiter, otpLimiter);

// 🔒 लॉगिन व OTP-सत्यापन पर brute-force सुरक्षा।
// पहले सिर्फ़ "OTP माँगने" पर सीमा थी — पासवर्ड या 6-अंकों का OTP बार-बार अनुमान लगाकर
// आज़माने से कोई रोक नहीं थी (सामान्य सीमा 300/15 मिनट इसके लिए बहुत ढीली है)।
//
// 🐛 बग फ़िक्स: यह सीमा पहले सिर्फ़ IP-address पर आधारित थी। थाने में कई अधिकारी अक्सर
// एक ही WiFi/नेटवर्क (यानी एक ही सार्वजनिक IP) से जुड़े होते हैं — अगर एक अधिकारी ग़लत
// पासवर्ड कई बार डाल दे, तो उसी नेटवर्क के *बाकी सभी* अधिकारी भी 15 मिनट के लिए लॉगिन
// नहीं कर पाते, भले ही उन्होंने कोई ग़लती न की हो — ठीक "दूसरे मोबाइल में लॉगिन नहीं हो
// रहा" जैसी शिकायत का एक बड़ा संभावित कारण। अब सीमा IP + पहचानकर्ता (identifier/badgeId/
// username/mobile) दोनों मिलाकर लगती है — यानी एक खाते पर हमले से बचाव बना रहता है,
// पर एक ही नेटवर्क के अलग-अलग खातों को आपस में असर नहीं पड़ता।
const loginKeyGenerator = (req) => {
  const id = req.body?.identifier || req.body?.badgeId || req.body?.username || req.body?.mobile || '';
  // 🐛 वही IPv6 सुधार (ऊपर otpKeyGenerator की टिप्पणी देखें)
  return `${normalizeIpForRateLimit(req.ip)}:${String(id).trim().toLowerCase()}`;
};
const loginLimiter = rateLimit({
  store: getRateLimitStore(),
  windowMs: 15 * 60 * 1000,
  max: 10, // प्रति IP+खाता 15 मिनट में अधिकतम 10 कोशिशें
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // सफल लॉगिन गिनती में नहीं — असली उपयोगकर्ता को परेशानी न हो
  keyGenerator: loginKeyGenerator,
  message: { error: 'बहुत ज़्यादा असफल कोशिशें — कृपया 15 मिनट बाद दोबारा कोशिश करें।' },
});

// 🔒 बग फ़िक्स (गंभीर — distributed brute-force): ऊपर वाली सीमा IP+खाता दोनों
// मिलाकर लगती है — यानी हमलावर अगर कई अलग-अलग IP (सस्ते proxy/VPN-rotation/
// botnet) इस्तेमाल करे, तो हर नए IP को उसी खाते के लिए एक बिल्कुल ताज़ा (नई)
// सीमा मिल जाती है। टेस्ट से पुष्टि हुई: 5 अलग IP से एक ही खाते पर सिर्फ़ मिनटों
// में 50 कोशिशें हो गईं, जबकि इरादा सिर्फ़ 10 का था — यानी IP-आधारित सीमा को
// पूरी तरह बायपास किया जा सकता था। अब एक दूसरी परत — सिर्फ़ खाते पर आधारित,
// IP से बिल्कुल स्वतंत्र — कितने भी अलग IP से आएं, हमला फिर भी रुकता है। सीमा
// पहली परत से ढीली रखी गई है (एक साथ कई वैध उपयोगकर्ता अलग-अलग नेटवर्क से अपना
// पासवर्ड भूलकर कुछ बार गलत डाल सकते हैं, उन्हें गलती से लॉक न करें)।
const accountOnlyKeyGenerator = (req) => {
  const id = req.body?.identifier || req.body?.badgeId || req.body?.username || req.body?.mobile || '';
  return String(id).trim().toLowerCase();
};
const accountLockLimiter = rateLimit({
  store: getRateLimitStore(),
  windowMs: 30 * 60 * 1000,
  max: 20, // प्रति खाता 30 मिनट में अधिकतम 20 कोशिशें — चाहे कितने भी अलग IP से हों
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: accountOnlyKeyGenerator,
  message: { error: 'इस खाते पर बहुत ज़्यादा असफल कोशिशें हुई हैं — सुरक्षा कारणों से 30 मिनट बाद दोबारा कोशिश करें।' },
});

app.use('/auth/citizen/login', accountLockLimiter, loginLimiter);
app.use('/auth/officer/login', accountLockLimiter, loginLimiter);
app.use('/auth/admin/login', accountLockLimiter, loginLimiter);
app.use('/auth/staff/login', accountLockLimiter, loginLimiter);
app.use('/auth/citizen/signup/verify', accountLockLimiter, loginLimiter);
app.use('/auth/citizen/forgot-password/verify-otp', otpAccountLimiter, otpLimiter);
app.use('/auth/citizen/forgot-password/reset', accountLockLimiter, loginLimiter);
app.use('/auth/forgot-password/verify-otp', otpAccountLimiter, otpLimiter);
app.use('/auth/forgot-password/reset', accountLockLimiter, loginLimiter);
app.use('/auth/officer/verify-otp', accountLockLimiter, loginLimiter);
app.use('/auth/staff/verify-otp', accountLockLimiter, loginLimiter);
// 🐛 बग फ़िक्स: यह पूरे ऐप का इकलौता लॉगिन endpoint था जिस पर brute-force सुरक्षा
// बिल्कुल नहीं थी — सिर्फ़ सामान्य 300/15मिनट वाली ढीली सीमा लागू होती थी।
app.use('/counselling/providers/login', accountLockLimiter, loginLimiter);
// 🆕 refresh token endpoint भी असीमित प्रयासों से बचाव के लिए इसी सीमा में
app.use('/auth/refresh', loginLimiter);
// 🔒 सुरक्षा सुधार: पासवर्ड-बदलने वाले endpoint पर कोई सीमा नहीं थी — अगर कभी किसी का
// JWT token चोरी हो जाए (जैसे किसी compromised डिवाइस से), तो वह असीमित बार currentPassword
// अंदाज़ा लगाने की कोशिश कर सकता था।
app.use('/admin/me/password', loginLimiter);
// 🆕 वही सुरक्षा अधिकारी व काउंसलर के नए पासवर्ड-endpoints पर भी — ये अभी जोड़े गए
// हैं, और इन पर सीमा न लगाना ऊपर वाली चूक को दोहराना होता। ध्यान दें: यहाँ
// loginLimiter की key IP+पहचान है, पर body में मोबाइल/username नहीं आता (पहचान JWT
// से आती है) — इसलिए असल में यह IP-आधारित सीमा की तरह काम करता है। चोरी हुए token
// से एक ही IP से अंदाज़ा लगाने पर यह पर्याप्त है, और वैध उपयोगकर्ता को कोई फ़र्क़
// नहीं पड़ता क्योंकि वह पासवर्ड बार-बार नहीं बदलता।
app.use('/officers/me/password', loginLimiter);
app.use('/counselling/providers/me/password', loginLimiter);

// 🔒 सुरक्षा — सार्वजनिक ट्रैकिंग endpoint (/track/:id) पर सामान्य globalLimiter
// (300/15मिनट) से ज़्यादा सख़्त सीमा। शिकायत ID अब पूरी तरह random है (32^10 ≈ 1.1
// क्वाड्रिलियन संभावनाएं — utils/ids.js देखें), इसलिए ID अंदाज़ा लगाना व्यावहारिक
// रूप से असंभव है। यह सीमा उस पर एक अतिरिक्त, सामान्य दुरुपयोग-रोधी परत है (जैसे
// किसी को बहुत तेज़ी से बहुत सारे ट्रैकिंग-अनुरोध भेजने से रोकना), प्राथमिक सुरक्षा
// ID की random-लंबाई ही है।
const trackLimiter = rateLimit({ store: getRateLimitStore(), windowMs: 10 * 60 * 1000, max: 15 });
app.use('/track', trackLimiter);

// 🔒 सुरक्षा सुधार: PDF-रिपोर्ट बनाना (generateNow) — PDF-rendering + database
// गणना + ईमेल-भेजना — किसी सामान्य API कॉल से कहीं ज़्यादा महंगा (compute-intensive)
// है, पर पहले कोई विशेष सीमा नहीं थी। भले ही यह सिर्फ़ admin के लिए है (छोटा, भरोसेमंद
// समूह), बार-बार तेज़ी से "Generate करें" दबाने (या किसी compromised admin खाते) से
// सर्वर पर अनावश्यक दबाव और Gmail की अपनी भेजने-सीमा (rate-limit) तक पहुंचने का
// जोखिम रहता है। path में :id होने से सीधा string-match नहीं हो सकता, इसलिए regex।
const reportGenLimiter = rateLimit({ store: getRateLimitStore(), windowMs: 10 * 60 * 1000, max: 10 });
app.use(/^\/admin\/report-schedules\/[^/]+\/generate-now$/, reportGenLimiter);

// 🔒 सुरक्षा सुधार: broadcast एक ही बार में संभावित रूप से राज्य के *हर* नागरिक व
// अधिकारी को push notification भेजता है — PDF-रिपोर्ट से भी कहीं भारी काम, जिस पर
// सीमा पहले से है। यहां कोई सीमा नहीं थी: किसी compromised (या लापरवाह) admin खाते
// से पूरे उपयोगकर्ता-आधार को बार-बार सूचना-बाढ़ में डाला जा सकता था, और ऐसी सूचनाएं
// वापस भी नहीं ली जा सकतीं।
const broadcastLimiter = rateLimit({ store: getRateLimitStore(), windowMs: 60 * 60 * 1000, max: 10 });
app.use('/admin/broadcast', (req, res, next) => {
  if (req.method === 'POST') return broadcastLimiter(req, res, next);
  next(); // history (GET) पर सीमा नहीं
});

// 🐛 बग फ़िक्स (निगरानी): पहले यह सिर्फ़ { status: 'ok' } लौटाता था — यानी सिर्फ़ इतना
// बताता कि Node प्रक्रिया ज़िंदा है। अगर डेटाबेस बंद हो जाए (सबसे आम व सबसे गंभीर
// ख़राबी), तब भी यह 200 OK लौटाता और uptime-monitor को "सब ठीक है" दिखता — जबकि हर
// असली अनुरोध विफल हो रहा होता। SOS जैसी सुविधा वाले ऐप में इसका मतलब है कि सिस्टम
// के बंद पड़ जाने पर भी किसी को सूचना ही नहीं मिलती। अब डेटाबेस भी सच में जांचा
// जाता है। (छोटा timeout रखा है ताकि अटका हुआ डेटाबेस health-जांच को ही न लटका दे।)
app.get('/health', async (req, res) => {
  try {
    const db = require('./config/db');
    await Promise.race([
      db.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 3000)),
    ]);
    res.json({ status: 'ok', database: 'ok' });
  } catch (e) {
    // 503 — uptime-monitor इसे साफ़ तौर पर \"डाउन\" गिनता है
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use('/auth', authRoutes);
app.use('/complaints', complaintRoutes);
app.use('/citizens', citizenRoutes);
app.use('/admin', adminRoutes);
app.use('/messages', messagesRoutes);
// 🔒 सुरक्षा सुधार: /nearby जान-बूझकर बिना-लॉगिन उपलब्ध है (आपात स्थिति में नज़दीकी
// थाना लॉगिन से पहले भी मिलना चाहिए), पर इसकी हर कॉल एक बाहरी API (Overpass /
// LocationIQ) तक जाती है। Overpass की उपयोग-नीति सख़्त है और ज़्यादा कॉल पर वह सर्वर
// का IP ब्लॉक कर सकता है; LocationIQ का quota पैसे से जुड़ा है। बिना सीमा के कोई
// script quota ख़त्म करा सकती थी या सर्वर को ब्लॉक करा सकती थी — जिसका असर असली SOS
// के समय "नज़दीकी थाना" न मिलने के रूप में पड़ता। सीमा जान-बूझकर उदार रखी है ताकि
// वास्तविक आपात उपयोग कभी न रुके।
const nearbyLimiter = rateLimit({ store: getRateLimitStore(), windowMs: 10 * 60 * 1000, max: 60 });
app.use('/nearby', nearbyLimiter);

app.use('/nearby', nearbyRoutes);
app.use('/police-services', policeServicesRoutes);
app.use('/track', trackRoutes);
app.use('/banners', bannersRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/counselling', counsellingRoutes);
app.use('/atr', atrRoutes);
app.use('/admin/backup', backupRoutes);
app.use('/', contentPublicRoutes); // /welfare-items, /helpline-items
app.use('/content', contentPublicRoutes); // /content/location-data, /content/app-settings
app.use('/', officerRoutes); // /officers , /admin/stats

app.use((req, res) => res.status(404).json({ error: 'रूट नहीं मिला' }));
app.use(errorHandler);

module.exports = app;
