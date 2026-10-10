// ============================================================
// test/superAdminContact.test.js
//
// Targeted tests for Global Web Super Admin Contact/Identity updates:
// 1. Authorized Global Web Super Admin can update permitted fields (email, username, mobile)
// 2. Email, mobile, and username validations
// 3. Duplicate email, username, and mobile rejections (409 Conflict)
// 4. Current password authentication requirement (400 on missing, 401 on incorrect)
// 5. RBAC boundary enforcement: District Admin, Monitor, and Officer rejection (403)
// 6. Protection of system-level fields (adminRole, district, rank, is_active, permissions) (400)
// 7. Preservation of existing protections against deleting or tampering Super Admin
// 8. Seamless login via username or email in adminLogin
// ============================================================

process.env.JWT_SECRET = 'test-jwt-secret-shakticop-key-12345';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const {
  updateSuperAdminContact,
  deleteAdmin,
  updateDistrictAdmin,
} = require('../src/controllers/adminController');
const {
  adminLogin,
} = require('../src/controllers/authController');

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
// 1. Authorized Global Super Admin Success
// ------------------------------------------------------------
test('Super Admin Contact — authorized Super Admin updates email, username, and mobile with valid password', async (t) => {
  const currentPassword = 'SuperSecret123#';
  const currentHash = await bcrypt.hash(currentPassword, 12);
  let updatedEmail = null;
  let updatedUsername = null;
  let updatedMobile = null;

  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('SELECT id, name, username, mobile, email, password_hash, admin_role, is_active FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-admin-uuid-1',
          name: 'मुख्य प्रशासक (Super Admin)',
          username: 'admin',
          mobile: '9450000500',
          email: 'admin@uppolice.gov.in',
          password_hash: currentHash,
          admin_role: 'super_admin',
          is_active: true,
        }],
      };
    }
    if (sql.includes('SELECT id, name FROM admins WHERE LOWER(TRIM(email))') || sql.includes('SELECT id, name FROM admins WHERE LOWER(TRIM(username))') || sql.includes('SELECT id FROM admins WHERE mobile')) {
      return { rows: [] }; // No duplicate
    }
    if (sql.includes('UPDATE admins') && sql.includes("admin_role = 'super_admin'")) {
      updatedEmail = params[0];
      updatedUsername = params[1];
      updatedMobile = params[2];
      return {
        rows: [{
          id: 'super-admin-uuid-1',
          name: 'मुख्य प्रशासक (Super Admin)',
          username: updatedUsername,
          mobile: updatedMobile,
          email: updatedEmail,
          admin_role: 'super_admin',
          is_active: true,
          updated_at: new Date(),
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-admin-uuid-1', role: 'admin', adminRole: 'super_admin', name: 'मुख्य प्रशासक' },
    body: {
      email: 'dg.police@uppolice.gov.in',
      username: 'dg_superadmin',
      mobile: '9450000555',
      currentPassword: currentPassword,
    },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updatedEmail, 'dg.police@uppolice.gov.in');
  assert.equal(updatedUsername, 'dg_superadmin');
  assert.equal(updatedMobile, '9450000555');
  assert.equal(res.body.admin.email, 'dg.police@uppolice.gov.in');
  assert.equal(res.body.admin.username, 'dg_superadmin');
  assert.equal(res.body.admin.mobile, '9450000555');
  // Never leak password_hash or password in response
  assert.equal(res.body.admin.password_hash, undefined);
  assert.equal(res.body.admin.password, undefined);
});

// ------------------------------------------------------------
// 2. Format Validations
// ------------------------------------------------------------
test('Super Admin Contact — rejects invalid email format', async (t) => {
  const currentPassword = 'SuperSecret123#';
  const currentHash = await bcrypt.hash(currentPassword, 12);

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-1',
          name: 'Super Admin',
          username: 'admin',
          email: 'admin@uppolice.gov.in',
          password_hash: currentHash,
          admin_role: 'super_admin',
          is_active: true,
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: { email: 'invalid-email-address', currentPassword },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /मान्य ईमेल/);
});

test('Super Admin Contact — rejects invalid mobile format', async (t) => {
  const currentPassword = 'SuperSecret123#';
  const currentHash = await bcrypt.hash(currentPassword, 12);

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-1',
          name: 'Super Admin',
          username: 'admin',
          mobile: '9450000500',
          password_hash: currentHash,
          admin_role: 'super_admin',
          is_active: true,
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: { mobile: '12345', currentPassword },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /मोबाइल/);
});

test('Super Admin Contact — rejects invalid username format', async (t) => {
  const currentPassword = 'SuperSecret123#';
  const currentHash = await bcrypt.hash(currentPassword, 12);

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-1',
          name: 'Super Admin',
          username: 'admin',
          password_hash: currentHash,
          admin_role: 'super_admin',
          is_active: true,
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: { username: 'a', currentPassword }, // Too short
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /यूज़रनेम/);
});

// ------------------------------------------------------------
// 3. Password Authentication Security
// ------------------------------------------------------------
test('Super Admin Contact — requires current password (missing returns 400)', async (t) => {
  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: { email: 'new@uppolice.gov.in' }, // Missing currentPassword
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /वर्तमान पासवर्ड आवश्यक है/);
});

test('Super Admin Contact — rejects incorrect current password with 401', async (t) => {
  const currentHash = await bcrypt.hash('CorrectPass123#', 12);

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-1',
          name: 'Super Admin',
          username: 'admin',
          password_hash: currentHash,
          admin_role: 'super_admin',
          is_active: true,
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: { email: 'new@uppolice.gov.in', currentPassword: 'WrongPassword999!' },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /वर्तमान पासवर्ड गलत है/);
});

// ------------------------------------------------------------
// 4. Duplicate Uniqueness Checks
// ------------------------------------------------------------
test('Super Admin Contact — rejects duplicate email with 409 Conflict', async (t) => {
  const currentPassword = 'SuperSecret123#';
  const currentHash = await bcrypt.hash(currentPassword, 12);

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT id, name, username, mobile, email, password_hash, admin_role, is_active FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-1',
          name: 'Super Admin',
          username: 'admin',
          email: 'admin@uppolice.gov.in',
          password_hash: currentHash,
          admin_role: 'super_admin',
          is_active: true,
        }],
      };
    }
    if (sql.includes('FROM admins WHERE LOWER(TRIM(email))')) {
      return { rows: [{ id: 'adm-another', name: 'अन्य एडमिन' }] }; // Conflict exists
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: { email: 'existing.admin@uppolice.gov.in', currentPassword },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /ईमेल पहले से किसी सक्रिय व्यवस्थापक/);
});

test('Super Admin Contact — rejects duplicate username with 409 Conflict', async (t) => {
  const currentPassword = 'SuperSecret123#';
  const currentHash = await bcrypt.hash(currentPassword, 12);

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT id, name, username, mobile, email, password_hash, admin_role, is_active FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-1',
          name: 'Super Admin',
          username: 'admin',
          password_hash: currentHash,
          admin_role: 'super_admin',
          is_active: true,
        }],
      };
    }
    if (sql.includes('FROM admins WHERE LOWER(TRIM(username))')) {
      return { rows: [{ id: 'adm-another', name: 'अन्य एडमिन' }] }; // Conflict exists
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: { username: 'dsp_lucknow', currentPassword },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /यूज़रनेम पहले से किसी व्यवस्थापक/);
});

// ------------------------------------------------------------
// 5. RBAC & Unauthorized Role Restrictions
// ------------------------------------------------------------
test('Super Admin Contact — rejects District Admin with 403 Forbidden', async (t) => {
  const req = {
    user: { id: 'dist-adm-1', role: 'admin', adminRole: 'district_admin', district: 'लखनऊ' },
    body: { email: 'fake@uppolice.gov.in', currentPassword: 'Pass' },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /सिर्फ़ Global Super Admin/);
});

test('Super Admin Contact — rejects Monitor accounts (DSP/ASP/SSP) with 403 Forbidden', async (t) => {
  const req = {
    user: { id: 'dsp-1', role: 'admin', adminRole: 'monitor', rank: 'DSP' },
    body: { email: 'fake@uppolice.gov.in', currentPassword: 'Pass' },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /सिर्फ़ Global Super Admin/);
});

test('Super Admin Contact — rejects Police Officer caller with 403 Forbidden', async (t) => {
  const req = {
    user: { id: 'off-1', role: 'officer', rank: 'SHO' },
    body: { email: 'fake@uppolice.gov.in', currentPassword: 'Pass' },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /सिर्फ़ Global Super Admin/);
});

test('Super Admin Contact — rejects deactivated Super Admin account with 403 Forbidden', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('FROM admins WHERE id = $1')) {
      return {
        rows: [{
          id: 'super-inactive',
          name: 'Super Admin',
          username: 'admin',
          admin_role: 'super_admin',
          is_active: false,
          password_hash: '$2b$12$somehash',
        }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-inactive', role: 'admin', adminRole: 'super_admin' },
    body: { email: 'new@uppolice.gov.in', currentPassword: 'Pass' },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /केवल सक्रिय Global Super Admin/);
});

// ------------------------------------------------------------
// 6. Protection of System Fields & Deletion Immunity
// ------------------------------------------------------------
test('Super Admin Contact — rejects attempts to modify protected fields (role, district, is_active)', async (t) => {
  const req = {
    user: { id: 'super-1', role: 'admin', adminRole: 'super_admin' },
    body: {
      email: 'admin@uppolice.gov.in',
      adminRole: 'district_admin', // Attempted role tampering
      district: 'लखनऊ', // Attempted district scoping
      currentPassword: 'Pass',
    },
  };
  const res = fakeRes();
  await updateSuperAdminContact(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /सुरक्षित फ़ील्ड "adminRole" में बदलाव की अनुमति नहीं है/);
});

test('Super Admin Protection — deleteAdmin rejects deleting Super Admin', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT * FROM admins WHERE id = $1')) {
      return {
        rows: [{ id: 'super-1', name: 'Super Admin', admin_role: 'super_admin' }],
      };
    }
    return { rows: [] };
  });

  const req = {
    user: { id: 'super-caller-1', adminRole: 'super_admin' },
    params: { id: 'super-1' },
  };
  const res = fakeRes();
  await deleteAdmin(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /Global Super Admin खाते को हटाया नहीं जा सकता/);
});

// ------------------------------------------------------------
// 7. Login Compatibility (Username or Email)
// ------------------------------------------------------------
test('Admin Login — authenticates successfully via username or newly updated email', async (t) => {
  const password = 'AdminSecretPass123!';
  const hashedPassword = await bcrypt.hash(password, 12);

  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('FROM admins') && (sql.includes('LOWER(TRIM(username))') || sql.includes('LOWER(TRIM(email))'))) {
      const queriedIdentifier = params[0]?.toLowerCase().trim();
      if (queriedIdentifier === 'superadmin_up' || queriedIdentifier === 'dg.police@uppolice.gov.in') {
        return {
          rows: [{
            id: 'super-login-1',
            name: 'मुख्य प्रशासक',
            username: 'superadmin_up',
            email: 'dg.police@uppolice.gov.in',
            mobile: '9450000555',
            password_hash: hashedPassword,
            admin_role: 'super_admin',
            is_active: true,
          }],
        };
      }
    }
    return { rows: [] };
  });

  // Login via email
  const reqEmail = {
    body: {
      username: 'dg.police@uppolice.gov.in',
      password: password,
    },
  };
  const resEmail = fakeRes();
  await adminLogin(reqEmail, resEmail);

  assert.equal(resEmail.statusCode, 200);
  assert.ok(resEmail.body.token);
  assert.equal(resEmail.body.user.email, 'dg.police@uppolice.gov.in');
  assert.equal(resEmail.body.user.username, 'superadmin_up');

  // Login via username
  const reqUser = {
    body: {
      username: 'superadmin_up',
      password: password,
    },
  };
  const resUser = fakeRes();
  await adminLogin(reqUser, resUser);

  assert.equal(resUser.statusCode, 200);
  assert.ok(resUser.body.token);
  assert.equal(resUser.body.user.username, 'superadmin_up');
});
