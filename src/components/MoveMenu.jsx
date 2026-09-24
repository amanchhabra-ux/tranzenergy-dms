import { useContext } from 'react';
import { AppContext } from '../AppContext';

const SECTION = { padding: '8px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-card-hover)' };
const ITEM = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer' };
const hover = { onMouseEnter: e => { e.currentTarget.style.background = 'var(--bg-hover)'; }, onMouseLeave: e => { e.currentTarget.style.background = 'none'; } };

/** Dropdown to move a drawing to another category or another project. */
export function MoveMenu({ drawing, colors = {}, onDone, style }) {
  const { projects, drawings, currentUser, DISCIPLINES, moveDrawingToDiscipline, moveDrawingToProject } = useContext(AppContext);
  if (!drawing) return null;

  const otherProjects = projects.filter(p =>
    p.id !== drawing.projectId && (currentUser?.role === 'Admin' || p.assignedUsers?.includes(currentUser?.id)));

  const toProject = (p) => {
    const clash = drawings.some(d => d.projectId === p.id && d.id !== drawing.id && (d.code || '').trim().toLowerCase() === (drawing.code || '').trim().toLowerCase());
    const msg = `Move ${drawing.code} to project "${p.name}"?\n\nAll revisions, pins, comments and the CRS move with it.`
      + (clash ? `\n\n⚠ "${p.name}" already has a drawing with code ${drawing.code}.` : '');
    if (!window.confirm(msg)) return;
    moveDrawingToProject(drawing.id, p.id);
    onDone?.('project', p.id);
  };

  return (
    <div
      style={{
        position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 6,
        background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: 'var(--shadow-lg)', minWidth: 220, maxWidth: 300, maxHeight: 380, overflowY: 'auto', ...style,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={SECTION}>Move to category</div>
      {DISCIPLINES.filter(d => d !== drawing.discipline).map(d => (
        <button key={d} style={ITEM} {...hover} onClick={() => { moveDrawingToDiscipline(drawing.id, d); onDone?.('category', d); }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[d] || '#a1a1aa', flexShrink: 0 }} />
          {d}
        </button>
      ))}

      <div style={{ ...SECTION, borderTop: '1px solid var(--border)' }}>Move to project</div>
      {otherProjects.length === 0 ? (
        <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No other projects you can access.</div>
      ) : otherProjects.map(p => (
        <button key={p.id} style={ITEM} {...hover} onClick={() => toProject(p)} title={p.name}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-dark)', flexShrink: 0 }}>{p.code || '—'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
        </button>
      ))}
    </div>
  );
}
