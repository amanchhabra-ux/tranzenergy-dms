import React, { useState, useContext } from 'react';
import { AppContext } from '../AppContext';
import { Database, ShieldAlert, LogIn } from 'lucide-react';

export const LoginView = () => {
  const { loginUser, users } = useContext(AppContext);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }

    const success = loginUser(username);
    if (!success) {
      setError('Invalid username. Try using one of the demo users below.');
    } else {
      setError('');
    }
  };

  const handleDemoClick = (demoUsername) => {
    loginUser(demoUsername);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo-display">
            <Database className="logo-icon" size={32} />
            <span>Tranzenergy</span>
          </div>
          <p className="auth-subtitle">Drawing Version & Markup Control Portal</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="flex-row text-danger" style={{ marginBottom: '16px', fontSize: '13px', justifyContent: 'center' }}>
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Enter Username</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. admin, bob, charlie"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            <LogIn size={16} />
            <span>Authenticate Securely</span>
          </button>
        </form>

        <div className="demo-login-box">
          <h4 className="demo-title">Select Demo Account to Test Access Levels</h4>
          <div className="demo-grid">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className="demo-btn"
                onClick={() => handleDemoClick(user.username)}
              >
                <span className="demo-btn-role">{user.role}</span>
                <span className="demo-btn-name">{user.name} ({user.username})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
