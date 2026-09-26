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
  if (/^https?:\/\//.test(src) || src.startsWith('/api/file?')) {
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
  rows.geometry = { origin: { r: range.s.r, c: range.s.c }, maxCol: range.e.c, merges: ws['!merges'] || [] };
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
      internal: pin.vis === 'internal' || comments.some(c => c.vis === 'internal'),
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
      internal: c.vis === 'internal',
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
    // template formulas (e.g. the sheet name built from Document No and Title) still hold the template's old results
    book.calcProperties = { ...(book.calcProperties || {}), fullCalcOnLoad: true };
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

// ─── Issuing the CRS in the contractual template (workflow step 6) ──────────
const ISSUE_META = [
  ['code', /^(drg|dwg|drawing|doc(ument)?)\.?\s*(no|number|#)\.?$/i],
  ['title', /^(drawing|document|doc)?\s*(title|description|subject)$/i],
  ['rev', /^(doc(ument)?\s*|drg\s*|dwg\s*)?rev(ision)?\.?\s*(no\.?)?$/i],
  ['clientName', /^(client|owner|employer|customer)(\s*name)?$/i],
  ['contractor', /^(epc|contractor|epc contractor|vendor|supplier)(\s*name)?$/i],
  ['consultant', /^(consultant|engineer|owner'?s engineer|pmc)(\s*name)?$/i],
  ['project', /^project(\s*name)?$/i],
  ['date', /^(date|date of issue|issue date|crs date)$/i],
  ['category', /^(review\s*status|proposed\s*(review\s*)?(status|category)|category)$/i],
];

/** The merged range that contains an absolute cell, if any. */
const mergeAt = (merges, r, c) => (merges || []).find(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);

/** Title-block cells to fill in a template: the first empty cell right of each label. */
function planMetaWrites(rows, values, headerIdx) {
  const o = rows.geometry?.origin || { r: 0, c: 0 };
  const cells = [];
  const done = new Set();
  const last = Math.min(headerIdx >= 0 ? headerIdx : 25, 25);
  for (let r = 0; r < last && r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const label = clean(row[c]).replace(/[:.\s]+$/, '');
      if (!label || label.length > 40) continue;
      const hit = ISSUE_META.find(([k, re]) => !done.has(k) && re.test(label));
      if (!hit) continue;
      const [key] = hit;
      const v = values[key];
      if (!v) continue;
      // the value goes in the first cell right of the label (after the label's own merge), only if it's empty
      const merges = rows.geometry?.merges;
      const own = mergeAt(merges, o.r + r, o.c + c);
      const cc = (own ? own.e.c - o.c : c) + 1;
      if (clean(row[cc])) continue;       // already filled (or another label) — leave it
      const slot = mergeAt(merges, o.r + r, o.c + cc);
      if (slot && (slot.s.r !== o.r + r || slot.s.c !== o.c + cc)) continue; // hidden part of a merge
      cells.push({ r: o.r + r, c: o.c + cc, v });
      done.add(key);
    }
  }
  return cells;
}

/** "Category-3" style label for a category key, in the project's own notation. */
function categoryLabel(key, wf) {
  if (!key) return '';
  const fmt = wf.categoryFormat || 'Category {key}';
  return fmt.replace('{key}', key);
}

// Per-row columns some contractual templates carry
const ISSUE_COLS = {
  rev: /^reviewed\s*rev(ision)?\.?$/i,
  date: /^(owner'?s?\s*|consultant'?s?\s*)?review\s*date$/i,
};

/** Reviewed revision and review date for every row the issue wrote. */
function planIssueColumns(rows, layout, rowMap, values) {
  const o = layout.origin || { r: 0, c: 0 };
  const header = rows[layout.headerIdx] || [];
  const cells = [];
  for (const [k, re] of Object.entries(ISSUE_COLS)) {
    const c = header.findIndex(h => re.test(clean(h)));
    if (c < 0 || !values[k]) continue;
    const v = k === 'date' ? new Date(values[k] + 'T00:00:00Z') : values[k]; // a real date, so the template's dd-mmm-yy format applies
    for (const r of Object.values(rowMap)) cells.push({ r: o.r + r, c: o.c + c, v });
  }
  return cells;
}

/**
 * ExcelJS drops dropdowns stored as Excel 2010 extensions (x14), e.g. a list that points at
 * another sheet. Read them from the template and add them back as ordinary list validations.
 */
async function restoreListValidations(templateBytes, outBytes) {
  const { default: JSZip } = await import('jszip');
  const { default: ExcelJS } = await import('exceljs');
  const zip = await JSZip.loadAsync(templateBytes);
  const xml = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
  const found = [...(xml || '').matchAll(/<x14:dataValidation\b[^>]*type="list"[^>]*>([\s\S]*?)<\/x14:dataValidation>/g)]
    .map(m => ({ f: /<xm:f>([^<]+)<\/xm:f>/.exec(m[1])?.[1], sqref: /<xm:sqref>([^<]+)<\/xm:sqref>/.exec(m[1])?.[1] }))
    .filter(v => v.f && v.sqref);
  if (!found.length) return outBytes;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength));
  const ws = book.worksheets[0];
  for (const { f, sqref } of found) {
    for (const ref of sqref.split(/\s+/)) ws.getCell(ref.split(':')[0]).dataValidation = { type: 'list', allowBlank: true, formulae: [f] };
  }
  book.calcProperties = { ...(book.calcProperties || {}), fullCalcOnLoad: true };
  return new Uint8Array(await book.xlsx.writeBuffer());
}

/**
 * Build the CRS that goes to the consultant: the project's contractual template (if set)
 * with the title block filled and every comment in its table; otherwise a generated CRS.
 * Returns { bytes, layout, rowMap, fileName }.
 */
export async function buildIssuedCrs(drawing, project) {
  const wf = project?.workflow || {};
  const table = buildCrsTable(drawing);
  const version = drawing.currentVersion || 'R0';
  const fileName = `${drawing.code}_${version}_CRS.xlsx`;
  const values = {
    code: drawing.code, title: drawing.title, rev: version,
    clientName: drawing.clientName || wf.clientName || project?.client || '',
    contractor: drawing.contractor || '', consultant: drawing.consultant || wf.consultantName || '',
    project: project?.name || '', date: new Date().toISOString().slice(0, 10),
    category: categoryLabel(drawing.review?.proposedCategory, wf),
  };
  if (wf.crsTemplate?.url) {
    const bytes = await loadBytes(wf.crsTemplate.url);
    const rows = await loadWorkbookRows(bytes);
    const parsed = parseCrsRows(rows);
    if (!parsed.layout) {
      const e = new Error("The project's CRS template has no comments table (Comment / Reply / Status columns).");
      e.code = 'NO_TABLE'; throw e;
    }
    const meta = planMetaWrites(rows, values, parsed.layout.headerIdx);
    // the sheet names one reviewer for the whole issuing party (e.g. "AEL"), not each person
    const issuedTable = wf.issueNotation ? table.map(r => ({ ...r, commentBy: wf.issueNotation })) : table;
    const plan = planCrsWrites(parsed.layout, issuedTable, {}, []);
    const extra = planIssueColumns(rows, parsed.layout, plan.rowMap, { rev: version, date: values.date });
    const out = await restoreListValidations(bytes, await applyCrsCells(bytes, [...meta, ...plan.cells, ...extra]));
    return { bytes: out, layout: plan.layout, rowMap: plan.rowMap, fileName };
  }
  const base = new Uint8Array(XLSX.write(crsWorkbook(drawing, project, { emptyTable: true }), { bookType: 'xlsx', type: 'array' }));
  const plan = planCrsWrites(GENERATED_LAYOUT, table, {}, []);
  const out = await applyCrsCells(base, plan.cells);
  return { bytes: out, layout: plan.layout, rowMap: plan.rowMap, fileName };
}

// ─── The CRS an outside consultant downloads ────────────────────────────────
/**
 * Built only from the consultant's (filtered) view of the drawing, never from the working
 * file: the frozen issued copy as base, plus the consultant's own comments (their pins and
 * CRS rows, and their replies on issued pins) written into it. With none, the issued
 * file as it is. → { bytes, fileName } or null when no CRS has been issued yet.
 */
export async function consultantCrs(drawing, userId) {
  const r = drawing.review || {};
  const issued = r.issued || (r.cycles || []).slice(-1)[0]?.issued || null;
  if (!issued?.url) return null;
  const bytes = await loadBytes(issued.url);
  const fileName = issued.fileName || `${drawing.code}_CRS.xlsx`;
  const rowMap = issued.rowMap || {};
  const pins = new Map((drawing.pins || []).map(p => [p.id, p]));
  const own = buildCrsTable(drawing).filter(row => {
    if (row.internal) return false;
    if (row.kind === 'pin') {
      const pin = pins.get(row.pinId);
      if (pin?.authorId === userId) return true;
      // their reply on a pin that went out in the issued sheet: update that row in place
      return row.key in rowMap && (pin?.comments || []).some(c => c.authorId === userId);
    }
    return row.kind === 'local' && drawing.crsImported?.[row.idx]?.authorId === userId;
  });
  if (!own.length) return { bytes, fileName };
  let layout = issued.layout;
  let known = new Set();
  if (!layout || !issued.rowMap) {
    // issued before the row map was kept: find the table, and skip rows already in the file
    const parsed = parseCrsRows(await loadWorkbookRows(bytes));
    layout = layout || parsed.layout;
    known = new Set(parsed.comments.map(c => normText(c.comment)));
  }
  if (!layout) return { bytes, fileName };
  const rows = own.filter(row => row.key in rowMap || !known.has(normText(row.comment)));
  if (!rows.length) return { bytes, fileName };
  const plan = planCrsWrites(layout, rows, rowMap, []);
  return { bytes: await applyCrsCells(bytes, plan.cells), fileName };
}

/** Offer bytes to the browser as a file download. */
export function saveBytes(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
