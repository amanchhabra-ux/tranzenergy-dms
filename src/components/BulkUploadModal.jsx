import React, { useContext, useRef, useState } from 'react';
import { AppContext } from '../AppContext';
import { X, Upload, FolderUp, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { uploadFile } from '../utils/uploadFile';
import { classifyDrawing, extractDrawingInfo, OTHER_CATEGORY } from '../utils/drawingClassifier';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

const CONCURRENCY = 3;
const MAX_FILE_MB = 100;

const CONF_COLOR = { high: 'var(--success)', medium: 'var(--warning)', low: 'var(--text-muted)' };

async function readFirstPageText(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buf), disableStream: true, disableRange: true, disableAutoFetch: true,
  }).promise;
  try {
    const pg = await doc.getPage(1);
    const ct = await pg.getTextContent();
    return ct.items.map(x => x.str).join(' ');
  } finally {
    doc.destroy();
  }
}

export function BulkUploadModal({ project, onClose, onDone }) {
  const {
    DISCIPLINES, STATUSES, drawings, createDrawing, uploadRevision, addDiscipline, addLog,
  } = useContext(AppContext);

  const [rows, setRows] = useState([]);           // one row per file
  const [analyzing, setAnalyzing] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState('IFA');
  const [filterCat, setFilterCat] = useState('all');
  const fileRef = useRef(null);
  const folderRef = useRef(null);

  const categories = DISCIPLINES.includes(OTHER_CATEGORY) ? DISCIPLINES : [...DISCIPLINES, OTHER_CATEGORY];
  const existingByCode = new Map(
    drawings.filter(d => d.projectId === project.id).map(d => [d.code.toUpperCase(), d])
  );

  const updateRow = (id, patch) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  // ── Add + analyse files ────────────────────────────────────────────────
  const addFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    const pdfs = incoming.filter(f => f.name.toLowerCase().endsWith('.pdf'));
    const skipped = incoming.length - pdfs.length;
    if (!pdfs.length) {
      if (skipped) alert(`${skipped} file(s) skipped — only PDF drawings can be bulk uploaded.`);
      return;
    }

    const seen = new Set(rows.map(r => `${r.file.name}|${r.file.size}`));
    const fresh = pdfs
      .filter(f => !seen.has(`${f.name}|${f.size}`))
      .map((file, i) => ({
        id: `bu-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        folder: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/'),
        code: '', title: '', rev: '', category: OTHER_CATEGORY,
        confidence: 'low', reason: '', status: 'pending', message: '',
        include: file.size <= MAX_FILE_MB * 1024 * 1024,
      }));
    if (!fresh.length) return;
    setRows(prev => [...prev, ...fresh]);
    setAnalyzing(true);

    for (const row of fresh) {
      if (!row.include) {
        updateRow(row.id, { status: 'error', message: `Larger than ${MAX_FILE_MB} MB` });
        continue;
      }
      updateRow(row.id, { status: 'analyzing' });
      let text = '';
      try { text = await readFirstPageText(row.file); } catch (e) { console.warn('PDF read failed', row.file.name, e); }
      const info = extractDrawingInfo(row.file.name, text);
      // folder names like ".../Electrical/..." are a strong hint too
      const cls = classifyDrawing({
        code: info.code, fileName: `${row.folder} ${row.file.name}`, title: info.title, text, categories,
      });
      updateRow(row.id, {
        code: info.code, title: info.title, rev: info.rev,
        category: cls.category, confidence: cls.confidence, reason: cls.reason,
        status: 'ready',
      });
    }
    setAnalyzing(false);
    if (skipped) alert(`${skipped} non-PDF file(s) were skipped.`);
  };

  // ── Upload everything ──────────────────────────────────────────────────
  const handleUploadAll = async () => {
    // Make sure "Other" exists as a real category if anything is going there
    if (rows.some(r => r.include && r.category === OTHER_CATEGORY) && !DISCIPLINES.includes(OTHER_CATEGORY)) {
      addDiscipline(OTHER_CATEGORY);
    }
    setRunning(true);
    const queue = rows.filter(r => r.include && r.status === 'ready');
    const createdByCode = new Map(); // drawings created in this batch, by code
    let ok = 0, fail = 0;

    const worker = async () => {
      while (queue.length) {
        const row = queue.shift();
        const code = row.code.trim().toUpperCase();
        if (!code) { updateRow(row.id, { status: 'error', message: 'Drawing number missing' }); fail++; continue; }
        updateRow(row.id, { status: 'uploading', message: '' });
        try {
          const safeName = row.file.name.replace(/[^\w.\-() ]+/g, '_');
          const blob = await uploadFile(
            `drawings/${code.replace(/[^\w.-]+/g, '_')}/${Date.now()}_${safeName}`,
            row.file
          );
          const existing = existingByCode.get(code) || createdByCode.get(code);
          if (existing) {
            uploadRevision(existing.id, `Bulk upload: ${row.file.name}`, blob.url, defaultStatus);
            updateRow(row.id, { status: 'done', message: 'Added as new revision' });
          } else {
            const dwg = createDrawing({
              code, title: row.title.trim() || code, discipline: row.category,
              projectId: project.id, status: defaultStatus, pdfData: blob.url,
              initialVersion: row.rev || 'R0', changeSummary: `Initial issue (bulk upload: ${row.file.name}).`,
            });
            if (dwg) createdByCode.set(code, dwg);
            updateRow(row.id, { status: 'done', message: `Registered in ${row.category}` });
          }
          ok++;
        } catch (err) {
          console.error('Bulk upload failed', row.file.name, err);
          updateRow(row.id, { status: 'error', message: err?.message || 'Upload failed' });
          fail++;
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    addLog(`Bulk upload to <strong>${project.code}</strong>: ${ok} drawing(s) uploaded${fail ? `, ${fail} failed` : ''}.`);
    setRunning(false);
    setFinished(true);
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const included = rows.filter(r => r.include && r.status === 'ready');
  const countsByCat = categories
    .map(c => [c, rows.filter(r => r.include && r.category === c).length])
    .filter(([, n]) => n > 0);
  const done = rows.filter(r => r.status === 'done').length;
  const errors = rows.filter(r => r.status === 'error').length;
  const visibleRows = filterCat === 'all' ? rows : rows.filter(r => r.category === filterCat);
  const batchCodes = rows.filter(r => r.include).map(r => r.code.trim().toUpperCase());
  const dupInBatch = (code) => batchCodes.filter(c => c === code.trim().toUpperCase()).length > 1;
  const locked = running || finished;

  const setAllCategory = (cat) => setRows(prev => prev.map(r =>
    (filterCat === 'all' || r.category === filterCat) && r.status === 'ready' ? { ...r, category: cat, confidence: 'high', reason: 'Set manually' } : r
  ));

  return (
    <div className="modal-overlay">
      <div className="modal modal-xl" style={{ maxWidth: '1100px' }}>
        <div className="modal-header">
          <span className="modal-title">Bulk Upload Drawings — {project.code}</span>
          <button className="modal-close" onClick={onClose} disabled={running}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {!locked && (
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              style={{ padding: '22px', marginBottom: '14px' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            >
              <input ref={fileRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
              <input ref={folderRef} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }}
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
              <Upload size={26} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Drop PDF drawings here, or click to choose files</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Each file is read and sorted into Electrical, Civil, Structural, Mechanical, SCADA, P&C or Other automatically. You can change any category before uploading.
              </div>
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: '10px' }}
                onClick={e => { e.stopPropagation(); folderRef.current?.click(); }}>
                <FolderUp size={13} /><span>Choose a whole folder</span>
              </button>
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* Summary + bulk controls */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <span className={`badge ${filterCat === 'all' ? 'badge-primary' : 'badge-muted'}`} style={{ cursor: 'pointer' }} onClick={() => setFilterCat('all')}>
                  All · {rows.length}
                </span>
                {countsByCat.map(([c, n]) => (
                  <span key={c} className={`badge ${filterCat === c ? 'badge-primary' : 'badge-muted'}`} style={{ cursor: 'pointer' }} onClick={() => setFilterCat(c)}>
                    {c} · {n}
                  </span>
                ))}
                <div style={{ flex: 1 }} />
                {!locked && (
                  <>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Set {filterCat === 'all' ? 'all' : 'these'} to</label>
                    <select className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} value="" onChange={e => e.target.value && setAllCategory(e.target.value)}>
                      <option value="">— category —</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>Status</label>
                    <select className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }} value={defaultStatus} onChange={e => setDefaultStatus(e.target.value)}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </>
                )}
              </div>

              {(running || finished) && (
                <div style={{ marginBottom: '10px' }}>
                  <div className="progress-bar-track" style={{ height: 6 }}>
                    <div className="progress-bar-fill" style={{ width: `${((done + errors) / Math.max(1, rows.filter(r => r.include).length)) * 100}%`, background: errors ? 'var(--warning)' : 'var(--success)' }} />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {done} uploaded{errors ? ` · ${errors} failed` : ''}
                  </div>
                </div>
              )}

              <div className="table-wrapper" style={{ maxHeight: '48vh', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}></th>
                      <th>File</th>
                      <th>Drawing No.</th>
                      <th>Title</th>
                      <th style={{ width: 60 }}>Rev</th>
                      <th style={{ width: 190 }}>Category</th>
                      <th style={{ width: 150 }}>Status</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(r => {
                      const exists = existingByCode.has(r.code.trim().toUpperCase());
                      const dup = dupInBatch(r.code);
                      const editable = !locked && r.status === 'ready';
                      return (
                        <tr key={r.id} style={{ opacity: r.include ? 1 : 0.45 }}>
                          <td>
                            <input type="checkbox" checked={r.include} disabled={!editable && r.status !== 'error'}
                              onChange={e => updateRow(r.id, { include: e.target.checked })} />
                          </td>
                          <td style={{ maxWidth: 200 }}>
                            <div className="truncate" title={r.file.name} style={{ fontSize: '12px' }}>{r.file.name}</div>
                            {r.folder && <div className="truncate" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.folder}</div>}
                          </td>
                          <td>
                            <input className="form-input" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '4px 6px' }}
                              value={r.code} disabled={!editable}
                              onChange={e => updateRow(r.id, { code: e.target.value.toUpperCase() })} />
                            {(exists || dup) && r.status !== 'done' && (
                              <div style={{ fontSize: '10px', color: 'var(--warning)', marginTop: 2 }}>
                                {exists ? 'Exists — will add a revision' : 'Repeated in this batch — later ones become revisions'}
                              </div>
                            )}
                          </td>
                          <td>
                            <input className="form-input" style={{ fontSize: '12px', padding: '4px 6px' }}
                              value={r.title} disabled={!editable}
                              onChange={e => updateRow(r.id, { title: e.target.value })} />
                          </td>
                          <td>
                            <input className="form-input" style={{ fontSize: '12px', padding: '4px 6px', fontFamily: 'var(--font-mono)' }}
                              value={r.rev} placeholder="R0" disabled={!editable}
                              onChange={e => updateRow(r.id, { rev: e.target.value.toUpperCase() })} />
                          </td>
                          <td>
                            <select className="form-input" style={{ fontSize: '12px', padding: '4px 6px' }}
                              value={r.category} disabled={!editable}
                              onChange={e => updateRow(r.id, { category: e.target.value, confidence: 'high', reason: 'Set manually' })}>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {r.status === 'ready' && (
                              <div style={{ fontSize: '10px', color: CONF_COLOR[r.confidence], marginTop: 2 }} title={r.reason}>
                                {r.confidence === 'low' ? 'Please check' : `${r.confidence} confidence`}{r.reason ? ` · ${r.reason}` : ''}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: '12px' }}>
                            {r.status === 'analyzing' && <span style={{ color: 'var(--text-muted)', display: 'flex', gap: 4, alignItems: 'center' }}><Loader2 size={12} className="spin" /> Reading…</span>}
                            {r.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>Queued</span>}
                            {r.status === 'ready' && <span style={{ color: 'var(--text-muted)' }}>Ready</span>}
                            {r.status === 'uploading' && <span style={{ color: 'var(--primary-light)', display: 'flex', gap: 4, alignItems: 'center' }}><Loader2 size={12} className="spin" /> Uploading…</span>}
                            {r.status === 'done' && <span style={{ color: 'var(--success)', display: 'flex', gap: 4, alignItems: 'center' }}><CheckCircle2 size={12} /> {r.message}</span>}
                            {r.status === 'error' && <span style={{ color: 'var(--error)', display: 'flex', gap: 4, alignItems: 'center' }} title={r.message}><AlertCircle size={12} /> {r.message}</span>}
                          </td>
                          <td>
                            {!locked && (
                              <button className="btn btn-ghost btn-icon" title="Remove" style={{ padding: 2 }}
                                onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))}>
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
            </>
          )}
        </div>

        <div className="modal-footer">
          {finished ? (
            <button className="btn btn-primary" onClick={() => onDone?.()}>Close</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose} disabled={running}>Cancel</button>
              <button className="btn btn-primary" onClick={handleUploadAll} disabled={running || analyzing || included.length === 0}>
                {running
                  ? <><div className="spinner" style={{ width: 14, height: 14 }} /><span>Uploading…</span></>
                  : analyzing
                    ? <span>Reading files…</span>
                    : <><Upload size={14} /><span>Upload {included.length} drawing{included.length === 1 ? '' : 's'}</span></>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
