import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../AppContext';
import { PdfViewer } from './PdfViewer';
import {
  FileText,
  Upload,
  Mail,
  Download,
  Lock,
  Search,
  MessageSquare,
  Plus,
  Send,
  CheckCircle2,
  FileCheck2,
  AlertCircle,
  X
} from 'lucide-react';

export const CategoryWorkspace = ({ category, selectedProjectId }) => {
  const {
    currentUser,
    drawings,
    hasAccess,
    uploadDrawingRevision,
    sendEmailTransmittal,
    createDrawing,
    projects
  } = useContext(AppContext);

  // ── Category helpers ─────────────────────────────────────────────────────
  const getCategoryDisplayName = () => {
    switch (category) {
      case 'electrical': return 'Electrical';
      case 'civil': return 'Civil';
      case 'mechanical': return 'Mechanical';
      case 'scada': return 'SCADA and Telecom';
      case 'firefighting': return 'Fire Fighting';
      case 'process': return 'Process';
      default: return 'Electrical';
    }
  };
  const currentCategoryName = getCategoryDisplayName();
  const canRead = hasAccess(currentCategoryName, 'read');
  const canWrite = hasAccess(currentCategoryName, 'write');

  // ── Subcategory tabs ─────────────────────────────────────────────────────
  const hasSubCategories = category === 'electrical' || category === 'civil';
  const [activeSub, setActiveSub] = useState('Basic Engineering');

  // ── Drawing list state ───────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDwgId, setActiveDwgId] = useState(null);

  // ── Filtered drawing list ────────────────────────────────────────────────
  const filteredDrawings = drawings.filter(dwg => {
    if (dwg.category !== currentCategoryName) return false;
    if (hasSubCategories && dwg.subCategory !== activeSub) return false;
    if (selectedProjectId !== 'all' && dwg.projectId !== selectedProjectId) return false;
    const q = searchQuery.toLowerCase();
    return dwg.code.toLowerCase().includes(q) || dwg.title.toLowerCase().includes(q);
  });

  // Auto-select first drawing when filters change
  useEffect(() => {
    if (filteredDrawings.length > 0) {
      setActiveDwgId(filteredDrawings[0].id);
    } else {
      setActiveDwgId(null);
    }
  }, [category, activeSub, selectedProjectId]);

  const activeDrawing = drawings.find(d => d.id === activeDwgId);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isNewDrawingModalOpen, setIsNewDrawingModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isEmailSuccessOpen, setIsEmailSuccessOpen] = useState(false);
  const [sentTransmittalData, setSentTransmittalData] = useState(null);

  // ── Register new drawing form state ─────────────────────────────────────
  const [newDwgCode, setNewDwgCode] = useState('');
  const [newDwgTitle, setNewDwgTitle] = useState('');
  const [newDwgDesc, setNewDwgDesc] = useState('');
  const [newDwgSummary, setNewDwgSummary] = useState('');
  const [newDwgProjectId, setNewDwgProjectId] = useState('');
  const [newDwgInitialVersion, setNewDwgInitialVersion] = useState('R0');
  const [newPdfFile, setNewPdfFile] = useState(null);      // File object
  const [newPdfBase64, setNewPdfBase64] = useState(null);  // base64 string
  const [pdfParseMsg, setPdfParseMsg] = useState('');
  const [pdfParseWarn, setPdfParseWarn] = useState('');
  const [parsedCategory, setParsedCategory] = useState('');

  // ── Upload revision form state ───────────────────────────────────────────
  const [uploadVerType, setUploadVerType] = useState('minor');
  const [uploadSummary, setUploadSummary] = useState('');
  const [revPdfFile, setRevPdfFile] = useState(null);
  const [revPdfBase64, setRevPdfBase64] = useState(null);

  // ── Email transmittal state ──────────────────────────────────────────────
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailNote, setEmailNote] = useState('');

  // ── Helpers ──────────────────────────────────────────────────────────────
  // Read a File object as base64 string
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]); // strip data:…;base64,
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // Parse a PDF filename for metadata auto-fill
  const parsePdfFilename = (filename) => {
    const nameWithoutExt = filename.replace(/\.pdf$/i, '');
    const parts = nameWithoutExt.split('_');
    let code = '', cat = '', title = '';
    if (parts.length >= 1) code = parts[0].trim();
    if (parts.length >= 2) {
      const t = parts[1].trim().toLowerCase();
      if (t === 'electrical' || t === 'elec') cat = 'Electrical';
      else if (t === 'civil' || t === 'civ') cat = 'Civil';
      else if (t === 'scada' || t.includes('telecom')) cat = 'SCADA and Telecom';
      else if (t.includes('fire') || t.includes('hydrant')) cat = 'Fire Fighting';
    }
    if (parts.length >= 3) title = parts.slice(2).join(' ').trim().replace(/-/g, ' ');
    else title = nameWithoutExt.replace(/_/g, ' ');
    return { code, cat, title };
  };

  // ── Handle new-drawing PDF file selection ────────────────────────────────
  const handleNewPdfSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNewPdfFile(file);
    const { code, cat, title } = parsePdfFilename(file.name);
    if (code) setNewDwgCode(code);
    if (title) setNewDwgTitle(title);
    if (cat) setParsedCategory(cat);

    if (code && cat) {
      setPdfParseMsg(`✓ Extracted — Drawing: ${code} | Type: ${cat}`);
      setPdfParseWarn(
        cat !== currentCategoryName
          ? `⚠️ This PDF belongs to "${cat}" and will be routed to that discipline tab.`
          : ''
      );
    } else {
      setPdfParseMsg(`Filename parsed as: "${file.name.replace(/\.pdf$/i, '')}". Category not auto-detected.`);
      setPdfParseWarn('Tip: Use format Code_Category_Title.pdf for auto-fill (e.g. E-SLD-001_Electrical_Panel Layout.pdf)');
    }

    try {
      const b64 = await fileToBase64(file);
      setNewPdfBase64(b64);
    } catch (err) {
      setPdfParseWarn('Could not read file. Please try again.');
    }
  };

  // ── Handle revision PDF file selection ───────────────────────────────────
  const handleRevPdfSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRevPdfFile(file);
    try {
      const b64 = await fileToBase64(file);
      setRevPdfBase64(b64);
    } catch (err) {
      setRevPdfFile(null);
    }
  };

  // ── Submit: register new drawing ─────────────────────────────────────────
  const handleCreateDrawingSubmit = (e) => {
    e.preventDefault();
    if (!newDwgCode.trim() || !newDwgTitle.trim() || !newDwgProjectId) return;

    const targetCategory = parsedCategory && ['Electrical', 'Civil', 'SCADA and Telecom', 'Fire Fighting'].includes(parsedCategory)
      ? parsedCategory
      : currentCategoryName;

    const newDwg = createDrawing({
      code: newDwgCode,
      title: newDwgTitle,
      description: newDwgDesc || `PDF: ${newPdfFile?.name || 'No file'}`,
      category: targetCategory,
      subCategory: hasSubCategories ? activeSub : '',
      projectId: newDwgProjectId,
      changeSummary: newDwgSummary || 'Initial PDF drawing issue.',
      initialVersion: newDwgInitialVersion || 'R0',
      pdfData: newPdfBase64 || null,
    });

    // Reset
    setNewDwgCode(''); setNewDwgTitle(''); setNewDwgDesc('');
    setNewDwgSummary(''); setNewDwgProjectId(''); setNewDwgInitialVersion('R0');
    setNewPdfFile(null); setNewPdfBase64(null);
    setPdfParseMsg(''); setPdfParseWarn(''); setParsedCategory('');
    setIsNewDrawingModalOpen(false);

    if (targetCategory === currentCategoryName) setActiveDwgId(newDwg.id);
  };

  // ── Submit: upload revision ──────────────────────────────────────────────
  const handleUploadRevisionSubmit = (e) => {
    e.preventDefault();
    if (!uploadSummary.trim() || !activeDwgId || !revPdfFile) return;
    uploadDrawingRevision(activeDwgId, uploadVerType, uploadSummary, null, revPdfBase64);
    setUploadSummary(''); setRevPdfFile(null); setRevPdfBase64(null);
    setIsUploadModalOpen(false);
  };

  // ── Submit: email transmittal ────────────────────────────────────────────
  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!emailRecipients.trim() || !activeDrawing) return;
    const ver = activeDrawing.versions[0].version;
    const data = sendEmailTransmittal(activeDrawing.id, ver, emailRecipients, emailNote);
    if (data) {
      setSentTransmittalData(data);
      setIsEmailModalOpen(false);
      setIsEmailSuccessOpen(true);
      setEmailRecipients(''); setEmailNote('');
    }
  };

  // ── Download package ─────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!activeDrawing) return;
    const ver = activeDrawing.versions[0];
    const content = `TRANZENERGY DRAWING TRANSMITTAL METADATA
======================================================
Drawing Number  : ${activeDrawing.code}
Title           : ${activeDrawing.title}
Active Revision : ${ver.version}
Release Date    : ${ver.date}
Category        : ${activeDrawing.category} / ${activeDrawing.subCategory}
Project         : ${activeDrawing.projectName} (${activeDrawing.projectId})
Client          : ${activeDrawing.clientName}
======================================================
REVISION LOG:
${activeDrawing.versions.map(v => ` [${v.version}] ${v.date} by ${v.author} — ${v.changeSummary}`).join('\n')}
======================================================
Tranzenergy Document Control — Signature Verified`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${activeDrawing.code}_${ver.version}_TRANZENERGY_TRANSMITTAL.txt`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ── Access denied ────────────────────────────────────────────────────────
  if (!canRead) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0f19' }}>
        <div style={{ textAlign: 'center', maxWidth: '440px', background: 'rgba(30,41,59,0.6)', border: '1px solid var(--error)', borderRadius: '16px', padding: '40px', boxShadow: 'var(--shadow-lg)', backdropFilter: 'blur(12px)' }}>
          <Lock size={48} style={{ color: '#ef4444', marginBottom: '16px', filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.4))' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>Access Restricted</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Your role does not have read access to <strong>{currentCategoryName}</strong>. Contact the Admin to update your permissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-wrapper">

      {/* ── Left: Drawing list sidebar ───────────────────────────────────── */}
      <div className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          {hasSubCategories && (
            <div className="phase-selector-tabs">
              <button className={`phase-btn ${activeSub === 'Basic Engineering' ? 'active' : ''}`} onClick={() => setActiveSub('Basic Engineering')}>Basic Eng.</button>
              <button className={`phase-btn ${activeSub === 'Detailed Engineering' ? 'active' : ''}`} onClick={() => setActiveSub('Detailed Engineering')}>Detailed Eng.</button>
            </div>
          )}

          <div className="drawing-search-box">
            <Search className="drawing-search-icon" size={16} />
            <input
              type="text" className="drawing-search-input"
              placeholder="Search drawings…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {canWrite && (
            <button
              className="btn btn-secondary btn-block"
              style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => setIsNewDrawingModalOpen(true)}
            >
              <Plus size={14} /><span>Register Drawing Sheet</span>
            </button>
          )}
        </div>

        <div className="drawing-list-scroll">
          {filteredDrawings.length === 0 ? (
            <div className="no-items-state">
              <FileText size={32} style={{ color: 'var(--text-muted)' }} />
              <span className="no-items-title">No sheets listed</span>
              <span className="no-items-desc">Register a drawing to index it here.</span>
            </div>
          ) : (
            filteredDrawings.map(dwg => {
              const isActive = dwg.id === activeDwgId;
              const openPins = dwg.pins.filter(p => !p.resolved).length;
              return (
                <div
                  key={dwg.id}
                  className={`drawing-item-card ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveDwgId(dwg.id)}
                >
                  <div className="drawing-card-top">
                    <span className="drawing-card-title">{dwg.title}</span>
                    <span className="version-badge">{dwg.currentVersion}</span>
                  </div>
                  <div className="flex-space-between" style={{ fontSize: '11px', margin: '2px 0' }}>
                    <span className="drawing-card-code">{dwg.code}</span>
                    <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{dwg.projectId}</span>
                  </div>
                  <div className="drawing-card-meta">
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px', whiteSpace: 'nowrap' }} title={dwg.clientName}>
                      {dwg.clientName}
                    </span>
                    {openPins > 0 && (
                      <span className="drawing-comments-indicator text-warning" style={{ fontSize: '10px' }}>
                        <MessageSquare size={10} /><span>{openPins} open</span>
                      </span>
                    )}
                  </div>
                  {/* PDF indicator */}
                  <div style={{ marginTop: '4px' }}>
                    {dwg.pdfData
                      ? <span style={{ fontSize: '9px', background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>📄 PDF Loaded</span>
                      : <span style={{ fontSize: '9px', background: 'rgba(148,163,184,0.1)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px' }}>No PDF uploaded</span>
                    }
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Centre+Right: PDF Viewer fills all remaining space ─────────────── */}
      {activeDrawing ? (
        <div style={{ flex: 1, display: 'flex', minWidth: 0, height: '100%', overflow: 'hidden' }}>
          <PdfViewer
            drawing={activeDrawing}
            onDownload={handleDownload}
            onUpload={canWrite ? () => setIsUploadModalOpen(true) : null}
            onTransmit={() => setIsEmailModalOpen(true)}
            canWrite={canWrite}
          />
        </div>
      ) : (
        <div className="no-items-state" style={{ flex: 1 }}>
          <FileText size={64} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <span className="no-items-title" style={{ fontSize: '18px' }}>No drawing selected</span>
          <span className="no-items-desc" style={{ maxWidth: '300px' }}>Select a drawing from the list or register a new one.</span>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODALS                                                              */}
      {/* ================================================================== */}

      {/* 1. Register new drawing */}
      {isNewDrawingModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">Register Drawing — PDF Upload</span>
              <button className="modal-close-btn" onClick={() => setIsNewDrawingModalOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateDrawingSubmit}>
              <div className="modal-body">

                {/* PDF file picker */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Select Drawing PDF File (PDF only)</label>
                  <input type="file" accept=".pdf" id="new-pdf-input" style={{ display: 'none' }} onChange={handleNewPdfSelect} />
                  <label htmlFor="new-pdf-input" style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    border: `2px dashed ${newPdfFile ? 'var(--success)' : 'var(--border-color)'}`,
                    borderRadius: '8px', padding: '22px 16px', background: 'rgba(15,23,42,0.4)',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                  }}>
                    {newPdfFile
                      ? <FileCheck2 size={26} style={{ color: 'var(--success)', marginBottom: '6px' }} />
                      : <Upload size={26} style={{ color: 'var(--text-muted)', marginBottom: '6px' }} />
                    }
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                      {newPdfFile ? newPdfFile.name : 'Click to upload PDF drawing'}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Filename format: Code_Category_Title.pdf
                    </span>
                  </label>
                </div>

                {/* Parse feedback */}
                {pdfParseMsg && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', marginBottom: '4px' }}>
                    <div style={{ color: 'var(--success)', fontWeight: 600 }}>{pdfParseMsg}</div>
                    {pdfParseWarn && (
                      <div style={{ color: '#f59e0b', fontSize: '11px', marginTop: '4px', display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                        <AlertCircle size={11} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{pdfParseWarn}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Project */}
                <div className="form-group">
                  <label className="form-label">Project & Client Mapping *</label>
                  <select required className="form-input" value={newDwgProjectId} onChange={e => setNewDwgProjectId(e.target.value)}>
                    <option value="">Select project…</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.code}>{p.code} — {p.name} (Client: {p.client})</option>
                    ))}
                  </select>
                </div>

                {/* Drawing code */}
                <div className="form-group">
                  <label className="form-label">Drawing Number / Document Code *</label>
                  <input required className="form-input" placeholder="e.g. 4610-171-001-PVC-C-002" value={newDwgCode} onChange={e => setNewDwgCode(e.target.value)} />
                </div>

                {/* Title */}
                <div className="form-group">
                  <label className="form-label">Drawing Title *</label>
                  <input required className="form-input" placeholder="e.g. BESS Area Fencing Layout" value={newDwgTitle} onChange={e => setNewDwgTitle(e.target.value)} />
                </div>

                {/* Initial version */}
                <div className="form-group">
                  <label className="form-label">Initial Revision Number</label>
                  <input className="form-input" placeholder="e.g. R0 or V1.0" value={newDwgInitialVersion} onChange={e => setNewDwgInitialVersion(e.target.value)} />
                </div>

                {/* Description */}
                <div className="form-group">
                  <label className="form-label">Description / Scope</label>
                  <textarea className="form-input" style={{ minHeight: '60px' }} value={newDwgDesc} onChange={e => setNewDwgDesc(e.target.value)} />
                </div>

                {/* Change summary */}
                <div className="form-group">
                  <label className="form-label">Revision Memo</label>
                  <input className="form-input" placeholder="e.g. Initial issue for client review" value={newDwgSummary} onChange={e => setNewDwgSummary(e.target.value)} />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsNewDrawingModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  Register Drawing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Upload revision */}
      {isUploadModalOpen && activeDrawing && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">Upload Revised PDF — {activeDrawing.code}</span>
              <button className="modal-close-btn" onClick={() => setIsUploadModalOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleUploadRevisionSubmit}>
              <div className="modal-body">

                {/* PDF file picker */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700 }}>Revised PDF File (PDF only) *</label>
                  <input type="file" accept=".pdf" id="rev-pdf-input" style={{ display: 'none' }} onChange={handleRevPdfSelect} />
                  <label htmlFor="rev-pdf-input" style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    border: `2px dashed ${revPdfFile ? 'var(--success)' : 'var(--border-color)'}`,
                    borderRadius: '8px', padding: '20px 16px', background: 'rgba(15,23,42,0.4)',
                    cursor: 'pointer', textAlign: 'center'
                  }}>
                    {revPdfFile
                      ? <FileCheck2 size={24} style={{ color: 'var(--success)', marginBottom: '6px' }} />
                      : <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: '6px' }} />
                    }
                    <span style={{ fontSize: '13px' }}>
                      {revPdfFile ? revPdfFile.name : 'Upload revised PDF'}
                    </span>
                  </label>
                </div>

                {/* Version type */}
                <div className="form-group">
                  <label className="form-label">Revision Increment</label>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    {['minor', 'major'].map(type => (
                      <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="radio" name="verType" value={type} checked={uploadVerType === type} onChange={() => setUploadVerType(type)} />
                        <span style={{ textTransform: 'capitalize' }}>{type} revision</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Change summary */}
                <div className="form-group">
                  <label className="form-label">Change Summary *</label>
                  <textarea
                    required className="form-input" style={{ minHeight: '80px' }}
                    placeholder="Describe what changed in this revision…"
                    value={uploadSummary} onChange={e => setUploadSummary(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsUploadModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!revPdfFile}>
                  Commit Revision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Email transmittal */}
      {isEmailModalOpen && activeDrawing && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span className="modal-title">Official Drawing Transmittal</span>
              <button className="modal-close-btn" onClick={() => setIsEmailModalOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleEmailSubmit}>
              <div className="modal-body">
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px', marginBottom: '8px', fontSize: '12px' }}>
                  <div style={{ marginBottom: '4px' }}><strong>Document:</strong> {activeDrawing.code} — {activeDrawing.title}</div>
                  <div><strong>Revision:</strong> {activeDrawing.currentVersion} &nbsp;|&nbsp; <strong>Project:</strong> {activeDrawing.projectName}</div>
                  <div><strong>Client:</strong> {activeDrawing.clientName}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Recipient Email(s)</label>
                  <input required className="form-input" placeholder="client@company.com, inspector@site.org" value={emailRecipients} onChange={e => setEmailRecipients(e.target.value)} />
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Separate multiple addresses with commas.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Cover Note</label>
                  <textarea className="form-input" style={{ minHeight: '70px' }} placeholder="Please review the attached PDF revision…" value={emailNote} onChange={e => setEmailNote(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEmailModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary"><Send size={13} /><span>Send Transmittal</span></button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Success confirmation */}
      {isEmailSuccessOpen && sentTransmittalData && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-body transmittal-success-dialog">
              <div className="transmittal-success-icon"><CheckCircle2 size={36} /></div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Transmittal Dispatched</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Your drawing transmittal has been sent.</p>
              <div className="transmittal-summary-card">
                <div className="transmittal-summary-title">REF: {sentTransmittalData.id}</div>
                <div><strong>Sender:</strong> {sentTransmittalData.sender}</div>
                <div><strong>To:</strong> {sentTransmittalData.recipients}</div>
                <div><strong>Document:</strong> {sentTransmittalData.drawingCode} ({sentTransmittalData.version})</div>
                <div><strong>Date:</strong> {sentTransmittalData.date}</div>
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setIsEmailSuccessOpen(false)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
