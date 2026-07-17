import React, { useContext } from 'react';
import { AppContext, AppProvider } from './AppContext';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ProjectView } from './components/ProjectView';
import { AdminPanel } from './components/AdminPanel';
import { ProposalsView } from './components/ProposalsView';

function AppShell() {
  const { currentUser, canDo } = useContext(AppContext);
  const [activeView, setActiveView] = React.useState('dashboard');
  const [activeProjectId, setActiveProjectId] = React.useState(null);

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
