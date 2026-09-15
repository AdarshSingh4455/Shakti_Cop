const db = require('../config/db');
const { validateTextLength } = require('../utils/fieldValidators');

const MAX_BULK_ROWS = 5000; // एक साथ बहुत ज़्यादा rows एक लंबा, table-lock करने वाला transaction बना सकते हैं
function isValidLatLng(lat, lng) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

// GET /location-data   (सार्वजनिक — पूरे app में dropdown के लिए)
// 🆕 अब districtsEn/stationsEnByDistrict भी साथ भेजते हैं — English मोड में असली
// (Super Admin द्वारा भरा गया) नाम दिखे, हर थाने के लिए, न सिर्फ़ चुनिंदा प्रमुख ज़िलों के।
async function getLocationData(req, res) {
  const result = await db.query('SELECT district, district_en, station, station_en FROM police_stations ORDER BY district, station');
  const stationsByDistrict = {};
  const stationsEnByDistrict = {};
  const districtsEnMap = {};
  for (const row of result.rows) {
    if (!stationsByDistrict[row.district]) stationsByDistrict[row.district] = [];
    stationsByDistrict[row.district].push(row.station);
    if (row.station_en) {
      if (!stationsEnByDistrict[row.district]) stationsEnByDistrict[row.district] = {};
      stationsEnByDistrict[row.district][row.station] = row.station_en;
    }
    if (row.district_en) districtsEnMap[row.district] = row.district_en;
  }
  res.json({
    districts: Object.keys(stationsByDistrict).sort(),
    stationsByDistrict,
    districtsEnMap,       // { 'लखनऊ': 'Lucknow', ... } — जिन ज़िलों का अंग्रेज़ी नाम भरा गया हो
    stationsEnByDistrict, // { 'लखनऊ': { 'हजरतगंज': 'Hazratganj', ... }, ... }
    total: result.rows.length,
  });
}

// GET /admin/location-data   (Super Admin — प्रबंधन सूची, flat रूप में)
async function listLocationData(req, res) {
  const result = await db.query('SELECT id, district, district_en, station, station_en, latitude, longitude FROM police_stations ORDER BY district, station');
  res.json(result.rows.map((r) => ({
    id: r.id, district: r.district, districtEn: r.district_en, station: r.station, stationEn: r.station_en,
    latitude: r.latitude, longitude: r.longitude, isGeoTagged: r.latitude != null && r.longitude != null,
  })));
}

// POST /admin/location-data/bulk-upload   (Super Admin only)
// body: { rows: [{ district, station, latitude?, longitude? }, ...], mode: 'replace' | 'merge' }
async function bulkUploadLocationData(req, res) {
  const { rows, mode } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows की सूची आवश्यक है — हर row में district और station हो' });
  }
  // 🐛 बग फ़िक्स: पहले rows की संख्या पर कोई ऊपरी सीमा नहीं थी — बहुत बड़ी सूची
  // (जैसे ग़लती से लाखों rows वाली फ़ाइल) एक लंबा, पूरे table को lock करने वाला
  // transaction बना सकती थी।
  if (rows.length > MAX_BULK_ROWS) {
    return res.status(400).json({ error: `एक बार में अधिकतम ${MAX_BULK_ROWS} rows अपलोड की जा सकती हैं` });
  }
  const clean = rows
    .map((r) => ({
      district: String(r.district || '').trim().slice(0, 100),
      station: String(r.station || '').trim().slice(0, 100),
      districtEn: r.districtEn ? String(r.districtEn).trim().slice(0, 100) : null,
      stationEn: r.stationEn ? String(r.stationEn).trim().slice(0, 100) : null,
      latitude: r.latitude != null && r.latitude !== '' ? Number(r.latitude) : null,
      longitude: r.longitude != null && r.longitude !== '' ? Number(r.longitude) : null,
    }))
    // 🐛 बग फ़िक्स: यहां भी latitude/longitude की वैध सीमा (-90..90, -180..180) कभी
    // जांची नहीं जाती थी — जबकि updateLocationEntry में यह जांच पहले से थी (असंगति)।
    // अमान्य निर्देशांक चुपचाप DB में जा सकते थे और नक़्शे पर टूटा/ग़लत pin दिखा सकते थे।
    .filter(
      (r) =>
        r.district &&
        r.station &&
        (r.latitude == null || (Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && isValidLatLng(r.latitude, r.longitude)))
    );
  if (clean.length === 0) {
    return res.status(400).json({ error: 'कोई मान्य row नहीं मिली — हर row में district और station दोनों होने चाहिए' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    if (mode === 'replace') {
      // 🐛 बग फ़िक्स (डेटा अनाथ हो जाना): "replace" पूरी master-सूची पहले मिटाता है।
      // शिकायतें और अधिकारी थाने को *नाम* से जोड़ते हैं (foreign key नहीं), इसलिए
      // database इसे रोकता नहीं — पर उसके बाद:
      //   • किसी SHO का अपना थाना हर dropdown से ग़ायब हो सकता है;
      //   • पुरानी शिकायतें ऐसे थाने की ओर इशारा करती रह जाती हैं जो सूची में है ही नहीं।
      // यानी अधूरी सूची एक बार replace-mode में चढ़ा देने से चुपचाप बहुत कुछ टूट सकता है।
      // (यही समस्या backup-restore में भी थी और वहाँ भी इसी तरह रोकी गई है।)
      const incoming = new Set(clean.map((r) => `${r.district}|${r.station}`));
      const inUse = await client.query(
        `SELECT DISTINCT district, station FROM (
           SELECT district, police_station AS station FROM complaints WHERE deleted_at IS NULL
             AND district IS NOT NULL AND police_station IS NOT NULL
           UNION
           SELECT district, station FROM officers WHERE is_active = true
             AND district IS NOT NULL AND station IS NOT NULL
         ) t`
      );
      const wouldOrphan = inUse.rows.filter((r) => !incoming.has(`${r.district}|${r.station}`));
      if (wouldOrphan.length > 0) {
        await client.query('ROLLBACK');
        const sample = wouldOrphan.slice(0, 10).map((r) => `${r.district}/${r.station}`).join(', ');
        return res.status(400).json({
          error:
            `यह सूची अधूरी है — इनमें से ${wouldOrphan.length} थाने ऐसे हैं जिनसे अभी शिकायतें या अधिकारी जुड़े हैं, ` +
            `पर आपकी नई सूची में वे नहीं हैं: ${sample}${wouldOrphan.length > 10 ? ' …' : ''}। ` +
            `"replace" पूरी पुरानी सूची मिटा देता है, इसलिए ऐसा करने पर वे थाने कहीं नहीं दिखेंगे। ` +
            `इनको सूची में जोड़कर दोबारा कोशिश करें, या "जोड़ें" (merge) मोड इस्तेमाल करें जो कुछ मिटाता नहीं।`,
          orphanCount: wouldOrphan.length,
          orphanSample: wouldOrphan.slice(0, 50),
        });
      }
      await client.query('DELETE FROM police_stations');
    }
    let inserted = 0;
    for (const r of clean) {
      const lat = Number.isFinite(r.latitude) ? r.latitude : null;
      const lng = Number.isFinite(r.longitude) ? r.longitude : null;
      const result = await client.query(
        `INSERT INTO police_stations (district, station, district_en, station_en, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (district, station) DO UPDATE SET
           district_en = COALESCE(EXCLUDED.district_en, police_stations.district_en),
           station_en = COALESCE(EXCLUDED.station_en, police_stations.station_en),
           latitude = COALESCE(EXCLUDED.latitude, police_stations.latitude),
           longitude = COALESCE(EXCLUDED.longitude, police_stations.longitude),
           updated_at = now()`,
        [r.district, r.station, r.districtEn, r.stationEn, lat, lng]
      );
      inserted += result.rowCount;
    }
    await client.query('COMMIT');
    res.json({
      message: mode === 'replace' ? 'पूरी सूची बदल दी गई' : 'नई entries जोड़ी/अपडेट गईं',
      totalRowsGiven: rows.length,
      validRows: clean.length,
      inserted,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// POST /admin/location-data   (Super Admin — एक entry जोड़ना)
async function addLocationEntry(req, res) {
  const { district, station, districtEn, stationEn, latitude, longitude } = req.body;
  if (!district || !station) return res.status(400).json({ error: 'district और station दोनों आवश्यक हैं' });
  const distErr = validateTextLength(district, { max: 100, label: 'district' });
  if (distErr) return res.status(400).json({ error: distErr });
  const stErr = validateTextLength(station, { max: 100, label: 'station' });
  if (stErr) return res.status(400).json({ error: stErr });
  // 🆕 अंग्रेज़ी नाम अब यहीं (डेटा के साथ) लिए जाते हैं — वैकल्पिक हैं, पर देने पर
  // English मोड में यही सही नाम दिखेगा, कोई hardcoded dictionary की ज़रूरत नहीं।
  if (districtEn) {
    const dEnErr = validateTextLength(districtEn, { max: 100, label: 'district (English)' });
    if (dEnErr) return res.status(400).json({ error: dEnErr });
  }
  if (stationEn) {
    const sEnErr = validateTextLength(stationEn, { max: 100, label: 'station (English)' });
    if (sEnErr) return res.status(400).json({ error: sEnErr });
  }
  const lat = latitude != null && latitude !== '' ? Number(latitude) : null;
  const lng = longitude != null && longitude !== '' ? Number(longitude) : null;
  if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
    return res.status(400).json({ error: 'latitude/longitude अमान्य हैं' });
  }
  // 🐛 बग फ़िक्स: यहाँ पहले सिर्फ़ "संख्या है या नहीं" जांचा जाता था — updateLocationEntry
  // में मौजूद वैध भौगोलिक सीमा (-90..90, -180..180) की जांच यहां छूट गई थी
  if (lat != null && lng != null && !isValidLatLng(lat, lng)) {
    return res.status(400).json({ error: 'latitude/longitude सीमा से बाहर हैं' });
  }
  try {
    const result = await db.query(
      'INSERT INTO police_stations (district, station, district_en, station_en, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [district.trim(), station.trim(), districtEn ? districtEn.trim() : null, stationEn ? stationEn.trim() : null, lat, lng]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'यह ज़िला+थाना पहले से मौजूद है' });
    throw err;
  }
}

// PATCH /admin/location-data/:id   (Super Admin — coordinates और/या अंग्रेज़ी नाम बदलना)
// body: { latitude?, longitude?, districtEn?, stationEn? }
async function updateLocationEntry(req, res) {
  const { id } = req.params;
  const { latitude, longitude, districtEn, stationEn } = req.body;

  const hasLatLng = latitude !== undefined || longitude !== undefined;
  let lat = null, lng = null;
  if (hasLatLng) {
    lat = latitude != null && latitude !== '' ? Number(latitude) : null;
    lng = longitude != null && longitude !== '' ? Number(longitude) : null;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'मान्य latitude और longitude दोनों आवश्यक हैं' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'latitude/longitude सीमा से बाहर हैं' });
    }
  }
  // 🆕 अब सिर्फ़ coordinates नहीं — पहले से मौजूद थानों के लिए अंग्रेज़ी नाम भी यहीं
  // से जोड़े/बदले जा सकते हैं। यही वह जगह है जहां से पुराने (English-name-रहित)
  // थानों की कमी भरी जा सकती है, कोड बदले बिना।
  if (districtEn !== undefined) {
    const dEnErr = validateTextLength(districtEn, { max: 100, label: 'district (English)' });
    if (dEnErr) return res.status(400).json({ error: dEnErr });
  }
  if (stationEn !== undefined) {
    const sEnErr = validateTextLength(stationEn, { max: 100, label: 'station (English)' });
    if (sEnErr) return res.status(400).json({ error: sEnErr });
  }
  if (!hasLatLng && districtEn === undefined && stationEn === undefined) {
    return res.status(400).json({ error: 'कम से कम एक फ़ील्ड (coordinates या अंग्रेज़ी नाम) दें' });
  }

  const result = await db.query(
    `UPDATE police_stations SET
       latitude = CASE WHEN $1 THEN $2::double precision ELSE latitude END,
       longitude = CASE WHEN $1 THEN $3::double precision ELSE longitude END,
       district_en = COALESCE($4, district_en),
       station_en = COALESCE($5, station_en),
       updated_at = now()
     WHERE id = $6 RETURNING *`,
    [hasLatLng, lat, lng, districtEn ? districtEn.trim() : null, stationEn ? stationEn.trim() : null, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'थाना नहीं मिला' });
  res.json(result.rows[0]);
}

// DELETE /admin/location-data/:id   (Super Admin)
async function deleteLocationEntry(req, res) {
  await db.query('DELETE FROM police_stations WHERE id = $1', [req.params.id]);
  res.json({ message: 'हटाया गया' });
}

module.exports = { getLocationData, listLocationData, bulkUploadLocationData, addLocationEntry, updateLocationEntry, deleteLocationEntry };
