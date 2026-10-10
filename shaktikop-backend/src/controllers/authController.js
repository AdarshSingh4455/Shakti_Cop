const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { signToken } = require('../utils/jwt');
const { createRefreshToken, verifyAndRotateRefreshToken, revokeRefreshToken, revokeAllForUser, listActiveSessions, revokeSessionById } = require('../utils/refreshToken');
const { checkOtpAttempts, recordOtpFailure, clearOtpAttempts } = require('../utils/otpAttempts');
const { createAndSendOtp, verifyOtp, isEmail, OtpDeliveryError } = require('../utils/otp');
const { logActivity, maskIdentity } = require('../utils/activityLog');


const { isBlockedDemoPassword, DEMO_PASSWORD_ERROR, validateNewPassword } = require('../utils/passwordPolicy');
const { timingSafeVerify } = require('../utils/timingSafeAuth');
const { validateName, validateTextLength } = require('../utils/fieldValidators');

// ============================================================
// नागरिक — साइनअप (मोबाइल OTP सत्यापन के साथ)
// ============================================================

// POST /auth/citizen/signup/request-otp   body: { mobile }
async function signupRequestOtp(req, res) {
  const { mobile, email, locale } = req.body;
  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({ error: 'कृपया मान्य 10 अंकों का मोबाइल नंबर दें' });
  }
  const existing = await db.query('SELECT id FROM citizens WHERE mobile = $1', [mobile]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'इस मोबाइल नंबर से खाता पहले से मौजूद है, कृपया लॉगिन करें' });
  }

  // 🆕 ईमेल वैकल्पिक है — भरा हो तो OTP मोबाइल के साथ-साथ वहाँ भी जाता है।
  // इससे SMS न पहुँचने पर भी (नेटवर्क, DLT-रुकावट, या नंबर किसी और के कब्ज़े में
  // होना — घरेलू-हिंसा में आम) नागरिक खाता बना पाती है।
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  if (cleanEmail) {
    if (!isEmail(cleanEmail)) {
      return res.status(400).json({ error: 'ईमेल आईडी सही नहीं लगती' });
    }
    const emailTaken = await db.query(
      'SELECT id FROM citizens WHERE LOWER(TRIM(email)) = $1 AND is_active = true',
      [cleanEmail]
    );
    if (emailTaken.rows.length > 0) {
      return res.status(409).json({ error: 'इस ईमेल से खाता पहले से मौजूद है, कृपया लॉगिन करें' });
    }
  }

  try {
    const devOtp = await createAndSendOtp(mobile, 'signup', locale, cleanEmail);
    res.json({ message: 'OTP भेज दिया गया है', ...(devOtp ? { devOtp } : {}) });
  } catch (err) {
    if (err.name === 'OtpDeliveryError') {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    throw err;
  }
}

// ============================================================
// MSG91 Widget Access Token स्वतंत्र सत्यापन (Server-Side)
// ============================================================
async function verifyMsg91AccessToken(accessToken, expectedIdentifier) {
  if (!accessToken || typeof accessToken !== 'string' || accessToken.trim().length < 10) {
    return { valid: false, error: 'अमान्य सत्यापन टोकन' };
  }
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) {
    console.error('MSG91_AUTH_KEY सर्वर पर सेट नहीं है; access token सत्यापित नहीं किया जा सकता।');
    return { valid: false, error: 'सत्यापन सेवा सर्वर पर कॉन्फ़िगर नहीं है' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify({ 'access-token': accessToken.trim() }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const data = await res.json();

    // MSG91 returns { type: 'success', message: '919876543210' } or { type: 'error', message: '...', code: 201 }
    if (!data || data.type !== 'success' || !data.message) {
      return { valid: false, error: 'OTP सत्यापन टोकन अमान्य या समाप्त हो चुका है' };
    }

    // Verify identifier binding (phone number or email)
    if (expectedIdentifier) {
      const isExpectedEmail = String(expectedIdentifier).includes('@');
      if (isExpectedEmail) {
        if (String(data.message).trim().toLowerCase() !== String(expectedIdentifier).trim().toLowerCase()) {
          console.warn('MSG91 verified email does not match expected identifier');
          return { valid: false, error: 'सत्यापित ईमेल आईडी मेल नहीं खाती' };
        }
      } else {
        const verifiedDigits = String(data.message).replace(/\D/g, '');
        const expectedDigits = String(expectedIdentifier).replace(/\D/g, '');
        const verified10 = verifiedDigits.length >= 10 ? verifiedDigits.slice(-10) : verifiedDigits;
        const expected10 = expectedDigits.length >= 10 ? expectedDigits.slice(-10) : expectedDigits;

        if (verified10 !== expected10) {
          console.warn('MSG91 verified number does not match expected identifier');
          return { valid: false, error: 'सत्यापित मोबाइल नंबर मेल नहीं खाता' };
        }
      }
    }

    return { valid: true, verifiedIdentifier: data.message };
  } catch (err) {
    console.warn('MSG91 verifyAccessToken error:', err?.message);
    return { valid: false, error: 'सत्यापन सेवा से संपर्क करने में असमर्थ' };
  }
}

// POST /auth/citizen/signup/verify   body: { mobile, otp, name, fatherName, address, password, email, msg91AccessToken }
async function signupVerify(req, res) {
  const { mobile, otp, name, fatherName, address, password, email, msg91AccessToken } = req.body;
  if (!mobile || (!otp && !msg91AccessToken) || !name || !password) {
    return res.status(400).json({ error: 'नाम, मोबाइल, OTP और पासवर्ड आवश्यक हैं' });
  }
  // 🐛 बग फ़िक्स: signup में नाम/पिता-का-नाम/पता पर कोई जांच ही नहीं थी, जबकि वही
  // नागरिक बाद में प्रोफ़ाइल बदलते समय (updateMyProfile) पूरी जांच से गुज़रता है।
  // यानी खाता तो किसी भी लंबाई/रूप के नाम-पते से बन जाता, पर बाद में उसे सुधारना
  // ही मुश्किल हो जाता — और यह रास्ता बहुत बड़े input के लिए खुला रह जाता था।
  // अब वही नियम यहां भी, जो updateMyProfile में पहले से हैं।
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  if (fatherName) {
    const fatherErr = validateName(fatherName);
    if (fatherErr) return res.status(400).json({ error: fatherErr });
  }
  const addrErr = validateTextLength(address, { max: 300, label: 'पता' });
  if (addrErr) return res.status(400).json({ error: addrErr });

  // 🆕 वैकल्पिक ईमेल — OTP माँगते समय जो दिया था, वही यहाँ भी आता है। दोबारा जाँचते
  // हैं क्योंकि यह अलग अनुरोध है और बीच में बदला जा सकता है।
  const cleanSignupEmail = email ? String(email).trim().toLowerCase() : null;
  if (cleanSignupEmail && !isEmail(cleanSignupEmail)) {
    return res.status(400).json({ error: 'ईमेल आईडी सही नहीं लगती' });
  }
  const pwErr_signup = validateNewPassword(password);
  if (pwErr_signup) {
    return res.status(400).json({ error: pwErr_signup });
  }
  // 🔒 OTP सत्यापन की अतिरिक्त सुरक्षा — पहचान+purpose के हिसाब से असफल कोशिशों की
  // गिनती, बढ़ता हुआ backoff, और बार-बार असफलता पर audit-चेतावनी (देखें utils/otpAttempts.js)
  const gate_signup = await checkOtpAttempts(req, 'signup');
  if (!gate_signup.ok) {
    res.set('Retry-After', String(gate_signup.retryAfterSec));
    return res.status(429).json({ error: gate_signup.error });
  }

  if (msg91AccessToken) {
    const vResult = await verifyMsg91AccessToken(msg91AccessToken, mobile);
    if (!vResult.valid) {
      await recordOtpFailure(req, 'signup');
      return res.status(401).json({ error: vResult.error || 'OTP सत्यापन असफल रहा' });
    }
  } else {
    if (!otp) {
      return res.status(400).json({ error: 'OTP आवश्यक है' });
    }
    const isValid = await verifyOtp(mobile, otp, 'signup');
    if (!isValid) {
      await recordOtpFailure(req, 'signup');
      return res.status(401).json({ error: 'OTP गलत है या समय समाप्त हो गया' });
    }
  }
  await clearOtpAttempts(req, 'signup'); // सफल — असली उपयोगकर्ता के नाम पुरानी असफलताएँ न टिकें

  const pwErr = validateNewPassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  const passwordHash = await bcrypt.hash(password, 12);
  let citizen;
  try {
    const result = await db.query(
      `INSERT INTO citizens (name, father_name, address, mobile, email, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, fatherName || null, address || null, mobile, cleanSignupEmail, passwordHash]
    );
    citizen = result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'इस मोबाइल नंबर से खाता पहले से मौजूद है' });
    }
    throw err;
  }

  const token = signToken({ id: citizen.id, role: 'citizen', name: citizen.name, mobile: citizen.mobile });
  const refreshToken = await createRefreshToken(citizen.id, 'citizen', req.body.deviceName);
  logActivity({ actorRole: 'citizen', actorId: citizen.id, actorName: citizen.name, action: 'signup', details: 'नया खाता बना और लॉगिन हुआ', req });
  res.status(201).json({ token, refreshToken, user: toCitizenUser(citizen) });
}

// ============================================================
// नागरिक — लॉगिन
// ============================================================

// POST /auth/citizen/login   body: { mobile, password }
async function citizenLogin(req, res) {
  const { mobile, password } = req.body;
  if (!mobile || !password) {
    return res.status(400).json({ error: 'मोबाइल नंबर और पासवर्ड आवश्यक हैं' });
  }
  const result = await db.query('SELECT * FROM citizens WHERE mobile = $1 AND is_active = true', [mobile]);
  const citizen = result.rows[0];
  if (isBlockedDemoPassword(password, mobile)) return res.status(403).json(DEMO_PASSWORD_ERROR);
  // 🐛 बग फ़िक्स (टाइमिंग-साइड-चैनल): पहले "!citizen ||" से पूरा bcrypt.compare()
  // ही छूट जाता था जब खाता न मिले — इससे जवाब आने के समय से कोई भी (बिना पासवर्ड
  // जाने) पता लगा सकता था कि कोई मोबाइल नंबर रजिस्टर्ड है या नहीं (टेस्ट से पुष्टि:
  // ~350ms बनाम ~0ms का फ़र्क़)। अब timingSafeVerify हमेशा एक जैसी गणना करता है,
  // चाहे खाता मिले या न मिले — इसलिए यहां खाता-मौजूदगी अलग से शॉर्ट-सर्किट नहीं
  // करते, वरना वही समस्या दोबारा आ जाती।
  if (!(await timingSafeVerify(password, citizen?.password_hash))) {
    // 🆕 पहले सिर्फ़ सफल लॉगिन लॉग होती थी — brute-force/credential-stuffing के
    // सबूत के लिए विफल कोशिशें कभी दर्ज ही नहीं होती थीं। पासवर्ड कभी लॉग नहीं होता,
    // सिर्फ़ यह कि किस मोबाइल नंबर पर कोशिश हुई।
    logActivity({ actorRole: 'citizen', actorId: citizen?.id || null, actorName: maskIdentity(mobile), action: 'login_failed', details: 'ग़लत पासवर्ड (नागरिक)', req });
    return res.status(401).json({ error: 'मोबाइल नंबर या पासवर्ड गलत है' });
  }
  const token = signToken({ id: citizen.id, role: 'citizen', name: citizen.name, mobile: citizen.mobile });
  const refreshToken = await createRefreshToken(citizen.id, 'citizen', req.body.deviceName);
  logActivity({ actorRole: 'citizen', actorId: citizen.id, actorName: citizen.name, action: 'login', details: 'पासवर्ड से लॉगिन', req });
  res.json({ token, refreshToken, user: toCitizenUser(citizen) });
}

// ============================================================
// नागरिक — पासवर्ड भूल गए
// ============================================================

// POST /auth/citizen/forgot-password/request-otp   body: { mobile }
// 🔒 सुरक्षा फ़िक्स: पहले यह बता देता था कि दिया गया मोबाइल नंबर रजिस्टर्ड है या नहीं
// (404 बनाम सफलता) — यह "account enumeration" है, और इस ऐप के संदर्भ में ख़ासतौर पर
// संवेदनशील है: कोई पीड़िता के मोबाइल नंबर से यह जांच सकता था कि उसने ShaktiCop पर
// खाता बनाया है या नहीं (यानी शिकायत दर्ज करने की कोशिश की या नहीं)। अब जवाब हमेशा
// एक जैसा (सामान्य) रहता है, चाहे खाता मौजूद हो या न हो — OTP सिर्फ़ तभी असल में
// भेजा जाता है जब खाता मौजूद हो।
async function forgotPasswordRequestOtp(req, res) {
  const { mobile, locale } = req.body;
  // 🆕 बाक़ी सभी OTP-request functions मोबाइल का फ़ॉर्मेट जांचते हैं, यहां छूट गया
  // था — असली exploit यहां संभव नहीं था (DB lookup exact-match है, इसलिए malicious
  // payload वाला मान कभी किसी असली नागरिक से मेल नहीं खाता और createAndSendOtp तक
  // पहुंचता ही नहीं), पर बाक़ी जगहों जैसी संगति और भविष्य-सुरक्षा के लिए जोड़ा।
  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({ error: 'कृपया मान्य 10 अंकों का मोबाइल नंबर दें' });
  }
  // 🆕 email भी लाते हैं — जिस नागरिक ने साइनअप के समय ईमेल दिया था, उसे OTP दोनों
  // जगह (मोबाइल व ईमेल) मिलेगा। पासवर्ड भूलने पर यही सबसे ज़्यादा काम आता है, क्योंकि
  // अक्सर वजह यही होती है कि SMS नहीं पहुँच रहा।
  const existing = await db.query('SELECT id, email FROM citizens WHERE mobile = $1', [mobile]);
  // ⚠️ devOtp सिर्फ़ ALLOW_INSECURE_DEV_LOGIN/OTP_DEV_MODE में लौटता है (createAndSendOtp में तय),
  // इसलिए dev/test में सुविधा बनी रहती है, पर production में जवाब हमेशा एक जैसा दिखता है।
  try {
    const devOtp = existing.rows.length > 0
      ? await createAndSendOtp(mobile, 'reset_password', locale, existing.rows[0].email)
      : undefined;
    res.json({ message: 'खाता मौजूद होने पर OTP भेज दिया गया है', ...(devOtp ? { devOtp } : {}) });
  } catch (err) {
    if (err.name === 'OtpDeliveryError') {
      return res.status(err.status || 503).json({ error: err.message, code: err.code });
    }
    throw err;
  }
}

// POST /auth/citizen/forgot-password/reset   body: { mobile, otp, newPassword }
async function forgotPasswordReset(req, res) {
  const { mobile, otp, newPassword } = req.body;
  const pwErr_reset = validateNewPassword(newPassword);
  if (pwErr_reset) {
    return res.status(400).json({ error: pwErr_reset });
  }
  // 🔒 OTP सत्यापन की अतिरिक्त सुरक्षा — पहचान+purpose के हिसाब से असफल कोशिशों की
  // गिनती, बढ़ता हुआ backoff, और बार-बार असफलता पर audit-चेतावनी (देखें utils/otpAttempts.js)
  const gate_reset_password = await checkOtpAttempts(req, 'reset_password');
  if (!gate_reset_password.ok) {
    res.set('Retry-After', String(gate_reset_password.retryAfterSec));
    return res.status(429).json({ error: gate_reset_password.error });
  }
  const isValid = await verifyOtp(mobile, otp, 'reset_password');
  if (!isValid) {
    await recordOtpFailure(req, 'reset_password');
    return res.status(401).json({ error: 'OTP गलत है या समय समाप्त हो गया' });
  }
  await clearOtpAttempts(req, 'reset_password'); // सफल — असली उपयोगकर्ता के नाम पुरानी असफलताएँ न टिकें
  const pwErr2 = validateNewPassword(newPassword);
  if (pwErr2) return res.status(400).json({ error: pwErr2 });
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updated = await db.query(
    'UPDATE citizens SET password_hash = $1 WHERE mobile = $2 RETURNING id',
    [passwordHash, mobile]
  );
  // 🔒 सुरक्षा फ़िक्स: पासवर्ड बदलने पर पुराने सत्र (refresh tokens) रद्द नहीं होते थे।
  // यह "पासवर्ड भूल गए" वाला रास्ता है — इसे अक्सर तभी इस्तेमाल किया जाता है जब शक़ हो
  // कि किसी और के पास पहुँच है (फ़ोन खो गया, कोई पीछा कर रहा है)। पर पासवर्ड बदलने के
  // बाद भी उस पुराने डिवाइस का refresh token 30 दिन तक चलता रहता — यानी हमलावर की
  // पहुँच बनी रहती, और महिला को लगता कि उसने पहुँच काट दी। यह ग़लत भरोसा असल में
  // बिना पासवर्ड बदले रहने से भी ज़्यादा ख़तरनाक है।
  if (updated.rows[0]) {
    await revokeAllForUser(updated.rows[0].id, 'citizen');
  }
  res.json({ message: 'पासवर्ड सफलतापूर्वक बदल दिया गया है, अब लॉगिन करें' });
}

function toCitizenUser(c) {
  return {
    id: c.id,
    name: c.name,
    fatherName: c.father_name,
    address: c.address,
    mobile: c.mobile,
    email: c.email,
    emergencyContacts: c.emergency_contacts || [],
    photoUrl: c.photo_url,
    district: c.district,
    policeStation: c.police_station,
    role: 'citizen',
  };
}

// ============================================================
// अधिकारी / एडमिन — पहले जैसा ही (password लॉगिन admin के लिए बना रहता है)
// ============================================================

// POST /auth/officer/request-otp   body: { mobile }
// अधिकारी का मोबाइल नंबर पहले से एडमिन द्वारा जोड़ा होना चाहिए (Officer Management से)।
async function officerRequestOtp(req, res) {
  const { mobile, locale } = req.body;
  if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
    return res.status(400).json({ error: 'कृपया मान्य 10 अंकों का मोबाइल नंबर दें' });
  }
  const inactiveOfficer = await db.query('SELECT id, name FROM officers WHERE mobile = $1 AND is_active = false', [mobile]);
  if (inactiveOfficer.rows.length > 0) {
    logActivity({ actorRole: 'system', actorId: inactiveOfficer.rows[0].id, actorName: inactiveOfficer.rows[0].name, action: 'inactive_officer_otp_denied', details: `निष्क्रिय अधिकारी खाते से OTP अनुरोध रोका गया (${mobile})`, req });
    return res.status(403).json({ error: 'यह खाता निष्क्रिय कर दिया गया है — कृपया व्यवस्थापक से संपर्क करें' });
  }

  const result = await db.query('SELECT id FROM officers WHERE mobile = $1 AND is_active = true', [mobile]);
  if (result.rows.length > 0) {
    try {
      const devOtp = await createAndSendOtp(mobile, 'officer_login', locale);
      return res.json({ message: 'खाता मौजूद होने पर OTP भेज दिया गया है', ...(devOtp ? { devOtp } : {}) });
    } catch (err) {
      if (err.name === 'OtpDeliveryError') {
        return res.status(err.status || 503).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  }
  return res.json({ message: 'खाता मौजूद होने पर OTP भेज दिया गया है' });
}

// POST /auth/officer/verify-otp   body: { mobile, otp }
async function officerVerifyOtp(req, res) {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) {
    return res.status(400).json({ error: 'मोबाइल नंबर और OTP दोनों आवश्यक हैं' });
  }
  // 🔒 OTP सत्यापन की अतिरिक्त सुरक्षा — पहचान+purpose के हिसाब से असफल कोशिशों की
  // गिनती, बढ़ता हुआ backoff, और बार-बार असफलता पर audit-चेतावनी (देखें utils/otpAttempts.js)
  const gate_officer_login = await checkOtpAttempts(req, 'officer_login');
  if (!gate_officer_login.ok) {
    res.set('Retry-After', String(gate_officer_login.retryAfterSec));
    return res.status(429).json({ error: gate_officer_login.error });
  }
  const isValid = await verifyOtp(mobile, otp, 'officer_login');
  if (!isValid) {
    await recordOtpFailure(req, 'officer_login');
    return res.status(401).json({ error: 'OTP गलत है या समय समाप्त हो गया' });
  }
  await clearOtpAttempts(req, 'officer_login'); // सफल — असली उपयोगकर्ता के नाम पुरानी असफलताएँ न टिकें
  const result = await db.query('SELECT * FROM officers WHERE mobile = $1 AND is_active = true', [mobile]);
  const officer = result.rows[0];
  if (!officer) return res.status(404).json({ error: 'अधिकारी खाता नहीं मिला' });

  const token = signToken({ id: officer.id, role: 'officer', name: officer.name, badgeId: officer.badge_id, rank: officer.rank, district: officer.district, station: officer.station });
  const refreshToken = await createRefreshToken(officer.id, 'officer', req.body.deviceName);
  logActivity({ actorRole: 'officer', actorId: officer.id, actorName: officer.name, action: 'login', details: 'OTP से लॉगिन (officer/verify-otp)', req });
  res.json({
    token,
    refreshToken,
    user: {
      id: officer.id,
      name: officer.name,
      badgeId: officer.badge_id,
      mobile: officer.mobile,
      station: officer.station,
      district: officer.district,
      dutyStatus: officer.duty_status,
      permissions: officer.permissions,
      rank: officer.rank,
      designation: officer.designation,
      notificationPreferences: officer.notification_preferences,
      photoUrl: officer.photo_url,
      role: 'officer',
    },
  });
}

// ============================================================
// स्टाफ़ — एकीकृत लॉगिन (अधिकारी + एडमिन एक ही फ़ॉर्म से, मोबाइल या ईमेल + OTP)
// ============================================================

// POST /auth/staff/request-otp   body: { identifier }  (मोबाइल नंबर या ईमेल)
async function staffRequestOtp(req, res) {
  const { identifier, locale } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'मोबाइल नंबर या ईमेल दर्ज करें' });
  }
  const valid = isEmail(identifier) || /^[0-9]{10}$/.test(identifier);
  if (!valid) {
    return res.status(400).json({ error: 'मान्य मोबाइल नंबर या ईमेल दर्ज करें' });
  }

  const field = isEmail(identifier) ? 'email' : 'mobile';

  // 🔒 सुरक्षा: निष्क्रिय स्टाफ़/Admin खाते OTP अनुरोध नहीं कर सकते
  const inactiveCheck = await db.query(
    `SELECT 'officer' AS role, id, name FROM officers WHERE LOWER(TRIM(${field})) = LOWER(TRIM($1)) AND is_active = false
     UNION
     SELECT 'admin' AS role, id, name FROM admins WHERE LOWER(TRIM(${field})) = LOWER(TRIM($1)) AND is_active = false`,
    [identifier]
  );
  if (inactiveCheck.rows.length > 0) {
    logActivity({
      actorRole: 'system',
      actorId: inactiveCheck.rows[0].id,
      actorName: inactiveCheck.rows[0].name,
      action: 'inactive_staff_otp_denied',
      details: `निष्क्रिय स्टाफ़ खाते से OTP अनुरोध रोका गया (${identifier})`,
      req,
    });
    return res.status(403).json({ error: 'यह खाता निष्क्रिय कर दिया गया है — कृपया व्यवस्थापक से संपर्क करें' });
  }

  const officerCheck = await db.query(`SELECT id FROM officers WHERE LOWER(TRIM(${field})) = LOWER(TRIM($1)) AND is_active = true`, [identifier]);
  const adminCheck = await db.query(`SELECT id FROM admins WHERE LOWER(TRIM(${field})) = LOWER(TRIM($1)) AND is_active = true`, [identifier]);

  const exists = officerCheck.rows.length > 0 || adminCheck.rows.length > 0;
  if (exists) {
    try {
      const devOtp = await createAndSendOtp(identifier, 'staff_login', locale);
      return res.json({ message: 'खाता मौजूद होने पर OTP भेज दिया गया है', ...(devOtp ? { devOtp } : {}) });
    } catch (err) {
      if (err.name === 'OtpDeliveryError') {
        return res.status(err.status || 503).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  }
  return res.json({ message: 'खाता मौजूद होने पर OTP भेज दिया गया है' });
}

// POST /auth/staff/verify-otp   body: { identifier, otp, msg91AccessToken }
async function staffVerifyOtp(req, res) {
  const { identifier, otp, msg91AccessToken } = req.body;
  if (!identifier || (!otp && !msg91AccessToken)) {
    return res.status(400).json({ error: 'पहचान और OTP दोनों आवश्यक हैं' });
  }
  // 🔒 OTP सत्यापन की अतिरिक्त सुरक्षा — पहचान+purpose के हिसाब से असफल कोशिशों की
  // गिनती, बढ़ता हुआ backoff, और बार-बार असफलता पर audit-चेतावनी (देखें utils/otpAttempts.js)
  const gate_staff_login = await checkOtpAttempts(req, 'staff_login');
  if (!gate_staff_login.ok) {
    res.set('Retry-After', String(gate_staff_login.retryAfterSec));
    return res.status(429).json({ error: gate_staff_login.error });
  }

  if (msg91AccessToken) {
    const vResult = await verifyMsg91AccessToken(msg91AccessToken, identifier);
    if (!vResult.valid) {
      await recordOtpFailure(req, 'staff_login');
      return res.status(401).json({ error: vResult.error || 'OTP सत्यापन असफल रहा' });
    }
  } else {
    if (!otp) {
      return res.status(400).json({ error: 'OTP आवश्यक है' });
    }
    const isValid = await verifyOtp(identifier, otp, 'staff_login');
    if (!isValid) {
      await recordOtpFailure(req, 'staff_login');
      return res.status(401).json({ error: 'OTP गलत है या समय समाप्त हो गया' });
    }
  }
  await clearOtpAttempts(req, 'staff_login'); // सफल — असली उपयोगकर्ता के नाम पुरानी असफलताएँ न टिकें

  const field = isEmail(identifier) ? 'email' : 'mobile';

  const officerResult = await db.query(`SELECT * FROM officers WHERE LOWER(TRIM(${field})) = LOWER(TRIM($1)) AND is_active = true`, [identifier]);
  if (officerResult.rows.length > 0) {
    const officer = officerResult.rows[0];
    const token = signToken({ id: officer.id, role: 'officer', name: officer.name, badgeId: officer.badge_id, rank: officer.rank, district: officer.district, station: officer.station });
    const refreshToken = await createRefreshToken(officer.id, 'officer', req.body.deviceName);
    logActivity({ actorRole: 'officer', actorId: officer.id, actorName: officer.name, action: 'login', details: `Unified स्टाफ़ लॉगिन (${field})`, req });
    return res.json({
      token,
      refreshToken,
      user: {
        id: officer.id,
        name: officer.name,
        badgeId: officer.badge_id,
        mobile: officer.mobile,
        email: officer.email,
        station: officer.station,
        district: officer.district,
        dutyStatus: officer.duty_status,
        permissions: officer.permissions,
        rank: officer.rank,
        designation: officer.designation,
        notificationPreferences: officer.notification_preferences,
        photoUrl: officer.photo_url,
        role: 'officer',
      },
    });
  }

  const adminResult = await db.query(`SELECT * FROM admins WHERE LOWER(TRIM(${field})) = LOWER(TRIM($1)) AND is_active = true`, [identifier]);
  if (adminResult.rows.length > 0) {
    const admin = adminResult.rows[0];
    const token = signToken({ id: admin.id, role: 'admin', name: admin.name, adminRole: admin.admin_role, district: admin.district, rank: admin.rank, circleStations: admin.circle_stations, rangeDistricts: admin.range_districts });
    const refreshToken = await createRefreshToken(admin.id, 'admin', req.body.deviceName);
    logActivity({ actorRole: 'admin', actorId: admin.id, actorName: admin.name, action: 'login', details: `Unified स्टाफ़ लॉगिन (${field})`, req });
    return res.json({
      token,
      refreshToken,
      user: { id: admin.id, name: admin.name, username: admin.username, mobile: admin.mobile, email: admin.email, adminRole: admin.admin_role, district: admin.district, rank: admin.rank, circleStations: admin.circle_stations, rangeDistricts: admin.range_districts, menuPermissions: admin.menu_permissions, photoUrl: admin.photo_url, role: 'admin' },
    });
  }

  res.status(404).json({ error: 'स्टाफ़ खाता नहीं मिला' });
}

// POST /auth/officer/login   body: { badgeId, username, password }   (password-आधारित लॉगिन)
async function officerLogin(req, res) {
  const identifier = (req.body.username || req.body.badgeId || req.body.identifier || '').trim();
  const { password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'यूज़रनेम / पुलिस आईडी और पासवर्ड आवश्यक हैं' });
  }
  const result = await db.query('SELECT * FROM officers WHERE LOWER(TRIM(badge_id)) = LOWER(TRIM($1)) AND is_active = true', [identifier]);
  const officer = result.rows[0];
  if (isBlockedDemoPassword(password, identifier)) return res.status(403).json(DEMO_PASSWORD_ERROR);
  if (!(await timingSafeVerify(password, officer?.password_hash))) {
    logActivity({ actorRole: 'officer', actorId: officer?.id || null, actorName: identifier, action: 'login_failed', details: 'ग़लत पासवर्ड (अधिकारी badge)', req });
    return res.status(401).json({ error: 'यूज़रनेम / पुलिस आईडी या पासवर्ड गलत है' });
  }
  const token = signToken({ id: officer.id, role: 'officer', name: officer.name, badgeId: officer.badge_id, username: officer.badge_id, rank: officer.rank, district: officer.district, station: officer.station });
  const refreshToken = await createRefreshToken(officer.id, 'officer', req.body.deviceName);
  logActivity({ actorRole: 'officer', actorId: officer.id, actorName: officer.name, action: 'login', details: 'पासवर्ड से लॉगिन (badge)', req });
  res.json({
    token,
    refreshToken,
    user: { id: officer.id, name: officer.name, badgeId: officer.badge_id, username: officer.badge_id, station: officer.station, district: officer.district, rank: officer.rank, designation: officer.designation, notificationPreferences: officer.notification_preferences, photoUrl: officer.photo_url, role: 'officer' },
  });
}

// POST /auth/admin/login   body: { username/email, password }
async function adminLogin(req, res) {
  const identifier = (req.body.username || req.body.email || req.body.identifier || '').trim();
  const { password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'यूज़रनेम / ईमेल और पासवर्ड आवश्यक हैं' });
  }
  const result = await db.query(
    'SELECT * FROM admins WHERE (LOWER(TRIM(username)) = LOWER(TRIM($1)) OR LOWER(TRIM(email)) = LOWER(TRIM($1))) AND is_active = true',
    [identifier]
  );
  const admin = result.rows[0];
  if (isBlockedDemoPassword(password, identifier)) return res.status(403).json(DEMO_PASSWORD_ERROR);
  if (!(await timingSafeVerify(password, admin?.password_hash))) {
    logActivity({ actorRole: 'admin', actorId: admin?.id || null, actorName: identifier, action: 'login_failed', details: 'ग़लत पासवर्ड (एडमिन)', req });
    return res.status(401).json({ error: 'यूज़रनेम / ईमेल या पासवर्ड गलत है' });
  }
  const token = signToken({ id: admin.id, role: 'admin', name: admin.name, adminRole: admin.admin_role, district: admin.district, rank: admin.rank, circleStations: admin.circle_stations, rangeDistricts: admin.range_districts });
  const refreshToken = await createRefreshToken(admin.id, 'admin', req.body.deviceName);
  logActivity({ actorRole: 'admin', actorId: admin.id, actorName: admin.name, action: 'login', details: 'यूज़रनेम/पासवर्ड से लॉगिन', req });
  res.json({
    token,
    refreshToken,
    user: {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      email: admin.email,
      mobile: admin.mobile,
      adminRole: admin.admin_role,
      district: admin.district,
      rank: admin.rank,
      circleStations: admin.circle_stations,
      rangeDistricts: admin.range_districts,
      menuPermissions: admin.menu_permissions,
      photoUrl: admin.photo_url,
      role: 'admin',
    },
  });
}

// ============================================================
// 🆕 Refresh Token — नया access token लेना, दोबारा पासवर्ड/OTP डाले बिना
// ============================================================

// किसी भी role के लिए, ताज़ा DB डेटा से JWT payload फिर से बनाता है — बिल्कुल
// वैसा ही जैसा उस role का login endpoint बनाता है (ऊपर देखें)। is_active भी
// यहीं जांचा जाता है — निष्क्रिय खाता refresh नहीं कर पाएगा, भले ही उसका पुराना
// refresh token अभी वैध ही क्यों न हो।
async function buildFreshTokenPayload(userId, role) {
  if (role === 'citizen') {
    const r = await db.query('SELECT * FROM citizens WHERE id = $1 AND is_active = true', [userId]);
    if (!r.rows[0]) return null;
    const c = r.rows[0];
    return { payload: { id: c.id, role: 'citizen', name: c.name, mobile: c.mobile }, user: toCitizenUser(c) };
  }
  if (role === 'officer') {
    const r = await db.query('SELECT * FROM officers WHERE id = $1 AND is_active = true', [userId]);
    if (!r.rows[0]) return null;
    const o = r.rows[0];
    return {
      payload: { id: o.id, role: 'officer', name: o.name, badgeId: o.badge_id, rank: o.rank, district: o.district, station: o.station },
      user: { id: o.id, name: o.name, badgeId: o.badge_id, username: o.badge_id, mobile: o.mobile, email: o.email, station: o.station, district: o.district, dutyStatus: o.duty_status, permissions: o.permissions, rank: o.rank, designation: o.designation, notificationPreferences: o.notification_preferences, photoUrl: o.photo_url, role: 'officer' },
    };
  }
  if (role === 'admin') {
    const r = await db.query('SELECT * FROM admins WHERE id = $1 AND is_active = true', [userId]);
    if (!r.rows[0]) return null;
    const a = r.rows[0];
    return {
      payload: { id: a.id, role: 'admin', name: a.name, adminRole: a.admin_role, district: a.district, rank: a.rank, circleStations: a.circle_stations, rangeDistricts: a.range_districts },
      user: { id: a.id, name: a.name, username: a.username, mobile: a.mobile, email: a.email, adminRole: a.admin_role, district: a.district, rank: a.rank, circleStations: a.circle_stations, rangeDistricts: a.range_districts, menuPermissions: a.menu_permissions, photoUrl: a.photo_url, role: 'admin' },
    };
  }
  if (role === 'counsellor') {
    const r = await db.query('SELECT * FROM service_providers WHERE id = $1 AND is_active = true', [userId]);
    if (!r.rows[0]) return null;
    const p = r.rows[0];
    return {
      payload: { id: p.id, role: 'counsellor', name: p.name },
      user: { id: p.id, name: p.name, mobile: p.mobile, email: p.email, serviceType: p.service_type, district: p.district, policeStation: p.police_station, photoUrl: p.photo_url, role: 'counsellor' },
    };
  }
  return null;
}

// POST /auth/refresh   body: { refreshToken }   — auth की ज़रूरत नहीं (यही तो auth वापस देता है)
async function refreshAccessToken(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken आवश्यक है' });
  }
  const result = await verifyAndRotateRefreshToken(refreshToken);
  if (!result) {
    return res.status(401).json({ error: 'सत्र समाप्त हो गया है, कृपया दोबारा लॉगिन करें' });
  }
  const fresh = await buildFreshTokenPayload(result.userId, result.role);
  if (!fresh) {
    // खाता अब मौजूद नहीं/निष्क्रिय कर दिया गया — नया refresh token भी बेकार कर दें
    return res.status(401).json({ error: 'खाता नहीं मिला या निष्क्रिय है' });
  }
  const token = signToken(fresh.payload);
  res.json({ token, refreshToken: result.newRefreshToken, user: fresh.user });
}

// POST /auth/logout   body: { refreshToken }   — इस डिवाइस का refresh token हमेशा के लिए बेकार कर देता है
async function logout(req, res) {
  const { refreshToken } = req.body;
  await revokeRefreshToken(refreshToken);
  res.json({ message: 'लॉगआउट हो गया' });
}

// 🆕 POST /auth/logout-all   (लॉगिन ज़रूरी — किसी और के सत्र न बिगड़ें, इसलिए
// यह पता होना ज़रूरी है कि असल में कौन कॉल कर रहा है)
// फ़ोन चोरी/खोने या खाता compromise होने के शक़ पर — सभी डिवाइस से एक साथ लॉगआउट
async function logoutAll(req, res) {
  await revokeAllForUser(req.user.id, req.user.role);
  res.json({ message: 'सभी डिवाइस से लॉगआउट हो गया' });
}

// 🆕 GET /auth/sessions — "किन-किन डिवाइस में लॉगिन है", लॉगिन ज़रूरी
async function listSessions(req, res) {
  const sessions = await listActiveSessions(req.user.id, req.user.role);
  res.json(
    sessions.map((s) => ({
      id: s.id,
      deviceName: s.device_name || 'अज्ञात डिवाइस',
      createdAt: s.created_at,
      lastUsedAt: s.last_used_at,
    }))
  );
}

// 🆕 DELETE /auth/sessions/:id — सिर्फ़ एक चुना हुआ डिवाइस लॉगआउट (सभी नहीं)
async function revokeSession(req, res) {
  const { id } = req.params;
  const ok = await revokeSessionById(id, req.user.id, req.user.role);
  if (!ok) return res.status(404).json({ error: 'यह सत्र नहीं मिला या पहले ही समाप्त हो चुका है' });
  res.json({ message: 'उस डिवाइस से लॉगआउट कर दिया गया' });
}

module.exports = {
  signupRequestOtp,
  signupVerify,
  citizenLogin,
  forgotPasswordRequestOtp,
  forgotPasswordReset,
  officerRequestOtp,
  officerVerifyOtp,
  staffRequestOtp,
  staffVerifyOtp,
  officerLogin,
  adminLogin,
  refreshAccessToken,
  logout,
  logoutAll,
  listSessions,
  revokeSession,
  verifyMsg91AccessToken,
};
