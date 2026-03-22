import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import {
  Wifi,
  Shield,
  Link2,
  Activity,
  FileText,
  ExternalLink,
  Loader2,
  Users,
  Cpu,
  Clock,
  Key,
  User,
  AlertCircle,
} from 'lucide-react';
import { api, type Router, type TunnelStatus, type HotspotProfile, type RouterStats, type ConnectionStats } from '../lib/api';
import { useToast } from '../contexts/ToastContext';

type OutletContext = {
  router: Router;
  tunnelStatus: TunnelStatus | null;
  openVouchers?: () => void;
  refreshVouchers?: number;
  refreshRouter?: () => void;
};

export function RouterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { router, tunnelStatus, openVouchers, refreshVouchers, refreshRouter } = useOutletContext<OutletContext>();
  const routerId = parseInt(id || '0', 10);
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [connectionStats, setConnectionStats] = useState<ConnectionStats | null>(null);
  const [stats, setStats] = useState<RouterStats | null>(null);
  const [pendingExport, setPendingExport] = useState<number | null>(null);
  const [mikhmonLoading, setMikhmonLoading] = useState(false);
  const [enableWebfigLoading, setEnableWebfigLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [billingOwnerId, setBillingOwnerId] = useState<string>('');
  const [savingBilling, setSavingBilling] = useState(false);
  const [webfigTargetPort, setWebfigTargetPort] = useState<string>('');
  const [savingWebfigPort, setSavingWebfigPort] = useState(false);

  const isOnline = tunnelStatus?.tunnel_up ?? router.status === 'online';

  useEffect(() => {
    setBillingOwnerId(router.billing_owner_id != null ? String(router.billing_owner_id) : '');
  }, [router.billing_owner_id]);

  useEffect(() => {
    setWebfigTargetPort(router.webfig_target_port != null ? String(router.webfig_target_port) : '80');
  }, [router.webfig_target_port]);

  useEffect(() => {
    if (!routerId) return;
    api.routers.profiles.list(routerId).then(setProfiles).catch(() => setProfiles([]));
  }, [routerId]);

  const fetchConnectionData = useCallback(async () => {
    if (!routerId || !isOnline) return;
    setLoadingUsers(true);
    setLoadingStats(true);
    try {
      const [connStats, s, p] = await Promise.all([
        api.routers.connectionStats(routerId).catch(() => null),
        api.routers.stats(routerId).catch(() => null),
        api.vouchers.pendingCount(routerId).catch(() => ({ count: 0 })),
      ]);
      setConnectionStats(connStats);
      setStats(s || null);
      setPendingExport(p?.count ?? 0);
    } finally {
      setLoadingUsers(false);
      setLoadingStats(false);
    }
  }, [routerId, isOnline]);

  useEffect(() => {
    fetchConnectionData();
  }, [fetchConnectionData, refreshVouchers]);

  useEffect(() => {
    if (!isOnline) return;
    const id = setInterval(fetchConnectionData, 25000);
    return () => clearInterval(id);
  }, [isOnline, fetchConnectionData]);

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

  async function saveWebfigTargetPort() {
    setSavingWebfigPort(true);
    try {
      const val = parseInt(webfigTargetPort, 10);
      if (isNaN(val) || val < 1 || val > 65535) {
        toast.error('Port must be 1–65535');
        return;
      }
      await api.routers.update(routerId, { webfig_target_port: val });
      toast.success(`WebFig port set to ${val}. For existing proxies, update Apache config on VPS.`);
      await refreshRouter?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingWebfigPort(false);
    }
  }

  async function handleEnableWebfigWinbox() {
    setEnableWebfigLoading(true);
    try {
      await api.routers.enableWebfigWinbox(routerId);
      toast.success('WebFig and Winbox enabled. Try opening them again.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to enable services');
    } finally {
      setEnableWebfigLoading(false);
    }
  }

  async function saveBillingOwner() {
    setSavingBilling(true);
    try {
      const val = billingOwnerId.trim();
      await api.routers.update(routerId, { billing_owner_id: val === '' ? null : parseInt(val, 10) });
      toast.success('Billing owner linked');
      await refreshRouter?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save billing owner');
    } finally {
      setSavingBilling(false);
    }
  }

  const res = stats?.resources || {};
  const cpuLoad = res['cpu-load'] ?? null;
  const totalMem = res['total-memory'] ?? 0;
  const freeMem = res['free-memory'] ?? 0;
  const usedMem = totalMem > 0 ? totalMem - freeMem : 0;
  const memPercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : null;
  const uptime = res.uptime || null;

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-navy-200/80 bg-white p-6 shadow-card">
          <h3 className="text-label text-navy-500 mb-3">Router Info</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-navy-500">Location</dt>
              <dd className="font-medium text-navy-900">{router.location || '—'}</dd>
            </div>
            <div>
              <dt className="text-navy-500">Status</dt>
              <dd>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${
                    isOnline ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {isOnline ? <Activity className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-navy-500">Connection IP</dt>
              <dd className="font-mono text-navy-900">{router.lan_ip || router.wg_ip || '—'}</dd>
            </div>
            <div>
              <dt className="text-navy-500">RouterHub ID</dt>
              <dd className="font-mono text-navy-900">{router.id}</dd>
            </div>
          </dl>

          <div className="mt-4 pt-4 border-t border-navy-200">
            <p className="text-sm font-medium text-navy-700 mb-2">Billing link</p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={1}
                placeholder="Billing owner id (hotspot_owners.id)"
                value={billingOwnerId}
                onChange={(e) => setBillingOwnerId(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
              />
              <button
                type="button"
                onClick={saveBillingOwner}
                disabled={savingBilling}
                className="px-4 py-2.5 rounded-xl btn-primary disabled:opacity-60"
              >
                {savingBilling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
            </div>
            <p className="text-xs text-navy-500 mt-2">
              Use the billing numeric owner id (same as billing users.hotspot_owner_id). This controls what the owner sees in billing “My Routers”.
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-navy-200">
            <label className="block text-sm font-medium text-navy-600 mb-2">WebFig port (MikroTik www)</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={1}
                max={65535}
                placeholder="80"
                value={webfigTargetPort}
                onChange={(e) => setWebfigTargetPort(e.target.value)}
                className="w-24 px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
              />
              <button
                type="button"
                onClick={saveWebfigTargetPort}
                disabled={savingWebfigPort}
                className="px-4 py-2.5 rounded-xl btn-primary disabled:opacity-60"
              >
                {savingWebfigPort ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
            </div>
            <p className="text-xs text-navy-500 mt-2">
              MikroTik www service port (default 80). Use 85 if your router uses port 85. New proxies use this; existing ones need Apache config update on VPS.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-navy-200/80 bg-white p-6 shadow-card">
          <h3 className="text-label text-navy-500 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-500" strokeWidth={2} />
            WireGuard
          </h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-navy-500">Tunnel IP</dt>
              <dd className="font-mono text-navy-900">{router.wg_ip || '—'}</dd>
            </div>
            <div>
              <dt className="text-navy-500">Tunnel</dt>
              <dd>
                {tunnelStatus?.tunnel_up ? (
                  <span className="text-primary-600 font-medium">Connected</span>
                ) : (
                  <span className="text-red-600 font-medium">Disconnected</span>
                )}
              </dd>
            </div>
            {tunnelStatus?.last_handshake && (
              <div>
                <dt className="text-navy-500">Last handshake</dt>
                <dd className="text-navy-900">
                  {tunnelStatus.minutes_ago !== null ? `${tunnelStatus.minutes_ago} min ago` : '—'}
                </dd>
              </div>
            )}
          </dl>
          {(router.winbox_url || router.webfig_url) && (
            <div className="mt-2 space-y-1">
              {router.winbox_url && (
                <div>
                  <dt className="text-navy-500">Winbox</dt>
                  <dd className="font-mono text-navy-900 text-xs">{router.winbox_url}</dd>
                </div>
              )}
              {router.webfig_url && (
                <div>
                  <dt className="text-navy-500">WebFig</dt>
                  <dd className="font-mono text-navy-900 text-xs">{router.webfig_url}</dd>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {router.winbox_url && (
              <span
                className="text-xs px-3 py-1.5 rounded-lg bg-navy-100 text-navy-700 font-mono"
                title="Use this in Winbox: Connect To"
              >
                Winbox: {router.winbox_url}
              </span>
            )}
            {router.webfig_url && (
              <a
                href={router.webfig_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                Open WebFig ↗
              </a>
            )}
            <button
              onClick={openMikHmon}
              disabled={mikhmonLoading || !tunnelStatus?.tunnel_up}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent-50 text-accent-700 hover:bg-accent-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              {mikhmonLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
              MikHmon
            </button>
            <button
              onClick={() => navigate(`/routers/${routerId}/connect`)}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 flex items-center gap-1.5"
            >
              <Link2 className="w-3 h-3" />
              Commands
            </button>
            <button
              onClick={handleEnableWebfigWinbox}
              disabled={enableWebfigLoading || !isOnline}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1.5"
              title="Enable WebFig and Winbox if they don't work over WireGuard"
            >
              {enableWebfigLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
              Fix WebFig/Winbox
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-navy-200/80 bg-white p-6 shadow-card">
          <h3 className="text-label text-navy-500 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary-500" strokeWidth={2} />
            Router Health
          </h3>
          {!isOnline ? (
            <p className="text-sm text-navy-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Router offline — connect tunnel to see stats
            </p>
          ) : loadingStats ? (
            <div className="flex items-center gap-2 text-sm text-navy-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              {cpuLoad != null && (
                <div>
                  <dt className="text-navy-500">CPU Load</dt>
                  <dd className="font-medium text-navy-900">{cpuLoad}%</dd>
                </div>
              )}
              {totalMem > 0 && (
                <div>
                  <dt className="text-navy-500">Memory</dt>
                  <dd className="font-medium text-navy-900">
                    {memPercent != null ? `${memPercent}%` : '—'} used
                    <span className="text-navy-500 font-normal ml-1">
                      ({Math.round(usedMem / 1024 / 1024)} / {Math.round(totalMem / 1024 / 1024)} MB)
                    </span>
                  </dd>
                </div>
              )}
              {uptime && (
                <div>
                  <dt className="text-navy-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Uptime
                  </dt>
                  <dd className="font-medium text-navy-900">{uptime}</dd>
                </div>
              )}
              {!cpuLoad && !totalMem && !uptime && (
                <p className="text-navy-500">No stats available</p>
              )}
            </dl>
          )}
        </div>

        <div className="rounded-2xl border border-navy-200/80 bg-white p-6 shadow-card">
          <h3 className="text-label text-navy-500 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-500" strokeWidth={2} />
            {connectionStats?.hotspotEnabled ? 'Active Users' : 'Devices on Network'}
          </h3>
          {!isOnline ? (
            <p className="text-sm text-navy-500">Router offline</p>
          ) : loadingUsers ? (
            <div className="flex items-center gap-2 text-sm text-navy-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="font-display font-semibold text-display text-navy-900">
                {connectionStats?.hotspotEnabled
                  ? (connectionStats.hotspotUsers?.length ?? 0)
                  : (connectionStats?.dhcpLeaseCount ?? 0)}
              </span>
              <span className="text-body text-navy-500">
                {connectionStats?.hotspotEnabled ? 'users logged in' : 'devices connected'}
              </span>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => navigate(`/routers/${routerId}/profiles`)}
              className="text-xs px-3 py-1.5 rounded-lg btn-primary"
            >
              Profiles
            </button>
            <button
              onClick={() => openVouchers?.()}
              className="text-xs px-3 py-1.5 rounded-lg btn-secondary"
            >
              <Key className="w-3 h-3 inline mr-1" />
              Vouchers {pendingExport != null && pendingExport > 0 && `(${pendingExport})`}
            </button>
          </div>
        </div>
      </div>

      {/* Connected users (only when hotspot enabled, we have per-user data) */}
      {isOnline && connectionStats?.hotspotEnabled && connectionStats.hotspotUsers.length > 0 && (
        <div className="rounded-2xl border border-navy-200/80 bg-white p-6 shadow-card">
          <h3 className="font-display font-semibold text-title text-navy-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-primary-500" strokeWidth={2} />
            Connected Devices ({connectionStats.hotspotUsers.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-navy-200 text-left">
                  <th className="py-3 px-4 font-medium text-navy-600">Username</th>
                  <th className="py-3 px-4 font-medium text-navy-600">IP Assigned</th>
                  <th className="py-3 px-4 font-medium text-navy-600">Uptime</th>
                  <th className="py-3 px-4 font-medium text-navy-600">MAC Address</th>
                  <th className="py-3 px-4 font-medium text-navy-600">Bundle Expiry Left</th>
                </tr>
              </thead>
              <tbody>
                {connectionStats.hotspotUsers.map((u, i) => (
                  <tr key={i} className="border-b border-navy-100 last:border-0 hover:bg-navy-50/50">
                    <td className="py-3 px-4 font-medium text-navy-900">{u.user || '—'}</td>
                    <td className="py-3 px-4 font-mono text-navy-600 text-xs">{u.address || '—'}</td>
                    <td className="py-3 px-4 text-navy-600">{u.uptime || '—'}</td>
                    <td className="py-3 px-4 font-mono text-navy-600 text-xs">{u['mac-address'] || '—'}</td>
                    <td className="py-3 px-4 text-navy-600">{u['session-time-left'] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hotspot profiles */}
      <div className="rounded-2xl border border-navy-200/80 bg-white p-6 shadow-card">
        <h3 className="font-display font-semibold text-title text-navy-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-500" strokeWidth={2} />
          Hotspot Profiles ({profiles.length})
        </h3>
        {profiles.length === 0 ? (
          <p className="text-navy-500 text-sm">No profiles. Add or sync from MikroTik.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <div
                key={p.id}
                className="flex justify-between items-center py-3 px-4 rounded-xl bg-navy-50 border border-navy-100"
              >
                <span className="font-medium text-navy-900">{p.display_name}</span>
                <span className="text-navy-600 text-sm">UGX {Number(p.price).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => navigate(`/routers/${routerId}/profiles`)}
          className="mt-4 px-4 py-2.5 rounded-xl btn-primary text-sm"
        >
          Manage Profiles
        </button>
      </div>
    </div>
  );
}
