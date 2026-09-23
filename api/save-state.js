import { put, BlobPreconditionFailedError } from '@vercel/blob';

const PATH = 'db_state_v5.json';

// Body: { state, etag } — etag is the version the client last loaded.
// If someone else saved in between, responds 409 so the client can merge and retry.
// (A bare state object is still accepted for older clients.)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const body = req.body || {};
  const isWrapped = body && typeof body === 'object' && 'state' in body;
  const state = isWrapped ? body.state : body;
  const etag = isWrapped ? body.etag : undefined;

  if (!state || typeof state !== 'object' || !Array.isArray(state.users)) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  try {
    const opts = {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    };
    if (etag) opts.ifMatch = String(etag).replace(/^W\//, '');
    const blob = await put(PATH, JSON.stringify(state), opts);
    res.setHeader('x-state-etag', blob.etag || '');
    return res.status(200).json({ success: true, etag: blob.etag || null });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || error?.name === 'BlobPreconditionFailedError') {
      return res.status(409).json({ error: 'conflict', message: 'The workspace was changed by someone else.' });
    }
    console.error('Error saving state:', error);
    return res.status(500).json({ error: error.message });
  }
}
