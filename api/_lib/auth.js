import { createClerkClient } from '@clerk/backend';
import { memberMap } from './state.js';
import { readSession } from './session.js';
import { readCreds } from './creds.js';

// Two sign-in modes:
//  - Clerk (Google / Microsoft / email code) when CLERK_SECRET_KEY is set — currently on hold
//  - Otherwise: email + password accounts created by the admin (default)
export const clerkEnabled = () => !!process.env.CLERK_SECRET_KEY;
export const authEnabled = () => true;

export const adminEmails = () =>
  new Set(String(process.env.ADMIN_EMAILS || '').split(/[,\s;]+/).map(e => e.trim().toLowerCase()).filter(Boolean));

// ── Clerk (on hold) ──────────────────────────────────────────────────────
let clerk;
const clerkClient = () => (clerk ||= createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY,
}));
const emailCache = new Map();
function toFetchRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  return new Request(`${proto}://${host}${req.url}`, { method: 'GET', headers });
}
async function clerkUser(req) {
  const state = await clerkClient().authenticateRequest(toFetchRequest(req));
  if (!state.isSignedIn) return null;
  const { userId } = state.toAuth();
  const hit = emailCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
  const u = await clerkClient().users.getUser(userId);
  const primary = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId) || u.emailAddresses[0];
  const info = { email: String(primary?.emailAddress || '').toLowerCase(), name: [u.firstName, u.lastName].filter(Boolean).join(' '), at: Date.now() };
  emailCache.set(userId, info);
  return info;
}

// ── Password sessions ───────────────────────────────────────────────────
async function sessionUser(req) {
  const s = readSession(req);
  if (!s) return null;
  // a password change/reset signs out older sessions
  const bad = (rec) => (rec && (rec.pwv || 0) !== (s.pwv || 0)) || (!rec && !s.bootstrap && s.pwv !== -1);
  let rec = (await readCreds()).data.users?.[s.email];
  if (bad(rec)) rec = (await readCreds({ fresh: true })).data.users?.[s.email]; // cache may be a few seconds old
  if (bad(rec)) return null;
  return { email: s.email, mustChangePassword: s.pwv === -1 };
}

/** Who is signed in? → { email, name?, mustChangePassword? } or null */
export async function signedInUser(req) {
  return clerkEnabled() ? clerkUser(req) : sessionUser(req);
}

/**
 * Guard for API routes. Returns { email, user, role, isAdmin } or sends 401/403 and returns null.
 *  members: false → only needs to be signed in (used by /api/me)
 *  admin: true    → must be an Admin
 */
export async function requireUser(req, res, { members = true, admin = false } = {}) {
  let who;
  try { who = await signedInUser(req); } catch (e) { console.error('auth error', e); who = null; }
  if (!who || !who.email) { res.status(401).json({ error: 'signed_out' }); return null; }
  const map = await memberMap();
  const user = map.get(who.email) || null;
  const isAdmin = user?.role === 'Admin' || adminEmails().has(who.email);
  if (members && !user && !isAdmin) { res.status(403).json({ error: 'no_access', email: who.email }); return null; }
  if (who.mustChangePassword && members) { res.status(403).json({ error: 'must_change_password' }); return null; }
  if (admin && !isAdmin) { res.status(403).json({ error: 'admin_only' }); return null; }
  return { ...who, user, role: user?.role || (isAdmin ? 'Admin' : null), isAdmin };
}
