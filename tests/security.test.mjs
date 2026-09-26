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
const { externalView } = await import('../api/_lib/view.js');
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
// what a consultant's browser holds: their view of the stored workspace
const viewOf = (id) => structuredClone(externalView(stored(), USERS.find(u => u.id === id)));

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

// ── Finding 2: a new revision from a consultant restarts the review on server values ──
const addDaysIso = (n) => { const d = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const newRevision = (v, file) => {
  const d = v.drawings.find(x => x.id === 'd1');
  d.versions = [{ version: 'R1', date: '2026-09-26 10:00', author: 'Atlanta Engineer', changeSummary: 'R1', pdfData: file }, ...d.versions];
  d.currentVersion = 'R1';
  d.pdfData = file;
  return d;
};

await test('consultant new-cycle save with stage closed / category 1 -> stored review is ir1 with server values', async () => {
  seed(baseState());
  const v = viewOf('u7');
  const d = newRevision(v, PDF('drawings/E-001/1727000000000123456_sld_r1.pdf'));
  d.review = { ...d.review, cycle: 2, stage: 'closed', category: '1', dueDate: '2099-01-01', closedAt: '2026-09-26',
    note: { text: 'R1 addresses all comments', by: 'Aman Chhabra' },
    history: [...d.review.history, { id: 'forged', action: 'category', by: 'u1', byName: 'Aman Chhabra', to: 'closed', category: '1' }] };
  const r = await post(EMAIL.u7, { state: v, etag: null });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const rv = stored().drawings.find(x => x.id === 'd1').review;
  assert.equal(rv.stage, 'ir1');
  assert.equal(rv.cycle, 2);
  assert.equal(rv.category, null);
  assert.equal(rv.version, 'R1');
  assert.equal(rv.dueDate, addDaysIso(10));
  assert.equal(rv.cycles.length, 1);
  assert.equal(rv.cycles[0].stage, 'resubmit');
  assert.ok(!rv.history.some(h => h.id === 'forged'), 'forged history entry kept');
  const last = rv.history[rv.history.length - 1];
  assert.equal(last.action, 'resubmitted');
  assert.equal(last.by, 'u7');
  assert.equal(rv.note.text, 'R1 addresses all comments');
  assert.equal(rv.note.by, 'Atlanta Engineer');
});

await test('consultant forwarding to the client: history entry written by the server', async () => {
  const s = baseState();
  s.drawings[0].review.stage = 'consultant';
  seed(s);
  const v = viewOf('u7');
  const d = v.drawings.find(x => x.id === 'd1');
  d.review = { ...d.review, stage: 'client', category: '1',
    history: [...d.review.history, { id: 'forged', action: 'category', by: 'u1', byName: 'Aman Chhabra', note: 'sent' }] };
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const rv = stored().drawings.find(x => x.id === 'd1').review;
  assert.equal(rv.stage, 'client');
  assert.equal(rv.category, '3');
  const last = rv.history[rv.history.length - 1];
  assert.deepEqual([last.action, last.by, last.from, last.to, last.note], ['advanced', 'u7', 'consultant', 'client', 'sent']);
  assert.ok(!rv.history.some(h => h.id === 'forged'));
});

await test('consultant linking another record\'s file -> link dropped, file not in their view', async () => {
  seed(baseState());
  const v = viewOf('u7');
  newRevision(v, PDF('crs/X-009/1_crs.xlsx'));
  v.drawings.push({ id: 'dNew', code: 'E-002', title: 'Layout', projectId: 'p1', currentVersion: 'R0', pdfData: PDF('proposals/offer.pdf'),
    crsData: PDF('drawings/X-009/1_secret.pdf'), versions: [{ version: 'R0', pdfData: PDF('drawings/X-009/1_secret.pdf') }], pins: [] });
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const st = stored();
  const d1 = st.drawings.find(x => x.id === 'd1');
  assert.equal(d1.versions[0].version, 'R1');
  assert.equal(d1.versions[0].pdfData, null);
  assert.equal(d1.pdfData, PDF('drawings/E-001/1_sld.pdf'));
  const dn = st.drawings.find(x => x.id === 'dNew');
  assert.equal(dn.pdfData, null);
  assert.equal(dn.crsData, null);
  assert.equal(dn.versions[0].pdfData, null);
  const { filesInView } = await import('../api/_lib/view.js');
  const files = filesInView(externalView(st, USERS.find(u => u.id === 'u7')));
  for (const f of [PDF('crs/X-009/1_crs.xlsx'), PDF('proposals/offer.pdf'), PDF('drawings/X-009/1_secret.pdf')]) assert.ok(!files.has(f), f);
});

// ── Finding 3: a drawing a consultant registers is built field by field ────────
const recent = (iso) => Math.abs(Date.parse(iso) - Date.now()) < 60_000;

await test('consultant new drawing with an internal comment, forged author and a review -> sanitised', async () => {
  seed(baseState());
  const v = viewOf('u7');
  v.drawings.push({
    id: 'dNew', code: 'e-002', title: 'Layout', projectId: 'p1', currentVersion: 'R0', status: 'AFC', expectedBy: 'x',
    pdfData: PDF('drawings/E-002/1727000000000123456_layout.pdf'),
    versions: [{ version: 'R0', pdfData: PDF('drawings/E-002/1727000000000123456_layout.pdf'), author: 'Aman Chhabra', extra: 1 }],
    pins: [{ id: 'pX', x: 1, y: 1, label: 1, vis: 'internal', authorId: 'u1',
      comments: [{ id: 'cX', author: 'Aman Chhabra', authorId: 'u1', text: 'Approved, no comments', vis: 'internal' }] }],
    crsImported: [{ id: 'crsX', local: true, comment: 'fine', commentBy: 'Aman Chhabra', authorId: 'u1', vis: 'internal' }],
    review: { cycle: 7, stage: 'closed', category: '1', history: [{ id: 'forged', action: 'category', by: 'u1' }], note: { text: 'First issue' } },
  });
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const d = stored().drawings.find(x => x.id === 'dNew');
  assert.equal(d.code, 'E-002');
  assert.equal(d.status, undefined);
  assert.equal(d.expectedBy, undefined);
  assert.equal(d.versions[0].author, 'Atlanta Engineer');
  assert.equal(d.versions[0].extra, undefined);
  const pin = d.pins[0], c = pin.comments[0], item = d.crsImported[0];
  for (const x of [pin, c, item]) { assert.equal(x.vis, undefined); assert.equal(x.authorId, 'u7'); }
  assert.equal(c.author, 'Atlanta Engineer');
  assert.equal(item.commentBy, 'Atlanta Engineer');
  assert.deepEqual([d.review.stage, d.review.cycle, d.review.category], ['ir1', 1, null]);
  assert.equal(d.review.history.length, 1);
  assert.equal(d.review.history[0].by, 'u7');
  assert.equal(d.review.note.text, 'First issue');
});

// ── Finding 4: server time on log and activity entries; the cap is 5000 ─────────
await test('250 future-dated log entries from a consultant -> real entries kept, times server-stamped', async () => {
  seed(baseState());
  const v = viewOf('u7');
  for (let i = 0; i < 250; i++) v.activityLog.push({ id: `spam${i}`, message: 'x', author: 'Atlanta Engineer', authorId: 'u7', time: '2099-01-01T00:00:00.000Z' });
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const log = stored().activityLog;
  assert.ok(log.some(l => l.id === 'l1') && log.some(l => l.id === 'l2'), 'real entries evicted');
  const spam = log.filter(l => l.id.startsWith('spam'));
  assert.equal(spam.length, 100);
  assert.ok(spam.every(l => recent(l.time)), 'client time kept');
});

await test('internal save: new log entry gets server time, stored entries keep theirs', async () => {
  seed(baseState());
  const s = baseState();
  s.activityLog[0].time = '2099-01-01T00:00:00.000Z';
  s.activityLog.unshift({ id: 'l3', message: 'new', author: 'Viewer', authorId: 'u5', time: '2099-01-01T00:00:00.000Z' });
  assert.equal((await post(EMAIL.u5, { state: s, etag: null })).statusCode, 200);
  const log = stored().activityLog;
  assert.ok(recent(log.find(l => l.id === 'l3').time));
  assert.equal(log.find(l => l.id === 'l1').time, '2026-09-20T10:00:00.000Z');
});

await test('drawing activity: consultant entries server-stamped, future dates cannot evict', async () => {
  const s = baseState();
  s.drawings[0].activity = [{ id: 'a1', type: 'upload', at: '2026-09-20T10:00:00.000Z', by: 'u2', byName: 'Project Manager' }];
  seed(s);
  const v = viewOf('u7');
  const d = v.drawings.find(x => x.id === 'd1');
  for (let i = 0; i < 250; i++) d.activity.push({ id: `act${i}`, type: 'download', at: '2099-01-01T00:00:00.000Z', by: 'u7', byName: 'Aman Chhabra' });
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const act = stored().drawings.find(x => x.id === 'd1').activity;
  assert.ok(act.some(e => e.id === 'a1'));
  const mine = act.filter(e => e.id.startsWith('act'));
  assert.equal(mine.length, 100);
  assert.ok(mine.every(e => recent(e.at) && e.byName === 'Atlanta Engineer'));
});

await test('internal save: new drawing activity entry gets server time', async () => {
  seed(baseState());
  const s = baseState();
  s.drawings[0].activity = [{ id: 'a2', type: 'download', at: '2099-01-01T00:00:00.000Z', by: 'u5', byName: 'Viewer' }];
  assert.equal((await post(EMAIL.u5, { state: s, etag: null })).statusCode, 200);
  assert.ok(recent(stored().drawings[0].activity[0].at));
});

// ── Finding 6: a consultant's comment is deleted only on an explicit marker ─────
const withOwnComment = () => {
  const s = baseState();
  s.drawings[0].pins.push({ id: 'pin2', x: 2, y: 2, label: 2, authorId: 'u7',
    comments: [{ id: 'c7', author: 'Atlanta Engineer', authorId: 'u7', text: 'ours' }, { id: 'c8', author: 'Project Manager', authorId: 'u2', text: 'TE reply' }] });
  return s;
};

await test('consultant second tab missing own comment -> comment kept', async () => {
  seed(withOwnComment());
  const v = viewOf('u7');
  const pin = v.drawings[0].pins.find(p => p.id === 'pin2');
  pin.comments = pin.comments.filter(c => c.id !== 'c7');
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  assert.ok(stored().drawings[0].pins.find(p => p.id === 'pin2').comments.some(c => c.id === 'c7'));
});

await test('explicit delete marker -> own comment removed, someone else\'s kept', async () => {
  seed(withOwnComment());
  const v = viewOf('u7');
  const pin = v.drawings[0].pins.find(p => p.id === 'pin2');
  pin.comments = [];
  v.drawings[0].deletedIds = ['c7', 'c8'];
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const d = stored().drawings[0];
  assert.deepEqual(d.pins.find(p => p.id === 'pin2').comments.map(c => c.id), ['c8']);
  assert.equal(d.deletedIds, undefined);
});

await test('consultant editing TE\'s reply inside their own pin -> reply unchanged', async () => {
  seed(withOwnComment());
  const v = viewOf('u7');
  const pin = v.drawings[0].pins.find(p => p.id === 'pin2');
  pin.comments.find(c => c.id === 'c8').text = 'Approved by TE';
  pin.label = 9;
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const sp = stored().drawings[0].pins.find(p => p.id === 'pin2');
  assert.equal(sp.comments.find(c => c.id === 'c8').text, 'TE reply');
  assert.equal(sp.label, 9);
});

// ── Finding 7: log entries attributed by user id ─────────────────────────────
await test('log entries matched by authorId, by name only for old entries', async () => {
  const s = baseState();
  s.activityLog.push(
    { id: 'm1', message: 'mine, renamed', author: 'Old Name', authorId: 'u7', time: '2026-09-22T10:00:00.000Z' },
    { id: 'm2', message: 'same name, other user', author: 'Atlanta Engineer', authorId: 'u2', time: '2026-09-22T11:00:00.000Z' },
    { id: 'm3', message: 'old entry', author: 'Atlanta Engineer', time: '2026-09-22T12:00:00.000Z' },
  );
  seed(s);
  const v = viewOf('u7');
  assert.deepEqual(v.activityLog.map(l => l.id).sort(), ['m1', 'm3']);
  v.activityLog.push({ id: 'm4', message: 'as someone else', author: 'Atlanta Engineer', authorId: 'u1', time: '2026-09-26T00:00:00.000Z' });
  v.activityLog.push({ id: 'm5', message: 'mine', author: 'Aman Chhabra', authorId: 'u7', time: '2026-09-26T00:00:00.000Z' });
  assert.equal((await post(EMAIL.u7, { state: v, etag: null })).statusCode, 200);
  const log = stored().activityLog;
  assert.ok(!log.some(l => l.id === 'm4'));
  assert.equal(log.find(l => l.id === 'm5').author, 'Atlanta Engineer');
});

// ── Avatar colours rewritten by the browser are not a users change ────────────
await test('Viewer save where only avatar colours differ -> 200', async () => {
  const s = baseState();
  s.users[2].color = '#94a3b8'; // old palette; the browser rewrites it to #a1a1aa on load
  seed(s);
  assert.equal((await post(EMAIL.u5, { state: baseState(), etag: null })).statusCode, 200);
});

const failed = results.filter(r => !r[0]).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
