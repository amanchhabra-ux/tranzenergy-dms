// Small immutable JSON objects under _system/ (the activity log), in R2 or, in local mode
// (LOCAL_DATA_DIR), as files in folders that mirror the keys. Objects are only ever
// created, never replaced or deleted, so what has been read once can be cached for good.
import fs from 'node:fs';
import path from 'node:path';
import { getText, putText, listKeys as r2ListKeys, PreconditionFailed } from './r2.js';

const local = () => !!process.env.LOCAL_DATA_DIR;
const localPath = (key) => path.join(process.env.LOCAL_DATA_DIR, 'objects', ...key.split('/'));

// Texts already read, by key (immutable objects, so never stale)
const CACHE_MAX = 20000;
const cache = new Map();
const remember = (key, text) => {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, text);
};
export function forgetObjects() { cache.clear(); }

/** Create the object only if the key is free. → 'created' | 'exists' */
export async function createObject(key, text) {
  if (local()) {
    const f = localPath(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { fs.writeFileSync(f, text, { flag: 'wx' }); } catch (e) {
      if (e.code === 'EEXIST') return 'exists';
      throw e;
    }
    remember(key, text);
    return 'created';
  }
  try {
    await putText(key, text, { create: true });
  } catch (e) {
    if (e instanceof PreconditionFailed) return 'exists';
    throw e;
  }
  remember(key, text);
  return 'created';
}

/** The object's text, or null when it does not exist. */
export async function readObjectText(key) {
  if (cache.has(key)) return cache.get(key);
  let text = null;
  if (local()) {
    const f = localPath(key);
    text = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  } else {
    const r = await getText(key);
    text = r.notFound ? null : r.text;
  }
  if (text != null) remember(key, text);
  return text;
}

/**
 * Keys under a folder prefix (ending in '/'), ascending, after `startAfter` (a full key).
 * Only the objects directly in that folder. → { keys, truncated }
 */
export async function listKeys(prefix, { startAfter, limit = 1000 } = {}) {
  if (!local()) return r2ListKeys(prefix, { startAfter, limit });
  const dir = localPath(prefix.replace(/\/$/, ''));
  if (!fs.existsSync(dir)) return { keys: [], truncated: false };
  const all = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => prefix + e.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .filter(k => !startAfter || k > startAfter);
  return { keys: all.slice(0, limit), truncated: all.length > limit };
}

/** Run fn over items, at most `n` at a time; results in order. */
export async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
