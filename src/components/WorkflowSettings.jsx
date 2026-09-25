import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { X, FileSpreadsheet, Upload, Trash2 } from 'lucide-react';
import { defaultWorkflow, EXTERNAL_ROLE } from '../utils/workflow';
import { uploadCrsFile } from '../utils/uploadFile';
import { readCrs } from '../utils/crs';

const ROLE_ROWS = [
  { key: 'firstReviewers',  step: 3, label: 'First reviewer (India)', hint: 'Reviews and comments first, marks internal review 1 done' },
  { key: 'secondReviewers', step: 4, label: 'TranzEnergy reviewer',   hint: 'Adds comments after the first reviewer, marks internal review 2 done' },
  { key: 'approvers',       step: 5, label: 'Final check & submit',    hint: 'Checks the merged comment sheet and submits it (e.g. Aman)' },
  { key: 'issueNotify',     step: 6, label: 'Also notify on submission', hint: 'Told when the CRS is sent to the consultant (e.g. Noor)' },
  { key: 'consultantUsers', step: 7, label: 'Consultant users',        hint: 'Upload submissions (step 1), add their comments and forward to the client (Atlanta logins)' },
];

export function WorkflowSettings({ project, onClose }) {
  const { users, updateWorkflow, updateProject } = useContext(AppContext);
  const [wf, setWf] = useState(() => ({ ...defaultWorkflow(), enabled: false, ...(project.workflow || {}) }));
  const [busy, setBusy] = useState(false);
  const [tplMsg, setTplMsg] = useState('');
  const set = (k, v) => setWf(w => ({ ...w, [k]: v }));
  const toggle = (k, id) => setWf(w => ({ ...w, [k]: (w[k] || []).includes(id) ? w[k].filter(x => x !== id) : [...(w[k] || []), id] }));

  const internal = users.filter(u => u.role !== EXTERNAL_ROLE && u.role !== 'Viewer');
  const pool = (key) => (key === 'consultantUsers' ? users.filter(u => u.role === EXTERNAL_ROLE) : key === 'issueNotify' ? users : internal);

  const onTemplate = async (file) => {
    if (!file) return;
    setBusy(true); setTplMsg('');
    try {
      const parsed = await readCrs(file);
      if (!parsed.layout) { setTplMsg("⚠️ Couldn't find a comments table (Comment / Reply / Status columns) in this sheet — it can't be used as the template."); setBusy(false); return; }
      const url = await uploadCrsFile(`TEMPLATE-${project.code || project.id}`, file);
      set('crsTemplate', { url, fileName: file.name, uploadedAt: new Date().toISOString() });
      setTplMsg(`✓ Template read: comments table found${Object.keys(parsed.meta || {}).length ? `, title block fields: ${Object.keys(parsed.meta).join(', ')}` : ''}.`);
    } catch (e) {
      setTplMsg('⚠️ Upload failed: ' + e.message);
    }
    setBusy(false);
  };

  const save = () => {
    const turnaroundDays = Math.max(1, parseInt(wf.turnaroundDays, 10) || 14);
    updateWorkflow(project.id, { ...wf, turnaroundDays });
    // everyone in the workflow needs access to the project
    const people = new Set([...(project.assignedUsers || []), ...ROLE_ROWS.flatMap(r => wf[r.key] || [])]);
    if (people.size !== (project.assignedUsers || []).length) updateProject(project.id, { assignedUsers: [...people] });
    onClose();
  };

  const templateBlock = (
          <div className="wf-role">
            <div className="wf-role-head">
              <span className="wf-step">6</span>
              <div><strong>Contractual CRS template</strong><div className="wf-hint">The Excel format the CRS is sent in. The DMS fills its title block and comments table.</div></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {wf.crsTemplate ? (
                <>
                  <span className="wf-template"><FileSpreadsheet size={14} /> {wf.crsTemplate.fileName}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => set('crsTemplate', null)}><Trash2 size={13} /> Remove</button>
                </>
              ) : <span className="wf-hint">None — the standard DMS CRS format is used.</span>}
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={13} /> {wf.crsTemplate ? 'Replace' : 'Upload template'}
                <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => { onTemplate(e.target.files[0]); e.target.value = ''; }} />
              </label>
              {busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
            </div>
            {tplMsg && <div className="wf-hint" style={{ marginTop: 6 }}>{tplMsg}</div>}
          </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Review workflow — {project.code}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Who does each step, the turnaround and the contractual CRS template</div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <label className="wf-switch">
            <input type="checkbox" checked={!!wf.enabled} onChange={e => set('enabled', e.target.checked)} />
            <span><strong>Use the review workflow on this project</strong><br />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>New drawings and revisions start at internal review 1 with a due date.</span></span>
          </label>

          <div className="wf-grid">
            <div className="form-group">
              <label className="form-label">Consultant</label>
              <input className="form-input" value={wf.consultantName || ''} onChange={e => set('consultantName', e.target.value)} placeholder="Atlanta (AEL)" />
            </div>
            <div className="form-group">
              <label className="form-label">Client</label>
              <input className="form-input" value={wf.clientName || ''} onChange={e => set('clientName', e.target.value)} placeholder="RPCL" />
            </div>
            <div className="form-group">
              <label className="form-label">Turnaround (calendar days)</label>
              <input type="number" min={1} className="form-input" value={wf.turnaroundDays} onChange={e => set('turnaroundDays', e.target.value)} />
              <div className="wf-hint">Per Annex 2 cl 9.1 — change when agreed with AEL. Each due date can also be edited.</div>
            </div>
          </div>

          {ROLE_ROWS.map(row => {
            const list = pool(row.key);
            return (
              <React.Fragment key={row.key}>
              <div className="wf-role">
                <div className="wf-role-head">
                  <span className="wf-step">{row.step}</span>
                  <div><strong>{row.label}</strong><div className="wf-hint">{row.hint}</div></div>
                </div>
                <div className="wf-people">
                  {list.length === 0 && (
                    <span className="wf-hint">{row.key === 'consultantUsers' ? 'No consultant logins yet — add users with the "Consultant" role in the Admin panel.' : 'No users available.'}</span>
                  )}
                  {list.map(u => (
                    <label key={u.id} className={`wf-person ${(wf[row.key] || []).includes(u.id) ? 'on' : ''}`}>
                      <input type="checkbox" checked={(wf[row.key] || []).includes(u.id)} onChange={() => toggle(row.key, u.id)} />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
              {row.key === 'issueNotify' && templateBlock}
              </React.Fragment>
            );
          })}

          <div className="wf-hint" style={{ marginTop: 10 }}>
            Notifications: shown in the DMS under <strong>My reviews</strong>. Email starts once an email service key is added; WhatsApp later.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>Save workflow</button>
        </div>
      </div>
    </div>
  );
}
