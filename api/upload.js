import { handleUpload } from '@vercel/blob/client';
import { requireUser } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // the upload-completed callback comes from Vercel itself, not a signed-in browser
  const isCallback = req.body?.type === 'blob.upload-completed';
  if (!isCallback && !(await requireUser(req, res))) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: [
            'application/pdf',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel.sheet.macroEnabled.12',
            'application/octet-stream',
            'image/png', 'image/jpeg', 'image/webp',
          ],
          addRandomSuffix: false,
          allowOverwrite: true,
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('Uploaded:', blob.url);
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(400).json({ error: error.message });
  }
}
