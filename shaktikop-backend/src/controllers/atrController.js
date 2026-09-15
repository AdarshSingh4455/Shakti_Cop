const db = require('../config/db');
const { canManageCounselling } = require('./counsellingController');
const { decryptField } = require('../utils/fieldCrypto');

// ============================================================
// ATR — कार्यवाही आख्या (Action Taken Report)
//
// शिकायत दर्ज होने से बंद होने तक की पूरी कहानी एक जगह:
// शिकायत का विवरण, नियुक्त अधिकारी, हर स्थिति परिवर्तन, जांच checklist,
// फील्ड विज़िट, निजी टिप्पणियां, SOS, नागरिक की प्रतिक्रिया — और
// जवाबदेही के आंकड़े (कितनी देर में नियुक्ति हुई, कितनी देर में निस्तारण)।
//
// सिर्फ़ DSP व उससे ऊपर के अधिकारी — यही समीक्षा के लिए ज़िम्मेदार हैं।
// ============================================================

const MS_HOUR = 1000 * 60 * 60;

function hoursBetween(a, b) {
  if (!a || !b) return null;
  return Math.round(((new Date(b) - new Date(a)) / MS_HOUR) * 10) / 10;
}

// SLA — श्रेणी के अनुसार, न मिले तो 48 घंटे
async function slaHoursFor(category) {
  try {
    const r = await db.query('SELECT sla_hours FROM complaint_categories WHERE key = $1', [category]);
    return r.rows[0]?.sla_hours || 48;
  } catch (e) {
    return 48;
  }
}

// GET /atr/:id — एक शिकायत की पूरी ATR
async function getAtr(req, res) {
  if (!canManageCounselling(req.user)) {
    return res.status(403).json({ error: 'ATR देखने की अनुमति सिर्फ़ DSP व उससे ऊपर के अधिकारियों को है' });
  }
  const { id } = req.params;

  const c = await db.query(
    `SELECT c.*, ci.name AS citizen_name, ci.mobile AS citizen_mobile,
            o.name AS officer_name, o.badge_id AS officer_badge, o.mobile AS officer_mobile,
            o.station AS officer_station, o.rank AS officer_rank
     FROM complaints c
     JOIN citizens ci ON ci.id = c.citizen_id
     LEFT JOIN officers o ON o.id = c.officer_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id]
  );
  if (c.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  const row = c.rows[0];

  // IG/DIG अपने Range (कई ज़िलों) तक सीमित
  // 🐛 बग फ़िक्स: यह जांच छूट गई थी
  if (req.adminScope?.rangeDistricts?.length && !req.adminScope.rangeDistricts.includes(row.district)) {
    return res.status(403).json({ error: 'यह शिकायत आपके Range की नहीं है' });
  }
  // SP/district_admin अपने ज़िले तक सीमित
  if (req.adminScope?.district && row.district !== req.adminScope.district) {
    return res.status(403).json({ error: 'यह शिकायत आपके ज़िले की नहीं है' });
  }
  if (req.adminScope?.circleStations?.length && !req.adminScope.circleStations.includes(row.police_station)) {
    return res.status(403).json({ error: 'यह शिकायत आपके सर्किल की नहीं है' });
  }
  // 🐛 बग फ़िक्स: SHO के लिए यहाँ कोई station-scope जांच ही नहीं थी (req.adminScope सिर्फ़
  // admin भूमिका के लिए भरता है) — यानी SHO चाहे तो किसी भी थाने की ATR देख सकता था। अब
  // SHO सिर्फ़ अपने ही थाने की शिकायतों की ATR देख सकता है — बाक़ी सब जगह जैसा दायरा।
  if (req.user.role === 'officer' && req.user.rank === 'SHO' && req.user.station) {
    const shoStation = req.user.station.trim().toLowerCase();
    const rowStation = (row.police_station || '').trim().toLowerCase();
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं — "कोतवाली" 65 ज़िलों में है, इसलिए ज़िला भी जांचें
    const districtMismatch =
      req.user.district && row.district &&
      row.district.trim().toLowerCase() !== req.user.district.trim().toLowerCase();
    if (rowStation !== shoStation || districtMismatch) {
      return res.status(403).json({ error: 'यह शिकायत आपके थाने की नहीं है' });
    }
  }

  const [history, visits, notes, views] = await Promise.all([
    db.query(
      `SELECT status, note, actor_role, actor_name, attachment_url, voice_note_url, created_at
       FROM complaint_history WHERE complaint_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
    db.query(
      `SELECT officer_name, latitude, longitude, note, created_at
       FROM field_visits WHERE complaint_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
    db.query(
      `SELECT officer_name, note, created_at
       FROM officer_private_notes WHERE complaint_id = $1 ORDER BY created_at ASC`,
      [id]
    ),
    db.query(
      `SELECT viewer_role, viewer_name, viewer_rank, viewed_at
       FROM complaint_views WHERE complaint_id = $1 ORDER BY viewed_at ASC`,
      [id]
    ).catch(() => ({ rows: [] })), // तालिका न हो तो ATR फिर भी बने
  ]);

  // ============================================================
  // एकीकृत घटनाक्रम (audit trail) — सारे स्रोतों की घटनाएं एक ही समयक्रम में,
  // सेकंड तक सटीक। पहले ये अलग-अलग खंडों में बिखरी थीं, इसलिए यह देखना कठिन
  // था कि "देखने" और "कार्यवाही" के बीच असल में कितना समय बीता।
  // ============================================================
  const hist = history.rows;
  const events = [];

  events.push({
    at: row.created_at,
    kind: 'created',
    title: 'शिकायत दर्ज हुई',
    actor: row.is_anonymous ? 'गुमनाम शिकायतकर्ता' : row.citizen_name,
    actorRole: 'citizen',
    detail: `${row.category} · ${row.police_station || '—'}, ${row.district || '—'}`,
  });

  if (row.sos_triggered && row.sos_triggered_at) {
    events.push({
      at: row.sos_triggered_at,
      kind: 'sos',
      title: '🆘 SOS दबाया गया',
      actor: row.is_anonymous ? 'गुमनाम शिकायतकर्ता' : row.citizen_name,
      actorRole: 'citizen',
      detail: 'आपात सहायता का अनुरोध',
    });
  }

  for (const v of views.rows) {
    events.push({
      at: v.viewed_at,
      kind: 'viewed',
      title: 'शिकायत देखी गई',
      actor: v.viewer_name,
      actorRole: v.viewer_role,
      detail: v.viewer_rank ? `पद: ${v.viewer_rank}` : null,
    });
  }

  for (const h of hist) {
    events.push({
      at: h.created_at,
      kind: h.status === 'अधिकारी नियुक्त' ? 'assigned' : 'status',
      title: h.status,
      actor: h.actor_name,
      actorRole: h.actor_role,
      detail: h.note || null,
      hasAttachment: !!h.attachment_url,
      hasVoiceNote: !!h.voice_note_url,
    });
  }

  for (const v of visits.rows) {
    events.push({
      at: v.created_at,
      kind: 'visit',
      title: 'फील्ड विज़िट (GPS)',
      actor: v.officer_name,
      actorRole: 'officer',
      // 🐛 बग फ़िक्स: encryption के बाद latitude अब string है — उस पर .toFixed()
      // सीधे चलाने से "toFixed is not a function" आकर पूरी ATR रिपोर्ट टूट जाती
      detail: (() => {
        const la = decryptGeo(v.latitude);
        const lo = decryptGeo(v.longitude);
        const coords = la != null && lo != null ? `${la.toFixed(5)}, ${lo.toFixed(5)}` : 'लोकेशन उपलब्ध नहीं';
        return `${coords}${v.note ? ' · ' + v.note : ''}`;
      })(),
    });
  }

  for (const n of notes.rows) {
    events.push({
      at: n.created_at,
      kind: 'note',
      title: 'निजी टिप्पणी',
      actor: n.officer_name,
      actorRole: 'officer',
      detail: n.note,
    });
  }

  // checklist के टिक — जिनमें समय दर्ज है
  const clist = Array.isArray(row.checklist) ? row.checklist : [];
  for (const ci of clist) {
    if (ci.done && ci.doneAt) {
      events.push({
        at: ci.doneAt,
        kind: 'checklist',
        title: 'जांच बिंदु पूर्ण',
        actor: row.officer_name || '—',
        actorRole: 'officer',
        detail: ci.label,
      });
    }
  }

  if (row.safe_arrival_confirmed && row.safe_arrival_confirmed_at) {
    events.push({
      at: row.safe_arrival_confirmed_at,
      kind: 'safe',
      title: 'सुरक्षित पहुँचने की पुष्टि',
      actor: row.is_anonymous ? 'गुमनाम शिकायतकर्ता' : row.citizen_name,
      actorRole: 'citizen',
      detail: null,
    });
  }

  if (row.feedback_submitted_at) {
    events.push({
      at: row.feedback_submitted_at,
      kind: 'feedback',
      title: 'नागरिक ने प्रतिक्रिया दी',
      actor: row.is_anonymous ? 'गुमनाम शिकायतकर्ता' : row.citizen_name,
      actorRole: 'citizen',
      detail: `${row.feedback_rating || '—'}/5${row.feedback_note ? ' · ' + row.feedback_note : ''}`,
    });
  }

  if (row.admin_verified && row.admin_verified_at) {
    events.push({
      at: row.admin_verified_at,
      kind: 'verified',
      title: 'एडमिन द्वारा सत्यापित',
      actor: row.admin_verified_by || '—',
      actorRole: 'admin',
      detail: 'निस्तारण की पुष्टि',
    });
  }

  // समय के क्रम में लगाएं, और हर घटना के बीच का अंतराल जोड़ें —
  // इससे तुरंत दिखता है कि कहाँ देरी हुई
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  let prev = null;
  for (const e of events) {
    e.gapMinutes = prev ? Math.round((new Date(e.at) - new Date(prev)) / 60000) : 0;
    prev = e.at;
  }

  const assignedAt = hist.find((h) => h.status === 'अधिकारी नियुक्त')?.created_at || null;
  const inProgressAt = hist.find((h) => h.status === 'कार्यवाही जारी')?.created_at || null;
  const closedAt =
    hist.filter((h) => ['निस्तारित', 'अस्वीकृत'].includes(h.status)).slice(-1)[0]?.created_at || null;

  const sla = await slaHoursFor(row.category);
  const totalHours = hoursBetween(row.created_at, closedAt || new Date());
  const checklist = Array.isArray(row.checklist) ? row.checklist : [];
  const checklistDone = checklist.filter((x) => x.done).length;

  res.json({
    complaint: {
      id: row.id,
      category: row.category,
      status: row.status,
      priority: row.priority,
      description: row.description,
      district: row.district,
      policeStation: row.police_station,
      location: row.location,
      latitude: row.latitude != null ? Number(decryptField(row.latitude)) : null,
      longitude: row.longitude != null ? Number(decryptField(row.longitude)) : null,
      isAnonymous: row.is_anonymous,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // गुमनाम शिकायत में पीड़ित की पहचान ATR में भी छुपी रहती है
      victimName: row.is_anonymous ? null : decryptField(row.victim_name),
      victimMobile: row.is_anonymous ? null : decryptField(row.victim_mobile),
      victimAddress: row.is_anonymous ? null : decryptField(row.victim_address),
      citizenName: row.is_anonymous ? null : row.citizen_name,
      citizenMobile: row.is_anonymous ? null : row.citizen_mobile,
    },
    officer: row.officer_id
      ? {
          name: row.officer_name,
          badgeId: row.officer_badge,
          mobile: row.officer_mobile,
          station: row.officer_station,
          rank: row.officer_rank,
        }
      : null,
    events, // एकीकृत घटनाक्रम — सेकंड तक सटीक
    views: views.rows.map((v) => ({
      viewerRole: v.viewer_role,
      viewerName: v.viewer_name,
      viewerRank: v.viewer_rank,
      viewedAt: v.viewed_at,
    })),
    timeline: hist.map((h) => ({
      status: h.status,
      note: h.note,
      actorRole: h.actor_role,
      actorName: h.actor_name,
      hasAttachment: !!h.attachment_url,
      hasVoiceNote: !!h.voice_note_url,
      createdAt: h.created_at,
    })),
    checklist,
    fieldVisits: visits.rows.map((v) => ({
      officerName: v.officer_name,
      latitude: decryptGeo(v.latitude),
      longitude: decryptGeo(v.longitude),
      note: v.note,
      createdAt: v.created_at,
    })),
    privateNotes: notes.rows.map((n) => ({
      officerName: n.officer_name,
      note: n.note,
      createdAt: n.created_at,
    })),
    sos: {
      triggered: row.sos_triggered,
      triggeredAt: row.sos_triggered_at,
      safeArrivalConfirmed: row.safe_arrival_confirmed,
      safeArrivalAt: row.safe_arrival_confirmed_at,
    },
    feedback: {
      rating: row.feedback_rating,
      note: row.feedback_note,
      submittedAt: row.feedback_submitted_at,
    },
    verification: {
      adminVerified: row.admin_verified,
      verifiedAt: row.admin_verified_at,
      verifiedBy: row.admin_verified_by,
    },
    metrics: {
      slaHours: sla,
      hoursToAssign: hoursBetween(row.created_at, assignedAt),
      hoursToFirstAction: hoursBetween(row.created_at, inProgressAt),
      hoursToClose: hoursBetween(row.created_at, closedAt),
      totalHours,
      slaBreached: closedAt ? hoursBetween(row.created_at, closedAt) > sla : totalHours > sla,
      isClosed: !!closedAt,
      checklistDone,
      checklistTotal: checklist.length,
      officerViewedAt: row.officer_viewed_at,
      // अधिकारी ने नियुक्ति के बाद कितनी देर में शिकायत खोली — लापरवाही की पहचान
      hoursToOpen: hoursBetween(assignedAt, row.officer_viewed_at),
      totalViews: views.rows.length,
      firstViewAt: views.rows[0]?.viewed_at || row.officer_viewed_at || null,
      lastViewAt: views.rows[views.rows.length - 1]?.viewed_at || null,
      // नियुक्ति के बाद पहली बार देखने में लगा समय — लापरवाही की सबसे सीधी पहचान
      hoursAssignToFirstView: hoursBetween(assignedAt, views.rows[0]?.viewed_at || row.officer_viewed_at),
      totalEvents: events.length,
    },
  });
}

// GET /atr — सारांश सूची (कई शिकायतों की तुलना, समीक्षा हेतु)
async function listAtrSummary(req, res) {
  if (!canManageCounselling(req.user)) {
    return res.status(403).json({ error: 'अनुमति नहीं है' });
  }
  const params = [];
  const clauses = [];
  // 🐛 बग फ़िक्स: हटाई गई (soft-deleted) शिकायतें ATR सूची में भी आ रही थीं — बाक़ी
  // हर सूची में वे छिपी रहती हैं, यहीं छूट गया था
  clauses.push('c.deleted_at IS NULL');
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी
  if (req.adminScope?.rangeDistricts?.length) {
    params.push(req.adminScope.rangeDistricts);
    clauses.push(`c.district = ANY($${params.length})`);
  }
  if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    clauses.push(`c.district = $${params.length}`);
  }
  if (req.adminScope?.circleStations?.length) {
    params.push(req.adminScope.circleStations);
    clauses.push(`c.police_station = ANY($${params.length})`);
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    if (req.adminScope.district) {
      params.push(req.adminScope.district);
      clauses.push(`c.district = $${params.length}`);
    }
  }
  // 🐛 बग फ़िक्स: SHO के लिए station-scope यहाँ भी गायब था — getAtr जैसा ही
  if (req.user.role === 'officer' && req.user.rank === 'SHO' && req.user.station) {
    params.push(req.user.station.trim().toLowerCase());
    clauses.push(`LOWER(TRIM(c.police_station)) = $${params.length}`);
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं — "कोतवाली" 65 ज़िलों में है
    if (req.user.district) {
      params.push(req.user.district.trim().toLowerCase());
      clauses.push(`LOWER(TRIM(c.district)) = $${params.length}`);
    }
  }
  if (req.query.status) {
    params.push(req.query.status);
    clauses.push(`c.status = $${params.length}`);
  }
  if (req.query.district) {
    params.push(req.query.district);
    clauses.push(`c.district = $${params.length}`);
  }
  if (req.query.dateFrom) {
    params.push(req.query.dateFrom);
    clauses.push(`c.created_at >= $${params.length}`);
  }
  if (req.query.dateTo) {
    params.push(req.query.dateTo);
    clauses.push(`c.created_at <= ($${params.length}::date AT TIME ZONE 'Asia/Kolkata' + INTERVAL '1 day')`);
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') + ' AND c.deleted_at IS NULL' : ' WHERE c.deleted_at IS NULL';

  const r = await db.query(
    `SELECT c.id, c.category, c.status, c.priority, c.district, c.police_station,
            c.created_at, c.updated_at, c.admin_verified, c.feedback_rating,
            c.sos_triggered, c.checklist, c.officer_viewed_at,
            o.name AS officer_name, o.badge_id AS officer_badge
     FROM complaints c
     LEFT JOIN officers o ON o.id = c.officer_id${where}
     ORDER BY c.created_at DESC LIMIT 500`,
    params
  );

  const now = new Date();
  const rows = r.rows.map((x) => {
    const closed = ['निस्तारित', 'अस्वीकृत'].includes(x.status);
    const hours = hoursBetween(x.created_at, closed ? x.updated_at : now);
    const checklist = Array.isArray(x.checklist) ? x.checklist : [];
    return {
      id: x.id,
      category: x.category,
      status: x.status,
      priority: x.priority,
      district: x.district,
      policeStation: x.police_station,
      officerName: x.officer_name,
      officerBadge: x.officer_badge,
      createdAt: x.created_at,
      updatedAt: x.updated_at,
      adminVerified: x.admin_verified,
      feedbackRating: x.feedback_rating,
      sosTriggered: x.sos_triggered,
      checklistDone: checklist.filter((i) => i.done).length,
      checklistTotal: checklist.length,
      isClosed: closed,
      hours,
      neverOpened: !x.officer_viewed_at,
    };
  });

  res.json(rows);
}

module.exports = { getAtr, listAtrSummary };
