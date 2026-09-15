const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
// 🆕 पहले access token सीधे 7 दिन तक वैध रहता था — चोरी होने पर हमलावर के पास
// एक पूरा हफ़्ता होता। अब refresh token अलग से मौजूद है (देखें refreshToken.js),
// इसलिए access token छोटी अवधि का रखा जा सकता है — चोरी होने पर नुक़सान की
// खिड़की बहुत छोटी है। ऐप background में चुपचाप /auth/refresh बुलाकर नया access
// token ले लेता है, उपयोगकर्ता को दोबारा लॉगिन नहीं करना पड़ता।
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const ALGORITHM = 'HS256';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN, algorithm: ALGORITHM });
}

function verifyToken(token) {
  // 🔒 algorithm explicitly pin करना ज़रूरी है — इसके बिना jwt.verify टोकन के अपने
  // header में लिखे algorithm पर भरोसा कर सकता है, जिससे "algorithm confusion" हमला
  // संभव हो सकता है (जैसे कोई token alg बदलकर भेजे)। सिर्फ़ HS256 ही स्वीकार करें।
  return jwt.verify(token, SECRET, { algorithms: [ALGORITHM] });
}

module.exports = { signToken, verifyToken };
