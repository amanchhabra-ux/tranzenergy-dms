import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getText, putText, PreconditionFailed } from './r2.js';

// Password store: { users: { "<email>": { salt, hash, pwv, updatedAt } } }
// Kept in its own private file, never inside the workspace data sent to browsers.
const CREDS_KEY = '_system/auth_credentials_v1.json';
const localFile = () => (process.env.LOCAL_DATA_DIR ? path.join(process.env.LOCAL_DATA_DIR, 'auth_credentials.json') : null);

// Read on every signed-in request, so keep a short per-instance cache
let cache = { at: 0, value: null };

export async function readCreds({ fresh = false } = {}) {
  const lf = localFile();
  if (lf) return { data: fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, 'utf8')) : { users: {} }, etag: null };
  if (!fresh && cache.value && Date.now() - cache.at < 20_000) return structuredClone(cache.value);
  const r = await getText(CREDS_KEY);
  const value = r.notFound ? { data: { users: {} }, etag: null } : { data: JSON.parse(r.text || '{"users":{}}'), etag: r.etag };
  cache = { at: Date.now(), value };
  return structuredClone(value);
}

async function writeCreds(data, etag) {
  const lf = localFile();
  if (lf) { fs.mkdirSync(path.dirname(lf), { recursive: true }); fs.writeFileSync(lf, JSON.stringify(data, null, 2)); return; }
  const newEtag = await putText(CREDS_KEY, JSON.stringify(data), etag ? { ifMatch: etag } : { create: true });
  cache = { at: Date.now(), value: { data: structuredClone(data), etag: newEtag } };
}

/** Change the store with a function, retrying if two saves collide. */
export async function updateCreds(fn) {
  for (let i = 0; i < 4; i++) {
    const { data, etag } = await readCreds({ fresh: true });
    const next = fn(structuredClone(data)) || data;
    try { await writeCreds(next, etag); return next; }
    catch (e) { if (!(e instanceof PreconditionFailed)) throw e; }
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
