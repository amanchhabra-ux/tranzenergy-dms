import React, { useContext } from 'react';
import { AppContext } from '../AppContext';
import { Zap, Sun, Battery, Wind, FileText, CheckCircle, Clock, AlertCircle, Plus, ArrowRight } from 'lucide-react';

const TYPE_META = {
  transmission: { label: 'Transmission Line', color: '#6366f1', icon: Zap,     cls: 'type-transmission' },
  solar:        { label: 'Solar Plant',        color: '#f59e0b', icon: Sun,     cls: 'type-solar' },
  bess:         { label: 'BESS Plant',         color: '#06b6d4', icon: Battery, cls: 'type-bess' },
  wind:         { label: 'Wind Farm',          color: '#10b981', icon: Wind,    cls: 'type-wind' },
};

const STATUS_META = {
  IFR:        { label: 'IFR', color: '#6366f1', desc: 'Issued for Review' },
  IFA:        { label: 'IFA', color: '#f59e0b', desc: 'Issued for Approval' },
  AFC:        { label: 'AFC', color: '#10b981', desc: 'Approved for Construction' },
  Superseded: { label: 'Sup', color: '#475569', desc: 'Superseded' },
};

export function Dashboard({ onOpenProject }) {
  const { currentUser, projects, drawings, activityLog, canDo, createProject } = useContext(AppContext);
  const [showNewProject, setShowNewProject] = React.useState(false);
  const [form, setForm] = React.useState({ code:'', name:'', client:'', clientContact:'', type:'transmission', location:'' });

  const filteredProjects = projects.filter(p => currentUser.role === 'Admin' || p.assignedUsers?.includes(currentUser.id));
  const filteredDrawings = drawings.filter(d => filteredProjects.some(p => p.id === d.projectId));

  const totalDrawings = filteredDrawings.length;
  const ifaCount  = filteredDrawings.filter(d => d.status === 'IFA').length;
  const afcCount  = filteredDrawings.filter(d => d.status === 'AFC').length;
  const openPins  = filteredDrawings.reduce((n, d) => n + (d.pins?.filter(p => !p.resolved).length || 0), 0);

  const stats = [
    { label: 'Total Drawings',     value: totalDrawings, icon: FileText,    color: '#6366f1' },
    { label: 'Issued for Approval',value: ifaCount,      icon: Clock,       color: '#f59e0b' },
    { label: 'Approved (AFC)',      value: afcCount,      icon: CheckCircle, color: '#10b981' },
    { label: 'Open Comments',       value: openPins,      icon: AlertCircle, color: '#ef4444' },
  ];

  const projectProgress = (pid) => {
    const dws = drawings.filter(d => d.projectId === pid);
    if (!dws.length) return 0;
    const afc = dws.filter(d => d.status === 'AFC').length;
    return Math.round((afc / dws.length) * 100);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    createProject({ ...form });
    setForm({ code:'', name:'', client:'', clientContact:'', type:'transmission', location:'' });
    setShowNewProject(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-header-title">Good day, {currentUser.name.split(' ')[0]} 👋</div>
          <div className="page-header-sub">{currentUser.role} · {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        {canDo('manage_projects') && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewProject(true)}>
            <Plus size={14} /><span>New Project</span>
          </button>
        )}
      </div>

      <div className="page-body" style={{ padding: '20px 24px' }}>
        {/* Stats */}
        <div className="dashboard-stats">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="card stat-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
                    <div className="stat-card-label">{s.label}</div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: '10px', background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} style={{ color: s.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="dashboard-grid">
          {/* Projects */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px' }}>Active Projects</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{filteredProjects.length} projects</span>
            </div>
            <div className="projects-grid">
              {filteredProjects.map(p => {
                const meta = TYPE_META[p.type] || TYPE_META.transmission;
                const Icon = meta.icon;
                const prog = projectProgress(p.id);
                const dwgCount = drawings.filter(d => d.projectId === p.id).length;

                return (
                  <div
                    key={p.id}
                    className={`card project-card card-hover ${meta.cls}`}
                    onClick={() => onOpenProject(p.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <Icon size={13} style={{ color: meta.color }} />
                      <span className="project-card-type" style={{ color: meta.color }}>{meta.label}</span>
                    </div>
                    <div className="project-card-name">{p.name}</div>
                    <div className="project-card-client">{p.client}</div>

                    <div className="project-card-progress">
                      <div className="progress-bar-track">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${prog}%`, background: meta.color }}
                        />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: meta.color }}>{prog}% AFC</span>
                    </div>

                    <div className="project-card-meta">
                      <span>{dwgCount} drawings</span>
                      <span>·</span>
                      <span>{p.location}</span>
                      <ArrowRight size={12} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity feed */}
          <div>
            <div style={{ marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px' }}>Recent Activity</h3>
            </div>
            <div className="card card-p-sm">
              <div className="activity-feed">
                {activityLog.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No recent activity.
                  </div>
                ) : activityLog.slice(0, 18).map(log => (
                  <div key={log.id} className="activity-item">
                    <div className="activity-dot" style={{ background: 'var(--primary)' }} />
                    <div>
                      <div
                        className="activity-text"
                        dangerouslySetInnerHTML={{ __html: log.message }}
                      />
                      <div className="activity-time">
                        {new Date(log.time).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">New Project</span>
              <button className="modal-close" onClick={() => setShowNewProject(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Project Code *</label>
                    <input className="form-input" placeholder="e.g. NTPC-TL-2025" value={form.code} onChange={e => setForm(f=>({...f,code:e.target.value}))} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Type *</label>
                    <select className="form-input" value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}>
                      <option value="transmission">Transmission Line</option>
                      <option value="solar">Solar Plant</option>
                      <option value="bess">BESS Plant</option>
                      <option value="wind">Wind Farm</option>
                    </select>
                  </div>
                </div>
                <div className="form-group mt-2">
                  <label className="form-label">Project Name *</label>
                  <input className="form-input" placeholder="Full project name" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Client *</label>
                    <input className="form-input" placeholder="Client organisation" value={form.client} onChange={e => setForm(f=>({...f,client:e.target.value}))} required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Client Contact</label>
                    <input className="form-input" placeholder="Contact name" value={form.clientContact} onChange={e => setForm(f=>({...f,clientContact:e.target.value}))} />
                  </div>
                </div>
                <div className="form-group mt-2" style={{ marginBottom: 0 }}>
                  <label className="form-label">Location</label>
                  <input className="form-input" placeholder="State, India" value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewProject(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} />Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
