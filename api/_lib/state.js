import { list, get } from '@vercel/blob';

export const STATE_PATH = 'db_state_v5.json';
// Reads return a weak ETag (W/"…"); conditional writes need the plain form
export const strongEtag = (e) => (e ? String(e).replace(/^W\//, '') : '');

/** Read the workspace document. → { notFound } | { notModified, etag } | { text, etag } */
export async function readState(knownEtag) {
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

// Emails of everyone added as a user in the workspace (cached briefly per server instance)
let memberCache = { at: 0, emails: null };
export async function memberEmails() {
  if (memberCache.emails && Date.now() - memberCache.at < 60_000) return memberCache.emails;
  const r = await readState();
  const users = r.text ? (JSON.parse(r.text).users || []) : [];
  const emails = new Set(users.map(u => String(u.email || '').trim().toLowerCase()).filter(Boolean));
  memberCache = { at: Date.now(), emails };
  return emails;
}
export function forgetMembers() { memberCache = { at: 0, emails: null }; }
