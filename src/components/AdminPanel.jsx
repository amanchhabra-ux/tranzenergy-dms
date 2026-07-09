import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { Users, Shield, Folder, Activity, Plus, Trash2, Edit2, X, Check } from 'lucide-react';

const ROLE_COLORS = {
  'Admin': '#6366f1', 'Project Manager': '#06b6d4',
  'Senior Engineer': '#10b981', 'Engineer': '#f59e0b', 'Viewer': '#94a3b8',
};

const AVATAR_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#0ea5e9','#a78bfa'];

export function AdminPanel() {
  const { users, projects, drawings, activityLog, ROLES, createUser, updateUser, deleteUser, deleteProject, assignUsersToProject, currentUser } = useContext(AppContext);
  const [tab, setTab] = useState('users');
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'Engineer' });
  const [manageUsersProjectId, setManageUsersProjectId] = useState(null);

  const handleAddUser = (e) => {
    e.preventDefault();
    const color = AVATAR_COLORS[users.length % AVATAR_COLORS.length];
    createUser({ ...form, avatar: form.name.slice(0,2).toUpperCase(), color });
    setForm({ name:'', email:'', role:'Engineer' });
    setShowAddUser(false);
  };

  const handleUpdateRole = (userId, role) => {
    updateUser(userId, { role });
    setEditUserId(null);
  };

  const tabs = [
    { key: 'users', label: 'Users', icon: Users },
    { key: 'projects', label: 'Projects', icon: Folder },
    { key: 'activity', label: 'Audit Log', icon: Activity },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="page-header">
        <div>
          <div className="page-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} style={{ color: 'var(--primary-light)' }} />
            Admin Panel
          </div>
          <div className="page-header-sub">Manage team, projects and permissions</div>
        </div>
        {tab === 'users' && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddUser(true)}>
            <Plus size={14} />Add User
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <div key={t.key} className={`tab-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              <Icon size={14} />{t.label}
            </div>
          );
        })}
      </div>

      <div className="page-body">
        {/* ── Users Tab ───────────────────────────────────────────────────── */}
        {tab === 'users' && (
          <div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div className="avatar avatar-sm" style={{ background: u.color, color: '#fff' }}>{u.avatar}</div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{u.name}</div>
                            {u.id === currentUser.id && (
                              <span style={{ fontSize: '10px', color: 'var(--primary-light)' }}>● You</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{u.email}</td>
                      <td>
                        {editUserId === u.id ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select
                              className="form-input"
                              defaultValue={u.role}
                              style={{ padding: '4px 8px', fontSize: '12px', width: 'auto' }}
                              id={`role-select-${u.id}`}
                            >
                              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <button className="btn btn-primary btn-sm btn-icon" onClick={() => {
                              const sel = document.getElementById(`role-select-${u.id}`);
                              handleUpdateRole(u.id, sel.value);
                            }}><Check size={12} /></button>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditUserId(null)}><X size={12} /></button>
                          </div>
                        ) : (
                          <span className="badge" style={{ background: `${ROLE_COLORS[u.role]}18`, color: ROLE_COLORS[u.role], border: `1px solid ${ROLE_COLORS[u.role]}40` }}>
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditUserId(u.id)} title="Edit role">
                            <Edit2 size={13} />
                          </button>
                          {u.id !== currentUser.id && (
                            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--error)' }} onClick={() => { if (window.confirm(`Remove ${u.name}?`)) deleteUser(u.id); }} title="Remove user">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Projects Tab ─────────────────────────────────────────────────── */}
        {tab === 'projects' && (
          <div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'center' }}>Drawings</th>
                    <th style={{ textAlign: 'center' }}>AFC %</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => {
                    const dwgs = drawings.filter(d => d.projectId === p.id);
                    const afc = dwgs.filter(d => d.status === 'AFC').length;
                    const pct = dwgs.length ? Math.round((afc / dwgs.length) * 100) : 0;
                    return (
                      <tr key={p.id}>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent)' }}>{p.code}</span></td>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{p.client}</td>
                        <td>
                          <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>{p.type}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{dwgs.length}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--success)' : pct > 50 ? 'var(--warning)' : 'var(--text-muted)' }}>
                            {pct}%
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Manage Assigned Users"
                            onClick={() => setManageUsersProjectId(p.id)}
                          >
                            <Users size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            style={{ color: 'var(--error)' }}
                            title="Delete project"
                            onClick={() => { if (window.confirm(`Delete project "${p.name}" and ALL its drawings?`)) deleteProject(p.id); }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Audit Log Tab ─────────────────────────────────────────────────── */}
        {tab === 'activity' && (
          <div className="card card-p-sm">
            {activityLog.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="empty-state-title">No activity yet</div>
              </div>
            ) : activityLog.map(log => (
              <div key={log.id} className="activity-item">
                <div className="activity-dot" style={{ background: 'var(--primary)' }} />
                <div>
                  <div className="activity-text" dangerouslySetInnerHTML={{ __html: log.message }} />
                  <div className="activity-time">
                    {log.author} · {new Date(log.time).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Add Team Member</span>
              <button className="modal-close" onClick={() => setShowAddUser(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Er. Full Name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))} placeholder="name@tranzenergy.in" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role *</label>
                  <select className="form-input" value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} />Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {manageUsersProjectId && (
        <ManageProjectUsersModal
          project={projects.find(p => p.id === manageUsersProjectId)}
          users={users}
          onClose={() => setManageUsersProjectId(null)}
          onSave={(userIds) => {
            assignUsersToProject(manageUsersProjectId, userIds);
            setManageUsersProjectId(null);
          }}
        />
      )}
    </div>
  );
}

function ManageProjectUsersModal({ project, users, onClose, onSave }) {
  const [selectedUsers, setSelectedUsers] = useState(new Set(project.assignedUsers || []));

  const toggleUser = (uid) => {
    const next = new Set(selectedUsers);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setSelectedUsers(next);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: '400px' }}>
        <div className="modal-header">
          <div className="modal-title">Assign Users</div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Select the users who should have access to <strong>{project.code}</strong>.
            (Note: Admins have access to all projects automatically).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {users.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: selectedUsers.has(u.id) ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
                <input
                  type="checkbox"
                  checked={selectedUsers.has(u.id)}
                  onChange={() => toggleUser(u.id)}
                  disabled={u.role === 'Admin'}
                  style={{ accentColor: 'var(--primary-light)' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{u.name} {u.role === 'Admin' && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(Admin - auto access)</span>}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.role}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(Array.from(selectedUsers))}>Save Assignments</button>
        </div>
      </div>
    </div>
  );
}
