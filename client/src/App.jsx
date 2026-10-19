import { lazy, Suspense } from 'react';
import { hasPermission } from './utils/permissions';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './services/msal';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/auth';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Timesheet from './pages/Timesheet';
import PlannedVacation from './pages/PlannedVacation';
import Help from './pages/Help';

// Keep less-used screens out of the initial bundle. Guards still run before they render.
const MatrixHelp = lazy(() => import('./pages/MatrixHelp'));
const Reports = lazy(() => import('./pages/Reports'));
const ManagerApprovals = lazy(() => import('./pages/manager/ManagerApprovals'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminProjects = lazy(() => import('./pages/admin/Projects'));
const AdminTasks = lazy(() => import('./pages/admin/Tasks'));
const AdminPlatforms = lazy(() => import('./pages/admin/SimpleListManager').then(module => ({ default: module.AdminPlatforms })));
const AdminDivisions = lazy(() => import('./pages/admin/SimpleListManager').then(module => ({ default: module.AdminDivisions })));
const AdminActivities = lazy(() => import('./pages/admin/SimpleListManager').then(module => ({ default: module.AdminActivities })));
const AdminSupportingCategories = lazy(() => import('./pages/admin/SimpleListManager').then(module => ({ default: module.AdminSupportingCategories })));
const AdminDepartments = lazy(() => import('./pages/admin/AdminDepartments'));
const AdminHolidays = lazy(() => import('./pages/admin/Holidays'));
const AdminApprovals = lazy(() => import('./pages/admin/Approvals'));
const AdminAuditLog = lazy(() => import('./pages/admin/AuditLog'));
const DivisionUpdates = lazy(() => import('./pages/admin/DivisionUpdates'));
const ErrorLogs = lazy(() => import('./pages/admin/ErrorLogs'));
const SystemMaintenance = lazy(() => import('./pages/admin/SystemMaintenance'));

function PermissionRoute({ permission, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return hasPermission(user, permission) ? children : <Navigate to="/" replace />;
}

function AdminRoute({ children }) {
  const { isAdmin, user, loading } = useAuth();
  if (loading) return null;
  // Allow system admins to also access normal admin pages if needed, or strictly check.
  // Actually, let's keep it strictly isAdmin or isSystemAdmin.
  return (isAdmin || user?.role === 'system admin') ? children : <Navigate to="/" replace />;
}

function SystemAdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.role === 'system admin' ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/timesheet" element={<PermissionRoute permission="timesheetEntry"><Timesheet /></PermissionRoute>} />
        <Route path="/planned-vacation" element={<PlannedVacation />} />
        <Route path="/help" element={<Help />} />
        <Route element={
          <Suspense fallback={<p role="status" className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">Loading page...</p>}>
            <Outlet />
          </Suspense>
        }>
          <Route path="/admin/matrix-help" element={<PermissionRoute permission="matrixView"><MatrixHelp /></PermissionRoute>} />

          {/* Manager Routes */}
          <Route path="/manager/approvals" element={<PermissionRoute permission="approvalsView"><ManagerApprovals /></PermissionRoute>} />

          {/* Admin Routes */}
          <Route path="/reports" element={<PermissionRoute permission="reports"><Reports /></PermissionRoute>} />
          <Route path="/admin/users" element={<PermissionRoute permission="usersView"><AdminUsers /></PermissionRoute>} />
          <Route path="/admin/projects" element={<PermissionRoute permission="projectsView"><AdminProjects /></PermissionRoute>} />
          <Route path="/admin/tasks" element={<PermissionRoute permission="tasksView"><AdminTasks /></PermissionRoute>} />
          <Route path="/admin/platforms" element={<PermissionRoute permission="catalogView"><AdminPlatforms /></PermissionRoute>} />
          <Route path="/admin/divisions" element={<PermissionRoute permission="catalogView"><AdminDivisions /></PermissionRoute>} />
          <Route path="/admin/subdivisions" element={<PermissionRoute permission="catalogView"><Navigate to="/admin/divisions" replace /></PermissionRoute>} />
          <Route path="/admin/departments" element={<PermissionRoute permission="catalogView"><AdminDepartments /></PermissionRoute>} />
          <Route path="/admin/supporting-categories" element={<PermissionRoute permission="catalogView"><AdminSupportingCategories /></PermissionRoute>} />
          <Route path="/admin/activities" element={<PermissionRoute permission="catalogView"><AdminActivities /></PermissionRoute>} />
          <Route path="/admin/holidays" element={<PermissionRoute permission="catalogView"><AdminHolidays /></PermissionRoute>} />
          <Route path="/admin/approvals" element={<AdminRoute><AdminApprovals /></AdminRoute>} />
          <Route path="/admin/audit" element={<PermissionRoute permission="audit"><AdminAuditLog /></PermissionRoute>} />

          <Route path="/admin/travel" element={<PermissionRoute permission="divisionUpdateView"><DivisionUpdates kind="travel" /></PermissionRoute>} />
          <Route path="/admin/staffing" element={<PermissionRoute permission="divisionUpdateView"><DivisionUpdates kind="staffing" /></PermissionRoute>} />
          <Route path="/admin/error-logs" element={<SystemAdminRoute><ErrorLogs /></SystemAdminRoute>} />
          {/* System Admin Routes */}
          <Route path="/admin/system" element={<SystemAdminRoute><SystemMaintenance /></SystemAdminRoute>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AppWithProviders = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default function App() {
  if (msalInstance) {
    return (
      <MsalProvider instance={msalInstance}>
        <AppWithProviders />
      </MsalProvider>
    );
  }
  return <AppWithProviders />;
}
