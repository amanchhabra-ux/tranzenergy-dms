import fs from 'node:fs';
import path from 'node:path';
import { list, get } from '@vercel/blob';

export const STATE_PATH = 'db_state_v5.json';
// Reads return a weak ETag (W/"…"); conditional writes need the plain form
export const strongEtag = (e) => (e ? String(e).replace(/^W\//, '') : '');

/** Read the workspace document. → { notFound } | { notModified, etag } | { text, etag } */
export async function readState(knownEtag) {
  if (process.env.LOCAL_DATA_DIR) {
    const f = path.join(process.env.LOCAL_DATA_DIR, 'db_state.json');
    return fs.existsSync(f) ? { text: fs.readFileSync(f, 'utf8'), etag: null } : { notFound: true };
  }
  const { blobs } = await list({ prefix: STATE_PATH });
  const stateBlob = blobs.find(b => b.pathname === STATE_PATH);
  if (!stateBlob) return { notFound: true };
  const result = await get(stateBlob.url, { access: 'private', useCache: false, ifNoneMatch: knownEtag || undefined });
  if (!result) return { notFound: true };
  const etag = strongEtag(result.blob.etag || stateBlob.etag);
  if (result.statusCode === 304) return { notModified: true, etag };
  const text = await new Response(result.stream).text();
  return { text, etag };
}

// Workspace users by email (cached briefly per server instance)
let memberCache = { at: 0, map: null };
export async function memberMap() {
  if (memberCache.map && Date.now() - memberCache.at < 30_000) return memberCache.map;
  const r = await readState();
  const users = r.text ? (JSON.parse(r.text).users || []) : [];
  const map = new Map(users.filter(u => u.email).map(u => [String(u.email).trim().toLowerCase(), u]));
  memberCache = { at: Date.now(), map };
  return map;
}
export async function memberEmails() { return new Set((await memberMap()).keys()); }
export function forgetMembers() { memberCache = { at: 0, map: null }; }
