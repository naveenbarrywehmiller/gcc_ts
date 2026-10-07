import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth';
import Sidebar from './Sidebar';
import Header from './Header';
import Footer from './Footer';
import { useState } from 'react';

export default function Layout() {
  const { user, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 animate-pulse-soft" />
          <p className="text-sm text-surface-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-950">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className={`min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-[240px]'} min-h-screen flex flex-col`} id="main-content-area">
        <Header onMenuOpen={() => setMobileNavOpen(true)} mobileNavOpen={mobileNavOpen} />
        <main className="p-3 md:p-6 flex-1 min-w-0">
          <div className="w-full max-w-[1600px] mx-auto min-w-0"><Outlet /></div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
