// Activity tags on drawings: new file (who uploaded), downloaded (by whom),
// new comment, comment closed. "New" = happened after you last opened the drawing.
import { useEffect, useState } from 'react';

export const TAG = {
  upload:   { label: 'New file',    cls: 'upload' },
  download: { label: 'Downloaded',  cls: 'download' },
  comment:  { label: 'New comment', cls: 'comment' },
  closed:   { label: 'Closed',      cls: 'closed' },
  reopened: { label: 'Reopened',    cls: 'reopened' },
};

const WHAT = {
  drawing: 'drawing', revision: 'revision', crs: 'CRS Excel', 'crs-pdf': 'CRS (PDF)', 'crs-issued': 'CRS issued',
  pdf: 'drawing PDF', 'issued-crs': 'issued CRS',
};

/** One line describing an activity entry. */
export function describe(e) {
  switch (e.type) {
    case 'upload':
      if (e.what === 'crs-issued') return `CRS for ${e.version} issued${e.fileName ? ` (${e.fileName})` : ''}`;
      if (e.what === 'drawing' || e.what === 'revision') return `${e.version} uploaded${e.note ? ` — ${e.note}` : ''}`;
      return `${WHAT[e.what] || 'File'} uploaded${e.fileName ? `: ${e.fileName}` : ''}`;
    case 'download':
      { const w = WHAT[e.what] || 'file'; return `${w[0].toUpperCase()}${w.slice(1)} downloaded${e.version ? ` (${e.version})` : ''}`; }
    case 'comment':
      return `${e.reply ? 'Reply' : 'Comment'}${e.pin ? ` on pin ${e.pin}` : ''}: “${e.text || ''}”`;
    case 'closed':
      return `${e.pin ? `Pin ${e.pin}` : 'Comment'} ${String(e.status || 'closed').toLowerCase()}${e.text ? `: “${e.text}”` : ''}`;
    case 'reopened':
      return `${e.pin ? `Pin ${e.pin}` : 'Comment'} reopened${e.text ? `: “${e.text}”` : ''}`;
    default:
      return e.type;
  }
}

export function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return days < 7 ? `${days} d ago` : String(iso).slice(0, 10);
}

// ── "seen" marks, per person and browser ───────────────────────────────────
const listeners = new Set();
const key = (userId) => `dms_seen_v1_${userId}`;
function load(userId) {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) || 'null');
    if (v && v.since) return v;
  } catch { /* storage unavailable */ }
  // first time on this browser: the last 3 days count as new
  const fresh = { since: new Date(Date.now() - 3 * 86400000).toISOString(), drawings: {} };
  try { localStorage.setItem(key(userId), JSON.stringify(fresh)); } catch { /* ignore */ }
  return fresh;
}
let cache = { userId: null, value: null };
function get(userId) {
  if (cache.userId !== userId) cache = { userId, value: load(userId) };
  return cache.value;
}

/** Mark a drawing as looked at now. */
export function markSeen(userId, drawingId) {
  if (!userId || !drawingId) return;
  const v = get(userId);
  v.drawings = { ...v.drawings, [drawingId]: new Date().toISOString() };
  try { localStorage.setItem(key(userId), JSON.stringify(v)); } catch { /* ignore */ }
  listeners.forEach(fn => fn());
}

export function seenAt(userId, drawingId) {
  const v = get(userId);
  return v.drawings[drawingId] || v.since;
}

/** Re-render when seen marks change. */
export function useSeenVersion() {
  const [n, setN] = useState(0);
  useEffect(() => { const fn = () => setN(x => x + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
  return n;
}

/** Activity on a drawing by other people since this person last opened it. */
export function unseenActivity(drawing, user) {
  if (!user || !drawing) return [];
  const since = seenAt(user.id, drawing.id);
  return (drawing.activity || []).filter(e => e.at > since && e.by !== user.id);
}

/** Tags for a drawing list row: [{ type, label, title }] */
export function summaryTags(events) {
  const by = {};
  for (const e of events) (by[e.type] = by[e.type] || []).push(e);
  const names = (list) => [...new Set(list.map(e => e.byName))].join(', ');
  const first = (list) => String(list[list.length - 1]?.byName || '').split(' ')[0];
  const more = (list) => (new Set(list.map(e => e.byName)).size > 1 ? ' +' : '');
  const out = [];
  if (by.upload) out.push({ type: 'upload', label: `${TAG.upload.label} · ${first(by.upload)}${more(by.upload)}`, title: `Uploaded by ${names(by.upload)}` });
  if (by.comment) out.push({ type: 'comment', label: by.comment.length > 1 ? `${by.comment.length} new comments` : TAG.comment.label, title: `From ${names(by.comment)}` });
  if (by.closed) out.push({ type: 'closed', label: by.closed.length > 1 ? `${by.closed.length} closed` : 'Comment closed', title: `Closed by ${names(by.closed)}` });
  if (by.reopened) out.push({ type: 'reopened', label: 'Reopened', title: `Reopened by ${names(by.reopened)}` });
  if (by.download) out.push({ type: 'download', label: `${TAG.download.label} · ${first(by.download)}${more(by.download)}`, title: `Downloaded by ${names(by.download)}` });
  return out;
}
