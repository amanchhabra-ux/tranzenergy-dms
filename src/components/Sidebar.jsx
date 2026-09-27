import React, { useContext } from 'react';
import { AppContext } from '../AppContext';
import { ChangePassword } from './ChangePassword';
import {
  LayoutDashboard, Zap, FolderOpen, Radio, Wind,
  Sun, Battery, Shield, LogOut, ChevronRight, Settings, FileText, Database, KeyRound, Inbox } from 'lucide-react';
import { isExternal } from '../utils/workflow';

const TYPE_META = {
  transmission: { label: 'Transmission', icon: Zap,     color: '#2a4439' },
  solar:        { label: 'Solar',         icon: Sun,     color: '#d97706' },
  bess:         { label: 'BESS',          icon: Battery, color: '#3f7d3a' },
  wind:         { label: 'Wind',          icon: Wind,    color: '#0369a1' },
};

export function Sidebar({ activeView, activeProjectId, onNavigate, mobileOpen = false, reviewCount = { total: 0, overdue: 0 } }) {
  const { currentUser, projects, drawings, canDo, logout, authMode, org } = useContext(AppContext);
  const [showPw, setShowPw] = React.useState(false);

  const filteredProjects = projects.filter(p => currentUser?.role === 'Admin' || p.assignedUsers?.includes(currentUser?.id));

  const drawingCount = (pid) => drawings.filter(d => d.projectId === pid).length;

  return (
    <div className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">
          {org.logoUrl ? <img src={org.logoUrl} alt={org.name} /> : <div className="sidebar-brand-name">{org.name}</div>}
          <div className="sidebar-brand-sub">Engineering DMS</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {/* Main */}
        <div className="sidebar-section-label">Workspace</div>
        <div
          className={`sidebar-item ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <LayoutDashboard size={16} />
          <span>Dashboard</span>
        </div>
        {(
          <div
            className={`sidebar-item ${activeView === 'myreviews' ? 'active' : ''}`}
            onClick={() => onNavigate('myreviews')}
            title="Drawings waiting on you, and what others uploaded, downloaded and commented"
          >
            <Inbox size={16} />
            <span style={{ flex: 1 }}>My reviews</span>
            {reviewCount.total > 0 && (
              <span className={`sidebar-item-count review-count ${reviewCount.overdue ? 'overdue' : ''}`} title={reviewCount.overdue ? `${reviewCount.overdue} overdue` : ''}>{reviewCount.total}</span>
            )}
          </div>
        )}

        {/* Projects */}
        <div className="sidebar-section-label" style={{ marginTop: '8px' }}>Projects</div>
        {filteredProjects.map(p => {
          const meta = TYPE_META[p.type] || TYPE_META.transmission;
          const Icon = meta.icon;
          const isActive = activeView === 'project' && activeProjectId === p.id;
          const count = drawingCount(p.id);
          return (
            <div
              key={p.id}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate('project', p.id)}
              title={p.name}
            >
              <Icon size={15} style={{ color: isActive ? meta.color : 'inherit', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{p.code}</span>
              {count > 0 && <span className="sidebar-item-count">{count}</span>}
            </div>
          );
        })}

        {/* Settings & Sync (internal staff only) */}
        {!isExternal(currentUser) && (<>
        <div className="sidebar-section-label" style={{ marginTop: '8px' }}>Settings</div>
        <div
          className={`sidebar-item ${activeView === 'backup' ? 'active' : ''}`}
          onClick={() => onNavigate('backup')}
        >
          <Database size={15} />
          <span>Backup & Sync</span>
        </div>
        </>)}

        {/* Admin */}
        {canDo('admin') && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: '8px' }}>Administration</div>
            <div
              className={`sidebar-item ${activeView === 'admin' ? 'active' : ''}`}
              onClick={() => onNavigate('admin')}
            >
              <Shield size={15} />
              <span>Admin Panel</span>
            </div>
            <div
              className={`sidebar-item ${activeView === 'proposals' ? 'active' : ''}`}
              onClick={() => onNavigate('proposals')}
            >
              <FileText size={15} />
              <span>Proposals</span>
            </div>
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user" style={{ cursor: 'default' }}>
          <div className="avatar" style={{ background: currentUser.color, color: '#fff', fontSize: '11px' }}>
            {currentUser.avatar}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div className="sidebar-user-name truncate">{currentUser.name}</div>
            <div className="sidebar-user-role">{currentUser.role}</div>
          </div>
          {authMode === 'password' && (
            <button className="btn btn-ghost btn-icon" title="Change password" onClick={() => setShowPw(true)} style={{ padding: 5 }}>
              <KeyRound size={14} />
            </button>
          )}
          <button className="btn btn-ghost btn-icon" title="Sign out" onClick={logout} style={{ padding: 5 }}>
            <LogOut size={14} />
          </button>
        </div>
        {showPw && <ChangePassword onClose={() => setShowPw(false)} onDone={() => { setShowPw(false); alert('Password changed.'); }} />}
      </div>
    </div>
  );
}
