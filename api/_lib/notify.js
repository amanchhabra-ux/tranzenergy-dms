// Workflow notifications (email). In-app alerts are worked out in the browser from the
// review stages; this sends the same events by email once RESEND_API_KEY is set in Vercel.
//   RESEND_API_KEY   — from resend.com
//   NOTIFY_FROM      — e.g. "Company DMS <dms@company.com>" (a verified sender)
//   APP_URL          — e.g. https://company-dms.vercel.app (else the App link in Admin → Organisation)
// The sender's display name can also be set in Admin → Organisation.
import { STAGE, stageActors } from '../../src/utils/workflow.js';
import { orgOf } from '../../src/utils/org.js';

/** "Name <address>" for the From line: the org's email name, else NOTIFY_FROM's, else the org name. */
export function fromLine(org, notifyFrom = '') {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(notifyFrom);
  const address = m ? m[2].trim() : (notifyFrom.includes('@') ? notifyFrom.trim() : 'onboarding@resend.dev');
  const name = (org.emailFromName || (m && m[1].trim()) || org.name).replace(/["<>]/g, '');
  return `${name} <${address}>`;
}

/** Review stage changes between two versions of the workspace. */
export function reviewEvents(before, after) {
  const old = new Map((before?.drawings || []).map(d => [d.id, d]));
  const events = [];
  for (const d of after?.drawings || []) {
    const r = d.review;
    if (!r) continue;
    const o = old.get(d.id)?.review;
    if (o && o.stage === r.stage && o.cycle === r.cycle) continue;
    events.push({ drawing: d, from: o?.stage || null, to: r.stage, cycle: r.cycle });
  }
  return events;
}

function recipients(state, ev) {
  const project = (state.projects || []).find(p => p.id === ev.drawing.projectId);
  if (!project?.workflow?.enabled) return { project, ids: [] };
  let ids = stageActors(project, ev.to);
  if (ev.to === 'consultant') ids = [...ids, ...(project.workflow.issueNotify || [])]; // step 6: Atlanta + Noor
  if (ev.to === 'client') ids = [...ids, ...(project.workflow.approvers || [])];        // step 7: forwarded
  return { project, ids: [...new Set(ids)] };
}

export async function sendReviewEmails(state, events) {
  if (!events.length) return;
  const key = process.env.RESEND_API_KEY;
  const users = new Map((state.users || []).map(u => [u.id, u]));
  const org = orgOf(state.org);
  const app = process.env.APP_URL || org.appUrl || '';
  const from = fromLine(org, process.env.NOTIFY_FROM || '');
  const jobs = [];
  for (const ev of events) {
    const { project, ids } = recipients(state, ev);
    const to = ids.map(id => users.get(id)?.email).filter(Boolean);
    if (!to.length) continue;
    const d = ev.drawing;
    const stage = STAGE[ev.to]?.label || ev.to;
    const subject = `[${project?.code || 'DMS'}] ${d.code} ${d.currentVersion} — ${stage}`;
    const due = d.review?.dueDate && !['closed', 'resubmit'].includes(ev.to) ? `Due ${d.review.dueDate}. ` : '';
    const text = `${d.code} ${d.currentVersion} — ${d.title}\nNow: ${stage}. ${due}\n${app ? `\nOpen the DMS: ${app}\n` : ''}\n${org.name}\n`;
    if (!key) { console.log('[notify] (email off) →', to.join(', '), '|', subject); continue; }
    jobs.push(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text }),
    }).then(r => { if (!r.ok) console.error('[notify] email failed', r.status); }).catch(e => console.error('[notify]', e.message)));
  }
  // don't hold the save up for long
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 4000))]);
}
