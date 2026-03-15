import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Wifi,
  LayoutDashboard,
  Key,
  Shield,
  BarChart3,
  LogOut,
  Menu,
  X,
  ChevronRight,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const nav = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', desc: 'Overview & stats' },
  { path: '/routers', icon: Wifi, label: 'Routers', desc: 'Manage devices' },
  { path: '/vouchers', icon: Key, label: 'Vouchers', desc: 'Hotspot codes' },
  { path: '/wireguard', icon: Shield, label: 'WireGuard', desc: 'VPN tunnels' },
  { path: '/reports', icon: BarChart3, label: 'Reports', desc: 'Analytics' },
];

export function Layout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex bg-grid-pattern">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-white border-2 border-navy-300 shadow-lg text-navy-700 hover:bg-navy-50 transition"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-navy-900/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 flex flex-col bg-white border-r border-navy-200 shadow-xl transform transition-transform duration-300 ease-out lg:transform-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-navy-100 bg-gradient-to-b from-white to-navy-50/30">
          <button
            onClick={() => {
              navigate('/');
              setSidebarOpen(false);
            }}
            className="flex items-center gap-3 group"
          >
            <div className="p-2.5 rounded-xl bg-[#059669] shadow-md group-hover:shadow-lg group-hover:scale-105 transition-all duration-200 flex items-center justify-center">
              <img src="/logo.svg" alt="RouterHub" className="w-6 h-6" />
            </div>
            <div className="text-left">
              <span className="font-bold text-navy-900 text-lg block leading-tight">RouterHub</span>
              <span className="text-xs text-navy-500 font-medium">MikroTik Dashboard</span>
            </div>
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-navy-500 hover:bg-navy-100 hover:text-navy-700 transition"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <p className="px-3 mb-3 text-[11px] font-bold text-navy-400 uppercase tracking-widest">
            Navigation
          </p>
          <div className="space-y-1">
            {nav.map(({ path, icon: Icon, label, desc }) => {
              const isActive = location.pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => {
                    navigate(path);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group relative ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-navy-600 hover:bg-navy-50 hover:text-navy-900'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-primary-500" />
                  )}
                  <div
                    className={`p-2 rounded-lg shrink-0 transition-colors ${
                      isActive ? 'bg-primary-100' : 'bg-navy-100 group-hover:bg-navy-200'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${isActive ? 'text-primary-600' : 'text-navy-500'}`}
                      strokeWidth={2}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium block">{label}</span>
                    <span className={`text-xs block truncate ${isActive ? 'text-primary-600/80' : 'text-navy-400'}`}>
                      {desc}
                    </span>
                  </div>
                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-primary-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-navy-100 bg-gradient-to-b from-navy-50/50 to-white">
          <div className="flex items-center gap-3 px-3 py-3 mb-3 rounded-xl bg-white border border-navy-200 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-navy-400 uppercase tracking-wider block">
                Logged in as
              </span>
              <p className="text-sm font-semibold text-navy-900 truncate">{admin?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 hover:border-red-300 transition font-medium text-sm"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-6 lg:p-8 pt-20 lg:pt-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
