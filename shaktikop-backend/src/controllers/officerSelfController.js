const db = require('../config/db');
const { logActivity } = require('../utils/activityLog');
const { validateName, validateMobile, validateTextLength, validateUrl, validateDateString, validatePushToken } = require('../utils/fieldValidators');
const { timingSafeVerify } = require('../utils/timingSafeAuth');
const { revokeAllForUser } = require('../utils/refreshToken');
const { encryptField, decryptField } = require('../utils/fieldCrypto');

// 🔒 फील्ड-विज़िट का GPS अब encrypted रहता है (बाक़ी हर GPS की तरह) — पढ़ते समय
// संख्या में वापस बदलना पड़ता है। complaintController के decryptGeo जैसा ही।
function decryptGeo(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(decryptField(value));
  return Number.isNaN(n) ? null : n;
}

// निजी नोट्स/फील्ड-विज़िट किसी complaint से जुड़ी संवेदनशील/गोपनीय जानकारी हैं — इन्हें सिर्फ़
// वही देख/जोड़ सके जो वैसे भी उस complaint को canViewComplaint से देख सकता है (नियुक्त अधिकारी,
// उसी थाने का SHO, या scope में आने वाला admin) — कोई भी अनजान complaintId भेजकर न पढ़ सके।
async function assertComplaintAccess(req, complaintId) {
  const { canViewComplaint } = require('./complaintController');
  const row = await db.query(
    'SELECT district, police_station, citizen_id, officer_id FROM complaints WHERE id = $1 AND deleted_at IS NULL',
    [complaintId]
  );
  if (row.rows.length === 0) return { ok: false, code: 404, error: 'शिकायत नहीं मिली' };
  if (!canViewComplaint(req, row.rows[0])) {
    return { ok: false, code: 403, error: 'इस शिकायत तक आपकी पहुंच नहीं है' };
  }
  return { ok: true };
}

function toOfficerSelf(o) {
  return {
    id: o.id,
    name: o.name,
    badgeId: o.badge_id,
    mobile: o.mobile,
    station: o.station,
    district: o.district,
    rank: o.rank,
    dutyStatus: o.duty_status,
    permissions: o.permissions,
    notificationPreferences: o.notification_preferences,
    photoUrl: o.photo_url,
  };
}

// GET /officers/me
async function getMyOfficerProfile(req, res) {
  const result = await db.query('SELECT * FROM officers WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'प्रोफ़ाइल नहीं मिली' });
  res.json(toOfficerSelf(result.rows[0]));
}

// PATCH /officers/me/photo   body: { photoUrl }   — वैकल्पिक प्रोफ़ाइल फ़ोटो
async function updateMyOfficerPhoto(req, res) {
  const { photoUrl } = req.body;
  // 🆕 पहले यहां कोई जांच नहीं थी (नागरिक/बैनर वाले equivalent endpoints में थी) —
  // असीमित आकार का base64 या javascript: जैसा scheme भी बिना रोक-टोक सेव हो जाता
  if (photoUrl) {
    const urlErr = validateUrl(photoUrl, { label: 'फ़ोटो', allowDataUri: true });
    if (urlErr) return res.status(400).json({ error: urlErr });
  }
  const result = await db.query(
    'UPDATE officers SET photo_url = $1 WHERE id = $2 RETURNING *',
    [photoUrl || null, req.user.id]
  );
  res.json(toOfficerSelf(result.rows[0]));
}

// GET /officers/for-transfer   (officer only) — खुद को छोड़कर बाकी सक्रिय अधिकारी
// 🐛 बग फ़िक्स (क्षेत्राधिकार): पहले यह पूरे राज्य के सभी सक्रिय अधिकारी लौटाता था —
// यानी UI खुद ही लखनऊ के अधिकारी को यह विकल्प देता कि वह मामला आगरा के अधिकारी को
// स्थानांतरित कर दे। ऐसा होने पर मामला अपने सही क्षेत्राधिकार से पूरी तरह बाहर चला
// जाता और पीड़िता की स्थानीय पुलिस उस पर काम ही नहीं कर पाती। अब सिर्फ़ अपने ही ज़िले
// के अधिकारी — इससे ज़िले के अंदर ग़लत थाने का सुधार अब भी संभव है (जो वाजिब ज़रूरत
// है), पर मामला ज़िले से बाहर नहीं जा सकता।
async function listOfficersForTransfer(req, res) {
  const result = await db.query(
    `SELECT id, name, badge_id, station, district FROM officers
     WHERE is_active = true AND id != $1
       AND TRIM(LOWER(district)) = TRIM(LOWER($2))
     ORDER BY name`,
    [req.user.id, req.user.district || '']
  );
  res.json(result.rows.map((o) => ({ id: o.id, name: o.name, badgeId: o.badge_id, station: o.station, district: o.district })));
}

// PATCH /officers/me/push-token   body: { pushToken }
async function updatePushToken(req, res) {
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
      db.query('UPDATE officers SET push_token = NULL WHERE push_token = $1 AND id <> $2', [pushToken, req.user.id]),
      db.query('UPDATE citizens SET push_token = NULL WHERE push_token = $1', [pushToken]),
      db.query('UPDATE admins SET push_token = NULL WHERE push_token = $1', [pushToken]),
      db.query('UPDATE service_providers SET push_token = NULL WHERE push_token = $1', [pushToken]),
    ]);
  }
  await db.query('UPDATE officers SET push_token = $1 WHERE id = $2', [pushToken || null, req.user.id]);
  res.json({ message: 'सुरक्षित हुआ' });
}

// PATCH /officers/me/duty-status   body: { dutyStatus }
async function updateDutyStatus(req, res) {
  const { dutyStatus } = req.body;
  const allowed = ['उपलब्ध', 'अवकाश पर', 'अन्य ड्यूटी पर', 'ज़िले से बाहर'];
  if (!allowed.includes(dutyStatus)) {
    return res.status(400).json({ error: 'अमान्य ड्यूटी स्टेटस' });
  }
  const result = await db.query('UPDATE officers SET duty_status = $1 WHERE id = $2 RETURNING *', [dutyStatus, req.user.id]);
  res.json(toOfficerSelf(result.rows[0]));
}

// ============================================================
// Phase H — Performance Metrics
// ============================================================

// GET /officers/me/performance
// 🆕 GET /officers/me/performance?dateFrom=&dateTo=&category=&status= — पहले कोई
// फ़िल्टर नहीं थे, हमेशा हर समय का पूरा (all-time) आंकड़ा दिखता था। अब अधिकारी भी
// अपनी पिछले महीने/तिमाही/किसी श्रेणी की कार्यक्षमता अलग से देख सकते हैं।
async function getMyPerformance(req, res) {
  const { dateFrom, dateTo, category, status } = req.query;
  const clauseErrors = [];
  if (dateFrom) {
    const e = validateDateString(dateFrom, { label: 'dateFrom' });
    if (e) clauseErrors.push(e);
  }
  if (dateTo) {
    const e = validateDateString(dateTo, { label: 'dateTo' });
    if (e) clauseErrors.push(e);
  }
  if (clauseErrors.length > 0) return res.status(400).json({ error: clauseErrors[0] });

  const params = [req.user.id];
  let clause = '';
  if (dateFrom) {
    params.push(dateFrom);
    clause += ` AND created_at >= $${params.length}::date`;
  }
  if (dateTo) {
    params.push(dateTo);
    clause += ` AND created_at < ($${params.length}::date + interval '1 day')`;
  }
  if (category) {
    params.push(category);
    clause += ` AND category = $${params.length}`;
  }
  if (status) {
    params.push(status);
    clause += ` AND status = $${params.length}`;
  }

  const result = await db.query(
    `SELECT
       count(*) AS total_assigned,
       count(*) FILTER (WHERE status = 'निस्तारित') AS resolved,
       count(*) FILTER (WHERE status = 'अस्वीकृत') AS rejected,
       count(*) FILTER (WHERE status = 'अधिकारी नियुक्त') AS assigned,
       count(*) FILTER (WHERE status = 'कार्यवाही जारी') AS in_progress,
       avg(EXTRACT(EPOCH FROM (COALESCE(resolved_at, updated_at) - created_at)) / 3600) FILTER (WHERE status = 'निस्तारित') AS avg_resolution_hours,
       avg(feedback_rating) FILTER (WHERE feedback_rating IS NOT NULL) AS avg_rating,
       count(feedback_rating) AS rating_count
     FROM complaints WHERE officer_id = $1 ${clause}`,
    params
  );
  const r = result.rows[0];

  // पिछले 6 महीनों का trend (फ़िल्टर से अलग — हमेशा हाल की प्रवृत्ति दिखाता है)
  const monthly = await db.query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            count(*) AS total, count(*) FILTER (WHERE status = 'निस्तारित') AS resolved
     FROM complaints WHERE officer_id = $1 AND created_at >= now() - interval '6 months'
     GROUP BY 1 ORDER BY 1 ASC`,
    [req.user.id]
  );

  const byCategory = await db.query(
    `SELECT category, count(*) AS total FROM complaints WHERE officer_id = $1 ${clause} GROUP BY category ORDER BY total DESC`,
    params
  );

  res.json({
    totalAssigned: Number(r.total_assigned),
    resolved: Number(r.resolved),
    rejected: Number(r.rejected),
    // 🆕 पहले "अधिकारी नियुक्त" और "कार्यवाही जारी" एक साथ active में जुड़े थे —
    // OfficerHomeScreen के dashboard-cards को "लंबित" के लिए सिर्फ़ "अधिकारी नियुक्त"
    // चाहिए (कार्यवाही जारी अलग है) — अब दोनों अलग-अलग भी उपलब्ध, active अब भी
    // पीछे-मेल के लिए बना है (पुराने उपयोग टूटें नहीं)।
    assigned: Number(r.assigned),
    inProgress: Number(r.in_progress),
    active: Number(r.assigned) + Number(r.in_progress),
    avgResolutionHours: r.avg_resolution_hours ? Number(r.avg_resolution_hours).toFixed(1) : null,
    avgRating: r.avg_rating ? Number(r.avg_rating).toFixed(1) : null,
    ratingCount: Number(r.rating_count),
    monthlyTrend: monthly.rows.map((m) => ({ month: m.month, total: Number(m.total), resolved: Number(m.resolved) })),
    byCategory: byCategory.rows.map((c) => ({ category: c.category, total: Number(c.total) })),
  });
}

// GET /officers/me/station-performance   (SHO only) — पूरे थाने का सारांश,
// सिर्फ़ अपनी शिकायतें नहीं (getMyPerformance से अलग — वह सिर्फ़ खुद तक सीमित है)
async function getStationPerformance(req, res) {
  if (req.user.rank !== 'SHO') {
    return res.status(403).json({ error: 'यह सुविधा सिर्फ़ थाना प्रभारी (SHO) के लिए है' });
  }
  const me = await db.query('SELECT station, district FROM officers WHERE id = $1', [req.user.id]);
  const { station, district } = me.rows[0] || {};
  if (!station) return res.status(400).json({ error: 'आपके प्रोफ़ाइल में थाना सेट नहीं है' });

  // 🐛 बग फ़िक्स (गंभीर — उपयोगकर्ता-रिपोर्ट): पहले 'overall' सिर्फ़ complaints की
  // अपनी police_station टेक्स्ट-फ़ील्ड से मिलान करता था, जबकि 'byOfficer' अधिकारी की
  // officer_id के ज़रिए जोड़ (JOIN) करता था — दो अलग-अलग तरीक़े! नतीजा: अगर किसी
  // शिकायत का अपना police_station टेक्स्ट, नियुक्त अधिकारी के मौजूदा station फ़ील्ड
  // से हल्का भी अलग (वर्तनी/स्पेस) हो, तो वह शिकायत byOfficer में गिनी जाती (सही ढंग
  // से नियुक्त होने के कारण), पर overall के कुल आंकड़ों से पूरी तरह ग़ायब हो जाती —
  // ठीक वही विसंगति जो असली इस्तेमाल में सामने आई (कुल-योग "0", पर byOfficer में
  // असली संख्याएं)। अब overall भी उन्हीं शिकायतों को गिनता है — अपने police_station
  // टेक्स्ट से मेल खाने वाली (जिनमें अभी तक कोई अधिकारी नियुक्त नहीं हुआ, "दर्ज"
  // स्थिति में), OR इस थाने के किसी वर्तमान-सक्रिय अधिकारी को नियुक्त की गई हों।
  const overall = await db.query(
    `SELECT
       count(*) AS total,
       count(*) FILTER (WHERE status = 'दर्ज') AS pending,
       count(*) FILTER (WHERE status IN ('अधिकारी नियुक्त','कार्यवाही जारी')) AS active,
       count(*) FILTER (WHERE status = 'निस्तारित') AS resolved,
       count(*) FILTER (WHERE status = 'अस्वीकृत') AS rejected,
       count(*) FILTER (WHERE status NOT IN ('निस्तारित','अस्वीकृत') AND created_at < now() - interval '48 hours') AS overdue,
       avg(EXTRACT(EPOCH FROM (COALESCE(resolved_at, updated_at) - created_at)) / 3600) FILTER (WHERE status = 'निस्तारित') AS avg_resolution_hours
     FROM complaints c
     WHERE (TRIM(LOWER(c.police_station)) = TRIM(LOWER($1)) AND ($2::text IS NULL OR c.district = $2))
        OR c.officer_id IN (
             SELECT id FROM officers WHERE TRIM(LOWER(station)) = TRIM(LOWER($1)) AND is_active = true
               AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2)))
           )`,
    [station, district || null]
  );

  // हर अधिकारी (SI/SHO) की अपनी-अपनी संख्या — किसकी कार्यक्षमता कैसी है, एक नज़र में
  // 🐛 बग फ़िक्स: यहां भी ज़िला छूट गया था — "कोतवाली" 65 ज़िलों में है, इसलिए दूसरे
  // ज़िलों के उसी नाम वाले थानों के अधिकारी भी इस सूची में आ जाते।
  const byOfficer = await db.query(
    `SELECT o.id, o.name, o.badge_id, o.rank,
       count(c.id) FILTER (WHERE c.status NOT IN ('निस्तारित','अस्वीकृत')) AS active,
       count(c.id) FILTER (WHERE c.status = 'निस्तारित') AS resolved
     FROM officers o
     LEFT JOIN complaints c ON c.officer_id = o.id
     WHERE TRIM(LOWER(o.station)) = TRIM(LOWER($1)) AND o.is_active = true
       AND ($2::text IS NULL OR TRIM(LOWER(o.district)) = TRIM(LOWER($2)))
     GROUP BY o.id, o.name, o.badge_id, o.rank
     ORDER BY resolved DESC`,
    [station, district || null]
  );

  const r = overall.rows[0];
  res.json({
    station,
    district,
    total: Number(r.total),
    pending: Number(r.pending),
    active: Number(r.active),
    resolved: Number(r.resolved),
    rejected: Number(r.rejected),
    overdue: Number(r.overdue),
    avgResolutionHours: r.avg_resolution_hours ? Number(r.avg_resolution_hours).toFixed(1) : null,
    officers: byOfficer.rows.map((o) => ({
      id: o.id,
      name: o.name,
      badgeId: o.badge_id,
      rank: o.rank,
      active: Number(o.active),
      resolved: Number(o.resolved),
    })),
  });
}

// PATCH /officers/me/notification-preferences   body: { newComplaint?, sos?, overdue?, assigned? }
// कौन सी सूचनाएं चाहिए — हर officer अपनी पसंद खुद तय कर सकता है
async function updateNotificationPreferences(req, res) {
  const { newComplaint, sos, overdue, assigned } = req.body;
  const current = await db.query('SELECT notification_preferences FROM officers WHERE id = $1', [req.user.id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'प्रोफ़ाइल नहीं मिली' });
  const existing = current.rows[0].notification_preferences || {};
  const updated = {
    newComplaint: newComplaint !== undefined ? !!newComplaint : (existing.newComplaint ?? true),
    sos: sos !== undefined ? !!sos : (existing.sos ?? true),
    overdue: overdue !== undefined ? !!overdue : (existing.overdue ?? true),
    assigned: assigned !== undefined ? !!assigned : (existing.assigned ?? true),
  };
  await db.query('UPDATE officers SET notification_preferences = $1 WHERE id = $2', [JSON.stringify(updated), req.user.id]);
  res.json(updated);
}

// ============================================================
// Phase H — Emergency Backup Request (फील्ड में अधिकारी की सुरक्षा)
// ============================================================

// POST /officers/me/backup-request   body: { complaintId, latitude, longitude, message }
async function requestBackup(req, res) {
  const { complaintId, latitude, longitude, message } = req.body;
  const { sendPushNotification } = require('../utils/push');
  const { createNotification } = require('../utils/notify');

  // 🐛 बग फ़िक्स: यह पूरे राज्य के हर admin को सूचना भेजता था — लखनऊ के अधिकारी की
  // "तुरंत मदद चाहिए" पुकार आगरा के DSP तक भी पहुंचती, जो कुछ कर ही नहीं सकता। इससे
  // जो admin असल में मदद कर सकते हैं, उनके लिए भी ऐसे अलर्ट का महत्व घट जाता है।
  // अब वही ज़िला-आधारित पैटर्न जो पहले triggerSos आदि में अपनाया जा चुका है —
  // राज्य-स्तर के admin (district IS NULL — super_admin/IG/DIG) हमेशा शामिल रहते हैं।
  const admins = await db.query(
    'SELECT id, push_token FROM admins WHERE is_active = true AND (district IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($1)))',
    [req.user.district || '']
  );
  const mapsLink = latitude && longitude ? ` लोकेशन: https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}` : '';
  const bodyText = `${req.user.name} ने तुरंत सहायता माँगी है${complaintId ? ` (शिकायत ${complaintId})` : ''}.${mapsLink} ${message || ''}`.trim();
  for (const a of admins.rows) {
    if (a.push_token) {
      sendPushNotification(a.push_token, '🆘 अधिकारी को Backup चाहिए', bodyText, { officerBackupRequest: true, officerId: req.user.id });
    }
    createNotification({ recipientRole: 'admin', recipientId: a.id, title: '🆘 अधिकारी को Backup चाहिए', body: bodyText, data: { officerBackupRequest: true, complaintId }, priority: 'critical' });
  }
  logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: 'backup_requested', details: `${message || 'तुरंत सहायता चाहिए'} ${mapsLink}`, req });
  res.json({ message: 'Backup अनुरोध सभी एडमिन को भेज दिया गया है' });
}

// ============================================================
// Phase H — निजी टिप्पणियां (नागरिक को नहीं दिखतीं)
// ============================================================

// GET /complaints/:complaintId/private-notes   (officer/admin)
async function listPrivateNotes(req, res) {
  const { complaintId } = req.params;
  const access = await assertComplaintAccess(req, complaintId);
  if (!access.ok) return res.status(access.code).json({ error: access.error });
  const result = await db.query(
    'SELECT * FROM officer_private_notes WHERE complaint_id = $1 ORDER BY created_at DESC',
    [complaintId]
  );
  res.json(result.rows.map((r) => ({ id: r.id, officerName: r.officer_name, note: r.note, createdAt: r.created_at })));
}

// POST /complaints/:complaintId/private-notes   (officer only)   body: { note }
async function addPrivateNote(req, res) {
  const { complaintId } = req.params;
  const { note } = req.body;
  if (!note || !note.trim()) return res.status(400).json({ error: 'टिप्पणी खाली नहीं हो सकती' });
  const noteErr = validateTextLength(note, { max: 1000, label: 'टिप्पणी' });
  if (noteErr) return res.status(400).json({ error: noteErr });
  const access = await assertComplaintAccess(req, complaintId);
  if (!access.ok) return res.status(access.code).json({ error: access.error });
  const result = await db.query(
    `INSERT INTO officer_private_notes (complaint_id, officer_id, officer_name, note) VALUES ($1,$2,$3,$4) RETURNING *`,
    [complaintId, req.user.id, req.user.name, note.trim()]
  );
  const r = result.rows[0];
  res.status(201).json({ id: r.id, officerName: r.officer_name, note: r.note, createdAt: r.created_at });
}

// ============================================================
// Phase H — फील्ड विज़िट GPS चेक-इन
// ============================================================

// GET /complaints/:complaintId/field-visits   (officer/admin)
async function listFieldVisits(req, res) {
  const { complaintId } = req.params;
  const access = await assertComplaintAccess(req, complaintId);
  if (!access.ok) return res.status(access.code).json({ error: access.error });
  const result = await db.query(
    'SELECT * FROM field_visits WHERE complaint_id = $1 ORDER BY created_at DESC',
    [complaintId]
  );
  res.json(
    result.rows.map((r) => ({
      id: r.id,
      officerName: r.officer_name,
      latitude: decryptGeo(r.latitude),
      longitude: decryptGeo(r.longitude),
      note: r.note,
      createdAt: r.created_at,
    }))
  );
}

// POST /complaints/:complaintId/field-visits   (officer only)   body: { latitude, longitude, note }
async function addFieldVisit(req, res) {
  const { complaintId } = req.params;
  const { latitude, longitude, note } = req.body;
  // 🐛 बग फ़िक्स: पहले सिर्फ़ "खाली नहीं है" जांचा जाता था — "latitude: 'abc'" जैसा
  // ग़ैर-संख्या मान भी पास हो जाता, और location-history में एक टूटी हुई entry बन जाती।
  // अब असली संख्या और वैध भौगोलिक सीमा (-90..90, -180..180) दोनों जांचे जाते हैं।
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'मान्य लोकेशन (latitude/longitude) आवश्यक है' });
  }
  const noteErr = validateTextLength(note, { max: 500, label: 'टिप्पणी' });
  if (noteErr) return res.status(400).json({ error: noteErr });
  const access = await assertComplaintAccess(req, complaintId);
  if (!access.ok) return res.status(access.code).json({ error: access.error });
  const result = await db.query(
    `INSERT INTO field_visits (complaint_id, officer_id, officer_name, latitude, longitude, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [complaintId, req.user.id, req.user.name, encryptField(String(lat)), encryptField(String(lng)), note || null]
  );
  logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: 'field_visit_checkin', details: `शिकायत ${complaintId} पर फील्ड विज़िट चेक-इन`, req });
  const r = result.rows[0];
  res.status(201).json({ id: r.id, officerName: r.officer_name, latitude: decryptGeo(r.latitude), longitude: decryptGeo(r.longitude), note: r.note, createdAt: r.created_at });
}

// ============================================================
// SHO (थाना प्रभारी) — अपने थाने में नया SI (जांचकर्ता) बना सकता है
// ============================================================
const bcrypt = require('bcryptjs');

const { validateNewPassword } = require('../utils/passwordPolicy');
// POST /officers/me/create-officer   (SHO only)   body: { name, pno, mobile, email, password, designation }
// 🆕 GET /officers/me/station-officers   (SHO only) — SHO के अपने थाने के सभी अधिकारी
// यह पहले मौजूद ही नहीं था — SHO नया अधिकारी बना तो सकता था, पर बनाए हुए अधिकारियों
// को देखने/बदलने के लिए कोई स्क्रीन/endpoint ही नहीं था।
async function listMyStationOfficers(req, res) {
  const sho = await db.query('SELECT station, district FROM officers WHERE id = $1', [req.user.id]);
  const { station, district } = sho.rows[0] || {};
  if (!station) return res.status(400).json({ error: 'आपके प्रोफ़ाइल में थाना सेट नहीं है' });
  // ⚠️ जानबूझकर is_active पर फ़िल्टर नहीं किया — अगर सिर्फ़ सक्रिय दिखाएं, तो ग़लती से
  // निष्क्रिय किए गए अधिकारी को वापस सक्रिय करने का कोई रास्ता ही नहीं बचेगा (वे सूची से
  // पूरी तरह गायब हो जाएंगे)। इसकी बजाय सक्रिय अधिकारी पहले दिखते हैं, निष्क्रिय बाद में
  // (नीचे "निष्क्रिय" लेबल के साथ) — ताकि दोनों तक पहुंच बनी रहे।
  // 🐛 बग फ़िक्स (गंभीर): पहले सिर्फ़ थाने के नाम से मिलान होता था। "कोतवाली" जैसे आम
  // नाम अब 65 ज़िलों में मौजूद हैं — यानी "कोतवाली" के SHO को उन सभी ज़िलों के अधिकारी
  // दिखते, और वह उन्हें बदल/निष्क्रिय/ट्रांसफ़र तक कर सकता था। अब ज़िला भी मिलाया जाता है।
  const result = await db.query(
    `SELECT id, name, badge_id, mobile, email, rank, designation, duty_status, is_active, created_at
     FROM officers WHERE TRIM(LOWER(station)) = TRIM(LOWER($1))
       AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2)))
     ORDER BY is_active DESC, (rank = 'SHO') DESC, name`,
    [station, district || null]
  );
  res.json(
    result.rows.map((o) => ({
      id: o.id,
      name: o.name,
      badgeId: o.badge_id,
      mobile: o.mobile,
      email: o.email,
      rank: o.rank,
      designation: o.designation,
      dutyStatus: o.duty_status,
      isActive: o.is_active,
      createdAt: o.created_at,
    }))
  );
}

// अपने थाने के अधिकारी पर ही कार्रवाई हो, यह जांचना — बाकी हर जगह जैसा पैटर्न
async function assertSameStation(req, officerId) {
  const [me, target] = await Promise.all([
    db.query('SELECT station, district FROM officers WHERE id = $1', [req.user.id]),
    // 🆕 rank भी लाते हैं — नीचे बुलाने वाले यह जांच सकें कि निशाना बना अधिकारी
    // मातहत है या बराबरी वाला (peer) SHO (देखें assertNotPeerSho)
    db.query('SELECT station, district, rank FROM officers WHERE id = $1', [officerId]),
  ]);
  if (target.rows.length === 0) return { ok: false, code: 404, error: 'अधिकारी नहीं मिला' };
  const myStation = (me.rows[0]?.station || '').trim().toLowerCase();
  const theirStation = (target.rows[0]?.station || '').trim().toLowerCase();
  // 🐛 बग फ़िक्स (गंभीर): यह पूरे station-officer प्रबंधन का मुख्य अनुमति-द्वार है, पर
  // सिर्फ़ थाने का नाम मिलाता था। "कोतवाली" जैसे नाम अब 65 ज़िलों में हैं — यानी एक
  // ज़िले के "कोतवाली" का SHO दूसरे 65 ज़िलों के "कोतवाली" अधिकारियों को बदल/निष्क्रिय/
  // ट्रांसफ़र कर सकता था। अब ज़िला भी मिलाया जाता है।
  const myDistrict = (me.rows[0]?.district || '').trim().toLowerCase();
  const theirDistrict = (target.rows[0]?.district || '').trim().toLowerCase();
  if (!myStation || myStation !== theirStation || (myDistrict && theirDistrict && myDistrict !== theirDistrict)) {
    return { ok: false, code: 403, error: 'यह अधिकारी आपके थाने का नहीं है' };
  }
  return { ok: true, targetRank: target.rows[0].rank };
}

// 🐛 बग फ़िक्स (अधिकार-चूक): assertSameStation सिर्फ़ थाना जांचता था, rank नहीं।
// एक थाने में एक से ज़्यादा SHO हो सकते हैं (डेटाबेस में इसे रोकने वाली कोई शर्त
// नहीं है, और तबादले/कार्यभार-हस्तांतरण के दौरान यह होता ही है)। इसलिए एक SHO
// दूसरे SHO को निष्क्रिय कर सकता था — यानी बराबरी वाले साथी को ऐप से बाहर कर देना —
// या उसका नाम/PNO बदल सकता था। यह वही श्रेणी की चूक है जिसे यह कोडबेस पहले से
// मानता है: खुद का तबादला/निष्क्रिय करना मना है ("वरिष्ठ अधिकारी से संपर्क करें")।
// SHO का दायरा अपने मातहत (SI/कांस्टेबल) तक ही है, बराबरी वालों तक नहीं।
function assertNotPeerSho(check) {
  if (check.targetRank === 'SHO') {
    return { ok: false, code: 403, error: 'दूसरे थाना प्रभारी (SHO) पर कार्रवाई नहीं कर सकते — इसके लिए वरिष्ठ अधिकारी से संपर्क करें' };
  }
  return { ok: true };
}

// PATCH /officers/me/station-officers/:id   (SHO only) — नाम/मोबाइल बदलना
// PATCH /officers/me/station-officers/:id   (SHO only) — नाम/PNO बदलना
// 🐛 बदलाव (उपयोगकर्ता-अनुरोध): पहले मोबाइल-नंबर भी यहीं से बदला जा सकता था — अब
// नहीं। मोबाइल हर अधिकारी की एक अनूठी, स्थिर पहचान है (लॉगिन/OTP के लिए भी इस्तेमाल
// होती है) — SHO इसे अपनी मर्ज़ी से नहीं बदल सकता, सिर्फ़ नाम व PNO (badge_id)।
async function updateMyStationOfficer(req, res) {
  const { id } = req.params;
  const { name, pno } = req.body;
  if (name !== undefined) {
    const nameErr = validateName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });
  }
  if (pno !== undefined && !String(pno).trim()) {
    return res.status(400).json({ error: 'PNO खाली नहीं हो सकता' });
  }
  const check = await assertSameStation(req, id);
  if (!check.ok) return res.status(check.code).json({ error: check.error });
  const peer1 = assertNotPeerSho(check);
  if (!peer1.ok) return res.status(peer1.code).json({ error: peer1.error });
  try {
    const result = await db.query(
      'UPDATE officers SET name = COALESCE($1, name), badge_id = COALESCE($2, badge_id), updated_at = now() WHERE id = $3 RETURNING id, name, badge_id',
      [name, pno ? String(pno).trim() : null, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'यह PNO पहले से किसी और सक्रिय अधिकारी के पास है' });
    }
    throw err;
  }
}

// PATCH /officers/me/station-officers/:id/status   (SHO only) — सक्रिय/निष्क्रिय
async function setMyStationOfficerStatus(req, res) {
  const { id } = req.params;
  const { isActive } = req.body;
  if (id === req.user.id) return res.status(400).json({ error: 'खुद को निष्क्रिय नहीं किया जा सकता' });
  const check = await assertSameStation(req, id);
  if (!check.ok) return res.status(check.code).json({ error: check.error });
  const peer2 = assertNotPeerSho(check);
  if (!peer2.ok) return res.status(peer2.code).json({ error: peer2.error });
  const result = await db.query('UPDATE officers SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING id, name, is_active', [!!isActive, id]);
  logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: isActive ? 'officer_activated_by_sho' : 'officer_deactivated_by_sho', details: `${result.rows[0].name} को ${isActive ? 'सक्रिय' : 'निष्क्रिय'} किया`, req });
  res.json(result.rows[0]);
}

// POST /officers/me/station-officers/:id/transfer   (SHO only) — दूसरे थाने ट्रांसफ़र
async function transferMyStationOfficer(req, res) {
  const { id } = req.params;
  const { station, district } = req.body;
  if (!station) return res.status(400).json({ error: 'नया थाना आवश्यक है' });
  // 🐛 बग फ़िक्स: पहले SHO खुद अपनी ही ID को यहां ट्रांसफ़र कर सकता था — बिना किसी
  // वरिष्ठ (DSP/ASP) की स्वीकृति के अपनी पोस्टिंग खुद बदल लेना गंभीर प्रक्रिया-चूक है।
  // SHO का अपना ट्रांसफ़र सिर्फ़ ऊपर से (admin) होना चाहिए, खुद-सेवा (self-service) नहीं।
  if (id === req.user.id) {
    return res.status(403).json({ error: 'अपनी खुद की ID ट्रांसफ़र नहीं कर सकते — इसके लिए वरिष्ठ अधिकारी से संपर्क करें' });
  }
  const check = await assertSameStation(req, id);
  if (!check.ok) return res.status(check.code).json({ error: check.error });

  const existing = await db.query('SELECT * FROM officers WHERE id = $1', [id]);
  const old = existing.rows[0];
  if (!old.is_active) return res.status(400).json({ error: 'यह ID पहले से निष्क्रिय है' });

  // 🐛 बग फ़िक्स (गंभीर — प्रक्रिया-चूक): पहले नया district बिना किसी जांच के
  // सीधे req.body से ले लिया जाता था — SHO किसी भी अधिकारी को (खुद को छोड़कर)
  // राज्य के *किसी भी* ज़िले में transfer कर सकता था। ज़िला-पार पोस्टिंग एक बड़ा
  // प्रशासनिक निर्णय है, जो सिर्फ़ ऊपर से (DSP/ASP/admin) होना चाहिए — SHO सिर्फ़
  // अपने ही ज़िले के भीतर, एक थाने से दूसरे थाने में transfer कर सकता है।
  const targetDistrict = (district || old.district || '').trim().toLowerCase();
  const ownDistrict = (old.district || '').trim().toLowerCase();
  if (district && targetDistrict !== ownDistrict) {
    return res.status(403).json({ error: 'आप किसी अधिकारी को सिर्फ़ अपने ही ज़िले के भीतर transfer कर सकते हैं — ज़िला-पार transfer के लिए वरिष्ठ अधिकारी से संपर्क करें' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE officers SET is_active = false, updated_at = now() WHERE id = $1', [id]);
    const inserted = await client.query(
      `INSERT INTO officers (name, badge_id, mobile, email, password_hash, station, district, rank, designation, created_by_id, permissions, transferred_from_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, name, station, district`,
      [old.name, old.badge_id, old.mobile, old.email, old.password_hash, station, district || old.district, old.rank, old.designation, req.user.id, old.permissions, old.id]
    );
    await client.query('COMMIT');
    logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: 'officer_transferred_by_sho', details: `${old.name} को ${old.station} से ${station} ट्रांसफ़र किया`, req });
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'नए थाने के लिए ID नहीं बन सकी — इस PNO/मोबाइल से पहले से एक सक्रिय ID मौजूद है' });
    }
    throw err;
  } finally {
    client.release();
  }
}


async function createSubordinateOfficer(req, res) {
  const { name, pno, mobile, email, password, designation } = req.body;
  if (!name || !pno || !password) {
    return res.status(400).json({ error: 'नाम, PNO और पासवर्ड आवश्यक हैं' });
  }
  // 🐛 बग फ़िक्स: यहां नाम/मोबाइल की कोई format-जांच नहीं होती थी — बाकी सभी
  // अधिकारी-निर्माण/संपादन वाले endpoints में यह जांच पहले से लागू है, यहां छूट गई थी।
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  if (mobile) {
    const mobileErr = validateMobile(mobile);
    if (mobileErr) return res.status(400).json({ error: mobileErr });
  }
  const pwErr_si = validateNewPassword(password);
  if (pwErr_si) {
    return res.status(400).json({ error: pwErr_si });
  }
  // 🐛 बग फ़िक्स (गंभीर — क्रैश): पहले यहां sho.rows[0] सीधे destructure होता था
  // बिना यह जांचे कि कोई पंक्ति मिली भी या नहीं — अगर SHO का अपना officer-record न
  // मिले (जैसे खाता निष्क्रिय हो गया हो, या कोई data-असंगति हो), तो
  // "Cannot destructure property 'station' of undefined" जैसी uncaught त्रुटि आती,
  // जो अंततः एक अस्पष्ट सामान्य "सर्वर में त्रुटि" संदेश में बदल जाती — जिससे यह
  // समझना असंभव था कि असल समस्या क्या है। अब एक स्पष्ट, कार्रवाई-योग्य त्रुटि संदेश।
  const sho = await db.query('SELECT station, district, is_active FROM officers WHERE id = $1', [req.user.id]);
  if (sho.rows.length === 0) {
    return res.status(404).json({ error: 'आपकी अधिकारी प्रोफ़ाइल नहीं मिली — कृपया दोबारा लॉगिन करें, या एडमिन से संपर्क करें' });
  }
  if (!sho.rows[0].is_active) {
    return res.status(403).json({ error: 'आपका खाता निष्क्रिय कर दिया गया है — नया अधिकारी नहीं जोड़ सकते' });
  }
  const { station, district } = sho.rows[0];
  if (!station) {
    return res.status(400).json({ error: 'आपके प्रोफ़ाइल में थाना सेट नहीं है — कृपया एडमिन से संपर्क करें' });
  }
  // 🐛 बग फ़िक्स: थाने के लिए तो जांच थी, ज़िले के लिए नहीं। बिना ज़िले वाला अधिकारी
  // बन जाने पर वह हर district-आधारित दायरा-जांच में "छूट" (permissive fallback) पा
  // जाता है — यानी सिर्फ़ थाने के नाम से मिलान, जो "कोतवाली" जैसे आम नामों के कारण
  // 65 ज़िलों तक फैल सकता है। इसलिए बनाते समय ही रोकना सही है।
  if (!district) {
    return res.status(400).json({ error: 'आपके प्रोफ़ाइल में ज़िला सेट नहीं है — कृपया एडमिन से संपर्क करें' });
  }

  const pwErr_0 = validateNewPassword(password);
  if (pwErr_0) return res.status(400).json({ error: pwErr_0 });
  const passwordHash = await bcrypt.hash(password, 12);
  const { getCachedSetting } = require('./appSettingsController');
  const siPermissions = getCachedSetting('rank_permissions').SI || { canReject: true, canTransfer: false };
  // 🆕 उपयोगकर्ता-अनुरोध: नई ID बनाने से पहले ही जांच — अगर यह PNO/मोबाइल पहले से
  // किसी सक्रिय अधिकारी के पास है, तो *कहां* (थाना/ज़िला) है यह स्पष्ट बताते हैं,
  // ताकि SHO पहले वहां जाकर पुरानी ID निष्क्रिय करवा सके।
  const dupChecksSi = [db.query('SELECT name, station, district FROM officers WHERE badge_id = $1 AND is_active = true', [pno.trim()])];
  if (mobile) dupChecksSi.push(db.query('SELECT name, station, district FROM officers WHERE mobile = $1 AND is_active = true', [mobile]));
  const dupResultsSi = await Promise.all(dupChecksSi);
  for (const r of dupResultsSi) {
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SI',$8,$9,$10) RETURNING *`,
      [name.trim(), pno.trim(), mobile || null, email || null, passwordHash, station, district, designation || null, req.user.id, JSON.stringify(siPermissions)]
    );
    logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: 'si_created_by_sho', details: `${req.user.name} (SHO) ने नया SI बनाया: ${name} (${pno})`, req });
    res.status(201).json({
      id: result.rows[0].id,
      name: result.rows[0].name,
      pno: result.rows[0].badge_id,
      station: result.rows[0].station,
      district: result.rows[0].district,
      rank: result.rows[0].rank,
      designation: result.rows[0].designation,
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'यह PNO या मोबाइल नंबर पहले से किसी सक्रिय ID में मौजूद है — ट्रांसफ़र के लिए पहले वह पुरानी ID निष्क्रिय करें' });
    throw err;
  }
}


// PATCH /officers/me/password   body: { currentPassword, newPassword }
//
// 🆕 यह endpoint पहले था ही नहीं। यानी थाना प्रभारी, SI, कांस्टेबल — कोई भी अपना
// पासवर्ड कभी बदल ही नहीं सकता था। इसके दो भारी नतीजे थे:
//   • पहली बार का पासवर्ड (जो SHO ने बनाया, और अक्सर WhatsApp/पर्ची से पहुँचा)
//     हमेशा के लिए वही रह जाता — किसी और की नज़र में आ जाए तो भी बदला नहीं जा सकता;
//   • शक़ होने पर अधिकारी के पास अपनी पहुँच सुरक्षित करने का कोई तरीक़ा ही नहीं था।
// राज्य-स्तर पर हज़ारों ऐसे खाते होंगे, इसलिए यह सिर्फ़ सुविधा नहीं — सुरक्षा की
// बुनियादी ज़रूरत है। पैटर्न जान-बूझकर changeAdminPassword जैसा ही रखा गया है।
async function changeMyPassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const pwErr = validateNewPassword(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const result = await db.query('SELECT password_hash FROM officers WHERE id = $1 AND is_active = true', [req.user.id]);
  const officer = result.rows[0];
  // timingSafeVerify — खाता न मिलने और पासवर्ड ग़लत होने, दोनों में एक जैसा समय लगे
  if (!(await timingSafeVerify(currentPassword, officer?.password_hash))) {
    return res.status(401).json({ error: 'मौजूदा पासवर्ड गलत है' });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE officers SET password_hash = $1, updated_at = now() WHERE id = $2', [newHash, req.user.id]);

  // पासवर्ड बदलते ही पुराने सभी सत्र रद्द — अगर किसी और के पास पहुँच थी, वह अभी कटे,
  // न कि refresh token के 30 दिन पूरे होने पर
  await revokeAllForUser(req.user.id, 'officer');
  logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: 'password_changed', details: 'अधिकारी ने अपना पासवर्ड बदला', req });
  res.json({ message: 'पासवर्ड बदल दिया गया — सुरक्षा के लिए सभी डिवाइस से लॉगआउट हो गया, कृपया दोबारा लॉगिन करें' });
}

module.exports = {
  changeMyPassword,
  getMyOfficerProfile,
  updateMyOfficerPhoto,
  listOfficersForTransfer,
  updatePushToken,
  updateDutyStatus,
  getMyPerformance,
  getStationPerformance,
  updateNotificationPreferences,
  requestBackup,
  listPrivateNotes,
  addPrivateNote,
  listFieldVisits,
  addFieldVisit,
  createSubordinateOfficer,
  listMyStationOfficers,
  updateMyStationOfficer,
  setMyStationOfficerStatus,
  transferMyStationOfficer,
};
