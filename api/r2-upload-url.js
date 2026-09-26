import crypto from 'node:crypto';
import { r2Configured, cleanKey, presign, appFileUrl } from './_lib/r2.js';
import { requireUser } from './_lib/auth.js';
import { isExternal } from './_lib/view.js';

/**
 * The key the file is stored under: the requested folder and file name with a fresh
 * numeric prefix chosen here, so an upload never replaces a file that already exists
 * (an issued CRS, another drawing's PDF). /api/file hides the prefix from the file name.
 * Outside consultants upload drawings only.
 */
export function freshKey(pathname, { external = false } = {}) {
  const key = cleanKey(pathname);
  if (external && !key.startsWith('drawings/')) throw Object.assign(new Error('not_allowed'), { status: 403 });
  const cut = key.lastIndexOf('/') + 1;
  const name = key.slice(cut).replace(/^\d{10,}_/, '') || 'file';
  const stamp = `${Date.now()}${String(crypto.randomInt(0, 1e6)).padStart(6, '0')}`;
  return cleanKey(`${key.slice(0, cut)}${stamp}_${name}`);
}

// POST { pathname, contentType } → { uploadUrl, url }
// The browser PUTs the file straight to uploadUrl (so large drawings work),
// then stores `url` (an /api/file link) in the workspace.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const who = await requireUser(req, res);
  if (!who) return;
  try {
    const { pathname, contentType } = req.body || {};
    const key = freshKey(pathname, { external: isExternal(who.user) });
    if (!r2Configured()) return res.status(501).json({ error: 'r2_not_configured' });
    const uploadUrl = await presign('PUT', key, { expires: 900 });
    return res.status(200).json({ uploadUrl, key, url: appFileUrl(key), contentType: contentType || 'application/octet-stream' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
