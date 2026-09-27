// The activity log, out of the workspace document: one immutable object per entry.
//
//   workspace log     _system/log/<revTs>-<id>.json
//                     _system/log-by/<authorId>/<revTs>-<id>.json   (a consultant reads only their own)
//   drawing activity  _system/activity/<drawingId>/<revTs>-<id>.json
//                     _system/activity-feed/<revTs>+<drawingId>+<id>.json   (recent activity, all drawings)
//   id claims         _system/log-ids/<id>.json, _system/activity-ids/<drawingId>/<id>.json
//
// revTs = 9999999999999 - epoch milliseconds, 13 digits, so an ascending listing returns the
// newest entry first. Every object is written create-only (If-None-Match: *). The id claim is
// written first and holds the entry as stored: an id is taken once, a second write with the
// same id changes nothing, and different content under a taken id is refused. The listing
// objects are derived from the claim, so a write interrupted halfway is completed by a retry.
// Time and author are stamped here from the session user; what the browser sends is ignored.
import crypto from 'node:crypto';
import { createObject, readObjectText, listKeys, mapLimit } from './objects.js';
import { loggedBy, allowedProjectIds } from './view.js';

export const MAX_TS = 9999999999999;
export const revTs = (ms) => String(MAX_TS - Math.min(MAX_TS, Math.max(0, Math.floor(Number(ms) || 0)))).padStart(13, '0');
const msOf = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };

// a key segment: letters, digits, _ and - as they are; anything else as ~hhhh (never '+' or '/')
export const seg = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, c => `~${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
export const unseg = (s) => String(s).replace(/~([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

export const LOG_DIR = '_system/log/';
export const FEED_DIR = '_system/activity-feed/';
export const logByDir = (userId) => `_system/log-by/${seg(userId)}/`;
export const activityDir = (drawingId) => `_system/activity/${seg(drawingId)}/`;
const logIdKey = (id) => `_system/log-ids/${seg(id)}.json`;
const activityIdKey = (drawingId, id) => `_system/activity-ids/${seg(drawingId)}/${seg(id)}.json`;

export const logName = (e) => `${revTs(msOf(e.time))}-${seg(e.id)}.json`;
export const activityName = (e) => `${revTs(msOf(e.at))}-${seg(e.id)}.json`;
export const feedName = (drawingId, e) => `${revTs(msOf(e.at))}+${seg(drawingId)}+${seg(e.id)}.json`;
export const feedDrawing = (name) => unseg(String(name).split('+')[1] || '');
// a cursor is the name of the last entry returned
export const validCursor = (c) => typeof c === 'string' && /^\d{13}[-+][A-Za-z0-9_~+-]{1,1200}\.json$/.test(c);

// entries a browser may post in one request, and a save from an older tab may carry
export const PER_REQUEST = 100;
// a save from an older tab: only entries dated in the last week are looked at (the ones that
// tab has just created); older ones are the log it loaded, already stored
const RECENT_MS = 7 * 86400000;

const cleanId = (v) => {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  return s && s.length <= 200 ? s : null;
};
/** An entry's id; an old entry without one gets a stable id from its content. */
export const entryId = (e) => cleanId(e?.id) || `legacy-${crypto.createHash('sha1').update(JSON.stringify(e)).digest('hex').slice(0, 16)}`;

// fields the server sets; a repeated write is compared without them
const STAMPED = { log: ['time', 'author', 'authorId'], activity: ['at', 'by', 'byName', 'drawingId'] };
function canon(e, kind) {
  const o = {};
  for (const k of Object.keys(e || {}).sort()) if (!STAMPED[kind].includes(k) && e[k] !== undefined) o[k] = e[k];
  return JSON.stringify(o);
}
export const sameContent = (a, b, kind) => canon(a, kind) === canon(b, kind);

/**
 * Is this log entry the caller's to write? A consultant: only entries naming them (by id, or by
 * name for entries without one). Internal users: anything not naming someone else by id (the
 * app writes some entries, e.g. "signed in", before it knows the user, as "System").
 */
const ownEntry = (e, user, external) => (external ? !(e.authorId || e.author) || loggedBy(e, user) : !e.authorId || e.authorId === user.id);

/** A workspace log entry from the browser, stamped with the server's time and the session user. */
export function cleanLog(input, { user, now, external = false }) {
  if (!input || typeof input !== 'object') return null;
  const id = cleanId(input.id);
  if (!id) return null;
  if (!ownEntry(input, user, external)) return null;
  const message = typeof input.message === 'string' ? input.message.slice(0, external ? 500 : 5000) : '';
  if (!message) return null;
  return { id, message, author: user.name, authorId: user.id, time: now };
}

/** A drawing activity entry from the browser: flat values only, stamped here. */
export function cleanActivity(input, { drawingId, user, now, external = false }) {
  if (!input || typeof input !== 'object') return null;
  const id = cleanId(input.id);
  if (!id) return null;
  if (input.by && input.by !== user.id) return null; // someone else's entry
  if (external && input.vis) return null;            // a consultant never writes internal entries
  const out = { id };
  for (const [k, v] of Object.entries(input).slice(0, 40)) {
    if (['id', 'at', 'by', 'byName', 'drawingId', 'via'].includes(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 1000);
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v;
  }
  if (typeof out.type !== 'string' || !out.type) return null;
  if ('vis' in out && out.vis !== 'internal') delete out.vis;
  return { ...out, drawingId: String(drawingId), at: now, by: user.id, byName: user.name };
}

// ids this server instance has seen stored (saves the id claim on repeated posts)
const knownIds = new Set();
const knownKey = (kind, drawingId, id) => `${kind}|${drawingId || ''}|${id}`;
const know = (k) => { if (knownIds.size > 50000) knownIds.clear(); knownIds.add(k); };
export function forgetKnownIds() { knownIds.clear(); }

/**
 * Store one entry (already stamped). kind 'log' | 'activity'.
 *  drawingId    activity only
 *  authorIndex  log only: the user id to index it under (default entry.authorId)
 *  check        false: an id already taken counts as present without reading it back
 * → { status: 'written' | 'present' | 'conflict', entry }
 */
export async function appendEntry(kind, entry, { drawingId, authorIndex, check = true } = {}) {
  const idKey = kind === 'log' ? logIdKey(entry.id) : activityIdKey(drawingId, entry.id);
  const r = await createObject(idKey, JSON.stringify(entry));
  let stored = entry;
  if (r === 'exists') {
    know(knownKey(kind, drawingId, entry.id));
    if (!check) return { status: 'present', entry };
    stored = JSON.parse(await readObjectText(idKey));
    if (!sameContent(stored, entry, kind)) return { status: 'conflict', entry: stored };
  }
  const text = JSON.stringify(stored);
  const by = authorIndex ?? stored.authorId;
  const keys = kind === 'log'
    ? [LOG_DIR + logName(stored), ...(by ? [logByDir(by) + logName(stored)] : [])]
    : [activityDir(drawingId) + activityName(stored), FEED_DIR + feedName(drawingId, stored)];
  await Promise.all(keys.map(k => createObject(k, text)));
  know(knownKey(kind, drawingId, entry.id));
  return { status: r === 'exists' ? 'present' : 'written', entry: stored };
}

/**
 * One page, newest first.
 *  dir       folder to list
 *  cursor    name of the last entry of the previous page
 *  keepName  name → false to skip an object without reading it
 *  filter    entry → false to leave it out
 *  legacy    [{ name, entry }] still inside the workspace document (before the migration),
 *            merged in by name; an object with the same name wins
 *  stopAt    name → true where the page ends for good (entries older than `since`)
 * → { entries, cursor }   cursor null when there is nothing more
 */
export async function readPage({ dir, cursor = null, limit = 50, keepName = () => true, filter = () => true, legacy = [], stopAt = () => false, maxScan = 5000 }) {
  const out = [];
  const ids = new Set();
  let last = cursor;
  let after = cursor ? dir + cursor : undefined;
  let scanned = 0;
  const sortedLegacy = [...legacy].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (;;) {
    const page = await listKeys(dir, { startAfter: after, limit: Math.min(1000, Math.max(100, limit * 2)) });
    const names = page.keys.map(k => k.slice(dir.length)).filter(n => !n.includes('/'));
    const upper = page.truncated && names.length ? names[names.length - 1] : null;
    const merged = new Map(sortedLegacy.filter(l => (!last || l.name > last) && (upper == null || l.name <= upper)).map(l => [l.name, l.entry]));
    for (const n of names) merged.set(n, null); // null: read the object
    const order = [...merged.keys()].sort();
    // read in small parallel batches, then take them in order
    for (let i = 0; i < order.length; i += 32) {
      const batch = order.slice(i, i + 32);
      const got = await mapLimit(batch, 16, async (n) => {
        if (stopAt(n) || !keepName(n)) return undefined;
        const inline = merged.get(n);
        if (inline) return inline;
        const text = await readObjectText(dir + n);
        return text ? JSON.parse(text) : undefined;
      });
      for (let j = 0; j < batch.length; j++) {
        const n = batch[j];
        if (stopAt(n)) return { entries: out, cursor: null };
        last = n;
        const e = got[j];
        if (e && filter(e) && !ids.has(e.id)) { ids.add(e.id); out.push(e); }
        if (out.length >= limit) {
          const more = j < batch.length - 1 || i + 32 < order.length || page.truncated;
          return { entries: out, cursor: more ? last : null };
        }
      }
    }
    scanned += order.length;
    if (!page.truncated) return { entries: out, cursor: null };
    after = page.keys[page.keys.length - 1];
    if (scanned >= maxScan) return { entries: out, cursor: last };
  }
}

// ─── Legacy entries still inside the workspace document ─────────────────────
export const legacyLog = (doc) => (Array.isArray(doc?.activityLog) ? doc.activityLog : [])
  .filter(e => e && typeof e === 'object').map(e => ({ ...e, id: entryId(e) }));
export const legacyActivity = (d) => (Array.isArray(d?.activity) ? d.activity : [])
  .filter(e => e && typeof e === 'object').map(e => ({ ...e, id: entryId(e), drawingId: String(d.id) }));

/**
 * The stored document keeps what it already held and nothing new: the log and the drawings'
 * activity as they were in `before` (none once migrated). New entries a save carries go to
 * objects (extractFromSave), so a browser cannot grow the document again.
 */
export function keepLegacy(before, next) {
  const out = { ...next };
  if (Array.isArray(before?.activityLog) && before.activityLog.length) out.activityLog = before.activityLog;
  else delete out.activityLog;
  const old = new Map((before?.drawings || []).filter(d => d && d.id != null).map(d => [d.id, d]));
  if (Array.isArray(next.drawings)) {
    out.drawings = next.drawings.map(d => {
      if (!d || typeof d !== 'object') return d;
      const prev = old.get(d.id)?.activity;
      if (Array.isArray(prev) && prev.length) return { ...d, activity: prev };
      if (!('activity' in d)) return d;
      const { activity: _drop, ...rest } = d;
      return rest;
    });
  }
  return out;
}

/**
 * Entries a save from an older tab carries that are not stored yet: the caller's own, dated
 * in the last week, at most PER_REQUEST of each kind, stamped with the server's time.
 *  allowedDrawing  drawingId → may this user write activity on it
 * → { log: [entry], activity: [{ drawingId, entry }] }
 */
export function extractFromSave(before, incoming, user, { external = false, allowedDrawing = () => true, now = new Date().toISOString() } = {}) {
  const cutoff = Date.parse(now) - RECENT_MS;
  const recent = (t) => msOf(t) >= cutoff;
  const newestFirst = (f) => (a, b) => String(b[f]).localeCompare(String(a[f]));

  const had = new Set(legacyLog(before).map(e => e.id));
  const log = (Array.isArray(incoming?.activityLog) ? incoming.activityLog : [])
    .filter(e => e && cleanId(e.id) && !had.has(cleanId(e.id)) && recent(e.time) && ownEntry(e, user, external) && !knownIds.has(knownKey('log', '', cleanId(e.id))))
    .sort(newestFirst('time')).slice(0, PER_REQUEST)
    .map(e => cleanLog(e, { user, now, external })).filter(Boolean);

  const old = new Map((before?.drawings || []).filter(d => d && d.id != null).map(d => [d.id, d]));
  const acts = [];
  for (const d of Array.isArray(incoming?.drawings) ? incoming.drawings : []) {
    if (!d || d.id == null || !Array.isArray(d.activity) || !allowedDrawing(String(d.id))) continue;
    const seen = new Set(legacyActivity(old.get(d.id)).map(e => e.id));
    for (const e of d.activity) {
      const id = cleanId(e?.id);
      if (!id || seen.has(id) || !recent(e.at) || e.by !== user.id || knownIds.has(knownKey('activity', String(d.id), id))) continue;
      acts.push({ drawingId: String(d.id), raw: e });
    }
  }
  const activity = acts.sort((a, b) => String(b.raw.at).localeCompare(String(a.raw.at))).slice(0, PER_REQUEST)
    .map(({ drawingId, raw }) => ({ drawingId, entry: cleanActivity(raw, { drawingId, user, now, external }) }))
    .filter(x => x.entry);
  return { log, activity };
}

/** Store what extractFromSave found. Never overwrites; an id already taken is left as it is. */
export async function writeExtracted({ log = [], activity = [] }) {
  const counts = { written: 0, present: 0 };
  await mapLimit([...log.map(entry => ({ kind: 'log', entry })), ...activity.map(a => ({ kind: 'activity', ...a }))], 16, async (j) => {
    const r = await appendEntry(j.kind, j.entry, { drawingId: j.drawingId, check: false });
    counts[r.status === 'written' ? 'written' : 'present']++;
  });
  return counts;
}

// ─── Migration of the entries inside the document ───────────────────────────
/**
 * Write every log and activity entry of the document as objects, keeping their own times and
 * authors. Idempotent: an entry already stored counts as present. dryRun writes nothing.
 * → { found, foundLog, foundActivity, written, alreadyPresent, conflicts, conflictIds }
 *   (dry run: written = would be written)
 */
export async function migrateEntries(doc, { dryRun = false } = {}) {
  const users = Array.isArray(doc?.users) ? doc.users : [];
  const idByName = (name) => { const m = users.filter(u => u && u.name === name); return m.length === 1 ? m[0].id : undefined; };
  const jobs = [];
  for (const e of legacyLog(doc)) jobs.push({ kind: 'log', entry: e, authorIndex: e.authorId || idByName(e.author) });
  for (const d of Array.isArray(doc?.drawings) ? doc.drawings : []) {
    if (!d || d.id == null) continue;
    for (const e of legacyActivity(d)) jobs.push({ kind: 'activity', entry: e, drawingId: String(d.id) });
  }
  const c = { found: jobs.length, foundLog: jobs.filter(j => j.kind === 'log').length, foundActivity: jobs.filter(j => j.kind === 'activity').length,
    written: 0, alreadyPresent: 0, conflicts: 0, conflictIds: [] };
  await mapLimit(jobs, 16, async (j) => {
    if (dryRun) {
      const text = await readObjectText(j.kind === 'log' ? logIdKey(j.entry.id) : activityIdKey(j.drawingId, j.entry.id));
      if (!text) c.written++;
      else if (sameContent(JSON.parse(text), j.entry, j.kind)) c.alreadyPresent++;
      else { c.conflicts++; c.conflictIds.push(j.entry.id); }
      return;
    }
    const r = await appendEntry(j.kind, j.entry, { drawingId: j.drawingId, authorIndex: j.authorIndex });
    if (r.status === 'written') c.written++;
    else if (r.status === 'present') c.alreadyPresent++;
    else { c.conflicts++; c.conflictIds.push(j.entry.id); }
  });
  return c;
}

/** The document without the log and the drawings' activity. → { doc, stripped } */
export function stripDoc(doc) {
  let stripped = legacyLog(doc).length;
  const out = { ...doc };
  delete out.activityLog;
  out.drawings = (Array.isArray(doc.drawings) ? doc.drawings : []).map(d => {
    if (!d || typeof d !== 'object' || !('activity' in d)) return d;
    stripped += legacyActivity(d).length;
    const { activity: _drop, ...rest } = d;
    return rest;
  });
  return { doc: out, stripped };
}

// ─── Who reads what ─────────────────────────────────────────────────────────
/** Drawing ids a consultant may read activity for. */
export function visibleDrawingIds(doc, user) {
  const allowed = allowedProjectIds(doc, user);
  return new Set((doc?.drawings || []).filter(d => d && allowed.has(d.projectId)).map(d => String(d.id)));
}
