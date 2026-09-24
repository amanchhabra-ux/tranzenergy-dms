import * as XLSX from 'xlsx';

// ─── Comment Resolution Sheet helpers ───────────────────────────────────────

export const CRS_COLUMNS = ['S.No', 'Pin', 'Page', 'Comment', 'Comment By', 'Date', 'Reply / Resolution', 'Reply By', 'Status', 'Source'];

const clean = (v) => (v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim());
const normText = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]/g, '');

export const MAX_CRS_ROWS = 3000; // anything bigger is not a real CRS table

/** Look at the first bytes to tell what a file really is (names can lie). */
export function sniffType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] === 0x50 && b[1] === 0x4b) return 'xlsx';                       // PK zip
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'xls'; // OLE
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'; // %PDF
  return 'unknown';
}

/** Fetch/decode a CRS source into bytes. */
export async function loadBytes(src) {
  if (src instanceof Uint8Array) return src;
  if (src instanceof Blob) return new Uint8Array(await src.arrayBuffer());
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`Could not load CRS (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  }
  const b64 = src.includes('base64,') ? src.split('base64,')[1] : src;
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Load a workbook; throws a friendly error if the file is not really a spreadsheet. */
export async function loadWorkbook(src) {
  const bytes = await loadBytes(src);
  const type = sniffType(bytes);
  if (type === 'pdf') { const e = new Error('This CRS file is a PDF, not an Excel sheet.'); e.code = 'PDF'; throw e; }
  if (type === 'unknown') { const e = new Error('This file is not a valid Excel workbook.'); e.code = 'INVALID'; throw e; }
  return XLSX.read(bytes, { type: 'array', cellDates: true });
}

/** Read an .xlsx/.xls from a URL, data: URI or bytes → array of rows (first sheet). */
export async function loadWorkbookRows(src) {
  const wb = await loadWorkbook(src);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true }).slice(0, MAX_CRS_ROWS);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  // where row/col 0 of `rows` sits on the sheet, and the last used column
  rows.geometry = { origin: { r: range.s.r, c: range.s.c }, maxCol: range.e.c };
  return rows;
}

// Labels found in CRS title blocks → drawing fields
const META_LABELS = [
  ['code', /^(drg|dwg|drawing|doc(ument)?)\.?\s*(no|number|#)\.?$/i],
  ['title', /^(drawing|document|doc)?\s*(title|description|subject)$/i],
  ['rev', /^(doc(ument)?\s*|drg\s*|dwg\s*)?rev(ision)?\.?\s*(no\.?)?$/i],
  ['clientName', /^(client|owner|employer|customer)(\s*name)?$/i],
  ['contractor', /^(epc|contractor|epc contractor|vendor|supplier)(\s*name)?$/i],
  ['consultant', /^(consultant|engineer|owner'?s engineer|pmc)(\s*name)?$/i],
  ['project', /^project(\s*name)?$/i],
];

// Column header matchers for the comments table
const COL_MATCHERS = {
  sno: /^(s\.?\s*n\.?o?|sl\.?\s*no|sr\.?\s*no|no|#|item)\.?$/i,
  comment: /(comment|observation|remark|query)(?!.*(repl|respon|resol|complian))/i,
  commentBy: /(comment(ed)?\s*by|reviewer|raised\s*by|by\s*client|owner'?s?\s*comment\s*by)/i,
  reply: /(repl|respon|resol|complian|clarification|action\s*taken|contractor'?s?\s*remark)/i,
  status: /^(status|open\s*\/\s*closed|closed\s*\/\s*open|remarks?\s*status|accepted)/i,
  page: /^(page|sheet)(\s*no)?\.?$/i,
};

/**
 * Parse a CRS sheet (array of rows).
 * Returns { meta: {code,title,rev,clientName,...}, comments: [{sno, comment, commentBy, reply, status, page}] }
 */
export function parseCrsRows(rows) {
  const meta = {};
  // 1. Title-block style "Label | value" or "Label: value" in the first ~25 rows
  for (const row of rows.slice(0, 25)) {
    for (let c = 0; c < row.length; c++) {
      const cell = clean(row[c]);
      if (!cell) continue;
      let label = cell, value = '';
      const colon = cell.match(/^([^:]{2,40}):\s*(.+)$/);
      if (colon) { label = colon[1]; value = colon[2]; }
      label = label.replace(/[:.\s]+$/, '');
      for (const [key, re] of META_LABELS) {
        if (meta[key] || !re.test(label)) continue;
        if (!value) value = clean(row.slice(c + 1).find(v => clean(v)));
        if (value && value.length < 200 && !META_LABELS.some(([, r]) => r.test(value))) meta[key] = value;
      }
    }
  }

  // 2. Find the comments table header row
  let headerIdx = -1, cols = {};
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const found = {};
    rows[i].forEach((v, c) => {
      const h = clean(v);
      if (!h || h.length > 60) return;
      for (const [key, re] of Object.entries(COL_MATCHERS)) {
        if (found[key] === undefined && re.test(h)) {
          // "Comment By" should not be taken as the comment column
          if (key === 'comment' && COL_MATCHERS.commentBy.test(h)) continue;
          found[key] = c;
        }
      }
    });
    if (found.comment !== undefined && (found.reply !== undefined || found.sno !== undefined || found.status !== undefined)) {
      headerIdx = i; cols = found; break;
    }
  }

  const comments = [];
  const numberedEmpty = []; // pre-numbered empty rows (e.g. SN 3, 4, 5…) — filled first by new comments
  let lastRow = headerIdx, maxSno = 0;
  if (headerIdx >= 0) {
    rows.forEach((row, r) => {
      if (r <= headerIdx) return;
      const get = (k) => (cols[k] === undefined ? '' : clean(row[cols[k]]));
      const comment = get('comment');
      const n = parseInt(get('sno'), 10);
      if (!Number.isNaN(n)) maxSno = Math.max(maxSno, n);
      if (!comment) {
        if (get('sno') && row.every((v, c) => c === cols.sno || !clean(v))) numberedEmpty.push({ row: r, sno: get('sno') });
        return;
      }
      lastRow = Math.max(lastRow, r);
      comments.push({
        row: r, sno: get('sno'), comment, commentBy: get('commentBy'),
        reply: get('reply'), status: get('status'), page: get('page'),
      });
    });
  }
  if (meta.rev && /^\d+$/.test(meta.rev)) meta.rev = `R${meta.rev}`;
  const geo = rows.geometry || { origin: { r: 0, c: 0 }, maxCol: Math.max(0, ...rows.slice(0, 50).map(r => r.length - 1)) };
  const freeRows = numberedEmpty.filter(f => f.row > lastRow);
  const lastUsed = Math.max(lastRow, ...freeRows.map(f => f.row));
  const layout = headerIdx >= 0 ? { headerIdx, cols, lastCommentRow: lastUsed, freeRows, maxSno, origin: geo.origin, maxCol: geo.maxCol } : null;
  return { meta, comments, layout };
}

/** Status text for a pin */
const pinStatus = (pin) => (pin.accepted ? 'Accepted' : pin.resolved ? 'Resolved' : 'Open');

/**
 * Build the auto-populated CRS for a drawing: one row per comment pin, plus the
 * comments from an uploaded CRS Excel and comments added in the CRS panel.
 * Each row has a stable `key` used to sync it into the Excel sheet.
 */
export function buildCrsTable(drawing) {
  const out = [];
  const seen = new Set();
  (drawing.pins || []).forEach((pin) => {
    const comments = pin.comments || [];
    const first = comments.find(c => c.type === 'client') || comments[0];
    const replies = comments.filter(c => c !== first);
    out.push({
      key: `pin:${pin.id}`, kind: 'pin', pinId: pin.id,
      pin: pin.label,
      page: pin.page || 1,
      comment: first?.text || '',
      commentBy: first ? `${first.author}${first.type === 'client' ? ' (Client)' : ''}` : '',
      date: first?.date?.slice(0, 10) || '',
      reply: replies.map(r => r.text).join('\n'),
      replyBy: [...new Set(replies.map(r => r.author))].join(', '),
      status: pinStatus(pin),
      source: 'Drawing pin',
    });
    if (first) seen.add(normText(first.text));
  });
  const pinLabels = new Set((drawing.pins || []).map(p => String(p.label)));
  (drawing.crsImported || []).forEach((c, idx) => {
    if (!c.local && seen.has(normText(c.comment))) return; // same comment already raised as a pin
    const pinTag = !c.local && /^\[Pin (\d+)/.exec(c.comment || '');
    if (pinTag && pinLabels.has(pinTag[1])) return; // a pin this app wrote into the Excel earlier
    seen.add(normText(c.comment));
    out.push({
      key: c.local ? `loc:${c.id}` : `x:${c.row ?? idx}`, kind: c.local ? 'local' : 'excel', idx,
      pinId: null, pin: '', page: c.page || '',
      comment: c.comment, commentBy: c.commentBy || '', date: c.date || '',
      reply: c.reply || '', replyBy: c.replyBy || '', status: c.status || 'Open',
      excelRow: c.row, excelSno: c.sno,
      source: c.local ? 'Added in CRS' : 'Uploaded CRS',
    });
  });
  return out.map((r, i) => ({ ...r, sno: i + 1 }));
}

/**
 * Work out which cells to write so the CRS Excel matches the table:
 * - rows that came from the Excel get their reply/status cells updated
 * - pins and comments added in the app go into the next free rows (and stay there)
 * Returns { cells: [{r, c, v}] (absolute, 0-based), rowMap, layout }.
 */
export function planCrsWrites(layout, table, rowMap = {}, clearRows = []) {
  const lay = { ...layout, cols: { ...layout.cols } };
  const o = lay.origin || { r: 0, c: 0 };
  const cells = [];
  const set = (r, c, v) => { if (c !== undefined && r !== undefined) cells.push({ r: o.r + r, c: o.c + c, v: v ?? '' }); };
  const header = lay.headerIdx;
  // add Reply / Status columns if the sheet has none
  let nextCol = (lay.maxCol ?? 0) - o.c + 1;
  for (const [k, label] of [['reply', 'Reply / Resolution'], ['status', 'Status']]) {
    if (lay.cols[k] === undefined) { lay.cols[k] = nextCol++; set(header, lay.cols[k], label); }
  }
  lay.maxCol = Math.max(lay.maxCol ?? 0, o.c + nextCol - 1);

  // blank out rows whose comments were deleted in the app
  for (const row of clearRows) {
    for (const k of ['comment', 'commentBy', 'reply', 'status', 'pin', 'page', 'date', 'replyBy', 'source']) set(row, lay.cols[k], '');
  }

  const map = { ...rowMap };
  const used = new Set(Object.values(map));
  let next = Math.max(lay.lastCommentRow ?? header, header) + 1;
  let sno = table.filter(r => r.kind === 'excel').reduce((m, r) => Math.max(m, parseInt(r.excelSno, 10) || 0), lay.maxSno || 0);
  sno = Math.max(sno, 0, ...Object.values(lay.snoMap || {})); // continue after the sheet's own numbers
  const free = (lay.freeRows || []).filter(f => !used.has(f.row));

  for (const r of table) {
    if (r.kind === 'excel') {
      set(r.excelRow, lay.cols.reply, r.reply);
      set(r.excelRow, lay.cols.status, r.status);
      continue;
    }
    let row = map[r.key];
    if (!String(r.comment || '').trim() && !String(r.reply || '').trim()) {
      // nothing written yet (e.g. a pin just placed): keep it out of the Excel,
      // and blank its row if it was written there before
      if (row !== undefined) for (const k of ['comment', 'commentBy', 'reply', 'status', 'pin', 'page', 'date', 'replyBy', 'source']) set(row, lay.cols[k], '');
      continue;
    }
    if (row === undefined) {
      const slot = free.shift();
      if (slot) {
        // use a pre-numbered empty row and keep its number
        row = slot.row;
        lay.snoMap = { ...(lay.snoMap || {}), [r.key]: slot.sno };
      } else {
        while (used.has(next)) next++;
        row = next++;
      }
      map[r.key] = row; used.add(row);
    }
    {
      // sequence number: keep the one it already has, otherwise the next number
      const prev = lay.snoMap?.[r.key];
      const n = prev ?? ++sno;
      lay.snoMap = { ...(lay.snoMap || {}), [r.key]: n };
      if (prev === undefined) set(row, lay.cols.sno, n);
    }
    const tag = r.kind === 'pin' && lay.cols.pin === undefined ? `[Pin ${r.pin}${r.page ? `, p.${r.page}` : ''}] ` : '';
    set(row, lay.cols.comment, tag + r.comment);
    set(row, lay.cols.commentBy, r.commentBy);
    set(row, lay.cols.reply, r.reply);
    set(row, lay.cols.status, r.status);
    set(row, lay.cols.pin, r.pin);
    set(row, lay.cols.page, r.page);
    set(row, lay.cols.date, r.date);
    set(row, lay.cols.replyBy, r.replyBy);
    set(row, lay.cols.source, r.source);
  }
  lay.lastCommentRow = Math.max(lay.lastCommentRow ?? header, ...Object.values(map));
  lay.freeRows = free;
  return { cells, rowMap: map, layout: lay };
}

/**
 * Write cells into an Excel file and return the new file bytes.
 * .xlsx is edited with ExcelJS so the sheet keeps its formatting; old .xls falls back to SheetJS.
 */
export async function applyCrsCells(bytes, cells) {
  if (sniffType(bytes) === 'xlsx') {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const ws = book.worksheets[0];
    for (const { r, c, v } of cells) {
      const cell = ws.getCell(r + 1, c + 1);
      if (cell.isMerged && cell.master !== cell) continue; // never write into the hidden part of a merge
      cell.value = v === '' ? null : v;
      if (typeof v === 'string' && v.includes('\n')) cell.alignment = { ...(cell.alignment || {}), wrapText: true };
    }
    return new Uint8Array(await book.xlsx.writeBuffer());
  }
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  for (const { r, c, v } of cells) XLSX.utils.sheet_add_aoa(ws, [[v]], { origin: { r, c } });
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
}

/** Build a formatted CRS workbook (title block + table) and return it. */
export const GENERATED_LAYOUT = {
  headerIdx: 12, origin: { r: 0, c: 0 }, maxCol: 9, lastCommentRow: 12,
  cols: { sno: 0, pin: 1, page: 2, comment: 3, commentBy: 4, date: 5, reply: 6, replyBy: 7, status: 8, source: 9 },
};

export function crsWorkbook(drawing, project, { emptyTable = false } = {}) {
  const table = emptyTable ? [] : buildCrsTable(drawing);
  const aoa = [
    ['COMMENT RESOLUTION SHEET'],
    [],
    ['Project', project?.name || ''],
    ['Client / Owner', drawing.clientName || project?.client || ''],
    ['Contractor / EPC', drawing.contractor || ''],
    ['Consultant', drawing.consultant || ''],
    ['Drawing No.', drawing.code],
    ['Drawing Title', drawing.title],
    ['Revision', drawing.currentVersion || ''],
    ['Category', drawing.discipline || ''],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    CRS_COLUMNS,
    ...table.map(r => [r.sno, r.pin, r.page, r.comment, r.commentBy, r.date, r.reply, r.replyBy, r.status, r.source]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 5 }, { wch: 6 }, { wch: 50 }, { wch: 18 }, { wch: 11 }, { wch: 50 }, { wch: 18 }, { wch: 11 }, { wch: 14 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CRS');
  return wb;
}

export function downloadCrs(drawing, project) {
  XLSX.writeFile(crsWorkbook(drawing, project), `${drawing.code}_${drawing.currentVersion || 'R0'}_CRS.xlsx`);
}

/** Fields to fill on a drawing from CRS meta — only fills blanks, never overwrites. */
export function crsFieldUpdates(drawing, meta) {
  const upd = {};
  for (const k of ['clientName', 'contractor', 'consultant']) {
    if (meta[k] && !clean(drawing[k])) upd[k] = meta[k];
  }
  const titleLooksAuto = !clean(drawing.title) || drawing.title === drawing.code || /^untitled/i.test(drawing.title);
  if (meta.title && titleLooksAuto) upd.title = meta.title;
  if (meta.project && !clean(drawing.description)) upd.description = `Project: ${meta.project}`;
  return upd;
}

/** Read a CRS Excel File/Blob/URL and parse it; never throws (returns empty on failure). */
export async function readCrs(src) {
  try {
    return { ...parseCrsRows(await loadWorkbookRows(src)), fileType: 'excel' };
  } catch (err) {
    console.warn('Could not parse CRS', err);
    return { meta: {}, comments: [], layout: null, fileType: err.code === 'PDF' ? 'pdf' : 'invalid' };
  }
}

/** Rebuild pin → Excel row links from "[Pin N ...]" rows this app wrote earlier. */
export function pinRowMapFromImport(drawing, comments = []) {
  const byLabel = new Map((drawing.pins || []).map(p => [String(p.label), p.id]));
  const map = {};
  comments.forEach(c => {
    const m = /^\[Pin (\d+)/.exec(c.comment || '');
    if (m && byLabel.has(m[1]) && c.row !== undefined) map[`pin:${byLabel.get(m[1])}`] = c.row;
  });
  return map;
}

/**
 * Bring the CRS Excel up to date with the drawing's CRS table.
 * - With an uploaded Excel: updates reply/status cells and adds new rows, keeping its formatting.
 * - Without one: creates a formatted CRS Excel from scratch.
 * Returns { bytes, rowMap, layout, created } — the caller uploads bytes and saves the rest.
 */
export async function syncCrsExcel(drawing, project) {
  const table = buildCrsTable(drawing);
  let bytes, layout, rowMap = drawing.crsRowMap || {}, created = false;
  if (drawing.crsData && drawing.crsLayout) {
    bytes = await loadBytes(drawing.crsData);
    layout = drawing.crsLayout;
  } else if (drawing.crsData) {
    // an Excel we haven't mapped yet — find its comments table first
    bytes = await loadBytes(drawing.crsData);
    const parsed = parseCrsRows(await loadWorkbookRows(bytes));
    if (!parsed.layout) {
      const e = new Error("Couldn't find a comments table (Comment / Reply / Status columns) in the attached Excel.");
      e.code = 'NO_TABLE'; throw e;
    }
    layout = parsed.layout;
  } else {
    bytes = new Uint8Array(XLSX.write(crsWorkbook(drawing, project, { emptyTable: true }), { bookType: 'xlsx', type: 'array' }));
    layout = GENERATED_LAYOUT;
    rowMap = {};
    created = true;
  }
  const clearRows = created ? [] : (drawing.crsClearRows || []);
  const plan = planCrsWrites(layout, table, rowMap, clearRows);
  const out = await applyCrsCells(bytes, plan.cells);
  return { bytes: out, rowMap: plan.rowMap, layout: plan.layout, created, clearedRows: clearRows };
}
