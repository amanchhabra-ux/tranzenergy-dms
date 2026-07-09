import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { Zap, Lock, X } from 'lucide-react';

export function Login() {
  const { login, users } = useContext(AppContext);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const roleColor = (role) => {
    switch (role) {
      case 'Admin':           return '#6366f1';
      case 'Project Manager': return '#06b6d4';
      case 'Senior Engineer': return '#10b981';
      case 'Engineer':        return '#f59e0b';
      case 'Viewer':          return '#94a3b8';
      default:                return '#6366f1';
    }
  };

  const handleLoginClick = (user) => {
    if (user.role === 'Admin') {
      setSelectedAdmin(user);
      setPassword('');
      setError(false);
    } else {
      login(user.id);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === 'admin123') { // Simple demo password
      login(selectedAdmin.id);
    } else {
      setError(true);
    }
  };

  const projectTypes = [
    { type: 'Transmission Lines', color: '#6366f1', icon: '🗼' },
    { type: 'Solar Plants', color: '#f59e0b', icon: '☀️' },
    { type: 'BESS Plants', color: '#06b6d4', icon: '🔋' },
    { type: 'Wind Plants', color: '#10b981', icon: '💨' },
  ];

  return (
    <div className="login-page-modern">
      <div className="login-animated-bg" />

      <div className="login-glass-card">
        <div className="login-brand-modern">
          <div className="login-brand-icon-modern">
            <Zap size={32} color="#fff" />
          </div>
          <div>
            <div className="login-brand-name-modern">Tranzenergy</div>
            <div className="login-brand-sub-modern">Enterprise Document Control</div>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
          Select a profile to enter the workspace
        </p>

        <div className="login-demo-grid-modern">
          {users.map(u => (
            <button
              key={u.id}
              className="demo-card-modern"
              onClick={() => handleLoginClick(u)}
            >
              <div
                className="demo-card-avatar"
                style={{ background: u.color || '#6366f1' }}
              >
                {u.avatar}
              </div>
              <div className="demo-card-info">
                <span className="demo-card-name">{u.name}</span>
                <span className="demo-card-role" style={{ color: roleColor(u.role) }}>
                  {u.role} {u.role === 'Admin' && <Lock size={10} style={{ display: 'inline', marginLeft: '4px' }} />}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Sectors Supported */}
        <div style={{ marginTop: '36px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>
            Sectors Supported
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {projectTypes.map(pt => (
              <span
                key={pt.type}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 14px', borderRadius: '9999px',
                  background: `${pt.color}15`, border: `1px solid ${pt.color}40`,
                  color: pt.color, fontSize: '11px', fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              >
                {pt.icon} {pt.type}
              </span>
            ))}
          </div>
        </div>
      </div>

      {selectedAdmin && (
        <div className="modal-overlay" style={{ zIndex: 100 }}>
          <div className="modal-content" style={{ width: '320px', textAlign: 'center', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedAdmin(null)}>
                <X size={16} />
              </button>
            </div>
            
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
              <div className="demo-card-avatar" style={{ background: selectedAdmin.color, width: '48px', height: '48px', fontSize: '18px' }}>
                {selectedAdmin.avatar}
              </div>
            </div>
            <h3 style={{ marginBottom: '4px' }}>{selectedAdmin.name}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>Admin Authentication Required</p>
            
            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                className="form-input"
                style={{ width: '100%', marginBottom: '12px', textAlign: 'center' }}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {error && <div style={{ color: 'var(--error)', fontSize: '12px', marginBottom: '12px' }}>Incorrect password. Use: admin123</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Sign In
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
