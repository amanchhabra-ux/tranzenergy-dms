import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AppContext } from '../AppContext';
import { ExcelViewer } from './ExcelViewer';
import { PdfViewer } from './PdfViewer';
import { buildCrsTable, downloadCrs, readCrs, crsFieldUpdates, loadBytes, sniffType, consultantCrs, saveBytes } from '../utils/crs';
import { isExternal } from '../utils/workflow';
import { Download, FileSpreadsheet, ListChecks, FileText, Send, CheckCircle2, Loader2, AlertCircle, MessageSquarePlus, Trash2 } from 'lucide-react';

const STATUS_STYLE = {
  open: { color: 'var(--warning)', background: 'var(--warning-glow)' },
  resolved: { color: 'var(--accent)', background: 'var(--accent-glow)' },
  closed: { color: 'var(--success)', background: 'var(--success-glow)' },
};
const statusStyle = (s = '') => {
  const k = s.toLowerCase();
  if (/accept|approv|clos|done|complied|noted/.test(k)) return STATUS_STYLE.closed;
  if (/resol|repl|answer/.test(k)) return STATUS_STYLE.resolved;
  return STATUS_STYLE.open;
};
const PIN_STATUSES = ['Open', 'Resolved', 'Accepted'];
const ROW_STATUSES = ['Open', 'Resolved', 'Accepted', 'Closed'];
const now = () => new Date().toISOString().replace('T', ' ').substring(0, 16);

/**
 * CRS for a drawing, shown next to the PDF.
 *  - "Auto CRS": every comment pin + every CRS Excel comment + comments added here.
 *    Users can reply, change status and add comments; each change is written
 *    into the drawing's CRS Excel automatically.
 *  - "Excel sheet": the CRS Excel itself.
 *  - "CRS PDF": a signed/scanned CRS uploaded as PDF, if any.
 */
export function CrsPanel({ drawing, activePinId, onSelectPin, onSaveUploaded, compact = false }) {
  const { projects, canDo, currentUser, updateDrawing, addComment, updateCrsItems, setPinStatus, retryCrsSync, canDeleteComment, deletePin, deleteCrsItem, recordDownload } = useContext(AppContext);
  const project = projects.find(p => p.id === drawing.projectId);
  const canEdit = canDo('upload');
  const [mode, setMode] = useState('auto');
  const [lazyImport, setLazyImport] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');

  // One-time check of an attached CRS file: PDFs are moved aside, Excels get their comments read
  useEffect(() => {
    setLazyImport(null);
    if (!drawing.crsData || drawing.crsFileType) return;
    let cancelled = false;
    (async () => {
      let type = 'invalid';
      try { type = sniffType(await loadBytes(drawing.crsData)); } catch { /* unreachable file */ }
      if (cancelled) return;
      if (type === 'pdf') {
        if (canEdit) updateDrawing(drawing.id, { crsPdf: drawing.crsData, crsData: null, crsImported: [], crsLayout: null, crsFileType: null });
        return;
      }
      const parsed = await readCrs(drawing.crsData);
      if (cancelled) return;
      if (canEdit) {
        updateDrawing(drawing.id, {
          ...crsFieldUpdates(drawing, parsed.meta),
          crsImported: parsed.comments, crsMeta: parsed.meta, crsLayout: parsed.layout, crsFileType: parsed.fileType,
        });
      } else {
        setLazyImport(parsed.comments);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id, drawing.crsData, drawing.crsFileType]);

  // an outside consultant downloads the issued CRS with their own comments added
  const issuedForMe = isExternal(currentUser) && !!(drawing.review?.issued?.url || drawing.review?.cycles?.some(c => c.issued?.url));
  const downloadCrsFor = async () => {
    if (!issuedForMe) { downloadCrs(drawing, project); return; }
    try { const c = await consultantCrs(drawing, currentUser?.id); if (c) saveBytes(c.bytes, c.fileName); }
    catch (err) { alert('Could not build the CRS: ' + err.message); }
  };

  const rows = useMemo(
    () => buildCrsTable(lazyImport ? { ...drawing, crsImported: lazyImport } : drawing),
    [drawing, lazyImport]
  );
  const openCount = rows.filter(r => statusStyle(r.status) === STATUS_STYLE.open).length;

  // ── Actions ──────────────────────────────────────────────────────────────
  const submitReply = (r) => {
    const text = replyText.trim();
    if (!text) return;
    if (r.kind === 'pin') {
      addComment(drawing.id, r.pinId, text, 'internal');
    } else {
      updateCrsItems(drawing.id, items => items.map((c, i) => i !== r.idx ? c : {
        ...c,
        reply: c.reply ? `${c.reply}\n${text}` : text,
        replyBy: [...new Set([...(c.replyBy ? c.replyBy.split(', ') : []), currentUser?.name].filter(Boolean))].join(', '),
      }));
    }
    setReplyText(''); setReplyFor(null);
  };

  const changeStatus = (r, status) => {
    if (r.kind === 'pin') setPinStatus(drawing.id, r.pinId, status);
    else updateCrsItems(drawing.id, items => items.map((c, i) => (i === r.idx ? { ...c, status } : c)));
  };

  const addNewComment = () => {
    const text = newComment.trim();
    if (!text) return;
    updateCrsItems(drawing.id, items => [...items, {
      id: `crs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      local: true, comment: text, commentBy: currentUser?.name || '', date: now().slice(0, 10), status: 'Open',
    }]);
    setNewComment('');
  };

  const removeRow = (r) => {
    const what = r.kind === 'pin'
      ? `Delete pin ${r.pin} and all its comments?`
      : r.kind === 'excel' ? 'Delete this comment? It will also be cleared from the CRS Excel.' : 'Delete this comment?';
    if (!window.confirm(what)) return;
    if (r.kind === 'pin') { if (activePinId === r.pinId) onSelectPin?.(null); deletePin(drawing.id, r.pinId); }
    else deleteCrsItem(drawing.id, r.idx);
  };

  // ── UI bits ──────────────────────────────────────────────────────────────
  const tabBtn = (key, label, Icon) => (
    <button className="btn btn-sm" onClick={() => setMode(key)} style={{
      border: 'none', borderRadius: 'var(--r-sm)', padding: '4px 10px', gap: 5,
      background: mode === key ? 'var(--primary-glow)' : 'transparent',
      color: mode === key ? 'var(--primary-light)' : 'var(--text-muted)',
    }}>
      <Icon size={13} /><span>{label}</span>
    </button>
  );

  // Excel update status (the update itself runs in AppContext)
  const syncing = (drawing.crsRev || 0) > (drawing.crsSyncedRev || 0);
  const syncBadge = drawing.crsSyncError
    ? <span style={{ color: 'var(--error)', display: 'flex', gap: 4, alignItems: 'center' }} title={drawing.crsSyncError}><AlertCircle size={11} /> Excel not updated</span>
    : syncing
      ? <span style={{ color: 'var(--primary-light)', display: 'flex', gap: 4, alignItems: 'center' }}><Loader2 size={11} className="spin" /> Updating Excel…</span>
      : drawing.crsSyncedAt
        ? <span style={{ color: 'var(--success)', display: 'flex', gap: 4, alignItems: 'center' }} title={`Last updated ${new Date(drawing.crsSyncedAt).toLocaleString()}`}><CheckCircle2 size={11} /> Excel up to date</span>
        : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-card)' }}>
      <div className="pdf-toolbar" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', paddingLeft: 8 }}>
          {tabBtn('auto', 'Auto CRS', ListChecks)}
          {tabBtn('excel', drawing.crsData ? 'Excel sheet' : 'Excel sheet (none)', FileSpreadsheet)}
          {drawing.crsPdf && tabBtn('pdf', 'CRS PDF', FileText)}
        </div>
        {mode === 'excel' && drawing.crsData && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingRight: 8, fontSize: 11 }}>
            {syncBadge}
            <a className="btn btn-secondary btn-sm" href={drawing.crsData} download={drawing.crsFileName || `${drawing.code}_CRS.xlsx`} onClick={() => recordDownload(drawing.id, 'crs', drawing.crsFileName)} title="Download the CRS Excel with all comments and replies">
              <Download size={13} /><span>Download</span>
            </a>
          </div>
        )}
        {mode === 'auto' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingRight: 8, fontSize: 11 }}>
            {syncBadge}
            <span style={{ color: 'var(--text-muted)' }}>{rows.length} · {openCount} open</span>
            <button className="btn btn-secondary btn-sm" disabled={!rows.length} onClick={() => { downloadCrsFor(); recordDownload(drawing.id, 'crs'); }} title={issuedForMe ? 'Download the CRS as issued, with your comments added' : 'Download the auto CRS as a new Excel'}>
              <Download size={13} />
            </button>
          </div>
        )}
      </div>

      {drawing.crsSyncError && mode === 'auto' && (
        <div style={{ fontSize: 11, color: 'var(--error)', background: 'var(--error-glow)', padding: '6px 12px' }}>
          ⚠️ The Excel sheet could not be updated: {drawing.crsSyncError} Your comments are saved in the app.
          {canEdit && <button className="btn btn-ghost btn-sm" style={{ padding: '0 6px', fontSize: 11 }} onClick={() => retryCrsSync(drawing.id)}>Retry</button>}
        </div>
      )}

      {mode === 'excel' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ExcelViewer crsData={drawing.crsData} onSave={canEdit ? onSaveUploaded : undefined} />
        </div>
      ) : mode === 'pdf' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <PdfViewer pdfDataUrl={drawing.crsPdf} pins={[]} showPins={false} />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: compact ? 10 : 16 }}>
          {/* Title block */}
          <div className="crs-card" style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '6px 16px', fontSize: 11, marginBottom: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            {[
              ['Drawing No.', drawing.code], ['Revision', drawing.currentVersion],
              ['Title', drawing.title], ['Category', drawing.discipline],
              ['Client', drawing.clientName || project?.client], ['Contractor', drawing.contractor],
              ['Consultant', drawing.consultant], ['Project', project?.name || drawing.crsMeta?.project],
            ].map(([k, v]) => (
              <div key={k} style={{ minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9, fontWeight: 700 }}>{k}</div>
                <div className="truncate" title={v || ''} style={{ fontWeight: 600 }}>{v || '—'}</div>
              </div>
            ))}
          </div>

          {/* New comment */}
          {canEdit && (
            <div className="crs-card" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 8, marginBottom: 10 }}>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Add a comment to the CRS… (goes into the Excel sheet too)"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNewComment(); }}
                style={{ fontSize: 12, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>To comment on a spot in the drawing, use a pin instead</span>
                <button className="btn btn-primary btn-sm" disabled={!newComment.trim()} onClick={addNewComment}>
                  <MessageSquarePlus size={13} /><span>Add comment</span>
                </button>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 12px' }}>
              <div style={{ fontSize: 32 }}>📋</div>
              <div className="empty-state-title" style={{ fontSize: 14 }}>No comments yet</div>
              <div className="empty-state-desc" style={{ fontSize: 12 }}>
                Comments added here, pins on the drawing and comments in an uploaded CRS Excel all appear in this list.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(r => {
                const active = r.pinId && r.pinId === activePinId;
                const replying = replyFor === r.key;
                const statuses = r.kind === 'pin' ? PIN_STATUSES : ROW_STATUSES;
                const statusValue = statuses.includes(r.status) ? r.status : r.status || 'Open';
                return (
                  <div
                    className="crs-card"
                    key={r.key}
                    onClick={() => r.pinId && onSelectPin?.(active ? null : r.pinId)}
                    title={r.pinId ? 'Click to highlight this pin on the drawing' : undefined}
                    style={{
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--r-md)',
                      padding: '8px 10px', fontSize: 12, cursor: r.pinId ? 'pointer' : 'default',
                      background: active ? 'var(--primary-glow)' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)' }}>#{r.sno}</span>
                      {r.pin !== '' && <span style={{ fontSize: 10, color: 'var(--primary-light)' }}>📍 Pin {r.pin}{r.page ? ` · p.${r.page}` : ''}</span>}
                      {r.internal && <span className="badge badge-muted" style={{ fontSize: 9, padding: '1px 6px' }} title="Not visible to the consultant until the CRS is submitted">Internal</span>}
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1, minWidth: 0 }} className="truncate">
                        {[r.commentBy, r.date, r.kind === 'excel' ? 'from Excel' : r.kind === 'local' ? 'added in CRS' : ''].filter(Boolean).join(' · ')}
                      </span>
                      {canDeleteComment(r.commentBy || (r.kind === 'excel' ? '' : currentUser?.name)) && (
                        <button
                          className="comment-delete"
                          title={r.kind === 'pin' ? 'Delete this pin and its comments' : 'Delete this comment'}
                          onClick={e => { e.stopPropagation(); removeRow(r); }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      {canEdit ? (
                        <select
                          value={statusValue}
                          onClick={e => e.stopPropagation()}
                          onChange={e => changeStatus(r, e.target.value)}
                          style={{ ...statusStyle(r.status), fontSize: 10, fontWeight: 700, padding: '2px 4px', borderRadius: 4, border: 'none', cursor: 'pointer' }}
                        >
                          {!statuses.includes(statusValue) && <option value={statusValue}>{statusValue}</option>}
                          {statuses.map(s => <option key={s} value={s} disabled={s === 'Accepted' && r.kind === 'pin' && !canDo('approve')}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{ ...statusStyle(r.status), fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{r.status || 'Open'}</span>
                      )}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{r.comment}</div>
                    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)', whiteSpace: 'pre-wrap', lineHeight: 1.45, color: r.reply ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Reply{r.replyBy ? ` · ${r.replyBy}` : ''}: </span>
                      {r.reply || 'Awaiting response'}
                    </div>
                    {canEdit && (replying ? (
                      <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                        <textarea
                          autoFocus className="form-input" rows={2} value={replyText}
                          placeholder="Write a reply… (Ctrl/⌘+Enter to send)"
                          onChange={e => setReplyText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply(r);
                            if (e.key === 'Escape') { setReplyFor(null); setReplyText(''); }
                          }}
                          style={{ fontSize: 12, resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setReplyFor(null); setReplyText(''); }}>Cancel</button>
                          <button className="btn btn-primary btn-sm" disabled={!replyText.trim()} onClick={() => submitReply(r)}><Send size={12} /><span>Reply</span></button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 4, padding: '2px 6px', fontSize: 11 }}
                        onClick={e => { e.stopPropagation(); setReplyFor(r.key); setReplyText(''); }}>
                        Reply
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
