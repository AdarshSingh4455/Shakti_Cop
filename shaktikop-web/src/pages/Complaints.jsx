import { useEffect, useState, useCallback } from 'react';
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

const PAGE = 40;

export default function Complaints() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);

  // फ़िल्टर
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sosOnly, setSosOnly] = useState(false);

  const load = useCallback(async (opts = {}) => {
    const p = opts.page ?? page;
    setBusy(true); setErr('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE));
      params.set('offset', String(p * PAGE));
      if (q.trim()) params.set('search', q.trim());
      if (status) params.set('status', status);
      if (sosOnly) params.set('sosOnly', 'true');
      const data = await api(`/complaints?${params.toString()}`);
      setRows(Array.isArray(data) ? data : (data?.items || []));
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
    setBusy(false);
  }, [q, status, sosOnly, page]);

  useEffect(() => { load({ page: 0 }); /* eslint-disable-next-line */ }, [status, sosOnly]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page]);

  const search = (e) => { e.preventDefault(); setPage(0); load({ page: 0 }); };

  const reset = () => { setQ(''); setStatus(''); setSosOnly(false); setPage(0); };
  const hasFilter = q.trim() || status || sosOnly;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">आपके क्षेत्राधिकार की</span>
          <h1>शिकायतें</h1>
        </div>
      </div>

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
