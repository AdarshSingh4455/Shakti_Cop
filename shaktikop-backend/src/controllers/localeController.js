const db = require('../config/db');
const { validateTextLength } = require('../utils/fieldValidators');

const LOCALE_CODE_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/; // जैसे 'hi', 'en', 'bho', 'en-US'
const MAX_BULK_ROWS = 5000;

// GET /locales   (सार्वजनिक)
async function getPublicLocales(req, res) {
  const result = await db.query('SELECT code, label FROM app_locales WHERE is_active = true ORDER BY display_order, code');
  res.json(result.rows);
}

// GET /translations/:code   (सार्वजनिक — key-value रूप में)
async function getPublicTranslations(req, res) {
  const { code } = req.params;
  const result = await db.query('SELECT source_text, translated_text FROM translations WHERE locale_code = $1', [code]);
  const map = {};
  for (const row of result.rows) map[row.source_text] = row.translated_text;
  res.json(map);
}

// GET /admin/locales   (Super Admin)
async function listLocales(req, res) {
  const result = await db.query('SELECT * FROM app_locales ORDER BY display_order, code');
  res.json(result.rows.map((r) => ({ code: r.code, label: r.label, displayOrder: r.display_order, isActive: r.is_active })));
}

// POST /admin/locales   (Super Admin)
async function createLocale(req, res) {
  const { code, label, displayOrder } = req.body;
  if (!code || !label) return res.status(400).json({ error: 'code और label दोनों आवश्यक हैं' });
  // 🆕 पहले code का कोई फ़ॉर्मेट-नियम नहीं था — बहुत लंबा/अजीब टेक्स्ट मोबाइल ऐप के
  // भाषा-चयन UI और routing (जैसे /translations/:code) में गड़बड़ कर सकता था
  const normalizedCode = code.trim().toLowerCase();
  if (!LOCALE_CODE_RE.test(normalizedCode)) {
    return res.status(400).json({ error: 'code मान्य भाषा-कोड होना चाहिए (जैसे hi, en, bho, en-US)' });
  }
  const labelErr = validateTextLength(label, { max: 60, label: 'label' });
  if (labelErr) return res.status(400).json({ error: labelErr });
  try {
    const result = await db.query(
      `INSERT INTO app_locales (code, label, display_order) VALUES ($1,$2,$3) RETURNING *`,
      [normalizedCode, label.trim(), displayOrder || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'यह भाषा कोड पहले से मौजूद है' });
    throw err;
  }
}

// DELETE /admin/locales/:code   (Super Admin)
async function deleteLocale(req, res) {
  const { code } = req.params;
  if (['hi', 'en'].includes(code)) {
    return res.status(400).json({ error: 'हिंदी और English हटाई नहीं जा सकतीं' });
  }
  await db.query('DELETE FROM app_locales WHERE code = $1', [code]);
  res.json({ message: 'हटाई गई' });
}

// GET /admin/translations/:code   (Super Admin)
async function listTranslations(req, res) {
  const { code } = req.params;
  const result = await db.query('SELECT id, source_text, translated_text FROM translations WHERE locale_code = $1 ORDER BY source_text', [code]);
  res.json(result.rows);
}

// POST /admin/translations/:code/bulk-upload   (Super Admin)
async function bulkUploadTranslations(req, res) {
  const { code } = req.params;
  const { rows, mode } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'rows की सूची आवश्यक है' });
  }
  // 🐛 बग फ़िक्स: rows की संख्या पर पहले कोई सीमा नहीं थी — बहुत बड़ी फ़ाइल एक
  // लंबा, table-lock करने वाला transaction बना सकती थी
  if (rows.length > MAX_BULK_ROWS) {
    return res.status(400).json({ error: `एक बार में अधिकतम ${MAX_BULK_ROWS} rows अपलोड की जा सकती हैं` });
  }
  const clean = rows
    .map((r) => ({
      sourceText: String(r.sourceText || '').trim().slice(0, 2000),
      translatedText: String(r.translatedText || '').trim().slice(0, 2000),
    }))
    .filter((r) => r.sourceText && r.translatedText);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    if (mode === 'replace') {
      await client.query('DELETE FROM translations WHERE locale_code = $1', [code]);
    }
    let inserted = 0;
    for (const r of clean) {
      const result = await client.query(
        `INSERT INTO translations (locale_code, source_text, translated_text) VALUES ($1,$2,$3)
         ON CONFLICT (locale_code, source_text) DO UPDATE SET translated_text = $3`,
        [code, r.sourceText, r.translatedText]
      );
      inserted += result.rowCount;
    }
    await client.query('COMMIT');
    res.json({ message: 'अपलोड हुआ', validRows: clean.length, inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getPublicLocales,
  getPublicTranslations,
  listLocales,
  createLocale,
  deleteLocale,
  listTranslations,
  bulkUploadTranslations,
};
