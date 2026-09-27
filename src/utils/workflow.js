// ─── Document review workflow (TE-002, 25.09.2026) ──────────────────────────
// 1 Consultant (Atlanta) uploads the submission          → drawing registered / new revision
// 2 DMS registers it, sets the due date, notifies IR1   → stage 'ir1'
// 3 First reviewer comments, marks internal review 1    → stage 'ir2'
// 4 TranzEnergy comments, marks internal review 2       → stage 'approval'
// 5 Approver (Aman) checks the merged sheet, submits    → (6) CRS issued in the contractual template
// 6 DMS sends the CRS, notifies Atlanta + Noor          → stage 'consultant'
// 7 Atlanta adds its comments, forwards to RPCL         → stage 'client'
// 8 RPCL issues the review category                      → Cat 1/2: 'closed' · Cat 3/4B: 'resubmit'
//   A new revision after Cat 3/4B restarts at step 1 with the comments carried forward.
//
// RPCL arrangement (26.09.2026) — no separate final check:
//   Atlanta uploads (with a note) → TE Engineer 1 reviews → TE Review Engineer downloads, reviews, adds CRS comments
//   and marks it ready → CRS issued to Atlanta → Atlanta sends it to RPCL → RPCL category.

export const STAGES = [
  { key: 'ir1',        step: 3, label: 'TE Engineer 1',      short: 'TE Eng 1', who: 'firstReviewers',  action: 'Mark my review done' },
  { key: 'ir2',        step: 4, label: 'TE Review Engineer', short: 'TE Review', who: 'secondReviewers', action: 'Mark review done' },
  { key: 'approval',   step: 5, label: 'Final check',        short: 'Check',    who: 'approvers',       action: 'Submit to consultant' },
  { key: 'consultant', step: 7, label: 'With consultant',    short: 'Consultant', who: 'consultantUsers', action: 'Send to client' },
  { key: 'client',     step: 8, label: 'With client',        short: 'Client',   who: 'recorders',       action: 'Record client category' },
  { key: 'resubmit',   step: 1, label: 'Awaiting resubmission', short: 'Resubmit', who: 'consultantUsers', action: 'Upload the new revision' },
  { key: 'closed',     step: 9, label: 'Closed',             short: 'Closed',   who: null,              action: null },
];
export const STAGE = Object.fromEntries(STAGES.map(s => [s.key, s]));
export const NEXT_STAGE = { ir1: 'ir2', ir2: 'approval', approval: 'consultant', consultant: 'client' };
// before the CRS is issued, TranzEnergy's comments are internal (hidden from the consultant)
export const PRE_ISSUE = new Set(['ir1', 'ir2', 'approval']);

// Review categories. A project can set its own list in workflow.categories
// ([{ key, label, desc, closes }], admins only); a project without one uses this list.
// `closes`: the client's category closes the review; otherwise it waits for a resubmission.
export const DEFAULT_CATEGORIES = [
  { key: '1',  label: 'Category 1', desc: 'Approved — no comments',                closes: true },
  { key: '2',  label: 'Category 2', desc: 'Approved with comments — track to close', closes: true },
  { key: '3',  label: 'Category 3', desc: 'Not approved — revise and resubmit',     closes: false },
  { key: '4B', label: 'Category 4B', desc: 'Rejected — resubmit',                    closes: false },
];
/** @deprecated the fixed list; use categoriesOf(project.workflow) */
export const CATEGORIES = DEFAULT_CATEGORIES;

// The legend of the AEL CRS template (Help sheet), TE-002. Only 1 and 4A close a review.
export const AEL_CATEGORIES = [
  { key: '1',   label: 'Category-1',   desc: 'Approved and Distributed.', closes: true },
  { key: '2',   label: 'Category-2',   desc: 'Approved subject to incorporation of comments. Re-submit for approval after incorporation of comments.', closes: false },
  { key: '2*',  label: 'Category-2*',  desc: 'Approved subject to incorporation of comments and re-submission in due course. Meanwhile, please proceed with execution.', closes: false },
  { key: '3',   label: 'Category-3',   desc: 'Not approved. Re-submit for approval after incorporation of comments.', closes: false },
  { key: '4A',  label: 'Category-4A',  desc: 'Kept for record/ reference.', closes: true },
  { key: '4B',  label: 'Category-4B',  desc: 'Re-submit after incorporation of comments to retain for record/ reference.', closes: false },
  { key: '4B*', label: 'Category-4B*', desc: 'Re-submit after incorporation of comments in due course in order to keep for record/ reference. Meanwhile, please proceed with execution.', closes: false },
];

/** The project's category list (wf = project.workflow). */
export function categoriesOf(wf) {
  const list = Array.isArray(wf?.categories) ? wf.categories.filter(c => c && String(c.key ?? '').trim()) : [];
  return list.length ? list.map(c => ({ ...c, key: String(c.key).trim(), closes: c.closes === true })) : DEFAULT_CATEGORIES;
}
export const findCategory = (wf, key) => (key == null || key === '' ? null : categoriesOf(wf).find(c => c.key === String(key)) || null);

/**
 * How a category is written on the issued sheet, in the MDL and in the app: the label from
 * the project's own list when it has one; else the project's categoryFormat ("Category-{key}");
 * else "Category {key}".
 */
export function categoryText(key, wf) {
  if (key == null || key === '') return '';
  const own = Array.isArray(wf?.categories) && wf.categories.length ? findCategory(wf, key) : null;
  if (own?.label) return own.label;
  return String(wf?.categoryFormat || 'Category {key}').replace('{key}', key);
}

/**
 * Step 8: the review after the client's category. A category that closes (per the project's
 * list) closes it; any other waits for the resubmission. null for an unknown category.
 */
export function reviewWithCategory(review, wf, key, { entry, note = '', decidedOn = today() } = {}) {
  const cat = findCategory(wf, key);
  if (!review || !cat) return null;
  const to = cat.closes ? 'closed' : 'resubmit';
  return {
    ...review, stage: to, category: cat.key, decidedOn, closedAt: cat.closes ? today() : null,
    history: [...(review.history || []), entry('category', { from: review.stage, to, category: cat.key, note, decidedOn })],
  };
}

/**
 * Our proposed category, picked at the stage that issues the CRS (steps 4-5). It fills the
 * issued sheet's Review Status and the MDL's "TE category". A history entry records it.
 * null for a category outside the project's list.
 */
export function reviewWithProposed(review, wf, key, { entry } = {}) {
  const cat = findCategory(wf, key);
  if (!review || !cat) return null;
  if (review.proposedCategory === cat.key) return review;
  return {
    ...review, proposedCategory: cat.key,
    history: [...(review.history || []), entry('proposed', { category: cat.key, previous: review.proposedCategory || null })],
  };
}

/** Keys a project's reviews use (current and archived cycles): these cannot be deleted from its list. */
export function categoriesInUse(drawings, projectId) {
  const used = new Set();
  for (const d of drawings || []) {
    if (d?.projectId !== projectId || !d.review) continue;
    const r = d.review;
    [r.category, r.proposedCategory, ...(r.cycles || []).flatMap(c => [c?.category, c?.proposedCategory])]
      .forEach(k => { if (k != null && k !== '') used.add(String(k)); });
  }
  return used;
}

export const DEFAULT_TURNAROUND_DAYS = 14;

export const EXTERNAL_ROLE = 'Consultant';
export const isExternal = (user) => user?.role === EXTERNAL_ROLE;

export const workflowOn = (project) => !!project?.workflow?.enabled;

// Is there a separate final check (step 5) before the CRS goes out? Off for RPCL: the second
// reviewer's "ready" issues the CRS to the consultant directly.
export const finalCheckOn = (wf) => wf?.finalCheck === true;
/** The stage whose completion issues the CRS to the consultant. */
export const issuingStage = (wf) => (finalCheckOn(wf) ? 'approval' : 'ir2');
export const shortOrg = (s, fallback) => (s || fallback).replace(/\s*\(.*\)\s*$/, '');

/** A stage's name for this project ("With Atlanta", "Review & CRS"…). */
export function stageName(project, key) {
  const wf = project?.workflow || {};
  if (key === 'ir2' && !finalCheckOn(wf)) return 'TE Review Engineer + CRS';
  if (key === 'consultant') return `With ${shortOrg(wf.consultantName, 'consultant')}`;
  if (key === 'client') return `With ${shortOrg(wf.clientName, 'client')}`;
  return STAGE[key]?.label || key;
}

export const today = () => new Date().toISOString().slice(0, 10);
export function addDays(dateStr, days) {
  const d = new Date(`${(dateStr || today()).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/** Blank workflow settings for a project. */
export const defaultWorkflow = () => ({
  enabled: true,
  turnaroundDays: DEFAULT_TURNAROUND_DAYS,
  consultantName: '',
  clientName: '',
  firstReviewers: [], secondReviewers: [], approvers: [], consultantUsers: [], issueNotify: [],
  finalCheck: false, // second reviewer's "ready" sends the CRS to the consultant
  crsTemplate: null,
});

/**
 * The review a submission starts with (steps 1-2): internal review 1, due in the
 * project's turnaround days. prev = the drawing's current review when this is a new
 * revision (its cycle is archived, its history kept). entry(action, extra) writes the
 * history entry and `by` names the uploader of `note`, so the browser (AppContext) and
 * the server (api/_lib/view.js) each stamp their own author.
 */
export function newReviewFor(d, project, prev, { entry, note = '', by = '' } = {}) {
  const days = Number(project?.workflow?.turnaroundDays) || DEFAULT_TURNAROUND_DAYS;
  const cycle = (prev?.cycle || 0) + 1;
  const archived = prev ? [...(prev.cycles || []), {
    cycle: prev.cycle, version: prev.version, category: prev.category || null, proposedCategory: prev.proposedCategory || null,
    stage: prev.stage, closedAt: prev.closedAt || null, issued: prev.issued || null,
  }] : [];
  const carried = prev ? (d.pins || []).filter(p => (p.comments || []).length).length + (d.crsImported || []).filter(c => String(c.comment || '').trim()).length : 0;
  const subNote = String(note || '').trim();
  return {
    cycle, version: d.currentVersion || 'R0', stage: 'ir1',
    startedAt: today(), dueDate: addDays(today(), days), category: null, proposedCategory: null, issued: null,
    // the uploader's note for the reviewers (step 1)
    note: subNote ? { text: subNote, by: by || 'Someone', at: new Date().toISOString() } : null,
    cycles: archived,
    history: [...(prev?.history || []), entry(prev ? 'resubmitted' : 'registered', {
      to: 'ir1', version: d.currentVersion || 'R0',
      note: (prev ? `${d.currentVersion} received${carried ? ` — ${carried} comment${carried === 1 ? '' : 's'} carried forward` : ''}. Due ${addDays(today(), days)}.` : `Registered against the MDL. Due ${addDays(today(), days)}.`)
        + (subNote ? `\nNote: ${subNote}` : ''),
    })],
  };
}

/**
 * People who act at a stage (user ids). 'recorders' (step 8 — the client doesn't sign in,
 * TranzEnergy records its category) = approvers + second reviewers. Admins can always act.
 */
export function stageActors(project, stageKey) {
  const wf = project?.workflow || {};
  const who = STAGE[stageKey]?.who;
  if (!who) return [];
  if (who === 'recorders') return [...new Set([...(wf.approvers || []), ...(wf.secondReviewers || [])])];
  return wf[who] || [];
}

export function canActOnStage(user, project, stageKey) {
  if (!user || !stageKey || stageKey === 'closed') return false;
  if (user.role === 'Admin' && !isExternal(user)) return true;
  return stageActors(project, stageKey).includes(user.id);
}

/** Due-date state for display. */
export function dueState(review) {
  if (!review?.dueDate || review.stage === 'closed' || review.stage === 'resubmit') return { kind: 'none', text: '' };
  const left = daysBetween(today(), review.dueDate);
  if (left < 0) return { kind: 'overdue', text: `${-left} day${left === -1 ? '' : 's'} overdue`, left };
  if (left === 0) return { kind: 'soon', text: 'Due today', left };
  if (left <= 3) return { kind: 'soon', text: `Due in ${left} day${left === 1 ? '' : 's'}`, left };
  return { kind: 'ok', text: `Due ${review.dueDate}`, left };
}

export function stageLabel(review, project) {
  if (!review) return 'Not in review';
  const wf = project?.workflow;
  if (review.stage === 'closed') return review.category ? `Closed · ${categoryText(review.category, wf)}` : 'Closed';
  if (review.stage === 'resubmit') return `${categoryText(review.category, wf)} · awaiting resubmission`;
  return project ? stageName(project, review.stage) : (STAGE[review.stage]?.label || review.stage);
}

/** Step number (1–8) the diagram shows as current. */
export function currentStep(review) {
  if (!review) return 0;
  return STAGE[review.stage]?.step ?? 0;
}

/** Items waiting on this user across all visible drawings. */
export function waitingOn(user, projects, drawings) {
  if (!user) return [];
  const byId = new Map(projects.map(p => [p.id, p]));
  const out = [];
  for (const d of drawings) {
    const p = byId.get(d.projectId);
    const r = d.review;
    if (!p || !workflowOn(p) || !r || r.stage === 'closed') continue;
    if (!canActOnStage(user, p, r.stage)) continue;
    // admins see only what's assigned to them, plus anything nobody is assigned to
    if (user.role === 'Admin' && !isExternal(user) && stageActors(p, r.stage).length && !stageActors(p, r.stage).includes(user.id)) continue;
    out.push({ drawing: d, project: p, review: r, due: dueState(r) });
  }
  const rank = { overdue: 0, soon: 1, ok: 2, none: 3 };
  return out.sort((a, b) => (rank[a.due.kind] - rank[b.due.kind]) || String(a.review.dueDate || '').localeCompare(String(b.review.dueDate || '')));
}

/** Open (unresolved) comments on a drawing — used to track Category 2 closure. */
export const openCommentCount = (d) =>
  (d.pins || []).filter(p => !p.resolved && !p.accepted && (p.comments || []).length).length
  + (d.crsImported || []).filter(c => !/^(closed|accepted|resolved)$/i.test(String(c.status || '').trim()) && String(c.comment || '').trim()).length;
