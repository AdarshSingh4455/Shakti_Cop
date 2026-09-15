const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { createNotification } = require('../utils/notify');
const { sendPushNotification } = require('../utils/push');
const { signToken } = require('../utils/jwt');
const { createRefreshToken, revokeAllForUser } = require('../utils/refreshToken');
const { logActivity, maskIdentity } = require('../utils/activityLog');
const { validateName, validateMobile, validateEmail, validateTextLength, validateUrl, validatePushToken } = require('../utils/fieldValidators');
const { validateNewPassword, isBlockedDemoPassword, DEMO_PASSWORD_ERROR } = require('../utils/passwordPolicy');
const { timingSafeVerify } = require('../utils/timingSafeAuth');

// ============================================================
// काउंसलिंग सहायता
//   नागरिक  → अनुरोध भेजता है, अपने अनुरोध देखता है
//   DSP+    → सभी अनुरोध देखते हैं और सत्र का समय-दिनांक तय करते हैं
// ============================================================

// हर बदलाव का ऑडिट — DSP स्तर की समीक्षा के लिए
async function logHistory({ requestId, action, fromValue, toValue, reason, user }) {
  try {
    await db.query(
      `INSERT INTO service_request_history
         (request_id, action, from_value, to_value, reason, actor_role, actor_name, actor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [requestId, action, fromValue || null, toValue || null, reason || null,
       user?.role || null, user?.name || null, user?.id || null]
    );
  } catch (e) {
    // तालिका न हो तो मुख्य काम न रुके
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 🐛 बग फ़िक्स (समय-क्षेत्र): नीचे सत्र की तारीख़ बताने के लिए पहले getDate()/getMonth()
// इस्तेमाल होते थे, जो सर्वर के अपने timezone (cloud पर UTC) में चलते हैं। यानी
// 14 अगस्त रात 12:30 (IST) का सत्र database में 13 अगस्त 19:00Z के रूप में रहता,
// और नागरिक को SMS/सूचना में तारीख़ "13/08" बताई जाती — पूरा एक दिन पहले। इससे लोग
// ग़लत दिन पहुंचते या अपॉइंटमेंट ही चूक जाते। अब तारीख़ हमेशा IST में बनती है।
function formatDateIST(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

// अनुरोध ID — मोबाइल के पहले 2 + आख़िरी 2 अंक और समय (शिकायत ID जैसा ही तरीका)
const TYPE_PREFIX = {
  counselling: 'CN',
  legal_aid: 'LA',
  self_defence: 'SD',
  empowerment: 'EM',
};
const VALID_TYPES = Object.keys(TYPE_PREFIX);

const TYPE_LABEL = {
  counselling: 'काउंसलिंग सहायता',
  legal_aid: 'कानूनी सहायता',
  self_defence: 'आत्मरक्षा प्रशिक्षण',
  empowerment: 'जन शिक्षण / सशक्तिकरण कार्यक्रम',
};

function newRequestId(mobile, type) {
  // 🐛 बग फ़िक्स: पहले यह ID मोबाइल के कुछ अंक + समय से बनती थी — यानी अनुमान-योग्य।
  // ठीक यही पैटर्न शिकायत-ID से पहले ही हटाया जा चुका था; यहां रह गया था। अब वही
  // साझा random तरीक़ा (utils/ids.js), prefix पहले जैसा ही रहता है।
  const { newRequestId: makeId } = require('../utils/ids');
  return makeId(TYPE_PREFIX[type] || 'SR');
}

function rowToRequest(r) {
  return {
    id: r.id,
    type: r.type || 'counselling',
    citizenId: r.citizen_id,
    name: r.name,
    fatherName: r.father_name,
    mobile: r.mobile,
    district: r.district,
    policeStation: r.police_station,
    age: r.age,
    gender: r.gender,
    address: r.address,
    education: r.education,
    reasonKey: r.reason_key,
    reasonDetail: r.reason_detail,
    status: r.status,
    scheduledAt: r.scheduled_at,
    venue: r.venue,
    counsellorName: r.counsellor_name,
    counsellorId: r.counsellor_id,
    officerNote: r.officer_note,
    scheduledBy: r.scheduled_by,
    priority: r.priority || 'सामान्य',
    attendance: r.attendance,
    outcome: r.outcome,
    followUpNeeded: r.follow_up_needed,
    followUpAt: r.follow_up_at,
    rescheduleCount: r.reschedule_count || 0,
    sessionDurationMin: r.session_duration_min,
    closedAt: r.closed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// क्या यह उपयोगकर्ता काउंसलिंग अनुरोध प्रबंधित कर सकता है?
// सिर्फ़ DSP, ASP, SSP (monitor) और Super Admin — SI/SHO/district_admin नहीं।
function canManageCounselling(user) {
  if (!user) return false;
  if (user.role === 'admin') {
    if (user.adminRole === 'super_admin') return true;
    // 🐛 बग फ़िक्स: IG/DIG यहाँ छूट गए थे — जबकि वे SSP से भी ऊपर के पद हैं और SSP
    // को यह अनुमति पहले से है। यानी वरिष्ठ अधिकारी वह काम नहीं कर पाता जो उसका
    // अधीनस्थ कर सकता है — स्पष्ट रूप से IG/DIG जोड़ते समय हुई चूक।
    return user.adminRole === 'monitor' && ['DSP', 'ASP', 'SSP', 'IG', 'DIG'].includes(user.rank);
  }
  // ⚠️ SHO (थाना प्रभारी) को भी सहायता सेवाओं (काउंसलिंग/कानूनी सहायता/आदि) की
  // अपॉइंटमेंट शेड्यूल करने की अनुमति — पहले सिर्फ़ DSP/ASP/SSP/Super Admin कर
  // सकते थे। सामान्य SI/जांचकर्ता अधिकारी अब भी नहीं कर सकते।
  if (user.role === 'officer') {
    return user.rank === 'SHO';
  }
  return false;
}

// POST /counselling   (नागरिक)
async function createRequest(req, res) {
  if (req.user.role !== 'citizen') {
    return res.status(403).json({ error: 'सिर्फ़ नागरिक काउंसलिंग अनुरोध भेज सकते हैं' });
  }
  const { reasonKey, reasonDetail, age, gender, address, education } = req.body;
  const type = VALID_TYPES.includes(req.body.type) ? req.body.type : 'counselling';

  // काउंसलिंग व कानूनी सहायता में कारण ज़रूरी; प्रशिक्षण/कार्यक्रम में नहीं
  if (['counselling', 'legal_aid'].includes(type) && !reasonKey && !String(reasonDetail || '').trim()) {
    return res.status(400).json({ error: 'कृपया कारण चुनें या लिखें' });
  }
  // 🆕 विवरण/पता पर लंबाई-सीमा — पहले सर्वर पर कोई सीमा जांची ही नहीं जाती थी
  const detailErr = validateTextLength(reasonDetail, { max: 1000, label: 'विवरण' });
  if (detailErr) return res.status(400).json({ error: detailErr });
  const addrErr = validateTextLength(address, { max: 300, label: 'पता' });
  if (addrErr) return res.status(400).json({ error: addrErr });
  const ageNum = age === undefined || age === null || age === '' ? null : Number(age);
  if (ageNum !== null && (isNaN(ageNum) || ageNum < 1 || ageNum > 120)) {
    return res.status(400).json({ error: 'कृपया सही उम्र दर्ज करें (1–120)' });
  }

  // नाम/पता प्रोफ़ाइल से ही लिए जाते हैं — नागरिक इन्हें बदलकर नहीं भेज सकता
  const c = await db.query(
    'SELECT name, father_name, mobile, district, police_station FROM citizens WHERE id = $1',
    [req.user.id]
  );
  if (c.rows.length === 0) return res.status(404).json({ error: 'नागरिक प्रोफ़ाइल नहीं मिली' });
  const p = c.rows[0];

  // एक ही समय में बहुत सारे लंबित अनुरोध न बनें
  // एक ही सेवा के 3 से ज़्यादा लंबित अनुरोध न बनें (हर सेवा की गिनती अलग)
  const pending = await db.query(
    `SELECT count(*)::int AS n FROM counselling_requests
     WHERE citizen_id = $1 AND type = $2 AND status IN ('अनुरोध प्राप्त', 'सत्र निर्धारित')`,
    [req.user.id, type]
  );
  if (pending.rows[0].n >= 3) {
    return res.status(400).json({
      error: 'इस सेवा के आपके पहले से 3 अनुरोध लंबित हैं। कृपया उनके पूरा होने की प्रतीक्षा करें।',
    });
  }

  const id = newRequestId(p.mobile, type);
  const result = await db.query(
    `INSERT INTO counselling_requests
       (id, type, citizen_id, name, father_name, mobile, district, police_station,
        reason_key, reason_detail, age, gender, address, education)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      id,
      type,
      req.user.id,
      p.name,
      p.father_name || null,
      p.mobile,
      p.district || null,
      p.police_station || null,
      reasonKey || null,
      String(reasonDetail || '').trim() || null,
      ageNum,
      gender || null,
      String(address || '').trim() || p.address || null,
      education || null,
    ]
  );

  // 🐛 बग फ़िक्स: पहले यह क्वेरी district की कोई परवाह नहीं करती थी — किसी भी ज़िले का
  // नागरिक अनुरोध भेजे, पूरे राज्य के DSP/ASP/SSP को सूचना जाती थी। साथ ही is_active
  // की जांच भी नहीं थी। अब सिर्फ़ संबंधित ज़िले के DSP/ASP/SSP + हमेशा राज्य-स्तर के
  // super_admin को सूचना जाती है।
  // 🐛 बग फ़िक्स: पहले district मिलते ही DSP/ASP को सूचना चली जाती — भले ही DSP/ASP
  // का दायरा उस ज़िले के सिर्फ़ कुछ थानों (circle) तक सीमित हो। नतीजा: DSP जिसका
  // सर्किल सिर्फ़ "थाना A" है, उसे "थाना B" (उसी ज़िले, पर दूसरे सर्किल) के नागरिक
  // के अनुरोध की भी सूचना मिल जाती थी। अब circleStations हो तो सिर्फ़ उसी सर्किल के
  // थाने का अनुरोध हो तभी सूचना जाती है — SSP (जिसका कभी circleStations नहीं होता)
  // पूरे ज़िले के लिए वैसे ही सूचना पाता रहता है।
  // 🐛 बग फ़िक्स: IG/DIG को ये सूचनाएं कभी मिलती ही नहीं थीं — न वे rank-सूची में थे,
  // और न ही मिलतीं क्योंकि IG/DIG का district हमेशा NULL होता है (उनका दायरा
  // range_districts में रहता है, एक अकेले ज़िले में नहीं)। अब उन्हें भी लाया जाता है
  // और नीचे JS में जांचा जाता है कि नागरिक का ज़िला उनके Range में है या नहीं।
  // (जान-बूझकर JSONB का `?` operator इस्तेमाल नहीं किया — कुछ Postgres drivers/poolers
  // उसे parameter-placeholder समझ लेते हैं; बाक़ी पूरा codebase भी यही तरीक़ा —
  // JSONB कॉलम लाकर JS में फ़िल्टर — इस्तेमाल करता है, जैसे नीचे circle_stations के लिए।)
  try {
    const officers = await db.query(
      `SELECT id, rank, circle_stations, range_districts FROM admins
       WHERE is_active = true AND (
         admin_role = 'super_admin'
         OR (admin_role = 'monitor' AND rank IN ('DSP','ASP','SSP') AND TRIM(LOWER(district)) = TRIM(LOWER($1)))
         OR (admin_role = 'monitor' AND rank IN ('IG','DIG'))
       )`,
      [p.district || '']
    );
    const relevantOfficers = officers.rows.filter((o) => {
      // IG/DIG — नागरिक का ज़िला उनके Range में होना चाहिए
      if (['IG', 'DIG'].includes(o.rank)) {
        return !!(p.district && (o.range_districts || []).includes(p.district));
      }
      if (!o.circle_stations || o.circle_stations.length === 0) return true; // SSP/super_admin — कोई सीमा नहीं
      return p.police_station && o.circle_stations.includes(p.police_station);
    });
    for (const o of relevantOfficers) {
      createNotification({
        recipientRole: 'admin',
        recipientId: o.id,
        title: `नया अनुरोध — ${TYPE_LABEL[type] || 'सेवा'}`,
        body: `${p.name} (${p.district || '—'}) — कृपया समय व दिनांक तय करें`,
        data: { counsellingId: id, type },
      });
    }
  } catch (e) {
    // सूचना न जाए तो भी अनुरोध सुरक्षित है
  }

  res.status(201).json(rowToRequest(result.rows[0]));
}

// GET /counselling   (नागरिक → अपने; DSP+ → सभी, अपने दायरे में)
async function listRequests(req, res) {
  const typeFilter = VALID_TYPES.includes(req.query.type) ? req.query.type : null;

  if (req.user.role === 'citizen') {
    const params = [req.user.id];
    let where = 'citizen_id = $1';
    if (typeFilter) {
      params.push(typeFilter);
      where += ` AND type = $${params.length}`;
    }
    const r = await db.query(
      `SELECT * FROM counselling_requests WHERE ${where} ORDER BY created_at DESC`,
      params
    );
    return res.json(r.rows.map(rowToRequest));
  }

  if (!canManageCounselling(req.user)) {
    return res.status(403).json({ error: 'काउंसलिंग अनुरोध देखने की अनुमति नहीं है' });
  }

  const params = [];
  const clauses = [];
  // 🐛 बग फ़िक्स: यहां सिर्फ़ district scope जांचा जाता था — DSP (जिसका scope
  // circleStations होता है, district नहीं — देखें middleware/auth.js) के लिए कोई
  // सीमा ही नहीं लगती थी, यानी DSP को सिस्टम के सभी ज़िलों के काउंसलिंग अनुरोध
  // दिख जाते थे। अब complaints जैसा ही दोनों scope यहां भी लागू होते हैं।
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    clauses.push(`district = ANY($${params.length})`);
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    clauses.push(`police_station = ANY($${params.length})`);
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    if (req.adminScope.district) {
      params.push(req.adminScope.district);
      clauses.push(`district = $${params.length}`);
    }
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    clauses.push(`district = $${params.length}`);
  }
  if (req.query.status) {
    params.push(req.query.status);
    clauses.push(`status = $${params.length}`);
  }
  if (typeFilter) {
    params.push(typeFilter);
    clauses.push(`type = $${params.length}`);
  }
  if (req.query.priority) {
    params.push(req.query.priority);
    clauses.push(`priority = $${params.length}`);
  }
  if (req.query.district) {
    params.push(req.query.district);
    clauses.push(`district = $${params.length}`);
  }
  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    const i = params.length;
    clauses.push(`(name ILIKE $${i} OR mobile ILIKE $${i} OR id ILIKE $${i})`);
  }
  if (req.query.dateFrom) {
    params.push(req.query.dateFrom);
    clauses.push(`created_at >= $${params.length}`);
  }
  if (req.query.dateTo) {
    params.push(req.query.dateTo);
    clauses.push(`created_at <= ($${params.length}::date + INTERVAL '1 day')`);
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const r = await db.query(
    // क्रम: लंबित पहले → उनमें अति-आवश्यक पहले → उनमें सबसे पुराना पहले
    // (सबसे देर से इंतज़ार करने वाला सबसे ऊपर दिखे)
    `SELECT * FROM counselling_requests${where} ORDER BY
       CASE WHEN status = 'अनुरोध प्राप्त' THEN 0 ELSE 1 END,
       CASE priority WHEN 'अति-आवश्यक' THEN 0 WHEN 'उच्च' THEN 1 ELSE 2 END,
       CASE WHEN status = 'अनुरोध प्राप्त' THEN created_at END ASC NULLS LAST,
       created_at DESC`,
    params
  );
  res.json(r.rows.map(rowToRequest));
}

// PATCH /counselling/:id   (DSP+)
// एक ही endpoint से — सत्र तय करना, बदलना, उपस्थिति, परिणाम, प्राथमिकता, रद्द करना
async function updateRequest(req, res) {
  if (!canManageCounselling(req.user)) {
    return res.status(403).json({ error: 'सिर्फ़ DSP/ASP/SSP या Super Admin सत्र तय कर सकते हैं' });
  }
  const { id } = req.params;
  const {
    scheduledAt, venue, counsellorName, counsellorId, officerNote, status,
    priority, attendance, outcome, followUpNeeded, followUpAt,
    sessionDurationMin, reason,
  } = req.body;

  const current = await db.query('SELECT * FROM counselling_requests WHERE id = $1', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'अनुरोध नहीं मिला' });
  const row = current.rows[0];

  // 🆕 विवरण/टिप्पणी फ़ील्ड्स पर लंबाई-सीमा — पहले सर्वर पर कोई सीमा जांची ही नहीं जाती थी
  const noteErr = validateTextLength(officerNote, { max: 1000, label: 'नागरिक के लिए संदेश' });
  if (noteErr) return res.status(400).json({ error: noteErr });
  const outcomeErr = validateTextLength(outcome, { max: 1000, label: 'सत्र का परिणाम' });
  if (outcomeErr) return res.status(400).json({ error: outcomeErr });

  // 🐛 बग फ़िक्स: पहले सिर्फ़ district scope जांचा जाता था — DSP (circleStations scope)
  // और SHO (station scope) के लिए कोई सीमा नहीं लगती थी, यानी वे किसी भी दूसरे
  // ज़िले/थाने का अनुरोध बदल सकते थे।
  if (req.user.role === 'admin') {
    if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
      if (!req.adminScope.rangeDistricts.includes(row.district)) {
        return res.status(403).json({ error: 'यह अनुरोध आपके Range का नहीं है' });
      }
    } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
      // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जांचें
      if (req.adminScope.district && row.district !== req.adminScope.district) {
        return res.status(403).json({ error: 'यह अनुरोध आपके ज़िले का नहीं है' });
      }
      if (!req.adminScope.circleStations.includes(row.police_station)) {
        return res.status(403).json({ error: 'यह अनुरोध आपके सर्किल का नहीं है' });
      }
    } else if (req.adminScope?.district && row.district !== req.adminScope.district) {
      return res.status(403).json({ error: 'यह अनुरोध आपके ज़िले का नहीं है' });
    }
  } else if (req.user.role === 'officer' && req.user.rank === 'SHO') {
    const shoStation = (req.user.station || '').trim().toLowerCase();
    const rowStation = (row.police_station || '').trim().toLowerCase();
    if (!shoStation || shoStation !== rowStation) {
      return res.status(403).json({ error: 'यह अनुरोध आपके थाने का नहीं है' });
    }
  }

  // ---- स्थिति तय करें ----
  let newStatus = status || row.status;
  const isReschedule =
    scheduledAt && row.scheduled_at && new Date(scheduledAt).getTime() !== new Date(row.scheduled_at).getTime();

  if (scheduledAt && !status) newStatus = 'सत्र निर्धारित';
  if (attendance && !status) newStatus = attendance === 'उपस्थित' ? 'पूर्ण' : row.status;

  // 🔒 पुनर्निर्धारण पर कारण अनिवार्य — जवाबदेही के लिए
  if (isReschedule && !String(reason || '').trim()) {
    return res.status(400).json({ error: 'सत्र की तिथि बदलने का कारण लिखना आवश्यक है' });
  }

  const closedAt = ['पूर्ण', 'रद्द'].includes(newStatus) ? (row.closed_at || new Date()) : row.closed_at;

  const updated = await db.query(
    `UPDATE counselling_requests SET
       scheduled_at = COALESCE($1, scheduled_at),
       venue = COALESCE($2, venue),
       counsellor_name = COALESCE($3, counsellor_name),
       counsellor_id = COALESCE($17, counsellor_id),
       officer_note = COALESCE($4, officer_note),
       status = $5,
       priority = COALESCE($6, priority),
       attendance = COALESCE($7, attendance),
       outcome = COALESCE($8, outcome),
       follow_up_needed = COALESCE($9, follow_up_needed),
       follow_up_at = COALESCE($10, follow_up_at),
       session_duration_min = COALESCE($11, session_duration_min),
       reschedule_count = reschedule_count + $12,
       closed_at = $13,
       scheduled_by = $14,
       scheduled_by_id = $15
     WHERE id = $16 RETURNING *`,
    [
      scheduledAt || null, venue || null, counsellorName || null, officerNote || null,
      newStatus, priority || null, attendance || null, outcome || null,
      followUpNeeded === undefined ? null : followUpNeeded,
      followUpAt || null,
      sessionDurationMin === undefined || sessionDurationMin === '' ? null : Number(sessionDurationMin),
      isReschedule ? 1 : 0,
      closedAt, req.user.name, req.user.id, id,
      counsellorId || null,
    ]
  );

  // ---- ऑडिट इतिहास ----
  if (isReschedule) {
    await logHistory({
      requestId: id, action: 'rescheduled',
      fromValue: row.scheduled_at ? new Date(row.scheduled_at).toISOString() : null,
      toValue: new Date(scheduledAt).toISOString(),
      reason, user: req.user,
    });
  } else if (scheduledAt && !row.scheduled_at) {
    await logHistory({
      requestId: id, action: 'scheduled',
      toValue: new Date(scheduledAt).toISOString(), reason, user: req.user,
    });
  }
  if (attendance && attendance !== row.attendance) {
    await logHistory({ requestId: id, action: 'attendance', fromValue: row.attendance, toValue: attendance, user: req.user });
  }
  if (priority && priority !== row.priority) {
    await logHistory({ requestId: id, action: 'priority', fromValue: row.priority, toValue: priority, user: req.user });
  }
  if (status && status !== row.status) {
    await logHistory({ requestId: id, action: status === 'रद्द' ? 'cancelled' : 'closed', fromValue: row.status, toValue: status, reason, user: req.user });
  }

  // 🐛 बग फ़िक्स: 'when' पहले सिर्फ़ नागरिक-सूचना वाले try-block के अंदर scoped थी —
  // नीचे काउंसलर-सूचना वाला block इसे इस्तेमाल नहीं कर पाता था (ReferenceError, जो
  // catch(e) { // ignore } में चुपचाप दब जाती और काउंसलर को कभी सूचना ही न मिलती)
  const when = scheduledAt ? new Date(scheduledAt) : null;

  // ---- नागरिक को सूचना ----
  try {
    let title = `${TYPE_LABEL[row.type] || 'सेवा'} — अपडेट`;
    let body = `आपके अनुरोध की स्थिति: ${newStatus}`;
    if (isReschedule && when) {
      title = `${TYPE_LABEL[row.type] || 'सेवा'} — नई तिथि`;
      body = `आपका सत्र अब ${formatDateIST(when)} को निर्धारित है।${reason ? ' कारण: ' + reason : ''}`;
    } else if (when && newStatus === 'सत्र निर्धारित') {
      title = `${TYPE_LABEL[row.type] || 'सेवा'} — समय निर्धारित`;
      body = `आपका सत्र ${formatDateIST(when)} को निर्धारित किया गया है।`;
    }
    createNotification({
      recipientRole: 'citizen', recipientId: row.citizen_id,
      title, body, data: { counsellingId: id, type: row.type },
    });
  } catch (e) {
    // ignore
  }

  // 🆕 काउंसलर को सूचना — पहले सिर्फ़ admins (नए अनुरोध पर) और नागरिक (स्थिति-बदलाव पर)
  // को सूचना जाती थी। जिस काउंसलर को असल में सत्र सौंपा गया हो, उसे कभी पता ही नहीं
  // चलता था — न नई नियुक्ति की, न तारीख़ बदलने की। push_token कॉलम और भेजने की सुविधा
  // दोनों पहले से मौजूद थीं, बस यहां इस्तेमाल नहीं हो रही थीं।
  try {
    const assignedCounsellorId = counsellorId || row.counsellor_id;
    if (assignedCounsellorId) {
      const isNewAssignment = counsellorId && String(counsellorId) !== String(row.counsellor_id || '');
      let cTitle = null;
      let cBody = null;
      if (isNewAssignment) {
        cTitle = `${TYPE_LABEL[row.type] || 'सेवा'} — नई नियुक्ति`;
        cBody = when
          ? `आपको ${formatDateIST(when)} के सत्र के लिए नियुक्त किया गया है।`
          : 'आपको एक नए अनुरोध के लिए नियुक्त किया गया है — कृपया समय तय करें।';
      } else if (isReschedule) {
        cTitle = `${TYPE_LABEL[row.type] || 'सेवा'} — नई तिथि`;
        cBody = `सत्र अब ${formatDateIST(when)} को निर्धारित है।${reason ? ' कारण: ' + reason : ''}`;
      }
      if (cTitle) {
        const provider = await db.query('SELECT push_token FROM service_providers WHERE id = $1', [assignedCounsellorId]);
        if (provider.rows[0]?.push_token) {
          sendPushNotification(provider.rows[0].push_token, cTitle, cBody, { counsellingId: id, type: row.type });
        }
        createNotification({
          recipientRole: 'counsellor', recipientId: assignedCounsellorId,
          title: cTitle, body: cBody, data: { counsellingId: id, type: row.type },
        });
      }
    }
  } catch (e) {
    // ignore
  }

  res.json(rowToRequest(updated.rows[0]));
}

// GET /counselling/:id/history — किस-किसने क्या बदला (DSP+)
async function requestHistory(req, res) {
  if (!canManageCounselling(req.user)) {
    return res.status(403).json({ error: 'अनुमति नहीं है' });
  }
  const reqRow = await db.query('SELECT district, police_station FROM counselling_requests WHERE id = $1', [req.params.id]);
  if (reqRow.rows.length === 0) return res.status(404).json({ error: 'अनुरोध नहीं मिला' });
  const row = reqRow.rows[0];
  if (req.user.role === 'admin') {
    if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
      if (!req.adminScope.rangeDistricts.includes(row.district)) {
        return res.status(403).json({ error: 'यह अनुरोध आपके Range का नहीं है' });
      }
    } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
      // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जांचें
      if (req.adminScope.district && row.district !== req.adminScope.district) {
        return res.status(403).json({ error: 'यह अनुरोध आपके ज़िले का नहीं है' });
      }
      if (!req.adminScope.circleStations.includes(row.police_station)) {
        return res.status(403).json({ error: 'यह अनुरोध आपके सर्किल का नहीं है' });
      }
    } else if (req.adminScope?.district && row.district !== req.adminScope.district) {
      return res.status(403).json({ error: 'यह अनुरोध आपके ज़िले का नहीं है' });
    }
  } else if (req.user.role === 'officer' && req.user.rank === 'SHO') {
    const shoStation = (req.user.station || '').trim().toLowerCase();
    const rowStation = (row.police_station || '').trim().toLowerCase();
    if (!shoStation || shoStation !== rowStation) {
      return res.status(403).json({ error: 'यह अनुरोध आपके थाने का नहीं है' });
    }
  }
  const r = await db.query(
    `SELECT action, from_value, to_value, reason, actor_role, actor_name, created_at
     FROM service_request_history WHERE request_id = $1 ORDER BY created_at ASC`,
    [req.params.id]
  ).catch(() => ({ rows: [] }));
  res.json(
    r.rows.map((h) => ({
      action: h.action,
      fromValue: h.from_value,
      toValue: h.to_value,
      reason: h.reason,
      actorRole: h.actor_role,
      actorName: h.actor_name,
      createdAt: h.created_at,
    }))
  );
}

// GET /counselling/stats — आंकड़े (DSP+)
async function requestStats(req, res) {
  if (!canManageCounselling(req.user)) {
    return res.status(403).json({ error: 'अनुमति नहीं है' });
  }
  const params = [];
  const clauses = [];
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    clauses.push(`district = ANY($${params.length})`);
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    clauses.push(`police_station = ANY($${params.length})`);
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    if (req.adminScope.district) {
      params.push(req.adminScope.district);
      clauses.push(`district = $${params.length}`);
    }
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    clauses.push(`district = $${params.length}`);
  }
  if (VALID_TYPES.includes(req.query.type)) {
    params.push(req.query.type);
    clauses.push(`type = $${params.length}`);
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';

  const r = await db.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE status = 'अनुरोध प्राप्त')::int AS pending,
       count(*) FILTER (WHERE status = 'सत्र निर्धारित')::int AS scheduled,
       count(*) FILTER (WHERE status = 'पूर्ण')::int AS completed,
       count(*) FILTER (WHERE status = 'रद्द')::int AS cancelled,
       count(*) FILTER (WHERE attendance = 'अनुपस्थित')::int AS no_show,
       count(*) FILTER (WHERE follow_up_needed)::int AS follow_up,
       count(*) FILTER (WHERE priority = 'अति-आवश्यक' AND status = 'अनुरोध प्राप्त')::int AS urgent_pending,
       count(*) FILTER (WHERE status = 'अनुरोध प्राप्त' AND created_at < now() - INTERVAL '7 days')::int AS overdue,
       COALESCE(round(avg(EXTRACT(EPOCH FROM (scheduled_at - created_at)) / 86400)::numeric, 1), 0) AS avg_wait_days
     FROM counselling_requests${where}`,
    params
  );
  const byType = await db.query(
    `SELECT type, count(*)::int AS n FROM counselling_requests${where} GROUP BY type`,
    params
  );
  res.json({ ...r.rows[0], byType: byType.rows });
}

// ============================================================
// काउंसलर / प्रशिक्षक / सेवा-प्रदाता की सूची
//   Super Admin सूची बनाता/बदलता है — DSP/ASP/SSP सिर्फ़ देखते व चुनते हैं
//   (मुक्त टेक्स्ट में नाम लिखने से बचने के लिए — README पॉइंट #454)
// ============================================================

function rowToProvider(r) {
  return {
    id: r.id,
    name: r.name,
    fatherName: r.father_name,
    designation: r.designation,
    serviceType: r.service_type,
    district: r.district,
    policeStation: r.police_station,
    mobile: r.mobile,
    email: r.email,
    venue: r.venue,
    otherDetails: r.other_details,
    createdByName: r.created_by_name,
    createdByRole: r.created_by_role,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

// GET /counselling/providers   (DSP/ASP/SSP + Super Admin — सत्र तय करते समय dropdown के लिए)
// query: type (service_type), district, includeInactive
async function listProviders(req, res) {
  if (!canManageCounselling(req.user)) {
    return res.status(403).json({ error: 'अनुमति नहीं है' });
  }
  const params = [];
  const clauses = [];
  if (!['true', '1'].includes(String(req.query.includeInactive))) {
    clauses.push('is_active = true');
  }
  if (req.query.type) {
    params.push(req.query.type);
    // service_type = NULL का मतलब "सभी सेवाओं के लिए" — वह भी हमेशा शामिल हो
    clauses.push(`(service_type = $${params.length} OR service_type IS NULL)`);
  }
  // 🆕 IG/DIG — इनका adminScope.district कभी सेट नहीं होता (उनका दायरा rangeDistricts
  // है), इसलिए पहले इन्हें पूरे राज्य के सभी काउंसलर दिखते। यह सुरक्षा-समस्या नहीं है
  // (काउंसलर-सूची में पीड़िता का कोई डेटा नहीं होता), पर बाक़ी हर जगह की तरह यहाँ भी
  // इनका अपना Range ही दिखना सही व उपयोगी है।
  if (!req.query.district && req.adminScope?.rangeDistricts?.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    clauses.push(`(district = ANY($${params.length}) OR district IS NULL)`);
  } else {
    const district = req.query.district || req.adminScope?.district;
    if (district) {
      params.push(district);
      // district NULL का मतलब "सभी ज़िलों के लिए उपलब्ध"
      clauses.push(`(district = $${params.length} OR district IS NULL)`);
    }
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const r = await db
    .query(`SELECT * FROM service_providers${where} ORDER BY is_active DESC, name`, params)
    .catch(() => ({ rows: [] })); // तालिका न बनी हो तो खाली सूची — पुराना free-text इनपुट काम करता रहे
  res.json(r.rows.map(rowToProvider));
}

// POST /counselling/providers   (सिर्फ़ Super Admin)
// काउंसलर/प्रशिक्षक ID बनाने/बदलने की अनुमति — Super Admin के साथ-साथ अब SHO भी
// (अपने थाने के लिए काउंसलर/प्रशिक्षक जोड़ सकते हैं, चूँकि वही अपॉइंटमेंट भी शेड्यूल करते हैं)
function canManageProviders(user) {
  if (!user) return false;
  if (user.role === 'admin' && user.adminRole === 'super_admin') return true;
  if (user.role === 'officer' && user.rank === 'SHO') return true;
  return false;
}

// 🐛 बग फ़िक्स (अधिकार-चूक): updateProvider और deactivateProvider में सिर्फ़ भूमिका
// जांची जाती थी, यह नहीं कि वह काउंसलर उसी SHO के थाने का है या नहीं। यानी कोई भी
// SHO राज्य के किसी भी दूसरे थाने के काउंसलर की जानकारी बदल सकता था, या उसकी ID
// निष्क्रिय करके उसे सेवा से बाहर कर सकता था। createProvider में यह सीमा अभी लगाई
// गई है — बदलने/हटाने पर भी वही सीमा होनी चाहिए, वरना रोक अधूरी रह जाती।
// Super Admin पर यह लागू नहीं — उसका दायरा पूरा राज्य है।
async function assertProviderInScope(req, providerId) {
  if (req.user.role !== 'officer') return { ok: true }; // super_admin — कोई सीमा नहीं
  const [me, target] = await Promise.all([
    db.query('SELECT station FROM officers WHERE id = $1', [req.user.id]),
    db.query('SELECT police_station FROM service_providers WHERE id = $1', [providerId]),
  ]);
  if (target.rows.length === 0) return { ok: false, code: 404, error: 'यह काउंसलर/प्रशिक्षक नहीं मिला' };
  const norm = (s) => String(s || '').trim().toLowerCase();
  if (!norm(me.rows[0]?.station) || norm(me.rows[0]?.station) !== norm(target.rows[0].police_station)) {
    return { ok: false, code: 403, error: 'यह काउंसलर/प्रशिक्षक आपके थाने का नहीं है' };
  }
  return { ok: true };
}

async function createProvider(req, res) {
  if (!canManageProviders(req.user)) {
    return res.status(403).json({ error: 'सिर्फ़ Super Admin या SHO काउंसलर/प्रशिक्षक ID बना सकते हैं' });
  }
  const { name, fatherName, designation, serviceType, district, policeStation, mobile, email, venue, otherDetails, password } = req.body;
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  if (serviceType && !VALID_TYPES.includes(serviceType)) {
    return res.status(400).json({ error: 'गलत सेवा प्रकार' });
  }
  // ⚠️ काउंसलर को खुद लॉगिन करना है (अपनी अपॉइंटमेंट देखने, उपस्थिति मार्क करने,
  // अपनी प्रोफ़ाइल एडिट करने के लिए) — इसलिए मोबाइल/ईमेल/पासवर्ड तीनों ज़रूरी हैं
  const mobileErr = validateMobile(mobile);
  if (mobileErr) return res.status(400).json({ error: mobileErr });
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  if (!password || password.length < 1) {
    return res.status(400).json({ error: 'पासवर्ड आवश्यक है' });
  }
  const pwErr = validateNewPassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  // 🐛 बग फ़िक्स (अधिकार-चूक): district/policeStation सीधे req.body से लिए जाते थे,
  // बिना किसी जांच के। यानी कोई भी SHO राज्य के *किसी भी* ज़िले/थाने के नाम पर
  // काउंसलर ID बना सकता था — जबकि SHO की बाक़ी हर क्षमता (अधिकारी बनाना, मामला
  // सौंपना, थाना-सारांश) सख़्ती से अपने ही थाने तक सीमित है। अब SHO के लिए ये दोनों
  // उसके अपने थाने/ज़िले पर तय कर दिए जाते हैं (क्लाइंट जो भी भेजे, अनदेखा)।
  // Super Admin पर यह सीमा लागू नहीं — उसका दायरा पूरा राज्य है।
  let scopedDistrict = district || null;
  let scopedStation = policeStation || null;
  if (req.user.role === 'officer') {
    const me = await db.query('SELECT station, district FROM officers WHERE id = $1', [req.user.id]);
    if (me.rows.length === 0) {
      return res.status(404).json({ error: 'आपकी अधिकारी प्रोफ़ाइल नहीं मिली' });
    }
    scopedDistrict = me.rows[0].district;
    scopedStation = me.rows[0].station;
  }

  const dupe = await db.query('SELECT id FROM service_providers WHERE (mobile = $1 OR email = $2) AND is_active = true', [mobile.trim(), email.trim()]);
  if (dupe.rows.length > 0) {
    return res.status(409).json({ error: 'इस मोबाइल/ईमेल से पहले से एक सक्रिय काउंसलर ID मौजूद है' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.query(
    `INSERT INTO service_providers
       (name, father_name, designation, service_type, district, police_station, mobile, email, venue, other_details, created_by_name, created_by_role, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      name.trim(),
      fatherName || null,
      designation || null,
      serviceType || null,
      scopedDistrict,
      scopedStation,
      mobile.trim(),
      email.trim(),
      venue || null,
      otherDetails || null,
      req.user.name || null,
      req.user.role === 'officer' ? req.user.rank || 'officer' : req.user.adminRole || 'admin',
      passwordHash,
    ]
  );
  res.status(201).json(rowToProvider(result.rows[0]));
}

// PATCH /counselling/providers/:id   (Super Admin या SHO)
async function updateProvider(req, res) {
  if (!canManageProviders(req.user)) {
    return res.status(403).json({ error: 'सिर्फ़ Super Admin या SHO काउंसलर/प्रशिक्षक ID बदल सकते हैं' });
  }
  const scope1 = await assertProviderInScope(req, req.params.id);
  if (!scope1.ok) return res.status(scope1.code).json({ error: scope1.error });
  const { id } = req.params;
  const { name, fatherName, designation, serviceType, district, policeStation, mobile, email, venue, otherDetails, isActive } = req.body;
  if (serviceType && !VALID_TYPES.includes(serviceType)) {
    return res.status(400).json({ error: 'गलत सेवा प्रकार' });
  }
  const result = await db.query(
    `UPDATE service_providers SET
       name = COALESCE($1, name), father_name = COALESCE($2, father_name),
       designation = COALESCE($3, designation),
       service_type = COALESCE($4, service_type), district = COALESCE($5, district),
       police_station = COALESCE($6, police_station),
       mobile = COALESCE($7, mobile), email = COALESCE($8, email), venue = COALESCE($9, venue),
       other_details = COALESCE($10, other_details),
       is_active = COALESCE($11, is_active)
     WHERE id = $12 RETURNING *`,
    [
      name?.trim() || null, fatherName || null, designation || null, serviceType || null, district || null,
      policeStation || null, mobile || null, email || null, venue || null, otherDetails || null,
      isActive === undefined ? null : isActive, id,
    ]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'काउंसलर नहीं मिला' });
  res.json(rowToProvider(result.rows[0]));
}

// ============================================================
// काउंसलर/प्रशिक्षक का अपना लॉगिन — अपनी अपॉइंटमेंट्स देखने, उपस्थिति मार्क
// करने, और अपनी प्रोफ़ाइल एडिट करने के लिए। अलग role ('counsellor') के रूप में।
// ============================================================

function toCounsellorSelf(r) {
  return {
    id: r.id,
    name: r.name,
    fatherName: r.father_name,
    designation: r.designation,
    serviceType: r.service_type,
    district: r.district,
    policeStation: r.police_station,
    mobile: r.mobile,
    email: r.email,
    venue: r.venue,
    otherDetails: r.other_details,
    photoUrl: r.photo_url,
    role: 'counsellor',
  };
}

// POST /counselling/providers/login   body: { identifier, password }  (मोबाइल या ईमेल)
async function counsellorLogin(req, res) {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'मोबाइल/ईमेल और पासवर्ड आवश्यक हैं' });
  }
  const field = String(identifier).includes('@') ? 'email' : 'mobile';
  // 🐛 बग फ़िक्स: यह लॉगिन अब तक case-sensitive exact match इस्तेमाल कर रहा था — वही बग
  // जो नागरिक/अधिकारी/एडमिन लॉगिन में पहले मिला और ठीक किया गया था (अलग-अलग फ़ोन के
  // keyboard अलग auto-capitalize करते हैं) — यहां छूट गया था। अब वही case/space-सहनशील मिलान।
  const result = await db.query(
    `SELECT * FROM service_providers WHERE LOWER(TRIM(${field})) = LOWER(TRIM($1)) AND is_active = true`,
    [identifier]
  );
  const provider = result.rows[0];
  // 🐛 बग फ़िक्स (टाइमिंग-साइड-चैनल): पहले "खाता नहीं मिला" और "पासवर्ड सेट नहीं है"
  // दोनों स्थितियों में bcrypt.compare() चलने से पहले ही जवाब लौट जाता था — जबकि
  // "खाता मिला, पासवर्ड ग़लत" में bcrypt की असली गणना (~350ms) लगती। जवाब आने के
  // समय से कोई भी पता लगा सकता था कि दिया गया मोबाइल/ईमेल रजिस्टर्ड काउंसलर है या
  // नहीं। अब हर स्थिति में एक जैसी गणना होती है।
  if (isBlockedDemoPassword(password, identifier)) return res.status(403).json(DEMO_PASSWORD_ERROR);
  const match = await timingSafeVerify(password, provider?.password_hash);
  if (!match) {
    logActivity({ actorRole: 'counsellor', actorId: provider?.id || null, actorName: maskIdentity(identifier), action: 'login_failed', details: 'ग़लत पासवर्ड (काउंसलर)', req });
    return res.status(401).json({ error: 'ग़लत पासवर्ड या खाता नहीं मिला' });
  }
  const token = signToken({ id: provider.id, role: 'counsellor', name: provider.name });
  const refreshToken = await createRefreshToken(provider.id, 'counsellor', req.body.deviceName);
  res.json({ token, refreshToken, user: toCounsellorSelf(provider) });
}

// GET /counselling/providers/me   (काउंसलर खुद)
async function getMyProviderProfile(req, res) {
  const result = await db.query('SELECT * FROM service_providers WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'प्रोफ़ाइल नहीं मिली' });
  res.json(toCounsellorSelf(result.rows[0]));
}

// PATCH /counselling/providers/me   (काउंसलर खुद अपनी प्रोफ़ाइल एडिट करे)
async function updateMyProviderProfile(req, res) {
  const { name, fatherName, designation, district, policeStation, mobile, email, venue, otherDetails } = req.body;
  if (name) {
    const nameErr = validateName(name);
    if (nameErr) return res.status(400).json({ error: nameErr });
  }
  if (mobile) {
    const mobileErr = validateMobile(mobile);
    if (mobileErr) return res.status(400).json({ error: mobileErr });
  }
  if (email) {
    const emailErr = validateEmail(email);
    if (emailErr) return res.status(400).json({ error: emailErr });
  }
  const result = await db.query(
    `UPDATE service_providers SET
       name = COALESCE($1, name), father_name = COALESCE($2, father_name),
       designation = COALESCE($3, designation), district = COALESCE($4, district),
       police_station = COALESCE($5, police_station), mobile = COALESCE($6, mobile),
       email = COALESCE($7, email), venue = COALESCE($8, venue), other_details = COALESCE($9, other_details)
     WHERE id = $10 RETURNING *`,
    [
      name?.trim() || null, fatherName || null, designation || null, district || null,
      policeStation || null, mobile?.trim() || null, email?.trim() || null, venue || null, otherDetails || null,
      req.user.id,
    ]
  );
  res.json(toCounsellorSelf(result.rows[0]));
}

// PATCH /counselling/providers/me/photo   body: { photoUrl }
async function updateMyProviderPhoto(req, res) {
  const { photoUrl } = req.body;
  if (photoUrl) {
    const urlErr = validateUrl(photoUrl, { label: 'फ़ोटो', allowDataUri: true });
    if (urlErr) return res.status(400).json({ error: urlErr });
  }
  const result = await db.query('UPDATE service_providers SET photo_url = $1 WHERE id = $2 RETURNING *', [photoUrl || null, req.user.id]);
  res.json(toCounsellorSelf(result.rows[0]));
}

// 🆕 PATCH /counselling/providers/me/push-token   body: { pushToken }
// पहले काउंसलर के लिए यह endpoint मौजूद ही नहीं था — कॉलम (push_token) DB में था,
// पर उसे भरने का कोई रास्ता नहीं था, इसलिए काउंसलर को कभी भी push notification
// नहीं मिल पाती थी (नई अपॉइंटमेंट/सत्र-निर्धारण की सूचना समेत)।
async function updateMyProviderPushToken(req, res) {
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
      db.query('UPDATE admins SET push_token = NULL WHERE push_token = $1', [pushToken]),
      db.query('UPDATE service_providers SET push_token = NULL WHERE push_token = $1 AND id <> $2', [pushToken, req.user.id]),
    ]);
  }
  await db.query('UPDATE service_providers SET push_token = $1 WHERE id = $2', [pushToken || null, req.user.id]);
  res.json({ message: 'सुरक्षित हुआ' });
}

// GET /counselling/providers/me/sessions   (काउंसलर की अपनी अपॉइंटमेंट्स)
async function getMySessions(req, res) {
  const result = await db.query(
    `SELECT * FROM counselling_requests WHERE counsellor_id = $1 ORDER BY scheduled_at DESC NULLS LAST, created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows.map(rowToRequest));
}

// PATCH /counselling/providers/me/sessions/:id   body: { attendance, outcome, followUpNeeded, followUpAt }
// ⚠️ काउंसलर सिर्फ़ अपनी ही अपॉइंटमेंट पर उपस्थिति/परिणाम दर्ज कर सकता है —
// तारीख़/समय बदलना (reschedule) या नया counsellor असाइन करना नहीं (वह SHO/DSP+ का काम है)
async function updateMySession(req, res) {
  const { id } = req.params;
  const { attendance, outcome, followUpNeeded, followUpAt } = req.body;

  // 🆕 सत्र-परिणाम पर लंबाई-सीमा — पहले सर्वर पर कोई सीमा जांची ही नहीं जाती थी
  const outcomeErr = validateTextLength(outcome, { max: 1000, label: 'सत्र का परिणाम' });
  if (outcomeErr) return res.status(400).json({ error: outcomeErr });

  const current = await db.query('SELECT * FROM counselling_requests WHERE id = $1', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'अनुरोध नहीं मिला' });
  const row = current.rows[0];
  if (row.counsellor_id !== req.user.id) {
    return res.status(403).json({ error: 'यह अपॉइंटमेंट आपको सौंपी नहीं गई है' });
  }

  const newStatus = attendance ? (attendance === 'उपस्थित' ? 'पूर्ण' : row.status) : row.status;
  const result = await db.query(
    `UPDATE counselling_requests SET
       attendance = COALESCE($1, attendance), outcome = COALESCE($2, outcome),
       follow_up_needed = COALESCE($3, follow_up_needed), follow_up_at = COALESCE($4, follow_up_at),
       status = $5, updated_at = now()
     WHERE id = $6 RETURNING *`,
    [attendance || null, outcome || null, followUpNeeded === undefined ? null : followUpNeeded, followUpAt || null, newStatus, id]
  );
  logHistory({ requestId: id, action: 'attendance_marked', toValue: attendance || newStatus, user: req.user });
  res.json(rowToRequest(result.rows[0]));
}

// DELETE /counselling/providers/:id — सुरक्षा के लिए असल delete नहीं, सिर्फ़ निष्क्रिय
// (पुराने सत्रों के इतिहास में नाम बना रहे)
async function deactivateProvider(req, res) {
  if (!canManageProviders(req.user)) {
    return res.status(403).json({ error: 'सिर्फ़ Super Admin या SHO निष्क्रिय कर सकते हैं' });
  }
  const scope2 = await assertProviderInScope(req, req.params.id);
  if (!scope2.ok) return res.status(scope2.code).json({ error: scope2.error });

  const provider = await db.query('SELECT name FROM service_providers WHERE id = $1', [req.params.id]);
  const providerName = provider.rows[0]?.name || 'काउंसलर';

  await db.query('UPDATE service_providers SET is_active = false WHERE id = $1', [req.params.id]);

  // 🐛 बग फ़िक्स: काउंसलर निष्क्रिय हो जाता था, पर उसके तय किए गए आने वाले सत्र जस
  // के तस उसी से जुड़े रहते। नतीजा — और यह अधिकारी वाले मामले से भी गंभीर है:
  // महिला को तारीख़ बताई जा चुकी होती है (सूचना/SMS से), वह उस दिन पहुँचती है, और
  // वहाँ कोई होता ही नहीं। घरेलू-हिंसा के मामलों में सत्र तक पहुँचना अपने आप में
  // जोखिम व मेहनत का काम है — इसलिए ऐसा होना सिर्फ़ असुविधा नहीं, भरोसा टूटना है।
  //
  // अब वे सत्र दोबारा "अनुरोध प्राप्त" सूची में लौट आते हैं (जहाँ से अधिकारी नया
  // काउंसलर व समय तय करता है), और महिला को पहले ही बता दिया जाता है — ताकि उसे यह
  // बात उसी दिन वहाँ पहुँचकर पता न चले।
  const affected = await db.query(
    `UPDATE counselling_requests
        SET counsellor_id = NULL, counsellor_name = NULL, scheduled_at = NULL,
            status = 'अनुरोध प्राप्त'
      WHERE counsellor_id = $1 AND status = 'सत्र निर्धारित'
      RETURNING id, citizen_id, type`,
    [req.params.id]
  );

  for (const r of affected.rows) {
    await db.query(
      `INSERT INTO service_request_history (request_id, action, to_value, reason, actor_role, actor_name)
       VALUES ($1, 'rescheduled', 'अनुरोध प्राप्त', $2, $3, $4)`,
      [r.id, `${providerName} के निष्क्रिय होने पर सत्र रद्द — नया समय तय किया जाना है`, req.user.role, req.user.name]
    );
    createNotification({
      recipientRole: 'citizen',
      recipientId: r.citizen_id,
      title: 'आपका सत्र दोबारा तय किया जाएगा',
      body: 'अपरिहार्य कारण से आपका निर्धारित सत्र स्थगित हुआ है। नया समय जल्द बताया जाएगा — कृपया पुरानी तारीख़ पर न आएं।',
      data: { counsellingId: r.id, type: r.type },
    });
  }

  res.json({
    message: 'निष्क्रिय किया गया',
    rescheduledSessions: affected.rowCount,
  });
}


// PATCH /counselling/providers/me/password   body: { currentPassword, newPassword }
//
// 🆕 यह endpoint पहले नहीं था — काउंसलर/प्रशिक्षक अपना पासवर्ड बदल ही नहीं सकते थे।
// यही कमी अधिकारियों के लिए अभी ठीक की गई है (officerSelfController.changeMyPassword);
// काउंसलर वाला रास्ता छूट गया था। इनका पहला पासवर्ड Super Admin या SHO बनाता है और
// अक्सर किसी संदेश के ज़रिए पहुँचता है — बदलने का रास्ता न होने का मतलब है कि वही
// पासवर्ड हमेशा चलता रहेगा। काउंसलर पीड़िताओं के परामर्श-सत्र देखते हैं, इसलिए उनके
// खाते की सुरक्षा भी उतनी ही ज़रूरी है।
async function changeMyProviderPassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const pwErr = validateNewPassword(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const result = await db.query('SELECT password_hash FROM service_providers WHERE id = $1 AND is_active = true', [req.user.id]);
  const provider = result.rows[0];
  // timingSafeVerify — खाता न मिलने और पासवर्ड ग़लत होने में समय का फ़र्क़ न रहे
  if (!(await timingSafeVerify(currentPassword, provider?.password_hash))) {
    return res.status(401).json({ error: 'मौजूदा पासवर्ड गलत है' });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await db.query('UPDATE service_providers SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

  // पासवर्ड बदलते ही पुराने सभी सत्र रद्द
  await revokeAllForUser(req.user.id, 'counsellor');
  logActivity({ actorRole: 'counsellor', actorId: req.user.id, actorName: req.user.name, action: 'password_changed', details: 'काउंसलर ने अपना पासवर्ड बदला', req });
  res.json({ message: 'पासवर्ड बदल दिया गया — सुरक्षा के लिए सभी डिवाइस से लॉगआउट हो गया, कृपया दोबारा लॉगिन करें' });
}

module.exports = {
  changeMyProviderPassword,
  createRequest,
  listRequests,
  updateRequest,
  requestHistory,
  requestStats,
  canManageCounselling,
  canManageProviders,
  listProviders,
  createProvider,
  updateProvider,
  deactivateProvider,
  counsellorLogin,
  getMyProviderProfile,
  updateMyProviderProfile,
  updateMyProviderPhoto,
  updateMyProviderPushToken,
  getMySessions,
  updateMySession,
};
