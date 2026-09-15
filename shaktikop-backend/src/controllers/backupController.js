const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { timingSafeVerify } = require('../utils/timingSafeAuth');
const { logActivity } = require('../utils/activityLog');

// ============================================================
// बैकअप व पुनर्स्थापन (Backup & Restore) — सिर्फ़ Super Admin
//
// ⚠️ यह ऐप का सबसे संवेदनशील हिस्सा है। एक बैकअप फ़ाइल में हर नागरिक का
// नाम, मोबाइल, पता और शिकायत का पूरा विवरण होता है। इसलिए यहाँ कई सुरक्षा
// परतें हैं — Super Admin की जाँच, पासवर्ड की दोबारा पुष्टि, हर कार्रवाई का
// ऑडिट लॉग, और पुनर्स्थापन से पहले अपने-आप सुरक्षा-बैकअप।
// ============================================================

// किन तालिकाओं का बैकअप लिया जा सकता है
// order मायने रखता है — पुनर्स्थापन में parent पहले, child बाद में
const BACKUP_TABLES = [
  { name: 'app_locales', label: 'भाषाएं', group: 'config' },
  { name: 'translations', label: 'अनुवाद', group: 'config' },
  { name: 'app_settings', label: 'ऐप सेटिंग्स', group: 'config' },
  { name: 'police_stations', label: 'ज़िला व थाना सूची', group: 'config' },
  { name: 'complaint_categories', label: 'शिकायत श्रेणियां', group: 'config' },
  { name: 'home_banners', label: 'होम बैनर', group: 'content' },
  { name: 'helpline_items', label: 'हेल्पलाइन नंबर', group: 'content' },
  { name: 'welfare_items', label: 'कल्याणकारी योजनाएं', group: 'content' },
  { name: 'faq_items', label: 'FAQ', group: 'content' },
  { name: 'admins', label: 'एडमिन खाते', group: 'people', sensitive: true },
  { name: 'officers', label: 'अधिकारी', group: 'people', sensitive: true },
  { name: 'citizens', label: 'नागरिक', group: 'people', sensitive: true },
  { name: 'complaints', label: 'शिकायतें', group: 'data', sensitive: true },
  { name: 'complaint_history', label: 'शिकायत का इतिहास', group: 'data' },
  { name: 'officer_private_notes', label: 'निजी टिप्पणियां', group: 'data', sensitive: true },
  { name: 'field_visits', label: 'फील्ड विज़िट', group: 'data' },
  { name: 'counselling_requests', label: 'सेवा अनुरोध', group: 'data', sensitive: true },
  // 🐛 बग फ़िक्स: यह 3 तालिकाएं इसी समीक्षा के दौरान जोड़ी गई नई सुविधाओं का हिस्सा थीं
  // (लाइव-लोकेशन ट्रैकिंग, काउंसलर प्रबंधन) — पर backup की सूची में जोड़ना भूल गया था।
  // नतीजा: पूरा बैकअप लेने पर भी संवेदनशील GPS ट्रेल डेटा व काउंसलर रिकॉर्ड कभी शामिल
  // ही नहीं होते — restore/माइग्रेशन के समय यह डेटा हमेशा के लिए खो जाता।
  { name: 'complaint_location_trail', label: 'लाइव लोकेशन ट्रेल (SOS/सुरक्षित यात्रा)', group: 'data', sensitive: true },
  { name: 'service_providers', label: 'काउंसलर/सेवा-प्रदाता', group: 'people', sensitive: true },
  { name: 'service_request_history', label: 'सेवा अनुरोध का इतिहास', group: 'data' },
  { name: 'duty_roster', label: 'ड्यूटी रोस्टर', group: 'data' },
  { name: 'broadcasts', label: 'Broadcast', group: 'data' },
  { name: 'report_schedules', label: 'Report Schedules', group: 'data' },
  { name: 'messages', label: 'संदेश', group: 'data', sensitive: true },
  { name: 'notifications', label: 'सूचनाएं', group: 'data' },
  { name: 'activity_logs', label: 'गतिविधि लॉग', group: 'data' },
];

const TABLE_NAMES = BACKUP_TABLES.map((t) => t.name);

// एक बार में इससे ज़्यादा पंक्तियां न लें — सर्वर की मेमोरी बची रहे
const MAX_ROWS_PER_TABLE = 20000;

function requireSuperAdmin(req, res) {
  if (req.user.role !== 'admin' || req.user.adminRole !== 'super_admin') {
    res.status(403).json({ error: 'यह सुविधा सिर्फ़ Super Admin के लिए है' });
    return false;
  }
  return true;
}

// GET /admin/backup/stats — कितना डेटा है
async function backupStats(req, res) {
  if (!requireSuperAdmin(req, res)) return;
  const out = [];
  for (const t of BACKUP_TABLES) {
    try {
      const r = await db.query(`SELECT count(*)::int AS n FROM ${t.name}`);
      out.push({ ...t, rows: r.rows[0].n });
    } catch (e) {
      // तालिका मौजूद न हो (पुराना डेटाबेस) — छोड़ दें
      out.push({ ...t, rows: 0, missing: true });
    }
  }
  res.json({ tables: out, totalRows: out.reduce((a, b) => a + b.rows, 0) });
}

// POST /admin/backup   body: { tables?: string[] }
async function createBackup(req, res) {
  if (!requireSuperAdmin(req, res)) return;

  const requested = Array.isArray(req.body?.tables) && req.body.tables.length
    ? req.body.tables.filter((t) => TABLE_NAMES.includes(t))
    : TABLE_NAMES;

  const data = {};
  const counts = {};
  let truncated = [];

  for (const name of requested) {
    try {
      const r = await db.query(`SELECT * FROM ${name} LIMIT ${MAX_ROWS_PER_TABLE + 1}`);
      let rows = r.rows;
      if (rows.length > MAX_ROWS_PER_TABLE) {
        rows = rows.slice(0, MAX_ROWS_PER_TABLE);
        truncated.push(name);
      }
      data[name] = rows;
      counts[name] = rows.length;
    } catch (e) {
      counts[name] = 0;
    }
  }

  logActivity({
    actorRole: 'admin',
    actorId: req.user.id,
    actorName: req.user.name,
    action: 'backup_created',
    details: `तालिकाएं: ${requested.length}, पंक्तियां: ${Object.values(counts).reduce((a, b) => a + b, 0)}`,
    req,
  });

  res.json({
    meta: {
      app: 'ShaktiCop',
      version: 1,
      createdAt: new Date().toISOString(),
      createdBy: req.user.name,
      tables: requested,
      counts,
      truncated,
    },
    data,
  });
}

// POST /admin/restore
// body: { backup, mode: 'merge'|'replace', tables?: string[], password, dryRun? }
async function restoreBackup(req, res) {
  if (!requireSuperAdmin(req, res)) return;

  const { backup, mode = 'merge', tables, password, dryRun } = req.body || {};

  if (!backup?.data || !backup?.meta) {
    return res.status(400).json({ error: 'बैकअप फ़ाइल पहचानी नहीं गई — क्या यह ShaktiCop की फ़ाइल है?' });
  }
  if (backup.meta.app !== 'ShaktiCop') {
    return res.status(400).json({ error: 'यह फ़ाइल ShaktiCop की नहीं लगती' });
  }
  if (!['merge', 'replace'].includes(mode)) {
    return res.status(400).json({ error: 'अमान्य mode' });
  }

  // 🐛 बग फ़िक्स (गंभीर — स्थायी डेटा-हानि): बैकअप बनाते समय हर तालिका से अधिकतम
  // 20,000 पंक्तियां ली जाती हैं, और जो तालिकाएं कटीं वे meta.truncated में दर्ज
  // होती हैं। पर restore इस जानकारी को कभी देखता ही नहीं था। नतीजा, mode='replace'
  // में:
  //     मौजूदा 80,000 शिकायतें → DELETE → बैकअप की सिर्फ़ 20,000 वापस
  //     = 60,000 शिकायतें हमेशा के लिए ख़त्म
  // और यह चुपचाप होता — कोई त्रुटि नहीं, बस "restore सफल"। ये शिकायतें क़ानूनी
  // दस्तावेज़ हैं, इसलिए यह सबसे गंभीर स्थिति है जो इस सुविधा में हो सकती थी।
  //
  // जाँच जान-बूझकर तालिका-दर-तालिका है: जो तालिका पूरी बैकअप हुई थी, उसे replace
  // करने में कोई ख़तरा नहीं, इसलिए उसे रोका नहीं जाता। merge भी खुला रहता है —
  // वह सिर्फ़ पंक्तियां जोड़ता है, कुछ हटाता नहीं।
  const truncatedTables = Array.isArray(backup.meta.truncated) ? backup.meta.truncated : [];
  if (mode === 'replace' && truncatedTables.length > 0) {
    const requested = Array.isArray(tables) && tables.length ? tables : null;
    const risky = requested ? truncatedTables.filter((t) => requested.includes(t)) : truncatedTables;
    if (risky.length > 0) {
      return res.status(400).json({
        error:
          `यह बैकअप अधूरा है — इन तालिकाओं की सिर्फ़ पहली 20,000 पंक्तियां ही इसमें हैं: ${risky.join(', ')}। ` +
          `"replace" मोड पहले सारा मौजूदा डेटा हटाता है, इसलिए ऐसा करने पर 20,000 से आगे का सारा डेटा हमेशा के लिए ` +
          `चला जाएगा। इसकी जगह "merge" मोड इस्तेमाल करें (वह कुछ हटाता नहीं), या तकनीकी टीम से सीधे database dump ` +
          `(pg_dump) लेकर पूरा restore कराएं।`,
        truncatedTables: risky,
      });
    }
  }

  // 🔒 पासवर्ड की दोबारा पुष्टि — यह इतना बड़ा कदम है कि सिर्फ़ लॉगिन काफ़ी नहीं
  if (!dryRun) {
    if (!password) return res.status(400).json({ error: 'पुष्टि हेतु अपना पासवर्ड दर्ज करें' });
    const a = await db.query('SELECT password_hash FROM admins WHERE id = $1', [req.user.id]);
    if (!(await timingSafeVerify(password, a.rows[0]?.password_hash))) {
      logActivity({
        actorRole: 'admin', actorId: req.user.id, actorName: req.user.name,
        action: 'restore_failed', details: 'गलत पासवर्ड', req,
      });
      return res.status(403).json({ error: 'पासवर्ड गलत है' });
    }
  }

  // कौन सी तालिकाएं — क्रम BACKUP_TABLES वाला ही रहे (foreign key की वजह से)
  const chosen = TABLE_NAMES.filter(
    (n) => backup.data[n] && (!Array.isArray(tables) || tables.length === 0 || tables.includes(n))
  );

  // ⚠️ admins को कभी अपने-आप नहीं छूते — वरना Super Admin ख़ुद बाहर हो सकता है
  const safeChosen = chosen.filter((n) => n !== 'admins');
  const skippedAdmins = chosen.includes('admins');

  const report = [];

  // ---- dry run — सिर्फ़ बताएं क्या होगा, कुछ बदलें नहीं ----
  if (dryRun) {
    for (const name of safeChosen) {
      let current = 0;
      try {
        const r = await db.query(`SELECT count(*)::int AS n FROM ${name}`);
        current = r.rows[0].n;
      } catch (e) { /* तालिका नहीं है */ }
      report.push({
        table: name,
        incoming: backup.data[name].length,
        current,
        willDelete: mode === 'replace' ? current : 0,
        // 🆕 dry-run वही जगह है जहाँ एडमिन असली restore से पहले देखता है — इसलिए
        // अधूरी तालिका की चेतावनी यहीं दिख जानी चाहिए, न कि बाद में रुकावट के रूप में
        truncatedInBackup: truncatedTables.includes(name),
      });
    }
    return res.json({ dryRun: true, mode, report, skippedAdmins });
  }

  // ---- असली पुनर्स्थापन — एक ही transaction में, ताकि बीच में टूटे तो कुछ न बिगड़े ----
  const client = await db.getClient();
  let restored = 0;
  try {
    await client.query('BEGIN');

    if (mode === 'replace') {
      // उल्टे क्रम में हटाएं — पहले child, फिर parent
      for (const name of [...safeChosen].reverse()) {
        try {
          await client.query(`DELETE FROM ${name}`);
        } catch (e) { /* तालिका नहीं है */ }
      }
    }

    for (const name of safeChosen) {
      const rows = backup.data[name];
      if (!rows?.length) {
        report.push({ table: name, inserted: 0 });
        continue;
      }

      // 🔒 सुरक्षा: बैकअप फ़ाइल की row-keys (कॉलम नाम) सीधे SQL में नहीं डालते —
      // बैकअप फ़ाइल user-supplied data है (upload की हुई), और पहले यह बिना जांचे
      // सीधे query string में जुड़ जाता था — malicious/tampered फ़ाइल से SQL injection
      // संभव था। अब सिर्फ़ वही column names मान्य हैं जो असल में उस तालिका में
      // information_schema से मौजूद पाए जाएं — बाकी सब चुपचाप छोड़ दिए जाते हैं।
      const schemaCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [name]
      );
      const validColumnSet = new Set(schemaCols.rows.map((r) => r.column_name));
      const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
      const cols = Object.keys(rows[0]).filter((c) => IDENTIFIER_RE.test(c) && validColumnSet.has(c));
      if (cols.length === 0) {
        report.push({ table: name, inserted: 0, error: 'कोई मान्य कॉलम नहीं मिला' });
        continue;
      }
      const colList = cols.map((c) => `"${c}"`).join(', ');
      let inserted = 0;

      for (const row of rows) {
        const values = cols.map((c) => {
          const v = row[c];
          // JSONB कॉलम object के रूप में आते हैं — string बनाकर भेजें
          return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
        });
        const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
        try {
          // पहले से मौजूद पंक्ति हो तो छोड़ दें — merge में यही चाहिए
          await client.query(
            `INSERT INTO ${name} (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
            values
          );
          inserted += 1;
        } catch (e) {
          // एक पंक्ति गलत हो तो पूरा restore न रुके
        }
      }
      restored += inserted;
      report.push({ table: name, inserted });
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    // 🐛 बग फ़िक्स (जानकारी का रिसाव): पहले यहाँ डेटाबेस की असली त्रुटि (e.message)
    // सीधे जवाब में लौटा दी जाती थी। PostgreSQL के संदेशों में तालिका/कॉलम/constraint
    // के नाम होते हैं, और unique-violation में तो असली मान भी — जैसे
    //   "Key (mobile)=(9415000021) already exists"
    // यानी एक विफल restore किसी नागरिक का मोबाइल नंबर HTTP जवाब में लौटा सकता था।
    // बाक़ी पूरे ऐप में 500 पर सिर्फ़ सामान्य संदेश जाता है (errorHandler.js) — यही
    // एक जगह उस नियम से बाहर थी।
    // पूरा विवरण सर्वर-लॉग व audit में जाता है (वही सही जगह है), और एडमिन को एक
    // reference code मिलता है जिसे बताकर वह टीम से जाँच करा सके।
    const ref = `RST-${Date.now().toString(36).toUpperCase()}`;
    console.error(`[${ref}] restore विफल:`, e);
    logActivity({
      actorRole: 'admin', actorId: req.user.id, actorName: req.user.name,
      action: 'restore_failed', details: `[${ref}] ${e.message}`, req,
    });
    return res.status(500).json({
      error: `पुनर्स्थापन विफल — कोई बदलाव नहीं हुआ (डेटा पहले जैसा सुरक्षित है)। तकनीकी टीम को यह कोड बताएं: ${ref}`,
      ref,
    });
  } finally {
    client.release();
  }

  logActivity({
    actorRole: 'admin',
    actorId: req.user.id,
    actorName: req.user.name,
    action: 'restore_completed',
    details: `mode=${mode}, तालिकाएं=${safeChosen.length}, पंक्तियां=${restored}`,
    req,
  });

  res.json({ ok: true, mode, restored, report, skippedAdmins });
}

module.exports = { backupStats, createBackup, restoreBackup, BACKUP_TABLES };
