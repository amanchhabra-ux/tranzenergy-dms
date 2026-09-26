// Security tests for the workspace API. Plain node, no framework:
//   node tests/security.test.mjs
// Runs the real handlers in local mode (LOCAL_DATA_DIR = a temp folder) with real
// signed session cookies, so requireUser and the member list work as in production.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-security-'));
process.env.LOCAL_DATA_DIR = dir;
process.env.LOCAL_SESSION_SECRET = 'test-secret';
delete process.env.CLERK_SECRET_KEY;
delete process.env.ADMIN_EMAILS;
delete process.env.RESEND_API_KEY;
console.log = ((log) => (...a) => { if (!String(a[0]).startsWith('[notify]')) log(...a); })(console.log);

const { makeSessionCookie } = await import('../api/_lib/session.js');
const { forgetMembers } = await import('../api/_lib/state.js');
const saveState = (await import('../api/save-state.js')).default;
const uploadUrl = (await import('../api/r2-upload-url.js')).default;

const USERS = [
  { id: 'u1', name: 'Aman Chhabra', email: 'aman@tranzenergy.in', role: 'Admin', avatar: 'AC', color: '#3f7d3a' },
  { id: 'u2', name: 'Project Manager', email: 'pm@tranzenergy.in', role: 'Project Manager', avatar: 'PM', color: '#2a4439' },
  { id: 'u5', name: 'Viewer', email: 'viewer@tranzenergy.in', role: 'Viewer', avatar: 'VW', color: '#a1a1aa' },
  { id: 'u7', name: 'Atlanta Engineer', email: 'eng@atlanta.example', role: 'Consultant', avatar: 'AE', color: '#0369a1' },
];
const PDF = (k) => `/api/file?key=${encodeURIComponent(k)}`;
const baseState = () => ({
  users: structuredClone(USERS),
  projects: [
    { id: 'p1', code: 'TE-002', name: 'RPCL', assignedUsers: ['u1', 'u2', 'u5', 'u7'],
      workflow: { enabled: true, turnaroundDays: 10, consultantUsers: ['u7'], firstReviewers: ['u2'], secondReviewers: [], approvers: [], issueNotify: [] } },
    { id: 'p2', code: 'OTHER', name: 'Other job', assignedUsers: ['u1', 'u2'] },
  ],
  drawings: [
    {
      id: 'd1', code: 'E-001', title: 'SLD', projectId: 'p1', currentVersion: 'R0', pdfData: PDF('drawings/E-001/1_sld.pdf'),
      versions: [{ version: 'R0', pdfData: PDF('drawings/E-001/1_sld.pdf') }],
      pins: [{ id: 'pin1', x: 1, y: 1, label: 1, authorId: 'u5', comments: [{ id: 'c1', author: 'Viewer', authorId: 'u5', text: 'first' }] }],
      crsImported: [],
      review: { cycle: 1, version: 'R0', stage: 'resubmit', category: '3', startedAt: '2026-09-01', dueDate: '2026-09-11', issued: null, cycles: [], history: [{ id: 'h1', action: 'registered' }] },
    },
    { id: 'd9', code: 'X-009', title: 'Secret', projectId: 'p2', currentVersion: 'R0', pdfData: PDF('drawings/X-009/1_secret.pdf'), crsData: PDF('crs/X-009/1_crs.xlsx'), versions: [{ version: 'R0' }], pins: [] },
  ],
  proposals: [{ id: 'pr1', title: 'Offer', fileData: PDF('proposals/offer.pdf') }],
  activityLog: [
    { id: 'l1', message: 'real 1', author: 'Aman Chhabra', authorId: 'u1', time: '2026-09-20T10:00:00.000Z' },
    { id: 'l2', message: 'real 2', author: 'Project Manager', authorId: 'u2', time: '2026-09-21T10:00:00.000Z' },
  ],
  disciplines: ['Electrical', 'Other'],
});

const stateFile = path.join(dir, 'db_state.json');
function seed(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state));
  fs.writeFileSync(path.join(dir, 'auth_credentials.json'), JSON.stringify({
    users: Object.fromEntries(state.users.map(u => [u.email, { salt: 'x', hash: 'y', pwv: 0 }])),
  }));
  forgetMembers();
}
const stored = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const EMAIL = Object.fromEntries(USERS.map(u => [u.id, u.email]));

function mockRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(c, h) { this.statusCode = c; Object.assign(this.headers, h || {}); return this; },
    end() { return this; },
  };
}
const request = (email, body) => ({
  method: 'POST', headers: { cookie: makeSessionCookie(email, { secure: false }).split(';')[0], host: 'localhost' }, body,
});
async function call(handler, email, body) {
  const res = mockRes();
  await handler(request(email, body), res);
  return res;
}
const post = (email, body) => call(saveState, email, body);

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); console.log('ok   ', name); }
  catch (e) { results.push([false, name]); console.log('FAIL ', name, '\n     ', e.message); }
}

// ── Finding 1: who may change users, org, workflow, project access ─────────────
await test('Viewer changing own role to Admin -> 403', async () => {
  seed(baseState());
  const s = baseState();
  s.users.find(u => u.id === 'u5').role = 'Admin';
  const r = await post(EMAIL.u5, { state: s, etag: null });
  assert.equal(r.statusCode, 403);
  assert.equal(stored().users.find(u => u.id === 'u5').role, 'Viewer');
});

await test('Viewer editing a drawing comment -> 200', async () => {
  seed(baseState());
  const s = baseState();
  s.drawings[0].pins[0].comments[0].text = 'edited';
  const r = await post(EMAIL.u5, { state: s, etag: null });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(stored().drawings[0].pins[0].comments[0].text, 'edited');
});

await test('non-admin adding a user -> 403', async () => {
  seed(baseState());
  const s = baseState();
  s.users.push({ id: 'u9', name: 'Mallory', email: 'm@example.com', role: 'Admin' });
  const r = await post(EMAIL.u2, { state: s, etag: null });
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error, 'admin_only');
  assert.equal(stored().users.length, USERS.length);
});

await test('non-admin changing another user\'s field -> 403', async () => {
  seed(baseState());
  const s = baseState();
  s.users.find(u => u.id === 'u1').email = 'attacker@example.com';
  assert.equal((await post(EMAIL.u2, { state: s, etag: null })).statusCode, 403);
});

await test('non-admin adding org settings -> 403', async () => {
  seed(baseState());
  assert.equal((await post(EMAIL.u2, { state: { ...baseState(), org: { name: 'Other' } }, etag: null })).statusCode, 403);
});

await test('Project Manager changing a project workflow -> 403', async () => {
  seed(baseState());
  const s = baseState();
  s.projects[0].workflow.consultantUsers = [];
  assert.equal((await post(EMAIL.u2, { state: s, etag: null })).statusCode, 403);
});

await test('Project Manager assigning a consultant to another project -> 403', async () => {
  seed(baseState());
  const s = baseState();
  s.projects[1].assignedUsers.push('u7');
  assert.equal((await post(EMAIL.u2, { state: s, etag: null })).statusCode, 403);
});

await test('Project Manager creating a project for internal users -> 200; with a consultant -> 403', async () => {
  seed(baseState());
  const s = baseState();
  s.projects.push({ id: 'p3', code: 'NEW', assignedUsers: ['u1', 'u2'] });
  assert.equal((await post(EMAIL.u2, { state: s, etag: null })).statusCode, 200);
  seed(baseState());
  const t = baseState();
  t.projects.push({ id: 'p3', code: 'NEW', assignedUsers: ['u1', 'u2', 'u7'] });
  assert.equal((await post(EMAIL.u2, { state: t, etag: null })).statusCode, 403);
});

await test('admin changing another user\'s role -> 200', async () => {
  seed(baseState());
  const s = baseState();
  s.users.find(u => u.id === 'u5').role = 'Engineer';
  const r = await post(EMAIL.u1, { state: s, etag: null });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(stored().users.find(u => u.id === 'u5').role, 'Engineer');
});

await test('admin changing own role -> 403', async () => {
  seed(baseState());
  const s = baseState();
  s.users.find(u => u.id === 'u1').role = 'Viewer';
  assert.equal((await post(EMAIL.u1, { state: s, etag: null })).statusCode, 403);
  assert.equal(stored().users.find(u => u.id === 'u1').role, 'Admin');
});

await test('user list reordered but unchanged -> 200 for a non-admin', async () => {
  seed(baseState());
  const s = baseState();
  s.users.reverse();
  assert.equal((await post(EMAIL.u5, { state: s, etag: null })).statusCode, 200);
});

await test('first run: bootstrap owner creates the workspace -> 200', async () => {
  fs.rmSync(stateFile, { force: true });
  fs.writeFileSync(path.join(dir, 'auth_credentials.json'), JSON.stringify({ users: { [EMAIL.u1]: { salt: 'x', hash: 'y', pwv: 0 } } }));
  forgetMembers();
  const r = await post(EMAIL.u1, { state: baseState(), etag: null });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.ok(fs.existsSync(stateFile));
});


// ── Uploads never replace an existing file; consultants upload drawings only ───
await test('upload URL: fresh key for every upload, never the requested (existing) key', async () => {
  seed(baseState());
  Object.assign(process.env, { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket' });
  try {
    const want = 'crs/E-001/1727000000000_E-001_CRS_issued.xlsx';
    const a = await call(uploadUrl, EMAIL.u2, { pathname: want });
    const b = await call(uploadUrl, EMAIL.u2, { pathname: want });
    assert.equal(a.statusCode, 200, JSON.stringify(a.body));
    assert.notEqual(a.body.key, want);
    assert.notEqual(a.body.key, b.body.key);
    assert.match(a.body.key, /^crs\/E-001\/\d{19}_E-001_CRS_issued\.xlsx$/);
    assert.ok(a.body.uploadUrl.includes(encodeURIComponent(a.body.key.split('/').pop())));
    const c = await call(uploadUrl, EMAIL.u7, { pathname: 'crs/E-001/1727000000000_E-001_CRS_issued.xlsx' });
    assert.equal(c.statusCode, 403);
    const d = await call(uploadUrl, EMAIL.u7, { pathname: 'drawings/E-001/sld.pdf' });
    assert.equal(d.statusCode, 200);
    assert.match(d.body.key, /^drawings\/E-001\/\d{19}_sld\.pdf$/);
  } finally {
    for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[k];
  }
});

const failed = results.filter(r => !r[0]).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
