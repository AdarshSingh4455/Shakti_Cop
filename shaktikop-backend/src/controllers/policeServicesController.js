const db = require('../config/db');
const { validateTextLength, validateUrl } = require('../utils/fieldValidators');
const { logActivity } = require('../utils/activityLog');

// ============================================================
// पुलिस सेवाएं — Super Admin ऐप से ही जोड़/हटा/बदल सकते हैं
//
// पहले यह सूची मोबाइल ऐप के कोड में लिखी थी, इसलिए किसी सरकारी पोर्टल का URL बदलने
// पर भी नई APK बनानी पड़ती — और वह हर उपयोगकर्ता तक पहुँचने में हफ़्ते लगते, तब तक
// लिंक टूटा रहता। अब बदलाव तुरंत सबको दिखता है।
// ============================================================

// ऐप के भीतर की जिन स्क्रीनों पर भेजा जा सकता है — सिर्फ़ ये ही।
// ⚠️ यह श्वेत-सूची ज़रूरी है: बिना इसके कोई भी स्क्रीन-नाम डाला जा सकता, और ग़लत नाम
//    डालने पर ऐप कार्ड दबाते ही क्रैश हो जाती (navigate किसी अनजान route पर)।
// 🐛 इनमें से हर नाम RootNavigator में सच में registered होना चाहिए — जाँच करने पर
// पता चला कि पहली सूची में आधे नाम काल्पनिक थे (NewComplaint, MyComplaints,
// Helplines, WelfareSchemes)। ऐसा नाम चुनने पर कार्ड दबाते ही ऐप क्रैश हो जाती,
// क्योंकि navigate किसी अनजान route पर चला जाता।
const ALLOWED_INTERNAL_SCREENS = [
  'ComplaintForm',        // नई शिकायत दर्ज करें
  'TrackComplaint',       // ID से शिकायत ट्रैक करें
  'CitizenAllComplaints', // मेरी सभी शिकायतें
  'NearbyHelp',           // नज़दीकी थाना/अस्पताल
  'Faq',                  // सामान्य प्रश्न
  'ServiceRequestForm',   // काउंसलिंग/कानूनी सहायता का अनुरोध
];

function toService(r) {
  return {
    id: r.id,
    group: r.service_group,
    tag: r.tag,
    title: r.title,
    desc: r.description,
    icon: r.icon,
    colorKey: r.color_key,
    url: r.url,
    internal: r.internal_screen,
    displayOrder: r.display_order,
    isActive: r.is_active,
  };
}

// GET /police-services   (सार्वजनिक — नागरिक ऐप इसी से सूची बनाता है)
async function listActiveServices(req, res) {
  const result = await db.query(
    `SELECT * FROM police_services WHERE is_active = true
     ORDER BY service_group, display_order, id`
  );
  // ऐप को समूह-वार चाहिए, इसलिए यहीं समूह बना देते हैं
  const groups = [];
  for (const row of result.rows) {
    let g = groups.find((x) => x.group === row.service_group);
    if (!g) { g = { group: row.service_group, items: [] }; groups.push(g); }
    g.items.push(toService(row));
  }
  res.json(groups);
}

// GET /admin/police-services   (प्रबंधन — निष्क्रिय भी दिखती हैं)
async function listAllServices(req, res) {
  const result = await db.query('SELECT * FROM police_services ORDER BY service_group, display_order, id');
  res.json(result.rows.map(toService));
}

// साझा जाँच — बनाने व बदलने, दोनों में वही नियम लागू हों
function validateServiceInput({ group, tag, title, desc, icon, url, internal }) {
  if (!group || !String(group).trim()) return 'समूह (group) आवश्यक है';
  if (!title || !String(title).trim()) return 'शीर्षक आवश्यक है';

  const groupErr = validateTextLength(group, { max: 60, label: 'समूह' });
  if (groupErr) return groupErr;
  const titleErr = validateTextLength(title, { max: 120, label: 'शीर्षक' });
  if (titleErr) return titleErr;
  const tagErr = validateTextLength(tag, { max: 40, label: 'लेबल' });
  if (tagErr) return tagErr;
  const descErr = validateTextLength(desc, { max: 300, label: 'विवरण' });
  if (descErr) return descErr;
  const iconErr = validateTextLength(icon, { max: 60, label: 'आइकन' });
  if (iconErr) return iconErr;

  const hasUrl = url && String(url).trim();
  const hasInternal = internal && String(internal).trim();

  // ठीक एक होना चाहिए — दोनों खाली हों तो कार्ड दबाने पर कुछ नहीं होता,
  // और दोनों भरे हों तो कौन-सा चले यह अस्पष्ट रहता
  if (!hasUrl && !hasInternal) return 'लिंक (URL) या ऐप की स्क्रीन — इनमें से एक ज़रूरी है';
  if (hasUrl && hasInternal) return 'लिंक और ऐप-स्क्रीन दोनों नहीं चुन सकते — कोई एक चुनें';

  if (hasUrl) {
    // 🔒 सिर्फ़ http/https — वरना javascript: या data: जैसे लिंक डालकर नुक़सान
    // पहुँचाया जा सकता था (validateUrl यही जाँच करता है)
    const urlErr = validateUrl(url, { label: 'लिंक' });
    if (urlErr) return urlErr;
    if (!/^https?:\/\//i.test(String(url).trim())) {
      return 'लिंक http:// या https:// से शुरू होना चाहिए';
    }
  }
  if (hasInternal && !ALLOWED_INTERNAL_SCREENS.includes(String(internal).trim())) {
    return `ऐप की यह स्क्रीन मान्य नहीं है। चुनें: ${ALLOWED_INTERNAL_SCREENS.join(', ')}`;
  }
  return null;
}

// POST /admin/police-services
async function createService(req, res) {
  const { group, tag, title, desc, icon, colorKey, url, internal, displayOrder } = req.body || {};
  const err = validateServiceInput({ group, tag, title, desc, icon, url, internal });
  if (err) return res.status(400).json({ error: err });

  const result = await db.query(
    `INSERT INTO police_services (service_group, tag, title, description, icon, color_key, url, internal_screen, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      String(group).trim(), tag ? String(tag).trim() : null, String(title).trim(),
      desc ? String(desc).trim() : null, icon ? String(icon).trim() : null,
      colorKey ? String(colorKey).trim() : null,
      url ? String(url).trim() : null,
      internal ? String(internal).trim() : null,
      Number.isInteger(displayOrder) ? displayOrder : 0,
    ]
  );
  logActivity({
    actorRole: 'admin', actorId: req.user.id, actorName: req.user.name,
    action: 'police_service_created', details: `सेवा जोड़ी: ${title}`, req,
  });
  res.status(201).json(toService(result.rows[0]));
}

// PATCH /admin/police-services/:id
async function updateService(req, res) {
  const { id } = req.params;
  const existing = await db.query('SELECT * FROM police_services WHERE id = $1', [id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'सेवा नहीं मिली' });
  const old = existing.rows[0];

  // जो फ़ील्ड भेजी ही न गई हो, उसे पुराना ही रहने दें — वरना ऐप का कोई पुराना
  // संस्करण (जो सारी फ़ील्ड नहीं भेजता) बाक़ी जानकारी चुपचाप मिटा देता
  const merged = {
    group: req.body.group !== undefined ? req.body.group : old.service_group,
    tag: req.body.tag !== undefined ? req.body.tag : old.tag,
    title: req.body.title !== undefined ? req.body.title : old.title,
    desc: req.body.desc !== undefined ? req.body.desc : old.description,
    icon: req.body.icon !== undefined ? req.body.icon : old.icon,
    colorKey: req.body.colorKey !== undefined ? req.body.colorKey : old.color_key,
    url: req.body.url !== undefined ? req.body.url : old.url,
    internal: req.body.internal !== undefined ? req.body.internal : old.internal_screen,
    displayOrder: req.body.displayOrder !== undefined ? req.body.displayOrder : old.display_order,
    isActive: req.body.isActive !== undefined ? !!req.body.isActive : old.is_active,
  };

  // url/internal में से एक चुनने पर दूसरा अपने-आप हट जाना चाहिए, वरना पुराना मान
  // बचा रहकर ऊपर वाली "दोनों नहीं" जाँच में अटक जाता
  if (req.body.url !== undefined && String(req.body.url || '').trim()) merged.internal = null;
  if (req.body.internal !== undefined && String(req.body.internal || '').trim()) merged.url = null;

  const err = validateServiceInput(merged);
  if (err) return res.status(400).json({ error: err });

  const result = await db.query(
    `UPDATE police_services SET service_group = $1, tag = $2, title = $3, description = $4,
       icon = $5, color_key = $6, url = $7, internal_screen = $8, display_order = $9, is_active = $10
     WHERE id = $11 RETURNING *`,
    [
      String(merged.group).trim(), merged.tag ? String(merged.tag).trim() : null, String(merged.title).trim(),
      merged.desc ? String(merged.desc).trim() : null, merged.icon ? String(merged.icon).trim() : null,
      merged.colorKey ? String(merged.colorKey).trim() : null,
      merged.url ? String(merged.url).trim() : null,
      merged.internal ? String(merged.internal).trim() : null,
      Number.isInteger(merged.displayOrder) ? merged.displayOrder : 0,
      merged.isActive, id,
    ]
  );
  logActivity({
    actorRole: 'admin', actorId: req.user.id, actorName: req.user.name,
    action: 'police_service_updated', details: `सेवा बदली: ${merged.title}`, req,
  });
  res.json(toService(result.rows[0]));
}

// DELETE /admin/police-services/:id
//
// ⚠️ यह असल में मिटाता नहीं, सिर्फ़ निष्क्रिय करता है — ताकि ग़लती से हटाई गई सेवा
//    वापस चालू की जा सके (वरना पूरा विवरण व लिंक दोबारा टाइप करना पड़ता)।
async function deleteService(req, res) {
  const { id } = req.params;
  const result = await db.query(
    'UPDATE police_services SET is_active = false WHERE id = $1 RETURNING title',
    [id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'सेवा नहीं मिली' });
  logActivity({
    actorRole: 'admin', actorId: req.user.id, actorName: req.user.name,
    action: 'police_service_removed', details: `सेवा हटाई: ${result.rows[0].title}`, req,
  });
  res.json({ message: 'सेवा हटा दी गई' });
}

module.exports = {
  listActiveServices,
  listAllServices,
  createService,
  updateService,
  deleteService,
  ALLOWED_INTERNAL_SCREENS,
};
