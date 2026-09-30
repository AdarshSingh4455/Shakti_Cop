// ============================================================
// controllers/authController.js — OTP-request endpoints की validation जांच
// (invalid mobile / invalid email) — कोई असली DB या provider नहीं चाहिए।
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const { signupRequestOtp } = require('../src/controllers/authController');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  return res;
}

test('invalid mobile — signupRequestOtp 400 लौटाता है, DB तक नहीं पहुंचता', async (t) => {
  let dbCalled = false;
  t.mock.method(db, 'query', async () => { dbCalled = true; return { rows: [] }; });

  const req = { body: { mobile: '12345' } }; // सिर्फ़ 5 अंक — अमान्य
  const res = fakeRes();
  await signupRequestOtp(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
  assert.equal(dbCalled, false, 'अमान्य मोबाइल पर DB query होनी ही नहीं चाहिए');
});

test('invalid email — valid मोबाइल पर भी ग़लत email-फ़ॉर्मेट से 400 मिलता है', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    // सिर्फ़ 'citizens WHERE mobile' वाली जाँच — कोई मौजूदा खाता नहीं
    return { rows: [] };
  });

  const req = { body: { mobile: '9000000099', email: 'not-an-email' } };
  const res = fakeRes();
  await signupRequestOtp(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /ईमेल/);
});

test('valid मोबाइल, पहले से मौजूद खाता — 409 लौटता है (enumeration यहाँ जान-बूझकर लागू)', async (t) => {
  t.mock.method(db, 'query', async () => ({ rows: [{ id: 'existing-id' }] }));

  const req = { body: { mobile: '9000000098' } };
  const res = fakeRes();
  await signupRequestOtp(req, res);

  assert.equal(res.statusCode, 409);
});
