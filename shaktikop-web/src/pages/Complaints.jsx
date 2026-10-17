import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import './complaints.css';

const STATUSES = ['दर्ज', 'अधिकारी नियुक्त', 'कार्यवाही जारी', 'निस्तारित', 'अस्वीकृत'];

// स्थिति के हिसाब से रंग — निस्तारित हरा, अस्वीकृत मद्धम, बाक़ी तटस्थ।
// ⚠️ मैरून यहाँ नहीं आता; वह सिर्फ़ SOS व SLA-चूक के लिए बचाकर रखा है।
const statusTone = (s) =>
  s === 'निस्तारित' ? 'pill-ok' : s === 'अस्वीकृत' ? 'pill-mute' : 'pill-mute';

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('hi-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: '2-digit' }) : '—';

const fmtTime = (date) =>
  date ? date.toLocaleTimeString('hi-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

const PAGE = 40;
const REFRESH_INTERVAL_MS = 30000; // 30 सेकंड ऑटो-रिफ्रेश

export default function Complaints() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);

  // फ़िल्टर
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sosOnly, setSosOnly] = useState(false);

  // 🔄 30s Auto-Refresh स्थिति व टाइमर
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [newIncomingBanner, setNewIncomingBanner] = useState(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef(null);
  const lastFetchTimeRef = useRef(Date.now());
  const prevIdsRef = useRef(new Set());

  // नवीनतम filters/page को ref में रखना ताकि interval callback में stale state न बने
  const stateRef = useRef({ q, status, sosOnly, page });
  useEffect(() => {
    stateRef.current = { q, status, sosOnly, page };
  }, [q, status, sosOnly, page]);

  const load = useCallback(async (opts = {}) => {
    const isAuto = Boolean(opts.isAuto);
    const p = opts.page !== undefined ? opts.page : stateRef.current.page;
    const currentQ = opts.q !== undefined ? opts.q : stateRef.current.q;
    const currentStatus = opts.status !== undefined ? opts.status : stateRef.current.status;
    const currentSosOnly = opts.sosOnly !== undefined ? opts.sosOnly : stateRef.current.sosOnly;

    // Single-flight guard: एक समय में केवल एक ही अनुरोध चले
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (!isAuto) {
      setBusy(true);
      setErr('');
    }

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE));
      params.set('offset', String(p * PAGE));
      if (currentQ.trim()) params.set('search', currentQ.trim());
      if (currentStatus) params.set('status', currentStatus);
      if (currentSosOnly) params.set('sosOnly', 'true');

      const data = await api(`/complaints?${params.toString()}`);
      const newItems = Array.isArray(data) ? data : (data?.items || []);

      // नए रिकॉर्ड का पता लगाना — अगर कोई ऐसी complaint ID आए जो पहले नहीं थी
      if (isAuto && prevIdsRef.current.size > 0 && newItems.length > 0) {
        const hasNew = newItems.some((item) => !prevIdsRef.current.has(item.id));
        if (hasNew) {
          setNewIncomingBanner(true);
          setTimeout(() => setNewIncomingBanner(false), 5000);
        }
      }

      prevIdsRef.current = new Set(newItems.map((c) => c.id));
      setRows(newItems);
      setLastRefreshedAt(new Date());
      lastFetchTimeRef.current = Date.now();
    } catch (e) {
      // ⚠️ Error resilience: नेटवर्क समस्या पर केवल तब एरर दिखाएँ जब यूज़र ने खुद लोड किया हो;
      // बैकग्राउंड ऑटो-रिफ्रेश में मौजूदा सूची बनी रहे और अगली बार दोबारा प्रयास हो
      if (!isAuto) {
        setErr(e.message);
        setRows([]);
      } else {
        console.warn('Complaints auto-refresh error:', e.message);
      }
    } finally {
      inFlightRef.current = false;
      if (!isAuto) setBusy(false);
    }
  }, []);

  // फ़िल्टर या पृष्ठ बदलने पर सामान्य (manual) फेच
  useEffect(() => {
    load({ page: 0, isAuto: false });
  }, [status, sosOnly]);

  useEffect(() => {
    load({ page, isAuto: false });
  }, [page]);

  // 🔄 Feature 2: हर 30 सेकंड में ऑटो-रिफ्रेश + Tab Visibility प्रबंधन
  useEffect(() => {
    const startAutoRefresh = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        // यदि ब्राउज़र टैब छिपा (hidden/background) हो, तो व्यर्थ अनुरोध न भेजें
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        load({ isAuto: true });
      }, REFRESH_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'visible') {
        // टैब पर वापस आने पर यदि 30 सेकंड या अधिक बीत चुके हों तो तुरंत ताज़ा करें
        const elapsed = Date.now() - lastFetchTimeRef.current;
        if (elapsed >= REFRESH_INTERVAL_MS) {
          load({ isAuto: true });
        }
        startAutoRefresh();
      }
    };

    startAutoRefresh();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [load]);

  const search = (e) => {
    e.preventDefault();
    setPage(0);
    load({ page: 0, isAuto: false });
  };

  const reset = () => {
    setQ('');
    setStatus('');
    setSosOnly(false);
    setPage(0);
  };

  const manualRefresh = () => {
    lastFetchTimeRef.current = Date.now();
    load({ isAuto: false });
  };

  const hasFilter = q.trim() || status || sosOnly;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">आपके क्षेत्राधिकार की</span>
          <h1>शिकायतें</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {lastRefreshedAt && (
            <span className="dim" style={{ fontSize: 12.5 }} title="हर 30 सेकंड में डेटा अपने आप ताज़ा होता है">
              अंतिम अपडेट: <span className="num">{fmtTime(lastRefreshedAt)}</span> · 30s ऑटो-रिफ्रेश
            </span>
          )}
          <button
            type="button"
            className="btn btn-quiet"
            onClick={manualRefresh}
            disabled={busy}
            title="शिकायत सूची को अभी ताज़ा करें"
            style={{ fontSize: 13, padding: '6px 12px' }}
          >
            {busy ? 'ताज़ा हो रहा है…' : '🔄 ताज़ा करें'}
          </button>
        </div>
      </div>

      {newIncomingBanner && (
        <div
          style={{
            marginBottom: 14,
            padding: '8px 14px',
            backgroundColor: 'var(--ok-wash)',
            color: 'var(--ok)',
            borderRadius: 'var(--r)',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: 'var(--shadow)',
          }}
        >
          <span>✨ नई शिकायतें या अपडेट प्राप्त हुए — सूची अद्यतित कर दी गई है।</span>
        </div>
      )}

      <form className="filters" onSubmit={search}>
        <input
          className="input filter-search"
          placeholder="शिकायत ID, नाम, मोबाइल, ज़िला या थाना से खोजें"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <select className="input filter-sel" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">हर स्थिति</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="filter-check">
          <input type="checkbox" checked={sosOnly} onChange={(e) => setSosOnly(e.target.checked)} />
          <span>सिर्फ़ SOS</span>
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'खोज रहे हैं…' : 'खोजें'}</button>
        {hasFilter && <button type="button" className="btn btn-quiet" onClick={reset}>साफ़ करें</button>}
      </form>

      {err && <div className="error-box" style={{ marginBottom: 16 }}>{err}</div>}

      {rows === null ? (
        <div className="card empty">लोड हो रहा है…</div>
      ) : rows.length === 0 ? (
        <div className="card empty">
          <strong>{hasFilter ? 'इन शर्तों पर कुछ नहीं मिला' : 'अभी कोई शिकायत नहीं'}</strong>
          {hasFilter ? 'खोज बदलकर दोबारा कोशिश करें।' : 'नई शिकायत आते ही वह यहाँ दिखेगी।'}
        </div>
      ) : (
        <>
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>शिकायत</th><th>श्रेणी</th><th>ज़िला / थाना</th>
                  <th>अधिकारी</th><th>दर्ज</th><th>स्थिति</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={c.sosTriggered && !c.safeArrivalConfirmed ? 'row-sos' : ''}>
                    <td>
                      <Link to={`/complaints/${c.id}`} className="num">{c.id}</Link>
                      {c.sosTriggered && !c.safeArrivalConfirmed && (
                        <span className="pill pill-alarm" style={{ marginLeft: 7 }}>SOS</span>
                      )}
                    </td>
                    <td>{c.category}</td>
                    <td>{c.district} · {c.policeStation}</td>
                    {/* ⚠️ backend में officer सिर्फ़ नाम (string) है, object नहीं —
                        इसे c.officer.name समझने पर हर पंक्ति "नियुक्त नहीं" दिखती */}
                    <td>{c.officer || <span className="dim">नियुक्त नहीं</span>}</td>
                    <td className="num">{fmtDate(c.createdAt)}</td>
                    <td><span className={`pill ${statusTone(c.status)}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button className="btn btn-quiet" disabled={page === 0 || busy}
              onClick={() => setPage((p) => Math.max(0, p - 1))}>पिछला</button>
            <span className="pager-at">पृष्ठ <span className="num">{page + 1}</span></span>
            <button className="btn btn-quiet" disabled={rows.length < PAGE || busy}
              onClick={() => setPage((p) => p + 1)}>अगला</button>
          </div>
        </>
      )}
    </>
  );
}
