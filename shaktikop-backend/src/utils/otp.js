const { isDemoAccount } = require('./demoAccounts');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../config/db');

// 🔒 डिफ़ॉल्ट 5 से घटाकर 3 मिनट — OTP जितनी देर वैध रहेगा, हमलावर के पास अनुमान
// लगाने की खिड़की उतनी बड़ी। 3 मिनट SMS पहुँचने के सामान्य विलंब के लिए काफ़ी है।
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 3);

// 🔒 सुरक्षा फ़िक्स: OTP पहले database में सादे (plain text) रूप में रखा जाता था।
// यानी database तक सिर्फ़ पढ़ने की पहुँच रखने वाला कोई भी व्यक्ति — dump, replica,
// या बैकअप फ़ाइल से — चालू OTP देखकर किसी के भी खाते में घुस सकता था, Super Admin
// समेत। OTP छोटी अवधि का ज़रूर है, पर उतनी देर काफ़ी होती है।
//
// साधारण SHA-256 यहाँ पर्याप्त नहीं: 6 अंकों के OTP की कुल संभावनाएं सिर्फ़ 10 लाख
// हैं, इसलिए एक छोटी-सी lookup तालिका बनाकर उसे उलटा जा सकता है। इसलिए server के
// गुप्त key से HMAC — database मिल भी जाए तो key के बिना OTP निकाला नहीं जा सकता।
//
// मिलान अब भी सीधा (deterministic) रहता है, इसलिए verify की query पहले जैसी ही
// तेज़ है — बस अब वह hash से मिलान करती है, कोड से नहीं।
function hashOtpCode(code) {
  const secret = process.env.JWT_SECRET || '';
  // domain separation — यही key कहीं और भी इस्तेमाल होती है, इसलिए अलग नमक
  const key = crypto.createHash('sha256').update(secret).update('otp-hash-v1').digest();
  return crypto.createHmac('sha256', key).update(String(code).trim()).digest('hex');
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 999999)); // 6 अंकों का OTP
}

// ============================================================
// असली SMS गेटवे — सिर्फ़ .env में credentials डालते ही अपने-आप चालू हो जाता है।
// कोई कोड बदलने की ज़रूरत नहीं। तीन लोकप्रिय providers समर्थित हैं:
//
//   MSG91    → MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID (भारत में सबसे आम)
//   Fast2SMS → FAST2SMS_API_KEY
//   Twilio   → TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
//
// जो पहले मिल जाए वही इस्तेमाल होता है। कोई भी सेट न हो तो पहले जैसा —
// सिर्फ़ console पर log (development के लिए), ऐप crash नहीं होता।
// ============================================================
function detectSmsProvider() {
  if (process.env.MSG91_AUTH_KEY) return 'msg91';
  if (process.env.FAST2SMS_API_KEY) return 'fast2sms';
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return 'twilio';
  return null;
}

const SMS_PROVIDER = detectSmsProvider();

// भारतीय नंबर को 91 सहित सामान्य रूप में लाएं (गेटवे 10-अंकी और 91xxxxxxxxxx दोनों माँगते हैं)
function normalizeMobile(mobile) {
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 10) return { local: digits, withCode: '91' + digits };
  if (digits.length === 12 && digits.startsWith('91')) return { local: digits.slice(2), withCode: digits };
  return { local: digits, withCode: digits };
}

async function postJson(url, body, headers = {}) {
  // 8 सेकंड की सीमा — गेटवे धीमा हो तो भी OTP request अटके नहीं
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaMsg91(mobile, message, otpCode) {
  const { withCode } = normalizeMobile(mobile);
  // Template ID हो तो MSG91 का OTP API (DLT-अनुपालक, भारत में अनिवार्य),
  // वरना सामान्य SMS API
  if (process.env.MSG91_TEMPLATE_ID && otpCode) {
    return postJson(
      'https://control.msg91.com/api/v5/flow/',
      {
        template_id: process.env.MSG91_TEMPLATE_ID,
        sender: process.env.MSG91_SENDER_ID || 'SHKTCP',
        short_url: '0',
        recipients: [{ mobiles: withCode, OTP: otpCode }],
      },
      { authkey: process.env.MSG91_AUTH_KEY }
    );
  }
  // 🐛 बग फ़िक्स: पहले यहां हमेशा OTP API ही इस्तेमाल होता था, चाहे भेजा जा रहा
  // संदेश OTP हो या SOS जैसा कस्टम टेक्स्ट — नतीजा: SOS पर इमरजेंसी कॉन्टैक्ट्स को
  // जो SMS जाता था उसमें असली संदेश (नाम + लोकेशन लिंक) की जगह सिर्फ़ ख़ाली/undefined
  // OTP फ़ील्ड जाता, यानी वह SMS असल में काम का नहीं होता।
  // अब कस्टम (non-OTP) संदेशों के लिए — Admin की "ऐप सेटिंग्स" में सेट किया गया
  // sms_alert_template वाला flow template इस्तेमाल होता है, जिसमें पूरा संदेश एक
  // वेरिएबल (VAR1) के रूप में भेजा जाता है।
  if (!otpCode) {
    const { getCachedSetting } = require('../controllers/appSettingsController');
    const alertTemplateId = getCachedSetting('sms_alert_template')?.msg91TemplateId;
    if (alertTemplateId) {
      return postJson(
        'https://control.msg91.com/api/v5/flow/',
        {
          template_id: alertTemplateId,
          sender: process.env.MSG91_SENDER_ID || 'SHKTCP',
          short_url: '0',
          recipients: [{ mobiles: withCode, VAR1: message }],
        },
        { authkey: process.env.MSG91_AUTH_KEY }
      );
    }
    // कोई alert template सेट नहीं है — साफ़ चेतावनी दें, चुपचाप गलत SMS न भेजें
    console.warn(
      '⚠️ MSG91 alert template सेट नहीं है (Admin → ऐप सेटिंग्स में सेट करें) — ' +
      `यह SMS नहीं भेजा गया: [${mobile}] ${message}`
    );
    return null;
  }
  return postJson(
    'https://control.msg91.com/api/v5/otp',
    { template_id: '', mobile: withCode, otp: otpCode, sender: process.env.MSG91_SENDER_ID || 'SHKTCP' },
    { authkey: process.env.MSG91_AUTH_KEY }
  );
}

async function sendViaFast2Sms(mobile, message) {
  const { local } = normalizeMobile(mobile);
  return postJson(
    'https://www.fast2sms.com/dev/bulkV2',
    { route: 'v3', sender_id: process.env.FAST2SMS_SENDER_ID || 'TXTIND', message, language: 'unicode', flash: 0, numbers: local },
    { authorization: process.env.FAST2SMS_API_KEY }
  );
}

async function sendViaTwilio(mobile, message) {
  const { withCode } = normalizeMobile(mobile);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const params = new URLSearchParams({
    To: '+' + withCode,
    From: process.env.TWILIO_PHONE_NUMBER,
    Body: message,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function sendSms(mobile, message, otpCode) {
  if (!SMS_PROVIDER) {
    // 🔒 सुरक्षा फ़िक्स: यह विकास (development) के लिए बनी सुविधा है — बिना SMS gateway
    // के भी OTP console में दिखे ताकि testing हो सके। लेकिन production में यही सुविधा
    // ख़तरा बन जाती है: अगर gateway सेट करना छूट जाए या उसका config ग़लत हो, तो हर OTP
    // सर्वर लॉग में साफ़-साफ़ लिखा चला जाता। Railway के लॉग देख पाने वाला कोई भी व्यक्ति
    // किसी के भी खाते में (Super Admin समेत) घुस सकता था — बिना पासवर्ड जाने।
    // अब production में OTP कभी लॉग नहीं होता; उसकी जगह एक साफ़ चेतावनी मिलती है ताकि
    // यह चूक चुपचाप छिपी न रहे।
    if (process.env.NODE_ENV === 'production') {
      console.error(
        `🔴 SMS gateway सेट नहीं है — ${mobile} को OTP नहीं भेजा जा सका। ` +
        'MSG91/Fast2SMS/Twilio में से कोई एक कॉन्फ़िगर करें (OTP सुरक्षा कारणों से लॉग नहीं किया गया)।'
      );
      return;
    }
    console.log(`[SMS → ${mobile}] ${message}`);
    console.log('⚠️ कोई SMS gateway सेट नहीं है (MSG91/Fast2SMS/Twilio) — असली SMS नहीं गया।');
    return;
  }
  try {
    if (SMS_PROVIDER === 'msg91') await sendViaMsg91(mobile, message, otpCode);
    else if (SMS_PROVIDER === 'fast2sms') await sendViaFast2Sms(mobile, message);
    else if (SMS_PROVIDER === 'twilio') await sendViaTwilio(mobile, message);
    console.log(`[SMS ✓ ${SMS_PROVIDER} → ${mobile}] भेजा गया`);
  } catch (err) {
    // ⚠️ जानबूझकर throw नहीं करते — गेटवे बंद हो तो भी पूरा लॉगिन-फ़्लो न टूटे।
    // OTP डेटाबेस में सुरक्षित है; उपयोगकर्ता "दोबारा भेजें" दबा सकता है।
    console.error(`SMS भेजने में त्रुटि (${SMS_PROVIDER}):`, err.message);
  }
}
// ============================================================
// Gmail SMTP से असली ईमेल भेजना — nodemailer से।
// GMAIL_USER और GMAIL_APP_PASSWORD .env में सेट होने पर असली मेल जाती है,
// वरना पहले जैसे सिर्फ़ console पर print होता है (crash नहीं होता)।
// ⚠️ GMAIL_APP_PASSWORD, Gmail का सामान्य पासवर्ड नहीं — Google Account
// में 2-Step Verification चालू करके अलग से "App Password" बनानी होती है।
// ============================================================
let transporter = null;

// transporter अब पहली ज़रूरत पर बनता है (पहले module-load पर बनता था)।
// क्यों: नीचे IPv4 पता निकालना async काम है, और सिंक्रोनस बनाने पर transporter उससे
// पहले ही बन जाता — यानी वही hostname इस्तेमाल होता और सुधार बेअसर रहता।
let smtpResolved = null;

async function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;

  if (!smtpResolved) {
    try {
      const r = await require('dns').promises.lookup('smtp.gmail.com', { family: 4 });
      smtpResolved = r?.address || 'smtp.gmail.com';
    } catch (e) {
      smtpResolved = 'smtp.gmail.com'; // resolve न हो तो नाम पर ही गिरें
    }
  }

  transporter = nodemailer.createTransport({
    // 🐛 बग फ़िक्स (राउंड 2): पहले service: 'gmail' shorthand था, जो port 465 (SSL)
    // चुनता है। Railway के लॉग में उस पर "Connection timeout" आया — यानी IPv4 पर भी
    // कनेक्शन नहीं बना। कई PaaS प्रदाता spam रोकने के लिए port 465 बाहर की ओर बंद
    // रखते हैं, पर 587 (STARTTLS) खुला रखते हैं। इसलिए अब host/port स्पष्ट रूप से
    // दिए गए हैं और 587 इस्तेमाल होता है।
    // 🐛 बग फ़िक्स (राउंड 3 — यही पक्का तरीक़ा है): पिछली दो कोशिशें काफ़ी नहीं रहीं।
    // nodemailer का family: 4 और process-स्तर का dns.setDefaultResultOrder('ipv4first')
    // — दोनों के बाद भी Railway पर IPv6 पते पर ही कनेक्शन जाता रहा:
    //     connect ENETUNREACH 2607:f8b0:4023:1c01::6d:587
    // वजह यह कि ये दोनों विकल्प DNS की *प्राथमिकता* बदलते हैं, पर nodemailer अपना
    // socket बनाते समय हमेशा इनका पालन नहीं करता।
    //
    // इसलिए अब अनुमान छोड़कर सीधा रास्ता: नीचे lookup से IPv4 पता ख़ुद निकालकर host
    // के रूप में दिया जाता है। तब DNS का कोई सवाल ही नहीं बचता।
    // ⚠️ tls.servername ज़रूरी है — host अब IP पता है, इसलिए प्रमाणपत्र की जाँच
    //    smtp.gmail.com के नाम से ही होनी चाहिए, वरना TLS सत्यापन विफल हो जाता।
    host: smtpResolved,
    port: 587,
    tls: { servername: 'smtp.gmail.com' },
    secure: false, // 587 पर कनेक्शन सादा शुरू होकर STARTTLS से एन्क्रिप्टेड होता है
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    // ⚠️ बिना timeout के, धीमा/अनुपलब्ध SMTP सर्वर पूरी request को लंबे समय तक अटका सकता था
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
    // 🐛 बग फ़िक्स (Railway पर ईमेल बिल्कुल नहीं जाती थी): Node पहले IPv6 पता हल करता
    // है, और smtp.gmail.com का IPv6 भी है। पर Railway के container में IPv6 बाहर की
    // ओर काम नहीं करता, इसलिए हर कोशिश इस त्रुटि पर मरती थी:
    //     connect ENETUNREACH 2607:f8b0:4023:c03::6d:465
    // यह Gmail या app-password की गड़बड़ नहीं थी — बस कनेक्शन ही नहीं बन पा रहा था।
    // family: 4 से Node सिर्फ़ IPv4 इस्तेमाल करता है, जो हर जगह चलता है।
    family: 4,
  });
  return transporter;
}

// ============================================================
// HTTP से ईमेल (Resend) — SMTP का विकल्प
//
// क्यों ज़रूरी हुआ: Railway बाहर जाने वाले SMTP ports (465 और 587, दोनों) बंद रखता
// है — spam रोकने के लिए PaaS प्रदाता आम तौर पर ऐसा करते हैं। लॉग में यही दिखा:
//     ENETUNREACH (IPv6)  →  IPv4 पर लाने के बाद  →  Connection timeout
// यानी कनेक्शन बन ही नहीं सकता, चाहे Gmail की सेटिंग कितनी भी सही हो।
//
// Resend HTTPS (port 443) पर चलता है, जो कभी बंद नहीं होता। इसलिए RESEND_API_KEY
// सेट हो तो ईमेल इसी रास्ते जाती है; न हो तो पहले जैसा SMTP आज़माया जाता है
// (स्थानीय विकास में SMTP ठीक चलता है)।
//
// ⚠️ RESEND_FROM: अपना डोमेन सत्यापित किए बिना Resend सिर्फ़ 'onboarding@resend.dev'
//    से भेजने देता है, और वह भी *केवल आपके अपने खाते वाले ईमेल पर*। परीक्षण के लिए
//    यह काफ़ी है। असली लॉन्च के लिए अपना डोमेन सत्यापित करके
//    RESEND_FROM=noreply@<आपका-डोमेन> रखें — वरना नागरिकों तक मेल नहीं जाएगी।
// ============================================================
async function sendViaResend(email, subject, message) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'ShaktiCop <onboarding@resend.dev>',
        to: [email],
        subject,
        text: message,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      // ⚠️ body में OTP नहीं होता (सिर्फ़ Resend की त्रुटि), इसलिए इसे log करना सुरक्षित है
      console.error(`Resend से ईमेल नहीं गई (${res.status}):`, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend कॉल विफल:', err.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function sendEmail(email, subject, message) {
  // Resend सेट हो तो वही — Railway पर यही एकमात्र चलने वाला रास्ता है
  if (process.env.RESEND_API_KEY) {
    const ok = await sendViaResend(email, subject, message);
    if (ok) return;
    // विफल हो तो नीचे SMTP आज़मा लेते हैं (स्थानीय विकास में वह चल जाता है)
  }

  // 🔒 सुरक्षा फ़िक्स: यहाँ पूरा मेल-संदेश (जिसमें OTP होता है) बिना किसी शर्त के
  // log हो रहा था — यानी Gmail सही कॉन्फ़िगर होने पर भी, production में भी, हर OTP
  // सर्वर लॉग में साफ़-साफ़ चला जाता। (SMS वाली चूक इससे कम थी: वह सिर्फ़ तब log करती
  // थी जब gateway सेट ही न हो।) Railway के लॉग देख पाने वाला कोई भी व्यक्ति किसी के
  // भी खाते में घुस सकता था। अब विकास में ही पूरा संदेश दिखता है; production में
  // सिर्फ़ इतना कि मेल किसे भेजी गई — OTP कभी नहीं।
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    console.log(`[EMAIL → ${email}] ${subject}: ${message}`);
  }
  const tx = await getTransporter();
  if (!tx) {
    if (isProd) {
      console.error(
        `🔴 GMAIL_USER/GMAIL_APP_PASSWORD सेट नहीं है — ${email} को मेल नहीं भेजी जा सकी ` +
        '(संदेश सुरक्षा कारणों से log नहीं किया गया)।'
      );
    } else {
      console.log('⚠️ GMAIL_USER/GMAIL_APP_PASSWORD सेट नहीं है — असली मेल नहीं भेजी गई, ऊपर सिर्फ़ log हुआ।');
    }
    return;
  }
  // ⚠️ जानबूझकर await नहीं किया — OTP request का response तुरंत मिले, भले ही
  // Gmail SMTP धीमा/अनुपलब्ध हो। मेल भेजना background में होता है, त्रुटि सिर्फ़ log होती है।
  tx.sendMail({
    from: `"ShaktiCop — UP Police" <${process.env.GMAIL_USER}>`,
    to: email,
    subject,
    text: message,
  }).catch((err) => {
    console.error('असली ईमेल भेजने में त्रुटि:', err.message);
  });
}

// 🆕 PDF रिपोर्ट जैसी attachment वाली ईमेल के लिए — OTP वाले sendEmail से अलग रखा
// गया है क्योंकि यहां असल में इंतज़ार (await) करना ज़रूरी है (caller को पता होना
// चाहिए कि भेजी गई या नहीं — report-schedule का last_sent_at तभी अपडेट हो जो सच में भेजी गई हो)।
// लौटाता है { sent: true } या { sent: false, reason }.
async function sendEmailWithAttachment(email, subject, message, attachment) {
  const tx = await getTransporter();
  if (!tx) {
    console.log(`⚠️ [EMAIL → ${email}] "${subject}" नहीं भेजी गई — GMAIL_USER/GMAIL_APP_PASSWORD सेट नहीं है।`);
    return { sent: false, reason: 'SMTP कॉन्फ़िगर नहीं है (GMAIL_USER/GMAIL_APP_PASSWORD सेट करें)' };
  }
  try {
    await tx.sendMail({
      from: `"ShaktiCop — UP Police" <${process.env.GMAIL_USER}>`,
      to: email,
      subject,
      text: message,
      attachments: attachment ? [attachment] : [],
    });
    return { sent: true };
  } catch (err) {
    console.error('रिपोर्ट-ईमेल भेजने में त्रुटि:', err.message);
    return { sent: false, reason: err.message };
  }
}

function isEmail(identifier) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
}

// 🆕 locale — यह DB में कहीं भी सेव नहीं होता, सिर्फ़ इसी एक request के लिए इस्तेमाल
// होता है (stateless)। मोबाइल ऐप हर OTP-request के साथ अपनी मौजूदा भाषा भेजता है,
// इसलिए schema/sync बदलने की ज़रूरत नहीं पड़ी — OTP का SMS/ईमेल अब सही भाषा में जाता है।
// alsoEmail — वैकल्पिक। मोबाइल पर OTP भेजने के साथ-साथ इस ईमेल पर भी वही OTP जाता है।
async function createAndSendOtp(mobile, purpose = 'signup', locale = 'hi', alsoEmail = null) {
  const otpCode = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  // 🐛 बग फ़िक्स: पहले पहचानकर्ता (खासकर ईमेल) जैसा टाइप हुआ वैसा ही सेव होता था।
  // अलग-अलग फ़ोन के keyboard अलग auto-capitalize व्यवहार करते हैं (जैसे पहला अक्षर
  // बड़ा करना) — नतीजा: OTP मांगते समय "Priya@x.com" सेव हुआ, पर सत्यापित करते समय
  // दूसरे फ़ोन पर "priya@x.com" टाइप हुआ तो मेल न खाकर "OTP गलत है" दिखता — जबकि OTP
  // सही था। अब हमेशा trim + lowercase करके सेव व मिलान होता है।
  const normalized = mobile.trim().toLowerCase();

  // 🐛 बग फ़िक्स (सुरक्षा): पहले हर बार सिर्फ़ नई पंक्ति जुड़ती थी, पुरानी को छुआ ही
  // नहीं जाता — यानी एक साथ कई OTP वैध रहते। नतीजा: अगर किसी ने पुराना SMS देख लिया
  // हो (lock-screen पर दिखी सूचना, या आगे भेजा गया संदेश), तो नया OTP मांग लेने के
  // बाद भी वह पुराना कोड चलता रहता। मानक तरीक़ा यही है कि नया कोड मांगते ही पुराना
  // बेकार हो जाए — अब वही।
  await db.query(
    `UPDATE otp_requests SET verified = true
     WHERE mobile = $1 AND purpose = $2 AND verified = false`,
    [normalized, purpose]
  );

  await db.query(
    `INSERT INTO otp_requests (mobile, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)`,
    [normalized, hashOtpCode(otpCode), purpose, expiresAt]
  );

  // ⚠️ DLT: यह text उस content-template से *हूबहू* मेल खाना चाहिए जो DLT पोर्टल पर
  // पंजीकृत है, वरना operator संदेश चुपचाप रोक देता है (न error, न warning)।
  // पंजीकृत template:
  //     Your ShaktiCop OTP is {#var#}. Valid for 3 minutes. Do not share it with anyone. UP Police
  //
  // बदलाव क्यों किए गए:
  //   • कोष्ठक ( ) और कोलन : हटाए — DLT में विशेष चिह्न अस्वीकृति का आम कारण हैं।
  //   • समय (3 मिनट) template में स्थिर है, इसलिए यहाँ भी स्थिर रखा गया। अगर
  //     OTP_EXPIRY_MINUTES बदलें तो template भी दोबारा पंजीकृत कराना होगा — वरना
  //     text मेल नहीं खाएगा और SMS रुक जाएंगे।
  //   • भाषा के हिसाब से अलग text नहीं रखा: MSG91 template-flow में असल SMS
  //     पंजीकृत template से बनता है, code का text नहीं जाता। दो भाषाओं के लिए दो
  //     अलग template-ID चाहिए होते। साथ ही हिंदी SMS Unicode में जाता है, जहाँ एक
  //     SMS सिर्फ़ 70 अक्षर का होता है (अंग्रेज़ी में 160) — यानी हर OTP 2-3 SMS
  //     जितना महँगा। इसलिए एक ही अंग्रेज़ी template रखा गया है, जो OTP के लिए भारत
  //     में मानक भी है।
  const message = `Your ShaktiCop OTP is ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share it with anyone. UP Police`;
  const emailSubject = locale === 'en' ? 'ShaktiCop Login OTP' : 'ShaktiCop लॉगिन OTP';

  if (isEmail(normalized)) {
    await sendEmail(normalized, emailSubject, message);
  } else {
    await sendSms(normalized, message, otpCode);

    // 🆕 अगर नागरिक ने ईमेल भी दिया है, तो वही OTP वहाँ भी भेजें।
    //
    // क्यों ज़रूरी है: SMS हर बार नहीं पहुँचता — नेटवर्क, DLT-रुकावट, या नंबर किसी
    // और के नाम/कब्ज़े में होना (घरेलू-हिंसा के मामलों में यह आम है)। ऐसे में अगर
    // ईमेल मौजूद है तो नागरिक फिर भी लॉगिन कर पाती है।
    //
    // ⚠️ ईमेल जान-बूझकर SMS के *बाद* भेजी जाती है। sendEmail खुद कभी त्रुटि नहीं
    //    फेंकता — वह भीतर ही .catch() कर लेता है और जवाब का इंतज़ार भी नहीं करता
    //    (fire-and-forget) — इसलिए Gmail बंद हो या पता ग़लत, OTP-flow कभी नहीं रुकता।
    //    यहाँ try/catch सिर्फ़ अतिरिक्त सुरक्षा के लिए है, ज़रूरत नहीं पड़ती।
    if (alsoEmail && isEmail(String(alsoEmail).trim().toLowerCase())) {
      try {
        await sendEmail(String(alsoEmail).trim(), emailSubject, message);
      } catch (e) {
        console.error('OTP ईमेल नहीं भेजा जा सका (SMS भेजा जा चुका है):', e.message);
      }
    }
  }

  // 🔒 OTP सामान्यतः API जवाब में कभी नहीं लौटता — production में यह पूरे ऐप का
  // दरवाज़ा खोल देता है (कोई भी किसी का OTP माँगकर उसके खाते में घुस सकता है)।
  //
  // ⚠️ अपवाद: जब तक असली SMS gateway नहीं जुड़ता, टेस्टिंग के लिए इसे
  // ALLOW_INSECURE_DEV_LOGIN=true सेट करके जान-बूझकर खोला जा सकता है।
  // यह चालू रहते हुए सर्वर हर बार शुरू होने पर तेज़ चेतावनी देता है।
  // असली लॉन्च से पहले इस variable को Railway से ज़रूर हटाएं।
  // 🆕 डेमो खाते: production में भी, DEMO_ACCOUNTS में सूचीबद्ध खातों के लिए OTP
  // जवाब में लौटता है — ताकि अधिकारियों/समीक्षकों को ऐप दिखाते समय लॉगिन अटके नहीं।
  // यह ढील सिर्फ़ उन्हीं खातों तक सीमित है; बाक़ी हर उपयोगकर्ता के लिए OTP कभी नहीं
  // लौटता। पहले यही काम ALLOW_INSECURE_DEV_LOGIN से होता था, जो *सबके* लिए दरवाज़ा
  // खोल देता — यानी कोई भी किसी पीड़िता का नंबर डालकर उसका OTP माँग सकता था।
  const isProd = process.env.NODE_ENV === 'production';
  if (isDemoAccount(normalized)) return otpCode;

  // 🆕 DEV_OTP_SIGNUP_ONLY=true — असली SMS gateway जुड़ने तक टेस्टिंग के लिए।
  //
  // इससे *किसी भी* नंबर से नया खाता बनाया जा सकता है (OTP जवाब में लौटता है), पर
  // सिर्फ़ signup के लिए। लॉगिन, पासवर्ड-रीसेट, अधिकारी/स्टाफ़ OTP — इन पर यह ढील
  // बिल्कुल लागू नहीं होती।
  //
  // यह फ़र्क़ जान-बूझकर है, और यही इसे ALLOW_INSECURE_DEV_LOGIN से अलग बनाता है:
  //   • signup में खाता अभी होता ही नहीं। ज़्यादा से ज़्यादा कोई ऐसे नंबर से नकली
  //     खाता बना लेगा जो उसका नहीं है — गड़बड़ है, पर किसी का मौजूदा डेटा नहीं खुलता।
  //   • लॉगिन/रीसेट में खाता पहले से मौजूद होता है। वहाँ OTP लौटाने का मतलब है किसी
  //     भी पीड़िता (या Super Admin) के खाते में सीधे घुस जाना — उसका नाम, पता, GPS,
  //     सारी शिकायतें। इसीलिए वह रास्ता बंद ही रहता है।
  //
  // ⚠️ असली SMS gateway चालू होते ही यह variable Railway से हटा दें।
  if (process.env.DEV_OTP_SIGNUP_ONLY === 'true' && purpose === 'signup') {
    return otpCode;
  }

  const insecureAllowed = process.env.ALLOW_INSECURE_DEV_LOGIN === 'true';
  if (isProd && !insecureAllowed) return undefined;
  return process.env.OTP_DEV_MODE === 'true' ? otpCode : undefined;
}

async function verifyOtp(mobile, otpCode, purpose = 'signup') {
  const normalized = (mobile || '').trim().toLowerCase();
  // 🔒 सुरक्षा फ़िक्स (race condition): पहले यह दो अलग queries थीं — पहले SELECT से
  // बिना-इस्तेमाल वाला OTP ढूँढना, फिर UPDATE से उसे "verified" करना। दो अनुरोध ठीक
  // एक ही समय आ जाएँ, तो दोनों का SELECT उसी row को बिना-इस्तेमाल पाता (क्योंकि किसी
  // का UPDATE अभी चला ही नहीं), और दोनों सफल हो जाते — यानी एक ही OTP दो बार काम कर
  // जाता, जबकि नियम "एक बार ही" है।
  //
  // अब यह एक ही atomic UPDATE है: शर्तें (verified = false, समय बाक़ी) उसी update के
  // अंदर जाँची जाती हैं, और PostgreSQL उस row को उसी दौरान lock रखता है। इसलिए दो
  // अनुरोधों में से row सिर्फ़ एक को ही लौटती है — विजेता डेटाबेस तय करता है, हमारा
  // कोड नहीं। (इसीलिए यहाँ transaction/lock अलग से लिखने की ज़रूरत नहीं पड़ी।)
  const result = await db.query(
    `UPDATE otp_requests SET verified = true
     WHERE id = (
       SELECT id FROM otp_requests
       WHERE mobile = $1 AND otp_code = $2 AND purpose = $3
         AND verified = false AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id`,
    [normalized, hashOtpCode(otpCode), purpose]
  );
  return result.rows.length > 0;
}

module.exports = { createAndSendOtp, verifyOtp, isEmail, sendSms, sendEmailWithAttachment };
