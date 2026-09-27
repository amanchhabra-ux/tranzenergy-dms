// Tests for the pipeline API (api/pipeline/[action].js, api/_lib/pipeline.js). Plain node:
//   node tests/pipeline.test.mjs ["<a CRS Excel in the AEL template>"]
// Runs the real handler in local mode (LOCAL_DATA_DIR = a temp folder, never .local-data).
// The AEL sample defaults to a TE-002 sheet; when it is not on this machine a small generated
// sheet is used instead and the run says so.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-pipeline-'));
process.env.LOCAL_DATA_DIR = dir;
process.env.LOCAL_SESSION_SECRET = 'test-secret';
for (const k of ['CLERK_SECRET_KEY', 'ADMIN_EMAILS', 'RESEND_API_KEY', 'PIPELINE_TOKEN', 'PIPELINE_USER_EMAIL', 'R2_ACCOUNT_ID']) delete process.env[k];
console.log = ((log) => (...a) => { if (!String(a[0]).startsWith('[notify]')) log(...a); })(console.log);

const { forgetMembers, writeState, readState } = await import('../api/_lib/state.js');
const { commitChange, PipelineError } = await import('../api/_lib/pipeline.js');
const { PreconditionFailed } = await import('../api/_lib/r2.js');
const { readCrs } = await import('../src/utils/crs.js');
const { addDays, today } = await import('../src/utils/workflow.js');
const pipeline = (await import('../api/pipeline/[action].js')).default;

const AEL_DEFAULT = 'C:/Users/Jacopo Licheri/Documents/Lavoro/Tranzenergy IN/Offers/TE-002 OE RPCL Madarganj/Submissions/2026-09-24/RPCL100MW-ARIPL-PSS-ELE-RPT-024/CRS-RPCL100MW-ARIPL-PSS-ELE-RPT-024 rev 00 AEL 26.09.2026.xlsx';
const AEL = process.argv[2] || AEL_DEFAULT;

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
  for (const a of ['drawings', 'register', 'attach-crs', 'upload-url']) {
    const r = await call(a, { method: a === 'drawings' ? 'GET' : 'POST', body: {} });
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
    assert.equal(d.activity.at(-1).by, 'u3'); assert.equal(d.activity.at(-1).via, 'pipeline');
    assert.equal(after.activityLog[0].authorId, 'u3'); assert.match(after.activityLog[0].message, /via pipeline/);
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
    assert.equal(d.activity.at(-1).what, 'crs'); assert.equal(d.activity.at(-1).by, 'u3');
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
