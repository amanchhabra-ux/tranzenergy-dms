import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Save, Loader2 } from 'lucide-react';
import { loadBytes, sniffType, applyCrsCells } from '../utils/crs';
import { PdfViewer } from './PdfViewer';

const MAX_ROWS = 1500; // a real CRS is never this long; protects the page from huge/odd files

const colName = (i) => XLSX.utils.encode_col(i);

/**
 * Spreadsheet-style preview of a CRS Excel (first sheet by default, with a
 * sheet switcher). Keeps merged cells and wraps long text. Double-click a
 * cell to edit; "Save changes" writes a new .xlsx via onSave(dataUri).
 */
export function ExcelViewer({ crsData, onSave }) {
  const [wb, setWb] = useState(null);
  const [sheet, setSheet] = useState('');
  const [data, setData] = useState([]);       // dense 2-D array
  const [merges, setMerges] = useState([]);
  const [colWidths, setColWidths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // [r, c]
  const [dirty, setDirty] = useState(false);
  const [bytes, setBytes] = useState(null);       // original file, for format-preserving saves
  const [isPdf, setIsPdf] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [origin, setOrigin] = useState({ r: 0, c: 0 });
  const [edits, setEdits] = useState({});         // 'r,c' → value

  // Load workbook
  useEffect(() => {
    setWb(null); setData([]); setError(null); setDirty(false); setEdits({}); setIsPdf(false); setBytes(null);
    if (!crsData) return;
    let cancelled = false;
    setLoading(true);
    loadBytes(crsData)
      .then(b => {
        if (cancelled) return;
        const type = sniffType(b);
        if (type === 'pdf') { setIsPdf(true); return; }
        if (type === 'unknown') throw new Error('This file is not a valid Excel workbook.');
        const book = XLSX.read(b, { type: 'array', cellDates: true });
        setBytes(b); setWb(book); setSheet(book.SheetNames[0]);
      })
      .catch(err => { console.error('Error loading CRS:', err); if (!cancelled) setError(err.message || 'Could not load the Excel file.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [crsData]);

  // Sheet → dense grid
  useEffect(() => {
    if (!wb || !sheet) return;
    const ws = wb.Sheets[sheet];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    // never read more than MAX_ROWS rows / 60 columns (odd files can claim huge ranges)
    const capped = { s: range.s, e: { r: Math.min(range.e.r, range.s.r + MAX_ROWS - 1), c: Math.min(range.e.c, range.s.c + 59) } };
    setTruncated(range.e.r > capped.e.r);
    setOrigin({ r: range.s.r, c: range.s.c });
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true, range: capped });
    // drop trailing empty rows/cols
    while (rows.length && rows[rows.length - 1].every(v => String(v).trim() === '')) rows.pop();
    let width = 0;
    rows.forEach(r => { for (let c = r.length - 1; c >= 0; c--) if (String(r[c]).trim() !== '') { width = Math.max(width, c + 1); break; } });
    (ws['!merges'] || []).forEach(m => { if (m.s.r < rows.length) width = Math.max(width, m.e.c + 1); });
    setData(rows.map(r => Array.from({ length: width }, (_, c) => (r[c] ?? ''))));
    setMerges(ws['!merges'] || []);
    // column widths as saved in Excel (px), clamped for screen
    const cols = ws['!cols'] || [];
    setColWidths(Array.from({ length: width }, (_, c) => {
      const cw = cols[c];
      const px = cw?.wpx || (cw?.wch ? cw.wch * 7 + 10 : cw?.width ? cw.width * 7 + 10 : 90);
      return cw?.hidden ? 0 : Math.max(48, Math.min(420, Math.round(px)));
    }));
    setEditing(null);
  }, [wb, sheet]);

  // merge lookup: start cell → span, covered cells → skip
  const { spanAt, covered } = useMemo(() => {
    const spanAt = new Map(), covered = new Set();
    merges.forEach(m => {
      spanAt.set(`${m.s.r},${m.s.c}`, { rowSpan: m.e.r - m.s.r + 1, colSpan: m.e.c - m.s.c + 1 });
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) covered.add(`${r},${c}`);
    });
    return { spanAt, covered };
  }, [merges]);

  // Header row guess (the comments table header) for styling
  const headerRow = useMemo(() => data.findIndex(r => r.filter(v => String(v).trim()).length >= 4 && r.some(v => /comment/i.test(String(v))) && r.some(v => /response|reply|resolution|status/i.test(String(v)))), [data]);

  const setCell = (r, c, v) => {
    setData(prev => prev.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
    setEdits(prev => ({ ...prev, [`${r},${c}`]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      if (sheet !== wb?.SheetNames[0]) { alert('Only the first sheet can be edited here.'); return; }
      // write just the edited cells into the original file, so its formatting is kept
      const cells = Object.entries(edits).map(([k, v]) => { const [r, c] = k.split(',').map(Number); return { r: origin.r + r, c: origin.c + c, v }; });
      const out = await applyCrsCells(bytes, cells);
      let bin = '';
      for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
      onSave?.(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${btoa(bin)}`);
      setDirty(false); setEdits({});
    } catch (err) {
      console.error('Error saving Excel data:', err);
      alert('Failed to save Excel file.');
    }
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <Loader2 size={28} className="spin" style={{ color: 'var(--text-muted)' }} />
        <div className="empty-state-desc">Loading CRS Excel…</div>
      </div>
    );
  }
  if (isPdf) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--warning)', background: 'var(--warning-glow)', padding: '6px 12px' }}>
          This CRS file is a PDF (even if it is named .xlsx), so it is shown as a PDF.
        </div>
        <PdfViewer pdfDataUrl={crsData} pins={[]} showPins={false} />
      </div>
    );
  }
  if (error) return <div style={{ padding: 24, color: 'var(--error)', textAlign: 'center' }}>⚠️ {error}</div>;
  if (!crsData || !data.length) {
    return (
      <div className="empty-state" style={{ flex: 1 }}>
        <div style={{ fontSize: 48 }}>📊</div>
        <div className="empty-state-title">No CRS Excel attached</div>
        <div className="empty-state-desc">Upload the CRS Excel with the drawing, or use the spreadsheet icon in the drawing header.</div>
      </div>
    );
  }

  const cellBase = { border: '1px solid var(--border)', padding: '4px 6px', verticalAlign: 'top', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-card)' }}>
      <div className="pdf-toolbar" style={{ justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', paddingLeft: 8, overflowX: 'auto' }}>
          {(wb?.SheetNames || []).map(n => (
            <button key={n} className="btn btn-sm" onClick={() => setSheet(n)}
              style={{ border: 'none', padding: '3px 10px', borderRadius: 'var(--r-sm)', background: n === sheet ? 'var(--primary-glow)' : 'transparent', color: n === sheet ? 'var(--primary-light)' : 'var(--text-muted)' }}>
              {n}
            </button>
          ))}
          {truncated && <span style={{ fontSize: 11, color: 'var(--warning)', marginLeft: 6 }}>Showing first {MAX_ROWS} rows</span>}
          {onSave && <span className="truncate" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }} title="Double-click a cell to edit">Double-click to edit</span>}
        </div>
        {onSave && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!dirty} style={{ marginRight: 8 }}>
            <Save size={13} /> Save changes
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, color: 'var(--text-primary)', tableLayout: 'fixed', width: 36 + colWidths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            <col style={{ width: 36 }} />
            {colWidths.map((w, c) => <col key={c} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...cellBase, position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-elevated)', color: 'var(--text-muted)', minWidth: 32 }} />
              {data[0].map((_, c) => (
                <th key={c} style={{ ...cellBase, position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-elevated)', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>{colName(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, r) => (
              <tr key={r}>
                <td style={{ ...cellBase, background: 'var(--bg-elevated)', color: 'var(--text-muted)', textAlign: 'center', position: 'sticky', left: 0 }}>{r + 1}</td>
                {row.map((cell, c) => {
                  const key = `${r},${c}`;
                  if (covered.has(key)) return null;
                  const span = spanAt.get(key) || {};
                  const isEditing = editing && editing[0] === r && editing[1] === c;
                  const isHeader = r === headerRow;
                  return (
                    <td
                      key={c}
                      rowSpan={span.rowSpan}
                      colSpan={span.colSpan}
                      onDoubleClick={() => onSave && sheet === wb?.SheetNames[0] && setEditing([r, c])}
                      style={{
                        ...cellBase,
                        fontWeight: isHeader || (r < headerRow && c === 0) ? 700 : 400,
                        background: isHeader ? 'var(--primary-glow)' : undefined,
                        textAlign: span.colSpan > 3 ? 'center' : undefined,
                        padding: isEditing ? 0 : cellBase.padding,
                      }}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          defaultValue={cell}
                          onBlur={e => { if (e.target.value !== String(cell)) setCell(r, c, e.target.value); setEditing(null); }}
                          onKeyDown={e => { if (e.key === 'Escape') setEditing(null); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); } }}
                          style={{ width: '100%', minHeight: 60, border: '2px solid var(--primary)', background: 'var(--bg-modal)', color: 'inherit', font: 'inherit', padding: 4, resize: 'vertical' }}
                        />
                      ) : String(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
