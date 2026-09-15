const db = require('../config/db');
const { validateHexColor, validateUrl, validatePositiveInt, validateTextLength } = require('../utils/fieldValidators');

function toBanner(r) {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    colorStart: r.color_start,
    colorEnd: r.color_end,
    icon: r.icon,
    imageUrl: r.image_url,
    displayOrder: r.display_order,
    isActive: r.is_active,
  };
}

// GET /banners   (सार्वजनिक — Home स्क्रीन के लिए)
async function listActiveBanners(req, res) {
  const result = await db.query('SELECT * FROM home_banners WHERE is_active = true ORDER BY display_order ASC, id ASC');
  res.json(result.rows.map(toBanner));
}

// GET /admin/banners   (admin — सभी, active+inactive)
async function listAllBanners(req, res) {
  const result = await db.query('SELECT * FROM home_banners ORDER BY display_order ASC, id ASC');
  res.json(result.rows.map(toBanner));
}

// POST /admin/banners   body: { title, subtitle, colorStart, colorEnd, icon, imageUrl, displayOrder }
async function createBanner(req, res) {
  const { title, subtitle, colorStart, colorEnd, icon, imageUrl, displayOrder } = req.body;
  // 🐛 बग फ़िक्स: पहले कोई भी ज़रूरी-सामग्री जांच नहीं थी — पूरी तरह खाली (न title,
  // न image) बैनर भी बन सकता था, जो Home स्क्रीन पर एक खाली/टूटा हुआ card दिखाता
  if (!((title && title.trim()) || (imageUrl && imageUrl.trim()))) {
    return res.status(400).json({ error: 'शीर्षक या image में से कम से कम एक आवश्यक है' });
  }
  const titleErr = validateTextLength(title, { max: 150, label: 'शीर्षक' });
  if (titleErr) return res.status(400).json({ error: titleErr });
  const subtitleErr = validateTextLength(subtitle, { max: 300, label: 'उपशीर्षक' });
  if (subtitleErr) return res.status(400).json({ error: subtitleErr });
  const startErr = validateHexColor(colorStart, { label: 'रंग (शुरुआत)' });
  if (startErr) return res.status(400).json({ error: startErr });
  const endErr = validateHexColor(colorEnd, { label: 'रंग (अंत)' });
  if (endErr) return res.status(400).json({ error: endErr });
  const imgErr = validateUrl(imageUrl, { label: 'Image', allowDataUri: true });
  if (imgErr) return res.status(400).json({ error: imgErr });
  const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
  if (orderErr) return res.status(400).json({ error: orderErr });

  const result = await db.query(
    `INSERT INTO home_banners (title, subtitle, color_start, color_end, icon, image_url, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [title || null, subtitle || null, colorStart || '#7A1836', colorEnd || '#9B2647', icon || 'shield-checkmark', imageUrl || null, displayOrder || 0]
  );
  res.status(201).json(toBanner(result.rows[0]));
}

// PATCH /admin/banners/:id
async function updateBanner(req, res) {
  const { id } = req.params;
  const { title, subtitle, colorStart, colorEnd, icon, imageUrl, displayOrder, isActive } = req.body;
  if (title !== undefined) {
    const titleErr = validateTextLength(title, { max: 150, label: 'शीर्षक' });
    if (titleErr) return res.status(400).json({ error: titleErr });
  }
  if (subtitle !== undefined) {
    const subtitleErr = validateTextLength(subtitle, { max: 300, label: 'उपशीर्षक' });
    if (subtitleErr) return res.status(400).json({ error: subtitleErr });
  }
  if (colorStart !== undefined) {
    const startErr = validateHexColor(colorStart, { label: 'रंग (शुरुआत)' });
    if (startErr) return res.status(400).json({ error: startErr });
  }
  if (colorEnd !== undefined) {
    const endErr = validateHexColor(colorEnd, { label: 'रंग (अंत)' });
    if (endErr) return res.status(400).json({ error: endErr });
  }
  if (imageUrl !== undefined && imageUrl !== null) {
    const imgErr = validateUrl(imageUrl, { label: 'Image', allowDataUri: true });
    if (imgErr) return res.status(400).json({ error: imgErr });
  }
  if (displayOrder !== undefined) {
    const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
    if (orderErr) return res.status(400).json({ error: orderErr });
  }
  const result = await db.query(
    `UPDATE home_banners SET
       title = COALESCE($1, title), subtitle = COALESCE($2, subtitle),
       color_start = COALESCE($3, color_start), color_end = COALESCE($4, color_end),
       icon = COALESCE($5, icon), image_url = $6,
       display_order = COALESCE($7, display_order), is_active = COALESCE($8, is_active)
     WHERE id = $9 RETURNING *`,
    [title, subtitle, colorStart, colorEnd, icon, imageUrl, displayOrder, isActive, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'बैनर नहीं मिला' });
  res.json(toBanner(result.rows[0]));
}

// DELETE /admin/banners/:id
async function deleteBanner(req, res) {
  const { id } = req.params;
  await db.query('DELETE FROM home_banners WHERE id = $1', [id]);
  res.json({ message: 'बैनर हटाया गया' });
}

module.exports = { listActiveBanners, listAllBanners, createBanner, updateBanner, deleteBanner };
