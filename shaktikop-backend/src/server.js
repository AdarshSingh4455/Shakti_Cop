// 🐛 बग फ़िक्स (Railway पर बाहर जाने वाले कनेक्शन विफल): Node पहले IPv6 पता हल करता
// है। Railway के container में IPv6 बाहर की ओर काम नहीं करता, इसलिए Gmail SMTP जैसी
// हर कोशिश इस त्रुटि पर मरती थी:
//     connect ENETUNREACH 2607:f8b0:...:465
// nodemailer के transport में family: 4 देना काफ़ी नहीं निकला — वह विकल्प हमेशा DNS
// स्तर तक नहीं पहुँचता। यह पंक्ति पूरे process के लिए IPv4 को प्राथमिकता देती है,
// इसलिए हर बाहरी कनेक्शन (SMTP, push, geocoding) पर लागू होती है।
// ⚠️ सबसे ऊपर होना ज़रूरी है — किसी भी कनेक्शन के बनने से पहले।
require('dns').setDefaultResultOrder('ipv4first');

require('dotenv').config({ quiet: true });
const { loadSecretsFromAwsIfConfigured } = require('./utils/secretsManager');

// 🆕 AWS Secrets Manager (वैकल्पिक) — अगर SECRETS_MANAGER_SECRET_NAME सेट है, तो
// बाकी सब कुछ (app.js, DB कनेक्शन, JWT आदि) require होने से पहले असली secrets
// यहीं process.env में भर दिए जाते हैं। यह async है इसलिए पूरा startup एक IIFE
// में लपेटा गया है — वरना बाद के require() अभी भी खाली env-vars पढ़ लेते।
(async () => {
  await loadSecretsFromAwsIfConfigured();

  const { initSentry, captureException } = require('./utils/sentry');
  initSentry();
  const app = require('./app');
  const { startEscalationScheduler } = require('./utils/escalation');
  const { startActivityLogCleanupScheduler } = require('./utils/activityLogRetention');
  const { startLocationTrailCleanupScheduler } = require('./utils/locationTrailRetention');
  const { startReportScheduler } = require('./utils/reportScheduler');

  // ============================================================
  // सुरक्षा-जाल (safety net) — बिना संभाली गई (unhandled) Promise त्रुटि या
  // अनपेक्षित exception से पूरा सर्वर क्रैश न हो। Node.js v15+ में by-default
  // unhandled rejection पूरे process को terminate कर देता है — यानी SOS भेजते
  // समय किसी एक SMS/push call में क्षणिक नेटवर्क त्रुटि आने भर से पूरा बैकएंड
  // (सभी उपयोगकर्ताओं के लिए) नीचे जा सकता था। अभी sendSms/sendPushNotification
  // खुद अपनी त्रुटियां संभालते हैं (सुरक्षित हैं), पर भविष्य में कोई नया कोड चूक
  // सकता है — इसलिए यह अतिरिक्त सुरक्षा-परत हमेशा के लिए। अब Sentry को भी सूचना जाती है।
  process.on('unhandledRejection', (reason) => {
    console.error('⚠️ अनहैंडल्ड Promise त्रुटि (सर्वर नहीं रुका):', reason);
    captureException(reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on('uncaughtException', (err) => {
    console.error('⚠️ अनपेक्षित त्रुटि (सर्वर नहीं रुका):', err);
    captureException(err);
  });

  const PORT = process.env.PORT || 4000;

// ============================================================
// शुरुआत में सुरक्षा-जाँच — असुरक्षित सेटिंग logs में तुरंत दिखे,
// ताकि गलती से production में कोई खुली कड़ी न रह जाए।
// ============================================================
function securityCheck() {
  const isProd = process.env.NODE_ENV === 'production';
  const warn = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    warn.push('JWT_SECRET सेट नहीं है या बहुत छोटा है (कम से कम 32 अक्षर होने चाहिए)');
  }
  const hasSms =
    process.env.MSG91_AUTH_KEY || process.env.FAST2SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID;
  if (isProd && !hasSms) {
    warn.push('कोई SMS gateway सेट नहीं है — मोबाइल पर OTP नहीं जाएगा (MSG91/Fast2SMS/Twilio में से कोई जोड़ें)');
  }
  if (isProd && process.env.ALLOW_INSECURE_DEV_LOGIN === 'true') {
    // 🔒 सुरक्षा फ़िक्स: पहले यहाँ सिर्फ़ चेतावनी छपती थी और सर्वर चलता रहता था।
    // पर यह चेतावनी Railway के लॉग में ऊपर सरक जाती है, और सर्वर असली पीड़िताओं का
    // डेटा परोसता रहता है — जबकि इस flag के रहते OTP API जवाब में लौटता है और डेमो
    // पासवर्ड चलते हैं, यानी कोई भी किसी के भी खाते में (Super Admin समेत) घुस सकता है।
    // यह एकमात्र ऐसी सेटिंग है जो production में कभी चालू नहीं होनी चाहिए, इसलिए अब
    // यह चेतावनी नहीं — सर्वर शुरू ही नहीं होता।
    console.error('\n' + '█'.repeat(58));
    console.error('██  🔴 सर्वर शुरू नहीं किया जा सकता');
    console.error('██');
    console.error('██  production में ALLOW_INSECURE_DEV_LOGIN=true सेट है।');
    console.error('██  इसके रहते:');
    console.error('██    • OTP API जवाब में लौटता है — कोई भी किसी के भी');
    console.error('██      खाते में घुस सकता है (नागरिक, अधिकारी, Super Admin)');
    console.error('██    • डेमो पासवर्ड (Admin@123 आदि) से लॉगिन चालू रहता है');
    console.error('██');
    console.error('██  हटाने के लिए:');
    console.error('██      railway variables --unset ALLOW_INSECURE_DEV_LOGIN');
    console.error('█'.repeat(58) + '\n');
    process.exit(1);
  } else if (isProd && process.env.OTP_DEV_MODE === 'true') {
    warn.push('OTP_DEV_MODE=true है — production में इसे false करें (फ़िलहाल कोड इसे अनदेखा कर रहा है, OTP बाहर नहीं जा रहा)');
  }
  if (isProd && !process.env.ALLOWED_ORIGINS) {
    warn.push('ALLOWED_ORIGINS सेट नहीं है — ब्राउज़र से कोई भी website API कॉल कर सकती है');
  }
  // 🔒 बग फ़िक्स: FIELD_ENCRYPTION_KEY के लिए कोई production चेतावनी नहीं थी — अगर यह
  // सेट न हो, तो पीड़ित का नाम/मोबाइल/पता/GPS जैसा संवेदनशील डेटा चुपचाप plain text में
  // सेव होने लगता है (fieldCrypto.js जान-बूझकर dev-friendly है — key न हो तो ऐप क्रैश
  // नहीं करता, सिर्फ़ चेतावनी देता है)। बिना इस चेतावनी के, production में key जोड़ना
  // भूल जाने पर किसी को पता ही नहीं चलता कि encryption असल में काम नहीं कर रहा।
  if (isProd && !process.env.FIELD_ENCRYPTION_KEY) {
    warn.push('FIELD_ENCRYPTION_KEY सेट नहीं है — पीड़ित का नाम/मोबाइल/पता/GPS जैसा संवेदनशील डेटा अभी plain text में सेव हो रहा है (encrypted नहीं)। बनाने के लिए: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  // 🆕 बग फ़िक्स: पहले SENTRY_DSN न होने पर कोई चेतावनी नहीं थी — production में कोई
  // इसे सेट करना भूल जाए तो टीम को कभी पता ही न चलता कि error-monitoring काम नहीं कर रही
  if (isProd && !process.env.SENTRY_DSN) {
    warn.push('SENTRY_DSN सेट नहीं है — production त्रुटियां सिर्फ़ सर्वर लॉग में हैं, किसी को तुरंत सूचना नहीं मिलेगी');
  }

  // 🆕 key-rotation बीच में अटकी है — यह चेतावनी ज़रूरी है क्योंकि इसका असर बिल्कुल
  // चुपचाप पड़ता है। previous-key fallback सिर्फ़ decrypt पर काम करता है, blindIndex
  // पर नहीं — इसलिए जब तक encryptExistingFields.js नहीं चलती, एक ही मोबाइल नंबर के
  // पुराने और नए hash अलग-अलग रहते हैं, और डुप्लीकेट-पहचान व दोहराए-आरोपी मिलान
  // बिना कोई त्रुटि दिए काम करना बंद कर देते हैं।
  if (process.env.FIELD_ENCRYPTION_KEY_PREVIOUS) {
    warn.push(
      'FIELD_ENCRYPTION_KEY_PREVIOUS सेट है — key-rotation अभी अधूरी है। जब तक ' +
      '"npm run db:encrypt-fields" नहीं चलती, डुप्लीकेट-शिकायत पहचान और दोहराए-आरोपी ' +
      'मिलान चुपचाप काम नहीं करेंगे (कोई त्रुटि नहीं दिखेगी)। script चलाने के बाद यह ' +
      'variable हटा दें।'
    );
  }

  // 🆕 सिर्फ़ key का *होना* जांचना काफ़ी नहीं — key *ग़लत* भी हो सकती है (जैसे किसी ने
  // बिना पुराना डेटा माइग्रेट किए key बदल दी)। ऐसी स्थिति में ऐप क्रैश नहीं होता: वह
  // चलता रहता है और पीड़िता का हर नाम/पता चुपचाप "••••••" दिखने लगता है — किसी को तब
  // तक पता ही नहीं चलता जब तक कोई उपयोगकर्ता शिकायत न करे। इसलिए शुरू होते ही एक
  // असली encrypted पंक्ति डिक्रिप्ट करके जांच लेते हैं।
  if (process.env.FIELD_ENCRYPTION_KEY) {
    (async () => {
      try {
        const db = require('./config/db');
        const { decryptField } = require('./utils/fieldCrypto');
        const r = await db.query(
          "SELECT victim_name FROM complaints WHERE victim_name LIKE 'enc:v1:%' LIMIT 1"
        );
        if (r.rows.length > 0 && decryptField(r.rows[0].victim_name) === '••••••') {
          console.error('\n' + '█'.repeat(58));
          console.error('██  ⚠️  FIELD_ENCRYPTION_KEY मौजूदा डेटा से मेल नहीं खाती!');
          console.error('██');
          console.error('██  पुराना संवेदनशील डेटा (पीड़िता का नाम/पता/मोबाइल/GPS)');
          console.error('██  डिक्रिप्ट नहीं हो पा रहा — ऐप में वह "••••••" दिखेगा।');
          console.error('██  संभवतः key बदल दी गई है, पर पुराना डेटा माइग्रेट नहीं हुआ।');
          console.error('██');
          console.error('██  ✅ सही तरीक़ा — पुरानी key को हटाएं नहीं, बल्कि यह सेट करें:');
          console.error('██       FIELD_ENCRYPTION_KEY_PREVIOUS=<पुरानी वाली key>');
          console.error('██     इससे पुराना डेटा अपने-आप पढ़ा जाने लगेगा (नई key से नया');
          console.error('██     लिखा जाता रहेगा)। फिर सुविधानुसार चलाएं:');
          console.error('██       npm run db:encrypt-fields');
          console.error('██     जिसके बाद FIELD_ENCRYPTION_KEY_PREVIOUS हटाई जा सकती है।');
          console.error('█'.repeat(58) + '\n');
        }
      } catch (e) {
        // डेटाबेस अभी उपलब्ध न हो — यह जांच वैकल्पिक है, इससे startup न रुके
      }
    })();
  }

  // ============================================================
  // 🛑 जिन चूकों से पीड़िता का डेटा सीधे उजागर होता है — production में इन पर सर्वर
  //    शुरू ही नहीं होगा (fail-closed)।
  //
  // पहले ये सिर्फ़ ऊपर चेतावनी के रूप में छपती थीं। लेकिन चेतावनी तभी काम करती है
  // जब कोई उसे पढ़े — और deploy के बाद logs अक्सर कोई नहीं देखता। नतीजा यह होता था
  // कि सर्वर पूरी तरह "चालू" दिखता, पर:
  //   • FIELD_ENCRYPTION_KEY न हो → पीड़िता का नाम/मोबाइल/पता/GPS सब plain text में
  //     database में लिखा जाता रहता — और बाद में key लगाने पर भी वह पुराना डेटा
  //     encrypted नहीं हो जाता;
  //   • ALLOWED_ORIGINS न हो → CORS सबके लिए खुला, यानी इंटरनेट की कोई भी website
  //     ब्राउज़र से इस API को कॉल कर सकती है।
  // इस स्तर के डेटा के लिए "चलता रहे, बस चेतावनी दे दें" सही रवैया नहीं है।
  //
  // ⚠️ आपात स्थिति के लिए रास्ता खुला है: ALLOW_INSECURE_START=true सेट करके इसे
  //    लांघा जा सकता है (हर बार लॉग में साफ़ दर्ज होता है) — ताकि किसी असली संकट
  //    में यह जाँच ख़ुद रुकावट न बन जाए।
  // ============================================================
  if (isProd) {
    const fatal = [];
    if (!process.env.FIELD_ENCRYPTION_KEY) {
      fatal.push('FIELD_ENCRYPTION_KEY सेट नहीं है — पीड़िता का नाम/मोबाइल/पता/GPS बिना encryption के सेव होगा');
    }
    if (!process.env.ALLOWED_ORIGINS) {
      fatal.push('ALLOWED_ORIGINS सेट नहीं है — ब्राउज़र से कोई भी website इस API को कॉल कर सकेगी');
    }

    // 🔒 सुरक्षा फ़िक्स: पहले ALLOW_INSECURE_START दोनों चूकों को एक जैसा लाँघ देता था।
    // पर ये दोनों बराबर नहीं हैं:
    //   • ALLOWED_ORIGINS का न होना — बुरा है, पर पूरी तरह पलटा जा सकता है: variable
    //     सेट करो, दोबारा deploy करो, बात ख़त्म। कोई स्थायी नुक़सान नहीं।
    //   • FIELD_ENCRYPTION_KEY का न होना — पीड़िता का नाम/मोबाइल/पता/GPS सीधे
    //     plain text में डेटाबेस में लिखा जाता है। बाद में key लगाने पर वह पुराना
    //     डेटा encrypted नहीं हो जाता। यानी नुक़सान स्थायी है, चुपचाप होता है, और
    //     सर्वर जितनी देर चलता है उतना बढ़ता जाता है।
    // इसलिए आपात-रास्ता सिर्फ़ पहली (पलटी जा सकने वाली) चूक के लिए खुला है। दूसरी को
    // लाँघने की अनुमति अब किसी भी हाल में नहीं — यही वह चूक है जो पीड़िताओं का डेटा
    // हमेशा के लिए असुरक्षित कर देती है।
    const unbypassable = fatal.filter((f) => f.includes('FIELD_ENCRYPTION_KEY'));
    if (unbypassable.length > 0) {
      console.error('\n' + '█'.repeat(58));
      console.error('██  ⛔  सर्वर शुरू नहीं किया जा सकता');
      console.error('██');
      unbypassable.forEach((f, i) => console.error(`██   ${i + 1}. ${f}`));
      console.error('██');
      console.error('██  यह चूक ALLOW_INSECURE_START से भी नहीं लाँघी जा सकती —');
      console.error('██  क्योंकि बिना key के सेव हुआ डेटा बाद में key लगाने पर भी');
      console.error('██  encrypted नहीं होता। नुक़सान स्थायी है।');
      console.error('██');
      console.error('██  FIELD_ENCRYPTION_KEY बनाने के लिए:');
      console.error('██    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      console.error('██  ⚠️ अगर पहले से डेटा encrypted है तो वही पुरानी key लगाएं, नई नहीं।');
      console.error('█'.repeat(58) + '\n');
      process.exit(1);
    }

    if (fatal.length > 0) {
      if (process.env.ALLOW_INSECURE_START === 'true') {
        console.error('\n' + '█'.repeat(58));
        console.error('██  ⚠️  ALLOW_INSECURE_START=true — नीचे की गंभीर चूकों के बावजूद');
        console.error('██      सर्वर चलाया जा रहा है। यह अस्थायी होना चाहिए।');
        fatal.forEach((f, i) => console.error(`██      ${i + 1}. ${f}`));
        console.error('█'.repeat(58) + '\n');
      } else {
        console.error('\n' + '█'.repeat(58));
        console.error('██  ⛔  सर्वर शुरू नहीं किया जा सकता — गंभीर सुरक्षा चूक');
        console.error('██');
        fatal.forEach((f, i) => console.error(`██   ${i + 1}. ${f}`));
        console.error('██');
        console.error('██  इन्हें Railway → Variables में सेट करें, फिर दोबारा deploy करें।');
        console.error('██  FIELD_ENCRYPTION_KEY बनाने के लिए:');
        console.error('██    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
        console.error('██  ⚠️ अगर पहले से डेटा encrypted है तो वही पुरानी key लगाएं, नई नहीं।');
        console.error('██');
        console.error('██  किसी आपात स्थिति में अस्थायी रूप से चलाना ही पड़े तो:');
        console.error('██    ALLOW_INSECURE_START=true');
        console.error('█'.repeat(58) + '\n');
        process.exit(1);
      }
    }
  }

  if (warn.length === 0) {
    console.log('🔒 सुरक्षा-जाँच: सब ठीक है');
  } else {
    console.warn('\n⚠️  सुरक्षा चेतावनी ' + '─'.repeat(40));
    warn.forEach((w, i) => console.warn(`   ${i + 1}. ${w}`));
    console.warn('─'.repeat(56) + '\n');
  }

  // 🆕 डेमो खातों की स्थिति शुरुआत में ही साफ़ दिखाएं। पहले यह कहीं नहीं छपता था,
  // इसलिए "डेमो लॉगिन क्यों नहीं चल रहा" का पता लगाने का कोई तरीक़ा ही नहीं था —
  // यह भी नहीं कि DEMO_ACCOUNTS सर्वर तक पहुँचा भी या नहीं।
  const demoRaw = (process.env.DEMO_ACCOUNTS || '').trim();
  if (demoRaw) {
    const list = demoRaw.split(',').map((s) => s.trim()).filter(Boolean);
    console.log(`🎭 डेमो खाते चालू (${list.length}): ${list.join(', ')}`);
    console.log('   इन खातों पर डेमो-पासवर्ड चलेंगे और OTP API जवाब में लौटेगा।');
    console.log('   ⚠️ इनमें असली पीड़िताओं का डेटा न रखें। डेमो के बाद यह variable हटा दें।\n');
  } else {
    console.log('🎭 DEMO_ACCOUNTS सेट नहीं है — कोई डेमो लॉगिन नहीं चलेगा, OTP कभी नहीं दिखेगा।\n');
  }

  // 🆕 ईमेल का रास्ता साफ़ दिखाएं — Railway पर SMTP बंद है, इसलिए यह जानना ज़रूरी है
  // कि मेल किस ज़रिए जाएगी (या जाएगी भी या नहीं)।
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
    console.log(`📧 ईमेल: Resend (HTTPS) से — from: ${from}`);
    if (!process.env.RESEND_FROM) {
      console.log('   ⚠️ RESEND_FROM सेट नहीं — तब Resend सिर्फ़ आपके अपने खाते वाले');
      console.log('      ईमेल पर भेजता है। असली नागरिकों तक मेल भेजने के लिए अपना डोमेन');
      console.log('      सत्यापित करके RESEND_FROM=noreply@<डोमेन> सेट करें।\n');
    } else {
      console.log('');
    }
  } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    console.log('📧 ईमेल: Gmail SMTP से — ⚠️ Railway बाहर जाने वाले SMTP ports बंद रखता');
    console.log('   है, इसलिए वहाँ यह "Connection timeout" देगा। RESEND_API_KEY लगाएं।\n');
  } else {
    console.log('📧 ईमेल का कोई रास्ता सेट नहीं — OTP ईमेल पर नहीं जाएगा।\n');
  }

  if (process.env.DEV_OTP_SIGNUP_ONLY === 'true') {
    console.log('🧪 DEV_OTP_SIGNUP_ONLY चालू — किसी भी नंबर से *नया खाता* बनाते समय OTP');
    console.log('   API जवाब में लौटेगा (टेस्टिंग के लिए)। लॉगिन/पासवर्ड-रीसेट पर यह लागू नहीं।');
    console.log('   ⚠️ असली SMS gateway चालू होते ही यह variable हटा दें।\n');
  }
}

app.listen(PORT, () => {
    console.log(`ShaktiCop बैकएंड सर्वर चल रहा है → http://localhost:${PORT}`);
    securityCheck();

    // ⚖️ Load balancer / एक से ज़्यादा instance वाली तैनाती के लिए ज़रूरी
    // -----------------------------------------------------------------
    // ये पृष्ठभूमि-कार्य (escalation, स्वचालित रिपोर्ट, सफ़ाई) हर instance पर
    // अलग-अलग चलते हैं। अगर load balancer के पीछे 3 instance चल रहे हों, तो:
    //   • escalation की सूचना हर admin को 3 बार जाती
    //   • स्वचालित PDF रिपोर्ट 3 बार ईमेल होती
    //   • सफ़ाई-कार्य 3 बार चलते (नुक़सानदेह नहीं, पर बेकार)
    // इसलिए एक से ज़्यादा instance पर सिर्फ़ *एक* पर RUN_SCHEDULERS=true रखें,
    // बाक़ी पर RUN_SCHEDULERS=false। डिफ़ॉल्ट 'true' है ताकि अभी चल रही
    // single-instance तैनाती में कुछ भी न बदले।
    if (process.env.RUN_SCHEDULERS !== 'false') {
      startEscalationScheduler();
      startActivityLogCleanupScheduler();
      startLocationTrailCleanupScheduler();
      startReportScheduler();
    } else {
      console.log('⏸️  पृष्ठभूमि-कार्य (schedulers) इस instance पर बंद हैं (RUN_SCHEDULERS=false)');
    }
  });
})();
