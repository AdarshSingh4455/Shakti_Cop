const db = require('../config/db');
const { newComplaintId } = require('../utils/ids');
const { logActivity } = require('../utils/activityLog');
const { sendPushNotification } = require('../utils/push');
const { createNotification, createNotificationsBatch } = require('../utils/notify');
const { encryptField, decryptField, blindIndex } = require('../utils/fieldCrypto');
const { validateTextLength, validateUrl, validateJsonDepth, validateCoordinate } = require('../utils/fieldValidators');

const CATEGORIES = [
  'महिला हेल्प डेस्क',
  'एंटी रोमियो स्क्वॉड',
  'घरेलू हिंसा',
  'सुरक्षित यात्रा मोड',
  'वॉइस शिकायत',
];
const STATUSES = ['दर्ज', 'अधिकारी नियुक्त', 'कार्यवाही जारी', 'निस्तारित', 'अस्वीकृत'];

// GPS निर्देशांक (latitude/longitude) भी encrypted TEXT के रूप में सेव होते हैं —
// पढ़ते समय decrypt करके वापस संख्या (Number) बनाना ज़रूरी है, ताकि API का जवाब
// पहले जैसा ही (numeric) बना रहे और मोबाइल ऐप में कोई बदलाव न करना पड़े।
function decryptGeo(value) {
  if (value === null || value === undefined || value === '') return null;
  const decrypted = decryptField(value);
  const n = Number(decrypted);
  return Number.isNaN(n) ? null : n;
}

function rowToComplaint(row, history, viewerRole) {
  const hideVictimDetails = row.is_anonymous && (viewerRole === 'officer' || viewerRole === 'admin');
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    district: row.district,
    policeStation: row.police_station,
    location: row.location,
    incidentLocation: row.incident_location,
    latitude: decryptGeo(row.latitude),
    longitude: decryptGeo(row.longitude),
    photoUrl: row.photo_url,
    voiceNoteUrl: row.voice_note_url,
    extraDetails: row.extra_details || null,
    status: row.status,
    citizenId: row.citizen_id,
    filedByName: hideVictimDetails ? 'गुमनाम शिकायतकर्ता' : row.citizen_name,
    filedByMobile: hideVictimDetails ? null : row.citizen_mobile,
    isSelf: row.is_self,
    isAnonymous: row.is_anonymous,
    // 🔒 फ़ील्ड-लेवल एन्क्रिप्शन: नाम, मोबाइल, पिता का नाम व पता डेटाबेस में encrypted
    // सेव होते हैं (देखें utils/fieldCrypto.js) — यहाँ पढ़ते समय decrypt होते हैं।
    victimName: hideVictimDetails ? 'गुमनाम' : decryptField(row.victim_name),
    victimFatherName: hideVictimDetails ? null : decryptField(row.victim_father_name),
    victimAddress: hideVictimDetails ? null : decryptField(row.victim_address),
    victimMobile: hideVictimDetails ? null : decryptField(row.victim_mobile),
    // 🆕 आरोपी की जानकारी (वैकल्पिक) — जो भी इस शिकायत को देख सकता है, उसे यह भी
    // दिखती है (नागरिक ने ख़ुद दी थी, या अधिकारी/एडमिन जिन्हें वैसे भी पूरी शिकायत
    // देखने की अनुमति है)। "दोहराए-आरोपी इतिहास" (accused-history, दूसरी शिकायतें)
    // इससे अलग — सिर्फ़ officer/admin, ताकि दूसरी पीड़िताओं की गोपनीयता बनी रहे।
    accusedName: decryptField(row.accused_name),
    accusedMobile: decryptField(row.accused_mobile),
    officerId: row.officer_id,
    officerViewedAt: row.officer_viewed_at,
    liveShareActive: row.live_share_active,
    liveLat: decryptGeo(row.live_lat),
    liveLng: decryptGeo(row.live_lng),
    liveAccuracy: row.live_accuracy,
    liveUpdatedAt: row.live_updated_at,
    priority: row.priority,
    adminVerified: row.admin_verified,
    adminVerifiedAt: row.admin_verified_at,
    adminVerifiedBy: row.admin_verified_by,
    checklist: row.checklist || [],
    officer: row.officer_name || null,
    sosTriggered: row.sos_triggered,
    sosTriggeredAt: row.sos_triggered_at,
    safeArrivalConfirmed: row.safe_arrival_confirmed,
    safeArrivalConfirmedAt: row.safe_arrival_confirmed_at,
    feedbackRating: row.feedback_rating,
    feedbackNote: row.feedback_note,
    feedbackSubmittedAt: row.feedback_submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: history || [],
  };
}

// पेशेवर जांच checklist — हर शिकायत के साथ अपने-आप जुड़ता है
const STANDARD_CHECKLIST = [
  { key: 'contact_victim', label: 'पीड़िता/शिकायतकर्ता से संपर्क किया' },
  { key: 'statement_recorded', label: 'बयान दर्ज किया' },
  { key: 'site_visit', label: 'घटनास्थल का निरीक्षण किया' },
  { key: 'evidence_collected', label: 'साक्ष्य/सबूत एकत्र किए' },
  { key: 'accused_contacted', label: 'आरोपी से पूछताछ/संपर्क किया' },
  { key: 'action_taken', label: 'आवश्यक कार्यवाही पूर्ण की' },
];

const SELECT_BASE = `
  SELECT c.*, ci.name AS citizen_name, ci.mobile AS citizen_mobile, o.name AS officer_name
  FROM complaints c
  JOIN citizens ci ON ci.id = c.citizen_id
  LEFT JOIN officers o ON o.id = c.officer_id
`;

async function fetchHistory(complaintId) {
  const result = await db.query(
    `SELECT status, note, actor_role, actor_name, attachment_url, voice_note_url, created_at
     FROM complaint_history WHERE complaint_id = $1 ORDER BY created_at ASC`,
    [complaintId]
  );
  return result.rows;
}

// POST /complaints   (citizen only)
// body: { category, description, district, policeStation, location, incidentLocation,
//         latitude, longitude, photoUrl, voiceNoteUrl, extraDetails, isSelf,
//         victimName, victimFatherName, victimAddress, victimMobile }
// "सुरक्षित यात्रा मोड" में description वैकल्पिक है (extraDetails में वाहन जानकारी अनिवार्य)।
async function createComplaint(req, res) {
  const {
    category,
    description,
    district,
    policeStation,
    location,
    incidentLocation,
    latitude,
    longitude,
    photoUrl,
    voiceNoteUrl,
    extraDetails,
    isSelf = true,
    victimName,
    victimFatherName,
    victimAddress,
    victimMobile,
    isAnonymous = false,
    accusedName,
    accusedMobile,
  } = req.body;

  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'अमान्य शिकायत श्रेणी' });
  }
  // 🆕 आरोपी की जानकारी पूरी तरह वैकल्पिक है — नागरिक को देना ज़रूरी नहीं। पर अगर दें,
  // तो सही 10-अंकों के भारतीय मोबाइल फ़ॉर्मेट में होनी चाहिए (ताकि दोहराए-आरोपी की
  // पहचान वाला मिलान सही तरीक़े से काम करे)।
  if (accusedMobile && !/^[6-9]\d{9}$/.test(String(accusedMobile).trim())) {
    return res.status(400).json({ error: 'आरोपी का मोबाइल नंबर मान्य 10-अंकों का होना चाहिए (वैकल्पिक — छोड़ भी सकते हैं)' });
  }
  if (!location && !(latitude && longitude)) {
    return res.status(400).json({ error: 'पता या लाइव लोकेशन में से कम से कम एक आवश्यक है' });
  }
  // 🐛 बग फ़िक्स: निर्देशांक यहां बिना किसी जांच के encrypt होकर सेव हो जाते थे।
  // यही जांच updateLiveLocation और triggerSos में पहले जोड़ी जा चुकी है — यह तीसरा
  // (और आख़िरी) रास्ता छूट गया था। यहां असर सबसे ज़्यादा है, क्योंकि शिकायत के
  // निर्देशांक स्थायी रूप से दर्ज होते हैं और उन्हीं पर आगे "नज़दीकी थाना" व अधिकारी
  // का नक़्शा टिका होता है — ग़लत मान वहां NaN/बेतुकी जगह बनकर उभरता।
  // ध्यान रहे: निर्देशांक वैकल्पिक ही हैं (सिर्फ़ पता देकर भी शिकायत दर्ज हो सकती है),
  // इसलिए सिर्फ़ *ग़लत* मान रोके जाते हैं, अनुपस्थित नहीं।
  if (latitude != null && latitude !== '') {
    const latErr = validateCoordinate(latitude, { label: 'latitude', max: 90 });
    if (latErr) return res.status(400).json({ error: latErr });
  }
  if (longitude != null && longitude !== '') {
    const lngErr = validateCoordinate(longitude, { label: 'longitude', max: 180 });
    if (lngErr) return res.status(400).json({ error: lngErr });
  }
  // 'सुरक्षित यात्रा मोड' में विवरण ज़रूरी नहीं (वाहन विवरण ही मुख्य है)।
  // बाकी श्रेणियों में या तो लिखा हुआ विवरण चाहिए, या आवाज़ रिकॉर्डिंग —
  // 'वॉइस शिकायत' में नागरिक सिर्फ़ बोलकर शिकायत दर्ज करता है, कुछ लिखता नहीं।
  if (category !== 'सुरक्षित यात्रा मोड' && !description && !voiceNoteUrl) {
    return res.status(400).json({ error: 'विवरण लिखें या आवाज़ रिकॉर्डिंग संलग्न करें' });
  }
  if (category === 'सुरक्षित यात्रा मोड' && (!extraDetails || !extraDetails.vehicleNumber)) {
    return res.status(400).json({ error: 'वाहन नंबर आवश्यक है' });
  }
  // 🆕 बग फ़िक्स (गंभीर — DoS, टेस्ट से पुष्टि हुई): extraDetails की गहराई पहले
  // कभी जांची नहीं जाती थी — इसे नीचे JSON.stringify() किया जाता है, जो बहुत गहरे
  // nested object (सिर्फ़ ~300KB में भी संभव) पर "Maximum call stack size exceeded"
  // के साथ क्रैश हो जाता था।
  const depthErr = validateJsonDepth(extraDetails, { label: 'extraDetails' });
  if (depthErr) return res.status(400).json({ error: depthErr });

  let finalVictimName = victimName;
  let finalVictimFatherName = victimFatherName;
  let finalVictimAddress = victimAddress;
  let finalVictimMobile = victimMobile;
  let finalDistrict = district;
  let finalPoliceStation = policeStation;

  // नागरिक का अपना रिकॉर्ड — victim-विवरण (जब isSelf हो) और ज़िला/थाना fallback
  // (जब फ़ॉर्म में नहीं मांगा गया हो, जैसे 'वॉइस शिकायत') दोनों के लिए इस्तेमाल होता है
  const citizenResult = await db.query('SELECT * FROM citizens WHERE id = $1', [req.user.id]);
  const citizen = citizenResult.rows[0];

  if (isSelf) {
    finalVictimName = citizen.name;
    finalVictimFatherName = citizen.father_name;
    finalVictimAddress = citizen.address;
    finalVictimMobile = citizen.mobile;
  } else if (!victimName) {
    return res.status(400).json({ error: 'पीड़ित का नाम आवश्यक है' });
  }

  // 🆕 सामान्य टेक्स्ट फ़ील्ड्स पर लंबाई-सीमा — पहले ये असीमित (unbounded TEXT) थीं
  const descErr = validateTextLength(description, { max: 1000, label: 'विवरण' });
  if (descErr) return res.status(400).json({ error: descErr });
  const locErr = validateTextLength(location, { max: 300, label: 'पता' });
  if (locErr) return res.status(400).json({ error: locErr });
  const incLocErr = validateTextLength(incidentLocation, { max: 300, label: 'घटना स्थल' });
  if (incLocErr) return res.status(400).json({ error: incLocErr });
  if (!isSelf) {
    const vAddrErr = validateTextLength(finalVictimAddress, { max: 300, label: 'पीड़ित का पता' });
    if (vAddrErr) return res.status(400).json({ error: vAddrErr });
    const vFatherErr = validateTextLength(finalVictimFatherName, { max: 80, label: 'पिता/पति का नाम' });
    if (vFatherErr) return res.status(400).json({ error: vFatherErr });
  }
  // 🆕 फ़ोटो/आवाज़-रिकॉर्डिंग पर भी पहले कोई जांच नहीं थी — अब आकार-सीमा और सही
  // data-URI प्रकार (image/audio) दोनों जांचे जाते हैं
  if (photoUrl) {
    const photoErr = validateUrl(photoUrl, { label: 'फ़ोटो', allowDataUri: ['image/'] });
    if (photoErr) return res.status(400).json({ error: photoErr });
  }
  if (voiceNoteUrl) {
    const voiceErr = validateUrl(voiceNoteUrl, { label: 'आवाज़ रिकॉर्डिंग', allowDataUri: ['audio/'] });
    if (voiceErr) return res.status(400).json({ error: voiceErr });
  }

  // 🐛 बग फ़िक्स: कुछ श्रेणियों (जैसे 'वॉइस शिकायत') का फ़ॉर्म जानबूझकर ज़िला/थाना
  // नहीं मांगता (सिर्फ़ नाम+मोबाइल+आवाज़ — सबसे तेज़ तरीक़ा) — पहले ऐसी शिकायतों में
  // district/policeStation हमेशा खाली रह जाते थे, जिससे किसी भी थाने को यह पता ही
  // नहीं चलता था कि यह शिकायत उनकी है — कोई अधिकारी उसे कभी देख ही नहीं पाता था
  // (canViewComplaint स्कोप में district/station का मिलान ज़रूरी है)। अब जब फ़ॉर्म से
  // ज़िला/थाना न आए, तो नागरिक के अपने पंजीकृत पते के ज़िला/थाने का इस्तेमाल होता है —
  // ताकि हर शिकायत किसी न किसी थाने तक ज़रूर पहुंचे।
  if (!finalDistrict) finalDistrict = citizen.district || null;
  if (!finalPoliceStation) finalPoliceStation = citizen.police_station || null;

  const id = newComplaintId();
  const defaultChecklist = STANDARD_CHECKLIST.map((item) => ({ ...item, done: false, doneAt: null }));
  await db.query(
    `INSERT INTO complaints
      (id, category, description, district, police_station, location, incident_location,
       latitude, longitude, photo_url, voice_note_url, extra_details, citizen_id,
       status, is_self, victim_name, victim_father_name, victim_address, victim_mobile,
       victim_mobile_hash, is_anonymous, checklist, accused_name, accused_mobile, accused_mobile_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'दर्ज',$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      id, category, description || null, finalDistrict, finalPoliceStation, location || null,
      incidentLocation || null, encryptField(latitude != null ? String(latitude) : null), encryptField(longitude != null ? String(longitude) : null), photoUrl || null,
      voiceNoteUrl || null, extraDetails ? JSON.stringify(extraDetails) : null, req.user.id,
      isSelf, encryptField(finalVictimName), encryptField(finalVictimFatherName) || null, encryptField(finalVictimAddress) || null, encryptField(finalVictimMobile) || null,
      blindIndex(finalVictimMobile), !!isAnonymous, JSON.stringify(defaultChecklist),
      encryptField(accusedName ? String(accusedName).trim() : null), encryptField(accusedMobile ? String(accusedMobile).trim() : null), blindIndex(accusedMobile ? String(accusedMobile).trim() : null),
    ]
  );
  await db.query(
    `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
     VALUES ($1, 'दर्ज', '', 'citizen', $2)`,
    [id, req.user.name]
  );

  // 🐛 सुधार: पहले संबंधित थाने के SHO को शिकायत दर्ज होते ही कोई सूचना नहीं मिलती थी —
  // सिर्फ़ तभी पता चलता जब SHO खुद ऐप खोलकर देखे, या जब कोई मामला असाइन हो (जो SHO खुद ही
  // करता है)। अब शिकायत दर्ज होते ही उसी थाने के सभी सक्रिय SHO को तुरंत notification
  // (push + in-app) मिल जाती है — TRIM+LOWER से मिलान, ताकि station-नाम में मामूली
  // formatting अंतर (space/case) से कोई SHO छूट न जाए।
  if (finalDistrict && finalPoliceStation) {
    try {
      const shos = await db.query(
        `SELECT id, push_token, notification_preferences FROM officers
         WHERE rank = 'SHO' AND is_active = true
           AND TRIM(LOWER(district)) = TRIM(LOWER($1))
           AND TRIM(LOWER(station)) = TRIM(LOWER($2))`,
        [finalDistrict, finalPoliceStation]
      );
      for (const sho of shos.rows) {
        // 🆕 SHO की notification preferences का सम्मान — चाहें तो "नई शिकायत" की push
        // बंद कर सकते हैं (in-app सूचना फिर भी बनती है, सिर्फ़ फ़ोन पर push नहीं आती)
        if (sho.notification_preferences?.newComplaint !== false) {
          sendPushNotification(sho.push_token, 'नई शिकायत दर्ज हुई', `${category} — शिकायत ${id} आपके थाने में दर्ज हुई है।`, { complaintId: id });
        }
        createNotification({
          recipientRole: 'officer',
          recipientId: sho.id,
          title: 'नई शिकायत दर्ज हुई',
          body: `${category} — शिकायत ${id} आपके थाने में दर्ज हुई है।`,
          data: { complaintId: id },
        });
      }
    } catch (e) {
      // सूचना भेजने में समस्या हो तो भी शिकायत दर्ज होना नहीं रुकना चाहिए
    }
  }

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  logActivity({ actorRole: 'citizen', actorId: req.user.id, actorName: req.user.name, action: 'complaint_created', details: `${category} — शिकायत ${id} दर्ज की`, req });
  res.status(201).json(rowToComplaint(result.rows[0], history, req.user.role));
}

// GET /complaints   — भूमिका के अनुसार दायरा + वैकल्पिक फ़िल्टर (एडमिन/अधिकारी के लिए)
async function listComplaints(req, res) {
  let sql = SELECT_BASE;
  const clauses = [];
  const params = [];

  // 🆕 Soft Delete — हटाई गई (deleted_at भरी हुई) शिकायतें सामान्य सूची में कभी नहीं
  // दिखतीं (Super Admin की अलग "हटाई गई शिकायतें" सूची — listDeletedComplaints — में
  // ही दिखती हैं)।
  clauses.push('c.deleted_at IS NULL');

  // 🔒 फ़ील्ड-लेवल एन्क्रिप्शन: victim_name/victim_mobile अब encrypted हैं, इसलिए SQL
  // ILIKE से सीधे मिलान नहीं हो सकता — खोज शब्द मिलने पर, decrypt होने के बाद
  // application स्तर पर फ़िल्टर होता है (नीचे)। इसे यहीं (function के शुरू में) घोषित
  // करना ज़रूरी है — role-आधारित ब्लॉक के अंदर घोषित करने पर यह बाहर (जहाँ असल में
  // पढ़ा जाता है) पहुंच से बाहर हो जाता, और हर request पर ReferenceError आता।
  let searchTerm = null;

  if (req.user.role === 'citizen') {
    params.push(req.user.id);
    clauses.push(`c.citizen_id = $${params.length}`);
  } else if (req.user.role === 'officer' && req.user.rank === 'SHO') {
    // थाना प्रभारी (SHO) — पूरे थाने की शिकायतें (चाहे किसी भी अधिकारी को assign हों,
    // बिना-नियुक्ति हों, या बंद हो चुकी हों) — SHO पूरे थाने का प्रभारी है, इसलिए
    // सिर्फ़ अपने-असाइन किए मामलों तक सीमित नहीं होना चाहिए।
    // 🐛 बग फ़िक्स: पहले सिर्फ़ (officer_id = खुद SHO) OR (officer_id खाली) दिखता था —
    // जैसे ही SHO किसी मामले को अपने थाने के किसी और अधिकारी (SI) को assign करता,
    // वह शिकायत SHO की अपनी सूची से पूरी तरह ग़ायब हो जाती (न "मेरी", न "बिना-नियुक्ति")।
    // इसलिए SHO अपने ही थाने की बंद हो चुकी शिकायत की कार्यवाही तक नहीं देख पाता था।
    // अब सिर्फ़ थाने के नाम से मिलान होता है — असाइनमेंट स्थिति कुछ भी हो, SHO को
    // अपने पूरे थाने की हर शिकायत (खुली/बंद, किसी को भी assign) दिखेगी।
    if (req.user.station) {
      params.push(req.user.station.trim().toLowerCase());
      clauses.push(`LOWER(TRIM(c.police_station)) = $${params.length}`);
      // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं — "कोतवाली" 65 ज़िलों में मौजूद है,
      // इसलिए ज़िला भी मिलाना ज़रूरी है, वरना SHO को दूसरे ज़िलों की उसी नाम वाली
      // शिकायतें भी अपनी सूची में दिखतीं।
      if (req.user.district) {
        params.push(req.user.district.trim().toLowerCase());
        clauses.push(`LOWER(TRIM(c.district)) = $${params.length}`);
      }
    } else {
      params.push(req.user.id);
      clauses.push(`c.officer_id = $${params.length}`);
    }
  } else if (req.user.role === 'officer') {
    params.push(req.user.id);
    clauses.push(`c.officer_id = $${params.length}`);
  }

  // Granular RBAC — भूमिका के हिसाब से दायरा:
  //   IG/DIG → अपने Range (कई ज़िलों) तक ही (rangeDistricts)
  //   DSP → अपने सर्किल के थानों तक ही (circleStations)
  //   SP/district_admin → अपने ज़िले तक (district)
  //   SSP/super_admin → कोई सीमा नहीं
  // 🐛 बग फ़िक्स (गंभीर — डेटा-पृथक्करण): यहां rangeDistricts की कोई जांच ही नहीं
  // थी — canViewComplaint (नीचे, एकल-शिकायत के लिए) में तो सही से जोड़ी गई थी, पर
  // यहां (मुख्य सूची-query) भूल गई थी। नतीजा: IG/DIG लॉगिन करके complaint-list
  // खोलते ही अपने Range से बाहर की भी *सभी* शिकायतें देख पाते — कोई सीमा ही नहीं
  // लगती थी, क्योंकि न circleStations मेल खाता, न district (IG/DIG के पास दोनों
  // में से कोई भी सेट नहीं होता, सिर्फ़ rangeDistricts होता है)।
  if (req.adminScope?.rangeDistricts && req.adminScope.rangeDistricts.length > 0) {
    params.push(req.adminScope.rangeDistricts);
    clauses.push(`c.district = ANY($${params.length})`);
  } else if (req.adminScope?.circleStations && req.adminScope.circleStations.length > 0) {
    params.push(req.adminScope.circleStations);
    clauses.push(`c.police_station = ANY($${params.length})`);
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जोड़ें
    if (req.adminScope.district) {
      params.push(req.adminScope.district);
      clauses.push(`c.district = $${params.length}`);
    }
  } else if (req.adminScope?.district) {
    params.push(req.adminScope.district);
    clauses.push(`c.district = $${params.length}`);
  }

  if (req.user.role === 'admin' || req.user.role === 'officer') {
    if (req.query.status) {
      params.push(req.query.status);
      clauses.push(`c.status = $${params.length}`);
    }
    if (req.query.category) {
      params.push(req.query.category);
      clauses.push(`c.category = $${params.length}`);
    }
    if (req.query.district) {
      params.push(req.query.district);
      clauses.push(`c.district = $${params.length}`);
    }
    if (req.query.policeStation) {
      params.push(req.query.policeStation);
      clauses.push(`c.police_station = $${params.length}`);
    }
    if (req.query.dateFrom) {
      params.push(req.query.dateFrom);
      clauses.push(`c.created_at >= $${params.length}`);
    }
    if (req.query.dateTo) {
      // 🐛 बग फ़िक्स: पहले 'created_at <= dateTo' था — dateTo सिर्फ़ तारीख़ होने से
      // डेटाबेस उसे उस दिन की रात 12:00 बजे (midnight) मानता था, जिससे उसी दिन बाद में
      // (जैसे शाम को) दर्ज हुई कोई भी शिकायत सूची से गायब हो जाती थी — चाहे वह
      // dateFrom-dateTo सीमा के अंदर ही क्यों न हो। अब पूरे दिन (रात 11:59 तक) को शामिल
      // किया जाता है।
      params.push(req.query.dateTo);
      clauses.push(`c.created_at < ($${params.length}::date AT TIME ZONE 'Asia/Kolkata' + interval '1 day')`);
    }
    // 🔒 फ़ील्ड-लेवल एन्क्रिप्शन: victim_name/victim_mobile अब encrypted हैं, इसलिए SQL
    // ILIKE से सीधे मिलान नहीं हो सकता (हर बार अलग ciphertext)। खोज शब्द दिए जाने पर,
    // SQL स्तर पर कोई filter नहीं लगाते (चूंकि victim fields को वहां जांचा नहीं जा
    // सकता) — इसके बजाय पूरा (बाक़ी शर्तों से मिलान वाला) सेट लाकर, नीचे decrypt करने
    // के बाद application स्तर पर खोजा जाता है — ID, victim नाम/मोबाइल, शिकायतकर्ता का
    // अपना नाम/मोबाइल, ज़िला/थाना — सब साथ।
    if (req.query.search) {
      searchTerm = req.query.search;
    }
    if (req.query.sosOnly === 'true') {
      clauses.push(`c.sos_triggered = true`);
    }
  }
  if (req.user.role === 'admin' && req.query.officerId) {
    params.push(req.query.officerId);
    clauses.push(`c.officer_id = $${params.length}`);
  }

  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  if (req.query.sort === 'urgent') {
    sql += ` ORDER BY
      CASE WHEN c.sos_triggered AND NOT c.safe_arrival_confirmed THEN 0 ELSE 1 END,
      CASE WHEN c.status = 'दर्ज' THEN 0 ELSE 1 END,
      c.created_at ASC`;
  } else {
    const sortDir = req.query.sort === 'oldest' ? 'ASC' : 'DESC';
    sql += ` ORDER BY c.created_at ${sortDir}`;
  }

  // 🐛 बग फ़िक्स (गंभीर — DoS/संसाधन-चूक): पहले यहां कोई LIMIT ही नहीं था — पूरी
  // मेल खाती सूची (चाहे लाखों पंक्तियां हों) एक ही अनुरोध में लाई जाती, और हर एक की
  // victim-fields decrypt होतीं (AES गणना — मुफ़्त नहीं)। समय के साथ शिकायतों की
  // संख्या बढ़ने पर यह और बदतर होता जाता — एक सामान्य dashboard-लोड भी सर्वर पर भारी
  // पड़ सकता था, और बार-बार दोहराए जाने पर एक असली संसाधन-चूक (resource-exhaustion)
  // बन सकता था। अब दो हिस्सों में सीमा:
  //   1. खोज (search) न हो तो — सीधे SQL में LIMIT/OFFSET (कुशल, DB-स्तर पर ही सीमित)
  //   2. खोज हो तो — चूंकि victim-fields encrypted हैं (SQL से सीधे नहीं खोजे जा
  //      सकते), उम्मीदवार-समूह की एक ऊपरी सीमा (2000) रखते हैं, फिर उतने ही decrypt
  //      करके खोजते हैं — असीमित नहीं, पर खोज फिर भी व्यावहारिक रूप से काम करती है
  const requestedLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  if (searchTerm) {
    // खोज-स्थिति में — एक बड़ा (पर बंधा हुआ) उम्मीदवार-समूह लाते हैं, decrypt करते
    // हैं, फिर application स्तर पर खोजते और अंत में पेज काटते हैं
    params.push(2000);
    sql += ` LIMIT $${params.length}`;
  } else {
    params.push(requestedLimit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const result = await db.query(sql, params);
  let rows = result.rows.map((row) => rowToComplaint(row, undefined, req.user.role));
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.id.toLowerCase().includes(term) ||
        (r.filedByName || '').toLowerCase().includes(term) ||
        (r.filedByMobile || '').toLowerCase().includes(term) ||
        (r.district || '').toLowerCase().includes(term) ||
        (r.policeStation || '').toLowerCase().includes(term) ||
        (r.victimName || '').toLowerCase().includes(term) ||
        (r.victimMobile || '').toLowerCase().includes(term)
    );
    // खोज-नतीजों पर भी वही पेजिंग लागू करें, ताकि response-आकार हमेशा बंधा रहे
    rows = rows.slice(offset, offset + requestedLimit);
  }
  res.json(rows);
}

// GET /complaints/:id
// ============================================================
// क्या यह उपयोगकर्ता इस शिकायत को देख सकता है?
//
// पहले यहाँ सिर्फ़ `role === 'admin'` जांचा जाता था — यानी लखनऊ का district_admin
// शिकायत ID जानकर वाराणसी की शिकायत भी खोल लेता था (सूची में दायरा सही था, पर
// सीधे ID से खोलने पर नहीं)। अब admin का ज़िला/सर्किल यहाँ भी लागू होता है।
//
// साथ ही SHO की समस्या भी ठीक हुई — उसे सूची में अपने थाने की बिना-नियुक्ति वाली
// शिकायतें दिखती थीं (नियुक्त करने के लिए), पर खोलने पर 403 मिलता था।
// ============================================================
function canViewComplaint(req, row) {
  const { role, id: userId, rank, station } = req.user;

  if (role === 'citizen') return row.citizen_id === userId;

  if (role === 'officer') {
    if (row.officer_id === userId) return true; // अपना नियुक्त मामला
    // 🐛 बग फ़िक्स: पहले सिर्फ़ "बिना-नियुक्ति" शिकायतें ही SHO खोल पाता था — अपने थाने
    // के किसी और अधिकारी को assign की हुई (या बंद हो चुकी) शिकायत खोलने पर 403 मिलता।
    // साथ ही exact string match था (spaces/case का फ़र्क़ होने पर मैच ही नहीं होता) —
    // अब listComplaints जैसा ही TRIM+LOWER मिलान, और assignment-status की परवाह किए
    // बिना अपने पूरे थाने की कोई भी शिकायत खोल सकता है।
    // 🐛 बग फ़िक्स (गंभीर): यहां सिर्फ़ थाने का नाम मिलाया जाता था। थानों के नाम कई
    // ज़िलों में एक जैसे होते हैं — "कोतवाली" अब 65 ज़िलों में मौजूद है। नतीजा:
    // "कोतवाली" थाने का SHO उन सभी 65 ज़िलों की "कोतवाली" वाली शिकायतें देख सकता था।
    // अब ज़िला भी मिलाया जाता है।
    if (
      rank === 'SHO' && station && row.police_station &&
      row.police_station.trim().toLowerCase() === station.trim().toLowerCase() &&
      (!req.user.district || !row.district || row.district.trim().toLowerCase() === req.user.district.trim().toLowerCase())
    ) return true;
    // 🐛 बग फ़िक्स (गंभीर): SOS ट्रिगर होने पर आस-पास के अधिकारियों को (उनके नियुक्त
    // मामले या थाने की परवाह किए बिना) सूचना भेजी जाती है, ताकि जो भी नज़दीक हो वह
    // तुरंत मदद कर सके — पर वही अधिकारी complaint खोलने पर यहां 403 पाता था, क्योंकि
    // वह न तो नियुक्त अधिकारी था, न SHO। नतीजा: जिस अधिकारी को खासतौर पर "आप पास में
    // हैं, मदद करें" कहकर बुलाया गया, वही location/विवरण नहीं देख पाता — पूरी सुविधा
    // बेकार हो जाती।
    //
    // 🔒 सुधार (दायरा सीमित किया गया): पहले यह छूट *पूरे राज्य* के हर सक्रिय अधिकारी
    // को मिलती थी। यानी 500 किमी दूर बैठा अधिकारी भी पीड़िता का नाम, पता और लाइव GPS
    // देख सकता था — जबकि वह मदद कर ही नहीं सकता, और SOS की सूचना भी उस तक जाती ही
    // नहीं (सूचनाएं ज़िले के हिसाब से भेजी जाती हैं)। यानी पहुँच, सूचना से कहीं
    // ज़्यादा चौड़ी थी। अब छूट उसी ज़िले तक सीमित है — जिन्हें बुलाया जा सकता है और
    // जो सच में पहुँच सकते हैं, उन सबके लिए सुविधा पहले जैसी ही काम करती है।
    // ⚠️ यहाँ जान-बूझकर कोई logging नहीं — यह एक शुद्ध जाँच (predicate) है जो सूची
    // बनाते समय भी कई बार चलती है, और कुछ caller इसे बिना id वाली row देते हैं।
    // इस पहुँच का audit-रिकॉर्ड getComplaint में दर्ज होता है, जहाँ वह असल में एक
    // शिकायत खोलने की घटना होती है।
    return (
      row.sos_triggered &&
      row.status !== 'निस्तारित' &&
      row.status !== 'अस्वीकृत' &&
      (!req.user.district || !row.district ||
        row.district.trim().toLowerCase() === req.user.district.trim().toLowerCase())
    );
  }

  if (role === 'admin') {
    const scope = req.adminScope || {};
    // 🆕 IG/DIG — कई ज़िलों के Range तक
    if (scope.rangeDistricts && scope.rangeDistricts.length > 0) {
      return scope.rangeDistricts.includes(row.district);
    }
    // DSP — सिर्फ़ अपने सर्किल के थाने
    // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) — ज़िला भी जांचें
    if (scope.circleStations && scope.circleStations.length > 0) {
      if (scope.district && row.district !== scope.district) return false;
      return scope.circleStations.includes(row.police_station);
    }
    // SP / district_admin — सिर्फ़ अपना ज़िला
    if (scope.district) return row.district === scope.district;
    // SSP / super_admin — कोई सीमा नहीं
    return true;
  }

  return false;
}

async function getComplaint(req, res) {
  const { id } = req.params;
  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1 AND c.deleted_at IS NULL`, [id]);
  const row = result.rows[0];
  if (!row) return res.status(404).json({ error: 'शिकायत नहीं मिली' });

  if (!canViewComplaint(req, row)) {
    return res.status(403).json({ error: 'इस शिकायत को देखने की अनुमति नहीं है' });
  }

  // 🔒 सक्रिय SOS वाली छूट से खोली गई शिकायत — यानी यह मामला इस अधिकारी को नियुक्त
  // नहीं है, न ही वह इस थाने का SHO है; उसे सिर्फ़ इसलिए देखने दिया गया क्योंकि SOS
  // चालू है और वह उसी ज़िले में है। यह जायज़ है, पर असामान्य भी — इसलिए audit में
  // दर्ज होता है ताकि बाद में समीक्षा हो सके कि किसने, कब, किस SOS पर यह छूट ली।
  if (
    req.user.role === 'officer' &&
    row.sos_triggered &&
    row.officer_id !== req.user.id &&
    req.user.rank !== 'SHO'
  ) {
    logActivity({
      actorRole: 'officer', actorId: req.user.id, actorName: req.user.name,
      action: 'sos_emergency_access',
      details: `सक्रिय SOS की वजह से शिकायत ${id} खोली (यह मामला इन्हें नियुक्त नहीं है)`,
      req,
    });
  }

  // 👁 देखे जाने का रिकॉर्ड — ATR की जवाबदेही के लिए।
  // नागरिक अपनी ही शिकायत बार-बार देखता है, इसलिए उसे दर्ज नहीं करते।
  // साथ ही 5 मिनट के अंदर दोबारा खोलने पर नई entry नहीं बनती — वरना
  // स्क्रीन की auto-refresh से हज़ारों बेमतलब पंक्तियां बन जातीं।
  if (req.user.role !== 'citizen') {
    try {
      const recent = await db.query(
        `SELECT 1 FROM complaint_views
         WHERE complaint_id = $1 AND viewer_id = $2 AND viewed_at > now() - INTERVAL '5 minutes'
         LIMIT 1`,
        [id, req.user.id]
      );
      if (recent.rows.length === 0) {
        await db.query(
          `INSERT INTO complaint_views (complaint_id, viewer_role, viewer_id, viewer_name, viewer_rank)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, req.user.role, req.user.id, req.user.name, req.user.rank || req.user.adminRole || null]
        );
      }
      // 🐛 बग फ़िक्स: पहले यह तिथि सिर्फ़ तब दर्ज होती थी जब *नियुक्त* अधिकारी शिकायत
      // खोले (row.officer_id === req.user.id)। पर SOS के समय शिकायत अक्सर किसी को
      // नियुक्त होती ही नहीं — अलर्ट पूरे थाने के अधिकारियों को जाता है। यानी कोई भी
      // अधिकारी तुरंत खोलकर देख ले, तब भी officer_viewed_at खाली ही रह जाता।
      //
      // नतीजा: "SOS पर प्रतिक्रिया" वाला आंकड़ा लगभग हर SOS को "कभी नहीं देखा" बताता,
      // और अधिकारी लापरवाह दिखते — जबकि उन्होंने जवाब दिया होता। ऐसा ग़लत आंकड़ा न
      // होने से भी बुरा है, क्योंकि उस पर कार्रवाई होती है।
      //
      // "प्रतिक्रिया-समय" का सही अर्थ है: पुलिस ने पहली बार कब देखा — न कि किसी
      // ख़ास अधिकारी ने। यहाँ तक पहुँचने वाला हर अधिकारी canViewComplaint से गुज़र
      // चुका है, इसलिए उसका देखना वैध है।
      if (req.user.role === 'officer' && !row.officer_viewed_at) {
        await db.query('UPDATE complaints SET officer_viewed_at = now() WHERE id = $1', [id]);
      }
    } catch (e) {
      // तालिका न हो (SQL अभी नहीं चलाया) तो शिकायत देखना न रुके
    }
  }

  const history = await fetchHistory(id);
  res.json(rowToComplaint(row, history, req.user.role));
}

// PATCH /complaints/:id/assign   (admin या SHO)   body: { officerId }
// शिकायत को असाइन/नियुक्त करने के लिए — canViewComplaint से जान-बूझकर अलग रखा गया है।
// 🐛 बग फ़िक्स (रीग्रेशन): canViewComplaint में सक्रिय SOS पर किसी भी अधिकारी को "देखने"
// की छूट दी गई थी (ताकि पास का अधिकारी मदद कर सके) — पर assignOfficer भी उसी फ़ंक्शन
// का इस्तेमाल करता था, जिससे गलती से किसी भी थाने का SHO किसी दूसरे थाने/ज़िले की
// SOS-वाली शिकायत पर भी अधिकारी नियुक्त कर सकता था। "देखना" (मदद के लिए) और "नियुक्त
// करना" (केस का मालिकाना/ज़िम्मेदारी) दो अलग चीज़ें हैं — नियुक्ति हमेशा सिर्फ़ उसी
// थाने/क्षेत्र के SHO/admin तक सीमित रहनी चाहिए, चाहे SOS सक्रिय हो या नहीं।
function canAssignComplaint(req, row) {
  // 🐛 बग फ़िक्स: नीचे SHO वाली शाखा TRIM/LOWER करके मिलान करती है (और वहां का
  // टिप्पणी-नोट बताता है कि यह चूक कितनी गंभीर थी), पर admin वाली शाखा में सीधा
  // string-मिलान रह गया था। ज़िले/थाने के नाम अलग-अलग जगह से भरे जाते हैं, इसलिए
  // आगे-पीछे स्पेस या छोटे-बड़े अक्षर का फ़र्क़ आम है — और तब वैध admin को भी
  // ग़लती से रोक दिया जाता। अब दोनों शाखाएं एक जैसा मिलान करती हैं।
  const norm = (s) => String(s || '').trim().toLowerCase();
  if (req.user.role === 'admin') {
    const scope = req.adminScope || {};
    if (scope.rangeDistricts && scope.rangeDistricts.length > 0) {
      return scope.rangeDistricts.some((d) => norm(d) === norm(row.district));
    }
    if (scope.circleStations && scope.circleStations.length > 0) {
      if (scope.district && norm(row.district) !== norm(scope.district)) return false;
      return scope.circleStations.some((s) => norm(s) === norm(row.police_station));
    }
    if (scope.district) return norm(scope.district) === norm(row.district);
    return true; // super_admin
  }
  if (req.user.role === 'officer' && req.user.rank === 'SHO') {
    // 🐛 बग फ़िक्स (गंभीर): सिर्फ़ थाने का नाम मिलाना काफ़ी नहीं — "कोतवाली" 65 ज़िलों
    // में है। यहां तो यह और भी गंभीर था, क्योंकि assign करना एक write-कार्रवाई है:
    // "कोतवाली" का SHO 65 दूसरे ज़िलों की शिकायतों पर अधिकारी नियुक्त कर सकता था।
    if (req.user.district && row.district && row.district.trim().toLowerCase() !== req.user.district.trim().toLowerCase()) return false;
    return !!(req.user.station && row.police_station && row.police_station.trim().toLowerCase() === req.user.station.trim().toLowerCase());
  }
  return false;
}

async function assignOfficer(req, res) {
  const { id } = req.params;
  const { officerId } = req.body;

  // सिर्फ़ admin (monitor नहीं — route-level पर रोका गया) या SHO रैंक का अधिकारी नियुक्त कर सकता है
  if (req.user.role === 'officer' && req.user.rank !== 'SHO') {
    return res.status(403).json({ error: 'सिर्फ़ थाना प्रभारी (SHO) मामले नियुक्त कर सकते हैं' });
  }

  const officerResult = await db.query(
    'SELECT name, station, district, push_token, notification_preferences FROM officers WHERE id = $1 AND is_active = true',
    [officerId]
  );
  if (officerResult.rows.length === 0) {
    return res.status(400).json({ error: 'अमान्य अधिकारी' });
  }
  const { name: officerName, station: officerStation, district: officerDistrict, push_token, notification_preferences } = officerResult.rows[0];

  // 🐛 बग फ़िक्स (गंभीर — race condition, टेस्ट से पुष्टि हुई): पहले यहां
  // SELECT करके फिर अलग से UPDATE होता था — दो अनुरोध (जैसे दो SHO एक साथ, या
  // डबल-क्लिक) बिल्कुल एक साथ आएं तो दोनों को पुरानी (assign-होने-से-पहले वाली)
  // स्थिति दिखती, दोनों सफल हो जाते, और *दो अलग-अलग अधिकारियों* को "आपको यह मामला
  // सौंपा गया" सूचना चली जाती — जबकि DB में सिर्फ़ आख़िरी वाला असल में दर्ज होता।
  // एक सुरक्षा-ऐप के लिए यह ख़तरनाक है (दोनों अधिकारी सोच सकते हैं ज़िम्मेदारी
  // दूसरे की है)। अब पूरा पढ़ना-जांचना-लिखना एक transaction + row-lock
  // (SELECT ... FOR UPDATE) में — दूसरा समवर्ती अनुरोध पहले वाले के पूरा होने तक
  // रुकता है, और तब तक की ताज़ा स्थिति ही देखता है।
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const complaintRow = await client.query(
      'SELECT id, district, police_station, officer_id, citizen_id FROM complaints WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [id]
    );
    if (complaintRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'शिकायत नहीं मिली' });
    }
    const row = complaintRow.rows[0];

    if (!canAssignComplaint(req, row)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'यह शिकायत आपके थाने/क्षेत्र की नहीं है — आप इसे नियुक्त नहीं कर सकते' });
    }

    // 🔒 SHO सिर्फ़ अपने ही थाने के अधिकारी को नियुक्त कर सके — किसी दूसरे थाने के
    // अधिकारी को गलती से (या जानबूझकर) assign न कर पाए
    if (req.user.role === 'officer' && req.user.rank === 'SHO') {
      const shoStation = (req.user.station || '').trim().toLowerCase();
      const targetStation = (officerStation || '').trim().toLowerCase();
      // 🐛 बग फ़िक्स: सिर्फ़ थाने का नाम मिलाना काफ़ी नहीं — "कोतवाली" 65 ज़िलों में है।
      // यानी लखनऊ के "कोतवाली" का SHO अपनी शिकायत आगरा के "कोतवाली" अधिकारी को सौंप
      // सकता था। वह अधिकारी न पीड़िता तक पहुँच सकता, न मामले पर काम कर सकता — शिकायत
      // चुपचाप अटकी रह जाती। जाँच शिकायत के अपने ज़िले से होती है, क्योंकि मामला
      // असल में वहीं का है।
      const targetDistrict = (officerDistrict || '').trim().toLowerCase();
      const complaintDistrict = (row.district || '').trim().toLowerCase();
      if (!shoStation || shoStation !== targetStation ||
          (complaintDistrict && targetDistrict && complaintDistrict !== targetDistrict)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'सिर्फ़ अपने थाने के अधिकारी को नियुक्त कर सकते हैं' });
      }
    }

    // 🐛 बग फ़िक्स (अधिकार-चूक): ऊपर canAssignComplaint() सिर्फ़ यह जांचता है कि
    // *शिकायत* admin के दायरे में है या नहीं — पर यह कभी नहीं जांचा जाता था कि
    // जिस *अधिकारी* को नियुक्त किया जा रहा है, वह भी उसी दायरे का है। यानी एक
    // district_admin अपने ज़िले की शिकायत किसी दूसरे ज़िले के अधिकारी को सौंप
    // सकता था — वह अधिकारी न वहां पहुंच सकता, न उस मामले पर काम कर सकता, और
    // शिकायत चुपचाप अटकी रह जाती। SHO के लिए यह जांच (ठीक ऊपर) पहले से थी,
    // admin के लिए छूट गई थी।
    if (req.user.role === 'admin') {
      const scope = req.adminScope || {};
      const norm = (s) => String(s || '').trim().toLowerCase();
      let officerInScope = true;
      if (scope.rangeDistricts && scope.rangeDistricts.length > 0) {
        officerInScope = scope.rangeDistricts.some((d) => norm(d) === norm(officerDistrict));
      } else if (scope.circleStations && scope.circleStations.length > 0) {
        // 🐛 बग फ़िक्स: थाने का नाम अकेले अद्वितीय नहीं ("कोतवाली" 65 ज़िलों में) —
        // इसलिए ज़िला भी जाँचें, वरना सर्किल-सीमित DSP/ASP दूसरे ज़िले के उसी नाम वाले
        // थाने के अधिकारी को नियुक्त कर सकता था
        officerInScope =
          scope.circleStations.some((s) => norm(s) === norm(officerStation)) &&
          (!scope.district || norm(scope.district) === norm(officerDistrict));
      } else if (scope.district) {
        officerInScope = norm(scope.district) === norm(officerDistrict);
      }
      if (!officerInScope) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'यह अधिकारी आपके क्षेत्र का नहीं है — इन्हें नियुक्त नहीं कर सकते' });
      }
    }

    await client.query(
      `UPDATE complaints SET officer_id = $1, status = 'अधिकारी नियुक्त' WHERE id = $2`,
      [officerId, id]
    );
    await client.query(
      `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
       VALUES ($1, 'अधिकारी नियुक्त', $2, $3, $4)`,
      [id, `मामला ${officerName} को सौंपा गया।`, req.user.role, req.user.name]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // नियुक्ति होते ही अधिकारी को अपने आप notification भेजें (preference का सम्मान करते हुए)
  if (notification_preferences?.assigned !== false) {
    sendPushNotification(push_token, 'नया मामला नियुक्त हुआ', `शिकायत ${id} आपको सौंपी गई है।`, { complaintId: id });
  }
  createNotification({ recipientRole: 'officer', recipientId: officerId, title: 'नया मामला नियुक्त हुआ', body: `शिकायत ${id} आपको सौंपी गई है।`, data: { complaintId: id } });

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  logActivity({ actorRole: req.user.role, actorId: req.user.id, actorName: req.user.name, action: 'complaint_assigned', details: `शिकायत ${id} को ${officerName} को सौंपा`, req });
  res.json(rowToComplaint(result.rows[0], history, req.user.role));
}

// PATCH /complaints/:id/status   (officer/admin)   body: { status, note }
async function updateStatus(req, res) {
  const { id } = req.params;
  const { status, note, attachmentUrl, voiceNoteUrl } = req.body;

  if (!STATUSES.includes(status) || status === 'दर्ज') {
    return res.status(400).json({ error: 'अमान्य स्थिति' });
  }
  if (status === 'अस्वीकृत' && (!note || !note.trim())) {
    return res.status(400).json({ error: 'शिकायत अस्वीकृत करने का कारण लिखना आवश्यक है' });
  }
  if (status === 'निस्तारित' && (!note || !note.trim())) {
    return res.status(400).json({ error: 'मामला बंद करने से पहले कार्यवाही का विवरण लिखना आवश्यक है' });
  }
  if (attachmentUrl) {
    const attErr = validateUrl(attachmentUrl, { label: 'अटैचमेंट', allowDataUri: ['image/'] });
    if (attErr) return res.status(400).json({ error: attErr });
  }
  if (voiceNoteUrl) {
    const voiceErr = validateUrl(voiceNoteUrl, { label: 'आवाज़ रिकॉर्डिंग', allowDataUri: ['audio/'] });
    if (voiceErr) return res.status(400).json({ error: voiceErr });
  }

  // 🐛 बग फ़िक्स (race condition): assignOfficer जैसी ही समस्या यहां भी थी — पहले
  // सिर्फ़ SELECT करके फिर अलग से UPDATE होता था। दो अनुरोध (जैसे एक अधिकारी
  // "निस्तारित" कर रहा हो और ठीक उसी समय एक एडमिन "अस्वीकृत" कर दे, या डबल-टैप)
  // बिल्कुल एक साथ आएं, तो दोनों को अभी भी "कार्यवाही जारी" जैसी पुरानी स्थिति
  // दिखती — दोनों की जांच पास हो जाती, दोनों सफल हो जाते, और नागरिक को
  // विरोधाभासी सूचनाएं (पहले "निस्तारित हुई" फिर "अस्वीकृत हुई") मिल जातीं।
  // अब पूरा पढ़ना-जांचना-लिखना एक transaction + row-lock (SELECT ... FOR UPDATE) में।
  const client = await db.getClient();
  let citizenPushToken, citizenName, citizenId, complaintDistrict;
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT c.officer_id, c.status, c.citizen_id, c.district, c.police_station, ci.push_token AS citizen_push_token, ci.name AS citizen_name
       FROM complaints c JOIN citizens ci ON ci.id = c.citizen_id WHERE c.id = $1 FOR UPDATE OF c`,
      [id]
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'शिकायत नहीं मिली' });
    }
    // 🐛 बग फ़िक्स: यह जांच SHO पर भी लागू हो जाती थी — यानी थाना प्रभारी अपने ही
    // थाने की उस शिकायत की स्थिति नहीं बदल सकता था जो किसी और (उसके मातहत) को
    // नियुक्त है, या जो अभी किसी को नियुक्त ही नहीं हुई। यह बाक़ी सिस्टम से बेमेल है:
    // listComplaints में SHO को पूरे थाने की शिकायतें दिखती हैं, और नियुक्त करने का
    // अधिकार भी सिर्फ़ उसी के पास है। नतीजा: बिना-नियुक्ति वाली शिकायत पर SHO कोई
    // कार्रवाई दर्ज ही नहीं कर पाता था। अब SHO अपने थाने तक सीमित है (पूरे राज्य का
    // नहीं — "कोतवाली" 65 ज़िलों में है, इसलिए ज़िला भी मिलाया जाता है)।
    if (req.user.role === 'officer') {
      const row0 = current.rows[0];
      const norm = (s) => String(s || '').trim().toLowerCase();
      const isAssignedToMe = row0.officer_id === req.user.id;
      const isMyStationAsSho =
        req.user.rank === 'SHO' &&
        norm(req.user.station) &&
        norm(row0.police_station) === norm(req.user.station) &&
        (!req.user.district || !row0.district || norm(row0.district) === norm(req.user.district));
      if (!isAssignedToMe && !isMyStationAsSho) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'यह मामला आपको नियुक्त नहीं है' });
      }
    }
    // एडमिन का ज़िला/सर्किल यहाँ भी लागू हो — वरना दूसरे ज़िले की checklist भी बदली जा सकती थी
    if (req.user.role === 'admin') {
      const scoped = await client.query('SELECT district, police_station, citizen_id, officer_id FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!canViewComplaint(req, scoped.rows[0])) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'इस शिकायत में बदलाव की अनुमति नहीं है' });
      }
    }
    if (['निस्तारित', 'अस्वीकृत'].includes(current.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'इस शिकायत की स्थिति अब नहीं बदली जा सकती' });
    }

    // 🐛 बग फ़िक्स (निजता — गंभीर): live_share_active सिर्फ़ एक ही जगह (confirmSafeArrival)
    // बंद होता था। यानी अधिकारी द्वारा मामला निस्तारित/अस्वीकृत कर देने पर भी शेयरिंग
    // सर्वर पर चालू ही रह जाती — नागरिक का डिवाइस लोकेशन भेजता रहता, और मामला देखने
    // वाले हर अधिकारी को उसकी मौजूदा जगह दिखती रहती, जबकि केस कब का बंद हो चुका होता।
    // महिला-सुरक्षा ऐप में यह सबसे संवेदनशील डेटा है — केस बंद होते ही इसे रुक जाना
    // चाहिए। यह उसी transaction में है, ताकि स्थिति और शेयरिंग कभी बेमेल न हों।
    if (['निस्तारित', 'अस्वीकृत'].includes(status)) {
      // 🆕 resolved_at — निस्तारण का असली समय। COALESCE इसलिए कि अगर किसी वजह से
      // दोबारा बंद-स्थिति सेट हो, तो पहला (असली) समय ही बना रहे, आगे न खिसके।
      await client.query(
        'UPDATE complaints SET status = $1, live_share_active = false, resolved_at = COALESCE(resolved_at, now()) WHERE id = $2',
        [status, id]
      );
    } else {
      await client.query('UPDATE complaints SET status = $1 WHERE id = $2', [status, id]);
    }
    await client.query(
      `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name, attachment_url, voice_note_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, status, note || '—', req.user.role, req.user.name, attachmentUrl || null, voiceNoteUrl || null]
    );
    await client.query('COMMIT');
    ({ citizen_push_token: citizenPushToken, citizen_name: citizenName, citizen_id: citizenId, district: complaintDistrict } = current.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // सूचनाएं transaction के बाहर — lock ज़्यादा देर तक न पकड़े रहें

  // निस्तारित होने पर नागरिक और सभी एडमिन को सूचना भेजें
  if (status === 'निस्तारित') {
    sendPushNotification(citizenPushToken, '✔ आपकी शिकायत निस्तारित हुई', `शिकायत ${id} का निस्तारण कर दिया गया है।`, { complaintId: id });
    createNotification({ recipientRole: 'citizen', recipientId: citizenId, title: '✔ आपकी शिकायत निस्तारित हुई', body: `शिकायत ${id} का निस्तारण कर दिया गया है।`, data: { complaintId: id } });
    // 🐛 बग फ़िक्स: यह सूचना पूरे राज्य के हर admin को जाती थी — आगरा के DSP को यह
    // जानने की कोई ज़रूरत नहीं कि लखनऊ की एक शिकायत बंद हुई। अब वही ज़िला-आधारित
    // पैटर्न जो बाक़ी जगह अपनाया जा चुका है (राज्य-स्तर के admin हमेशा शामिल)।
    const admins = await db.query(
      'SELECT id, push_token FROM admins WHERE is_active = true AND (district IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($1)))',
      [complaintDistrict || '']
    );
    for (const a of admins.rows) {
      if (a.push_token) {
        sendPushNotification(a.push_token, 'शिकायत निस्तारित हुई', `${req.user.name} ने शिकायत ${id} बंद की — शिकायतकर्ता: ${citizenName}`, { complaintId: id });
      }
    }
    // 🆕 Notification Batching — पहले हर admin के लिए अलग INSERT चलती थी
    createNotificationsBatch(
      'admin',
      admins.rows.map((a) => ({ recipientId: a.id })),
      { title: 'शिकायत निस्तारित हुई', body: `${req.user.name} ने शिकायत ${id} बंद की — शिकायतकर्ता: ${citizenName}`, data: { complaintId: id } }
    );
  } else if (status === 'कार्यवाही जारी' || status === 'अधिकारी नियुक्त') {
    sendPushNotification(citizenPushToken, 'आपकी शिकायत पर अपडेट', `शिकायत ${id} की स्थिति: ${status}`, { complaintId: id });
    createNotification({ recipientRole: 'citizen', recipientId: citizenId, title: 'आपकी शिकायत पर अपडेट', body: `शिकायत ${id} की स्थिति: ${status}`, data: { complaintId: id } });
  }

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  logActivity({ actorRole: req.user.role, actorId: req.user.id, actorName: req.user.name, action: 'status_updated', details: `शिकायत ${id} की स्थिति "${status}" की गई`, req });
  res.json(rowToComplaint(result.rows[0], history, req.user.role));
}

// POST /complaints/:id/mark-viewed   (officer only)
// जवाबदेही के लिए — अधिकारी ने शिकायत पहली बार कब खोली, यह रिकॉर्ड करता है।
async function markViewed(req, res) {
  const { id } = req.params;
  const current = await db.query('SELECT officer_id, officer_viewed_at FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (current.rows[0].officer_id !== req.user.id) {
    return res.status(403).json({ error: 'यह मामला आपको नियुक्त नहीं है' });
  }
  if (!current.rows[0].officer_viewed_at) {
    await db.query('UPDATE complaints SET officer_viewed_at = now() WHERE id = $1', [id]);
  }
  logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: 'complaint_viewed', details: `शिकायत ${id} खोली गई`, req });
  res.json({ message: 'दर्ज हुआ' });
}

// POST /complaints/:id/alert   (admin only)   body: { message }
// नियुक्त अधिकारी को push notification भेजता है (मोबाइल ऐप पर तुरंत दिखेगा)।
async function alertOfficer(req, res) {
  const { id } = req.params;
  const { message } = req.body;

  const result = await db.query(
    `SELECT c.id, c.district, c.police_station, c.citizen_id, c.officer_id, o.push_token, o.name AS officer_name
     FROM complaints c JOIN officers o ON o.id = c.officer_id WHERE c.id = $1`,
    [id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'शिकायत या नियुक्त अधिकारी नहीं मिला' });
  if (!canViewComplaint(req, result.rows[0])) {
    return res.status(403).json({ error: 'इस शिकायत के अधिकारी को अलर्ट भेजने की अनुमति नहीं है' });
  }

  const { push_token, officer_name } = result.rows[0];
  const pushResult = await sendPushNotification(
    push_token,
    'ShaktiCop — शिकायत पर तुरंत ध्यान दें',
    message || `शिकायत ${id} पर कार्रवाई हेतु एडमिन का अनुरोध।`,
    { complaintId: id }
  );
  res.json({ message: `${officer_name} को अलर्ट भेजा गया`, pushResult });
}

// PATCH /complaints/:id/transfer   (officer only, canTransfer permission चाहिए)   body: { toOfficerId, note }
async function transferComplaint(req, res) {
  const { id } = req.params;
  const { toOfficerId, note } = req.body;

  const meResult = await db.query('SELECT permissions FROM officers WHERE id = $1', [req.user.id]);
  const myPermissions = meResult.rows[0]?.permissions || {};
  if (!myPermissions.canTransfer) {
    return res.status(403).json({ error: 'आपको मामले स्थानांतरित करने की अनुमति नहीं है — एडमिन से संपर्क करें' });
  }

  const current = await db.query('SELECT officer_id, status, district FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (current.rows[0].officer_id !== req.user.id) {
    return res.status(403).json({ error: 'यह मामला आपको नियुक्त नहीं है' });
  }
  if (['निस्तारित', 'अस्वीकृत'].includes(current.rows[0].status)) {
    return res.status(400).json({ error: 'बंद हो चुका मामला स्थानांतरित नहीं किया जा सकता' });
  }

  // 🐛 बग फ़िक्स (क्षेत्राधिकार): यहाँ लक्ष्य-अधिकारी का ज़िला कभी जांचा ही नहीं जाता था —
  // सिर्फ़ "सक्रिय अधिकारी है या नहीं"। सूची को UI में सीमित करना अकेले काफ़ी नहीं है,
  // क्योंकि API सीधे किसी भी officerId के साथ बुलाई जा सकती है। जांच शिकायत के अपने
  // ज़िले से होती है (भेजने वाले के नहीं) — क्योंकि मामला असल में वहीं का है।
  const toOfficerResult = await db.query(
    'SELECT name, push_token, district FROM officers WHERE id = $1 AND is_active = true',
    [toOfficerId]
  );
  if (toOfficerResult.rows.length === 0) return res.status(400).json({ error: 'अमान्य अधिकारी' });
  const { name: toOfficerName, push_token, district: toDistrict } = toOfficerResult.rows[0];
  const complaintDistrict = current.rows[0].district;
  if (
    complaintDistrict && toDistrict &&
    complaintDistrict.trim().toLowerCase() !== toDistrict.trim().toLowerCase()
  ) {
    return res.status(403).json({ error: 'मामला सिर्फ़ उसी ज़िले के अधिकारी को स्थानांतरित किया जा सकता है' });
  }

  await db.query('UPDATE complaints SET officer_id = $1 WHERE id = $2', [toOfficerId, id]);
  await db.query(
    `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
     VALUES ($1, $2, $3, 'officer', $4)`,
    [id, current.rows[0].status, `मामला ${req.user.name} द्वारा ${toOfficerName} को स्थानांतरित किया गया। ${note || ''}`.trim(), req.user.name]
  );

  sendPushNotification(push_token, 'मामला स्थानांतरित हुआ', `शिकायत ${id} आपको स्थानांतरित की गई है।`, { complaintId: id });

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  logActivity({ actorRole: 'officer', actorId: req.user.id, actorName: req.user.name, action: 'complaint_transferred', details: `शिकायत ${id} को ${toOfficerName} को स्थानांतरित किया`, req });
  res.json(rowToComplaint(result.rows[0], history, req.user.role));
}

// ============================================================
// Phase E — सुरक्षित यात्रा मोड: SOS और सुरक्षित-पहुँच ट्रैकिंग
// ============================================================

// POST /complaints/:id/sos   (citizen, अपनी ही शिकायत)   body: { latitude, longitude }
// तुरंत सभी सक्रिय एडमिन को live location के साथ अलर्ट भेजता है।
async function triggerSos(req, res) {
  const { id } = req.params;
  const { latitude, longitude } = req.body;

  const current = await db.query('SELECT citizen_id, victim_name, district, police_station, sos_triggered, safe_arrival_confirmed, status FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (current.rows[0].citizen_id !== req.user.id) {
    return res.status(403).json({ error: 'यह आपकी शिकायत नहीं है' });
  }
  // 🐛 बग फ़िक्स: यहां निर्देशांकों की कोई जांच नहीं थी (updateLiveLocation में यह
  // जांच पहले जोड़ी जा चुकी है, पर यह उससे भी ज़्यादा अहम रास्ता है)। "abc" या 999999
  // जैसा मान न सिर्फ़ encrypt होकर सेव हो जाता, बल्कि नीचे findNearestPoliceStation()
  // में भी सीधे चला जाता — यानी असली आपात स्थिति में "नज़दीकी थाना" ग़लत निकलता या
  // गणना ही विफल हो जाती। ध्यान रहे: निर्देशांक यहां वैकल्पिक ही हैं (लोकेशन न मिलने
  // पर भी SOS ज़रूर जाना चाहिए) — इसलिए सिर्फ़ *ग़लत* मान रोके जाते हैं, अनुपस्थित नहीं।
  if (latitude != null && latitude !== '') {
    const latErr = validateCoordinate(latitude, { label: 'latitude', max: 90 });
    if (latErr) return res.status(400).json({ error: latErr });
  }
  if (longitude != null && longitude !== '') {
    const lngErr = validateCoordinate(longitude, { label: 'longitude', max: 180 });
    if (lngErr) return res.status(400).json({ error: lngErr });
  }

  // 🔒 victim_name अब encrypted है — यहीं decrypt करके आगे SOS संदेशों में इस्तेमाल होता है
  const victimNameDecrypted = decryptField(current.rows[0].victim_name);

  // 🐛 बग फ़िक्स (गंभीर): पहले हर बार SOS दबाने पर — चाहे वह उसी आपात स्थिति के दौरान
  // दूसरी/तीसरी बार का टैप ही क्यों न हो (ग़लती से, घबराहट में, या नेटवर्क-रीट्राई से) —
  // पूरा अलर्ट-कैस्केड (हर अधिकारी/एडमिन को push + हर आपातकालीन संपर्क को SMS) दोबारा
  // भेजा जाता था। इससे SMS का असली ख़र्च बढ़ता, और बार-बार वही अलर्ट पाने से
  // अधिकारियों/परिवार में "अलर्ट-थकान" (alert fatigue) होती — जो असली अगली आपात स्थिति
  // की गंभीरता कम कर सकती है। अब सिर्फ़ *पहली बार* पूरा कैस्केड भेजा जाता है — SOS पहले
  // से सक्रिय हो तो बाद के कॉल सिर्फ़ लोकेशन चुपचाप ताज़ा करते हैं (जो एक उपयोगी
  // लोकेशन-रीफ़्रेश की तरह काम आता है), बिना दोबारा सबको अलार्म किए।
  const alreadyActive =
    current.rows[0].sos_triggered &&
    !current.rows[0].safe_arrival_confirmed &&
    current.rows[0].status !== 'निस्तारित' &&
    current.rows[0].status !== 'अस्वीकृत';

  // SOS दबाते ही लाइव लोकेशन शेयरिंग अपने-आप (स्वतः) चालू हो जाती है — नागरिक को अलग से toggle नहीं करना पड़ता
  // 🔒 latitude/longitude/live_lat/live_lng अब encrypted TEXT कॉलम हैं — भेजने से पहले
  // encrypt करना ज़रूरी है। "नज़दीकी थाना" दूरी-गणना (findNearestPoliceStation, नीचे)
  // असली (unencrypted) latitude/longitude पर होती है जो सीधे request body से आया है —
  // इसलिए यह encryption किसी computation को प्रभावित नहीं करती।
  const encLat = encryptField(latitude != null ? String(latitude) : null);
  const encLng = encryptField(longitude != null ? String(longitude) : null);
  await db.query(
    `UPDATE complaints SET sos_triggered = true, sos_triggered_at = COALESCE(sos_triggered_at, now()),
     latitude = COALESCE($1, latitude), longitude = COALESCE($2, longitude),
     live_share_active = CASE WHEN $1 IS NOT NULL THEN true ELSE live_share_active END,
     live_lat = COALESCE($1, live_lat), live_lng = COALESCE($2, live_lng),
     live_updated_at = CASE WHEN $1 IS NOT NULL THEN now() ELSE live_updated_at END
     WHERE id = $3`,
    [encLat, encLng, id]
  );

  if (alreadyActive) {
    // सिर्फ़ लोकेशन अपडेट — दोबारा पूरा अलर्ट-कैस्केड नहीं
    const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
    const history = await fetchHistory(id);
    return res.json(rowToComplaint(result.rows[0], history, req.user.role));
  }

  await db.query(
    `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
     VALUES ($1, (SELECT status FROM complaints WHERE id=$1), 'SOS सक्रिय किया गया — लाइव लोकेशन अपने-आप शेयर होना शुरू — तुरंत सहायता चाहिए', 'citizen', $2)`,
    [id, req.user.name]
  );

  // नागरिक की पूरी प्रोफ़ाइल — जवाब देने वाले अधिकारी/एडमिन को पूरी जानकारी तुरंत मिले
  const citizenRow = await db.query(
    'SELECT name, mobile, address, district, police_station, emergency_contacts, photo_url FROM citizens WHERE id = $1',
    [req.user.id]
  );
  const citizen = citizenRow.rows[0] || {};
  const profileSummary = `नाम: ${citizen.name || '—'} | मोबाइल: ${citizen.mobile || '—'} | पता: ${citizen.address || '—'} | ज़िला: ${citizen.district || '—'}`;

  // सबसे नज़दीकी थाना खोजना (LocationIQ से — असली भौगोलिक दूरी के आधार पर)
  let nearestStation = null;
  if (latitude && longitude) {
    try {
      const { findNearestPoliceStation } = require('./nearbyController');
      nearestStation = await findNearestPoliceStation(latitude, longitude);
    } catch (e) {
      console.error('SOS — nearest station खोजने में त्रुटि:', e.message);
    }
  }

  const sosTitle = '🆘 SOS अलर्ट — तुरंत कार्यवाही चाहिए';
  const sosBody = `${victimNameDecrypted} ने SOS दबाया — शिकायत ${id}${nearestStation ? ` | नज़दीकी थाना: ${nearestStation.name} (${nearestStation.distanceKm} किमी)` : ''}`;
  const sosData = {
    complaintId: id,
    sos: true,
    citizenProfile: profileSummary,
    nearestStation: nearestStation ? { name: nearestStation.name, address: nearestStation.address, distanceKm: nearestStation.distanceKm } : null,
  };

  // सभी *सक्रिय* admins को सूचना — 🐛 बग फ़िक्स: पहले is_active की कोई शर्त नहीं थी,
  // इसलिए ट्रांसफ़र/निष्क्रिय हो चुके पुराने admin खातों को भी सूचना भेजने की कोशिश होती थी
  const admins = await db.query('SELECT id, push_token FROM admins WHERE is_active = true');
  for (const a of admins.rows) {
    if (a.push_token) sendPushNotification(a.push_token, sosTitle, sosBody, sosData);
  }
  // 🆕 Notification Batching — पहले हर admin के लिए अलग INSERT चलती थी
  createNotificationsBatch(
    'admin',
    admins.rows.map((a) => ({ recipientId: a.id })),
    { title: sosTitle, body: sosBody, data: sosData, priority: 'critical' }
  );

  // ============================================================
  // 🚨 अधिकारियों को सूचना — यह हिस्सा किसी बाहरी सेवा पर निर्भर नहीं है।
  //
  // पहले सिर्फ़ भौगोलिक "नज़दीकी थाना" से नाम-मिलान होता था, जो व्यवहार में
  // लगभग हमेशा विफल रहता था — क्योंकि LocationIQ/OSM थाने का नाम अंग्रेज़ी में
  // देते हैं ("Hazratganj Police Station") जबकि डेटाबेस में हिंदी में है
  // ("हजरतगंज")। ऊपर से key न हो तो nearestStation ही null होता था, यानी
  // किसी अधिकारी को सूचना ही नहीं जाती थी।
  //
  // अब दो आधार हैं:
  //   1. क्षेत्राधिकार (jurisdiction) — शिकायत में चुना गया ज़िला/थाना।
  //      यह कानूनी रूप से सही थाना है और कभी विफल नहीं होता।
  //   2. भौगोलिक निकटता — अगर नज़दीकी थाना मिल गया हो तो उसके भी अधिकारी।
  // दोनों मिलाकर, बिना दोहराव (Set से)।
  // ============================================================
  const notifiedOfficers = new Set();
  const notifyOfficerRows = async (rows) => {
    for (const o of rows) {
      if (notifiedOfficers.has(o.id)) continue;
      notifiedOfficers.add(o.id);
      if (o.push_token) sendPushNotification(o.push_token, sosTitle, sosBody, sosData);
      createNotification({ recipientRole: 'officer', recipientId: o.id, title: sosTitle, body: sosBody, data: sosData, priority: 'critical' });
    }
  };

  // 1️⃣ क्षेत्राधिकार वाला थाना — सबसे भरोसेमंद रास्ता
  // 🐛 बग फ़िक्स (सुरक्षा-गंभीर): यहां पहले सीधा string-मिलान (station = $1) था,
  // जबकि इस पूरे प्रोजेक्ट में हर दूसरी जगह TRIM(LOWER(...)) से मिलान होता है।
  // शिकायत का police_station और अधिकारी का station अलग-अलग जगह से भरे जाते हैं,
  // इसलिए उनमें आगे-पीछे स्पेस या छोटे-बड़े अक्षर का फ़र्क़ आम है — और तब यह मिलान
  // चुपचाप विफल हो जाता। (यही चूक "थाने का सारांश 0 दिखने" वाले बग की भी जड़ थी।)
  // नतीजा यहां कहीं ज़्यादा भारी होता: थाने के किसी अधिकारी को SOS जाता ही नहीं,
  // और नीचे वाला ज़िला-fallback भी उसी सख़्त मिलान के कारण विफल हो सकता था — यानी
  // SOS सिर्फ़ admins तक सिमट जाता, ज़मीन पर मौजूद अधिकारी तक नहीं।
  const jurisdiction = current.rows[0];
  if (jurisdiction.police_station) {
    const stationOfficers = await db.query(
      `SELECT id, push_token FROM officers
       WHERE is_active = true AND TRIM(LOWER(station)) = TRIM(LOWER($1))
         AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2)))
       ORDER BY CASE rank WHEN 'SHO' THEN 0 ELSE 1 END`,
      [jurisdiction.police_station, jurisdiction.district || null]
    );
    await notifyOfficerRows(stationOfficers.rows);
  }

  // थाने में कोई अधिकारी न मिले तो पूरे ज़िले के अधिकारियों को —
  // SOS में "किसी को सूचना न जाए" से बुरा कुछ नहीं
  if (notifiedOfficers.size === 0 && jurisdiction.district) {
    const districtOfficers = await db.query(
      `SELECT id, push_token FROM officers WHERE is_active = true AND TRIM(LOWER(district)) = TRIM(LOWER($1))
       ORDER BY CASE rank WHEN 'SHO' THEN 0 ELSE 1 END LIMIT 20`,
      [jurisdiction.district]
    );
    await notifyOfficerRows(districtOfficers.rows);
  }

  // 2️⃣ भौगोलिक रूप से नज़दीकी थाना (अगर मिला हो) — नाम का कोई एक शब्द मिलाकर,
  //     क्योंकि "Hazratganj Police Station" में से "Hazratganj" ही काम का है
  //
  // 🐛 बग फ़िक्स (गंभीर): यहां थाने के नाम से मिलान होता था, पर ज़िले की कोई शर्त नहीं थी।
  // बहुत से थानों के नाम कई ज़िलों में एक जैसे होते हैं — ख़ासकर "कोतवाली", जो अब
  // (पूरे 75 ज़िलों की सूची जुड़ने के बाद) 65 ज़िलों में मौजूद है। नतीजा: लखनऊ के SOS
  // पर सोनभद्र/उन्नाव जैसे सैकड़ों किमी दूर के अधिकारियों को सूचना चली जाती, जो किसी
  // भी तरह मदद नहीं कर सकते — और ऐसे बेमतलब अलर्ट से असली SOS की गंभीरता भी घट जाती।
  // अब मिलान सिर्फ़ शिकायत के अपने ज़िले के अंदर होता है।
  if (nearestStation?.name && jurisdiction.district) {
    const words = String(nearestStation.name)
      .replace(/police station|thana|chowki|पुलिस|थाना|चौकी/gi, ' ')
      .split(/[\s,()-]+/)
      .filter((w) => w.length >= 4);
    for (const w of words) {
      const geoOfficers = await db.query(
        `SELECT id, push_token FROM officers
         WHERE is_active = true AND station ILIKE $1
           AND TRIM(LOWER(district)) = TRIM(LOWER($2)) LIMIT 10`,
        [`%${w}%`, jurisdiction.district]
      );
      await notifyOfficerRows(geoOfficers.rows);
    }
  }
  // पहले से नियुक्त अधिकारी को भी (अगर कोई हो, और वे अब भी सक्रिय हों)
  const assignedOfficer = await db.query(
    'SELECT o.id, o.push_token FROM complaints c JOIN officers o ON o.id = c.officer_id WHERE c.id = $1 AND o.is_active = true',
    [id]
  );
  if (assignedOfficer.rows[0]?.push_token) {
    sendPushNotification(assignedOfficer.rows[0].push_token, sosTitle, sosBody, sosData);
    createNotification({ recipientRole: 'officer', recipientId: assignedOfficer.rows[0].id, title: sosTitle, body: sosBody, data: sosData, priority: 'critical' });
  }

  // नागरिक के इमरजेंसी संपर्कों को भी SMS भेजें
  const { sendSms } = require('../utils/otp');
  const contacts = citizen.emergency_contacts || [];
  const mapsLink = latitude && longitude ? ` लोकेशन: https://maps.google.com/?q=${latitude},${longitude}` : '';
  for (const c of contacts) {
    if (c.phone) {
      sendSms(c.phone, `ShaktiCop अलर्ट: ${victimNameDecrypted} ने SOS भेजा है, तुरंत संपर्क करें।${mapsLink}`);
    }
  }

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  // कितने तक सूचना पहुँची — logs में साफ़ दिखे, और नागरिक को भी भरोसा मिले
  const reach = `${admins.rows.length} एडमिन, ${notifiedOfficers.size} अधिकारी`;
  logActivity({
    actorRole: 'citizen',
    actorId: req.user.id,
    actorName: req.user.name,
    action: 'sos_triggered',
    details: `शिकायत ${id} पर SOS — सूचना: ${reach}${jurisdiction.police_station ? ` | थाना: ${jurisdiction.police_station}` : ''}${nearestStation ? ` | नज़दीकी: ${nearestStation.name} (${nearestStation.distanceKm} किमी)` : ' | नज़दीकी थाना नहीं मिला'}`,
    req,
  });
  console.log(`[SOS] ${id} → ${reach}`);

  res.json({
    ...rowToComplaint(result.rows[0], history, req.user.role),
    nearestStation,
    alerted: { admins: admins.rows.length, officers: notifiedOfficers.size },
  });
}

// POST /complaints/:id/safe-arrival   (citizen)
// नागरिक ख़ुद बताता है कि वह सुरक्षित अपनी जगह पहुँच गया।
async function confirmSafeArrival(req, res) {
  const { id } = req.params;
  const current = await db.query(
    'SELECT citizen_id, officer_id, district, police_station, category, safe_arrival_confirmed FROM complaints WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (current.rows[0].citizen_id !== req.user.id) {
    return res.status(403).json({ error: 'यह आपकी शिकायत नहीं है' });
  }
  // 🐛 बग फ़िक्स (idempotency): हर बार बुलाने पर एक नई history-पंक्ति बनती और अधिकारी,
  // थाने के SHO व सभी संबंधित admins को दोबारा सूचना चली जाती। यानी बार-बार टैप करने
  // (या सीधे API लूप) से सबको एक ही बात की कई डुप्लीकेट सूचनाएं मिलतीं — ठीक वही
  // समस्या जो पहले triggerSos में मिली और ठीक की गई थी। अब दूसरी बार से चुपचाप वही
  // पहले वाला नतीजा लौटता है, कोई नई सूचना नहीं।
  if (current.rows[0].safe_arrival_confirmed) {
    const already = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
    const alreadyHistory = await fetchHistory(id);
    return res.json(rowToComplaint(already.rows[0], alreadyHistory, req.user.role));
  }

  await db.query('UPDATE complaints SET safe_arrival_confirmed = true, safe_arrival_confirmed_at = now() WHERE id = $1', [id]);
  await db.query(
    `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
     VALUES ($1, (SELECT status FROM complaints WHERE id=$1), 'मैं सुरक्षित अपनी जगह पहुँच गया, धन्यवाद।', 'citizen', $2)`,
    [id, req.user.name]
  );

  // 🐛 बग फ़िक्स: पहले सुरक्षित-पहुंच की पुष्टि पर संबंधित अधिकारी/एडमिन को कोई
  // सूचना नहीं जाती थी — उन्हें पता तभी चलता जब वे ख़ुद दोबारा शिकायत खोलकर देखते।
  const title = '✅ सुरक्षित पहुंच की पुष्टि';
  const body = `शिकायत ${id} — नागरिक ने अपनी सुरक्षित पहुंच की पुष्टि कर दी है।`;
  const { officer_id, district, police_station } = current.rows[0];
  if (officer_id) {
    const officer = await db.query('SELECT push_token FROM officers WHERE id = $1 AND is_active = true', [officer_id]);
    if (officer.rows[0]?.push_token) sendPushNotification(officer.rows[0].push_token, title, body, { complaintId: id });
    if (officer.rows[0]) createNotification({ recipientRole: 'officer', recipientId: officer_id, title, body, data: { complaintId: id } });
  }
  if (district && police_station) {
    const shos = await db.query(
      `SELECT id, push_token FROM officers WHERE rank = 'SHO' AND is_active = true
         AND TRIM(LOWER(district)) = TRIM(LOWER($1)) AND TRIM(LOWER(station)) = TRIM(LOWER($2)) AND id != $3`,
      [district, police_station, officer_id || null]
    );
    for (const sho of shos.rows) {
      if (sho.push_token) sendPushNotification(sho.push_token, title, body, { complaintId: id });
      createNotification({ recipientRole: 'officer', recipientId: sho.id, title, body, data: { complaintId: id } });
    }
  }

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  res.json(rowToComplaint(result.rows[0], history, req.user.role));
}

// POST /complaints/:id/checkin-response   (citizen)   body: { status } — 'safe' | 'not_arrived' | 'need_help'
// डिवाइस पर शेड्यूल्ड स्थानीय notification से यूज़र जब जवाब देता है, तब यह कॉल होता है।
// 'safe' के अलावा किसी भी जवाब पर एडमिन को अलर्ट जाता है।
async function checkinResponse(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ['safe', 'not_arrived', 'need_help'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'अमान्य जवाब' });

  const current = await db.query(
    'SELECT citizen_id, victim_name, officer_id, district, police_station FROM complaints WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (current.rows[0].citizen_id !== req.user.id) {
    return res.status(403).json({ error: 'यह आपकी शिकायत नहीं है' });
  }

  const labels = { safe: 'मैं सुरक्षित हूँ', not_arrived: 'अभी अपनी जगह नहीं पहुँचा/पहुँची', need_help: 'मुझे मदद चाहिए' };
  if (status === 'safe') {
    await db.query('UPDATE complaints SET safe_arrival_confirmed = true, safe_arrival_confirmed_at = now() WHERE id = $1', [id]);
  }
  await db.query(
    `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
     VALUES ($1, (SELECT status FROM complaints WHERE id=$1), $2, 'citizen', $3)`,
    [id, `सुरक्षा जांच का जवाब: ${labels[status]}`, req.user.name]
  );

  // 🐛 बग फ़िक्स: पहले यहां (1) सिस्टम के *सभी* admins को अलर्ट जाता था — कोई
  // district/थाना scope नहीं (राज्य-भर के अप्रासंगिक admins तक भी), और (2) नियुक्त
  // अधिकारी/थाने के SHO को — जो असल में मौक़े पर पहुंच सकते हैं — बिल्कुल भी सूचना
  // नहीं जाती थी। "मुझे मदद चाहिए" जैसे आपातकालीन जवाब पर यह गंभीर चूक थी।
  // अब SOS ट्रिगर जैसा ही पैटर्न — नियुक्त अधिकारी + उसी थाने के SHO + संबंधित ज़िले
  // के admins को सूचना जाती है।
  if (status !== 'safe') {
    const title = status === 'need_help' ? '🆘 सुरक्षा जांच — मदद चाहिए' : '⚠️ सुरक्षा जांच — ध्यान दें';
    const body = `${decryptField(current.rows[0].victim_name)}: ${labels[status]} — शिकायत ${id}`;
    // 🐛 बग फ़िक्स: यह notifications.priority व्यवस्था से जुड़ा नहीं था — "मुझे मदद
    // चाहिए" (need_help) भी SOS जितनी ही आपात-स्थिति है, पर हमेशा डिफ़ॉल्ट 'medium'
    // priority पर जाता, यानी अधिकारी की सूचना-सूची में एक सामान्य संदेश जैसा ही दिखता,
    // सबसे ऊपर/अलग नहीं — जबकि ठीक इसी समय सबसे ज़्यादा तुरंत ध्यान चाहिए होता है।
    const notifPriority = status === 'need_help' ? 'critical' : 'high';
    const { officer_id, district, police_station } = current.rows[0];

    if (officer_id) {
      const officer = await db.query('SELECT push_token FROM officers WHERE id = $1 AND is_active = true', [officer_id]);
      if (officer.rows[0]?.push_token) sendPushNotification(officer.rows[0].push_token, title, body, { complaintId: id });
      if (officer.rows[0]) createNotification({ recipientRole: 'officer', recipientId: officer_id, title, body, data: { complaintId: id }, priority: notifPriority });
    }
    if (district && police_station) {
      const shos = await db.query(
        `SELECT id, push_token FROM officers WHERE rank = 'SHO' AND is_active = true
           AND TRIM(LOWER(district)) = TRIM(LOWER($1)) AND TRIM(LOWER(station)) = TRIM(LOWER($2)) AND id != $3`,
        [district, police_station, officer_id || null]
      );
      for (const sho of shos.rows) {
        if (sho.push_token) sendPushNotification(sho.push_token, title, body, { complaintId: id });
        createNotification({ recipientRole: 'officer', recipientId: sho.id, title, body, data: { complaintId: id }, priority: notifPriority });
      }
    }
    // ज़िले से मेल खाने वाले admins + हमेशा राज्य-स्तर के admins (super_admin/SSP,
    // जिनका district NULL होता है) — बाकी असंबंधित ज़िलों के admins को नहीं
    const admins = await db.query(
      `SELECT id, push_token FROM admins WHERE is_active = true AND (district IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($1)))`,
      [district || '']
    );
    for (const a of admins.rows) {
      if (a.push_token) sendPushNotification(a.push_token, title, body, { complaintId: id });
      createNotification({ recipientRole: 'admin', recipientId: a.id, title, body, data: { complaintId: id }, priority: notifPriority });
    }
    // 🆕 Notification Batching — पहले हर admin के लिए अलग INSERT चलती थी
    createNotificationsBatch(
      'admin',
      admins.rows.map((a) => ({ recipientId: a.id })),
      { title, body, data: { complaintId: id } }
    );
  }

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  res.json(rowToComplaint(result.rows[0], history, req.user.role));
}

// PATCH /complaints/:id/feedback   (citizen)   body: { rating, note }
async function submitFeedback(req, res) {
  const { id } = req.params;
  const { rating, note } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'रेटिंग 1 से 5 के बीच होनी चाहिए' });
  }
  // 🐛 बग फ़िक्स: टिप्पणी की कोई लंबाई-सीमा नहीं थी — बाक़ी हर टेक्स्ट फ़ील्ड पर
  // validateTextLength लगी है, सिर्फ़ यही छूट गई थी
  const noteErr = validateTextLength(note, { max: 1000, label: 'प्रतिक्रिया' });
  if (noteErr) return res.status(400).json({ error: noteErr });

  const current = await db.query('SELECT citizen_id, status, feedback_rating FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (current.rows[0].citizen_id !== req.user.id) {
    return res.status(403).json({ error: 'यह आपकी शिकायत नहीं है' });
  }
  // 🐛 बग फ़िक्स: प्रतिक्रिया बार-बार बदली जा सकती थी। मोबाइल UI तो एक बार रेटिंग देने
  // के बाद फ़ॉर्म छिपा देता है, पर backend असीमित बार बदलने देता था — यानी सीधे API से
  // कोई अपनी रेटिंग बार-बार बदलकर किसी अधिकारी का औसत जब चाहे ऊपर-नीचे कर सकता था।
  if (current.rows[0].feedback_rating != null) {
    return res.status(400).json({ error: 'आप इस शिकायत पर पहले ही प्रतिक्रिया दे चुके हैं' });
  }
  // 🐛 बग फ़िक्स: मोबाइल UI प्रतिक्रिया-फ़ॉर्म सिर्फ़ बंद हो चुकी शिकायत पर दिखाता है,
  // पर backend यह कभी जांचता ही नहीं था — सीधे API बुलाकर किसी चालू (अभी जांच जारी)
  // शिकायत को भी रेटिंग दी जा सकती थी। चूंकि यह रेटिंग अधिकारी की performance
  // (leaderboard/analytics का avg_rating) में गिनी जाती है, इससे किसी अधिकारी के
  // आंकड़े अनुचित रूप से बिगाड़े जा सकते थे — जबकि उसका काम अभी पूरा ही नहीं हुआ।
  if (!['निस्तारित', 'अस्वीकृत'].includes(current.rows[0].status)) {
    return res.status(400).json({ error: 'शिकायत बंद होने के बाद ही प्रतिक्रिया दी जा सकती है' });
  }

  await db.query(
    'UPDATE complaints SET feedback_rating = $1, feedback_note = $2, feedback_submitted_at = now() WHERE id = $3',
    [rating, note || null, id]
  );

  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const history = await fetchHistory(id);
  res.json(rowToComplaint(result.rows[0], history, req.user.role));
}

// GET /track/:id   (सार्वजनिक — कोई लॉगिन आवश्यक नहीं, सिर्फ़ शिकायत नंबर से)
// संवेदनशील जानकारी (पीड़ित का नाम/मोबाइल/पता) नहीं दिखाई जाती — सिर्फ़ स्थिति ट्रैक करने के लिए।
async function trackComplaint(req, res) {
  const { id } = req.params;
  const result = await db.query(
    // 🔒 निजता फ़िक्स: category यहाँ से हटाई गई — नीचे res.json में कारण देखें
    `SELECT c.id, c.status, c.created_at, c.updated_at, o.name AS officer_name
     FROM complaints c LEFT JOIN officers o ON o.id = c.officer_id WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'यह शिकायत नंबर नहीं मिला — कृपया दोबारा जांचें' });
  }
  const history = await db.query(
    'SELECT status, created_at FROM complaint_history WHERE complaint_id = $1 ORDER BY created_at ASC',
    [id]
  );
  const r = result.rows[0];
  res.json({
    id: r.id,
    // 🔒 निजता फ़िक्स: यह endpoint बिना लॉगिन के चलता है — सिर्फ़ शिकायत-नंबर से।
    // पहले यह श्रेणी भी लौटाता था, यानी शिकायत-नंबर देख पाने वाला कोई भी जान सकता था
    // कि मामला "घरेलू हिंसा" का है। पीड़िता के फ़ोन पर, पावती की पर्ची पर या QR में
    // यह नंबर आरोपी की नज़र में आ सकता है — और तब यही जानकारी उसे पक्का बता देती कि
    // उसने उसके ख़िलाफ़ शिकायत की है। घरेलू हिंसा में यह सीधा ख़तरा है।
    //
    // हटाने से असली उपयोगकर्ता का कुछ नहीं जाता: शिकायत उसी ने दर्ज की है, श्रेणी
    // उसे पहले से पता है। स्थिति व timeline से "मेरी शिकायत का क्या हुआ" पूरी तरह
    // पता चल जाता है — जो इस endpoint का असल मक़सद है।
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    officerAssigned: !!r.officer_name,
    timeline: history.rows.map((h) => ({ status: h.status, at: h.created_at })),
  });
}

// GET /admin/overdue-complaints   — SLA पार कर चुकी शिकायतें (48 घंटे से लंबित/कार्यवाही में)
async function getOverdueComplaints(req, res) {
  const { buildScopeClause } = require('../utils/scopeFilter');
  const { clause, params } = buildScopeClause(req, [], 'c');
  const result = await db.query(
    `${SELECT_BASE}
     WHERE c.status NOT IN ('निस्तारित', 'अस्वीकृत')
       AND c.deleted_at IS NULL
       AND c.created_at < now() - interval '48 hours' ${clause}
     ORDER BY c.created_at ASC`,
    params
  );
  res.json(
    result.rows.map((row) => ({
      ...rowToComplaint(row, undefined, req.user.role),
      overdueSinceHours: Math.floor((Date.now() - new Date(row.created_at)) / (1000 * 60 * 60)),
    }))
  );
}

// PATCH /complaints/:id/priority   (admin)   body: { priority: 'सामान्य'|'उच्च'|'अति-आवश्यक' }
async function updatePriority(req, res) {
  const { id } = req.params;
  const { priority } = req.body;
  if (!['सामान्य', 'उच्च', 'अति-आवश्यक'].includes(priority)) {
    return res.status(400).json({ error: 'अमान्य प्राथमिकता' });
  }
  const scoped = await db.query('SELECT district, police_station, citizen_id, officer_id FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (scoped.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (!canViewComplaint(req, scoped.rows[0])) {
    return res.status(403).json({ error: 'इस शिकायत में बदलाव की अनुमति नहीं है' });
  }
  const result = await db.query('UPDATE complaints SET priority = $1 WHERE id = $2 RETURNING id', [priority, id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  logActivity({ actorRole: req.user.role, actorId: req.user.id, actorName: req.user.name, action: 'priority_updated', details: `शिकायत ${id} की प्राथमिकता "${priority}" की गई`, req });
  res.json({ message: 'सुरक्षित हुआ', priority });
}

// PATCH /complaints/:id/checklist   (officer)   body: { key, done }
async function toggleChecklistItem(req, res) {
  const { id } = req.params;
  const { key, done } = req.body;
  const current = await db.query('SELECT checklist, officer_id, district, police_station, citizen_id FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  // 🐛 बग फ़िक्स: यह वही चूक थी जो updateStatus में मिली — SHO अपने ही थाने की उस
  // शिकायत की checklist नहीं बदल सकता था जो किसी मातहत को नियुक्त है (या अभी किसी
  // को नियुक्त ही नहीं हुई)। canViewComplaint() पहले से SHO को पूरे थाने का दायरा
  // देता है (और ठीक नीचे admin के लिए इस्तेमाल भी हो रहा है), इसलिए officer को भी
  // उसी से गुज़ारना बाक़ी पूरे सिस्टम से मेल खाता है।
  if (req.user.role === 'officer' && !canViewComplaint(req, current.rows[0])) {
    return res.status(403).json({ error: 'यह मामला आपको नियुक्त नहीं है' });
  }
  if (req.user.role === 'admin' && !canViewComplaint(req, current.rows[0])) {
    return res.status(403).json({ error: 'इस शिकायत में बदलाव की अनुमति नहीं है' });
  }
  let checklist = current.rows[0].checklist || [];
  if (!checklist.find((c) => c.key === key)) {
    checklist = STANDARD_CHECKLIST.map((item) => ({ ...item, done: false, doneAt: null }));
  }
  checklist = checklist.map((item) =>
    item.key === key ? { ...item, done: !!done, doneAt: done ? new Date().toISOString() : null } : item
  );
  await db.query('UPDATE complaints SET checklist = $1 WHERE id = $2', [JSON.stringify(checklist), id]);
  res.json({ checklist });
}

// POST /complaints/:id/verify   (admin) — निस्तारण की पेशेवर पुष्टि/sign-off
async function verifyResolution(req, res) {
  const { id } = req.params;
  const current = await db.query('SELECT status, district, police_station, citizen_id, officer_id, admin_verified FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (!canViewComplaint(req, current.rows[0])) {
    return res.status(403).json({ error: 'इस शिकायत को सत्यापित करने की अनुमति नहीं है' });
  }
  if (current.rows[0].status !== 'निस्तारित') {
    return res.status(400).json({ error: 'सिर्फ़ निस्तारित शिकायतों को सत्यापित किया जा सकता है' });
  }

  // 🐛 बग फ़िक्स: पहले से सत्यापित शिकायत दोबारा सत्यापित हो जाती थी। हर बार एक नई
  // इतिहास-पंक्ति बनती (मामले की timeline में वही बात बार-बार दिखती), और
  // admin_verified_by चुपचाप बदलकर उसका नाम हो जाता जिसने आख़िरी बार दबाया — जबकि
  // यही पंक्ति यह रिकॉर्ड है कि निस्तारण पर किसने मुहर लगाई। दो एडमिन साथ काम कर
  // रहे हों, या कोई दो बार टैप कर दे, तो जवाबदेही का रिकॉर्ड ही गड़बड़ा जाता।
  if (current.rows[0].admin_verified) {
    return res.status(400).json({ error: 'यह शिकायत पहले ही सत्यापित की जा चुकी है' });
  }
  await db.query(
    'UPDATE complaints SET admin_verified = true, admin_verified_at = now(), admin_verified_by = $1 WHERE id = $2',
    [req.user.name, id]
  );
  await db.query(
    `INSERT INTO complaint_history (complaint_id, status, note, actor_role, actor_name)
     VALUES ($1, 'निस्तारित', 'एडमिन द्वारा निस्तारण सत्यापित/सत्यापित किया गया', 'admin', $2)`,
    [id, req.user.name]
  );
  logActivity({ actorRole: 'admin', actorId: req.user.id, actorName: req.user.name, action: 'resolution_verified', details: `शिकायत ${id} का निस्तारण सत्यापित किया`, req });
  res.json({ message: 'सत्यापित किया गया' });
}

// PATCH /complaints/:id/live-location   (citizen only, अपनी ही शिकायत पर)
// body: { active: true, latitude, longitude, accuracy }  — सहमति देकर लाइव लोकेशन शुरू/अपडेट करना
// body: { active: false }                                 — लाइव लोकेशन शेयरिंग बंद करना
async function updateLiveLocation(req, res) {
  const { id } = req.params;
  const { active, latitude, longitude, accuracy } = req.body;

  const check = await db.query('SELECT citizen_id, status FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (check.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  if (check.rows[0].citizen_id !== req.user.id) {
    return res.status(403).json({ error: 'सिर्फ़ अपनी शिकायत पर लाइव लोकेशन शेयर कर सकते हैं' });
  }
  // 🐛 बग फ़िक्स: बंद हो चुकी शिकायत की स्थिति यहां जांची ही नहीं जाती थी। यानी केस
  // निस्तारित/अस्वीकृत होने के बाद भी डिवाइस लोकेशन भेजता रहता और सर्वर उसे स्वीकार
  // करके live_share_active दोबारा true कर देता — केस बंद होने पर शेयरिंग रोकने वाला
  // सुधार इसी से बेअसर हो जाता। अब बंद केस पर नई लोकेशन नहीं ली जाती। (ध्यान दें:
  // "बंद करो" वाला अनुरोध — active === false — फिर भी चलने दिया जाता है, ताकि डिवाइस
  // हमेशा सफ़ाई कर सके और कोई शेयरिंग अटकी न रह जाए।)
  if (active !== false && ['निस्तारित', 'अस्वीकृत'].includes(check.rows[0].status)) {
    return res.status(409).json({ error: 'यह मामला बंद हो चुका है — अब लाइव लोकेशन शेयर नहीं होती', complaintClosed: true });
  }

  if (active === false) {
    await db.query('UPDATE complaints SET live_share_active = false WHERE id = $1', [id]);
    return res.json({ message: 'लाइव लोकेशन शेयरिंग बंद की गई', liveShareActive: false });
  }

  // 🐛 बग फ़िक्स: पहले सिर्फ़ "null तो नहीं" जांचा जाता था — "abc" जैसी स्ट्रिंग या
  // 999999 जैसा असंभव मान भी पास होकर encrypt व सेव हो जाता, और बाद में अधिकारी के
  // नक़्शे पर NaN/बेतुकी जगह बनकर उभरता (trail तालिका में भी कचरा जमा होता)। अब
  // दोनों निर्देशांक असली संख्या व वैध दायरे में होने चाहिए।
  const latErr = validateCoordinate(latitude, { label: 'latitude', max: 90 });
  if (latErr) return res.status(400).json({ error: latErr });
  const lngErr = validateCoordinate(longitude, { label: 'longitude', max: 180 });
  if (lngErr) return res.status(400).json({ error: lngErr });
  // 🔒 live_lat/live_lng/complaint_location_trail अब encrypted TEXT कॉलम हैं
  const encLat = encryptField(String(latitude));
  const encLng = encryptField(String(longitude));
  await db.query(
    `UPDATE complaints SET live_share_active = true, live_lat = $1, live_lng = $2, live_accuracy = $3, live_updated_at = now() WHERE id = $4`,
    [encLat, encLng, accuracy || null, id]
  );
  // 🆕 पूरा रास्ता (trail) भी सेव करें — सिर्फ़ आख़िरी बिंदु नहीं। इससे अधिकारी बाद में
  // पूरा चला हुआ रास्ता देख सकते हैं, सिर्फ़ मौजूदा स्थिति नहीं।
  await db.query(
    `INSERT INTO complaint_location_trail (complaint_id, latitude, longitude, accuracy) VALUES ($1,$2,$3,$4)`,
    [id, encLat, encLng, accuracy || null]
  );
  res.json({ message: 'लाइव लोकेशन अपडेट हुई', liveShareActive: true, liveLat: latitude, liveLng: longitude, liveAccuracy: accuracy || null });
}

// GET /complaints/:id/location-trail   (citizen अपनी शिकायत की, या officer/admin जिनके पास इसे देखने की अनुमति है)
// query: since? — सिर्फ़ इस समय के बाद के बिंदु (हर बार पूरा इतिहास दोबारा न भेजना पड़े)
async function getLocationTrail(req, res) {
  const { id } = req.params;
  const { since } = req.query;

  const row = await db.query('SELECT district, police_station, citizen_id, officer_id FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (row.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  const complaintRow = row.rows[0];

  const isOwnCitizen = req.user.role === 'citizen' && complaintRow.citizen_id === req.user.id;
  if (!isOwnCitizen && !canViewComplaint(req, complaintRow)) {
    return res.status(403).json({ error: 'इस शिकायत का रास्ता देखने की अनुमति नहीं है' });
  }

  const params = [id];
  let sinceClause = '';
  if (since) {
    params.push(since);
    sinceClause = ` AND recorded_at > $${params.length}`;
  }
  // बहुत लंबी यात्रा में हज़ारों बिंदु न भेजें — सबसे हाल के 500 काफ़ी हैं नक़्शे के लिए
  const result = await db.query(
    `SELECT latitude, longitude, accuracy, recorded_at FROM complaint_location_trail
     WHERE complaint_id = $1 ${sinceClause}
     ORDER BY recorded_at DESC LIMIT 500`,
    params
  );
  const decryptedPoints = result.rows.reverse().map((r) => ({
    latitude: decryptGeo(r.latitude),
    longitude: decryptGeo(r.longitude),
    accuracy: r.accuracy,
    recordedAt: r.recorded_at,
  }));

  // 🐛 बग फ़िक्स (उपयोगकर्ता-रिपोर्ट — नक़्शे पर बेतरतीब रेखाएं): जब नागरिक एक ही
  // जगह रुका हो (हिलता न हो), फ़ोन का GPS सामान्य रूप से हर बार कुछ मीटर इधर-उधर
  // (सेंसर-शोर, ख़ासकर घर के अंदर सिग्नल के उछलने से) रीडिंग देता है। हर एक कच्चे
  // बिंदु को लाइन से जोड़ने पर वह असली चला हुआ रास्ता नहीं, बल्कि एक उलझी हुई
  // लकीर/स्क्रिबल जैसा दिखता — बिल्कुल वैसा ही जैसा असली इस्तेमाल में सामने आया।
  // अब सिर्फ़ वही बिंदु रखते हैं जो पिछले रखे-गए बिंदु से सच में कुछ दूरी (15+ मीटर)
  // पर हों — यह असली चलना दिखाता है, बेमतलब का GPS-कंपन नहीं।
  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const MIN_TRAIL_DISTANCE_METERS = 15;
  const simplified = [];
  for (const p of decryptedPoints) {
    if (p.latitude == null || p.longitude == null) continue;
    const last = simplified[simplified.length - 1];
    if (!last || haversineMeters(last, p) >= MIN_TRAIL_DISTANCE_METERS) {
      simplified.push(p);
    }
  }
  // आख़िरी (सबसे हाल का) बिंदु हमेशा शामिल रहे, भले ही वह दूरी-सीमा में न आए —
  // ताकि "अभी कहां है" हमेशा सही दिखे, पुराना न रह जाए
  const lastRaw = decryptedPoints[decryptedPoints.length - 1];
  if (lastRaw && simplified[simplified.length - 1] !== lastRaw) {
    simplified.push(lastRaw);
  }

  res.json(simplified);
}

// GET /complaints/:id/verify   (सिर्फ़ officer/admin — QR स्कैन से)
// ================================================================
// रसीद पर छपे QR को कोई भी ड्यूटी अधिकारी/एडमिन — चाहे उस मामले से जुड़ा हो या न हो, किसी भी
// थाने पर — स्कैन करके शिकायत असली है या नहीं यह तुरंत सत्यापित कर सके, इसलिए यह जानबूझकर
// सामान्य canViewComplaint() के district/station स्कोप से अलग रखा गया है। सिर्फ़ लॉगिन ज़रूरी है
// (नागरिक इसे इस्तेमाल नहीं कर सकते) — पूरी तरह अजनबी को यह जानकारी नहीं मिलती।
// GET /complaints/:id/verify   (officer/admin) — QR स्कैन करने पर पूरी शिकायत दिखती है
// 🔒 सुरक्षा फ़िक्स: पहले यहां कोई scope जांच नहीं थी — शिकायत ID का पैटर्न अनुमान लगाने
// योग्य है (मोबाइल के अंक + समय से बनता है), इसलिए बिना scope-check के कोई भी लॉगिन-किया
// अधिकारी/एडमिन दूसरे ज़िले/थाने की शिकायत का पूरा विवरण — पीड़िता का नाम, मोबाइल, पता
// सहित — निकाल सकता था। अब बाक़ी जगह जैसी ही canViewComplaint जांच यहां भी है।
async function verifyByQr(req, res) {
  const { id } = req.params;
  const result = await db.query(`${SELECT_BASE} WHERE c.id = $1`, [id]);
  const row = result.rows[0];
  if (!row) {
    return res.status(404).json({ error: 'यह QR किसी शिकायत से मेल नहीं खाता — फ़र्ज़ी या पुराना हो सकता है' });
  }
  if (!canViewComplaint(req, row)) {
    return res.status(403).json({ error: 'यह शिकायत आपके थाने/क्षेत्र की नहीं है — आप इसे सत्यापित नहीं कर सकते' });
  }
  res.json(rowToComplaint(row, undefined, req.user.role));
}

// DELETE /complaints/:id   (सिर्फ़ Super Admin — शिकायत को डेटाबेस से पूरी तरह हटाना)
// ================================================================
// 🆕 बग फ़िक्स (गंभीर): पहले यह स्थायी (permanent) कार्रवाई थी — शिकायत, उसकी पूरी
// history, private notes, field visits सब हमेशा के लिए डेटाबेस से हट जाते थे, कोई
// "soft delete" व्यवस्था नहीं थी, न ही वापस लाने (undo/restore) का कोई तरीक़ा। गलती
// से या दुर्भावना से हटाई गई शिकायत (जो एक कानूनी/साक्ष्य दस्तावेज़ है) हमेशा के लिए
// खो जाती थी।
//
// अब यह सिर्फ़ deleted_at भरता है (असली डेटा जस का तस बना रहता है) — शिकायत तुरंत
// सामान्य सूचियों/खोज/track से गायब हो जाती है, पर Super Admin "हटाई गई शिकायतें"
// सूची से चाहें तो उसे वापस ला सकते हैं (restoreComplaint)। route-level पर अब भी
// सिर्फ़ super_admin तक सीमित (requireSuperAdmin middleware)।
async function deleteComplaint(req, res) {
  const { id } = req.params;

  const existing = await db.query(
    'SELECT id, category, district, police_station, victim_name, status FROM complaints WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  }
  const row = existing.rows[0];

  await db.query('UPDATE complaints SET deleted_at = now(), deleted_by_id = $1, deleted_by_name = $2 WHERE id = $3', [
    req.user.id,
    req.user.name,
    id,
  ]);

  logActivity({
    actorRole: 'admin',
    actorId: req.user.id,
    actorName: req.user.name,
    action: 'complaint_deleted',
    details: `शिकायत ${id} (${row.category} — ${row.police_station || row.district || '—'}, स्थिति: ${row.status}) हटाई गई (soft-delete — वापस लाई जा सकती है)`,
    req,
  });

  res.json({ message: 'शिकायत हटा दी गई (Super Admin "हटाई गई शिकायतें" सूची से वापस ला सकते हैं)', id });
}

// GET /admin/complaints/deleted   (सिर्फ़ Super Admin) — हटाई गई शिकायतें, वापस लाने के लिए
async function listDeletedComplaints(req, res) {
  const result = await db.query(
    `${SELECT_BASE} WHERE c.deleted_at IS NOT NULL ORDER BY c.deleted_at DESC LIMIT 200`
  );
  res.json(result.rows.map((row) => rowToComplaint(row, undefined, req.user.role)));
}

// POST /admin/complaints/:id/restore   (सिर्फ़ Super Admin) — हटाई गई शिकायत वापस लाना
async function restoreComplaint(req, res) {
  const { id } = req.params;
  const existing = await db.query('SELECT id, category FROM complaints WHERE id = $1 AND deleted_at IS NOT NULL', [id]);
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: 'यह शिकायत हटाई गई सूची में नहीं मिली' });
  }
  await db.query('UPDATE complaints SET deleted_at = NULL, deleted_by_id = NULL, deleted_by_name = NULL WHERE id = $1', [id]);
  logActivity({
    actorRole: 'admin',
    actorId: req.user.id,
    actorName: req.user.name,
    action: 'complaint_restored',
    details: `शिकायत ${id} वापस लाई गई`,
    req,
  });
  res.json({ message: 'शिकायत वापस लाई गई', id });
}

// ============================================================
// 🆕 Complaint Chat — नागरिक और नियुक्त अधिकारी के बीच सीधी बातचीत, हमेशा किसी
// एक शिकायत के दायरे में। जान-बूझकर canViewComplaint (जो पूरे ज़िले/सर्किल तक
// खुला है, निगरानी के लिए) से ज़्यादा सख़्त — सिर्फ़ नागरिक खुद, नियुक्त अधिकारी,
// या उसी थाने का SHO ही चैट कर सकते हैं। इससे पीड़िता को हमेशा पता रहता है कि
// वह ठीक-ठीक किससे बात कर रही है, कोई अनजान अधिकारी अचानक संदेश नहीं भेज सकता।
// ============================================================
async function assertChatAccess(req, complaintId) {
  const row = await db.query(
    'SELECT citizen_id, officer_id, police_station FROM complaints WHERE id = $1 AND deleted_at IS NULL',
    [complaintId]
  );
  if (row.rows.length === 0) return { ok: false, code: 404, error: 'शिकायत नहीं मिली' };
  const c = row.rows[0];
  if (req.user.role === 'citizen') {
    if (c.citizen_id !== req.user.id) return { ok: false, code: 403, error: 'यह आपकी शिकायत नहीं है' };
    return { ok: true };
  }
  if (req.user.role === 'officer') {
    const isAssigned = c.officer_id === req.user.id;
    const isStationSHO =
      req.user.rank === 'SHO' && (req.user.station || '').trim().toLowerCase() === (c.police_station || '').trim().toLowerCase();
    if (!isAssigned && !isStationSHO) {
      return { ok: false, code: 403, error: 'सिर्फ़ नियुक्त अधिकारी या थाना प्रभारी ही इस शिकायत पर बात कर सकते हैं' };
    }
    return { ok: true };
  }
  return { ok: false, code: 403, error: 'अनुमति नहीं है' };
}

function toChatMessage(r) {
  return {
    id: r.id,
    complaintId: r.complaint_id,
    senderRole: r.sender_role,
    senderId: r.sender_id,
    senderName: r.sender_name,
    body: r.body,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

// GET /complaints/:id/messages
async function listComplaintMessages(req, res) {
  const { id } = req.params;
  const access = await assertChatAccess(req, id);
  if (!access.ok) return res.status(access.code).json({ error: access.error });

  const result = await db.query('SELECT * FROM complaint_messages WHERE complaint_id = $1 ORDER BY created_at ASC', [id]);
  // देखते ही "पढ़ा" चिह्नित करें — सिर्फ़ दूसरे पक्ष द्वारा भेजे गए संदेश
  await db.query(
    `UPDATE complaint_messages SET read_at = now()
     WHERE complaint_id = $1 AND sender_role != $2 AND read_at IS NULL`,
    [id, req.user.role]
  );
  res.json(result.rows.map(toChatMessage));
}

// POST /complaints/:id/messages   body: { body }
async function sendComplaintMessage(req, res) {
  const { id } = req.params;
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'संदेश खाली नहीं हो सकता' });
  const bodyErr = validateTextLength(body, { max: 2000, label: 'संदेश' });
  if (bodyErr) return res.status(400).json({ error: bodyErr });

  const access = await assertChatAccess(req, id);
  if (!access.ok) return res.status(access.code).json({ error: access.error });

  const result = await db.query(
    `INSERT INTO complaint_messages (complaint_id, sender_role, sender_id, sender_name, body)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, req.user.role, req.user.id, req.user.name, body.trim()]
  );

  // दूसरे पक्ष को सूचना — नागरिक ने भेजा तो नियुक्त अधिकारी को, अधिकारी ने भेजा तो नागरिक को
  const complaintRow = await db.query('SELECT citizen_id, officer_id, district, police_station FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  const c = complaintRow.rows[0];
  if (req.user.role === 'citizen' && c?.officer_id) {
    const officer = await db.query('SELECT push_token, notification_preferences FROM officers WHERE id = $1', [c.officer_id]);
    // 🐛 बग फ़िक्स: notification_preferences यहाँ पहले से लाई जा रही थीं, पर कभी जांची
    // नहीं जाती थीं — जबकि बाक़ी हर सूचना-रास्ता (नई शिकायत, नियुक्ति, overdue) इनका
    // सम्मान करता है। यानी अधिकारी सूचनाएं बंद करके भी chat-push पाता रहता।
    // बाक़ी जगह वाला ही तरीक़ा अपनाया गया है: push preference से तय होती है, पर in-app
    // सूचना हमेशा जाती है — ताकि संदेश कभी खोए नहीं, सिर्फ़ फ़ोन की घंटी रुके।
    if (officer.rows[0]?.push_token && officer.rows[0]?.notification_preferences?.newComplaint !== false) {
      sendPushNotification(officer.rows[0].push_token, `💬 ${req.user.name} — नया संदेश`, body.trim(), { complaintId: id, chatMessage: true });
    }
    createNotification({ recipientRole: 'officer', recipientId: c.officer_id, title: `💬 ${req.user.name} — नया संदेश`, body: body.trim(), data: { complaintId: id, chatMessage: true } });
  } else if (req.user.role === 'citizen' && c?.police_station) {
    // 🐛 बग फ़िक्स: पहले सूचना सिर्फ़ c.officer_id को जाती थी। यानी जब तक शिकायत किसी
    // अधिकारी को नियुक्त न हो, नागरिक का संदेश *किसी तक पहुँचता ही नहीं* — और यही वह
    // समय है जब पीड़िता सबसे ज़्यादा ज़रूरी जानकारी जोड़ती है (शिकायत दर्ज होने के ठीक
    // बाद)। संदेश डेटाबेस में सेव तो होता, पर कोई देखता ही नहीं। थाना प्रभारी इस चैट
    // को पहले से पढ़ सकता है (assertChatAccess उसे थाना-स्तर की पहुँच देता है), इसलिए
    // उसे सूचित करने से कोई नई पहुँच नहीं मिलती — बस संदेश सही व्यक्ति तक पहुँच जाता है।
    const shos = await db.query(
      `SELECT id, push_token, notification_preferences FROM officers
       WHERE rank = 'SHO' AND is_active = true
         AND TRIM(LOWER(station)) = TRIM(LOWER($1))
         AND ($2::text IS NULL OR TRIM(LOWER(district)) = TRIM(LOWER($2)))`,
      [c.police_station, c.district || null]
    );
    for (const sho of shos.rows) {
      // ऊपर वाली शाखा जैसा ही — push preference से तय, in-app हमेशा
      if (sho.push_token && sho.notification_preferences?.newComplaint !== false) {
        sendPushNotification(sho.push_token, `💬 ${req.user.name} — नया संदेश`, body.trim(), { complaintId: id, chatMessage: true });
      }
      createNotification({ recipientRole: 'officer', recipientId: sho.id, title: `💬 ${req.user.name} — नया संदेश`, body: body.trim(), data: { complaintId: id, chatMessage: true } });
    }
  } else if (req.user.role === 'officer' && c?.citizen_id) {
    const citizen = await db.query('SELECT push_token FROM citizens WHERE id = $1', [c.citizen_id]);
    if (citizen.rows[0]?.push_token) {
      sendPushNotification(citizen.rows[0].push_token, `💬 ${req.user.name} — नया संदेश`, body.trim(), { complaintId: id, chatMessage: true });
    }
    createNotification({ recipientRole: 'citizen', recipientId: c.citizen_id, title: `💬 ${req.user.name} — नया संदेश`, body: body.trim(), data: { complaintId: id, chatMessage: true } });
  }

  res.status(201).json(toChatMessage(result.rows[0]));
}

// GET /complaints/:id/accused-history   (सिर्फ़ officer/admin — नागरिक नहीं)
//
// 🆕 दोहराए-आरोपी की पहचान (Repeat-Offender Linking) — असली फ़ीचर यही है। एक ही
// आरोपी के मोबाइल-नंबर से मिलती (accused_mobile_hash) बाक़ी शिकायतों को ढूंढता है।
//
// 🔒 गोपनीयता का ध्यान: यहां दूसरी पीड़िताओं का नाम/मोबाइल/पता कभी नहीं भेजा जाता
// — सिर्फ़ ID/श्रेणी/स्थिति/ज़िला/तारीख़ (पैटर्न पहचानने के लिए काफ़ी) ताकि किसी और
// पीड़िता की पहचान उजागर न हो। अगर अधिकारी को उस दूसरी शिकायत को पूरी तरह देखना है,
// तो वह उसी canViewComplaint स्कोप-जांच से गुज़रेगा जैसे किसी भी शिकायत के लिए होता है।
async function getAccusedHistory(req, res) {
  // 🔒 यह सिर्फ़ officer/admin के लिए है — नागरिक अपनी ही शिकायत का पूरा विवरण देख
  // सकता है, पर "दूसरी कितनी शिकायतें इसी आरोपी पर हैं" जानकारी नहीं — भले ही वहां
  // सिर्फ़ संख्या/श्रेणी दिखे, यह अप्रत्यक्ष रूप से दूसरी पीड़िताओं के अस्तित्व का
  // संकेत देती है, जो सिर्फ़ जांच करने वाले अधिकारी को पता होना चाहिए।
  if (req.user.role === 'citizen') {
    return res.status(403).json({ error: 'अनुमति नहीं है' });
  }
  const { id } = req.params;
  const current = await db.query('SELECT * FROM complaints WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (current.rows.length === 0) return res.status(404).json({ error: 'शिकायत नहीं मिली' });
  const row = current.rows[0];

  if (!canViewComplaint(req, row)) {
    return res.status(403).json({ error: 'इस शिकायत को देखने की अनुमति नहीं है' });
  }
  if (!row.accused_mobile_hash) {
    return res.json({ hasAccusedInfo: false, priorComplaints: [] });
  }

  const others = await db.query(
    `SELECT id, category, status, district, police_station, created_at
     FROM complaints
     WHERE accused_mobile_hash = $1 AND id != $2 AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 20`,
    [row.accused_mobile_hash, id]
  );

  res.json({
    hasAccusedInfo: true,
    priorComplaintsCount: others.rows.length,
    priorComplaints: others.rows.map((r) => ({
      id: r.id,
      category: r.category,
      status: r.status,
      district: r.district,
      policeStation: r.police_station,
      createdAt: r.created_at,
    })),
  });
}

module.exports = {
  createComplaint,
  listComplaints,
  getComplaint,
  getAccusedHistory,
  assignOfficer,
  updateStatus,
  alertOfficer,
  transferComplaint,
  triggerSos,
  confirmSafeArrival,
  checkinResponse,
  submitFeedback,
  markViewed,
  trackComplaint,
  getOverdueComplaints,
  updatePriority,
  toggleChecklistItem,
  verifyResolution,
  updateLiveLocation,
  getLocationTrail,
  verifyByQr,
  deleteComplaint,
  listDeletedComplaints,
  restoreComplaint,
  canViewComplaint,
  listComplaintMessages,
  sendComplaintMessage,
};
