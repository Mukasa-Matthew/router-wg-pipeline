import { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  MapPin,
  Shield,
  Users,
  MoreVertical,
  Settings,
  Trash2,
  RefreshCw,
  Key,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { Router, ConnectionStats } from '../lib/api';
import { api } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

const POLL_INTERVAL_MS = 25000;

interface RouterCardProps {
  router: Router;
  onRefresh: () => void;
  onManage: (id: number) => void;
  onVouchers: (id: number) => void;
}

export function RouterCard({
  router,
  onRefresh,
  onManage,
  onVouchers,
}: RouterCardProps) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectionStats, setConnectionStats] = useState<ConnectionStats | null>(null);
  const [pendingExport, setPendingExport] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [mikhmonLoading, setMikhmonLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const isOnline = router.status === 'online';
  const isTunnelFailed = router.status === 'tunnel_failed';

  const loadStats = useCallback(async () => {
    if (!isOnline) return;
    try {
      const [stats, pending] = await Promise.all([
        api.routers.connectionStats(router.id),
        api.vouchers.pendingCount(router.id),
      ]);
      setConnectionStats(stats);
      setPendingExport(pending.count);
      setHasLoaded(true);
    } catch {
      setConnectionStats(null);
      setPendingExport(0);
      setHasLoaded(true);
    }
  }, [router.id, isOnline]);

  useEffect(() => {
    if (!hasLoaded || !isOnline) return;
    const id = setInterval(loadStats, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasLoaded, isOnline, loadStats]);

  async function handleReboot() {
    setMenuOpen(false);
    setLoading(true);
    try {
      await api.routers.reboot(router.id);
      toast.success('Router reboot initiated');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reboot failed');
    } finally {
      setLoading(false);
    }
  }

  async function openMikHmon() {
    setMikhmonLoading(true);
    try {
      const { url } = await api.routers.mikhmonUrl(router.id);
      window.open(url, '_blank');
    } catch {
      // ignore
    } finally {
      setMikhmonLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete router',
      message: `Delete "${router.name}"? This will remove the WireGuard peer and all associated data.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setMenuOpen(false);
    setLoading(true);
    try {
      await api.routers.delete(router.id);
      toast.success('Router deleted');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onManage(router.id)}
      onKeyDown={(e) => e.key === 'Enter' && onManage(router.id)}
      className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card hover:shadow-card-hover hover:border-primary-300/50 transition-all duration-200 group cursor-pointer"
      onMouseEnter={() => !hasLoaded && loadStats()}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`p-3 rounded-xl ${
              isOnline ? 'bg-primary-50' : isTunnelFailed ? 'bg-amber-50' : 'bg-red-50'
            }`}
          >
            <Wifi
              className={`w-6 h-6 ${
                isOnline ? 'text-primary-600' : isTunnelFailed ? 'text-amber-600' : 'text-red-500'
              }`}
              strokeWidth={2}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-navy-900 text-lg">{router.name}</h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                  isOnline
                    ? 'bg-primary-100 text-primary-700'
                    : isTunnelFailed
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                }`}
              >
                {isOnline ? 'Online' : isTunnelFailed ? 'Tunnel failed' : 'Offline'}
              </span>
            </div>
            {router.location && (
              <p className="text-sm text-navy-600 flex items-center gap-1.5 mt-1">
                <MapPin className="w-4 h-4 text-navy-400 shrink-0" />
                {router.location}
              </p>
            )}
            {(router.billing_owner_id != null || router.billing_hotspot_key) && (
              <p className="text-xs text-navy-500 mt-1">
                Billing: {router.billing_hotspot_key || `owner #${router.billing_owner_id}`}
              </p>
            )}
            <p className="text-xs text-navy-500 mt-1">
              RouterHub ID: <span className="font-mono">{router.id}</span>
            </p>
          </div>
        </div>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg bg-navy-100 border border-navy-300 text-navy-600 hover:bg-navy-200 transition"
            aria-label="More options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 py-1 rounded-xl bg-white border border-navy-200 shadow-elevated z-20 min-w-[140px]">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onManage(router.id);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-navy-700 hover:bg-navy-50 rounded-lg mx-1"
                >
                  <Settings className="w-4 h-4" />
                  Manage
                </button>
                <button
                  onClick={handleReboot}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-navy-700 hover:bg-navy-50 disabled:opacity-50 rounded-lg mx-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reboot
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg mx-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-5 text-sm">
        {router.wg_ip && (
          <span className="flex items-center gap-2 text-navy-600">
            <Shield className="w-4 h-4 text-primary-500 shrink-0" />
            <span className="font-mono text-xs">{router.wg_ip}</span>
          </span>
        )}
        <span className="flex items-center gap-2 text-navy-600">
          <Users className="w-4 h-4 text-navy-400 shrink-0" />
          {connectionStats
            ? connectionStats.hotspotEnabled
              ? `${connectionStats.hotspotUsers.length} users logged in`
              : `${connectionStats.dhcpLeaseCount} devices connected`
            : '—'}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onManage(router.id)}
          className="flex-1 min-w-[100px] py-2.5 px-4 rounded-xl btn-primary text-sm"
        >
          <Settings className="w-4 h-4" />
          Manage
        </button>
        {router.wg_ip && (
          <button
            onClick={openMikHmon}
            disabled={mikhmonLoading}
            className="py-2.5 px-4 rounded-xl bg-accent-50 text-accent-700 hover:bg-accent-100 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {mikhmonLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            MikHmon ↗
          </button>
        )}
        <button
          onClick={() => onVouchers(router.id)}
          className="flex-1 min-w-[100px] py-2.5 px-4 rounded-xl btn-secondary text-sm relative"
        >
          <Key className="w-4 h-4" />
          Vouchers
          {pendingExport !== null && pendingExport > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-white text-xs font-bold flex items-center justify-center">
              {pendingExport}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
