const db = require('../config/db');
const { buildScopeClause } = require('../utils/scopeFilter');

// GET /officers   (admin only) — नियुक्ति ड्रॉपडाउन के लिए
async function listOfficers(req, res) {
  let result;
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    result = await db.query(`SELECT id, name, badge_id, station FROM officers WHERE is_active = true AND district = ANY($1) ORDER BY name`, [req.adminScope.rangeDistricts]);
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    result = await db.query(
      `SELECT id, name, badge_id, station FROM officers WHERE is_active = true AND station = ANY($1)
        AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2))) ORDER BY name`,
      [req.adminScope.circleStations, req.adminScope.district || null]
    );
  } else if (req.adminScope?.district) {
    result = await db.query(`SELECT id, name, badge_id, station FROM officers WHERE is_active = true AND district = $1 ORDER BY name`, [req.adminScope.district]);
  } else {
    result = await db.query(`SELECT id, name, badge_id, station FROM officers WHERE is_active = true ORDER BY name`);
  }
  res.json(result.rows.map((o) => ({ id: o.id, name: o.name, pno: o.badge_id, badgeId: o.badge_id, station: o.station })));
}

// GET /admin/stats   (admin only)
// 🐛 बग फ़िक्स: पहले यह हमेशा पूरे सिस्टम के आंकड़े लौटाता था, चाहे DSP/ASP/district_admin
// कोई भी हो — वेब डैशबोर्ड के ऊपर के 4 कार्ड सबको एक जैसे (पूरे राज्य के) आंकड़े दिखाते थे।
// अब बाक़ी जगह जैसा ही scope (district/circleStations) यहां भी लागू होता है।
async function getStats(req, res) {
  const { clause, params } = buildScopeClause(req);
  const result = await db.query(`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'दर्ज') AS pending,
      count(*) FILTER (WHERE status = 'अधिकारी नियुक्त') AS assigned,
      count(*) FILTER (WHERE status = 'कार्यवाही जारी') AS in_progress,
      count(*) FILTER (WHERE status = 'निस्तारित') AS resolved,
      count(*) FILTER (WHERE status = 'अस्वीकृत') AS rejected,
      count(*) FILTER (WHERE sos_triggered = true) AS sos_total,
      count(*) FILTER (WHERE sos_triggered = true AND safe_arrival_confirmed = false AND status NOT IN ('निस्तारित', 'अस्वीकृत')) AS sos_active
    FROM complaints WHERE true ${clause}
  `, params);
  const row = result.rows[0];
  res.json({
    total: Number(row.total),
    pending: Number(row.pending),
    // 🆕 पहले "अधिकारी नियुक्त" और "कार्यवाही जारी" एक साथ inProgress में जुड़े थे —
    // AdminHomeScreen के 5 अलग-अलग status-cards के लिए दोनों अलग-अलग चाहिए। पुराने
    // व्यवहार से मेल के लिए inProgressCombined भी साथ में रखा है (अगर कहीं और चाहिए हो)।
    assigned: Number(row.assigned),
    inProgress: Number(row.in_progress),
    inProgressCombined: Number(row.assigned) + Number(row.in_progress),
    resolved: Number(row.resolved),
    rejected: Number(row.rejected),
    // 🆕 पहले SOS-गिनती client-side पर सिर्फ़ 200-row-सीमित complaints-सूची छानकर
    // बनती थी (देखें AdminHomeScreen.js) — किसी बड़े Range (IG/DIG) या ज़िले में अगर
    // हाल की 200 से ज़्यादा शिकायतें हों, तो कोई पुरानी सक्रिय SOS छूट सकती थी। अब
    // यह सर्वर पर सही, पूरे scope के COUNT(*) से आता है — पेजिंग से पूरी तरह अलग।
    sosTotal: Number(row.sos_total),
    sosActive: Number(row.sos_active),
  });
}

module.exports = { listOfficers, getStats };
