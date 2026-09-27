// Notification emails: Reply-To per recipient group, subject format, the IR1 line.
//   node tests/notify.test.mjs
// fetch is replaced by a stub that records the Resend payloads; nothing leaves the machine.
import assert from 'node:assert/strict';

process.env.RESEND_API_KEY = 'test-key';
process.env.NOTIFY_FROM = 'TE DMS <dms@notify.tranzenergy.com>';
delete process.env.APP_URL;

const { sendReviewEmails, IR1_REPLY_LINE } = await import('../api/_lib/notify.js');
const { checkSave } = await import('../api/_lib/authz.js');
const { isEmail } = await import('../src/utils/org.js');

let sent = [];
globalThis.fetch = async (url, init) => {
  assert.equal(url, 'https://api.resend.com/emails');
  sent.push(JSON.parse(init.body));
  return { ok: true, status: 200 };
};

let n = 0, failed = 0;
async function test(name, fn) {
  sent = [];
  try { await fn(); console.log(`  ok ${++n} - ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${++n} - ${name}\n      ${e.message}`); }
}

const TEAM = 'jacopolicheri@gmail.com';
const CONS = 'aman.chhabra@tranzenergy.com';
const USERS = [
  { id: 'u1', name: 'Admin', email: 'admin@te.example', role: 'Admin' },
  { id: 'u2', name: 'First reviewer', email: 'ir1@te.example', role: 'Project Manager' },
  { id: 'u3', name: 'Notify', email: 'notify@te.example', role: 'Engineer' },
  { id: 'u7', name: 'Consultant', email: 'eng@atlanta.example', role: 'Consultant' },
];
const state = (org = {}) => ({
  org: { name: 'TranzEnergy', ...org },
  users: structuredClone(USERS),
  projects: [{ id: 'p1', code: 'TE-002', name: 'RPCL', assignedUsers: ['u1', 'u2', 'u3', 'u7'],
    workflow: { enabled: true, consultantUsers: ['u7'], firstReviewers: ['u2'], secondReviewers: [], approvers: [], issueNotify: ['u3'] } }],
  drawings: [],
});
const drawing = { id: 'd1', code: 'E-001', title: 'SLD', projectId: 'p1', currentVersion: 'R1', review: { stage: 'ir1', cycle: 1 } };
const ev = (to) => ({ drawing: { ...drawing, review: { ...drawing.review, stage: to } }, from: null, to, cycle: 1 });
const both = { replyToTeam: TEAM, replyToConsultant: CONS };

await test('internal-only recipients get reply_to = replyToTeam', async () => {
  await sendReviewEmails(state(both), [ev('ir1')]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['ir1@te.example']);
  assert.equal(sent[0].reply_to, TEAM);
  assert.equal(sent[0].from, 'TE DMS <dms@notify.tranzenergy.com>');
});

await test('consultant recipients get reply_to = replyToConsultant', async () => {
  const s = state(both);
  s.projects[0].workflow.issueNotify = [];
  await sendReviewEmails(s, [ev('consultant')]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['eng@atlanta.example']);
  assert.equal(sent[0].reply_to, CONS);
});

await test('mixed recipients -> two sends, one per group, same subject', async () => {
  await sendReviewEmails(state(both), [ev('consultant')]);
  assert.equal(sent.length, 2);
  const team = sent.find(b => b.to.includes('notify@te.example'));
  const cons = sent.find(b => b.to.includes('eng@atlanta.example'));
  assert.deepEqual(team.to, ['notify@te.example']);
  assert.deepEqual(cons.to, ['eng@atlanta.example']);
  assert.equal(team.reply_to, TEAM);
  assert.equal(cons.reply_to, CONS);
  assert.equal(team.subject, cons.subject);
  assert.equal(team.text, cons.text, 'no IR1 line outside ir1');
});

await test('empty settings -> no reply_to (current behaviour)', async () => {
  await sendReviewEmails(state(), [ev('consultant'), ev('ir1')]);
  assert.equal(sent.length, 3);
  for (const b of sent) assert.ok(!('reply_to' in b), 'reply_to present');
  for (const b of sent) assert.ok(!b.text.includes(IR1_REPLY_LINE));
});

await test('only one setting filled -> only that group gets reply_to', async () => {
  await sendReviewEmails(state({ replyToConsultant: CONS }), [ev('consultant')]);
  const team = sent.find(b => b.to.includes('notify@te.example'));
  const cons = sent.find(b => b.to.includes('eng@atlanta.example'));
  assert.ok(!('reply_to' in team));
  assert.equal(cons.reply_to, CONS);
});

await test('an invalid stored address is ignored (no reply_to)', async () => {
  await sendReviewEmails(state({ replyToTeam: 'Jacopo <jacopolicheri@gmail.com>' }), [ev('ir1')]);
  assert.equal(sent.length, 1);
  assert.ok(!('reply_to' in sent[0]));
  assert.ok(!sent[0].text.includes(IR1_REPLY_LINE));
});

await test('subject format unchanged: [<project code>] <drawing code> <revision> — <stage>', async () => {
  await sendReviewEmails(state(both), [ev('ir1')]);
  assert.equal(sent[0].subject, '[TE-002] E-001 R1 — TE Engineer 1');
});

await test('IR1 line present only in ir1 team emails, as the last line', async () => {
  await sendReviewEmails(state(both), [ev('ir1')]);
  assert.ok(sent[0].text.trimEnd().endsWith(IR1_REPLY_LINE));
  assert.equal(IR1_REPLY_LINE, 'Reply to this email with your comment sheet attached if you work in Excel.');
  sent = [];
  const s = state(both);
  s.projects[0].workflow.firstReviewers = ['u2', 'u7'];               // a consultant at ir1 does not get it
  await sendReviewEmails(s, [ev('ir1')]);
  assert.equal(sent.length, 2);
  assert.ok(sent.find(b => b.to.includes('ir1@te.example')).text.includes(IR1_REPLY_LINE));
  assert.ok(!sent.find(b => b.to.includes('eng@atlanta.example')).text.includes(IR1_REPLY_LINE));
  sent = [];
  s.projects[0].workflow.secondReviewers = ['u3'];
  await sendReviewEmails(s, [ev('ir2')]);
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].text.includes(IR1_REPLY_LINE));
});

await test('non-admin cannot change replyToTeam or replyToConsultant; admin can', async () => {
  const before = state();
  const nonAdmin = { user: USERS[1], isAdmin: false };
  const admin = { user: USERS[0], isAdmin: true };
  for (const k of ['replyToTeam', 'replyToConsultant']) {
    const next = structuredClone(before);
    next.org[k] = 'someone@evil.example';
    assert.deepEqual(checkSave(before, next, nonAdmin), { status: 403, error: 'admin_only' }, k);
    assert.equal(checkSave(before, next, admin), null, k);
  }
});

await test('isEmail accepts a plain address and rejects names, lists and junk', () => {
  assert.ok(isEmail(TEAM) && isEmail(CONS));
  for (const bad of ['', 'x', 'a@b', 'Jacopo <a@b.com>', 'a@b.com, c@d.com', 'a@b.com;c@d.com', 'a b@c.com', null]) assert.ok(!isEmail(bad), String(bad));
});

console.log(failed ? `\n${failed} of ${n} failed` : `\nall ${n} passed`);
process.exit(failed ? 1 : 0);
