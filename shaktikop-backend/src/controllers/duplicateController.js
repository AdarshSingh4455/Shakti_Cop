const db = require('../config/db');
const { logActivity } = require('../utils/activityLog');
const { buildScopeClause } = require('../utils/scopeFilter');
const { canViewComplaint } = require('./complaintController');
const { decryptField } = require('../utils/fieldCrypto');

// GET /admin/duplicates
async function findPossibleDuplicates(req, res) {
  const { clause: districtFilter, params } = buildScopeClause(req, [], 'c1');

  // 🔒 victim_mobile अब encrypted है (हर बार अलग ciphertext), इसलिए बराबरी-मिलान
  // सीधे उस कॉलम पर संभव नहीं। इसके बजाय deterministic blind-index
  // (victim_mobile_hash, देखें utils/fieldCrypto.js) पर मिलान करते हैं।
  const result = await db.query(
    `SELECT c1.id AS id1, c2.id AS id2, c1.category, c1.victim_mobile, c1.victim_name,
            c1.created_at AS created1, c2.created_at AS created2
     FROM complaints c1
     JOIN complaints c2 ON c1.victim_mobile_hash = c2.victim_mobile_hash
       AND c1.category = c2.category
       AND c1.id < c2.id
       AND abs(EXTRACT(EPOCH FROM (c1.created_at - c2.created_at))) < 86400
     WHERE c1.victim_mobile_hash IS NOT NULL AND c1.duplicate_of IS NULL AND c2.duplicate_of IS NULL
       AND c1.deleted_at IS NULL AND c2.deleted_at IS NULL ${districtFilter}
     ORDER BY c1.created_at DESC LIMIT 30`,
    params
  );

  res.json(
    result.rows.map((r) => ({
      complaintId1: r.id1,
      complaintId2: r.id2,
      category: r.category,
      victimName: decryptField(r.victim_name),
      victimMobile: decryptField(r.victim_mobile),
      createdAt1: r.created1,
      createdAt2: r.created2,
    }))
  );
}

// PATCH /complaints/:id/mark-duplicate   (admin)   body: { duplicateOfId }
async function markDuplicate(req, res) {
  const { id } = req.params;
  const { duplicateOfId } = req.body;
  if (!duplicateOfId) return res.status(400).json({ error: 'duplicateOfId आवश्यक है' });
  if (id === duplicateOfId) return res.status(400).json({ error: 'एक शिकायत खुद की डुप्लीकेट नहीं हो सकती' });

  const self = await db.query('SELECT district, police_station, citizen_id, officer_id FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (self.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  const target = await db.query('SELECT district, police_station, citizen_id, officer_id FROM complaints WHERE id = $1 AND deleted_at IS NULL', [duplicateOfId]);
  if (target.rows.length === 0) return res.status(404).json({ error: 'मूल शिकायत नहीं मिली' });
  if (!canViewComplaint(req, self.rows[0]) || !canViewComplaint(req, target.rows[0])) {
    return res.status(403).json({ error: 'इन शिकायतों को डुप्लीकेट चिह्नित करने की अनुमति नहीं है' });
  }

  await db.query('UPDATE complaints SET duplicate_of = $1 WHERE id = $2', [duplicateOfId, id]);
  await db.query(
    `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
     VALUES ($1, (SELECT status FROM complaints WHERE id=$1), $2, 'admin', $3)`,
    [id, `शिकायत ${duplicateOfId} की डुप्लीकेट के रूप में चिह्नित`, req.user.name]
  );
  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'complaint_marked_duplicate', details: `${id} को ${duplicateOfId} की डुप्लीकेट बनाया`, req });
  res.json({ message: 'चिह्नित किया गया' });
}

// PATCH /complaints/:id/unmark-duplicate   (admin)
async function unmarkDuplicate(req, res) {
  const { id } = req.params;
  const self = await db.query('SELECT district, police_station, citizen_id, officer_id FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (self.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (!canViewComplaint(req, self.rows[0])) {
    return res.status(403).json({ error: 'इस शिकायत में बदलाव की अनुमति नहीं है' });
  }
  await db.query('UPDATE complaints SET duplicate_of = NULL WHERE id = $1', [id]);
  res.json({ message: 'हटा दिया गया' });
}

module.exports = { findPossibleDuplicates, markDuplicate, unmarkDuplicate };
