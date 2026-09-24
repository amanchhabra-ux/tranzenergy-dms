import { signedInUser, clerkEnabled } from './_lib/auth.js';
import { memberMap } from './_lib/state.js';

// → { mode, signedIn, email, mustChangePassword, isMember, role }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const mode = clerkEnabled() ? 'clerk' : 'password';
  let who = null;
  try { who = await signedInUser(req); } catch (e) { console.error(e); }
  if (!who?.email) return res.status(200).json({ mode, signedIn: false, authEnabled: mode === 'clerk' });
  const user = (await memberMap()).get(who.email);
  return res.status(200).json({
    mode, authEnabled: true, signedIn: true, email: who.email, name: who.name || user?.name,
    mustChangePassword: !!who.mustChangePassword, isMember: !!user, role: user?.role || null,
    isAdminEmail: user?.role === 'Admin',
  });
}
