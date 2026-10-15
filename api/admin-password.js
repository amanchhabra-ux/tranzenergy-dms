import { requireUser } from './_lib/auth.js';
import { readCreds, updateCreds, hashPassword, passwordProblem } from './_lib/creds.js';
import { memberMap } from './_lib/state.js';
import { isAdminRole } from '../src/utils/roles.js';

// Admin only. An Admin's or Super User's password is set or removed by a Super User only
// (while there is no Super User, Admins act as one).
// GET                                   → { hasPassword: { "<email>": "<updatedAt>" } }
// POST { email, password }              → set / reset a user's password (signs them out elsewhere)
// POST { email, remove: true }          → remove a user's password (user can no longer sign in)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const who = await requireUser(req, res, { admin: true });
  if (!who) return;
  try {
    if (req.method === 'GET') {
      const { data } = await readCreds({ fresh: true });
      const hasPassword = Object.fromEntries(Object.entries(data.users || {}).map(([e, r]) => [e, r.updatedAt || true]));
      return res.status(200).json({ hasPassword });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const target = (await memberMap()).get(email);
    if (isAdminRole(target?.role) && !who.isSuper && email !== who.email) return res.status(403).json({ error: 'super_only' });
    if (req.body?.remove) {
      await updateCreds(d => { if (d.users) delete d.users[email]; return d; });
      return res.status(200).json({ success: true });
    }
    const problem = passwordProblem(req.body?.password);
    if (problem) return res.status(400).json({ error: problem });
    await updateCreds(d => {
      d.users = d.users || {};
      const pwv = ((d.users[email]?.pwv) || 0) + 1;
      d.users[email] = { ...hashPassword(req.body.password), pwv, updatedAt: new Date().toISOString(), setBy: who.email };
      return d;
    });
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('admin-password error', e);
    return res.status(500).json({ error: e.message });
  }
}
