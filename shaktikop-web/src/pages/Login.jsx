import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import './login.css';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErr('उपयोगकर्ता नाम और पासवर्ड — दोनों भरें');
      return;
    }
    setErr(''); setBusy(true);
    try {
      await login(username.trim(), password);
      nav('/', { replace: true });
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  };

  return (
    <div className="login-shell">
      <div className="login-side">
        <div className="login-brand">
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,.55)' }}>उत्तर प्रदेश पुलिस</span>
          <h1 className="login-mark">ShaktiCop</h1>
          <p className="login-sub">प्रशासन कक्ष</p>
        </div>
        <p className="login-note">
          यहाँ ज़िले की शिकायतें, आपात सूचनाएं और अधिकारियों का कामकाज एक जगह देखे
          जाते हैं। पहुँच आपके पद व क्षेत्राधिकार तक सीमित रहती है।
        </p>
      </div>

      <div className="login-main">
        <form className="login-form" onSubmit={submit}>
          <h2>लॉगिन करें</h2>
          <p className="login-hint">अपने प्रशासनिक खाते से</p>

          {err && <div className="error-box" style={{ marginBottom: 14 }}>{err}</div>}

          <label className="field">
            <span>उपयोगकर्ता नाम</span>
            <input
              className="input" autoComplete="username" autoFocus
              value={username} onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="field">
            <span>पासवर्ड</span>
            <input
              className="input" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={busy}>
            {busy ? 'जाँच हो रही है…' : 'लॉगिन करें'}
          </button>

          <p className="login-foot">
            पासवर्ड भूल गए हों या खाता बंद हो, तो अपने वरिष्ठ कार्यालय से संपर्क करें।
          </p>
        </form>
      </div>
    </div>
  );
}
