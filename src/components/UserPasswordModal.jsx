import React, { useState } from 'react';
import { X, RefreshCw, Copy } from 'lucide-react';

export function generatePassword() {
  const words = 'amber,cedar,delta,ember,falcon,granite,harbor,indigo,jasper,kestrel,lumen,maple,nimbus,orbit,pylon,quartz,raven,summit,tundra,volt'.split(',');
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const n = 10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90);
  return `${pick()}-${pick()}-${n}`;
}

export async function setUserPassword(email, password) {
  const r = await fetch('/api/admin-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Could not set password (${r.status})`);
}

/** Admin: set or reset one user's password */
export function UserPasswordModal({ user, onClose, onSaved }) {
  const [pw, setPw] = useState(generatePassword());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true); setError('');
    try { await setUserPassword(user.email, pw); setSaved(true); onSaved?.(); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <span className="modal-title">{saved ? 'Password set' : 'Set password'} — {user.name}</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Sign-in email: <strong>{user.email}</strong>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Password</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" value={pw} onChange={e => setPw(e.target.value)} disabled={saved} style={{ fontFamily: 'var(--font-mono)' }} />
              {!saved && <button type="button" className="btn btn-secondary btn-icon" title="Generate another" onClick={() => setPw(generatePassword())}><RefreshCw size={14} /></button>}
              <button type="button" className="btn btn-secondary btn-icon" title="Copy" onClick={() => navigator.clipboard?.writeText(pw)}><Copy size={14} /></button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>At least 8 characters, with letters and a number. The user can change it after signing in.</span>
          </div>
          {saved && (
            <div style={{ fontSize: 13, color: 'var(--success)', background: 'var(--success-glow)', padding: '8px 12px', borderRadius: 8 }}>
              Saved. Share the email and password with {user.name}. Any older sign-ins for this user are signed out.
            </div>
          )}
          {error && <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-glow)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{saved ? 'Done' : 'Cancel'}</button>
          {!saved && <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>}
        </div>
      </div>
    </div>
  );
}
