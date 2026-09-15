const db = require('../config/db');
const { validateHexColor, validateUrl, validatePositiveInt, validateTextLength } = require('../utils/fieldValidators');

function toWelfareItem(r) {
  return {
    id: r.id,
    section: r.section,
    icon: r.icon_emoji,
    tag: r.tag,
    title: r.title,
    description: r.description,
    url: r.url,
    displayOrder: r.display_order,
    isActive: r.is_active,
  };
}
function toHelpline(r) {
  return {
    id: r.id,
    label: r.label,
    number: r.number,
    icon: r.icon,
    color: r.color,
    displayOrder: r.display_order,
    isActive: r.is_active,
  };
}

async function listPublicWelfare(req, res) {
  const result = await db.query(`SELECT * FROM welfare_items WHERE is_active = true ORDER BY section, display_order`);
  res.json(result.rows.map(toWelfareItem));
}
async function listPublicHelplines(req, res) {
  const result = await db.query(`SELECT * FROM helpline_items WHERE is_active = true ORDER BY display_order`);
  res.json(result.rows.map(toHelpline));
}

// GET /public-stats   (सार्वजनिक — Home स्क्रीन पर भरोसा दिलाने वाला counter)
// सिर्फ़ कुल संख्या देता है, कोई संवेदनशील जानकारी नहीं।
async function getPublicStats(req, res) {
  // 🐛 बग फ़िक्स: यहां हटाई गई (soft-deleted) शिकायतें भी गिनी जा रही थीं — बाक़ी पूरे
  // ऐप में हर जगह deleted_at IS NULL फ़िल्टर होता है। नतीजा: नागरिक डैशबोर्ड पर
  // दिखने वाला सार्वजनिक "कुल शिकायतें" आंकड़ा असल से ज़्यादा दिखता था।
  const result = await db.query(
    `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'निस्तारित') AS resolved
     FROM complaints WHERE deleted_at IS NULL`
  );
  res.json({
    totalComplaints: Number(result.rows[0].total),
    totalResolved: Number(result.rows[0].resolved),
  });
}

async function listAdminWelfare(req, res) {
  const result = await db.query(`SELECT * FROM welfare_items ORDER BY section, display_order`);
  res.json(result.rows.map(toWelfareItem));
}
async function createWelfareItem(req, res) {
  const { section, icon, tag, title, description, url, displayOrder } = req.body;
  if (!section || !title) return res.status(400).json({ error: 'section और title आवश्यक हैं' });
  const titleErr = validateTextLength(title, { max: 150, label: 'title' });
  if (titleErr) return res.status(400).json({ error: titleErr });
  const descErr = validateTextLength(description, { max: 500, label: 'विवरण' });
  if (descErr) return res.status(400).json({ error: descErr });
  const urlErr = validateUrl(url, { label: 'लिंक' });
  if (urlErr) return res.status(400).json({ error: urlErr });
  const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
  if (orderErr) return res.status(400).json({ error: orderErr });
  const result = await db.query(
    `INSERT INTO welfare_items (section, icon_emoji, tag, title, description, url, display_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [section, icon || null, tag || null, title, description || null, url || null, displayOrder || 0]
  );
  res.status(201).json(toWelfareItem(result.rows[0]));
}
async function updateWelfareItem(req, res) {
  const { id } = req.params;
  const { icon, tag, title, description, url, displayOrder, isActive } = req.body;
  if (title !== undefined) {
    const titleErr = validateTextLength(title, { max: 150, label: 'title' });
    if (titleErr) return res.status(400).json({ error: titleErr });
  }
  if (description !== undefined) {
    const descErr = validateTextLength(description, { max: 500, label: 'विवरण' });
    if (descErr) return res.status(400).json({ error: descErr });
  }
  if (url !== undefined) {
    const urlErr = validateUrl(url, { label: 'लिंक' });
    if (urlErr) return res.status(400).json({ error: urlErr });
  }
  if (displayOrder !== undefined) {
    const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
    if (orderErr) return res.status(400).json({ error: orderErr });
  }
  const result = await db.query(
    `UPDATE welfare_items SET icon_emoji = COALESCE($1, icon_emoji), tag = COALESCE($2, tag),
       title = COALESCE($3, title), description = COALESCE($4, description), url = COALESCE($5, url),
       display_order = COALESCE($6, display_order), is_active = COALESCE($7, is_active)
     WHERE id = $8 RETURNING *`,
    [icon, tag, title, description, url, displayOrder, isActive, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'नहीं मिला' });
  res.json(toWelfareItem(result.rows[0]));
}
async function deleteWelfareItem(req, res) {
  await db.query('DELETE FROM welfare_items WHERE id = $1', [req.params.id]);
  res.json({ message: 'हटाया गया' });
}

async function listAdminHelplines(req, res) {
  const result = await db.query(`SELECT * FROM helpline_items ORDER BY display_order`);
  res.json(result.rows.map(toHelpline));
}
async function createHelpline(req, res) {
  const { label, number, icon, color, displayOrder } = req.body;
  if (!label || !number) return res.status(400).json({ error: 'label और number आवश्यक हैं' });
  const labelErr = validateTextLength(label, { max: 100, label: 'label' });
  if (labelErr) return res.status(400).json({ error: labelErr });
  // हेल्पलाइन नंबर छोटे कोड भी हो सकते हैं (112, 1090, 1930) — इसलिए 10-अंक वाला
  // मोबाइल-नियम नहीं, बस अंक/डैश/स्पेस और उचित लंबाई जांचते हैं
  if (!/^[\d\s-]{3,15}$/.test(String(number).trim())) {
    return res.status(400).json({ error: 'नंबर सिर्फ़ अंक (3-15 अंक) होना चाहिए' });
  }
  const colorErr = validateHexColor(color, { label: 'रंग' });
  if (colorErr) return res.status(400).json({ error: colorErr });
  const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
  if (orderErr) return res.status(400).json({ error: orderErr });
  const result = await db.query(
    `INSERT INTO helpline_items (label, number, icon, color, display_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [label, number, icon || 'call', color || '#7A1836', displayOrder || 0]
  );
  res.status(201).json(toHelpline(result.rows[0]));
}
async function updateHelpline(req, res) {
  const { id } = req.params;
  const { label, number, icon, color, displayOrder, isActive } = req.body;
  if (label !== undefined) {
    const labelErr = validateTextLength(label, { max: 100, label: 'label' });
    if (labelErr) return res.status(400).json({ error: labelErr });
  }
  if (number !== undefined && !/^[\d\s-]{3,15}$/.test(String(number).trim())) {
    return res.status(400).json({ error: 'नंबर सिर्फ़ अंक (3-15 अंक) होना चाहिए' });
  }
  if (color !== undefined) {
    const colorErr = validateHexColor(color, { label: 'रंग' });
    if (colorErr) return res.status(400).json({ error: colorErr });
  }
  if (displayOrder !== undefined) {
    const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
    if (orderErr) return res.status(400).json({ error: orderErr });
  }
  const result = await db.query(
    `UPDATE helpline_items SET label = COALESCE($1, label), number = COALESCE($2, number),
       icon = COALESCE($3, icon), color = COALESCE($4, color),
       display_order = COALESCE($5, display_order), is_active = COALESCE($6, is_active)
     WHERE id = $7 RETURNING *`,
    [label, number, icon, color, displayOrder, isActive, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'नहीं मिला' });
  res.json(toHelpline(result.rows[0]));
}
async function deleteHelpline(req, res) {
  await db.query('DELETE FROM helpline_items WHERE id = $1', [req.params.id]);
  res.json({ message: 'हटाया गया' });
}

module.exports = {
  listPublicWelfare,
  listPublicHelplines,
  getPublicStats,
  listAdminWelfare,
  createWelfareItem,
  updateWelfareItem,
  deleteWelfareItem,
  listAdminHelplines,
  createHelpline,
  updateHelpline,
  deleteHelpline,
};
