import { readState } from './_lib/state.js';
import { requireUser } from './_lib/auth.js';
import { isExternal, externalView } from './_lib/view.js';
import { stripDoc } from './_lib/log.js';
import logRoutes from './_lib/logApi.js';

// Returns the shared workspace state.
// Response header `x-state-etag` identifies this version; pass it back as
// ?etag=… to get a cheap 304 when nothing changed, and to save-state to avoid
// overwriting someone else's newer changes.
// Outside consultants get only their projects, without TranzEnergy's internal comments.
// The activity log is not part of it: the browser reads /api/log and /api/activity, which
// vercel.json routes to this function with ?route= (see api/_lib/logApi.js).
export default async function handler(req, res) {
  const route = req.query?.route;
  if (route) return logRoutes(req, res, String(route));
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const who = await requireUser(req, res);
  if (!who) return;

  try {
    const known = typeof req.query?.etag === 'string' ? req.query.etag.replace(/^W\//, '') : undefined;
    const r = await readState(known);
    if (r.notFound) return res.status(200).json({ notFound: true });
    res.setHeader('x-state-etag', r.etag || '');
    if (r.notModified) return res.status(304).end();
    res.setHeader('Content-Type', 'application/json');
    // entries still inside the document (before the migration) are served by /api/log
    const doc = stripDoc(JSON.parse(r.text)).doc;
    return res.status(200).send(JSON.stringify(isExternal(who.user) ? externalView(doc, who.user) : doc));
  } catch (error) {
    console.error('Error getting state:', error);
    return res.status(500).json({ error: error.message });
  }
}
