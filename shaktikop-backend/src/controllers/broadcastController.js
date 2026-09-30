const db = require('../config/db');
const { sendPushNotification } = require('../utils/push');
const { createNotificationsBatch } = require('../utils/notify');
const { logActivity } = require('../utils/activityLog');
const { validateTextLength } = require('../utils/fieldValidators');

// POST /admin/broadcast   body: { audience: 'officers'|'citizens'|'all', title, body, district? }
async function sendBroadcast(req, res) {
  const { audience, title, body, district } = req.body;
  if (!['officers', 'citizens', 'all'].includes(audience)) {
    return res.status(400).json({ error: 'audience "officers", "citizens" या "all" होना चाहिए' });
  }
  if (!title || !body) {
    return res.status(400).json({ error: 'शीर्षक और संदेश दोनों आवश्यक हैं' });
  }
  // 🐛 बग फ़िक्स: शीर्षक/संदेश की कोई लंबाई-सीमा नहीं थी — जबकि बाक़ी हर टेक्स्ट फ़ील्ड
  // पर validateTextLength लगी है। यह टेक्स्ट संभावित रूप से राज्य के हर नागरिक की
  // push notification में जाता है, इसलिए बेहद लंबा संदेश भेजने से रोकना ज़रूरी है।
  const titleErr = validateTextLength(title, { max: 100, label: 'शीर्षक' });
  if (titleErr) return res.status(400).json({ error: titleErr });
  const bodyErr = validateTextLength(body, { max: 500, label: 'संदेश' });
  if (bodyErr) return res.status(400).json({ error: bodyErr });
  // 🐛 बग फ़िक्स (गंभीर): IG/DIG के लिए यहां कोई scope-जांच ही नहीं थी — वे कोई भी
  // district भरकर वहां भेज सकते थे (अपने Range से बाहर का भी), या खाली छोड़कर पूरे
  // राज्य में broadcast कर सकते थे (broadcasts तालिका में सिर्फ़ एक district column
  // है, इसलिए range की सभी districts में एक साथ नहीं भेजा जा सकता — इसलिए यहां एक
  // विशिष्ट, अपने Range के अंदर का district चुनना ज़रूरी बना दिया गया है)।
  let scopedDistrict;
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    if (!district || !req.adminScope.rangeDistricts.some((d) => d.trim().toLowerCase() === district.trim().toLowerCase())) {
      return res.status(400).json({ error: 'कृपया अपने Range में से एक ज़िला चुनें' });
    }
    scopedDistrict = district;
  } else {
    scopedDistrict = req.adminScope?.district || district || null;
  }

  await db.query(
    `INSERT INTO broadcasts (sender_admin_id, sender_name, audience, title, body, district) VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, req.user.name, audience, title.trim(), body.trim(), scopedDistrict]
  );

  let recipientCount = 0;
  const broadcastTitle = title;

  // 🆕 Notification Batching — पहले हर प्राप्तकर्ता के लिए अलग INSERT query चलती थी
  // (नागरिकों को broadcast करने पर हज़ारों अलग queries हो सकती थीं)। अब सभी की
  // notification-history entries एक ही (chunked) query में जुड़ती हैं। Push
  // notification अब भी हर किसी को अलग भेजनी पड़ती है (हर किसी का push token अलग
  // होता है, वह किसी DB query से नहीं जुड़ा) — सिर्फ़ हमारी अपनी DB पर लिखना batched हुआ है।
  if (audience === 'officers' || audience === 'all') {
    const officerQuery = scopedDistrict
      ? await db.query('SELECT id, push_token FROM officers WHERE is_active = true AND district = $1', [scopedDistrict])
      : await db.query('SELECT id, push_token FROM officers WHERE is_active = true');
    for (const o of officerQuery.rows) {
      if (o.push_token) sendPushNotification(o.push_token, broadcastTitle, body, { broadcast: true });
    }
    await createNotificationsBatch(
      'officer',
      officerQuery.rows.map((o) => ({ recipientId: o.id })),
      { title: broadcastTitle, body, data: { broadcast: true } }
    );
    recipientCount += officerQuery.rows.length;
  }

  if (audience === 'citizens' || audience === 'all') {
    // 🐛 बग फ़िक्स (राज्य-स्तर पर सर्वर गिर सकता था): पहले यहाँ दो चूकें थीं —
    //   1. पूरे राज्य के सभी नागरिक एक ही query में मेमोरी में आ जाते। अभी कुछ हज़ार
    //      हैं तो पता नहीं चलता, पर 20+ लाख उपयोगकर्ताओं पर यह अकेली पंक्ति Node की
    //      मेमोरी भर देती।
    //   2. उसके बाद हर नागरिक के लिए sendPushNotification() एक ही loop में, बिना
    //      await के चलती — यानी लाखों HTTP अनुरोध एक साथ खुल जाते। सॉकेट ख़त्म हो
    //      जाते, Expo की सेवा हमें दर-सीमित (या ब्लॉक) कर देती, और प्रक्रिया क्रैश
    //      हो सकती थी। यानी एक broadcast पूरे ऐप को गिरा सकता था — और उसी दौरान कोई
    //      SOS आए तो वह भी नहीं पहुँचता।
    // अब नागरिक टुकड़ों में पढ़े जाते हैं, और हर टुकड़े की push एक साथ (पर सीमित
    // संख्या में) भेजकर पूरी होने का इंतज़ार किया जाता है — तभी अगला टुकड़ा।
    const PAGE = 500;
    let offset = 0;
    for (;;) {
      const page = scopedDistrict
        ? await db.query(
            'SELECT id, push_token FROM citizens WHERE is_active = true AND district = $1 ORDER BY id LIMIT $2 OFFSET $3',
            [scopedDistrict, PAGE, offset]
          )
        : await db.query(
            'SELECT id, push_token FROM citizens WHERE is_active = true ORDER BY id LIMIT $1 OFFSET $2',
            [PAGE, offset]
          );
      if (page.rows.length === 0) break;

      await Promise.all(
        page.rows
          .filter((c) => c.push_token)
          .map((c) =>
            Promise.resolve(sendPushNotification(c.push_token, broadcastTitle, body, { broadcast: true })).catch(() => {})
          )
      );
      await createNotificationsBatch(
        'citizen',
        page.rows.map((c) => ({ recipientId: c.id })),
        { title: broadcastTitle, body, data: { broadcast: true } }
      );

      recipientCount += page.rows.length;
      if (page.rows.length < PAGE) break;
      offset += PAGE;
    }
  }

  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'broadcast_sent', details: `"${title}" — ${audience} को (${recipientCount} प्राप्तकर्ता)`, req });
  res.json({ message: 'Broadcast भेज दिया गया', recipientCount });
}

// GET /admin/broadcast/history
// GET /admin/broadcast/history
async function getBroadcastHistory(req, res) {
  // 🐛 बग फ़िक्स: पहले कोई scope-फ़िल्टर ही नहीं था — कोई भी admin (DSP सहित, जो
  // /admin/broadcast/history देख तो सकता है भले ही खुद broadcast न भेज सके) राज्य-भर
  // का पूरा broadcast-इतिहास देख सकता था। अब अपने ज़िले (या राज्य-स्तर वालों के लिए
  // पूरा) तक सीमित — DSP के लिए req.user.district इस्तेमाल होता है क्योंकि यह तालिका
  // भी सिर्फ़ ज़िला-स्तर तक सीमित है।
  // 🐛 बग फ़िक्स: rangeDistricts (IG/DIG) की जांच छूट गई थी — नतीजा, IG/DIG को
  // राज्य-भर का पूरा broadcast-इतिहास दिख जाता (scopeDistrict null बन जाता, जो
  // "कोई सीमा नहीं" वाली शाखा चुन लेता)।
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    const result = await db.query(
      'SELECT * FROM broadcasts WHERE district = ANY($1) OR district IS NULL ORDER BY created_at DESC LIMIT 50',
      [req.adminScope.rangeDistricts]
    );
    return res.json(
      result.rows.map((b) => ({
        id: b.id,
        senderName: b.sender_name,
        audience: b.audience,
        title: b.title,
        body: b.body,
        district: b.district,
        createdAt: b.created_at,
      }))
    );
  }
  const scopeDistrict = req.adminScope?.district || (req.adminScope?.circleStations ? req.user.district : null);
  const result = scopeDistrict
    ? await db.query('SELECT * FROM broadcasts WHERE district = $1 OR district IS NULL ORDER BY created_at DESC LIMIT 50', [scopeDistrict])
    : await db.query('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 50');
  res.json(
    result.rows.map((b) => ({
      id: b.id,
      senderName: b.sender_name,
      audience: b.audience,
      title: b.title,
      body: b.body,
      district: b.district,
      createdAt: b.created_at,
    }))
  );
}

module.exports = { sendBroadcast, getBroadcastHistory };
