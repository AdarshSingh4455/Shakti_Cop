const db = require('../config/db');
const { validateHexColor, validatePositiveInt, validateTextLength } = require('../utils/fieldValidators');

// GET /categories   (सार्वजनिक)
async function getPublicCategories(req, res) {
  const result = await db.query(
    'SELECT key, label, description, icon, color, sla_hours, requires_vehicle_number, fields FROM complaint_categories WHERE is_active = true ORDER BY display_order, label'
  );
  res.json(
    result.rows.map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      icon: r.icon,
      color: r.color,
      slaHours: r.sla_hours,
      requiresVehicleNumber: r.requires_vehicle_number,
      fields: r.fields,
    }))
  );
}

// GET /admin/categories   (Super Admin — निष्क्रिय भी शामिल)
async function listAllCategories(req, res) {
  const result = await db.query('SELECT * FROM complaint_categories ORDER BY display_order, label');
  res.json(
    result.rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: r.label,
      description: r.description,
      icon: r.icon,
      color: r.color,
      slaHours: r.sla_hours,
      displayOrder: r.display_order,
      isActive: r.is_active,
      requiresVehicleNumber: r.requires_vehicle_number,
      fields: r.fields,
    }))
  );
}

// POST /admin/categories   (Super Admin only)
async function createCategory(req, res) {
  const { key, label, description, icon, color, slaHours, requiresVehicleNumber, displayOrder, fields } = req.body;
  if (!key || !label) return res.status(400).json({ error: 'key और label आवश्यक हैं' });
  if (fields && (!Array.isArray(fields) || fields.length === 0)) {
    return res.status(400).json({ error: 'fields दिए जाएं तो कम से कम एक फ़ील्ड चुनी होनी चाहिए' });
  }
  // 🆕 पहले color/slaHours/displayOrder की कोई जांच नहीं थी — ग़लत रंग-कोड मोबाइल पर
  // टूटा दिखता, ऋणात्मक/शून्य SLA घंटे escalation-गणना को ग़लत कर सकते थे
  const keyErr = validateTextLength(key, { max: 60, label: 'key' });
  if (keyErr) return res.status(400).json({ error: keyErr });
  const labelErr = validateTextLength(label, { max: 80, label: 'label' });
  if (labelErr) return res.status(400).json({ error: labelErr });
  const descErr = validateTextLength(description, { max: 500, label: 'विवरण' });
  if (descErr) return res.status(400).json({ error: descErr });
  const colorErr = validateHexColor(color, { label: 'रंग' });
  if (colorErr) return res.status(400).json({ error: colorErr });
  const slaErr = validatePositiveInt(slaHours, { label: 'SLA घंटे', max: 720 }); // 30 दिन तक ही उचित
  if (slaErr) return res.status(400).json({ error: slaErr });
  const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
  if (orderErr) return res.status(400).json({ error: orderErr });
  try {
    const result = await db.query(
      `INSERT INTO complaint_categories (key, label, description, icon, color, sla_hours, requires_vehicle_number, display_order, fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        key.trim(), label.trim(), description || null, icon || 'document-text-outline', color || '#8E2A46',
        slaHours || 48, !!requiresVehicleNumber, displayOrder || 0, fields ? JSON.stringify(fields) : null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'यह key पहले से मौजूद है' });
    throw err;
  }
}

// PATCH /admin/categories/:id   (Super Admin only)
async function updateCategory(req, res) {
  const { id } = req.params;
  const { label, description, icon, color, slaHours, requiresVehicleNumber, displayOrder, isActive, fields } = req.body;
  if (label !== undefined) {
    const labelErr = validateTextLength(label, { max: 80, label: 'label' });
    if (labelErr) return res.status(400).json({ error: labelErr });
  }
  if (description !== undefined) {
    const descErr = validateTextLength(description, { max: 500, label: 'विवरण' });
    if (descErr) return res.status(400).json({ error: descErr });
  }
  if (color !== undefined) {
    const colorErr = validateHexColor(color, { label: 'रंग' });
    if (colorErr) return res.status(400).json({ error: colorErr });
  }
  if (slaHours !== undefined) {
    const slaErr = validatePositiveInt(slaHours, { label: 'SLA घंटे', max: 720 });
    if (slaErr) return res.status(400).json({ error: slaErr });
  }
  if (displayOrder !== undefined) {
    const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
    if (orderErr) return res.status(400).json({ error: orderErr });
  }
  const result = await db.query(
    `UPDATE complaint_categories SET
       label = COALESCE($1, label), description = COALESCE($2, description), icon = COALESCE($3, icon),
       color = COALESCE($4, color), sla_hours = COALESCE($5, sla_hours),
       requires_vehicle_number = COALESCE($6, requires_vehicle_number),
       display_order = COALESCE($7, display_order), is_active = COALESCE($8, is_active),
       fields = COALESCE($9, fields)
     WHERE id = $10 RETURNING *`,
    [label, description, icon, color, slaHours, requiresVehicleNumber, displayOrder, isActive, fields ? JSON.stringify(fields) : null, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'श्रेणी नहीं मिली' });
  res.json(result.rows[0]);
}

// DELETE /admin/categories/:id — सुरक्षा के लिए असल delete नहीं, सिर्फ़ निष्क्रिय (पुरानी शिकायतों का इतिहास न टूटे)
async function deactivateCategory(req, res) {
  await db.query('UPDATE complaint_categories SET is_active = false WHERE id = $1', [req.params.id]);
  res.json({ message: 'निष्क्रिय किया गया' });
}

module.exports = { getPublicCategories, listAllCategories, createCategory, updateCategory, deactivateCategory };
