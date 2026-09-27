// The browser side of the activity log (api/_lib/log.js stores it, one object per entry).
// New entries go into an outbox kept in this browser and are posted in the background; a
// failed post is retried, so a network blip or a reload does not lose them. The server
// stamps time and author, and an id it already holds is not written twice.

const OUTBOX_KEY = 'dms_log_outbox_v1';
const MAX_TRIES = 40;            // about half an hour of retries at the longest interval
const BATCH = 100;               // the server's per-request limit

let outbox = load();
let timer = null;
let busy = false;
let tries = 0;

function load() {
  try { const v = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function persist() {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); } catch { /* storage full or unavailable: kept in memory */ }
}

/** Queue a workspace log entry. */
export function queueLog(entry) { outbox.push({ kind: 'log', entry, n: 0 }); persist(); schedule(300); }
/** Queue a drawing activity entry. */
export function queueActivity(drawingId, entry) { outbox.push({ kind: 'activity', drawingId, entry, n: 0 }); persist(); schedule(300); }
export const pendingCount = () => outbox.length;

function schedule(ms) {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flushOutbox(); }, ms);
}

/** Post what is waiting. Safe to call at any time (one flush at a time). */
export async function flushOutbox() {
  if (busy || !outbox.length) return;
  busy = true;
  let failed = false;
  try {
    // one request per kind and drawing
    const groups = new Map();
    for (const item of outbox) {
      const k = item.kind === 'log' ? 'log' : `a:${item.drawingId}`;
      if (!groups.has(k)) groups.set(k, []);
      if (groups.get(k).length < BATCH) groups.get(k).push(item);
    }
    for (const [k, items] of groups) {
      const url = k === 'log' ? '/api/log' : '/api/activity';
      const body = k === 'log' ? { entries: items.map(i => i.entry) } : { drawing: items[0].drawingId, entries: items.map(i => i.entry) };
      let status = 0;
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        status = res.status;
      } catch { status = 0; }
      const sent = new Set(items);
      if (status === 200 || status === 400 || status === 403 || status === 413) {
        // stored (or refused for good: nothing to retry)
        outbox = outbox.filter(i => !sent.has(i));
      } else {
        // offline, server error, or the drawing is not saved yet (404): try again later
        failed = true;
        outbox = outbox.map(i => (sent.has(i) ? { ...i, n: i.n + 1 } : i)).filter(i => i.n < MAX_TRIES);
      }
    }
    persist();
  } finally {
    busy = false;
  }
  tries = failed ? tries + 1 : 0;
  if (outbox.length) schedule(failed ? Math.min(60000, 2000 * 2 ** Math.min(tries, 5)) : 200);
}

if (typeof window !== 'undefined') {
  if (outbox.length) schedule(2000);
  window.addEventListener('online', () => flushOutbox());
}

// ─── Reading ──────────────────────────────────────────────────────────────
async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} failed (${res.status})`);
  return res.json();
}
const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

/** Workspace log, newest first. → { entries, cursor } */
export const fetchLog = ({ limit = 50, cursor } = {}) => getJson(`/api/log?${qs({ limit, cursor })}`);
/** One drawing's activity, newest first. → { entries, cursor } */
export const fetchActivity = (drawingId, { limit = 30, cursor } = {}) => getJson(`/api/activity?${qs({ drawing: drawingId, limit, cursor })}`);
/** Recent activity on every drawing this user sees, newest first. → { entries, cursor } */
export const fetchRecentActivity = ({ since, limit = 500, cursor } = {}) => getJson(`/api/activity?${qs({ since, limit, cursor })}`);

/** Merge entry lists by id (the server's copy wins), sorted by a time field. */
export function mergeEntries(a = [], b = [], field = 'time', desc = true) {
  const m = new Map();
  for (const e of a) if (e?.id) m.set(e.id, e);
  for (const e of b) if (e?.id) m.set(e.id, e);
  const cmp = (x, y) => String(x[field]).localeCompare(String(y[field]));
  return [...m.values()].sort(desc ? (x, y) => cmp(y, x) : cmp);
}
