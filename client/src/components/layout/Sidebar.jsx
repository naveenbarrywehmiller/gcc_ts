import { NavLink } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/auth';
import {
  LayoutDashboard, Clock, Users, FolderKanban, ListTodo, Building2,
  Activity, Calendar, ClipboardCheck, BarChart3, Settings,
  ChevronLeft, ChevronRight, Timer, Shield, X
} from 'lucide-react';

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { isAdmin, isSystemAdmin, isManager } = useAuth();
  const asideRef = useRef(null);
  const onMobileCloseRef = useRef(onMobileClose);

  useEffect(() => { onMobileCloseRef.current = onMobileClose; }, [onMobileClose]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Wait for the opening transform so the link is visible when it receives focus.
    const focusTimer = window.setTimeout(() => asideRef.current?.querySelector('a[href]')?.focus(), 320);
    const handleKeys = event => {
      if (event.key === 'Escape') onMobileCloseRef.current();
      if (event.key !== 'Tab' || window.innerWidth >= 768) return;
      const focusable = [...asideRef.current.querySelectorAll('a[href], button:not([disabled])')]
        .filter(element => element.getClientRects().length);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeys);
    return () => {
      document.removeEventListener('keydown', handleKeys);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.getElementById('mobile-nav-toggle')?.focus();
    };
  }, [mobileOpen]);


  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/timesheet', icon: Clock, label: 'Timesheet' },
    { to: '/planned-vacation', icon: Calendar, label: 'Planned Vacation' },
  ];

  const adminItems = [
    { type: 'divider', label: 'Management' },
    { to: '/admin/approvals', icon: ClipboardCheck, label: 'Approvals' },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/admin/tasks', icon: ListTodo, label: 'Task Name/Number' },
    { to: '/admin/divisions', icon: Building2, label: 'Division' },
    { to: '/admin/subdivisions', icon: Building2, label: 'Location' },
    { to: '/admin/departments', icon: Users, label: 'Departments' },
    { to: '/admin/supporting-categories', icon: Users, label: 'Dedicated/Flex' },
    { to: '/admin/activities', icon: Activity, label: 'Work Type' },
    { to: '/admin/travel', icon: Activity, label: 'Travel & VISA' },
    { to: '/admin/staffing', icon: Users, label: 'Open Position / New Joiners' },
    { to: '/admin/holidays', icon: Calendar, label: 'Holidays' },
    { type: 'divider', label: 'Tools' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
    { to: '/admin/audit', icon: Shield, label: 'Audit Log' },
  ];

  const allItems = isAdmin ? [...navItems, ...adminItems] : navItems;
  if (isManager) allItems.push({ to: '/manager/approvals', icon: ClipboardCheck, label: 'Approvals' });

  if (isSystemAdmin) {
    allItems.push({ type: 'divider', label: 'System' });
    allItems.push({ to: '/admin/system', icon: Settings, label: 'Maintenance' });
    allItems.push({ to: '/admin/error-logs', icon: Shield, label: 'Error Logs' });
  }

  return (
    <>
    {mobileOpen && <button type="button" className="fixed inset-0 z-30 bg-black/50 md:hidden" aria-label="Close navigation" onClick={onMobileClose} />}
    <aside
      ref={asideRef}
      className={`fixed left-0 top-0 h-full z-30 flex flex-col
        bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800
        transition-[transform,width] duration-300 ease-in-out w-[min(280px,85vw)]
        ${mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'} md:visible md:translate-x-0
        ${collapsed ? 'md:w-[68px]' : 'md:w-[240px]'}`}
      id="main-sidebar"
      aria-label="Main navigation"
      role={mobileOpen ? 'dialog' : undefined}
      aria-modal={mobileOpen || undefined}
    >
      {/* Logo */}
      <div className="h-[60px] flex items-center px-4 border-b border-surface-200 dark:border-surface-800 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20">
            <Timer className="w-4.5 h-4.5 text-white" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-bold text-surface-900 dark:text-white tracking-tight">TimeSheet</h1>
              <p className="text-xxs text-surface-400 -mt-0.5">Employee Portal</p>
            </div>
          )}
        </div>
        <button type="button" className="md:hidden ml-auto min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg" aria-label="Close navigation" onClick={onMobileClose}><X className="w-5 h-5" /></button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {allItems.map((item, i) => {
          if (item.type === 'divider') {
            return (
              <div key={i} className="pt-4 pb-2">
                {(!collapsed || mobileOpen) && (
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-surface-400 dark:text-surface-600">
                    {item.label}
                  </p>
                )}
                {collapsed && !mobileOpen && <div className="border-t border-surface-200 dark:border-surface-800 mx-2" />}
              </div>
            );
          }

          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-medium transition-all duration-150 group
                ${isActive
                  ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400'
                  : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200'
                }
                ${collapsed ? 'md:justify-center' : ''}`
              }
              title={item.label}
              aria-label={item.label}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className={`${collapsed ? 'md:hidden' : ''} whitespace-normal leading-tight`}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="hidden md:block p-3 border-t border-surface-200 dark:border-surface-800 shrink-0">
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
            text-surface-500 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          id="sidebar-toggle"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
    </>
  );
}
