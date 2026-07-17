import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../AppContext';
import { DrawingDetail } from './DrawingDetail';
import { MDLView } from './MDLView';
import { Plus, Search, Upload, X, FileCheck2, FolderInput } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { upload } from '@vercel/blob/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

const DISCIPLINE_COLORS = {
  'Electrical':          '#6366f1',
  'Civil':               '#f59e0b',
  'Mechanical':          '#10b981',
  'SCADA & Telecom':     '#06b6d4',
  'Protection & Control':'#8b5cf6',
  'Structural':          '#ec4899',
};

const STATUS_COLORS = {
  IFR: 'var(--primary-light)',
  IFA: 'var(--warning)',
  AFC: 'var(--success)',
  Superseded: 'var(--text-muted)',
};

export function ProjectView({ projectId, onBack }) {
  const { projects, drawings, DISCIPLINES, STATUSES, createDrawing, canDo, moveDrawingToDiscipline, addDiscipline, currentUser } = useContext(AppContext);

  const project = projects.find(p => p.id === projectId);
  const projectDrawings = drawings.filter(d => d.projectId === projectId);

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDrawingId, setActiveDrawingId] = useState(projectDrawings[0]?.id || null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [movingDrawingId, setMovingDrawingId] = useState(null);

  const hasAccess = currentUser?.role === 'Admin' || project?.assignedUsers?.includes(currentUser?.id);

  if (!project || !hasAccess) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="empty-state-title">Project not found or Access Denied</div>
      </div>
    );
  }

  // Discipline tabs — always include all DISCIPLINES plus MDL
  const disciplineTabs = [
    { key: 'all', label: 'All Drawings' },
    ...DISCIPLINES.map(d => ({ key: d, label: d })),
    { key: 'mdl', label: 'MDL' },
  ];

  const filteredDrawings = projectDrawings.filter(d => {
    if (activeTab !== 'all' && activeTab !== 'mdl' && d.discipline !== activeTab) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return d.code.toLowerCase().includes(q) || d.title.toLowerCase().includes(q);
  });

  const tabCount = (key) => {
    if (key === 'all') return projectDrawings.length;
    if (key === 'mdl') return null;
    return projectDrawings.filter(d => d.discipline === key).length;
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    addDiscipline(newCategoryName.trim());
    setActiveTab(newCategoryName.trim());
    setNewCategoryName('');
    setShowAddCategoryModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Project header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onBack} title="Back to dashboard">
            ←
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="page-header-title">{project.name}</div>
              <span className={`badge badge-${project.status === 'active' ? 'success' : 'muted'}`}>
                {project.status}
              </span>
            </div>
            <div className="page-header-sub">
              {project.client} · {project.location} · {project.code}
            </div>
          </div>
        </div>
        {canDo('upload') && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowRegisterModal(true)}>
            <Plus size={14} /><span>Register Drawing</span>
          </button>
        )}
      </div>

      {/* Discipline tabs */}
      <div className="tab-bar" style={{ display: 'flex', alignItems: 'center' }}>
        {disciplineTabs.map(tab => {
          const count = tabCount(tab.key);
          return (
            <div
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span>{tab.label}</span>
              {count !== null && count > 0 && (
                <span style={{
                  background: activeTab === tab.key ? 'var(--primary-glow)' : 'rgba(255,255,255,0.06)',
                  color: activeTab === tab.key ? 'var(--primary-light)' : 'var(--text-muted)',
                  fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px',
                }}>
                  {count}
                </span>
              )}
            </div>
          );
        })}
        {canDo('upload') && (
          <button
            className="btn btn-ghost btn-sm btn-icon"
            title="Add new category"
            onClick={() => setShowAddCategoryModal(true)}
            style={{ marginLeft: '4px', color: 'var(--text-muted)', flexShrink: 0 }}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Main workspace */}
      {activeTab === 'mdl' ? (
        <MDLView projectId={projectId} />
      ) : (
        <div className="workspace">
          {/* Drawing list sidebar */}
          {showSidebar && (
          <div className="drawing-list-panel">
            <div className="drawing-list-header">
              <div className="search-box">
                <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search drawings…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:0 }} onClick={() => setSearchQuery('')}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="drawing-list">
              {filteredDrawings.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 12px' }}>
                  <div className="empty-state-title" style={{ fontSize: '13px' }}>No drawings found</div>
                </div>
              ) : (
                filteredDrawings.map(dwg => (
                  <div
                    key={dwg.id}
                    className={`drawing-item ${activeDrawingId === dwg.id ? 'active' : ''}`}
                    style={{ position: 'relative' }}
                    onClick={() => { setActiveDrawingId(dwg.id); setMovingDrawingId(null); }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="drawing-item-code">{dwg.code}</div>
                      <div className="drawing-item-title truncate">{dwg.title}</div>
                      <div className="drawing-item-meta">
                        <span className="rev-badge">{dwg.currentVersion}</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: STATUS_COLORS[dwg.status] || 'var(--text-muted)' }}>
                          {dwg.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div
                        style={{
                          width: 3, height: 36, borderRadius: 2,
                          background: DISCIPLINE_COLORS[dwg.discipline] || '#6366f1',
                          opacity: 0.7
                        }}
                      />
                      {canDo('upload') && (
                        <button
                          className="btn btn-ghost btn-icon"
                          title="Move to category"
                          style={{ padding: '2px', opacity: 0.5, width: '20px', height: '20px' }}
                          onClick={(e) => { e.stopPropagation(); setMovingDrawingId(movingDrawingId === dwg.id ? null : dwg.id); }}
                        >
                          <FolderInput size={11} />
                        </button>
                      )}
                    </div>
                    {/* Move to dropdown */}
                    {movingDrawingId === dwg.id && (
                      <div
                        style={{
                          position: 'absolute', right: 0, top: '100%', zIndex: 50,
                          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                          borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                          minWidth: '180px', overflow: 'hidden',
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                          Move to category
                        </div>
                        {DISCIPLINES.filter(d => d !== dwg.discipline).map(d => (
                          <button
                            key={d}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '8px 14px', background: 'none', border: 'none',
                              color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer',
                            }}
                            onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => e.target.style.background = 'none'}
                            onClick={() => {
                              moveDrawingToDiscipline(dwg.id, d);
                              setMovingDrawingId(null);
                            }}
                          >
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: DISCIPLINE_COLORS[d] || '#6366f1', marginRight: 8 }} />
                            {d}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          )}

          {/* Drawing detail */}
          <DrawingDetail 
            drawingId={activeDrawingId} 
            showSidebar={showSidebar}
            onToggleSidebar={() => setShowSidebar(s => !s)}
          />
        </div>
      )}

      {/* Register drawing modal */}
      {showRegisterModal && (
        <RegisterDrawingModal
          project={project}
          DISCIPLINES={DISCIPLINES}
          STATUSES={STATUSES}
          onClose={() => setShowRegisterModal(false)}
          onCreated={(id) => { setActiveDrawingId(id); setActiveTab('all'); setShowRegisterModal(false); }}
          createDrawing={createDrawing}
        />
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '360px' }}>
            <div className="modal-header">
              <h2>Add New Category</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddCategoryModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <label className="form-label">Category Name</label>
              <input
                className="form-input"
                placeholder="e.g. Instrumentation, HVAC..."
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddCategoryModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>Add Category</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Register Drawing Modal ──────────────────────────────────────────────────
function RegisterDrawingModal({ project, DISCIPLINES, STATUSES, onClose, onCreated, createDrawing }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [discipline, setDiscipline] = useState('Electrical');
  const [subType, setSubType] = useState('');
  const [status, setStatus] = useState('IFA');
  const [clientName, setClientName] = useState('');
  const [consultant, setConsultant] = useState('');
  const [contractor, setContractor] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  const [parseMsg, setParseMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const pdfBufferRef = useRef(null);  // stores raw ArrayBuffer for reuse

  const inferCategory = (code) => {
    const c = (code || '').toUpperCase();
    if (c.includes('-E-') || c.startsWith('E-')) return 'Electrical';
    if (c.includes('-C-') || c.startsWith('C-')) return 'Civil';
    if (c.includes('-M-') || c.startsWith('M-')) return 'Mechanical';
    if (c.includes('-S-') || c.includes('-T-') || c.startsWith('S-')) return 'SCADA & Telecom';
    if (c.includes('-P-') || c.startsWith('P-')) return 'Protection & Control';
    return null;
  };

  const handleFile = (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) { alert('PDF files only.'); return; }
    setPdfFile(file);
    setParseMsg('');
    pdfBufferRef.current = null;

    // Use native FileReader for DataURL (fast & doesn't crash)
    const readerUrl = new FileReader();
    readerUrl.onload = e => setPdfDataUrl(e.target.result);
    readerUrl.readAsDataURL(file);

    // Use native FileReader for ArrayBuffer (fast & reliable across browsers)
    const readerBuf = new FileReader();
    readerBuf.onload = e => {
      pdfBufferRef.current = e.target.result;
    };
    readerBuf.readAsArrayBuffer(file);
  };

  const handleAutoPopulate = async () => {
    if (!pdfFile) { alert('Please upload a PDF first.'); return; }
    setParseMsg('⏳ Scanning PDF for drawing info…');

    try {
      // Get buffer — prefer stored ref, fallback to native FileReader
      let arrayBuffer = pdfBufferRef.current;
      if (!arrayBuffer) {
        arrayBuffer = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result);
          reader.onerror = e => reject(e);
          reader.readAsArrayBuffer(pdfFile);
        });
        pdfBufferRef.current = arrayBuffer;
      }

      if (!arrayBuffer) {
        setParseMsg('⚠️ Could not read PDF data. Try re-uploading the file.');
        return;
      }

      const uint8 = new Uint8Array(arrayBuffer);

      // ── 1. Parse from filename (best effort) ───────────────────────────
      const nameClean = pdfFile.name.replace(/\.pdf$/i, '');
      const nameParts = nameClean.split(/[_\s]+/);
      let fnCode  = nameParts[0]?.toUpperCase() || '';
      let fnTitle = nameParts.length > 1 ? nameParts.slice(1).join(' ').replace(/-/g, ' ') : '';

      // ── 2. Extract text from PDF pages ─────────────────────────────────
      const pdfDoc = await pdfjsLib.getDocument({
        data: uint8.slice(),   // pass a COPY so pdfjs can't invalidate our buffer
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

      console.log('[AutoPopulate] Extracted text length:', fullText.length);
      console.log('[AutoPopulate] First 500 chars:', fullText.substring(0, 500));

      // ── 3. Heuristic extraction with wider patterns ─────────────────────
      // Drawing number — common title block labels
      const dwgNoPatterns = [
        /(?:DRG[\s.\-]?NO|DWG[\s.\-]?NO|DOC[\s.\-]?NO|DRAWING[\s\-]?NO)[\s.:–\-]*\s*([A-Z0-9\-\/\._]{5,30})/i,
        /(?:DOC(?:UMENT)?\s*(?:NO|NUMBER|#))[\s.:–\-]*\s*([A-Z0-9\-\/\._]{5,30})/i,
        /([A-Z0-9\-\/\._]{5,30})\s*(?:NTPC\s*)?(?:Doc\s*[\/.]\s*)?(?:Drg|Dwg|Doc|Drawing)\s*[\/.]?\s*(?:No|Num|#)/i,
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
      for (let i = 0; i < dwgNoPatterns.length; i++) {
        const matches = fullText.matchAll(new RegExp(dwgNoPatterns[i].source, dwgNoPatterns[i].flags + 'g'));
        const matchArray = Array.from(matches);
        for (let j = 0; j < matchArray.length; j++) {
          const m = matchArray[j];
          const val = m[1] ? m[1].trim() : '';
          if (val && val.length >= 5 && (val.includes('-') || val.includes('/') || val.includes('_')) && !isCommonWord(val) && !isDate(val)) {
            extractedCode = val.toUpperCase();
            break;
          }
        }
        if (extractedCode) break;
      }

      // Title — common label forms
      const titlePatterns = [
        /TITLE\s*:\s*(.*?)(?=\b(?:Owner|Client|EPC|Contractor|Consultant|DRG|DWG|DRAWING|NTPC|SCALE|DATE|REV|STATUS|SHEET|PAGE|Stamp|REFERENCE)\b|$)/i,
        /(?:DRAWING\s*TITLE|TITLE\s*OF\s*DRAWING|SHEET\s*TITLE)[\s.:–\-]+(.*?)(?=\b(?:Owner|Client|EPC|Contractor|Consultant|DRG|DWG|DRAWING|NTPC|SCALE|DATE|REV|STATUS|SHEET|PAGE|Stamp|REFERENCE)\b|$)/i,
      ];
      let extractedTitle = '';
      for (let i = 0; i < titlePatterns.length; i++) {
        const m = fullText.match(titlePatterns[i]);
        if (m && m[1]) {
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

      // Revision
      const revPatterns = [
        /\bREV(?:ISION)?[\s.:–\-]*([A-Z0-9]{1,3})\b/i,
        /\b(R[0-9]{1,2})\b/,
        /\b(Rev\s*[0-9]{1,2})\b/i,
      ];
      let extractedRev = '';
      for (let i = 0; i < revPatterns.length; i++) {
        const m = fullText.match(revPatterns[i]);
        if (m && m[1]) { extractedRev = m[1].replace(/\s+/g, '').toUpperCase(); break; }
      }

      // Client / Owner Name
      const clientPattern = /(?:Owner|Client)\s*:\s*(.{1,80}?)(?:\s{2,}|\(|Engineering|Division|EPC|Contractor|Consultant|TITLE|PROJECT|\n|$)/i;
      const clientMatch = fullText.match(clientPattern);
      const extractedClient = (clientMatch && clientMatch[1]) ? clientMatch[1].trim() : '';

      // Contractor / EPC
      const contractorPattern = /(?:EPC\s*Contractor|Contractor|EPC)\s*:\s*(.{1,80}?)(?:\s{2,}|Unit|Sector|Delhi|Consultant|Owner|TITLE|PROJECT|\n|$)/i;
      const contractorMatch = fullText.match(contractorPattern);
      const extractedContractor = (contractorMatch && contractorMatch[1]) ? contractorMatch[1].trim() : '';

      // Consultant
      const consultantPattern = /Consultant\s*:\s*(.{1,80}?)(?:\s{2,}|Director|Office|Owner|EPC|TITLE|PROJECT|\n|$)/i;
      const consultantMatch = fullText.match(consultantPattern);
      const extractedConsultant = (consultantMatch && consultantMatch[1]) ? consultantMatch[1].trim() : '';

      // Project / Description
      const descPatterns = [
        /(?:PROJECT|DESCRIPTION|PROJECT\s*NAME)\s*:\s*(.{1,120}?)(?:\s{2,}|\b(?:Owner|Client|EPC|Contractor|Consultant|DRG|DWG|DRAWING|NTPC|SCALE|DATE|REV|STATUS|SHEET|PAGE|Stamp|REFERENCE|TITLE)\b|\n|$)/i,
      ];
      let extractedDesc = '';
      for (let i = 0; i < descPatterns.length; i++) {
        const m = fullText.match(descPatterns[i]);
        if (m && m[1]) {
          extractedDesc = String(m[1]).replace(/\s+/g, ' ').trim();
          break;
        }
      }

      // Apply values
      const finalCode  = extractedCode  || fnCode  || '';
      const finalTitle = extractedTitle || fnTitle || '';

      if (finalCode)  setCode(finalCode);
      if (finalTitle) setTitle(finalTitle);
      if (extractedClient) setClientName(extractedClient);
      if (extractedConsultant) setConsultant(extractedConsultant);
      if (extractedContractor) setContractor(extractedContractor);
      if (extractedDesc) setDesc(extractedDesc);

      // Infer discipline from code
      const inf = inferCategory(finalCode || fnCode);
      if (inf) setDiscipline(inf);

      // Build status message
      if (finalCode || finalTitle) {
        const parts = [];
        if (finalCode)   parts.push(`Code: ${finalCode}`);
        if (finalTitle)  parts.push(`Title: ${finalTitle.slice(0, 40)}`);
        if (extractedRev) parts.push(`Rev: ${extractedRev}`);
        if (extractedClient) parts.push(`Client: ${extractedClient}`);
        setParseMsg(`✓ Extracted — ${parts.join(' · ')}`);
      } else {
        setParseMsg(`📄 PDF parsed (${fullText.length} chars extracted). No drawing numbers or client details found in text layer.`);
      }

    } catch (err) {
      console.error('PDF parse error:', err);
      setParseMsg('⚠️ Could not populate: ' + (err.message || String(err)));
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;
    
    let uploadedUrl = null;
    if (pdfFile) {
      setParseMsg('⏳ Uploading file to Vercel Storage...');
      setUploading(true);
      try {
        const blobPath = `drawings/${code.trim().toUpperCase()}/${pdfFile.name}`;
        const blob = await upload(blobPath, pdfFile, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        });
        uploadedUrl = blob.url;
      } catch (err) {
        console.error(err);
        setParseMsg('⚠️ Upload failed: ' + err.message);
        setUploading(false);
        return;
      }
    } else {
      setUploading(true);
    }

    const dwg = createDrawing({
      code,
      title,
      description: desc,
      discipline,
      subType,
      projectId: project.id,
      status,
      pdfData: uploadedUrl || pdfDataUrl,
      clientName,
      consultant,
      contractor,
      changeSummary: 'Initial issue R0.'
    });
    setUploading(false);
    onCreated(dwg?.id || null);
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">Register New Drawing — {project.code}</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* PDF upload */}
            <div
              className={`drop-zone ${pdfFile ? 'has-file' : ''}`}
              style={{ marginBottom: '16px' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              {pdfFile ? (
                <div>
                  <FileCheck2 size={28} style={{ color: 'var(--success)', margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 700, color: 'var(--success)' }}>{pdfFile.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Click to replace</div>
                </div>
              ) : (
                <div>
                  <Upload size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Upload PDF Drawing</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Drawing info will be auto-extracted · Will be saved as R0</div>
                </div>
              )}
            </div>

            {pdfFile && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAutoPopulate}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', justifyContent: 'center', background: 'rgba(99,102,241,0.1)', color: 'var(--primary-light)', border: '1px solid rgba(99,102,241,0.3)', padding: '8px' }}
                >
                  🔍 Auto-Populate Details from PDF
                </button>
              </div>
            )}

            {parseMsg && (
              <div style={{ fontSize: '12px', padding: '8px 12px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--r-md)', color: 'var(--success)', marginBottom: '12px' }}>
                {parseMsg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Drawing Code *</label>
                <input className="form-input" style={{ fontFamily: 'var(--font-mono)' }} placeholder="e.g. BGTPS-E-SLD-001" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Discipline *</label>
                <select className="form-input" value={discipline} onChange={e => setDiscipline(e.target.value)}>
                  {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group mt-2">
              <label className="form-label">Drawing Title *</label>
              <input className="form-input" placeholder="Descriptive title of the drawing" value={title} onChange={e => setTitle(e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Sub-type</label>
                <input className="form-input" placeholder="SLD, Layout, Foundation…" value={subType} onChange={e => setSubType(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Initial Status</label>
                <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Client / Owner</label>
                <input className="form-input" placeholder="Owner Name" value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Contractor / EPC</label>
                <input className="form-input" placeholder="Contractor Name" value={contractor} onChange={e => setContractor(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Consultant</label>
                <input className="form-input" placeholder="Consultant Name" value={consultant} onChange={e => setConsultant(e.target.value)} />
              </div>
            </div>

            <div className="form-group mt-2" style={{ marginBottom: 0 }}>
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={2} placeholder="Brief description of drawing scope…" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? <><div className="spinner" style={{ width: 14, height: 14 }} /><span>Registering…</span></> : <><Plus size={14} /><span>Register as R0</span></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
