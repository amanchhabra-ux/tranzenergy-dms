// Three-way merge of workspace state, so two people editing at the same time
// don't overwrite each other.
//   base   = the version this browser last loaded from the cloud
//   local  = this browser's current state (base + its own edits)
//   remote = the latest version in the cloud (base + other people's edits)
// For each record (by id): if this browser changed it, keep the local version;
// otherwise take the remote one. Records deleted here stay deleted.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mergeById(base = [], local = [], remote = [], deep) {
  const B = new Map(base.map(x => [x.id, x]));
  const L = new Map(local.map(x => [x.id, x]));
  const R = new Map(remote.map(x => [x.id, x]));
  const out = new Map(remote.map(x => [x.id, x]));
  for (const [id, item] of L) {
    const b = B.get(id);
    if (!b || !same(b, item)) {
      // edited here; if it was also edited there, merge the two when we know how
      const r = R.get(id);
      out.set(id, deep && b && r && !same(b, r) ? deep(b, item, r) : item);
    }
  }
  for (const id of B.keys()) {
    if (!L.has(id)) out.delete(id); // deleted here
  }
  // keep remote order, then anything new from here
  const order = [...remote.map(x => x.id), ...local.map(x => x.id)];
  const seen = new Set();
  return order.filter(id => out.has(id) && !seen.has(id) && seen.add(id)).map(id => out.get(id));
}

function mergeLog(local = [], remote = []) {
  const m = new Map();
  [...remote, ...local].forEach(l => m.set(l.id, l));
  return [...m.values()].sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 200);
}

function mergeList(base = [], local = [], remote = []) {
  const removed = new Set(base.filter(x => !local.includes(x)));
  const out = remote.filter(x => !removed.has(x));
  local.forEach(x => { if (!out.includes(x)) out.push(x); });
  return out;
}

// Two people changed the same drawing: keep both sets of changes.
// Top-level fields: ours if we changed them, else theirs. Pins and their comments,
// CRS items and the review history are merged record by record.
function mergeDrawing(b, l, r) {
  const out = { ...r };
  for (const k of new Set([...Object.keys(l), ...Object.keys(b)])) {
    if (['pins', 'crsImported', 'review', 'activity'].includes(k)) continue;
    if (!same(b[k], l[k])) out[k] = l[k];
  }
  out.pins = mergeById(b.pins || [], l.pins || [], r.pins || [], (bp, lp, rp) => {
    const merged = { ...rp };
    for (const k of Object.keys(lp)) if (k !== 'comments' && !same(bp[k], lp[k])) merged[k] = lp[k];
    merged.comments = mergeById(bp.comments || [], lp.comments || [], rp.comments || []);
    return merged;
  });
  out.crsImported = mergeById((b.crsImported || []).filter(x => x.id), (l.crsImported || []).filter(x => x.id), (r.crsImported || []).filter(x => x.id));
  // rows without ids (read from an Excel) follow whoever changed them
  const noId = (x) => (x.crsImported || []).filter(c => !c.id);
  out.crsImported = [...(same(noId(b), noId(l)) ? noId(r) : noId(l)), ...out.crsImported];
  // activity trail: everyone's entries, in time order
  if (!same(b.activity, l.activity) || !same(b.activity, r.activity)) {
    const all = new Map();
    [...(r.activity || []), ...(l.activity || [])].forEach(e => e?.id && all.set(e.id, e));
    out.activity = [...all.values()].sort((x, y) => String(x.at).localeCompare(String(y.at))).slice(-150);
  }
  if (!same(b.review, l.review)) {
    if (!r.review || same(b.review, r.review)) out.review = l.review;
    else {
      // both moved the review on: keep the one that went further, with both histories
      const hist = mergeById([], [...(l.review.history || [])], [...(r.review.history || [])])
        .sort((x, y) => String(x.at).localeCompare(String(y.at)));
      const lastAt = (rv) => String((rv.history || []).slice(-1)[0]?.at || '');
      const winner = lastAt(l.review) >= lastAt(r.review) ? l.review : r.review;
      out.review = { ...winner, history: hist };
    }
  }
  return out;
}

export function mergeState(base, local, remote) {
  if (!base) return remote; // nothing to compare against — trust the cloud
  return {
    users: mergeById(base.users, local.users, remote.users),
    projects: mergeById(base.projects, local.projects, remote.projects),
    drawings: mergeById(base.drawings, local.drawings, remote.drawings, mergeDrawing),
    proposals: mergeById(base.proposals, local.proposals, remote.proposals),
    activityLog: mergeLog(local.activityLog, remote.activityLog),
    disciplines: mergeList(base.disciplines, local.disciplines, remote.disciplines),
  };
}

export const stateEquals = same;
