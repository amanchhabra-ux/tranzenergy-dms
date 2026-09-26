import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../AppContext';
import { X, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { readWorkbook, defaultImportSettings, autoMapping, buildPlan } from '../utils/mdlImport';
import { mdlColumns, normHeader } from '../utils/mdl';

const SHOW_ROWS = 300;
const small = { fontSize: 12, padding: '4px 6px' };
const muted = { fontSize: 11, color: 'var(--text-muted)' };

/**
 * MDL import: file → mapping (saved on the project) → preview → one commit.
 * Nothing is deleted; new numbers become expected records, known numbers get their mapped columns updated.
 */
export function MdlImportModal({ project, drawings, onClose }) {
  const { DISCIPLINES, importMdl } = useContext(AppContext);
  const columns = useMemo(() => mdlColumns(project), [project]);
  const [step, setStep] = useState('file'); // file | map | preview | done
  const [fileName, setFileName] = useState('');
  const [book, setBook] = useState(null);
  const [settings, setSettings] = useState(null);
  const [choices, setChoices] = useState({ confirmNoNumber: [], resolutions: {}, disciplineOf: {}, updateReceivedTitles: false });
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file) => {
    if (!file) return;
    setError('');
    try {
      const b = readWorkbook(new Uint8Array(await file.arrayBuffer()));
      const s = defaultImportSettings(b, project);
      if (!Object.values(s.sheets).some(x => x.include)) {
        setError('No header row found. One of the first 30 rows of a sheet needs at least two known column names (e.g. "Document No." and "Title"). Pick the header row by hand below.');
      }
      setBook(b); setSettings(s); setFileName(file.name); setStep('map');
    } catch (e) {
      setError(`Could not read the file: ${e.message}`);
    }
  };

  // headers of the included sheets, once each, with a sample value
  const headers = useMemo(() => {
    if (!book || !settings) return [];
    const out = new Map();
    for (const s of book.sheets) {
      const cfg = settings.sheets[s.name];
      if (!cfg?.include || cfg.headerRow < 0) continue;
      (s.text[cfg.headerRow] || []).forEach((h, ci) => {
        const n = normHeader(h);
        if (!n || out.has(n)) return;
        const sample = s.text.slice(cfg.headerRow + 1).map(r => r[ci]).find(v => String(v || '').trim()) || '';
        out.set(n, { n, label: String(h).trim(), sample: String(sample).slice(0, 40) });
      });
    }
    return [...out.values()];
  }, [book, settings]);

  const setSheet = (name, patch) => setSettings(s => {
    const sheets = { ...s.sheets, [name]: { ...s.sheets[name], ...patch } };
    // headers newly in view get an automatic target
    const sheet = book.sheets.find(x => x.name === name);
    const hr = sheets[name].headerRow;
    const add = hr >= 0 ? autoMapping((sheet.text[hr] || []).filter(h => !s.mapping[normHeader(h)]), columns, project.mdlImportMap || {}) : {};
    return { ...s, sheets, mapping: { ...add, ...s.mapping } };
  });
  const setTarget = (n, t) => setSettings(s => ({ ...s, mapping: { ...s.mapping, [n]: t } }));

  const plan = useMemo(() => {
    if (step !== 'preview' || !book) return null;
    try {
      return buildPlan({ book, project, drawings, disciplines: DISCIPLINES, settings, choices });
    } catch (e) {
      console.error(e);
      return { error: e.message };
    }
  }, [step, book, project, drawings, DISCIPLINES, settings, choices]);

  const mappedCode = Object.values(settings?.mapping || {}).includes('code');
  const areaCol = columns.find(c => c.key === 'area');

  const commit = () => {
    if (!plan || plan.error) return;
    setBusy(true);
    const res = importMdl(project.id, plan);
    setBusy(false);
    if (!res) { setError('Import not allowed for your role.'); return; }
    setResult(res); setStep('done');
  };

  const setResolution = (col, norm, v) => setChoices(c => ({ ...c, resolutions: { ...c.resolutions, [col]: { ...(c.resolutions[col] || {}), [norm]: v } } }));
  const toggleNoNumber = (rowId) => setChoices(c => ({ ...c, confirmNoNumber: c.confirmNoNumber.includes(rowId) ? c.confirmNoNumber.filter(x => x !== rowId) : [...c.confirmNoNumber, rowId] }));

  const optionsFor = (key) => (key === 'discipline' ? DISCIPLINES : columns.find(c => c.key === key)?.options || []);
  const newRows = plan?.rows?.filter(r => r.status === 'new') || [];
  const updRows = plan?.rows?.filter(r => r.status === 'updated') || [];
  const heldTitles = plan?.rows?.filter(r => r.changes.some(c => c.held)).length || 0;

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl" style={{ maxWidth: 1100 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Import MDL — {project.code}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {fileName || 'An .xlsx with one or more sheets'} · new numbers become expected records; nothing is deleted
            </div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {error && <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: 'var(--error)', fontSize: 12, marginBottom: 10 }}><AlertCircle size={14} /> {error}</div>}

          {step === 'file' && (
            <label className="drop-zone" style={{ display: 'block', padding: 28, cursor: 'pointer' }}>
              <input type="file" accept=".xlsx,.xls,.xlsm" style={{ display: 'none' }} onChange={e => { onFile(e.target.files[0]); e.target.value = ''; }} />
              <Upload size={26} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>Choose the MDL workbook</div>
              <div style={{ ...muted, marginTop: 4 }}>Each sheet can be an Area (e.g. one sheet per plant area). The header row is found automatically.</div>
            </label>
          )}

          {step === 'map' && settings && (
            <>
              <div className="sidebar-section-label" style={{ padding: 0, marginBottom: 6 }}>Sheets</div>
              <div className="table-wrapper" style={{ marginBottom: 14 }}>
                <table className="data-table">
                  <thead><tr><th style={{ width: 30 }}></th><th>Sheet</th><th style={{ width: 110 }}>Header row</th><th style={{ width: 90 }}>Rows</th>{areaCol && <th style={{ width: 170 }}>Sheet name → Area</th>}</tr></thead>
                  <tbody>
                    {book.sheets.map(s => {
                      const cfg = settings.sheets[s.name];
                      const rows = cfg.headerRow >= 0 ? s.text.slice(cfg.headerRow + 1).filter(r => r.some(v => String(v).trim())).length : 0;
                      return (
                        <tr key={s.name}>
                          <td><input type="checkbox" checked={cfg.include} disabled={cfg.headerRow < 0} onChange={e => setSheet(s.name, { include: e.target.checked })} /></td>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td>
                            <input className="form-input" type="number" min={1} style={small} value={cfg.headerRow >= 0 ? cfg.headerRow + 1 : ''} placeholder="none"
                              onChange={e => { const v = parseInt(e.target.value, 10); setSheet(s.name, { headerRow: v >= 1 ? v - 1 : -1, include: v >= 1 }); }} />
                          </td>
                          <td style={muted}>{rows}</td>
                          {areaCol && <td><label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!cfg.areaFromSheet} onChange={e => setSheet(s.name, { areaFromSheet: e.target.checked })} /> {cfg.areaFromSheet ? s.name.trim() : 'no'}</label></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="sidebar-section-label" style={{ padding: 0, marginBottom: 6 }}>Columns</div>
              <div className="table-wrapper" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Excel header</th><th>Example</th><th style={{ width: 280 }}>Goes to</th></tr></thead>
                  <tbody>
                    {headers.map(h => (
                      <tr key={h.n}>
                        <td style={{ fontWeight: 600 }}>{h.label}</td>
                        <td style={{ ...muted, maxWidth: 260 }} className="truncate">{h.sample}</td>
                        <td>
                          <select className="form-input" style={small} value={settings.mapping[h.n] || 'ignore'} onChange={e => setTarget(h.n, e.target.value)}>
                            {columns.map(c => <option key={c.key} value={c.key}>{c.label}{c.source === 'workflow' ? ' (read-only: fills blanks only)' : ''}</option>)}
                            <option value="new">New column “{h.label}”</option>
                            <option value="ignore">Ignore</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!mappedCode && <div style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>Map one header to {columns.find(c => c.key === 'code')?.label || 'the document number'}: it is the key of every record.</div>}
              <div style={{ ...muted, marginTop: 8 }}>The mapping is saved on the project, so the next import of the same layout is one click.</div>
            </>
          )}

          {step === 'preview' && plan?.error && <div style={{ color: 'var(--error)' }}>{plan.error}</div>}
          {step === 'preview' && plan && !plan.error && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="badge badge-primary">New · {plan.counts.new}</span>
                <span className="badge badge-warning">Updated · {plan.counts.updated}</span>
                <span className="badge badge-muted">Unchanged · {plan.counts.unchanged}</span>
                <span className="badge badge-muted">Skipped · {plan.counts.skipped}</span>
                <span className="badge badge-muted">Not in this import · {plan.notInImport.length}</span>
              </div>

              {plan.newColumns.length > 0 && <div style={{ fontSize: 12, marginBottom: 10 }}>New columns: <strong>{plan.newColumns.map(c => c.label).join(', ')}</strong></div>}
              {plan.duplicates.length > 0 && <div style={{ fontSize: 12, color: 'var(--warning)', marginBottom: 10 }}>{plan.duplicates.length} number(s) repeat within a sheet; the last row wins: {plan.duplicates.slice(0, 5).map(d => `${d.key} (${d.sheet} row ${d.row})`).join(', ')}{plan.duplicates.length > 5 ? '…' : ''}</div>}

              {plan.unknownValues.length > 0 && (
                <Section title={`Values not in the column's list · ${plan.unknownValues.length}`}>
                  <table className="data-table"><tbody>
                    {plan.unknownValues.map(u => (
                      <tr key={`${u.col}|${u.norm}`}>
                        <td style={{ width: 160 }}>{u.label}</td>
                        <td><strong>{u.value}</strong> <span style={muted}>· {u.count} row{u.count === 1 ? '' : 's'}</span></td>
                        <td style={{ width: 260 }}>
                          <select className="form-input" style={small} value={u.resolution} onChange={e => setResolution(u.col, u.norm, e.target.value)}>
                            <option value="add">Add “{u.value}” to the list</option>
                            <option value="skip">Leave the cell empty</option>
                            {optionsFor(u.col).map(o => <option key={o} value={o}>Use “{o}”</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </Section>
              )}

              {plan.noNumber.length > 0 && (
                <Section title={`Rows without a usable document number · ${plan.noNumber.length}`}>
                  <table className="data-table"><tbody>
                    {plan.noNumber.map(r => (
                      <tr key={r.rowId}>
                        <td style={{ width: 30 }}><input type="checkbox" checked={r.confirmed} disabled={r.known} onChange={() => toggleNoNumber(r.rowId)} /></td>
                        <td>{r.title || <em>no title</em>} <span style={muted}>· {r.sheet} row {r.row} · number “{r.number}”</span></td>
                        <td style={{ ...muted, width: 300 }}>{r.known ? `already imported as ${r.key}` : r.confirmed ? `import as ${r.key}` : 'tick to import with a provisional number'}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </Section>
              )}

              {newRows.length > 0 && (
                <Section title={`New expected records · ${newRows.length}`}>
                  <table className="data-table">
                    <thead><tr><th>Number</th><th>Title</th><th style={{ width: 180 }}>Discipline</th></tr></thead>
                    <tbody>
                      {newRows.slice(0, SHOW_ROWS).map(r => (
                        <tr key={r.key}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.key}</td>
                          <td style={{ fontSize: 12 }}>{r.title}</td>
                          <td>
                            <select className="form-input" style={small} value={r.discipline}
                              onChange={e => setChoices(c => ({ ...c, disciplineOf: { ...c.disciplineOf, [r.key]: e.target.value } }))}>
                              {[...new Set([...DISCIPLINES, r.discipline])].map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {newRows.length > SHOW_ROWS && <div style={muted}>… and {newRows.length - SHOW_ROWS} more</div>}
                </Section>
              )}

              {updRows.length > 0 && (
                <Section title={`Updated records · ${updRows.length}`}>
                  <table className="data-table"><tbody>
                    {updRows.slice(0, SHOW_ROWS).map(r => (
                      <tr key={r.key}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, width: 260 }}>{r.code}</td>
                        <td style={{ fontSize: 12 }}>
                          {r.changes.filter(c => !c.held).map(c => (
                            <div key={c.col}><span style={muted}>{c.label}:</span> {String(c.from) || <em style={muted}>empty</em>} → <strong>{String(c.to)}</strong></div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                </Section>
              )}

              {heldTitles > 0 && (
                <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0' }}>
                  <input type="checkbox" checked={choices.updateReceivedTitles} onChange={e => setChoices(c => ({ ...c, updateReceivedTitles: e.target.checked }))} />
                  Also change the title of {heldTitles} document{heldTitles === 1 ? '' : 's'} already received (their title differs from the file)
                </label>
              )}

              {plan.notInImport.length > 0 && (
                <Section title={`Not in this import · ${plan.notInImport.length} (kept as they are)`} closed>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>{plan.notInImport.map(d => d.code).join(' · ')}</div>
                </Section>
              )}
            </>
          )}

          {step === 'done' && result && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, padding: 20 }}>
              <CheckCircle2 size={22} style={{ color: 'var(--success)' }} />
              <div>
                <strong>{result.created}</strong> new expected record{result.created === 1 ? '' : 's'}, <strong>{result.updated}</strong> updated.
                <div style={muted}>No review was started and no due date set: each review starts when its file arrives.</div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {step === 'done' ? <button className="btn btn-primary" onClick={onClose}>Close</button> : (
            <>
              {step === 'preview' && <button className="btn btn-secondary" onClick={() => setStep('map')}>Back</button>}
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              {step === 'map' && <button className="btn btn-primary" disabled={!mappedCode} onClick={() => { setError(''); setStep('preview'); }}>Preview</button>}
              {step === 'preview' && (
                <button className="btn btn-primary" disabled={busy || !plan || plan.error || (plan.counts.new + plan.counts.updated === 0)} onClick={commit}>
                  Import {plan && !plan.error ? `${plan.counts.new} new, ${plan.counts.updated} updated` : ''}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, closed = false }) {
  const [open, setOpen] = useState(!closed);
  return (
    <div style={{ marginBottom: 12 }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>
        {open ? '▾' : '▸'} {title}
      </div>
      {open && <div className="table-wrapper" style={{ maxHeight: '32vh', overflowY: 'auto' }}>{children}</div>}
    </div>
  );
}
