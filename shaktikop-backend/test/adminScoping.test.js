// ============================================================
// test/adminScoping.test.js
//
// Tests for:
// 1. District isolation in officer listing (listAllOfficers, listOfficers)
// 2. Station and Range restrictions for DSP / IG / DIG
// 3. Inactive staff / admin cannot request login OTP
// 4. Super Admin and SSP account-creation permission boundaries
// 5. Prevention of unauthorized role escalation
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const { listAllOfficers, isOfficerInScope, createDistrictAdmin, getOfficerStatusOverview } = require('../src/controllers/adminController');
const { listOfficers } = require('../src/controllers/officerController');
const { getOfficerLeaderboard } = require('../src/controllers/analyticsController');
const { staffRequestOtp, officerRequestOtp } = require('../src/controllers/authController');
const { requireSSPOrSuperAdmin } = require('../src/middleware/auth');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  return res;
}

// ------------------------------------------------------------
// 1. District Isolation in Officer Listing
// ------------------------------------------------------------
test('District isolation — district_admin of लखनऊ only receives officers from लखनऊ', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    // Assert query uses scoped district
    assert.match(sql, /TRIM\(LOWER\(district\)\) = \$1/i);
    assert.equal(params[0], 'लखनऊ');
    return {
      rows: [
        { id: 'off-1', name: 'राजेश कुमार', badge_id: 'UPP-101', station: 'हजरतगंज', district: 'लखनऊ', is_active: true, created_at: new Date() },
      ],
    };
  });

  const req = {
    adminScope: { district: 'लखनऊ' },
    query: {},
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].district, 'लखनऊ');
});

test('District isolation — district_admin querying an unauthorized district receives 403', async (t) => {
  const req = {
    adminScope: { district: 'लखनऊ' },
    query: { district: 'कानपुर' },
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /आप सिर्फ़ अपने ज़िले/);
});

test('District isolation — listOfficers (/officers) enforces district scoping', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    assert.match(sql, /TRIM\(LOWER\(district\)\) = \$1/i);
    assert.equal(params[0], 'लखनऊ');
    return {
      rows: [
        { id: 'off-1', name: 'राजेश कुमार', badge_id: 'UPP-101', station: 'हजरतगंज', district: 'लखनऊ' },
      ],
    };
  });

  const req = {
    adminScope: { district: 'लखनऊ' },
    query: {},
  };
  const res = fakeRes();
  await listOfficers(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].district, 'लखनऊ');
});

test('District isolation — isOfficerInScope accurately isolates cross-district records', (t) => {
  const reqLucknow = { adminScope: { district: 'लखनऊ' } };
  assert.equal(isOfficerInScope(reqLucknow, { district: 'लखनऊ', station: 'हजरतगंज' }), true);
  assert.equal(isOfficerInScope(reqLucknow, { district: 'कानपुर', station: 'कोतवाली' }), false);
  assert.equal(isOfficerInScope(reqLucknow, { district: ' लखनऊ ', station: 'हजरतगंज' }), true, 'Whitespace resilience');
});

// ------------------------------------------------------------
// 2. Station and Range Restrictions
// ------------------------------------------------------------
test('Circle station restriction — DSP with circleStations only receives officers within assigned stations', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    assert.match(sql, /TRIM\(LOWER\(station\)\) = ANY\(\$1\)/i);
    assert.deepEqual(params[0], ['हजरतगंज']);
    assert.equal(params[1], 'लखनऊ');
    return {
      rows: [
        { id: 'off-1', name: 'राजेश कुमार', badge_id: 'UPP-101', station: 'हजरतगंज', district: 'लखनऊ', is_active: true, created_at: new Date() },
      ],
    };
  });

  const req = {
    adminScope: { circleStations: ['हजरतगंज'], district: 'लखनऊ' },
    query: {},
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].station, 'हजरतगंज');
});

test('Circle station restriction — DSP querying an unassigned station receives 403', async (t) => {
  const req = {
    adminScope: { circleStations: ['हजरतगंज'], district: 'लखनऊ' },
    query: { station: 'गोमती नगर' },
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /सर्किल में नहीं है/);
});

test('Range restriction — IG/DIG with rangeDistricts only receives officers within authorized range', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    assert.match(sql, /TRIM\(LOWER\(district\)\) = ANY\(\$1\)/i);
    assert.deepEqual(params[0], ['लखनऊ', 'सीतापुर']);
    return {
      rows: [
        { id: 'off-1', name: 'अधिकारी 1', badge_id: 'UPP-101', station: 'हजरतगंज', district: 'लखनऊ', is_active: true, created_at: new Date() },
        { id: 'off-2', name: 'अधिकारी 2', badge_id: 'UPP-102', station: 'कोतवाली', district: 'सीतापुर', is_active: true, created_at: new Date() },
      ],
    };
  });

  const req = {
    adminScope: { rangeDistricts: ['लखनऊ', 'सीतापुर'] },
    query: {},
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});

test('Range restriction — IG/DIG querying a district outside authorized range receives 403', async (t) => {
  const req = {
    adminScope: { rangeDistricts: ['लखनऊ', 'सीतापुर'] },
    query: { district: 'वाराणसी' },
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Range/);
});

// ------------------------------------------------------------
// 3. Inactive Staff Cannot Request Login OTP
// ------------------------------------------------------------
test('Inactive officer cannot request staff login OTP (returns 403, OTP is NOT sent)', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('is_active = false')) {
      return { rows: [{ role: 'officer', id: 'inactive-off-1', name: 'निलंबित अधिकारी' }] };
    }
    return { rows: [] };
  });

  const req = {
    body: { identifier: '9876543210' },
    ip: '127.0.0.1',
  };
  const res = fakeRes();
  await staffRequestOtp(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /निष्क्रिय/);
});

test('Inactive admin cannot request staff login OTP (returns 403, OTP is NOT sent)', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('is_active = false')) {
      return { rows: [{ role: 'admin', id: 'inactive-adm-1', name: 'निष्क्रिय एडमिन' }] };
    }
    return { rows: [] };
  });

  const req = {
    body: { identifier: 'inactive_admin@uppolice.gov.in' },
    ip: '127.0.0.1',
  };
  const res = fakeRes();
  await staffRequestOtp(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /निष्क्रिय/);
});

test('Inactive officer calling officerRequestOtp receives 403 and no OTP is sent', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('is_active = false')) {
      return { rows: [{ id: 'off-inact', name: 'निलंबित उपनिरीक्षक' }] };
    }
    return { rows: [] };
  });

  const req = {
    body: { mobile: '9876543210' },
    ip: '127.0.0.1',
  };
  const res = fakeRes();
  await officerRequestOtp(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /निष्क्रिय/);
});

// ------------------------------------------------------------
// 4. Super Admin and SSP Account-Creation Boundaries & Role Escalation
// ------------------------------------------------------------
test('SSP can create DSP monitor within their own district', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT station FROM police_stations')) {
      return { rows: [{ station: 'हजरतगंज' }] };
    }
    if (sql.includes('INSERT INTO admins')) {
      return {
        rows: [{
          id: 'new-dsp-id',
          name: 'संजय शर्मा',
          admin_role: 'monitor',
          rank: 'DSP',
          district: 'लखनऊ',
          circle_stations: ['हजरतगंज'],
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'ssp-1', name: 'एसएसपी लखनऊ', adminRole: 'monitor', rank: 'SSP', district: 'लखनऊ' },
    body: {
      name: 'संजय शर्मा',
      mobile: '9876543211',
      email: 'dsp.sanjay@uppolice.gov.in',
      password: 'StrongPassword1',
      adminRole: 'monitor',
      rank: 'DSP',
      district: 'लखनऊ',
      circleStations: ['हजरतगंज'],
    },
  };
  const res = fakeRes();
  await createDistrictAdmin(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.rank, 'DSP');
  assert.equal(res.body.district, 'लखनऊ');
});

test('SSP cannot create DSP in another district (returns 403)', async (t) => {
  const req = {
    user: { id: 'ssp-1', name: 'एसएसपी लखनऊ', adminRole: 'monitor', rank: 'SSP', district: 'लखनऊ' },
    body: {
      name: 'संजय शर्मा',
      mobile: '9876543211',
      email: 'dsp.sanjay@uppolice.gov.in',
      password: 'StrongPassword1',
      adminRole: 'monitor',
      rank: 'DSP',
      district: 'कानपुर', // Mismatched district
      circleStations: ['कोतवाली'],
    },
  };
  const res = fakeRes();
  await createDistrictAdmin(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /सिर्फ़ अपने ज़िले/);
});

test('SSP cannot create a district_admin (returns 403)', async (t) => {
  const req = {
    user: { id: 'ssp-1', name: 'एसएसपी लखनऊ', adminRole: 'monitor', rank: 'SSP', district: 'लखनऊ' },
    body: {
      name: 'अनिल वर्मा',
      mobile: '9876543212',
      email: 'admin.anil@uppolice.gov.in',
      password: 'StrongPassword1',
      adminRole: 'district_admin',
      district: 'लखनऊ',
    },
  };
  const res = fakeRes();
  await createDistrictAdmin(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /DSP या ASP खाते/);
});

test('Unauthorized role escalation — createDistrictAdmin cannot create a super_admin', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('INSERT INTO admins')) {
      // Returned role must be district_admin, NOT super_admin
      return {
        rows: [{
          id: 'new-adm-id',
          name: 'रवि प्रकाश',
          admin_role: 'district_admin',
          district: 'लखनऊ',
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', name: 'मुख्य व्यवस्थापक', adminRole: 'super_admin' },
    body: {
      name: 'रवि प्रकाश',
      mobile: '9876543213',
      email: 'ravi@uppolice.gov.in',
      password: 'StrongPassword1',
      adminRole: 'super_admin', // Attempted role escalation
      district: 'लखनऊ',
    },
  };
  const res = fakeRes();
  await createDistrictAdmin(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.admin_role, 'district_admin', 'Role must remain district_admin, never escalated to super_admin');
});

test('Middleware requireSSPOrSuperAdmin blocks unauthorized admin roles (e.g. district_admin)', () => {
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  const res = fakeRes();

  const reqDistrictAdmin = {
    user: { role: 'admin', adminRole: 'district_admin', district: 'लखनऊ' },
  };

  requireSSPOrSuperAdmin(reqDistrictAdmin, res, next);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /सिर्फ़ SSP या Super Admin/);
});

// ------------------------------------------------------------
// 5. Empty-Scope Fail-Closed Authorization Tests
// ------------------------------------------------------------

test('Super Admin retains authorized state-wide access across all endpoints', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('duty_status, COUNT(*)')) {
      return { rows: [{ duty_status: 'उपलब्ध', count: '5' }] };
    }
    if (sql.includes('FROM officers o LEFT JOIN complaints c')) {
      return { rows: [{ id: 'off-1', name: 'अधिकारी', badge_id: 'UPP-1', station: 'कोतवाली', district: 'लखनऊ', total_assigned: '2', resolved: '2', avg_resolution_hours: null, avg_rating: null }] };
    }
    return { rows: [{ id: 'off-1', name: 'अधिकारी', badge_id: 'UPP-1', station: 'कोतवाली', district: 'लखनऊ', is_active: true, created_at: new Date() }] };
  });

  const superAdminReq = {
    user: { role: 'admin', adminRole: 'super_admin' },
    adminScope: {},
    query: {},
  };

  // listAllOfficers
  const res1 = fakeRes();
  await listAllOfficers(superAdminReq, res1);
  assert.equal(res1.statusCode, 200);

  // listOfficers
  const res2 = fakeRes();
  await listOfficers(superAdminReq, res2);
  assert.equal(res2.statusCode, 200);

  // getOfficerStatusOverview
  const res3 = fakeRes();
  await getOfficerStatusOverview(superAdminReq, res3);
  assert.equal(res3.statusCode, 200);

  // getOfficerLeaderboard
  const res4 = fakeRes();
  await getOfficerLeaderboard(superAdminReq, res4);
  assert.equal(res4.statusCode, 200);
});

test('district_admin with missing or null district receives 403 (never falls open)', async () => {
  const malformedDistrictAdminReq = {
    user: { role: 'admin', adminRole: 'district_admin', district: null },
    adminScope: {},
    query: {},
  };

  // listAllOfficers
  const res1 = fakeRes();
  await listAllOfficers(malformedDistrictAdminReq, res1);
  assert.equal(res1.statusCode, 403);
  assert.match(res1.body.error, /अमान्य अधिकार क्षेत्र/);

  // listOfficers
  const res2 = fakeRes();
  await listOfficers(malformedDistrictAdminReq, res2);
  assert.equal(res2.statusCode, 403);
  assert.match(res2.body.error, /अमान्य अधिकार क्षेत्र/);

  // getOfficerStatusOverview
  const res3 = fakeRes();
  await getOfficerStatusOverview(malformedDistrictAdminReq, res3);
  assert.equal(res3.statusCode, 403);
  assert.match(res3.body.error, /अमान्य अधिकार क्षेत्र/);

  // getOfficerLeaderboard
  const res4 = fakeRes();
  await getOfficerLeaderboard(malformedDistrictAdminReq, res4);
  assert.equal(res4.statusCode, 403);
  assert.match(res4.body.error, /अमान्य अधिकार क्षेत्र/);
});

test('monitor with no valid scope receives 403', async () => {
  const unscopedMonitorReq = {
    user: { role: 'admin', adminRole: 'monitor', rank: 'DSP', district: null, circleStations: [] },
    adminScope: {},
    query: {},
  };

  const res1 = fakeRes();
  await listAllOfficers(unscopedMonitorReq, res1);
  assert.equal(res1.statusCode, 403);
  assert.match(res1.body.error, /अमान्य अधिकार क्षेत्र/);

  const res2 = fakeRes();
  await listOfficers(unscopedMonitorReq, res2);
  assert.equal(res2.statusCode, 403);
  assert.match(res2.body.error, /अमान्य अधिकार क्षेत्र/);

  const res3 = fakeRes();
  await getOfficerStatusOverview(unscopedMonitorReq, res3);
  assert.equal(res3.statusCode, 403);
  assert.match(res3.body.error, /अमान्य अधिकार क्षेत्र/);

  const res4 = fakeRes();
  await getOfficerLeaderboard(unscopedMonitorReq, res4);
  assert.equal(res4.statusCode, 403);
  assert.match(res4.body.error, /अमान्य अधिकार क्षेत्र/);
});

test('empty range/station scope arrays never return unrestricted data', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    assert.match(sql, /TRIM\(LOWER\(district\)\) = \$1/i);
    assert.equal(params[0], 'लखनऊ');
    return { rows: [] };
  });

  const emptyRangeReq = {
    user: { role: 'admin', adminRole: 'monitor', rank: 'IG' },
    adminScope: { rangeDistricts: [] },
    query: {},
  };

  const res1 = fakeRes();
  await listAllOfficers(emptyRangeReq, res1);
  assert.equal(res1.statusCode, 403);
  assert.match(res1.body.error, /अमान्य अधिकार क्षेत्र/);

  const emptyCircleNoDistrictReq = {
    user: { role: 'admin', adminRole: 'monitor', rank: 'DSP', district: null },
    adminScope: { circleStations: [], district: null },
    query: {},
  };

  const res2 = fakeRes();
  await listAllOfficers(emptyCircleNoDistrictReq, res2);
  assert.equal(res2.statusCode, 403);
  assert.match(res2.body.error, /अमान्य अधिकार क्षेत्र/);

  const emptyCircleWithDistrictReq = {
    user: { role: 'admin', adminRole: 'monitor', rank: 'DSP', district: 'लखनऊ' },
    adminScope: { circleStations: [], district: 'लखनऊ' },
    query: {},
  };

  const res3 = fakeRes();
  await listOfficers(emptyCircleWithDistrictReq, res3);
  // When circleStations is empty, it securely falls back to district scoping, not unrestricted
  assert.equal(res3.statusCode, 200);
});

test('DSP circleStations querying district outside authorized district receives 403', async () => {
  const req = {
    user: { role: 'admin', adminRole: 'monitor', rank: 'DSP', district: 'लखनऊ' },
    adminScope: { circleStations: ['हजरतगंज'], district: 'लखनऊ' },
    query: { district: 'कानपुर' },
  };

  const res1 = fakeRes();
  await listAllOfficers(req, res1);
  assert.equal(res1.statusCode, 403);
  assert.match(res1.body.error, /सिर्फ़ अपने ज़िले/);

  const res2 = fakeRes();
  await getOfficerLeaderboard(req, res2);
  assert.equal(res2.statusCode, 403);
  assert.match(res2.body.error, /सिर्फ़ अपने ज़िले/);
});

test('Officer leaderboard enforces station and district binding preventing cross-district leakage', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    // Assert query binds circleStations AND district
    assert.match(sql, /TRIM\(LOWER\(o\.station\)\) = ANY\(\$1\)/i);
    assert.match(sql, /TRIM\(LOWER\(o\.district\)\) = \$2/i);
    assert.deepEqual(params[0], ['कोतवाली']);
    assert.equal(params[1], 'झांसी');
    return { rows: [] };
  });

  const req = {
    user: { role: 'admin', adminRole: 'monitor', rank: 'DSP', district: 'झांसी' },
    adminScope: { circleStations: ['कोतवाली'], district: 'झांसी' },
    query: {},
  };
  const res = fakeRes();
  await getOfficerLeaderboard(req, res);
  assert.equal(res.statusCode, 200);
});

test('isOfficerInScope denies non-super-admin with missing scope while allowing super_admin', () => {
  const unscopedDistrictAdmin = {
    user: { role: 'admin', adminRole: 'district_admin' },
    adminScope: {},
  };
  assert.equal(isOfficerInScope(unscopedDistrictAdmin, { district: 'लखनऊ', station: 'हजरतगंज' }), false);

  const superAdmin = {
    user: { role: 'admin', adminRole: 'super_admin' },
    adminScope: {},
  };
  assert.equal(isOfficerInScope(superAdmin, { district: 'लखनऊ', station: 'हजरतगंज' }), true);
});
