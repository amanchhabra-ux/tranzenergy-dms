import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { StorageMigration } from './StorageMigration';
import { isStoredFile } from '../utils/uploadFile';
import { UserPasswordModal, generatePassword, setUserPassword } from './UserPasswordModal';
import { Users, Shield, Folder, Activity, Plus, Trash2, Edit2, X, Check, Database, Download, Upload, KeyRound } from 'lucide-react';

const ROLE_COLORS = {
  'Admin': '#3f7d3a', 'Project Manager': '#2a4439',
  'Senior Engineer': '#15803d', 'Engineer': '#d97706', 'Viewer': '#a1a1aa',
  'Consultant': '#0369a1', // outside consultant (e.g. Atlanta): sees only assigned projects
};

const AVATAR_COLORS = ['#3f7d3a','#2a4439','#15803d','#d97706','#7c3aed','#be185d','#0f766e','#2f6a2f','#0369a1','#52525b'];

export function AdminPanel({ initialTab = 'users' }) {
  const { users, projects, drawings, proposals, activityLog, ROLES, createUser, updateUser, deleteUser, deleteProject, assignUsersToProject, currentUser, importWorkspaceData, DISCIPLINES, saveNow, allowEmptySave } = useContext(AppContext);
  const [tab, setTab] = useState(initialTab);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'Engineer', password: generatePassword() });
  const [pwUser, setPwUser] = useState(null);          // user whose password is being set
  const [pwStatus, setPwStatus] = useState({});        // email → date set
  const [addError, setAddError] = useState('');
  const loadPwStatus = React.useCallback(async () => {
    try {
      const r = await fetch('/api/admin-password', { cache: 'no-store' });
      if (r.ok) setPwStatus((await r.json()).hasPassword || {});
    } catch { /* ignore */ }
  }, []);
  React.useEffect(() => { loadPwStatus(); }, [loadPwStatus]);
  const [manageUsersProjectId, setManageUsersProjectId] = useState(null);
  const [importStatus, setImportStatus] = useState('');

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddError('');
    const email = form.email.trim().toLowerCase();
    if (users.some(u => String(u.email || '').toLowerCase() === email)) { setAddError('A user with this email already exists.'); return; }
    try {
      await setUserPassword(email, form.password);
    } catch (err) { setAddError(err.message); return; }
    const color = AVATAR_COLORS[users.length % AVATAR_COLORS.length];
    const { password: _pw, ...rest } = form;
    createUser({ ...rest, email, avatar: form.name.slice(0,2).toUpperCase(), color });
    loadPwStatus();
    alert(`${form.name} added.\n\nSign-in email: ${email}\nPassword: ${form.password}\n\nShare these with them; they can change the password after signing in.`);
    setForm({ name:'', email:'', role:'Engineer', password: generatePassword() });
    setShowAddUser(false);
  };

  const handleUpdateRole = (userId, role) => {
    updateUser(userId, { role });
    setEditUserId(null);
  };

  const handleExportData = () => {
    const dataStr = JSON.stringify({
      users,
      projects,
      drawings,
      proposals,
      activityLog,
      disciplines: DISCIPLINES
    }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `tranzenergy_dms_backup_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

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
        setImportStatus('✓ Workspace data imported successfully! Page will refresh in 2 seconds.');
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (err) {
        setImportStatus('⚠️ Error parsing file: ' + err.message);
      }
    };
  };

  // Fresh start: delete every stored file, then clear the workspace for everyone
  const handleResetInstance = async () => {
    const files = new Set();
    drawings.forEach(d => {
      [d.pdfData, d.crsData, d.crsPdf, ...(d.versions || []).map(v => v.pdfData)].forEach(u => { if (isStoredFile(u)) files.add(u); });
    });
    proposals.forEach(p => { if (isStoredFile(p.fileData)) files.add(p.fileData); });

    const typed = window.prompt(
      `This permanently deletes ALL ${projects.length} projects, ${drawings.length} drawings, ${proposals.length} proposals, ` +
      `every comment and log, ${files.size} stored files, and every user except the 5 built-in accounts.\n\n` +
      'It cannot be undone. Type RESET to continue.'
    );
    if (typed !== 'RESET') { setImportStatus('Reset cancelled.'); return; }

    try {
      // 1. delete the stored files
      const list = [...files];
      let done = 0, failed = 0;
      const worker = async () => {
        while (list.length) {
          const url = list.shift();
          try {
            const r = await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
            if (!r.ok) failed++;
          } catch { failed++; }
          done++;
          setImportStatus(`Deleting stored files… ${done} / ${files.size}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      // 2. clear the workspace
      setImportStatus('Clearing the workspace…');
      allowEmptySave(); // deliberate: the only time an empty workspace may overwrite the saved one
      importWorkspaceData({
        users: [
          { id: 'u1', name: 'Aman Chhabra',    email: 'aman@tranzenergy.in',      role: 'Admin',           avatar: 'AC', color: '#3f7d3a' },
          { id: 'u2', name: 'Project Manager', email: 'pm@tranzenergy.in',         role: 'Project Manager', avatar: 'PM', color: '#2a4439' },
          { id: 'u3', name: 'Sr. Engineer',    email: 'sr.eng@tranzenergy.in',     role: 'Senior Engineer', avatar: 'SE', color: '#15803d' },
          { id: 'u4', name: 'Engineer',        email: 'eng@tranzenergy.in',        role: 'Engineer',        avatar: 'EN', color: '#d97706' },
          { id: 'u5', name: 'Viewer',          email: 'viewer@tranzenergy.in',     role: 'Viewer',          avatar: 'VW', color: '#a1a1aa' },
        ],
        projects: [],
        drawings: [],
        proposals: [],
        activityLog: [{ id: `log-${Date.now()}`, message: 'Workspace reset — fresh start.', author: currentUser?.name || 'Admin', time: new Date().toISOString() }],
        disciplines: ['Electrical', 'Civil', 'Mechanical', 'SCADA & Telecom', 'Protection & Control', 'Structural', 'Other'],
      });

      // 3. make sure the shared database has saved before saying we're done
      await new Promise(r => setTimeout(r, 400));
      await saveNow();
      setImportStatus(`✓ Workspace reset. ${files.size - failed} file(s) deleted${failed ? `, ${failed} could not be deleted` : ''}. Everyone else will see the empty workspace within a few seconds.`);
    } catch (err) {
      setImportStatus('⚠️ Reset failed: ' + err.message);
    }
  };

  const tabs = [
    ...(currentUser?.role === 'Admin' ? [
      { key: 'users', label: 'Users', icon: Users },
      { key: 'projects', label: 'Projects', icon: Folder },
      { key: 'activity', label: 'Audit Log', icon: Activity }
    ] : []),
    { key: 'backup', label: 'Backup & Sync', icon: Database },
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
                          <span style={{ fontSize: 11, alignSelf: 'center', marginRight: 6, color: pwStatus[String(u.email || '').toLowerCase()] ? 'var(--success)' : 'var(--warning)' }}>
                            {pwStatus[String(u.email || '').toLowerCase()] ? 'Password set' : 'No password'}
                          </span>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPwUser(u)} title={pwStatus[String(u.email || '').toLowerCase()] ? 'Reset password' : 'Set password'}>
                            <KeyRound size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditUserId(u.id)} title="Edit role">
                            <Edit2 size={13} />
                          </button>
                          {u.id !== currentUser.id && (
                            <button className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--error)' }} onClick={() => {
                              if (!window.confirm(`Remove ${u.name}? They will no longer be able to sign in.`)) return;
                              fetch('/api/admin-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, remove: true }) }).then(loadPwStatus).catch(() => {});
                              deleteUser(u.id);
                            }} title="Remove user">
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
                    <th style={{ textAlign: 'center' }}>Users</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(p => {
                    const dwgs = drawings.filter(d => d.projectId === p.id);
                    return (
                      <tr key={p.id}>
                        <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent)' }}>{p.code}</span></td>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{p.client}</td>
                        <td>
                          <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>{p.type}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{dwgs.length}</td>
                        <td style={{ textAlign: 'center' }}>{(p.assignedUsers || []).length}</td>
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

        {/* ── Backup & Sync Tab ──────────────────────────────────────────────── */}
        {tab === 'backup' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0', width: '100%' }}>
            <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database size={20} style={{ color: 'var(--primary-light)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Export / Import Workspace Backup</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', margin: 0 }}>
                This application stores all user overrides, drawing pins, transmittals, activity logs, and configurations inside your browser's local sandbox (Local Storage).
                <br /><br />
                To sync or migrate your data from this browser (e.g. Chrome on Mac) to another browser (e.g. Safari) or another machine (e.g. a Windows PC), download a backup file here and import it on the other side.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: currentUser?.role === 'Admin' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '16px' }}>
              {/* Export Panel */}
              <div className="card" style={{ padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 6px 0' }}>1. Export Current Data</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    Download your current workspace state as a secure <code>.json</code> file.
                  </p>
                </div>
                <button className="btn btn-primary" onClick={handleExportData} style={{ width: '100%' }}>
                  <Download size={14} style={{ marginRight: '6px' }} /> Download Backup
                </button>
              </div>

              {/* Import Panel */}
              <div className="card" style={{ padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 6px 0' }}>2. Import Data</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                    Upload a backup file to restore your workspace.
                    <span style={{ color: '#dc2626', display: 'block', marginTop: '4px', fontWeight: 500 }}>Warning: This overwrites local data!</span>
                  </p>
                </div>
                <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', width: '100%', margin: 0 }}>
                  <Upload size={14} style={{ marginRight: '6px' }} /> Upload Backup JSON
                  <input type="file" accept=".json" onChange={handleImportData} style={{ display: 'none' }} />
                </label>
              </div>

              {/* Reset Panel - Admin Only */}
              {currentUser?.role === 'Admin' && (
                <div className="card" style={{ padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', gap: '12px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <div>
                    <h4 style={{ fontWeight: 600, fontSize: '14px', margin: '0 0 6px 0', color: '#dc2626' }}>3. Reset Instance</h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                      Delete all projects, drawings, proposals, comments, logs and stored files, and every user except the 5 built-in accounts.
                      <span style={{ color: '#dc2626', display: 'block', marginTop: '4px', fontWeight: 500 }}>Warning: Clears data for all users!</span>
                    </p>
                  </div>
                  <button className="btn" onClick={handleResetInstance} style={{ width: '100%', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 16px', borderRadius: '6px', fontWeight: 500, fontSize: '13px' }}>
                    <Trash2 size={14} /> Reset Workspace
                  </button>
                </div>
              )}
            </div>

            {currentUser?.role === 'Admin' && <StorageMigration />}

            {importStatus && (
              <div className="card" style={{ padding: '12px 16px', fontSize: '13px', background: importStatus.includes('successfully') ? 'var(--success-glow)' : 'rgba(239,68,68,0.1)', border: importStatus.includes('successfully') ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)', color: importStatus.includes('successfully') ? '#10b981' : '#dc2626', borderRadius: '6px', textAlign: 'center', fontWeight: 500 }}>
                {importStatus}
              </div>
            )}
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
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-input" value={form.role} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Password *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-input" value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} required style={{ fontFamily: 'var(--font-mono)' }} />
                    <button type="button" className="btn btn-secondary btn-icon" title="Generate a password" onClick={() => setForm(f=>({...f,password:generatePassword()}))}>↻</button>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>At least 8 characters with letters and a number. They can change it after signing in.</span>
                </div>
                {addError && <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-glow)', padding: '8px 12px', borderRadius: 8, marginTop: 12 }}>{addError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddUser(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} />Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pwUser && <UserPasswordModal user={pwUser} onClose={() => setPwUser(null)} onSaved={loadPwStatus} />}

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
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', background: selectedUsers.has(u.id) ? 'var(--primary-glow)' : 'transparent' }}>
                <input
                  type="checkbox"
                  checked={selectedUsers.has(u.id)}
                  onChange={() => toggleUser(u.id)}
                  disabled={u.role === 'Admin'}
                  style={{ accentColor: 'var(--primary-light)' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{u.name} {u.role === 'Admin' && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(Admin - auto access)</span>}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.role}{u.email ? ` · ${u.email}` : ''}</div>
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
