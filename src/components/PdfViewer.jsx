import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker once at module level
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ── Single page canvas renderer ────────────────────────────────────────────
function PageCanvas({ page, viewport, pageNum, pins, onCanvasClick, activePinId, showPins }) {
  const canvasRef = useRef(null);
  const taskRef   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page || !viewport) return;

    // Cancel any in-flight render for this page
    if (taskRef.current) {
      taskRef.current.cancel();
      taskRef.current = null;
    }

    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    const renderTask = page.render({ canvasContext: ctx, viewport });
    taskRef.current = renderTask;

    renderTask.promise.catch((err) => {
      // Ignore cancellation errors; surface everything else
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('PDF page render error:', err);
      }
    });

    return () => {
      if (taskRef.current) {
        taskRef.current.cancel();
        taskRef.current = null;
      }
    };
  }, [page, viewport]);

  const handleClick = (e) => {
    if (!onCanvasClick) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    onCanvasClick(x, y, pageNum);
  };

  const pagePins = (pins || []).filter(p => (p.page || 1) === pageNum);

  return (
    <div
      className="pdf-page-wrapper"
      style={{ position: 'relative', cursor: onCanvasClick ? 'crosshair' : 'default' }}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        className="pdf-page-canvas"
        style={{ display: 'block' }}
      />

      {/* Pin overlay */}
      {showPins && pagePins.map(pin => (
        <div
          key={pin.id}
          className={`pdf-pin ${pin.resolved ? 'pin-resolved' : 'pin-open'}`}
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, position: 'absolute', transform: 'translate(-50%, -100%)', zIndex: 10 }}
          title={`Pin ${pin.label} · ${pin.comments?.length || 0} comment(s)`}
        >
          <div
            className="pdf-pin-marker"
            style={{
              width: 24, height: 24,
              borderRadius: '50% 50% 50% 0',
              transform: 'rotate(-45deg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, color: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              background: activePinId === pin.id
                ? '#6366f1'
                : pin.resolved ? 'var(--success)' : 'var(--warning)',
            }}
          >
            <span style={{ transform: 'rotate(45deg)', fontFamily: 'var(--font-mono)' }}>{pin.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main PdfViewer ─────────────────────────────────────────────────────────
export function PdfViewer({ pdfDataUrl, pins = [], onCanvasClick, activePinId, showPins = true }) {
  const [pages,   setPages]   = useState([]); // [{ page, viewport, pageNum }]
  const [scale,   setScale]   = useState('fit');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const totalPagesRef = useRef(0);
  const viewportRef = useRef(null);

  useEffect(() => {
    if (!pdfDataUrl) { setPages([]); setError(''); return; }

    let cancelled = false;
    setLoading(true);
    setError('');
    setPages([]);

    const load = async () => {
      try {
        // Build the source object pdfjs expects
        let src;
        if (typeof pdfDataUrl === 'string' && pdfDataUrl.startsWith('data:')) {
          // data: URL — convert to Uint8Array so pdfjs doesn't try to fetch it
          const b64   = pdfDataUrl.split(';base64,')[1];
          const raw   = atob(b64);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          src = { data: bytes };
        } else {
          src = pdfDataUrl; // URL string or already an object
        }

        const pdfDoc = await pdfjsLib.getDocument(src).promise;
        if (cancelled) return;

        let activeScale = scale;
        if (scale === 'fit') {
          const vw = viewportRef.current ? viewportRef.current.clientWidth : window.innerWidth * 0.6;
          const p1 = await pdfDoc.getPage(1);
          const unscaled = p1.getViewport({ scale: 1 });
          activeScale = (vw - 40) / unscaled.width;
          activeScale = Math.min(Math.max(activeScale, 0.4), 3.0);
        }

        totalPagesRef.current = pdfDoc.numPages;
        const pageData = [];

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page     = await pdfDoc.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: activeScale });
          pageData.push({ page, viewport, pageNum: i });
        }

        if (!cancelled) {
          setPages(pageData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('PdfViewer load error:', err);
          setError(`Failed to load PDF: ${err?.message || err}`);
          setLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [pdfDataUrl, scale]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div className="pdf-toolbar">
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setScale(s => Math.max(0.4, +((s === 'fit' ? 1.0 : s) - 0.2).toFixed(1)))} title="Zoom out">−</button>
        <span className="pdf-page-info">{scale === 'fit' ? 'Fit' : Math.round(scale * 100) + '%'}</span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setScale(s => Math.min(3, +((s === 'fit' ? 1.0 : s) + 0.2).toFixed(1)))} title="Zoom in">+</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setScale('fit')}>Fit</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setScale(2.0)}>200%</button>
        {totalPagesRef.current > 0 && (
          <span className="pdf-page-info" style={{ marginLeft: 'auto' }}>
            {totalPagesRef.current} page{totalPagesRef.current !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Viewport */}
      <div
        ref={viewportRef}
        className="pdf-viewport"
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '16px', gap: '12px', background: '#111827',
        }}
      >
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <div className="spinner" />
            <span style={{ fontSize: '13px' }}>Rendering PDF…</span>
          </div>
        )}

        {!loading && !pdfDataUrl && (
          <div className="empty-state" style={{ flex: 1 }}>
            <div style={{ fontSize: '48px' }}>📄</div>
            <div className="empty-state-title">No PDF attached</div>
            <div className="empty-state-desc">Upload a PDF revision to view the drawing here.</div>
          </div>
        )}

        {error && (
          <div style={{ padding: '24px', color: 'var(--error)', fontSize: '13px', textAlign: 'center', maxWidth: 400 }}>
            ⚠️ {error}
          </div>
        )}

        {pages.map(({ page, viewport, pageNum }) => (
          <PageCanvas
            key={`${pageNum}-${scale}`}
            page={page}
            viewport={viewport}
            pageNum={pageNum}
            pins={pins}
            onCanvasClick={onCanvasClick}
            activePinId={activePinId}
            showPins={showPins}
          />
        ))}
      </div>
    </div>
  );
}
