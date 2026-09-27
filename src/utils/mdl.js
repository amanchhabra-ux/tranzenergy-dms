// ─── Master Document List: configurable columns ─────────────────────────────
// project.mdlColumns: ordered list of
//   { key, label, type, options, width, visible, source, derive?, aliases? }
//   type    text | number | date | list
//   source  field    a drawing field (code, title, discipline, subType); cannot be deleted
//           import   a value typed or imported, kept in drawing.mdl[key]
//           workflow derived from the drawing / its review, read-only; `derive` says how.
//                    An imported value is kept in drawing.mdl[key] as a backfill and shown
//                    only while the review has nothing to say.
// drawing.expected: true while the document is listed in the MDL but no file has arrived
// (versions: [], currentVersion: null, no review, no due date).
import { stageName } from './workflow.js';

export const COLUMN_TYPES = ['text', 'number', 'date', 'list'];

// Built-in drawing fields, with the Excel headers they are recognised by
export const FIELD_COLUMNS = [
  { key: 'code', label: 'Drawing Code', type: 'text', source: 'field', width: 230,
    aliases: ['Drawing No', 'Drawing Number', 'Document No', 'Document Number', 'Document Code', 'Doc No', 'Dwg No', 'Drg No', 'Code'] },
  { key: 'title', label: 'Title', type: 'text', source: 'field', width: 320, aliases: ['Document Title', 'Drawing Title'] },
  { key: 'discipline', label: 'Discipline', type: 'list', source: 'field', width: 130, aliases: [] },
  { key: 'subType', label: 'Sub-type', type: 'text', source: 'field', width: 120, aliases: ['Subtype', 'Sub type', 'Document Type'] },
];
export const FIELD_KEYS = new Set(FIELD_COLUMNS.map(c => c.key));

// Read-only columns worked out from the drawing and its review
export const DERIVED = {
  revision:         { label: 'Rev', type: 'text', width: 60 },
  lastUpdated:      { label: 'Last updated', type: 'date', width: 100 },
  stage:            { label: 'Review stage', type: 'text', width: 150 },
  proposedCategory: { label: 'Proposed category', type: 'text', width: 120 },
  issuedDate:       { label: 'CRS issued', type: 'date', width: 100 },
  forwardedDate:    { label: 'Forwarded to client', type: 'date', width: 100 },
  clientCategory:   { label: 'Client category', type: 'text', width: 120 },
  dueDate:          { label: 'Due', type: 'date', width: 100 },
};

const col = (c) => ({ options: [], visible: true, width: 120, aliases: [], ...c });

/** Columns a project has before anyone configures them. */
export const DEFAULT_MDL_COLUMNS = [
  ...FIELD_COLUMNS.map(col),
  col({ key: 'rev', label: 'Rev', type: 'text', source: 'workflow', derive: 'revision', width: 60 }),
  col({ key: 'updated', label: 'Last updated', type: 'date', source: 'workflow', derive: 'lastUpdated', width: 100 }),
];

/** TE-002 column set: the eight columns of the Master MDL, our tracking columns and a priority list. */
export const TE002_MDL_COLUMNS = [
  col({ key: 'sn', label: 'SN', type: 'number', source: 'import', width: 50, aliases: ['S.No', 'S No', 'Sr No', 'Sl No'] }),
  col({ key: 'code', label: 'Document No.', type: 'text', source: 'field', width: 250, aliases: FIELD_COLUMNS[0].aliases.concat(['Drawing Code']) }),
  col({ key: 'title', label: 'Document Title', type: 'text', source: 'field', width: 320, aliases: ['Title', 'Drawing Title'] }),
  col({ key: 'area', label: 'Area', type: 'list', source: 'import', width: 150,
    options: ['Pooling SS', '100 MW Solar PV Plant', 'Site works', '132 kV Transmission Line'] }),
  col({ key: 'statusAtIssue', label: 'Status at issue', type: 'list', source: 'import', width: 120,
    options: ['Pending', 'Category-1', 'Category-2', 'Category-2*', 'Category-3', 'Category-4A', 'Category-4B', 'Category-4B*', 'not in Annexure A'] }),
  col({ key: 'review', label: 'Review', type: 'list', source: 'import', width: 110, options: ['Confirmatory', 'Full'] }),
  col({ key: 'tier', label: 'Tier', type: 'list', source: 'import', width: 60, options: ['T1', 'T2', 'T3', 'T4', 'Full'] }),
  col({ key: 'prerequisite', label: 'Prerequisite', type: 'list', source: 'import', width: 110, options: ['Can do', 'Cannot do', 'By analogy'], aliases: ['Prerequisites'] }),
  col({ key: 'priority', label: 'Priority', type: 'list', source: 'import', width: 110, options: ['Urgent', 'Very urgent', 'Super urgent'] }),
  col({ key: 'contractorSn', label: 'Contractor MDL SN', type: 'text', source: 'import', width: 90 }),
  col({ key: 'discipline', label: 'Discipline', type: 'list', source: 'field', width: 110 }),
  col({ key: 'subType', label: 'Sub-type', type: 'text', source: 'field', width: 110, aliases: FIELD_COLUMNS[3].aliases }),
  col({ key: 'rev', label: 'Rev', type: 'text', source: 'workflow', derive: 'revision', width: 55 }),
  col({ key: 'teStage', label: 'TE review stage', type: 'text', source: 'workflow', derive: 'stage', width: 150, aliases: ['TE Review'] }),
  col({ key: 'teCategory', label: 'TE category', type: 'text', source: 'workflow', derive: 'proposedCategory', width: 110 }),
  col({ key: 'sheetToConsultant', label: 'Sheet to AEL', type: 'date', source: 'workflow', derive: 'issuedDate', width: 100 }),
  col({ key: 'issuedToClient', label: 'Issued to RPCL', type: 'date', source: 'workflow', derive: 'forwardedDate', width: 100 }),
  col({ key: 'clientCategory', label: 'Category from RPCL', type: 'text', source: 'workflow', derive: 'clientCategory', width: 120 }),
  col({ key: 'due', label: 'Due', type: 'date', source: 'workflow', derive: 'dueDate', width: 100 }),
];

// Priority colours (MDL table)
export const PRIORITY_COLORS = {
  'super urgent': { bg: '#fee2e2', fg: '#b91c1c', border: '#fca5a5' },
  'very urgent':  { bg: '#fef3c7', fg: '#b45309', border: '#fcd34d' },
  'urgent':       { bg: '#fef9c3', fg: '#854d0e', border: '#fde68a' },
};

/** The project's columns (defaults when none are set), with every field column present. */
export function mdlColumns(project) {
  const list = (project?.mdlColumns?.length ? project.mdlColumns : DEFAULT_MDL_COLUMNS).map(col);
  const have = new Set(list.map(c => c.key));
  // the four drawing fields always exist; a missing one comes back hidden
  FIELD_COLUMNS.forEach(f => { if (!have.has(f.key)) list.push(col({ ...f, visible: false })); });
  return list;
}

// ─── Normalisation ──────────────────────────────────────────────────────────
/** Document number as a key: uppercase, trimmed, repeated spaces collapsed. */
export const normCode = (v) => String(v ?? '').toUpperCase().trim().replace(/\s+/g, ' ');
/** A number is usable if it holds at least two letters/digits (so "—" or "-" are not). */
export const usableCode = (k) => (String(k || '').match(/[A-Z0-9]/gi) || []).length >= 2;
/** List values match case-, space- and underscore-insensitively ("can do" = "Can do", "Site_works" = "Site works"). */
export const normValue = (v) => String(v ?? '').replace(/_/g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
/** Header text for matching ("Document No." = "document no"). */
export const normHeader = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** A provisional key for a row without a document number, stable across imports. */
export const provisionalCode = (title) => `TBA-${normCode(title).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'UNTITLED'}`;

/** A column key from a header ("Status at issue" → statusAtIssue). */
export function keyFromLabel(label, taken = new Set()) {
  const words = String(label || '').replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let key = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('') || 'column';
  if (/^\d/.test(key)) key = `c${key}`;
  let k = key, n = 2;
  while (taken.has(k)) k = `${key}${n++}`;
  return k;
}

// ─── Values ─────────────────────────────────────────────────────────────────
const categoryText = (key, project) => (key ? (project?.workflow?.categoryFormat || 'Category {key}').replace('{key}', key) : '');
const day = (v) => (v ? String(v).slice(0, 10) : '');

/** A read-only column's value, worked out from the drawing and its review. */
export function derivedValue(c, d, project) {
  const r = d.review;
  switch (c.derive) {
    case 'revision': return d.currentVersion || '';
    case 'lastUpdated': return day(d.versions?.[0]?.date);
    case 'stage': return d.expected ? 'Expected' : r ? stageName(project, r.stage) : ''; // same names as the rest of the app
    case 'proposedCategory': return categoryText(r?.proposedCategory, project);
    case 'issuedDate': return day(r?.issued?.at || [...(r?.history || [])].reverse().find(h => h.action === 'issued')?.at);
    case 'forwardedDate': return day([...(r?.history || [])].reverse().find(h => h.to === 'client')?.at);
    case 'clientCategory': return categoryText(r?.category, project);
    case 'dueDate': return r?.dueDate || '';
    default: return '';
  }
}

/** What a cell shows: the field, the stored MDL value, or the derived value (else its backfill). */
export function cellValue(c, d, project) {
  if (c.source === 'field') return d[c.key] ?? '';
  if (c.source === 'workflow') return derivedValue(c, d, project) || (d.mdl?.[c.key] ?? '');
  return d.mdl?.[c.key] ?? '';
}

/** Does any drawing hold a value in this column? (a column can be deleted only when not) */
export const columnHasValues = (c, drawings) =>
  c.source !== 'field' && drawings.some(d => { const v = d.mdl?.[c.key]; return v !== undefined && v !== null && String(v) !== ''; });

/** Sort comparator for a column. */
export function compareCells(c, a, b, project) {
  const x = cellValue(c, a, project), y = cellValue(c, b, project);
  if (x === '' && y !== '') return 1;
  if (y === '' && x !== '') return -1;
  if (c.type === 'number' && !isNaN(Number(x)) && !isNaN(Number(y))) return Number(x) - Number(y);
  if (c.type === 'list' && c.options?.length) {
    const ix = c.options.findIndex(o => normValue(o) === normValue(x)), iy = c.options.findIndex(o => normValue(o) === normValue(y));
    if (ix !== iy) return (ix < 0 ? 1e9 : ix) - (iy < 0 ? 1e9 : iy);
  }
  return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
}

/** Discipline proposed from the document number (ELE → Electrical, CIV → Civil, TL → Transmission line). */
export function proposeDiscipline(code, disciplines = []) {
  const tokens = normCode(code).split(/[^A-Z0-9]+/);
  const guesses = [['ELE', 'Electrical'], ['CIV', 'Civil'], ['STR', 'Structural'], ['MEC', 'Mechanical'], ['TL', 'Transmission line']];
  const find = (name) => disciplines.find(x => normValue(x) === normValue(name));
  for (const [tok, name] of guesses) if (tokens.includes(tok)) return find(name) || name;
  return find('Other') || 'Other';
}

/**
 * Revision for an uploaded file. An expected record (nothing received yet) takes the revision
 * given, R0 by default; a received one goes up by one (R0 → R1).
 */
export function nextRevision(d, given) {
  const g = String(given || '').toUpperCase().replace(/\s+/g, '');
  if (d?.expected || (!d?.currentVersion && !(d?.versions || []).length)) return g || 'R0';
  const cur = d.currentVersion || 'R0';
  return /^R\d+$/.test(cur) ? `R${parseInt(cur.substring(1), 10) + 1}` : `R${parseInt(cur.replace(/\D/g, '') || '0', 10) + 1}`;
}
