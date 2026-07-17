import fs from 'fs';
import { put } from '@vercel/blob';

const envContent = fs.readFileSync('.env.local', 'utf8');
const tokenMatch = envContent.match(/BLOB_READ_WRITE_TOKEN="([^"]+)"/);
const token = tokenMatch ? tokenMatch[1] : null;

if (!token) {
  console.error("Token not found");
  process.exit(1);
}

const cleanState = {
  currentUser: null,
  users: [
    { id: 'u1', name: 'Aman Chhabra',    email: 'aman@tranzenergy.in',      role: 'Admin',           avatar: 'AC', color: '#6366f1' },
    { id: 'u2', name: 'Project Manager', email: 'pm@tranzenergy.in',         role: 'Project Manager', avatar: 'PM', color: '#06b6d4' },
    { id: 'u3', name: 'Sr. Engineer',    email: 'sr.eng@tranzenergy.in',     role: 'Senior Engineer', avatar: 'SE', color: '#10b981' },
    { id: 'u4', name: 'Engineer',        email: 'eng@tranzenergy.in',        role: 'Engineer',        avatar: 'EN', color: '#f59e0b' },
    { id: 'u5', name: 'Viewer',          email: 'viewer@tranzenergy.in',     role: 'Viewer',          avatar: 'VW', color: '#94a3b8' },
  ],
  projects: [],
  drawings: [],
  proposals: [],
  activityLog: [],
  disciplines: ['Electrical', 'Civil', 'Mechanical', 'SCADA & Telecom', 'Protection & Control', 'Structural']
};

async function run() {
  try {
    const blob = await put('db_state_v5.json', JSON.stringify(cleanState, null, 2), {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
      token
    });
    console.log("✓ Reset complete! Database initialized on private store:", blob.url);
  } catch (err) {
    console.error("Reset failed:", err);
  }
}

run();
