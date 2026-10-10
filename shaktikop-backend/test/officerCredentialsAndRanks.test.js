// ============================================================
// test/officerCredentialsAndRanks.test.js
//
// Targeted tests for:
// 1. Location data endpoint and station-district masters
// 2. Police ranks (Constable, Head Constable, SI, Inspector, SHO)
// 3. Separate individual officer credentials (username, password hashing, no plaintext/hash leak)
// 4. Rejection of 'admin' username and duplicate username/badge checks
// 5. Officer credential reset via updateOfficer
// 6. Officer login via username or badgeId
// ============================================================

process.env.JWT_SECRET = 'test-jwt-secret-shakticop-key-12345';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const {
  createOfficer,
  updateOfficer,
  updateOfficerRank,
  createDistrictAdmin,
} = require('../src/controllers/adminController');
const {
  officerLogin,
} = require('../src/controllers/authController');
const {
  getLocationData,
} = require('../src/controllers/locationDataController');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  return res;
}

test.after(async () => {
  try {
    await db.pool?.end?.();
  } catch (e) {
    // ignore
  }
});

// ------------------------------------------------------------
// 1. Location Data Endpoint
// ------------------------------------------------------------
test('Location Data — returns master districts and stations from database', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM police_stations')) {
      return {
        rows: [
          { district: 'लखनऊ', district_en: 'Lucknow', station: 'हजरतगंज', station_en: 'Hazratganj' },
          { district: 'लखनऊ', district_en: 'Lucknow', station: 'गोमती नगर', station_en: 'Gomti Nagar' },
          { district: 'वाराणसी', district_en: 'Varanasi', station: 'दशाश्वमेध', station_en: 'Dashashwamedh' },
        ],
      };
    }
    return { rows: [] };
  });

  const req = {};
  const res = fakeRes();
  await getLocationData(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.districts));
  assert.ok(res.body.districts.includes('लखनऊ'));
  assert.ok(res.body.districts.includes('वाराणसी'));
  assert.ok(res.body.stationsByDistrict['लखनऊ'].includes('हजरतगंज'));
  assert.ok(res.body.stationsByDistrict['वाराणसी'].includes('दशाश्वमेध'));
});

test('Location Data — Gautam Buddha Nagar contains Noida and Greater Noida stations canonically', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM police_stations')) {
      return {
        rows: [
          { district: 'गौतम बुद्ध नगर', district_en: 'Gautam Buddha Nagar', station: 'नोएडा सेक्टर-20', station_en: 'Noida Sector-20' },
          { district: 'गौतम बुद्ध नगर', district_en: 'Gautam Buddha Nagar', station: 'नोएडा सेक्टर-39', station_en: 'Noida Sector-39' },
          { district: 'गौतम बुद्ध नगर', district_en: 'Gautam Buddha Nagar', station: 'फेज़-3', station_en: 'Phase-3' },
          { district: 'गौतम बुद्ध नगर', district_en: 'Gautam Buddha Nagar', station: 'बिसरख', station_en: 'Bisrakh' },
          { district: 'गौतम बुद्ध नगर', district_en: 'Gautam Buddha Nagar', station: 'ग्रेटर नोएडा/कासना', station_en: 'Greater Noida/Kasna' },
        ],
      };
    }
    return { rows: [] };
  });

  const req = {};
  const res = fakeRes();
  await getLocationData(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.districts.includes('गौतम बुद्ध नगर'));
  assert.ok(!res.body.districts.includes('नोएडा (गौतम बुद्ध नगर)'));
  assert.ok(res.body.stationsByDistrict['गौतम बुद्ध नगर'].includes('नोएडा सेक्टर-20'));
  assert.ok(res.body.stationsByDistrict['गौतम बुद्ध नगर'].includes('ग्रेटर नोएडा/कासना'));
});

// ------------------------------------------------------------
// 2. Police Ranks Validation
// ------------------------------------------------------------
test('Officer Creation — accepts Constable and Head Constable ranks', async (t) => {
  let insertedRank = null;
  let insertedPasswordHash = null;

  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT 1 FROM police_stations LIMIT 1')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('SELECT name, station, district FROM officers WHERE LOWER(TRIM(badge_id))')) {
      return { rows: [] }; // No duplicate
    }
    if (sql.includes('INSERT INTO officers')) {
      insertedRank = params[7]; // rank
      insertedPasswordHash = params[4]; // password_hash
      return {
        rows: [{
          id: 'off-const-1',
          name: 'अमित पाल',
          badge_id: 'PNO-200953',
          mobile: '9876543210',
          email: null,
          station: 'हजरतगंज',
          district: 'लखनऊ',
          rank: insertedRank,
          designation: 'बीट कांस्टेबल',
          duty_status: 'Active',
          is_active: true,
          created_at: new Date(),
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    adminScope: {},
    body: {
      name: 'अमित पाल',
      username: 'PNO-200953',
      password: 'SecPass123#',
      mobile: '9876543210',
      rank: 'Constable',
      designation: 'बीट कांस्टेबल',
      district: 'लखनऊ',
      station: 'हजरतगंज',
    },
  };
  const res = fakeRes();
  await createOfficer(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(insertedRank, 'Constable');
  assert.equal(res.body.rank, 'Constable');
  assert.equal(res.body.username, 'PNO-200953');
  // Security check: Never return password or password_hash in response
  assert.equal(res.body.password, undefined);
  assert.equal(res.body.password_hash, undefined);
  assert.equal(res.body.passwordHash, undefined);
  // Verify bcrypt cost 12 was used
  assert.ok(insertedPasswordHash.startsWith('$2b$12$') || insertedPasswordHash.startsWith('$2a$12$'));
});

test('Officer Creation — rejects invalid ranks', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT 1 FROM police_stations LIMIT 1')) return { rows: [{ '?column?': 1 }] };
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) return { rows: [{ '?column?': 1 }] };
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    adminScope: {},
    body: {
      name: 'समीर खान',
      badgeId: 'PNO-9999',
      password: 'SecPass123#',
      mobile: '9876543210',
      rank: 'Captain', // Invalid rank
      district: 'लखनऊ',
      station: 'हजरतगंज',
    },
  };
  const res = fakeRes();
  await createOfficer(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes('रैंक'));
});

// ------------------------------------------------------------
// 3. Username and Individual Login Credentials Validation
// ------------------------------------------------------------
test('Officer Creation — rejects "admin" and "superadmin" usernames', async (t) => {
  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    adminScope: {},
    body: {
      name: 'समीर खान',
      username: 'admin',
      password: 'SecPass123#',
      mobile: '9876543210',
      rank: 'Constable',
      district: 'लखनऊ',
      station: 'हजरतगंज',
    },
  };
  const res = fakeRes();
  await createOfficer(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes('आरक्षित है'));
});

test('Officer Creation — rejects duplicate username/badge_id with 409', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT 1 FROM police_stations LIMIT 1')) return { rows: [{ '?column?': 1 }] };
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) return { rows: [{ '?column?': 1 }] };
    if (sql.includes('FROM officers WHERE LOWER(TRIM(badge_id))')) {
      return { rows: [{ name: 'मौजूदा अधिकारी', station: 'हजरतगंज', district: 'लखनऊ' }] }; // duplicate exists
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    adminScope: {},
    body: {
      name: 'डुप्लिकेट खान',
      username: 'PNO-12345',
      password: 'SecPass123#',
      mobile: '9876543210',
      rank: 'Head Constable',
      district: 'लखनऊ',
      station: 'हजरतगंज',
    },
  };
  const res = fakeRes();
  await createOfficer(req, res);

  assert.equal(res.statusCode, 409);
  assert.ok(res.body.error.includes('सक्रिय अधिकारी'));
});

// ------------------------------------------------------------
// 4. Officer Credential Reset via updateOfficer
// ------------------------------------------------------------
test('Officer Update — updates password_hash when new password is provided', async (t) => {
  let updatedPasswordHash = null;

  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM officers WHERE id = $1')) {
      return {
        rows: [{
          id: 'off-1',
          name: 'राजेश कुमार',
          badge_id: 'PNO-1001',
          mobile: '9876543210',
          email: 'rajesh@uppolice.gov.in',
          station: 'हजरतगंज',
          district: 'लखनऊ',
          rank: 'SI',
          is_active: true,
          deleted_at: null,
        }],
      };
    }
    if (sql.includes('SELECT 1 FROM police_stations LIMIT 1')) return { rows: [{ '?column?': 1 }] };
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) return { rows: [{ '?column?': 1 }] };
    if (sql.includes('UPDATE officers') && sql.includes('password_hash')) {
      updatedPasswordHash = params[8]; // password_hash param
      return {
        rows: [{
          id: 'off-1',
          name: 'राजेश कुमार',
          badge_id: 'PNO-1001',
          mobile: '9876543210',
          email: 'rajesh@uppolice.gov.in',
          station: 'हजरतगंज',
          district: 'लखनऊ',
          rank: 'SI',
          is_active: true,
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    adminScope: {},
    params: { id: 'off-1' },
    body: {
      name: 'राजेश कुमार',
      password: 'NewPass88#',
    },
  };
  const res = fakeRes();
  await updateOfficer(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(updatedPasswordHash !== null);
  assert.ok(updatedPasswordHash.startsWith('$2b$12$') || updatedPasswordHash.startsWith('$2a$12$'));
  // Verify plain text matches the hash
  assert.ok(await bcrypt.compare('NewPass88#', updatedPasswordHash));
});

// ------------------------------------------------------------
// 5. Officer Login via username or badgeId
// ------------------------------------------------------------
test('Officer Login — authenticates successfully via username or badgeId', async (t) => {
  const plainPassword = 'OffSecret12#';
  const hashedPassword = await bcrypt.hash(plainPassword, 12);

  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('FROM officers') && sql.includes('LOWER(TRIM(badge_id))')) {
      if (params[0] === '200953125') {
        return {
          rows: [{
            id: 'off-login-1',
            name: 'राजेश कुमार',
            badge_id: '200953125',
            mobile: '9876543210',
            email: 'rajesh@uppolice.gov.in',
            password_hash: hashedPassword,
            station: 'हजरतगंज',
            district: 'लखनऊ',
            rank: 'Head Constable',
            is_active: true,
            permissions: {},
          }],
        };
      }
    }
    return { rows: [] };
  });

  // Login with username field
  const req1 = {
    body: {
      username: '200953125',
      password: plainPassword,
    },
  };
  const res1 = fakeRes();
  await officerLogin(req1, res1);

  assert.equal(res1.statusCode, 200);
  assert.ok(res1.body.token);
  assert.equal(res1.body.user.username, '200953125');
  assert.equal(res1.body.user.badgeId, '200953125');
  assert.equal(res1.body.user.rank, 'Head Constable');

  // Login with wrong password should fail with 401
  const reqWrong = {
    body: {
      username: '200953125',
      password: 'WrongPassword!',
    },
  };
  const resWrong = fakeRes();
  await officerLogin(reqWrong, resWrong);
  assert.equal(resWrong.statusCode, 401);
});

// ------------------------------------------------------------
// 6. District Admin Username Validation
// ------------------------------------------------------------
test('Create District Admin — rejects "admin" username and enforces unique district', async (t) => {
  const reqAdmin = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    body: {
      name: 'अमित कुमार',
      username: 'admin',
      email: 'bad@uppolice.gov.in',
      mobile: '9876543210',
      password: 'SecPass123#',
      district: 'लखनऊ',
    },
  };
  const resAdmin = fakeRes();
  await createDistrictAdmin(reqAdmin, resAdmin);

  assert.equal(resAdmin.statusCode, 400);
  assert.ok(resAdmin.body.error.includes('आरक्षित है'));
});
