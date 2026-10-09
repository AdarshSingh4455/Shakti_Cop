// ============================================================
// ShaktiCop — सुरक्षित Super Admin Bootstrap CLI टूल
//
// ⚠️ सुरक्षा नियम:
// 1. यह टूल केवल अधिकृत व्यवस्थापक (operator) द्वारा मैन्युअली चलाया जाता है।
// 2. यह सर्वर स्टार्टअप, डिप्लॉयमेंट, या माइग्रेशन के दौरान कभी भी स्वचालित रूप से नहीं चलता।
// 3. इसमें कोई डिफ़ॉल्ट क्रेडेंशियल्स या पासवर्ड हार्डकोड नहीं हैं।
// 4. पासवर्ड टर्मिनल में बिना echo किए सुरक्षित रूप से लिया जाता है।
// 5. मौजूदा खाते को अप्रत्याशित रूप से बदलने से रोकता है — रीसेट/अपग्रेड के लिए स्पष्ट पुष्टि अनिवार्य है।
// 6. पासवर्ड या हैश कभी भी कंसोल में प्रिंट नहीं होता।
// 7. --dry-run मोड सुरक्षित रूप से सत्यापन चलाता है बिना DB में बदलाव किए।
// ============================================================

require('dotenv').config({ quiet: true });
const readline = require('readline');
const { Writable } = require('stream');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { validateName, validateMobile, validateEmail } = require('../utils/fieldValidators');
const { validateNewPassword } = require('../utils/passwordPolicy');

function maskMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') return '—';
  const clean = mobile.replace(/\D/g, '');
  if (clean.length < 4) return 'XXXX';
  return 'XXXXXX' + clean.slice(-4);
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {
    name: null,
    mobile: null,
    email: null,
    username: null,
    password: null,
    confirm: false,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--confirm' || arg === '--force') {
      args.confirm = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg.startsWith('--name=')) {
      args.name = arg.slice(7).trim();
    } else if (arg.startsWith('--mobile=')) {
      args.mobile = arg.slice(9).trim();
    } else if (arg.startsWith('--email=')) {
      args.email = arg.slice(8).trim();
    } else if (arg.startsWith('--username=')) {
      args.username = arg.slice(11).trim();
    }
  }

  return args;
}

function askQuestion(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function askHiddenPassword(query) {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(query);
    muted = true;
    rl.question('', (ans) => {
      process.stdout.write('\n');
      rl.close();
      resolve(ans.trim());
    });
  });
}

function validateBootstrapInput({ name, mobile, email, username, password }) {
  if (!name) return { ok: false, error: 'नाम आवश्यक है' };
  const nameErr = validateName(name);
  if (nameErr) return { ok: false, error: nameErr };

  if (!mobile) return { ok: false, error: 'मोबाइल नंबर आवश्यक है' };
  const mobileErr = validateMobile(mobile);
  if (mobileErr) return { ok: false, error: mobileErr };

  if (!email) return { ok: false, error: 'ईमेल आईडी आवश्यक है' };
  const emailErr = validateEmail(email);
  if (emailErr) return { ok: false, error: emailErr };

  if (!password) return { ok: false, error: 'पासवर्ड आवश्यक है' };
  const pwErr = validateNewPassword(password);
  if (pwErr) return { ok: false, error: pwErr };

  if (username && username.length > 50) {
    return { ok: false, error: 'यूज़रनेम अधिकतम 50 अक्षर का हो सकता है' };
  }

  return { ok: true };
}

async function runBootstrap(params, pool = db) {
  const validation = validateBootstrapInput(params);
  if (!validation.ok) {
    return { success: false, code: 'VALIDATION_ERROR', error: validation.error };
  }

  const { name, mobile, email, username, password, confirm, dryRun } = params;
  const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username ? username.trim() : cleanEmail.split('@')[0];

  const client = await pool.getClient();
  try {
    await client.query('BEGIN');

    // 1. जाँचें कि क्या इस मोबाइल, ईमेल या यूज़रनेम से पहले से कोई admin खाता मौजूद है
    const existing = await client.query(
      `SELECT id, name, username, mobile, email, admin_role, is_active
       FROM admins
       WHERE mobile = $1 OR LOWER(TRIM(email)) = $2
          OR ($3::text IS NOT NULL AND username IS NOT NULL AND LOWER(TRIM(username)) = $3)
`,
      [cleanMobile, cleanEmail, username ? username.trim().toLowerCase() : null]
    );

    if (existing.rows.length > 1) {
      await client.query('ROLLBACK');
      return {
        success: false,
        code: 'IDENTITY_CONFLICT',
        error: 'Multiple admin accounts match the supplied identifiers. No account was changed.',
      };
    }

    const exists = existing.rows.length === 1;
    const existingRow = exists ? existing.rows[0] : null;

    if (
      exists &&
      (
        String(existingRow.mobile || '').replace(/\D/g, '').slice(-10) !== cleanMobile ||
        String(existingRow.email || '').trim().toLowerCase() !== cleanEmail ||
        (username && existingRow.username && String(existingRow.username).trim().toLowerCase() !== username.trim().toLowerCase())
      )
    ) {
      await client.query("ROLLBACK");
      return {
        success: false,
        code: "IDENTITY_MISMATCH",
        error: "The supplied identifiers do not all match the existing admin account. No account was changed.",
      };
    }

    const finalUsername = exists && !username
      ? existingRow.username
      : cleanUsername;

    if (exists && !confirm) {
      await client.query('ROLLBACK');
      const roleText = existingRow.admin_role === 'super_admin' ? 'Super Admin' : existingRow.admin_role;
      return {
        success: false,
        code: 'CONFIRMATION_REQUIRED',
        error: `मौजूदा खाता पाया गया (${existingRow.name}, भूमिका: ${roleText})। इस खाते को Super Admin के रूप में रीसेट/अपडेट करने के लिए स्पष्ट पुष्टि (--confirm) आवश्यक है।`,
        existingAccount: {
          id: existingRow.id,
          name: existingRow.name,
          role: existingRow.admin_role,
          maskedMobile: maskMobile(existingRow.mobile),
          email: existingRow.email,
        },
      };
    }

    if (dryRun) {
      await client.query('ROLLBACK');
      return {
        success: true,
        dryRun: true,
        code: 'DRY_RUN_PASSED',
        message: 'DRY RUN सफल: सभी फ़ील्ड्स, पासवर्ड नीति और डेटाबेस पूर्व-सत्यापन सही हैं। कोई डेटाबेस परिवर्तन नहीं किया गया।',
        details: {
          name,
          username: cleanUsername,
          email: cleanEmail,
          maskedMobile: maskMobile(cleanMobile),
          role: 'super_admin',
          action: exists ? 'update_existing' : 'create_new',
        },
      };
    }

    // 2. Bcrypt हैश बनाएं (प्रोजेक्ट मानक: 12 राउंड्स)
    const passwordHash = await bcrypt.hash(password, 12);

    let result;
    let actionTaken;

    if (exists) {
      result = await client.query(
        `UPDATE admins
         SET name = $1, username = $2, mobile = $3, email = $4, password_hash = $5,
             admin_role = 'super_admin', rank = NULL, district = NULL, circle_stations = '[]',
             range_districts = '[]', menu_permissions = '{}', is_active = true, updated_at = now()
         WHERE id = $6
         RETURNING id, name, username, mobile, email, admin_role, is_active, updated_at`,
        [name.trim(), finalUsername, cleanMobile, cleanEmail, passwordHash, existingRow.id]
      );
      actionTaken = 'updated';
    } else {
      result = await client.query(
        `INSERT INTO admins (name, username, mobile, email, password_hash, admin_role, rank, district, circle_stations, range_districts, menu_permissions, is_active)
         VALUES ($1, $2, $3, $4, $5, 'super_admin', NULL, NULL, '[]', '[]', '{}', true)
         RETURNING id, name, username, mobile, email, admin_role, is_active, created_at`,
        [name.trim(), cleanUsername, cleanMobile, cleanEmail, passwordHash]
      );
      actionTaken = 'created';
    }

    const admin = result.rows[0];

    // Audit log failure must abort the transaction.
    await client.query(
      `INSERT INTO activity_logs (actor_role, actor_id, actor_name, action, details)
       VALUES ('system', $1, 'CLI_Bootstrap', 'super_admin_bootstrap', $2)`,
      [admin.id, `Super Admin खाता ${actionTaken === 'created' ? 'बनाया गया' : 'रीसेट/अपग्रेड किया गया'}: ${admin.name} (${cleanEmail})`]
    );
    await client.query('COMMIT');

    return {
      success: true,
      dryRun: false,
      action: actionTaken,
      admin: {
        id: admin.id,
        name: admin.name,
        username: admin.username,
        email: admin.email,
        maskedMobile: maskMobile(admin.mobile),
        role: admin.admin_role,
        isActive: admin.is_active,
      },
      message: `Super Admin खाता सफलतापूर्वक ${actionTaken === 'created' ? 'बनाया गया' : 'अद्यतन/रीसेट किया गया'}।`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseCliArgs();

  console.log('====================================================');
  console.log('ShaktiCop — Super Admin Bootstrap Utility');
  console.log('====================================================');

  if (args.dryRun) {
    console.log('ℹ️  MODE: DRY-RUN (डेटाबेस में कोई परिवर्तन नहीं किया जाएगा)\n');
  }

  const isInteractive = process.stdin.isTTY;

  let name = args.name;
  let mobile = args.mobile;
  let email = args.email;
  let username = args.username;
  let password = args.password;
  let confirm = args.confirm;

  if (isInteractive) {
    if (!name) name = await askQuestion('पूरा नाम (उदा. मुख्य प्रशासक): ');
    if (!mobile) mobile = await askQuestion('10 अंकों का मोबाइल नंबर: ');
    if (!email) email = await askQuestion('ईमेल आईडी (उदा. admin@uppolice.gov.in): ');
    if (!username) username = await askQuestion(`यूज़रनेम (वैकल्पिक, Enter दबाने पर ${email.split('@')[0]}): `);
    if (!password) {
      password = await askHiddenPassword('मज़बूत पासवर्ड (8-16 अक्षर, स्क्रीन पर नहीं दिखेगा): ');
      const confirmPw = await askHiddenPassword('पासवर्ड दोबारा दर्ज करें: ');
      if (password !== confirmPw) {
        console.error('❌ दोनों बार दर्ज किए गए पासवर्ड मेल नहीं खाते।');
        process.exit(1);
      }
    }
  }

  if (!name || !mobile || !email || !password) {
    console.error('❌ सभी आवश्यक फ़ील्ड्स प्रदान करना अनिवार्य है: name, mobile, email, password');
    console.error('उपयोग:');
    console.error('  npm run admin:bootstrap -- --name="नाम" --mobile="9876543210" --email="admin@uppolice.gov.in" --dry-run');
    process.exit(1);
  }

  try {
    let result = await runBootstrap({
      name,
      mobile,
      email,
      username,
      password,
      confirm,
      dryRun: args.dryRun,
    });

    if (!result.success && result.code === 'CONFIRMATION_REQUIRED' && isInteractive) {
      console.log(`\n⚠️  ${result.error}`);
      const answer = await askQuestion('क्या आप इस खाते को Super Admin के रूप में रीसेट/अपग्रेड करना चाहते हैं? (yes/no): ');
      if (answer.toLowerCase() === 'yes') {
        result = await runBootstrap({
          name,
          mobile,
          email,
          username,
          password,
          confirm: true,
          dryRun: args.dryRun,
        });
      } else {
        console.log('प्रक्रिया निरस्त कर दी गई। डेटाबेस में कोई बदलाव नहीं हुआ।');
        process.exit(0);
      }
    }

    if (!result.success) {
      console.error(`\n❌ असफलता: ${result.error}`);
      process.exit(1);
    }

    console.log('\n====================================================');
    if (result.dryRun) {
      console.log('✅ ' + result.message);
      console.log('नाम:', result.details.name);
      console.log('ईमेल:', result.details.email);
      console.log('मोबाइल:', result.details.maskedMobile);
      console.log('भूमिका:', result.details.role);
    } else {
      console.log('✅ ' + result.message);
      console.log('ID:', result.admin.id);
      console.log('नाम:', result.admin.name);
      console.log('ईमेल:', result.admin.email);
      console.log('मोबाइल:', result.admin.maskedMobile);
      console.log('भूमिका:', result.admin.role);
      console.log('सक्रिय स्थिति:', result.admin.isActive);
    }
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ अनपेक्षित त्रुटि:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runBootstrap,
  validateBootstrapInput,
  parseCliArgs,
  maskMobile,
};
