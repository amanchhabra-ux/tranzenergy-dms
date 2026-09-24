import { createClerkClient } from '@clerk/backend';
import { memberEmails } from './state.js';

// Sign-in checks for the API.
// Turned on when CLERK_SECRET_KEY is set in Vercel. Until then every request is allowed
// (the previous behaviour), so the site keeps working while sign-in is being set up.
export const authEnabled = () => !!process.env.CLERK_SECRET_KEY;

// Emails that are always allowed in as Admin (so the first admin can get in before anyone is added)
export const adminEmails = () =>
  new Set(String(process.env.ADMIN_EMAILS || '').split(/[,\s;]+/).map(e => e.trim().toLowerCase()).filter(Boolean));

let clerk;
const client = () => (clerk ||= createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
  publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY,
}));

const emailCache = new Map(); // userId → { email, name, at }

function toFetchRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  return new Request(`${proto}://${host}${req.url}`, { method: 'GET', headers });
}

/** Who is making this request? → { email, name } or null */
export async function signedInUser(req) {
  const state = await client().authenticateRequest(toFetchRequest(req), {
    authorizedParties: undefined,
  });
  if (!state.isSignedIn) return null;
  const { userId } = state.toAuth();
  const hit = emailCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
  const u = await client().users.getUser(userId);
  const primary = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId) || u.emailAddresses[0];
  const info = {
    email: String(primary?.emailAddress || '').toLowerCase(),
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || primary?.emailAddress || 'User',
    at: Date.now(),
  };
  emailCache.set(userId, info);
  return info;
}

/**
 * Guard for API routes. Returns the caller ({ email, name, isAdminEmail }) or sends 401/403 and returns null.
 * `members: false` skips the "must be an added user" check (used by /api/me).
 */
export async function requireUser(req, res, { members = true } = {}) {
  if (!authEnabled()) return { email: null, legacy: true };
  let who;
  try { who = await signedInUser(req); } catch (e) { console.error('auth error', e); who = null; }
  if (!who || !who.email) { res.status(401).json({ error: 'signed_out' }); return null; }
  const isAdminEmail = adminEmails().has(who.email);
  if (members && !isAdminEmail) {
    const emails = await memberEmails();
    if (!emails.has(who.email)) { res.status(403).json({ error: 'no_access', email: who.email }); return null; }
  }
  return { ...who, isAdminEmail };
}
