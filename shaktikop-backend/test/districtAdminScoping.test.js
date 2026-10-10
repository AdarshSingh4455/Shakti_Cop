// ============================================================
// test/districtAdminScoping.test.js
//
// Tests for complete district-wise administration system:
// 1. Super Admin state-wide permissions and District Admin assignment
// 2. District Admin own-district isolation and boundary enforcement
// 3. Rejection of forged parameters and cross-district modifications
// 4. Station-district pairing validation
// 5. Prevention of admin account creation by District Admins
// 6. Safe soft-deletion with complaint preservation checks
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const {
  listAllOfficers,
  getOfficerDetails,
  createOfficer,
  updateOfficer,
  deleteOfficer,
  transferOfficer,
  createDistrictAdmin,
  updateDistrictAdmin,
  deleteAdmin,
  updateOfficerPermissions,
} = require('../src/controllers/adminController');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  return res;
}

// ------------------------------------------------------------
// 1. Super Admin State-Wide Capabilities
// ------------------------------------------------------------
test('Super Admin — can view officers statewide and filter by any district', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('TRIM(LOWER(district)) = $1')) {
      assert.equal(params[0], 'वाराणसी');
      return {
        rows: [
          { id: 'off-vns', name: 'अमित मिश्रा', badge_id: 'PNO-8899', station: 'दशाश्वमेध', district: 'वाराणसी', is_active: true, created_at: new Date() },
        ],
      };
    }
    return {
      rows: [
        { id: 'off-1', name: 'राजेश कुमार', badge_id: 'PNO-1001', station: 'हजरतगंज', district: 'लखनऊ', is_active: true, created_at: new Date() },
        { id: 'off-2', name: 'अमित मिश्रा', badge_id: 'PNO-8899', station: 'दशाश्वमेध', district: 'वाराणसी', is_active: true, created_at: new Date() },
      ],
    };
  });

  // Statewide unscoped query
  const reqAll = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    adminScope: {},
    query: {},
  };
  const resAll = fakeRes();
  await listAllOfficers(reqAll, resAll);
  assert.equal(resAll.statusCode, 200);
  assert.equal(resAll.body.length, 2);

  // Filtered by Varanasi
  const reqVns = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    adminScope: {},
    query: { district: 'वाराणसी' },
  };
  const resVns = fakeRes();
  await listAllOfficers(reqVns, resVns);
  assert.equal(resVns.statusCode, 200);
  assert.equal(resVns.body.length, 1);
  assert.equal(resVns.body[0].district, 'वाराणसी');
});

test('Super Admin — can reassign a District Admin to a different district', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM admins WHERE id = $1')) {
      return {
        rows: [
          { id: 'adm-10', name: 'सुरेश यादव', email: 'suresh@uppolice.gov.in', mobile: '9876543210', admin_role: 'district_admin', district: 'लखनऊ' },
        ],
      };
    }
    if (sql.includes('SELECT 1 FROM police_stations LIMIT 1')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) {
      // Valid district
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('UPDATE admins')) {
      assert.equal(params[3], 'वाराणसी', 'Target district must be updated to Varanasi');
      return {
        rows: [
          { id: 'adm-10', name: 'सुरेश यादव', email: 'suresh@uppolice.gov.in', mobile: '9876543210', admin_role: 'district_admin', district: 'वाराणसी', is_active: true, updated_at: new Date() },
        ],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', name: 'मुख्य व्यवस्थापक', adminRole: 'super_admin' },
    params: { id: 'adm-10' },
    body: { district: 'वाराणसी' },
  };
  const res = fakeRes();
  await updateDistrictAdmin(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.district, 'वाराणसी');
});

// ------------------------------------------------------------
// 2. District Admin Own-District Scoping & Boundary Enforcement
// ------------------------------------------------------------
test('District Admin — listing officers is restricted to own district and excludes soft-deleted officers', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    assert.match(sql, /deleted_at IS NULL/i, 'Must exclude soft-deleted records');
    assert.match(sql, /TRIM\(LOWER\(district\)\) = \$1/i);
    assert.equal(params[0], 'लखनऊ');
    return {
      rows: [
        { id: 'off-1', name: 'राजेश कुमार', badge_id: 'PNO-1001', station: 'हजरतगंज', district: 'लखनऊ', is_active: true, created_at: new Date(), deleted_at: null },
      ],
    };
  });

  const req = {
    user: { id: 'adm-lko', adminRole: 'district_admin', district: 'लखनऊ' },
    adminScope: { district: 'लखनऊ' },
    query: {},
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].district, 'लखनऊ');
});

test('District Admin — forged query parameter for another district is rejected with 403', async (t) => {
  const req = {
    user: { id: 'adm-lko', adminRole: 'district_admin', district: 'लखनऊ' },
    adminScope: { district: 'लखनऊ' },
    query: { district: 'कानपुर नगर' }, // Attempted cross-district read
  };
  const res = fakeRes();
  await listAllOfficers(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /आप सिर्फ़ अपने ज़िले/);
});

test('District Admin — creating officer locks district to adminScope.district and validates station', async (t) => {
  let insertedDistrict = null;
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT 1 FROM police_stations LIMIT 1')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) {
      // Station हजरतगंज in लखनऊ exists
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('SELECT name, station, district FROM officers WHERE badge_id')) {
      return { rows: [] }; // No duplicate
    }
    if (sql.includes('INSERT INTO officers')) {
      insertedDistrict = params[6];
      return {
        rows: [{
          id: 'off-new',
          name: params[0],
          badge_id: params[1],
          mobile: params[2],
          email: params[3],
          station: params[5],
          district: params[6],
          rank: params[7],
          is_active: true,
          created_at: new Date(),
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin', district: 'लखनऊ' },
    adminScope: { district: 'लखनऊ' },
    body: {
      name: 'संजय सिंह',
      badgeId: 'PNO-505050',
      mobile: '9876543211',
      password: 'SafePassword123',
      rank: 'SI',
      station: 'हजरतगंज',
      // Client does not provide district or provides matching district
    },
  };
  const res = fakeRes();
  await createOfficer(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(insertedDistrict, 'लखनऊ');
  assert.equal(res.body.district, 'लखनऊ');
});

test('District Admin — attempting to create an officer in another district returns 403', async (t) => {
  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin', district: 'लखनऊ' },
    adminScope: { district: 'लखनऊ' },
    body: {
      name: 'संजय सिंह',
      badgeId: 'PNO-505050',
      mobile: '9876543211',
      password: 'SafePassword123',
      district: 'कानपुर नगर', // Forged cross-district attempt
      station: 'कोतवाली',
    },
  };
  const res = fakeRes();
  await createOfficer(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /आप सिर्फ़ अपने ज़िले/);
});

test('District Admin — cross-district station assignment is rejected with 400', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT 1 FROM police_stations LIMIT 1')) {
      return { rows: [{ '?column?': 1 }] };
    }
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) {
      // Station कोतवाली does not belong to Lucknow in police_stations table
      return { rows: [] };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin', district: 'लखनऊ' },
    adminScope: { district: 'लखनऊ' },
    body: {
      name: 'संजय सिंह',
      badgeId: 'PNO-505050',
      mobile: '9876543211',
      password: 'SafePassword123',
      station: 'अमान्य_थाना_123',
    },
  };
  const res = fakeRes();
  await createOfficer(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /मौजूद नहीं है/);
});

// ------------------------------------------------------------
// 3. Officer Details, Modification & Cross-District Rejection
// ------------------------------------------------------------
test('District Admin — getOfficerDetails returns officer in scope and rejects out-of-scope officer (403)', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (params[0] === 'off-lko') {
      return {
        rows: [{ id: 'off-lko', name: 'राजेश', badge_id: '1001', district: 'लखनऊ', station: 'हजरतगंज', is_active: true }],
      };
    }
    if (params[0] === 'off-knp') {
      return {
        rows: [{ id: 'off-knp', name: 'दिनेश', badge_id: '1002', district: 'कानपुर', station: 'कल्याणपुर', is_active: true }],
      };
    }
    return { rows: [] };
  });

  // Own district officer -> 200
  const reqOwn = {
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-lko' },
  };
  const resOwn = fakeRes();
  await getOfficerDetails(reqOwn, resOwn);
  assert.equal(resOwn.statusCode, 200);
  assert.equal(resOwn.body.id, 'off-lko');

  // Out-of-district officer -> 403
  const reqOther = {
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-knp' },
  };
  const resOther = fakeRes();
  await getOfficerDetails(reqOther, resOther);
  assert.equal(resOther.statusCode, 403);
});

test('District Admin — updateOfficer prevents changing officer district (403)', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM officers WHERE id = $1')) {
      return {
        rows: [{ id: 'off-1', name: 'राजेश कुमार', badge_id: 'PNO-1001', district: 'लखनऊ', station: 'हजरतगंज', is_active: true }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin' },
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-1' },
    body: {
      name: 'राजेश कुमार',
      district: 'आगरा', // District Admin trying to change district
    },
  };
  const res = fakeRes();
  await updateOfficer(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /ज़िला व्यवस्थापक अधिकारी का ज़िला नहीं बदल सकते/);
});

test('District Admin — transferOfficer rejects cross-district transfer with 403', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM officers WHERE id = $1')) {
      return {
        rows: [{ id: 'off-1', name: 'राजेश कुमार', badge_id: 'PNO-1001', district: 'लखनऊ', station: 'हजरतगंज', is_active: true }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin' },
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-1' },
    body: {
      station: 'हरिद्वार_रोड',
      district: 'वाराणसी', // Cross-district transfer attempted by district_admin
    },
  };
  const res = fakeRes();
  await transferOfficer(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /दूसरे ज़िले में स्थानांतरित नहीं कर सकते/);
});

// ------------------------------------------------------------
// 4. Admin Management Authorization Boundaries
// ------------------------------------------------------------
test('District Admin — cannot create Super Admin or District Admin (createDistrictAdmin returns 403)', async (t) => {
  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin', district: 'लखनऊ' },
    body: {
      name: 'अनिल वर्मा',
      mobile: '9876543299',
      email: 'anil@uppolice.gov.in',
      password: 'SafePassword123',
      district: 'लखनऊ',
    },
  };
  const res = fakeRes();
  await createDistrictAdmin(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /ज़िला व्यवस्थापक अन्य व्यवस्थापक खाते नहीं बना सकते/);
});

// ------------------------------------------------------------
// 5. Safe Soft-Deletion & Complaint History Preservation
// ------------------------------------------------------------
test('Safe Officer Removal — blocked with 400 if officer has active complaints assigned', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM officers WHERE id = $1')) {
      return {
        rows: [{ id: 'off-1', name: 'राजेश कुमार', badge_id: 'PNO-1001', district: 'लखनऊ', station: 'हजरतगंज', is_active: true }],
      };
    }
    if (sql.includes('SELECT count(*) FROM complaints WHERE officer_id = $1')) {
      return {
        rows: [{ count: '2' }], // 2 active complaints assigned
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin' },
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-1' },
  };
  const res = fakeRes();
  await deleteOfficer(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /सक्रिय मामले नियुक्त हैं/);
});

test('Safe Officer Removal — soft-deletes officer, sets deleted_at and preserves complaint history', async (t) => {
  let softDeleted = false;
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM officers WHERE id = $1')) {
      return {
        rows: [{ id: 'off-1', name: 'राजेश कुमार', badge_id: 'PNO-1001', district: 'लखनऊ', station: 'हजरतगंज', is_active: true }],
      };
    }
    if (sql.includes('SELECT count(*) FROM complaints WHERE officer_id = $1')) {
      return { rows: [{ count: '0' }] }; // No active complaints
    }
    if (sql.includes('UPDATE officers') && sql.includes('deleted_at = now()')) {
      softDeleted = true;
      return {
        rows: [{ id: 'off-1', name: 'राजेश कुमार', badge_id: 'PNO-1001', district: 'लखनऊ', station: 'हजरतगंज' }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin' },
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-1' },
  };
  const res = fakeRes();
  await deleteOfficer(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(softDeleted, true, 'Officer record must be safely soft-deleted with deleted_at set');
  assert.match(res.body.message, /सुरक्षित रूप से हटा/);
});

// ------------------------------------------------------------
// 6. Single District Admin Constraint & Privilege Escalation Prevention
// ------------------------------------------------------------
test('Single District Admin Constraint — createDistrictAdmin rejects duplicate active district_admin with 409', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) {
      return { rows: [{ '?column?': 1 }] }; // valid district
    }
    if (sql.includes('FROM admins') && sql.includes("admin_role = 'district_admin'") && sql.includes('is_active = true')) {
      // An active district_admin already exists for this district
      return {
        rows: [{ id: 'adm-existing', name: 'मौजूदा व्यवस्थापक', email: 'existing@uppolice.gov.in' }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    body: {
      name: 'नया व्यवस्थापक',
      email: 'new@uppolice.gov.in',
      mobile: '9876543211',
      password: 'SecurePassword123!',
      district: 'लखनऊ',
    },
  };
  const res = fakeRes();
  await createDistrictAdmin(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /पहले से एक मुख्य ज़िला व्यवस्थापक/);
  assert.equal(res.body.existingAdmin.id, 'adm-existing');
});

test('Single District Admin Constraint — updateDistrictAdmin rejects reassigning to occupied district with 409', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM admins WHERE id = $1')) {
      return {
        rows: [{ id: 'adm-10', name: 'सुरेश यादव', admin_role: 'district_admin', district: 'वाराणसी' }],
      };
    }
    if (sql.includes('SELECT 1 FROM police_stations WHERE')) {
      return { rows: [{ '?column?': 1 }] }; // valid district
    }
    if (sql.includes('FROM admins') && sql.includes("admin_role = 'district_admin'") && sql.includes('id != $2')) {
      // Lucknow is already occupied by another admin
      return {
        rows: [{ id: 'adm-lko', name: 'लखनऊ मुख्य व्यवस्थापक', email: 'lko@uppolice.gov.in' }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    params: { id: 'adm-10' },
    body: { district: 'लखनऊ' },
  };
  const res = fakeRes();
  await updateDistrictAdmin(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /पहले से एक मुख्य ज़िला व्यवस्थापक/);
});

test('Super Admin Protection — deleteAdmin rejects deleting Global Super Admin with 403', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM admins WHERE id = $1')) {
      return {
        rows: [{ id: 'admin-1', name: 'मुख्य व्यवस्थापक', admin_role: 'super_admin', email: 'admin@uppolice.gov.in' }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', adminRole: 'super_admin' },
    params: { id: 'admin-1' },
  };
  const res = fakeRes();
  await deleteAdmin(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Global Super Admin खाते को हटाया नहीं जा सकता/);
});

test('Privilege Escalation Prevention — updateOfficerPermissions rejects reserved keys with 403', async (t) => {
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM officers WHERE id = $1')) {
      return {
        rows: [{ id: 'off-1', name: 'अधिकारी', district: 'लखनऊ', permissions: {} }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', adminRole: 'district_admin' },
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-1' },
    body: {
      permissions: {
        canReject: true,
        super_admin: true, // Attempted privilege escalation
      },
    },
  };
  const res = fakeRes();
  await updateOfficerPermissions(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /प्रणाली स्तर पर आरक्षित/);
});

test('Officer Permissions — District Admin can update legitimate permissions within own district', async (t) => {
  let updatedPerms = null;
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT * FROM officers WHERE id = $1')) {
      return {
        rows: [{ id: 'off-1', name: 'राजेश कुमार', district: 'लखनऊ', permissions: {} }],
      };
    }
    if (sql.includes('UPDATE officers SET permissions = $1')) {
      updatedPerms = JSON.parse(params[0]);
      return {
        rows: [{ id: 'off-1', name: 'राजेश कुमार', district: 'लखनऊ', permissions: updatedPerms }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'adm-lko', name: 'लखनऊ व्यवस्थापक', adminRole: 'district_admin' },
    adminScope: { district: 'लखनऊ' },
    params: { id: 'off-1' },
    body: {
      permissions: {
        canReject: true,
        canTransfer: true,
      },
    },
  };
  const res = fakeRes();
  await updateOfficerPermissions(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updatedPerms, { canReject: true, canTransfer: true });
  assert.deepEqual(res.body.permissions, { canReject: true, canTransfer: true });
  assert.equal(res.body.name, 'राजेश कुमार');
});
