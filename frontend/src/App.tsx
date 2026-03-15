import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Routers } from './pages/Routers';
import { RouterDetailPage } from './pages/RouterDetailPage';
import { ConnectRouterPage } from './pages/ConnectRouterPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { RouterDetailLayout } from './components/RouterDetailLayout';
import { VouchersPage } from './pages/VouchersPage';
import { WireGuardPage } from './pages/WireGuardPage';
import { Reports } from './pages/Reports';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-grid-pattern gap-4">
        <div className="w-12 h-12 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading...</p>
      </div>
    );
  }
  if (!admin) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="routers" element={<Routers />} />
        <Route path="routers/:id" element={<RouterDetailLayout />}>
          <Route index element={<RouterDetailPage />} />
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="connect" element={<ConnectRouterPage />} />
        </Route>
        <Route path="vouchers" element={<VouchersPage />} />
        <Route path="wireguard" element={<WireGuardPage />} />
        <Route path="reports" element={<Reports />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AppRoutes />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
