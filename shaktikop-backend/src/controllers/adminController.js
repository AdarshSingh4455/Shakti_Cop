const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { logActivity } = require('../utils/activityLog');
const { buildScopeClause } = require('../utils/scopeFilter');
const { validateJsonDepth, validatePushToken } = require('../utils/fieldValidators');

const { validateNewPassword } = require('../utils/passwordPolicy');
const { timingSafeVerify } = require('../utils/timingSafeAuth');
const { validateName, validateMobile, validateEmail, validateUrl, validateTextLength } = require('../utils/fieldValidators');

// किसी अधिकारी पर management action (status/rank/permissions/delete) से पहले जांच —
// district_admin/DSP/ASP/SSP सिर्फ़ अपने ही scope (district या circleStations) के अधिकारी पर
// कार्रवाई कर सकें, दूसरे ज़िले/सर्किल के अधिकारी पर नहीं। super_admin पर कोई सीमा नहीं।
function isOfficerInScope(req, officerRow) {
  if (!officerRow) return true; // 404 आगे खुद हैंडल होगा
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    return req.adminScope.rangeDistricts.includes(officerRow.district);
  }
  if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जांचें
    if (req.adminScope.district && officerRow.district !== req.adminScope.district) return false;
    return req.adminScope.circleStations.includes(officerRow.station);
  }
  if (req.adminScope?.district) {
    return req.adminScope.district === officerRow.district;
  }
  return true; // कोई scope सीमा नहीं (super_admin)
}
function toOfficerAdmin(o) {
  return {
    id: o.id,
    name: o.name,
    badgeId: o.badge_id,
    mobile: o.mobile,
    email: o.email,
    station: o.station,
    district: o.district,
    dutyStatus: o.duty_status,
    permissions: o.permissions,
    rank: o.rank,
    isActive: o.is_active,
    createdAt: o.created_at,
  };
}

// ============================================================
// अधिकारी प्रबंधन (Officer CRUD)
// ============================================================

// GET /admin/officers   — सभी अधिकारी (active + inactive), प्रबंधन के लिए
async function listAllOfficers(req, res) {
  let result;
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    result = await db.query('SELECT * FROM officers WHERE district = ANY($1) ORDER BY created_at DESC', [req.adminScope.rangeDistricts]);
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    result = await db.query(
      'SELECT * FROM officers WHERE station = ANY($1) AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2))) ORDER BY created_at DESC',
      [req.adminScope.circleStations, req.adminScope.district || null]
    );
  } else if (req.adminScope?.district) {
    result = await db.query('SELECT * FROM officers WHERE district = $1 ORDER BY created_at DESC', [req.adminScope.district]);
  } else {
    result = await db.query('SELECT * FROM officers ORDER BY created_at DESC');
  }
  res.json(result.rows.map(toOfficerAdmin));
}

// POST /admin/officers   body: { name, badgeId, mobile, password, station, district }
// POST /admin/officers/create-sho   (DSP या Super Admin)   body: { name, pno, mobile, email, password, station, designation }
// DSP सिर्फ़ अपने सर्किल के थानों में से कोई एक चुन सकता है
async function createSHOByDSP(req, res) {
  const { name, pno, mobile, email, password, station, designation } = req.body;
  if (!name || !pno || !password || !station) {
    return res.status(400).json({ error: 'नाम, PNO, पासवर्ड और थाना आवश्यक हैं' });
  }
  // ⚠️ SHO लॉगिन के लिए email/mobile दोनों अनिवार्य — पहले दोनों वैकल्पिक थे,
  // जिससे SHO का खाता ईमेल/मोबाइल के बिना बन जाता था और उससे वह लॉगिन नहीं कर पाता था।
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  const mobileErr = validateMobile(mobile);
  if (mobileErr) return res.status(400).json({ error: mobileErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  // 🔒 बग फ़िक्स: यह जांच बाकी सभी जगह इस्तेमाल होने वाली validateNewPassword() (8-16
  // अक्षर + demo-password-रोक) की जगह अपना अलग, ढीला (सिर्फ़ न्यूनतम 6) नियम लगा
  // रही थी — असंगति। अब वही साझा नीति यहां भी।
  const pwErr_bulk = validateNewPassword(password);
  if (pwErr_bulk) {
    return res.status(400).json({ error: pwErr_bulk });
  }
  // अगर DSP है (super_admin नहीं) तो थाना उसके अपने सर्किल के अंदर ही होना चाहिए
  // 🐛 बग फ़िक्स: यह मिलान सीधा (exact) था, जबकि इस प्रोजेक्ट में हर दूसरी जगह थाने
  // की तुलना TRIM/LOWER करके होती है। थाने का नाम अलग-अलग जगह से भरा जाता है, इसलिए
  // आगे-पीछे स्पेस या छोटे-बड़े अक्षर का फ़र्क़ आम है — और तब वैध DSP को भी ग़लती से
  // "यह थाना आपके सर्किल में नहीं है" कहकर रोक दिया जाता।
  if (req.user.adminRole === 'monitor' && req.user.rank === 'DSP') {
    const circleStations = req.adminScope?.circleStations || [];
    const norm = (s) => String(s || '').trim().toLowerCase();
    if (!circleStations.some((s) => norm(s) === norm(station))) {
      return res.status(403).json({ error: 'यह थाना आपके सर्किल में नहीं है' });
    }
  }
  const district = req.user.district || req.body.district || null;
  // 🐛 बग फ़िक्स: यहां ज़िला खुलकर null हो सकता था। बिना ज़िले वाला SHO हर
  // district-आधारित दायरा-जांच में "छूट" पा जाता है (सिर्फ़ थाने के नाम से मिलान)।
  if (!district) {
    return res.status(400).json({ error: 'SHO के लिए ज़िला आवश्यक है' });
  }
  const pwErr_0 = validateNewPassword(password);
  if (pwErr_0) return res.status(400).json({ error: pwErr_0 });
  const passwordHash = await bcrypt.hash(password, 12);
  const { getCachedSetting } = require('./appSettingsController');
  const shoPermissions = getCachedSetting('rank_permissions').SHO || { canReject: true, canTransfer: true };
  // 🆕 विस्तृत डुप्लीकेट-चेतावनी — बाक़ी तीनों officer-creation रास्तों में यह जोड़ी जा
  // चुकी है, पर यह चौथा (DSP द्वारा SHO बनाना) छूट गया था। अब यहां भी बताते हैं कि
  // पुरानी सक्रिय ID *कहां* (किस थाने/ज़िले में, किसके नाम पर) है।
  const dupChecksSho = [db.query('SELECT name, station, district FROM officers WHERE badge_id = $1 AND is_active = true', [pno.trim()])];
  if (mobile) dupChecksSho.push(db.query('SELECT name, station, district FROM officers WHERE mobile = $1 AND is_active = true', [mobile.trim()]));
  for (const r of await Promise.all(dupChecksSho)) {
    if (r.rows.length > 0) {
      const ex = r.rows[0];
      return res.status(409).json({
        error: `यह पुलिस आईडी/मोबाइल पहले से एक सक्रिय अधिकारी (${ex.name}) के पास है — ${ex.station || 'अज्ञात थाना'}, ${ex.district || 'अज्ञात ज़िला'} में। नई ID बनाने से पहले वहां जाकर पुरानी ID निष्क्रिय करवाएं।`,
        existingOfficer: { name: ex.name, station: ex.station, district: ex.district },
      });
    }
  }
  try {
    const result = await db.query(
      `INSERT INTO officers (name, badge_id, mobile, email, password_hash, station, district, rank, designation, created_by_id, permissions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SHO',$8,$9,$10) RETURNING *`,
      [name.trim(), pno.trim(), mobile.trim(), email.trim(), passwordHash, station, district, designation || null, req.user.id, JSON.stringify(shoPermissions)]
    );
    logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'sho_created', details: `${req.user.name} ने नया SHO बनाया: ${name} (${pno}) — ${station}`, req });
    res.status(201).json(toOfficerAdmin(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'यह PNO या मोबाइल नंबर पहले से किसी सक्रिय ID में मौजूद है — ट्रांसफ़र के लिए पहले वह पुरानी ID निष्क्रिय करें' });
    throw err;
  }
}

// POST /admin/officers   body: { name, badgeId, mobile, password, station, district }
async function createOfficer(req, res) {
  const { name, badgeId, mobile, email, password, station, district, rank } = req.body;
  if (!name || !badgeId || !password) {
    return res.status(400).json({ error: 'नाम, पुलिस आईडी और पासवर्ड आवश्यक हैं' });
  }
  // 🐛 बग फ़िक्स (गंभीर): यहां district/station के लिए कोई scope-जांच ही नहीं थी।
  // district_admin (blockMonitor इस भूमिका को नहीं रोकता) सीधे request में कोई भी
  // district भरकर उस ज़िले के लिए अधिकारी बना सकता था — भले ही वह उनका अपना ज़िला
  // न हो। ठीक वही समस्या जो updateOfficerRank में पहले मिली थी, यहां भी थी।
  // सिर्फ़ जांचना काफ़ी नहीं — अगर district खाली छोड़ दिया जाए तो भी एक बिना-ज़िले
  // वाला "अनाथ" अधिकारी बन सकता था, इसलिए district_admin के लिए हमेशा अपने ही
  // ज़िले से भरते हैं (validate-if-given नहीं, हमेशा auto-fill)।
  let finalDistrict = district;
  if (req.adminScope?.district) {
    if (district && district !== req.adminScope.district) {
      return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले के लिए अधिकारी बना सकते हैं' });
    }
    finalDistrict = req.adminScope.district;
  }
  // 🐛 बग फ़िक्स: district_admin के लिए तो ऊपर auto-fill हो जाता है, पर super_admin
  // (जिसका adminScope.district नहीं होता) ज़िला छोड़ भी सकता था — और बिना ज़िले वाला
  // अधिकारी हर district-आधारित दायरा-जांच में "छूट" पा जाता है (सिर्फ़ थाने के नाम से
  // मिलान, जो "कोतवाली" जैसे आम नामों पर 65 ज़िलों तक फैल सकता है)।
  if (!finalDistrict) {
    return res.status(400).json({ error: 'अधिकारी के लिए ज़िला आवश्यक है' });
  }
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  // 🔒 बग फ़िक्स: यह जांच बाकी सभी जगह इस्तेमाल होने वाली validateNewPassword() (8-16
  // अक्षर + demo-password-रोक) की जगह अपना अलग, ढीला (सिर्फ़ न्यूनतम 6) नियम लगा
  // रही थी — असंगति। अब वही साझा नीति यहां भी।
  const pwErr_bulk = validateNewPassword(password);
  if (pwErr_bulk) {
    return res.status(400).json({ error: pwErr_bulk });
  }
  if (rank && !['SI', 'SHO'].includes(rank)) {
    return res.status(400).json({ error: 'रैंक "SI" या "SHO" होना चाहिए' });
  }
  // ⚠️ SHO का लॉगिन ईमेल/मोबाइल से होता है — इसलिए SHO के लिए दोनों अनिवार्य हैं
  if (rank === 'SHO') {
    const mobileErr = validateMobile(mobile);
    if (mobileErr) return res.status(400).json({ error: mobileErr });
    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
  } else if (mobile) {
    const mobileErr = validateMobile(mobile);
    if (mobileErr) return res.status(400).json({ error: mobileErr });
  }
  const pwErr_1 = validateNewPassword(password);
  if (pwErr_1) return res.status(400).json({ error: pwErr_1 });
  const passwordHash = await bcrypt.hash(password, 12);
  const { getCachedSetting } = require('./appSettingsController');
  const rankPermissions = getCachedSetting('rank_permissions');
  const defaultPermissions = rankPermissions[rank || 'SI'] || { canReject: true, canTransfer: false };
  // 🆕 उपयोगकर्ता-अनुरोध: पहले सिर्फ़ DB constraint-टूटने (23505) पर एक सामान्य संदेश
  // मिलता था — यह नहीं पता चलता था कि पुरानी सक्रिय ID *कहां* (किस थाने/ज़िले) मौजूद
  // है। अब INSERT से *पहले* ही जांच लेते हैं, और मिले तो पूरी जानकारी (नाम, थाना,
  // ज़िला) के साथ स्पष्ट चेतावनी देते हैं — पहले वहां जाकर उसे निष्क्रिय करना होगा।
  const dupChecks = [];
  if (badgeId) dupChecks.push(db.query('SELECT name, station, district FROM officers WHERE badge_id = $1 AND is_active = true', [badgeId]));
  if (mobile) dupChecks.push(db.query('SELECT name, station, district FROM officers WHERE mobile = $1 AND is_active = true', [mobile]));
  const dupResults = await Promise.all(dupChecks);
  for (const r of dupResults) {
    if (r.rows.length > 0) {
      const ex = r.rows[0];
      return res.status(409).json({
        error: `यह पुलिस आईडी/मोबाइल पहले से एक सक्रिय अधिकारी (${ex.name}) के पास है — ${ex.station || 'अज्ञात थाना'}, ${ex.district || 'अज्ञात ज़िला'} में। नई ID बनाने से पहले वहां जाकर पुरानी ID निष्क्रिय करवाएं।`,
        existingOfficer: { name: ex.name, station: ex.station, district: ex.district },
      });
    }
  }
  try {
    const result = await db.query(
      `INSERT INTO officers (name, badge_id, mobile, email, password_hash, station, district, rank, permissions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, badgeId, mobile || null, email || null, passwordHash, station || null, finalDistrict || null, rank || 'SI', JSON.stringify(defaultPermissions)]
    );
    logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'officer_created', details: `नया अधिकारी जोड़ा: ${name} (${badgeId}, ${rank || 'SI'})`, req });
    res.status(201).json(toOfficerAdmin(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'यह पुलिस आईडी या मोबाइल नंबर पहले से किसी सक्रिय अधिकारी के पास है — ट्रांसफ़र के लिए पहले वह पुरानी ID निष्क्रिय करें' });
    }
    throw err;
  }
}

// PATCH /admin/officers/:id/rank   body: { rank: 'SI'|'SHO' }
// 🐛 बग फ़िक्स (गंभीर): यहां scope-जांच (isOfficerInScope) बिल्कुल गायब थी — जबकि
// ठीक बगल के setOfficerStatus/updateOfficerPermissions फ़ंक्शन में यह मौजूद है।
// रैंक बदलना (SI → SHO) एक बड़ा विशेषाधिकार-परिवर्तन है (SHO को पूरे थाने की
// दृश्यता, SI बनाने, मामले नियुक्त करने जैसे अधिकार मिलते हैं) — इस जांच के बिना
// कोई भी admin, किसी भी दूसरे ज़िले/सर्किल के अधिकारी की रैंक बदल सकता था।
async function updateOfficerRank(req, res) {
  const { id } = req.params;
  const { rank } = req.body;
  if (!['SI', 'SHO'].includes(rank)) {
    return res.status(400).json({ error: 'रैंक "SI" या "SHO" होना चाहिए' });
  }
  const existing = await db.query('SELECT * FROM officers WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'अधिकारी नहीं मिला' });
  if (!isOfficerInScope(req, existing.rows[0])) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले/सर्किल के अधिकारी की रैंक बदल सकते हैं' });
  }
  const result = await db.query('UPDATE officers SET rank = $1 WHERE id = $2 RETURNING *', [rank, id]);
  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'officer_rank_updated', details: `${result.rows[0].name} की रैंक "${rank}" की गई`, req });
  res.json(toOfficerAdmin(result.rows[0]));
}

// POST /admin/officers/bulk-import   body: { officers: [{ name, badgeId, mobile, password, station, district }] }
// CSV से पहले mobile पर पढ़कर rows बना ली जाएं, फिर यहाँ भेजें — एक साथ कई अधिकारी जोड़ने के लिए
async function bulkImportOfficers(req, res) {
  const { officers } = req.body;
  if (!Array.isArray(officers) || officers.length === 0) {
    return res.status(400).json({ error: 'officers की सूची आवश्यक है' });
  }
  if (officers.length > 200) {
    return res.status(400).json({ error: 'एक बार में अधिकतम 200 अधिकारी जोड़े जा सकते हैं' });
  }

  const results = { success: [], failed: [] };
  for (const o of officers) {
    if (!o.name || !o.badgeId || !o.password) {
      results.failed.push({ row: o, error: 'नाम/पुलिस आईडी/पासवर्ड में से कोई छूटा है' });
      continue;
    }
    // 🐛 बग फ़िक्स (गंभीर): createOfficer जैसी ही समस्या यहां भी थी — कोई district-
    // जांच नहीं थी। एक district_admin CSV की किसी भी पंक्ति में अपने ज़िले की जगह
    // कोई और ज़िला भरकर वहां के लिए भी अधिकारी बना सकता था — पूरे बल्क-इम्पोर्ट में
    // यह चूक एक साथ 200 अधिकारियों तक फैल सकती थी। सिर्फ़ जांचना काफ़ी नहीं — खाली
    // district वाली पंक्ति भी "अनाथ" अधिकारी बना सकती थी, इसलिए हमेशा auto-fill।
    let rowDistrict = o.district;
    if (req.adminScope?.district) {
      if (o.district && o.district !== req.adminScope.district) {
        results.failed.push({ row: o, error: `आप सिर्फ़ अपने ज़िले (${req.adminScope.district}) के लिए अधिकारी बना सकते हैं` });
        continue;
      }
      rowDistrict = req.adminScope.district;
    }
    // 🐛 बग फ़िक्स: यहां ज़िला खाली रह सकता था (CSV की पंक्ति में न हो, और बनाने वाला
    // super_admin हो)। बिना ज़िले वाला अधिकारी हर district-आधारित दायरा-जांच में
    // "छूट" पा जाता है — और bulk-import में यह चूक एक साथ 200 पंक्तियों तक फैल सकती है।
    if (!rowDistrict) {
      results.failed.push({ row: o, error: 'ज़िला आवश्यक है' });
      continue;
    }
    // 🔒 बग फ़िक्स: हर दूसरे अधिकारी/एडमिन बनाने वाले endpoint पर पासवर्ड-नीति
    // (न्यूनतम लंबाई, आम/डेमो पासवर्ड न हों) जांची जाती है — सिर्फ़ यही bulk-import
    // वाला रास्ता इससे छूट गया था। नतीजा: एक साथ 200 अधिकारियों के बेहद कमज़ोर
    // पासवर्ड (जैसे "1", "abc") बन सकते थे, जिससे उनके खाते brute-force के लिए
    // आसान निशाना बन जाते।
    const pwErr = validateNewPassword(o.password);
    if (pwErr) {
      results.failed.push({ row: o, error: pwErr });
      continue;
    }
    try {
      // 🆕 उपयोगकर्ता-अनुरोध: यहां भी अब सिर्फ़ "duplicate" नहीं — कहां (थाना/ज़िला)
      // पहले से सक्रिय है, यह भी बताते हैं
      const dupCheck = await db.query(
        'SELECT name, station, district FROM officers WHERE (badge_id = $1 OR ($2::text IS NOT NULL AND mobile = $2)) AND is_active = true',
        [o.badgeId, o.mobile || null]
      );
      if (dupCheck.rows.length > 0) {
        const ex = dupCheck.rows[0];
        results.failed.push({
          row: o,
          error: `पहले से सक्रिय (${ex.name} — ${ex.station || 'अज्ञात थाना'}, ${ex.district || 'अज्ञात ज़िला'}) — पहले वहां निष्क्रिय करें`,
          existingOfficer: { name: ex.name, station: ex.station, district: ex.district },
        });
        continue;
      }
      const passwordHash = await bcrypt.hash(String(o.password), 12);
      const rank = ['SI', 'SHO'].includes(o.rank) ? o.rank : 'SI';
      const result = await db.query(
        `INSERT INTO officers (name, badge_id, mobile, password_hash, station, district, rank)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, badge_id`,
        [o.name, o.badgeId, o.mobile || null, passwordHash, o.station || null, rowDistrict || null, rank]
      );
      results.success.push(result.rows[0]);
    } catch (err) {
      results.failed.push({ row: o, error: err.code === '23505' ? 'पहले से मौजूद (duplicate)' : err.message });
    }
  }

  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'officers_bulk_imported', details: `${results.success.length} सफल, ${results.failed.length} असफल`, req });
  res.json(results);
}

// PATCH /admin/officers/:id   body: { name, mobile, station, district }
// ⚠️ station/district अब यहां से नहीं बदले जा सकते — ट्रांसफ़र होने पर पुरानी ID को
// /status से निष्क्रिय करें और नए थाने/ज़िले के लिए बिल्कुल नई ID बनाएं (देखें: transferOfficer)
async function updateOfficer(req, res) {
  const { id } = req.params;
  const { name, mobile } = req.body;
  if (name !== undefined) {
    const nameErr = validateName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });
  }
  if (mobile) {
    const mobileErr = validateMobile(mobile);
    if (mobileErr) return res.status(400).json({ error: mobileErr });
  }
  const existing = await db.query('SELECT * FROM officers WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'अधिकारी नहीं मिला' });
  if (!isOfficerInScope(req, existing.rows[0])) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले/सर्किल के अधिकारी को बदल सकते हैं' });
  }
  const result = await db.query(
    `UPDATE officers SET name = COALESCE($1, name), mobile = $2, updated_at = now()
     WHERE id = $3 RETURNING *`,
    [name, mobile || null, id]
  );
  res.json(toOfficerAdmin(result.rows[0]));
}

// PATCH /admin/officers/:id/status   body: { isActive }
async function setOfficerStatus(req, res) {
  const { id } = req.params;
  const { isActive } = req.body;
  const existing = await db.query('SELECT * FROM officers WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'अधिकारी नहीं मिला' });
  if (!isOfficerInScope(req, existing.rows[0])) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले/सर्किल के अधिकारी को सक्रिय/निष्क्रिय कर सकते हैं' });
  }
  const result = await db.query('UPDATE officers SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING *', [!!isActive, id]);
  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: isActive ? 'officer_activated' : 'officer_deactivated', details: `अधिकारी ${result.rows[0].name} को ${isActive ? 'सक्रिय' : 'निष्क्रिय'} किया`, req });
  res.json(toOfficerAdmin(result.rows[0]));
}

// PATCH /admin/officers/:id/permissions   body: { permissions: {...} }
async function updateOfficerPermissions(req, res) {
  const { id } = req.params;
  const { permissions } = req.body;
  const existing = await db.query('SELECT * FROM officers WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'अधिकारी नहीं मिला' });
  if (!isOfficerInScope(req, existing.rows[0])) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले/सर्किल के अधिकारी की permissions बदल सकते हैं' });
  }
  // 🐛 बग फ़िक्स: यह JSONB कॉलम है और client से सीधा आता है, पर गहराई (nesting) की
  // कोई जांच नहीं थी — जबकि complaintController में extraDetails पर यही जांच पहले से
  // है। बहुत गहरा/बड़ा object भेजकर database व बाद में उसे पढ़ने वाले कोड पर बेवजह
  // दबाव डाला जा सकता था।
  const permDepthErr = validateJsonDepth(permissions, { label: 'permissions' });
  if (permDepthErr) return res.status(400).json({ error: permDepthErr });
  const result = await db.query(
    'UPDATE officers SET permissions = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(permissions || {}), id]
  );
  res.json(toOfficerAdmin(result.rows[0]));
}

// DELETE /admin/officers/:id
async function deleteOfficer(req, res) {
  const { id } = req.params;
  const existing = await db.query('SELECT * FROM officers WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'अधिकारी नहीं मिला' });
  if (!isOfficerInScope(req, existing.rows[0])) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले/सर्किल के अधिकारी को हटा सकते हैं' });
  }
  const assigned = await db.query(
    `SELECT count(*) FROM complaints WHERE officer_id = $1 AND deleted_at IS NULL AND status NOT IN ('निस्तारित','अस्वीकृत')`,
    [id]
  );
  if (Number(assigned.rows[0].count) > 0) {
    return res.status(400).json({ error: 'इस अधिकारी को सक्रिय मामले नियुक्त हैं — पहले उन्हें किसी और को स्थानांतरित करें या हटाने की बजाय निष्क्रिय करें' });
  }
  const result = await db.query('DELETE FROM officers WHERE id = $1 RETURNING id', [id]);
  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'officer_deleted', details: `अधिकारी ID ${id} हटाया गया`, req });
  res.json({ message: 'अधिकारी हटा दिया गया' });
}

// POST /admin/officers/:id/transfer   body: { station, district?, badgeId?, mobile?, email?, password? }
// पुरानी ID को निष्क्रिय करके, उसी PNO/नाम से नए थाने/ज़िले के लिए बिल्कुल नई (सक्रिय) ID बनाता है।
// दोनों काम एक ही ट्रांज़ैक्शन में होते हैं ताकि आधा-अधूरा state न बने।
async function transferOfficer(req, res) {
  const { id } = req.params;
  const { station, district, mobile, email, password } = req.body;
  if (!station) return res.status(400).json({ error: 'नया थाना आवश्यक है' });

  const existing = await db.query('SELECT * FROM officers WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'अधिकारी नहीं मिला' });
  const old = existing.rows[0];
  if (!old.is_active) return res.status(400).json({ error: 'यह ID पहले से निष्क्रिय है' });
  if (!isOfficerInScope(req, old)) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले/सर्किल के अधिकारी को ट्रांसफ़र कर सकते हैं' });
  }

  const newDistrict = district || old.district;
  const newMobile = mobile !== undefined ? (mobile || null) : old.mobile;
  const newEmail = email !== undefined ? (email || null) : old.email;
  let passwordHash = old.password_hash;
  if (password) {
    const pwErr = validateNewPassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    passwordHash = await bcrypt.hash(password, 12);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE officers SET is_active = false, updated_at = now() WHERE id = $1', [id]);
    const inserted = await client.query(
      `INSERT INTO officers (name, badge_id, mobile, email, password_hash, station, district, rank, designation, created_by_id, permissions, transferred_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [old.name, old.badge_id, newMobile, newEmail, passwordHash, station, newDistrict, old.rank, old.designation, req.user.id, old.permissions, old.id]
    );

    // 🐛 बग फ़िक्स: ट्रांसफ़र पर पुरानी ID निष्क्रिय हो जाती थी, पर उस पर लगी खुली
    // शिकायतें जस की तस उसी ID की ओर इशारा करती रहतीं। नतीजा एक ऐसी स्थिति जो कहीं
    // दिखती नहीं:
    //   • पुराना अधिकारी काम नहीं कर सकता (खाता बंद हो चुका),
    //   • नई ID को वे शिकायतें दिखती ही नहीं (ID अलग है),
    //   • और सूची में वे "नियुक्त" दिखती हैं, इसलिए किसी को लगता ही नहीं कि रुकी हैं।
    // यानी मामला चुपचाप अटक जाता — किसी को कोई त्रुटि भी नहीं मिलती।
    //
    // अब खुली शिकायतें छोड़ दी जाती हैं: वे थाने की "बिना-नियुक्ति" सूची में लौट आती
    // हैं, जहाँ से SHO उन्हें किसी और को सौंप देता है। हर शिकायत के इतिहास में यह
    // दर्ज भी होता है, ताकि बाद में साफ़ रहे कि वह क्यों दोबारा खुली।
    // ⚠️ बंद (निस्तारित/अस्वीकृत) शिकायतें नहीं छेड़ी जातीं — वे रिकॉर्ड हैं।
    const released = await client.query(
      `UPDATE complaints SET officer_id = NULL, status = 'दर्ज'
       WHERE officer_id = $1 AND deleted_at IS NULL
         AND status NOT IN ('निस्तारित', 'अस्वीकृत')
       RETURNING id`,
      [id]
    );
    for (const r of released.rows) {
      await client.query(
        `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
         VALUES ($1, 'दर्ज', $2, 'admin', $3)`,
        [r.id, `${old.name} के ${station} ट्रांसफ़र होने पर यह मामला दोबारा बिना-नियुक्ति सूची में डाला गया — कृपया नया अधिकारी नियुक्त करें`, req.user.name]
      );
    }

    await client.query('COMMIT');
    logActivity({
      actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'officer_transferred',
      details: `${old.name} (${old.badge_id}) को ${old.station} से ${station} ट्रांसफ़र किया — पुरानी ID निष्क्रिय, नई ID बनी` +
               (released.rowCount > 0 ? `; ${released.rowCount} खुली शिकायतें दोबारा बिना-नियुक्ति की गईं` : ''),
      req,
    });
    res.status(201).json({ ...toOfficerAdmin(inserted.rows[0]), releasedComplaints: released.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'नए थाने के लिए ID नहीं बन सकी — इस PNO/मोबाइल/ईमेल से पहले से एक सक्रिय ID मौजूद है' });
    }
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// एडमिन प्रोफ़ाइल
// ============================================================

// GET /admin/me
//
// 🐛 बग फ़िक्स: पहले यह सिर्फ़ नाम/username/फ़ोटो लौटाता था। लॉगिन के जवाब में
// adminRole, district, rank वग़ैरह भी आते हैं — यानी दोनों का आकार अलग था। जो
// client पेज दोबारा खुलने पर सत्र इसी से वापस बनाता है (वेब पैनल ऐसा ही करता है),
// उसे भूमिका मिलती ही नहीं: super_admin वाले मेन्यू चुपचाप ग़ायब हो जाते और
// क्षेत्राधिकार की पंक्ति ख़ाली दिखती — जबकि लॉगिन बिल्कुल सही होता।
//
// ⚠️ इसमें कुछ संवेदनशील नहीं जुड़ रहा: ये सारी जानकारी उस एडमिन के अपने token में
//    पहले से मौजूद है, वह इसे अपने बारे में जानता ही है।
async function getMyAdminProfile(req, res) {
  const result = await db.query(
    `SELECT id, name, username, mobile, email, admin_role, district, rank,
            circle_stations, range_districts, menu_permissions, photo_url, created_at
       FROM admins WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'प्रोफ़ाइल नहीं मिली' });
  const a = result.rows[0];
  res.json({
    id: a.id,
    name: a.name,
    username: a.username,
    mobile: a.mobile,
    email: a.email,
    adminRole: a.admin_role,
    district: a.district,
    rank: a.rank,
    circleStations: a.circle_stations,
    rangeDistricts: a.range_districts,
    menuPermissions: a.menu_permissions,
    photoUrl: a.photo_url,
    createdAt: a.created_at,
    role: 'admin',
  });
}

// PATCH /admin/me   body: { name }
async function updateMyAdminProfile(req, res) {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'नाम खाली नहीं हो सकता' });
  const result = await db.query(
    'UPDATE admins SET name = $1 WHERE id = $2 RETURNING id, name, username',
    [name.trim(), req.user.id]
  );
  res.json(result.rows[0]);
}

// PATCH /admin/me/photo   body: { photoUrl }   — वैकल्पिक प्रोफ़ाइल फ़ोटो
async function updateMyAdminPhoto(req, res) {
  const { photoUrl } = req.body;
  if (photoUrl) {
    const urlErr = validateUrl(photoUrl, { label: 'फ़ोटो', allowDataUri: true });
    if (urlErr) return res.status(400).json({ error: urlErr });
  }
  const result = await db.query(
    'UPDATE admins SET photo_url = $1 WHERE id = $2 RETURNING id, name, username, photo_url',
    [photoUrl || null, req.user.id]
  );
  const a = result.rows[0];
  res.json({ id: a.id, name: a.name, username: a.username, photoUrl: a.photo_url });
}

// PATCH /admin/me/password   body: { currentPassword, newPassword }
async function changeAdminPassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const pwErr_me = validateNewPassword(newPassword);
  if (pwErr_me) {
    return res.status(400).json({ error: pwErr_me });
  }
  const result = await db.query('SELECT password_hash FROM admins WHERE id = $1', [req.user.id]);
  const admin = result.rows[0];
  if (!(await timingSafeVerify(currentPassword, admin?.password_hash))) {
    return res.status(401).json({ error: 'मौजूदा पासवर्ड गलत है' });
  }
  const pwErr_2 = validateNewPassword(newPassword);
  if (pwErr_2) return res.status(400).json({ error: pwErr_2 });
  const newHash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
  // 🔒 सुरक्षा फ़िक्स: पासवर्ड बदलने पर पुराने सत्र रद्द नहीं होते थे — यानी अगर
  // किसी और के पास पहले से लॉगिन था, तो पासवर्ड बदलने के बाद भी उसकी पहुँच 30 दिन
  // तक बनी रहती। Admin खातों में यह और भी भारी है, क्योंकि उनके पास पूरे ज़िले
  // (या राज्य) के पीड़िता-डेटा तक पहुँच होती है।
  const { revokeAllForUser } = require('../utils/refreshToken');
  await revokeAllForUser(req.user.id, 'admin');
  res.json({ message: 'पासवर्ड बदल दिया गया है — सुरक्षा के लिए सभी डिवाइस से लॉगआउट हो गया, कृपया दोबारा लॉगिन करें' });
}

// ============================================================
// श्रेणी-वार आंकड़े (रंगीन डैशबोर्ड कार्ड्स के लिए)
// ============================================================

// GET /admin/stats/by-category
// 🐛 बग फ़िक्स: पहले यहां कोई scope-फ़िल्टर ही नहीं था — किसी भी admin भूमिका
// (DSP/ASP/SSP/district_admin) को राज्य-भर के श्रेणी-वार आंकड़े दिख जाते थे,
// अपने ज़िले तक सीमित नहीं। अब बाकी जगह जैसा ही साझा scope-filter।
async function getCategoryStats(req, res) {
  const { clause: scopeClause, params } = buildScopeClause(req);
  const result = await db.query(
    `SELECT category, count(*) AS total,
      count(*) FILTER (WHERE status = 'दर्ज') AS pending,
      count(*) FILTER (WHERE status = 'निस्तारित') AS resolved,
      count(*) FILTER (WHERE status = 'अस्वीकृत') AS rejected
    FROM complaints WHERE true ${scopeClause} GROUP BY category`,
    params
  );
  res.json(
    result.rows.map((r) => ({
      category: r.category,
      total: Number(r.total),
      pending: Number(r.pending),
      resolved: Number(r.resolved),
      rejected: Number(r.rejected),
    }))
  );
}

// PATCH /admin/me/push-token   body: { pushToken }
async function updateAdminPushToken(req, res) {
  const { pushToken } = req.body;
  // 🔒 प्रारूप की जाँच — देखें utils/fieldValidators.js की टिप्पणी
  const pushErr = validatePushToken(pushToken);
  if (pushErr) return res.status(400).json({ error: pushErr });
  // 🐛 बग फ़िक्स (सुरक्षा-गंभीर — साझा/हस्तांतरित डिवाइस): push_token पर कोई
  // unique-शर्त नहीं है, और Expo हर डिवाइस+इंस्टॉल के लिए वही token देता है।
  // थानों में फ़ोन अक्सर साझा होते हैं या कार्यभार के साथ आगे बढ़ते हैं। जब अगला
  // उपयोगकर्ता उसी फ़ोन पर लॉगिन करता, तो पिछले के record में भी वही token पड़ा
  // रह जाता — यानी उनके नाम की सूचनाएं (SOS समेत) उस फ़ोन पर बजतीं जो अब किसी
  // और के पास है, और वे ख़ुद अपने डिवाइस पर कभी सूचित नहीं होते। अब कोई भी token
  // किसी एक समय पर सिर्फ़ एक ही खाते से जुड़ा रहता है (सभी भूमिकाओं में)।
  if (pushToken) {
    await Promise.all([
      db.query('UPDATE officers SET push_token = NULL WHERE push_token = $1', [pushToken]),
      db.query('UPDATE citizens SET push_token = NULL WHERE push_token = $1', [pushToken]),
      db.query('UPDATE admins SET push_token = NULL WHERE push_token = $1 AND id <> $2', [pushToken, req.user.id]),
      db.query('UPDATE service_providers SET push_token = NULL WHERE push_token = $1', [pushToken]),
    ]);
  }
  await db.query('UPDATE admins SET push_token = $1 WHERE id = $2', [pushToken || null, req.user.id]);
  res.json({ message: 'सुरक्षित हुआ' });
}

// ============================================================
// गतिविधि लॉग (Phase F — सुरक्षा ऑडिट)
// ============================================================

// GET /admin/activity-logs?actorRole=&action=&search=&dateFrom=&dateTo=&sort=&limit=&offset=
async function listActivityLogs(req, res) {
  const { actorRole, action, search, dateFrom, dateTo, sort } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const clauses = [];
  const params = [];

  if (actorRole) {
    params.push(actorRole);
    clauses.push(`actor_role = $${params.length}`);
  }
  if (action) {
    params.push(action);
    clauses.push(`action = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`actor_name ILIKE $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    clauses.push(`created_at >= $${params.length}`);
  }
  if (dateTo) {
    // वही dateTo/midnight बग यहाँ भी था — पूरे दिन को शामिल करने के लिए ठीक किया
    params.push(dateTo);
    clauses.push(`created_at < ($${params.length}::date AT TIME ZONE 'Asia/Kolkata' + interval '1 day')`);
  }

  let sql = 'SELECT * FROM activity_logs';
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ` ORDER BY created_at ${sort === 'oldest' ? 'ASC' : 'DESC'} LIMIT ${limit} OFFSET ${offset}`;

  const result = await db.query(sql, params);
  res.json(
    result.rows.map((r) => ({
      id: r.id,
      actorRole: r.actor_role,
      actorId: r.actor_id,
      actorName: r.actor_name,
      action: r.action,
      details: r.details,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }))
  );
}

// ============================================================
// Granular RBAC — super_admin district-admin accounts बना/manage कर सकता है
// ============================================================

// GET /admin/admins   (super_admin only)
async function listAdmins(req, res) {
  // 🐛 बग फ़िक्स: is_active यहां select ही नहीं होता था, जबकि नीचे response में
  // isActive: a.is_active इस्तेमाल होता है — मतलब हर admin के लिए यह हमेशा
  // undefined जाता, सक्रिय/निष्क्रिय की पहचान मोबाइल पर सही से नहीं हो पाती।
  // 🆕 range_districts भी जोड़ा — IG/DIG के Range दिखाने के लिए।
  const result = await db.query('SELECT id, name, username, mobile, email, admin_role, district, rank, circle_stations, range_districts, menu_permissions, is_active, created_at FROM admins ORDER BY created_at DESC');
  res.json(
    result.rows.map((a) => ({
      id: a.id,
      name: a.name,
      username: a.username,
      mobile: a.mobile,
      email: a.email,
      adminRole: a.admin_role,
      district: a.district,
      rank: a.rank,
      circleStations: a.circle_stations,
      rangeDistricts: a.range_districts,
      menuPermissions: a.menu_permissions,
      isActive: a.is_active,
      createdAt: a.created_at,
    }))
  );
}

// POST /admin/admins   (super_admin only)   body: { name, username, mobile, email, password, district }
// हमेशा 'district_admin' के रूप में बनता है — super_admin सिर्फ़ एक ही मैन्युअली, डेटाबेस में सेट होता है
// POST /admin/admins   (super_admin only)   body: { name, username, mobile, email, password, adminRole, district, rank }
// adminRole: 'district_admin' (पूरा लिखने का अधिकार, ज़िले तक सीमित) | 'monitor' (सिर्फ़ देखना — DSP/ASP/SSP)
async function createDistrictAdmin(req, res) {
  const { name, username, mobile, email, password, district, adminRole, rank, circleStations, rangeDistricts } = req.body;
  const role = adminRole === 'monitor' ? 'monitor' : 'district_admin';

  // अगर बनाने वाला खुद SSP है (super_admin नहीं), तो सिर्फ़ DSP/ASP (monitor), और सिर्फ़
  // अपने ही ज़िले के लिए बना सकता है — दूसरे ज़िले के लिए नहीं
  // 🆕 यही जांच अपने-आप IG/DIG को भी SSP से बचाती है — 'IG'/'DIG' इस allowlist में
  // नहीं है, तो SSP का अनुरोध यहीं अस्वीकृत हो जाता है। IG/DIG खाता सिर्फ़ Super
  // Admin बना सकता है (SSP से भी ऊपर का पद है, किसी अधीनस्थ को अपने वरिष्ठ का
  // खाता बनाने देना तर्कसंगत नहीं)।
  if (req.user.adminRole === 'monitor' && req.user.rank === 'SSP') {
    if (role !== 'monitor' || !['DSP', 'ASP'].includes(rank)) {
      return res.status(403).json({ error: 'SSP सिर्फ़ DSP या ASP खाते बना सकता है' });
    }
    if (district !== req.user.district) {
      return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले के लिए DSP/ASP खाता बना सकते हैं' });
    }
  }

  if (!name || !email || !mobile || !password) {
    return res.status(400).json({ error: 'नाम, ईमेल आईडी, मोबाइल नंबर और पासवर्ड आवश्यक हैं' });
  }
  // ⚠️ DSP/ASP/SSP/IG/DIG लॉगिन के लिए email + mobile दोनों अनिवार्य कर दिए गए हैं
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  const mobileErr = validateMobile(mobile);
  if (mobileErr) return res.status(400).json({ error: mobileErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  if (role === 'district_admin' && !district) {
    return res.status(400).json({ error: 'district_admin के लिए ज़िला आवश्यक है' });
  }
  if (role === 'monitor' && !['DSP', 'ASP', 'SSP', 'IG', 'DIG'].includes(rank)) {
    return res.status(400).json({ error: 'monitor भूमिका के लिए rank "DSP", "ASP", "SSP", "DIG" या "IG" आवश्यक है' });
  }
  // 🐛 बग फ़िक्स (गंभीर सुरक्षा): ज़िला सिर्फ़ district_admin के लिए अनिवार्य था —
  // DSP/ASP/SSP (monitor) बिना ज़िले के भी बन सकते थे। इनका पूरा दायरा district पर
  // टिका है: district न हो तो middleware में adminScope = {} बनता है, जिसका मतलब
  // backend के लिए "कोई सीमा नहीं" — यानी उस खाते को चुपचाप super_admin जैसी पूरे
  // राज्य की दृश्यता मिल जाती। (IG/DIG अपवाद हैं — उनका दायरा rangeDistricts में
  // होता है, उनके लिए district का NULL रहना ही सही है।)
  if (role === 'monitor' && ['DSP', 'ASP', 'SSP'].includes(rank) && !district) {
    return res.status(400).json({ error: `${rank} के लिए ज़िला आवश्यक है` });
  }
  if (rank === 'DSP' && (!Array.isArray(circleStations) || circleStations.length === 0)) {
    return res.status(400).json({ error: 'DSP के लिए कम से कम एक थाना (सर्किल में) चुनना आवश्यक है' });
  }
  // 🆕 IG/DIG के लिए कम से कम एक ज़िला (Range में) चुनना अनिवार्य — DSP के circleStations जैसा ही पैटर्न
  if (['IG', 'DIG'].includes(rank) && (!Array.isArray(rangeDistricts) || rangeDistricts.length === 0)) {
    return res.status(400).json({ error: 'IG/DIG के लिए कम से कम एक ज़िला (Range में) चुनना आवश्यक है' });
  }
  // 🐛 बग फ़िक्स: circleStations की तरह rangeDistricts की भी जांच होनी चाहिए कि ये
  // असल में मौजूद ज़िले हैं। बिना जांच के, एक टाइपो (या मनमाना नाम) वाला IG/DIG खाता
  // चुपचाप बन जाता जिसका Range किसी भी असली ज़िले से मेल नहीं खाता — उसे कहीं कोई
  // डेटा दिखता ही नहीं, और वजह बताने वाली कोई त्रुटि भी नहीं आती।
  if (Array.isArray(rangeDistricts) && rangeDistricts.length > 0) {
    const validD = await db.query(
      'SELECT DISTINCT district FROM police_stations WHERE district = ANY($1)',
      [rangeDistricts]
    );
    const validNames = validD.rows.map((r) => r.district);
    const invalid = rangeDistricts.filter((d) => !validNames.includes(d));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `ये ज़िले सूची में मौजूद नहीं हैं: ${invalid.join(', ')}` });
    }
  }
  // 🐛 बग फ़िक्स (गंभीर सुरक्षा): यह कभी जांचा ही नहीं जाता था कि चुने गए circleStations
  // असल में उसी ज़िले के हैं या नहीं। थाने के नाम सिर्फ़ (ज़िला+थाना) मिलाकर अद्वितीय
  // होते हैं — "कोतवाली" जैसा नाम कई ज़िलों में मौजूद है। scope-फ़िल्टर सिर्फ़ थाने के
  // नाम से मिलान करता है (station = ANY(...)), इसलिए अगर किसी DSP/ASP का सर्किल
  // "कोतवाली" पर सेट हो जाए, तो उसे हर ज़िले की "कोतवाली" का डेटा दिखने लगता —
  // यानी चुपचाप पूरे राज्य जितनी दृश्यता मिल जाती।
  if (Array.isArray(circleStations) && circleStations.length > 0 && district) {
    const valid = await db.query(
      'SELECT station FROM police_stations WHERE TRIM(LOWER(district)) = TRIM(LOWER($1)) AND station = ANY($2)',
      [district, circleStations]
    );
    const validNames = valid.rows.map((r) => r.station);
    const invalid = circleStations.filter((s) => !validNames.includes(s));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `ये थाने "${district}" ज़िले में नहीं हैं: ${invalid.join(', ')}` });
    }
  }
  const pwErr_3 = validateNewPassword(password);
  if (pwErr_3) return res.status(400).json({ error: pwErr_3 });
  const passwordHash = await bcrypt.hash(password, 12);
  // monitor (DSP/ASP/SSP) खातों को शुरुआत में एक छोटी सी बुनियादी मेनू सूची मिलती है —
  // बाकी सब Super Admin बाद में permission देकर खोल सकता है (ManageAdmins → अनुमतियां)
  // 🆕 IG/DIG — इनकी पूरी भूमिका ही निगरानी/analytics-केंद्रित है (operational
  // DSP/ASP से अलग), इसलिए इन्हें शुरुआत से ही analytics + leaderboard (जिसमें
  // District/Station Explorer भी शामिल है) दिखते हैं — किसी अलग permission-grant
  // का इंतज़ार नहीं करना पड़ता।
  // 🐛 बग फ़िक्स: analytics व leaderboard सिर्फ़ IG/DIG को मिलते थे; DSP/ASP/SSP को
  // सिर्फ़ allComplaints व broadcast। यह बेमेल था — बैकएंड पर इन तीनों की analytics तक
  // पहुँच *पहले से* थी (routes पर कोई blockMonitor नहीं है, और buildScopeClause उनके
  // circle/ज़िले के हिसाब से डेटा छानता है)। यानी क्षमता मौजूद थी, बस menu में विकल्प
  // ही नहीं दिखता था — इसलिए DSP/ASP/SSP अपने ही क्षेत्र के आंकड़े देख नहीं पाते थे,
  // जबकि निगरानी करना ही उनकी भूमिका है।
  //
  // ⚠️ यह पहुँच बढ़ाना नहीं है: हर analytics query buildScopeClause से गुज़रती है, इसलिए
  // DSP को अपने circle का, ASP/SSP को अपने ज़िले (या चुने थानों) का, और IG/DIG को अपने
  // range का ही डेटा दिखेगा। सिर्फ़ पढ़ने की सुविधा है — blockMonitor उन्हें हर
  // बदलाव-कार्रवाई से पहले की तरह रोकता रहेगा।
  const defaultMonitorMenu = { allComplaints: true, broadcast: true, analytics: true, leaderboard: true };
  try {
    const result = await db.query(
      `INSERT INTO admins (name, username, mobile, email, password_hash, admin_role, district, rank, circle_stations, range_districts, menu_permissions, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, name, username, email, mobile, admin_role, district, rank, circle_stations, range_districts, menu_permissions`,
      [
        name.trim(), username ? username.trim() : null, mobile.trim(), email.trim(), passwordHash, role,
        district || null, role === 'monitor' ? rank : null,
        // 🆕 ASP भी अब DSP जैसे ही circleStations ले सकते हैं — बड़े ज़िले में 2 ASP
        // आधे-आधे थाने बांट सकते हैं। DSP के लिए यह अनिवार्य है, ASP के लिए वैकल्पिक
        // (खाली छोड़ने पर पूरे ज़िले की दृश्यता मिलती है — जैसा UI में पहले से बताया जाता है)।
        // 🐛 बग फ़िक्स: SSP यहाँ छूट गया था — middleware/auth.js में SSP के circleStations
        // को पहले से ही मान्यता दी जाती है (वहाँ की टिप्पणी में यह मंशा साफ़ लिखी है:
        // "अब SP/SSP को भी वही विकल्प मिलता है"), पर यहाँ SSP के लिए हमेशा खाली सूची
        // सेव होती थी — यानी वह सुविधा असल में कभी काम ही नहीं करती थी (आधा-अधूरा फ़ीचर)।
        // अब SSP भी ASP जैसा ही व्यवहार करता है: वैकल्पिक, खाली = पूरा ज़िला।
        JSON.stringify(['DSP', 'ASP', 'SSP'].includes(rank) ? (circleStations || []) : []),
        // 🆕 IG/DIG के लिए Range (कई ज़िले) — बाकी रैंकों के लिए हमेशा खाली
        JSON.stringify(['IG', 'DIG'].includes(rank) ? (rangeDistricts || []) : []),
        JSON.stringify(role === 'monitor' ? defaultMonitorMenu : {}),
        req.user.id,
      ]
    );
    logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'admin_account_created', details: `${name} को ${role}${rank ? ` (${rank})` : ''} बनाया${district ? ` — ${district}` : ''}`, req });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'यह ईमेल/मोबाइल पहले से किसी सक्रिय खाते में मौजूद है — ट्रांसफ़र के लिए पहले वह पुराना खाता निष्क्रिय करें' });
    throw err;
  }
}

// DELETE /admin/admins/:id   (super_admin only)
async function deleteAdmin(req, res) {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'खुद को हटाया नहीं जा सकता' });
  await db.query(`DELETE FROM admins WHERE id = $1 AND admin_role != 'super_admin'`, [id]);
  res.json({ message: 'हटा दिया गया' });
}

// किसी admin/DSP/ASP/SSP खाते पर action से पहले scope जांच — SSP सिर्फ़ अपने ज़िले के DSP/ASP पर
function isAdminInScope(req, targetRow) {
  if (!targetRow) return true;
  if (req.user.adminRole === 'monitor' && req.user.rank === 'SSP') {
    return targetRow.district === req.user.district;
  }
  // 🆕 IG/DIG — अपने Range (कई ज़िले) के अंदर के SSP/DSP/ASP खातों तक
  if (req.user.adminRole === 'monitor' && ['IG', 'DIG'].includes(req.user.rank) && req.user.rangeDistricts?.length > 0) {
    return req.user.rangeDistricts.includes(targetRow.district);
  }
  return true; // super_admin पर कोई सीमा नहीं
}

// PATCH /admin/admins/:id/status   (super_admin या SSP अपने ज़िले के DSP/ASP के लिए)   body: { isActive }
async function setAdminStatus(req, res) {
  const { id } = req.params;
  const { isActive } = req.body;
  if (id === req.user.id) return res.status(400).json({ error: 'खुद को निष्क्रिय नहीं किया जा सकता' });
  const existing = await db.query('SELECT * FROM admins WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'खाता नहीं मिला' });
  if (existing.rows[0].admin_role === 'super_admin') {
    return res.status(400).json({ error: 'Super Admin खाते को निष्क्रिय नहीं किया जा सकता' });
  }
  if (!isAdminInScope(req, existing.rows[0])) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले के DSP/ASP खाते को सक्रिय/निष्क्रिय कर सकते हैं' });
  }
  const result = await db.query('UPDATE admins SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING *', [!!isActive, id]);
  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: isActive ? 'admin_activated' : 'admin_deactivated', details: `खाता ${result.rows[0].name} को ${isActive ? 'सक्रिय' : 'निष्क्रिय'} किया`, req });
  res.json({ id: result.rows[0].id, name: result.rows[0].name, isActive: result.rows[0].is_active });
}

// POST /admin/admins/:id/transfer   (super_admin या SSP अपने ज़िले के DSP/ASP के लिए)
// body: { district, circleStations?, mobile?, email?, password? }
// पुराना (DSP/ASP/SSP) खाता निष्क्रिय करके नए ज़िले/सर्किल के लिए नया, सक्रिय खाता बनाता है।
async function transferAdmin(req, res) {
  const { id } = req.params;
  const { district, circleStations, rangeDistricts, mobile, email, password } = req.body;

  const existing = await db.query('SELECT * FROM admins WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'खाता नहीं मिला' });
  const old = existing.rows[0];
  if (old.admin_role === 'super_admin') return res.status(400).json({ error: 'Super Admin को ट्रांसफ़र नहीं किया जा सकता' });
  if (!old.is_active) return res.status(400).json({ error: 'यह खाता पहले से निष्क्रिय है' });
  if (!isAdminInScope(req, old)) {
    return res.status(403).json({ error: 'आप सिर्फ़ अपने ज़िले के DSP/ASP खाते को ट्रांसफ़र कर सकते हैं' });
  }

  // 🆕 IG/DIG के लिए एक अकेला ज़िला नहीं, पूरा Range (कई ज़िले) चाहिए — बाक़ी रैंकों
  // के लिए district अब भी अनिवार्य है।
  const isRangeRank = ['IG', 'DIG'].includes(old.rank);
  if (!isRangeRank && !district) return res.status(400).json({ error: 'नया ज़िला आवश्यक है' });
  if (isRangeRank && (!Array.isArray(rangeDistricts) || rangeDistricts.length === 0)) {
    return res.status(400).json({ error: 'IG/DIG के लिए कम से कम एक ज़िला (Range में) चुनना आवश्यक है' });
  }
  // 🐛 बग फ़िक्स: createDistrictAdmin जैसी ही जांच — ये ज़िले असल में मौजूद हों
  if (isRangeRank && Array.isArray(rangeDistricts) && rangeDistricts.length > 0) {
    const validD = await db.query('SELECT DISTINCT district FROM police_stations WHERE district = ANY($1)', [rangeDistricts]);
    const validNames = validD.rows.map((r) => r.district);
    const invalid = rangeDistricts.filter((d) => !validNames.includes(d));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `ये ज़िले सूची में मौजूद नहीं हैं: ${invalid.join(', ')}` });
    }
  }
  if (old.rank === 'DSP' && (!Array.isArray(circleStations) || circleStations.length === 0)) {
    return res.status(400).json({ error: 'DSP के लिए कम से कम एक थाना (सर्किल में) चुनना आवश्यक है' });
  }
  // 🐛 बग फ़िक्स (गंभीर सुरक्षा): createDistrictAdmin जैसी ही जांच यहां भी ज़रूरी है —
  // और ट्रांसफ़र में यह ग़लती और भी आसानी से हो सकती है, क्योंकि ज़िला बदल रहा होता है
  // पर पुराने ज़िले के थाने ग़लती से साथ भेजे जा सकते हैं। बिना जांच के वह अधिकारी
  // दोनों ज़िलों के (एक ही नाम वाले) थानों का डेटा देख पाता।
  if (!isRangeRank && Array.isArray(circleStations) && circleStations.length > 0) {
    const valid = await db.query(
      'SELECT station FROM police_stations WHERE TRIM(LOWER(district)) = TRIM(LOWER($1)) AND station = ANY($2)',
      [district, circleStations]
    );
    const validNames = valid.rows.map((r) => r.station);
    const invalid = circleStations.filter((s) => !validNames.includes(s));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `ये थाने "${district}" ज़िले में नहीं हैं: ${invalid.join(', ')}` });
    }
  }

  const newMobile = mobile !== undefined ? (mobile || null) : old.mobile;
  const newEmail = email !== undefined ? (email || null) : old.email;
  let passwordHash = old.password_hash;
  if (password) {
    const pwErr = validateNewPassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    passwordHash = await bcrypt.hash(password, 12);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE admins SET is_active = false, updated_at = now() WHERE id = $1', [id]);
    const inserted = await client.query(
      `INSERT INTO admins (name, mobile, email, password_hash, admin_role, district, rank, circle_stations, range_districts, menu_permissions, created_by_id, transferred_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        old.name, newMobile, newEmail, passwordHash, old.admin_role, isRangeRank ? null : district, old.rank,
        // 🐛 बग फ़िक्स: createDistrictAdmin जैसी ही चूक यहाँ भी — SSP छूट गया था। इसका
        // नतीजा और गंभीर होता: सही सर्किल-सीमा वाला SSP ट्रांसफ़र होते ही चुपचाप अपनी
        // सीमा खो देता और उसे पूरे ज़िले की दृश्यता मिल जाती।
        JSON.stringify(['DSP', 'ASP', 'SSP'].includes(old.rank) ? (circleStations || []) : []),
        JSON.stringify(isRangeRank ? (rangeDistricts || []) : []),
        old.menu_permissions, req.user.id, old.id,
      ]
    );
    await client.query('COMMIT');
    logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'admin_transferred', details: `${old.name} (${old.rank}) को ${old.district} से ${district} ट्रांसफ़र किया — पुराना खाता निष्क्रिय, नया खाता बना`, req });
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'नए ज़िले के लिए खाता नहीं बन सका — इस मोबाइल/ईमेल से पहले से एक सक्रिय खाता मौजूद है' });
    }
    throw err;
  } finally {
    client.release();
  }
}

// PATCH /admin/admins/:id/menu-permissions   (super_admin only)   body: { menuPermissions: { key: true/false, ... } }
// यह तय करता है कि DSP/ASP/SSP (monitor) खाते को साइड मेनू में कौन-कौन से आइटम दिखें।
// जो key यहाँ true नहीं है, वह आइटम RootNavigator में छिपा रहेगा — permission मिलते ही
// अगली बार लॉगिन/रीफ़्रेश पर वह मेनू में दिखने लगेगा।
async function updateAdminMenuPermissions(req, res) {
  const { id } = req.params;
  const { menuPermissions } = req.body;
  if (!menuPermissions || typeof menuPermissions !== 'object' || Array.isArray(menuPermissions)) {
    return res.status(400).json({ error: 'menuPermissions एक object होना चाहिए' });
  }
  const target = await db.query('SELECT admin_role FROM admins WHERE id = $1', [id]);
  if (target.rows.length === 0) return res.status(404).json({ error: 'खाता नहीं मिला' });
  if (target.rows[0].admin_role !== 'monitor') {
    return res.status(400).json({ error: 'मेनू permissions सिर्फ़ DSP/ASP/SSP (monitor) खातों पर लागू होती हैं' });
  }
  // 🐛 बग फ़िक्स: ऊपर जैसी ही चूक — JSONB कॉलम, client से आता है, गहराई की जांच नहीं थी
  const menuDepthErr = validateJsonDepth(menuPermissions, { label: 'menuPermissions' });
  if (menuDepthErr) return res.status(400).json({ error: menuDepthErr });
  const result = await db.query(
    'UPDATE admins SET menu_permissions = $1 WHERE id = $2 RETURNING id, name, menu_permissions',
    [JSON.stringify(menuPermissions), id]
  );
  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'admin_menu_permissions_updated', details: `${result.rows[0].name} की मेनू permissions बदली गईं`, req });
  res.json({ id: result.rows[0].id, name: result.rows[0].name, menuPermissions: result.rows[0].menu_permissions });
}

// GET /admin/officer-status-overview
// एक ही जगह — कितने officers उपलब्ध/छुट्टी/अन्य ड्यूटी/ज़िले से बाहर हैं (live, icon के साथ दिखाने के लिए)
async function getOfficerStatusOverview(req, res) {
  let districtFilter = '';
  let params = [];
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params = [req.adminScope.rangeDistricts];
    districtFilter = ' AND district = ANY($1)';
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    params = [req.adminScope.circleStations, req.adminScope.district || null];
    districtFilter = ' AND station = ANY($1) AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2)))';
  } else if (req.adminScope?.district) {
    params = [req.adminScope.district];
    districtFilter = ' AND district = $1';
  }

  const result = await db.query(
    `SELECT id, name, badge_id, station, district, duty_status, mobile, rank
     FROM officers WHERE is_active = true ${districtFilter}
     ORDER BY duty_status, name`,
    params
  );

  const grouped = { 'उपलब्ध': [], 'अवकाश पर': [], 'अन्य ड्यूटी पर': [], 'ज़िले से बाहर': [] };
  for (const o of result.rows) {
    const officer = { id: o.id, name: o.name, badgeId: o.badge_id, station: o.station, district: o.district, mobile: o.mobile, rank: o.rank };
    if (grouped[o.duty_status]) grouped[o.duty_status].push(officer);
    else grouped['उपलब्ध'].push(officer); // पुराना/अमान्य status हो तो भी सूची से गायब न हो
  }

  res.json({
    counts: {
      'उपलब्ध': grouped['उपलब्ध'].length,
      'अवकाश पर': grouped['अवकाश पर'].length,
      'अन्य ड्यूटी पर': grouped['अन्य ड्यूटी पर'].length,
      'ज़िले से बाहर': grouped['ज़िले से बाहर'].length,
    },
    total: result.rows.length,
    groups: grouped,
    updatedAt: new Date().toISOString(),
  });
}

module.exports = {
  listAllOfficers,
  createOfficer,
  updateOfficer,
  transferOfficer,
  setAdminStatus,
  transferAdmin,
  setOfficerStatus,
  updateOfficerPermissions,
  deleteOfficer,
  getMyAdminProfile,
  updateMyAdminProfile,
  updateMyAdminPhoto,
  changeAdminPassword,
  updateAdminPushToken,
  getCategoryStats,
  listActivityLogs,
  listAdmins,
  createDistrictAdmin,
  deleteAdmin,
  updateAdminMenuPermissions,
  bulkImportOfficers,
  getOfficerStatusOverview,
  updateOfficerRank,
  createSHOByDSP,
  listDeletionRequests,
  reviewDeletionRequest,
};

// ============================================================
// 🆕 खाता हटाने के अनुरोध (DPDP Act) — सिर्फ़ Super Admin समीक्षा कर सकते हैं,
// क्योंकि approve होने पर नागरिक की व्यक्तिगत जानकारी हमेशा के लिए अज्ञात
// (anonymize) हो जाती है — यह एक गंभीर, अपरिवर्तनीय कार्रवाई है।
// ============================================================

// GET /admin/deletion-requests?status=pending
async function listDeletionRequests(req, res) {
  if (req.user.adminRole !== 'super_admin') {
    return res.status(403).json({ error: 'यह सुविधा सिर्फ़ Super Admin के लिए है' });
  }
  const status = req.query.status || 'pending';
  const result = await db.query(
    `SELECT r.*, c.name AS citizen_name, c.mobile AS citizen_mobile
     FROM account_deletion_requests r JOIN citizens c ON c.id = r.citizen_id
     WHERE r.status = $1 ORDER BY r.requested_at ASC`,
    [status]
  );
  res.json(
    result.rows.map((r) => ({
      id: r.id,
      citizenId: r.citizen_id,
      citizenName: r.citizen_name,
      citizenMobile: r.citizen_mobile,
      status: r.status,
      reason: r.reason,
      requestedAt: r.requested_at,
      reviewedAt: r.reviewed_at,
      reviewNote: r.review_note,
    }))
  );
}

// PATCH /admin/deletion-requests/:id   body: { decision: 'approved'|'rejected', reviewNote? }
async function reviewDeletionRequest(req, res) {
  if (req.user.adminRole !== 'super_admin') {
    return res.status(403).json({ error: 'यह सुविधा सिर्फ़ Super Admin के लिए है' });
  }
  const { id } = req.params;
  const { decision, reviewNote } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision "approved" या "rejected" होना चाहिए' });
  }
  const noteErr = validateTextLength(reviewNote, { max: 500, label: 'टिप्पणी' });
  if (noteErr) return res.status(400).json({ error: noteErr });

  // 🐛 बग फ़िक्स (race condition): पहले सिर्फ़ SELECT करके फिर अलग से UPDATE होता था।
  // अगर दो Super Admin एक साथ एक ही pending अनुरोध पर निर्णय लें (दोनों "approved"
  // दबाएं, या एक "approved" व दूसरा "rejected"), दोनों को अभी भी "pending" ही
  // दिखता, दोनों सफल हो जाते। नागरिक-डेटा को अनाम करना खुद तो दोबारा चलने पर भी
  // सुरक्षित (idempotent) है, पर DPDP जैसे कानूनी-अनुपालन के लिए "किसने असल में
  // मंज़ूरी दी" स्पष्ट रहना ज़रूरी है — इसलिए अब row-lock से सुनिश्चित करते हैं।
  const client = await db.getClient();
  let citizenId;
  try {
    await client.query('BEGIN');
    const reqRow = await client.query(
      'SELECT * FROM account_deletion_requests WHERE id = $1 AND status = $2 FOR UPDATE',
      [id, 'pending']
    );
    if (reqRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'अनुरोध नहीं मिला या पहले ही निपटाया जा चुका है' });
    }
    citizenId = reqRow.rows[0].citizen_id;

    await client.query(
      `UPDATE account_deletion_requests SET status = $1, reviewed_by = $2, reviewed_by_name = $3, review_note = $4, reviewed_at = now() WHERE id = $5`,
      [decision, req.user.id, req.user.name, reviewNote || null, id]
    );

    if (decision === 'approved') {
      // 🔒 शिकायतें कानूनी दस्तावेज़ हैं इसलिए हटाई नहीं जातीं — सिर्फ़ खाते की
      // व्यक्तिगत पहचान वाली जानकारी अज्ञात (anonymize) होती है, और खाता लॉगिन के
      // लिए स्थायी रूप से निष्क्रिय हो जाता है
      await client.query(
        `UPDATE citizens SET
           name = 'हटाया गया उपयोगकर्ता', father_name = NULL, address = NULL,
           photo_url = NULL, emergency_contacts = '[]', push_token = NULL,
           -- 🐛 बग फ़िक्स (निजता — DPDP): ईमेल फ़ील्ड बाद में जोड़ी गई थी, पर यह
           -- अनामीकरण वाला हिस्सा तब अपडेट नहीं हुआ। नतीजा: जिस नागरिक ने अपना डेटा
           -- मिटाने का अधिकार इस्तेमाल किया, उसका ईमेल फिर भी database में पड़ा रहता —
           -- जबकि ईमेल सीधी व्यक्तिगत पहचान है, और यही मिटाना पूरे अधिकार का मक़सद है।
           -- मोबाइल की तरह इसे भी अद्वितीय बनाकर हटाते हैं (सीधे NULL करने पर वही
           -- ईमेल दोबारा इस्तेमाल हो सकता, जिससे पुराना खाता जुड़ा दिख सकता था)।
           email = CASE WHEN email IS NULL THEN NULL ELSE CONCAT('deleted-', id, '@removed.invalid') END,
           mobile = CONCAT('deleted-', id), is_active = false
         WHERE id = $1`,
        [citizenId]
      );
      // 🐛 बग फ़िक्स (निजता — DPDP): खाता निष्क्रिय होने से नई लोकेशन आना तो रुक जाता
      // है (उनका token अब काम नहीं करेगा), पर live_share_active सही रहता — यानी
      // अधिकारियों को उस शिकायत पर हमेशा "लाइव ट्रैकिंग चालू" दिखता रहता, और उनकी
      // आख़िरी GPS स्थिति मौजूदा स्थिति समझकर दिखती रहती। जिस व्यक्ति ने अपना डेटा
      // मिटाने का अधिकार इस्तेमाल किया, उसकी जगह इस तरह दिखते रहना उसी अधिकार के
      // ख़िलाफ़ है। (शिकायत व दर्ज ट्रेल क़ानूनी रिकॉर्ड के तौर पर बने रहते हैं —
      // सिर्फ़ "लाइव स्थिति" दिखाना बंद होता है।)
      await client.query(
        `UPDATE complaints SET live_share_active = false, live_lat = NULL, live_lng = NULL, live_accuracy = NULL
         WHERE citizen_id = $1 AND live_share_active = true`,
        [citizenId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  logActivity({
    actorRole: 'admin', actorId: req.user.id, actorName: req.user.name,
    action: decision === 'approved' ? 'deletion_approved' : 'deletion_rejected',
    details: `खाता-हटाने का अनुरोध ${id} — नागरिक ${citizenId}`, req,
  });
  res.json({ message: decision === 'approved' ? 'खाता हटा दिया गया' : 'अनुरोध अस्वीकृत किया गया' });
}
