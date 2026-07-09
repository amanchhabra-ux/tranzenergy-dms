import React, { useContext } from 'react';
import { AppContext } from '../AppContext';
import { 
  FileText, 
  MessageSquare, 
  Send, 
  Users, 
  Activity, 
  Mail,
  Zap,
  HardHat,
  Network,
  Flame
} from 'lucide-react';

export const DashboardView = ({ setActiveTab }) => {
  const { currentUser, drawings, activityLogs, transmittals, users } = useContext(AppContext);

  // Stats calculation
  const totalDrawings = drawings.length;
  
  // A drawing needs review if it has active, unresolved pins
  const pendingReviews = drawings.filter(dwg => 
    dwg.pins.some(pin => !pin.resolved)
  ).length;

  const totalTransmittals = transmittals.length;
  const activeUsersCount = users.length;

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Electrical': return <Zap size={14} className="text-success" />;
      case 'Civil': return <HardHat size={14} className="text-warning" />;
      case 'SCADA and Telecom': return <Network size={14} className="text-success" />;
      case 'Fire Fighting': return <Flame size={14} className="text-danger" />;
      default: return <FileText size={14} />;
    }
  };

  return (
    <div className="dashboard-view">
      {/* Welcome banner */}
      <div className="header-title-container">
        <h2 style={{ fontSize: '26px', margin: 0, fontFamily: 'var(--font-display)' }}>
          Welcome back, {currentUser.name}
        </h2>
        <span className="header-subtitle" style={{ fontSize: '14px' }}>
          Role: <strong style={{ color: 'var(--primary)' }}>{currentUser.role}</strong> | Firm Portal Workspace Dashboard Overview
        </span>
      </div>

      {/* Stats Counters Grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Total Drawings</span>
            <span className="stat-value">{totalDrawings}</span>
          </div>
          <div className="stat-icon-wrapper">
            <FileText size={24} />
          </div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-info">
            <span className="stat-label">Pending Reviews</span>
            <span className="stat-value">{pendingReviews}</span>
          </div>
          <div className="stat-icon-wrapper">
            <MessageSquare size={24} />
          </div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-info">
            <span className="stat-label">Dispatched Transmittals</span>
            <span className="stat-value">{totalTransmittals}</span>
          </div>
          <div className="stat-icon-wrapper">
            <Send size={24} />
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <span className="stat-label">Active Users</span>
            <span className="stat-value">{activeUsersCount}</span>
          </div>
          <div className="stat-icon-wrapper">
            <Users size={24} />
          </div>
        </div>
      </div>

      {/* Main split sections */}
      <div className="dashboard-sections">
        {/* Left pane: Activity Log */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-title">
              <Activity size={18} className="text-success" />
              <span>Real-Time Activity Audit Trail</span>
            </span>
          </div>
          <div className="section-body">
            {activityLogs.length === 0 ? (
              <div className="no-items-state" style={{ height: '100%' }}>
                <span className="no-items-title">No actions logged yet</span>
              </div>
            ) : (
              <div className="activity-list">
                {activityLogs.map((log) => (
                  <div className="activity-item" key={log.id}>
                    <div className="activity-icon-bullet">
                      <Activity size={14} />
                    </div>
                    <div className="activity-details">
                      <div 
                        className="activity-text" 
                        dangerouslySetInnerHTML={{ __html: log.text }} 
                      />
                      <span className="activity-time">
                        {log.date} by {log.user}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Transmittals Log */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-title">
              <Mail size={18} className="text-warning" />
              <span>Sent Revision Transmittals</span>
            </span>
          </div>
          <div className="section-body" style={{ padding: '16px' }}>
            {transmittals.length === 0 ? (
              <div className="no-items-state" style={{ padding: '24px' }}>
                <Send size={28} style={{ color: 'var(--text-muted)' }} />
                <span className="no-items-title" style={{ marginTop: '12px' }}>No packages shared</span>
                <span className="no-items-desc">Use the transmittal mailer inside the drawing panel to email revision sheets.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {transmittals.map((trn) => (
                  <div 
                    key={trn.id}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '12px'
                    }}
                  >
                    <div className="flex-space-between" style={{ marginBottom: '6px' }}>
                      <strong style={{ color: 'var(--primary)' }}>{trn.drawingCode}</strong>
                      <span className="version-badge">{trn.version}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {trn.drawingTitle}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>To: {trn.recipients}</span>
                      <span>Sent: {trn.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
