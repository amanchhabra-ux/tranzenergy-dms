import fs from 'node:fs';
import path from 'node:path';
import { getText, strongEtag } from './r2.js';

// The shared workspace document lives in Cloudflare R2 (moved off Vercel Blob,
// whose free-plan operation limits the 20-second sync used up).
export const STATE_KEY = '_system/db_state_v5.json';
export { strongEtag };

/** Read the workspace document. → { notFound } | { notModified, etag } | { text, etag } */
export async function readState(knownEtag) {
  if (process.env.LOCAL_DATA_DIR) {
    const f = path.join(process.env.LOCAL_DATA_DIR, 'db_state.json');
    return fs.existsSync(f) ? { text: fs.readFileSync(f, 'utf8'), etag: null } : { notFound: true };
  }
  return getText(STATE_KEY, { ifNoneMatch: knownEtag });
}

// Before the workspace exists (fresh store) only the owner can sign in, to set it up.
const BOOTSTRAP_USERS = [
  { id: 'u1', name: 'Aman Chhabra', email: 'aman@tranzenergy.in', role: 'Admin' },
];

// Workspace users by email (cached briefly per server instance)
let memberCache = { at: 0, map: null };
export async function memberMap() {
  if (memberCache.map && Date.now() - memberCache.at < 30_000) return memberCache.map;
  const r = await readState();
  const users = r.notFound ? BOOTSTRAP_USERS : (r.text ? (JSON.parse(r.text).users || []) : []);
  const map = new Map(users.filter(u => u.email).map(u => [String(u.email).trim().toLowerCase(), u]));
  memberCache = { at: Date.now(), map };
  return map;
}
export async function memberEmails() { return new Set((await memberMap()).keys()); }
export function forgetMembers() { memberCache = { at: 0, map: null }; }
