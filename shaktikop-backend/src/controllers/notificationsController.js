const db = require('../config/db');

function toNotification(r) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    data: r.data || null,
    priority: r.priority || 'medium',
    isRead: r.is_read,
    createdAt: r.created_at,
  };
}

// GET /notifications
async function listMyNotifications(req, res) {
  const result = await db.query(
    `SELECT * FROM notifications WHERE recipient_role = $1 AND recipient_id = $2
     ORDER BY created_at DESC LIMIT 50`,
    [req.user.role, req.user.id]
  );
  res.json(result.rows.map(toNotification));
}

// GET /notifications/unread-count
// 🐛 बग फ़िक्स: priority व्यवस्था (critical/high/medium) बनाई तो गई, पर हमेशा-दिखने
// वाला bell-icon (हर स्क्रीन के हेडर में) सिर्फ़ सामान्य गिनती दिखाता था — SOS जैसी
// गंभीर सूचना और "नया संदेश" एक जैसे दिखते, अधिकारी को अंदर खोलने तक पता ही नहीं
// चलता। अब priority-वार जानकारी भी साथ भेजी जाती है।
async function unreadCount(req, res) {
  const result = await db.query(
    `SELECT
       count(*) AS total,
       count(*) FILTER (WHERE priority = 'critical') AS critical,
       count(*) FILTER (WHERE priority = 'high') AS high
     FROM notifications WHERE recipient_role = $1 AND recipient_id = $2 AND is_read = false`,
    [req.user.role, req.user.id]
  );
  const r = result.rows[0];
  res.json({
    count: Number(r.total),
    hasCritical: Number(r.critical) > 0,
    hasHigh: Number(r.high) > 0,
  });
}

// PATCH /notifications/:id/read
async function markRead(req, res) {
  const { id } = req.params;
  await db.query(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND recipient_role = $2 AND recipient_id = $3',
    [id, req.user.role, req.user.id]
  );
  res.json({ message: 'दर्ज हुआ' });
}

// PATCH /notifications/read-all
async function markAllRead(req, res) {
  await db.query(
    'UPDATE notifications SET is_read = true WHERE recipient_role = $1 AND recipient_id = $2 AND is_read = false',
    [req.user.role, req.user.id]
  );
  res.json({ message: 'सभी पढ़ी हुई मानी गईं' });
}

module.exports = { listMyNotifications, unreadCount, markRead, markAllRead };
