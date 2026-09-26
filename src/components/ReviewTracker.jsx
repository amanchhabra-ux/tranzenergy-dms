import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../AppContext';
import { PlayCircle, AlertTriangle, Inbox, ChevronRight } from 'lucide-react';
import { TAG, describe } from '../utils/activity';
import {
  STAGE, stageName, workflowOn, isExternal, canActOnStage, stageActors, dueState, stageLabel, waitingOn, openCommentCount,
} from '../utils/workflow';

const FILTERS = [
  { key: 'open', label: 'In review' },
  { key: 'mine', label: 'Waiting on me' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'closed', label: 'Closed' },
  { key: 'none', label: 'Not in review' },
  { key: 'all', label: 'All' },
];

function StageChip({ review, project }) {
  if (!review) return <span className="stage-chip none">Not in review</span>;
  return <span className={`stage-chip s-${review.stage}`}>{stageLabel(review, project)}</span>;
}
export { StageChip };

/** Project tab: every drawing's place in the review workflow. */
export function ReviewTracker({ project, onOpenDrawing }) {
  const { drawings, users, currentUser, canDo, startReview } = useContext(AppContext);
  const [filter, setFilter] = useState('open');
  const list = drawings.filter(d => d.projectId === project.id);
  const name = (id) => users.find(u => u.id === id)?.name;

  const rows = useMemo(() => list.map(d => ({ d, r: d.review, due: dueState(d.review) })), [list]);
  const matchFor = (k, x) => {
    const st = x.r?.stage;
    if (k === 'all') return true;
    if (k === 'none') return !x.r;
    if (k === 'closed') return st === 'closed';
    if (k === 'overdue') return x.due.kind === 'overdue';
    if (k === 'mine') return x.r && st !== 'closed' && canActOnStage(currentUser, project, st);
    return x.r && st !== 'closed';
  };
  const shown = rows.filter(x => matchFor(filter, x))
    .sort((a, b) => String(a.r?.dueDate || '9999').localeCompare(String(b.r?.dueDate || '9999')) || a.d.code.localeCompare(b.d.code));
  const notStarted = rows.filter(x => !x.r);

  if (!workflowOn(project)) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div className="empty-state-title">The review workflow is off for this project</div>
        <div className="empty-state-desc">{canDo('manage_projects') ? 'Turn it on with the Workflow button above.' : 'Ask a project manager to turn it on.'}</div>
      </div>
    );
  }

  return (
    <div className="tracker">
      <div className="tracker-bar">
        <div className="seg">
          {FILTERS.map(f => (
            <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
              {f.label} <span className="tracker-count">{rows.filter(x => matchFor(f.key, x)).length}</span>
            </button>
          ))}
        </div>
        {notStarted.length > 0 && canDo('upload') && !isExternal(currentUser) && (
          <button className="btn btn-secondary btn-sm" onClick={() => {
            if (window.confirm(`Start the review for ${notStarted.length} drawing${notStarted.length === 1 ? '' : 's'} not yet in the workflow? Each gets a due date ${project.workflow.turnaroundDays || 14} days from today.`)) {
              notStarted.forEach(x => startReview(x.d.id));
            }
          }}>
            <PlayCircle size={14} /> Start review for {notStarted.length} drawing{notStarted.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      <div className="tracker-table-wrap">
        <table className="tracker-table">
          <thead>
            <tr><th>Drawing</th><th>Rev</th><th>Stage</th><th>With</th><th>Due</th><th>Comments</th><th /></tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={7} className="tracker-empty">Nothing here.</td></tr>}
            {shown.map(({ d, r, due }) => {
              const who = r && r.stage !== 'closed' ? stageActors(project, r.stage).map(name).filter(Boolean) : [];
              const open = openCommentCount(d);
              return (
                <tr key={d.id} onClick={() => onOpenDrawing(d.id)}>
                  <td><div className="tracker-code">{d.code}</div><div className="tracker-title">{d.title}</div></td>
                  <td>{d.currentVersion}{r?.cycle > 1 ? <div className="tracker-sub">cycle {r.cycle}</div> : null}</td>
                  <td><StageChip review={r} project={project} /></td>
                  <td className="tracker-sub">{who.join(', ') || '—'}</td>
                  <td>{due.kind !== 'none' ? <span className={`review-due ${due.kind}`}>{due.kind === 'overdue' && <AlertTriangle size={11} />} {due.text}</span> : <span className="tracker-sub">—</span>}</td>
                  <td className="tracker-sub">{open ? `${open} open` : '—'}</td>
                  <td><ChevronRight size={14} style={{ color: 'var(--text-muted)' }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const WHEN = (iso) => {
  const d = new Date(iso); const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return String(iso).slice(0, 10);
};
const EVENT_TEXT = {
  registered: 'registered', resubmitted: 'new revision received', advanced: 'handed over', issued: 'CRS submitted',
  category: 'category recorded', due: 'due date changed', moved: 'stage changed',
};

/** Page: everything waiting on the signed-in person, plus recent review activity. */
export function MyReviews({ onOpenDrawing }) {
  const { currentUser, projects, drawings } = useContext(AppContext);
  const visibleProjects = projects.filter(p => currentUser?.role === 'Admin' || p.assignedUsers?.includes(currentUser?.id));
  const ids = new Set(visibleProjects.map(p => p.id));
  const mine = waitingOn(currentUser, visibleProjects, drawings.filter(d => ids.has(d.projectId)));
  const since = Date.now() - 14 * 86400000;
  // review steps + file / comment activity by other people, newest first
  const updates = drawings.filter(d => ids.has(d.projectId))
    .flatMap(d => {
      const p = visibleProjects.find(x => x.id === d.projectId);
      return [
        ...(d.review?.history || []).map(h => ({ kind: 'review', h, d, p })),
        ...(d.activity || []).map(h => ({ kind: 'activity', h, d, p })),
      ];
    })
    .filter(x => new Date(x.h.at) > since && x.h.by !== currentUser?.id)
    .sort((a, b) => String(b.h.at).localeCompare(String(a.h.at)))
    .slice(0, 40);

  return (
    <div className="theme-light" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      <div className="page-header">
        <div>
          <div className="page-header-title">My reviews</div>
          <div className="page-header-sub">Drawings waiting on you, most urgent first</div>
        </div>
      </div>
      <div className="myreviews">
        {mine.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 16px' }}>
            <Inbox size={30} style={{ color: 'var(--text-muted)' }} />
            <div className="empty-state-title">Nothing waiting on you</div>
          </div>
        ) : (
          <div className="myreviews-list">
            {mine.map(({ drawing: d, project: p, review: r, due }) => (
              <button key={d.id} className="myreviews-item" onClick={() => onOpenDrawing(p.id, d.id)}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tracker-code">{p.code} · {d.code} · {d.currentVersion}</div>
                  <div className="tracker-title">{d.title}</div>
                </div>
                <span className={`stage-chip s-${r.stage}`}>{stageName(p, r.stage)}</span>
                {due.kind !== 'none' && <span className={`review-due ${due.kind}`}>{due.text}</span>}
                <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        <div className="myreviews-head">Recent activity</div>
        {updates.length === 0 ? <div className="tracker-sub" style={{ padding: '4px 2px' }}>Nothing new from others in the last two weeks.</div> : (
          <div className="myreviews-updates">
            {updates.map(({ kind, h, d, p }) => kind === 'activity' ? (
              <button key={h.id} className="myreviews-update" onClick={() => onOpenDrawing(p.id, d.id)}>
                <span className="tracker-sub" style={{ width: 80, flexShrink: 0 }}>{WHEN(h.at)}</span>
                <span className={`act-tag ${TAG[h.type]?.cls || ''}`}>{TAG[h.type]?.label || h.type}</span>
                <span style={{ flex: 1, minWidth: 0 }} className="truncate">
                  <strong>{d.code}</strong> — {describe(h)}
                  <span className="tracker-sub"> · {h.byName}</span>
                </span>
              </button>
            ) : (
              <button key={h.id} className="myreviews-update" onClick={() => onOpenDrawing(p.id, d.id)}>
                <span className="tracker-sub" style={{ width: 80, flexShrink: 0 }}>{WHEN(h.at)}</span>
                <span className="act-tag review">Review</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{d.code}</strong> {d.currentVersion} — {EVENT_TEXT[h.action] || h.action}
                  {h.to && h.action !== 'category' ? ` → ${STAGE[h.to]?.label}` : ''}{h.category ? ` · Category ${h.category}` : ''}
                  <span className="tracker-sub"> · {h.byName}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Count for the sidebar badge. */
export function useMyReviewCount() {
  const { currentUser, projects, drawings } = useContext(AppContext);
  const visible = projects.filter(p => currentUser?.role === 'Admin' || p.assignedUsers?.includes(currentUser?.id));
  const ids = new Set(visible.map(p => p.id));
  const list = waitingOn(currentUser, visible, drawings.filter(d => ids.has(d.projectId)));
  return { total: list.length, overdue: list.filter(x => x.due.kind === 'overdue').length };
}
