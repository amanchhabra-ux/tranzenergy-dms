// ─── Organisation settings (name, logo, colours) ────────────────────────────
// Stored in the workspace as `state.org`, edited in Admin → Organisation.
// Nothing about the company is hard-coded: a new install shows the neutral
// defaults below until an admin fills them in.

export const DEFAULT_ORG = {
  name: 'Document Management System',
  shortName: 'DMS',
  logoUrl: '',        // data: URL (≤ LOGO_MAX_BYTES) or any image link; empty = show the name
  address: '',
  primaryColor: '',   // '#rrggbb'; empty = the neutral default palette in index.css
  accentColor: '',
  emailFromName: '',  // display name on notification emails
  appUrl: '',         // link in notification emails (APP_URL in Vercel wins)
};

export const LOGO_MAX_BYTES = 200 * 1024;

// The fields the sign-in page may see before anyone is signed in (served by /api/org)
export const PUBLIC_ORG_FIELDS = ['name', 'shortName', 'logoUrl', 'primaryColor', 'accentColor'];
export const publicOrg = (org) => Object.fromEntries(PUBLIC_ORG_FIELDS.map(k => [k, org?.[k] || '']));

/** Org settings with the defaults filled in. */
export function orgOf(org) {
  const out = { ...DEFAULT_ORG };
  for (const [k, v] of Object.entries(org || {})) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  return out;
}

/** A name safe to use at the start of a downloaded file name. */
export const fileSlug = (org) => String(orgOf(org).shortName || 'DMS').replace(/[^\w.-]+/g, '_');

// ─── Colours ────────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('')}`;
/** Mix a colour with white (t > 0) or black (t < 0) by |t|. */
const shade = (hex, t) => toHex(rgb(hex).map(x => (t >= 0 ? x + (255 - x) * t : x * (1 + t))));

/** Colour variables derived from the org colours (only the ones that are set). */
export function themeVars(org) {
  const o = orgOf(org);
  const vars = {};
  if (HEX.test(o.primaryColor)) {
    const p = o.primaryColor;
    Object.assign(vars, {
      '--primary': p,
      '--primary-dark': shade(p, -0.22),
      '--primary-light': shade(p, -0.22),
      '--primary-glow': shade(p, 0.9),
      '--primary-border': shade(p, 0.72),
      '--primary-tint': shade(p, 0.95),
      '--border-active': shade(p, 0.55),
    });
  }
  if (HEX.test(o.accentColor)) Object.assign(vars, { '--accent': o.accentColor, '--accent-glow': shade(o.accentColor, 0.93) });
  return vars;
}

const THEME_KEYS = ['--primary', '--primary-dark', '--primary-light', '--primary-glow', '--primary-border', '--primary-tint', '--border-active', '--accent', '--accent-glow'];

/** Apply the org's colours, page title and icon to the document. */
export function applyOrgTheme(org) {
  if (typeof document === 'undefined') return;
  const o = orgOf(org);
  const vars = themeVars(o);
  const style = document.documentElement.style;
  THEME_KEYS.forEach(k => (vars[k] ? style.setProperty(k, vars[k]) : style.removeProperty(k)));
  document.title = o.name;
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = o.logoUrl || '/favicon.svg';
}

// ─── Before sign-in ─────────────────────────────────────────────────────────
// The sign-in page has no workspace yet: it reads the public org fields from
// /api/org and keeps a copy in this browser so the next visit paints at once.
const CACHE_KEY = 'dms_org';

export function readCachedOrg() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { return {}; }
}
export function cacheOrg(org) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(publicOrg(org))); } catch { /* storage full or blocked */ }
}
