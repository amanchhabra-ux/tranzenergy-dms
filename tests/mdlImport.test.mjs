// MDL import acceptance tests 1, 2, 3 and 5 (spec "DMS changes for TE-002", section 3),
// run on the real TE-002 files, read from where they are (nothing is copied into the repo).
//   node tests/mdlImport.test.mjs
// Paths can be overridden with MDL_IMPORT_FILE and MASTER_MDL_FILE.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { readWorkbook, defaultImportSettings, buildPlan, applyPlan, exportWorkbook, workbookBytes } from '../src/utils/mdlImport.js';
import { TE002_MDL_COLUMNS, normCode, cellValue, mdlColumns, nextRevision } from '../src/utils/mdl.js';
import { stageName } from '../src/utils/workflow.js';

const TE = 'C:/Users/Jacopo Licheri/Documents/Lavoro/Tranzenergy IN/Offers/TE-002 OE RPCL Madarganj';
const FILE_A = process.env.MDL_IMPORT_FILE || `${TE}/Review pipeline/DMS MDL import 24.09.2026.xlsx`;
const FILE_B = process.env.MASTER_MDL_FILE || `${TE}/Submissions/2026-09-20/whatsapp intake/Master_MDL_RPCL.xlsx`;

const DISCIPLINES = ['Electrical', 'Civil', 'Mechanical', 'SCADA & Telecom', 'Protection & Control', 'Structural', 'Other'];
let n = 0;
const ok = (msg) => console.log(`  ok ${++n} - ${msg}`);
const read = (file) => readWorkbook(new Uint8Array(fs.readFileSync(file)));
let seq = 0;
const uid = (p) => `${p}-t${++seq}`;
const user = { id: 'u1', name: 'Test' };

// One import, as the MDL view does it: default settings, optional edits, plan, apply
function importInto(state, book, { edit, choices } = {}) {
  const settings = defaultImportSettings(book, state.project);
  if (edit) edit(settings);
  const plan = buildPlan({ book, project: state.project, drawings: state.drawings, disciplines: state.disciplines, settings, choices });
  const res = applyPlan(plan, { project: state.project, drawings: state.drawings, user, uid });
  const next = {
    project: { ...state.project, mdlColumns: res.columns, mdlImportMap: res.mdlImportMap },
    drawings: res.drawings,
    disciplines: [...state.disciplines, ...res.newDisciplines],
  };
  return { plan, res, settings, next };
}

// ── The project as it stands: TE-002 columns, 43 drawings already received ──
const bookA = read(FILE_A);
const status = bookA.sheets.find(s => s.name === 'TE-002 status');
assert.ok(status, 'sheet "TE-002 status" present');
const received = status.text.slice(1).filter(r => String(r[2] || '').trim()).slice(0, 43);
assert.equal(received.length, 43, '43 received documents to stand in for the drawings already in the DMS');
// stored with other spellings (lower case, doubled spaces), with a file and a review under way
const existing = received.map((r, i) => ({
  id: `dwg-old-${i}`, projectId: 'p1',
  code: i % 3 === 0 ? String(r[0]).toLowerCase() : i % 3 === 1 ? `  ${String(r[0]).replace(/ /g, '  ')}  ` : String(r[0]),
  title: `Existing title ${i}`, discipline: 'Electrical', subType: '',
  currentVersion: 'R0', versions: [{ version: 'R0', date: '2026-09-20 10:00', pdfData: '/api/file?key=x' }], pins: [],
  review: { cycle: 1, version: 'R0', stage: 'ir1', dueDate: '2026-10-04', history: [] },
}));
const project0 = { id: 'p1', code: 'RPCL', mdlColumns: TE002_MDL_COLUMNS, workflow: { enabled: true, categoryFormat: 'Category-{key}' } };
let state = { project: project0, drawings: existing, disciplines: DISCIPLINES };

console.log('Test 1: import "DMS MDL import 24.09.2026.xlsx"');
{
  const { plan, res, settings, next } = importInto(state, bookA, {
    // the status sheet's own tracking columns are not wanted in the MDL
    edit: (s) => { for (const [h, t] of Object.entries(s.mapping)) if (t === 'new') s.mapping[h] = 'ignore'; },
  });
  assert.equal(settings.sheets['MDL Template'].headerRow, 0); ok('header found on row 1 of "MDL Template"');
  assert.equal(settings.sheets['TE-002 status'].headerRow, 0); ok('header found on row 1 of "TE-002 status"');
  assert.equal(settings.sheets['MDL Template'].areaFromSheet, false); ok('sheet names that are not Areas do not fill Area');
  assert.equal(settings.mapping.drawingcode, 'code'); ok('"Drawing Code" maps to the document number');
  assert.equal(plan.rows.length, 193); ok('193 documents in the file (the two sheets merged by number)');
  assert.equal(plan.counts.new, 150); ok('150 new expected records');
  assert.equal(plan.counts.updated + plan.counts.unchanged, 43); ok('the 43 drawings already in the DMS are matched, not duplicated');
  assert.equal(next.drawings.length, 193); ok('193 records after the import');
  const created = next.drawings.filter(d => d.expected);
  assert.equal(created.length, 150);
  assert.ok(created.every(d => !d.review && d.currentVersion === null && d.versions.length === 0)); ok('no review started, no revision, no due date on new records');
  assert.ok(next.drawings.filter(d => d.review).every(d => d.review.dueDate === '2026-10-04')); ok('due dates of the drawings under review untouched');
  const held = plan.rows.filter(r => r.changes.some(c => c.held));
  assert.ok(held.length > 0 && next.drawings.filter(d => d.title.startsWith('Existing title')).length === 43); ok('titles of received drawings change only when ticked');
  assert.equal(plan.noNumber.length, 0); ok('no row without a number in this file');
  const unknownReview = plan.unknownValues.find(u => u.col === 'review' && /annexure a/i.test(u.value));
  assert.ok(unknownReview); ok(`unknown list value flagged: Review "${unknownReview.value}" (${unknownReview.count} rows)`);
  assert.equal(res.created, 150);
  state = next;
}

console.log('Test 2: import the same file again');
{
  const { plan } = importInto(state, bookA, {
    edit: (s) => { for (const [h, t] of Object.entries(s.mapping)) if (t === 'new') s.mapping[h] = 'ignore'; },
  });
  assert.equal(plan.counts.new, 0); assert.equal(plan.counts.updated, 0);
  ok(`0 new, 0 updated (${plan.counts.unchanged} unchanged)`);
}

console.log('Test 2b: same file twice with the default mapping (unknown headers become new columns)');
{
  const first = importInto({ ...state, project: { ...state.project, mdlImportMap: {} } }, bookA); // as if nothing was saved yet
  assert.ok(first.plan.newColumns.length >= 5); ok(`first import adds ${first.plan.newColumns.length} columns: ${first.plan.newColumns.map(c => c.label).join(', ')}`);
  const second = importInto(first.next, bookA);
  assert.equal(second.plan.newColumns.length, 0); ok('second import reuses them (mapping saved on the project)');
  assert.equal(second.plan.counts.new, 0); assert.equal(second.plan.counts.updated, 0); ok('second import: 0 new, 0 updated');
  // the rest of the tests go on without these extra columns
}

console.log('Test 1b: the Master MDL (4 sheets, 8 columns) and the row without a number');
{
  const bookB = read(FILE_B);
  const first = importInto(state, bookB);
  const s = first.settings.sheets;
  assert.ok(Object.values(s).every(x => x.include && x.headerRow === 0 && x.areaFromSheet)); ok('4 sheets: header on row 1, sheet name fills Area');
  assert.equal(first.plan.noNumber.length, 1);
  assert.equal(first.plan.noNumber[0].title, 'Detailed implementation Schedule');
  assert.equal(first.plan.counts.skipped, 1); ok('"Detailed implementation Schedule" (number "—") waits for confirmation');
  const areas = new Set(first.plan.rows.map(r => r.values.area));
  assert.deepEqual([...areas].sort(), ['100 MW Solar PV Plant', '132 kV Transmission Line', 'Pooling SS', 'Site works']); ok('Areas match the options ("Site_works" = "Site works")');
  const pre = first.plan.rows.find(r => r.key === normCode('RPCL100MW-ARIPL-PVP-ELE-SLD-001'));
  assert.equal(pre.values.prerequisite, 'Can do'); ok('"can do" stored as the option "Can do"');
  const tl = first.plan.rows.find(r => r.status === 'new' && /TL-/.test(r.key));
  if (tl) { assert.equal(tl.discipline, 'Transmission line'); ok(`discipline proposed from the number: ${tl.key} → Transmission line`); }
  const rowId = first.plan.noNumber[0].rowId;
  const second = importInto(state, bookB, { choices: { confirmNoNumber: [rowId] } });
  const prov = second.next.drawings.find(d => d.mdlProvisional);
  assert.ok(prov && prov.code.startsWith('TBA-') && prov.expected); ok(`confirmed: imported with the provisional number ${prov.code}`);
  assert.equal(second.plan.counts.skipped, 0);
  state = second.next;
  // the provisional record is recognised next time without asking again
  const again = importInto(state, bookB);
  assert.equal(again.plan.counts.new, 0); assert.equal(again.plan.counts.updated, 0); assert.equal(again.plan.counts.skipped, 0);
  ok('Master MDL imported again: 0 new, 0 updated, provisional row matched');
}

console.log('Test 3: change one Priority cell and import');
{
  const wb = exportWorkbook(state.project, state.drawings);
  const ws = wb.Sheets['Pooling SS'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const pc = rows[0].indexOf('Priority'), cc = rows[0].indexOf('Document No.');
  assert.ok(pc >= 0 && cc >= 0, 'Priority and Document No. columns exported');
  rows[1][pc] = 'super URGENT';
  wb.Sheets['Pooling SS'] = XLSX.utils.aoa_to_sheet(rows);
  const target = normCode(rows[1][cc]);
  const before = state.drawings.find(d => normCode(d.code) === target);
  const { plan, next } = importInto(state, readWorkbook(workbookBytes(wb)));
  assert.equal(plan.counts.new, 0); assert.equal(plan.counts.updated, 1);
  const upd = plan.rows.find(r => r.status === 'updated');
  assert.deepEqual(upd.changes.map(c => [c.col, c.from, c.to]), [['priority', '', 'Super urgent']]); ok(`1 updated: ${upd.key} Priority "" → "Super urgent"`);
  const after = next.drawings.find(d => d.id === before.id);
  assert.equal((after.mdlHistory || []).length, (before.mdlHistory || []).length + 1); ok('one history entry on that record');
  assert.equal(after.mdl.priority, 'Super urgent');
  state = next;
}

console.log('Test 5: export, then re-import the export');
{
  const wb = exportWorkbook(state.project, state.drawings);
  assert.deepEqual(wb.SheetNames.slice(0, 4), ['Pooling SS', '100 MW Solar PV Plant', 'Site works', '132 kV Transmission Line']); ok(`one sheet per Area: ${wb.SheetNames.join(', ')}`);
  const visible = mdlColumns(state.project).filter(c => c.visible !== false).map(c => c.label);
  const header = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })[0];
  assert.deepEqual(header, visible); ok('same columns, labels and order as the MDL table');
  const exp = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const stageCol = header.indexOf('TE review stage');
  assert.ok(exp.slice(1).some(r => r[stageCol] === 'Expected') && exp.slice(1).some(r => r[stageCol] === stageName(state.project, 'ir1'))); ok(`derived columns filled (TE review stage: Expected / ${stageName(state.project, 'ir1')})`);
  const { plan } = importInto(state, readWorkbook(workbookBytes(wb)));
  assert.equal(plan.counts.new, 0); assert.equal(plan.counts.updated, 0); assert.equal(plan.counts.skipped, 0);
  ok(`re-import of the export: 0 new, 0 updated (${plan.counts.unchanged} unchanged)`);
}

console.log('Receiving an expected record (test 4, pure part)');
{
  const d = state.drawings.find(x => x.expected);
  assert.equal(nextRevision(d), 'R0'); ok('an expected record becomes R0 by default, not R1');
  assert.equal(nextRevision(d, 'r01'), 'R01'); ok('or the revision given');
  assert.equal(nextRevision({ currentVersion: 'R0', versions: [{}] }), 'R1'); ok('a received record still goes R0 → R1');
  assert.equal(cellValue(TE002_MDL_COLUMNS.find(c => c.key === 'teStage'), d, state.project), 'Expected');
}

console.log(`\nAll ${n} checks passed.`);
