import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { Zap, Lock, X, Upload, Database } from 'lucide-react';

export function Login() {
  const { login, users, importWorkspaceData } = useContext(AppContext);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [email, setEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [importStatus, setImportStatus] = useState('');

  const handleImportData = (e) => {
    const fileReader = new FileReader();
    if (!e.target.files || e.target.files.length === 0) return;
    
    fileReader.readAsText(e.target.files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.projects || !parsed.drawings) {
          setImportStatus('⚠️ Invalid backup file format. Must contain projects and drawings.');
          return;
        }
        importWorkspaceData(parsed);
        setImportStatus('✓ Workspace restored successfully! Page will refresh.');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        setImportStatus('⚠️ Error parsing file: ' + err.message);
      }
    };
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find(u => u.email?.toLowerCase().trim() === normalizedEmail);
    if (!user) {
      setLoginError('Invalid email address. Please try again.');
      return;
    }
    setLoginError('');
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
          Enter your email to access the workspace
        </p>

        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Email Address</label>
            <input
              type="email"
              className="form-input"
              style={{ width: '100%' }}
              placeholder="e.g. pm@tranzenergy.in or viewer@tranzenergy.in"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          {loginError && (
            <div style={{ color: 'var(--error)', fontSize: '12px', textAlign: 'center' }}>
              {loginError}
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ justifyContent: 'center', width: '100%', padding: '10px' }}>
            Sign In
          </button>
        </form>

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

        {/* Restore Workspace from Backup */}
        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--primary-light)', fontWeight: 500 }}>
            <Upload size={14} />
            <span>Restore Workspace from Backup (.json)</span>
            <input type="file" accept=".json" onChange={handleImportData} style={{ display: 'none' }} />
          </label>
          {importStatus && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: importStatus.includes('successfully') ? '#10b981' : '#ef4444', fontWeight: 500 }}>
              {importStatus}
            </div>
          )}
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
