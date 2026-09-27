import fs from 'node:fs';
import path from 'node:path';
import { putText, PreconditionFailed, strongEtag } from './_lib/r2.js';
import { requireUser } from './_lib/auth.js';
import { forgetMembers, readState, localEtag, STATE_KEY } from './_lib/state.js';
import { isExternal, mergeExternal, allowedProjectIds } from './_lib/view.js';
import { keepLegacy, extractFromSave, writeExtracted } from './_lib/log.js';
import { checkSave, stampCrsUploads } from './_lib/authz.js';
import { reviewEvents, sendReviewEmails } from './_lib/notify.js';

// Body: { state, etag } — etag is the version the client last loaded
// (null only when creating the database for the first time).
// If someone else saved in between, responds 409 so the client can merge and retry.
// Outside consultants send their partial view; only the changes they may make are applied.
// The activity log is not stored here (api/_lib/log.js): a browser posts its entries to
// /api/log and /api/activity. A tab still running the previous version of the app sends them
// inside the state; those are written as log objects and left out of the document.
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
      // who uploaded a CRS Excel is the saving user, never what the browser claims
      next = stampCrsUploads(before, state, who.user);
    }
    // the document keeps only the entries it already held (none once migrated)
    next = keepLegacy(before, next);
    const allowed = isExternal(who.user) ? allowedProjectIds(before, who.user) : null;
    const known = new Map((next.drawings || []).filter(d => d && d.id != null).map(d => [String(d.id), d]));
    const extracted = extractFromSave(before, state, who.user, {
      external: isExternal(who.user),
      allowedDrawing: (id) => known.has(id) && (!allowed || allowed.has(known.get(id).projectId)),
    });
    // a browser still running an older version of the app does not send the organisation
    // settings; keep the saved ones rather than wiping them
    if (before?.org && !('org' in next)) next = { ...next, org: before.org };

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
    if (extracted.log.length || extracted.activity.length) {
      // an older tab re-sends these until it reloads; ids already stored are left as they are
      try { await writeExtracted(extracted); } catch (e) { console.error('[log] entries from an older tab not stored', e); }
    }
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
