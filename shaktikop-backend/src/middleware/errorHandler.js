const { captureException } = require('../utils/sentry');

function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === '23505') {
    return res.status(409).json({ error: 'यह जानकारी पहले से मौजूद है (डुप्लीकेट एंट्री)' });
  }
  if (err.code === '22P02' || err.code === '23503') {
    return res.status(400).json({ error: 'भेजा गया डेटा अमान्य है' });
  }
  const status = err.status || 500;
  // 🐛 बग फ़िक्स: पहले सिर्फ़ console.error होता था — यह सर्वर पर ही रहकर खो जाता।
  // अब असली/अनपेक्षित (500) त्रुटियां Sentry को भी भेजी जाती हैं — 4xx (जानबूझकर
  // भेजे गए validation त्रुटि जैसे) रिपोर्ट नहीं होतीं, वे सामान्य/अपेक्षित हैं।
  if (status >= 500) captureException(err, { path: req.path, method: req.method });
  // 🔒 सुरक्षा: 500 (अनपेक्षित/internal) त्रुटियों का असली संदेश क्लाइंट को नहीं भेजते —
  // इसमें DB स्ट्रक्चर, फ़ाइल पथ, या internal लॉजिक की जानकारी हो सकती है, जो हमलावर
  // के लिए उपयोगी हो सकती है। पूरी जानकारी सिर्फ़ सर्वर लॉग (ऊपर console.error) में जाती है।
  // 4xx (जानबूझकर भेजे गए, जैसे validation) संदेश असल में उपयोगकर्ता के लिए ही होते हैं,
  // इसलिए वही जस के तस रहते हैं।
  const message = status >= 500 ? 'सर्वर में कोई त्रुटि हुई — कृपया कुछ देर बाद कोशिश करें' : (err.message || 'सर्वर में कोई त्रुटि हुई');
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
