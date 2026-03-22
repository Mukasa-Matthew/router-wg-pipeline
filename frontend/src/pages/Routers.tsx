import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { api, type Router } from '../lib/api';
import { RouterCard } from '../components/RouterCard';
import { AddRouterModal } from '../components/AddRouterModal';
import { VoucherModal } from '../components/VoucherModal';
import { PageHeader } from '../components/PageHeader';

export function Routers() {
  const navigate = useNavigate();
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [voucherRouterId, setVoucherRouterId] = useState<number | null>(null);

  async function loadRouters() {
    try {
      const data = await api.routers.list();
      setRouters(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRouters();
    const interval = setInterval(loadRouters, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading routers...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Routers"
        subtitle="Manage your MikroTik routers and WireGuard tunnels"
        action={
          <button onClick={() => setAddOpen(true)} className="btn-primary w-full sm:w-auto justify-center">
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
            Add Router
          </button>
        }
      />

      <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-stretch">
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

      {routers.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 sm:p-16 text-center">
          <p className="text-body text-navy-600 mb-6">No routers yet. Add one to get started.</p>
          <button onClick={() => setAddOpen(true)} className="btn-primary w-full sm:w-auto">
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2} />
            Add Router
          </button>
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
