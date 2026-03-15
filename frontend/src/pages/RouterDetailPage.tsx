import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import {
  Wifi,
  Shield,
  Link2,
  Activity,
  FileText,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { api, type Router, type TunnelStatus, type HotspotProfile } from '../lib/api';

type OutletContext = { router: Router; tunnelStatus: TunnelStatus | null };

export function RouterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { router, tunnelStatus } = useOutletContext<OutletContext>();
  const routerId = parseInt(id || '0', 10);
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [mikhmonLoading, setMikhmonLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!routerId) return;
    api.routers.profiles.list(routerId).then(setProfiles).catch(() => setProfiles([]));
  }, [routerId]);

  async function openMikHmon() {
    if (!tunnelStatus?.tunnel_up) {
      setToast('Tunnel must be online to open MikHmon');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setMikhmonLoading(true);
    try {
      const { url } = await api.routers.mikhmonUrl(routerId);
      window.open(url, '_blank');
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to get MikHmon URL');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setMikhmonLoading(false);
    }
  }

  const isOnline = tunnelStatus?.tunnel_up ?? router.status === 'online';

  return (
    <div>
      {toast && (
        <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          {toast}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card">
            <h3 className="font-semibold text-navy-900 mb-4">Router Info</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-navy-500">Location</dt>
                <dd className="font-medium text-navy-900">{router.location || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-navy-500">Status</dt>
                <dd>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-sm font-medium ${
                      isOnline ? 'bg-primary-100 text-primary-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {isOnline ? (
                      <>
                        <Activity className="w-4 h-4" /> Online
                      </>
                    ) : (
                      <>
                        <Wifi className="w-4 h-4" /> Offline
                      </>
                    )}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-navy-500">Connection IP</dt>
                <dd className="font-mono text-sm text-navy-900">
                  {router.lan_ip || router.wg_ip || '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card">
            <h3 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary-500" />
              WireGuard Connection
            </h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-navy-500">Tunnel IP</dt>
                <dd className="font-mono text-navy-900">{router.wg_ip || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-navy-500">Status</dt>
                <dd>
                  {tunnelStatus?.tunnel_up ? (
                    <span className="text-primary-600 font-medium">Online ✅</span>
                  ) : (
                    <span className="text-red-600 font-medium">Offline ❌</span>
                  )}
                </dd>
              </div>
              {tunnelStatus?.last_handshake && (
                <div>
                  <dt className="text-sm text-navy-500">Handshake</dt>
                  <dd className="text-navy-900">
                    {tunnelStatus.minutes_ago !== null
                      ? `${tunnelStatus.minutes_ago} minute(s) ago`
                      : '—'}
                  </dd>
                </div>
              )}
              {tunnelStatus &&
                (tunnelStatus.bytes_sent > 0 || tunnelStatus.bytes_received > 0) && (
                  <div>
                    <dt className="text-sm text-navy-500">Data</dt>
                    <dd className="text-navy-900">
                      Sent: {(tunnelStatus.bytes_sent / 1024 / 1024).toFixed(2)} MB | Recv:{' '}
                      {(tunnelStatus.bytes_received / 1024 / 1024).toFixed(2)} MB
                    </dd>
                  </div>
                )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
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
                Open in MikHmon ↗
              </button>
              <button
                onClick={() => navigate(`/routers/${routerId}/connect`)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-50 text-primary-700 font-medium hover:bg-primary-100 transition"
              >
                <Link2 className="w-4 h-4" />
                View Connection Commands
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card lg:col-span-2">
            <h3 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary-500" />
              Hotspot Profiles
            </h3>
            <p className="text-sm text-navy-600 mb-4">
              {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-2 mb-4">
              {profiles.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center py-2 px-3 rounded-lg bg-navy-50"
                >
                  <span className="font-medium text-navy-900">{p.display_name}</span>
                  <span className="text-navy-600">UGX {Number(p.price).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate(`/routers/${routerId}/profiles`)}
              className="px-4 py-2.5 rounded-xl btn-primary text-sm"
            >
              Manage Profiles
            </button>
          </div>
        </div>
    </div>
  );
}
