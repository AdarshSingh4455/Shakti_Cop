const crypto = require('crypto');
const db = require('../config/db');

// ============================================================
// Refresh Tokens
//
// access token (JWT) अब छोटी अवधि का है (देखें jwt.js) — चोरी होने पर नुक़सान
// की खिड़की (window) छोटी रहे। लंबी अवधि तक लॉग-इन बनाए रखने के लिए यह अलग,
// opaque (random, JWT नहीं) refresh token इस्तेमाल होता है, जो सिर्फ़
// /auth/refresh एंडपॉइंट को नया access token लेने के लिए भेजा जाता है।
//
// 🔒 सुरक्षा डिज़ाइन:
// - असली token कभी DB में plaintext सेव नहीं होता — सिर्फ़ SHA-256 hash
//   (पासवर्ड की तरह; DB लीक होने पर भी असली token नहीं बन सकता)।
// - हर बार refresh token इस्तेमाल होने पर वह turant revoke होकर एक नया जारी
//   होता है ("rotation") — अगर कोई पुराना/चुराया हुआ token दोबारा इस्तेमाल
//   करने की कोशिश करे, वह पहले ही revoke हो चुका मिलेगा।
// ============================================================

const REFRESH_TOKEN_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS || 30);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// 🆕 deviceName अब वैकल्पिक तीसरा पैरामीटर — मोबाइल ऐप लॉगिन के समय भेजता है
// (जैसे "Redmi Note 12"), ताकि "मेरे लॉगिन डिवाइस" स्क्रीन में दिखाया जा सके।
async function createRefreshToken(userId, role, deviceName) {
  const token = crypto.randomBytes(40).toString('hex'); // 80 hex अक्षर — पूरी तरह असंभावित (unguessable)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO refresh_tokens (token_hash, user_id, role, device_name, expires_at) VALUES ($1,$2,$3,$4,$5)',
    [hashToken(token), String(userId), role, deviceName ? String(deviceName).slice(0, 200) : null, expiresAt]
  );
  return token;
}

// token मान्य हो तो { userId, role } लौटाता है, साथ ही turant एक नया refresh
// token भी बना देता है (rotation) — पुराना revoke हो जाता है। अमान्य/समाप्त/
// पहले से revoked token पर null लौटाता है।
//
// 🆕 rotation पर device_name आगे बढ़ता है (नया token उसी डिवाइस का माना जाता है) —
// साथ ही last_used_at अभी के समय पर अपडेट होता है, ताकि "आख़िरी बार कब इस्तेमाल
// हुआ" सही दिखे (सिर्फ़ बनने का समय नहीं)।
async function verifyAndRotateRefreshToken(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);

  // 🐛 बग फ़िक्स (race condition): पहले यहाँ पहले SELECT होता, फिर अलग से UPDATE।
  // दो अनुरोध बिल्कुल एक साथ आएं (मोबाइल ऐप में यह आम है — access token की अवधि
  // ख़त्म होते ही दो स्क्रीन एक साथ API कॉल कर देती हैं, दोनों वही refresh token
  // भेजती हैं), तो दोनों को पंक्ति "बिना-revoke" मिलती और दोनों सफल हो जाते —
  // यानी एक token से दो अलग-अलग वैध शृंखलाएं बन जातीं।
  //
  // अब जाँच और revoke एक ही atomic UPDATE में है: जो अनुरोध पहले पहुँचता है वही
  // पंक्ति पाता है, दूसरे को कुछ नहीं मिलता।
  const claimed = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id, user_id, role, device_name`,
    [tokenHash]
  );

  if (claimed.rows.length === 0) {
    // 🔒 सुरक्षा फ़िक्स (चोरी हुए token का पता लगाना): "पहले से revoke हो चुका token
    // दोबारा पेश होना" सामान्य घटना नहीं है — असली डिवाइस उसे बदल चुका होता है,
    // इसलिए दोबारा भेजने वाले के पास उसकी चोरी हुई नक़ल ही हो सकती है। ऐसे में यह
    // तय करना असंभव है कि अभी कौन-सा token किसके पास है, इसलिए मानक प्रतिक्रिया है:
    // उस उपयोगकर्ता के *सारे* सत्र रद्द कर दो।
    const reused = await db.query(
      `SELECT user_id, role, revoked_at,
              EXTRACT(EPOCH FROM (now() - revoked_at)) AS revoked_secs_ago
       FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NOT NULL`,
      [tokenHash]
    );
    if (reused.rows.length > 0) {
      const { user_id, role, revoked_secs_ago } = reused.rows[0];

      // 🐛 बग फ़िक्स (झूठा अलार्म): ऊपर वाली race की वजह से यह सुरक्षा-जाँच बिल्कुल
      // सामान्य इस्तेमाल पर भी चल पड़ती थी। दो एक-साथ के अनुरोधों में जो हारता है,
      // वह अभी-अभी revoke हुआ token लेकर आता है — और तब यह जाँच उसे "चोरी" मानकर
      // उपयोगकर्ता के सारे सत्र रद्द कर देती। नतीजा: महिला ने ऐप खोला, दो स्क्रीन
      // एक साथ लोड हुईं, और वह बिना किसी कारण लॉगआउट हो गई — एक सुरक्षा-ऐप में यह
      // ठीक उस वक़्त हो सकता है जब उसे सबसे ज़्यादा ज़रूरत हो।
      //
      // इसलिए एक छोटी छूट-अवधि: कुछ ही सेकंड पहले revoke हुआ token race का नतीजा
      // माना जाता है (क्लाइंट अपने-आप दोबारा कोशिश कर लेगा), असली हमला नहीं।
      // उससे पुराना token दोबारा आना अब भी वैसा ही गंभीर माना जाता है।
      const RACE_GRACE_SECONDS = 15;
      if (Number(revoked_secs_ago) > RACE_GRACE_SECONDS) {
        await revokeAllForUser(user_id, role);
        console.error(
          `🔴 सुरक्षा चेतावनी: पहले से रद्द किया गया refresh token दोबारा इस्तेमाल हुआ ` +
          `(role=${role}, user=${user_id}, ${Math.round(revoked_secs_ago)}s पुराना) — ` +
          `उस उपयोगकर्ता के सभी सत्र एहतियातन रद्द कर दिए गए।`
        );
      }
    }
    return null;
  }

  const row = claimed.rows[0];
  const newRefreshToken = await createRefreshToken(row.user_id, row.role, row.device_name);
  return { userId: row.user_id, role: row.role, newRefreshToken };
}

// लॉगआउट पर — यही एक refresh token हमेशा के लिए बेकार कर देता है
async function revokeRefreshToken(token) {
  if (!token) return;
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [hashToken(token)]);
}

// 🆕 "सभी डिवाइस से लॉगआउट करें" — फ़ोन चोरी होने या खाता compromise होने के शक़
// की स्थिति में, उस उपयोगकर्ता के सभी सक्रिय refresh tokens (सभी डिवाइस) एक साथ
// बेकार कर देता है। पहले सिर्फ़ एक-समय-में-एक-डिवाइस को logout करने का ही रास्ता
// था — दूसरे (शायद चोरी हुए) डिवाइस पर सत्र चलता रहता।
async function revokeAllForUser(userId, role) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND role = $2 AND revoked_at IS NULL', [
    String(userId),
    role,
  ]);
}

// 🆕 "किन-किन डिवाइस में लॉगिन है" — सभी सक्रिय (revoke न हुए, expire न हुए) सत्र।
// असली token/hash कभी नहीं लौटाया जाता — सिर्फ़ id (revoke करने के लिए), डिवाइस-नाम,
// व समय। यह id refresh_tokens.id है (JWT/असली token नहीं), इसलिए यह किसी काम का
// "गुप्त" डेटा लीक नहीं करता।
async function listActiveSessions(userId, role) {
  const result = await db.query(
    `SELECT id, device_name, created_at, last_used_at
     FROM refresh_tokens
     WHERE user_id = $1 AND role = $2 AND revoked_at IS NULL AND expires_at > now()
     ORDER BY last_used_at DESC`,
    [String(userId), role]
  );
  return result.rows;
}

// 🆕 एक ख़ास सत्र (डिवाइस) को अकेले लॉगआउट करना — "सभी से" नहीं, सिर्फ़ चुना हुआ एक।
// अपने ही खाते का सत्र हो, यह सुनिश्चित करने के लिए user_id/role भी जांचते हैं —
// warna कोई user किसी और का session-id अंदाज़ा लगाकर revoke नहीं कर पाएगा।
async function revokeSessionById(sessionId, userId, role) {
  const result = await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND role = $3 AND revoked_at IS NULL RETURNING id',
    [sessionId, String(userId), role]
  );
  return result.rows.length > 0;
}

module.exports = {
  createRefreshToken,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  listActiveSessions,
  revokeSessionById,
};
