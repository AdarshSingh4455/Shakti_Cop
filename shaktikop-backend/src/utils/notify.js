const db = require('../config/db');

// ============================================================
// हर push notification के साथ इसे भी कॉल करें — इससे यूज़र bell आइकन में
// notification history देख सकता है (चाहे push permission दी हो या नहीं)।
//
// 🆕 priority: 'critical' | 'high' | 'medium' (डिफ़ॉल्ट 'medium') — SOS जैसी
// जानलेवा-आपात सूचनाओं को सामान्य सूचनाओं से अलग पहचानने के लिए।
// ============================================================
async function createNotification({ recipientRole, recipientId, title, body, data, priority = 'medium' }) {
  if (!recipientId) return;
  try {
    await db.query(
      `INSERT INTO notifications (recipient_role, recipient_id, title, body, data, priority)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [recipientRole, recipientId, title, body || null, data ? JSON.stringify(data) : null, priority]
    );
  } catch (err) {
    console.error('notification सेव करने में त्रुटि:', err.message);
  }
}

module.exports = { createNotification, createNotificationsBatch };

// ============================================================
// 🆕 Notification Batching — कई प्राप्तकर्ताओं (जैसे broadcast में "सभी नागरिक",
// या किसी शिकायत के निस्तारण पर "सभी Admins") को एक जैसी सूचना भेजनी हो, तो पहले
// हर प्राप्तकर्ता के लिए अलग-अलग INSERT query चलती थी (N अलग round-trips) — नागरिक
// आधार बड़ा होने पर (हज़ारों की संख्या में) यह धीमा हो सकता था और DB connection
// pool पर दबाव डाल सकता था। अब एक ही query में सबकी entries एक साथ जुड़ जाती हैं।
//
// recipients: [{ recipientId, priority? }, ...]  — बाक़ी (role/title/body/data)
// सबके लिए एक जैसे रहते हैं, इसलिए common पैरामीटर के रूप में लिए जाते हैं।
async function createNotificationsBatch(recipientRole, recipients, { title, body, data, priority = 'medium' }) {
  const validRecipients = (recipients || []).filter((r) => r && r.recipientId);
  if (validRecipients.length === 0) return;
  const dataJson = data ? JSON.stringify(data) : null;

  // 500 प्रति batch — एक ही query में असीमित rows डालना बहुत बड़ी संख्या (जैसे
  // 50,000 नागरिक) में एक भारी/धीमी query बना सकता है; उचित आकार के टुकड़ों में बांटते हैं
  const CHUNK_SIZE = 500;
  for (let start = 0; start < validRecipients.length; start += CHUNK_SIZE) {
    const chunk = validRecipients.slice(start, start + CHUNK_SIZE);
    const values = [];
    const placeholders = chunk.map((r, i) => {
      const base = i * 6;
      values.push(recipientRole, r.recipientId, title, body || null, dataJson, r.priority || priority);
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`;
    });
    try {
      await db.query(
        `INSERT INTO notifications (recipient_role, recipient_id, title, body, data, priority) VALUES ${placeholders.join(',')}`,
        values
      );
    } catch (err) {
      console.error('batch notification सेव करने में त्रुटि:', err.message);
    }
  }
}
