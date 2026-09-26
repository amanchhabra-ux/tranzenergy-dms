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

export const CATEGORIES = [
  { key: '1',  label: 'Category 1', desc: 'Approved — no comments',                closes: true },
  { key: '2',  label: 'Category 2', desc: 'Approved with comments — track to close', closes: true },
  { key: '3',  label: 'Category 3', desc: 'Not approved — revise and resubmit',     closes: false },
  { key: '4B', label: 'Category 4B', desc: 'Rejected — resubmit',                    closes: false },
];

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
  consultantName: 'Atlanta (AEL)',
  clientName: 'RPCL',
  firstReviewers: [], secondReviewers: [], approvers: [], consultantUsers: [], issueNotify: [],
  finalCheck: false, // second reviewer's "ready" sends the CRS to the consultant
  crsTemplate: null,
});

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
  if (review.stage === 'closed') return review.category ? `Closed · Cat ${review.category}` : 'Closed';
  if (review.stage === 'resubmit') return `Cat ${review.category} · awaiting resubmission`;
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
