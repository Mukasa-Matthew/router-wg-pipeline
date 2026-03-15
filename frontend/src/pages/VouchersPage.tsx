import { useState, useEffect } from 'react';
import { Key, Loader2, Download } from 'lucide-react';
import { api, type Router } from '../lib/api';
import { VoucherModal } from '../components/VoucherModal';
import { PageHeader } from '../components/PageHeader';

export function VouchersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    api.routers
      .list()
      .then(setRouters)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Vouchers"
        subtitle="Generate and export hotspot vouchers per router"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {routers.map((router) => (
          <div
            key={router.id}
            className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card hover:shadow-card-hover hover:border-primary-300/50 transition-all cursor-pointer"
            onClick={() => setSelectedId(router.id)}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary-50">
                <Key className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-navy-900 text-lg">{router.name}</h3>
                <p className="text-sm text-navy-600">
                  {router.location || router.lan_ip}
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(router.id);
                }}
                className="flex-1 py-2.5 rounded-xl btn-primary text-sm"
              >
                Manage
              </button>
              <a
                href={api.vouchers.exportUrl(router.id)}
                download
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl btn-secondary text-sm"
              >
                <Download className="w-4 h-4" />
                Export
              </a>
            </div>
          </div>
        ))}
      </div>

      {routers.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-navy-200 bg-white p-16 text-center text-navy-600">
          No routers. Add a router first to generate vouchers.
        </div>
      )}

      <VoucherModal routerId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
