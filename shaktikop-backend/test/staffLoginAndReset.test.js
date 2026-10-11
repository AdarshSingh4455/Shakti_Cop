const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-secret-key-12345';

const db = require('../src/config/db');
const {
  staffLogin,
  officerLogin,
  adminLogin,
  forgotPasswordRequestOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
} = require('../src/controllers/authController');

function fakeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  return res;
}

test('Staff Login — missing identifier or password returns 400', async () => {
  const req = { body: {} };
  const res = fakeRes();
  await staffLogin(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /मोबाइल \/ ईमेल और पासवर्ड आवश्यक हैं/);
});

test('Staff Login — authenticates Officer by mobile number', async (t) => {
  const passwordHash = await bcrypt.hash('OffPass@12', 10);
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT * FROM officers')) {
      return {
        rows: [{
          id: 'officer-uuid-1',
          name: 'निरीक्षक रमेश कुमार',
          badge_id: 'PNO123456',
          mobile: '9876543210',
          email: 'ramesh@uppolice.gov.in',
          password_hash: passwordHash,
          station: 'हजरतगंज',
          district: 'लखनऊ',
          rank: 'SHO',
          duty_status: 'उपलब्ध',
          is_active: true,
        }],
      };
    }
    if (sql.includes('INSERT INTO refresh_tokens')) {
      return { rows: [{ id: 'ref-1' }] };
    }
    return { rows: [] };
  });

  const req = { body: { identifier: '9876543210', password: 'OffPass@12' } };
  const res = fakeRes();
  await staffLogin(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.role, 'officer');
  assert.equal(res.body.user.badgeId, 'PNO123456');
  assert.equal(res.body.user.mobile, '9876543210');
});

test('Staff Login — authenticates Officer by email address', async (t) => {
  const passwordHash = await bcrypt.hash('OffPass@12', 10);
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT * FROM officers')) {
      return {
        rows: [{
          id: 'officer-uuid-1',
          name: 'निरीक्षक रमेश कुमार',
          badge_id: 'PNO123456',
          mobile: '9876543210',
          email: 'ramesh@uppolice.gov.in',
          password_hash: passwordHash,
          station: 'हजरतगंज',
          district: 'लखनऊ',
          rank: 'SHO',
          duty_status: 'उपलब्ध',
          is_active: true,
        }],
      };
    }
    if (sql.includes('INSERT INTO refresh_tokens')) {
      return { rows: [{ id: 'ref-1' }] };
    }
    return { rows: [] };
  });

  const req = { body: { identifier: 'ramesh@uppolice.gov.in', password: 'OffPass@12' } };
  const res = fakeRes();
  await staffLogin(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.role, 'officer');
});

test('Staff Login — authenticates Admin by mobile number', async (t) => {
  const passwordHash = await bcrypt.hash('AdmPass@12', 10);
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT * FROM officers')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT * FROM admins')) {
      return {
        rows: [{
          id: 'admin-uuid-1',
          name: 'ज़िला व्यवस्थापक लखनऊ',
          username: 'admin_lucknow',
          email: 'admin.lucknow@uppolice.gov.in',
          mobile: '9450000500',
          password_hash: passwordHash,
          admin_role: 'district_admin',
          district: 'लखनऊ',
          rank: 'SSP',
          is_active: true,
        }],
      };
    }
    if (sql.includes('INSERT INTO refresh_tokens')) {
      return { rows: [{ id: 'ref-1' }] };
    }
    return { rows: [] };
  });

  const req = { body: { identifier: '9450000500', password: 'AdmPass@12' } };
  const res = fakeRes();
  await staffLogin(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.adminRole, 'district_admin');
  assert.equal(res.body.user.mobile, '9450000500');
});

test('Staff Login — rejects incorrect password with 401', async (t) => {
  const passwordHash = await bcrypt.hash('AdmPass@12', 10);
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT * FROM officers')) return { rows: [] };
    if (sql.includes('SELECT * FROM admins')) {
      return {
        rows: [{
          id: 'admin-1',
          name: 'Admin',
          password_hash: passwordHash,
          is_active: true,
        }],
      };
    }
    return { rows: [] };
  });

  const req = { body: { identifier: '9450000500', password: 'WrongPassword@999' } };
  const res = fakeRes();
  await staffLogin(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /मोबाइल \/ ईमेल या पासवर्ड गलत है/);
});

test('Forgot Password Request OTP — validates 10-digit mobile number', async () => {
  const req = { body: { mobile: '123' } };
  const res = fakeRes();
  await forgotPasswordRequestOtp(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /कृपया मान्य 10 अंकों का मोबाइल नंबर दें/);
});

test('Forgot Password Verify OTP — requires valid 10-digit mobile and OTP', async () => {
  const req = { body: { mobile: '9876543210' } }; // missing OTP
  const res = fakeRes();
  await forgotPasswordVerifyOtp(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /OTP आवश्यक है/);
});

test('Forgot Password Reset — enforces server-side resetToken binding', async (t) => {
  // First verify OTP to generate a valid resetToken
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('UPDATE otp_requests SET verified = true')) {
      return { rows: [{ id: 'otp-id-1' }] };
    }
    return { rows: [] };
  });

  const verifyReq = { body: { mobile: '9876543210', otp: '123456' } };
  const verifyRes = fakeRes();
  await forgotPasswordVerifyOtp(verifyReq, verifyRes);

  assert.equal(verifyRes.statusCode, 200);
  assert.ok(verifyRes.body.resetToken);
  const resetToken = verifyRes.body.resetToken;

  // Now attempt to reset with mismatched mobile (newPassword valid 8-16 chars: 'NewPass@12')
  const badReq = { body: { mobile: '9999999999', resetToken, newPassword: 'NewPass@12' } };
  const badRes = fakeRes();
  await forgotPasswordReset(badReq, badRes);
  assert.equal(badRes.statusCode, 401);
  assert.match(badRes.body.error, /सत्र अमान्य या समाप्त/);

  // Now reset with correct mobile and token
  let updatedTable = null;
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('UPDATE officers SET password_hash')) {
      updatedTable = 'officers';
      return { rows: [{ id: 'off-1' }] };
    }
    if (sql.includes('DELETE FROM refresh_tokens')) {
      return { rows: [] };
    }
    return { rows: [] };
  });

  const goodReq = { body: { mobile: '9876543210', resetToken, newPassword: 'NewPass@12' } };
  const goodRes = fakeRes();
  await forgotPasswordReset(goodReq, goodRes);

  assert.equal(goodRes.statusCode, 200);
  assert.match(goodRes.body.message, /पासवर्ड सफलतापूर्वक बदल दिया गया है/);
  assert.equal(updatedTable, 'officers');
});

test('Forgot Password Reset — enforces password length validation', async () => {
  const req = { body: { mobile: '9876543210', resetToken: 'fake.token', newPassword: '123' } };
  const res = fakeRes();
  await forgotPasswordReset(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /पासवर्ड कम से कम 8 अक्षर का होना चाहिए/);
});
