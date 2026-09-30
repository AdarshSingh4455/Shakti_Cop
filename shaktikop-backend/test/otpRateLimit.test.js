// ============================================================
// request rate limit — असली express-rate-limit लाइब्रेरी को, उन्हीं पैरामीटर्स के
// साथ जो app.js में otpLimiter के लिए इस्तेमाल होते हैं (windowMs: 10 मिनट, max: 5,
// IP+पहचान keyGenerator), एक अलग छोटे Express app पर जांचते हैं।
//
// पूरा app.js सीधे require करना जानबूझकर टाला गया — वह कई नियंत्रक/utility ज़ंजीर में
// लोड करता है (जिनमें से कुछ module-load पर async काम शुरू करते हैं) और टेस्ट में
// अटक सकता है। यहाँ सिर्फ़ वही rate-limit config दोहराई गई है जो production में
// असल में rateLimit() को दी जाती है — express-rate-limit की अपनी logic में कोई
// बदलाव या नकल नहीं है, वह लाइब्रेरी वास्तव में यहाँ चल रही है।
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const rateLimit = require('express-rate-limit');

function startTestServer() {
  const app = express();
  app.use(express.json());
  // app.js के otpLimiter जैसी ही configuration (windowMs/max), सिर्फ़ छोटी विंडो
  // ताकि टेस्ट तुरंत पूरा हो — असली मूल्य नहीं, सिर्फ़ व्यवहार जांचना है
  const limiter = rateLimit({
    windowMs: 5000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}:${String(req.body?.mobile || '').trim().toLowerCase()}`,
    message: { error: 'बहुत ज़्यादा requests' },
  });
  app.use('/auth/citizen/signup/request-otp', limiter);
  app.post('/auth/citizen/signup/request-otp', (req, res) => res.json({ message: 'OTP भेज दिया गया है' }));

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('request rate limit — max से ज़्यादा अनुरोध 429 पाते हैं, उसके नीचे सामान्य रहते हैं', async (t) => {
  const server = await startTestServer();
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const res = await fetch(`${base}/auth/citizen/signup/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9200000001' }),
    });
    statuses.push(res.status);
  }

  assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200], 'पहले 5 अनुरोध सामान्य रहने चाहिए (max: 5)');
  assert.equal(statuses[5], 429, '6वाँ अनुरोध रोका जाना चाहिए');
});

test('request rate limit — अलग पहचान (मोबाइल) की अपनी अलग गिनती होती है', async (t) => {
  const server = await startTestServer();
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;

  for (let i = 0; i < 5; i++) {
    await fetch(`${base}/auth/citizen/signup/request-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9200000002' }),
    });
  }
  // एक अलग मोबाइल नंबर — उसी IP से, पर अलग पहचान इसलिए अपनी अलग सीमा
  const res = await fetch(`${base}/auth/citizen/signup/request-otp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: '9200000003' }),
  });
  assert.equal(res.status, 200, 'अलग मोबाइल नंबर की अपनी सीमा होनी चाहिए, पहले वाले से बंधी नहीं');
});
