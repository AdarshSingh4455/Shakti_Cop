// ============================================================
// test/bootstrapSuperAdmin.test.js
//
// Tests for Super Admin Bootstrap CLI Utility:
// 1. Mobile masking
// 2. CLI argument parsing
// 3. Input validation against security policy
// 4. Safe Dry-Run mode (read-only verification, transaction rollback)
// 5. Existing account protection (refusal without explicit confirmation)
// 6. Confirmed account update / upgrade to super_admin
// 7. New super_admin creation with bcrypt hash (work factor 12)
// 8. Transaction safety and rollback on unexpected DB errors
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const {
  runBootstrap,
  validateBootstrapInput,
  parseCliArgs,
  maskMobile,
} = require('../src/scripts/bootstrapSuperAdmin');

function createMockPool({ existingRows = [], insertReturnRow = null, updateReturnRow = null, failOnQuery = null } = {}) {
  const executedQueries = [];
  let clientReleased = false;

  const mockClient = {
    async query(sql, params = []) {
      executedQueries.push({ sql, params });

      if (failOnQuery && sql.includes(failOnQuery)) {
        throw new Error(`Simulated database failure on ${failOnQuery}`);
      }

      if (sql.includes('FROM admins') && sql.includes('WHERE mobile = $1')) {
        return { rows: existingRows };
      }

      if (sql.includes('UPDATE admins')) {
        return {
          rows: [
            updateReturnRow || {
              id: existingRows[0]?.id || 'admin-uuid-1',
              name: params[0],
              username: params[1],
              mobile: params[2],
              email: params[3],
              admin_role: 'super_admin',
              is_active: true,
              updated_at: new Date(),
            },
          ],
        };
      }

      if (sql.includes('INSERT INTO admins')) {
        return {
          rows: [
            insertReturnRow || {
              id: 'new-admin-uuid',
              name: params[0],
              username: params[1],
              mobile: params[2],
              email: params[3],
              admin_role: 'super_admin',
              is_active: true,
              created_at: new Date(),
            },
          ],
        };
      }

      if (sql.includes('INSERT INTO activity_logs')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
    release() {
      clientReleased = true;
    },
  };

  const mockPool = {
    async getClient() {
      return mockClient;
    },
  };

  return { mockPool, mockClient, executedQueries, isReleased: () => clientReleased };
}

// ------------------------------------------------------------
// 1. Mobile Masking Tests
// ------------------------------------------------------------
test('maskMobile — correctly masks 10-digit mobile number', () => {
  assert.equal(maskMobile('9876543210'), 'XXXXXX3210');
  assert.equal(maskMobile('+91 9876543210'), 'XXXXXX3210');
  assert.equal(maskMobile(''), '—');
  assert.equal(maskMobile(null), '—');
});

// ------------------------------------------------------------
// 2. CLI Arguments Parsing Tests
// ------------------------------------------------------------
test('parseCliArgs — correctly extracts flags and options', () => {
  const argv = [
    '--name=Super Admin',
    '--mobile=9876543210',
    '--email=super@uppolice.gov.in',
    '--username=superadmin',
    '--dry-run',
    '--confirm',
  ];

  const parsed = parseCliArgs(argv);
  assert.equal(parsed.name, 'Super Admin');
  assert.equal(parsed.mobile, '9876543210');
  assert.equal(parsed.email, 'super@uppolice.gov.in');
  assert.equal(parsed.username, 'superadmin');
  assert.equal(parsed.password, null);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.confirm, true);
});

// ------------------------------------------------------------
// 3. Input Validation Tests
// ------------------------------------------------------------
test('validateBootstrapInput — rejects missing or invalid fields', () => {
  // Missing name
  const noName = validateBootstrapInput({
    name: '',
    mobile: '9876543210',
    email: 'admin@uppolice.gov.in',
    password: 'ValidPassword1',
  });
  assert.equal(noName.ok, false);
  assert.match(noName.error, /नाम/);

  // Invalid name with numbers
  const numName = validateBootstrapInput({
    name: 'Admin 123',
    mobile: '9876543210',
    email: 'admin@uppolice.gov.in',
    password: 'ValidPassword1',
  });
  assert.equal(numName.ok, false);
  assert.match(numName.error, /अंक/);

  // Invalid mobile
  const badMobile = validateBootstrapInput({
    name: 'सुपर व्यवस्थापक',
    mobile: '12345',
    email: 'admin@uppolice.gov.in',
    password: 'ValidPassword1',
  });
  assert.equal(badMobile.ok, false);
  assert.match(badMobile.error, /मोबाइल/);

  // Invalid email
  const badEmail = validateBootstrapInput({
    name: 'सुपर व्यवस्थापक',
    mobile: '9876543210',
    email: 'not-an-email',
    password: 'ValidPassword1',
  });
  assert.equal(badEmail.ok, false);
  assert.match(badEmail.error, /ईमेल/);

  // Weak password (too short)
  const shortPw = validateBootstrapInput({
    name: 'सुपर व्यवस्थापक',
    mobile: '9876543210',
    email: 'admin@uppolice.gov.in',
    password: 'short',
  });
  assert.equal(shortPw.ok, false);
  assert.match(shortPw.error, /पासवर्ड/);

  // Weak password (all single class)
  const singleClassPw = validateBootstrapInput({
    name: 'सुपर व्यवस्थापक',
    mobile: '9876543210',
    email: 'admin@uppolice.gov.in',
    password: 'alllowercaseletters',
  });
  assert.equal(singleClassPw.ok, false);

  // Valid input
  const valid = validateBootstrapInput({
    name: 'सुपर व्यवस्थापक',
    mobile: '9876543210',
    email: 'admin@uppolice.gov.in',
    password: 'StrongPassword1',
  });
  assert.equal(valid.ok, true);
});

// ------------------------------------------------------------
// 4. Dry-Run Mode Tests
// ------------------------------------------------------------
test('runBootstrap — --dry-run validates and rolls back without committing changes', async () => {
  const { mockPool, executedQueries, isReleased } = createMockPool();

  const result = await runBootstrap(
    {
      name: 'सुपर व्यवस्थापक',
      mobile: '9876543210',
      email: 'super@uppolice.gov.in',
      password: 'StrongPassword1',
      dryRun: true,
    },
    mockPool
  );

  assert.equal(result.success, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.code, 'DRY_RUN_PASSED');
  assert.equal(result.details.role, 'super_admin');
  assert.equal(result.details.action, 'create_new');

  // Verify BEGIN and ROLLBACK were called, but NO COMMIT
  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('BEGIN'), 'Must start transaction');
  assert.ok(queryTexts.includes('ROLLBACK'), 'Must rollback dry run');
  assert.ok(!queryTexts.includes('COMMIT'), 'Must NOT commit transaction');
  assert.ok(isReleased(), 'Client must be released back to pool');
});

// ------------------------------------------------------------
// 5. Existing Account Protection (Refusal without confirmation)
// ------------------------------------------------------------
test('runBootstrap — refuses to overwrite existing account without explicit confirm', async () => {
  const existingAccount = {
    id: 'existing-admin-id',
    name: 'पुराना एडमिन',
    username: 'oldadmin',
    mobile: '9876543210',
    email: 'old@uppolice.gov.in',
    admin_role: 'district_admin',
    is_active: true,
  };

  const { mockPool, executedQueries, isReleased } = createMockPool({
    existingRows: [existingAccount],
  });

  const result = await runBootstrap(
    {
      name: 'नया सुपर एडमिन',
      mobile: '9876543210',
      email: 'old@uppolice.gov.in',
      password: 'StrongPassword1',
      confirm: false,
    },
    mockPool
  );

  assert.equal(result.success, false);
  assert.equal(result.code, 'CONFIRMATION_REQUIRED');
  assert.match(result.error, /स्पष्ट पुष्टि \(--confirm\) आवश्यक है/);
  assert.equal(result.existingAccount.id, 'existing-admin-id');
  assert.equal(result.existingAccount.maskedMobile, 'XXXXXX3210');

  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('ROLLBACK'), 'Must rollback on confirmation requirement');
  assert.ok(!queryTexts.some((q) => q.includes('UPDATE admins')), 'Must NOT execute UPDATE');
  assert.ok(!queryTexts.includes('COMMIT'), 'Must NOT commit transaction');
  assert.ok(isReleased(), 'Client must be released back to pool');
});

// ------------------------------------------------------------
// 6. Account Update with Explicit Confirmation
// ------------------------------------------------------------
test('runBootstrap — updates existing account to super_admin when confirm is true', async () => {
  const existingAccount = {
    id: 'existing-admin-id',
    name: 'पुराना एडमिन',
    username: 'oldadmin',
    mobile: '9876543210',
    email: 'old@uppolice.gov.in',
    admin_role: 'district_admin',
    is_active: true,
  };

  const { mockPool, executedQueries, isReleased } = createMockPool({
    existingRows: [existingAccount],
  });

  const result = await runBootstrap(
    {
      name: 'अपग्रेडेड सुपर एडमिन',
      mobile: '9876543210',
      email: 'old@uppolice.gov.in',
      password: 'StrongPassword1',
      confirm: true,
    },
    mockPool
  );

  assert.equal(result.success, true);
  assert.equal(result.action, 'updated');
  assert.equal(result.admin.role, 'super_admin');

  const updateQuery = executedQueries.find((q) => q.sql.includes('UPDATE admins'));
  assert.ok(updateQuery, 'Must execute UPDATE query');

  // Verify bcrypt hash passed in parameter 5
  const passwordHash = updateQuery.params[4];
  assert.ok(passwordHash.startsWith('$2'), 'Must be a valid bcrypt hash');
  const isValidBcrypt = await bcrypt.compare('StrongPassword1', passwordHash);
  assert.equal(isValidBcrypt, true, 'Stored hash must verify against input password');

  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('COMMIT'), 'Must commit transaction');
  assert.ok(isReleased(), 'Client must be released back to pool');
});

// ------------------------------------------------------------
// 7. New Super Admin Creation
// ------------------------------------------------------------
test('runBootstrap — successfully creates new super_admin account with bcrypt work factor 12', async () => {
  const { mockPool, executedQueries, isReleased } = createMockPool({
    existingRows: [],
  });

  const result = await runBootstrap(
    {
      name: 'मुख्य व्यवस्थापक',
      mobile: '9876543210',
      email: 'super@uppolice.gov.in',
      password: 'StrongPassword1',
    },
    mockPool
  );

  assert.equal(result.success, true);
  assert.equal(result.action, 'created');
  assert.equal(result.admin.role, 'super_admin');
  assert.equal(result.admin.name, 'मुख्य व्यवस्थापक');

  const insertQuery = executedQueries.find((q) => q.sql.includes('INSERT INTO admins'));
  assert.ok(insertQuery, 'Must execute INSERT query');

  const passwordHash = insertQuery.params[4];
  assert.ok(passwordHash.startsWith('$2'), 'Must be a valid bcrypt hash');
  const isValidBcrypt = await bcrypt.compare('StrongPassword1', passwordHash);
  assert.equal(isValidBcrypt, true, 'Stored hash must verify against input password');

  // Verify activity log insert was called
  const logQuery = executedQueries.find((q) => q.sql.includes('INSERT INTO activity_logs'));
  assert.ok(logQuery, 'Must record audit log entry');

  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('COMMIT'), 'Must commit transaction');
  assert.ok(isReleased(), 'Client must be released back to pool');
});

// ------------------------------------------------------------
// 8. Error Handling and Transaction Safety
// ------------------------------------------------------------
test('runBootstrap — rolls back transaction and releases client if an error occurs', async () => {
  const { mockPool, executedQueries, isReleased } = createMockPool({
    failOnQuery: 'SELECT id, name, username',
  });

  await assert.rejects(
    async () => {
      await runBootstrap(
        {
          name: 'मुख्य व्यवस्थापक',
          mobile: '9876543210',
          email: 'super@uppolice.gov.in',
          password: 'StrongPassword1',
        },
        mockPool
      );
    },
    { message: /Simulated database failure/ }
  );

  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('ROLLBACK'), 'Must rollback transaction on error');
  assert.ok(!queryTexts.includes('COMMIT'), 'Must NOT commit transaction');
  assert.ok(isReleased(), 'Client must be released back to pool');
});

test('runBootstrap — rolls back when audit log insertion fails', async () => {
  const { mockPool, executedQueries, isReleased } = createMockPool({
    failOnQuery: 'INSERT INTO activity_logs',
  });

  await assert.rejects(
    async () => {
      await runBootstrap(
        {
          name: 'Test Admin',
          mobile: '9876543210',
          email: 'audit-test@uppolice.gov.in',
          password: 'StrongPassword1',
        },
        mockPool
      );
    },
    { message: /Simulated database failure/ }
  );

  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('ROLLBACK'), 'Must rollback when audit log fails');
  assert.ok(!queryTexts.includes('COMMIT'), 'Must not commit when audit log fails');
  assert.ok(isReleased(), 'Client must be released after audit log failure');
});

test('runBootstrap — safely refuses when multiple matching accounts are found', async () => {
  const accounts = [
    { id: 'admin-1', name: 'Admin 1', mobile: '9876543210', email: 'one@uppolice.gov.in', admin_role: 'district_admin' },
    { id: 'admin-2', name: 'Admin 2', mobile: '9876543211', email: 'two@uppolice.gov.in', admin_role: 'monitor' },
  ];
  const { mockPool, executedQueries, isReleased } = createMockPool({ existingRows: accounts });
  const result = await runBootstrap(
    {
      name: 'Super Admin',
      mobile: '9876543210',
      email: 'two@uppolice.gov.in',
      password: 'StrongPassword1',
    },
    mockPool
  );

  assert.equal(result.success, false);
  assert.equal(result.code, 'IDENTITY_CONFLICT');
  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('ROLLBACK'), 'Must rollback on multiple matches');
  assert.ok(!queryTexts.includes('COMMIT'), 'Must not commit on multiple matches');
  assert.ok(isReleased(), 'Client must be released on multiple matches');
});

test('runBootstrap — safely refuses when account is matched by one identifier but another conflicts', async () => {
  const account = {
    id: 'admin-1',
    name: 'Admin 1',
    mobile: '9876543210',
    email: 'actual@uppolice.gov.in',
    username: 'actualuser',
    admin_role: 'district_admin',
  };
  const { mockPool, executedQueries, isReleased } = createMockPool({ existingRows: [account] });
  // Mobile matches, but email is different and conflicts
  const result = await runBootstrap(
    {
      name: 'Super Admin',
      mobile: '9876543210',
      email: 'different@uppolice.gov.in',
      password: 'StrongPassword1',
    },
    mockPool
  );

  assert.equal(result.success, false);
  assert.equal(result.code, 'IDENTITY_MISMATCH');
  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('ROLLBACK'), 'Must rollback on identifier conflict');
  assert.ok(!queryTexts.includes('COMMIT'), 'Must not commit on identifier conflict');
  assert.ok(isReleased(), 'Client must be released on identifier conflict');
});

test('runBootstrap — safely refuses on explicit username mismatch', async () => {
  const account = {
    id: 'admin-1',
    name: 'Admin 1',
    mobile: '9876543210',
    email: 'actual@uppolice.gov.in',
    username: 'existing_handle',
    admin_role: 'district_admin',
  };
  const { mockPool, executedQueries, isReleased } = createMockPool({ existingRows: [account] });
  // Mobile and email match, but explicit username is conflicting
  const result = await runBootstrap(
    {
      name: 'Super Admin',
      mobile: '9876543210',
      email: 'actual@uppolice.gov.in',
      username: 'conflicting_handle',
      password: 'StrongPassword1',
    },
    mockPool
  );

  assert.equal(result.success, false);
  assert.equal(result.code, 'IDENTITY_MISMATCH');
  const queryTexts = executedQueries.map((q) => q.sql);
  assert.ok(queryTexts.includes('ROLLBACK'), 'Must rollback on explicit username mismatch');
  assert.ok(!queryTexts.includes('COMMIT'), 'Must not commit on explicit username mismatch');
  assert.ok(isReleased(), 'Client must be released on explicit username mismatch');
});

test('runBootstrap — preserves existing username when username is omitted on confirmed update', async () => {
  const account = {
    id: 'admin-1',
    name: 'Admin 1',
    mobile: '9876543210',
    email: 'actual@uppolice.gov.in',
    username: 'pre_existing_username',
    admin_role: 'district_admin',
  };
  const { mockPool, executedQueries, isReleased } = createMockPool({ existingRows: [account] });
  // Username omitted
  const result = await runBootstrap(
    {
      name: 'Super Admin',
      mobile: '9876543210',
      email: 'actual@uppolice.gov.in',
      password: 'StrongPassword1',
      confirm: true,
    },
    mockPool
  );

  assert.equal(result.success, true);
  assert.equal(result.action, 'updated');
  const updateQuery = executedQueries.find((q) => q.sql.includes('UPDATE admins'));
  assert.ok(updateQuery, 'Must execute UPDATE');
  assert.equal(updateQuery.params[1], 'pre_existing_username', 'Must preserve existing username rather than inferring from email');
  assert.ok(isReleased(), 'Client must be released');
});
