// What an outside consultant (role "Consultant", e.g. Atlanta) may see and change.
// The browser keeps the rules for display; these are the ones that are enforced.
import { isExternal, PRE_ISSUE, NEXT_STAGE, canActOnStage, workflowOn, newReviewFor } from '../../src/utils/workflow.js';

export { isExternal };

const byId = (arr = []) => new Map(arr.filter(x => x && x.id).map(x => [x.id, x]));
const hidden = (o) => o?.vis === 'internal';

export function allowedProjectIds(state, user) {
  return new Set((state.projects || []).filter(p => (p.assignedUsers || []).includes(user.id)).map(p => p.id));
}

/** A drawing as the consultant sees it: TranzEnergy's unpublished comments removed. */
function drawingForExternal(d) {
  const out = {
    ...d,
    pins: (d.pins || []).filter(p => !hidden(p)).map(p => ({ ...p, comments: (p.comments || []).filter(c => !hidden(c)) })),
    crsImported: (d.crsImported || []).filter(c => !hidden(c)),
    activity: (d.activity || []).filter(e => !hidden(e)),
  };
  if (d.review && PRE_ISSUE.has(d.review.stage)) {
    // the working CRS Excel may already hold internal comments — show only what was issued
    const lastIssued = d.review.issued || (d.review.cycles || []).slice(-1)[0]?.issued || null;
    out.crsData = lastIssued?.url || null;
    out.crsFileName = lastIssued?.fileName || null;
    out.crsLayout = null; out.crsRowMap = {};
    out.crsImported = out.crsImported.filter(c => c.local);
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
    activityLog: (state.activityLog || []).filter(l => l.author === user.name),
    disciplines: state.disciplines || [],
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
function filesInWorkspace(state) {
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

// union by id: they can add; they can edit or remove only what they wrote themselves
function unionAdd(server = [], incoming = [], mayEdit = () => false) {
  const S = byId(server);
  const I = byId(incoming);
  const out = server.filter(x => I.has(x.id) || !mayEdit(x, x)).map(x => {
    const inc = I.get(x.id);
    return inc && mayEdit(x, inc) ? inc : x;
  });
  for (const inc of incoming) if (inc?.id && !S.has(inc.id)) out.push(inc);
  return out;
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
  // the history entry is written here; only the consultant's note comes from the browser
  const known = new Set((s.history || []).map(h => h?.id));
  const theirs = (Array.isArray(i.history) ? i.history : []).filter(h => h?.id && !known.has(h.id)).pop();
  return { ...s, stage: i.stage,
    history: [...(s.history || []), serverEntry(user)('advanced', { from: s.stage, to: i.stage, note: str(theirs?.note, 2000) })] };
}

function mergeDrawing(sd, inc, user, project, taken) {
  const mine = (x) => x?.authorId === user.id;
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
  }
  for (const k of ['title', 'description', 'subType', 'clientName', 'consultant', 'contractor']) {
    if (typeof inc[k] === 'string' && inc[k] !== sd[k]) out[k] = inc[k];
  }
  out.pins = unionAdd(sd.pins, inc.pins, (s, i) => mine(s) && mine(i)).map(p => {
    const ip = (inc.pins || []).find(x => x.id === p.id);
    if (!ip) return p;
    return { ...p, comments: unionAdd(p.comments, ip.comments, (s, i) => mine(s) && mine(i)) };
  });
  out.crsImported = unionAdd(sd.crsImported, (inc.crsImported || []).filter(c => c.local), (s, i) => mine(s) && mine(i));
  out.review = mergeReview(sd, out, inc, user, project, added.length > 0);
  // their own new activity entries (uploads, downloads, comments)
  const seen = new Set((sd.activity || []).map(e => e.id));
  const mineNew = (inc.activity || []).filter(e => e?.id && !seen.has(e.id) && e.by === user.id && !e.vis);
  if (mineNew.length) out.activity = [...(sd.activity || []), ...mineNew].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-150);
  out.crsRev = Math.max(sd.crsRev || 0, inc.crsRev || 0); // internal users' browsers rewrite the Excel
  return out;
}

/** Apply a consultant's save to the full workspace. */
export function mergeExternal(full, incoming, user) {
  const allowed = allowedProjectIds(full, user);
  const projects = byId(full.projects);
  const S = byId(full.drawings);
  const taken = filesInWorkspace(full);
  const drawings = (full.drawings || []).map(sd => {
    if (!allowed.has(sd.projectId)) return sd;
    const inc = (incoming.drawings || []).find(x => x && x.id === sd.id);
    return inc && inc.projectId === sd.projectId ? mergeDrawing(sd, inc, user, projects.get(sd.projectId), taken) : sd;
  });
  // new submissions registered by the consultant (step 1); their file links checked as above
  const none = new Set();
  const fresh = (incoming.drawings || []).filter(d => d?.id && !S.has(d.id) && allowed.has(d.projectId))
    .map(d => ({ ...d, pdfData: fileLink(d.pdfData, taken, none), crsData: null, crsPdf: null,
      versions: (Array.isArray(d.versions) ? d.versions : []).map(v => cleanVersion(v, user, taken, none)).filter(Boolean) }));
  const logIds = new Set((full.activityLog || []).map(l => l.id));
  const newLogs = (incoming.activityLog || []).filter(l => l?.id && !logIds.has(l.id) && l.author === user.name)
    .map(l => ({ ...l, message: String(l.message || '').slice(0, 500) }));
  return {
    ...full,
    drawings: [...fresh, ...drawings],
    activityLog: [...newLogs, ...(full.activityLog || [])].sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 200),
  };
}
