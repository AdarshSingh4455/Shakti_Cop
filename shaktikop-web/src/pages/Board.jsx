import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import './board.css';

// ============================================================
// ड्यूटी बोर्ड
//
// यह इस पूरे पैनल का दिल है। आम dashboard सबसे पहले कुल-संख्याएं दिखाते हैं —
// पर एक अधिकारी को सुबह बैठते ही यह जानना होता है कि *अभी किसे मदद चाहिए*,
// न कि इस महीने कितनी शिकायतें आईं।
//
// इसलिए ऊपर वह है जो रुका नहीं जा सकता: चालू SOS, फिर SLA चूक चुकी शिकायतें।
// गिनतियां नीचे हैं — वे ज़रूरी हैं, पर बाद में।
// ============================================================

const hoursSince = (iso) => {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
};

const humanAgo = (iso) => {
  const h = hoursSince(iso);
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} मिनट पहले`;
  if (h < 24) return `${Math.round(h)} घंटे पहले`;
  return `${Math.round(h / 24)} दिन पहले`;
};

export default function Board() {
  const [sos, setSos] = useState(null);
  const [sla, setSla] = useState(null);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const [s, l, o] = await Promise.all([
          api('/complaints?sosOnly=true&limit=25'),
          api('/admin/analytics/sla-at-risk'),
          api('/admin/analytics/overview'),
        ]);
        if (dead) return;
        setSos(Array.isArray(s) ? s : (s?.items || []));
        setSla(l?.items || []);
        setSummary(o?.summary || null);
      } catch (e) {
        if (!dead) setErr(e.message);
      }
    };
    load();
    // हर मिनट अपने-आप ताज़ा — SOS पर देर नहीं होनी चाहिए
    const t = setInterval(load, 60000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  // "चालू" वही SOS जिसकी सुरक्षित-पहुँच अभी दर्ज नहीं हुई और मामला बंद नहीं है
  const activeSos = (sos || []).filter(
    (c) => c.sosTriggered && !c.safeArrivalConfirmed
      && c.status !== 'निस्तारित' && c.status !== 'अस्वीकृत'
  );
  const breached = (sla || []).filter((x) => x.breached);
  const nearing = (sla || []).filter((x) => !x.breached);

  const calm = activeSos.length === 0 && breached.length === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">इस समय</span>
          <h1>ड्यूटी बोर्ड</h1>
        </div>
        <span className="stamp">
          {new Date().toLocaleString('hi-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>

      {err && <div className="error-box" style={{ marginBottom: 18 }}>{err}</div>}

      {/* ---------- हस्ताक्षर: स्थिति-पट्टी ---------- */}
      <div className={`status-strip${calm ? ' is-calm' : ' is-hot'}`}>
        <div className="strip-item">
          <span className="strip-num num">{activeSos.length}</span>
          <span className="strip-label">चालू SOS</span>
        </div>
        <div className="strip-rule" />
        <div className="strip-item">
          <span className="strip-num num">{breached.length}</span>
          <span className="strip-label">SLA चूक गई</span>
        </div>
        <div className="strip-rule" />
        <div className="strip-item">
          <span className="strip-num num">{nearing.length}</span>
          <span className="strip-label">समय-सीमा पास</span>
        </div>
        <p className="strip-say">
          {calm
            ? 'अभी कोई आपात स्थिति नहीं। समय-सीमा के पास वाली शिकायतें नीचे देखें।'
            : 'नीचे दी गई शिकायतों पर तुरंत कार्रवाई चाहिए।'}
        </p>
      </div>

      {/* ---------- चालू SOS ---------- */}
      <section className="block">
        <h2>चालू SOS</h2>
        {sos === null ? (
          <div className="card empty">लोड हो रहा है…</div>
        ) : activeSos.length === 0 ? (
          <div className="card empty">
            <strong>कोई चालू आपात सूचना नहीं</strong>
            जैसे ही कोई SOS दबाएगा, वह यहीं सबसे ऊपर दिखेगा।
          </div>
        ) : (
          <div className="sos-list">
            {activeSos.map((c) => {
              const mins = Math.round((hoursSince(c.sosTriggeredAt) || 0) * 60);
              return (
                <Link key={c.id} to={`/complaints/${c.id}`} className={`sos-card${mins >= 15 ? ' is-critical' : ''}`}>
                  <div className="sos-top">
                    <span className="pill pill-alarm">SOS · {mins} मिनट</span>
                    <span className="sos-id num">{c.id}</span>
                  </div>
                  <strong className="sos-where">{c.district} · {c.policeStation}</strong>
                  <span className="sos-meta">{c.category} · {c.officer || 'अभी कोई अधिकारी नहीं'}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- SLA ---------- */}
      <section className="block">
        <h2>समय-सीमा</h2>
        {sla === null ? (
          <div className="card empty">लोड हो रहा है…</div>
        ) : sla.length === 0 ? (
          <div className="card empty">
            <strong>सब समय पर है</strong>
            किसी भी खुली शिकायत की समय-सीमा नज़दीक नहीं।
          </div>
        ) : (
          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>शिकायत</th><th>ज़िला / थाना</th><th>श्रेणी</th>
                  <th>अधिकारी</th><th>खुली है</th><th>स्थिति</th>
                </tr>
              </thead>
              <tbody>
                {sla.map((x) => (
                  <tr key={x.id}>
                    <td><Link to={`/complaints/${x.id}`} className="num">{x.id}</Link></td>
                    <td>{x.district} · {x.policeStation}</td>
                    <td>{x.category}</td>
                    <td>{x.officerName || <span style={{ color: 'var(--ink-mute)' }}>नियुक्त नहीं</span>}</td>
                    <td className="num">{x.hoursOpen} घं.</td>
                    <td>
                      <span className={`pill ${x.breached ? 'pill-alarm' : 'pill-warn'}`}>
                        {x.breached ? 'चूक गई' : 'पास'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- गिनतियां ---------- */}
      {summary && (
        <section className="block">
          <h2>कुल स्थिति</h2>
          <div className="tally">
            <Tally label="कुल शिकायतें" value={summary.total} />
            <Tally label="लंबित" value={summary.pending} />
            <Tally label="निस्तारित" value={summary.resolved} tone="ok" />
            <Tally label="निस्तारण दर" value={`${summary.resolutionRate}%`} />
            <Tally label="औसत निस्तारण" value={summary.avgResolutionHours ? `${summary.avgResolutionHours} घं.` : '—'} />
            <Tally label="औसत रेटिंग" value={summary.avgRating || '—'} />
          </div>
        </section>
      )}
    </>
  );
}

function Tally({ label, value, tone }) {
  return (
    <div className="card tally-item">
      <span className="tally-label">{label}</span>
      <span className={`tally-value num${tone === 'ok' ? ' is-ok' : ''}`}>{value}</span>
    </div>
  );
}
