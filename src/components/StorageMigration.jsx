import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../AppContext';
import { CloudUpload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const BLOB_HOST = /^https:\/\/[a-z0-9]+\.(public|private)\.blob\.vercel-storage\.com\//i;

// R2 key for an old Vercel Blob file: keep its path, make sure it sits in an allowed folder
function keyFor(url, kind) {
  const path = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
  if (/^(drawings|crs|proposals)\//.test(path)) return path;
  return `${kind}/legacy/${path.replace(/\//g, '_')}`;
}

/** Admin tool: copy every file still in Vercel Blob storage into Cloudflare R2 and relink it. */
export function StorageMigration() {
  const { drawings, proposals, replaceFileUrls, canDo } = useContext(AppContext);
  const [state, setState] = useState({ running: false, done: 0, failed: [], finished: false, bytes: 0 });

  // Every Vercel Blob file the workspace still points to
  const pending = useMemo(() => {
    const list = new Map();
    const add = (url, kind) => { if (url && BLOB_HOST.test(url) && !list.has(url)) list.set(url, kind); };
    drawings.forEach(d => {
      add(d.pdfData, 'drawings');
      (d.versions || []).forEach(v => add(v.pdfData, 'drawings'));
      add(d.crsData, 'crs');
      add(d.crsPdf, 'crs');
    });
    proposals.forEach(p => add(p.fileData, 'proposals'));
    return [...list.entries()].map(([url, kind]) => ({ url, kind }));
  }, [drawings, proposals]);

  if (!canDo('admin')) return null;

  const run = async () => {
    if (!window.confirm(`Copy ${pending.length} file(s) from Vercel storage to Cloudflare R2? The originals are kept as a backup.`)) return;
    setState({ running: true, done: 0, failed: [], finished: false, bytes: 0 });
    const map = {};
    const failed = [];
    let bytes = 0;
    const queue = [...pending];
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift();
        try {
          const res = await fetch('/api/r2-copy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceUrl: f.url, pathname: keyFor(f.url, f.kind) }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
          map[f.url] = body.url;
          bytes += body.bytes || 0;
        } catch (e) {
          failed.push({ name: decodeURIComponent(f.url.split('/').pop()), error: e.message });
        }
        setState(s => ({ ...s, done: s.done + 1, failed: [...failed], bytes }));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (Object.keys(map).length) replaceFileUrls(map);
    setState(s => ({ ...s, running: false, finished: true, failed, bytes }));
  };

  const total = state.running || state.finished ? state.done : 0;
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CloudUpload size={20} style={{ color: 'var(--primary)' }} />
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Move files to Cloudflare R2</h3>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
        New uploads already go to R2. This copies the files uploaded earlier (drawings, CRS sheets, proposals) from Vercel storage into R2
        and updates their links. The originals are kept until you delete them.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" disabled={state.running || pending.length === 0} onClick={run}>
          {state.running ? <><Loader2 size={14} className="spin" /> Copying {total} / {total + queueLeft(pending, state)}…</> : <><CloudUpload size={14} /> Move {pending.length} file{pending.length === 1 ? '' : 's'} to R2</>}
        </button>
        {pending.length === 0 && !state.running && (
          <span style={{ fontSize: 13, color: 'var(--success)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <CheckCircle2 size={14} /> All files are in R2
          </span>
        )}
        {state.finished && (
          <span style={{ fontSize: 13, color: state.failed.length ? 'var(--warning)' : 'var(--success)' }}>
            {state.done - state.failed.length} moved ({(state.bytes / 1048576).toFixed(1)} MB){state.failed.length ? `, ${state.failed.length} failed` : ''}
          </span>
        )}
      </div>
      {state.failed.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--error)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {state.failed.slice(0, 10).map((f, i) => (
            <span key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><AlertCircle size={12} /> {f.name}: {f.error}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function queueLeft(pending, state) {
  return Math.max(0, pending.length - state.done);
}
