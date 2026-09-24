import { r2Configured, cleanKey, presign } from './_lib/r2.js';
import { requireUser } from './_lib/auth.js';

// GET /api/file?key=drawings/…/file.pdf[&download=1]
// Redirects to a short-lived signed link for the file in the private R2 bucket.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
  if (!(await requireUser(req, res))) return;
  if (!r2Configured()) return res.status(501).json({ error: 'r2_not_configured' });
  try {
    const key = cleanKey(req.query?.key);
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
