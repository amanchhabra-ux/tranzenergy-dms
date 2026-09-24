import { put, BlobPreconditionFailedError } from '@vercel/blob';
import { requireUser } from './_lib/auth.js';
import { forgetMembers } from './_lib/state.js';

const PATH = 'db_state_v5.json';

// Body: { state, etag } — etag is the version the client last loaded
// (null only when creating the database for the first time).
// If someone else saved in between, responds 409 so the client can merge and retry.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  if (!(await requireUser(req, res))) return;

  const body = req.body || {};
  // Old versions of the app posted the bare state without a version and would
  // overwrite everyone's changes; refuse those so a stale tab can't clobber data.
  if (!body || typeof body !== 'object' || !('state' in body)) {
    return res.status(426).json({ error: 'outdated_client', message: 'Please refresh the page to get the latest version of the app.' });
  }
  const { state, etag } = body;

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
    forgetMembers();
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
