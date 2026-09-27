// What a save to /api/save-state may change, decided on the server.
// The posted document replaces the stored one, so the parts that grant power
// (the user list and roles, organisation settings, each project's review workflow and
// who is assigned to it) may only change when an admin saves. Nobody may change their
// own role here.

// Compare two values ignoring key order and the order of records with an id.
function canon(v) {
  if (Array.isArray(v)) {
    const withIds = v.length && v.every(x => x && typeof x === 'object' && x.id != null);
    if (withIds) return canon(Object.fromEntries(v.map(x => [String(x.id), x])));
    return v.map(canon);
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, canon(v[k])]));
  }
  return v;
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const workflows = (state) => {
  const out = {};
  for (const p of state?.projects || []) if (p && p.id != null) out[p.id] = p.workflow ?? null;
  return out;
};
const assigned = (p) => [...new Set(p?.assignedUsers || [])].sort();

/**
 * before: the stored workspace (null when it does not exist yet)
 * next:   the workspace the caller wants to store
 * who:    requireUser() result { user, isAdmin }
 * → null when allowed, else { status, error }
 */
export function checkSave(before, next, who) {
  const adminOnly = { status: 403, error: 'admin_only' };
  // creating the workspace: admins only (on a fresh store the bootstrap owner is the admin)
  if (!before) return who?.isAdmin ? null : adminOnly;

  // nobody changes their own role, or removes their own record, through this endpoint
  const myId = who?.user?.id;
  if (myId != null) {
    const was = (before.users || []).find(u => u && u.id === myId);
    const now = (next.users || []).find(u => u && u.id === myId);
    if (was && (!now || (now.role ?? null) !== (was.role ?? null))) return { status: 403, error: 'own_role' };
  }

  if (who?.isAdmin) return null;
  // avatar colours are cosmetic, and every browser rewrites old palette colours on load
  // (recolorUsers in src/AppContext.jsx): a colour-only difference is not a change
  const noColour = (list) => (list || []).map(u => (u && typeof u === 'object' ? { ...u, color: undefined } : u));
  if (!same(noColour(before.users), noColour(next.users))) return adminOnly;
  if ('org' in next && !same(before.org ?? {}, next.org ?? {})) return adminOnly;
  const wb = workflows(before), wn = workflows(next);
  for (const id of new Set([...Object.keys(wb), ...Object.keys(wn)])) {
    if (!same(wb[id] ?? null, wn[id] ?? null)) return adminOnly;
  }
  // project access decides what an outside consultant sees: existing projects keep their
  // assignments; a project a non-admin creates may list internal users only
  const oldProjects = new Map((before.projects || []).filter(p => p && p.id != null).map(p => [p.id, p]));
  const consultants = new Set((before.users || []).filter(u => u?.role === 'Consultant').map(u => u.id));
  for (const p of next.projects || []) {
    if (!p || p.id == null) continue;
    const old = oldProjects.get(p.id);
    if (old ? !same(assigned(old), assigned(p)) : assigned(p).some(id => consultants.has(id))) return adminOnly;
  }
  return null;
}

// ─── Who uploaded a CRS Excel ──────────────────────────────────────────────
// A sheet row (crsImported, not local) records the user who uploaded the Excel it was read
// from (uploadedBy), and the drawing the last upload (crsUploadedBy). An internal save may
// not claim these for someone else: they are set here from the saving user.
const rowKey = (c) => (c?.id != null ? `id:${c.id}` : (!c?.local && c?.row != null ? `row:${c.row}` : null));
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * before: the stored workspace, next: what an internal user saves, user: the saving user.
 * → next with, on each drawing:
 *  - rows already stored (by id; older sheet rows without an id, by their Excel row): the
 *    stored uploadedBy, whatever the browser sent (none stays none);
 *  - sheet rows new in this save: uploadedBy = the saving user;
 *  - rows added in the CRS panel: no uploadedBy (their author is authorId);
 *  - crsUploadedBy: the saving user, the time of this save and the file name, when this save
 *    brings new sheet rows, or a new Excel named as a new upload; otherwise the stored value.
 */
export function stampCrsUploads(before, next, user, now = new Date().toISOString()) {
  if (!next || !Array.isArray(next.drawings) || user?.id == null) return next;
  const old = new Map((before?.drawings || []).filter(d => d && d.id != null).map(d => [String(d.id), d]));
  const drawings = next.drawings.map(d => {
    if (!d || typeof d !== 'object' || d.id == null) return d;
    const sd = old.get(String(d.id));
    const stored = new Map();
    for (const c of sd?.crsImported || []) { const k = rowKey(c); if (k && !stored.has(k)) stored.set(k, c); }
    let fresh = 0;
    let changed = false;
    const rows = Array.isArray(d.crsImported) ? d.crsImported.map(c => {
      if (!c || typeof c !== 'object') return c;
      const k = rowKey(c);
      const was = k ? stored.get(k) : null;
      let want;
      if (was) want = was.uploadedBy;
      else if (!c.local) { want = user.id; fresh++; }
      if (want === undefined ? !('uploadedBy' in c) : c.uploadedBy === want) return c;
      changed = true;
      const o = { ...c };
      if (want === undefined) delete o.uploadedBy; else o.uploadedBy = want;
      return o;
    }) : d.crsImported;
    const claimed = d.crsUploadedBy;
    // a new Excel with no comment rows: the browser names a new upload along with a new file.
    // A rewrite of the working Excel (sync, issue) changes the file but not crsUploadedBy.
    const newFile = !!d.crsData && d.crsData !== sd?.crsData && !!claimed && typeof claimed === 'object'
      && JSON.stringify(claimed) !== JSON.stringify(sd?.crsUploadedBy ?? null);
    let up = sd?.crsUploadedBy;
    if (fresh || newFile) {
      up = { id: user.id, name: user.name || '', role: user.role || '', at: now,
        fileName: str(claimed?.fileName, 300) || str(d.crsFileName, 300) || null };
    }
    const sameUp = JSON.stringify(up ?? null) === JSON.stringify(claimed ?? null);
    if (!changed && sameUp) return d;
    const out = { ...d, crsImported: rows };
    if (up == null) delete out.crsUploadedBy; else out.crsUploadedBy = up;
    return out;
  });
  return { ...next, drawings };
}
