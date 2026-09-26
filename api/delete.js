import { del } from '@vercel/blob';
import { r2Configured, cleanKey, deleteObject } from './_lib/r2.js';
import { requireUser } from './_lib/auth.js';
import { isExternal } from './_lib/view.js';

// POST { url } — deletes a stored file (R2 link or Vercel Blob URL)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const who = await requireUser(req, res);
  if (!who) return;
  if (isExternal(who.user)) return res.status(403).json({ error: 'not_allowed' }); // outside consultants never delete or move stored files

  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });

    if (String(url).startsWith('/api/file?')) {
      if (!r2Configured()) return res.status(501).json({ error: 'r2_not_configured' });
      const key = cleanKey(new URL(url, 'http://x').searchParams.get('key'));
      await deleteObject(key);
      return res.status(200).json({ success: true });
    }

    await del(url);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete Error:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
}
