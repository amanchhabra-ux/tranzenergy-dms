import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { usePublicOrg } from '../utils/useOrg';

export function AccessDenied({ email, onSignOut }) {
  const org = usePublicOrg();
  return (
    <div className="login-page-modern">
      <div className="login-animated-bg" />
      <div className="login-glass-card" style={{ textAlign: 'center' }}>
        <div className="login-brand-icon-modern" style={{ margin: '0 auto 20px', background: 'var(--primary-glow)', boxShadow: 'none' }}>
          <ShieldAlert size={30} style={{ color: 'var(--primary)' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>You haven't been added yet</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 22px' }}>
          You're signed in as <strong>{email}</strong>, but this email isn't a member of the {org.name} workspace.
          Ask your administrator to add it under <em>Admin → Users</em>, then sign in again.
        </p>
        <button className="btn btn-secondary" onClick={onSignOut}><LogOut size={14} /> Sign out and use another account</button>
      </div>
    </div>
  );
}
