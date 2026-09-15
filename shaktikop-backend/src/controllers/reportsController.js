const db = require('../config/db');
const { validateEmail, validateEnum } = require('../utils/fieldValidators');
const { buildReportPdfBuffer } = require('../utils/pdfReport');
const { sendEmailWithAttachment } = require('../utils/otp');

// 🆕 report का डेटा इकट्ठा करना — generateNow (मैन्युअल) और automated scheduler
// (utils/reportScheduler.js) दोनों इसी एक फ़ंक्शन का इस्तेमाल करते हैं, ताकि
// दोनों जगह की गणना (calculation) हमेशा एक जैसी रहे।
async function buildReportData(district) {
  const districtFilter = district ? ' AND district = $1' : '';
  const params = district ? [district] : [];
  const stats = await db.query(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE status = 'निस्तारित') AS resolved,
            count(*) FILTER (WHERE status = 'दर्ज') AS pending,
            count(*) FILTER (WHERE status = 'अधिकारी नियुक्त') AS assigned,
            count(*) FILTER (WHERE status = 'कार्यवाही जारी') AS inProgress,
            count(*) FILTER (WHERE status = 'अस्वीकृत') AS rejected,
            avg(EXTRACT(EPOCH FROM (COALESCE(resolved_at, updated_at) - created_at)) / 3600) FILTER (WHERE status = 'निस्तारित') AS avgResolutionHours
     FROM complaints WHERE deleted_at IS NULL ${districtFilter}`,
    params
  );
  const byCategory = await db.query(
    `SELECT category, count(*) AS total FROM complaints WHERE deleted_at IS NULL ${districtFilter} GROUP BY category ORDER BY total DESC LIMIT 5`,
    params
  );
  const s = stats.rows[0];
  return {
    total: Number(s.total),
    resolved: Number(s.resolved),
    pending: Number(s.pending),
    assigned: Number(s.assigned),
    inProgress: Number(s.inprogress),
    rejected: Number(s.rejected),
    avgResolutionHours: s.avgresolutionhours ? Number(s.avgresolutionhours).toFixed(1) : null,
    byCategory: byCategory.rows.map((c) => ({ category: c.category, total: Number(c.total) })),
  };
}

function toSchedule(r) {
  return {
    id: r.id,
    frequency: r.frequency,
    recipientEmail: r.recipient_email,
    district: r.district,
    isActive: r.is_active,
    lastSentAt: r.last_sent_at,
    createdAt: r.created_at,
  };
}

// GET /admin/report-schedules
async function listSchedules(req, res) {
  // 🐛 बग फ़िक्स (राउंड 2): पिछली बार सिर्फ़ adminScope.district जांचा गया था — पर DSP का
  // scope हमेशा circleStations होता है (adminScope.district कभी सेट नहीं होता, भले ही DSP
  // का अपना district हो) — इसलिए DSP अब भी सभी ज़िलों के schedules देख पाता था। यह तालिका
  // सिर्फ़ ज़िला-स्तर तक सीमित है (थाना-स्तर नहीं), इसलिए DSP के लिए भी उसका अपना ज़िला
  // (req.user.district — JWT में हमेशा मौजूद) इस्तेमाल करते हैं।
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी — नतीजा, IG/DIG को राज्य-
  // भर के सभी report-schedules दिख जाते।
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    const result = await db.query('SELECT * FROM report_schedules WHERE district = ANY($1) ORDER BY created_at DESC', [req.adminScope.rangeDistricts]);
    return res.json(result.rows.map(toSchedule));
  }
  const scopeDistrict = req.adminScope?.district || (req.adminScope?.circleStations ? req.user.district : null);
  if (scopeDistrict) {
    const result = await db.query('SELECT * FROM report_schedules WHERE district = $1 ORDER BY created_at DESC', [scopeDistrict]);
    return res.json(result.rows.map(toSchedule));
  }
  const result = await db.query('SELECT * FROM report_schedules ORDER BY created_at DESC');
  res.json(result.rows.map(toSchedule));
}

// POST /admin/report-schedules   body: { frequency, recipientEmail, district? }
async function createSchedule(req, res) {
  const { frequency, recipientEmail, district } = req.body;
  if (!recipientEmail) return res.status(400).json({ error: 'recipientEmail आवश्यक है' });
  // 🐛 बग फ़िक्स: पहले recipientEmail का फ़ॉर्मेट कभी जांचा नहीं जाता था — कोई भी
  // मनमाना टेक्स्ट ("abc", "xyz123") स्वीकार हो जाता, और report कभी भेजी ही नहीं
  // जा पाती (या SMTP त्रुटि देता), बिना बनाते समय किसी को पता चले
  const emailErr = validateEmail(recipientEmail);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const freqErr = validateEnum(frequency, ['weekly', 'monthly'], { label: 'frequency' });
  if (freqErr) return res.status(400).json({ error: freqErr });
  // 🐛 बग फ़िक्स: IG/DIG के लिए यहां कोई scope-जांच नहीं थी — वे कोई भी district भरकर
  // (या खाली छोड़कर राज्य-स्तरीय) schedule बना सकते थे
  let scheduleDistrict;
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    if (!district || !req.adminScope.rangeDistricts.some((d) => d.trim().toLowerCase() === district.trim().toLowerCase())) {
      return res.status(400).json({ error: 'कृपया अपने Range में से एक ज़िला चुनें' });
    }
    scheduleDistrict = district;
  } else {
    scheduleDistrict = district || req.adminScope?.district || null;
  }
  const result = await db.query(
    `INSERT INTO report_schedules (created_by, frequency, recipient_email, district) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, frequency || 'weekly', recipientEmail, scheduleDistrict]
  );
  res.status(201).json(toSchedule(result.rows[0]));
}

// PATCH /admin/report-schedules/:id   body: { isActive }
// 🐛 बग फ़िक्स (गंभीर — BOLA): पहले updateSchedule/deleteSchedule किसी भी schedule-ID
// पर कोई scope-जांच नहीं करते थे — कोई भी district-admin सिर्फ़ ID अंदाज़ा/गिनकर
// किसी दूसरे ज़िले का schedule बदल/हटा सकता था (जैसे उसका recipientEmail बदलकर या
// उसे निष्क्रिय करके)। अब super_admin को छोड़कर बाकी सबके लिए district का मिलान
// ज़रूरी है — बिल्कुल वैसे ही जैसे बाकी सभी district-scoped endpoints में होता है।
async function assertScheduleAccess(req, id) {
  const result = await db.query('SELECT * FROM report_schedules WHERE id = $1', [id]);
  if (result.rows.length === 0) return { ok: false, code: 404, error: 'नहीं मिला' };
  const row = result.rows[0];
  if (req.user.adminRole !== 'super_admin') {
    // 🐛 बग फ़िक्स: यहां rangeDistricts (IG/DIG) की जांच ही नहीं थी — नतीजा, IG/DIG
    // को *हमेशा* 403 मिलता, अपने ही Range के schedule के लिए भी (क्योंकि
    // adminScope.district IG/DIG के लिए कभी सेट नहीं होता, वे rangeDistricts इस्तेमाल
    // करते हैं)।
    if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
      if (!req.adminScope.rangeDistricts.some((d) => d.trim().toLowerCase() === (row.district || '').trim().toLowerCase())) {
        return { ok: false, code: 403, error: 'यह schedule आपके Range का नहीं है' };
      }
      return { ok: true, row };
    }
    const scopeDistrict = req.adminScope?.district;
    if (!scopeDistrict || (row.district || '').trim().toLowerCase() !== scopeDistrict.trim().toLowerCase()) {
      return { ok: false, code: 403, error: 'यह schedule आपके ज़िले का नहीं है' };
    }
  }
  return { ok: true, row };
}

async function updateSchedule(req, res) {
  const { id } = req.params;
  const { isActive } = req.body;
  const access = await assertScheduleAccess(req, id);
  if (!access.ok) return res.status(access.code).json({ error: access.error });
  const result = await db.query('UPDATE report_schedules SET is_active = $1 WHERE id = $2 RETURNING *', [isActive, id]);
  res.json(toSchedule(result.rows[0]));
}

// DELETE /admin/report-schedules/:id
async function deleteSchedule(req, res) {
  const access = await assertScheduleAccess(req, req.params.id);
  if (!access.ok) return res.status(access.code).json({ error: access.error });
  await db.query('DELETE FROM report_schedules WHERE id = $1', [req.params.id]);
  res.json({ message: 'हटाया गया' });
}

// POST /admin/report-schedules/:id/generate-now
//
// 🐛 बग फ़िक्स: पहले यह सिर्फ़ report का डेटा JSON के रूप में लौटाता था — न कोई
// असली PDF फ़ाइल बनती थी, न कोई ईमेल जाती थी ("Automated PDF-report generation"
// नाम का होकर भी असल में automated नहीं था)। अब असल में PDF बनता है (हिंदी टेक्स्ट
// सहित, embedded Devanagari फ़ॉन्ट से) और ईमेल से attachment के रूप में भेजा जाता
// है। last_sent_at सिर्फ़ तभी अपडेट होता है जब ईमेल सच में भेजी जा सकी हो — इससे
// "भेजा गया" और "सिर्फ़ कोशिश हुई" में फ़र्क़ साफ़ रहता है।
async function generateNow(req, res) {
  const { id } = req.params;
  const access = await assertScheduleAccess(req, id);
  if (!access.ok) return res.status(access.code).json({ error: access.error });
  const schedule = access.row;

  const reportData = await buildReportData(schedule.district);
  const generatedAt = new Date().toISOString();
  const title = schedule.district ? `साप्ताहिक/मासिक शिकायत-रिपोर्ट — ${schedule.district}` : 'साप्ताहिक/मासिक शिकायत-रिपोर्ट — राज्य-स्तरीय';

  const pdfBuffer = await buildReportPdfBuffer({ title, district: schedule.district, generatedAt, reportData });

  const emailResult = await sendEmailWithAttachment(
    schedule.recipient_email,
    `ShaktiCop रिपोर्ट — ${schedule.district || 'राज्य-स्तरीय'} — ${new Date(generatedAt).toLocaleDateString('hi-IN', { timeZone: 'Asia/Kolkata' })}`,
    'आपकी अनुरोधित शिकायत-रिपोर्ट संलग्न (attached) है — विस्तृत आंकड़ों के लिए PDF खोलें।',
    { filename: `ShaktiCop-Report-${id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
  );

  if (emailResult.sent) {
    await db.query('UPDATE report_schedules SET last_sent_at = now() WHERE id = $1', [id]);
  }

  // PDF हमेशा तुरंत डाउनलोड के लिए भी उपलब्ध — भले ही ईमेल (SMTP न होने से) न जा सकी हो,
  // Admin अपनी स्क्रीन पर देख/डाउनलोड तो कर ही सके
  res.json({
    message: emailResult.sent
      ? `रिपोर्ट बन गई और ${schedule.recipient_email} पर ईमेल कर दी गई`
      : `रिपोर्ट बन गई है, पर ईमेल नहीं जा सकी (${emailResult.reason}) — नीचे से PDF डाउनलोड करें`,
    emailSent: emailResult.sent,
    recipientEmail: schedule.recipient_email,
    reportData,
    generatedAt,
    pdfBase64: pdfBuffer.toString('base64'), // मोबाइल/वेब पर तुरंत डाउनलोड/शेयर करने के लिए
  });
}

module.exports = { listSchedules, createSchedule, updateSchedule, deleteSchedule, generateNow, buildReportData };
