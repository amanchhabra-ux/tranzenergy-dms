import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { list, get, put, BlobPreconditionFailedError } from '@vercel/blob';

// Password store: { users: { "<email>": { salt, hash, pwv, updatedAt } } }
// Kept in its own private file, never inside the workspace data sent to browsers.
const CREDS_PATH = 'auth_credentials_v1.json';
const localFile = () => (process.env.LOCAL_DATA_DIR ? path.join(process.env.LOCAL_DATA_DIR, 'auth_credentials.json') : null);

export async function readCreds() {
  const lf = localFile();
  if (lf) return { data: fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, 'utf8')) : { users: {} }, etag: null };
  const { blobs } = await list({ prefix: CREDS_PATH });
  const b = blobs.find(x => x.pathname === CREDS_PATH);
  if (!b) return { data: { users: {} }, etag: null };
  const r = await get(b.url, { access: 'private', useCache: false });
  const text = await new Response(r.stream).text();
  return { data: JSON.parse(text || '{"users":{}}'), etag: String(r.blob.etag || b.etag || '').replace(/^W\//, '') };
}

async function writeCreds(data, etag) {
  const lf = localFile();
  if (lf) { fs.mkdirSync(path.dirname(lf), { recursive: true }); fs.writeFileSync(lf, JSON.stringify(data, null, 2)); return; }
  const opts = { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' };
  if (etag) opts.ifMatch = etag;
  await put(CREDS_PATH, JSON.stringify(data), opts);
}

/** Change the store with a function, retrying if two saves collide. */
export async function updateCreds(fn) {
  for (let i = 0; i < 4; i++) {
    const { data, etag } = await readCreds();
    const next = fn(structuredClone(data)) || data;
    try { await writeCreds(next, etag); return next; }
    catch (e) { if (!(e instanceof BlobPreconditionFailedError || e?.name === 'BlobPreconditionFailedError')) throw e; }
  }
  throw new Error('Could not save password, please try again');
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function checkPassword(password, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const { hash } = hashPassword(password, rec.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
}

export function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use letters and at least one number.';
  return null;
}
