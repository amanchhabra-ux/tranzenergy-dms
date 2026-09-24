import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';

/**
 * Change your own password.
 * forced: first sign-in of the setup admin — no current password needed, can't be dismissed.
 */
export function ChangePassword({ forced = false, onClose, onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change-password', currentPassword: current, newPassword: next }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setError(body.error || 'Could not change the password.'); setBusy(false); return; }
      if (forced) { window.location.reload(); return; }
      onDone?.();
    } catch {
      setError('Could not reach the server.'); setBusy(false);
    }
  };

  const form = (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!forced && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Current password</label>
          <input className="form-input" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} />
        </div>
      )}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">New password</label>
        <input className="form-input" type="password" autoComplete="new-password" required value={next} onChange={e => setNext(e.target.value)} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>At least 8 characters, with letters and a number.</span>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Confirm new password</label>
        <input className="form-input" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-glow)', padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  );

  if (forced) {
    return (
      <div className="login-page-modern">
        <div className="login-animated-bg" />
        <div className="login-glass-card">
          <div className="login-brand-icon-modern" style={{ margin: '0 auto 18px' }}><KeyRound size={30} color="#fff" /></div>
          <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>Set your new password</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
            The old setup password only works this once. Choose a new password to continue.
          </p>
          {form}
        </div>
      </div>
    );
  }
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <span className="modal-title">Change password</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{form}</div>
      </div>
    </div>
  );
}
