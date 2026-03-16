import { useParams, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { ArrowLeft, Wifi, FileText, Link2, ExternalLink, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api, type Router, type TunnelStatus } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { VoucherModal } from './VoucherModal';

const TABS = [
  { path: '', label: 'Overview', icon: Wifi },
  { path: 'profiles', label: 'Profiles', icon: FileText },
  { path: 'connect', label: 'Connection', icon: Link2 },
];

export function RouterDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const routerId = parseInt(id || '0', 10);
  const toast = useToast();
  const [router, setRouter] = useState<Router | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [mikhmonLoading, setMikhmonLoading] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherRefreshTrigger, setVoucherRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!routerId) return;
    (async () => {
      try {
        const [r, t] = await Promise.all([
          api.routers.get(routerId),
          api.routers.testTunnel(routerId).catch(() => null),
        ]);
        setRouter(r);
        setTunnelStatus(t);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [routerId]);

  async function openMikHmon() {
    if (!tunnelStatus?.tunnel_up) {
      toast.warning('Tunnel must be online to open MikHmon');
      return;
    }
    setMikhmonLoading(true);
    try {
      const { url } = await api.routers.mikhmonUrl(routerId);
      window.open(url, '_blank');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get MikHmon URL');
    } finally {
      setMikhmonLoading(false);
    }
  }

  if (loading || !router) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading router...</p>
      </div>
    );
  }

  const basePath = `/routers/${routerId}`;
  const currentPath = location.pathname.replace(basePath, '').replace(/^\//, '') || '';

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/routers')}
          className="flex items-center gap-2 text-navy-600 hover:text-navy-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Routers
        </button>
      </div>

      <h1 className="text-2xl font-bold text-navy-900 mb-1">{router.name}</h1>
      <p className="text-navy-600 mb-6">{router.location || router.wg_ip || 'Router details'}</p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(({ path, label, icon: Icon }) => {
          const isActive = currentPath === path;
          return (
            <button
              key={path || 'overview'}
              onClick={() => navigate(path ? `${basePath}/${path}` : basePath)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition ${
                isActive
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
        {router.wg_ip && (
          <button
            onClick={openMikHmon}
            disabled={mikhmonLoading || !tunnelStatus?.tunnel_up}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-50 text-accent-700 font-medium hover:bg-accent-100 disabled:opacity-50 transition"
          >
            {mikhmonLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            MikHmon
          </button>
        )}
      </div>

      <Outlet context={{ router, tunnelStatus, openVouchers: () => setVoucherOpen(true), refreshVouchers: voucherRefreshTrigger }} />
      <VoucherModal
        routerId={voucherOpen ? routerId : null}
        onClose={() => setVoucherOpen(false)}
        onVouchersChange={() => setVoucherRefreshTrigger((t) => t + 1)}
      />
    </div>
  );
}
