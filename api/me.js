import { requireUser, authEnabled } from './_lib/auth.js';
import { memberEmails } from './_lib/state.js';

// Who am I, and am I allowed in?  → { authEnabled, email, name, isAdminEmail, isMember }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authEnabled()) return res.status(200).json({ authEnabled: false });
  const who = await requireUser(req, res, { members: false });
  if (!who) return;
  const isMember = (await memberEmails()).has(who.email);
  return res.status(200).json({ authEnabled: true, email: who.email, name: who.name, isAdminEmail: who.isAdminEmail, isMember });
}
