// What an outside consultant (role "Consultant", e.g. Atlanta) may see and change.
// The browser keeps the rules for display; these are the ones that are enforced.
import { isExternal, PRE_ISSUE, NEXT_STAGE, canActOnStage, workflowOn, newReviewFor } from '../../src/utils/workflow.js';

export { isExternal };

const byId = (arr = []) => new Map((Array.isArray(arr) ? arr : []).filter(x => x && x.id).map(x => [x.id, x]));
const hidden = (o) => o?.vis === 'internal';

// The activity log and each drawing's activity trail are stored as append-only objects
// (api/_lib/log.js), not in the workspace document; a save never changes them here.

// Log entries are attributed by user id; entries written before authorId existed, by name.
export const loggedBy = (l, user) => (l?.authorId ? l.authorId === user.id : l?.author === user.name);

export function allowedProjectIds(state, user) {
  return new Set((state.projects || []).filter(p => (p.assignedUsers || []).includes(user.id)).map(p => p.id));
}

/**
 * A drawing as the consultant sees it: TranzEnergy's unpublished comments removed, and
 * never the working CRS workbook, at any stage: it can hold internal comments that no
 * filter reaches inside an .xlsx. Their CRS is rebuilt from this view on the issued copy
 * (consultantCrs in src/utils/crs.js; the issued file stays in review.issued).
 */
function drawingForExternal(d) {
  const out = {
    ...d,
    pins: (d.pins || []).filter(p => !hidden(p)).map(p => ({ ...p, comments: (p.comments || []).filter(c => !hidden(c)) })),
    crsImported: (d.crsImported || []).filter(c => !hidden(c)),
    crsData: null, crsFileName: null, crsLayout: null, crsRowMap: {}, crsClearRows: [],
  };
  // who uploaded the working Excel, and its file name, belong with the working Excel
  delete out.crsUploadedBy;
  // the pipeline's retry keys name the ids of rows it added, internal ones included
  delete out.pipelineAppends;
  // before issue, rows read from the working Excel are TranzEnergy's own, and so is the
  // category we propose (it reaches the consultant on the issued sheet)
  if (d.review && PRE_ISSUE.has(d.review.stage)) {
    out.crsImported = out.crsImported.filter(c => c.local);
    out.review = { ...d.review, proposedCategory: null, history: (d.review.history || []).filter(h => h?.action !== 'proposed') };
  }
  return out;
}

/** The part of the workspace an outside consultant receives. */
export function externalView(state, user) {
  const allowed = allowedProjectIds(state, user);
  const projects = (state.projects || []).filter(p => allowed.has(p.id));
  const people = new Set([user.id, ...projects.flatMap(p => p.assignedUsers || [])]);
  return {
    users: (state.users || []).filter(u => people.has(u.id)).map(u => (
      u.id === user.id ? u : { id: u.id, name: u.name, role: u.role, avatar: u.avatar, color: u.color, org: u.org }
    )),
    projects,
    drawings: (state.drawings || []).filter(d => allowed.has(d.projectId)).map(drawingForExternal),
    proposals: [],
    disciplines: state.disciplines || [],
    org: state.org || {},
  };
}

/** Every stored-file link the consultant can open. */
export function filesInView(view) {
  const s = new Set();
  const add = (u) => { if (u) s.add(u); };
  for (const d of view.drawings || []) {
    add(d.pdfData); add(d.crsData); add(d.crsPdf);
    (d.versions || []).forEach(v => add(v.pdfData));
    add(d.review?.issued?.url);
    (d.review?.cycles || []).forEach(c => add(c.issued?.url));
  }
  for (const p of view.projects || []) add(p.workflow?.crsTemplate?.url);
  return s;
}

/** Every stored-file link anywhere in the workspace. */
export function filesInWorkspace(state) {
  const s = filesInView({ drawings: state.drawings, projects: state.projects });
  for (const p of state.proposals || []) if (p?.fileData) s.add(p.fileData);
  return s;
}

/**
 * A file link a consultant supplies: one they just uploaded under drawings/, or one this
 * drawing already had. A link to another record's file is dropped, because /api/file
 * lets them open every file their view links to.
 */
function fileLink(u, taken, own) {
  if (typeof u !== 'string' || !u) return null;
  if (own.has(u)) return u;
  if (taken.has(u)) return null;
  if (u.startsWith('/api/file?')) {
    const key = new URL(u, 'http://x').searchParams.get('key') || '';
    return /^drawings\//.test(key) && !key.includes('..') ? u : null;
  }
  return /^https?:\/\//.test(u) ? u : null;
}

const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
const nowIso = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A revision the consultant uploaded, field by field. */
function cleanVersion(v, user, taken, own) {
  if (!v || typeof v.version !== 'string' || !v.version.trim()) return null;
  return {
    version: str(v.version, 40), date: str(v.date, 40), author: user.name,
    changeSummary: str(v.changeSummary, 2000), pdfData: fileLink(v.pdfData, taken, own),
  };
}

// A review history entry written by the server for a consultant's action
const serverEntry = (user) => (action, extra = {}) => ({
  id: uid('wf'), at: nowIso(), by: user.id, byName: user.name, action, ...extra,
});

/** Something the consultant writes (pin, comment, CRS item): theirs by id and name, never internal. */
function ownedBy(user) {
  return (x) => {
    const o = { ...x, authorId: user.id };
    delete o.vis;
    // who uploaded an internal CRS Excel is set by the server for internal users only
    delete o.uploadedBy;
    if ('author' in o) o.author = user.name;
    if ('commentBy' in o) o.commentBy = user.name;
    return o;
  };
}

/**
 * Union by id: they can add; they can edit only what they wrote themselves, and remove it
 * only when the save names it in `deleted`. A record missing from the save (a second or
 * stale tab) stays.
 */
function unionAdd(server = [], incoming = [], mayEdit = () => false, { deleted = new Set(), clean = (x) => x } = {}) {
  const S = byId(server);
  const I = byId(incoming);
  const out = (Array.isArray(server) ? server : []).filter(x => !(x && deleted.has(x.id) && mayEdit(x, x))).map(x => {
    const inc = x && I.get(x.id);
    return inc && mayEdit(x, inc) ? clean(inc) : x;
  });
  for (const inc of I.values()) if (!S.has(inc.id) && !deleted.has(inc.id)) out.push(clean(inc));
  return out;
}

// ids the consultant deleted in this save (markDeleted in src/AppContext.jsx)
const deletedIds = (inc) => new Set((Array.isArray(inc.deletedIds) ? inc.deletedIds : []).map(String));

/** Pins, their comments and CRS items: theirs to add, edit and, on an explicit marker, delete. */
function mergeComments(sd, inc, user) {
  const deleted = deletedIds(inc);
  const mine = (x) => x?.authorId === user.id;
  const both = (s, i) => mine(s) && mine(i);
  const clean = ownedBy(user);
  const SP = byId(sd.pins);
  const IP = byId(inc.pins);
  const pins = unionAdd(sd.pins, inc.pins, both, { deleted, clean }).map(p => {
    const sp = SP.get(p.id), ip = IP.get(p.id);
    // a new pin: every comment in it is theirs
    if (!sp) return { ...p, comments: [...byId(p.comments).values()].filter(c => !deleted.has(c.id)).map(clean) };
    // a known pin: comments merged against the stored ones, never taken from the browser
    return { ...p, comments: ip ? unionAdd(sp.comments, ip.comments, both, { deleted, clean }) : (sp.comments || []) };
  });
  const crsImported = unionAdd(sd.crsImported, (Array.isArray(inc.crsImported) ? inc.crsImported : []).filter(c => c?.local), both, { deleted, clean });
  return { pins, crsImported };
}

function mergeReview(sd, out, inc, user, project, newRevision) {
  const s = sd.review, i = inc.review;
  // a new revision uploaded by the consultant restarts the review at step 1 (steps 1–2).
  // The server builds it from the project's settings; from the browser only the
  // uploader's note for the reviewers is taken.
  if (newRevision && workflowOn(project)) {
    return newReviewFor(out, project, s, { entry: serverEntry(user), note: str(i?.note?.text, 2000), by: user.name });
  }
  if (!s || !i || JSON.stringify(s) === JSON.stringify(i)) return s;
  // the one move a consultant makes: forward the CRS to the client (step 7)
  const ok = canActOnStage(user, project, s.stage) && s.stage === 'consultant' && NEXT_STAGE[s.stage] === i.stage;
  if (!ok) return s;
  // Everything else is the stored review: our proposed category, the due date and its
  // source, the client's category are never taken from a consultant's save.
  // The history entry is written here; only the consultant's note comes from the browser.
  const known = new Set((s.history || []).map(h => h?.id));
  const theirs = (Array.isArray(i.history) ? i.history : []).filter(h => h?.id && !known.has(h.id)).pop();
  return { ...s, stage: i.stage,
    history: [...(s.history || []), serverEntry(user)('advanced', { from: s.stage, to: i.stage, note: str(theirs?.note, 2000) })] };
}

function mergeDrawing(sd, inc, user, project, taken) {
  const out = { ...sd };
  const own = filesInView({ drawings: [sd] });
  // new revisions they uploaded
  const vers = new Set((sd.versions || []).map(v => v.version));
  const added = (Array.isArray(inc.versions) ? inc.versions : []).filter(v => v && !vers.has(v.version))
    .map(v => cleanVersion(v, user, taken, own)).filter(Boolean);
  if (added.length) {
    out.versions = [...added, ...(sd.versions || [])];
    out.currentVersion = str(inc.currentVersion, 40) || added[0].version;
    out.pdfData = fileLink(inc.pdfData, taken, own) || added[0].pdfData || sd.pdfData;
    if (sd.expected) out.expected = false; // first file of a record listed in the MDL
  }
  for (const k of ['title', 'description', 'subType', 'clientName', 'consultant', 'contractor']) {
    if (typeof inc[k] === 'string' && inc[k] !== sd[k]) out[k] = inc[k];
  }
  Object.assign(out, mergeComments(sd, inc, user));
  // their browser has no working Excel to mark; flag it here so an internal tab rewrites it
  const commentsChanged = JSON.stringify([sd.pins, sd.crsImported]) !== JSON.stringify([out.pins, out.crsImported]);
  out.review = mergeReview(sd, out, inc, user, project, added.length > 0);
  out.crsRev = Math.max(sd.crsRev || 0, inc.crsRev || 0, commentsChanged && sd.crsData ? (sd.crsRev || 0) + 1 : 0); // internal users' browsers rewrite the Excel
  return out;
}

/** A submission the consultant registers (step 1), built field by field. */
function freshDrawing(inc, user, project, taken) {
  const none = new Set();
  const versions = [...new Map((Array.isArray(inc.versions) ? inc.versions : [])
    .map(v => cleanVersion(v, user, taken, none)).filter(Boolean).map(v => [v.version, v])).values()];
  const d = {
    id: String(inc.id),
    code: str(inc.code, 120).toUpperCase().trim(),
    title: str(inc.title) || 'Untitled Drawing',
    description: str(inc.description, 2000),
    discipline: str(inc.discipline, 120) || 'Other',
    subType: str(inc.subType, 120),
    projectId: inc.projectId,
    currentVersion: str(inc.currentVersion, 40) || versions[0]?.version || 'R0',
    pdfData: fileLink(inc.pdfData, taken, none) || versions[0]?.pdfData || null,
    crsData: null,
    clientName: str(inc.clientName, 200),
    consultant: str(inc.consultant, 200),
    contractor: str(inc.contractor, 200),
    versions,
    ...mergeComments({}, inc, user),
  };
  // the review starts on the server's values; only the uploader's note is taken
  if (workflowOn(project)) d.review = newReviewFor(d, project, null, { entry: serverEntry(user), note: str(inc.review?.note?.text, 2000), by: user.name });
  return d;
}

/** Apply a consultant's save to the full workspace. */
export function mergeExternal(full, incoming, user) {
  const allowed = allowedProjectIds(full, user);
  const projects = byId(full.projects);
  const S = byId(full.drawings);
  const I = byId(incoming.drawings);
  const taken = filesInWorkspace(full);
  const drawings = (full.drawings || []).map(sd => {
    if (!allowed.has(sd.projectId)) return sd;
    const inc = I.get(sd.id);
    return inc && inc.projectId === sd.projectId ? mergeDrawing(sd, inc, user, projects.get(sd.projectId), taken) : sd;
  });
  // new submissions registered by the consultant (step 1)
  const fresh = [...I.values()].filter(d => !S.has(d.id) && allowed.has(d.projectId))
    .map(d => freshDrawing(d, user, projects.get(d.projectId), taken));
  // their log and activity entries are taken out of the save by extractFromSave (api/_lib/log.js)
  return { ...full, drawings: [...fresh, ...drawings] };
}
