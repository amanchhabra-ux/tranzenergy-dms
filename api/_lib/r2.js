import { AwsClient } from 'aws4fetch';

// Cloudflare R2 (S3-compatible) helper.
// Needs these environment variables (set them in Vercel → Settings → Environment Variables):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
export function r2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
}

let client;
function r2() {
  if (!client) {
    client = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });
  }
  return client;
}

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
export const objectUrl = (key) =>
  `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${encodeKey(key)}`;

// Only these folders may be written/read through the app
const ALLOWED = /^(drawings|crs|proposals)\/[^\0]{1,400}$/;
export function cleanKey(key) {
  const k = String(key || '').replace(/^\/+/, '').replace(/\.\.+/g, '.').replace(/[\\]/g, '/');
  if (!ALLOWED.test(k)) throw Object.assign(new Error('Invalid file path'), { status: 400 });
  return k;
}

// The link stored in the app for an R2 file (works on any domain the app runs on)
export const appFileUrl = (key) => `/api/file?key=${encodeURIComponent(key)}`;

export async function presign(method, key, { expires = 900, query = {} } = {}) {
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(expires));
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const signed = await r2().sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

export async function putObject(key, body, contentType) {
  const res = await r2().fetch(objectUrl(key), {
    method: 'PUT', body, headers: { 'Content-Type': contentType || 'application/octet-stream' },
  });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function deleteObject(key) {
  const res = await r2().fetch(objectUrl(key), { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
}
