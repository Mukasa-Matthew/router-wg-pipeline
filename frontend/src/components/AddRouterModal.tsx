import { useState } from 'react';
import { X, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { api, type AddRouterData } from '../lib/api';

const STEPS = [
  'Testing MikroTik connection (or skipped)',
  'Generating WireGuard keys',
  'Assigning WireGuard IP',
  'Adding peer to VPS',
  'Saving router to database',
  'Router saved — run connect commands on MikroTik',
];

interface AddRouterModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (routerId?: number) => void;
}

const initial: AddRouterData = {
  name: '',
  location: '',
  lan_ip: '',
  api_port: 8728,
  username: 'admin',
  password: '',
};

export function AddRouterModal({
  open,
  onClose,
  onSuccess,
}: AddRouterModalProps) {
  const [form, setForm] = useState<AddRouterData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stepStatus, setStepStatus] = useState<Record<number, 'pending' | 'active' | 'done' | 'error'>>({});
  const [currentMessage, setCurrentMessage] = useState('');

  function update(f: Partial<AddRouterData>) {
    setForm((p) => ({ ...p, ...f }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStepStatus({});
    setCurrentMessage('');
    setLoading(true);

    try {
      // When skipping connection test, use simple POST (fast, no SSE). Apache buffers SSE by default.
      if (form.skipConnectionTest) {
        const { router_id } = await api.routers.add(form);
        setForm(initial);
        onSuccess(router_id);
        onClose();
        return;
      }

      const { jobId } = await api.routers.addWithProgress(form);

      const es = new EventSource(api.routers.progressUrl(jobId), { withCredentials: true });

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.done) {
            es.close();
            setLoading(false);
            if (data.success && data.router_id) {
              setForm(initial);
              onSuccess(data.router_id);
              onClose();
            } else {
              setError(data.message || 'Failed to add router');
            }
            return;
          }

          setCurrentMessage(data.message || '');
          setStepStatus((prev) => {
            const next = { ...prev };
            if (data.step !== undefined) {
              next[data.step] = data.status === 'error' ? 'error' : data.status;
              if (data.status === 'done' && data.step > 0) {
                for (let i = 1; i < data.step; i++) {
                  if (next[i] !== 'done') next[i] = 'done';
                }
              }
            }
            return next;
          });

          if (data.status === 'error') {
            setError(data.message || 'An error occurred');
            es.close();
            setLoading(false);
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      es.onerror = () => {
        es.close();
        if (loading) {
          setError('Connection lost. Check if the router was added.');
          setLoading(false);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add router');
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-elevated border border-navy-200 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-6 border-b border-navy-200">
          <h2 className="text-lg font-bold text-navy-900">Add Router</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-navy-100 border border-navy-300 text-navy-700 hover:bg-navy-200 transition"
            aria-label="Close"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <XCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          {Object.keys(stepStatus).length > 0 && (
            <div className="space-y-2">
              {STEPS.map((label, i) => {
                const status = stepStatus[i] || 'pending';
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 text-sm ${
                      status === 'error' ? 'text-red-600' : status === 'done' ? 'text-primary-600' : 'text-navy-600'
                    }`}
                  >
                    {status === 'active' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                    {status === 'done' && <CheckCircle className="w-4 h-4 text-primary-500 shrink-0" />}
                    {status === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
                    {status === 'pending' && (
                      <span className="w-4 h-4 rounded-full border-2 border-navy-300 shrink-0" />
                    )}
                    <span>
                      {label}
                      {status === 'active' && currentMessage && (
                        <span className="text-navy-500 ml-1">— {currentMessage}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {Object.keys(stepStatus).length === 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">Location</label>
                  <input
                    value={form.location || ''}
                    onChange={(e) => update({ location: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1.5">LAN IP *</label>
                <input
                  value={form.lan_ip}
                  onChange={(e) => update({ lan_ip: e.target.value })}
                  placeholder="192.168.88.1"
                  className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                  required
                />
                <p className="text-xs text-navy-500 mt-1">
                  Initial connection IP. Switches to WireGuard IP after tunnel is established.
                </p>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <input
                  type="checkbox"
                  id="skipConnectionTest"
                  checked={form.skipConnectionTest || false}
                  onChange={(e) => update({ skipConnectionTest: e.target.checked })}
                  className="mt-1 rounded border-navy-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="skipConnectionTest" className="text-sm text-navy-700 cursor-pointer">
                  <span className="font-medium">Skip connection test</span> — Use when the router is not reachable from the VPS (e.g. at 10.0.0.1 on your LAN). Keys will be generated and peer added to VPS; you will run the connect commands on the MikroTik manually.
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">API Username *</label>
                  <input
                    value={form.username}
                    onChange={(e) => update({ username: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1.5">API Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => update({ password: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900 focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl btn-primary disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Add Router'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
