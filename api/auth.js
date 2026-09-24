import { readCreds, updateCreds, hashPassword, checkPassword, passwordProblem } from './_lib/creds.js';
import { memberMap, forgetMembers } from './_lib/state.js';
import { makeSessionCookie, clearSessionCookie, isSecureRequest, readSession } from './_lib/session.js';

// POST { action: 'login', email, password }
// POST { action: 'logout' }
// POST { action: 'change-password', currentPassword, newPassword }   (signed-in user)
const LEGACY_ADMIN_PASSWORD = 'admin123'; // only works once, before any admin has a password

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
      if (!user) return res.status(401).json({ error: 'Email or password is incorrect.' });
      const { data } = await readCreds({ fresh: true });
      const rec = data.users?.[email];
      if (rec) {
        if (!checkPassword(password, rec)) return res.status(401).json({ error: 'Email or password is incorrect.' });
        res.setHeader('Set-Cookie', makeSessionCookie(email, { secure, pwv: rec.pwv || 0 }));
        return res.status(200).json({ success: true });
      }
      // No password yet. One-time setup for the first admin only.
      const anyAdminHasPassword = [...(await memberMap()).values()].some(u => u.role === 'Admin' && data.users?.[String(u.email).toLowerCase()]);
      if (user.role === 'Admin' && !anyAdminHasPassword && password === LEGACY_ADMIN_PASSWORD) {
        res.setHeader('Set-Cookie', makeSessionCookie(email, { secure, pwv: -1 }));
        return res.status(200).json({ success: true, mustChangePassword: true });
      }
      if (user.role === 'Admin' && !anyAdminHasPassword) return res.status(401).json({ error: 'Email or password is incorrect.' });
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
