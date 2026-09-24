import crypto from 'node:crypto';

// Signed sign-in cookie: base64url(payload).signature  (HMAC-SHA256)
const COOKIE = 'dms_session';
const MAX_AGE = 14 * 24 * 3600; // 14 days

function secret() {
  const s = process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || process.env.R2_SECRET_ACCESS_KEY || process.env.LOCAL_SESSION_SECRET;
  if (!s) throw new Error('No session secret configured');
  return crypto.createHash('sha256').update('dms-session:' + s).digest();
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function makeSessionCookie(email, { secure = true, pwv = 0 } = {}) {
  const payload = b64u(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + MAX_AGE, v: pwv }));
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie({ secure = true } = {}) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** → { email, pwv } or null */
export function readSession(req) {
  const raw = String(req.headers?.cookie || '');
  const m = raw.split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!m) return null;
  const token = m.slice(COOKIE.length + 1);
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!p.e || p.x < Date.now() / 1000) return null;
    return { email: String(p.e).toLowerCase(), pwv: p.v || 0 };
  } catch { return null; }
}

export const isSecureRequest = (req) => (req.headers?.['x-forwarded-proto'] || '').includes('https') || !String(req.headers?.host || '').startsWith('localhost');
