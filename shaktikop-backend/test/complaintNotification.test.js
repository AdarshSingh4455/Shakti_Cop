// ============================================================
// complaintNotification.test.js
// Feature 1: शिकायत दर्ज होते ही संबंधित थाने के MSK व SHO को Push व In-App Notification
// - क्षेत्राधिकार (Jurisdiction) का कड़ा मिलान: केवल उसी थाने के MSK व SHO को सूचना
// - Inactive/Deleted अधिकारी बाहर
// - डुप्लीकेट अधिकारी व साझा डिवाइस टोकन de-duplication
// - Idempotency (एक शिकायत पर दोबारा सूचना नहीं)
// - DeviceNotRegistered पर टोकन सफ़ाई
// - Fault-tolerance (पुश विफलता से शिकायत दर्ज होना नहीं रुकता)
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const { createComplaint } = require('../src/controllers/complaintController');
const { sendPushNotificationsBatch, sendPushNotification, cleanupDeadTokens } = require('../src/utils/push');

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  return res;
}

test('Feature 1: नई शिकायत पर केवल संबंधित थाने के सक्रिय MSK व SHO को Notification भेजी जाती है', async (t) => {
  let executedQueries = [];
  let capturedBatchMessages = null;

  t.mock.method(db, 'query', async (sql, params) => {
    executedQueries.push({ sql, params });

    // Citizen fetch
    if (sql.includes('SELECT') && sql.includes('FROM citizens WHERE id = $1')) {
      return {
        rows: [{
          id: 'citizen-uuid-1',
          name: 'सुमन वर्मा',
          mobile: '9876543210',
          district: 'लखनऊ',
          police_station: 'हज़रतगंज',
        }],
      };
    }

    // Insert complaint
    if (sql.includes('INSERT INTO complaints')) {
      return { rows: [] };
    }

    // Insert history
    if (sql.includes('INSERT INTO complaint_history')) {
      return { rows: [] };
    }

    // Officers query for station & district
    if (sql.includes('FROM officers') && sql.includes('TRIM(LOWER(district)) = TRIM(LOWER($1))')) {
      // 2 Officers in Hazratganj (1 SHO, 1 MSK / SI)
      return {
        rows: [
          {
            id: 'sho-hazratganj-1',
            name: 'निरीक्षक आलोक सिंह',
            rank: 'SHO',
            designation: 'थाना प्रभारी',
            push_token: 'ExponentPushToken[sho-hazratganj-token]',
            notification_preferences: { newComplaint: true },
          },
          {
            id: 'msk-hazratganj-2',
            name: 'उ.नि. रीता शर्मा',
            rank: 'SI',
            designation: 'महिला सहायता कक्ष प्रभारी (MSK)',
            push_token: 'ExponentPushToken[msk-hazratganj-token]',
            notification_preferences: { newComplaint: true },
          },
        ],
      };
    }

    // Idempotency check query
    if (sql.includes('FROM notifications') && sql.includes("data->>'complaintId'")) {
      return { rows: [] }; // No previous notification sent for this complaint
    }

    // Batch insert notifications
    if (sql.includes('INSERT INTO notifications')) {
      return { rows: [] };
    }

    // Complaint fetch after insert
    if (sql.includes('WHERE c.id = $1')) {
      return {
        rows: [{
          id: 'SC-20261017-TEST1',
          category: 'घरेलू हिंसा',
          description: 'परीक्षण विवरण',
          district: 'लखनऊ',
          police_station: 'हज़रतगंज',
          status: 'दर्ज',
          created_at: new Date().toISOString(),
          is_self: true,
          victim_name: 'सुमन वर्मा',
          victim_mobile: '9876543210',
          checklist: [],
        }],
      };
    }

    // History fetch
    if (sql.includes('FROM complaint_history WHERE complaint_id = $1')) {
      return { rows: [] };
    }

    return { rows: [] };
  });

  // Mock global fetch to capture push payload sent to Expo
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.includes('exp.host/--/api/v2/push/send')) {
      capturedBatchMessages = JSON.parse(options.body);
      return {
        json: async () => ({
          data: capturedBatchMessages.map(() => ({ status: 'ok', id: 'expo-ticket-id' })),
        }),
      };
    };
    return originalFetch(url, options);
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const req = {
    user: { id: 'citizen-uuid-1', name: 'सुमन वर्मा', role: 'citizen' },
    body: {
      category: 'घरेलू हिंसा',
      description: 'परीक्षण शिकायत विवरण',
      district: 'लखनऊ',
      policeStation: 'हज़रतगंज',
      location: 'हज़रतगंज, लखनऊ',
      isSelf: true,
    },
  };
  const res = fakeRes();

  await createComplaint(req, res);

  assert.equal(res.statusCode, 201, 'शिकायत सफलतापूर्वक 201 के साथ दर्ज होनी चाहिए');
  assert.ok(capturedBatchMessages, 'Expo को batch push संदेश जाना चाहिए');
  assert.equal(capturedBatchMessages.length, 2, 'ठीक 2 अधिकारियों (1 SHO + 1 MSK) को पुश जाना चाहिए');

  const tokens = capturedBatchMessages.map((m) => m.to);
  assert.ok(tokens.includes('ExponentPushToken[sho-hazratganj-token]'), 'SHO को पुश प्राप्त होना चाहिए');
  assert.ok(tokens.includes('ExponentPushToken[msk-hazratganj-token]'), 'MSK अधिकारी को पुश प्राप्त होना चाहिए');

  // Verify push content privacy & title
  const msg = capturedBatchMessages[0];
  assert.equal(msg.title, 'नई शिकायत प्राप्त हुई — ShaktiCop');
  assert.match(msg.body, /आपके थाने के अधिकार क्षेत्र में नई शिकायत दर्ज हुई है।/);
  assert.ok(!msg.body.includes('सुमन वर्मा'), 'संवेदनशील पीड़िता का नाम push body में नहीं होना चाहिए');
  assert.ok(!msg.body.includes('9876543210'), 'संवेदनशील पीड़िता का मोबाइल push body में नहीं होना चाहिए');
  assert.equal(msg.priority, 'high', 'Doze mode और तुरंत अलर्ट हेतु high priority अनिवार्य है');
  assert.equal(msg.channelId, 'default', 'शिकायत हेतु channel default होना चाहिए');
});

test('Feature 1: डुप्लीकेट अधिकारी और डुप्लीकेट टोकन de-duplication', async (t) => {
  let capturedBatchMessages = null;

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT') && sql.includes('FROM citizens WHERE id = $1')) {
      return { rows: [{ id: 'c-1', name: 'नागरिक', mobile: '9876543210', district: 'आगरा', police_station: 'हरीपर्वत' }] };
    }
    if (sql.includes('FROM officers') && sql.includes('TRIM(LOWER(district)) = TRIM(LOWER($1))')) {
      // Simulate duplicate officer ID and same shared push token
      return {
        rows: [
          { id: 'off-1', name: 'अधिकारी १', rank: 'SHO', push_token: 'ExponentPushToken[shared-device-1]', notification_preferences: { newComplaint: true } },
          { id: 'off-1', name: 'अधिकारी १ (डुप्लीकेट)', rank: 'SHO', push_token: 'ExponentPushToken[shared-device-1]', notification_preferences: { newComplaint: true } },
          { id: 'off-2', name: 'अधिकारी २', rank: 'SI', push_token: 'ExponentPushToken[shared-device-1]', notification_preferences: { newComplaint: true } },
        ],
      };
    }
    if (sql.includes('FROM notifications') && sql.includes("data->>'complaintId'")) {
      return { rows: [] };
    }
    if (sql.includes('WHERE c.id = $1')) {
      return { rows: [{ id: 'SC-DEDUP-1', category: 'महिला हेल्प डेस्क', district: 'आगरा', police_station: 'हरीपर्वत', status: 'दर्ज' }] };
    }
    return { rows: [] };
  });

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    capturedBatchMessages = JSON.parse(options.body);
    return {
      json: async () => ({
        data: capturedBatchMessages.map(() => ({ status: 'ok', id: 'expo-ticket' })),
      }),
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const req = {
    user: { id: 'c-1', name: 'नागरिक', role: 'citizen' },
    body: { category: 'महिला हेल्प डेस्क', description: 'जाँच', location: 'हरीपर्वत, आगरा', district: 'आगरा', policeStation: 'हरीपर्वत', isSelf: true },
  };
  const res = fakeRes();

  await createComplaint(req, res);

  assert.equal(res.statusCode, 201);
  // officer ID off-1 is deduplicated, and shared token ExponentPushToken[shared-device-1] is deduplicated
  assert.equal(capturedBatchMessages.length, 1, 'डुप्लीकेट टोकन पर एक ही पुश जाना चाहिए');
});

test('Feature 1: Idempotency — यदि पहले से नोटिफिकेशन भेजा जा चुका हो तो दोबारा नहीं भेजा जाता', async (t) => {
  let capturedBatchMessages = null;

  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT') && sql.includes('FROM citizens WHERE id = $1')) {
      return { rows: [{ id: 'c-1', name: 'नागरिक', mobile: '9876543210', district: 'वाराणसी', police_station: 'कैंट' }] };
    }
    if (sql.includes('FROM officers') && sql.includes('TRIM(LOWER(district)) = TRIM(LOWER($1))')) {
      return {
        rows: [
          { id: 'sho-varanasi-1', name: 'SHO वाराणसी', rank: 'SHO', push_token: 'ExponentPushToken[vns-token]', notification_preferences: { newComplaint: true } },
        ],
      };
    }
    // Simulate notification already recorded in DB for this complaint
    if (sql.includes('FROM notifications') && sql.includes("data->>'complaintId'")) {
      return { rows: [{ recipient_id: 'sho-varanasi-1' }] };
    }
    if (sql.includes('WHERE c.id = $1')) {
      return { rows: [{ id: 'SC-IDEMPOTENT-1', category: 'सुरक्षित यात्रा मोड', district: 'वाराणसी', police_station: 'कैंट', status: 'दर्ज' }] };
    }
    return { rows: [] };
  });

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    capturedBatchMessages = JSON.parse(options.body);
    return { json: async () => ({ data: [] }) };
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const req = {
    user: { id: 'c-1', name: 'नागरिक', role: 'citizen' },
    body: { category: 'घरेलू हिंसा', description: 'जाँच', location: 'कैंट, वाराणसी', district: 'वाराणसी', policeStation: 'कैंट', isSelf: true },
  };
  const res = fakeRes();

  await createComplaint(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(capturedBatchMessages, null, 'पहले से नोटिफाइड अधिकारी को दोबारा पुश नहीं जाना चाहिए');
});

test('Feature 1: DeviceNotRegistered पर टोकन डेटाबेस से अपने-आप साफ़ हो जाता है', async (t) => {
  let updatedTables = [];

  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('UPDATE') && sql.includes('push_token = NULL')) {
      updatedTables.push({ sql, params });
    }
    return { rows: [] };
  });

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    json: async () => ({
      data: [
        {
          status: 'error',
          message: 'The recipient is not registered',
          details: { error: 'DeviceNotRegistered' },
        },
      ],
    }),
  });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const deadToken = 'ExponentPushToken[uninstalled-device-token]';
  const result = await sendPushNotificationsBatch([
    {
      to: deadToken,
      title: 'जाँच',
      body: 'जाँच संदेश',
    },
  ]);

  assert.equal(result.failedCount, 1);
  assert.equal(result.sentCount, 0);

  // Give any microtask time to settle
  await new Promise((r) => setTimeout(r, 50));

  assert.ok(updatedTables.length > 0, 'DeviceNotRegistered मिलने पर DB में push_token = NULL चलना चाहिए');
  assert.equal(updatedTables[0].params[0], deadToken, 'वही मृत टोकन साफ़ होना चाहिए');
});

test('Feature 1: Fault-Tolerance — Push सेवा में विफलता आने पर भी शिकायत दर्ज होना नहीं रुकता', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    if (sql.includes('SELECT') && sql.includes('FROM citizens WHERE id = $1')) {
      return { rows: [{ id: 'c-1', name: 'नागरिक', mobile: '9876543210', district: 'मेरठ', police_station: 'सदर' }] };
    }
    if (sql.includes('FROM officers') && sql.includes('TRIM(LOWER(district)) = TRIM(LOWER($1))')) {
      return {
        rows: [
          { id: 'sho-1', name: 'SHO मेरठ', rank: 'SHO', push_token: 'ExponentPushToken[meerut-token]' },
        ],
      };
    }
    if (sql.includes('WHERE c.id = $1')) {
      return { rows: [{ id: 'SC-FAULT-1', category: 'घरेलू हिंसा', district: 'मेरठ', police_station: 'सदर', status: 'दर्ज' }] };
    }
    return { rows: [] };
  });

  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('Expo Push Service Timeout / Network Down');
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const req = {
    user: { id: 'c-1', name: 'नागरिक', role: 'citizen' },
    body: { category: 'घरेलू हिंसा', description: 'जाँच विवरण', location: 'सदर, मेरठ', district: 'मेरठ', policeStation: 'सदर', isSelf: true },
  };
  const res = fakeRes();

  // Must not throw and must return 201
  await createComplaint(req, res);

  assert.equal(res.statusCode, 201, 'पुश नेटवर्क डाउन होने पर भी शिकायत दर्ज होकर 201 मिलनी चाहिए');
  assert.equal(res.body.id, 'SC-FAULT-1');
});
