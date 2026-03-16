import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  Wrench,
} from 'lucide-react';
import { api, type HotspotProfile, type HotspotProfileInput } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

function ProfileModal({
  open,
  onClose,
  onSuccess,
  profile,
  routerId,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profile?: HotspotProfile | null;
  routerId: number;
}) {
  const [form, setForm] = useState<HotspotProfileInput>({
    profile_name: '',
    display_name: '',
    validity: '1d',
    price: 0,
    shared_users: 1,
    rate_limit: '',
    session_timeout: '',
    idle_timeout: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      setForm({
        profile_name: profile.profile_name,
        display_name: profile.display_name,
        validity: profile.validity,
        price: profile.price,
        shared_users: profile.shared_users,
        rate_limit: profile.rate_limit || '',
        session_timeout: profile.session_timeout || '',
        idle_timeout: profile.idle_timeout || '',
      });
    } else {
      setForm({
        profile_name: '',
        display_name: '',
        validity: '1d',
        price: 0,
        shared_users: 1,
        rate_limit: '',
        session_timeout: '',
        idle_timeout: '',
      });
    }
  }, [profile, open]);

  function update(f: Partial<HotspotProfileInput>) {
    setForm((p) => {
      const next = { ...p, ...f };
      if (f.profile_name !== undefined) {
        next.profile_name = f.profile_name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = {
        ...form,
        profile_name: form.profile_name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, ''),
      };
      if (profile) {
        await api.routers.profiles.update(routerId, profile.id, data);
      } else {
        await api.routers.profiles.create(routerId, data);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, loading, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-elevated border border-navy-200 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-navy-200">
          <h2 className="text-lg font-bold text-navy-900">
            {profile ? 'Edit Profile' : 'Add Profile'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-navy-100 border border-navy-300 text-navy-700 hover:bg-navy-200 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Profile Name *
            </label>
            <input
              value={form.profile_name}
              onChange={(e) =>
                update({
                  profile_name: e.target.value.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, ''),
                })
              }
              placeholder="1-Day-Internet"
              className="input-base"
              required
              disabled={!!profile}
            />
            <p className="text-xs text-navy-500 mt-1">
              Letters, numbers, dashes. Spaces auto-converted.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Display Name *
            </label>
            <input
              value={form.display_name}
              onChange={(e) => update({ display_name: e.target.value })}
              placeholder="1 Day Internet"
              className="input-base"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Validity *
            </label>
            <input
              value={form.validity}
              onChange={(e) => update({ validity: e.target.value })}
              placeholder="30m, 1h, 6h, 12h, 1d, 1w, 7d, 30d"
              className="input-base"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Price (UGX) *
            </label>
            <input
              type="number"
              min={0}
              value={form.price}
              onChange={(e) => update({ price: parseInt(e.target.value, 10) || 0 })}
              className="input-base"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Devices per voucher
            </label>
            <input
              type="number"
              min={1}
              value={form.shared_users ?? 1}
              onChange={(e) => update({ shared_users: parseInt(e.target.value, 10) || 1 })}
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Rate Limit (optional)
            </label>
            <input
              value={form.rate_limit || ''}
              onChange={(e) => update({ rate_limit: e.target.value })}
              placeholder="5M/5M"
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Session Timeout (optional)
            </label>
            <input
              value={form.session_timeout || ''}
              onChange={(e) => update({ session_timeout: e.target.value })}
              placeholder="1d"
              className="input-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Idle Timeout (optional)
            </label>
            <input
              value={form.idle_timeout || ''}
              onChange={(e) => update({ idle_timeout: e.target.value })}
              placeholder="5m"
              className="input-base"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl btn-primary disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProfilesPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { id } = useParams<{ id: string }>();
  const routerId = parseInt(id || '0', 10);
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<HotspotProfile | null>(null);

  async function load() {
    if (!routerId) return;
    try {
      const p = await api.routers.profiles.list(routerId);
      setProfiles(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [routerId]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await api.routers.profiles.sync(routerId);
      setProfiles(res.profiles);
      toast.success(`Synced ${res.synced} new profiles from MikroTik`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleFixAll() {
    setFixing(true);
    try {
      const res = await api.routers.profiles.fixAll(routerId);
      toast.success(`${res.fixed} profiles updated on MikroTik`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fix failed');
    } finally {
      setFixing(false);
    }
  }

  async function handleDelete(p: HotspotProfile) {
    try {
      const res = await api.routers.profiles.delete(routerId, p.id);
      if ('warning' in res && res.warning) {
        const ok = await confirm({
          title: 'Delete profile with vouchers?',
          message: `${res.message}\n\nDeleting will not affect existing vouchers but no new vouchers can be generated.`,
          confirmLabel: 'Delete anyway',
          variant: 'warning',
        });
        if (ok) {
          await api.routers.profiles.delete(routerId, p.id, true);
          toast.success('Profile deleted');
          load();
        }
      } else {
        toast.success('Profile deleted');
        load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
        <p className="text-navy-600">Manage voucher plans for this router</p>
        <div className="flex gap-3">
          <div className="flex gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-secondary disabled:opacity-60 flex items-center gap-2"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Sync from MikroTik
            </button>
            <button
              onClick={handleFixAll}
              disabled={fixing || profiles.length === 0}
              className="btn-secondary disabled:opacity-60 flex items-center gap-2"
              title="Set session-timeout=0s, keepalive-timeout=none on all profiles"
            >
              {fixing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4" />
              )}
              Fix All Profiles
            </button>
            <button
              onClick={() => {
                setEditingProfile(null);
                setModalOpen(true);
              }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Profile
            </button>
          </div>
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-navy-200 bg-white p-16 text-center">
          <p className="text-navy-600 font-medium">No profiles yet.</p>
          <p className="text-sm text-navy-500 mt-1">Add one manually or sync from MikroTik.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-navy-200 bg-white shadow-card overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-navy-200 bg-navy-50/50">
                <th className="text-left py-4 px-6 text-sm font-semibold text-navy-700">
                  Profile Name
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-navy-700">
                  Validity
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-navy-700">
                  Price
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-navy-700">
                  Users
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-navy-700">
                  Rate
                </th>
                <th className="text-right py-4 px-6 text-sm font-semibold text-navy-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-navy-100 last:border-0 hover:bg-navy-50/50"
                >
                  <td className="py-4 px-6 font-medium text-navy-900">{p.display_name}</td>
                  <td className="py-4 px-6 text-navy-600">{p.validity}</td>
                  <td className="py-4 px-6 text-navy-600">
                    UGX {Number(p.price).toLocaleString()}
                  </td>
                  <td className="py-4 px-6 text-navy-600">{p.shared_users}</td>
                  <td className="py-4 px-6 text-navy-600">{p.rate_limit || '—'}</td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingProfile(p);
                          setModalOpen(true);
                        }}
                        className="p-2 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-700 transition"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProfileModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingProfile(null);
        }}
        onSuccess={load}
        profile={editingProfile}
        routerId={routerId}
      />
    </div>
  );
}
