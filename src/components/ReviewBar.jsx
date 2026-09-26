import React, { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppContext } from '../AppContext';
import { X, Clock, History, Send, CheckCircle2, Flag, Download, PlayCircle, AlertTriangle } from 'lucide-react';
import {
  STAGE, CATEGORIES, NEXT_STAGE, workflowOn, isExternal, canActOnStage, stageActors,
  dueState, today, openCommentCount, finalCheckOn, issuingStage, stageName,
} from '../utils/workflow';

const shortName = (s, fallback) => (s || fallback).replace(/\s*\(.*\)\s*$/, '');
// stored R2 files download (rather than open) with ?download=1
export const dlHref = (url) => (String(url || '').startsWith('/api/file?') ? `${url}&download=1` : url);

/**
 * The steps shown on the strip, named after the people doing them.
 * Each step lists the review stages during which it is the current one.
 */
function stepList(project, users) {
  const wf = project.workflow || {};
  const cons = shortName(wf.consultantName, 'Consultant');
  const client = shortName(wf.clientName, 'Client');
  const who = (key) => {
    const names = (wf[key] || []).map(id => users.find(u => u.id === id)?.name?.split(' ')[0]).filter(Boolean);
    return names.length ? names.slice(0, 2).join('/') + (names.length > 2 ? '+' : '') : '';
  };
  const steps = [
    { key: 'upload', label: `${cons} upload`, stages: ['resubmit'] },
    { key: 'ir1', label: 'TE Engineer 1', stages: ['ir1'] },
    { key: 'ir2', label: finalCheckOn(wf) ? 'TE Review Engineer' : 'TE Review Engineer + CRS', stages: ['ir2'] },
    ...(finalCheckOn(wf) ? [{ key: 'approval', label: who('approvers') ? `${who('approvers')} check` : 'Final check', stages: ['approval'] }] : []),
    { key: 'consultant', label: `${cons} → ${client}`, stages: ['consultant'] },
    { key: 'client', label: `${client} category`, stages: ['client'] },
  ];
  return steps.map((st, i) => ({ ...st, n: i + 1 }));
}

export function ReviewBar({ drawing }) {
  const ctx = useContext(AppContext);
  const { projects, users, currentUser, canDo, startReview, recordDownload } = ctx;
  const project = projects.find(p => p.id === drawing.projectId);
  const [modal, setModal] = useState(null); // 'advance' | 'issue' | 'category' | 'history' | 'due' | 'stage'
  if (!workflowOn(project)) return null;
  const wf = project.workflow;
  const r = drawing.review;
  const external = isExternal(currentUser);

  if (!r && drawing.expected) {
    return (
      <div className="review-bar review-bar-empty">
        <span>Listed in the MDL, not received yet. The review starts when the file is uploaded.</span>
      </div>
    );
  }
  if (!r) {
    if (external || !canDo('upload')) return null;
    return (
      <div className="review-bar review-bar-empty">
        <span>This drawing isn't in the review workflow yet.</span>
        <button className="btn btn-secondary btn-sm" onClick={() => startReview(drawing.id)}>
          <PlayCircle size={14} /> Start review of {drawing.currentVersion}
        </button>
      </div>
    );
  }

  const steps = stepList(project, users);
  const step = r.stage === 'closed' ? steps.length + 1 : (steps.find(st => st.stages.includes(r.stage))?.n ?? 0);
  const done = r.stage === 'closed';
  const due = dueState(r);
  const actors = stageActors(project, r.stage).map(id => users.find(u => u.id === id)?.name).filter(Boolean);
  const assigned = stageActors(project, r.stage);
  const mine = canActOnStage(currentUser, project, r.stage) && (assigned.includes(currentUser?.id) || !assigned.length);
  const stageInfo = STAGE[r.stage];
  const cat = r.category && CATEGORIES.find(c => c.key === r.category);
  const openLeft = r.stage === 'closed' && r.category === '2' ? openCommentCount(drawing) : 0;

  let action = null;
  if (mine && !done) {
    const cons = shortName(wf.consultantName, 'consultant');
    if (r.stage === issuingStage(wf)) action = { label: finalCheckOn(wf) ? `Submit to ${cons}` : `Done — ready for ${cons}`, kind: 'issue', icon: Send };
    else if (r.stage === 'ir1' || r.stage === 'ir2') action = { label: stageInfo.action, kind: 'advance', icon: CheckCircle2 };
    else if (r.stage === 'consultant') action = { label: `Send to ${shortName(wf.clientName, 'client')}`, kind: 'advance', icon: Send };
    else if (r.stage === 'client') action = { label: `Record ${shortName(wf.clientName, 'client')} category`, kind: 'category', icon: Flag };
  }

  return (
    <div className="review-bar">
      <div className="review-steps" title={`Review cycle ${r.cycle} · ${r.version}`}>
        {steps.map(s => {
          const state = done || s.n < step ? 'done' : s.n === step ? 'current' : 'todo';
          return (
            <div key={s.n} className={`review-step ${state} ${r.stage === 'resubmit' && s.n === 1 ? 'warn' : ''}`}>
              <span className="review-step-n">{s.n}</span>
              <span className="review-step-label">{s.label}</span>
            </div>
          );
        })}
      </div>

      <div className="review-status">
        <span className="review-cycle">{r.version}{r.cycle > 1 ? ` · cycle ${r.cycle}` : ''}</span>
        {done && cat && <span className="badge badge-success">{cat.label}{openLeft ? ` · ${openLeft} to close` : ''}</span>}
        {r.stage === 'resubmit' && cat && <span className="badge badge-warning">{cat.label} · awaiting resubmission</span>}
        {!done && r.stage !== 'resubmit' && (
          <span className="review-waiting" title={actors.join(', ')}>
            {stageName(project, r.stage)}{actors.length ? ` · ${actors.length > 2 ? `${actors.slice(0, 2).join(', ')} +${actors.length - 2}` : actors.join(', ')}` : ''}
          </span>
        )}
        {due.kind !== 'none' && (
          <button className={`review-due ${due.kind}`} onClick={() => (canDo('manage_projects') || mine) && !external ? setModal('due') : null} title={`Due ${r.dueDate}`}>
            {due.kind === 'overdue' ? <AlertTriangle size={12} /> : <Clock size={12} />} {due.text}
          </button>
        )}
        {r.issued?.url && (
          <a className="review-link" href={dlHref(r.issued.url)} download={r.issued.fileName} onClick={() => recordDownload(drawing.id, 'issued-crs', r.issued.fileName)} title={`CRS issued ${r.issued.at?.slice(0, 10)} by ${r.issued.by}`}>
            <Download size={12} /> Issued CRS
          </a>
        )}
        <button className="btn btn-ghost btn-icon" title="Review history" onClick={() => setModal('history')}><History size={14} /></button>
        {action && (
          <button className="btn btn-primary btn-sm" onClick={() => setModal(action.kind)}>
            <action.icon size={14} /> {action.label}
          </button>
        )}
      </div>

      {r.note?.text && (
        <div className="review-note" title={`${r.note.by} · ${String(r.note.at).slice(0, 16).replace('T', ' ')}`}>
          <span className="review-note-label">Note from {r.note.by}</span> {r.note.text}
        </div>
      )}

      {modal === 'advance' && <AdvanceModal drawing={drawing} project={project} onClose={() => setModal(null)} />}
      {modal === 'issue' && <IssueModal drawing={drawing} project={project} onClose={() => setModal(null)} />}
      {modal === 'category' && <CategoryModal drawing={drawing} project={project} onClose={() => setModal(null)} />}
      {modal === 'history' && <HistoryModal drawing={drawing} project={project} onClose={() => setModal(null)} onChangeStage={canDo('admin') && !external ? () => setModal('stage') : null} />}
      {modal === 'due' && <DueModal drawing={drawing} onClose={() => setModal(null)} />}
      {modal === 'stage' && <StageModal drawing={drawing} onClose={() => setModal(null)} />}
    </div>
  );
}

function Modal({ title, sub, children, footer, onClose, wide }) {
  // rendered at the top of the page so no panel can cover it
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-lg' : ''}`} onClick={e => e.stopPropagation()} style={wide ? undefined : { maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

function NoteField({ value, onChange, placeholder }) {
  return (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">Note (optional)</label>
      <textarea className="form-input" rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function AdvanceModal({ drawing, project, onClose }) {
  const { advanceReview, users } = useContext(AppContext);
  const [note, setNote] = useState('');
  const r = drawing.review;
  const to = NEXT_STAGE[r.stage];
  const next = stageActors(project, to).map(id => users.find(u => u.id === id)?.name).filter(Boolean);
  const cons = shortName(project.workflow.consultantName, 'the consultant');
  const client = shortName(project.workflow.clientName, 'the client');
  const nextName = to === 'ir2' ? 'the TE Review Engineer' : (next[0]?.split(' ')[0] || 'the next reviewer');
  const text = {
    ir1: `Your comments go to ${nextName}${finalCheckOn(project.workflow) ? '' : `, who reviews, adds the CRS comments and makes it ready for ${cons}`}. They stay internal until the CRS goes to ${cons}.`,
    ir2: 'The merged comments go to the final check before submission.',
    consultant: `Records that ${cons} has sent the CRS to ${client}. The review then waits for ${client}'s category.`,
  }[r.stage];
  return (
    <Modal title={r.stage === 'consultant' ? `Send to ${client}` : STAGE[r.stage].action} sub={`${drawing.code} · ${drawing.currentVersion}`} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { advanceReview(drawing.id, note.trim()); onClose(); }}>
          <CheckCircle2 size={14} /> {r.stage === 'consultant' ? `Sent to ${client}` : `Done — hand over to ${nextName}`}
        </button>
      </>}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>{text}</p>
      {r.stage !== 'consultant' && (
        <p style={{ fontSize: 13, marginTop: 0 }}>Next: <strong>{stageName(project, to)}</strong>{next.length ? ` — ${next.join(', ')}` : ''}</p>
      )}
      {r.stage === 'consultant' && <p style={{ fontSize: 13, marginTop: 0 }}>Add {cons}'s own comments on the drawing or in the CRS first, if any.</p>}
      <NoteField value={note} onChange={setNote} placeholder="Anything the next person should know" />
    </Modal>
  );
}

function IssueModal({ drawing, project, onClose }) {
  const { issueToConsultant, users } = useContext(AppContext);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const wf = project.workflow;
  const count = (drawing.pins || []).filter(p => (p.comments || []).length).length + (drawing.crsImported || []).filter(c => String(c.comment || '').trim()).length;
  const notify = [...new Set([...(wf.consultantUsers || []), ...(wf.issueNotify || [])])].map(id => users.find(u => u.id === id)?.name).filter(Boolean);
  const go = async () => {
    setBusy(true); setErr('');
    try { await issueToConsultant(drawing.id, note.trim()); onClose(); }
    catch (e) { console.error(e); setErr(e.message || 'Could not build the CRS'); setBusy(false); }
  };
  return (
    <Modal title={finalCheckOn(wf) ? `Submit to ${shortName(wf.consultantName, 'consultant')}` : `Review done — ready for ${shortName(wf.consultantName, 'consultant')}`} sub={`${drawing.code} · ${drawing.currentVersion}`} onClose={busy ? () => {} : onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={go} disabled={busy}>
          {busy ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Building the CRS…</> : <><Send size={14} /> {finalCheckOn(wf) ? 'Submit' : `Send CRS to ${shortName(wf.consultantName, 'consultant')}`}</>}
        </button>
      </>}>
      <ul className="review-checklist">
        <li><strong>{count}</strong> comment{count === 1 ? '' : 's'} go into the CRS{wf.crsTemplate?.fileName ? <> using the contractual template <strong>{wf.crsTemplate.fileName}</strong></> : ' (standard DMS format — no contractual template set for this project)'}.</li>
        <li>Internal comments become visible to {shortName(wf.consultantName, 'the consultant')}.</li>
        <li>Notified: {notify.length ? notify.join(', ') : <em>nobody set up yet — see Workflow settings</em>}.</li>
        <li>{shortName(wf.consultantName, 'The consultant')} then sends it to {shortName(wf.clientName, 'the client')}.</li>
      </ul>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Check the merged comments in the CRS view first. A copy of the sheet as sent is kept with the review history.</p>
      <NoteField value={note} onChange={setNote} placeholder="Covering note for the consultant" />
      {err && <div className="review-error">⚠️ {err}</div>}
    </Modal>
  );
}

function CategoryModal({ drawing, project, onClose }) {
  const { recordCategory } = useContext(AppContext);
  const [cat, setCat] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const client = shortName(project.workflow.clientName, 'Client');
  return (
    <Modal title={`${client} review category`} sub={`${drawing.code} · ${drawing.currentVersion}`} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!cat} onClick={() => { recordCategory(drawing.id, cat, note.trim(), date); onClose(); }}>
          <Flag size={14} /> Record
        </button>
      </>}>
      <div className="review-cats">
        {CATEGORIES.map(c => (
          <label key={c.key} className={`review-cat ${cat === c.key ? 'on' : ''} ${c.closes ? 'ok' : 'bad'}`}>
            <input type="radio" name="cat" value={c.key} checked={cat === c.key} onChange={() => setCat(c.key)} />
            <span><strong>{c.label}</strong><br /><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.desc}</span></span>
          </label>
        ))}
      </div>
      {cat && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {CATEGORIES.find(c => c.key === cat).closes
            ? (cat === '2' ? 'The review closes; open comments stay tracked until they are resolved.' : 'The review closes.')
            : 'The drawing waits for the contractor to resubmit. The next revision restarts the review with these comments carried forward.'}
        </p>
      )}
      <div className="form-group">
        <label className="form-label">Date issued by {client}</label>
        <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <NoteField value={note} onChange={setNote} placeholder="Reference letter / transmittal no." />
    </Modal>
  );
}

function DueModal({ drawing, onClose }) {
  const { setReviewDue } = useContext(AppContext);
  const [date, setDate] = useState(drawing.review.dueDate || today());
  return (
    <Modal title="Change due date" sub={`${drawing.code} · ${drawing.currentVersion}`} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { setReviewDue(drawing.id, date); onClose(); }}>Save</button>
      </>}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Due date</label>
        <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
      </div>
    </Modal>
  );
}

function StageModal({ drawing, onClose }) {
  const { setReviewStage } = useContext(AppContext);
  const [stage, setStage] = useState(drawing.review.stage);
  const [note, setNote] = useState('');
  return (
    <Modal title="Move review to another stage" sub="Admin correction — recorded in the history" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { setReviewStage(drawing.id, stage, note.trim()); onClose(); }}>Move</button>
      </>}>
      <div className="form-group">
        <label className="form-label">Stage</label>
        <select className="form-input" value={stage} onChange={e => setStage(e.target.value)}>
          {Object.values(STAGE).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <NoteField value={note} onChange={setNote} placeholder="Why" />
    </Modal>
  );
}

const ACTION_TEXT = {
  registered: 'Registered and sent to internal review 1',
  resubmitted: 'New revision received — review restarted',
  advanced: 'Handed over',
  issued: 'CRS submitted to the consultant',
  category: 'Client category recorded',
  due: 'Due date changed',
  moved: 'Stage changed',
};

function HistoryModal({ drawing, project, onClose, onChangeStage }) {
  const { recordDownload } = useContext(AppContext);
  const r = drawing.review;
  const items = [...(r.history || [])].reverse();
  return (
    <Modal wide title="Review history" sub={`${drawing.code} · now ${r.version}, cycle ${r.cycle}`} onClose={onClose}
      footer={<>
        {onChangeStage && <button className="btn btn-ghost" onClick={onChangeStage} style={{ marginRight: 'auto' }}>Change stage…</button>}
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </>}>
      {(r.cycles || []).length > 0 && (
        <div className="review-cycles">
          {r.cycles.map(c => (
            <div key={c.cycle} className="review-cycle-row">
              <strong>{c.version}</strong> · cycle {c.cycle} · {c.category ? `Category ${c.category}` : (STAGE[c.stage]?.label || c.stage)}
              {c.issued?.url && <a href={dlHref(c.issued.url)} download={c.issued.fileName} onClick={() => recordDownload(drawing.id, 'issued-crs', c.issued.fileName)} className="review-link"><Download size={12} /> CRS as issued</a>}
            </div>
          ))}
        </div>
      )}
      <div className="review-history">
        {items.map(h => (
          <div key={h.id} className="review-history-item">
            <div className="review-history-when">{String(h.at).slice(0, 16).replace('T', ' ')}</div>
            <div>
              <div><strong>{h.byName}</strong> — {ACTION_TEXT[h.action] || h.action}
                {h.from && h.to && h.action !== 'category' && <span style={{ color: 'var(--text-muted)' }}> ({STAGE[h.from]?.label} → {STAGE[h.to]?.label})</span>}
                {h.category && <span> — <strong>Category {h.category}</strong>{h.decidedOn ? ` on ${h.decidedOn}` : ''}</span>}
              </div>
              {h.note && <div className="review-history-note">{h.note}</div>}
              {h.crs?.url && <a href={dlHref(h.crs.url)} download={h.crs.fileName} onClick={() => recordDownload(drawing.id, 'issued-crs', h.crs.fileName)} className="review-link"><Download size={12} /> {h.crs.fileName}</a>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
