const { runIfLeader } = require('./singleFlight');
const db = require('../config/db');
const { buildReportData } = require('../controllers/reportsController');
const { buildReportPdfBuffer } = require('./pdfReport');
const { sendEmailWithAttachment } = require('./otp');
const { captureException } = require('./sentry');

// ============================================================
// 🆕 Automated PDF Report Generation — असल "automated" हिस्सा
//
// पहले report_schedules तालिका में frequency (weekly/monthly) चुनी तो जा सकती
// थी, पर उसका असर में कुछ नहीं होता था — कोई भी पीछे से खुद-ब-खुद रिपोर्ट नहीं
// भेजता था, सिर्फ़ "Generate करें" बटन दबाने पर ही कुछ होता (वह भी सिर्फ़ डेटा,
// PDF/ईमेल नहीं) — यानी "automated" नाम की सुविधा असल में मैन्युअल थी।
//
// अब हर 6 घंटे में यह जांचता है: कौन-सी सक्रिय (is_active) schedule अपनी
// frequency (साप्ताहिक/मासिक) के हिसाब से "due" (समय हो चुका) है, और अपने-आप
// उसके लिए PDF बनाकर ईमेल कर देता है — बिना किसी के दबाए।
// ============================================================

function isDue(schedule) {
  if (!schedule.last_sent_at) return true; // कभी नहीं भेजी गई — तुरंत due
  const daysSinceLastSent = (Date.now() - new Date(schedule.last_sent_at).getTime()) / (1000 * 60 * 60 * 24);
  if (schedule.frequency === 'monthly') return daysSinceLastSent >= 30;
  return daysSinceLastSent >= 7; // डिफ़ॉल्ट/weekly
}

async function runAutomatedReportScheduler() {
  try {
    const result = await db.query('SELECT * FROM report_schedules WHERE is_active = true');
    const due = result.rows.filter(isDue);
    if (due.length === 0) return { checked: result.rows.length, sent: 0 };

    let sentCount = 0;
    for (const schedule of due) {
      try {
        const reportData = await buildReportData(schedule.district);
        const generatedAt = new Date().toISOString();
        const title = schedule.district
          ? `${schedule.frequency === 'monthly' ? 'मासिक' : 'साप्ताहिक'} शिकायत-रिपोर्ट — ${schedule.district}`
          : `${schedule.frequency === 'monthly' ? 'मासिक' : 'साप्ताहिक'} शिकायत-रिपोर्ट — राज्य-स्तरीय`;

        const pdfBuffer = await buildReportPdfBuffer({ title, district: schedule.district, generatedAt, reportData });
        const emailResult = await sendEmailWithAttachment(
          schedule.recipient_email,
          `ShaktiCop स्वचालित रिपोर्ट — ${schedule.district || 'राज्य-स्तरीय'} — ${new Date(generatedAt).toLocaleDateString('hi-IN', { timeZone: 'Asia/Kolkata' })}`,
          'यह आपकी निर्धारित (scheduled) रिपोर्ट है — स्वचालित रूप से भेजी गई। विस्तृत आंकड़ों के लिए संलग्न PDF खोलें।',
          { filename: `ShaktiCop-Report-${schedule.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }
        );

        if (emailResult.sent) {
          await db.query('UPDATE report_schedules SET last_sent_at = now() WHERE id = $1', [schedule.id]);
          sentCount++;
        } else {
          console.error(`⚠️ Schedule ${schedule.id} की स्वचालित रिपोर्ट नहीं भेजी जा सकी: ${emailResult.reason}`);
        }
      } catch (innerErr) {
        // एक schedule की त्रुटि बाकी schedules को न रोके
        console.error(`⚠️ Schedule ${schedule.id} की रिपोर्ट बनाने में त्रुटि:`, innerErr.message);
        captureException(innerErr, { scheduleId: schedule.id });
      }
    }
    console.log(`📊 स्वचालित रिपोर्ट: ${due.length} में से ${sentCount} सफलतापूर्वक भेजी गईं`);
    return { checked: result.rows.length, due: due.length, sent: sentCount };
  } catch (err) {
    console.error('स्वचालित रिपोर्ट-शेड्यूलर विफल:', err.message);
    captureException(err);
    return { error: err.message };
  }
}

function startReportScheduler() {
  // एक ही रिपोर्ट कई बार ईमेल न हो — देखें utils/singleFlight.js
  const job = () => runIfLeader('reportScheduler', runAutomatedReportScheduler);
  job();
  setInterval(job, 6 * 60 * 60 * 1000); // हर 6 घंटे में जांच
}

module.exports = { startReportScheduler, runAutomatedReportScheduler };
