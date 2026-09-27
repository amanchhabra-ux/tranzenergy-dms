// Tests for the pipeline API (api/pipeline/[action].js, api/_lib/pipeline.js). Plain node:
//   node tests/pipeline.test.mjs ["<a CRS Excel in the AEL template>"] ["<the AEL template>"]
// Runs the real handler in local mode (LOCAL_DATA_DIR = a temp folder, never .local-data).
// The AEL sample defaults to a TE-002 sheet; when it is not on this machine a small generated
// sheet is used instead and the run says so.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-pipeline-'));
process.env.LOCAL_DATA_DIR = dir;
process.env.LOCAL_SESSION_SECRET = 'test-secret';
for (const k of ['CLERK_SECRET_KEY', 'ADMIN_EMAILS', 'RESEND_API_KEY', 'PIPELINE_TOKEN', 'PIPELINE_USER_EMAIL', 'R2_ACCOUNT_ID']) delete process.env[k];
console.log = ((log) => (...a) => { if (!String(a[0]).startsWith('[notify]')) log(...a); })(console.log);

const { forgetMembers, writeState, readState } = await import('../api/_lib/state.js');
const { commitChange, PipelineError } = await import('../api/_lib/pipeline.js');
const { PreconditionFailed } = await import('../api/_lib/r2.js');
const { readCrs, buildCrsTable, buildIssuedCrs } = await import('../src/utils/crs.js');
const { externalView } = await import('../api/_lib/view.js');
const { addDays, today } = await import('../src/utils/workflow.js');
const pipeline = (await import('../api/pipeline/[action].js')).default;
const { readPage, activityDir, LOG_DIR } = await import('../api/_lib/log.js');
// log and activity entries are objects (api/_lib/log.js), newest first
const activityOf = async (id) => (await readPage({ dir: activityDir(id), limit: 50 })).entries;
const logEntries = async () => (await readPage({ dir: LOG_DIR, limit: 50 })).entries;

const AEL_DEFAULT = 'C:/Users/Jacopo Licheri/Documents/Lavoro/Tranzenergy IN/Offers/TE-002 OE RPCL Madarganj/Submissions/2026-09-24/RPCL100MW-ARIPL-PSS-ELE-RPT-024/CRS-RPCL100MW-ARIPL-PSS-ELE-RPT-024 rev 00 AEL 26.09.2026.xlsx';
const AEL = process.argv[2] || AEL_DEFAULT;
const AEL_TEMPLATE = process.argv[3] || 'C:/Users/Jacopo Licheri/Documents/Lavoro/Tranzenergy IN/Offers/TE-002 OE RPCL Madarganj/Templates/CRS template AEL clean.xlsx';

const TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuvwxyz';
const USERS = [
  { id: 'u1', name: 'Aman Chhabra', email: 'aman@tranzenergy.in', role: 'Admin' },
  { id: 'u3', name: 'Jacopo Licheri', email: 'jacopolicheri@gmail.com', role: 'Project Manager' },
  { id: 'u5', name: 'Viewer', email: 'viewer@tranzenergy.in', role: 'Viewer' },
  { id: 'u7', name: 'Atlanta Engineer', email: 'eng@atlanta.example', role: 'Consultant' },
];
const FILE = (k) => `/api/file?key=${encodeURIComponent(k)}`;
const baseState = () => ({
  users: structuredClone(USERS),
  projects: [
    { id: 'p1', code: 'TE-002', name: 'RPCL 100 MW Solar', assignedUsers: ['u1', 'u3', 'u5', 'u7'],
      workflow: { enabled: true, turnaroundDays: 10, consultantUsers: ['u7'], firstReviewers: ['u3'], secondReviewers: [], approvers: [], issueNotify: [] } },
    { id: 'p2', code: 'OTHER', name: 'Other job', assignedUsers: ['u1'] },
  ],
  drawings: [
    // an MDL record, nothing received yet
    { id: 'd1', code: 'RPCL100MW-ARIPL-PSS-ELE-RPT-024', title: 'Relay coordination report', projectId: 'p1', discipline: 'Electrical',
      currentVersion: 'R0', pdfData: null, crsData: null, versions: [], pins: [], expected: true, mdl: { x: 1 } },
    // received, in review, with a sheet
    { id: 'd2', code: 'RPCL100MW-ARIPL-PVP-ELE-DTS-021', title: 'Fire detection GA', projectId: 'p1', discipline: 'Electrical',
      currentVersion: 'R1', pdfData: FILE('drawings/D21/1_r1.pdf'), crsData: FILE('crs/D21/1_crs.xlsx'), crsFileName: 'crs.xlsx',
      versions: [{ version: 'R1', pdfData: FILE('drawings/D21/1_r1.pdf') }, { version: 'R0', pdfData: FILE('drawings/D21/1_r0.pdf') }],
      pins: [], crsImported: [{ row: 5, sno: '1', comment: 'Existing comment', status: 'Open' }, { row: 6, sno: '2', comment: 'Second', status: 'Open' }],
      review: { cycle: 2, version: 'R1', stage: 'ir2', startedAt: '2026-09-20', dueDate: '2026-09-30', dueSource: 'Atlanta email', history: [{ id: 'h1', action: 'registered' }], cycles: [] } },
    // received, no sheet
    { id: 'd3', code: 'RPCL100MW-ARIPL-PVP-CIV-DWG-006A', title: 'Pile layout', projectId: 'p1', discipline: 'Civil',
      currentVersion: 'R3', pdfData: FILE('drawings/D6/1_r3.pdf'), crsData: null, versions: [{ version: 'R3', pdfData: FILE('drawings/D6/1_r3.pdf') }], pins: [],
      review: { cycle: 1, version: 'R3', stage: 'resubmit', category: '3', history: [], cycles: [] } },
    // another project: never touched
    { id: 'd9', code: 'X-009', title: 'Secret', projectId: 'p2', currentVersion: 'R0', pdfData: FILE('drawings/X-009/1_secret.pdf'), versions: [{ version: 'R0' }], pins: [] },
  ],
  proposals: [],
  activityLog: [{ id: 'l1', message: 'real 1', author: 'Aman Chhabra', authorId: 'u1', time: '2026-09-20T10:00:00.000Z' }],
  disciplines: ['Electrical', 'Civil', 'Other'],
});

const stateFile = path.join(dir, 'db_state.json');
function seed(state) { fs.writeFileSync(stateFile, JSON.stringify(state)); forgetMembers(); }
const raw = () => fs.readFileSync(stateFile, 'utf8');
const stored = () => JSON.parse(raw());
const drawingOf = (code) => stored().drawings.find(d => d.code === code);

function mockRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    end() { return this; },
  };
}
async function call(action, { method = 'POST', body, query = {}, auth = `Bearer ${TOKEN}` } = {}) {
  const res = mockRes();
  await pipeline({ method, headers: auth ? { authorization: auth } : {}, query: { ...query, action }, body }, res);
  return res;
}
const PDF = (tag = 'x') => Buffer.from(`%PDF-1.4\n% ${tag}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`).toString('base64');
const register = (body) => call('register', { body: { project: 'TE-002', fileName: 'doc.pdf', contentBase64: PDF(body.code), ...body } });
const list = (project = 'TE-002') => call('drawings', { method: 'GET', query: { project } });

function withEnv(env, fn) {
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) { if (v == null) delete process.env[k]; else process.env[k] = v; }
  return Promise.resolve(fn()).finally(() => { for (const [k, v] of Object.entries(old)) { if (v == null) delete process.env[k]; else process.env[k] = v; } });
}
const on = { PIPELINE_TOKEN: TOKEN, PIPELINE_USER_EMAIL: 'jacopolicheri@gmail.com' };

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); console.log('ok   ', name); }
  catch (e) { results.push([false, name]); console.log('FAIL ', name, '\n     ', e.message); }
}
// the drawings a call must not touch stay byte-identical
const othersSame = (before, after, changedId) => {
  const b = new Map(before.drawings.map(d => [d.id, JSON.stringify(d)]));
  for (const d of after.drawings) if (d.id !== changedId && b.has(d.id)) assert.equal(JSON.stringify(d), b.get(d.id), `drawing ${d.code} changed`);
};

// ── Authentication ────────────────────────────────────────────────────────────
await test('PIPELINE_TOKEN unset -> 404 on every route', async () => {
  seed(baseState());
  for (const a of ['drawings', 'comments', 'register', 'attach-crs', 'upload-url', 'append-rows']) {
    const r = await call(a, { method: ['drawings', 'comments'].includes(a) ? 'GET' : 'POST', body: {} });
    assert.equal(r.statusCode, 404, a);
  }
});

await withEnv(on, async () => {
  await test('token missing -> 401', async () => {
    seed(baseState());
    assert.equal((await call('drawings', { method: 'GET', query: { project: 'TE-002' }, auth: null })).statusCode, 401);
  });
  await test('token wrong -> 401, nothing written', async () => {
    seed(baseState());
    const before = raw();
    assert.equal((await call('drawings', { method: 'GET', query: { project: 'TE-002' }, auth: 'Bearer nope' })).statusCode, 401);
    assert.equal((await call('register', { body: { project: 'TE-002', code: 'NEW-1', fileName: 'a.pdf', contentBase64: PDF() }, auth: `Bearer ${TOKEN}x` })).statusCode, 401);
    assert.equal((await call('drawings', { method: 'GET', query: { project: 'TE-002' }, auth: TOKEN })).statusCode, 401, 'Bearer prefix required');
    assert.equal(raw(), before);
  });
  await test('token shorter than 32 characters -> 503 (refuses to run)', async () => {
    await withEnv({ PIPELINE_TOKEN: 'short-token' }, async () => {
      assert.equal((await call('drawings', { method: 'GET', query: { project: 'TE-002' }, auth: 'Bearer short-token' })).statusCode, 503);
    });
  });
});

// ── The acting user ───────────────────────────────────────────────────────────
await test('PIPELINE_USER_EMAIL a consultant -> 403, nothing written', async () => {
  await withEnv({ ...on, PIPELINE_USER_EMAIL: 'eng@atlanta.example' }, async () => {
    seed(baseState());
    const before = raw();
    const r = await list();
    assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'pipeline_user_external');
    const w = await register({ code: 'NEW-1' });
    assert.equal(w.statusCode, 403);
    assert.equal(raw(), before);
  });
});
await test('PIPELINE_USER_EMAIL unknown or unset -> 403', async () => {
  seed(baseState());
  await withEnv({ ...on, PIPELINE_USER_EMAIL: 'nobody@example.com' }, async () => {
    const r = await list(); assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'pipeline_user_unknown');
  });
  await withEnv({ ...on, PIPELINE_USER_EMAIL: null }, async () => {
    const r = await list(); assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'pipeline_user_not_set');
  });
});
await test('a Viewer may list but not register -> 403 role_cannot_upload', async () => {
  await withEnv({ ...on, PIPELINE_USER_EMAIL: 'viewer@tranzenergy.in' }, async () => {
    seed(baseState());
    assert.equal((await list()).statusCode, 200);
    const r = await register({ code: 'NEW-1' });
    assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'role_cannot_upload');
  });
});
await test('a project the user is not assigned to -> 403', async () => {
  await withEnv(on, async () => {
    seed(baseState());
    const r = await list('OTHER');
    assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'project_not_assigned');
  });
});

await withEnv(on, async () => {
  // ── List ──────────────────────────────────────────────────────────────────
  await test('list returns expected flags, versions, review and CRS state', async () => {
    seed(baseState());
    const r = await list('rpcl'); // partial project name, as dms.py uses
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.project.id, 'p1');
    assert.equal(r.body.actingAs, 'jacopolicheri@gmail.com');
    const by = Object.fromEntries(r.body.drawings.map(d => [d.code, d]));
    assert.equal(r.body.drawings.length, 3, 'only the project\'s drawings');
    const e = by['RPCL100MW-ARIPL-PSS-ELE-RPT-024'];
    assert.equal(e.expected, true); assert.equal(e.currentVersion, null); assert.equal(e.versionCount, 0); assert.equal(e.review, null);
    const s = by['RPCL100MW-ARIPL-PVP-ELE-DTS-021'];
    assert.equal(s.expected, false); assert.equal(s.currentVersion, 'R1'); assert.equal(s.versionCount, 2);
    assert.deepEqual(s.review, { stage: 'ir2', cycle: 2, version: 'R1', dueDate: '2026-09-30', dueSource: 'Atlanta email', proposedCategory: null, category: null });
    assert.deepEqual(s.crs, { present: true, rows: 2, imported: 2, pins: 0, fileName: 'crs.xlsx' });
    assert.equal(by['RPCL100MW-ARIPL-PVP-CIV-DWG-006A'].crs.present, false);
  });
  await test('unknown project -> 404', async () => {
    seed(baseState());
    assert.equal((await list('Nowhere')).statusCode, 404);
  });

  // ── Register ──────────────────────────────────────────────────────────────
  await test('register on an expected record fills R0 and starts the review, no duplicate', async () => {
    seed(baseState());
    const before = stored();
    const r = await register({ code: 'rpcl100mw-aripl-pss-ele-rpt-024 ' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.outcome, 'filled'); assert.equal(r.body.version, 'R0');
    const after = stored();
    assert.equal(after.drawings.length, before.drawings.length, 'no new record');
    const d = after.drawings.find(x => x.id === 'd1');
    assert.equal(d.expected, false);
    assert.equal(d.currentVersion, 'R0');
    assert.deepEqual(d.mdl, { x: 1 }, 'MDL fields kept');
    assert.equal(d.versions.length, 1); assert.equal(d.versions[0].author, 'Jacopo Licheri');
    assert.equal(d.review.stage, 'ir1'); assert.equal(d.review.cycle, 1);
    assert.equal(d.review.dueDate, addDays(today(), 10));
    assert.equal(d.review.dueSource, 'project default');
    const h = d.review.history.at(-1);
    assert.equal(h.action, 'registered'); assert.equal(h.by, 'u3'); assert.equal(h.via, 'pipeline');
    const act = (await activityOf('d1'))[0];
    assert.equal(act.by, 'u3'); assert.equal(act.via, 'pipeline');
    assert.equal(act.version, 'R0'); assert.equal(act.drawingId, 'd1');
    const log = (await logEntries())[0];
    assert.equal(log.authorId, 'u3'); assert.match(log.message, /via pipeline/);
    // the document does not grow: no activity on the record, the stored log unchanged
    assert.equal(d.activity, undefined);
    assert.deepEqual(after.activityLog, before.activityLog);
    assert.ok(d.pdfData.startsWith('/local-files/drawings/RPCL100MW-ARIPL-PSS-ELE-RPT-024/'), d.pdfData);
    assert.ok(fs.existsSync(path.join(dir, 'files', ...decodeURIComponent(d.pdfData.slice('/local-files/'.length)).split('/'))), 'file stored');
    othersSame(before, after, 'd1');
  });
  await test('register on an expected record with a given revision uses it', async () => {
    seed(baseState());
    const r = await register({ code: 'RPCL100MW-ARIPL-PSS-ELE-RPT-024', revision: 'r 2' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(drawingOf('RPCL100MW-ARIPL-PSS-ELE-RPT-024').currentVersion, 'R2');
  });
  await test('register the same revision twice -> 409 revision_exists, nothing written', async () => {
    seed(baseState());
    assert.equal((await register({ code: 'RPCL100MW-ARIPL-PSS-ELE-RPT-024' })).statusCode, 200);
    const before = raw();
    const files = fs.readdirSync(path.join(dir, 'files', 'drawings', 'RPCL100MW-ARIPL-PSS-ELE-RPT-024')).length;
    const r = await register({ code: 'RPCL100MW-ARIPL-PSS-ELE-RPT-024', revision: 'R00' });
    assert.equal(r.statusCode, 409); assert.equal(r.body.error, 'revision_exists');
    assert.equal(raw(), before);
    assert.equal(fs.readdirSync(path.join(dir, 'files', 'drawings', 'RPCL100MW-ARIPL-PSS-ELE-RPT-024')).length, files, 'no file stored');
  });
  await test('a received drawing without a revision -> 400 revision_required', async () => {
    seed(baseState());
    const r = await register({ code: 'RPCL100MW-ARIPL-PVP-CIV-DWG-006A' });
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'revision_required');
  });
  await test('an older revision than the current one -> 409 revision_older', async () => {
    seed(baseState());
    const r = await register({ code: 'RPCL100MW-ARIPL-PVP-CIV-DWG-006A', revision: 'R2' });
    assert.equal(r.statusCode, 409); assert.equal(r.body.error, 'revision_older');
  });
  await test('a new revision on a received drawing adds it and restarts the review', async () => {
    seed(baseState());
    const before = stored();
    const r = await register({ code: 'RPCL100MW-ARIPL-PVP-CIV-DWG-006A', revision: 'R04' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.outcome, 'revision');
    const d = drawingOf('RPCL100MW-ARIPL-PVP-CIV-DWG-006A');
    assert.equal(d.currentVersion, 'R04');
    assert.deepEqual(d.versions.map(v => v.version), ['R04', 'R3']);
    assert.equal(d.review.stage, 'ir1'); assert.equal(d.review.cycle, 2);
    assert.equal(d.review.cycles.length, 1); assert.equal(d.review.cycles[0].category, '3');
    assert.equal(d.review.history.at(-1).action, 'resubmitted');
    othersSame(before, stored(), 'd3');
  });
  await test('a new code creates the drawing with its review', async () => {
    seed(baseState());
    const before = stored();
    const r = await register({ code: 'RPCL100MW-ARIPL-PVP-ELE-DWG-099', title: 'Earthing layout' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.outcome, 'created');
    const after = stored();
    assert.equal(after.drawings.length, before.drawings.length + 1);
    const d = after.drawings[0];
    assert.equal(d.code, 'RPCL100MW-ARIPL-PVP-ELE-DWG-099'); assert.equal(d.title, 'Earthing layout');
    assert.equal(d.discipline, 'Electrical'); assert.equal(d.projectId, 'p1'); assert.equal(d.currentVersion, 'R0');
    assert.equal(d.review.stage, 'ir1'); assert.equal(d.review.dueSource, 'project default');
    othersSame(before, after, d.id);
  });
  await test('not a PDF, too large, or no file -> refused, nothing written', async () => {
    seed(baseState());
    const before = raw();
    let r = await register({ code: 'NEW-2', contentBase64: Buffer.from('hello').toString('base64') });
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'not_a_pdf');
    r = await register({ code: 'NEW-2', contentBase64: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(3 * 1024 * 1024 + 1)]).toString('base64') });
    assert.equal(r.statusCode, 413); assert.equal(r.body.error, 'too_large_use_upload_url');
    r = await register({ code: 'NEW-2', contentBase64: undefined });
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'file_required');
    r = await register({ code: 'NEW-2', fileName: 'x.docx' });
    assert.equal(r.statusCode, 400);
    r = await register({ code: 'NEW-2', key: 'drawings/OTHER/1_x.pdf', contentBase64: undefined });
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'key_mismatch');
    assert.equal(raw(), before);
  });
  await test('upload-url without R2 -> 501 (inline only in local mode)', async () => {
    seed(baseState());
    const r = await call('upload-url', { body: { project: 'TE-002', code: 'NEW-3', fileName: 'big.pdf', kind: 'pdf' } });
    assert.equal(r.statusCode, 501); assert.equal(r.body.error, 'upload_url_needs_r2');
  });

  // ── Attach CRS ────────────────────────────────────────────────────────────
  await test('attach-crs when a sheet exists -> 409 sheet_present with the row count, nothing written', async () => {
    seed(baseState());
    const before = raw();
    const r = await call('attach-crs', { body: { project: 'TE-002', code: 'RPCL100MW-ARIPL-PVP-ELE-DTS-021', fileName: 'crs.xlsx', contentBase64: xlsxB64() } });
    assert.equal(r.statusCode, 409); assert.equal(r.body.error, 'sheet_present'); assert.equal(r.body.rows, 2);
    assert.equal(raw(), before);
    assert.ok(!fs.existsSync(path.join(dir, 'files', 'crs', 'RPCL100MW-ARIPL-PVP-ELE-DTS-021')), 'no file stored');
  });
  await test('attach-crs on an expected record -> 409 no_revision', async () => {
    seed(baseState());
    const r = await call('attach-crs', { body: { project: 'TE-002', code: 'RPCL100MW-ARIPL-PSS-ELE-RPT-024', fileName: 'crs.xlsx', contentBase64: xlsxB64() } });
    assert.equal(r.statusCode, 409); assert.equal(r.body.error, 'no_revision');
  });
  await test(`attach-crs of an AEL-template sheet stores the rows readCrs reads${fs.existsSync(AEL) ? '' : ' (AEL sample not found: generated sheet)'}`, async () => {
    seed(baseState());
    const code = 'RPCL100MW-ARIPL-PSS-ELE-RPT-024';
    assert.equal((await register({ code })).statusCode, 200);
    const bytes = fs.existsSync(AEL) ? fs.readFileSync(AEL) : Buffer.from(xlsxB64(), 'base64');
    const want = await readCrs(new Uint8Array(bytes));
    const before = stored();
    const r = await call('attach-crs', { body: { project: 'TE-002', code, fileName: path.basename(AEL), contentBase64: bytes.toString('base64') } });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    const d = drawingOf(code);
    assert.ok(want.comments.length > 0, 'the sample has rows');
    assert.equal(r.body.rows, want.comments.length);
    assert.deepEqual(d.crsImported, JSON.parse(JSON.stringify(want.comments)));
    assert.deepEqual(d.crsLayout, JSON.parse(JSON.stringify(want.layout)));
    assert.deepEqual(d.crsMeta, JSON.parse(JSON.stringify(want.meta)));
    assert.equal(d.crsFileType, 'excel'); assert.equal(d.crsFileName, path.basename(AEL));
    assert.ok(d.crsData.startsWith('/local-files/crs/RPCL100MW-ARIPL-PSS-ELE-RPT-024/'));
    assert.equal(d.review.stage, 'ir1', 'stage unchanged');
    const act = (await activityOf(d.id))[0];
    assert.equal(act.what, 'crs'); assert.equal(act.by, 'u3');
    othersSame(before, stored(), 'd1');
    console.log(`      ${want.comments.length} rows, header row ${want.layout?.headerIdx}, from ${fs.existsSync(AEL) ? path.basename(AEL) : 'generated sheet'}`);
    // and never a second time
    const again = await call('attach-crs', { body: { project: 'TE-002', code, fileName: 'other.xlsx', contentBase64: xlsxB64() } });
    assert.equal(again.statusCode, 409); assert.equal(again.body.error, 'sheet_present'); assert.equal(again.body.rows, want.comments.length);
  });
  await test('attach-crs of a file that is not Excel -> 400', async () => {
    seed(baseState());
    const r = await call('attach-crs', { body: { project: 'TE-002', code: 'RPCL100MW-ARIPL-PVP-CIV-DWG-006A', fileName: 'crs.xlsx', contentBase64: PDF() } });
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'not_an_excel');
  });
});

// ── Comments: read a drawing's CRS rows, append ours after the local engineer's ──
const ENG1 = { id: 'u4', name: 'TE Engineer 1', email: 'eng1@tranzenergy.in', role: 'Engineer' };
const HIS = ['Earthing conductor size not matching the calculation.', 'Show the cable tray section at the crossing.'];
const hisRow = (id, text, page) => ({ id, local: true, comment: text, commentBy: ENG1.name, date: '2026-09-26', page, reply: '', status: 'Open', authorId: 'u4', stage: 'ir1', cycle: 1, vis: 'internal' });
function commentState({ stage = 'ir2' } = {}) {
  const s = baseState();
  s.users.push(structuredClone(ENG1));
  s.projects[0].assignedUsers.push('u4');
  s.projects[0].workflow.firstReviewers = ['u4'];
  // his two rows added in the CRS panel, review marked done (ir1 → ir2)
  s.drawings.push({ id: 'd5', code: 'RPCL100MW-ARIPL-PSS-ELE-DWG-030', title: 'Switchyard earthing layout', projectId: 'p1', discipline: 'Electrical',
    currentVersion: 'R0', pdfData: FILE('drawings/D30/1_r0.pdf'), crsData: null, versions: [{ version: 'R0', pdfData: FILE('drawings/D30/1_r0.pdf') }],
    pins: [], crsImported: [hisRow('crs-his-1', HIS[0], '2'), hisRow('crs-his-2', HIS[1], '')], crsRev: 3, crsSyncedRev: 3,
    review: { cycle: 1, version: 'R0', stage, startedAt: '2026-09-24', dueDate: '2026-10-04', history: [], cycles: [] } });
  // a pin by him, an Excel row, a panel row by Jacopo
  s.drawings.push({ id: 'd6', code: 'RPCL100MW-ARIPL-PSS-ELE-DWG-031', title: 'SLD', projectId: 'p1', discipline: 'Electrical',
    currentVersion: 'R1', pdfData: FILE('drawings/D31/1_r1.pdf'), crsData: FILE('crs/D31/1_crs.xlsx'), versions: [{ version: 'R1' }],
    pins: [{ id: 'pin-1', label: 1, page: 3, x: 0.1, y: 0.2, authorId: 'u4', vis: 'internal',
      comments: [{ id: 'c1', author: ENG1.name, authorId: 'u4', text: 'Breaker rating missing.', date: '2026-09-25 10:00', type: 'internal', vis: 'internal' },
        { id: 'c2', author: 'Jacopo Licheri', authorId: 'u3', text: 'Agreed.', date: '2026-09-25 11:00', type: 'internal', vis: 'internal' }] }],
    crsImported: [{ row: 5, sno: '1', comment: 'Uploaded sheet row', commentBy: 'AEL', status: 'Open' },
      { id: 'crs-j', local: true, comment: 'Panel row by Jacopo', commentBy: 'Jacopo Licheri', authorId: 'u3', date: '2026-09-26', status: 'Open', vis: 'internal' }],
    review: { cycle: 1, version: 'R1', stage: 'ir1', history: [], cycles: [] } });
  return s;
}
const comments = (code, project = 'TE-002') => call('comments', { method: 'GET', query: { project, code } });
const append = (code, rows, extra = {}) => call('append-rows', { body: { project: 'TE-002', code, rows, ...extra } });
const OURS = [{ text: 'Earthing grid spacing to be justified against IEEE 80 step voltage.', section: '4.2', topic: 'Earthing' }, { text: 'Conductor material to be stated.', page: 3 }];

await withEnv(on, async () => {
  await test('comments returns pins and CRS rows in buildCrsTable order, with authors and roles', async () => {
    seed(commentState());
    const r = await comments('rpcl100mw-aripl-pss-ele-dwg-031');
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.code, 'RPCL100MW-ARIPL-PSS-ELE-DWG-031'); assert.equal(r.body.drawingId, 'd6');
    assert.equal(r.body.currentVersion, 'R1'); assert.equal(r.body.stage, 'ir1'); assert.equal(r.body.cycle, 1);
    const want = buildCrsTable(stored().drawings.find(d => d.id === 'd6'));
    assert.deepEqual(r.body.rows.map(x => x.text), want.map(x => x.comment));
    assert.deepEqual(r.body.rows.map(x => x.order), [0, 1, 2]);
    const [pin, xl, loc] = r.body.rows;
    assert.deepEqual(pin, { id: 'pin-1', source: 'pin', pin: 1, page: 3, text: 'Breaker rating missing.', author: 'TE Engineer 1', authorId: 'u4', authorRole: 'Engineer',
      date: '2026-09-25', status: 'Open', reply: 'Agreed.', replyBy: 'Jacopo Licheri', vis: 'internal', local: false, order: 0 });
    assert.equal(xl.source, 'crs'); assert.equal(xl.local, false); assert.equal(xl.author, 'AEL'); assert.equal(xl.authorId, null); assert.equal(xl.authorRole, null); assert.equal(xl.vis, null);
    assert.equal(loc.id, 'crs-j'); assert.equal(loc.local, true); assert.equal(loc.authorId, 'u3'); assert.equal(loc.authorRole, 'Project Manager'); assert.equal(loc.vis, 'internal');
  });
  await test('comments on an unknown drawing -> 404, without a code -> 400', async () => {
    seed(commentState());
    const r = await comments('NOPE-1');
    assert.equal(r.statusCode, 404); assert.equal(r.body.error, 'drawing_not_found');
    assert.equal((await comments('')).statusCode, 400);
    assert.equal((await call('comments', { query: { project: 'TE-002', code: 'NOPE-1' } })).statusCode, 405, 'GET only');
  });
  await test('append after the local engineer\'s two rows: order [his, his, ours, ours], internal, nothing of his changed', async () => {
    seed(commentState());
    const before = stored();
    const r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', OURS);
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.added, 2); assert.equal(r.body.skipped, 0); assert.equal(r.body.rowIds.length, 2);
    const d = drawingOf('RPCL100MW-ARIPL-PSS-ELE-DWG-030');
    const was = before.drawings.find(x => x.id === 'd5');
    assert.deepEqual(d.crsImported.slice(0, 2), was.crsImported, 'his rows byte-identical and first');
    assert.deepEqual(d.crsImported.slice(2).map(c => c.id), r.body.rowIds);
    const ours = d.crsImported[2];
    assert.equal(ours.local, true); assert.equal(ours.comment, OURS[0].text); assert.equal(ours.commentBy, 'Jacopo Licheri'); assert.equal(ours.authorId, 'u3');
    assert.equal(ours.vis, 'internal'); assert.equal(ours.status, 'Open'); assert.equal(ours.stage, 'ir2'); assert.equal(ours.via, 'pipeline');
    assert.equal(ours.section, '4.2'); assert.equal(ours.topic, 'Earthing'); assert.equal(d.crsImported[3].page, '3');
    assert.equal(d.crsRev, 4, 'crsRev bumped so an internal tab rewrites the working Excel');
    assert.equal(d.review.stage, 'ir2', 'stage unchanged');
    const c = await comments('RPCL100MW-ARIPL-PSS-ELE-DWG-030');
    assert.deepEqual(c.body.rows.map(x => x.author), ['TE Engineer 1', 'TE Engineer 1', 'Jacopo Licheri', 'Jacopo Licheri']);
    assert.deepEqual(c.body.rows.map(x => x.authorRole), ['Engineer', 'Engineer', 'Project Manager', 'Project Manager']);
    const acts = await activityOf('d5');
    assert.equal(acts.length, 2); assert.ok(acts.every(a => a.type === 'comment' && a.via === 'pipeline' && a.vis === 'internal' && a.by === 'u3'));
    assert.match((await logEntries())[0].message, /added 2 comments to the CRS of <strong>RPCL100MW-ARIPL-PSS-ELE-DWG-030<\/strong> via pipeline/);
    assert.deepEqual(stored().activityLog, before.activityLog, 'log not in the document');
    othersSame(before, stored(), 'd5');
  });
  await test('a row with the text of an existing row, or of an earlier row in the call, is skipped', async () => {
    seed(commentState());
    const r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', [
      { text: '  earthing conductor SIZE not matching the calculation ' },   // his row 1, other case and punctuation
      { text: 'New point: fence earthing.' },
      { text: 'new point - fence earthing' },                                 // same as the row before
    ]);
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.added, 1); assert.equal(r.body.skipped, 2);
    assert.equal(drawingOf('RPCL100MW-ARIPL-PSS-ELE-DWG-030').crsImported.length, 3);
    // all duplicates: nothing written at all
    const before = raw();
    const again = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', [{ text: 'NEW POINT: fence earthing!' }]);
    assert.equal(again.statusCode, 200); assert.equal(again.body.added, 0); assert.equal(again.body.skipped, 1);
    assert.equal(raw(), before);
    // a pin's text counts too
    seed(commentState());
    const p = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-031', [{ text: 'Breaker rating missing' }]);
    assert.equal(p.body.added, 0); assert.equal(p.body.skipped, 1);
  });
  await test('the same clientKey twice -> one write, the first result returned again', async () => {
    seed(commentState());
    const first = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', OURS, { clientKey: 'run-2026-09-27-030' });
    assert.equal(first.statusCode, 200, JSON.stringify(first.body));
    const after = raw();
    const acts = (await activityOf('d5')).length;
    const d = drawingOf('RPCL100MW-ARIPL-PSS-ELE-DWG-030');
    assert.deepEqual(d.pipelineAppends.map(a => [a.clientKey, a.rowIds]), [['run-2026-09-27-030', first.body.rowIds]]);
    const second = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', [...OURS, { text: 'A third one.' }], { clientKey: 'run-2026-09-27-030' });
    assert.equal(second.statusCode, 200);
    assert.deepEqual([second.body.added, second.body.skipped, second.body.rowIds], [first.body.added, first.body.skipped, first.body.rowIds]);
    assert.equal(second.body.replayed, true);
    assert.equal(raw(), after, 'nothing written the second time');
    assert.equal((await activityOf('d5')).length, acts, 'no second activity');
  });
  await test('stage consultant (issued) -> 409 stage_closed, nothing written; resubmit and closed too', async () => {
    for (const stage of ['consultant', 'client', 'closed', 'resubmit']) {
      seed(commentState({ stage }));
      const before = raw();
      const r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', OURS);
      assert.equal(r.statusCode, 409, stage); assert.equal(r.body.error, 'stage_closed'); assert.equal(r.body.stage, stage);
      assert.equal(raw(), before);
    }
  });
  await test('an expected record -> 409 no_revision; unknown drawing -> 404; bad rows -> 400', async () => {
    seed(commentState());
    const before = raw();
    let r = await append('RPCL100MW-ARIPL-PSS-ELE-RPT-024', OURS);
    assert.equal(r.statusCode, 409); assert.equal(r.body.error, 'no_revision');
    r = await append('NOPE-1', OURS);
    assert.equal(r.statusCode, 404); assert.equal(r.body.error, 'drawing_not_found');
    r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', []);
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'rows_required');
    r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', [{ text: 'ok' }, { text: '   ' }]);
    assert.equal(r.statusCode, 400); assert.equal(r.body.error, 'row_text_required'); assert.equal(r.body.index, 1);
    assert.equal(raw(), before);
  });
  await test('a Viewer may read comments but not append -> 403', async () => {
    await withEnv({ PIPELINE_USER_EMAIL: 'viewer@tranzenergy.in' }, async () => {
      seed(commentState());
      assert.equal((await comments('RPCL100MW-ARIPL-PSS-ELE-DWG-030')).statusCode, 200);
      const r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', OURS);
      assert.equal(r.statusCode, 403); assert.equal(r.body.error, 'role_cannot_upload');
    });
  });
  await test('the consultant does not see the appended rows (or the retry keys) before issue', async () => {
    seed(commentState());
    const r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', OURS, { clientKey: 'k1' });
    assert.equal(r.statusCode, 200);
    const s = stored();
    const view = externalView(s, s.users.find(u => u.id === 'u7'));
    const d = view.drawings.find(x => x.id === 'd5');
    const ids = new Set((d.crsImported || []).map(c => c.id));
    for (const id of r.body.rowIds) assert.ok(!ids.has(id), `row ${id} visible to the consultant`);
    assert.equal(d.pipelineAppends, undefined);
    assert.ok(!JSON.stringify(view).includes(OURS[0].text));
  });
  await test(`issued in the AEL template: his rows first, ours after (H6..)${fs.existsSync(AEL_TEMPLATE) ? '' : ' (template not found: skipped)'}`, async () => {
    if (!fs.existsSync(AEL_TEMPLATE)) return;
    seed(commentState({ stage: 'ir2' }));
    const r = await append('RPCL100MW-ARIPL-PSS-ELE-DWG-030', OURS);
    assert.equal(r.statusCode, 200);
    const d = drawingOf('RPCL100MW-ARIPL-PSS-ELE-DWG-030');
    // what issueToConsultant (src/AppContext.jsx) builds the sheet from: comments published
    const pub = (o) => { if (!o || o.vis !== 'internal') return o; const { vis: _v, ...rest } = o; return rest; };
    const published = { ...d, pins: [], crsImported: d.crsImported.map(pub), crsRowMap: {}, review: { ...d.review, proposedCategory: '3' } };
    const tpl = fs.readFileSync(AEL_TEMPLATE);
    const project = { name: 'RPCL Madarganj 100 MW', workflow: { issueNotation: 'AEL', categoryFormat: 'Category-{key}',
      crsTemplate: { url: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${tpl.toString('base64')}` } } };
    const out = await buildIssuedCrs(published, project);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength));
    const ws = book.worksheets[0];
    const col = (c, from, n) => Array.from({ length: n }, (_, i) => ws.getCell(`${c}${from + i}`).value);
    assert.deepEqual(col('H', 6, 5), [HIS[0], HIS[1], OURS[0].text, OURS[1].text, null]);
    assert.deepEqual(col('A', 6, 4), [1, 2, 3, 4]);
    assert.deepEqual(col('B', 6, 4), ['AEL', 'AEL', 'AEL', 'AEL']);
    console.log(`      H6..H9: ${col('H', 6, 4).map(v => JSON.stringify(String(v).slice(0, 24))).join(', ')}`);
  });
});

// ── Concurrency ───────────────────────────────────────────────────────────────
await test('writeState refuses a stale etag (local mode)', async () => {
  seed(baseState());
  const cur = await readState();
  fs.writeFileSync(stateFile, JSON.stringify({ ...baseState(), disciplines: ['Changed'] }));
  await assert.rejects(writeState('{}', cur.etag), (e) => e instanceof PreconditionFailed);
  assert.equal(stored().disciplines[0], 'Changed');
});
await test('a concurrent write is retried on the fresh document and keeps both changes', async () => {
  seed(baseState());
  let raced = false;
  const done = await commitChange({
    read: () => readState(),
    write: async (text, etag) => {
      if (!raced) {
        raced = true; // someone else saves between our read and our write
        const s = stored(); s.activityLog.unshift({ id: 'l-other', message: 'other', time: 'x' }); s.drawings.find(d => d.id === 'd9').title = 'Edited elsewhere';
        fs.writeFileSync(stateFile, JSON.stringify(s));
      }
      return writeState(text, etag);
    },
    apply: (before) => ({ state: { ...before, drawings: before.drawings.map(d => (d.id === 'd3' ? { ...d, title: 'Ours' } : d)) } }),
    check: () => null,
  });
  assert.equal(done.attempts, 2);
  const s = stored();
  assert.equal(s.drawings.find(d => d.id === 'd3').title, 'Ours');
  assert.equal(s.drawings.find(d => d.id === 'd9').title, 'Edited elsewhere');
  assert.equal(s.activityLog[0].id, 'l-other');
});
await test('a write that keeps losing gives up after 3 retries -> 503, nothing written', async () => {
  seed(baseState());
  const before = raw();
  let writes = 0;
  await assert.rejects(commitChange({
    read: () => readState(),
    write: async () => { writes++; throw new PreconditionFailed(); },
    apply: (b) => ({ state: { ...b, disciplines: [] } }),
    check: () => null,
  }), (e) => e instanceof PipelineError && e.status === 503);
  assert.equal(writes, 4);
  assert.equal(raw(), before);
});
await test('a change checkSave refuses is not written', async () => {
  seed(baseState());
  const before = raw();
  await assert.rejects(commitChange({
    read: () => readState(), write: () => writeState('{}', 'x'),
    apply: (b) => ({ state: b }), check: () => ({ status: 403, error: 'admin_only' }),
  }), (e) => e.status === 403);
  assert.equal(raw(), before);
});

function xlsxB64() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Document No.', 'RPCL100MW-ARIPL-PSS-ELE-RPT-024'], [],
    ['S.No', 'Comment', 'Reply', 'Status'],
    ['1', 'Relay settings to be shown per feeder.', '', 'Open'],
    ['2', 'CT ratio does not match the SLD.', '', 'Open'],
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'CRS');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })).toString('base64');
}

const failed = results.filter(r => !r[0]).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
