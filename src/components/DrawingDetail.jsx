import React, { useContext, useState, useRef } from 'react';
import { AppContext } from '../AppContext';
import { PdfViewer } from './PdfViewer';
import { ExcelViewer } from './ExcelViewer';
import { Upload, Download, ChevronLeft, ChevronRight, CheckCircle, Clock, AlertCircle, MessageSquare, X, Send, CheckCheck, FileUp, Trash2, PanelRight, PanelLeft, FileSpreadsheet, FolderInput } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { upload } from '@vercel/blob/client';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

const STATUS_MAP = {
  IFR: { label: 'Issued for Review',     cls: 'badge-ifr',  icon: AlertCircle },
  IFA: { label: 'Issued for Approval',   cls: 'badge-ifa',  icon: Clock },
  AFC: { label: 'Approved for Const.',   cls: 'badge-afc',  icon: CheckCircle },
  Superseded: { label: 'Superseded',     cls: 'badge-superseded', icon: X },
};

const DISCIPLINE_COLORS = {
  'Electrical':          '#6366f1',
  'Civil':               '#f59e0b',
  'Mechanical':          '#10b981',
  'SCADA & Telecom':     '#06b6d4',
  'Protection & Control':'#8b5cf6',
  'Structural':          '#ec4899',
};

export function DrawingDetail({ drawingId, showSidebar, onToggleSidebar }) {
  const { drawings, currentUser, canDo, uploadRevision, setDrawingStatus, deleteDrawing, addPin, addComment, resolvePin, acceptPin, uploadCRS, STATUSES, DISCIPLINES, moveDrawingToDiscipline } = useContext(AppContext);

  const drawing = drawings.find(d => d.id === drawingId);

  const [activeVersion, setActiveVersion] = useState(null); // null = latest
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [activePinId, setActivePinId] = useState(null);
  const [pinMode, setPinMode] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentType, setCommentType] = useState('internal');
  const [newPinId, setNewPinId] = useState(null);
  const [activeView, setActiveView] = useState('pdf');
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const fileInputRef = useRef(null);
  const crsInputRef = useRef(null);

  const handleCrsUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      uploadCRS(drawing.id, ev.target.result);
      setActiveView('crs');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!drawing) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="empty-state-icon" style={{ fontSize: '40px' }}>←</div>
        <div className="empty-state-title">Select a drawing</div>
        <div className="empty-state-desc">Choose a drawing from the list on the left.</div>
      </div>
    );
  }

  const sortedVersions = [...(drawing.versions || [])].sort((a, b) => {
    const num = v => parseInt(v.version?.replace(/\D/g,'') || 0);
    return num(b) - num(a);
  });
  const displayVersion = activeVersion
    ? sortedVersions.find(v => v.version === activeVersion)
    : sortedVersions[0];

  const pdfSrc = displayVersion?.pdfData || null;

  const statusMeta = STATUS_MAP[drawing.status] || STATUS_MAP.IFR;
  const StatusIcon = statusMeta.icon;

  const openPins = drawing.pins?.filter(p => !p.resolved).length || 0;
  const activePin = drawing.pins?.find(p => p.id === (newPinId || activePinId));

  // ── Drop pin on PDF ──────────────────────────────────────────────────────
  const handlePdfClick = (x, y, pageNum) => {
    if (!pinMode || !canDo('upload')) return;
    const pinId = addPin(drawingId, x, y, pageNum);
    setNewPinId(pinId);
    setActivePinId(pinId);
    setPinMode(false);
  };

  // ── Send comment ─────────────────────────────────────────────────────────
  const handleSendComment = () => {
    if (!commentText.trim() || !activePinId) return;
    addComment(drawingId, activePinId, commentText.trim(), commentType);
    setCommentText('');
    setNewPinId(null);
  };

  // ── Download ─────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!pdfSrc) return alert('No PDF available for this revision.');
    const a = document.createElement('a');
    a.href = pdfSrc;
    a.download = `${drawing.code}_${displayVersion?.version || 'R0'}.pdf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);

    if (drawing.crsData) {
      setTimeout(() => {
        const crsA = document.createElement('a');
        crsA.href = drawing.crsData;
        crsA.download = `${drawing.code}_CRS.xlsx`;
        document.body.appendChild(crsA); crsA.click(); document.body.removeChild(crsA);
      }, 300);
    }
  };

  return (
    <div className="drawing-detail">
      {/* Drawing header */}
      <div className="drawing-detail-header">
        <div style={{ display: 'flex', align: 'center', gap: '12px', flex: 1, minWidth: 0, alignItems: 'center' }}>
          {onToggleSidebar && (
            <button className="btn btn-ghost btn-sm btn-icon" onClick={onToggleSidebar} style={{ color: showSidebar ? 'var(--primary-light)' : undefined, flexShrink: 0 }} title={showSidebar ? 'Hide drawings list' : 'Show drawings list'}>
              <PanelLeft size={16} />
            </button>
          )}
          <span className="drawing-code-badge">{drawing.code}</span>
          <div style={{ minWidth: 0 }}>
            <div className="drawing-title-text truncate">{drawing.title}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-muted">{drawing.discipline}</span>
              <span className={`badge ${statusMeta.cls}`}>
                <StatusIcon size={10} />
                {drawing.status}
              </span>
              {drawing.clientName && (
                <span className="badge" style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)', fontSize: '10px' }}>
                  Client: {drawing.clientName}
                </span>
              )}
              {drawing.consultant && (
                <span className="badge" style={{ background: 'rgba(6,182,212,0.08)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.2)', fontSize: '10px' }}>
                  Consultant: {drawing.consultant}
                </span>
              )}
              {drawing.contractor && (
                <span className="badge" style={{ background: 'rgba(16,185,129,0.08)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)', fontSize: '10px' }}>
                  Contractor: {drawing.contractor}
                </span>
              )}
              {openPins > 0 && (
                <span className="badge badge-warning">{openPins} open comment{openPins !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>

        <div className="drawing-header-meta" style={{ position: 'relative' }}>
          {/* View-only controls available to all users who can view */}
          <button className="btn btn-ghost btn-sm btn-icon" title={showComments ? 'Hide comments' : 'Show comments'} onClick={() => setShowComments(s => !s)} style={{ color: showComments ? 'var(--primary-light)' : undefined }}>
            <PanelRight size={16} />
          </button>
          <button className="btn btn-ghost btn-sm btn-icon" title="Download" onClick={handleDownload}>
            <Download size={16} />
          </button>

          {/* Edit/Change controls restricted to users who can modify/upload */}
          {canDo('upload') && (
            <>
              <button className="btn btn-ghost btn-sm btn-icon" title={pinMode ? 'Cancel pin' : 'Add comment pin'} onClick={() => setPinMode(m => !m)} style={{ color: pinMode ? 'var(--warning)' : undefined }}>
                <MessageSquare size={16} />
              </button>
              <button className="btn btn-ghost btn-sm btn-icon" title="Upload CRS" onClick={() => crsInputRef.current?.click()}>
                <FileSpreadsheet size={16} />
              </button>
              <input type="file" ref={crsInputRef} accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleCrsUpload} />
              <button 
                className="btn btn-ghost btn-sm btn-icon" 
                title="Move to category" 
                onClick={() => setShowMoveMenu(s => !s)}
                style={{ color: showMoveMenu ? 'var(--primary-light)' : undefined }}
              >
                <FolderInput size={16} />
              </button>
              {showMoveMenu && (
                <div
                  style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: '8px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    minWidth: '180px', overflow: 'hidden',
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    Move to category
                  </div>
                  {DISCIPLINES.filter(d => d !== drawing.discipline).map(d => (
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
                        moveDrawingToDiscipline(drawing.id, d);
                        setShowMoveMenu(false);
                      }}
                    >
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: DISCIPLINE_COLORS[d] || '#6366f1', marginRight: 8 }} />
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="btn btn-ghost btn-sm btn-icon"
                style={{ color: 'var(--error)' }}
                title="Delete drawing"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete drawing "${drawing.code}"?`)) {
                    deleteDrawing(drawing.id);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
              <button className="btn btn-accent btn-sm" onClick={() => setShowUploadModal(true)}>
                <FileUp size={14} />
                <span>Upload Revision</span>
              </button>
            </>
          )}

          {canDo('approve') && (
            <select
              className="form-input"
              value={drawing.status}
              onChange={e => setDrawingStatus(drawingId, e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px', width: 'auto' }}
              title="Change drawing status"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Revision timeline */}
      <div className="revision-timeline">
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginRight: '8px', whiteSpace: 'nowrap' }}>REVISIONS</span>
        {sortedVersions.map((v, i) => (
          <React.Fragment key={v.version}>
            {i > 0 && <div className="revision-connector" />}
            <div
              className={`revision-node ${(activeVersion === v.version || (!activeVersion && i === 0)) ? 'active' : ''}`}
              onClick={() => setActiveVersion(v.version === sortedVersions[0].version ? null : v.version)}
              title={v.changeSummary}
            >
              <span className="revision-node-ver">{v.version}</span>
              <span className="revision-node-date">{v.date?.substring(0,10)}</span>
              <span className="revision-node-author">{v.author?.split(' ')[0]}</span>
            </div>
          </React.Fragment>
        ))}

        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          Viewing: <strong style={{ color: 'var(--accent)' }}>{displayVersion?.version}</strong>
          {' · '}{displayVersion?.changeSummary?.slice(0,60)}{displayVersion?.changeSummary?.length > 60 ? '…' : ''}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <button
          className="btn btn-sm"
          style={{ borderRadius: 0, background: activeView === 'pdf' ? 'var(--primary-glow)' : 'transparent', border: 'none', color: activeView === 'pdf' ? 'var(--primary-light)' : 'var(--text-muted)', borderBottom: activeView === 'pdf' ? '2px solid var(--primary-light)' : '2px solid transparent', padding: '10px 16px' }}
          onClick={() => setActiveView('pdf')}
        >
          Drawing PDF
        </button>
        <button
          className="btn btn-sm"
          style={{ borderRadius: 0, background: activeView === 'crs' ? 'var(--primary-glow)' : 'transparent', border: 'none', borderLeft: '1px solid var(--border)', color: activeView === 'crs' ? 'var(--primary-light)' : 'var(--text-muted)', borderBottom: activeView === 'crs' ? '2px solid var(--primary-light)' : '2px solid transparent', padding: '10px 16px' }}
          onClick={() => setActiveView('crs')}
        >
          CRS Excel {drawing.crsData && '✓'}
        </button>
      </div>
      <div className="drawing-body">
        {/* Pin mode hint */}
        {pinMode && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 20, pointerEvents: 'none', textAlign: 'center' }}>
            <div style={{ background: 'rgba(245,158,11,0.9)', color: '#000', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, fontSize: '13px' }}>
              📍 Click anywhere on the drawing to place a comment pin
            </div>
          </div>
        )}

        {/* Viewer */}
        <div className="pdf-panel">
          {activeView === 'pdf' ? (
            <PdfViewer
              pdfDataUrl={pdfSrc}
              pins={drawing.pins || []}
              onCanvasClick={pinMode ? handlePdfClick : undefined}
              activePinId={activePinId}
              showPins={true}
            />
          ) : (
            <ExcelViewer crsData={drawing.crsData} onSave={(data) => uploadCRS(drawing.id, data)} />
          )}
        </div>

        {/* Comments panel */}
        {showComments && (
        <div className="comment-panel">
          <div className="comment-panel-header">
            <span>Comments</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
              {drawing.pins?.length || 0} pin{drawing.pins?.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="comment-list">
            {(!drawing.pins || drawing.pins.length === 0) ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div style={{ fontSize: '28px' }}>📌</div>
                <div className="empty-state-desc" style={{ fontSize: '12px' }}>
                  Click the comment icon in the header, then click on the drawing to place a pin.
                </div>
              </div>
            ) : (
              drawing.pins.map(pin => (
                <div
                  key={pin.id}
                  className="comment-pin-group"
                  onClick={() => setActivePinId(activePinId === pin.id ? null : pin.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="comment-pin-header" style={{ borderBottom: activePinId === pin.id ? '1px solid var(--border)' : 'none' }}>
                    <div
                      style={{
                        width: '20px', height: '20px', borderRadius: '50% 50% 50% 0',
                        transform: 'rotate(-45deg)', background: pin.accepted ? 'var(--success)' : pin.resolved ? 'var(--text-muted)' : 'var(--warning)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}
                    >
                      <span style={{ transform: 'rotate(45deg)', fontSize: '9px', fontWeight: 800, color: '#fff' }}>{pin.label}</span>
                    </div>
                    <span>Pin {pin.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>{pin.comments.length} comment{pin.comments.length !== 1 ? 's' : ''}</span>
                    {pin.accepted && <span className="badge" style={{ background: 'var(--success)', color: '#000', fontSize: '9px', padding: '2px 6px', marginLeft: '4px' }}>Accepted</span>}
                    {pin.resolved && !pin.accepted && <span className="badge badge-muted" style={{ fontSize: '9px', padding: '2px 6px', marginLeft: '4px' }}>Resolved</span>}
                    {canDo('upload') && (
                      <button
                        onClick={e => { e.stopPropagation(); resolvePin(drawingId, pin.id); }}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: pin.resolved || pin.accepted ? 'var(--success)' : 'var(--text-muted)', padding: '2px' }}
                        title={pin.resolved || pin.accepted ? 'Reopen' : 'Mark resolved'}
                      >
                        <CheckCheck size={13} />
                      </button>
                    )}
                  </div>

                  {activePinId === pin.id && (
                    <div className="comment-thread">
                      {pin.comments.map(c => (
                        <div key={c.id} className="comment-bubble">
                          <div
                            className="avatar avatar-sm"
                            style={{ background: '#6366f1', color: '#fff' }}
                          >
                            {c.author?.slice(0,2).toUpperCase()}
                          </div>
                          <div className="comment-content">
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className="comment-author">{c.author}</span>
                              {c.type === 'client' && <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 5px' }}>Client</span>}
                            </div>
                            <div className="comment-date">{c.date}</div>
                            <div className="comment-text">{c.text}</div>
                          </div>
                        </div>
                      ))}
                      {!(pin.resolved || pin.accepted) && (canDo('approve') || canDo('upload')) && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                          {canDo('approve') && (
                            <button className="btn btn-primary btn-sm" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '6px' }} onClick={(e) => { e.stopPropagation(); acceptPin(drawingId, pin.id); }}>
                              <CheckCircle size={14} /> Accept
                            </button>
                          )}
                          {canDo('upload') && (
                            <button className="btn btn-secondary btn-sm" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '6px' }} onClick={(e) => { e.stopPropagation(); resolvePin(drawingId, pin.id); }}>
                              <CheckCheck size={14} /> Resolve
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Comment input */}
          {activePinId && canDo('upload') && (
            <div className="comment-input-area" style={{ flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  className="form-input"
                  value={commentType}
                  onChange={e => setCommentType(e.target.value)}
                  style={{ padding: '5px 8px', fontSize: '11px', width: 'auto' }}
                >
                  <option value="internal">Internal</option>
                  <option value="client">Client</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <textarea
                  className="comment-input"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a comment…"
                  rows={2}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleSendComment(); }}
                />
                <button className="btn btn-primary btn-icon" onClick={handleSendComment} style={{ flexShrink: 0 }}>
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Upload Revision Modal */}
      {showUploadModal && (
        <UploadRevisionModal
          drawing={drawing}
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => setShowUploadModal(false)}
          uploadRevision={uploadRevision}
          STATUSES={STATUSES}
          currentVersion={drawing.currentVersion}
        />
      )}
    </div>
  );
}

// ─── Upload Revision Modal ──────────────────────────────────────────────────
function UploadRevisionModal({ drawing, onClose, onUploaded, uploadRevision, STATUSES, currentVersion }) {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState(drawing.status);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // Calculate next version
  const nextVer = (() => {
    const cur = currentVersion || 'R0';
    if (cur.match(/^R\d+$/)) return `R${parseInt(cur.substring(1)) + 1}`;
    return `R${parseInt(cur.replace(/\D/g,'') || 0) + 1}`;
  })();

  const handleFile = async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please select a PDF file only.'); return;
    }
    setPdfFile(file);
    setParsing(true);
    setParsed(null);

    try {
      // Read once — share between pdfjs and base64
      const arrayBuffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // Build data URL without FileReader
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const dataUrl = `data:application/pdf;base64,${btoa(binary)}`;
      setPdfDataUrl(dataUrl);

      // Extract text from up to 3 pages
      const pdfDoc = await pdfjsLib.getDocument({ data: uint8.slice() }).promise;
      let fullText = '';
      for (let i = 1; i <= Math.min(pdfDoc.numPages, 3); i++) {
        const pg = await pdfDoc.getPage(i);
        const ct = await pg.getTextContent();
        fullText += ct.items.map(x => x.str).join(' ') + '\n';
      }

      // Drawing number (wider patterns)
      const dwgNoPatterns = [
        /(?:DRAWING\s*(?:NO|NUMBER|NUM)[\s.:–\-]*)\s*([A-Z0-9][A-Z0-9\-\/\.]{2,30})/i,
        /(?:DRG[\s.\-]?NO|DWG[\s.\-]?NO|DOC[\s.\-]?NO)[\s.:–\-]*\s*([A-Z0-9][A-Z0-9\-\/\.]{2,30})/i,
        /\b([A-Z]{1,6}-[A-Z]{1,6}-[A-Z0-9]{1,6}-\d{2,4}[A-Z]?)\b/,
        /\b([A-Z]{1,4}-[A-Z0-9]{2,8}-\d{2,4})\b/,
      ];
      let dwgNo = null;
      for (const pat of dwgNoPatterns) {
        const m = fullText.match(pat);
        if (m?.[1]) { dwgNo = m[1].trim().toUpperCase(); break; }
      }

      // Revision
      const revPatterns = [
        /\bREV(?:ISION)?[\s.:–\-]*([A-Z0-9]{1,3})\b/i,
        /\b(R[0-9]{1,2})\b/,
      ];
      let rev = null;
      for (const pat of revPatterns) {
        const m = fullText.match(pat);
        if (m?.[1]) { rev = m[1].replace(/\s+/g,'').toUpperCase(); break; }
      }

      // Title
      const titlePatterns = [
        /(?:DRAWING\s*TITLE|TITLE\s*OF\s*DRAWING|SHEET\s*TITLE)[\s.:–\-]+([A-Za-z0-9 ,\-\/&()]{5,100})/i,
        /TITLE[\s.:–\-]+([A-Za-z0-9 ,\-\/&()]{5,100}?)(?:\n|REV|DATE|SCALE|DRAWN|CHECKED)/i,
      ];
      let title = null;
      for (const pat of titlePatterns) {
        const m = fullText.match(pat);
        if (m?.[1]) { title = m[1].trim(); break; }
      }

      setParsed({ dwgNo, rev, title });
    } catch (err) {
      console.error('PDF parse error in revision upload:', err);
      // Fallback: FileReader for data URL only
      const reader = new FileReader();
      reader.onload = e => setPdfDataUrl(e.target.result);
      reader.readAsDataURL(file);
      setParsed(null);
    } finally {
      setParsing(false);
    }
  };


  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async () => {
    if (!pdfFile) { alert('Please select a PDF file.'); return; }
    if (!summary.trim()) { alert('Please enter a change summary.'); return; }
    setUploading(true);

    try {
      const blobPath = `drawings/${drawing.code.trim().toUpperCase()}/${pdfFile.name}`;
      const blob = await upload(blobPath, pdfFile, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });
      
      uploadRevision(drawing.id, summary, blob.url, status);
      setUploading(false);
      onUploaded();
    } catch (err) {
      console.error(err);
      alert('⚠️ Upload failed: ' + err.message);
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <div>
            <div className="modal-title">Upload Revision — {drawing.code}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Current: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{currentVersion}</span>
              {' → '}Next: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-light)', fontWeight: 700 }}>{nextVer}</span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {/* Drop zone */}
          <div
            className={`drop-zone ${pdfFile ? 'has-file' : ''}`}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            {pdfFile ? (
              <div>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
                <div style={{ fontWeight: 700, color: 'var(--success)' }}>{pdfFile.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {(pdfFile.size / 1024 / 1024).toFixed(2)} MB · Click to replace
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>📄</div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>Drop PDF here or click to browse</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>PDF files only · Revision will be saved as <strong>{nextVer}</strong></div>
              </div>
            )}
          </div>

          {/* Parsed info */}
          {parsing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'var(--primary-glow)', borderRadius: 'var(--r-md)', marginTop: '12px' }}>
              <div className="spinner" />
              <span style={{ fontSize: '13px', color: 'var(--primary-light)' }}>Extracting drawing information from PDF…</span>
            </div>
          )}

          {parsed && !parsing && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 14px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--r-md)', marginTop: '12px', fontSize: '12px' }}>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>📄 Extracted from PDF:</span>
              {parsed.dwgNo && <span style={{ background: 'rgba(6,182,212,0.15)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>No. {parsed.dwgNo}</span>}
              {parsed.title && <span style={{ color: 'var(--text-secondary)' }}>— {parsed.title.slice(0,60)}</span>}
              {parsed.rev && <span style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Rev {parsed.rev}</span>}
              {!parsed.dwgNo && !parsed.title && !parsed.rev && <span style={{ color: 'var(--text-muted)' }}>No structured data found in PDF title block.</span>}
            </div>
          )}

          <div className="divider" />

          {/* Form */}
          <div className="form-group">
            <label className="form-label">Change Summary / Revision Note *</label>
            <textarea
              className="form-input"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder={`Describe what changed in ${nextVer}…`}
              rows={3}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Update Drawing Status</label>
            <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s} — {
                s === 'IFR' ? 'Issued for Review' :
                s === 'IFA' ? 'Issued for Approval' :
                s === 'AFC' ? 'Approved for Construction' : 'Superseded'
              }</option>)}
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!pdfFile || uploading}>
            {uploading ? <><div className="spinner" style={{ width: 14, height: 14 }} /><span>Saving…</span></> : <><FileUp size={14} /><span>Upload as {nextVer}</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
