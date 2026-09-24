import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { mergeState, stateEquals } from './utils/mergeState';
import { crsFieldUpdates, pinRowMapFromImport, syncCrsExcel } from './utils/crs';
import { uploadCrsFile, isStoredFile } from './utils/uploadFile';

export const AppContext = createContext(null);

// ─── Seed Data ────────────────────────────────────────────────────────────────
const SEED_USERS = [
  { id: 'u1', name: 'Aman Chhabra',    email: 'aman@tranzenergy.in',      role: 'Admin',           avatar: 'AC', color: '#ea580c' },
  { id: 'u2', name: 'Project Manager', email: 'pm@tranzenergy.in',         role: 'Project Manager', avatar: 'PM', color: '#27272a' },
  { id: 'u3', name: 'Sr. Engineer',    email: 'sr.eng@tranzenergy.in',     role: 'Senior Engineer', avatar: 'SE', color: '#15803d' },
  { id: 'u4', name: 'Engineer',        email: 'eng@tranzenergy.in',        role: 'Engineer',        avatar: 'EN', color: '#d97706' },
  { id: 'u5', name: 'Viewer',          email: 'viewer@tranzenergy.in',     role: 'Viewer',          avatar: 'VW', color: '#a1a1aa' },
];

const SEED_PROJECTS = [];
const SEED_DRAWINGS = [];

const DEFAULT_DISCIPLINES = ['Electrical', 'Civil', 'Mechanical', 'SCADA & Telecom', 'Protection & Control', 'Structural', 'Other'];
// Always keep an "Other" bucket for drawings that don't fit a discipline
const withOther = (list) => (list && list.length ? (list.includes('Other') ? list : [...list, 'Other']) : DEFAULT_DISCIPLINES);
// Mark a drawing's CRS as changed so the Excel gets rewritten.
// `force` also creates an Excel when the drawing has none yet (changes made in the CRS panel).
const bumpCrs = (d, force = false) => ((force || d.crsData) ? { ...d, crsRev: (d.crsRev || 0) + 1 } : d);
const crsNeedsSync = (d) => (d.crsRev || 0) > (d.crsSyncedRev || 0);

// Avatar colours from the old indigo/cyan palette → charcoal + orange palette
const OLD_AVATAR = { '#6366f1': '#ea580c', '#06b6d4': '#27272a', '#10b981': '#15803d', '#f59e0b': '#d97706', '#94a3b8': '#a1a1aa', '#8b5cf6': '#7c3aed', '#ec4899': '#be185d', '#14b8a6': '#0f766e', '#f97316': '#c2410c', '#0ea5e9': '#0369a1', '#a78bfa': '#52525b' };
const recolorUsers = (list) => (list || []).map(u => (OLD_AVATAR[u.color] ? { ...u, color: OLD_AVATAR[u.color] } : u));

// Unique ids — Date.now() alone collides when many items are created at once (bulk upload)
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PROJECT_TYPES = ['transmission', 'solar', 'bess', 'wind'];
const STATUSES = ['IFA', 'AFC', 'Superseded'];
const ROLES = ['Admin', 'Project Manager', 'Senior Engineer', 'Engineer', 'Viewer'];
const SEED_PROPOSALS = [];

const STORAGE_KEY = 'tranzenergy_v5';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

async function deleteBlobUrl(url) {
  if (!isStoredFile(url)) return;
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

// What goes into the shared database (no inline file data, no signed-in user)
function stripForCloud(data) {
  return {
    users: data.users || [],
    projects: data.projects || [],
    drawings: (data.drawings || []).map(d => ({
      ...d,
      versions: (d.versions || []).map(v => ({ ...v, pdfData: isStoredFile(v.pdfData) ? v.pdfData : null })),
      pdfData: isStoredFile(d.pdfData) ? d.pdfData : null,
    })),
    proposals: (data.proposals || []).map(p => ({ ...p, fileData: isStoredFile(p.fileData) ? p.fileData : null })),
    activityLog: data.activityLog || [],
    disciplines: data.disciplines || [],
  };
}

function saveState(data) {
  try {
    // We now store Vercel Blob URLs instead of base64, so we don't need to strip them.
    // To support old data gracefully, we strip non-http blob data to prevent quota errors.
    const stripped = {
      ...data,
      drawings: data.drawings.map(d => ({
        ...d,
        versions: d.versions.map(v => ({ ...v, pdfData: isStoredFile(v.pdfData) ? v.pdfData : null })),
        pdfData: isStoredFile(d.pdfData) ? d.pdfData : null
      })),
      proposals: (data.proposals || []).map(p => ({ ...p, fileData: isStoredFile(p.fileData) ? p.fileData : null }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
  } catch (e) {
    console.warn('localStorage save failed:', e);
  }
}

// authMode 'clerk': people sign in with Clerk (Google / Microsoft / email code) and are
// matched to a workspace user by email. authMode 'legacy': the old email login.
export function AppProvider({ children, authMode = 'password', clerkEmail = '', onSignOut }) {
  const clerkMode = authMode === 'clerk';
  const managed = authMode === 'clerk' || authMode === 'password'; // sign-in handled by the server
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

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(managed ? null : (saved?.currentUser || null));
  const [needsLogin, setNeedsLogin] = useState(false);       // password mode: not signed in
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [me, setMe] = useState(null);                 // server's view of the signed-in person (clerk mode)
  const [accessDenied, setAccessDenied] = useState(null); // { email } when signed in but not a member
  const [users,       setUsers]       = useState(saved?.users ? recolorUsers(saved.users) : SEED_USERS);
  const [projects,    setProjects]    = useState(saved?.projects    || SEED_PROJECTS);
  const [drawings,    setDrawings]    = useState(saved?.drawings    || SEED_DRAWINGS);
  const [proposals,   setProposals]   = useState(saved?.proposals   || SEED_PROPOSALS);
  const [activityLog, setActivityLog] = useState(saved?.activityLog || []);
  const [disciplines, setDisciplines] = useState(withOther(saved?.disciplines));

  // ─── Shared cloud database ────────────────────────────────────────────────
  // The whole workspace is one JSON document in Vercel Blob. Every browser:
  //  1. loads it on start (never writes until that load has succeeded),
  //  2. saves its changes with the version it loaded (etag); if someone else
  //     saved in between, it merges both sets of changes and saves again,
  //  3. checks for other people's changes every 20 s and when the tab regains focus.
  const [cloudStatus, setCloudStatus] = useState('connecting'); // connecting | ok | offline
  const stateRef = useRef(null);
  stateRef.current = { users, projects, drawings, proposals, activityLog, disciplines };
  const baseRef = useRef(null);     // last version seen in the cloud (stripped)
  const etagRef = useRef(null);
  const cloudReady = useRef(false);
  const saving = useRef(false);
  const pushAgain = useRef(false);

  const applyState = useCallback((s) => {
    setUsers(s.users?.length ? recolorUsers(s.users) : SEED_USERS);
    setProjects(s.projects || []);
    setDrawings(s.drawings || []);
    setProposals(s.proposals || []);
    setActivityLog(s.activityLog || []);
    setDisciplines(withOther(s.disciplines));
  }, []);

  // → { status: 'same' } | { status: 'notFound' } | { status: 'ok', state, etag }
  const fetchCloud = useCallback(async (knownEtag) => {
    const res = await fetch(`/api/get-state${knownEtag ? `?etag=${encodeURIComponent(knownEtag)}` : ''}`, { cache: 'no-store' });
    if (res.status === 304) return { status: 'same' };
    if (!res.ok) throw new Error(`Cloud load failed (${res.status})`);
    const body = await res.json();
    if (body?.notFound) return { status: 'notFound' };
    return { status: 'ok', state: stripForCloud(body), etag: res.headers.get('x-state-etag') || null };
  }, []);

  const pushToCloud = useCallback(async () => {
    if (!cloudReady.current) return;
    if (saving.current) { pushAgain.current = true; return; }
    const local = stripForCloud(stateRef.current);
    if (baseRef.current && stateEquals(local, baseRef.current)) return; // nothing new
    saving.current = true;
    try {
      const res = await fetch('/api/save-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: local, etag: etagRef.current }),
      });
      if (res.status === 409) {
        // someone else saved first: merge their changes with ours, then save again
        const remote = await fetchCloud();
        if (remote.status === 'ok') {
          const merged = mergeState(baseRef.current, local, remote.state);
          baseRef.current = remote.state;
          etagRef.current = remote.etag;
          applyState(merged);
          pushAgain.current = true;
        }
      } else if (res.ok) {
        const body = await res.json().catch(() => ({}));
        baseRef.current = local;
        etagRef.current = body.etag || res.headers.get('x-state-etag') || null;
        setCloudStatus('ok');
      } else {
        throw new Error(`Save failed (${res.status})`);
      }
    } catch (e) {
      console.error('Failed to save state to cloud:', e);
      setCloudStatus('offline');
    } finally {
      saving.current = false;
      if (pushAgain.current) { pushAgain.current = false; setTimeout(() => pushToCloud(), 300); }
    }
  }, [fetchCloud, applyState]);

  // Pull other people's changes (and recover if the first load failed)
  const pullFromCloud = useCallback(async () => {
    if (saving.current) return;
    try {
      const r = await fetchCloud(cloudReady.current ? etagRef.current : undefined);
      if (r.status === 'same') { setCloudStatus('ok'); return; }
      if (r.status === 'notFound') {
        if (!cloudReady.current) {
          // brand-new workspace: seed the cloud with what this browser has
          cloudReady.current = true; baseRef.current = null; etagRef.current = null;
          setCloudStatus('ok');
          pushToCloud();
        }
        return;
      }
      const local = stripForCloud(stateRef.current);
      const merged = cloudReady.current ? mergeState(baseRef.current, local, r.state) : r.state;
      baseRef.current = r.state;
      etagRef.current = r.etag;
      cloudReady.current = true;
      setCloudStatus('ok');
      if (!stateEquals(merged, local)) applyState(merged);
      if (!stateEquals(merged, r.state)) pushToCloud(); // we still have changes to send
    } catch (err) {
      console.error('Failed to load cloud database:', err);
      setCloudStatus('offline');
    }
  }, [fetchCloud, applyState, pushToCloud]);

  // First load
  useEffect(() => {
    (async () => {
      if (managed) {
        try {
          const r = await fetch('/api/me', { cache: 'no-store' });
          const m = await r.json().catch(() => ({}));
          if (!clerkMode && r.ok && !m.signedIn) { setNeedsLogin(true); setLoading(false); return; }
          if (!clerkMode && m.mustChangePassword) { setMustChangePassword(true); setLoading(false); return; }
          if (r.ok && m.signedIn !== false && m.email) {
            setMe(m);
            if (!m.isMember && !m.isAdminEmail) { setAccessDenied({ email: m.email }); setLoading(false); return; }
          } else if (clerkMode && r.status === 401) {
            onSignOut?.(); return;
          }
        } catch { /* fall through; the cloud load will report problems */ }
      }
      await pullFromCloud();
      setLoading(false);
    })();
  }, [pullFromCloud]);

  // Keep up with other people's changes
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') pullFromCloud(); };
    const iv = setInterval(tick, 20000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(iv); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [pullFromCloud]);

  // Save changes: this browser instantly, the cloud after a short pause
  useEffect(() => {
    if (loading) return;
    saveState({ currentUser, users, projects, drawings, proposals, activityLog, disciplines });
    const timer = setTimeout(() => pushToCloud(), 1500);
    return () => clearTimeout(timer);
  }, [currentUser, users, projects, drawings, proposals, activityLog, disciplines, loading, pushToCloud]);

  // Keep the signed-in user in step with the shared user list (role changes, removal)
  useEffect(() => {
    if (!currentUser || loading) return;
    const u = users.find(x => x.id === currentUser.id);
    if (!u) setCurrentUser(null);
    else if (!stateEquals(u, currentUser)) setCurrentUser(u);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, loading]);

  // ─── Activity Log ──────────────────────────────────────────────────────────
  const addLog = useCallback((message, authorName) => {
    setActivityLog(prev => [{
      id: uid('log'),
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
    if (clerkMode) setTimeout(() => onSignOut?.(), 1800); // let the log entry save first
    if (authMode === 'password') {
      setTimeout(async () => {
        try { await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); } catch { /* ignore */ }
        window.location.reload();
      }, 1800);
    }
  };

  // Clerk mode: link the signed-in email to its workspace user (first admin is added automatically)
  useEffect(() => {
    if (!managed || loading || accessDenied) return;
    const email = (me?.email || clerkEmail || '').toLowerCase();
    if (!email) return;
    const u = users.find(x => String(x.email || '').trim().toLowerCase() === email);
    if (u) {
      if (currentUser?.id !== u.id) { setCurrentUser(u); addLog(`${u.name} signed in.`); }
      return;
    }
    if (me?.isAdminEmail) {
      const nameGuess = me.name && me.name !== email ? me.name : email.split('@')[0];
      const nu = { id: uid('u'), name: nameGuess, email, role: 'Admin', avatar: nameGuess.slice(0, 2).toUpperCase(), color: '#ea580c' };
      setUsers(prev => [...prev, nu]);
      setCurrentUser(nu);
      addLog(`${nu.name} added as Admin and signed in.`);
    } else {
      setAccessDenied({ email });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, loading, me, clerkEmail, accessDenied]);

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
    if (!canDo('manage_projects')) return;
    const assignedUsers = Array.from(new Set(['u1', currentUser?.id].filter(Boolean)));
    const p = { id: `p-${Date.now()}`, startDate: new Date().toISOString().split('T')[0], status: 'active', assignedUsers, ...data };
    setProjects(prev => [...prev, p]);
    addLog(`Project <strong>${p.code}</strong> created.`);
  };

  const updateProject = (id, updates) => {
    if (!canDo('manage_projects')) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProject = (id) => {
    if (!canDo('admin')) return;
    setDrawings(prev => {
      const projDrawings = prev.filter(d => d.projectId === id);
      projDrawings.forEach(dwg => {
        if (dwg.pdfData) deleteBlobUrl(dwg.pdfData);
        (dwg.versions || []).forEach(v => { if (v.pdfData) deleteBlobUrl(v.pdfData); });
        if (dwg.crsData) deleteBlobUrl(dwg.crsData);
        if (dwg.crsPdf) deleteBlobUrl(dwg.crsPdf);
      });
      return prev.filter(d => d.projectId !== id);
    });
    setProjects(prev => prev.filter(p => p.id !== id));
    addLog(`Project and its drawings deleted.`);
  };

  const assignUsersToProject = (projectId, userIds) => {
    if (!canDo('admin')) return;
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, assignedUsers: userIds } : p));
    addLog(`Updated user assignments for project.`);
  };

  // ─── Drawings CRUD ─────────────────────────────────────────────────────────
  const getDrawingsByProject = useCallback((projectId) => {
    return drawings.filter(d => d.projectId === projectId);
  }, [drawings]);

  const createDrawing = (data) => {
    if (!canDo('upload')) return null;

    const startVer = data.initialVersion || 'R0';
    const dwg = {
      id: uid('dwg'),
      code: (data.code || '').toUpperCase().trim(),
      title: data.title || 'Untitled Drawing',
      description: data.description || '',
      discipline: data.discipline || 'Electrical',
      subType: data.subType || '',
      projectId: data.projectId,
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
    if (!canDo('upload')) return;
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const moveDrawingToDiscipline = (drawingId, newDiscipline) => {
    if (!canDo('upload')) return;
    setDrawings(prev => prev.map(d => {
      if (d.id !== drawingId) return d;
      addLog(`Drawing <strong>${d.code}</strong> moved to <strong>${newDiscipline}</strong>.`);
      return { ...d, discipline: newDiscipline };
    }));
  };

  const addDiscipline = (name) => {
    if (!canDo('upload')) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setDisciplines(prev => prev.includes(trimmed) ? prev : [...prev, trimmed]);
    addLog(`Category <strong>${trimmed}</strong> added.`);
  };

  const deleteDrawing = (id) => {
    if (!canDo('upload')) return;
    setDrawings(prev => {
      const dwg = prev.find(d => d.id === id);
      if (dwg) {
        // Each drawing has a unique blob path, so always safe to delete
        if (dwg.pdfData) deleteBlobUrl(dwg.pdfData);
        (dwg.versions || []).forEach(v => { if (v.pdfData) deleteBlobUrl(v.pdfData); });
        if (dwg.crsData) deleteBlobUrl(dwg.crsData);
        if (dwg.crsPdf) deleteBlobUrl(dwg.crsPdf);
        addLog(`Drawing <strong>${dwg.code}</strong> deleted.`);
      }
      return prev.filter(d => d.id !== id);
    });
  };

  // parsed (optional) = { meta, comments } from utils/crs readCrs(): imports the
  // Excel's comments into the auto CRS and fills blank drawing fields from it.
  const uploadCRS = (drawingId, crsData, parsed, fileName) => {
    if (!canDo('upload')) return;
    setDrawings(prev => prev.map(d => {
      if (d.id !== drawingId) return d;
      if (parsed?.fileType === 'pdf') {
        // a signed/scanned CRS in PDF form: keep it for viewing, the Excel CRS stays as is
        if (d.crsPdf && d.crsPdf !== crsData) deleteBlobUrl(d.crsPdf);
        addLog(`CRS (PDF) uploaded for <strong>${d.code}</strong>.`);
        return { ...d, crsPdf: crsData };
      }
      if (d.crsData && d.crsData !== crsData) deleteBlobUrl(d.crsData); // replaced file
      addLog(`CRS uploaded for <strong>${d.code}</strong>.`);
      if (!parsed) return { ...d, crsData };
      return {
        ...d,
        ...crsFieldUpdates(d, parsed.meta || {}),
        crsData,
        crsImported: parsed.comments || [],
        crsMeta: parsed.meta || {},
        crsLayout: parsed.layout || null,
        crsFileType: parsed.fileType || 'excel',
        crsRowMap: pinRowMapFromImport(d, parsed.comments || []),
        crsFileName: fileName || d.crsFileName || null,
        crsRev: 0, crsSyncedRev: 0, crsSyncError: null,
      };
    }));
  };

  // Comments added/edited in the CRS panel (not tied to a pin)
  const updateCrsItems = (drawingId, updater) => {
    if (!canDo('upload')) return;
    setDrawings(prev => prev.map(d => (d.id === drawingId ? bumpCrs({ ...d, crsImported: updater(d.crsImported || []) }, true) : d)));
  };

  // Set a pin's status from the CRS: 'Open' | 'Resolved' | 'Accepted'
  const setPinStatus = (drawingId, pinId, status) => {
    if (!canDo(status === 'Accepted' ? 'approve' : 'upload')) return;
    setDrawings(prev => prev.map(d => d.id !== drawingId ? d : bumpCrs({
      ...d,
      pins: (d.pins || []).map(p => p.id !== pinId ? p : { ...p, resolved: status !== 'Open', accepted: status === 'Accepted' }),
    }, true)));
  };

  // ─── Storage migration: swap old file links for new ones (e.g. Vercel Blob → R2) ──
  const replaceFileUrls = (map) => {
    if (!canDo('admin')) return;
    const m = (u) => (u && map[u]) || u;
    setDrawings(prev => prev.map(d => ({
      ...d,
      pdfData: m(d.pdfData),
      crsData: m(d.crsData),
      crsPdf: m(d.crsPdf),
      versions: (d.versions || []).map(v => ({ ...v, pdfData: m(v.pdfData) })),
    })));
    setProposals(prev => prev.map(p => ({ ...p, fileData: m(p.fileData) })));
    addLog(`${Object.keys(map).length} file(s) moved to Cloudflare R2.`);
  };

  // ─── Deleting comments ────────────────────────────────────────────────────
  // Who may delete: the comment's author, or a Project Manager / Admin.
  const canDeleteComment = useCallback((author) => {
    if (!currentUser) return false;
    if (canDo('manage_projects')) return true;
    return canDo('upload') && !!author && author.replace(/ \(Client\)$/, '') === currentUser.name;
  }, [currentUser, canDo]);

  // Rows in the CRS Excel that held a deleted comment get blanked on the next sync
  const withClearedRow = (d, row) => (row === undefined || row === null ? d : { ...d, crsClearRows: [...new Set([...(d.crsClearRows || []), row])] });

  // One reply/comment inside a pin's thread
  const deletePinComment = (drawingId, pinId, commentId) => {
    setDrawings(prev => prev.map(d => d.id !== drawingId ? d : bumpCrs({
      ...d,
      pins: (d.pins || []).map(p => p.id !== pinId ? p : { ...p, comments: (p.comments || []).filter(c => c.id !== commentId) }),
    })));
    addLog('Comment deleted.');
  };

  // A whole pin and all its comments
  const deletePin = (drawingId, pinId) => {
    setDrawings(prev => prev.map(d => {
      if (d.id !== drawingId) return d;
      const key = `pin:${pinId}`;
      const { [key]: row, ...restMap } = d.crsRowMap || {};
      return bumpCrs(withClearedRow({ ...d, pins: (d.pins || []).filter(p => p.id !== pinId), crsRowMap: restMap }, row));
    }));
    addLog('Comment pin deleted.');
  };

  // A CRS item that isn't a pin (from the uploaded Excel, or added in the CRS panel)
  const deleteCrsItem = (drawingId, idx) => {
    setDrawings(prev => prev.map(d => {
      if (d.id !== drawingId) return d;
      const item = (d.crsImported || [])[idx];
      if (!item) return d;
      let next = { ...d, crsImported: d.crsImported.filter((_, i) => i !== idx) };
      if (item.local) {
        const key = `loc:${item.id}`;
        const { [key]: row, ...restMap } = d.crsRowMap || {};
        next = withClearedRow({ ...next, crsRowMap: restMap }, row);
      } else {
        next = withClearedRow(next, item.row);
      }
      return bumpCrs(next, true);
    }));
    addLog('CRS comment deleted.');
  };

  // The CRS Excel was rewritten with the latest comments: swap in the new file quietly
  const saveCrsSync = (drawingId, { crsData, crsRowMap, crsLayout, rev, created, fileName, clearedRows = [] }) => {
    setDrawings(prev => prev.map(d => {
      if (d.id !== drawingId) return d;
      if (d.crsData && d.crsData !== crsData) deleteBlobUrl(d.crsData);
      return {
        ...d, crsData, crsRowMap, crsLayout,
        crsFileName: d.crsFileName || fileName,
        crsFileType: created ? 'excel' : d.crsFileType,
        crsSyncedRev: Math.max(d.crsSyncedRev || 0, rev),
        crsSyncError: null,
        crsClearRows: (d.crsClearRows || []).filter(r => !clearedRows.includes(r)),
        crsSyncedAt: new Date().toISOString(),
      };
    }));
  };

  // ─── CRS → Excel sync ──────────────────────────────────────────────────────
  // Any drawing whose CRS changed (reply, status, new comment, pin comment) gets
  // its Excel rewritten here, one at a time. Because the "needs sync" marker is
  // saved with the drawing, a change is never lost to a reload or a view switch.
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const syncBusy = useRef(false);
  const [syncKick, setSyncKick] = useState(0);
  const pendingSync = drawings.filter(crsNeedsSync).map(d => `${d.id}:${d.crsRev}`).join('|');
  useEffect(() => {
    if (loading || !pendingSync || !canDo('upload') || syncBusy.current) return;
    const t = setTimeout(async () => {
      const d = drawingsRef.current.find(crsNeedsSync);
      if (!d) return;
      syncBusy.current = true;
      const rev = d.crsRev || 0;
      try {
        const res = await syncCrsExcel(d, projects.find(p => p.id === d.projectId));
        const fileName = d.crsFileName || `${d.code}_CRS.xlsx`;
        const file = new File([res.bytes], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = await uploadCrsFile(d.code, file);
        saveCrsSync(d.id, { crsData: url, crsRowMap: res.rowMap, crsLayout: res.layout, rev, created: res.created, fileName, clearedRows: res.clearedRows });
      } catch (err) {
        console.error('CRS Excel update failed', err);
        // stop retrying this revision; the next change (or Retry) tries again
        setDrawings(prev => prev.map(x => x.id === d.id ? { ...x, crsSyncError: err.message || 'Update failed', crsSyncedRev: Math.max(x.crsSyncedRev || 0, rev) } : x));
      } finally {
        syncBusy.current = false;
        setSyncKick(k => k + 1); // pick up anything that changed meanwhile
      }
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSync, loading, syncKick, currentUser]);

  const retryCrsSync = (drawingId) => {
    setDrawings(prev => prev.map(d => d.id === drawingId ? { ...d, crsRev: (d.crsSyncedRev || 0) + 1, crsSyncError: null } : d));
  };

  // ─── Revision Upload ───────────────────────────────────────────────────────
  const uploadRevision = useCallback((drawingId, changeSummary, pdfDataUrl, newStatus) => {
    if (!canDo('upload')) return '';
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
        pdfData: pdfDataUrl || dwg.pdfData,
        versions: [rev, ...(dwg.versions || [])]
      };
    }));

    if (logMsg) addLog(logMsg);
    return nextVer;
  }, [currentUser, addLog, canDo]);

  // ─── Drawing Status ────────────────────────────────────────────────────────
  const setDrawingStatus = (id, status) => {
    if (!canDo('approve')) return;
    const dwg = drawings.find(d => d.id === id);
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    if (dwg) addLog(`Drawing <strong>${dwg.code}</strong> status changed to <strong>${status}</strong>.`);
  };

  // ─── Comment Pins ──────────────────────────────────────────────────────────
  const addPin = useCallback((drawingId, x, y, page) => {
    if (!canDo('upload')) return null;
    let newPinId = null;
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      const label = (dwg.pins?.length || 0) + 1;
      const pin = { id: `pin-${Date.now()}`, x, y, page: page || 1, label, resolved: false, comments: [] };
      newPinId = pin.id;
      return { ...dwg, pins: [...(dwg.pins || []), pin] };
    }));
    return newPinId;
  }, [canDo]);

  const addComment = useCallback((drawingId, pinId, text, type = 'internal') => {
    if (!canDo('upload')) return;
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      return bumpCrs({
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
      });
    }));
  }, [currentUser, canDo]);

  const resolvePin = useCallback((drawingId, pinId) => {
    if (!canDo('upload')) return;
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      return bumpCrs({ ...dwg, pins: dwg.pins.map(p => p.id === pinId ? { ...p, resolved: !p.resolved } : p) });
    }));
  }, [canDo]);

  const acceptPin = useCallback((drawingId, pinId) => {
    if (!canDo('approve')) return;
    setDrawings(prev => prev.map(dwg => {
      if (dwg.id !== drawingId) return dwg;
      return bumpCrs({ ...dwg, pins: dwg.pins.map(p => p.id === pinId ? { ...p, accepted: !p.accepted, resolved: true } : p) });
    }));
  }, [canDo]);

  // ─── Users ─────────────────────────────────────────────────────────────────
  const createUser = (data) => {
    if (!canDo('admin')) return null;
    const u = { id: `u-${Date.now()}`, avatar: data.name.slice(0,2).toUpperCase(), color: '#ea580c', ...data };
    setUsers(prev => [...prev, u]);
    addLog(`User <strong>${u.name}</strong> added.`);
    return u;
  };

  const updateUser = (id, updates) => {
    if (!canDo('admin') && id !== currentUser?.id) return;
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    if (id === currentUser?.id) setCurrentUser(prev => ({ ...prev, ...updates }));
  };

  const deleteUser = (id) => {
    if (!canDo('admin')) return;
    const u = users.find(x => x.id === id);
    setUsers(prev => prev.filter(x => x.id !== id));
    if (u) addLog(`User <strong>${u.name}</strong> removed.`);
  };

  // ─── Proposals ─────────────────────────────────────────────────────────────
  const uploadProposal = (data) => {
    if (!canDo('admin')) return null;
    const p = { id: `prop-${Date.now()}`, uploadDate: new Date().toISOString(), ...data };
    setProposals(prev => [...prev, p]);
    addLog(`Proposal <strong>${p.title}</strong> uploaded.`);
    return p;
  };

  const updateProposalComments = (id, followUpComments) => {
    if (!canDo('admin')) return;
    setProposals(prev => prev.map(p => p.id === id ? { ...p, followUpComments } : p));
  };

  const deleteProposal = (id) => {
    if (!canDo('admin')) return;
    const p = proposals.find(x => x.id === id);
    if (p) {
      if (p.fileData) deleteBlobUrl(p.fileData);
      addLog(`Proposal <strong>${p.title}</strong> deleted.`);
    }
    setProposals(prev => prev.filter(x => x.id !== id));
  };

  const importWorkspaceData = (data) => {
    if (!data) return;
    if (data.users) setUsers(data.users);
    if (data.projects) setProjects(data.projects);
    if (data.drawings) setDrawings(data.drawings);
    if (data.proposals) setProposals(data.proposals);
    if (data.activityLog) setActivityLog(data.activityLog);
    if (data.disciplines) setDisciplines(withOther(data.disciplines));
    addLog('Workspace data imported successfully.', currentUser?.name || 'System');
  };

  return (
    <AppContext.Provider value={{
      // State
      currentUser, users, projects, drawings, proposals, activityLog, loading, cloudStatus,
      authMode, accessDenied, onSignOut, needsLogin, mustChangePassword,
      // Consts
      DISCIPLINES: disciplines, PROJECT_TYPES, STATUSES, ROLES,
      // Auth
      login, logout,
      // Permissions
      canDo,
      // Projects
      createProject, updateProject, deleteProject, assignUsersToProject,
      // Drawings
      getDrawingsByProject, createDrawing, updateDrawing, deleteDrawing,
      moveDrawingToDiscipline,
      uploadRevision, setDrawingStatus, uploadCRS, updateCrsItems, setPinStatus, saveCrsSync, retryCrsSync,
      canDeleteComment, deletePinComment, deletePin, deleteCrsItem, replaceFileUrls,
      saveNow: pushToCloud,
      // Comments
      addPin, addComment, resolvePin, acceptPin,
      // Users
      createUser, updateUser, deleteUser,
      // Disciplines
      addDiscipline,
      // Proposals
      uploadProposal, updateProposalComments, deleteProposal,
      // Log
      addLog, importWorkspaceData,
    }}>
      {children}
    </AppContext.Provider>
  );
}
