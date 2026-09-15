const db = require('../config/db');
const { validateEnum, validateDateString, validateTextLength } = require('../utils/fieldValidators');

const VALID_SHIFTS = ['सामान्य', 'प्रातःकालीन', 'रात्रिकालीन'];

function toRosterEntry(r) {
  return {
    id: r.id,
    officerId: r.officer_id,
    officerName: r.officer_name,
    dutyDate: r.duty_date,
    shift: r.shift,
    note: r.note,
  };
}

// GET /admin/roster?from=&to=
async function listRoster(req, res) {
  const { from, to } = req.query;
  const clauses = [];
  const params = [];
  if (from) {
    params.push(from);
    clauses.push(`dr.duty_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    clauses.push(`dr.duty_date <= $${params.length}`);
  }
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    clauses.push(`o.district = ANY($${params.length})`);
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    clauses.push(`o.station = ANY($${params.length})`);
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    clauses.push(`o.district = $${params.length}`);
  }
  let sql = `SELECT dr.*, o.name AS officer_name FROM duty_roster dr JOIN officers o ON o.id = dr.officer_id`;
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY dr.duty_date ASC';
  const result = await db.query(sql, params);
  res.json(result.rows.map(toRosterEntry));
}

// POST /admin/roster   body: { officerId, dutyDate, shift, note }
// POST /admin/roster   body: { officerId, dutyDate, shift, note }
async function addRosterEntry(req, res) {
  const { officerId, dutyDate, shift, note } = req.body;
  if (!officerId || !dutyDate) return res.status(400).json({ error: 'officerId और dutyDate आवश्यक हैं' });

  // 🆕 पहले dutyDate/shift की कोई फ़ॉर्मेट-जांच नहीं थी — ग़लत तारीख़ या मनमाना
  // shift टेक्स्ट चुपचाप DB में सेव हो जाता, जो मोबाइल ऐप की तारीख़-गणना/badge तोड़ सकता था
  const dateErr = validateDateString(dutyDate, { required: true, label: 'ड्यूटी तारीख़' });
  if (dateErr) return res.status(400).json({ error: dateErr });
  const shiftErr = validateEnum(shift, VALID_SHIFTS, { label: 'शिफ़्ट' });
  if (shiftErr) return res.status(400).json({ error: shiftErr });
  const noteErr = validateTextLength(note, { max: 500, label: 'टिप्पणी' });
  if (noteErr) return res.status(400).json({ error: noteErr });

  // 🐛 बग फ़िक्स: पहले कोई scope जांच नहीं थी — कोई भी district_admin किसी भी दूसरे
  // ज़िले के अधिकारी का duty roster जोड़/बदल सकता था।
  const officerRow = await db.query('SELECT name, district, station FROM officers WHERE id = $1', [officerId]);
  if (officerRow.rows.length === 0) return res.status(404).json({ error: 'अधिकारी नहीं मिला' });
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    if (!req.adminScope.rangeDistricts.includes(officerRow.rows[0].district)) {
      return res.status(403).json({ error: 'यह अधिकारी आपके Range का नहीं है' });
    }
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जांचें
    if (req.adminScope.district && officerRow.rows[0].district !== req.adminScope.district) {
      return res.status(403).json({ error: 'यह अधिकारी आपके ज़िले का नहीं है' });
    }
    if (!req.adminScope.circleStations.includes(officerRow.rows[0].station)) {
      return res.status(403).json({ error: 'यह अधिकारी आपके सर्किल का नहीं है' });
    }
  } else if (req.adminScope?.district && officerRow.rows[0].district !== req.adminScope.district) {
    return res.status(403).json({ error: 'यह अधिकारी आपके ज़िले का नहीं है' });
  }

  const result = await db.query(
    `INSERT INTO duty_roster (officer_id, duty_date, shift, note) VALUES ($1,$2,$3,$4)
     ON CONFLICT (officer_id, duty_date) DO UPDATE SET shift = $3, note = $4
     RETURNING *`,
    [officerId, dutyDate, shift || 'सामान्य', note || null]
  );
  res.status(201).json(toRosterEntry({ ...result.rows[0], officer_name: officerRow.rows[0].name }));
}

// DELETE /admin/roster/:id
async function deleteRosterEntry(req, res) {
  const { id } = req.params;
  const entry = await db.query(
    `SELECT dr.id, o.district, o.station FROM duty_roster dr JOIN officers o ON o.id = dr.officer_id WHERE dr.id = $1`,
    [id]
  );
  if (entry.rows.length === 0) return res.status(404).json({ error: 'प्रविष्टि नहीं मिली' });
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    if (!req.adminScope.rangeDistricts.includes(entry.rows[0].district)) {
      return res.status(403).json({ error: 'यह प्रविष्टि आपके Range की नहीं है' });
    }
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जांचें
    if (req.adminScope.district && entry.rows[0].district !== req.adminScope.district) {
      return res.status(403).json({ error: 'यह प्रविष्टि आपके ज़िले की नहीं है' });
    }
    if (!req.adminScope.circleStations.includes(entry.rows[0].station)) {
      return res.status(403).json({ error: 'यह प्रविष्टि आपके सर्किल की नहीं है' });
    }
  } else if (req.adminScope?.district && entry.rows[0].district !== req.adminScope.district) {
    return res.status(403).json({ error: 'यह प्रविष्टि आपके ज़िले की नहीं है' });
  }
  await db.query('DELETE FROM duty_roster WHERE id = $1', [id]);
  res.json({ message: 'हटाया गया' });
}

module.exports = { listRoster, addRosterEntry, deleteRosterEntry };
