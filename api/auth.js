import crypto from 'node:crypto';
import { readCreds, updateCreds, hashPassword, checkPassword, passwordProblem } from './_lib/creds.js';
import { memberMap, forgetMembers } from './_lib/state.js';
import { makeSessionCookie, clearSessionCookie, isSecureRequest, readSession } from './_lib/session.js';
import { adminEmails } from './_lib/auth.js';

// POST { action: 'login', email, password }
// POST { action: 'logout' }
// POST { action: 'change-password', currentPassword, newPassword }   (signed-in user)
//
// First admin password (bootstrap). There is no built-in password. Only while no admin has
// a password yet, an admin (by role, or listed in ADMIN_EMAILS) signs in once and must then
// choose their password:
//  - ADMIN_BOOTSTRAP_TOKEN set: with that token as the password;
//  - not set: only an email in ADMIN_EMAILS, only while no workspace user has a password at
//    all (a brand-new deployment), with any password, which they replace at once.
// Once any admin has a password, none of this applies and sign-in is by password only.
const same = (a, b) => {
  const h = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

/** May this sign-in start the first-admin setup? (no stored password for `email`) */
export function bootstrapAllowed({ email, password, user, members, creds, env = process.env }) {
  const admins = adminEmails();
  const isAdmin = (u, e) => u?.role === 'Admin' || admins.has(e);
  if (!isAdmin(user, email)) return false;
  const has = (e) => !!creds.users?.[String(e).toLowerCase()];
  const adminHasPassword = [...members.entries()].some(([e, u]) => isAdmin(u, e) && has(e)) || [...admins].some(has);
  if (adminHasPassword) return false;
  const token = String(env.ADMIN_BOOTSTRAP_TOKEN || '');
  if (token) return password.length > 0 && same(password, token);
  const anyUserHasPassword = [...members.keys()].some(has);
  return admins.has(email) && !anyUserHasPassword && password.length > 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const secure = isSecureRequest(req);
  const body = req.body || {};

  try {
    if (body.action === 'logout') {
      res.setHeader('Set-Cookie', clearSessionCookie({ secure }));
      return res.status(200).json({ success: true });
    }

    if (body.action === 'login') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      await new Promise(r => setTimeout(r, 300)); // slow down guessing
      let user = (await memberMap()).get(email);
      if (!user) { forgetMembers(); user = (await memberMap()).get(email); } // just added?
      if (!user && !adminEmails().has(email)) return res.status(401).json({ error: 'Email or password is incorrect.' });
      const { data } = await readCreds({ fresh: true });
      const rec = data.users?.[email];
      if (rec) {
        if (!checkPassword(password, rec)) return res.status(401).json({ error: 'Email or password is incorrect.' });
        res.setHeader('Set-Cookie', makeSessionCookie(email, { secure, pwv: rec.pwv || 0 }));
        return res.status(200).json({ success: true });
      }
      // No password yet: the first admin's one-time setup (see bootstrapAllowed above)
      if (bootstrapAllowed({ email, password, user, members: await memberMap(), creds: data })) {
        res.setHeader('Set-Cookie', makeSessionCookie(email, { secure, pwv: -1 }));
        return res.status(200).json({ success: true, mustChangePassword: true });
      }
      if (user?.role === 'Admin' || adminEmails().has(email)) return res.status(401).json({ error: 'Email or password is incorrect.' });
      return res.status(401).json({ error: 'No password has been set for this account yet. Ask your administrator.' });
    }

    if (body.action === 'change-password') {
      const s = readSession(req);
      if (!s) return res.status(401).json({ error: 'Please sign in again.' });
      const email = s.email;
      const problem = passwordProblem(body.newPassword);
      if (problem) return res.status(400).json({ error: problem });
      const { data } = await readCreds({ fresh: true });
      const rec = data.users?.[email];
      // a first-admin setup session sets the first password once; after that it is spent
      if (s.pwv === -1 && rec) return res.status(401).json({ error: 'Please sign in again.' });
      if (s.pwv !== -1) {
        if (!rec || (rec.pwv || 0) !== (s.pwv || 0)) return res.status(401).json({ error: 'Please sign in again.' });
        if (!checkPassword(body.currentPassword, rec)) return res.status(400).json({ error: 'Your current password is not correct.' });
      }
      const saved = await updateCreds(d => {
        d.users = d.users || {};
        const pwv = ((d.users[email]?.pwv) || 0) + 1;
        d.users[email] = { ...hashPassword(body.newPassword), pwv, updatedAt: new Date().toISOString(), setBy: 'self' };
        return d;
      });
      res.setHeader('Set-Cookie', makeSessionCookie(email, { secure, pwv: saved.users[email].pwv }));
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('auth error', e);
    return res.status(500).json({ error: e.message });
  }
}
