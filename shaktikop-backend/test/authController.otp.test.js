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

const { signupVerify, staffVerifyOtp } = require('../src/controllers/authController');

test('signupRequestOtp — SMS gateway unconfigured होने पर 503 लौटता है (false success नहीं)', async (t) => {
  const origKey = process.env.MSG91_AUTH_KEY;
  const origF2s = process.env.FAST2SMS_API_KEY;
  const origTwilio = process.env.TWILIO_ACCOUNT_SID;
  delete process.env.MSG91_AUTH_KEY;
  delete process.env.FAST2SMS_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;

  t.mock.method(db, 'query', async (sql) => {
    // citizens check -> empty
    if (sql.includes('FROM citizens')) return { rows: [] };
    // otp_requests insert or update
    return { rows: [{ id: 'otp-id-1' }] };
  });

  try {
    const req = { body: { mobile: '9000000097' }, ip: '127.0.0.1' };
    const res = fakeRes();
    await signupRequestOtp(req, res);

    assert.equal(res.statusCode, 503, 'बिना SMS गेटवे के 503 मिलना चाहिए');
    assert.equal(res.body.code, 'SMS_GATEWAY_NOT_CONFIGURED');
  } finally {
    if (origKey) process.env.MSG91_AUTH_KEY = origKey;
    if (origF2s) process.env.FAST2SMS_API_KEY = origF2s;
    if (origTwilio) process.env.TWILIO_ACCOUNT_SID = origTwilio;
  }
});

test('signupVerify — MSG91 access token मान्य होने पर 201 खाता बनता है', async (t) => {
  const origKey = process.env.MSG91_AUTH_KEY;
  const origJwt = process.env.JWT_SECRET;
  process.env.MSG91_AUTH_KEY = 'mock_auth_key';
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_12345';

  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ type: 'success', message: '919876543210' }),
  }));

  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('INSERT INTO citizens')) {
      return {
        rows: [{
          id: 'citizen-new-id',
          name: 'सीता देवी',
          mobile: '9876543210',
          father_name: null,
          address: null,
          email: null,
          created_at: new Date(),
        }],
      };
    }
    if (sql.includes('INSERT INTO refresh_tokens')) {
      return { rows: [{ id: 'token-id' }] };
    }
    return { rows: [] };
  });

  try {
    const req = {
      body: {
        mobile: '9876543210',
        name: 'सीता देवी',
        password: 'Password@123',
        msg91AccessToken: 'valid_mock_token',
      },
      ip: '127.0.0.1',
    };
    const res = fakeRes();
    await signupVerify(req, res);

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.token, 'JWT token मिलना चाहिए');
    assert.equal(res.body.user.mobile, '9876543210');
  } finally {
    if (origKey) process.env.MSG91_AUTH_KEY = origKey;
    else delete process.env.MSG91_AUTH_KEY;
    if (origJwt) process.env.JWT_SECRET = origJwt;
    else delete process.env.JWT_SECRET;
  }
});

test('signupVerify — MSG91 access token का मोबाइल नंबर मेल न खाने पर 401 अस्वीकृत होता है (phone binding check)', async (t) => {
  const origKey = process.env.MSG91_AUTH_KEY;
  process.env.MSG91_AUTH_KEY = 'mock_auth_key';

  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ type: 'success', message: '919876543210' }), // token belongs to 9876543210
  }));

  try {
    const req = {
      body: {
        mobile: '9876543299', // request body has different mobile
        name: 'सीता देवी',
        password: 'Password@123',
        msg91AccessToken: 'valid_token_wrong_phone',
      },
      ip: '127.0.0.1',
    };
    const res = fakeRes();
    await signupVerify(req, res);

    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /मोबाइल नंबर मेल नहीं खाता/);
  } finally {
    if (origKey) process.env.MSG91_AUTH_KEY = origKey;
    else delete process.env.MSG91_AUTH_KEY;
  }
});

test('signupVerify — MSG91 access token अमान्य होने पर 401 अस्वीकृत होता है', async (t) => {
  const origKey = process.env.MSG91_AUTH_KEY;
  process.env.MSG91_AUTH_KEY = 'mock_auth_key';

  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ type: 'error', message: 'Invalid or expired token', code: 201 }),
  }));

  try {
    const req = {
      body: {
        mobile: '9876543210',
        name: 'सीता देवी',
        password: 'Password@123',
        msg91AccessToken: 'expired_or_invalid_token',
      },
      ip: '127.0.0.1',
    };
    const res = fakeRes();
    await signupVerify(req, res);

    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /टोकन अमान्य या समाप्त/);
  } finally {
    if (origKey) process.env.MSG91_AUTH_KEY = origKey;
    else delete process.env.MSG91_AUTH_KEY;
  }
});

test('staffVerifyOtp — MSG91 token मान्य होने पर अधिकारी का लॉगिन 200 होता है', async (t) => {
  const origKey = process.env.MSG91_AUTH_KEY;
  const origJwt = process.env.JWT_SECRET;
  process.env.MSG91_AUTH_KEY = 'mock_auth_key';
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing_12345';

  t.mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ type: 'success', message: '919876543210' }),
  }));

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM officers')) {
      return {
        rows: [{
          id: 'off-1',
          name: 'इंस्पेक्टर राजेश',
          badge_id: 'UPP-1234',
          mobile: '9876543210',
          email: 'rajesh@uppolice.gov.in',
          station: 'हज़रतगंज',
          district: 'लखनऊ',
          duty_status: 'on_duty',
          permissions: [],
          rank: 'Inspector',
          designation: 'SHO',
          is_active: true,
        }],
      };
    }
    if (sql.includes('INSERT INTO refresh_tokens')) {
      return { rows: [{ id: 'tok-1' }] };
    }
    return { rows: [] };
  });

  try {
    const req = {
      body: {
        identifier: '9876543210',
        msg91AccessToken: 'valid_staff_token',
      },
      ip: '127.0.0.1',
    };
    const res = fakeRes();
    await staffVerifyOtp(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'officer');
    assert.equal(res.body.user.mobile, '9876543210');
  } finally {
    if (origKey) process.env.MSG91_AUTH_KEY = origKey;
    else delete process.env.MSG91_AUTH_KEY;
    if (origJwt) process.env.JWT_SECRET = origJwt;
    else delete process.env.JWT_SECRET;
  }
});
