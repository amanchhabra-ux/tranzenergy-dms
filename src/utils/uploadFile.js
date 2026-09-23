import { upload } from '@vercel/blob/client';

// Uploads a file and returns its URL.
// On Vercel it goes to Vercel Blob. When running locally (`npm run dev`) it goes
// to the dev server, which keeps it in .local-data/ — so local testing never
// touches the live storage.
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
  return upload(pathname, file, { access: 'public', handleUploadUrl: '/api/upload' });
}
