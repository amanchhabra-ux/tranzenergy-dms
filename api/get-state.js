import { list, get } from '@vercel/blob';

const PATH = 'db_state_v5.json';

// Returns the shared workspace state.
// Response header `x-state-etag` identifies this version; pass it back as
// ?etag=… to get a cheap 304 when nothing changed, and to save-state to avoid
// overwriting someone else's newer changes.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { blobs } = await list({ prefix: PATH });
    const stateBlob = blobs.find(b => b.pathname === PATH);
    if (!stateBlob) return res.status(200).json({ notFound: true });

    if (req.query?.debug === 'etag') {
      const g = await get(stateBlob.url, { access: 'private', useCache: false });
      if (g?.stream) await g.stream.cancel();
      return res.status(200).json({ listEtag: stateBlob.etag, getEtag: g?.blob?.etag, header: g?.headers?.get('etag') });
    }
    const known = typeof req.query?.etag === 'string' ? req.query.etag : undefined;
    const result = await get(stateBlob.url, { access: 'private', useCache: false, ifNoneMatch: known });
    if (!result) return res.status(200).json({ notFound: true });

    res.setHeader('x-state-etag', result.blob.etag || '');
    if (result.statusCode === 304) return res.status(304).end();

    // get() returns the body as a stream
    const text = await new Response(result.stream).text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(text);
  } catch (error) {
    console.error('Error getting state:', error);
    return res.status(500).json({ error: error.message });
  }
}
