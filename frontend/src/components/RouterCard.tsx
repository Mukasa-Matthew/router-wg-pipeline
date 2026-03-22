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

  const statusStyles = {
    online: { bg: 'bg-primary-50', text: 'text-primary-700', badge: 'bg-primary-100' },
    tunnel_failed: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100' },
    offline: { bg: 'bg-slate-100', text: 'text-slate-600', badge: 'bg-slate-200' },
  };
  const status = isOnline ? 'online' : isTunnelFailed ? 'tunnel_failed' : 'offline';
  const styles = statusStyles[status];

  const connectionLabel = connectionStats
    ? connectionStats.hotspotEnabled
      ? `${connectionStats.hotspotUsers.length} users`
      : `${connectionStats.dhcpLeaseCount} devices`
    : '—';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onManage(router.id)}
      onKeyDown={(e) => e.key === 'Enter' && onManage(router.id)}
      className="flex flex-col h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer"
      onMouseEnter={() => !hasLoaded && loadStats()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`p-2.5 rounded-lg shrink-0 ${styles.bg}`}>
            <Wifi className={`w-5 h-5 ${styles.text}`} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 text-[15px] leading-snug break-words">
              {router.name}
            </h3>
            {router.location && (
              <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                <span className="break-words">{router.location}</span>
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles.badge} ${styles.text}`}>
                {isOnline ? 'Online' : isTunnelFailed ? 'Tunnel failed' : 'Offline'}
              </span>
              <span className="text-xs text-slate-400">ID {router.id}</span>
            </div>
          </div>
        </div>
        <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            aria-label="More options"
          >
            <MoreVertical className="w-4 h-4" strokeWidth={2} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 py-1 rounded-lg bg-white border border-slate-200 shadow-lg z-20 min-w-[140px]">
                <button
                  onClick={() => { setMenuOpen(false); onManage(router.id); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                >
                  <Settings className="w-4 h-4 shrink-0" /> Manage
                </button>
                <button
                  onClick={handleReboot}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-left"
                >
                  <RefreshCw className="w-4 h-4 shrink-0" /> Reboot
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 text-left"
                >
                  <Trash2 className="w-4 h-4 shrink-0" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats - fixed height for alignment */}
      <div className="mt-4 py-3 border-t border-slate-100 flex items-center gap-4 text-sm text-slate-600 min-h-[2.75rem]">
        {router.wg_ip ? (
          <span className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-primary-600 shrink-0" strokeWidth={2} />
            <span className="font-mono text-xs">{router.wg_ip}</span>
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={2} />
          {connectionLabel}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-auto pt-4 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onManage(router.id)}
          className="flex-1 min-w-[100px] inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition"
        >
          <Settings className="w-4 h-4 shrink-0" strokeWidth={2} />
          Manage
        </button>
        {router.wg_ip && (
          <button
            onClick={openMikHmon}
            disabled={mikhmonLoading}
            className="inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition"
          >
            {mikhmonLoading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <ExternalLink className="w-4 h-4 shrink-0" strokeWidth={2} />}
            MikHmon
          </button>
        )}
        <button
          onClick={() => onVouchers(router.id)}
          className="inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition relative"
        >
          <Key className="w-4 h-4 shrink-0" strokeWidth={2} />
          Vouchers
          {pendingExport !== null && pendingExport > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-primary-500 text-white text-[10px] font-semibold">
              {pendingExport}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
