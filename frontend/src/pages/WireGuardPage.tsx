import { useState, useEffect } from 'react';
import { Shield, Loader2, Activity } from 'lucide-react';
import { api, type WireGuardPeer } from '../lib/api';
import { PageHeader } from '../components/PageHeader';

export function WireGuardPage() {
  const [peers, setPeers] = useState<WireGuardPeer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.wireguard
      .status()
      .then(setPeers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading tunnels...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="WireGuard"
        subtitle="Tunnel status for all routers connected to your VPS"
      />

      <div className="space-y-4">
        {peers.map((peer) => (
          <div
            key={peer.id}
            className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card flex items-center justify-between flex-wrap gap-4"
          >
            <div className="flex items-center gap-4">
              <div
                className={`p-3 rounded-xl ${
                  peer.status === 'connected'
                    ? 'bg-primary-50'
                    : 'bg-red-50'
                }`}
              >
                <Shield
                  className={`w-6 h-6 ${
                    peer.status === 'connected'
                      ? 'text-primary-600'
                      : 'text-red-500'
                  }`}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-navy-900 text-lg">
                    {peer.router_name || `Router #${peer.router_id}`}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                      peer.status === 'connected'
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {peer.status}
                  </span>
                </div>
                <p className="text-sm text-navy-600 font-mono mt-0.5">
                  {peer.wg_ip}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm text-navy-600">
              {peer.last_handshake && (
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  {new Date(peer.last_handshake).toLocaleString()}
                </span>
              )}
              {peer.bytes_sent != null && (peer.bytes_sent > 0 || (peer.bytes_received || 0) > 0) && (
                <>
                  <span>↓ {((peer.bytes_received || 0) / 1024 / 1024).toFixed(2)} MB</span>
                  <span>↑ {((peer.bytes_sent || 0) / 1024 / 1024).toFixed(2)} MB</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {peers.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-navy-200 bg-white p-16 text-center">
          <div className="inline-flex p-6 rounded-3xl bg-gradient-to-br from-primary-50 to-accent-50 mb-6">
            <Shield className="w-16 h-16 text-primary-500" strokeWidth={1.5} />
          </div>
          <p className="text-navy-600 font-medium">No WireGuard tunnels yet.</p>
          <p className="text-sm text-navy-500 mt-1">Add a router and run the connect commands to create tunnels.</p>
        </div>
      )}
    </div>
  );
}
