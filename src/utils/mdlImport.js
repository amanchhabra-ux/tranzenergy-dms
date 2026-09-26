// ─── MDL import / export (pure: no React, runs in the browser and in Node) ──
//   readWorkbook(bytes)                 → { sheets: [{ name, rows, text }] }
//   defaultImportSettings(book, project) → per-sheet header row, mapping, sheet → Area
//   buildPlan(...)                      → preview: new / updated / unchanged / skipped, changed cells
//   applyPlan(plan, ...)                → the drawings and project columns after the import
//   exportWorkbook(project, drawings)   → one sheet per Area, the project's columns, re-importable
import * as XLSX from 'xlsx';
import {
  mdlColumns, cellValue, derivedValue, normCode, usableCode, normValue, normHeader,
  provisionalCode, keyFromLabel, proposeDiscipline, FIELD_KEYS,
} from './mdl.js';

const HEADER_SCAN_ROWS = 30;
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

/** Read every sheet: raw values (numbers, date serials) and the text Excel shows. */
export function readWorkbook(bytes) {
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheets = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const opts = { header: 1, defval: '', blankrows: true };
    return {
      name,
      rows: XLSX.utils.sheet_to_json(ws, { ...opts, raw: true }),
      text: XLSX.utils.sheet_to_json(ws, { ...opts, raw: false }),
    };
  });
  return { sheets };
}

// ─── Mapping ────────────────────────────────────────────────────────────────
/** Header text → column key, from the column labels, keys and aliases. */
function headerIndex(columns) {
  const m = new Map();
  for (const c of columns) {
    for (const h of [c.label, c.key, ...(c.aliases || [])]) {
      const n = normHeader(h);
      if (n && !m.has(n)) m.set(n, c.key);
    }
  }
  return m;
}

/** The header is the first row with at least two known labels. → row index, or -1 */
export function detectHeader(rows, columns) {
  const idx = headerIndex(columns);
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const hits = (rows[r] || []).filter(h => idx.has(normHeader(h))).length;
    if (hits >= 2) return r;
  }
  return -1;
}

/** Target for each header: a column key, 'new' (a new column) or 'ignore'. Saved choices win. */
export function autoMapping(headers, columns, saved = {}) {
  const idx = headerIndex(columns);
  const keys = new Set(columns.map(c => c.key));
  const out = {};
  for (const h of headers) {
    const n = normHeader(h);
    if (!n || n in out) continue;
    const s = saved[n];
    out[n] = s && (s === 'ignore' || keys.has(s)) ? s : (idx.get(n) || 'new');
  }
  return out;
}

/**
 * Starting settings for a workbook: header row, mapping (by normalised header, shared by
 * all sheets) and whether the sheet name fills Area. Sheet name → Area is on when the project
 * has an Area column, the sheet has no Area header of its own, and the name matches an Area
 * option (or Area has no options yet).
 */
export function defaultImportSettings(book, project) {
  const columns = mdlColumns(project);
  const area = columns.find(c => c.key === 'area');
  const sheets = {};
  const headers = [];
  for (const s of book.sheets) {
    const headerRow = detectHeader(s.text, columns);
    sheets[s.name] = { include: headerRow >= 0, headerRow };
    if (headerRow >= 0) headers.push(...s.text[headerRow].filter(h => !blank(h)));
  }
  const mapping = autoMapping(headers, columns, project?.mdlImportMap || {});
  for (const s of book.sheets) {
    const cfg = sheets[s.name];
    const own = cfg.headerRow >= 0 && s.text[cfg.headerRow].some(h => mapping[normHeader(h)] === 'area');
    const matches = area && (!area.options?.length || area.options.some(o => normValue(o) === normValue(s.name)));
    cfg.areaFromSheet = !!(area && cfg.include && !own && matches);
  }
  return { sheets, mapping };
}

// ─── Values ─────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
function toDate(raw, text) {
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const s = String(text || raw || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s); // 20.09.2026, 20/09/2026 (day first)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return s;
}

/** One cell, as stored for its column type. */
function cellFor(c, raw, text) {
  if (blank(raw) && blank(text)) return '';
  if (c.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(text).trim());
    return Number.isFinite(n) ? n : String(text).trim();
  }
  if (c.type === 'date') return toDate(raw, text);
  return String(text ?? raw).trim();
}

const same = (a, b) => String(a ?? '') === String(b ?? '');

/** Column type for a new column, from its header and values. */
function guessType(header, values) {
  if (/date/i.test(header)) return 'date';
  const v = values.filter(x => !blank(x));
  return v.length && v.every(x => typeof x === 'number' || /^-?\d+(\.\d+)?$/.test(String(x).trim())) ? 'number' : 'text';
}

// ─── Plan ───────────────────────────────────────────────────────────────────
/**
 * Work out what an import would do. Nothing is changed.
 *   book        from readWorkbook
 *   project     the project (mdlColumns, mdlImportMap, workflow)
 *   drawings    the project's drawings
 *   disciplines the workspace's discipline list
 *   settings    { sheets, mapping } from defaultImportSettings, as edited
 *   choices     { confirmNoNumber: [rowId], resolutions: { colKey: { normValue: 'add' | 'skip' | option } },
 *                 disciplineOf: { key: discipline }, updateReceivedTitles: false }
 */
export function buildPlan({ book, project, drawings = [], disciplines = [], settings, choices = {} }) {
  const baseCols = mdlColumns(project);
  const columns = baseCols.map(c => ({ ...c, options: [...(c.options || [])] }));
  const byKey = new Map(columns.map(c => [c.key, c]));
  const confirm = new Set(choices.confirmNoNumber || []);
  const resolutions = choices.resolutions || {};

  // new columns for headers mapped to 'new'
  const newColumns = [];
  const target = {}; // normalised header → column key
  const taken = new Set(columns.map(c => c.key));
  for (const s of book.sheets) {
    const cfg = settings.sheets[s.name];
    if (!cfg?.include || cfg.headerRow < 0) continue;
    s.text[cfg.headerRow].forEach((h, ci) => {
      const n = normHeader(h);
      if (!n || n in target) return;
      const t = settings.mapping[n] || 'ignore';
      if (t === 'new') {
        const values = s.rows.slice(cfg.headerRow + 1).map(r => r[ci]);
        const c = { key: keyFromLabel(h, taken), label: String(h).trim(), type: guessType(h, values), options: [], width: 120, visible: true, source: 'import', aliases: [] };
        taken.add(c.key); newColumns.push(c); columns.push(c); byKey.set(c.key, c);
        target[n] = c.key;
      } else target[n] = t === 'ignore' ? null : t;
    });
  }

  // read the rows, merging the sheets by document number
  const merged = new Map();   // key → { values, sources }
  const noNumber = [];
  const duplicates = [];
  const unknown = new Map();  // colKey|normValue → { col, label, value, count }
  const areaCol = byKey.get('area');
  const disciplineOpts = [...disciplines];
  const existing = new Map();
  for (const d of drawings) existing.set(normCode(d.code), d);

  for (const s of book.sheets) {
    const cfg = settings.sheets[s.name];
    if (!cfg?.include || cfg.headerRow < 0) continue;
    const header = s.text[cfg.headerRow];
    const seenHere = new Set();
    for (let r = cfg.headerRow + 1; r < s.rows.length; r++) {
      const raw = s.rows[r] || [], text = s.text[r] || [];
      if (raw.every(blank) && text.every(blank)) continue;
      const values = {};
      header.forEach((h, ci) => {
        const key = target[normHeader(h)];
        const c = key && byKey.get(key);
        if (!c) return;
        const v = cellFor(c, raw[ci], text[ci]);
        if (v === '') return;
        values[key] = v;
      });
      if (cfg.areaFromSheet && areaCol && blank(values.area)) values.area = s.name.trim();
      // list values: the option's own spelling, else flagged
      for (const [key, v] of Object.entries(values)) {
        const c = byKey.get(key);
        if (c.type !== 'list') continue;
        const opts = key === 'discipline' ? disciplineOpts : c.options;
        const hit = opts.find(o => normValue(o) === normValue(v));
        if (hit) { values[key] = hit; continue; }
        const u = `${key}|${normValue(v)}`;
        const res = resolutions[key]?.[normValue(v)] || 'add';
        if (!unknown.has(u)) unknown.set(u, { col: key, label: c.label, value: String(v).trim(), norm: normValue(v), count: 0, resolution: res });
        unknown.get(u).count++;
        if (res === 'skip') delete values[key];
        else if (res !== 'add') values[key] = res;
        else values[key] = String(v).trim();
      }
      const rowId = `${s.name}#${r + 1}`;
      let key = normCode(values.code);
      if (!usableCode(key)) {
        const provisional = provisionalCode(values.title || rowId);
        const known = existing.get(provisional)?.mdlProvisional; // imported before with this provisional number
        const item = { rowId, sheet: s.name, row: r + 1, number: String(values.code ?? ''), title: String(values.title || ''), confirmed: confirm.has(rowId) || !!known, known: !!known };
        noNumber.push(item);
        if (!item.confirmed) continue;
        key = provisional;
        item.key = key;
        values.code = key;
      }
      if (seenHere.has(key)) duplicates.push({ key, sheet: s.name, row: r + 1 });
      seenHere.add(key);
      const m = merged.get(key) || { values: {}, sources: [] };
      Object.assign(m.values, values);
      m.sources.push(rowId);
      merged.set(key, m);
    }
  }

  const mapped = new Set(Object.values(target).filter(Boolean));
  const rows = [];
  const optionAdds = {}; // colKey → Set of values to add as options
  const addOption = (key, v) => { (optionAdds[key] = optionAdds[key] || new Set()).add(v); };

  for (const [key, m] of merged) {
    const v = m.values;
    const d = existing.get(key);
    const changes = [];
    for (const [k, to] of Object.entries(v)) {
      const c = byKey.get(k);
      if (c.type === 'list' && !(k === 'discipline' ? disciplineOpts : c.options).some(o => normValue(o) === normValue(to))) addOption(k, to);
    }
    if (!d) {
      const discipline = choices.disciplineOf?.[key] || v.discipline || proposeDiscipline(key, disciplines);
      if (!disciplineOpts.some(o => normValue(o) === normValue(discipline))) addOption('discipline', discipline);
      rows.push({ key, status: 'new', code: key, title: v.title || key, discipline, values: v, sources: m.sources, changes: [] });
      continue;
    }
    const received = (d.versions || []).length > 0;
    for (const [k, to] of Object.entries(v)) {
      const c = byKey.get(k);
      if (k === 'code') continue; // the number is the key
      if (k === 'title' && received && !choices.updateReceivedTitles) {
        if (!same(d.title, to)) changes.push({ col: k, label: c.label, from: d.title, to, held: true });
        continue;
      }
      if (c.source === 'field') { if (!same(d[k], to)) changes.push({ col: k, label: c.label, from: d[k] ?? '', to }); continue; }
      if (c.source === 'workflow') {
        if (derivedValue(c, d, project)) continue;           // the review says it; the file cannot override it
        if (!same(d.mdl?.[k], to)) changes.push({ col: k, label: c.label, from: d.mdl?.[k] ?? '', to });
        continue;
      }
      if (!same(d.mdl?.[k], to)) changes.push({ col: k, label: c.label, from: d.mdl?.[k] ?? '', to });
    }
    const live = changes.filter(x => !x.held);
    rows.push({ key, status: live.length ? 'updated' : 'unchanged', existingId: d.id, code: d.code, title: d.title, values: v, sources: m.sources, changes });
  }

  const inFile = new Set(merged.keys());
  const notInImport = drawings.filter(d => !inFile.has(normCode(d.code))).map(d => ({ id: d.id, code: d.code, title: d.title }));
  const count = (st) => rows.filter(r => r.status === st).length;
  return {
    columns, newColumns, mapped: [...mapped],
    rows, noNumber, duplicates, notInImport,
    unknownValues: [...unknown.values()],
    optionAdds: Object.fromEntries(Object.entries(optionAdds).map(([k, s]) => [k, [...s]])),
    counts: { new: count('new'), updated: count('updated'), unchanged: count('unchanged'), skipped: noNumber.filter(x => !x.confirmed).length },
    // saved on the project: a header that made a new column maps to that column next time
    mapping: Object.fromEntries(Object.entries(settings.mapping).map(([h, t]) => [h, t === 'new' && target[h] ? target[h] : t])),
  };
}

// ─── Commit ─────────────────────────────────────────────────────────────────
const defaultUid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Apply a plan. Returns the project's drawings after the import (never fewer than before),
 * the project's new column list and saved mapping, and disciplines to add to the workspace.
 */
export function applyPlan(plan, { project, drawings = [], user = null, now = new Date().toISOString(), uid = defaultUid }) {
  const entry = (extra) => ({ id: uid('mdl'), at: now, by: user?.id || null, byName: user?.name || 'System', action: 'mdl-import', ...extra });
  const columns = plan.columns.map(c => (plan.optionAdds[c.key] && c.type === 'list' && c.key !== 'discipline'
    ? { ...c, options: [...c.options, ...plan.optionAdds[c.key].filter(v => !c.options.some(o => normValue(o) === normValue(v)))] }
    : c));
  const byKey = new Map(columns.map(c => [c.key, c]));
  const mdlOf = (values) => Object.fromEntries(Object.entries(values).filter(([k]) => !FIELD_KEYS.has(k) && byKey.get(k)?.source !== 'field'));

  const updates = new Map(plan.rows.filter(r => r.status === 'updated').map(r => [r.existingId, r]));
  const out = drawings.map(d => {
    const r = updates.get(d.id);
    if (!r) return d;
    const next = { ...d, mdl: { ...(d.mdl || {}) } };
    const live = r.changes.filter(x => !x.held);
    for (const ch of live) {
      if (byKey.get(ch.col)?.source === 'field') next[ch.col] = ch.to;
      else next.mdl[ch.col] = ch.to;
    }
    next.mdlHistory = [...(d.mdlHistory || []), entry({ changes: live.map(({ col, from, to }) => ({ col, from, to })) })].slice(-50);
    return next;
  });

  const created = plan.rows.filter(r => r.status === 'new').map(r => ({
    id: uid('dwg'),
    code: r.key,
    title: String(r.values.title || r.key),
    description: '',
    discipline: r.discipline,
    subType: String(r.values.subType || ''),
    projectId: project.id,
    currentVersion: null,
    pdfData: null,
    crsData: null,
    clientName: '', consultant: '', contractor: '',
    versions: [],
    pins: [],
    expected: true,
    ...(plan.noNumber.some(n => n.key === r.key) ? { mdlProvisional: true } : {}),
    mdl: mdlOf(r.values),
    mdlHistory: [entry({ note: 'Listed in the MDL' })],
  }));

  const mdlImportMap = { ...(project.mdlImportMap || {}), ...plan.mapping };
  const newDisciplines = plan.optionAdds.discipline || [];
  return { drawings: [...created, ...out], created: created.length, updated: updates.size, createdIds: created.map(d => d.id), updatedIds: [...updates.keys()], columns, mdlImportMap, newDisciplines };
}

// ─── Export ─────────────────────────────────────────────────────────────────
const sheetName = (s, used) => {
  let n = String(s || 'MDL').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'MDL';
  const base = n; let i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
};

/** Rows for one sheet: the header labels, then one row per drawing. */
function sheetRows(columns, drawings, project) {
  return [columns.map(c => c.label), ...drawings.map(d => columns.map(c => {
    const v = cellValue(c, d, project);
    return c.type === 'number' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : (v ?? '');
  }))];
}

/** Export: one sheet per Area (records without one go to "MDL"), the visible columns in order. */
export function exportWorkbook(project, drawings) {
  const columns = mdlColumns(project).filter(c => c.visible !== false);
  const areaCol = mdlColumns(project).find(c => c.key === 'area');
  const groups = new Map();
  for (const d of drawings) {
    const a = areaCol ? String(d.mdl?.area || '').trim() : '';
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a).push(d);
  }
  // Area options order first, then anything else, records without an Area last
  const order = [...(areaCol?.options || []), ...[...groups.keys()].filter(a => a && !(areaCol?.options || []).includes(a)), ''];
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const a of order) {
    const list = groups.get(a);
    if (!list?.length) continue;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows(columns, list, project)), sheetName(a || 'MDL', used));
  }
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetRows(columns, [], project)), 'MDL');
  return wb;
}

/** Blank template: the project's own editable columns (read-only ones left out). */
export function templateWorkbook(project) {
  const columns = mdlColumns(project).filter(c => c.visible !== false && c.source !== 'workflow');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns.map(c => c.label)]), 'MDL');
  return wb;
}

/** Workbook → bytes (for tests and uploads). */
export const workbookBytes = (wb) => new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
