import React, { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { usePublicOrg } from '../utils/useOrg';

export function PasswordLogin() {
  const org = usePublicOrg();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setError(body.error || 'Sign-in failed.'); setBusy(false); return; }
      window.location.reload();
    } catch {
      setError('Could not reach the server. Check your connection.'); setBusy(false);
    }
  };

  return (
    <div className="login-page-modern">
      <div className="login-animated-bg" />
      <div className="login-glass-card">
        <div className="login-brand-modern login-brand-logo">
          {org.logoUrl ? <img src={org.logoUrl} alt={org.name} /> : <div className="login-brand-name-modern">{org.name}</div>}
          <div className="login-brand-sub-modern">Enterprise Document Control</div>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Email</label>
            <input className="form-input" type="email" autoComplete="username" required autoFocus
              value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input className="form-input" type={show ? 'text' : 'password'} autoComplete="current-password" required
                value={password} onChange={e => setPassword(e.target.value)} style={{ paddingRight: 38 }} />
              <button type="button" onClick={() => setShow(s => !s)} title={show ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-glow)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%', padding: '10px 16px' }}>
            {busy ? 'Signing in…' : <><LogIn size={15} /> Sign in</>}
          </button>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            Accounts are created by your administrator. Forgot your password? Ask them to reset it.
          </p>
        </form>
      </div>
    </div>
  );
}
