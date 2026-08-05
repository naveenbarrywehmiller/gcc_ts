import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard, Clock, Users, FolderKanban, ListTodo, Building2,
  Activity, Calendar, FileUp, ClipboardCheck, BarChart3, Settings,
  ChevronLeft, ChevronRight, Timer, Shield
} from 'lucide-react';
import { useState } from 'react';

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/timesheet', icon: Clock, label: 'Timesheet' },
  ];

  const adminItems = [
    { type: 'divider', label: 'Management' },
    { to: '/admin/approvals', icon: ClipboardCheck, label: 'Approvals' },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/admin/tasks', icon: ListTodo, label: 'Tasks' },
    { to: '/admin/divisions', icon: Building2, label: 'Divisions' },
    { to: '/admin/subdivisions', icon: Building2, label: 'Subdivisions' },
    { to: '/admin/departments', icon: Users, label: 'Departments' },
    { to: '/admin/supporting-categories', icon: Users, label: 'Supp. Categories' },
    { to: '/admin/activities', icon: Activity, label: 'Activities' },
    { to: '/admin/holidays', icon: Calendar, label: 'Holidays' },
    { type: 'divider', label: 'Tools' },
    { to: '/admin/import', icon: FileUp, label: 'Import' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
    { to: '/admin/audit', icon: Shield, label: 'Audit Log' },
  ];

  const allItems = isAdmin ? [...navItems, ...adminItems] : navItems;

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-30 flex flex-col
        bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[68px]' : 'w-[240px]'}`}
      id="main-sidebar"
    >
      {/* Logo */}
      <div className="h-[60px] flex items-center px-4 border-b border-surface-200 dark:border-surface-800 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20">
            <Timer className="w-4.5 h-4.5 text-white" />
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-sm font-bold text-surface-900 dark:text-white tracking-tight">TimeSheet</h1>
              <p className="text-xxs text-surface-400 -mt-0.5">Employee Portal</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {allItems.map((item, i) => {
          if (item.type === 'divider') {
            return (
              <div key={i} className="pt-4 pb-2">
                {!collapsed && (
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-surface-400 dark:text-surface-600">
                    {item.label}
                  </p>
                )}
                {collapsed && <div className="border-t border-surface-200 dark:border-surface-800 mx-2" />}
              </div>
            );
          }

          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group
                ${isActive
                  ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400'
                  : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-surface-900 dark:hover:text-surface-200'
                }
                ${collapsed ? 'justify-center' : ''}`
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-surface-200 dark:border-surface-800 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
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
  );
}
