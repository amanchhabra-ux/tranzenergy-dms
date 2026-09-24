import React, { useContext, useState, useRef, useEffect } from 'react';
import { AppContext } from '../AppContext';
import { PdfViewer } from './PdfViewer';
import { Maximize2, Minimize2, Upload, Download, ChevronLeft, ChevronRight, CheckCircle, Clock, AlertCircle, MessageSquare, X, Send, CheckCheck, FileUp, Trash2, PanelLeft, FileSpreadsheet, FolderInput } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { uploadFile, uploadCrsFile } from '../utils/uploadFile';
import { CrsPicker } from './CrsPicker';
import { CrsPanel } from './CrsPanel';
import { ResizeHandle } from './ResizeHandle';
import { useIsMobile } from '../utils/useIsMobile';
import { readCrs, downloadCrs } from '../utils/crs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

const DISCIPLINE_COLORS = {
  'Electrical':          '#3f7d3a',
  'Civil':               '#a16207',
  'Mechanical':          '#0f766e',
  'SCADA & Telecom':     '#0369a1',
  'Protection & Control':'#7c3aed',
  'Structural':          '#be185d',
};

export function DrawingDetail({ drawingId, showSidebar, onToggleSidebar }) {
  const { drawings, projects, currentUser, canDo, uploadRevision, deleteDrawing, addPin, addComment, resolvePin, acceptPin, uploadCRS, DISCIPLINES, moveDrawingToDiscipline, canDeleteComment, deletePinComment, deletePin } = useContext(AppContext);

  const drawing = drawings.find(d => d.id === drawingId);

  const [activeVersion, setActiveVersion] = useState(null); // null = latest
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showComments, setShowComments] = useState(false); // opens with the Comments button
  // Focus mode: hide the menu, project header, tabs, drawings list and revisions — just the PDF + CRS
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    document.body.classList.toggle('dms-focus', focus);
    const onKey = (e) => { if (e.key === 'Escape' && focus && !document.querySelector('.modal-overlay')) setFocus(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [focus]);
  useEffect(() => () => document.body.classList.remove('dms-focus'), []);
  // Panel sizes (px), remembered per browser
  const readSize = (k, d) => { try { const v = parseInt(localStorage.getItem(k), 10); return Number.isFinite(v) ? v : d; } catch { return d; } };
  const saveSize = (k, v) => { try { localStorage.setItem(k, String(Math.round(v))); } catch { /* storage unavailable */ } };
  const DEFAULT_CRS_W = 520, DEFAULT_COMMENTS_W = 300;
  const [crsWidth, setCrsWidth] = useState(() => readSize('dms_crs_width', DEFAULT_CRS_W));
  const [commentsWidth, setCommentsWidth] = useState(() => readSize('dms_comments_width', DEFAULT_COMMENTS_W));
  const dragStart = useRef(0);
  const bodyRef = useRef(null);
  const [activePinId, setActivePinId] = useState(null);
  const [pinMode, setPinMode] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentType, setCommentType] = useState('internal');
  const [newPinId, setNewPinId] = useState(null);
  const [activeViewRaw, setActiveView] = useState('split'); // 'pdf' | 'crs' | 'split'
  const isMobile = useIsMobile();
  const activeView = isMobile && activeViewRaw === 'split' ? 'pdf' : activeViewRaw; // phones: one at a time
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const fileInputRef = useRef(null);
  const crsInputRef = useRef(null);

  const handleCrsUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const [url, parsed] = await Promise.all([uploadCrsFile(drawing.code, file), readCrs(file)]);
      uploadCRS(drawing.id, url, parsed, file.name);
      setActiveView('split');
    } catch (err) {
      console.error(err);
      alert('⚠️ CRS upload failed: ' + err.message);
    }
  };

  // Edited CRS from the in-app Excel viewer → save as a file, not inline data
  const handleCrsSave = async (dataUri) => {
    try {
      const blob = await (await fetch(dataUri)).blob();
      const file = new File([blob], drawing.crsFileName || `${drawing.code}_CRS.xlsx`, { type: blob.type });
      const [url, parsed] = await Promise.all([uploadCrsFile(drawing.code, file), readCrs(file)]);
      uploadCRS(drawing.id, url, parsed, file.name);
    } catch (err) {
      console.error(err);
      alert('⚠️ Could not save CRS: ' + err.message);
    }
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


  const openPins = drawing.pins?.filter(p => !p.resolved).length || 0;
  const activePin = drawing.pins?.find(p => p.id === (newPinId || activePinId));

  // ── Drop pin on PDF ──────────────────────────────────────────────────────
  const handlePdfClick = (x, y, pageNum) => {
    if (!pinMode || !canDo('upload')) return;
    const pinId = addPin(drawingId, x, y, pageNum);
    setNewPinId(pinId);
    setActivePinId(pinId);
    setPinMode(false);
    setShowComments(true);
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

    if (!drawing.crsData && (drawing.pins?.length || drawing.crsImported?.length)) {
      setTimeout(() => downloadCrs(drawing, projects.find(p => p.id === drawing.projectId)), 300);
    } else if (drawing.crsData) {
      setTimeout(() => {
        const crsA = document.createElement('a');
        crsA.href = drawing.crsData;
        crsA.download = drawing.crsFileName || `${drawing.code}_CRS.xlsx`;
        document.body.appendChild(crsA); crsA.click(); document.body.removeChild(crsA);
      }, 300);
    }
  };

  return (
    <div className="drawing-detail">
      {/* Drawing header */}
      <div className="drawing-detail-header">
        <div style={{ display: 'flex', gap: 10, flex: '1 1 340px', minWidth: 0, alignItems: 'center' }}>
          {isMobile ? (
            onToggleSidebar && (
              <button className="btn btn-secondary btn-sm" onClick={onToggleSidebar} style={{ flexShrink: 0 }}>
                <ChevronLeft size={15} /> Drawings
              </button>
            )
          ) : (
          <div className="toolgroup" style={{ flexShrink: 0 }}>
              <button className={`btn btn-ghost btn-icon ${focus ? 'on' : ''}`} onClick={() => setFocus(f => !f)} title={focus ? 'Exit focus mode (Esc)' : 'Focus mode: hide menus and lists'}>
                {focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              {onToggleSidebar && !focus && (
                <button className={`btn btn-ghost btn-icon ${showSidebar ? 'on' : ''}`} onClick={onToggleSidebar} title={showSidebar ? 'Hide drawings list' : 'Show drawings list'}>
                  <PanelLeft size={15} />
                </button>
              )}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <span className="drawing-code-badge">{drawing.code}</span>
            <div className="drawing-title-text truncate" style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }} title={drawing.title}>{drawing.title}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: DISCIPLINE_COLORS[drawing.discipline] || '#94a3b8' }} />
                {drawing.discipline}
              </span>
              {[['Client', drawing.clientName], ['Contractor', drawing.contractor], ['Consultant', drawing.consultant]]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <span key={k} className="truncate" style={{ maxWidth: 220 }} title={`${k}: ${v}`}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span> {v}
                  </span>
                ))}
              {openPins > 0 && <span className="badge badge-warning">{openPins} open pin{openPins !== 1 ? 's' : ''}</span>}
            </div>
          </div>
        </div>

        <div className="drawing-header-meta" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <div className="toolgroup">
            {canDo('upload') && (
              <button className={`btn btn-ghost btn-icon ${pinMode ? 'on' : ''}`} title={pinMode ? 'Cancel pin' : 'Add a comment pin on the drawing'} onClick={() => setPinMode(m => !m)}>
                <MessageSquare size={15} />
              </button>
            )}
            <button className="btn btn-ghost btn-icon" title="Download PDF (and CRS)" onClick={handleDownload}>
              <Download size={15} />
            </button>
          </div>

          {canDo('upload') && (
            <div className="toolgroup">
              <button className="btn btn-ghost btn-icon" title="Upload CRS Excel" onClick={() => crsInputRef.current?.click()}>
                <FileSpreadsheet size={15} />
              </button>
              <input type="file" ref={crsInputRef} accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleCrsUpload} />
              <button className={`btn btn-ghost btn-icon ${showMoveMenu ? 'on' : ''}`} title="Move to category" onClick={() => setShowMoveMenu(s => !s)}>
                <FolderInput size={15} />
              </button>
              <button
                className="btn btn-ghost btn-icon"
                style={{ color: 'var(--error)' }}
                title="Delete drawing"
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete drawing "${drawing.code}"?`)) deleteDrawing(drawing.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}

          {showMoveMenu && (
            <div
              style={{
                position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 8,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 10, boxShadow: 'var(--shadow-lg)', minWidth: 190, overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                Move to category
              </div>
              {DISCIPLINES.filter(d => d !== drawing.discipline).map(d => (
                <button
                  key={d}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                  onClick={() => { moveDrawingToDiscipline(drawing.id, d); setShowMoveMenu(false); }}
                >
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: DISCIPLINE_COLORS[d] || '#94a3b8', marginRight: 8 }} />
                  {d}
                </button>
              ))}
            </div>
          )}
          {canDo('upload') && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowUploadModal(true)}>
              <FileUp size={14} />
              <span>Upload revision</span>
            </button>
          )}
        </div>
      </div>

      {/* Revisions + view switch */}
      <div className="revision-timeline">
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4, whiteSpace: 'nowrap' }}>Revisions</span>
        {sortedVersions.map((v, i) => (
          <React.Fragment key={v.version}>
            {i > 0 && <div className="revision-connector" />}
            <div
              className={`revision-node ${(activeVersion === v.version || (!activeVersion && i === 0)) ? 'active' : ''}`}
              onClick={() => setActiveVersion(v.version === sortedVersions[0].version ? null : v.version)}
              title={`${v.version} · ${v.date?.substring(0, 10)} · ${v.author || ''}\n${v.changeSummary || ''}`}
            >
              <span className="revision-node-ver">{v.version}</span>
              <span className="revision-node-date">{v.date?.substring(0, 10)}</span>
              <span className="revision-node-author">{v.author?.split(' ')[0]}</span>
            </div>
          </React.Fragment>
        ))}
        <span className="truncate" style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8, minWidth: 60, flex: '1 1 120px' }} title={displayVersion?.changeSummary}>
          {displayVersion?.changeSummary}
        </span>
        <div className="seg" style={{ flexShrink: 0, marginLeft: 8 }}>
          <button className={activeView === 'pdf' ? 'on' : ''} onClick={() => setActiveView('pdf')}>Drawing</button>
          <button className={activeView === 'crs' ? 'on' : ''} onClick={() => setActiveView('crs')}>
            CRS{drawing.crsData && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} title="CRS Excel attached" />}
          </button>
          {!isMobile && <button className={activeView === 'split' ? 'on' : ''} onClick={() => setActiveView('split')}>Side by side</button>}
        </div>
        <button
          className={`comments-toggle ${showComments ? 'on' : ''}`}
          onClick={() => setShowComments(s => !s)}
          title={showComments ? 'Close comments' : 'Open comments'}
        >
          <MessageSquare size={14} />
          <span>Comments</span>
          {(drawing.pins?.length || 0) > 0 && (
            <span className="comments-toggle-count" style={openPins ? undefined : { background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
              {openPins || drawing.pins.length}
            </span>
          )}
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
        <div className="pdf-panel" ref={bodyRef}>
          {activeView === 'crs' ? (
            <CrsPanel
              drawing={drawing}
              activePinId={activePinId}
              onSelectPin={setActivePinId}
              onSaveUploaded={handleCrsSave}
            />
          ) : (
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <PdfViewer
                  key={activeView}
                  pdfDataUrl={pdfSrc}
                  pins={drawing.pins || []}
                  onCanvasClick={pinMode ? handlePdfClick : undefined}
                  activePinId={activePinId}
                  showPins={true}
                />
              </div>
              {activeView === 'split' && (
                <ResizeHandle
                  onDragStart={() => { dragStart.current = crsWidth; }}
                  onDrag={dx => {
                    const max = (bodyRef.current?.clientWidth || 1200) - 220;
                    setCrsWidth(Math.max(300, Math.min(max, dragStart.current - dx)));
                  }}
                  onDragEnd={() => setCrsWidth(w => { saveSize('dms_crs_width', w); return w; })}
                  onReset={() => { setCrsWidth(DEFAULT_CRS_W); saveSize('dms_crs_width', DEFAULT_CRS_W); }}
                  title="Drag to resize the CRS · double-click to reset"
                />
              )}
              {activeView === 'split' && (
                <div style={{ flex: `0 0 ${crsWidth}px`, maxWidth: 'calc(100% - 207px)', minWidth: 300, display: 'flex', flexDirection: 'column' }}>
                  <CrsPanel
                    compact
                    drawing={drawing}
                    activePinId={activePinId}
                    onSelectPin={setActivePinId}
                    onSaveUploaded={handleCrsSave}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comments panel (drag its edge to resize; drag far right to hide) */}
        {showComments && (
          <ResizeHandle
            onDragStart={() => { dragStart.current = commentsWidth; }}
            onDrag={dx => setCommentsWidth(Math.max(120, Math.min(640, dragStart.current - dx)))}
            onDragEnd={() => setCommentsWidth(w => {
              if (w < 200) { setShowComments(false); saveSize('dms_comments_width', DEFAULT_COMMENTS_W); return DEFAULT_COMMENTS_W; }
              saveSize('dms_comments_width', w); return w;
            })}
            onReset={() => { setCommentsWidth(DEFAULT_COMMENTS_W); saveSize('dms_comments_width', DEFAULT_COMMENTS_W); }}
            title="Drag to resize comments · drag right to hide · double-click to reset"
          />
        )}
        {showComments && (
        <div className="comment-panel" style={{ width: commentsWidth, borderLeft: 'none' }}>
          <div className="comment-panel-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Comments
              <button className="btn btn-ghost btn-icon" title="Close comments (open again with the Comments button)" style={{ padding: 2 }} onClick={() => setShowComments(false)}>
                <X size={13} />
              </button>
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>
              {drawing.pins?.length || 0} pin{drawing.pins?.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="comment-list">
            {(!drawing.pins || drawing.pins.length === 0) ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div style={{ fontSize: '28px' }}>📌</div>
                <div className="empty-state-desc" style={{ fontSize: '12px' }}>
                  Click the speech-bubble pin tool in the toolbar, then click on the drawing where you want to comment.
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
                    {pin.accepted && <span className="badge badge-success" style={{ fontSize: '9px', padding: '2px 6px', marginLeft: '4px' }}>Accepted</span>}
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
                    {canDeleteComment(pin.comments?.[0]?.author || currentUser?.name) && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (window.confirm(`Delete pin ${pin.label} and all ${pin.comments.length} comment${pin.comments.length !== 1 ? 's' : ''} in it? This also removes it from the CRS Excel.`)) {
                            if (activePinId === pin.id) setActivePinId(null);
                            deletePin(drawingId, pin.id);
                          }
                        }}
                        style={{ marginLeft: canDo('upload') ? 0 : 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                        title="Delete this pin and its comments"
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {activePinId === pin.id && (
                    <div className="comment-thread">
                      {pin.comments.map(c => (
                        <div key={c.id} className="comment-bubble">
                          <div
                            className="avatar avatar-sm"
                            style={{ background: 'var(--charcoal)', color: '#fff' }}
                          >
                            {c.author?.slice(0,2).toUpperCase()}
                          </div>
                          <div className="comment-content">
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className="comment-author">{c.author}</span>
                              {c.type === 'client' && <span className="badge badge-warning" style={{ fontSize: '9px', padding: '1px 5px' }}>Client</span>}
                              {canDeleteComment(c.author) && (
                                <button
                                  className="comment-delete"
                                  title="Delete this comment"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (window.confirm('Delete this comment?')) deletePinComment(drawingId, pin.id, c.id);
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
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
          uploadCRS={uploadCRS}
          currentVersion={drawing.currentVersion}
        />
      )}
    </div>
  );
}

// ─── Upload Revision Modal ──────────────────────────────────────────────────
function UploadRevisionModal({ drawing, onClose, onUploaded, uploadRevision, uploadCRS, currentVersion }) {
  const [pdfFile, setPdfFile] = useState(null);
  const [crsFile, setCrsFile] = useState(null);
  const [pdfDataUrl, setPdfDataUrl] = useState(null);
  const [summary, setSummary] = useState('');
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
      const blob = await uploadFile(blobPath, pdfFile);
      
      uploadRevision(drawing.id, summary, blob.url);
      if (crsFile) {
        try {
          const [url, parsed] = await Promise.all([uploadCrsFile(drawing.code, crsFile), readCrs(crsFile)]);
          uploadCRS(drawing.id, url, parsed, crsFile.name);
        }
        catch (err) { alert('⚠️ Revision saved, but the CRS upload failed: ' + err.message); }
      }
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
              {parsed.dwgNo && <span style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>No. {parsed.dwgNo}</span>}
              {parsed.title && <span style={{ color: 'var(--text-secondary)' }}>— {parsed.title.slice(0,60)}</span>}
              {parsed.rev && <span style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>Rev {parsed.rev}</span>}
              {!parsed.dwgNo && !parsed.title && !parsed.rev && <span style={{ color: 'var(--text-muted)' }}>No structured data found in PDF title block.</span>}
            </div>
          )}

          <CrsPicker file={crsFile} onChange={setCrsFile} />

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
