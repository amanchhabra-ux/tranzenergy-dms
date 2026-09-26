import { readState } from './_lib/state.js';
import { publicOrg } from '../src/utils/org.js';

// GET /api/org → { name, shortName, logoUrl, primaryColor, accentColor }
// Public on purpose: the sign-in page shows the organisation's name and logo
// before anyone is signed in. Only these display fields are returned.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const r = await readState();
    const org = r.text ? (JSON.parse(r.text).org || {}) : {};
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.status(200).json(publicOrg(org));
  } catch (e) {
    console.error('Error reading org settings:', e);
    return res.status(200).json(publicOrg({}));
  }
}
