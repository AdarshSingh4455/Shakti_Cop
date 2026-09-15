const { verifyToken } = require('../utils/jwt');
const db = require('../config/db');

// 🔒 सुरक्षा सुधार (गंभीर): पहले requireAuth सिर्फ़ JWT का signature/expiry जांचता था —
// डेटाबेस में दोबारा यह नहीं देखता था कि खाता अभी भी सक्रिय (is_active) है या नहीं।
// नतीजा: कोई अधिकारी/एडमिन "निष्क्रिय" (deactivate) कर दिया जाए (जैसे नौकरी से हटाया
// गया, या किसी compromised खाते को रोकने के लिए), तो भी उसका पुराना token JWT_EXPIRES_IN
// (डिफ़ॉल्ट 7 दिन) तक पूरी तरह काम करता रहता — deactivate करने का असल में कोई तुरंत असर
// नहीं होता था। अब हर authenticated request पर हल्का सा DB चेक होता है। खाता हटा दिया
// गया हो (row ही न मिले) तो भी उसे निष्क्रिय माना जाता है — यानी hard-delete किए गए
// खाते का पुराना token भी अब तुरंत बेकार हो जाता है।
const ACTIVE_TABLE_BY_ROLE = { citizen: 'citizens', officer: 'officers', admin: 'admins', counsellor: 'service_providers' };
async function isAccountActive(user) {
  const table = ACTIVE_TABLE_BY_ROLE[user.role];
  if (!table) return false;
  const result = await db.query(`SELECT is_active FROM ${table} WHERE id = $1`, [user.id]);
  return result.rows.length > 0 && result.rows[0].is_active === true;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'लॉगिन आवश्यक है (टोकन नहीं मिला)' });
  }
  try {
    req.user = verifyToken(token); // { id, role, name, mobile?, adminRole?, district?, rank?, circleStations? }
    // Granular RBAC — भूमिका के हिसाब से डेटा सीमित होता है:
    //   SHO (officer) → अपने थाने तक (नीचे listComplaints में हैंडल होता है, station JWT में है)
    //   DSP/ASP/SSP (monitor) → अगर Super Admin ने specific थाने चुने हों (circleStations) तो
    //   सिर्फ़ उन्हीं तक — वरना पूरे ज़िले तक (district)
    //   SSP/super_admin → कोई सीमा नहीं (super_admin की कोई circleStations/district जांच ही नहीं होती)
    //
    // 🆕 पहले सिर्फ़ DSP को "चुने हुए थाने" (circleStations) से scope करने की सुविधा थी —
    // SP/SSP हमेशा पूरे ज़िले तक सीमित रहते, कोई विकल्प नहीं था। अब SP/SSP को भी वही
    // विकल्प मिलता है: अगर उनके लिए specific थाने चुने गए हों तो सिर्फ़ उन्हीं तक,
    // वरना (खाली सूची होने पर) पहले जैसा — पूरा ज़िला।
    // 🆕 IG/DIG — SSP से भी ऊपर, एक साथ कई ज़िलों ("Range/परिक्षेत्र") की निगरानी।
    // circleStations/district वाली जांचों से पहले रखा है क्योंकि यह सबसे ऊंचा
    // (सबसे व्यापक) scope-स्तर है, और DSP/ASP/SSP वाली जांच में यह भूमिका शामिल नहीं है।
    if (
      req.user.role === 'admin' &&
      req.user.adminRole === 'monitor' &&
      ['IG', 'DIG'].includes(req.user.rank) &&
      req.user.rangeDistricts &&
      req.user.rangeDistricts.length > 0
    ) {
      req.adminScope = { rangeDistricts: req.user.rangeDistricts };
    } else if (
      req.user.role === 'admin' &&
      req.user.adminRole === 'monitor' &&
      ['DSP', 'ASP', 'SSP'].includes(req.user.rank) &&
      req.user.circleStations &&
      req.user.circleStations.length > 0
    ) {
      // 🐛 बग फ़िक्स (गंभीर सुरक्षा): पहले यहां सिर्फ़ circleStations भेजा जाता था —
      // ज़िला नहीं। थानों के नाम सिर्फ़ (ज़िला+थाना) मिलाकर अद्वितीय होते हैं, और अब
      // पूरे 75 ज़िलों की सूची जुड़ने के बाद 65 ज़िलों में "कोतवाली" नाम का थाना मौजूद
      // है। नतीजा: जिस DSP के सर्किल में ऐसा आम नाम हो, उसे उन सभी ज़िलों की शिकायतें
      // दिखने लगतीं। खाता बनाते समय वाली जांच (adminController) नए खातों को बचाती है,
      // पर पहले से बने खाते तब भी असुरक्षित रहते — इसलिए यहां ज़िला भी साथ भेजते हैं।
      req.adminScope = { circleStations: req.user.circleStations, district: req.user.district };
    } else if (req.user.role === 'admin' && ['district_admin', 'monitor'].includes(req.user.adminRole) && req.user.district) {
      req.adminScope = { district: req.user.district };
    } else {
      req.adminScope = {};
    }

    isAccountActive(req.user)
      .then((active) => {
        if (!active) {
          return res.status(401).json({ error: 'आपका खाता निष्क्रिय कर दिया गया है — कृपया व्यवस्थापक से संपर्क करें' });
        }
        next();
      })
      .catch((err) => {
        // 🔒 सुरक्षा फ़िक्स (fail-open → fail-closed): पहले यहाँ जांच विफल होने पर
        // request को आगे जाने दिया जाता था, यह मानकर कि "DB डाउन है तो वैसे भी सब
        // रुक जाएगा"। यह तर्क पूरी तरह सही नहीं था:
        //   • app-settings जैसी चीज़ें in-memory cache से जवाब देती रहती हैं, यानी
        //     DB डाउन होने पर भी कुछ endpoints चलते हैं;
        //   • और यह त्रुटि अक्सर पूरा outage होती ही नहीं — pool भर जाना या क्षण भर
        //     का network glitch भी यहीं पहुँचता है। उस दौरान निष्क्रिय किया गया (या
        //     हटाया गया) खाता वैध मान लिया जाता।
        // पीड़िताओं का डेटा रखने वाले ऐप में, जो जांच पूरी न हो सके उसका नतीजा
        // "अनुमति दो" नहीं, "रोक दो" होना चाहिए।
        console.error('खाता-सक्रियता जांचने में त्रुटि:', err.message);
        return res.status(503).json({ error: 'सेवा अभी उपलब्ध नहीं है — कृपया कुछ देर बाद कोशिश करें' });
      });
  } catch (err) {
    return res.status(401).json({ error: 'सत्र समाप्त हो गया है, कृपया दोबारा लॉगिन करें' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'इस कार्य की अनुमति नहीं है' });
    }
    next();
  };
}

// सिर्फ़ super_admin के लिए (जैसे — नए एडमिन बनाना, दूसरे district-admins/monitors को manage करना)
function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'admin' || req.user?.adminRole !== 'super_admin') {
    return res.status(403).json({ error: 'यह कार्य सिर्फ़ Super Admin कर सकते हैं' });
  }
  next();
}

// DSP/ASP/SSP (monitor) को कोई भी लिखने/बदलने वाला कार्य नहीं करने देता — सिर्फ़ देखना (view) अनुमत है
function blockMonitor(req, res, next) {
  if (req.user?.role === 'admin' && req.user?.adminRole === 'monitor') {
    return res.status(403).json({ error: 'आपकी भूमिका (DSP/ASP/SSP/IG/DIG) सिर्फ़ निगरानी (monitor) के लिए है — बदलाव करने की अनुमति नहीं है' });
  }
  next();
}

// सिर्फ़ SHO रैंक के अधिकारी को अधिकारी नियुक्त करने की अनुमति देता है (SI को नहीं)
function requireSHO(req, res, next) {
  if (req.user?.role !== 'officer' || req.user?.rank !== 'SHO') {
    return res.status(403).json({ error: 'सिर्फ़ थाना प्रभारी (SHO) मामले नियुक्त कर सकते हैं' });
  }
  next();
}

// SHO को अपने थाने में नया SI (जांचकर्ता) बनाने की अनुमति
function requireSHOForCreation(req, res, next) {
  if (req.user?.role !== 'officer' || req.user?.rank !== 'SHO') {
    return res.status(403).json({ error: 'सिर्फ़ थाना प्रभारी (SHO) नए जांचकर्ता (SI) बना सकते हैं' });
  }
  next();
}

// DSP (या super_admin) को नया SHO बनाने की अनुमति — यह blockMonitor का सुनिश्चित अपवाद है
function requireDSPOrSuperAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'अनुमति नहीं है' });
  if (req.user.adminRole === 'super_admin') return next();
  if (req.user.adminRole === 'monitor' && req.user.rank === 'DSP') return next();
  return res.status(403).json({ error: 'सिर्फ़ DSP या Super Admin नए SHO बना सकते हैं' });
}

// SSP (या super_admin) को नया DSP/ASP बनाने की अनुमति
function requireSSPOrSuperAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'अनुमति नहीं है' });
  if (req.user.adminRole === 'super_admin') return next();
  if (req.user.adminRole === 'monitor' && req.user.rank === 'SSP') return next();
  return res.status(403).json({ error: 'सिर्फ़ SSP या Super Admin नए DSP/ASP बना सकते हैं' });
}

module.exports = { requireAuth, requireRole, requireSuperAdmin, blockMonitor, requireSHO, requireSHOForCreation, requireDSPOrSuperAdmin, requireSSPOrSuperAdmin };
