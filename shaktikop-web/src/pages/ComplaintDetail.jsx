import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import './complaints.css';

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString('hi-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  }) : '—';

const statusTone = (s) =>
  s === 'निस्तारित' ? 'pill-ok' : 'pill-mute';

export default function ComplaintDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    api(`/complaints/${id}`)
      .then((d) => { if (!dead) setC(d); })
      .catch((e) => { if (!dead) setErr(e.message); });
    return () => { dead = true; };
  }, [id]);

  if (err) {
    return (
      <>
        <Link to="/complaints" className="back-link">← शिकायतों पर लौटें</Link>
        <div className="error-box">{err}</div>
      </>
    );
  }
  if (!c) return <div className="card empty">लोड हो रहा है…</div>;

  const sosLive = c.sosTriggered && !c.safeArrivalConfirmed
    && c.status !== 'निस्तारित' && c.status !== 'अस्वीकृत';

  return (
    <>
      <Link to="/complaints" className="back-link">← शिकायतों पर लौटें</Link>

      <div className="page-head">
        <div>
          <span className="eyebrow num">{c.id}</span>
          <h1>{c.category}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {sosLive && <span className="pill pill-alarm">SOS चालू</span>}
          <span className={`pill ${statusTone(c.status)}`}>{c.status}</span>
        </div>
      </div>

      {sosLive && (
        <div className="status-strip is-hot" style={{ marginBottom: 20 }}>
          <div className="strip-item">
            <span className="strip-num num">
              {Math.round((Date.now() - new Date(c.sosTriggeredAt).getTime()) / 60000)}
            </span>
            <span className="strip-label">मिनट पहले SOS</span>
          </div>
          <p className="strip-say">
            सुरक्षित पहुँच अभी दर्ज नहीं हुई। नियुक्त अधिकारी से तुरंत स्थिति लें।
          </p>
        </div>
      )}

      <div className="detail-grid">
        <div>
          <section className="card panel">
            <h2>शिकायत</h2>
            <p className="desc-body">{c.description || '—'}</p>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>ज़िला / थाना</dt><dd>{c.district} · {c.policeStation}</dd>
              <dt>दर्ज हुई</dt><dd>{fmt(c.createdAt)}</dd>
              <dt>प्राथमिकता</dt><dd>{c.priority || 'सामान्य'}</dd>
              {c.extraDetails && <><dt>अन्य विवरण</dt><dd>{c.extraDetails}</dd></>}
            </dl>
          </section>

          <section className="card panel">
            <h2>कार्यवाही का क्रम</h2>
            {(!c.history || c.history.length === 0) ? (
              <p className="dim" style={{ fontSize: 13 }}>अभी कोई कार्यवाही दर्ज नहीं है।</p>
            ) : (
              <ul className="timeline">
                {c.history.map((h, i) => (
                  <li key={i} className={/SOS/i.test(h.note || '') ? 'is-sos' : ''}>
                    <div className="tl-head">
                      <span className="tl-what">{h.status}</span>
                      <span className="tl-when">{fmt(h.createdAt)}</span>
                    </div>
                    {h.note && <p className="tl-note">{h.note}</p>}
                    {h.actorName && <p className="tl-note" style={{ opacity: .8 }}>— {h.actorName}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div>
          <section className="card panel">
            <h2>पीड़िता</h2>
            <dl className="kv">
              <dt>नाम</dt><dd>{c.victimName || '—'}</dd>
              {c.victimFatherName && <><dt>पिता/पति</dt><dd>{c.victimFatherName}</dd></>}
              <dt>मोबाइल</dt><dd className="num">{c.victimMobile || '—'}</dd>
              <dt>पता</dt><dd>{c.victimAddress || '—'}</dd>
            </dl>
          </section>

          {(c.accusedName || c.accusedMobile) && (
            <section className="card panel">
              <h2>आरोपी</h2>
              <dl className="kv">
                <dt>नाम</dt><dd>{c.accusedName || '—'}</dd>
                <dt>मोबाइल</dt><dd className="num">{c.accusedMobile || '—'}</dd>
              </dl>
            </section>
          )}

          <section className="card panel">
            <h2>नियुक्ति</h2>
            {/* ⚠️ backend सिर्फ़ अधिकारी का नाम भेजता है (पद/मोबाइल नहीं) — इसलिए
                यहाँ वही दिखाया जाता है। ज़्यादा चाहिए तो "अधिकारी" पन्ने पर मिलेगा। */}
            <dl className="kv">
              <dt>अधिकारी</dt>
              <dd>{c.officer || <span className="dim">अभी नियुक्त नहीं</span>}</dd>
              <dt>देखी गई</dt><dd>{c.officerViewedAt ? fmt(c.officerViewedAt) : <span className="dim">अभी नहीं</span>}</dd>
            </dl>
          </section>

          {c.feedbackRating != null && (
            <section className="card panel">
              <h2>नागरिक की प्रतिक्रिया</h2>
              <dl className="kv">
                <dt>रेटिंग</dt><dd className="num">{c.feedbackRating} / 5</dd>
                {c.feedbackNote && <><dt>टिप्पणी</dt><dd>{c.feedbackNote}</dd></>}
              </dl>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
