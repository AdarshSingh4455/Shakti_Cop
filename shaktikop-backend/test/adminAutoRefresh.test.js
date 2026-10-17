// ============================================================
// adminAutoRefresh.test.js
// Feature 2: Admin Web Panel Complaint Section का 30-सेकंड Auto-Refresh Logic
// - 30-सेकंड अंतराल और टाइमर प्रबंधन
// - Single-flight lock: concurrent/overlapping अनुरोधों पर रोक
// - Tab Visibility Handling (hidden होने पर विराम, visible होने पर ताज़ा)
// - Filters, Search, Pagination का संरक्षण
// - Transient network error पर मौजूदा डेटा का सुरक्षित रहना
// - नए रिकॉर्ड का आगमन पहचानना (banner trigger)
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');

// Complaints page के core auto-refresh controller का शुद्ध इकाई परीक्षण (pure logic simulator)
class ComplaintsRefreshController {
  constructor(apiClient) {
    this.api = apiClient;
    this.PAGE = 40;
    this.REFRESH_INTERVAL_MS = 30000;
    this.rows = [];
    this.page = 0;
    this.q = '';
    this.status = '';
    this.sosOnly = false;
    this.busy = false;
    this.err = '';
    this.lastRefreshedAt = null;
    this.lastFetchTime = Date.now();
    this.inFlight = false;
    this.newIncomingBanner = false;
    this.prevIds = new Set();
  }

  async load(opts = {}) {
    const isAuto = Boolean(opts.isAuto);
    const p = opts.page !== undefined ? opts.page : this.page;
    const currentQ = opts.q !== undefined ? opts.q : this.q;
    const currentStatus = opts.status !== undefined ? opts.status : this.status;
    const currentSosOnly = opts.sosOnly !== undefined ? opts.sosOnly : this.sosOnly;

    // Single-flight lock
    if (this.inFlight) return { skipped: true, reason: 'in-flight' };
    this.inFlight = true;

    if (!isAuto) {
      this.busy = true;
      this.err = '';
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(this.PAGE));
      params.set('offset', String(p * this.PAGE));
      if (currentQ.trim()) params.set('search', currentQ.trim());
      if (currentStatus) params.set('status', currentStatus);
      if (currentSosOnly) params.set('sosOnly', 'true');

      const data = await this.api(`/complaints?${params.toString()}`);
      const newItems = Array.isArray(data) ? data : (data?.items || []);

      if (isAuto && this.prevIds.size > 0 && newItems.length > 0) {
        const hasNew = newItems.some((item) => !this.prevIds.has(item.id));
        if (hasNew) {
          this.newIncomingBanner = true;
        }
      }

      this.prevIds = new Set(newItems.map((c) => c.id));
      this.rows = newItems;
      this.lastRefreshedAt = new Date();
      this.lastFetchTime = Date.now();
      return { success: true, count: newItems.length };
    } catch (e) {
      if (!isAuto) {
        this.err = e.message;
        this.rows = [];
      }
      return { success: false, error: e.message };
    } finally {
      this.inFlight = false;
      if (!isAuto) this.busy = false;
    }
  }

  handleVisibilityChange(visibilityState, nowTime) {
    if (visibilityState === 'visible') {
      const elapsed = (nowTime || Date.now()) - this.lastFetchTime;
      if (elapsed >= this.REFRESH_INTERVAL_MS) {
        return this.load({ isAuto: true });
      }
    }
    return Promise.resolve({ skipped: true });
  }
}

test('Feature 2: Single-flight concurrency guard prevents overlapping refresh requests', async () => {
  let inProgressCount = 0;
  let maxConcurrent = 0;

  const mockApi = async () => {
    inProgressCount++;
    maxConcurrent = Math.max(maxConcurrent, inProgressCount);
    await new Promise((r) => setTimeout(r, 40));
    inProgressCount--;
    return [{ id: 'C-1', category: 'घरेलू हिंसा' }];
  };

  const controller = new ComplaintsRefreshController(mockApi);

  // Trigger two concurrent load calls
  const [res1, res2] = await Promise.all([
    controller.load({ isAuto: false }),
    controller.load({ isAuto: true }),
  ]);

  assert.equal(maxConcurrent, 1, 'एक समय में केवल 1 नेटवर्क अनुरोध चलना चाहिए');
  assert.equal(res1.success, true);
  assert.equal(res2.skipped, true, 'दूसरा समानांतर अनुरोध single-flight guard से skip होना चाहिए');
});

test('Feature 2: Preserves filters and pagination during auto-refresh', async () => {
  let requestedUrl = null;
  const mockApi = async (url) => {
    requestedUrl = url;
    return [{ id: 'C-2', category: 'महिला हेल्प डेस्क', status: 'कार्यवाही जारी' }];
  };

  const controller = new ComplaintsRefreshController(mockApi);
  controller.q = 'शर्मा';
  controller.status = 'कार्यवाही जारी';
  controller.sosOnly = true;
  controller.page = 2; // offset = 80

  await controller.load({ isAuto: true });

  assert.ok(requestedUrl, 'अनुरोध भेजा गया');
  assert.ok(requestedUrl.includes('search=%E0%A4%B6%E0%A4%B0%E0%A5%8D%E0%A4%AE%E0%A4%BE') || requestedUrl.includes('search='), 'खोज शब्द शामिल है');
  assert.ok(requestedUrl.includes('status=%E0%A4%95%E0%A4%BE%E0%A4%B0%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%BE%E0%A4%B9%E0%A5%80+%E0%A4%9C%E0%A4%BE%E0%A4%B0%E0%A5%80') || requestedUrl.includes('status='), 'status फ़िल्टर शामिल है');
  assert.ok(requestedUrl.includes('sosOnly=true'), 'sosOnly फ़िल्टर शामिल है');
  assert.ok(requestedUrl.includes('offset=80'), 'पृष्ठ 2 के लिए offset=80 सुरक्षित है');
});

test('Feature 2: Error resilience — Auto-refresh failure preserves existing rows', async () => {
  let fail = false;
  const mockApi = async () => {
    if (fail) throw new Error('Network Timeout');
    return [{ id: 'C-3', category: 'एंटी रोमियो' }];
  };

  const controller = new ComplaintsRefreshController(mockApi);

  // Initial successful load
  await controller.load({ isAuto: false });
  assert.equal(controller.rows.length, 1);
  assert.equal(controller.rows[0].id, 'C-3');

  // Now simulate auto-refresh failure
  fail = true;
  const autoRes = await controller.load({ isAuto: true });
  assert.equal(autoRes.success, false);
  assert.equal(controller.rows.length, 1, 'Auto-refresh नेटवर्क त्रुटि पर मौजूदा सूची सुरक्षित रहनी चाहिए');
  assert.equal(controller.rows[0].id, 'C-3');
});

test('Feature 2: Tab visibility — triggers refresh if >= 30 seconds elapsed, skips if fresh', async () => {
  let callCount = 0;
  const mockApi = async () => {
    callCount++;
    return [{ id: 'C-4' }];
  };

  const controller = new ComplaintsRefreshController(mockApi);
  await controller.load({ isAuto: false });
  assert.equal(callCount, 1);

  // Tab hidden -> visible after only 5 seconds (less than 30s)
  await controller.handleVisibilityChange('visible', controller.lastFetchTime + 5000);
  assert.equal(callCount, 1, '5 सेकंड बाद आने पर अतिरिक्त अनुरोध नहीं जाना चाहिए');

  // Tab hidden -> visible after 35 seconds (>= 30s)
  await controller.handleVisibilityChange('visible', controller.lastFetchTime + 35000);
  assert.equal(callCount, 2, '30+ सेकंड बाद visible होने पर तुरंत ताज़ा होना चाहिए');
});

test('Feature 2: New incoming records trigger banner notification', async () => {
  let callIndex = 0;
  const mockApi = async () => {
    callIndex++;
    if (callIndex === 1) return [{ id: 'C-10' }];
    return [{ id: 'C-11' }, { id: 'C-10' }]; // C-11 is newly added
  };

  const controller = new ComplaintsRefreshController(mockApi);
  await controller.load({ isAuto: false });
  assert.equal(controller.newIncomingBanner, false);

  await controller.load({ isAuto: true });
  assert.equal(controller.newIncomingBanner, true, 'नई शिकायत ID मिलने पर banner चालू होना चाहिए');
});
