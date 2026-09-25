import React, { useContext } from 'react';
import { AppContext, AppProvider } from './AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ProjectView } from './components/ProjectView';
import { AdminPanel } from './components/AdminPanel';
import { ProposalsView } from './components/ProposalsView';
import { AccessDenied } from './components/AccessDenied';
import { AuthGate, clerkEnabled, Splash } from './auth';
import { Menu } from 'lucide-react';
import { PasswordLogin } from './components/PasswordLogin';
import { ChangePassword } from './components/ChangePassword';
import { MyReviews, useMyReviewCount } from './components/ReviewTracker';
import { isExternal } from './utils/workflow';

function AppShell() {
  const { currentUser, canDo, loading, cloudStatus, authMode, accessDenied, onSignOut, needsLogin, mustChangePassword, logout } = useContext(AppContext);
  const [activeView, setActiveView] = React.useState('dashboard');
  const [activeProjectId, setActiveProjectId] = React.useState(null);
  const [navOpen, setNavOpen] = React.useState(false); // phone: menu drawer
  const [openDrawingId, setOpenDrawingId] = React.useState(null); // jump to a drawing (from My reviews)
  const reviewCount = useMyReviewCount();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f4f7f2',
        color: '#1f2d27',
        fontFamily: 'Outfit, sans-serif'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #e3eadf',
          borderTopColor: '#3f7d3a',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ fontSize: '18px', fontWeight: 500, letterSpacing: '0.05em' }}>TRANZENERGY DMS</div>
        <div style={{ fontSize: '12px', color: '#71717a', marginTop: '6px' }}>Connecting to cloud database...</div>
      </div>
    );
  }

  if (authMode === 'password') {
    if (needsLogin) return <PasswordLogin />;
    if (mustChangePassword) return <ChangePassword forced />;
    if (accessDenied) return <AccessDenied email={accessDenied.email} onSignOut={logout} />;
    if (!currentUser) return <Splash text="Opening your workspace…" />;
  }
  if (authMode === 'clerk') {
    if (accessDenied) return <AccessDenied email={accessDenied.email} onSignOut={onSignOut} />;
    if (!currentUser) return <Splash text="Opening your workspace…" />;
  }
  if (!currentUser) return <Login />;

  const navigateTo = (view, projectId = null, drawingId = null) => {
    setNavOpen(false);
    setActiveView(view);
    if (projectId) setActiveProjectId(projectId);
    setOpenDrawingId(drawingId);
  };

  const renderContent = () => {
    if (activeView === 'project' && activeProjectId) {
      return <ProjectView key={activeProjectId} projectId={activeProjectId} initialDrawingId={openDrawingId} onBack={() => setActiveView('dashboard')} />;
    }
    if (activeView === 'myreviews') {
      return <MyReviews onOpenDrawing={(projectId, drawingId) => navigateTo('project', projectId, drawingId)} />;
    }
    if (activeView === 'admin' && canDo('admin')) {
      return <AdminPanel />;
    }
    if (activeView === 'backup' && !isExternal(currentUser)) {
      return <AdminPanel initialTab="backup" />;
    }
    if (activeView === 'proposals' && canDo('admin')) {
      return <ProposalsView />;
    }
    return <Dashboard onOpenProject={(id) => navigateTo('project', id)} />;
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeView={activeView}
        activeProjectId={activeProjectId}
        onNavigate={navigateTo}
        mobileOpen={navOpen}
        reviewCount={reviewCount}
      />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div className="main-content">
        <div className="mobile-topbar">
          <button className="btn btn-ghost btn-icon" onClick={() => setNavOpen(true)} aria-label="Open menu" style={{ position: 'relative' }}>
            <Menu size={20} />
            {reviewCount.total > 0 && <span className={`nav-dot ${reviewCount.overdue ? 'overdue' : ''}`}>{reviewCount.total}</span>}
          </button>
          <div className="mobile-topbar-brand"><img src="/logo-mark.png" alt="" style={{ width: 32, height: 32 }} /> Tranz Energy</div>
        </div>
        {cloudStatus === 'offline' && (
          <div style={{ background: 'var(--error-glow)', color: 'var(--error)', fontSize: 12, padding: '6px 16px', borderBottom: '1px solid rgba(239,68,68,0.3)' }}>
            ⚠️ Can't reach the shared database. Your changes are kept in this browser and will be saved when the connection is back.
          </div>
        )}
        {renderContent()}
      </div>
    </div>
  );
}

export default function App() {
  if (!clerkEnabled) {
    return (
      <AppProvider authMode="password">
        <AppShell />
      </AppProvider>
    );
  }
  return (
    <AuthGate>
      {({ email, signOut }) => (
        <AppProvider key={email} authMode="clerk" clerkEmail={email} onSignOut={signOut}>
          <AppShell />
        </AppProvider>
      )}
    </AuthGate>
  );
}
