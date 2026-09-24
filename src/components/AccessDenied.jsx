import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';

export function AccessDenied({ email, onSignOut }) {
  return (
    <div className="login-page-modern">
      <div className="login-animated-bg" />
      <div className="login-glass-card" style={{ textAlign: 'center' }}>
        <div className="login-brand-icon-modern" style={{ margin: '0 auto 20px', background: '#edf6e6', boxShadow: 'none' }}>
          <ShieldAlert size={30} color="#3f7d3a" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px' }}>You haven't been added yet</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 22px' }}>
          You're signed in as <strong>{email}</strong>, but this email isn't a member of the Tranzenergy DMS workspace.
          Ask your administrator to add it under <em>Admin → Users</em>, then sign in again.
        </p>
        <button className="btn btn-secondary" onClick={onSignOut}><LogOut size={14} /> Sign out and use another account</button>
      </div>
    </div>
  );
}
