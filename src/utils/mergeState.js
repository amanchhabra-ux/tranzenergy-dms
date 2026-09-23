// Three-way merge of workspace state, so two people editing at the same time
// don't overwrite each other.
//   base   = the version this browser last loaded from the cloud
//   local  = this browser's current state (base + its own edits)
//   remote = the latest version in the cloud (base + other people's edits)
// For each record (by id): if this browser changed it, keep the local version;
// otherwise take the remote one. Records deleted here stay deleted.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mergeById(base = [], local = [], remote = []) {
  const B = new Map(base.map(x => [x.id, x]));
  const L = new Map(local.map(x => [x.id, x]));
  const out = new Map(remote.map(x => [x.id, x]));
  for (const [id, item] of L) {
    const b = B.get(id);
    if (!b || !same(b, item)) out.set(id, item); // added or edited here
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

export function mergeState(base, local, remote) {
  if (!base) return remote; // nothing to compare against — trust the cloud
  return {
    users: mergeById(base.users, local.users, remote.users),
    projects: mergeById(base.projects, local.projects, remote.projects),
    drawings: mergeById(base.drawings, local.drawings, remote.drawings),
    proposals: mergeById(base.proposals, local.proposals, remote.proposals),
    activityLog: mergeLog(local.activityLog, remote.activityLog),
    disciplines: mergeList(base.disciplines, local.disciplines, remote.disciplines),
  };
}

export const stateEquals = same;
