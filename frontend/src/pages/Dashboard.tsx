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
    <button onClick={onClick} className="btn-primary w-full sm:w-auto justify-center">
      <Plus className="w-4 h-4" strokeWidth={2.5} />
      Add Router
    </button>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl border border-navy-200/80 bg-white p-4 sm:p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-label text-navy-500 truncate">{label}</p>
          <p className="font-display font-semibold text-lg sm:text-title text-navy-900 mt-1.5 sm:mt-2">{value}</p>
        </div>
        <div className={`p-2.5 sm:p-3 rounded-xl shrink-0 ${iconBg}`}>
          <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${iconColor}`} strokeWidth={2} />
        </div>
      </div>
    </div>
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
    const interval = setInterval(loadRouters, 15000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = routers.filter((r) => r.status === 'online').length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-5">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" strokeWidth={2} />
        <p className="text-body font-medium text-navy-500">Loading dashboard…</p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-10">
        <StatCard
          label="Total Routers"
          value={routers.length}
          icon={Radio}
          iconBg="bg-accent-50"
          iconColor="text-accent-600"
        />
        <StatCard
          label="Online"
          value={onlineCount}
          icon={Activity}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
        />
        <StatCard
          label="Offline"
          value={routers.length - onlineCount}
          icon={Wifi}
          iconBg="bg-navy-100"
          iconColor="text-navy-500"
        />
        <StatCard
          label="WireGuard Tunnels"
          value={routers.filter((r) => r.wg_ip).length}
          icon={Shield}
          iconBg="bg-primary-50"
          iconColor="text-primary-600"
        />
      </div>

      {routers.length > 0 ? (
        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        <div className="rounded-2xl border border-dashed border-navy-300 bg-white p-8 sm:p-16 text-center">
          <div className="max-w-sm mx-auto">
            <div className="inline-flex p-5 rounded-2xl bg-navy-100 mb-6">
              <Wifi className="w-14 h-14 text-navy-500" strokeWidth={1.5} />
            </div>
            <h3 className="font-display font-semibold text-title text-navy-900 mb-2">No routers yet</h3>
            <p className="text-body text-navy-500 mb-8 leading-relaxed">
              Add your first MikroTik router to get started. RouterHub will configure WireGuard and connect it to your VPS for secure remote management.
            </p>
            <AddRouterButton onClick={() => setAddOpen(true)} />
            <p className="text-caption text-navy-400 mt-6">Requires MikroTik RouterOS with API enabled</p>
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
