import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { X, FileSpreadsheet, Upload, Trash2, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { defaultWorkflow, EXTERNAL_ROLE, DEFAULT_CATEGORIES, AEL_CATEGORIES, categoriesInUse } from '../utils/workflow';
import { uploadCrsFile } from '../utils/uploadFile';
import { readCrs } from '../utils/crs';

const ROLE_ROWS = [
  { key: 'consultantUsers', step: 1, label: 'Consultant — uploads & sends to client', hint: 'Uploads the first copy with a note (consultant logins); once the CRS is ready, sends it to the client' },
  { key: 'firstReviewers',  step: 2, label: 'TE Engineer 1', hint: 'Reviews and comments first' },
  { key: 'secondReviewers', step: 3, label: 'TE Review Engineer — review & CRS', hint: 'Downloads, reviews, adds comments to the CRS and marks it ready for the consultant' },
  { key: 'approvers',       step: 4, label: 'Final check & submit', hint: 'Only if a separate final check is switched on below', finalOnly: true },
  { key: 'issueNotify',     step: null, label: 'Also notify when the CRS is ready', hint: 'Told when the CRS goes to the consultant' },
];

export function WorkflowSettings({ project, onClose }) {
  const { users, drawings, updateWorkflow, updateProject } = useContext(AppContext);
  const [wf, setWf] = useState(() => ({ ...defaultWorkflow(), enabled: false, ...(project.workflow || {}) }));
  // the project's category list; a project that never set one keeps the default list
  // (and wf.categories stays unset) unless the list is edited here
  const [cats, setCats] = useState(() => (project.workflow?.categories?.length ? project.workflow.categories : DEFAULT_CATEGORIES).map(c => ({ ...c })));
  const [catsTouched, setCatsTouched] = useState(false);
  const [catMsg, setCatMsg] = useState('');
  const used = categoriesInUse(drawings, project.id);
  const editCats = (fn) => { setCats(prev => fn(prev.map(c => ({ ...c })))); setCatsTouched(true); setCatMsg(''); };
  const setCat = (i, k, v) => editCats(list => { list[i][k] = v; return list; });
  const moveCat = (i, d) => editCats(list => { const j = i + d; if (j < 0 || j >= list.length) return list; [list[i], list[j]] = [list[j], list[i]]; return list; });
  const presetCats = (preset, name) => {
    const missing = [...used].filter(k => !preset.some(c => c.key === k));
    if (missing.length) { setCatMsg(`⚠️ Cannot apply ${name}: reviews on this project use ${missing.join(', ')}, which it does not have.`); return; }
    editCats(() => preset.map(c => ({ ...c })));
  };
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
    let categories = null;
    if (catsTouched) {
      const list = cats.map(c => ({ key: String(c.key || '').trim(), label: String(c.label || '').trim(), desc: String(c.desc || '').trim(), closes: c.closes === true }))
        .map(c => ({ ...c, label: c.label || `Category ${c.key}` }));
      const keys = list.map(c => c.key);
      if (!list.length || keys.some(k => !k)) { setCatMsg('⚠️ Every category needs a key.'); return; }
      if (new Set(keys).size !== keys.length) { setCatMsg('⚠️ Two categories have the same key.'); return; }
      const lost = [...used].filter(k => !keys.includes(k));
      if (lost.length) { setCatMsg(`⚠️ Reviews on this project use ${lost.join(', ')}: keep ${lost.length === 1 ? 'it' : 'them'} in the list.`); return; }
      categories = list;
    }
    const turnaroundDays = Math.max(1, parseInt(wf.turnaroundDays, 10) || 14);
    const issueNotation = String(wf.issueNotation || '').trim();
    const categoryFormat = String(wf.categoryFormat || '').trim();
    updateWorkflow(project.id, { ...wf, turnaroundDays, issueNotation, categoryFormat, ...(categories ? { categories } : {}) });
    // everyone in the workflow needs access to the project
    const people = new Set([...(project.assignedUsers || []), ...ROLE_ROWS.flatMap(r => wf[r.key] || [])]);
    if (people.size !== (project.assignedUsers || []).length) updateProject(project.id, { assignedUsers: [...people] });
    onClose();
  };

  const templateBlock = (
          <div className="wf-role">
            <div className="wf-role-head">
              <span className="wf-step" style={{ fontSize: 9 }}>CRS</span>
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
              <input className="form-input" value={wf.consultantName || ''} onChange={e => set('consultantName', e.target.value)} placeholder="e.g. Consultant Ltd (CON)" />
            </div>
            <div className="form-group">
              <label className="form-label">Client</label>
              <input className="form-input" value={wf.clientName || ''} onChange={e => set('clientName', e.target.value)} placeholder="e.g. Client Ltd" />
            </div>
            <div className="form-group">
              <label className="form-label">Turnaround (calendar days)</label>
              <input type="number" min={1} className="form-input" value={wf.turnaroundDays} onChange={e => set('turnaroundDays', e.target.value)} />
              <div className="wf-hint">As agreed in the contract. Each due date can also be edited.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Reviewer on the issued CRS</label>
              <input className="form-input" value={wf.issueNotation || ''} onChange={e => set('issueNotation', e.target.value)} placeholder="e.g. AEL" />
              <div className="wf-hint">Written in the Reviewer/s column of every row of the issued sheet. Empty: each commenter's name.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Category format</label>
              <input className="form-input" value={wf.categoryFormat || ''} onChange={e => set('categoryFormat', e.target.value)} placeholder="Category {key}" />
              <div className="wf-hint">Used only while the project has no category list of its own (below, whose labels win); {'{key}'} becomes 1, 2, 3, 4B… e.g. Category-{'{key}'}</div>
            </div>
          </div>

          <div className="wf-role">
            <div className="wf-role-head">
              <span className="wf-step" style={{ fontSize: 9 }}>CAT</span>
              <div><strong>Review categories</strong><div className="wf-hint">The categories the client issues and we propose, in this order. "Closes" ends the review; any other category waits for a resubmission. A category a review uses cannot be deleted or re-keyed.</div></div>
            </div>
            <table className="wf-cats">
              <thead><tr><th>Key</th><th>Label</th><th>Description</th><th title="The review closes on this category">Closes</th><th /></tr></thead>
              <tbody>
                {cats.map((c, i) => {
                  const inUse = used.has(String(c.key));
                  return (
                    <tr key={i}>
                      <td><input className="form-input" style={{ width: 64 }} value={c.key} readOnly={inUse} title={inUse ? 'Used by a review' : ''} onChange={e => setCat(i, 'key', e.target.value)} aria-label="Category key" /></td>
                      <td><input className="form-input" style={{ width: 130 }} value={c.label || ''} onChange={e => setCat(i, 'label', e.target.value)} placeholder={`Category ${c.key}`} aria-label="Category label" /></td>
                      <td><input className="form-input" value={c.desc || ''} onChange={e => setCat(i, 'desc', e.target.value)} aria-label="Category description" /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={c.closes === true} onChange={e => setCat(i, 'closes', e.target.checked)} aria-label="Closes the review" /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-icon" title="Move up" disabled={i === 0} onClick={() => moveCat(i, -1)}><ArrowUp size={13} /></button>
                        <button className="btn btn-ghost btn-icon" title="Move down" disabled={i === cats.length - 1} onClick={() => moveCat(i, 1)}><ArrowDown size={13} /></button>
                        <button className="btn btn-ghost btn-icon" title={inUse ? 'Used by a review: cannot be deleted' : 'Delete'} disabled={inUse} onClick={() => editCats(list => list.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => editCats(list => [...list, { key: '', label: '', desc: '', closes: false }])}><Plus size={13} /> Add category</button>
              <button className="btn btn-secondary btn-sm" onClick={() => presetCats(AEL_CATEGORIES, 'the AEL legend')}>AEL legend (TE-002)</button>
              <button className="btn btn-ghost btn-sm" onClick={() => presetCats(DEFAULT_CATEGORIES, 'the default list')}>Default list</button>
            </div>
            {catMsg && <div className="wf-hint" style={{ marginTop: 6, color: 'var(--error)' }}>{catMsg}</div>}
          </div>

          <label className="wf-switch" style={{ background: '#fff', borderColor: 'var(--border)' }}>
            <input type="checkbox" checked={wf.finalCheck === true} onChange={e => set('finalCheck', e.target.checked)} />
            <span><strong>Separate final check before the CRS goes out</strong><br />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Off: reviewer 2's "Done — ready" sends the CRS to the consultant. On: it goes to the final-check person first.</span></span>
          </label>

          {ROLE_ROWS.filter(row => !row.finalOnly || wf.finalCheck === true).map(row => {
            const list = pool(row.key);
            return (
              <React.Fragment key={row.key}>
              <div className="wf-role">
                <div className="wf-role-head">
                  <span className="wf-step" style={row.step ? undefined : { background: 'var(--text-muted)' }}>{row.step || '·'}</span>
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
