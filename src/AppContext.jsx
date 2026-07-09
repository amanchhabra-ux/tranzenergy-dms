import React, { createContext, useState, useEffect, useCallback } from 'react';

export const AppContext = createContext(null);

// ─── Seed Data ────────────────────────────────────────────────────────────────
const SEED_USERS = [
  { id: 'u1', name: 'Aman Chhabra',   email: 'aman@tranzenergy.in',   role: 'Admin',           avatar: 'AC', color: '#6366f1' },
];

const SEED_PROJECTS = [];
const SEED_DRAWINGS = [];

const DISCIPLINES = ['Electrical', 'Civil', 'Mechanical', 'SCADA & Telecom', 'Protection & Control', 'Structural'];
const PROJECT_TYPES = ['transmission', 'solar', 'bess', 'wind'];
const STATUSES = ['IFA', 'AFC', 'Superseded'];
const ROLES = ['Admin', 'Project Manager', 'Senior Engineer', 'Engineer', 'Viewer'];
const SEED_PROPOSALS = [];

const STORAGE_KEY = 'tranzenergy_v4';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function deleteBlobUrl(url) {
  if (!url || !url.startsWith('http')) return;
  try {
    await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
  } catch (e) {
    console.error('Failed to delete blob:', url, e);
  }
}

function saveState(data) {
  try {
    // We now store Vercel Blob URLs instead of base64, so we don't need to strip them.
    // To support old data gracefully, we strip non-http blob data to prevent quota errors.
    const stripped = {
      ...data,
      drawings: data.drawings.map(d => ({
        ...d,
        versions: d.versions.map(v => ({ ...v, pdfData: v.pdfData?.startsWith('http') ? v.pdfData : null })),
        pdfData: d.pdfData?.startsWith('http') ? d.pdfData : null
      })),
      proposals: (data.proposals || []).map(p => ({ ...p, fileData: p.fileData?.startsWith('http') ? p.fileData : null }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

export function AppProvider({ children }) {
  const saved = loadState();

  // Patch existing localStorage so the user name updates for returning users
  if (saved && saved.users) {
    const adminUser = saved.users.find(u => u.id === 'u1');
    if (adminUser && adminUser.name === 'Raj Sharma') {
      adminUser.name = 'Aman Chhabra';
      adminUser.email = 'aman@tranzenergy.in';
      adminUser.avatar = 'AC';
    }
  }
  if (saved && saved.currentUser && saved.currentUser.id === 'u1' && saved.currentUser.name === 'Raj Sharma') {
    saved.currentUser.name = 'Aman Chhabra';
    saved.currentUser.email = 'aman@tranzenergy.in';
    saved.currentUser.avatar = 'AC';
  }

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
    if (dwg) {
      if (dwg.pdfData) deleteBlobUrl(dwg.pdfData);
      (dwg.versions || []).forEach(v => {
        if (v.pdfData) deleteBlobUrl(v.pdfData);
      });
      addLog(`Drawing <strong>${dwg.code}</strong> deleted.`);
    }
    setDrawings(prev => prev.filter(d => d.id !== id));
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
    if (p) {
      if (p.fileData) deleteBlobUrl(p.fileData);
      addLog(`Proposal <strong>${p.title}</strong> deleted.`);
    }
    setProposals(prev => prev.filter(x => x.id !== id));
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
