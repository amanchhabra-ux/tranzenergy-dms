import { requireUser } from './_lib/auth.js';
import { readCreds, updateCreds, hashPassword, passwordProblem } from './_lib/creds.js';

// Admin only.
// GET                                   → { hasPassword: { "<email>": "<updatedAt>" } }
// POST { email, password }              → set / reset a user's password (signs them out elsewhere)
// POST { email, remove: true }          → remove a user's password (user can no longer sign in)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const who = await requireUser(req, res, { admin: true });
  if (!who) return;
  try {
    if (req.method === 'GET') {
      const { data } = await readCreds();
      const hasPassword = Object.fromEntries(Object.entries(data.users || {}).map(([e, r]) => [e, r.updatedAt || true]));
      return res.status(200).json({ hasPassword });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
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
