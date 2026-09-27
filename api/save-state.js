import fs from 'node:fs';
import path from 'node:path';
import { putText, PreconditionFailed, strongEtag } from './_lib/r2.js';
import { requireUser } from './_lib/auth.js';
import { forgetMembers, readState, localEtag, STATE_KEY } from './_lib/state.js';
import { isExternal, mergeExternal } from './_lib/view.js';
import { checkSave } from './_lib/authz.js';
import { reviewEvents, sendReviewEmails } from './_lib/notify.js';

// Body: { state, etag } — etag is the version the client last loaded
// (null only when creating the database for the first time).
// If someone else saved in between, responds 409 so the client can merge and retry.
// Outside consultants send their partial view; only the changes they may make are applied.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const who = await requireUser(req, res);
  if (!who) return;

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
    const local = !!process.env.LOCAL_DATA_DIR;
    const cur = await readState();
    const before = cur.text ? JSON.parse(cur.text) : null;
    let next = state;
    if (etag && cur.etag && strongEtag(etag) !== cur.etag) {
      return res.status(409).json({ error: 'conflict', message: 'The workspace was changed by someone else.' });
    }
    if (isExternal(who.user)) {
      if (!before) return res.status(403).json({ error: 'not_allowed' });
      if (!local && strongEtag(etag) !== cur.etag) {
        return res.status(409).json({ error: 'conflict', message: 'The workspace was changed by someone else.' });
      }
      next = mergeExternal(before, state, who.user);
    } else {
      // internal roles: users, org and review workflow change only when an admin saves
      const refused = checkSave(before, state, who);
      if (refused) return res.status(refused.status).json({ error: refused.error });
    }

    let newEtag = null;
    if (local) {
      fs.mkdirSync(process.env.LOCAL_DATA_DIR, { recursive: true });
      const text = JSON.stringify(next);
      fs.writeFileSync(path.join(process.env.LOCAL_DATA_DIR, 'db_state.json'), text);
      newEtag = localEtag(text);
    } else {
      // etag given → only if nobody saved since; no etag → only when creating the workspace
      const match = isExternal(who.user) ? cur.etag : etag;
      newEtag = await putText(STATE_KEY, JSON.stringify(next), match ? { ifMatch: match } : { create: true });
    }
    forgetMembers();
    try { await sendReviewEmails(next, reviewEvents(before, next)); } catch (e) { console.error('[notify]', e); }
    res.setHeader('x-state-etag', newEtag || '');
    return res.status(200).json({ success: true, etag: newEtag });
  } catch (error) {
    if (error instanceof PreconditionFailed) {
      return res.status(409).json({ error: 'conflict', message: 'The workspace was changed by someone else.' });
    }
    console.error('Error saving state:', error);
    return res.status(500).json({ error: error.message });
  }
}
