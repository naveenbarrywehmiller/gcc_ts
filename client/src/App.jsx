import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './services/msal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Timesheet from './pages/Timesheet';
import Reports from './pages/Reports';
import AdminUsers from './pages/admin/Users';
import AdminProjects from './pages/admin/Projects';
import AdminTasks from './pages/admin/Tasks';
import { AdminDivisions, AdminActivities, AdminSupportingCategories } from './pages/admin/SimpleListManager';
import AdminDepartments from './pages/admin/AdminDepartments';
import AdminSubdivisions from './pages/admin/Subdivisions';
import AdminHolidays from './pages/admin/Holidays';
import AdminApprovals from './pages/admin/Approvals';
import AdminImport from './pages/admin/Import';
import AdminAuditLog from './pages/admin/AuditLog';

// We'll create ManagerApprovals shortly
import ManagerApprovals from './pages/manager/ManagerApprovals';

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  return isAdmin ? children : <Navigate to="/" replace />;
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
        
        {/* Manager Routes */}
        <Route path="/manager/approvals" element={<ManagerRoute><ManagerApprovals /></ManagerRoute>} />

        {/* Admin Routes */}
        <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
        <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="/admin/projects" element={<AdminRoute><AdminProjects /></AdminRoute>} />
        <Route path="/admin/tasks" element={<AdminRoute><AdminTasks /></AdminRoute>} />
        <Route path="/admin/divisions" element={<AdminRoute><AdminDivisions /></AdminRoute>} />
        <Route path="/admin/subdivisions" element={<AdminRoute><AdminSubdivisions /></AdminRoute>} />
        <Route path="/admin/departments" element={<AdminRoute><AdminDepartments /></AdminRoute>} />
        <Route path="/admin/supporting-categories" element={<AdminRoute><AdminSupportingCategories /></AdminRoute>} />
        <Route path="/admin/activities" element={<AdminRoute><AdminActivities /></AdminRoute>} />
        <Route path="/admin/holidays" element={<AdminRoute><AdminHolidays /></AdminRoute>} />
        <Route path="/admin/approvals" element={<AdminRoute><AdminApprovals /></AdminRoute>} />
        <Route path="/admin/import" element={<AdminRoute><AdminImport /></AdminRoute>} />
        <Route path="/admin/audit" element={<AdminRoute><AdminAuditLog /></AdminRoute>} />
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
