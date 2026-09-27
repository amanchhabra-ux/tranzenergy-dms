// The review pipeline's API (api/pipeline/[action].js): what it may read and the one change
// each call makes to one drawing. Pure functions over the workspace document, so the tests
// call them directly; the handler reads, applies, checks and writes.
//
// Three things only: list a project's drawings, register a received document (new record,
// an expected MDL record's first file, or a new revision), attach a CRS Excel to a drawing
// that has no sheet yet. No stage changes, no comments, no deletes, never a sheet replaced.
import crypto from 'node:crypto';
import { workflowOn, newReviewFor, isExternal } from '../../src/utils/workflow.js';
import { normCode, proposeDiscipline, nextRevision } from '../../src/utils/mdl.js';
import { buildCrsTable, crsFieldUpdates, pinRowMapFromImport } from '../../src/utils/crs.js';

export const VIA = 'pipeline';
// the Vercel request body limit is 4.5 MB; base64 adds a third, so inline files stop at 3 MB
// and larger ones go through upload-url (a presigned PUT straight to storage)
export const MAX_INLINE_BYTES = 3 * 1024 * 1024;
// roles that upload in the app (canDo('upload') in src/AppContext.jsx)
const UPLOAD_ROLES = new Set(['Admin', 'Project Manager', 'Senior Engineer', 'Engineer']);

export class PipelineError extends Error {
  constructor(status, error, extra = {}) { super(error); this.status = status; this.error = error; this.extra = extra; }
}
const fail = (status, error, extra) => { throw new PipelineError(status, error, extra); };

// ─── Token and acting user ─────────────────────────────────────────────────
/**
 * Bearer token check. → 'off' when PIPELINE_TOKEN is unset (the endpoints do not exist),
 * 'weak' when it is shorter than 32 characters, 'ok' or 'bad'. Constant-time compare on the
 * SHA-256 of both values, so the length of the token does not leak either.
 */
export function tokenState(header, token = process.env.PIPELINE_TOKEN) {
  if (!token) return 'off';
  if (String(token).length < 32) return 'weak';
  const m = /^Bearer\s+(\S+)\s*$/i.exec(String(header || ''));
  if (!m) return 'bad';
  const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(h(m[1]), h(token)) ? 'ok' : 'bad';
}

/**
 * The workspace user the pipeline acts as (PIPELINE_USER_EMAIL): must exist and be internal.
 * → { user, isAdmin } in the shape checkSave takes.
 */
export function pipelineUser(state, email = process.env.PIPELINE_USER_EMAIL, admins = new Set()) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) fail(403, 'pipeline_user_not_set');
  const user = (state?.users || []).find(u => String(u?.email || '').trim().toLowerCase() === e);
  if (!user) fail(403, 'pipeline_user_unknown');
  if (isExternal(user)) fail(403, 'pipeline_user_external');
  return { email: e, user, role: user.role, isAdmin: user.role === 'Admin' || admins.has(e) };
}

// ─── Lookups ───────────────────────────────────────────────────────────────
/** A project by id, code or name (exact, case-insensitive), else a unique partial name. */
export function findProject(state, ref) {
  const r = String(ref || '').trim();
  if (!r) fail(400, 'project_required');
  const low = r.toLowerCase();
  const all = (state.projects || []).filter(p => p && p.id != null);
  const exact = all.filter(p => String(p.id) === r || String(p.code || '').toLowerCase() === low || String(p.name || '').toLowerCase() === low);
  const hits = exact.length ? exact : all.filter(p => String(p.name || '').toLowerCase().includes(low));
  if (!hits.length) fail(404, 'project_not_found', { project: r });
  if (hits.length > 1) fail(409, 'project_ambiguous', { matches: hits.map(p => ({ id: p.id, code: p.code, name: p.name })) });
  return hits[0];
}

/** Projects the user sees in the app (ProjectView): admins all, others the assigned ones. */
export function assertAccess(who, project, { write = false } = {}) {
  if (who.user.role !== 'Admin' && !(project.assignedUsers || []).includes(who.user.id)) fail(403, 'project_not_assigned');
  if (write && !UPLOAD_ROLES.has(who.user.role)) fail(403, 'role_cannot_upload', { role: who.user.role });
}

function findDrawing(state, project, code) {
  const k = normCode(code);
  if (!k) fail(400, 'code_required');
  const hits = (state.drawings || []).filter(d => d?.projectId === project.id && normCode(d.code) === k);
  if (hits.length > 1) fail(409, 'code_ambiguous', { code: k, ids: hits.map(d => d.id) });
  return hits[0] || null;
}

// ─── Revisions ─────────────────────────────────────────────────────────────
const cleanRev = (v) => String(v ?? '').toUpperCase().replace(/\s+/g, '');
// R01 and R1 are the same revision
const revKey = (v) => { const r = cleanRev(v); const m = /^R0*(\d+)$/.exec(r); return m ? `R${m[1]}` : r; };
const revNum = (v) => { const m = /^R0*(\d+)$/.exec(cleanRev(v)); return m ? Number(m[1]) : null; };

// ─── Reading ───────────────────────────────────────────────────────────────
/** The CRS state of a drawing as the app shows it: rows = the CRS table (pins + sheet rows). */
export function crsSummary(d) {
  const rows = buildCrsTable(d).length;
  return {
    present: !!d.crsData || rows > 0,
    rows,
    imported: (d.crsImported || []).length,
    pins: (d.pins || []).length,
    fileName: d.crsFileName || null,
  };
}

export function listDrawings(state, project) {
  return (state.drawings || []).filter(d => d?.projectId === project.id).map(d => ({
    id: d.id,
    code: d.code,
    title: d.title || '',
    discipline: d.discipline || '',
    expected: !!d.expected,
    currentVersion: d.expected ? null : (d.currentVersion || null),
    versions: (d.versions || []).map(v => v.version),
    versionCount: (d.versions || []).length,
    review: d.review ? {
      stage: d.review.stage, cycle: d.review.cycle, version: d.review.version,
      dueDate: d.review.dueDate || null, dueSource: d.review.dueSource || null,
      proposedCategory: d.review.proposedCategory || null, category: d.review.category || null,
    } : null,
    crs: crsSummary(d),
  }));
}

// ─── Writing ───────────────────────────────────────────────────────────────
const uid = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const snippet = (t) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > 90 ? `${x.slice(0, 87)}…` : x; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function actor(user, now) {
  return {
    // activity trail entry (ev in src/AppContext.jsx)
    ev: (type, extra = {}) => ({ id: uid('act'), type, at: now, by: user.id, byName: user.name, via: VIA, ...extra }),
    // review history entry (histEntry in src/AppContext.jsx)
    entry: (action, extra = {}) => ({ id: uid('wf'), at: now, by: user.id, byName: user.name, action, via: VIA, ...extra }),
    // workspace log entry (addLog in src/AppContext.jsx)
    log: (message) => ({ id: uid('log'), message, author: user.name, authorId: user.id, time: now, via: VIA }),
  };
}
const versionDate = (now) => now.replace('T', ' ').slice(0, 16);

/** The workspace with one drawing replaced (or added first). */
function commitDrawing(state, drawing, { isNew = false } = {}) {
  return {
    ...state,
    drawings: isNew ? [drawing, ...(state.drawings || [])] : (state.drawings || []).map(d => (d.id === drawing.id ? drawing : d)),
  };
}
// The log and activity entries of a change: stored as objects once the document is written
// (appendEntry in api/_lib/log.js), never inside the document.
const entriesFor = (drawing, activity, log) => ({ log: [log], activity: [{ drawingId: String(drawing.id), entry: { ...activity, drawingId: String(drawing.id) } }] });

/**
 * Register a received document (the file is already stored at fileUrl).
 *  - no record with the code: a new drawing, review started (createDrawing)
 *  - an expected MDL record: its first revision (R0 unless given), review started, expected=false
 *  - a received drawing: a new revision only when `revision` is given and new (uploadRevision)
 * → { state, drawing, outcome: 'created' | 'filled' | 'revision', version, entries }
 */
export function applyRegister(state, { who, project, code, title, revision, fileUrl, fileName, now = new Date().toISOString() }) {
  const user = who.user;
  const { ev, entry, log } = actor(user, now);
  const note = `Pipeline: ${fileName || 'file'}`;
  const start = (d, prev) => (workflowOn(project) ? { ...d, review: newReviewFor(d, project, prev, { entry, by: user.name }) } : d);
  const existing = findDrawing(state, project, code);

  if (!existing) {
    const version = cleanRev(revision) || 'R0';
    const k = normCode(code);
    const d = {
      id: uid('dwg'), code: k, title: String(title || '').trim().slice(0, 500) || k, description: '',
      discipline: proposeDiscipline(k, state.disciplines || []), subType: '', projectId: project.id,
      currentVersion: version, pdfData: fileUrl, crsData: null, clientName: '', consultant: '', contractor: '',
      versions: [{ version, date: versionDate(now), author: user.name, changeSummary: `Initial issue (${note}).`, pdfData: fileUrl }],
      pins: [],
    };
    const started = start(d, null);
    return {
      state: commitDrawing(state, started, { isNew: true }),
      drawing: started, outcome: 'created', version,
      entries: entriesFor(started, ev('upload', { what: 'drawing', version }), log(`Drawing <strong>${esc(k)}</strong> registered by <strong>${esc(user.name)}</strong> via pipeline.`)),
    };
  }

  const expected = !!existing.expected || (!existing.currentVersion && !(existing.versions || []).length);
  if (!expected) {
    if (!cleanRev(revision)) fail(400, 'revision_required', { currentVersion: existing.currentVersion });
    const have = [...new Set((existing.versions || []).map(v => v.version).concat(existing.currentVersion || []))];
    if (have.some(v => revKey(v) === revKey(revision))) fail(409, 'revision_exists', { code: existing.code, revision: cleanRev(revision), versions: have });
    const cur = revNum(existing.currentVersion), given = revNum(revision);
    if (cur != null && given != null && given < cur) fail(409, 'revision_older', { code: existing.code, revision: cleanRev(revision), currentVersion: existing.currentVersion });
  }
  const version = expected ? nextRevision(existing, revision) : cleanRev(revision);
  const summary = `Revision ${version} uploaded (${note}).`;
  const next = {
    ...existing,
    ...(existing.expected ? { expected: false } : {}),
    currentVersion: version,
    pdfData: fileUrl,
    versions: [{ version, date: versionDate(now), author: user.name, changeSummary: summary, pdfData: fileUrl }, ...(existing.versions || [])],
  };
  const started = start(next, existing.review);
  const message = expected
    ? `<strong>${esc(user.name)}</strong> uploaded <strong>${esc(existing.code)}</strong> ${esc(version)} via pipeline: first file received for this MDL record.`
    : `<strong>${esc(user.name)}</strong> uploaded <strong>${esc(version)}</strong> of <strong>${esc(existing.code)}</strong> via pipeline.`;
  return {
    state: commitDrawing(state, started), drawing: started, outcome: expected ? 'filled' : 'revision', version,
    entries: entriesFor(started, ev('upload', { what: 'revision', version, note: snippet(summary) }), log(message)),
  };
}

/**
 * Attach a CRS Excel (already stored at crsUrl, parsed with readCrs) to a drawing's current
 * revision, only when the drawing has no sheet yet (uploadCRS in src/AppContext.jsx).
 * → { state, drawing, rows, entries }
 */
export function applyAttachCrs(state, { who, project, code, crsUrl, fileName, parsed, now = new Date().toISOString() }) {
  const user = who.user;
  const { ev, log } = actor(user, now);
  const d = findDrawing(state, project, code);
  if (!d) fail(404, 'drawing_not_found', { code: normCode(code) });
  if (d.expected || !(d.versions || []).length) fail(409, 'no_revision', { code: d.code });
  const sheet = crsSummary(d);
  if (sheet.present) fail(409, 'sheet_present', { code: d.code, rows: sheet.rows, fileName: sheet.fileName });
  if (!parsed || parsed.fileType !== 'excel') fail(400, 'not_excel', { fileType: parsed?.fileType || null });
  const comments = parsed.comments || [];
  const next = {
    ...d,
    ...crsFieldUpdates(d, parsed.meta || {}),
    crsData: crsUrl,
    crsImported: comments,
    crsMeta: parsed.meta || {},
    crsLayout: parsed.layout || null,
    crsFileType: 'excel',
    crsRowMap: pinRowMapFromImport(d, comments),
    crsFileName: fileName || d.crsFileName || null,
    crsRev: 0, crsSyncedRev: 0, crsSyncError: null,
  };
  return {
    state: commitDrawing(state, next),
    drawing: next, rows: comments.length,
    entries: entriesFor(next, ev('upload', { what: 'crs', fileName: fileName || null, version: d.currentVersion }), log(`CRS uploaded for <strong>${esc(d.code)}</strong> via pipeline.`)),
  };
}

// ─── Read, apply, check, write ─────────────────────────────────────────────
/**
 * Apply one change with optimistic concurrency: read the document and its etag, build the
 * change, run it through `check` (checkSave as the pipeline user), write with If-Match; on a
 * precondition failure read again and retry, up to `retries` more times.
 *   read()  → { text, etag } | { notFound }
 *   write(text, etag) → new etag, throws an error named 'PreconditionFailed' on a lost race
 *   apply(before) → { state, ...result }   (may throw PipelineError)
 *   check(before, next) → null | { status, error }
 */
export async function commitChange({ read, write, apply, check, retries = 3 }) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const cur = await read();
    if (cur.notFound || !cur.text) fail(409, 'no_workspace');
    const before = JSON.parse(cur.text);
    const result = apply(structuredClone(before));
    const refused = check(before, result.state);
    if (refused) fail(refused.status, refused.error);
    try {
      const etag = await write(JSON.stringify(result.state), cur.etag);
      return { ...result, before, etag, attempts: attempt + 1 };
    } catch (e) {
      if (e?.name !== 'PreconditionFailed') throw e;
    }
  }
  return fail(503, 'busy_retry_later');
}
