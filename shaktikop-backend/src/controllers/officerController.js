const db = require('../config/db');
const { buildScopeClause } = require('../utils/scopeFilter');

// GET /officers   (admin only) — नियुक्ति ड्रॉपडाउन के लिए
async function listOfficers(req, res) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const queryDistrict = req.query.district ? String(req.query.district).trim() : null;
  const queryStation = req.query.station ? String(req.query.station).trim() : null;

  let result;
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    const allowed = req.adminScope.rangeDistricts.map(norm);
    if (queryDistrict) {
      if (!allowed.includes(norm(queryDistrict))) {
        return res.status(403).json({ error: 'यह ज़िला आपके Range (परिक्षेत्र) में नहीं है' });
      }
      result = await db.query(
        `SELECT id, name, badge_id, station, district FROM officers WHERE is_active = true AND TRIM(LOWER(district)) = $1 ORDER BY name`,
        [norm(queryDistrict)]
      );
    } else {
      result = await db.query(
        `SELECT id, name, badge_id, station, district FROM officers WHERE is_active = true AND TRIM(LOWER(district)) = ANY($1) ORDER BY name`,
        [allowed]
      );
    }
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    const allowedStations = req.adminScope.circleStations.map(norm);
    const scopeDistrict = req.adminScope.district ? norm(req.adminScope.district) : null;
    if (queryDistrict && scopeDistrict && norm(queryDistrict) !== scopeDistrict) {
      return res.status(403).json({ error: `आप सिर्फ़ अपने ज़िले (${req.adminScope.district}) के अधिकारी देख सकते हैं` });
    }
    if (queryStation) {
      if (!allowedStations.includes(norm(queryStation))) {
        return res.status(403).json({ error: 'यह थाना आपके सर्किल में नहीं है' });
      }
      result = await db.query(
        `SELECT id, name, badge_id, station, district FROM officers WHERE is_active = true AND TRIM(LOWER(station)) = $1
          AND ($2::text IS NULL OR TRIM(LOWER(district)) = $2) ORDER BY name`,
        [norm(queryStation), scopeDistrict]
      );
    } else {
      result = await db.query(
        `SELECT id, name, badge_id, station, district FROM officers WHERE is_active = true AND TRIM(LOWER(station)) = ANY($1)
          AND ($2::text IS NULL OR TRIM(LOWER(district)) = $2) ORDER BY name`,
        [allowedStations, scopeDistrict]
      );
    }
  } else if (req.adminScope?.district) {
    const scopeDistrict = norm(req.adminScope.district);
    if (queryDistrict && norm(queryDistrict) !== scopeDistrict) {
      return res.status(403).json({ error: `आप सिर्फ़ अपने ज़िले (${req.adminScope.district}) के अधिकारी देख सकते हैं` });
    }
    result = await db.query(
      `SELECT id, name, badge_id, station, district FROM officers WHERE is_active = true AND TRIM(LOWER(district)) = $1 ORDER BY name`,
      [scopeDistrict]
    );
  } else if (req.user?.adminRole === 'super_admin') {
    // Super Admin
    const clauses = ['is_active = true'];
    const params = [];
    if (queryDistrict) {
      params.push(norm(queryDistrict));
      clauses.push(`TRIM(LOWER(district)) = $${params.length}`);
    }
    if (queryStation) {
      params.push(norm(queryStation));
      clauses.push(`TRIM(LOWER(station)) = $${params.length}`);
    }
    result = await db.query(
      `SELECT id, name, badge_id, station, district FROM officers WHERE ${clauses.join(' AND ')} ORDER BY name`,
      params
    );
  } else {
    return res.status(403).json({ error: 'अमान्य अधिकार क्षेत्र — आपके खाते के लिए कोई वैध ज़िला या क्षेत्र निर्धारित नहीं है' });
  }
  res.json(result.rows.map((o) => ({ id: o.id, name: o.name, pno: o.badge_id, badgeId: o.badge_id, station: o.station, district: o.district })));
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
