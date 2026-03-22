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
    <div className="min-h-screen bg-grid-pattern">
      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed z-50 p-3 rounded-xl bg-white border border-navy-200 shadow-soft text-navy-700 hover:bg-navy-50 active:scale-95 transition touch-manipulation top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" strokeWidth={2} />
      </button>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-navy-900/60 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed on desktop, slide-in on mobile; full width on very small screens */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[min(288px,85vw)] sm:w-72 flex flex-col bg-white border-r border-navy-200/80 shadow-elevated transform transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-navy-200/60">
          <button
            onClick={() => {
              navigate('/');
              setSidebarOpen(false);
            }}
            className="flex items-center gap-3 group"
          >
            <div className="p-2.5 rounded-xl bg-primary-600 shadow-soft flex items-center justify-center group-hover:bg-primary-700 transition-colors">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="RouterHub" className="w-6 h-6" />
            </div>
            <div className="text-left">
              <span className="font-display font-semibold text-navy-900 text-title block tracking-tight">RouterHub</span>
              <span className="text-caption text-navy-500">MikroTik Dashboard</span>
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
          <p className="px-3 mb-3 text-label text-navy-400">
            Navigation
          </p>
          <div className="space-y-1">
            {nav.map(({ path, icon: Icon, label, desc }) => {
              const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
              return (
                <button
                  key={path}
                  onClick={() => {
                    navigate(path);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group relative ${
                    isActive
                      ? 'bg-primary-50/80 text-primary-700'
                      : 'text-navy-600 hover:bg-navy-100/80 hover:text-navy-900'
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
                    <span className={`text-caption block truncate ${isActive ? 'text-primary-600/90' : 'text-navy-400'}`}>
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
        <div className="p-4 border-t border-navy-200/60">
          <div className="flex items-center gap-3 px-3 py-3 mb-3 rounded-xl bg-navy-50/60 border border-navy-200/60">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-label text-navy-400 block">
                Logged in as
              </span>
              <p className="text-body font-semibold text-navy-900 truncate">{admin?.username}</p>
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

      {/* Main content - scrollable, offset by sidebar on desktop */}
      <main className="min-h-screen overflow-auto lg:ml-72 bg-grid-pattern">
        <div className="px-4 py-5 pb-8 pt-20 sm:px-5 sm:pt-5 lg:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
