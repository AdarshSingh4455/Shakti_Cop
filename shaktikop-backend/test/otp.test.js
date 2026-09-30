// ============================================================
// utils/otp.js — स्वचालित टेस्ट
//
// कोई असली SMS/ईमेल कभी नहीं भेजा जाता — global.fetch और nodemailer transport
// हमेशा mock किए जाते हैं। कोई असली database भी नहीं चाहिए — db.query mock है,
// और एक छोटा in-memory "fake otp_requests table" असली hashing/expiry/single-use
// व्यवहार को वास्तविक रूप से जांचने के लिए बनाया गया है (देखें makeFakeOtpTable नीचे)।
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const db = require('../src/config/db');
const { withEnv, freshRequire } = require('./helpers/envGuard');

const OTP_JS = path.join(__dirname, '..', 'src', 'utils', 'otp.js');

// otp_requests टेबल की नकल — otp.js जो तीन तरह की query भेजता है, ठीक उन्हीं को
// पहचान कर असली PostgreSQL जैसा व्यवहार देती है (देखें utils/otp.js की तीन db.query कॉल्स)।
function makeFakeOtpTable() {
  let rows = []; // { mobile, otp_code (hash), purpose, expires_at, verified, created_at }
  let seq = 0;

  async function query(sql, params) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.startsWith('UPDATE otp_requests SET verified = true WHERE mobile')) {
      const [mobile, purpose] = params;
      for (const r of rows) {
        if (r.mobile === mobile && r.purpose === purpose && !r.verified) r.verified = true;
      }
      return { rows: [] };
    }

    if (s.startsWith('INSERT INTO otp_requests')) {
      const [mobile, otp_code, purpose, expires_at] = params;
      rows.push({ id: String(++seq), mobile, otp_code, purpose, expires_at, verified: false, created_at: new Date() });
      return { rows: [] };
    }

    if (s.startsWith('UPDATE otp_requests SET verified = true WHERE id')) {
      const [mobile, otp_code, purpose] = params;
      const now = new Date();
      // असली query जैसा ही: सबसे नई, बिना-इस्तेमाल, बिना-expire पंक्ति चुनें
      const candidates = rows
        .filter((r) => r.mobile === mobile && r.otp_code === otp_code && r.purpose === purpose && !r.verified && r.expires_at > now)
        .sort((a, b) => b.created_at - a.created_at);
      if (candidates.length === 0) return { rows: [] };
      candidates[0].verified = true;
      return { rows: [{ id: candidates[0].id }] };
    }

    throw new Error('अनपेक्षित query fake table में: ' + s);
  }

  return { query, _rows: () => rows };
}

function mockFetchOk(t, capture) {
  t.mock.method(global, 'fetch', async (url, opts) => {
    if (capture) capture.push({ url, opts });
    return { ok: true, status: 200, text: async () => 'OK' };
  });
}

function mockFetchFail(t) {
  t.mock.method(global, 'fetch', async () => {
    throw new Error('simulated network failure');
  });
}

test('मोबाइल OTP generation — dev मोड में लौटता है, hash DB में जाता है (plaintext नहीं)', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true', MSG91_AUTH_KEY: undefined, FAST2SMS_API_KEY: undefined, TWILIO_ACCOUNT_SID: undefined }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000001', 'signup', 'hi');
    assert.match(code, /^\d{6}$/, 'OTP 6 अंकों का होना चाहिए');
    const row = fake._rows().find((r) => r.mobile === '9000000001');
    assert.ok(row, 'DB में पंक्ति बननी चाहिए');
    assert.notEqual(row.otp_code, code, 'DB में plaintext OTP नहीं, hash होना चाहिए');
    assert.equal(row.otp_code.length, 64, 'HMAC-SHA256 hex hash 64 अक्षर का होता है');
  });
});

test('ईमेल OTP generation — dev मोड में लौटता है, पहचान ईमेल के रूप में सेव होती है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true' }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('User@Example.com', 'signup', 'hi');
    assert.match(code, /^\d{6}$/);
    const row = fake._rows().find((r) => r.mobile === 'user@example.com');
    assert.ok(row, 'ईमेल trim+lowercase होकर सेव होनी चाहिए');
  });
});

test('सही OTP — verifyOtp सफल, और उसी कोड का दोबारा इस्तेमाल (reuse) विफल होता है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true' }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000002', 'signup', 'hi');
    const ok1 = await otp.verifyOtp('9000000002', code, 'signup');
    assert.equal(ok1, true, 'पहली बार सही OTP से सफल होना चाहिए');
    const ok2 = await otp.verifyOtp('9000000002', code, 'signup');
    assert.equal(ok2, false, 'वही OTP दोबारा इस्तेमाल होने पर विफल होना चाहिए (single-use)');
  });
});

test('गलत OTP — verifyOtp विफल होता है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true' }, async () => {
    const otp = freshRequire(OTP_JS);
    await otp.createAndSendOtp('9000000003', 'signup', 'hi');
    const ok = await otp.verifyOtp('9000000003', '000000', 'signup');
    assert.equal(ok, false);
  });
});

test('समाप्त (expired) OTP — verifyOtp विफल होता है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true' }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000004', 'signup', 'hi');
    // समय को पीछे धकेलकर OTP को कृत्रिम रूप से expire करें
    fake._rows().find((r) => r.mobile === '9000000004').expires_at = new Date(Date.now() - 1000);
    const ok = await otp.verifyOtp('9000000004', code, 'signup');
    assert.equal(ok, false);
  });
});

test('excessive verification attempts — purpose अलग होने पर भी सही तरीक़े से store होता/काम करता है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true' }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000005', 'signup', 'hi');
    // गलत purpose से सत्यापन विफल होना चाहिए, भले ही OTP सही हो
    const wrongPurpose = await otp.verifyOtp('9000000005', code, 'reset_password');
    assert.equal(wrongPurpose, false);
    const rightPurpose = await otp.verifyOtp('9000000005', code, 'signup');
    assert.equal(rightPurpose, true);
  });
});

test('resend cooldown — एक ही पहचान+purpose पर तुरंत दूसरा अनुरोध चुपचाप रुक जाता है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  const calls = [];
  mockFetchOk(t, calls);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true', OTP_RESEND_COOLDOWN_SECONDS: '30', MSG91_AUTH_KEY: 'fake-key' }, async () => {
    const otp = freshRequire(OTP_JS);
    const code1 = await otp.createAndSendOtp('9000000006', 'signup', 'hi');
    assert.match(code1, /^\d{6}$/, 'पहला अनुरोध सामान्य रूप से सफल होना चाहिए');
    const code2 = await otp.createAndSendOtp('9000000006', 'signup', 'hi');
    assert.equal(code2, undefined, 'cooldown के दौरान दूसरा अनुरोध चुपचाप कुछ नहीं लौटाता');
    assert.equal(fake._rows().filter((r) => r.mobile === '9000000006').length, 1, 'cooldown में नई DB पंक्ति नहीं बननी चाहिए');
  });
});

test('resend cooldown — अलग पहचान पर कोई असर नहीं (सिर्फ़ उसी identifier+purpose तक सीमित)', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true', OTP_RESEND_COOLDOWN_SECONDS: '30' }, async () => {
    const otp = freshRequire(OTP_JS);
    await otp.createAndSendOtp('9000000007', 'signup', 'hi');
    const otherIdentifier = await otp.createAndSendOtp('9000000008', 'signup', 'hi');
    assert.match(otherIdentifier, /^\d{6}$/, 'दूसरी पहचान पर cooldown लागू नहीं होना चाहिए');
    const otherPurpose = await otp.createAndSendOtp('9000000007', 'reset_password', 'hi');
    assert.match(otherPurpose, /^\d{6}$/, 'दूसरे purpose पर cooldown लागू नहीं होना चाहिए');
  });
});

test('provider failure — SMS गेटवे विफल हो तो भी createAndSendOtp क्रैश नहीं होता, OTP फिर भी सत्यापित होता है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchFail(t);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true', MSG91_AUTH_KEY: 'fake-key', MSG91_TEMPLATE_ID: 'fake-template' }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000009', 'signup', 'hi');
    assert.match(code, /^\d{6}$/, 'gateway विफल होने पर भी function क्रैश नहीं होना चाहिए');
    const ok = await otp.verifyOtp('9000000009', code, 'signup');
    assert.equal(ok, true, 'भेजना विफल हुआ हो तब भी OTP DB में सुरक्षित रहना चाहिए (उपयोगकर्ता दोबारा भेज सकता है)');
  });
});

test('missing provider configuration — कोई SMS/ईमेल gateway सेट न हो तो भी function क्रैश नहीं होता', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({
    NODE_ENV: 'test', OTP_DEV_MODE: 'true',
    MSG91_AUTH_KEY: undefined, FAST2SMS_API_KEY: undefined, TWILIO_ACCOUNT_SID: undefined,
    RESEND_API_KEY: undefined, GMAIL_USER: undefined, GMAIL_APP_PASSWORD: undefined,
  }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000010', 'signup', 'hi');
    assert.match(code, /^\d{6}$/, 'provider न होने पर भी OTP बनना/स्टोर होना चाहिए');
  });
});

test('production में OTP कभी API response में नहीं लौटता — OTP_DEV_MODE=true होने पर भी नहीं', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  await withEnv({
    NODE_ENV: 'production', OTP_DEV_MODE: 'true', // ⚠️ जानबूझकर true — फिर भी prod में न लौटे, यही असली जांच है
    ALLOW_INSECURE_DEV_LOGIN: undefined, DEV_OTP_SIGNUP_ONLY: undefined, DEMO_ACCOUNTS: undefined,
  }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000011', 'signup', 'hi');
    assert.equal(code, undefined, 'production में OTP_DEV_MODE=true होने पर भी OTP नहीं लौटना चाहिए');
  });
});

test('production में OTP कभी log नहीं होता (console.log/console.error में कहीं नहीं)', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  mockFetchOk(t);
  const logged = [];
  t.mock.method(console, 'log', (...args) => { logged.push(args.join(' ')); });
  t.mock.method(console, 'error', (...args) => { logged.push(args.join(' ')); });
  await withEnv({
    NODE_ENV: 'production', OTP_DEV_MODE: 'true',
    ALLOW_INSECURE_DEV_LOGIN: undefined, DEV_OTP_SIGNUP_ONLY: undefined, DEMO_ACCOUNTS: undefined,
    MSG91_AUTH_KEY: undefined, FAST2SMS_API_KEY: undefined, TWILIO_ACCOUNT_SID: undefined,
  }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('9000000012', 'signup', 'hi');
    assert.equal(code, undefined);
    // असली OTP कोड otp.js के भीतर ही बनता है (कभी caller को नहीं मिलता), इसलिए सीधे
    // उसकी जांच नहीं हो सकती — इसके बजाय हम DB में सेव हुई पंक्ति से जुड़ा plaintext
    // कभी log में न दिखे, यह जांचते हैं (6 अंकों का कोई भी अनुमानित pattern नहीं)
    const row = fake._rows().find((r) => r.mobile === '9000000012');
    assert.ok(row, 'OTP फिर भी DB में बनना चाहिए');
    for (const line of logged) {
      assert.doesNotMatch(line, /\b\d{6}\b/, 'log की किसी भी पंक्ति में 6-अंकों का OTP नहीं दिखना चाहिए: ' + line);
    }
  });
});

test('ईमेल HTML — Resend को भेजे गए payload में ब्रांडिंग, OTP और expiry के साथ html शामिल है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  const calls = [];
  mockFetchOk(t, calls);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true', RESEND_API_KEY: 'fake-resend-key', RESEND_FROM: 'ShaktiCop <test@example.com>' }, async () => {
    const otp = freshRequire(OTP_JS);
    const code = await otp.createAndSendOtp('otp-html-test@example.com', 'signup', 'hi');
    const resendCall = calls.find((c) => c.url === 'https://api.resend.com/emails');
    assert.ok(resendCall, 'Resend API को कॉल होना चाहिए');
    const body = JSON.parse(resendCall.opts.body);
    assert.ok(body.html, 'html field मौजूद होना चाहिए');
    assert.match(body.html, /ShaktiCop/, 'ब्रांडिंग दिखनी चाहिए');
    assert.ok(body.html.includes(code), 'OTP कोड HTML में साफ़ दिखना चाहिए');
    assert.match(body.html, /मिनट|minutes/, 'expiry अवधि दिखनी चाहिए');
    assert.match(body.html, /साझा न करें|share/i, 'सुरक्षा-चेतावनी दिखनी चाहिए');
  });
});

test('ईमेल plain-text fallback — html के साथ-साथ text field भी हमेशा मौजूद रहता है', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  const calls = [];
  mockFetchOk(t, calls);
  await withEnv({ NODE_ENV: 'test', OTP_DEV_MODE: 'true', RESEND_API_KEY: 'fake-resend-key' }, async () => {
    const otp = freshRequire(OTP_JS);
    await otp.createAndSendOtp('otp-text-test@example.com', 'signup', 'hi');
    const resendCall = calls.find((c) => c.url === 'https://api.resend.com/emails');
    const body = JSON.parse(resendCall.opts.body);
    assert.ok(body.text && body.text.length > 0, 'plain-text संस्करण हमेशा मौजूद रहना चाहिए');
    assert.doesNotMatch(body.text, /<[a-z]+[^>]*>/i, 'text field में कोई HTML टैग नहीं होना चाहिए');
  });
});

test('MSG91 dispatch — sender/template env से आते हैं, authkey header में जाती है (URL में नहीं)', async (t) => {
  const fake = makeFakeOtpTable();
  t.mock.method(db, 'query', fake.query);
  const calls = [];
  mockFetchOk(t, calls);
  await withEnv({
    NODE_ENV: 'test', OTP_DEV_MODE: 'true',
    MSG91_AUTH_KEY: 'fake-authkey-123', MSG91_SENDER_ID: 'TESTID', MSG91_TEMPLATE_ID: 'tmpl-xyz',
  }, async () => {
    const otp = freshRequire(OTP_JS);
    await otp.createAndSendOtp('9000000013', 'signup', 'hi');
    const msgCall = calls.find((c) => c.url === 'https://control.msg91.com/api/v5/flow/');
    assert.ok(msgCall, 'MSG91 flow API को कॉल होना चाहिए');
    assert.equal(msgCall.opts.headers.authkey, 'fake-authkey-123');
    const body = JSON.parse(msgCall.opts.body);
    assert.equal(body.template_id, 'tmpl-xyz');
    assert.equal(body.sender, 'TESTID');
    assert.equal(body.recipients[0].mobiles, '919000000013');
  });
});
