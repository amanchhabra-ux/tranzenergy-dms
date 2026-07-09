import React, { useContext, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { AppContext } from '../AppContext';
import {
  ShieldCheck,
  AlertCircle,
  FolderPlus,
  Trash2,
  Building2,
  Users2,
  Plus,
  X,
  CheckCircle2,
  FolderDot,
  FileSpreadsheet,
  Upload,
  Download,
  Eye
} from 'lucide-react';

export const AdminView = () => {
  const { users, permissions, togglePermission, projects, addProject, removeProject } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState('projects'); // 'projects' | 'permissions'

  // ── Add project form state ─────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [addError, setAddError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // ── Sheet upload state ───────────────────────────────────────────────────
  const sheetInputRef = useRef(null);
  const [parsedRows, setParsedRows] = useState([]);    // [{code, name, client, _error}]
  const [sheetError, setSheetError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleAddProject = (e) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim() || !newClient.trim()) {
      setAddError('All three fields are required.');
      return;
    }
    if (projects.some(p => p.code.toUpperCase() === newCode.trim().toUpperCase())) {
      setAddError(`Project code "${newCode.toUpperCase()}" already exists.`);
      return;
    }
    addProject({ code: newCode, name: newName, client: newClient });
    setNewCode(''); setNewName(''); setNewClient('');
    setAddError('');
    setShowAddForm(false);
  };

  const handleRemove = (id) => {
    removeProject(id);
    setConfirmDeleteId(null);
  };

  // ── Download blank template ─────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Project Code', 'Project Name', 'Client Name'],
      ['BGTPS-BESS-LOT2', 'Bongaigaon BESS 75MW LOT-2', 'NTPC Limited'],
      ['METRO-CIV-302', 'Metro Line Elevated Structure', 'City Transit Authority']
    ]);
    // Set column widths
    ws['!cols'] = [{ wch: 20 }, { wch: 45 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projects');
    XLSX.writeFile(wb, 'Tranzenergy_Projects_Template.xlsx');
  };

  // ── Parse uploaded sheet (xlsx, xls, csv) ──────────────────────────────
  const handleSheetUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // allow re-selecting same file
    setSheetError('');
    setParsedRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length < 2) {
          setSheetError('The sheet appears to be empty. Add at least one data row below the header.');
          return;
        }

        // Auto-detect header columns (case-insensitive partial match)
        const header = rows[0].map(h => String(h).toLowerCase().trim());
        const find = (keywords) => header.findIndex(h => keywords.some(k => h.includes(k)));

        const codeIdx   = find(['code', 'proj code', 'project code', 'no.', 'number']);
        const nameIdx   = find(['name', 'project name', 'title', 'description']);
        const clientIdx = find(['client', 'owner', 'company', 'employer']);

        if (codeIdx === -1 || nameIdx === -1 || clientIdx === -1) {
          setSheetError(
            `Could not detect required columns. Found headers: [${rows[0].join(', ')}]. ` +
            `Expected columns containing: "Project Code", "Project Name", "Client Name".`
          );
          return;
        }

        const existingCodes = new Set(projects.map(p => p.code.toUpperCase()));
        const seen = new Set();

        const parsed = rows.slice(1)
          .filter(row => row.some(cell => String(cell).trim() !== ''))
          .map((row, i) => {
            const code   = String(row[codeIdx]  || '').trim().toUpperCase();
            const name   = String(row[nameIdx]  || '').trim();
            const client = String(row[clientIdx] || '').trim();

            let error = '';
            if (!code)   error = 'Missing project code';
            else if (!name)   error = 'Missing project name';
            else if (!client) error = 'Missing client name';
            else if (existingCodes.has(code)) error = `Code "${code}" already registered`;
            else if (seen.has(code)) error = `Duplicate code in sheet`;
            if (code) seen.add(code);

            return { code, name, client, _row: i + 2, _error: error };
          });

        if (parsed.length === 0) {
          setSheetError('No data rows found in the sheet.');
          return;
        }

        setParsedRows(parsed);
        setShowPreview(true);
      } catch (err) {
        setSheetError('Could not read the file. Please use .xlsx, .xls, or .csv format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Confirm import of valid rows ────────────────────────────────────────
  const handleConfirmImport = () => {
    setImporting(true);
    const valid = parsedRows.filter(r => !r._error);
    valid.forEach(r => addProject({ code: r.code, name: r.name, client: r.client }));
    setTimeout(() => {
      setImporting(false);
      setShowPreview(false);
      setParsedRows([]);
    }, 300);
  };

  const categories = [
    { key: 'Electrical', label: 'Electrical' },
    { key: 'Civil', label: 'Civil' },
    { key: 'Mechanical', label: 'Mechanical' },
    { key: 'SCADA', label: 'SCADA & Telecom' },
    { key: 'FireFighting', label: 'Fire Fighting' },
    { key: 'Process', label: 'Process' }
  ];

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'Admin': return 'role-badge role-admin';
      case 'Design Lead': return 'role-badge role-lead';
      case 'Client Inspector': return 'role-badge role-client';
      default: return 'role-badge';
    }
  };

  return (
    <div className="admin-view">
      {/* Header */}
      <div className="admin-header-row">
        <div className="admin-intro">
          <h2 style={{ fontSize: '24px', margin: 0, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={26} className="text-success" />
            <span>Admin Portal</span>
          </h2>
          <p className="header-subtitle" style={{ fontSize: '14px', marginTop: '4px' }}>
            Manage projects, clients, and user access permissions.
          </p>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0' }}>
        {[
          { key: 'projects', label: 'Projects & Clients', icon: <FolderDot size={14} /> },
          { key: 'permissions', label: 'Permissions Matrix', icon: <Users2 size={14} /> }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 18px', fontSize: '13px', fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
              transition: 'all 0.15s', marginBottom: '-1px'
            }}
          >
            {tab.icon}<span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── PROJECTS TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'projects' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                Projects Registry
                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
                  {projects.length} project{projects.length !== 1 ? 's' : ''} registered
                </span>
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                All drawings must be mapped to a project. Add projects here before registering drawings.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              {/* Hidden sheet file input */}
              <input
                ref={sheetInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleSheetUpload}
              />
              <button
                className="btn btn-secondary"
                style={{ padding: '9px 16px', fontSize: '13px' }}
                onClick={handleDownloadTemplate}
                title="Download blank Excel template"
              >
                <Download size={14} /><span>Template</span>
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '9px 16px', fontSize: '13px', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd' }}
                onClick={() => sheetInputRef.current?.click()}
                title="Bulk import from Excel / CSV"
              >
                <FileSpreadsheet size={14} /><span>Upload Sheet</span>
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: '9px 18px', fontSize: '13px' }}
                onClick={() => { setShowAddForm(f => !f); setAddError(''); }}
              >
                <Plus size={14} /><span>Add Project</span>
              </button>
            </div>
          </div>

          {/* Add project form */}
          {showAddForm && (
            <div style={{
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: '12px', padding: '20px', marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
                  <FolderPlus size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  New Project
                </h4>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setShowAddForm(false); setAddError(''); }}>
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleAddProject}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Project Code *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. BGTPS-BESS-LOT2"
                      value={newCode}
                      onChange={e => setNewCode(e.target.value)}
                      style={{ textTransform: 'uppercase' }}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Project Name *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. Bongaigaon BESS 75MW LOT-2"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Client Name *</label>
                    <input
                      className="form-input"
                      placeholder="e.g. NTPC Limited"
                      value={newClient}
                      onChange={e => setNewClient(e.target.value)}
                      required
                    />
                  </div>
                </div>
                {addError && (
                  <div style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <AlertCircle size={12} />{addError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-primary" style={{ padding: '7px 18px', fontSize: '12px' }}>
                    <CheckCircle2 size={13} /><span>Register Project</span>
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: '12px' }} onClick={() => { setShowAddForm(false); setAddError(''); }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Project list */}
          {projects.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              border: '2px dashed var(--border-color)', borderRadius: '16px',
              background: 'rgba(255,255,255,0.01)'
            }}>
              <FolderDot size={48} style={{ color: 'var(--text-muted)', marginBottom: '12px', opacity: 0.4 }} />
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                No projects registered
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '360px', margin: '0 auto' }}>
                Click <strong>Add Project</strong> above to register your first project. All drawings must be mapped to a project.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {projects.map(proj => (
                <div
                  key={proj.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: '10px', padding: '14px 18px',
                    transition: 'border-color 0.15s'
                  }}
                >
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Building2 size={18} style={{ color: 'var(--primary)' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '12px', fontWeight: 700, fontFamily: 'monospace',
                        background: 'rgba(59,130,246,0.15)', color: '#93c5fd',
                        padding: '2px 8px', borderRadius: '5px', letterSpacing: '0.04em'
                      }}>{proj.code}</span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{proj.name}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      Client: <strong style={{ color: 'var(--text-secondary)' }}>{proj.client}</strong>
                    </div>
                  </div>

                  {/* Remove button — with inline confirm */}
                  {confirmDeleteId === proj.id ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 600, whiteSpace: 'nowrap' }}>Remove project?</span>
                      <button
                        onClick={() => handleRemove(proj.id)}
                        style={{
                          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                          color: '#f87171', borderRadius: '6px', padding: '4px 10px',
                          fontSize: '11px', fontWeight: 600, cursor: 'pointer'
                        }}
                      >Yes, Remove</button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        style={{
                          background: 'none', border: '1px solid var(--border-color)',
                          color: 'var(--text-muted)', borderRadius: '6px', padding: '4px 10px',
                          fontSize: '11px', cursor: 'pointer'
                        }}
                      >Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(proj.id)}
                      title="Remove project"
                      style={{
                        background: 'none', border: '1px solid var(--border-color)',
                        color: 'var(--text-muted)', borderRadius: '7px',
                        padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                        fontSize: '12px', transition: 'all 0.15s', flexShrink: 0
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#f87171'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <Trash2 size={13} /><span>Remove</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Sheet parse error */}
          {sheetError && (
            <div style={{
              marginTop: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px', padding: '14px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start'
            }}>
              <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0, marginTop: '1px' }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#f87171', marginBottom: '2px' }}>Upload Error</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{sheetError}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Click <strong>Template</strong> to download the correct column format, fill it in, then upload again.
                </div>
              </div>
              <button onClick={() => setSheetError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SHEET IMPORT PREVIEW MODAL ──────────────────────────────────────── */}
      {showPreview && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '780px', width: '95vw' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} style={{ color: 'var(--primary)' }} />
                <span className="modal-title">Review Import — {parsedRows.length} Row{parsedRows.length !== 1 ? 's' : ''} Detected</span>
              </div>
              <button className="modal-close-btn" onClick={() => { setShowPreview(false); setParsedRows([]); }}><X size={16} /></button>
            </div>

            <div className="modal-body" style={{ padding: '16px 20px' }}>
              {/* Summary pills */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <span style={{
                  background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                  color: '#6ee7b7', borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600
                }}>
                  ✓ {parsedRows.filter(r => !r._error).length} will be imported
                </span>
                {parsedRows.some(r => r._error) && (
                  <span style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171', borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: 600
                  }}>
                    ⚠ {parsedRows.filter(r => r._error).length} will be skipped
                  </span>
                )}
              </div>

              {/* Preview table */}
              <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Row', 'Project Code', 'Project Name', 'Client Name', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, i) => (
                      <tr key={i} style={{ background: row._error ? 'rgba(239,68,68,0.04)' : 'transparent', borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '9px 14px', color: 'var(--text-muted)' }}>{row._row}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', background: 'rgba(59,130,246,0.1)', color: '#93c5fd', padding: '2px 6px', borderRadius: '4px' }}>
                            {row.code || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 14px', color: 'var(--text-main)', maxWidth: '220px' }}>{row.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ padding: '9px 14px', color: 'var(--text-secondary)' }}>{row.client || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          {row._error
                            ? <span style={{ color: '#f87171', fontSize: '11px', fontWeight: 600 }}>⚠ {row._error}</span>
                            : <span style={{ color: '#34d399', fontSize: '11px', fontWeight: 600 }}>✓ Ready</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {parsedRows.filter(r => !r._error).length === 0 && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#f87171', textAlign: 'center' }}>
                  No valid rows to import. Fix the issues above, then re-upload the sheet.
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '12px' }} onClick={() => { setShowPreview(false); setParsedRows([]); }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: '8px 20px', fontSize: '12px' }}
                disabled={parsedRows.filter(r => !r._error).length === 0 || importing}
                onClick={handleConfirmImport}
              >
                <CheckCircle2 size={13} />
                <span>{importing ? 'Importing…' : `Import ${parsedRows.filter(r => !r._error).length} Project${parsedRows.filter(r => !r._error).length !== 1 ? 's' : ''}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PERMISSIONS TAB ───────────────────────────────────────────────── */}
      {activeTab === 'permissions' && (
        <div>
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
              marginBottom: '20px'
            }}
          >
            <AlertCircle className="text-primary" size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
              <strong>Rule Overrides:</strong> Users with the role of <strong>Admin</strong> have absolute full clearance across all categories by default. For other roles, click on the permission badges to toggle access. Changes take effect immediately.
            </div>
          </div>

          <div className="matrix-card">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Staff Engineer / User</th>
                  {categories.map(cat => (
                    <th key={cat.key} style={{ textAlign: 'center' }}>{cat.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const userPerms = permissions[user.id] || {};
                  const isUserAdminRole = user.role === 'Admin';

                  return (
                    <tr key={user.id}>
                      <td className="user-cell">
                        <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '12px' }}>
                          {user.avatar}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{user.name}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{user.username}</span>
                        </div>
                        <span className={getRoleBadgeClass(user.role)} style={{ marginLeft: 'auto' }}>
                          {user.role}
                        </span>
                      </td>

                      {categories.map(cat => {
                        const catPerms = userPerms[cat.key] || { read: false, write: false, admin: false };

                        return (
                          <td key={cat.key} style={{ textAlign: 'center' }}>
                            <div className="toggle-group" style={{ justifyContent: 'center' }}>
                              {isUserAdminRole ? (
                                <span
                                  className="permission-pill granted"
                                  style={{ cursor: 'not-allowed', width: '150px', textAlign: 'center' }}
                                >
                                  FULL ADMIN BYPASS
                                </span>
                              ) : (
                                <>
                                  <span
                                    className={`permission-pill ${catPerms.read ? 'granted' : 'denied'}`}
                                    onClick={() => togglePermission(user.id, cat.key, 'read')}
                                    title={`Toggle Read permission for ${cat.label}`}
                                  >
                                    Read: {catPerms.read ? 'ALLOW' : 'DENY'}
                                  </span>

                                  <span
                                    className={`permission-pill ${catPerms.write ? 'granted' : 'denied'}`}
                                    onClick={() => togglePermission(user.id, cat.key, 'write')}
                                    title={`Toggle Write/Upload permission for ${cat.label}`}
                                  >
                                    Write: {catPerms.write ? 'ALLOW' : 'DENY'}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
