// The activity log endpoints. They run inside the get-state function (vercel.json rewrites
// /api/log, /api/activity and /api/admin/migrate-log to /api/get-state?route=…), so the
// deployment keeps the same number of functions.
//
//   GET  /api/log?limit=&cursor=                  workspace log, newest first
//   POST /api/log        { entries: [...] }       new entries from the browser
//   GET  /api/activity?drawing=<id>&limit=&cursor=   one drawing's activity, newest first
//   GET  /api/activity?since=<iso>&limit=&cursor=    recent activity on every drawing the user sees
//   POST /api/activity   { drawing, entries: [...] }
//   POST /api/admin/migrate-log[?dryRun=1]        admin: move the entries out of the document
import { requireUser } from './auth.js';
import { readState, writeState } from './state.js';
import { PreconditionFailed } from './r2.js';
import { isExternal, loggedBy, allowedProjectIds } from './view.js';
import {
  LOG_DIR, FEED_DIR, logByDir, activityDir, logName, activityName, feedName, feedDrawing, revTs, validCursor,
  PER_REQUEST, cleanLog, cleanActivity, appendEntry, readPage, legacyLog, legacyActivity, migrateEntries, stripDoc,
  visibleDrawingIds,
} from './log.js';

// the workspace document, parsed once per version on this server instance
let docCache = { etag: null, doc: null };
async function currentDoc() {
  const r = await readState(docCache.doc ? docCache.etag : undefined);
  if (r.notFound) return null;
  if (r.notModified && docCache.doc) return docCache.doc;
  const doc = JSON.parse(r.text);
  docCache = { etag: r.etag, doc };
  return doc;
}

const int = (v, def, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def; };
const DAY = 86400000;

async function getLog(req, res, who, doc) {
  const q = req.query || {};
  if (q.cursor && !validCursor(q.cursor)) return res.status(400).json({ error: 'bad_cursor' });
  const external = isExternal(who.user);
  const legacy = legacyLog(doc).filter(e => !external || loggedBy(e, who.user)).map(entry => ({ name: logName(entry), entry }));
  const page = await readPage({
    dir: external ? logByDir(who.user.id) : LOG_DIR,
    cursor: q.cursor || null, limit: int(q.limit, 50, 200), legacy,
  });
  return res.status(200).json(page);
}

async function getActivity(req, res, who, doc) {
  const q = req.query || {};
  if (q.cursor && !validCursor(q.cursor)) return res.status(400).json({ error: 'bad_cursor' });
  const external = isExternal(who.user);
  const visible = (e) => !external || e.vis !== 'internal';
  const drawings = Array.isArray(doc?.drawings) ? doc.drawings : [];
  if (q.drawing != null && q.drawing !== '') {
    const id = String(q.drawing);
    const d = drawings.find(x => x && String(x.id) === id);
    if (external && (!d || !allowedProjectIds(doc, who.user).has(d.projectId))) return res.status(404).json({ error: 'unknown_drawing' });
    const page = await readPage({
      dir: activityDir(id), cursor: q.cursor || null, limit: int(q.limit, 30, 200), filter: visible,
      legacy: legacyActivity(d).map(entry => ({ name: activityName(entry), entry })),
    });
    return res.status(200).json(page);
  }
  // recent activity across the drawings this user sees (tags, "My reviews")
  const since = Number.isFinite(Date.parse(q.since)) ? Date.parse(q.since) : Date.now() - 14 * DAY;
  const bound = revTs(since);
  const allowed = external ? visibleDrawingIds(doc, who.user) : null;
  const legacy = drawings.filter(d => d && (!allowed || allowed.has(String(d.id))))
    .flatMap(d => legacyActivity(d).map(entry => ({ name: feedName(d.id, entry), entry })));
  const page = await readPage({
    dir: FEED_DIR, cursor: q.cursor || null, limit: int(q.limit, 500, 1000), legacy, filter: visible,
    keepName: allowed ? (n) => allowed.has(feedDrawing(n)) : undefined,
    stopAt: (n) => n.slice(0, 13) >= bound,
  });
  return res.status(200).json(page);
}

function tally(results) {
  const c = { written: 0, present: 0, conflict: 0 };
  for (const r of results) c[r.status]++;
  return c;
}

async function postLog(req, res, who) {
  const list = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!list) return res.status(400).json({ error: 'entries_required' });
  if (list.length > PER_REQUEST) return res.status(413).json({ error: 'too_many_entries', max: PER_REQUEST });
  const now = new Date().toISOString();
  const external = isExternal(who.user);
  const clean = list.map(e => cleanLog(e, { user: who.user, now, external }));
  const results = [];
  for (const e of clean.filter(Boolean)) results.push(await appendEntry('log', e));
  return res.status(200).json({ ...tally(results), refused: clean.filter(x => !x).length, entries: results.map(r => r.entry) });
}

async function postActivity(req, res, who, doc) {
  const body = req.body || {};
  const list = Array.isArray(body.entries) ? body.entries : null;
  if (!list || body.drawing == null) return res.status(400).json({ error: 'drawing_and_entries_required' });
  if (list.length > PER_REQUEST) return res.status(413).json({ error: 'too_many_entries', max: PER_REQUEST });
  const id = String(body.drawing);
  const d = (doc?.drawings || []).find(x => x && String(x.id) === id);
  // the drawing has to be saved first (the browser retries until it is)
  if (!d) return res.status(404).json({ error: 'unknown_drawing' });
  const external = isExternal(who.user);
  if (external && !allowedProjectIds(doc, who.user).has(d.projectId)) return res.status(404).json({ error: 'unknown_drawing' });
  const now = new Date().toISOString();
  const clean = list.map(e => cleanActivity(e, { drawingId: id, user: who.user, now, external }));
  const results = [];
  for (const e of clean.filter(Boolean)) results.push(await appendEntry('activity', e, { drawingId: id }));
  return res.status(200).json({ ...tally(results), refused: clean.filter(x => !x).length, entries: results.map(r => r.entry) });
}

/**
 * Move the entries inside the workspace document to objects, then strip them from the
 * document with If-Match on the version that was read. Safe to run again: entries already
 * stored count as present, and a document with nothing left to strip is not rewritten.
 * → { dryRun, found, foundLog, foundActivity, written, alreadyPresent, conflicts, stripped, bytesBefore, bytesAfter }
 */
export async function runMigration({ dryRun = false, retries = 3, read = readState, write = writeState } = {}) {
  let total = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const cur = await read();
    if (cur.notFound || !cur.text) return { status: 404, body: { error: 'no_workspace' } };
    const doc = JSON.parse(cur.text);
    const c = await migrateEntries(doc, { dryRun });
    // a retry after a concurrent save finds the first pass's entries present: count the first
    // pass's figures and add only what later passes wrote
    total = total ? { ...total, found: c.found, foundLog: c.foundLog, foundActivity: c.foundActivity, written: total.written + c.written,
      conflicts: c.conflicts, conflictIds: c.conflictIds } : c;
    const { doc: next, stripped } = stripDoc(doc);
    const text = JSON.stringify(next);
    const out = { dryRun, ...total, stripped: 0, bytesBefore: Buffer.byteLength(cur.text), bytesAfter: Buffer.byteLength(dryRun ? text : cur.text) };
    if (dryRun) return { status: 200, body: { ...out, wouldStrip: stripped } };
    if (c.conflicts) return { status: 409, body: { ...out, error: 'conflicts', message: 'Some ids are already stored with different content; the document was not changed.' } };
    if (text === cur.text) return { status: 200, body: out }; // nothing inside the document any more
    try {
      await write(text, cur.etag);
      return { status: 200, body: { ...out, stripped, bytesAfter: Buffer.byteLength(text), attempts: attempt + 1 } };
    } catch (e) {
      if (!(e instanceof PreconditionFailed)) throw e;
      // someone saved in between: read again, store what they added, strip again
    }
  }
  return { status: 503, body: { error: 'busy_retry_later', ...total } };
}

export default async function logRoutes(req, res, route) {
  res.setHeader('Cache-Control', 'no-store');
  const method = req.method;
  if (route === 'migrate') {
    if (method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const who = await requireUser(req, res, { admin: true });
    if (!who) return;
    const q = req.query || {};
    const dryRun = ['1', 'true', 'yes'].includes(String(q.dryRun ?? req.body?.dryRun ?? '').toLowerCase());
    try {
      const r = await runMigration({ dryRun });
      return res.status(r.status).json(r.body);
    } catch (e) {
      console.error('[migrate-log]', e);
      return res.status(500).json({ error: e.message });
    }
  }
  if (route !== 'log' && route !== 'activity') return res.status(404).json({ error: 'not_found' });
  if (method !== 'GET' && method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const who = await requireUser(req, res);
  if (!who) return;
  if (!who.user) return res.status(403).json({ error: 'no_access' });
  try {
    const doc = (await currentDoc()) || {};
    if (route === 'log') return method === 'GET' ? await getLog(req, res, who, doc) : await postLog(req, res, who);
    return method === 'GET' ? await getActivity(req, res, who, doc) : await postActivity(req, res, who, doc);
  } catch (e) {
    console.error(`[${route}]`, e);
    return res.status(500).json({ error: e.message });
  }
}
