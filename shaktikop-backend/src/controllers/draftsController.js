const db = require('../config/db');
const { validateJsonDepth } = require('../utils/fieldValidators');

const MAX_DRAFT_SIZE = 200_000; // 200KB — एक शिकायत-फ़ॉर्म का draft इतने में आराम से समा जाता है

// GET /citizens/me/drafts/:category
async function getDraft(req, res) {
  const { category } = req.params;
  const result = await db.query(
    'SELECT draft_data, updated_at FROM complaint_drafts WHERE citizen_id = $1 AND category = $2',
    [req.user.id, category]
  );
  if (result.rows.length === 0) return res.json({ draft: null, updatedAt: null });
  res.json({ draft: result.rows[0].draft_data, updatedAt: result.rows[0].updated_at });
}

// PUT /citizens/me/drafts/:category   body: { draft: {...} }
async function saveDraft(req, res) {
  const { category } = req.params;
  const { draft } = req.body;
  if (!category || category.length > 100) {
    return res.status(400).json({ error: 'अमान्य श्रेणी' });
  }
  // 🐛 बग फ़िक्स (गंभीर — DoS, टेस्ट से पुष्टि हुई): पहले draft की गहराई कभी नहीं
  // जांची जाती थी, और JSON.stringify() नीचे दिए आकार-जांच से *पहले* चलती थी — यानी
  // एक छोटा (~300KB) पर बहुत गहरा nested object आकार-सीमा के अंदर रहते हुए भी
  // JSON.stringify() को "Maximum call stack size exceeded" के साथ क्रैश करा सकता था।
  const depthErr = validateJsonDepth(draft, { label: 'draft' });
  if (depthErr) return res.status(400).json({ error: depthErr });
  const json = JSON.stringify(draft || {});
  // 🆕 पहले draft की कोई अधिकतम आकार-सीमा नहीं थी — कोई भी बहुत बड़ा object बार-बार
  // सेव करके DB में असीमित जगह भर सकता था
  if (json.length > MAX_DRAFT_SIZE) {
    return res.status(400).json({ error: 'Draft बहुत बड़ा है' });
  }
  await db.query(
    `INSERT INTO complaint_drafts (citizen_id, category, draft_data, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (citizen_id, category) DO UPDATE SET draft_data = $3, updated_at = now()`,
    [req.user.id, category, json]
  );
  res.json({ message: 'सुरक्षित हुआ' });
}

// DELETE /citizens/me/drafts/:category
async function deleteDraft(req, res) {
  const { category } = req.params;
  await db.query('DELETE FROM complaint_drafts WHERE citizen_id = $1 AND category = $2', [req.user.id, category]);
  res.json({ message: 'साफ़ हुआ' });
}

module.exports = { getDraft, saveDraft, deleteDraft };
