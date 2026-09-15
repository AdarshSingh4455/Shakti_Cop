const db = require('../config/db');
const { buildScopeClause } = require('../utils/scopeFilter');
const { decryptField } = require('../utils/fieldCrypto');
const { validateDateString, validateEnum, validatePositiveInt } = require('../utils/fieldValidators');

const STATUSES = ['दर्ज', 'अधिकारी नियुक्त', 'कार्यवाही जारी', 'निस्तारित', 'अस्वीकृत'];

// 🆕 सभी advanced-analytics फ़िल्टर एक ही जगह पार्स/जांच होते हैं — हर endpoint
// यहीं से इस्तेमाल करता है ताकि व्यवहार हर जगह एक जैसा रहे।
// query params: dateFrom, dateTo, category, status, station, officerId
function parseAnalyticsFilters(req) {
  const { dateFrom, dateTo, category, status, station, officerId } = req.query;
  const errors = [];
  if (dateFrom) {
    const e = validateDateString(dateFrom, { label: 'dateFrom' });
    if (e) errors.push(e);
  }
  if (dateTo) {
    const e = validateDateString(dateTo, { label: 'dateTo' });
    if (e) errors.push(e);
  }
  if (status) {
    const e = validateEnum(status, STATUSES, { label: 'status' });
    if (e) errors.push(e);
  }
  return { dateFrom: dateFrom || null, dateTo: dateTo || null, category: category || null, status: status || null, station: station || null, officerId: officerId || null, errors };
}

// scope (district/circle) + advanced filters — दोनों को मिलाकर एक ही WHERE-क्लॉज़
// और parameter-सूची बनाता है (सब कहीं भी parameterized, कभी string-concatenation नहीं)
function buildFilterClause(req, filters, prefix = 'c') {
  const { clause: scopeClause, params } = buildScopeClause(req, [], prefix);
  let clause = scopeClause;
  const p = `${prefix}.`;

  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    clause += ` AND ${p}created_at >= $${params.length}::date AT TIME ZONE 'Asia/Kolkata'`;
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    clause += ` AND ${p}created_at < ($${params.length}::date AT TIME ZONE 'Asia/Kolkata' + interval '1 day')`;
  }
  if (filters.category) {
    params.push(filters.category);
    clause += ` AND ${p}category = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    clause += ` AND ${p}status = $${params.length}`;
  }
  // station फ़िल्टर सिर्फ़ तभी लागू करें जब admin का अपना scope उसे पहले से सीमित
  // न कर रहा हो — DSP का circleStations scope पहले से थानों की सूची तक सीमित
  // करता है, ऊपर से station फ़िल्टर सिर्फ़ उसी सूची के भीतर और सीमित करता है
  if (filters.station) {
    params.push(filters.station);
    clause += ` AND ${p}police_station = $${params.length}`;
  }
  if (filters.officerId) {
    params.push(filters.officerId);
    clause += ` AND ${p}officer_id = $${params.length}`;
  }
  return { clause, params };
}

// GET /admin/analytics/overview?dateFrom=&dateTo=&category=&status=&station=&officerId=
async function getOverview(req, res) {
  const filters = parseAnalyticsFilters(req);
  if (filters.errors.length > 0) return res.status(400).json({ error: filters.errors[0] });

  const { clause, params } = buildFilterClause(req, filters, 'c');

  const monthly = await db.query(
    `SELECT to_char(date_trunc('month', c.created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
            count(*) AS total,
            count(*) FILTER (WHERE c.status = 'निस्तारित') AS resolved
     FROM complaints c
     WHERE c.deleted_at IS NULL AND c.created_at >= now() - interval '12 months' ${clause}
     GROUP BY 1 ORDER BY 1 ASC`,
    params
  );

  const byCategory = await db.query(
    `SELECT c.category, count(*) AS total FROM complaints c WHERE c.deleted_at IS NULL ${clause} GROUP BY c.category ORDER BY total DESC`,
    params
  );

  const byDistrict = (req.adminScope?.district || req.adminScope?.circleStations?.length)
    ? { rows: [] }
    : await db.query(
        `SELECT c.district, count(*) AS total FROM complaints c WHERE c.deleted_at IS NULL AND c.district IS NOT NULL ${clause} GROUP BY c.district ORDER BY total DESC LIMIT 10`,
        params
      );

  // 🆕 थाना-वार बंटवारा (जब ज़िला/circle scope पहले से चुना हो, तभी उपयोगी)
  const byStation = await db.query(
    `SELECT c.police_station, count(*) AS total FROM complaints c WHERE c.deleted_at IS NULL AND c.police_station IS NOT NULL ${clause} GROUP BY c.police_station ORDER BY total DESC LIMIT 15`,
    params
  );

  // 🆕 स्थिति-फ़नल (कहां-कहां शिकायतें अटकी हैं)
  const byStatus = await db.query(
    `SELECT c.status, count(*) AS total FROM complaints c WHERE c.deleted_at IS NULL ${clause} GROUP BY c.status`,
    params
  );

  // 🆕 निस्तारण-समय का वितरण (कितनी शिकायतें कितनी जल्दी/देर से निपटीं)
  const responseTimeDist = await db.query(
    `SELECT
       count(*) FILTER (WHERE hrs < 2) AS under_2h,
       count(*) FILTER (WHERE hrs >= 2 AND hrs < 6) AS h2_6,
       count(*) FILTER (WHERE hrs >= 6 AND hrs < 24) AS h6_24,
       count(*) FILTER (WHERE hrs >= 24 AND hrs < 72) AS d1_3,
       count(*) FILTER (WHERE hrs >= 72 AND hrs < 168) AS d3_7,
       count(*) FILTER (WHERE hrs >= 168) AS over_7d
     FROM (
       SELECT EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)) / 3600 AS hrs
       FROM complaints c WHERE c.deleted_at IS NULL AND c.status = 'निस्तारित' ${clause}
     ) t`,
    params
  );

  // 🆕 हफ़्ते के किस दिन सबसे ज़्यादा शिकायतें आती हैं (staffing-योजना के लिए उपयोगी)
  // 🐛 बग फ़िक्स (समय-क्षेत्र): created_at TIMESTAMPTZ है और EXTRACT सर्वर के timezone
  // में चलता है — जो Railway/AWS जैसे cloud सर्वर पर डिफ़ॉल्ट रूप से UTC होता है।
  // यानी रात 9 बजे (IST) दर्ज शिकायत "दोपहर 3:30" में गिनी जाती, और रात 2 बजे वाली
  // "पिछले दिन रात 8:30" में। चूंकि ये चार्ट सीधे गश्त (patrol) व staffing की योजना
  // के लिए इस्तेमाल होते हैं, दिखाया गया "व्यस्ततम समय" पूरे 5:30 घंटे ग़लत था।
  // अब पहले IST में बदला जाता है, फिर घंटा/दिन निकाला जाता है।
  const byDayOfWeek = await db.query(
    `SELECT EXTRACT(DOW FROM c.created_at AT TIME ZONE 'Asia/Kolkata')::int AS dow, count(*) AS total
     FROM complaints c WHERE c.deleted_at IS NULL ${clause} GROUP BY 1 ORDER BY 1`,
    params
  );

  // 🆕 दिन के किस समय (घंटे) सबसे ज़्यादा शिकायतें आती हैं
  const byHour = await db.query(
    `SELECT EXTRACT(HOUR FROM c.created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour, count(*) AS total
     FROM complaints c WHERE c.deleted_at IS NULL ${clause} GROUP BY 1 ORDER BY 1`,
    params
  );

  const resolutionStats = await db.query(
    `SELECT
       avg(EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)) / 3600) FILTER (WHERE c.status = 'निस्तारित') AS avg_resolution_hours,
       count(*) FILTER (WHERE c.status = 'दर्ज') AS pending,
       count(*) FILTER (WHERE c.status = 'निस्तारित') AS resolved,
       count(*) FILTER (WHERE c.status = 'अस्वीकृत') AS rejected,
       count(*) AS total,
       avg(c.feedback_rating) FILTER (WHERE c.feedback_rating IS NOT NULL) AS avg_rating,
       count(*) FILTER (WHERE c.sos_triggered = true) AS sos_count
     FROM complaints c WHERE c.deleted_at IS NULL ${clause}`,
    params
  );
  const r = resolutionStats.rows[0];

  // 🆕 पिछली उतनी ही अवधि से तुलना (सिर्फ़ dateFrom/dateTo दोनों दिए गए हों तो) —
  // "पिछले महीने से कितना बदलाव" जैसी insight के लिए
  let comparison = null;
  if (filters.dateFrom && filters.dateTo) {
    const days = Math.max(
      1,
      Math.round((new Date(filters.dateTo) - new Date(filters.dateFrom)) / (1000 * 60 * 60 * 24)) + 1
    );
    const prevFilters = {
      ...filters,
      dateFrom: new Date(new Date(filters.dateFrom).getTime() - days * 86400000).toISOString().slice(0, 10),
      dateTo: new Date(new Date(filters.dateFrom).getTime() - 86400000).toISOString().slice(0, 10),
    };
    const { clause: prevClause, params: prevParams } = buildFilterClause(req, prevFilters, 'c');
    const prevStats = await db.query(
      `SELECT count(*) AS total, count(*) FILTER (WHERE c.status = 'निस्तारित') AS resolved
       FROM complaints c WHERE c.deleted_at IS NULL ${prevClause}`,
      prevParams
    );
    const pr = prevStats.rows[0];
    const prevTotal = Number(pr.total);
    comparison = {
      previousTotal: prevTotal,
      totalChangePercent: prevTotal > 0 ? Math.round(((Number(r.total) - prevTotal) / prevTotal) * 100) : null,
      previousResolved: Number(pr.resolved),
    };
  }

  const DOW_NAMES = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

  res.json({
    monthlyTrend: monthly.rows.map((m) => ({ month: m.month, total: Number(m.total), resolved: Number(m.resolved) })),
    byCategory: byCategory.rows.map((c) => ({ category: c.category, total: Number(c.total) })),
    byDistrict: byDistrict.rows.map((d) => ({ district: d.district, total: Number(d.total) })),
    byStation: byStation.rows.map((s) => ({ station: s.police_station, total: Number(s.total) })),
    byStatus: byStatus.rows.map((s) => ({ status: s.status, total: Number(s.total) })),
    byDayOfWeek: byDayOfWeek.rows.map((d) => ({ day: DOW_NAMES[d.dow], total: Number(d.total) })),
    byHour: byHour.rows.map((h) => ({ hour: h.hour, total: Number(h.total) })),
    responseTimeDistribution: {
      under2h: Number(responseTimeDist.rows[0].under_2h),
      h2to6: Number(responseTimeDist.rows[0].h2_6),
      h6to24: Number(responseTimeDist.rows[0].h6_24),
      d1to3: Number(responseTimeDist.rows[0].d1_3),
      d3to7: Number(responseTimeDist.rows[0].d3_7),
      over7d: Number(responseTimeDist.rows[0].over_7d),
    },
    comparison,
    summary: {
      total: Number(r.total),
      pending: Number(r.pending),
      resolved: Number(r.resolved),
      rejected: Number(r.rejected),
      sosCount: Number(r.sos_count),
      avgResolutionHours: r.avg_resolution_hours ? Number(r.avg_resolution_hours).toFixed(1) : null,
      avgRating: r.avg_rating ? Number(r.avg_rating).toFixed(1) : null,
      resolutionRate: r.total > 0 ? Math.round((Number(r.resolved) / Number(r.total)) * 100) : 0,
    },
    appliedFilters: filters,
  });
}

// 🆕 GET /admin/analytics/filter-options — फ़िल्टर dropdown बनाने के लिए, scope के
// भीतर मौजूद असली categories/districts/stations/officers की सूची (हार्डकोड नहीं,
// डेटा-आधारित — नई category/थाना जुड़ने पर अपने-आप दिखेगा)
async function getFilterOptions(req, res) {
  const { clause, params } = buildScopeClause(req, [], 'c');
  const categories = await db.query(
    `SELECT DISTINCT c.category FROM complaints c WHERE c.deleted_at IS NULL ${clause} ORDER BY c.category`,
    params
  );
  const stations = await db.query(
    `SELECT DISTINCT c.police_station FROM complaints c WHERE c.deleted_at IS NULL AND c.police_station IS NOT NULL ${clause} ORDER BY c.police_station`,
    params
  );
  let officerClause = '';
  let officerParams = [];
  // 🐛 बग फ़िक्स (गंभीर): rangeDistricts (IG/DIG) की जांच यहां छूट गई थी — नतीजा,
  // filter-dropdown में IG/DIG को अपने Range से बाहर के भी सभी officers दिखते।
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    officerParams = [req.adminScope.rangeDistricts];
    officerClause = ' AND district = ANY($1)';
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    officerParams = [req.adminScope.circleStations, req.adminScope.district || null];
    officerClause = ' AND station = ANY($1) AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2)))';
  } else if (req.adminScope?.district) {
    officerParams = [req.adminScope.district];
    officerClause = ' AND district = $1';
  }
  const officers = await db.query(
    `SELECT id, name, badge_id, station FROM officers WHERE is_active = true ${officerClause} ORDER BY name`,
    officerParams
  );
  res.json({
    categories: categories.rows.map((r) => r.category),
    stations: stations.rows.map((r) => r.police_station),
    statuses: STATUSES,
    officers: officers.rows.map((r) => ({ id: r.id, name: r.name, badgeId: r.badge_id, station: r.station })),
  });
}

// GET /admin/analytics/officer-leaderboard?dateFrom=&dateTo=&station=&sortBy=
async function getOfficerLeaderboard(req, res) {
  const filters = parseAnalyticsFilters(req);
  if (filters.errors.length > 0) return res.status(400).json({ error: filters.errors[0] });
  const sortBy = ['resolved', 'resolutionRate', 'avgRating', 'avgResolutionHours'].includes(req.query.sortBy)
    ? req.query.sortBy
    : 'resolved';

  let districtFilter = '';
  const params = [];
  // 🐛 बग फ़िक्स (गंभीर): Officer Performance Leaderboard में rangeDistricts
  // (IG/DIG) की जांच छूट गई थी — नतीजा, IG/DIG को पूरे राज्य का leaderboard
  // दिखता, सिर्फ़ अपने Range का नहीं।
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    districtFilter = ` AND o.district = ANY($${params.length})`;
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    districtFilter = ` AND o.station = ANY($${params.length})`;
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    districtFilter = ` AND o.district = $${params.length}`;
  }
  if (filters.station) {
    params.push(filters.station);
    districtFilter += ` AND o.station = $${params.length}`;
  }

  // शिकायत-स्तर के फ़िल्टर (date range/category/status) LEFT JOIN की शर्त में लगते
  // हैं, न कि WHERE में — वरना वे officer-पंक्तियों को ही हटा देंगे जिनकी कोई
  // मेल खाती शिकायत न हो (उनका total_assigned/resolved सही 0 दिखना चाहिए, गायब नहीं)
  let complaintJoinFilter = '';
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    complaintJoinFilter += ` AND c.created_at >= $${params.length}::date AT TIME ZONE 'Asia/Kolkata'`;
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    complaintJoinFilter += ` AND c.created_at < ($${params.length}::date AT TIME ZONE 'Asia/Kolkata' + interval '1 day')`;
  }
  if (filters.category) {
    params.push(filters.category);
    complaintJoinFilter += ` AND c.category = $${params.length}`;
  }

  const result = await db.query(
    `SELECT o.id, o.name, o.badge_id, o.station, o.district,
            count(c.id) AS total_assigned,
            count(c.id) FILTER (WHERE c.status = 'निस्तारित') AS resolved,
            avg(EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)) / 3600) FILTER (WHERE c.status = 'निस्तारित') AS avg_resolution_hours,
            avg(c.feedback_rating) FILTER (WHERE c.feedback_rating IS NOT NULL) AS avg_rating
     FROM officers o
     LEFT JOIN complaints c ON c.officer_id = o.id AND c.deleted_at IS NULL ${complaintJoinFilter}
     WHERE o.is_active = true ${districtFilter}
     GROUP BY o.id`,
    params
  );

  const rows = result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    badgeId: r.badge_id,
    station: r.station,
    district: r.district,
    totalAssigned: Number(r.total_assigned),
    resolved: Number(r.resolved),
    resolutionRate: r.total_assigned > 0 ? Math.round((Number(r.resolved) / Number(r.total_assigned)) * 100) : 0,
    avgResolutionHours: r.avg_resolution_hours ? Number(r.avg_resolution_hours) : null,
    avgRating: r.avg_rating ? Number(r.avg_rating) : null,
  }));

  // sortBy लागू करें (SQL ORDER BY में नहीं — resolutionRate जैसे derived-field पर
  // सीधे DB में sort करना ज़्यादा जटिल क्वेरी मांगता, यह छोटी सूची पर काफ़ी तेज़ है)
  rows.sort((a, b) => {
    if (sortBy === 'avgResolutionHours') {
      // कम समय बेहतर — पर null (कोई डेटा नहीं) हमेशा सबसे नीचे
      if (a.avgResolutionHours == null) return 1;
      if (b.avgResolutionHours == null) return -1;
      return a.avgResolutionHours - b.avgResolutionHours;
    }
    return (b[sortBy] || 0) - (a[sortBy] || 0);
  });

  res.json(
    rows.map((r) => ({
      ...r,
      avgResolutionHours: r.avgResolutionHours != null ? r.avgResolutionHours.toFixed(1) : null,
      avgRating: r.avgRating != null ? r.avgRating.toFixed(1) : null,
    }))
  );
}

// GET /admin/analytics/heatmap   — नक्शे पर शिकायतों का घनत्व दिखाने के लिए
async function getHeatmapPoints(req, res) {
  const { clause: districtFilter, params } = buildScopeClause(req);
  const result = await db.query(
    `SELECT latitude, longitude, category, status FROM complaints
     WHERE deleted_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL ${districtFilter}
     ORDER BY created_at DESC LIMIT 500`,
    params
  );
  res.json(
    result.rows.map((r) => ({
      latitude: r.latitude != null ? Number(decryptField(r.latitude)) : null,
      longitude: r.longitude != null ? Number(decryptField(r.longitude)) : null,
      category: r.category,
      status: r.status,
    }))
  );
}

// ============================================================
// 🆕 District/Station Drill-Down Explorer
//
// पहले "district अनुसार" सिर्फ़ complaint-count का एक साधारण bar-chart था —
// किसी district का पूरा प्रदर्शन (resolution-rate, औसत-समय, SOS, आदि) एक साथ
// तुलना करके देखने का कोई तरीक़ा नहीं था। अब हर district/थाना के लिए पूरे KPIs
// एक तालिका (table) की तरह मिलते हैं — जिससे राज्य-स्तर पर कौन सा ज़िला/थाना
// बेहतर/बदतर कर रहा है, यह एक नज़र में दिखे।
// ============================================================

// GET /admin/analytics/districts-summary?dateFrom=&dateTo=
// हर district के लिए पूरे KPIs — सिर्फ़ Super Admin को सभी districts दिखते हैं;
// district-scoped admin को सिर्फ़ अपना ज़िला (उसकी अपनी सुरक्षा-सीमा के भीतर)
async function getDistrictsSummary(req, res) {
  const { dateFrom, dateTo } = req.query;
  const errors = [];
  if (dateFrom) {
    const e = validateDateString(dateFrom, { label: 'dateFrom' });
    if (e) errors.push(e);
  }
  if (dateTo) {
    const e = validateDateString(dateTo, { label: 'dateTo' });
    if (e) errors.push(e);
  }
  if (errors.length > 0) return res.status(400).json({ error: errors[0] });

  const params = [];
  let clause = 'c.deleted_at IS NULL AND c.district IS NOT NULL';
  if (dateFrom) {
    params.push(dateFrom);
    clause += ` AND c.created_at >= $${params.length}::date AT TIME ZONE 'Asia/Kolkata'`;
  }
  if (dateTo) {
    params.push(dateTo);
    clause += ` AND c.created_at < ($${params.length}::date AT TIME ZONE 'Asia/Kolkata' + interval '1 day')`;
  }
  // district-scoped admin सिर्फ़ अपना ही ज़िला देख सके — Super Admin को सभी
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी — बिना इसके IG/DIG
  // District-Explorer में पूरे राज्य के districts देख पाते, सिर्फ़ अपने Range के नहीं
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    clause += ` AND c.district = ANY($${params.length})`;
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    clause += ` AND c.district = $${params.length}`;
  }

  const result = await db.query(
    `SELECT
       c.district,
       count(*) AS total,
       count(*) FILTER (WHERE c.status = 'निस्तारित') AS resolved,
       count(*) FILTER (WHERE c.status = 'दर्ज') AS pending,
       count(*) FILTER (WHERE c.sos_triggered = true) AS sos_count,
       avg(EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)) / 3600) FILTER (WHERE c.status = 'निस्तारित') AS avg_resolution_hours,
       avg(c.feedback_rating) FILTER (WHERE c.feedback_rating IS NOT NULL) AS avg_rating,
       count(DISTINCT c.police_station) AS station_count
     FROM complaints c
     WHERE ${clause}
     GROUP BY c.district
     ORDER BY total DESC`,
    params
  );

  res.json(
    result.rows.map((r) => ({
      district: r.district,
      total: Number(r.total),
      resolved: Number(r.resolved),
      pending: Number(r.pending),
      sosCount: Number(r.sos_count),
      stationCount: Number(r.station_count),
      resolutionRate: r.total > 0 ? Math.round((Number(r.resolved) / Number(r.total)) * 100) : 0,
      avgResolutionHours: r.avg_resolution_hours ? Number(r.avg_resolution_hours).toFixed(1) : null,
      avgRating: r.avg_rating ? Number(r.avg_rating).toFixed(1) : null,
    }))
  );
}

// GET /admin/analytics/stations-summary?district=X&dateFrom=&dateTo=
// चुने गए district के भीतर हर थाने के लिए पूरे KPIs — district चुनना ज़रूरी है
async function getStationsSummary(req, res) {
  const { district, dateFrom, dateTo } = req.query;
  if (!district) return res.status(400).json({ error: 'district आवश्यक है' });
  const errors = [];
  if (dateFrom) {
    const e = validateDateString(dateFrom, { label: 'dateFrom' });
    if (e) errors.push(e);
  }
  if (dateTo) {
    const e = validateDateString(dateTo, { label: 'dateTo' });
    if (e) errors.push(e);
  }
  if (errors.length > 0) return res.status(400).json({ error: errors[0] });

  // 🔒 district-scoped admin सिर्फ़ अपने ही ज़िले के थाने देख सके — किसी दूसरे
  // ज़िले का district param देकर bypass न कर पाए
  // 🐛 बग फ़िक्स: IG/DIG के लिए यह जांच छूट गई थी — वे अपने Range से बाहर के भी
  // किसी भी district का district-param देकर उसके थाने देख सकते थे
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    if (!req.adminScope.rangeDistricts.some((d) => d.trim().toLowerCase() === district.trim().toLowerCase())) {
      return res.status(403).json({ error: 'यह ज़िला आपके Range में नहीं है' });
    }
  } else if (req.adminScope?.district && req.adminScope.district.trim().toLowerCase() !== district.trim().toLowerCase()) {
    return res.status(403).json({ error: 'यह आपके ज़िले का नहीं है' });
  }

  const params = [district];
  let clause = "c.deleted_at IS NULL AND c.district = $1 AND c.police_station IS NOT NULL";
  if (dateFrom) {
    params.push(dateFrom);
    clause += ` AND c.created_at >= $${params.length}::date AT TIME ZONE 'Asia/Kolkata'`;
  }
  if (dateTo) {
    params.push(dateTo);
    clause += ` AND c.created_at < ($${params.length}::date AT TIME ZONE 'Asia/Kolkata' + interval '1 day')`;
  }
  // DSP/ASP जैसे circle-scoped admin सिर्फ़ अपने circle के थाने देख सकें
  if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    clause += ` AND c.police_station = ANY($${params.length})`;
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    if (req.adminScope.district) {
      params.push(req.adminScope.district);
      clause += ` AND c.district = $${params.length}`;
    }
  }

  const result = await db.query(
    `SELECT
       c.police_station,
       count(*) AS total,
       count(*) FILTER (WHERE c.status = 'निस्तारित') AS resolved,
       count(*) FILTER (WHERE c.status = 'दर्ज') AS pending,
       count(*) FILTER (WHERE c.sos_triggered = true) AS sos_count,
       avg(EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, c.updated_at) - c.created_at)) / 3600) FILTER (WHERE c.status = 'निस्तारित') AS avg_resolution_hours,
       avg(c.feedback_rating) FILTER (WHERE c.feedback_rating IS NOT NULL) AS avg_rating,
       count(DISTINCT c.officer_id) FILTER (WHERE c.officer_id IS NOT NULL) AS officer_count
     FROM complaints c
     WHERE ${clause}
     GROUP BY c.police_station
     ORDER BY total DESC`,
    params
  );

  res.json(
    result.rows.map((r) => ({
      station: r.police_station,
      total: Number(r.total),
      resolved: Number(r.resolved),
      pending: Number(r.pending),
      sosCount: Number(r.sos_count),
      officerCount: Number(r.officer_count),
      resolutionRate: r.total > 0 ? Math.round((Number(r.resolved) / Number(r.total)) * 100) : 0,
      avgResolutionHours: r.avg_resolution_hours ? Number(r.avg_resolution_hours).toFixed(1) : null,
      avgRating: r.avg_rating ? Number(r.avg_rating).toFixed(1) : null,
    }))
  );
}

// ============================================================
// 🆕 और शक्तिशाली Analytics — 3 नई क्षमताएं (पहले सिर्फ़ "क्या हुआ" दिखता था —
// अब "अभी क्या ध्यान देना है" वाली सक्रिय/actionable जानकारी भी)
// ============================================================

// GET /admin/analytics/sla-at-risk?thresholdPercent=80
// 🆕 SLA जोखिम-सूची — अब तक सिर्फ़ निस्तारित शिकायतों का response-time दिखता था
// (responseTimeDistribution) — यानी नुक़सान हो जाने के बाद पता चलता। यह सक्रिय
// (अभी भी खुली) शिकायतों में से उन्हें दिखाता है जो अपनी SLA-सीमा के करीब हैं या
// पार कर चुकी हैं — ताकि "अभी किस पर ध्यान देना है" पहले से पता चल सके।
async function getSlaAtRisk(req, res) {
  const { getCachedSetting } = require('./appSettingsController');
  const slaSetting = getCachedSetting('default_sla_hours');
  const slaHours = Number(slaSetting?.hours) || 48;
  const thresholdPercent = Math.min(100, Math.max(50, Number(req.query.thresholdPercent) || 80));
  const thresholdHours = (slaHours * thresholdPercent) / 100;

  // 🐛 बग फ़िक्स (गंभीर — यह endpoint हर scoped admin के लिए टूटा हुआ था):
  // buildScopeClause अपना placeholder नंबर उसे दी गई params-सूची की लंबाई से तय
  // करता है। पहले यहां खाली सूची ([]) दी जाती थी, इसलिए वह "$1" बनाता — जबकि इस
  // query में $1 पहले से thresholdHours के लिए इस्तेमाल हो रहा है। नतीजा: scope-शर्त
  // बनती "AND c.district = ANY($1)" यानी ज़िले की तुलना एक संख्या से — PostgreSQL
  // इस पर type-error देता, और district_admin/DSP/IG/DIG किसी के लिए भी यह स्क्रीन
  // नहीं खुलती (सिर्फ़ super_admin के लिए चलती, जहां scope-शर्त खाली रहती है)।
  // अब thresholdHours को existingParams के रूप में देते हैं — यही इस पैरामीटर का
  // मक़सद है — जिससे नंबरिंग अपने-आप सही ($2 से आगे) हो जाती है।
  const { clause: scopeClause, params } = buildScopeClause(req, [thresholdHours], 'c');
  const result = await db.query(
    `SELECT c.id, c.category, c.district, c.police_station, c.status, c.created_at, o.name AS officer_name,
            EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600 AS hours_open
     FROM complaints c LEFT JOIN officers o ON o.id = c.officer_id
     WHERE c.deleted_at IS NULL AND c.status NOT IN ('निस्तारित', 'अस्वीकृत')
       AND EXTRACT(EPOCH FROM (now() - c.created_at)) / 3600 >= $1 ${scopeClause}
     ORDER BY hours_open DESC LIMIT 100`,
    params
  );

  res.json({
    slaHours,
    thresholdHours: Math.round(thresholdHours),
    items: result.rows.map((r) => ({
      id: r.id,
      category: r.category,
      district: r.district,
      policeStation: r.police_station,
      status: r.status,
      officerName: r.officer_name,
      createdAt: r.created_at,
      hoursOpen: Number(r.hours_open).toFixed(1),
      breached: Number(r.hours_open) >= slaHours,
    })),
  });
}

// GET /admin/analytics/repeat-offenders
// 🆕 दोहराए-आरोपी सारांश — accused-linking फ़ीचर (देखें complaintController.js की
// getAccusedHistory) सिर्फ़ एक शिकायत खोलने पर उससे जुड़ी बाक़ी शिकायतें दिखाती थी।
// यह पूरे scope में सबसे ज़्यादा शिकायतों वाले आरोपियों की सूची है — पैटर्न-पहचान
// अब सिर्फ़ एक-एक करके नहीं, एक साथ पूरे इलाक़े के लिए दिखती है।
// 🔒 गोपनीयता: पीड़िताओं का नाम/मोबाइल कभी नहीं दिखाया जाता — सिर्फ़ आरोपी का नाम
// (जो पहले से ही एक ही तरह की जानकारी है, कई शिकायतों में साझा) व शिकायतों की गिनती।
async function getRepeatOffenders(req, res) {
  const { clause: scopeClause, params } = buildScopeClause(req, [], 'c');
  const result = await db.query(
    `SELECT c.accused_mobile_hash, count(*) AS complaint_count,
            array_agg(c.id ORDER BY c.created_at DESC) AS complaint_ids,
            array_agg(DISTINCT c.category) AS categories,
            (array_agg(c.accused_name ORDER BY c.created_at DESC))[1] AS latest_accused_name,
            max(c.created_at) AS latest_complaint_at
     FROM complaints c
     WHERE c.deleted_at IS NULL AND c.accused_mobile_hash IS NOT NULL ${scopeClause}
     GROUP BY c.accused_mobile_hash
     HAVING count(*) > 1
     ORDER BY complaint_count DESC LIMIT 50`,
    params
  );

  res.json(
    result.rows.map((r) => ({
      accusedName: decryptField(r.latest_accused_name),
      complaintCount: Number(r.complaint_count),
      complaintIds: r.complaint_ids,
      categories: r.categories,
      latestComplaintAt: r.latest_complaint_at,
    }))
  );
}

// GET /admin/analytics/officer-workload
// 🆕 अधिकारी कार्यभार वितरण — Leaderboard सिर्फ़ "निस्तारित" (पूरे हो चुके) मामलों
// के आधार पर प्रदर्शन दिखाता है। यह अलग सवाल का जवाब देता है: "अभी किसके पास
// कितने खुले (सक्रिय) मामले हैं" — ताकि दिखे कि कोई अधिकारी बहुत ज़्यादा दबाव में
// है (overloaded) जबकि कोई और खाली बैठा हो, और नए मामले बेहतर तरीक़े से बांटे जा सकें।
async function getOfficerWorkload(req, res) {
  // 🐛 बग फ़िक्स: buildScopeClause, complaints तालिका के लिए बना है (police_station
  // कॉलम मानकर चलता है) — officers तालिका में यह कॉलम असल में सिर्फ़ "station" कहलाता
  // है। buildScopeClause सीधे इस्तेमाल करने पर DSP/ASP जैसे circle-scoped खातों के
  // लिए "column police_station does not exist" वाली SQL त्रुटि आती। इसकी जगह वही
  // सही (inline) पैटर्न, जो getOfficerLeaderboard पहले से इसी तालिका के लिए इस्तेमाल
  // करता है।
  const params = [];
  let scopeClause = '';
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    scopeClause = ` AND o.district = ANY($${params.length})`;
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    scopeClause = ` AND o.station = ANY($${params.length})`;
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    if (req.adminScope.district) {
      params.push(req.adminScope.district);
      scopeClause += ` AND o.district = $${params.length}`;
    }
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    scopeClause = ` AND o.district = $${params.length}`;
  }

  const result = await db.query(
    `SELECT o.id, o.name, o.badge_id, o.station, o.district,
            count(c.id) FILTER (WHERE c.status NOT IN ('निस्तारित', 'अस्वीकृत')) AS active_cases,
            count(c.id) FILTER (WHERE c.status NOT IN ('निस्तारित', 'अस्वीकृत') AND c.sos_triggered = true) AS active_sos
     FROM officers o
     LEFT JOIN complaints c ON c.officer_id = o.id AND c.deleted_at IS NULL
     WHERE o.is_active = true ${scopeClause}
     GROUP BY o.id
     ORDER BY active_cases DESC`,
    params
  );

  const rows = result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    badgeId: r.badge_id,
    station: r.station,
    district: r.district,
    activeCases: Number(r.active_cases),
    activeSos: Number(r.active_sos),
  }));

  const avgLoad = rows.length > 0 ? rows.reduce((s, r) => s + r.activeCases, 0) / rows.length : 0;
  res.json({
    averageActiveCases: Number(avgLoad.toFixed(1)),
    // 🆕 औसत से 2 गुना से ज़्यादा भार वाले अधिकारी — "overloaded" फ़्लैग, ताकि
    // सूची में हर पंक्ति ख़ुद पढ़ने के बजाय ऊपर से ही समस्या दिखे
    officers: rows.map((r) => ({ ...r, overloaded: avgLoad > 0 && r.activeCases > avgLoad * 2 })),
  });
}

module.exports = { getOverview, getFilterOptions, getOfficerLeaderboard, getHeatmapPoints, getDistrictsSummary, getStationsSummary, getSlaAtRisk, getRepeatOffenders, getOfficerWorkload, getSosResponseAnalytics, getRepeatVictims };

// ============================================================
// GET /admin/analytics/sos-response — SOS पर प्रतिक्रिया कितनी तेज़ रही
//
// क्यों: यह इस पूरे ऐप का सबसे अहम आंकड़ा है, और अब तक कहीं मापा ही नहीं जाता था।
// बाक़ी सब (निस्तारण दर, औसत समय) दिनों-हफ़्तों की बात है; SOS में मिनट मायने रखते
// हैं। "कितनी शिकायतें आईं" से ज़्यादा ज़रूरी है "SOS दबने के बाद किसी अधिकारी ने
// कितनी देर में देखा"।
//
// माप: sos_triggered_at → officer_viewed_at (पहली बार किसी अधिकारी ने खोला)।
// औसत के साथ p50/p90 भी देते हैं — औसत अकेला धोखा देता है (कुछ बहुत तेज़ और कुछ
// बहुत धीमे मिलकर "ठीक-ठाक" औसत बना देते हैं, जबकि असल में 10% को बहुत देर लगी)।
// ============================================================
async function getSosResponseAnalytics(req, res) {
  const { clause: scopeClause, params } = buildScopeClause(req, [], 'c');

  const overall = await db.query(
    `SELECT
       count(*) AS total_sos,
       count(*) FILTER (WHERE c.officer_viewed_at IS NOT NULL) AS seen,
       count(*) FILTER (WHERE c.officer_viewed_at IS NULL) AS never_seen,
       round(avg(EXTRACT(EPOCH FROM (c.officer_viewed_at - c.sos_triggered_at)) / 60)::numeric, 1) AS avg_minutes,
       round((percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (c.officer_viewed_at - c.sos_triggered_at)) / 60))::numeric, 1) AS median_minutes,
       round((percentile_cont(0.9) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (c.officer_viewed_at - c.sos_triggered_at)) / 60))::numeric, 1) AS p90_minutes
     FROM complaints c
     WHERE c.deleted_at IS NULL AND c.sos_triggered = true ${scopeClause}`,
    params
  );

  // थाना-वार — किन थानों में देर हो रही है, यही असल में कार्रवाई-योग्य जानकारी है
  const byStation = await db.query(
    `SELECT c.district, c.police_station,
            count(*) AS total_sos,
            count(*) FILTER (WHERE c.officer_viewed_at IS NULL) AS never_seen,
            round(avg(EXTRACT(EPOCH FROM (c.officer_viewed_at - c.sos_triggered_at)) / 60)::numeric, 1) AS avg_minutes
     FROM complaints c
     WHERE c.deleted_at IS NULL AND c.sos_triggered = true ${scopeClause}
     GROUP BY c.district, c.police_station
     HAVING count(*) > 0
     ORDER BY never_seen DESC, avg_minutes DESC NULLS LAST
     LIMIT 20`,
    params
  );

  const r = overall.rows[0] || {};
  res.json({
    totalSos: Number(r.total_sos || 0),
    seen: Number(r.seen || 0),
    neverSeen: Number(r.never_seen || 0),
    avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
    medianMinutes: r.median_minutes != null ? Number(r.median_minutes) : null,
    p90Minutes: r.p90_minutes != null ? Number(r.p90_minutes) : null,
    byStation: byStation.rows.map((s) => ({
      district: s.district,
      station: s.police_station,
      totalSos: Number(s.total_sos),
      neverSeen: Number(s.never_seen),
      avgMinutes: s.avg_minutes != null ? Number(s.avg_minutes) : null,
    })),
  });
}

// ============================================================
// GET /admin/analytics/repeat-victims — बार-बार शिकायत करने वाली पीड़िताएं
//
// क्यों: मौजूदा "दोहराए-आरोपी" रिपोर्ट आरोपी की तरफ़ से देखती है। पर सुरक्षा की
// दृष्टि से इससे भी अहम संकेत यह है कि *एक ही महिला* बार-बार शिकायत कर रही है —
// यह अक्सर बढ़ते ख़तरे का संकेत होता है (घरेलू हिंसा में यही पैटर्न सबसे आम है,
// और अनदेखा रह जाने पर सबसे भारी पड़ता है)। यह रिपोर्ट अब तक कहीं नहीं थी।
//
// 🔒 निजता: पहचान के लिए victim_mobile_hash (blind index) से समूह बनाते हैं, नाम
// या नंबर से नहीं। लौटाया भी वही जाता है जो कार्रवाई के लिए ज़रूरी है — कितनी बार,
// कब से कब तक, कौन-सी श्रेणियाँ, कहाँ। नाम/नंबर यहाँ कभी नहीं जाते; अधिकारी को
// विवरण चाहिए तो वह शिकायत खोलकर देखे, जहाँ सामान्य पहुँच-नियम लागू होते हैं।
// ============================================================
async function getRepeatVictims(req, res) {
  const minCount = Math.min(Math.max(Number(req.query.minCount) || 2, 2), 20);
  const { clause: scopeClause, params } = buildScopeClause(req, [minCount], 'c');

  const result = await db.query(
    `SELECT c.victim_mobile_hash,
            count(*) AS complaint_count,
            min(c.created_at) AS first_at,
            max(c.created_at) AS last_at,
            array_agg(DISTINCT c.category) AS categories,
            array_agg(DISTINCT c.district) AS districts,
            count(*) FILTER (WHERE c.sos_triggered = true) AS sos_count,
            count(*) FILTER (WHERE c.status NOT IN ('निस्तारित', 'अस्वीकृत')) AS still_open
     FROM complaints c
     WHERE c.deleted_at IS NULL AND c.victim_mobile_hash IS NOT NULL ${scopeClause}
     GROUP BY c.victim_mobile_hash
     HAVING count(*) >= $1
     ORDER BY count(*) DESC, max(c.created_at) DESC
     LIMIT 50`,
    params
  );

  res.json({
    minCount,
    victims: result.rows.map((v) => ({
      // पहचान का सिर्फ़ एक छोटा, न पलटा जा सकने वाला संकेतक — ताकि UI में पंक्तियाँ
      // अलग-अलग दिखें, पर इससे किसी की पहचान न हो सके
      ref: String(v.victim_mobile_hash).slice(0, 8),
      complaintCount: Number(v.complaint_count),
      firstAt: v.first_at,
      lastAt: v.last_at,
      categories: v.categories || [],
      districts: v.districts || [],
      sosCount: Number(v.sos_count),
      stillOpen: Number(v.still_open),
    })),
  });
}
