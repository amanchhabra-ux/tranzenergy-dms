// Tests for the activity log out of the workspace document (api/_lib/log.js, api/_lib/logApi.js).
// Plain node:  node tests/log.test.mjs
// Runs the real handlers in local mode (LOCAL_DATA_DIR = a temp folder), where each log object
// is a file under objects/ named like its R2 key, with real signed session cookies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dms-log-'));
process.env.LOCAL_DATA_DIR = dir;
process.env.LOCAL_SESSION_SECRET = 'test-secret';
for (const k of ['CLERK_SECRET_KEY', 'ADMIN_EMAILS', 'RESEND_API_KEY', 'PIPELINE_TOKEN', 'PIPELINE_USER_EMAIL', 'R2_ACCOUNT_ID']) delete process.env[k];
console.log = ((log) => (...a) => { if (!String(a[0]).startsWith('[notify]')) log(...a); })(console.log);

const { makeSessionCookie } = await import('../api/_lib/session.js');
const { forgetMembers } = await import('../api/_lib/state.js');
const { forgetObjects } = await import('../api/_lib/objects.js');
const L = await import('../api/_lib/log.js');
const saveState = (await import('../api/save-state.js')).default;
const getState = (await import('../api/get-state.js')).default;
const pipeline = (await import('../api/pipeline/[action].js')).default;

const USERS = [
  { id: 'u1', name: 'Aman Chhabra', email: 'aman@tranzenergy.in', role: 'Admin' },
  { id: 'u2', name: 'Project Manager', email: 'pm@tranzenergy.in', role: 'Project Manager' },
  { id: 'u5', name: 'Viewer', email: 'viewer@tranzenergy.in', role: 'Viewer' },
  { id: 'u7', name: 'Atlanta Engineer', email: 'eng@atlanta.example', role: 'Consultant' },
];
const EMAIL = Object.fromEntries(USERS.map(u => [u.id, u.email]));
const baseState = () => ({
  users: structuredClone(USERS),
  projects: [
    { id: 'p1', code: 'TE-002', name: 'RPCL', assignedUsers: ['u1', 'u2', 'u5', 'u7'] },
    { id: 'p2', code: 'OTHER', name: 'Other job', assignedUsers: ['u1', 'u2'] },
  ],
  drawings: [
    { id: 'd1', code: 'E-001', title: 'SLD', projectId: 'p1', currentVersion: 'R0', versions: [{ version: 'R0' }], pins: [] },
    { id: 'd9', code: 'X-009', title: 'Secret', projectId: 'p2', currentVersion: 'R0', versions: [{ version: 'R0' }], pins: [] },
  ],
  proposals: [],
  disciplines: ['Electrical', 'Other'],
});
// a document as it is before the migration: log and activity inside it
const legacyState = () => {
  const s = baseState();
  s.activityLog = [
    { id: 'l1', message: 'PM entry', author: 'Project Manager', authorId: 'u2', time: '2026-09-20T10:00:00.000Z' },
    { id: 'l2', message: 'consultant entry', author: 'Atlanta Engineer', authorId: 'u7', time: '2026-09-21T10:00:00.000Z' },
    { message: 'very old entry, no id', author: 'Aman Chhabra', time: '2026-09-01T10:00:00.000Z' },
  ];
  s.drawings[0].activity = [
    { id: 'a1', type: 'upload', what: 'drawing', version: 'R0', at: '2026-09-20T10:00:00.000Z', by: 'u2', byName: 'Project Manager' },
    { id: 'a2', type: 'comment', text: 'ours', vis: 'internal', at: '2026-09-20T11:00:00.000Z', by: 'u2', byName: 'Project Manager' },
  ];
  s.drawings[1].activity = [{ id: 'a9', type: 'download', at: '2026-09-20T12:00:00.000Z', by: 'u1', byName: 'Aman Chhabra' }];
  return s;
};

const stateFile = path.join(dir, 'db_state.json');
function seed(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state));
  fs.writeFileSync(path.join(dir, 'auth_credentials.json'), JSON.stringify({
    users: Object.fromEntries(state.users.map(u => [u.email, { salt: 'x', hash: 'y', pwv: 0 }])),
  }));
  fs.rmSync(path.join(dir, 'objects'), { recursive: true, force: true });
  forgetMembers(); forgetObjects(); L.forgetKnownIds();
}
const raw = () => fs.readFileSync(stateFile, 'utf8');
const stored = () => JSON.parse(raw());

function mockRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = typeof b === 'string' ? JSON.parse(b) : b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    end() { return this; },
  };
}
const cookie = (email) => ({ cookie: makeSessionCookie(email, { secure: false }).split(';')[0], host: 'localhost' });
async function api(route, email, { method = 'GET', query = {}, body } = {}) {
  const res = mockRes();
  await getState({ method, headers: cookie(email), query: { ...query, route }, body }, res);
  return res;
}
const save = async (email, state) => { const res = mockRes(); await saveState({ method: 'POST', headers: cookie(email), body: { state, etag: null } }, res); return res; };
const recent = (iso) => Math.abs(Date.parse(iso) - Date.now()) < 60_000;
const objectFiles = (sub) => { const d = path.join(dir, 'objects', ...sub.split('/')); return fs.existsSync(d) ? fs.readdirSync(d) : []; };
const allLog = async (email = EMAIL.u1) => {
  const out = []; let cursor = null;
  do { const r = await api('log', email, { query: { limit: 200, ...(cursor ? { cursor } : {}) } }); out.push(...r.body.entries); cursor = r.body.cursor; } while (cursor);
  return out;
};

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); console.log('ok   ', name); }
  catch (e) { results.push([false, name]); console.log('FAIL ', name, '\n     ', e.stack.split('\n').slice(0, 3).join('\n      ')); }
}

// ── Append-only ───────────────────────────────────────────────────────────────
await test('key: revTs is 13 digits and sorts newest first', () => {
  assert.equal(L.revTs(Date.parse('2026-09-27T00:00:00Z')).length, 13);
  assert.ok(L.revTs(Date.parse('2026-09-27T00:00:01Z')) < L.revTs(Date.parse('2026-09-27T00:00:00Z')));
  assert.equal(L.unseg(L.seg('a/b c+d~é')), 'a/b c+d~é');
  assert.ok(!/[/+]/.test(L.seg('a/b+c')));
});

await test('append-only: the same entry twice is written once; different content under the id is refused', async () => {
  seed(baseState());
  const e = { id: 'log-x', message: 'first', author: 'Project Manager', authorId: 'u2', time: '2026-09-27T08:00:00.000Z' };
  assert.equal((await L.appendEntry('log', e)).status, 'written');
  const file = path.join(dir, 'objects', '_system', 'log', L.logName(e));
  const before = fs.readFileSync(file, 'utf8');
  assert.equal((await L.appendEntry('log', { ...e, time: '2026-09-28T08:00:00.000Z' })).status, 'present', 'a re-post with another time is the same entry');
  const r = await L.appendEntry('log', { ...e, message: 'rewritten' });
  assert.equal(r.status, 'conflict');
  assert.equal(r.entry.message, 'first');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'object changed');
  assert.equal(objectFiles('_system/log').length, 1);
  // through the endpoint
  const p1 = await api('log', EMAIL.u2, { method: 'POST', body: { entries: [{ id: 'log-y', message: 'one', authorId: 'u2' }] } });
  assert.equal(p1.body.written, 1);
  const p2 = await api('log', EMAIL.u2, { method: 'POST', body: { entries: [{ id: 'log-y', message: 'two', authorId: 'u2' }] } });
  assert.deepEqual([p2.body.written, p2.body.present, p2.body.conflict], [0, 0, 1]);
  const p3 = await api('log', EMAIL.u2, { method: 'POST', body: { entries: [{ id: 'log-y', message: 'one', authorId: 'u2' }] } });
  assert.deepEqual([p3.body.written, p3.body.present], [0, 1]);
  assert.equal((await allLog()).find(l => l.id === 'log-y').message, 'one');
});

await test('an interrupted write (id claimed, listing object missing) is completed by the retry', async () => {
  seed(baseState());
  const e = { id: 'log-z', message: 'm', author: 'Viewer', authorId: 'u5', time: '2026-09-27T09:00:00.000Z' };
  await L.appendEntry('log', e);
  fs.rmSync(path.join(dir, 'objects', '_system', 'log', L.logName(e)));
  forgetObjects();
  assert.equal((await L.appendEntry('log', e)).status, 'present');
  assert.ok(fs.existsSync(path.join(dir, 'objects', '_system', 'log', L.logName(e))));
});

// ── Paging ───────────────────────────────────────────────────────────────────
await test('newest first, pages with a cursor, no entry twice or missed', async () => {
  seed(baseState());
  for (let i = 0; i < 7; i++) {
    await L.appendEntry('log', { id: `p${i}`, message: `m${i}`, author: 'Viewer', authorId: 'u5', time: new Date(Date.UTC(2026, 8, 20, 10, i)).toISOString() });
  }
  const pages = [];
  let cursor = null;
  do {
    const r = await api('log', EMAIL.u2, { query: { limit: '3', ...(cursor ? { cursor } : {}) } });
    assert.equal(r.statusCode, 200);
    pages.push(r.body.entries.map(e => e.id));
    cursor = r.body.cursor;
  } while (cursor && pages.length < 10);
  assert.deepEqual(pages, [['p6', 'p5', 'p4'], ['p3', 'p2', 'p1'], ['p0']]);
  assert.equal((await api('log', EMAIL.u2, { query: { cursor: '../etc' } })).statusCode, 400);
});

await test('activity: a drawing pages newest first; recent activity stops at `since`', async () => {
  seed(baseState());
  for (let i = 0; i < 5; i++) {
    await L.appendEntry('activity', { id: `x${i}`, type: 'download', drawingId: 'd1', at: new Date(Date.UTC(2026, 8, 20 + i)).toISOString(), by: 'u2', byName: 'Project Manager' }, { drawingId: 'd1' });
  }
  const a = await api('activity', EMAIL.u2, { query: { drawing: 'd1', limit: '2' } });
  assert.deepEqual(a.body.entries.map(e => e.id), ['x4', 'x3']);
  const b = await api('activity', EMAIL.u2, { query: { drawing: 'd1', limit: '10', cursor: a.body.cursor } });
  assert.deepEqual(b.body.entries.map(e => e.id), ['x2', 'x1', 'x0']);
  assert.equal(b.body.cursor, null);
  const feed = await api('activity', EMAIL.u2, { query: { since: '2026-09-22T12:00:00.000Z' } });
  assert.deepEqual(feed.body.entries.map(e => e.id), ['x4', 'x3']);
  assert.equal(feed.body.entries[0].drawingId, 'd1');
});

// ── Stamping ─────────────────────────────────────────────────────────────────
await test('server stamps time and author; client time, author and byName are ignored', async () => {
  seed(baseState());
  const r = await api('log', EMAIL.u2, { method: 'POST', body: { entries: [
    { id: 's1', message: 'hello', author: 'Project Manager', authorId: 'u2', time: '2099-01-01T00:00:00.000Z' },
    { id: 's2', message: 'as the admin', author: 'Aman Chhabra', authorId: 'u1', time: '2099-01-01T00:00:00.000Z' },
    // written by the app before it knew the user
    { id: 's3', message: 'signed in', author: 'System' },
  ] } });
  assert.deepEqual([r.body.written, r.body.refused], [2, 1]);
  const mine = (await allLog()).filter(l => l.id.startsWith('s'));
  assert.deepEqual(mine.map(l => l.id).sort(), ['s1', 's3']);
  for (const e of mine) { assert.ok(recent(e.time)); assert.equal(e.author, 'Project Manager'); assert.equal(e.authorId, 'u2'); }
  const a = await api('activity', EMAIL.u5, { method: 'POST', body: { drawing: 'd1', entries: [
    { id: 't1', type: 'download', what: 'pdf', at: '2099-01-01T00:00:00.000Z', by: 'u5', byName: 'Aman Chhabra', nested: { x: 1 } },
  ] } });
  assert.equal(a.body.written, 1);
  const t = (await api('activity', EMAIL.u5, { query: { drawing: 'd1' } })).body.entries[0];
  assert.ok(recent(t.at)); assert.equal(t.byName, 'Viewer'); assert.equal(t.by, 'u5'); assert.equal(t.nested, undefined); assert.equal(t.what, 'pdf');
  // activity for a drawing that is not saved yet: 404, the browser retries
  assert.equal((await api('activity', EMAIL.u5, { method: 'POST', body: { drawing: 'nope', entries: [{ id: 't2', type: 'download' }] } })).statusCode, 404);
  // more than a request may carry
  const many = Array.from({ length: 101 }, (_, i) => ({ id: `m${i}`, message: 'x' }));
  assert.equal((await api('log', EMAIL.u2, { method: 'POST', body: { entries: many } })).statusCode, 413);
});

// ── Consultant ───────────────────────────────────────────────────────────────
await test('consultant: adds only their own entries, reads only their log and what externalView allows', async () => {
  seed(legacyState());
  await L.migrateEntries(legacyState()); // entries from objects as well as from the document
  await L.appendEntry('activity', { id: 'n1', type: 'comment', text: 'draft', vis: 'internal', drawingId: 'd1', at: new Date().toISOString(), by: 'u2', byName: 'Project Manager' }, { drawingId: 'd1' });
  // writing
  const w = await api('log', EMAIL.u7, { method: 'POST', body: { entries: [
    { id: 'c1', message: 'mine', authorId: 'u7' },
    { id: 'c2', message: 'as TE', authorId: 'u2', author: 'Project Manager' },
  ] } });
  assert.deepEqual([w.body.written, w.body.refused], [1, 1]);
  const wa = await api('activity', EMAIL.u7, { method: 'POST', body: { drawing: 'd1', entries: [
    { id: 'c3', type: 'download', by: 'u7' },
    { id: 'c4', type: 'comment', text: 'pretend internal', vis: 'internal' },
    { id: 'c5', type: 'upload', by: 'u2' },
  ] } });
  assert.deepEqual([wa.body.written, wa.body.refused], [1, 2]);
  assert.equal((await api('activity', EMAIL.u7, { method: 'POST', body: { drawing: 'd9', entries: [{ id: 'c6', type: 'download' }] } })).statusCode, 404);
  // reading
  const log = (await api('log', EMAIL.u7)).body.entries.map(e => e.id).sort();
  assert.deepEqual(log, ['c1', 'l2']);
  const act = (await api('activity', EMAIL.u7, { query: { drawing: 'd1' } })).body.entries.map(e => e.id);
  assert.ok(act.includes('a1') && act.includes('c3'));
  assert.ok(!act.includes('a2') && !act.includes('n1'), 'internal entries shown');
  assert.equal((await api('activity', EMAIL.u7, { query: { drawing: 'd9' } })).statusCode, 404);
  const feed = (await api('activity', EMAIL.u7, { query: { since: '2026-01-01T00:00:00.000Z' } })).body.entries;
  assert.ok(feed.length > 0);
  assert.ok(feed.every(e => e.drawingId === 'd1' && e.vis !== 'internal'), JSON.stringify(feed.map(e => [e.id, e.drawingId])));
  // internal users read everything
  const all = (await api('activity', EMAIL.u2, { query: { since: '2026-01-01T00:00:00.000Z' } })).body.entries.map(e => e.id);
  assert.ok(['a1', 'a2', 'a9', 'n1', 'c3'].every(id => all.includes(id)));
});

// ── The document ─────────────────────────────────────────────────────────────
await test('get-state carries no log and no activity; entries still in the document come from /api/log', async () => {
  seed(legacyState());
  for (const email of [EMAIL.u2, EMAIL.u7]) {
    const res = mockRes();
    await getState({ method: 'GET', headers: cookie(email), query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.activityLog, undefined);
    assert.ok(res.body.drawings.every(d => d.activity === undefined));
  }
  const ids = (await allLog()).map(e => e.id);
  assert.equal(ids.length, 3);
  assert.deepEqual(ids.slice(0, 2), ['l2', 'l1']);
  assert.match(ids[2], /^legacy-/);
});

await test('old tab: a save carrying activityLog is written as objects and stripped; the document does not grow', async () => {
  seed(legacyState());
  // migrated: the document holds no log any more
  const mig = await api('migrate', EMAIL.u1, { method: 'POST' });
  assert.equal(mig.statusCode, 200, JSON.stringify(mig.body));
  const size = raw().length;
  // an old tab still holds the whole old log and adds two entries of its own
  const tab = legacyState();
  const now = new Date().toISOString();
  tab.activityLog.unshift(
    { id: 'o1', message: 'from the old tab', author: 'Project Manager', authorId: 'u2', time: now },
    { id: 'o2', message: 'and another', author: 'Project Manager', authorId: 'u2', time: now },
  );
  tab.drawings[0].activity.push({ id: 'oa1', type: 'download', at: now, by: 'u2', byName: 'Project Manager' });
  for (let i = 0; i < 2; i++) assert.equal((await save(EMAIL.u2, tab)).statusCode, 200); // the tab saves again and again
  const after = stored();
  assert.equal(after.activityLog, undefined);
  assert.ok(after.drawings.every(d => d.activity === undefined));
  assert.equal(raw().length, size, 'document grew');
  const ids = (await allLog()).map(e => e.id);
  assert.equal(ids.filter(id => id === 'o1').length, 1);
  assert.equal(ids.filter(id => id === 'l1').length, 1);
  assert.equal(ids.length, 5, ids.join());
  const act = (await api('activity', EMAIL.u2, { query: { drawing: 'd1' } })).body.entries.map(e => e.id);
  assert.deepEqual(act.filter(id => id === 'oa1'), ['oa1']);
  assert.equal(act.length, 3);
});

await test('before the migration a save keeps the entries the document holds and adds none', async () => {
  seed(legacyState());
  const s = legacyState();
  s.activityLog.unshift({ id: 'new1', message: 'new', author: 'Project Manager', authorId: 'u2', time: new Date().toISOString() });
  delete s.drawings[0].activity; // a new tab sends no activity at all
  assert.equal((await save(EMAIL.u2, s)).statusCode, 200);
  const after = stored();
  assert.deepEqual(after.activityLog.map(e => e.id || 'noid'), ['l1', 'l2', 'noid']);
  assert.deepEqual(after.drawings[0].activity.map(e => e.id), ['a1', 'a2']);
  assert.ok((await allLog()).some(e => e.id === 'new1'));
});

// ── Migration ────────────────────────────────────────────────────────────────
await test('migrate-log: admin only; dry run counts and changes nothing; real run strips; second run writes 0', async () => {
  seed(legacyState());
  const original = raw();
  assert.equal((await api('migrate', EMAIL.u2, { method: 'POST' })).statusCode, 403);
  const dry = await api('migrate', EMAIL.u1, { method: 'POST', query: { dryRun: '1' } });
  assert.equal(dry.statusCode, 200);
  assert.deepEqual([dry.body.found, dry.body.foundLog, dry.body.foundActivity, dry.body.written, dry.body.alreadyPresent, dry.body.stripped, dry.body.wouldStrip], [6, 3, 3, 6, 0, 0, 6]);
  assert.equal(raw(), original, 'dry run changed the document');
  assert.equal(objectFiles('_system/log').length, 0, 'dry run wrote objects');
  const run = await api('migrate', EMAIL.u1, { method: 'POST' });
  assert.equal(run.statusCode, 200, JSON.stringify(run.body));
  assert.deepEqual([run.body.found, run.body.written, run.body.alreadyPresent, run.body.stripped], [6, 6, 0, 6]);
  assert.ok(run.body.bytesAfter < run.body.bytesBefore);
  const after = stored();
  assert.equal(after.activityLog, undefined);
  assert.ok(after.drawings.every(d => !('activity' in d)));
  assert.deepEqual(after.users, legacyState().users, 'anything else changed');
  // entries keep their own times and authors
  const l1 = (await allLog()).find(e => e.id === 'l1');
  assert.deepEqual(l1, legacyState().activityLog[0]);
  // again: nothing left in the document, nothing written
  const again = await api('migrate', EMAIL.u1, { method: 'POST' });
  assert.deepEqual([again.body.found, again.body.written, again.body.stripped], [0, 0, 0]);
  // the same document migrated twice (e.g. from a restored backup): all present, none written
  const twice = await L.migrateEntries(legacyState());
  assert.deepEqual([twice.found, twice.written, twice.alreadyPresent, twice.conflicts], [6, 0, 6, 0]);
  // the author index lets the consultant read their migrated entry, and the unnamed old entry is indexed by name
  assert.deepEqual((await api('log', EMAIL.u7)).body.entries.map(e => e.id), ['l2']);
  assert.equal(objectFiles('_system/log-by/u1').length, 1);
});

await test('migrate-log: a save between read and strip is picked up on the retry', async () => {
  seed(legacyState());
  const { runMigration } = await import('../api/_lib/logApi.js');
  const { readState } = await import('../api/_lib/state.js');
  // someone saves right after the first read: a new log entry and an edited title
  let n = 0;
  const read = async () => {
    const r = await readState();
    if (n++ === 0) {
      const s = legacyState();
      s.drawings[0].title = 'Edited meanwhile';
      s.activityLog.unshift({ id: 'late', message: 'saved during the migration', author: 'Viewer', authorId: 'u5', time: '2026-09-22T10:00:00.000Z' });
      fs.writeFileSync(stateFile, JSON.stringify(s));
    }
    return r;
  };
  const r1 = await runMigration({ read });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.attempts, 2);
  assert.deepEqual([r1.body.written, r1.body.stripped], [7, 7]);
  const s1 = stored();
  assert.equal(s1.activityLog, undefined);
  assert.equal(s1.drawings[0].title, 'Edited meanwhile');
  assert.ok((await allLog()).some(e => e.id === 'late'));
  // a conflicting id refuses the strip
  seed(legacyState());
  await L.appendEntry('log', { id: 'l1', message: 'different', author: 'Project Manager', authorId: 'u2', time: '2026-09-20T10:00:00.000Z' });
  const r2 = await runMigration();
  assert.equal(r2.status, 409);
  assert.deepEqual(r2.body.conflictIds, ['l1']);
  assert.ok(Array.isArray(stored().activityLog), 'document stripped despite a conflict');
});

// ── Pipeline ─────────────────────────────────────────────────────────────────
await test('pipeline register still writes its activity and log entries', async () => {
  const s = baseState();
  s.users.push({ id: 'u3', name: 'Jacopo Licheri', email: 'jacopolicheri@gmail.com', role: 'Project Manager' });
  s.projects[0].assignedUsers.push('u3');
  seed(s);
  process.env.PIPELINE_TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuvwxyz';
  process.env.PIPELINE_USER_EMAIL = 'jacopolicheri@gmail.com';
  try {
    const res = mockRes();
    const pdf = Buffer.from('%PDF-1.4\n% x\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
    await pipeline({ method: 'POST', headers: { authorization: `Bearer ${process.env.PIPELINE_TOKEN}` }, query: { action: 'register' },
      body: { project: 'TE-002', code: 'NEW-001', revision: 'R0', fileName: 'new.pdf', contentBase64: pdf } }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.logWritten, undefined);
    const id = res.body.drawingId;
    const d = stored().drawings.find(x => x.id === id);
    assert.equal(d.activity, undefined);
    assert.equal(stored().activityLog, undefined);
    const act = (await api('activity', EMAIL.u2, { query: { drawing: id } })).body.entries;
    assert.equal(act.length, 1);
    assert.deepEqual([act[0].type, act[0].what, act[0].by, act[0].via], ['upload', 'drawing', 'u3', 'pipeline']);
    const log = (await allLog())[0];
    assert.match(log.message, /NEW-001.*via pipeline/); assert.equal(log.authorId, 'u3');
  } finally { delete process.env.PIPELINE_TOKEN; delete process.env.PIPELINE_USER_EMAIL; }
});

const failed = results.filter(r => !r[0]).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
