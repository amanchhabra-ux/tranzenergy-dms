import { put } from '@vercel/blob';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const filename = req.query.filename || 'upload.pdf';
    
    // Using `req` directly as a stream works with the Vercel API bodyParser disabled
    const blob = await put(filename, req, {
      access: 'public',
    });

    return res.status(200).json(blob);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Failed to upload file to Blob storage' });
  }
}
