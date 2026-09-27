import { useEffect, useState } from 'react';
import { orgOf, readCachedOrg, cacheOrg, applyOrgTheme } from './org.js';

let publicFetch = null;
/** Org settings for pages shown before sign-in (sign-in, splash, access denied). */
export function usePublicOrg() {
  const [org, setOrg] = useState(() => orgOf(readCachedOrg()));
  useEffect(() => {
    let live = true;
    publicFetch = publicFetch || fetch('/api/org', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    publicFetch.then(o => {
      if (!live || !o) return;
      cacheOrg(o);
      setOrg(orgOf(o));
      applyOrgTheme(o);
    });
    return () => { live = false; };
  }, []);
  return org;
}
