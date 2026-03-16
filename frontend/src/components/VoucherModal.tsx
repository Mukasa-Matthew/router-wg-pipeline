import { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  Key,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';
import { api, type Voucher, type Router, type HotspotProfile, type HotspotUser } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface VoucherModalProps {
  routerId: number | null;
  onClose: () => void;
  onVouchersChange?: () => void;
}

export function VoucherModal({ routerId, onClose, onVouchersChange }: VoucherModalProps) {
  const toast = useToast();
  const { confirm } = useConfirm();
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [activeUsers, setActiveUsers] = useState<HotspotUser[]>([]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!routerId) return;
    (async () => {
      setLoading(true);
      try {
        const [r, v, pending, profs, users] = await Promise.all([
          api.routers.get(routerId),
          api.vouchers.list(routerId),
          api.vouchers.pendingCount(routerId),
          api.routers.profiles.list(routerId),
          api.routers.users(routerId).catch(() => []),
        ]);
        setRouter(r);
        setVouchers(v);
        setPendingExport(pending.count);
        setProfiles(profs);
        setProfile(profs[0]?.profile_name || '');
        setActiveUsers(Array.isArray(users) ? users : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [routerId]);

  const activeByUsername = new Map(activeUsers.map((u) => [u.user, u]));

  function getVoucherWarnings(v: Voucher): { exported?: boolean; inUse?: string } {
    const inUse = activeByUsername.get(v.username);
    return {
      exported: v.exported === 1,
      inUse: inUse?.['uptime'] ?? undefined,
    };
  }

  async function handleDeleteOne(v: Voucher) {
    if (!routerId) return;
    const { exported, inUse } = getVoucherWarnings(v);
    let message = `Delete voucher ${v.username}? This will remove it from MikroTik too.`;
    let confirmLabel = 'Delete';
    let variant: 'danger' | 'warning' | 'default' = 'danger';
    if (exported) {
      message = 'This voucher was already exported to billing system. Delete anyway?';
      confirmLabel = 'Delete Anyway';
    } else if (inUse) {
      message = `This voucher has been used (${inUse} uptime). Deleting will disconnect the customer. Continue?`;
      confirmLabel = 'Delete Anyway';
      variant = 'warning';
    }
    const ok = await confirm({ title: 'Delete voucher', message, confirmLabel, variant });
    if (!ok) return;

    setDeletingId(v.id);
    try {
      const res = await api.vouchers.delete(v.id);
      setVouchers((p) => p.filter((x) => x.id !== v.id));
      setPendingExport((prev) => (prev != null && prev > 0 && !v.exported ? prev - 1 : prev));
      onVouchersChange?.();
      if (!res.mikrotik_removed) {
        toast.warning('Voucher removed from database but may still exist on router');
      } else {
        toast.success('1 voucher deleted');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    if (!routerId || selectedIds.size === 0) return;
    const toDelete = vouchers.filter((v) => selectedIds.has(v.id));
    const hasExported = toDelete.some((v) => v.exported === 1);
    const hasInUse = toDelete.some((v) => activeByUsername.has(v.username));
    let message = `Delete ${toDelete.length} vouchers? This will remove them from MikroTik too.`;
    let confirmLabel = 'Delete';
    let variant: 'danger' | 'warning' | 'default' = 'danger';
    if (hasExported || hasInUse) {
      const parts = [];
      if (hasExported) parts.push('some were exported to billing');
      if (hasInUse) parts.push('some may be in use');
      message = `${toDelete.length} vouchers selected. ${parts.join('; ')}. Delete anyway?`;
      confirmLabel = 'Delete Anyway';
      variant = 'warning';
    }
    const ok = await confirm({ title: 'Delete vouchers', message, confirmLabel, variant });
    if (!ok) return;

    setBulkDeleting(true);
    try {
      const res = await api.vouchers.deleteBulk([...selectedIds], routerId);
      setVouchers((p) => p.filter((x) => !selectedIds.has(x.id)));
      const deletedUnexported = toDelete.filter((v) => !v.exported).length;
      setPendingExport((prev) => (prev != null ? Math.max(0, prev - deletedUnexported) : prev));
      setSelectedIds(new Set());
      onVouchersChange?.();
      toast.success(`${res.deleted} voucher(s) deleted${res.failed > 0 ? `, ${res.failed} failed` : ''}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === vouchers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(vouchers.map((v) => v.id)));
    }
  }

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
      toast.error(err instanceof Error ? err.message : 'Generate failed');
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voucher-modal-title"
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-elevated border border-navy-200 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-navy-200">
          <h2 id="voucher-modal-title" className="text-lg font-bold text-navy-900 flex items-center gap-2">
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
                className="min-w-[200px] input-base py-2"
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
                className="w-20 input-base py-2"
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
                className="w-20 input-base py-2"
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
                  toast.warning('No new vouchers to export. Generate vouchers first.');
                }
              }}
              title={pendingExport === 0 ? 'No new vouchers to export' : `Export ${pendingExport} new voucher(s)`}
            >
              <Download className="w-4 h-4" />
              Export CSV {pendingExport !== null && pendingExport > 0 && `(${pendingExport} new)`}
            </a>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-primary-50 border border-primary-200">
              <span className="text-sm font-medium text-primary-800">
                {selectedIds.size} voucher(s) selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-navy-600 hover:bg-navy-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {bulkDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete Selected
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {vouchers.length > 0 && (
                <div className="flex items-center gap-3 py-2 border-b border-navy-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === vouchers.length}
                      onChange={toggleSelectAll}
                      className="rounded border-navy-300"
                    />
                    <span className="text-sm font-medium text-navy-700">Select All</span>
                  </label>
                </div>
              )}
              {vouchers.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 p-4 rounded-xl bg-navy-50/80 border border-navy-200"
                >
                  <label className="shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                      className="rounded border-navy-300"
                    />
                  </label>
                  <div className="flex-1 min-w-0 font-mono text-sm">
                    <span className="text-navy-900 font-medium">{v.username}</span>
                    <span className="text-navy-400 mx-2">/</span>
                    <span className="text-navy-600">{v.password}</span>
                  </div>
                  <span className="text-xs text-navy-500 shrink-0">{v.profile || v.uptime_limit || '—'}</span>
                  <span className="text-xs shrink-0">
                    {v.exported ? (
                      <span className="text-amber-600">Exported</span>
                    ) : (
                      <span className="text-navy-500">Not exported</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleDeleteOne(v)}
                    disabled={deletingId === v.id}
                    className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60 transition shrink-0"
                    title="Delete voucher"
                  >
                    {deletingId === v.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => copyVoucher(v)}
                    className="p-2 rounded-lg bg-navy-200 border border-navy-300 text-navy-600 hover:bg-navy-300 transition shrink-0"
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
