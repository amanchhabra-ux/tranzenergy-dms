import { r2Configured, cleanKey, putObject, appFileUrl } from './_lib/r2.js';
import { requireUser } from './_lib/auth.js';
import { isExternal } from './_lib/view.js';

// POST { sourceUrl, pathname } → { url }
// Copies an existing file from Vercel Blob storage into R2 (used by "Move files to R2").
// Only Vercel Blob URLs are accepted as a source.
const BLOB_HOST = /^https:\/\/[a-z0-9]+\.(public|private)\.blob\.vercel-storage\.com\//i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const who = await requireUser(req, res);
  if (!who) return;
  if (isExternal(who.user)) return res.status(403).json({ error: 'not_allowed' }); // outside consultants never delete or move stored files
  if (!r2Configured()) return res.status(501).json({ error: 'r2_not_configured' });
  try {
    const { sourceUrl, pathname } = req.body || {};
    if (!BLOB_HOST.test(String(sourceUrl || ''))) return res.status(400).json({ error: 'Only Vercel Blob files can be copied' });
    const key = cleanKey(pathname);
    const src = await fetch(sourceUrl);
    if (!src.ok) return res.status(502).json({ error: `Could not read the original file (${src.status})` });
    const buf = new Uint8Array(await src.arrayBuffer());
    await putObject(key, buf, src.headers.get('content-type') || 'application/octet-stream');
    return res.status(200).json({ url: appFileUrl(key), bytes: buf.length });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
