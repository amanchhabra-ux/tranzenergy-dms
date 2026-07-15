import React, { useContext } from 'react';
import { AppContext } from '../AppContext';
import {
  LayoutDashboard, Zap, FolderOpen, Radio, Wind,
  Sun, Battery, Shield, LogOut, ChevronRight, Settings, FileText
} from 'lucide-react';

const TYPE_META = {
  transmission: { label: 'Transmission', icon: Zap,     color: '#6366f1' },
  solar:        { label: 'Solar',         icon: Sun,     color: '#f59e0b' },
  bess:         { label: 'BESS',          icon: Battery, color: '#06b6d4' },
  wind:         { label: 'Wind',          icon: Wind,    color: '#10b981' },
};

export function Sidebar({ activeView, activeProjectId, onNavigate }) {
  const { currentUser, projects, drawings, canDo, logout } = useContext(AppContext);

  const filteredProjects = projects.filter(p => currentUser?.role === 'Admin' || p.assignedUsers?.includes(currentUser?.id));

  const drawingCount = (pid) => drawings.filter(d => d.projectId === pid).length;

  return (
    <div className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Zap size={18} color="#fff" />
        </div>
        <div>
          <div className="sidebar-brand-text">Tranzenergy</div>
          <div className="sidebar-brand-sub">v2 · Engineering DMS</div>
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
        <div className="sidebar-user" onClick={logout} title="Sign out">
          <div className="avatar" style={{ background: currentUser.color, color: '#fff', fontSize: '11px' }}>
            {currentUser.avatar}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div className="sidebar-user-name truncate">{currentUser.name}</div>
            <div className="sidebar-user-role">{currentUser.role}</div>
          </div>
          <LogOut size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
}
