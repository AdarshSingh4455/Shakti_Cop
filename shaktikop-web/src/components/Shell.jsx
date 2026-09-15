import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import './shell.css';

// मेन्यू — हर पंक्ति के साथ यह भी तय है कि उसे कौन देख सकता है।
// `roles: null` का मतलब सभी प्रशासनिक पद।
const NAV = [
  { to: '/',           label: 'ड्यूटी बोर्ड',    roles: null },
  { to: '/complaints', label: 'शिकायतें',        roles: null },
  { to: '/officers',   label: 'अधिकारी',         roles: null },
  { to: '/analytics',  label: 'विश्लेषण',        roles: null },
  { to: '/services',   label: 'पुलिस सेवाएं',    roles: ['super_admin'] },
];

export default function Shell() {
  const { admin, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const visible = NAV.filter((n) => !n.roles || n.roles.includes(admin?.adminRole));

  const rankLine = [admin?.rank, admin?.district].filter(Boolean).join(' · ')
    || (admin?.adminRole === 'super_admin' ? 'पूरे राज्य का दायरा' : '');

  const doLogout = () => { logout(); nav('/login', { replace: true }); };

  return (
    <div className="shell">
      {/* मोबाइल की ऊपरी पट्टी */}
      <header className="topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="मेन्यू खोलें">
          <span /><span /><span />
        </button>
        <span className="topbar-mark">ShaktiCop</span>
      </header>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? ' is-open' : ''}`}>
        <div className="sb-brand">
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,.5)' }}>उत्तर प्रदेश पुलिस</span>
          <strong>ShaktiCop</strong>
          <span className="sb-sub">प्रशासन कक्ष</span>
        </div>

        <nav className="sb-nav">
          {visible.map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => 'sb-link' + (isActive ? ' is-active' : '')}
              onClick={() => setOpen(false)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-who">
            <strong>{admin?.name || '—'}</strong>
            {rankLine && <span>{rankLine}</span>}
          </div>
          <button className="sb-out" onClick={doLogout}>लॉगआउट</button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
