// Review workflow rules that do not need the server: the project's category list,
// the MDL's derived category columns, the proposed category and the due date.
//   node tests/workflow.test.mjs
import assert from 'node:assert/strict';
import {
  DEFAULT_CATEGORIES, AEL_CATEGORIES, categoriesOf, findCategory, categoryText, reviewWithCategory, reviewWithProposed, categoriesInUse, newReviewFor,
  reviewWithDue, canEditDue, DEFAULT_DUE_SOURCE, addDays, today, dueState,
} from '../src/utils/workflow.js';
import { TE002_MDL_COLUMNS, cellValue } from '../src/utils/mdl.js';

let n = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok ${++n} - ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${++n} - ${name}\n      ${e.message}`); }
}
let seq = 0;
const entry = (action, extra = {}) => ({ id: `h${++seq}`, at: '2026-09-27T10:00:00.000Z', by: 'u1', byName: 'Tester', action, ...extra });
const atClient = () => ({ cycle: 1, version: 'R0', stage: 'client', category: null, history: [] });
const col = (key) => TE002_MDL_COLUMNS.find(c => c.key === key);

// ── Category list per project ────────────────────────────────────────────────
const plain = { workflow: { enabled: true } };                               // never set a list
const legacyFormat = { workflow: { enabled: true, categoryFormat: 'Category-{key}' } };
const ael = { workflow: { enabled: true, categories: AEL_CATEGORIES } };

test('the due date shows only before the CRS is issued (ir1, ir2, approval)', () => {
  const past = addDays(today(), -3);
  for (const stage of ['ir1', 'ir2', 'approval']) assert.equal(dueState({ stage, dueDate: past }).kind, 'overdue', stage);
  for (const stage of ['consultant', 'client', 'resubmit', 'closed']) assert.equal(dueState({ stage, dueDate: past }).kind, 'none', stage);
});

test('a project without workflow.categories keeps the default list (1, 2, 3, 4B)', () => {
  assert.deepEqual(categoriesOf(plain.workflow).map(c => c.key), ['1', '2', '3', '4B']);
  assert.equal(categoriesOf(plain.workflow), DEFAULT_CATEGORIES);
  assert.equal(categoriesOf({ categories: [] }), DEFAULT_CATEGORIES);
});

test('default list unchanged: Category 1 and 2 close, 3 and 4B wait for resubmission', () => {
  const to = (k) => reviewWithCategory(atClient(), plain.workflow, k, { entry }).stage;
  assert.deepEqual(['1', '2', '3', '4B'].map(to), ['closed', 'closed', 'resubmit', 'resubmit']);
});

test('AEL legend: only 1 and 4A close; 2, 2*, 3, 4B, 4B* wait for resubmission', () => {
  const to = (k) => reviewWithCategory(atClient(), ael.workflow, k, { entry }).stage;
  assert.deepEqual(AEL_CATEGORIES.map(c => [c.key, to(c.key)]), [
    ['1', 'closed'], ['2', 'resubmit'], ['2*', 'resubmit'], ['3', 'resubmit'], ['4A', 'closed'], ['4B', 'resubmit'], ['4B*', 'resubmit'],
  ]);
});

test('recording a category writes closedAt only when it closes, and a history entry', () => {
  const closed = reviewWithCategory(atClient(), ael.workflow, '4A', { entry, decidedOn: '2026-09-26', note: 'RPCL letter 12' });
  assert.ok(closed.closedAt);
  const h = closed.history.at(-1);
  assert.equal(h.action, 'category'); assert.equal(h.category, '4A'); assert.equal(h.decidedOn, '2026-09-26'); assert.equal(h.to, 'closed');
  const open = reviewWithCategory(atClient(), ael.workflow, '2', { entry });
  assert.equal(open.closedAt, null);
});

test('a category outside the project list is refused', () => {
  assert.equal(reviewWithCategory(atClient(), plain.workflow, '4A', { entry }), null); // 4A is not in the default list
  assert.equal(reviewWithCategory(atClient(), ael.workflow, '5', { entry }), null);
  assert.equal(findCategory(ael.workflow, '2*').label, 'Category-2*');
});

test('a custom list with its own closes flags drives closed vs resubmit', () => {
  const wf = { categories: [{ key: 'A', label: 'Accepted', closes: true }, { key: 'R', label: 'Returned', closes: false }] };
  assert.equal(reviewWithCategory(atClient(), wf, 'A', { entry }).stage, 'closed');
  assert.equal(reviewWithCategory(atClient(), wf, 'R', { entry }).stage, 'resubmit');
  assert.equal(reviewWithCategory(atClient(), wf, '1', { entry }), null);
});

test('category text: project list label, else categoryFormat, else "Category {key}"', () => {
  assert.equal(categoryText('2*', ael.workflow), 'Category-2*');
  assert.equal(categoryText('3', legacyFormat.workflow), 'Category-3');
  assert.equal(categoryText('3', plain.workflow), 'Category 3');
  assert.equal(categoryText('', ael.workflow), '');
  // labels in the list win over the format; a key missing from the list falls back to the format
  const both = { categoryFormat: 'Cat-{key}', categories: [{ key: '1', label: 'Approved', closes: true }] };
  assert.equal(categoryText('1', both), 'Approved');
  assert.equal(categoryText('9', both), 'Cat-9');
});

test('MDL derived columns (TE category, Category from RPCL) use the project list', () => {
  const d = { id: 'd1', code: 'X', review: { stage: 'resubmit', proposedCategory: '2*', category: '4B*', history: [] } };
  assert.equal(cellValue(col('teCategory'), d, ael), 'Category-2*');
  assert.equal(cellValue(col('clientCategory'), d, ael), 'Category-4B*');
  const custom = { workflow: { categories: [{ key: '2*', label: 'Approved w/ comments, proceed', closes: false }, { key: '4B*', label: 'Record, proceed', closes: false }] } };
  assert.equal(cellValue(col('teCategory'), d, custom), 'Approved w/ comments, proceed');
  assert.equal(cellValue(col('clientCategory'), d, custom), 'Record, proceed');
  // a project that only set categoryFormat keeps working
  assert.equal(cellValue(col('clientCategory'), { ...d, review: { ...d.review, category: '3' } }, legacyFormat), 'Category-3');
});

test('categories in use (current and archived cycles) are listed, per project', () => {
  const drawings = [
    { projectId: 'p1', review: { category: '3', proposedCategory: '2', cycles: [{ category: '4B' }] } },
    { projectId: 'p1', review: null },
    { projectId: 'p2', review: { category: '1' } },
  ];
  assert.deepEqual([...categoriesInUse(drawings, 'p1')].sort(), ['2', '3', '4B']);
});

// ── Proposed category at issue ───────────────────────────────────────────────
test('proposed category: stored with a history entry; outside the list refused', () => {
  const r0 = { stage: 'ir2', history: [] };
  const r1 = reviewWithProposed(r0, ael.workflow, '2*', { entry });
  assert.equal(r1.proposedCategory, '2*');
  assert.deepEqual([r1.history.at(-1).action, r1.history.at(-1).category, r1.history.at(-1).previous], ['proposed', '2*', null]);
  assert.equal(reviewWithProposed(r1, ael.workflow, '2*', { entry }), r1, 'same category: no new entry');
  assert.equal(reviewWithProposed(r0, plain.workflow, '2*', { entry }), null);
  assert.equal(cellValue(col('teCategory'), { review: r1 }, ael), 'Category-2*');
});

test('a new cycle clears the proposed category and archives the old one', () => {
  const prev = { cycle: 1, version: 'R0', stage: 'resubmit', category: '3', proposedCategory: '2', history: [] };
  const next = newReviewFor({ currentVersion: 'R1', pins: [], crsImported: [] }, { workflow: { turnaroundDays: 10 } }, prev, { entry });
  assert.equal(next.proposedCategory, null);
  assert.equal(next.cycles[0].proposedCategory, '2');
});

// ── Due date with its source ─────────────────────────────────────────────────
test('a review starts due in the project turnaround, source "project default"', () => {
  const r = newReviewFor({ currentVersion: 'R0' }, { workflow: { turnaroundDays: 10 } }, null, { entry });
  assert.equal(r.dueSource, DEFAULT_DUE_SOURCE);
  assert.equal(DEFAULT_DUE_SOURCE, 'project default');
  assert.equal(r.dueDate, addDays(today(), 10));
});

test('due date edit writes a history entry with old and new values', () => {
  const r0 = { stage: 'ir1', dueDate: '2026-10-04', dueSource: 'project default', history: [] };
  const r1 = reviewWithDue(r0, { dueDate: '2026-09-30', dueSource: 'Atlanta email 24.09.2026: by 30.09' }, { entry });
  assert.equal(r1.dueDate, '2026-09-30');
  assert.equal(r1.dueSource, 'Atlanta email 24.09.2026: by 30.09');
  const h = r1.history.at(-1);
  assert.deepEqual([h.action, h.oldDue, h.newDue, h.oldSource, h.newSource],
    ['due', '2026-10-04', '2026-09-30', 'project default', 'Atlanta email 24.09.2026: by 30.09']);
  assert.match(h.note, /2026-10-04 → 2026-09-30/);
  assert.match(h.note, /project default → Atlanta email/);
  // source only
  const r2 = reviewWithDue(r1, { dueDate: '2026-09-30', dueSource: 'RPCL letter 17' }, { entry });
  assert.deepEqual([r2.history.at(-1).oldDue, r2.history.at(-1).newDue, r2.history.at(-1).newSource], ['2026-09-30', '2026-09-30', 'RPCL letter 17']);
  // nothing changed: no entry
  assert.equal(reviewWithDue(r2, { dueDate: '2026-09-30', dueSource: 'RPCL letter 17' }, { entry }), r2);
  // not a date
  assert.equal(reviewWithDue(r2, { dueDate: '30.09.2026', dueSource: '' }, { entry }), null);
  assert.equal(reviewWithDue(r2, { dueDate: '', dueSource: '' }, { entry }), null);
});

test('who may edit the due date: admins, approvers and the issuer, never a consultant', () => {
  const project = { workflow: { finalCheck: false, firstReviewers: ['u3'], secondReviewers: ['u4'], approvers: ['u6'] } };
  const u = (id, role = 'Engineer') => ({ id, role });
  assert.equal(canEditDue(u('u1', 'Admin'), project), true);
  assert.equal(canEditDue(u('u6'), project), true, 'approver');
  assert.equal(canEditDue(u('u4'), project), true, 'TE Review Engineer issues when there is no final check');
  assert.equal(canEditDue(u('u3'), project), false, 'first reviewer');
  assert.equal(canEditDue(u('u2', 'Project Manager'), project), false);
  assert.equal(canEditDue(u('u7', 'Consultant'), { workflow: { ...project.workflow, approvers: ['u7'] } }), false);
  const withCheck = { workflow: { ...project.workflow, finalCheck: true } };
  assert.equal(canEditDue(u('u4'), withCheck), false, 'with a final check the approver issues');
});

console.log(failed ? `\n${failed} of ${n} checks FAILED.` : `\nAll ${n} checks passed.`);
process.exit(failed ? 1 : 0);
