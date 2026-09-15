const db = require('../config/db');
const { validateTextLength } = require('../utils/fieldValidators');

function toMessage(r) {
  return {
    id: r.id,
    senderRole: r.sender_role,
    senderId: r.sender_id,
    senderName: r.sender_name,
    recipientRole: r.recipient_role,
    recipientId: r.recipient_id,
    body: r.body,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

// GET /messages/recipients?q=खोज   — officer के लिए: एडमिन + बाकी अधिकारी; एडमिन के लिए: अधिकारी
// 🐛 बड़े पैमाने पर स्केल-फ़िक्स: पहले यह हमेशा सिस्टम के *सभी* सक्रिय अधिकारी/एडमिन
// (राज्य-स्तर पर हज़ारों हो सकते हैं) एक साथ लौटाता था — कोई खोज या सीमा नहीं थी।
// इससे response बहुत भारी होता और पुराने/सस्ते Android फ़ोन पर सूची खोलते ही ऐप अटक
// सकता था। अब: (1) बिना खोज के सिर्फ़ अपने थाने/ज़िले के लोग व एक उचित सीमा (50) तक
// मिलते हैं — जैसे किसी भी messaging app में "हाल के संपर्क" दिखते हैं, (2) खोजने पर
// नाम/PNO से मिलान होकर सिर्फ़ 30 नतीजे मिलते हैं।
async function listRecipients(req, res) {
  const q = (req.query.q || '').trim();
  const LIMIT = q ? 30 : 50;

  if (req.user.role === 'officer') {
    let admins, officers;
    if (q) {
      admins = await db.query(`SELECT id, name FROM admins WHERE name ILIKE $1 ORDER BY name LIMIT $2`, [`%${q}%`, LIMIT]);
      officers = await db.query(
        `SELECT id, name, badge_id FROM officers WHERE is_active = true AND id != $1 AND (name ILIKE $2 OR badge_id ILIKE $2) ORDER BY name LIMIT $3`,
        [req.user.id, `%${q}%`, LIMIT]
      );
    } else {
      admins = await db.query('SELECT id, name FROM admins ORDER BY name LIMIT $1', [LIMIT]);
      // पहले अपने ही थाने के साथी अधिकारी — messaging apps में "recent/nearby contacts" जैसा
      officers = await db.query(
        `SELECT id, name, badge_id FROM officers
         WHERE is_active = true AND id != $1
         ORDER BY (station = $2) DESC, name
         LIMIT $3`,
        [req.user.id, req.user.station || '', LIMIT]
      );
    }
    res.json({
      admins: admins.rows.map((a) => ({ id: a.id, name: a.name, role: 'admin' })),
      officers: officers.rows.map((o) => ({ id: o.id, name: `${o.name} (${o.badge_id})`, role: 'officer' })),
      truncated: officers.rows.length >= LIMIT || admins.rows.length >= LIMIT,
    });
  } else if (req.user.role === 'admin') {
    const officers = q
      ? await db.query(
          `SELECT id, name, badge_id FROM officers WHERE is_active = true AND (name ILIKE $1 OR badge_id ILIKE $1) ORDER BY name LIMIT $2`,
          [`%${q}%`, LIMIT]
        )
      : await db.query('SELECT id, name, badge_id FROM officers WHERE is_active = true ORDER BY name LIMIT $1', [LIMIT]);
    res.json({
      admins: [],
      officers: officers.rows.map((o) => ({ id: o.id, name: `${o.name} (${o.badge_id})`, role: 'officer' })),
      truncated: officers.rows.length >= LIMIT,
    });
  } else {
    res.json({ admins: [], officers: [], truncated: false });
  }
}

// POST /messages   body: { recipientRole, recipientId, body }
async function sendMessage(req, res) {
  const { recipientRole, recipientId, body } = req.body;
  if (!recipientRole || !recipientId || !body || !body.trim()) {
    return res.status(400).json({ error: 'प्राप्तकर्ता और संदेश दोनों आवश्यक हैं' });
  }
  // 🐛 बग फ़िक्स: recipientRole पहले किसी भी मान (जैसे 'citizen' या मनमाना टेक्स्ट)
  // को बिना जांचे स्वीकार कर लेता था — messages तालिका में गलत/अर्थहीन पंक्तियां बन
  // सकती थीं। अब सिर्फ़ 'officer' या 'admin' ही मान्य हैं (ये दोनों ही भूमिकाएं
  // वास्तव में संदेश देख सकती हैं — नागरिक के लिए कोई messaging UI ही नहीं है)।
  if (!['officer', 'admin'].includes(recipientRole)) {
    return res.status(400).json({ error: 'अमान्य प्राप्तकर्ता भूमिका' });
  }
  const bodyErr = validateTextLength(body, { max: 2000, label: 'संदेश' });
  if (bodyErr) return res.status(400).json({ error: bodyErr });

  // 🐛 बग फ़िक्स: recipientId का असल में अस्तित्व में होना कभी जांचा नहीं जाता था —
  // किसी भी मनमाने/ग़लत ID पर संदेश "सफल" हो जाता, पर वह कभी किसी को दिखता ही नहीं।
  const table = recipientRole === 'admin' ? 'admins' : 'officers';
  const recipientCheck = await db.query(`SELECT push_token FROM ${table} WHERE id = $1 AND is_active = true`, [recipientId]);
  if (recipientCheck.rows.length === 0) {
    return res.status(404).json({ error: 'प्राप्तकर्ता नहीं मिला' });
  }

  const result = await db.query(
    `INSERT INTO messages (sender_role, sender_id, sender_name, recipient_role, recipient_id, body)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.role, req.user.id, req.user.name, recipientRole, recipientId, body.trim()]
  );

  const { sendPushNotification } = require('../utils/push');
  const { createNotification } = require('../utils/notify');
  if (recipientCheck.rows[0]?.push_token) {
    sendPushNotification(recipientCheck.rows[0].push_token, `नया संदेश — ${req.user.name}`, body.trim(), { messageFrom: req.user.id });
  }
  createNotification({ recipientRole, recipientId, title: `नया संदेश — ${req.user.name}`, body: body.trim(), data: { messageFrom: req.user.id } });

  res.status(201).json(toMessage(result.rows[0]));
}

// GET /messages/conversation?with=<id>&role=<officer|admin>
async function getConversation(req, res) {
  const { with: otherId } = req.query;
  if (!otherId) return res.status(400).json({ error: 'with पैरामीटर आवश्यक है' });

  const result = await db.query(
    `SELECT * FROM messages
     WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY created_at ASC`,
    [req.user.id, otherId]
  );
  await db.query(
    `UPDATE messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
    [req.user.id, otherId]
  );
  res.json(result.rows.map(toMessage));
}

// GET /messages/inbox   — सभी बातचीत की सूची (अंतिम संदेश के साथ)
async function listInbox(req, res) {
  const simple = await db.query(
    `SELECT * FROM messages WHERE sender_id = $1 OR recipient_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  const seen = new Set();
  const conversations = [];
  for (const m of simple.rows) {
    const otherId = m.sender_id === req.user.id ? m.recipient_id : m.sender_id;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    conversations.push({
      otherId,
      otherName: m.sender_id === req.user.id ? null : m.sender_name,
      lastMessage: m.body,
      lastAt: m.created_at,
      unread: m.recipient_id === req.user.id && !m.read_at,
    });
  }

  // जिन बातचीत में हम भेजने वाले थे, वहाँ प्राप्तकर्ता का नाम अलग से ढूंढें
  for (const c of conversations) {
    if (c.otherName) continue;
    const officerMatch = await db.query('SELECT name FROM officers WHERE id = $1', [c.otherId]);
    if (officerMatch.rows[0]) {
      c.otherName = officerMatch.rows[0].name;
      continue;
    }
    const adminMatch = await db.query('SELECT name FROM admins WHERE id = $1', [c.otherId]);
    if (adminMatch.rows[0]) c.otherName = adminMatch.rows[0].name;
  }

  res.json(conversations);
}

// GET /messages/sent-received   — भेजे गए और प्राप्त संदेश अलग-अलग सूची में (नाम + दिनांक/समय सहित)
async function listSentReceived(req, res) {
  const sentResult = await db.query(
    `SELECT * FROM messages WHERE sender_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  const receivedResult = await db.query(
    `SELECT * FROM messages WHERE recipient_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );

  // भेजे गए संदेशों में प्राप्तकर्ता का नाम अलग से ढूंढना पड़ता है (सिर्फ़ sender_name स्टोर होता है)
  const nameCache = {};
  async function resolveName(id, role) {
    if (nameCache[id]) return nameCache[id];
    const table = role === 'admin' ? 'admins' : 'officers';
    const result = await db.query(`SELECT name FROM ${table} WHERE id = $1`, [id]);
    const name = result.rows[0]?.name || 'उपयोगकर्ता';
    nameCache[id] = name;
    return name;
  }

  const sent = [];
  for (const m of sentResult.rows) {
    sent.push({ ...toMessage(m), otherName: await resolveName(m.recipient_id, m.recipient_role), otherId: m.recipient_id });
  }
  const received = receivedResult.rows.map((m) => ({ ...toMessage(m), otherName: m.sender_name, otherId: m.sender_id }));

  res.json({ sent, received });
}

module.exports = { listRecipients, sendMessage, getConversation, listInbox, listSentReceived };
