import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  Copy,
  Check,
  Printer,
  Wifi,
  Shield,
  CheckCircle,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { api, type ConnectCommands, type TunnelStatus } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { PageHeader } from '../components/PageHeader';

const STEPS = [
  { title: 'Remove existing wg-vps (clean retry)', key: 'step0' as const },
  { title: 'Create WireGuard Interface', key: 'step1' as const },
  { title: 'Add VPS as Peer', key: 'step2' as const },
  { title: "Assign This Router's Unique WireGuard IP", key: 'step3' as const },
  { title: 'Add Route to VPS Subnet', key: 'step4' as const },
  { title: 'Allow WireGuard in Firewall', key: 'step5' as const },
  { title: 'Enable API Port', key: 'step6' as const },
  { title: 'Verify Peers', key: 'step7' as const },
];

export function ConnectRouterPage() {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const routerId = parseInt(id || '0', 10);
  const [commands, setCommands] = useState<ConnectCommands | null>(null);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [doneSteps, setDoneSteps] = useState<Record<number, boolean>>({});
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [autoRedirect, setAutoRedirect] = useState(false);
  const [reAdding, setReAdding] = useState(false);

  const loadCommands = useCallback(async () => {
    if (!routerId) return;
    try {
      const data = await api.routers.connectCommands(routerId);
      setCommands(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [routerId]);

  const testTunnel = useCallback(async () => {
    if (!routerId) return;
    setTesting(true);
    try {
      const data = await api.routers.testTunnel(routerId);
      setTunnelStatus(data);
    } catch (err) {
      setTunnelStatus({
        tunnel_up: false,
        last_handshake: null,
        minutes_ago: null,
        wg_ip: '',
        bytes_sent: 0,
        bytes_received: 0,
      });
    } finally {
      setTesting(false);
    }
  }, [routerId]);

  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  useEffect(() => {
    if (!routerId) return;
    testTunnel();
    const interval = setInterval(async () => {
      try {
        const result = await api.routers.testTunnel(routerId);
        setTunnelStatus(result);
        if (result.tunnel_up) {
          setAutoRedirect(true);
          setTimeout(() => navigate(`/routers/${routerId}`), 3000);
        }
      } catch {
        // ignore
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [routerId, navigate]);

  function copyCommand(cmd: string, stepIdx: number) {
    navigator.clipboard.writeText(cmd);
    setCopiedStep(stepIdx);
    setTimeout(() => setCopiedStep(null), 2000);
  }

  function copyAll() {
    if (commands?.commands.all) {
      navigator.clipboard.writeText(commands.commands.all);
      setCopiedStep(-1);
      setTimeout(() => setCopiedStep(null), 2000);
    }
  }

  function printCommands() {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !commands) return;
    printWindow.document.write(`
      <html><head><title>Connect ${commands.router_name}</title>
      <style>body{font-family:monospace;padding:20px;white-space:pre-wrap;}
      h1{font-size:18px;} .step{margin:16px 0;padding:12px;background:#f5f5f5;border-radius:8px;}
      code{display:block;margin:8px 0;}</style></head><body>
      <h1>Connect ${commands.router_name} to RouterHub</h1>
      <p>Location: ${commands.location || '—'} | WireGuard IP: ${commands.wg_ip}</p>
      ${STEPS.filter((s) => commands.commands[s.key as keyof typeof commands.commands]).map((s, i) => `
        <div class="step">
          <strong>Step ${i + 1}: ${s.title}</strong>
          <code>${commands.commands[s.key as keyof typeof commands.commands]}</code>
        </div>
      `).join('')}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  }

  function toggleStepDone(stepIdx: number) {
    setDoneSteps((p) => ({ ...p, [stepIdx]: !p[stepIdx] }));
  }

  async function handleReAddPeer() {
    if (!routerId) return;
    setReAdding(true);
    try {
      await api.routers.reAddPeer(routerId);
      toast.success('Peer re-added to VPS. Run the connect commands on the MikroTik again.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to re-add peer');
    } finally {
      setReAdding(false);
    }
  }

  if (loading || !commands) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading connection commands...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`Connect ${commands.router_name} to RouterHub`}
        subtitle="Run these commands in your MikroTik Winbox Terminal or SSH"
      />

      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <span className="px-3 py-1.5 rounded-lg bg-navy-100 text-navy-700 text-sm font-medium">
          {commands.location || 'No location'}
        </span>
        <span className="px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 text-sm font-mono">
          WireGuard IP: {commands.wg_ip}
        </span>
        <span
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
            commands.tunnel_status === 'online'
              ? 'bg-primary-100 text-primary-700'
              : 'bg-navy-100 text-navy-600'
          }`}
        >
          {commands.tunnel_status === 'online' ? (
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Offline
            </span>
          )}
        </span>
      </div>
      {commands.webfig_url && (
        <div className="mb-6 flex items-center gap-2">
          <span className="text-sm font-medium text-navy-700">WebFig Access:</span>
          <a
            href={commands.webfig_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-primary-50 text-primary-700 font-mono text-sm hover:bg-primary-100"
          >
            {commands.webfig_url} ↗
          </a>
        </div>
      )}

      <div className="space-y-4 mb-8">
        {STEPS.map((step, i) => {
          const cmd = commands.commands[step.key as keyof typeof commands.commands];
          if (!cmd) return null;
          return (
          <div
            key={step.key}
            className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700 font-bold text-sm">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold text-navy-900">{step.title}</h3>
                  <label className="flex items-center gap-2 text-sm text-navy-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!doneSteps[i]}
                      onChange={() => toggleStepDone(i)}
                      className="rounded border-navy-300"
                    />
                    Mark as done
                  </label>
                </div>
                <pre className="p-4 rounded-xl bg-navy-900 text-navy-100 text-sm overflow-x-auto font-mono">
                  {cmd}
                </pre>
              </div>
              <button
                onClick={() => copyCommand(cmd, i)}
                className="p-2 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-700 transition shrink-0"
                title="Copy command"
              >
                {copiedStep === i ? (
                  <Check className="w-5 h-5 text-primary-500" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <button onClick={copyAll} className="btn-primary">
          {copiedStep === -1 ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          Copy All Commands
        </button>
        <button onClick={printCommands} className="btn-secondary">
          <Printer className="w-5 h-5" />
          Print Commands
        </button>
        <button
          onClick={testTunnel}
          disabled={testing}
          className="btn-secondary disabled:opacity-60"
        >
          {testing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
          Test Connection
        </button>
        <button
          onClick={handleReAddPeer}
          disabled={reAdding}
          className="btn-secondary disabled:opacity-60"
          title="Re-add WireGuard peer to VPS if it wasn't added during router add"
        >
          {reAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
          Re-add Peer to VPS
        </button>
        <button
          onClick={() => navigate(`/routers`)}
          className="btn-secondary"
        >
          <Wifi className="w-5 h-5" />
          Go to Routers
        </button>
      </div>

      {!tunnelStatus?.tunnel_up && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-6">
          <h3 className="font-semibold text-amber-900 mb-2">Tunnel still offline? Check these:</h3>
          <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside mb-3">
            <li><strong>RouterOS 7.6+</strong> required (WireGuard not in ROS 6)</li>
            <li><strong>VPS firewall:</strong> Run on VPS: <code className="bg-amber-100 px-1 rounded">sudo ufw allow 51820/udp && sudo ufw reload</code></li>
            <li><strong>Peer on VPS:</strong> If add failed, click &quot;Re-add Peer to VPS&quot; above</li>
            <li><strong>Run step 0 first</strong> to remove old wg-vps, then run steps 1–6 in order</li>
          </ul>
          {commands?.vps_ip && (
            <p className="text-xs text-amber-700">VPS: {commands.vps_ip}:{commands.wg_port || '51820'} (UDP)</p>
          )}
        </div>
      )}
      {!tunnelStatus?.tunnel_up && (
        <p className="text-sm text-navy-600 mb-4 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for tunnel... checking every 10s
        </p>
      )}
      {tunnelStatus && (
        <div
          className={`rounded-2xl border p-6 mb-8 ${
            tunnelStatus.tunnel_up
              ? 'bg-primary-50 border-primary-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          {tunnelStatus.tunnel_up ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-primary-600 shrink-0" />
              <div>
                <p className="font-semibold text-primary-800">
                  {autoRedirect
                    ? 'Tunnel is UP — Redirecting to router dashboard...'
                    : `Tunnel is UP — Last handshake: ${tunnelStatus.minutes_ago} minute(s) ago`}
                </p>
                <p className="text-sm text-primary-700 mt-1">
                  Data sent: {(tunnelStatus.bytes_sent / 1024 / 1024).toFixed(2)} MB | Received:{' '}
                  {(tunnelStatus.bytes_received / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-600 shrink-0" />
              <p className="font-semibold text-red-800">
                Tunnel is DOWN — Make sure you ran all commands above
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => navigate(`/routers/${routerId}`)}
          disabled={!tunnelStatus?.tunnel_up}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition ${
            tunnelStatus?.tunnel_up
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-navy-200 text-navy-500 cursor-not-allowed'
          }`}
        >
          Go to Router Dashboard
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
