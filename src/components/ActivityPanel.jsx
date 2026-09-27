import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from '../AppContext';
import { X } from 'lucide-react';
import { TAG, describe, timeAgo } from '../utils/activity';
import { isExternal } from '../utils/workflow';
import { fetchActivity, mergeEntries } from '../utils/logClient';

/** "Load more" at the foot of a list read in pages. */
export function LoadMore({ onLoad }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async () => {
    setBusy(true); setFailed(false);
    try { await onLoad(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <button className="btn btn-ghost btn-sm" onClick={run} disabled={busy}>{busy ? 'Loading…' : failed ? 'Could not load, try again' : 'Load more'}</button>
    </div>
  );
}

/** Drop-down list of everything that happened on a drawing, newest first. */
export function ActivityPanel({ drawing, since, onClose }) {
  const { currentUser } = useContext(AppContext);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close); };
  }, [onClose]);
  // the drawing's whole trail, read from the server a page at a time; entries made in this
  // browser a moment ago (drawing.activity) show at once, before the server has them
  const [loaded, setLoaded] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | failed
  useEffect(() => {
    let live = true;
    fetchActivity(drawing.id, { limit: 30 })
      .then(page => { if (live) { setLoaded(page.entries || []); setCursor(page.cursor || null); setState('ready'); } })
      .catch(() => { if (live) setState('failed'); });
    return () => { live = false; };
  }, [drawing.id]);
  const more = async () => {
    const page = await fetchActivity(drawing.id, { limit: 30, cursor });
    setLoaded(prev => mergeEntries(prev, page.entries || [], 'at'));
    setCursor(page.cursor || null);
  };
  const items = mergeEntries(drawing.activity || [], loaded, 'at');
  return (
    <div className="activity-panel" ref={ref} onClick={e => e.stopPropagation()}>
      <div className="activity-panel-head">
        <span>Activity <span className="tracker-sub">· {drawing.code}</span></span>
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ padding: 2 }}><X size={14} /></button>
      </div>
      <div className="activity-list">
        {items.length === 0 && state !== 'loading' && <div className="tracker-sub" style={{ padding: 14 }}>No uploads, downloads or comments recorded yet.</div>}
        {state === 'loading' && items.length === 0 && <div className="tracker-sub" style={{ padding: 14 }}>Loading…</div>}
        {state === 'failed' && <div className="tracker-sub" style={{ padding: '6px 14px' }}>Older activity could not be loaded.</div>}
        {items.map(e => {
          const fresh = since && e.at > since && e.by !== currentUser?.id;
          return (
            <div key={e.id} className={`activity-item ${fresh ? 'fresh' : ''}`}>
              <span className={`act-tag ${TAG[e.type]?.cls || ''}`}>{TAG[e.type]?.label || e.type}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="activity-text">{describe(e)}</div>
                <div className="tracker-sub">
                  {e.byName} · {timeAgo(e.at)}
                  {e.vis === 'internal' && !isExternal(currentUser) && <span className="badge badge-muted" style={{ fontSize: 9, padding: '0 5px', marginLeft: 6 }}>Internal</span>}
                </div>
              </div>
              {fresh && <span className="activity-dot" title="New since you last opened this drawing" />}
            </div>
          );
        })}
        {cursor && <LoadMore onLoad={more} />}
      </div>
    </div>
  );
}

/** Small tags for a drawing row. */
export function ActivityTags({ tags }) {
  if (!tags.length) return null;
  return (
    <div className="act-tags">
      {tags.map(t => <span key={t.type} className={`act-tag ${TAG[t.type]?.cls || ''}`} title={t.title}>{t.label}</span>)}
    </div>
  );
}
