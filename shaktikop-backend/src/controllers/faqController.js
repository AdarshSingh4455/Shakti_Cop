const db = require('../config/db');
const { validateTextLength, validatePositiveInt } = require('../utils/fieldValidators');

// GET /faq   (सार्वजनिक)
async function getPublicFaq(req, res) {
  const result = await db.query('SELECT id, question, answer, category FROM faq_items WHERE is_active = true ORDER BY display_order, id');
  res.json(result.rows);
}

// GET /admin/faq   (Super Admin — निष्क्रिय भी शामिल)
async function listAllFaq(req, res) {
  const result = await db.query('SELECT * FROM faq_items ORDER BY display_order, id');
  res.json(
    result.rows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      category: r.category,
      displayOrder: r.display_order,
      isActive: r.is_active,
    }))
  );
}

// POST /admin/faq
async function createFaq(req, res) {
  const { question, answer, category, displayOrder } = req.body;
  if (!question || !answer) return res.status(400).json({ error: 'प्रश्न और उत्तर दोनों आवश्यक हैं' });
  const qErr = validateTextLength(question, { max: 300, label: 'प्रश्न' });
  if (qErr) return res.status(400).json({ error: qErr });
  const aErr = validateTextLength(answer, { max: 2000, label: 'उत्तर' });
  if (aErr) return res.status(400).json({ error: aErr });
  const catErr = validateTextLength(category, { max: 100, label: 'श्रेणी' });
  if (catErr) return res.status(400).json({ error: catErr });
  const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
  if (orderErr) return res.status(400).json({ error: orderErr });
  const result = await db.query(
    `INSERT INTO faq_items (question, answer, category, display_order) VALUES ($1,$2,$3,$4) RETURNING *`,
    [question.trim(), answer.trim(), category || 'सामान्य', displayOrder || 0]
  );
  res.status(201).json(result.rows[0]);
}

// PATCH /admin/faq/:id
async function updateFaq(req, res) {
  const { id } = req.params;
  const { question, answer, category, displayOrder, isActive } = req.body;
  if (question !== undefined) {
    const qErr = validateTextLength(question, { max: 300, label: 'प्रश्न' });
    if (qErr) return res.status(400).json({ error: qErr });
  }
  if (answer !== undefined) {
    const aErr = validateTextLength(answer, { max: 2000, label: 'उत्तर' });
    if (aErr) return res.status(400).json({ error: aErr });
  }
  if (category !== undefined) {
    const catErr = validateTextLength(category, { max: 100, label: 'श्रेणी' });
    if (catErr) return res.status(400).json({ error: catErr });
  }
  if (displayOrder !== undefined) {
    const orderErr = validatePositiveInt(displayOrder, { label: 'क्रम' });
    if (orderErr) return res.status(400).json({ error: orderErr });
  }
  const result = await db.query(
    `UPDATE faq_items SET question = COALESCE($1, question), answer = COALESCE($2, answer),
     category = COALESCE($3, category), display_order = COALESCE($4, display_order),
     is_active = COALESCE($5, is_active) WHERE id = $6 RETURNING *`,
    [question, answer, category, displayOrder, isActive, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'FAQ नहीं मिला' });
  res.json(result.rows[0]);
}

// DELETE /admin/faq/:id
async function deleteFaq(req, res) {
  await db.query('DELETE FROM faq_items WHERE id = $1', [req.params.id]);
  res.json({ message: 'हटाया गया' });
}

module.exports = { getPublicFaq, listAllFaq, createFaq, updateFaq, deleteFaq };
