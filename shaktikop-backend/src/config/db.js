const { Pool } = require('pg');

// 🔒 सुरक्षा सुधार: पहले SSL पूरी तरह DATABASE_URL स्ट्रिंग में मौजूद पैरामीटर पर निर्भर
// था — अगर वह कभी ग़लती से/किसी नए deployment में ?sslmode जोड़ना भूल जाए, तो कनेक्शन
// चुपचाप unencrypted हो सकता था (डेटा नेटवर्क पर बिना एन्क्रिप्शन के जाता)। अब production
// में स्पष्ट रूप से SSL अनिवार्य किया गया है (rejectUnauthorized: false — Railway/Heroku
// जैसी managed cloud Postgres सेवाएं अक्सर अपने खुद के प्रमाणपत्र इस्तेमाल करती हैं,
// जिन्हें सार्वजनिक CA मान्य नहीं कर पाता, पर कनेक्शन फिर भी एन्क्रिप्टेड रहता है)।
// 🐛 बग फ़िक्स (DoS-सख़्ती): पहले connection-pool की कोई स्पष्ट सीमा नहीं थी —
// डिफ़ॉल्ट व्यवहार पर निर्भर था, जिसमें कोई query-समय-सीमा और कोई
// pool-प्रतीक्षा-समय-सीमा नहीं होती। अगर कोई query अटक जाए (धीमा नेटवर्क, बहुत
// भारी aggregation, या adversarial इनपुट से महंगी हुई query), तो वह connection
// हमेशा के लिए घिरा रह सकता था — और चूंकि pool सीमित है, कुछ ऐसी अटकी हुई
// queries पूरे pool को खाली न होने देतीं, जिससे बाक़ी *सभी* नए अनुरोध हमेशा के
// लिए इंतज़ार में फंस जाते (न त्वरित त्रुटि, न आगे बढ़ना)। अब स्पष्ट सीमाएं:
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 🔒 सुरक्षा सुधार: rejectUnauthorized: false का मतलब है कि TLS प्रमाणपत्र जांचा
  // ही नहीं जाता — कनेक्शन encrypted तो रहता है, पर यह पक्का नहीं होता कि दूसरी तरफ़
  // असली डेटाबेस ही है। यानी man-in-the-middle हमले से बचाव नहीं। यह Railway जैसी
  // सेवाओं के लिए मजबूरी है (वे अपने प्रमाणपत्र इस्तेमाल करती हैं), पर जहाँ CA
  // प्रमाणपत्र उपलब्ध हो वहाँ पूरी जांच चालू होनी चाहिए — इसलिए अब यह विकल्प है:
  //   PGSSL_CA सेट करें (प्रमाणपत्र का PEM) → पूरी जांच के साथ TLS
  //   PGSSL_STRICT=true → बिना CA दिए भी सार्वजनिक CA से जांच
  //   कुछ न दें → पहले जैसा (encrypted, पर बिना जांच के) — Railway पर काम करता रहेगा
  ssl:
    process.env.NODE_ENV === 'production'
      ? process.env.PGSSL_CA
        ? { rejectUnauthorized: true, ca: process.env.PGSSL_CA }
        : { rejectUnauthorized: process.env.PGSSL_STRICT === 'true' }
      : undefined,
  max: 20, // एक साथ अधिकतम कितने connections — असीमित रूप से DB पर बोझ न डालें
  connectionTimeoutMillis: 10_000, // pool खाली न मिले तो 10 सेकंड में त्वरित त्रुटि, हमेशा इंतज़ार नहीं
  idleTimeoutMillis: 30_000, // बेकार पड़े connections 30 सेकंड बाद अपने-आप बंद हों (संसाधन बचाने के लिए)
  statement_timeout: 30_000, // कोई भी एक query 30 सेकंड से ज़्यादा न चले — अटकी/बहुत महंगी query अपने-आप रुक जाए
});

pool.on('error', (err) => {
  console.error('अप्रत्याशित डेटाबेस त्रुटि (idle client):', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
