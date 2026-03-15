import { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  Key,
  Download,
  Copy,
  Check,
  Plus,
} from 'lucide-react';
import { api, type Voucher, type Router, type HotspotProfile } from '../lib/api';

interface VoucherModalProps {
  routerId: number | null;
  onClose: () => void;
}

export function VoucherModal({ routerId, onClose }: VoucherModalProps) {
  const [router, setRouter] = useState<Router | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [pendingExport, setPendingExport] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [profile, setProfile] = useState('');
  const [count, setCount] = useState(10);
  const [prefix, setPrefix] = useState('v');
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    if (!routerId) return;
    (async () => {
      setLoading(true);
      try {
        const [r, v, pending, profs] = await Promise.all([
          api.routers.get(routerId),
          api.vouchers.list(routerId),
          api.vouchers.pendingCount(routerId),
          api.routers.profiles.list(routerId),
        ]);
        setRouter(r);
        setVouchers(v);
        setPendingExport(pending.count);
        setProfiles(profs);
        setProfile(profs[0]?.profile_name || '');
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [routerId]);

  async function handleGenerate() {
    if (!routerId || !profile) return;
    setGenLoading(true);
    try {
      const res = await api.vouchers.generate({
        routerId,
        profile,
        count,
        prefix,
      });
      setVouchers((p) => [...res.vouchers, ...p]);
      setPendingExport((prev) => (prev ?? 0) + res.vouchers.length);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setGenLoading(false);
    }
  }

  function copyVoucher(v: Voucher) {
    const text = `${v.username}\n${v.password}`;
    navigator.clipboard.writeText(text);
    setCopied(v.id);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!routerId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-elevated border border-navy-200 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-navy-200">
          <h2 className="text-lg font-bold text-navy-900 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary-50">
              <Key className="w-5 h-5 text-primary-600" />
            </div>
            Vouchers — {router?.name || '...'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-navy-100 border border-navy-300 text-navy-700 hover:bg-navy-200 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-auto flex-1">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-navy-600 mb-1">Profile</label>
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                className="min-w-[200px] px-3 py-2 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900"
              >
                {profiles.length === 0 && (
                  <option value="">No profiles — add in Profiles tab</option>
                )}
                {profiles.map((p) => (
                  <option key={p.id} value={p.profile_name}>
                    {p.display_name} — UGX {Number(p.price).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-600 mb-1">Count</label>
              <input
                type="number"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value, 10) || 10)}
                min={1}
                max={100}
                className="w-20 px-3 py-2 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900"
              />
            </div>
            {profile && count > 0 && (() => {
              const p = profiles.find((x) => x.profile_name === profile);
              const price = p ? Number(p.price) : 0;
              const total = price * count;
              return total > 0 ? (
                <p className="text-sm text-navy-600 self-center">
                  {count} × UGX {price.toLocaleString()} = UGX {total.toLocaleString()}
                </p>
              ) : null;
            })()}
            <div>
              <label className="block text-xs font-medium text-navy-600 mb-1">Prefix</label>
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-20 px-3 py-2 rounded-xl border border-navy-200 bg-navy-50/50 text-navy-900"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={genLoading || !profile}
              className="btn-primary disabled:opacity-60"
            >
              {genLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Generate
            </button>
            <a
              href={api.vouchers.exportUrl(routerId)}
              className={`btn-secondary ${pendingExport === 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
              download
              onClick={(e) => {
                if (pendingExport === 0) {
                  e.preventDefault();
                  alert('No new vouchers to export. Generate vouchers first.');
                }
              }}
              title={pendingExport === 0 ? 'No new vouchers to export' : `Export ${pendingExport} new voucher(s)`}
            >
              <Download className="w-4 h-4" />
              Export CSV {pendingExport !== null && pendingExport > 0 && `(${pendingExport} new)`}
            </a>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {vouchers.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-navy-50/80 border border-navy-200"
                >
                  <div className="font-mono text-sm">
                    <span className="text-navy-900 font-medium">{v.username}</span>
                    <span className="text-navy-400 mx-2">/</span>
                    <span className="text-navy-600">{v.password}</span>
                  </div>
                  <button
                    onClick={() => copyVoucher(v)}
                    className="p-2 rounded-lg bg-navy-200 border border-navy-300 text-navy-600 hover:bg-navy-300 transition"
                  >
                    {copied === v.id ? (
                      <Check className="w-4 h-4 text-primary-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
              {vouchers.length === 0 && (
                <p className="text-center text-navy-500 py-8">
                  No vouchers yet. Generate some above.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
