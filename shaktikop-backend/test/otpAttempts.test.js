// ============================================================
// utils/otpAttempts.js — बार-बार गलत OTP कोशिशों पर रोक (brute-force सुरक्षा)
// REDIS_URL सेट न होने पर यह अपने-आप in-memory पर चलता है — कोई असली Redis नहीं चाहिए।
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');

const { checkOtpAttempts, recordOtpFailure, clearOtpAttempts, MAX_FAILED } = require('../src/utils/otpAttempts');

function fakeReq(identifier) {
  return { body: { mobile: identifier }, ip: '127.0.0.1' };
}

test('MAX_FAILED से कम कोशिशों पर रोक नहीं लगती', async () => {
  const req = fakeReq('9100000001');
  for (let i = 0; i < MAX_FAILED - 1; i++) {
    await recordOtpFailure(req, 'signup');
  }
  const gate = await checkOtpAttempts(req, 'signup');
  assert.equal(gate.ok, true);
});

test('excessive verification attempts — MAX_FAILED पार होते ही अस्थायी रोक लगती है', async () => {
  const req = fakeReq('9100000002');
  for (let i = 0; i < MAX_FAILED; i++) {
    await recordOtpFailure(req, 'signup');
  }
  const gate = await checkOtpAttempts(req, 'signup');
  assert.equal(gate.ok, false);
  assert.ok(gate.retryAfterSec > 0);
  assert.ok(gate.error);
});

test('सफल सत्यापन के बाद गिनती साफ़ हो जाती है', async () => {
  const req = fakeReq('9100000003');
  for (let i = 0; i < MAX_FAILED; i++) {
    await recordOtpFailure(req, 'signup');
  }
  let gate = await checkOtpAttempts(req, 'signup');
  assert.equal(gate.ok, false);

  await clearOtpAttempts(req, 'signup');
  gate = await checkOtpAttempts(req, 'signup');
  assert.equal(gate.ok, true, 'साफ़ करने के बाद रोक नहीं रहनी चाहिए');
});

test('अलग purpose की असफलताएँ आपस में नहीं मिलतीं (signup बनाम reset_password)', async () => {
  const req = fakeReq('9100000004');
  for (let i = 0; i < MAX_FAILED; i++) {
    await recordOtpFailure(req, 'signup');
  }
  const signupGate = await checkOtpAttempts(req, 'signup');
  const resetGate = await checkOtpAttempts(req, 'reset_password');
  assert.equal(signupGate.ok, false);
  assert.equal(resetGate.ok, true, 'reset_password की गिनती signup से अलग रहनी चाहिए');
});
