// Token-authenticated API for the review pipeline (one function, six routes):
//   GET  /api/pipeline/drawings?project=<id, code or name>
//   GET  /api/pipeline/comments?project=…&code=<drawing code>   → the drawing's CRS rows in table order
//   POST /api/pipeline/append-rows { project, code, rows: [{ text, page?, section?, topic?, status? }], clientKey? }
//   POST /api/pipeline/upload-url  { project, code, fileName, kind: 'pdf' | 'crs' }  → presigned PUT (files over 3 MB)
//   POST /api/pipeline/register    { project, code, title?, revision?, fileName, contentBase64 | key }
//   POST /api/pipeline/attach-crs  { project, code, fileName, contentBase64 | key }
// Header: Authorization: Bearer <PIPELINE_TOKEN>. Without PIPELINE_TOKEN the routes answer 404.
// Every change is made as the workspace user PIPELINE_USER_EMAIL and checked with checkSave.
// The rules for each change are in api/_lib/pipeline.js.
import fs from 'node:fs';
import path from 'node:path';
import { adminEmails } from '../_lib/auth.js';
import { checkSave } from '../_lib/authz.js';
import { readState, writeState, forgetMembers } from '../_lib/state.js';
import { r2Configured, cleanKey, presign, putObject, readObject, appFileUrl } from '../_lib/r2.js';
import { filesInWorkspace } from '../_lib/view.js';
import { reviewEvents, sendReviewEmails } from '../_lib/notify.js';
import { appendEntry } from '../_lib/log.js';
import { freshKey } from '../r2-upload-url.js';
import { sniffType, readCrs } from '../../src/utils/crs.js';
import { normCode } from '../../src/utils/mdl.js';
import {
  PipelineError, MAX_INLINE_BYTES, tokenState, pipelineUser, findProject, assertAccess,
  listDrawings, crsSummary, applyRegister, applyAttachCrs, commitChange,
  drawingComments, applyAppendRows,
} from '../_lib/pipeline.js';

const fail = (status, error, extra) => { throw new PipelineError(status, error, extra); };

const KINDS = {
  pdf: { folder: 'drawings', ext: /\.pdf$/i, types: ['pdf'], contentType: 'application/pdf' },
  crs: { folder: 'crs', ext: /\.(xlsx|xlsm|xls)$/i, types: ['xlsx', 'xls'], contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
};
const safeName = (n) => String(n || '').split(/[\\/]/).pop().replace(/[^\w.\-() ]+/g, '_').slice(0, 180);
const codeFolder = (code) => normCode(code).replace(/[^\w.-]+/g, '_') || 'UNKNOWN';

/** Read the workspace, resolve the acting user and the project. */
async function context(projectRef, { write = false } = {}) {
  const cur = await readState();
  if (cur.notFound || !cur.text) fail(409, 'no_workspace');
  const state = JSON.parse(cur.text);
  const who = pipelineUser(state, process.env.PIPELINE_USER_EMAIL, adminEmails());
  const project = findProject(state, projectRef);
  assertAccess(who, project, { write });
  return { state, who, project };
}

function checkName(body, kind) {
  const fileName = safeName(body.fileName);
  if (!fileName) fail(400, 'fileName_required');
  if (!KINDS[kind].ext.test(fileName)) fail(400, kind === 'pdf' ? 'not_a_pdf_name' : 'not_an_excel_name', { fileName });
  return fileName;
}

async function store(key, bytes, contentType) {
  if (process.env.LOCAL_DATA_DIR) {
    // local dev: the vite dev server serves these under /local-files/
    const dest = path.join(process.env.LOCAL_DATA_DIR, 'files', ...key.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    return `/local-files/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  if (!r2Configured()) fail(501, 'storage_not_configured');
  await putObject(key, bytes, contentType);
  return appFileUrl(key);
}

/**
 * The file of a register / attach-crs call: inline (contentBase64, up to 3 MB) or a key from
 * upload-url. → { fileName, bytes?, save(): url } — nothing is stored until save() is called,
 * so a refused call leaves no file behind.
 */
async function incoming(body, kind, code) {
  const k = KINDS[kind];
  const fileName = checkName(body, kind);
  if (typeof body.contentBase64 === 'string' && body.contentBase64) {
    const bytes = Buffer.from(body.contentBase64.replace(/^data:[^,]*,/, ''), 'base64');
    if (!bytes.length) fail(400, 'empty_file');
    if (bytes.length > MAX_INLINE_BYTES) fail(413, 'too_large_use_upload_url', { maxInlineBytes: MAX_INLINE_BYTES });
    if (!k.types.includes(sniffType(bytes))) fail(400, kind === 'pdf' ? 'not_a_pdf' : 'not_an_excel');
    const key = freshKey(`${k.folder}/${codeFolder(code)}/${fileName}`);
    return { fileName, bytes, inline: true, save: () => store(key, bytes, k.contentType) };
  }
  if (typeof body.key === 'string' && body.key) {
    const key = cleanKey(body.key);
    if (!key.startsWith(`${k.folder}/${codeFolder(code)}/`)) fail(400, 'key_mismatch', { expected: `${k.folder}/${codeFolder(code)}/…` });
    if (!r2Configured()) fail(501, 'storage_not_configured');
    const head = await readObject(key, { range: 'bytes=0-7' });
    if (!head) fail(400, 'upload_missing');
    if (!k.types.includes(sniffType(head))) fail(400, kind === 'pdf' ? 'not_a_pdf' : 'not_an_excel');
    const bytes = kind === 'crs' ? await readObject(key) : null;
    return { fileName, bytes, inline: false, url: appFileUrl(key), save: async () => appFileUrl(key) };
  }
  return fail(400, 'file_required');
}

/** Apply one change as the pipeline user: pre-check, store the file, then read-apply-write with retries. */
async function change(req, kind, applyFn) {
  const body = req.body || {};
  const { state, who, project } = await context(body.project, { write: true });
  const file = await incoming(body, kind, body.code);
  const parsed = kind === 'crs' ? await readCrs(new Uint8Array(file.bytes)) : null;
  // a linked upload must be a file no record uses yet
  const guard = (s, url) => { if (!file.inline && filesInWorkspace(s).has(url)) fail(409, 'file_in_use'); };
  // refuse before storing anything (revision_exists, sheet_present, …)
  guard(state, file.url);
  applyFn(state, { who, project, url: '(pending)', fileName: file.fileName, parsed });
  const url = await file.save();
  let acting = who;
  const done = await commitChange({
    read: () => readState(),
    write: (text, etag) => writeState(text, etag),
    apply: (before) => {
      const w = pipelineUser(before, process.env.PIPELINE_USER_EMAIL, adminEmails());
      acting = w;
      const p = findProject(before, project.id);
      assertAccess(w, p, { write: true });
      guard(before, url);
      return applyFn(before, { who: w, project: p, url, fileName: file.fileName, parsed, now: new Date().toISOString() });
    },
    check: (before, next) => checkSave(before, next, acting),
  });
  forgetMembers();
  const logged = await storeEntries(done.entries);
  try { await sendReviewEmails(done.state, reviewEvents(done.before, done.state)); } catch (e) { console.error('[notify]', e); }
  return { done, url, logged };
}

/** The change's log and activity entries, as objects (api/_lib/log.js); a failure is retried once. → true | false */
async function storeEntries(entries) {
  const jobs = [...(entries?.log || []).map(entry => ({ kind: 'log', entry })), ...(entries?.activity || []).map(a => ({ kind: 'activity', ...a }))];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      for (const j of jobs) await appendEntry(j.kind, j.entry, { drawingId: j.drawingId });
      return true;
    } catch (e) { console.error('[pipeline] log entries', e); }
  }
  return false;
}

async function handle(req, res, action) {
  const method = req.method;
  if (action === 'drawings') {
    if (method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    const { state, who, project } = await context(req.query?.project);
    return res.status(200).json({ project: { id: project.id, code: project.code || '', name: project.name || '' }, actingAs: who.email, drawings: listDrawings(state, project) });
  }
  if (action === 'comments') {
    if (method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    const { state, project } = await context(req.query?.project);
    return res.status(200).json(drawingComments(state, project, req.query?.code));
  }
  if (method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = req.body || {};

  if (action === 'append-rows') {
    const { state, who, project } = await context(body.project, { write: true });
    const args = { project, code: body.code, rows: body.rows, clientKey: body.clientKey };
    // decided on the stored document first: a replayed clientKey, or nothing new, writes nothing
    const first = applyAppendRows(state, { ...args, who });
    const reply = (r, extra = {}) => res.status(200).json({ added: r.added, skipped: r.skipped, rowIds: r.rowIds, ...(r.replayed ? { replayed: true } : {}), ...extra });
    if (first.replayed || !first.added) return reply(first);
    let acting = who;
    const done = await commitChange({
      read: () => readState(),
      write: (text, etag) => writeState(text, etag),
      apply: (before) => {
        const w = pipelineUser(before, process.env.PIPELINE_USER_EMAIL, adminEmails());
        acting = w;
        const p = findProject(before, project.id);
        assertAccess(w, p, { write: true });
        return applyAppendRows(before, { ...args, project: p, who: w, now: new Date().toISOString() });
      },
      check: (before, next) => checkSave(before, next, acting),
    });
    forgetMembers();
    const logged = done.entries ? await storeEntries(done.entries) : true;
    return reply(done, { attempts: done.attempts, ...(logged ? {} : { logWritten: false }) });
  }

  if (action === 'upload-url') {
    const kind = body.kind === 'crs' ? 'crs' : 'pdf';
    await context(body.project, { write: true });
    const fileName = checkName(body, kind);
    if (!normCode(body.code)) fail(400, 'code_required');
    if (!r2Configured()) fail(501, 'upload_url_needs_r2', { maxInlineBytes: MAX_INLINE_BYTES });
    const key = freshKey(`${KINDS[kind].folder}/${codeFolder(body.code)}/${fileName}`);
    const uploadUrl = await presign('PUT', key, { expires: 900 });
    return res.status(200).json({ uploadUrl, key, contentType: KINDS[kind].contentType, expiresIn: 900 });
  }

  if (action === 'register') {
    const { done, url, logged } = await change(req, 'pdf', (s, a) => applyRegister(s, {
      who: a.who, project: a.project, code: body.code, title: body.title, revision: body.revision,
      fileUrl: a.url, fileName: a.fileName, now: a.now,
    }));
    const d = done.drawing;
    return res.status(200).json({
      outcome: done.outcome, code: d.code, drawingId: d.id, version: done.version, file: url,
      review: d.review ? { stage: d.review.stage, cycle: d.review.cycle, dueDate: d.review.dueDate, dueSource: d.review.dueSource } : null,
      attempts: done.attempts, ...(logged ? {} : { logWritten: false }),
    });
  }

  if (action === 'attach-crs') {
    const { done, url, logged } = await change(req, 'crs', (s, a) => applyAttachCrs(s, {
      who: a.who, project: a.project, code: body.code, crsUrl: a.url, fileName: a.fileName, parsed: a.parsed, now: a.now,
    }));
    return res.status(200).json({ outcome: 'attached', code: done.drawing.code, rows: done.rows, crs: crsSummary(done.drawing), file: url, attempts: done.attempts, ...(logged ? {} : { logWritten: false }) });
  }
  return res.status(404).json({ error: 'unknown_action' });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t = tokenState(req.headers?.authorization);
  if (t === 'off') return res.status(404).json({ error: 'not_found' });
  if (t === 'weak') return res.status(503).json({ error: 'pipeline_token_too_short' });
  if (t !== 'ok') return res.status(401).json({ error: 'unauthorized' });
  const action = String(req.query?.action || '');
  try {
    return await handle(req, res, action);
  } catch (e) {
    if (e instanceof PipelineError) return res.status(e.status).json({ error: e.error, ...e.extra });
    if (e?.status) return res.status(e.status).json({ error: e.message });
    console.error('[pipeline]', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
