import { list, get } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { blobs } = await list({ prefix: 'db_state_v5.json' });
    const stateBlob = blobs.find(b => b.pathname === 'db_state_v5.json');
    
    if (stateBlob) {
      const blob = await get(stateBlob.url, { access: 'private', useCache: false });
      const text = await blob.blob.text();
      const state = JSON.parse(text);
      return res.status(200).json(state);
    }
    
    return res.status(200).json({ notFound: true });
  } catch (error) {
    console.error('Error getting state:', error);
    return res.status(500).json({ error: error.message });
  }
}
