import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const state = req.body;
    const blob = await put('db_state_v5.json', JSON.stringify(state, null, 2), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });

    return res.status(200).json({ success: true, url: blob.url });
  } catch (error) {
    console.error('Error saving state:', error);
    return res.status(500).json({ error: error.message });
  }
}
