// What an outside consultant (role "Consultant", e.g. Atlanta) may see and change.
// The browser keeps the rules for display; these are the ones that are enforced.
import { isExternal, PRE_ISSUE, NEXT_STAGE, canActOnStage } from '../../src/utils/workflow.js';

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

function mergeReview(sd, inc, user, project) {
  const s = sd.review, i = inc.review;
  if (!i || JSON.stringify(s) === JSON.stringify(i)) return s;
  const newCycle = !s || (i.cycle || 0) > (s.cycle || 0);
  // a new revision uploaded by the consultant restarts the review (steps 1–2)
  if (newCycle && (inc.versions || []).length > (sd.versions || []).length) return i;
  if (!s) return i;
  // the one move a consultant makes: forward the CRS to the client (step 7)
  const ok = canActOnStage(user, project, s.stage) && s.stage === 'consultant' && NEXT_STAGE[s.stage] === i.stage;
  if (!ok) return s;
  const known = new Set((s.history || []).map(h => h.id));
  return { ...s, stage: i.stage,
    history: [...(s.history || []), ...(i.history || []).filter(h => h?.id && !known.has(h.id))] };
}

function mergeDrawing(sd, inc, user, project) {
  const mine = (x) => x?.authorId === user.id;
  const out = { ...sd };
  // new revisions they uploaded
  const vers = new Set((sd.versions || []).map(v => v.version));
  const added = (inc.versions || []).filter(v => !vers.has(v.version));
  if (added.length) {
    out.versions = [...added, ...(sd.versions || [])];
    out.currentVersion = inc.currentVersion;
    out.pdfData = inc.pdfData;
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
  out.review = mergeReview(sd, inc, user, project);
  out.crsRev = Math.max(sd.crsRev || 0, inc.crsRev || 0); // internal users' browsers rewrite the Excel
  return out;
}

/** Apply a consultant's save to the full workspace. */
export function mergeExternal(full, incoming, user) {
  const allowed = allowedProjectIds(full, user);
  const projects = byId(full.projects);
  const S = byId(full.drawings);
  const drawings = (full.drawings || []).map(sd => {
    if (!allowed.has(sd.projectId)) return sd;
    const inc = (incoming.drawings || []).find(x => x && x.id === sd.id);
    return inc && inc.projectId === sd.projectId ? mergeDrawing(sd, inc, user, projects.get(sd.projectId)) : sd;
  });
  // new submissions registered by the consultant (step 1)
  const fresh = (incoming.drawings || []).filter(d => d?.id && !S.has(d.id) && allowed.has(d.projectId));
  const logIds = new Set((full.activityLog || []).map(l => l.id));
  const newLogs = (incoming.activityLog || []).filter(l => l?.id && !logIds.has(l.id) && l.author === user.name)
    .map(l => ({ ...l, message: String(l.message || '').slice(0, 500) }));
  return {
    ...full,
    drawings: [...fresh, ...drawings],
    activityLog: [...newLogs, ...(full.activityLog || [])].sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 200),
  };
}
