const db = require('../config/db');
const { isEmail } = require('../utils/otp');
const { validateName, validateMobile, validateTextLength, validateUrl, validatePushToken } = require('../utils/fieldValidators');
const { decryptField } = require('../utils/fieldCrypto');
const { logActivity } = require('../utils/activityLog');

function toCitizenUser(c) {
  return {
    id: c.id,
    name: c.name,
    fatherName: c.father_name,
    address: c.address,
    mobile: c.mobile,
    email: c.email,
    emergencyContacts: c.emergency_contacts || [],
    photoUrl: c.photo_url,
    district: c.district,
    policeStation: c.police_station,
    role: 'citizen',
  };
}

// GET /citizens/me   (citizen only)
async function getMyProfile(req, res) {
  const result = await db.query('SELECT * FROM citizens WHERE id = $1', [req.user.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'प्रोफ़ाइल नहीं मिली' });
  res.json(toCitizenUser(result.rows[0]));
}

// PATCH /citizens/me   (citizen only)   body: { name, fatherName, address, district, policeStation }
// नोट: मोबाइल नंबर यहाँ से नहीं बदला जा सकता (वह लॉगिन पहचान है) — पासवर्ड बदलने के लिए
// forgot-password फ्लो इस्तेमाल करें।
async function updateMyProfile(req, res) {
  const { name, fatherName, address, district, policeStation, email } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'नाम खाली नहीं हो सकता' });
  }
  // 🆕 पहले सिर्फ़ "खाली नहीं है" जांचा जाता था — बाक़ी जगह (officer/admin) जैसी
  // नाम-प्रारूप जांच (अंक न हों, उचित लंबाई) यहां छूट गई थी
  const nameErr = validateName(name);
  if (nameErr) return res.status(400).json({ error: nameErr });
  if (fatherName) {
    const fatherErr = validateName(fatherName);
    if (fatherErr) return res.status(400).json({ error: `पिता/पति का नाम: ${fatherErr}` });
  }
  const addrErr = validateTextLength(address, { max: 300, label: 'पता' });
  if (addrErr) return res.status(400).json({ error: addrErr });
  const distErr = validateTextLength(district, { max: 100, label: 'ज़िला' });
  if (distErr) return res.status(400).json({ error: distErr });
  const stErr = validateTextLength(policeStation, { max: 100, label: 'थाना' });
  if (stErr) return res.status(400).json({ error: stErr });

  // 🆕 वैकल्पिक ईमेल — यहाँ बदलना ज़रूरी है क्योंकि साइनअप के समय यह वैकल्पिक है।
  // इसके बिना जिसने साइनअप पर ईमेल नहीं दिया, वह बाद में कभी जोड़ ही नहीं पाता, और
  // जिसका ईमेल बदल जाए वह भी फँसा रह जाता — जबकि OTP वहीं जाता है।
  const cleanEmail = email !== undefined && email !== null ? String(email).trim().toLowerCase() : undefined;
  if (cleanEmail) {
    if (!isEmail(cleanEmail)) {
      return res.status(400).json({ error: 'ईमेल आईडी सही नहीं लगती' });
    }
    // वही ईमेल किसी दूसरे सक्रिय खाते पर न हो (साइनअप जैसी ही जाँच)
    const taken = await db.query(
      'SELECT id FROM citizens WHERE LOWER(TRIM(email)) = $1 AND is_active = true AND id <> $2',
      [cleanEmail, req.user.id]
    );
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'यह ईमेल किसी दूसरे खाते से जुड़ा है' });
    }
  }

  const result = await db.query(
    `UPDATE citizens SET name = $1, father_name = $2, address = $3, district = $4, police_station = $5,
       email = CASE WHEN $6::boolean THEN $7 ELSE email END
     WHERE id = $8 RETURNING *`,
    [
      name.trim(), fatherName || null, address || null, district || null, policeStation || null,
      // ⚠️ email तभी बदलें जब request में वह फ़ील्ड आई हो — वरना पुराने ऐप-संस्करण
      // (जो email भेजते ही नहीं) चुपचाप उसे मिटा देते
      cleanEmail !== undefined,
      cleanEmail || null,
      req.user.id,
    ]
  );
  res.json(toCitizenUser(result.rows[0]));
}

// PATCH /citizens/me/photo   (citizen only)   body: { photoUrl }   — वैकल्पिक प्रोफ़ाइल फ़ोटो
async function updateMyPhoto(req, res) {
  const { photoUrl } = req.body;
  if (photoUrl) {
    const urlErr = validateUrl(photoUrl, { label: 'फ़ोटो', allowDataUri: true });
    if (urlErr) return res.status(400).json({ error: urlErr });
  }
  const result = await db.query(
    'UPDATE citizens SET photo_url = $1 WHERE id = $2 RETURNING *',
    [photoUrl || null, req.user.id]
  );
  res.json(toCitizenUser(result.rows[0]));
}

// PATCH /citizens/me/emergency-contacts   (citizen only)   body: { contacts: [{ name, phone }] }
// अधिकतम 3 संपर्क — SOS दबाने पर इन्हें भी SMS जाता है।
async function updateEmergencyContacts(req, res) {
  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length > 3) {
    return res.status(400).json({ error: 'अधिकतम 3 इमरजेंसी संपर्क जोड़े जा सकते हैं' });
  }
  // 🐛 बग फ़िक्स: पहले यहाँ एक ढीला regex (कोई भी 10-अंक, "0123456789" भी) था — बाक़ी
  // पूरे ऐप में इस्तेमाल होने वाले validateMobile (6-9 से शुरू, असली भारतीय मोबाइल)
  // से अलग/कमज़ोर था। अब वही साझा नियम यहां भी।
  const seen = new Set();
  for (const c of contacts) {
    if (!c.name || !c.name.trim()) {
      return res.status(400).json({ error: 'हर संपर्क का नाम आवश्यक है' });
    }
    const nameErr = validateTextLength(c.name, { max: 80, label: 'संपर्क का नाम' });
    if (nameErr) return res.status(400).json({ error: nameErr });
    const mobileErr = validateMobile(c.phone);
    if (mobileErr) return res.status(400).json({ error: `${c.name}: ${mobileErr}` });
    // 🐛 बग फ़िक्स: एक ही नंबर कई बार जोड़ा जा सकता था — SOS पर उसी व्यक्ति को वही
    // संदेश 2-3 बार जाता (बड़े पैमाने पर यह असली SMS-ख़र्च भी है)।
    const phone = String(c.phone).trim();
    if (seen.has(phone)) {
      return res.status(400).json({ error: 'एक ही नंबर एक से ज़्यादा बार नहीं जोड़ा जा सकता' });
    }
    seen.add(phone);
  }
  // 🐛 बग फ़िक्स: पहले पूरा भेजा हुआ object जस का तस सेव हो जाता था — यानी क्लाइंट
  // कोई भी अतिरिक्त फ़ील्ड (चाहे कितनी भी बड़ी) साथ भेजकर नागरिक की पंक्ति में सेव
  // करा सकता था। बाक़ी पूरे codebase में हर जगह फ़ील्ड स्पष्ट रूप से चुनी जाती हैं,
  // सिर्फ़ यही जगह छूट गई थी। अब सिर्फ़ name व phone ही सेव होते हैं।
  const clean = contacts.map((c) => ({ name: c.name.trim(), phone: String(c.phone).trim() }));
  const result = await db.query(
    'UPDATE citizens SET emergency_contacts = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(clean), req.user.id]
  );
  res.json(toCitizenUser(result.rows[0]));
}

// PATCH /citizens/me/push-token   (citizen only)   body: { pushToken }
async function updatePushToken(req, res) {
  const { pushToken } = req.body;
  // 🔒 प्रारूप की जाँच — देखें utils/fieldValidators.js की टिप्पणी
  const pushErr = validatePushToken(pushToken);
  if (pushErr) return res.status(400).json({ error: pushErr });
  // 🐛 बग फ़िक्स (सुरक्षा-गंभीर — साझा/हस्तांतरित डिवाइस): push_token पर कोई
  // unique-शर्त नहीं है, और Expo हर डिवाइस+इंस्टॉल के लिए वही token देता है।
  // थानों में फ़ोन अक्सर साझा होते हैं या कार्यभार के साथ आगे बढ़ते हैं। जब अगला
  // उपयोगकर्ता उसी फ़ोन पर लॉगिन करता, तो पिछले के record में भी वही token पड़ा
  // रह जाता — यानी उनके नाम की सूचनाएं (SOS समेत) उस फ़ोन पर बजतीं जो अब किसी
  // और के पास है, और वे ख़ुद अपने डिवाइस पर कभी सूचित नहीं होते। अब कोई भी token
  // किसी एक समय पर सिर्फ़ एक ही खाते से जुड़ा रहता है (सभी भूमिकाओं में)।
  if (pushToken) {
    await Promise.all([
      db.query('UPDATE officers SET push_token = NULL WHERE push_token = $1', [pushToken]),
      db.query('UPDATE citizens SET push_token = NULL WHERE push_token = $1 AND id <> $2', [pushToken, req.user.id]),
      db.query('UPDATE admins SET push_token = NULL WHERE push_token = $1', [pushToken]),
      db.query('UPDATE service_providers SET push_token = NULL WHERE push_token = $1', [pushToken]),
    ]);
  }
  await db.query('UPDATE citizens SET push_token = $1 WHERE id = $2', [pushToken || null, req.user.id]);
  res.json({ message: 'सुरक्षित हुआ' });
}

module.exports = { getMyProfile, updateMyProfile, updateMyPhoto, updateEmergencyContacts, updatePushToken, exportMyData, requestAccountDeletion, getMyDeletionRequest };

// ============================================================
// 🆕 DPDP Act 2023 — डेटा तक पहुंच का अधिकार (Right to Access) और मिटाने का
// अधिकार (Right to Erasure)। पहले न तो नागरिक अपना डेटा एक जगह देख सकते थे,
// न ही खाता हटवाने का कोई structured तरीक़ा था — सिर्फ़ Privacy Policy में
// "संपर्क करें" लिखा था, पर उसे पूरा करने का कोई सिस्टम नहीं था।
// ============================================================

// GET /citizens/me/export — नागरिक का अपना पूरा डेटा (profile + अपनी शिकायतें),
// डिक्रिप्ट किया हुआ (क्योंकि यह खुद उसी का डेटा है, encrypted रूप दिखाने का कोई मतलब नहीं)
async function exportMyData(req, res) {
  const profileResult = await db.query('SELECT * FROM citizens WHERE id = $1', [req.user.id]);
  if (profileResult.rows.length === 0) return res.status(404).json({ error: 'प्रोफ़ाइल नहीं मिली' });
  const c = profileResult.rows[0];

  const complaintsResult = await db.query(
    `SELECT id, category, description, district, police_station, status, created_at,
            victim_name, victim_father_name, victim_address, victim_mobile
     FROM complaints WHERE citizen_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [req.user.id]
  );

  logActivity({ actorRole: 'citizen', actorId: req.user.id, actorName: c.name, action: 'data_exported', details: 'नागरिक ने अपना डेटा export किया', req });

  res.json({
    exportedAt: new Date().toISOString(),
    profile: {
      name: c.name,
      fatherName: c.father_name,
      address: c.address,
      mobile: c.mobile,
      // 🐛 बग फ़िक्स: ईमेल बाद में जोड़ी गई थी, पर यह export अपडेट नहीं हुआ था।
      // DPDP का \"जानकारी पाने का अधिकार\" कहता है कि नागरिक को उसके बारे में रखा
      // गया *पूरा* डेटा मिले — इसलिए इसका छूटना ठीक नहीं।
      email: c.email,
      emergencyContacts: c.emergency_contacts,
      accountCreatedAt: c.created_at,
    },
    complaints: complaintsResult.rows.map((row) => ({
      id: row.id,
      category: row.category,
      description: row.description,
      district: row.district,
      policeStation: row.police_station,
      status: row.status,
      createdAt: row.created_at,
      victimName: decryptField(row.victim_name),
      victimFatherName: decryptField(row.victim_father_name),
      victimAddress: decryptField(row.victim_address),
      victimMobile: decryptField(row.victim_mobile),
    })),
  });
}

// POST /citizens/me/deletion-request   body: { reason? }
// सीधा delete नहीं — शिकायतें कानूनी दस्तावेज़ हैं, इसलिए Super Admin के review के
// बाद ही असर होता है (देखें adminController.js की reviewDeletionRequest)
async function requestAccountDeletion(req, res) {
  const { reason } = req.body;
  const reasonErr = validateTextLength(reason, { max: 500, label: 'कारण' });
  if (reasonErr) return res.status(400).json({ error: reasonErr });
  try {
    const result = await db.query(
      `INSERT INTO account_deletion_requests (citizen_id, reason) VALUES ($1, $2) RETURNING *`,
      [req.user.id, reason || null]
    );
    logActivity({ actorRole: 'citizen', actorId: req.user.id, actorName: req.user.name, action: 'deletion_requested', details: 'नागरिक ने खाता हटाने का अनुरोध किया', req });
    res.status(201).json({ message: 'अनुरोध भेज दिया गया — समीक्षा के बाद कार्रवाई होगी', id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'आपका एक अनुरोध पहले से समीक्षा में है' });
    }
    throw err;
  }
}

// GET /citizens/me/deletion-request — अपने सबसे हाल के अनुरोध की स्थिति देखें
async function getMyDeletionRequest(req, res) {
  const result = await db.query(
    'SELECT * FROM account_deletion_requests WHERE citizen_id = $1 ORDER BY requested_at DESC LIMIT 1',
    [req.user.id]
  );
  if (result.rows.length === 0) return res.json(null);
  const r = result.rows[0];
  res.json({ id: r.id, status: r.status, requestedAt: r.requested_at, reviewedAt: r.reviewed_at, reviewNote: r.review_note });
}
