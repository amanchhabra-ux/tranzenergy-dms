import { r2Configured, cleanKey, presign, appFileUrl } from './_lib/r2.js';

// POST { pathname, contentType } → { uploadUrl, url }
// The browser PUTs the file straight to uploadUrl (so large drawings work),
// then stores `url` (an /api/file link) in the workspace.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!r2Configured()) return res.status(501).json({ error: 'r2_not_configured' });
  try {
    const { pathname, contentType } = req.body || {};
    const key = cleanKey(pathname);
    const uploadUrl = await presign('PUT', key, { expires: 900 });
    return res.status(200).json({ uploadUrl, key, url: appFileUrl(key), contentType: contentType || 'application/octet-stream' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
