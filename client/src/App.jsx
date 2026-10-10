import MatrixHelp from './pages/MatrixHelp';
import { hasPermission } from './utils/permissions';
import DivisionUpdates from './pages/admin/DivisionUpdates';
import ErrorLogs from './pages/admin/ErrorLogs';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import Reports from './pages/Reports';
import AdminUsers from './pages/admin/Users';
import AdminProjects from './pages/admin/Projects';
import AdminTasks from './pages/admin/Tasks';
import { AdminDivisions, AdminActivities, AdminSupportingCategories } from './pages/admin/SimpleListManager';
import AdminDepartments from './pages/admin/AdminDepartments';
import AdminHolidays from './pages/admin/Holidays';
import AdminApprovals from './pages/admin/Approvals';
import AdminAuditLog from './pages/admin/AuditLog';
import SystemMaintenance from './pages/admin/SystemMaintenance';

// We'll create ManagerApprovals shortly
import ManagerApprovals from './pages/manager/ManagerApprovals';

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

function ManagerRoute({ children }) {
  const { isAdmin, isManager, loading } = useAuth();
  if (loading) return null;
  return (isAdmin || isManager) ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/timesheet" element={<Timesheet />} />
        <Route path="/planned-vacation" element={<PlannedVacation />} />
        <Route path="/help" element={<Help />} />
        <Route path="/admin/matrix-help" element={<PermissionRoute permission="matrixView"><MatrixHelp /></PermissionRoute>} />
        
        {/* Manager Routes */}
        <Route path="/manager/approvals" element={<ManagerRoute><ManagerApprovals /></ManagerRoute>} />

        {/* Admin Routes */}
        <Route path="/reports" element={<PermissionRoute permission="reports"><Reports /></PermissionRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/projects" element={<AdminRoute><AdminProjects /></AdminRoute>} />
        <Route path="/admin/tasks" element={<AdminRoute><AdminTasks /></AdminRoute>} />
        <Route path="/admin/divisions" element={<PermissionRoute permission="catalogView"><AdminDivisions /></PermissionRoute>} />
        <Route path="/admin/subdivisions" element={<PermissionRoute permission="catalogView"><Navigate to="/admin/divisions" replace /></PermissionRoute>} />
        <Route path="/admin/departments" element={<PermissionRoute permission="catalogView"><AdminDepartments /></PermissionRoute>} />
        <Route path="/admin/supporting-categories" element={<PermissionRoute permission="catalogView"><AdminSupportingCategories /></PermissionRoute>} />
        <Route path="/admin/activities" element={<PermissionRoute permission="catalogView"><AdminActivities /></PermissionRoute>} />
        <Route path="/admin/holidays" element={<PermissionRoute permission="catalogView"><AdminHolidays /></PermissionRoute>} />
        <Route path="/admin/approvals" element={<AdminRoute><AdminApprovals /></AdminRoute>} />
        <Route path="/admin/audit" element={<AdminRoute><AdminAuditLog /></AdminRoute>} />
        
        <Route path="/admin/travel" element={<PermissionRoute permission="divisionUpdateView"><DivisionUpdates kind="travel" /></PermissionRoute>} />
        <Route path="/admin/staffing" element={<PermissionRoute permission="divisionUpdateView"><DivisionUpdates kind="staffing" /></PermissionRoute>} />
        <Route path="/admin/error-logs" element={<SystemAdminRoute><ErrorLogs /></SystemAdminRoute>} />
        {/* System Admin Routes */}
        <Route path="/admin/system" element={<SystemAdminRoute><SystemMaintenance /></SystemAdminRoute>} />
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
