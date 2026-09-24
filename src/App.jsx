import React, { useContext } from 'react';
import { AppContext, AppProvider } from './AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ProjectView } from './components/ProjectView';
import { AdminPanel } from './components/AdminPanel';
import { ProposalsView } from './components/ProposalsView';

function AppShell() {
  const { currentUser, canDo, loading, cloudStatus } = useContext(AppContext);
  const [activeView, setActiveView] = React.useState('dashboard');
  const [activeProjectId, setActiveProjectId] = React.useState(null);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f5f5f4',
        color: '#18181b',
        fontFamily: 'Outfit, sans-serif'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #e7e5e4',
          borderTopColor: '#ea580c',
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

  if (!currentUser) return <Login />;

  const navigateTo = (view, projectId = null) => {
    setActiveView(view);
    if (projectId) setActiveProjectId(projectId);
  };

  const renderContent = () => {
    if (activeView === 'project' && activeProjectId) {
      return <ProjectView projectId={activeProjectId} onBack={() => setActiveView('dashboard')} />;
    }
    if (activeView === 'admin' && canDo('admin')) {
      return <AdminPanel />;
    }
    if (activeView === 'backup') {
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
      />
      <div className="main-content">
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
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
