import { upload } from '@vercel/blob/client';

// Is this a link to a stored file (Vercel Blob URL or an R2 /api/file link)?
export const isStoredFile = (u) => typeof u === 'string' && (/^https?:\/\//.test(u) || u.startsWith('/api/file?'));

// Uploads a file and returns { url }.
// - Local dev (`npm run dev`): kept in .local-data/ by the dev server.
// - Live site: goes straight from the browser to Cloudflare R2 (any size);
//   falls back to Vercel Blob if R2 isn't configured.
export async function uploadFile(pathname, file) {
  if (import.meta.env.DEV) {
    const res = await fetch(`/api/local-upload?path=${encodeURIComponent(pathname)}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) throw new Error(`Local upload failed (${res.status})`);
    const { url } = await res.json();
    return { url: `${window.location.origin}${url}` };
  }

  const sign = await fetch('/api/r2-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, contentType: file.type }),
  });
  if (sign.status === 501) {
    // R2 not set up yet
    return upload(pathname, file, { access: 'public', handleUploadUrl: '/api/upload' });
  }
  if (!sign.ok) throw new Error(`Could not start upload (${sign.status})`);
  const { uploadUrl, url } = await sign.json();
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload to storage failed (${put.status})`);
  return { url };
}

// Upload a CRS Excel file for a drawing and return its URL.
export async function uploadCrsFile(drawingCode, file) {
  const code = String(drawingCode || 'UNKNOWN').toUpperCase().replace(/[^\w.-]+/g, '_');
  const name = (file.name || 'CRS.xlsx').replace(/[^\w.\-() ]+/g, '_');
  const res = await uploadFile(`crs/${code}/${Date.now()}_${name}`, file);
  return res.url;
}
