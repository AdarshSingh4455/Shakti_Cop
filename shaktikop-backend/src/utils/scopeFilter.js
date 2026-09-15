// ============================================================
// हर जगह एक जैसा scope-filter लॉजिक — DSP (सर्किल के थाने), SP/district_admin
// (ज़िला), IG/DIG (कई ज़िलों का Range), SSP/super_admin (कोई सीमा नहीं)
// मानता है कि query में "district" और "police_station" कॉलम मौजूद हैं (complaints टेबल पर)।
// इस्तेमाल: const { clause, params } = buildScopeClause(req, existingParams);
// फिर: `SELECT ... WHERE true ${clause}` और query params में ...params जोड़ें
// ============================================================
function buildScopeClause(req, existingParams = [], prefix = '') {
  const params = [...existingParams];
  const p = prefix ? `${prefix}.` : '';
  let clause = '';
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    // 🆕 IG/DIG — कई ज़िलों का Range। circleStations जैसा ही ANY() पैटर्न, बस
    // police_station की जगह district कॉलम पर।
    params.push(req.adminScope.rangeDistricts);
    clause = ` AND ${p}district = ANY($${params.length})`;
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    clause = ` AND ${p}police_station = ANY($${params.length})`;
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं होता ("कोतवाली" 65 ज़िलों में है) —
    // इसलिए ज़िला भी साथ लगाते हैं, वरना सर्किल-सीमित DSP/ASP को दूसरे ज़िलों की
    // उसी नाम वाली शिकायतें भी दिख जातीं।
    if (req.adminScope.district) {
      params.push(req.adminScope.district);
      clause += ` AND ${p}district = $${params.length}`;
    }
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    clause = ` AND ${p}district = $${params.length}`;
  }
  return { clause, params };
}

module.exports = { buildScopeClause };
