import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, Plus, Loader2, Activity, Shield, Radio } from 'lucide-react';
import { api, type Router } from '../lib/api';
import { RouterCard } from '../components/RouterCard';
import { AddRouterModal } from '../components/AddRouterModal';
import { VoucherModal } from '../components/VoucherModal';
import { PageHeader } from '../components/PageHeader';

function AddRouterButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn-primary">
      <Plus className="w-5 h-5" />
      Add Router
    </button>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [voucherRouterId, setVoucherRouterId] = useState<number | null>(null);

  async function loadRouters() {
    try {
      const data = await api.routers.list({ dashboard: true });
      setRouters(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRouters();
    const interval = setInterval(loadRouters, 30000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = routers.filter((r) => r.status === 'online').length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="relative">
          <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
          <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-primary-200 animate-pulse" />
        </div>
        <p className="text-sm font-medium text-navy-600">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle={`${onlineCount} of ${routers.length} routers online`}
        action={<AddRouterButton onClick={() => setAddOpen(true)} />}
      />

      {/* Stats cards - always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl bg-white border border-navy-200 p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-navy-500">Total Routers</p>
              <p className="text-2xl font-bold text-navy-900 mt-1">{routers.length}</p>
            </div>
            <div className="p-3 rounded-xl bg-accent-50">
              <Radio className="w-6 h-6 text-accent-600" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-navy-200 p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-navy-500">Online</p>
              <p className="text-2xl font-bold text-primary-600 mt-1">{onlineCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-primary-50">
              <Activity className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-navy-200 p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-navy-500">Offline</p>
              <p className="text-2xl font-bold text-navy-700 mt-1">{routers.length - onlineCount}</p>
            </div>
            <div className="p-3 rounded-xl bg-navy-100">
              <Wifi className="w-6 h-6 text-navy-500" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-navy-200 p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-navy-500">WireGuard Tunnels</p>
              <p className="text-2xl font-bold text-navy-900 mt-1">{routers.filter((r) => r.wg_ip).length}</p>
            </div>
            <div className="p-3 rounded-xl bg-primary-50">
              <Shield className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Router grid or empty state */}
      {routers.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {routers.map((router) => (
            <RouterCard
              key={router.id}
              router={router}
              onRefresh={loadRouters}
              onManage={(id) => navigate(`/routers/${id}`)}
              onVouchers={setVoucherRouterId}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-navy-200 bg-white p-12 lg:p-16 text-center shadow-card">
          <div className="max-w-md mx-auto">
            <div className="inline-flex p-6 rounded-3xl bg-gradient-to-br from-primary-50 to-accent-50 mb-8">
              <Wifi className="w-20 h-20 text-primary-500" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-bold text-navy-900 mb-3">
              No routers yet
            </h3>
            <p className="text-navy-600 mb-8 leading-relaxed">
              Add your first MikroTik router to get started. RouterHub will automatically
              configure WireGuard and connect it to your VPS for secure remote management.
            </p>
            <AddRouterButton onClick={() => setAddOpen(true)} />
            <p className="text-xs text-navy-400 mt-6">
              Requires MikroTik RouterOS with API enabled
            </p>
          </div>
        </div>
      )}

      <AddRouterModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={(routerId) => {
          loadRouters();
          if (routerId) navigate(`/routers/${routerId}/connect`);
        }}
      />
      <VoucherModal
        routerId={voucherRouterId}
        onClose={() => setVoucherRouterId(null)}
      />
    </div>
  );
}
