import React, { useContext, useState } from 'react';
import { AppContext } from '../AppContext';
import { X, ArrowUp, ArrowDown, Trash2, Plus, ListPlus } from 'lucide-react';
import { mdlColumns, columnHasValues, keyFromLabel, DERIVED, COLUMN_TYPES, TE002_MDL_COLUMNS } from '../utils/mdl';

const SOURCE_LABEL = { field: 'drawing field', import: 'typed / imported', workflow: 'read-only' };

/** Project settings: the MDL columns (add, rename, reorder, hide, list options; delete only when empty). */
export function MdlColumnsSettings({ project, drawings, onClose }) {
  const { updateProject, addLog } = useContext(AppContext);
  const [cols, setCols] = useState(() => mdlColumns(project).map(c => ({ ...c, optionsText: (c.options || []).join('\n') })));
  const [error, setError] = useState('');

  const set = (i, patch) => setCols(list => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i, d) => setCols(list => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const taken = () => new Set(cols.map(c => c.key));

  const addColumn = () => setCols(list => [...list, { key: keyFromLabel('New column', taken()), label: 'New column', type: 'text', options: [], optionsText: '', width: 120, visible: true, source: 'import', aliases: [] }]);
  const addDerived = (derive) => {
    if (!derive) return;
    const d = DERIVED[derive];
    setCols(list => [...list, { key: keyFromLabel(d.label, taken()), label: d.label, type: d.type, options: [], optionsText: '', width: d.width, visible: true, source: 'workflow', derive, aliases: [] }]);
  };

  // TE-002 preset: its columns, plus any of ours that already hold values (kept at the end)
  const loadPreset = () => {
    if (!window.confirm('Replace the column set with the TE-002 MDL columns? Columns that already hold values are kept at the end.')) return;
    const keys = new Set(TE002_MDL_COLUMNS.map(c => c.key));
    const kept = cols.filter(c => !keys.has(c.key) && columnHasValues(c, drawings));
    setCols([...TE002_MDL_COLUMNS, ...kept].map(c => ({ ...c, optionsText: (c.options || []).join('\n') })));
  };

  const save = () => {
    if (cols.some(c => !String(c.label || '').trim())) { setError('Every column needs a name.'); return; }
    const out = cols.map(({ optionsText, ...c }) => ({
      ...c,
      label: c.label.trim(),
      width: Math.max(40, parseInt(c.width, 10) || 120),
      options: c.type === 'list' ? [...new Set(String(optionsText || '').split('\n').map(s => s.trim()).filter(Boolean))] : [],
    }));
    updateProject(project.id, { mdlColumns: out });
    addLog(`MDL columns of <strong>${project.code}</strong> updated.`);
    onClose();
  };

  const missingDerived = Object.keys(DERIVED).filter(k => !cols.some(c => c.derive === k));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-xl" style={{ maxWidth: 1000 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">MDL columns — {project.code}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Order, names and lists of the Master Document List. The export and the template use the same columns.</div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={addColumn}><Plus size={13} /> Add column</button>
            <select className="form-input" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value="" onChange={e => addDerived(e.target.value)}>
              <option value="">+ Add read-only column…</option>
              {missingDerived.map(k => <option key={k} value={k}>{DERIVED[k].label}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary btn-sm" onClick={loadPreset}><ListPlus size={13} /> Load TE-002 MDL columns</button>
          </div>
          <div className="table-wrapper" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Order</th>
                  <th>Name</th>
                  <th style={{ width: 110 }}>Type</th>
                  <th style={{ width: 90 }}>Width</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Shown</th>
                  <th>List options (one per line)</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {cols.map((c, i) => {
                  const hasValues = columnHasValues(c, drawings);
                  return (
                    <tr key={c.key}>
                      <td>
                        <button className="btn btn-ghost btn-icon" style={{ padding: 2 }} onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ArrowUp size={12} /></button>
                        <button className="btn btn-ghost btn-icon" style={{ padding: 2 }} onClick={() => move(i, 1)} disabled={i === cols.length - 1} title="Move down"><ArrowDown size={12} /></button>
                      </td>
                      <td>
                        <input className="form-input" style={{ fontSize: 12, padding: '4px 6px' }} value={c.label} onChange={e => set(i, { label: e.target.value })} />
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.key} · {SOURCE_LABEL[c.source] || c.source}{c.derive ? ` (${DERIVED[c.derive]?.label || c.derive})` : ''}</div>
                      </td>
                      <td>
                        {c.source === 'import' ? (
                          <select className="form-input" style={{ fontSize: 12, padding: '4px 6px' }} value={c.type} onChange={e => set(i, { type: e.target.value })}>
                            {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.type}</span>}
                      </td>
                      <td><input className="form-input" type="number" min={40} style={{ fontSize: 12, padding: '4px 4px', minWidth: 70 }} value={c.width} onChange={e => set(i, { width: e.target.value })} /></td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={c.visible !== false} disabled={c.key === 'code'} onChange={e => set(i, { visible: e.target.checked })} />
                      </td>
                      <td>
                        {c.type === 'list' && c.source === 'import' ? (
                          <textarea className="form-input" rows={Math.min(4, Math.max(2, (c.optionsText || '').split('\n').length))} style={{ fontSize: 12, padding: '4px 6px' }}
                            value={c.optionsText} onChange={e => set(i, { optionsText: e.target.value })} />
                        ) : c.key === 'discipline' ? <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>The workspace disciplines</span> : null}
                      </td>
                      <td>
                        {c.source !== 'field' && (
                          <button className="btn btn-ghost btn-icon" style={{ padding: 2, color: hasValues ? 'var(--text-disabled)' : 'var(--error)' }}
                            disabled={hasValues} title={hasValues ? 'Holds values: hide it instead' : 'Delete column'}
                            onClick={() => setCols(list => list.filter((_, j) => j !== i))}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {error && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save columns</button>
        </div>
      </div>
    </div>
  );
}
