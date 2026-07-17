import React, { useContext } from 'react';
import { AppContext, AppProvider } from './AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ProjectView } from './components/ProjectView';
import { AdminPanel } from './components/AdminPanel';
import { ProposalsView } from './components/ProposalsView';

function AppShell() {
  const { currentUser, canDo, loading } = useContext(AppContext);
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
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff',
        fontFamily: 'Outfit, sans-serif'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(255,255,255,0.1)',
          borderTopColor: '#6366f1',
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
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>Connecting to cloud database...</div>
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
