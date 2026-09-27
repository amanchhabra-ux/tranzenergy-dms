import React, { useContext, useState, useRef, useMemo } from 'react';
import { AppContext } from '../AppContext';
import { FileSpreadsheet, Download, Upload, Flag, Trash2, FileUp, Columns3, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { uploadFile } from '../utils/uploadFile';
import { isExternal } from '../utils/workflow';
import { mdlColumns, cellValue, compareCells, normValue, PRIORITY_COLORS } from '../utils/mdl';
import { exportWorkbook, templateWorkbook } from '../utils/mdlImport';
import { MdlColumnsSettings } from './MdlColumnsSettings';
import { MdlImportModal } from './MdlImportModal';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

const DISCIPLINE_COLORS = {
  'Electrical': '#3f7d3a', 'Civil': '#a16207',
  'Mechanical': '#0f766e', 'SCADA & Telecom': '#0369a1',
  'Protection & Control': '#7c3aed', 'Structural': '#be185d',
};

const fileSafe = (s) => String(s || 'Project').replace(/[^\w.-]+/g, '_');

export function MDLView({ projectId }) {
  const { drawings, projects, DISCIPLINES, updateDrawing, deleteDrawing, uploadRevision, canDo, currentUser } = useContext(AppContext);

  const project = projects.find(p => p.id === projectId);
  const projectDrawings = useMemo(() => drawings.filter(d => d.projectId === projectId), [drawings, projectId]);
  const columns = useMemo(() => mdlColumns(project), [project]);
  const shown = columns.filter(c => c.visible !== false);
  const listCols = shown.filter(c => c.type === 'list');

  const [contextMenu, setContextMenu] = useState(null);
  const [filters, setFilters] = useState({});            // column key → value ('' = all)
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [query, setQuery] = useState('');
  const [showColumns, setShowColumns] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const uploadRefs = useRef({});
  const canImport = canDo('upload') && !isExternal(currentUser);

  // Close context menu
  React.useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projectDrawings.filter(d => {
      for (const [key, v] of Object.entries(filters)) {
        if (!v) continue;
        const c = columns.find(x => x.key === key);
        if (!c) continue;
        const cell = String(cellValue(c, d, project));
        if (v === '(blank)' ? cell !== '' : normValue(cell) !== normValue(v)) return false;
      }
      return !q || String(d.code).toLowerCase().includes(q) || String(d.title).toLowerCase().includes(q);
    });
    const c = sort.key && columns.find(x => x.key === sort.key);
    if (c) list = [...list].sort((a, b) => sort.dir * compareCells(c, a, b, project));
    return list;
  }, [projectDrawings, filters, sort, query, columns, project]);

  const expectedCount = projectDrawings.filter(d => d.expected).length;
  const optionsOf = (c) => {
    const base = c.key === 'discipline' ? DISCIPLINES : (c.options || []);
    const seen = new Set(base.map(normValue));
    const extra = [...new Set(projectDrawings.map(d => String(cellValue(c, d, project))).filter(v => v && !seen.has(normValue(v))))];
    return [...base, ...extra];
  };

  // Upload a PDF on a row: an expected record takes the revision given (R0 by default)
  const handlePdfRevision = async (e, drawingId) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const dwg = projectDrawings.find(d => d.id === drawingId);
    if (!dwg) return;
    let version;
    if (dwg.expected) {
      version = window.prompt(`Revision of this file for ${dwg.code}`, 'R0');
      if (version === null) return;
    }

    let url;
    try {
      const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
      url = (await uploadFile(`drawings/${String(dwg.code).replace(/[^\w.-]+/g, '_')}/${Date.now()}_${safeName}`, file)).url;
    } catch (err) {
      console.error('MDL upload failed:', err);
      alert('⚠️ Upload failed: ' + err.message);
      return;
    }

    // a received drawing: fill its title block fields from the PDF text (the MDL number stays as listed)
    if (!dwg.expected) {
      try {
        const uint8 = new Uint8Array(await file.arrayBuffer());
        const pdfDoc = await pdfjsLib.getDocument({
          data: uint8.slice(),
          disableStream: true,
          disableRange: true,
          disableAutoFetch: true
        }).promise;
        let fullText = '';
        for (let i = 1; i <= Math.min(pdfDoc.numPages, 3); i++) {
          const pg = await pdfDoc.getPage(i);
          const ct = await pg.getTextContent();
          fullText += ct.items.map(x => x.str).join(' ') + '\n';
        }
        // Drawing number
        const dwgNoPatterns = [
          /(?:DRG[\s.\-]?NO|DWG[\s.\-]?NO|DOC[\s.\-]?NO|DRAWING[\s\-]?NO)[\s.:–\-]*\s*([A-Z0-9\-\/\._]{5,30})/i,
          /(?:DOC(?:UMENT)?\s*(?:NO|NUMBER|#))[\s.:–\-]*\s*([A-Z0-9\-\/\._]{5,30})/i,
          // Code followed by explicit labels (e.g. "4610-171-001-PVC-C-00 NTPC Doc./Dwg. No.-")
          /([A-Z0-9\-\/\._]{5,30})\s*(?:NTPC\s*)?(?:Doc\s*[\/.]\s*)?(?:Drg|Dwg|Doc|Drawing)\s*[\/.]?\s*(?:No|Num|#)/i,
          // Generic code pattern: segments of alphanumeric chars separated strictly by dashes, slashes, or underscores (NO spaces, first segment can be 1 char, e.g. E-SLD-001)
          /\b([A-Z0-9]{1,10}(?:[-/_][A-Z0-9]{1,10}){2,6})\b/i,
          /\b([A-Z]{1,4}-[A-Z0-9]{2,8}-\d{2,4})\b/i,
        ];
        const isCommonWord = (word) => {
          const w = word.toUpperCase();
          return w.includes('LIMITED') || w.includes('COMPANY') || w.includes('PROJECT') || 
                 w.includes('TITLE') || w.includes('OWNER') || w.includes('EPC') || 
                 w.includes('CONSULTANT') || w.includes('DRAWING') || w.includes('REFERENCE');
        };
        const isDate = (word) => {
          return /^\d{2}[-.\/]\d{2}[-.\/]\d{4}$/.test(word) || /^\d{4}[-.\/]\d{2}[-.\/]\d{2}$/.test(word);
        };

        let extractedCode = '';
        for (const pat of dwgNoPatterns) {
          const matches = fullText.matchAll(new RegExp(pat.source, pat.flags + 'g'));
          for (const m of matches) {
            const val = m[1]?.trim();
            if (val && val.length >= 5 && (val.includes('-') || val.includes('/') || val.includes('_')) && !isCommonWord(val) && !isDate(val)) {
              extractedCode = val.toUpperCase();
              break;
            }
          }
          if (extractedCode) break;
        }

        // Title
        const titlePatterns = [
          // Match TITLE followed by anything, stopping at common keywords like Owner, EPC, NTPC, Rev, Scale, Drg, etc.
          /TITLE\s*:\s*(.*?)(?=\b(?:Owner|Client|EPC|Contractor|Consultant|DRG|DWG|DRAWING|NTPC|SCALE|DATE|REV|STATUS|SHEET|PAGE|Stamp|REFERENCE)\b|$)/i,
          /(?:DRAWING\s*TITLE|TITLE\s*OF\s*DRAWING|SHEET\s*TITLE)[\s.:–\-]+(.*?)(?=\b(?:Owner|Client|EPC|Contractor|Consultant|DRG|DWG|DRAWING|NTPC|SCALE|DATE|REV|STATUS|SHEET|PAGE|Stamp|REFERENCE)\b|$)/i,
        ];
        let extractedTitle = '';
        for (const pat of titlePatterns) {
          const m = fullText.match(pat);
          if (m?.[1]) {
            let cleaned = m[1].trim();
            if (cleaned && !cleaned.toUpperCase().includes('DRAWING NOS') && !cleaned.toUpperCase().includes('REFERENCE DRAWINGS')) {
              cleaned = cleaned.replace(/\s+[A-Z0-9]{2,10}(?:[-/_][A-Z0-9]{1,10}){2,6}\s*$/i, '');
              cleaned = cleaned.replace(/\s+\d+-\d+.*$/, '');
              cleaned = cleaned.trim();
              extractedTitle = cleaned;
              break;
            }
          }
        }

        // Metadata
        const clientPattern = /Owner\s*:\s*(.*?)(?:\(|Engineering|Division|EPC|Consultant|TITLE|\n|$)/i;
        const clientMatch = fullText.match(clientPattern);
        const extractedClient = clientMatch?.[1]?.trim() || '';

        const contractorPattern = /(?:EPC\s*Contractor|Contractor|EPC)\s*:\s*(.*?)(?:Unit|Sector|Delhi|Consultant|Owner|TITLE|\n|$)/i;
        const contractorMatch = fullText.match(contractorPattern);
        const extractedContractor = contractorMatch?.[1]?.trim() || '';

        const consultantPattern = /Consultant\s*:\s*(.*?)(?:Director|Office|Owner|EPC|TITLE|\n|$)/i;
        const consultantMatch = fullText.match(consultantPattern);
        const extractedConsultant = consultantMatch?.[1]?.trim() || '';

        // Update basic fields if extracted
        const updates = {};
        if (extractedCode) updates.code = extractedCode;
        if (extractedTitle) updates.title = extractedTitle;
        if (extractedClient) updates.clientName = extractedClient;
        if (extractedConsultant) updates.consultant = extractedConsultant;
        if (extractedContractor) updates.contractor = extractedContractor;
        if (Object.keys(updates).length > 0) updateDrawing(drawingId, updates);
      } catch (err) {
        console.error('MDL PDF parse error:', err);
      }
    }

    uploadRevision(drawingId, dwg.expected ? 'First issue uploaded via MDL' : 'Revision uploaded via MDL', url, null, { version });
  };

  const handleExportExcel = () => XLSX.writeFile(exportWorkbook(project, projectDrawings), `${fileSafe(project?.code)}_MDL.xlsx`);
  const handleTemplate = () => XLSX.writeFile(templateWorkbook(project), `${fileSafe(project?.code)}_MDL_Template.xlsx`);
  const toggleSort = (key) => setSort(s => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }) : { key, dir: 1 }));

  const renderCell = (c, dwg) => {
    const v = cellValue(c, dwg, project);
    if (c.key === 'code') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {dwg.isFlagged && <Flag size={12} fill="#f59e0b" color="#f59e0b" />}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{v}</span>
      </span>
    );
    if (c.key === 'discipline') return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: DISCIPLINE_COLORS[v] || '#a1a1aa', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontSize: '12px' }}>{v}</span>
      </span>
    );
    if (c.derive === 'stage' && dwg.expected) return <span className="stage-chip s-expected">Expected</span>;
    if (c.derive === 'revision') return dwg.expected ? <span className="stage-chip s-expected">Expected</span> : <span className="rev-badge">{v}</span>;
    if (c.key === 'priority' && PRIORITY_COLORS[normValue(v)]) {
      const p = PRIORITY_COLORS[normValue(v)];
      return <span className="stage-chip" style={{ background: p.bg, color: p.fg, borderColor: p.border }}>{v}</span>;
    }
    if (c.key === 'title') return <span style={{ fontWeight: 500 }}>{v}</span>;
    return <span style={{ fontSize: '12px', color: c.source === 'workflow' ? 'var(--text-secondary)' : undefined }}>{String(v)}</span>;
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* MDL Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} style={{ color: 'var(--primary-light)' }} />
            Master Document List
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {project?.name} · {projectDrawings.length} document{projectDrawings.length !== 1 ? 's' : ''}
            {expectedCount ? ` · ${projectDrawings.length - expectedCount} received · ${expectedCount} expected` : ''}
            {rows.length !== projectDrawings.length ? ` · ${rows.length} shown` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {canDo('manage_projects') && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowColumns(true)} title="Columns of this project's MDL">
              <Columns3 size={13} />Columns
            </button>
          )}
          {canImport && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)} title="Import the MDL from Excel">
              <Upload size={13} />Import
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleTemplate} title="Blank workbook with this project's columns">
            <Download size={13} />Template
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportExcel} title="One sheet per Area, same columns as the table">
            <Download size={13} />Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <div className="search-box" style={{ width: 220 }}>
          <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input className="search-input" placeholder="Number or title…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {listCols.map(c => (
          <select key={c.key} className="form-input" style={{ padding: '4px 8px', fontSize: '12px', width: 'auto', maxWidth: 190 }}
            value={filters[c.key] || ''} onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))}>
            <option value="">{c.label}: all</option>
            {optionsOf(c).map(o => <option key={o} value={o}>{o}</option>)}
            <option value="(blank)">{c.label}: blank</option>
          </select>
        ))}
        {(Object.values(filters).some(Boolean) || query) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({}); setQuery(''); }}><X size={12} /> Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {projectDrawings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FileSpreadsheet size={40} /></div>
            <div className="empty-state-title">No documents yet</div>
            <div className="empty-state-desc">Import the MDL from Excel, or register drawings from the project header.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table" style={{ tableLayout: 'auto' }}>
              <thead>
                <tr>
                  {shown.map(c => (
                    <th key={c.key} style={{ minWidth: c.width, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleSort(c.key)} title={`Sort by ${c.label}`}>
                      {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  {canDo('upload') && <th style={{ textAlign: 'right', width: '80px' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(dwg => (
                  <tr
                    key={dwg.id}
                    style={{ cursor: canDo('upload') ? 'context-menu' : 'default' }}
                    onContextMenu={e => {
                      if (!canDo('upload')) return;
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, drawingId: dwg.id, title: dwg.title });
                    }}
                  >
                    {shown.map(c => <td key={c.key} style={{ minWidth: c.width }}>{renderCell(c, dwg)}</td>)}
                    {canDo('upload') && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <input
                            ref={el => uploadRefs.current[dwg.id] = el}
                            type="file"
                            accept=".pdf"
                            style={{ display: 'none' }}
                            onChange={e => handlePdfRevision(e, dwg.id)}
                          />
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            style={{ color: 'var(--primary-light)' }}
                            title={dwg.expected ? 'Upload the first issue (PDF)' : 'Upload revision PDF'}
                            onClick={() => uploadRefs.current[dwg.id]?.click()}
                          >
                            <FileUp size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            style={{ color: 'var(--error)' }}
                            title="Delete drawing"
                            onClick={() => { if (window.confirm(`Delete "${dwg.title}"?`)) deleteDrawing(dwg.id); }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="ctx-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="ctx-label">{contextMenu.title?.slice(0, 30)}</div>
          <div
            className="ctx-item"
            onClick={() => { updateDrawing(contextMenu.drawingId, { isFlagged: true }); setContextMenu(null); }}
          >
            <Flag size={13} /> Flag for review
          </div>
          <div className="ctx-divider" />
          <div
            className="ctx-item danger"
            onClick={() => {
              if (window.confirm(`Delete "${contextMenu.title}"?`)) {
                deleteDrawing(contextMenu.drawingId);
              }
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} /> Delete drawing
          </div>
        </div>
      )}

      {showColumns && <MdlColumnsSettings project={project} drawings={projectDrawings} onClose={() => setShowColumns(false)} />}
      {showImport && <MdlImportModal project={project} drawings={projectDrawings} onClose={() => setShowImport(false)} />}
    </div>
  );
}
