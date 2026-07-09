import React, { createContext, useState, useEffect, useCallback } from 'react';

export const AppContext = createContext(null);

// ─── Seed Data ────────────────────────────────────────────────────────────────
const SEED_USERS = [
  { id: 'u1', name: 'Aman Chhabra',   email: 'aman@tranzenergy.in',   role: 'Admin',           avatar: 'AC', color: '#6366f1' },
  { id: 'u2', name: 'Priya Mehta',    email: 'priya@tranzenergy.in',  role: 'Project Manager',  avatar: 'PM', color: '#06b6d4' },
  { id: 'u3', name: 'Arun Verma',     email: 'arun@tranzenergy.in',   role: 'Senior Engineer',  avatar: 'AV', color: '#10b981' },
  { id: 'u4', name: 'Sunita Rao',     email: 'sunita@tranzenergy.in', role: 'Engineer',         avatar: 'SR', color: '#f59e0b' },
  { id: 'u5', name: 'Vikram Nair',    email: 'vikram@tranzenergy.in', role: 'Engineer',         avatar: 'VN', color: '#8b5cf6' },
  { id: 'u6', name: 'Deepa Singh',    email: 'deepa@tranzenergy.in',  role: 'Engineer',         avatar: 'DS', color: '#ec4899' },
  { id: 'u7', name: 'Manoj Kumar',    email: 'manoj@tranzenergy.in',  role: 'Engineer',         avatar: 'MK', color: '#14b8a6' },
  { id: 'u8', name: 'Kavitha P.',     email: 'kavitha@tranzenergy.in',role: 'Engineer',         avatar: 'KP', color: '#f97316' },
  { id: 'u9', name: 'Suresh B.',      email: 'suresh@tranzenergy.in', role: 'Senior Engineer',  avatar: 'SB', color: '#0ea5e9' },
  { id: 'u10',name: 'Ritu Agarwal',   email: 'ritu@tranzenergy.in',   role: 'Viewer',           avatar: 'RA', color: '#a78bfa' },
];

const SEED_PROJECTS = [
  {
    id: 'p1',
    code: 'BGTPS-TL-2024',
    name: 'BGTPS 400kV Transmission Line',
    client: 'NTPC Limited',
    clientContact: 'Er. A. Krishnamurthy',
    type: 'transmission',
    location: 'Jharkhand, India',
    startDate: '2024-03-01',
    status: 'active',
    description: '400kV double circuit transmission line, 82km, with 4 substations and river crossings.',
    assignedUsers: ['u1', 'u2', 'u3'],
  },
  {
    id: 'p2',
    code: 'RJSOL-50MW-2024',
    name: 'Rajasthan 50MW Solar Plant',
    client: 'ReNew Power Pvt. Ltd.',
    clientContact: 'Ms. Sheela Verma',
    type: 'solar',
    location: 'Jodhpur, Rajasthan',
    startDate: '2024-06-15',
    status: 'active',
    description: '50MW DC, 40MW AC ground-mounted solar PV plant with 33kV interconnection.',
    assignedUsers: ['u1', 'u2'],
  },
  {
    id: 'p3',
    code: 'PBBESS-20MW-2024',
    name: 'Punjab BESS 20MW/80MWh',
    client: 'Adani Green Energy',
    clientContact: 'Mr. Rohit Jain',
    type: 'bess',
    location: 'Ludhiana, Punjab',
    startDate: '2024-09-01',
    status: 'active',
    description: 'Battery Energy Storage System, 20MW / 80MWh, grid-scale with BMS & EMS.',
    assignedUsers: ['u1', 'u3'],
  },
  {
    id: 'p4',
    code: 'GUWIND-100MW-2025',
    name: 'Gujarat 100MW Wind Farm',
    client: 'Suzlon Energy Ltd.',
    clientContact: 'Er. Kiran Patel',
    type: 'wind',
    location: 'Kutch, Gujarat',
    startDate: '2025-01-10',
    status: 'active',
    description: '100MW onshore wind farm with 25 turbines, 33kV collector network and substation.',
    assignedUsers: ['u1'],
  },
];

const SEED_DRAWINGS = [
  // ── BGTPS-TL-2024
  {
    id: 'dwg-1', code: 'BGTPS-TL-E-SLD-001', title: 'Single Line Diagram — 400kV Substation A',
    discipline: 'Electrical', subType: 'SLD',
    projectId: 'p1', status: 'AFC', currentVersion: 'R2',
    description: 'SLD for the 400kV Substation A with bus-bar arrangement, transformer and protection.',
    versions: [
      { version: 'R2', date: '2024-08-10 14:20', author: 'Arun Verma', changeSummary: 'Bus-coupler added per client review comment #12.', pdfData: null },
      { version: 'R1', date: '2024-07-22 10:05', author: 'Arun Verma', changeSummary: 'Protection relay coordination updated. CT ratios revised.', pdfData: null },
      { version: 'R0', date: '2024-06-15 09:00', author: 'Sunita Rao', changeSummary: 'Initial issue for client review.', pdfData: null },
    ],
    pins: [
      { id: 'pin-1', x: 35, y: 40, page: 1, label: 1, resolved: true,
        comments: [
          { id: 'c1', author: 'Arun Verma', text: 'CT ratio on 400kV side to be confirmed with NTPC.', date: '2024-06-20 11:00', type: 'internal' },
          { id: 'c2', author: 'Raj Sharma', text: 'Confirmed 2000/1A as per NTPC standard.', date: '2024-06-21 09:30', type: 'internal' },
        ]
      },
    ]
  },
  {
    id: 'dwg-2', code: 'BGTPS-TL-C-LAY-001', title: 'Tower Foundation Layout — Type 1A',
    discipline: 'Civil', subType: 'Foundation',
    projectId: 'p1', status: 'IFA', currentVersion: 'R1',
    description: 'Foundation layout and reinforcement details for suspension tower Type 1A.',
    versions: [
      { version: 'R1', date: '2024-08-05 16:00', author: 'Vikram Nair', changeSummary: 'Reinforcement bars updated per soil report revision.', pdfData: null },
      { version: 'R0', date: '2024-07-01 11:30', author: 'Vikram Nair', changeSummary: 'Initial issue.', pdfData: null },
    ],
    pins: []
  },
  {
    id: 'dwg-3', code: 'BGTPS-TL-S-SCADA-001', title: 'SCADA Architecture Diagram',
    discipline: 'SCADA & Telecom', subType: 'Architecture',
    projectId: 'p1', status: 'IFA', currentVersion: 'R0',
    description: 'Overall SCADA system architecture for remote monitoring and control.',
    versions: [
      { version: 'R0', date: '2024-09-01 09:00', author: 'Manoj Kumar', changeSummary: 'Initial issue for internal review.', pdfData: null },
    ],
    pins: []
  },
  // ── RJSOL-50MW-2024
  {
    id: 'dwg-4', code: 'RJSOL-E-SLD-001', title: 'Solar Plant Single Line Diagram — 33kV',
    discipline: 'Electrical', subType: 'SLD',
    projectId: 'p2', status: 'AFC', currentVersion: 'R1',
    description: 'Main SLD for 50MW solar plant including inverter stations and 33kV grid connection.',
    versions: [
      { version: 'R1', date: '2024-09-12 10:00', author: 'Sunita Rao', changeSummary: 'PV string configuration revised from 24 to 28 strings.', pdfData: null },
      { version: 'R0', date: '2024-08-01 08:30', author: 'Sunita Rao', changeSummary: 'Initial issue.', pdfData: null },
    ],
    pins: []
  },
  {
    id: 'dwg-5', code: 'RJSOL-C-LAY-001', title: 'Site Layout — Module & Inverter Arrangement',
    discipline: 'Civil', subType: 'Layout',
    projectId: 'p2', status: 'IFA', currentVersion: 'R0',
    description: 'Detailed site layout showing PV module rows, inverter stations, and cable trenches.',
    versions: [
      { version: 'R0', date: '2024-08-20 14:00', author: 'Deepa Singh', changeSummary: 'Initial issue for client approval.', pdfData: null },
    ],
    pins: []
  },
  // ── PBBESS-20MW-2024
  {
    id: 'dwg-6', code: 'PBBESS-E-SLD-001', title: 'BESS Single Line Diagram — 20MW Grid Tie',
    discipline: 'Electrical', subType: 'SLD',
    projectId: 'p3', status: 'IFA', currentVersion: 'R0',
    description: 'SLD for 20MW BESS grid tie with PCS, transformer and protection relay schematic.',
    versions: [
      { version: 'R0', date: '2024-10-05 09:00', author: 'Arun Verma', changeSummary: 'Initial issue for review.', pdfData: null },
    ],
    pins: []
  },
  // ── GUWIND-100MW-2025
  {
    id: 'dwg-7', code: 'GUWIND-E-SLD-001', title: 'Wind Farm Collector Network SLD',
    discipline: 'Electrical', subType: 'SLD',
    projectId: 'p4', status: 'IFA', currentVersion: 'R0',
    description: '33kV collector network SLD for 25 turbines in 5 feeders.',
    versions: [
      { version: 'R0', date: '2025-01-20 10:00', author: 'Suresh B.', changeSummary: 'Initial issue.', pdfData: null },
    ],
    pins: []
  },
];

const DISCIPLINES = ['Electrical', 'Civil', 'Mechanical', 'SCADA & Telecom', 'Protection & Control', 'Structural'];
const PROJECT_TYPES = ['transmission', 'solar', 'bess', 'wind'];
const STATUSES = ['IFA', 'AFC', 'Superseded'];
const ROLES = ['Admin', 'Project Manager', 'Senior Engineer', 'Engineer', 'Viewer'];
const SEED_PROPOSALS = [];

const STORAGE_KEY = 'tranzenergy_v2';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveState(data) {
  try {
    // Strip pdfData before persisting to avoid quota errors
    const stripped = {
      ...data,
      drawings: data.drawings.map(d => ({
        ...d,
        versions: d.versions.map(v => ({ ...v, pdfData: null })),
        pdfData: null
      })),
      proposals: (data.proposals || []).map(p => ({ ...p, fileData: null }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

export function AppProvider({ children }) {
  const saved = loadState();

  const [currentUser, setCurrentUser] = useState(saved?.currentUser || null);
  const [users,       setUsers]       = useState(saved?.users       || SEED_USERS);
  const [projects,    setProjects]    = useState(saved?.projects    || SEED_PROJECTS);
  const [drawings,    setDrawings]    = useState(saved?.drawings    || SEED_DRAWINGS);
  const [proposals,   setProposals]   = useState(saved?.proposals   || SEED_PROPOSALS);
  const [activityLog, setActivityLog] = useState(saved?.activityLog || []);

  // Persist on change
  useEffect(() => {
    if (!currentUser) return;
    saveState({ currentUser, users, projects, drawings, proposals, activityLog });
  }, [currentUser, users, projects, drawings, proposals, activityLog]);

  // ─── Activity Log ──────────────────────────────────────────────────────────
  const addLog = useCallback((message, authorName) => {
    setActivityLog(prev => [{
      id: `log-${Date.now()}`,
      message,
      author: authorName || currentUser?.name || 'System',
      time: new Date().toISOString()
    }, ...prev].slice(0, 200));
  }, [currentUser]);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  const login = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user) { setCurrentUser(user); addLog(`${user.name} signed in.`); }
  };

  const logout = () => {
    const name = currentUser?.name;
    setCurrentUser(null);
    addLog(`${name} signed out.`);
  };

  // ─── Permissions ───────────────────────────────────────────────────────────
  const canDo = useCallback((action) => {
    // action: 'admin' | 'manage_projects' | 'upload' | 'approve' | 'view'
    if (!currentUser) return false;
    const r = currentUser.role;
    if (r === 'Admin') return true;
    if (action === 'admin') return false;
    if (action === 'manage_projects') return r === 'Project Manager';
    if (action === 'upload') return ['Project Manager','Senior Engineer','Engineer'].includes(r);
    if (action === 'approve') return ['Project Manager','Senior Engineer'].includes(r);
    if (action === 'view') return true;
    return false;
  }, [currentUser]);

  // ─── Projects ──────────────────────────────────────────────────────────────
  const createProject = (data) => {
    const assignedUsers = Array.from(new Set(['u1', currentUser?.id].filter(Boolean)));
    const p = { id: `p-${Date.now()}`, startDate: new Date().toISOString().split('T')[0], status: 'active', assignedUsers, ...data };
    setProjects(prev => [...prev, p]);
    addLog(`Project <strong>${p.code}</strong> created.`);
  };

  const updateProject = (id, updates) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProject = (id) => {
    const p = projects.find(x => x.id === id);
    setProjects(prev => prev.filter(x => x.id !== id));
    setDrawings(prev => prev.filter(d => d.projectId !== id));
    addLog(`Project and its drawings deleted.`);
  };

  const assignUsersToProject = (projectId, userIds) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, assignedUsers: userIds } : p));
    addLog(`Updated user assignments for project.`);
  };

  // ─── Drawings CRUD ─────────────────────────────────────────────────────────
  const getDrawingsByProject = useCallback((projectId) => {
    return drawings.filter(d => d.projectId === projectId);
  }, [drawings]);

  const createDrawing = (data) => {
    const existing = drawings.find(
      d => d.code.toUpperCase() === (data.code || '').toUpperCase().trim() && d.projectId === data.projectId
    );

    if (existing) {
      // Append revision instead
      return uploadRevision(existing.id, data.changeSummary || 'Revision uploaded', data.pdfData || null);
    }

    const startVer = data.initialVersion || 'R0';
    const dwg = {
      id: `dwg-${Date.now()}`,
      code: (data.code || '').toUpperCase().trim(),
      title: data.title || 'Untitled Drawing',
      description: data.description || '',
      discipline: data.discipline || 'Electrical',
      subType: data.subType || '',
      projectId: data.projectId,
      status: data.status || 'IFA',
      currentVersion: startVer,
      pdfData: data.pdfData || null,
      crsData: null,
      clientName: data.clientName || '',
      consultant: data.consultant || '',
      contractor: data.contractor || '',
      versions: [{
        version: startVer,
        date: new Date().toISOString().replace('T',' ').substring(0,16),
        author: currentUser?.name || 'System',
        changeSummary: data.changeSummary || 'Initial issue.',
        pdfData: data.pdfData || null,
      }],
      pins: []
    };
    setDrawings(prev => [dwg, ...prev]);
    addLog(`Drawing <strong>${dwg.code}</strong> registered by <strong>${currentUser?.name}</strong>.`);
    return dwg;
  };

  const updateDrawing = (id, updates) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const deleteDrawing = (id) => {
    const dwg = drawings.find(d => d.id === id);
    setDrawings(prev => prev.filter(d => d.id !== id));
    if (dwg) addLog(`Drawing <strong>${dwg.code}</strong> deleted.`);
  };

  const uploadCRS = (drawingId, crsData) => {
    setDrawings(prev => prev.map(d => d.id === drawingId ? { ...d, crsData } : d));
    addLog(`Uploaded Comment Resolution Sheet for drawing.`);
  };

  // ─── Revision Upload ───────────────────────────────────────────────────────
  const uploadRevision = useCallback((drawingId, changeSummary, pdfDataUrl, newStatus) => {
    const authorName = currentUser?.name || 'System';
    let nextVer = '';
    let logMsg = '';

    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      const cur = dwg.currentVersion || 'R0';
      if (cur.match(/^R\d+$/)) {
        nextVer = `R${parseInt(cur.substring(1)) + 1}`;
      } else {
        nextVer = `R${parseInt(cur.replace(/\D/g,'') || '0') + 1}`;
      }
      const rev = {
        version: nextVer,
        date: new Date().toISOString().replace('T',' ').substring(0,16),
        author: authorName,
        changeSummary: changeSummary || `Revision ${nextVer} uploaded.`,
        pdfData: pdfDataUrl || null
      };
      logMsg = `<strong>${authorName}</strong> uploaded <strong>${nextVer}</strong> of <strong>${dwg.code}</strong>.`;
      return {
        ...dwg,
        currentVersion: nextVer,
        status: newStatus || dwg.status,
        pdfData: pdfDataUrl || dwg.pdfData,
        versions: [rev, ...(dwg.versions || [])]
      };
    }));

    if (logMsg) addLog(logMsg);
    return nextVer;
  }, [currentUser, addLog]);

  // ─── Drawing Status ────────────────────────────────────────────────────────
  const setDrawingStatus = (id, status) => {
    const dwg = drawings.find(d => d.id === id);
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    if (dwg) addLog(`Drawing <strong>${dwg.code}</strong> status changed to <strong>${status}</strong>.`);
  };

  // ─── Comment Pins ──────────────────────────────────────────────────────────
  const addPin = useCallback((drawingId, x, y, page) => {
    let newPinId = null;
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      const label = (dwg.pins?.length || 0) + 1;
      const pin = { id: `pin-${Date.now()}`, x, y, page: page || 1, label, resolved: false, comments: [] };
      newPinId = pin.id;
      return { ...dwg, pins: [...(dwg.pins || []), pin] };
    }));
    return newPinId;
  }, []);

  const addComment = useCallback((drawingId, pinId, text, type = 'internal') => {
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      return {
        ...dwg,
        pins: (dwg.pins || []).map(pin => {
          if (pin.id !== pinId) return pin;
          const comment = {
            id: `c-${Date.now()}`,
            author: currentUser?.name || 'Unknown',
            text,
            date: new Date().toISOString().replace('T',' ').substring(0,16),
            type
          };
          return { ...pin, comments: [...pin.comments, comment] };
        })
      };
    }));
  }, [currentUser]);

  const resolvePin = useCallback((drawingId, pinId) => {
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      return { ...dwg, pins: dwg.pins.map(p => p.id === pinId ? { ...p, resolved: !p.resolved } : p) };
    }));
  }, []);

  const acceptPin = useCallback((drawingId, pinId) => {
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      return { ...dwg, pins: dwg.pins.map(p => p.id === pinId ? { ...p, accepted: !p.accepted, resolved: true } : p) };
    }));
  }, []);

  // ─── Users ─────────────────────────────────────────────────────────────────
  const createUser = (data) => {
    const u = { id: `u-${Date.now()}`, avatar: data.name.slice(0,2).toUpperCase(), color: '#6366f1', ...data };
    setUsers(prev => [...prev, u]);
    addLog(`User <strong>${u.name}</strong> added.`);
    return u;
  };

  const updateUser = (id, updates) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    if (id === currentUser?.id) setCurrentUser(prev => ({ ...prev, ...updates }));
  };

  const deleteUser = (id) => {
    const u = users.find(x => x.id === id);
    setUsers(prev => prev.filter(x => x.id !== id));
    if (u) addLog(`User <strong>${u.name}</strong> removed.`);
  };

  // ─── Proposals ─────────────────────────────────────────────────────────────
  const uploadProposal = (data) => {
    const p = { id: `prop-${Date.now()}`, uploadDate: new Date().toISOString(), ...data };
    setProposals(prev => [...prev, p]);
    addLog(`Proposal <strong>${p.title}</strong> uploaded.`);
    return p;
  };

  const updateProposalComments = (id, followUpComments) => {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, followUpComments } : p));
  };

  const deleteProposal = (id) => {
    const p = proposals.find(x => x.id === id);
    setProposals(prev => prev.filter(x => x.id !== id));
    if (p) addLog(`Proposal <strong>${p.title}</strong> deleted.`);
  };

  return (
    <AppContext.Provider value={{
      // State
      currentUser, users, projects, drawings, proposals, activityLog,
      // Consts
      DISCIPLINES, PROJECT_TYPES, STATUSES, ROLES,
      // Auth
      login, logout,
      // Permissions
      canDo,
      // Projects
      createProject, updateProject, deleteProject, assignUsersToProject,
      // Drawings
      getDrawingsByProject, createDrawing, updateDrawing, deleteDrawing,
      uploadRevision, setDrawingStatus, uploadCRS,
      // Comments
      addPin, addComment, resolvePin, acceptPin,
      // Users
      createUser, updateUser, deleteUser,
      // Proposals
      uploadProposal, updateProposalComments, deleteProposal,
      // Log
      addLog,
    }}>
      {children}
    </AppContext.Provider>
  );
}
