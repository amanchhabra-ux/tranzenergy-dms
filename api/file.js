import { r2Configured, cleanKey, presign } from './_lib/r2.js';
import { requireUser } from './_lib/auth.js';
import { readState } from './_lib/state.js';
import { isExternal, externalView, filesInView } from './_lib/view.js';

// GET /api/file?key=drawings/…/file.pdf[&download=1]
// Redirects to a short-lived signed link for the file in the private R2 bucket.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  const who = await requireUser(req, res);
  if (!who) return;
  if (!r2Configured()) return res.status(501).json({ error: 'r2_not_configured' });
  try {
    const key = cleanKey(req.query?.key);
    if (isExternal(who.user)) {
      // outside consultants: only files on their own projects' drawings
      const r = await readState();
      const files = r.text ? filesInView(externalView(JSON.parse(r.text), who.user)) : new Set();
      if (![...files].some(u => String(u).startsWith('/api/file?') && new URL(u, 'http://x').searchParams.get('key') === key)) {
        return res.status(403).json({ error: 'not_allowed' });
      }
    }
    const name = key.split('/').pop().replace(/^\d{10,}_/, '').replace(/"/g, '');
    const disposition = `${req.query?.download ? 'attachment' : 'inline'}; filename="${name}"`;
    const url = await presign('GET', key, { expires: 3600, query: { 'response-content-disposition': disposition } });
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.writeHead(302, { Location: url });
    return res.end();
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
