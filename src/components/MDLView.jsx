import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../AppContext';
import { FileSpreadsheet, Download, Upload, Flag, Trash2, FileUp, CheckCircle, Clock, AlertCircle, X, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const STATUS_META = {
  IFR: { label: 'IFR', color: '#818cf8' },
  IFA: { label: 'IFA', color: '#fbbf24' },
  AFC: { label: 'AFC', color: '#34d399' },
  Superseded: { label: 'Sup', color: '#64748b' },
};

const DISCIPLINE_COLORS = {
  'Electrical': '#6366f1', 'Civil': '#f59e0b',
  'Mechanical': '#10b981', 'SCADA & Telecom': '#06b6d4',
  'Protection & Control': '#8b5cf6', 'Structural': '#ec4899',
};

export function MDLView({ projectId }) {
  const { drawings, projects, DISCIPLINES, STATUSES, updateDrawing, deleteDrawing, uploadRevision, addLog } = useContext(AppContext);

  const project = projects.find(p => p.id === projectId);
  const projectDrawings = drawings.filter(d => d.projectId === projectId);

  const [contextMenu, setContextMenu] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDisc, setFilterDisc] = useState('all');
  const uploadRefs = useRef({});
  const sheetRef = useRef(null);

  // Close context menu
  React.useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const filtered = projectDrawings.filter(d => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (filterDisc !== 'all' && d.discipline !== filterDisc) return false;
    return true;
  });

  // Handle direct PDF revision upload
  const handlePdfRevision = async (e, drawingId) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    try {
      // Use native FileReader for DataURL (fast & doesn't crash)
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsDataURL(file);
      });

      // Use native FileReader for ArrayBuffer
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsArrayBuffer(file);
      });
      const uint8 = new Uint8Array(arrayBuffer);

      // Try text extraction
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

      if (Object.keys(updates).length > 0) {
        updateDrawing(drawingId, updates);
      }

      uploadRevision(drawingId, 'Revision uploaded via MDL', dataUrl, null);
    } catch (err) {
      console.error('MDL PDF parse error:', err);
      // Fallback
      const reader = new FileReader();
      reader.onload = (evt) => {
        uploadRevision(drawingId, 'Revision uploaded via MDL', evt.target.result, null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const rows = projectDrawings.map(d => ({
      'Drawing Code': d.code,
      'Title': d.title,
      'Discipline': d.discipline,
      'Sub-type': d.subType || '',
      'Current Revision': d.currentVersion,
      'Status': d.status,
      'Revisions': d.versions?.length || 1,
      'Last Updated': d.versions?.[0]?.date?.substring(0,10) || '',
      'Last Author': d.versions?.[0]?.author || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MDL');
    XLSX.writeFile(wb, `${project?.code || 'Project'}_MDL.xlsx`);
  };

  // Download blank template
  const handleTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Drawing Code', 'Title', 'Discipline', 'Sub-type'],
      ['PROJ-E-SLD-001', 'Single Line Diagram', 'Electrical', 'SLD'],
      ['PROJ-C-LAY-001', 'Site Layout Plan', 'Civil', 'Layout'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MDL Template');
    XLSX.writeFile(wb, 'Tranzenergy_MDL_Template.xlsx');
  };

  // Context menu actions
  const handleSetStatus = (drawingId, status) => {
    updateDrawing(drawingId, { status });
    setContextMenu(null);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* MDL Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} style={{ color: 'var(--primary-light)' }} />
            Master Document List
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {project?.name} · {projectDrawings.length} drawing{projectDrawings.length !== 1 ? 's' : ''} registered
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Filters */}
          <select className="form-input" style={{ padding: '5px 8px', fontSize: '12px', width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-input" style={{ padding: '5px 8px', fontSize: '12px', width: 'auto' }} value={filterDisc} onChange={e => setFilterDisc(e.target.value)}>
            <option value="all">All Disciplines</option>
            {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={handleTemplate}>
            <Download size={13} />Template
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportExcel}>
            <Download size={13} />Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><FileSpreadsheet size={40} /></div>
            <div className="empty-state-title">No drawings registered</div>
            <div className="empty-state-desc">Register drawings from the "Register Drawing" button in the project header.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}></th>
                  <th>Drawing Code</th>
                  <th>Title</th>
                  <th>Discipline</th>
                  <th style={{ textAlign: 'center' }}>Rev</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Revisions</th>
                  <th>Last Updated</th>
                  <th>Author</th>
                  <th style={{ textAlign: 'right', width: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(dwg => {
                  const revCount = dwg.versions?.length || 1;
                  const lastUpdate = dwg.versions?.[0]?.date?.substring(0, 10) || '—';
                  const lastAuthor = dwg.versions?.[0]?.author || '—';
                  const sm = STATUS_META[dwg.status] || STATUS_META.IFR;
                  const discColor = DISCIPLINE_COLORS[dwg.discipline] || '#6366f1';

                  return (
                    <tr
                      key={dwg.id}
                      style={{ cursor: 'context-menu' }}
                      onContextMenu={e => {
                        e.preventDefault();
                        setContextMenu({ x: e.clientX, y: e.clientY, drawingId: dwg.id, title: dwg.title, status: dwg.status });
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        {dwg.isFlagged ? (
                          <Flag size={13} fill="#f59e0b" color="#f59e0b" />
                        ) : null}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
                          {dwg.code}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{dwg.title}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: discColor, display: 'inline-block', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px' }}>{dwg.discipline}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="rev-badge">{dwg.currentVersion}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '12px', color: sm.color }}>{sm.label}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary-light)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                          {revCount}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{lastUpdate}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{lastAuthor}</td>
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
                            title="Upload revision PDF"
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
                    </tr>
                  );
                })}
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
          <div className="ctx-label" style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 500, textTransform: 'none', paddingTop: 0 }}>
            Set Status
          </div>
          {['IFR', 'IFA', 'AFC', 'Superseded'].map(s => (
            <div
              key={s}
              className="ctx-item"
              style={{ fontWeight: contextMenu.status === s ? 700 : 400, color: STATUS_META[s].color }}
              onClick={() => handleSetStatus(contextMenu.drawingId, s)}
            >
              {contextMenu.status === s ? '✓ ' : '  '}{s}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {s === 'IFR' ? 'For Review' : s === 'IFA' ? 'For Approval' : s === 'AFC' ? 'Approved' : 'Superseded'}
              </span>
            </div>
          ))}
          <div className="ctx-divider" />
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
    </div>
  );
}
