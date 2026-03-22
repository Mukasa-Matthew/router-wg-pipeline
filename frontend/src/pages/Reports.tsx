import { useState, useEffect } from 'react';
import { BarChart3, Loader2, DollarSign, TrendingUp } from 'lucide-react';
import { api, type RevenueSummary } from '../lib/api';
import { PageHeader } from '../components/PageHeader';

export function Reports() {
  const [revenue, setRevenue] = useState<RevenueSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.reports
      .revenue()
      .then(setRevenue)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-sm font-medium text-navy-600">Loading reports...</p>
      </div>
    );
  }

  const total = revenue.reduce(
    (sum, r) => sum + parseFloat(r.total_revenue || '0'),
    0
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Reports"
        subtitle="Revenue, voucher statistics, and connection trend PDFs per router"
      />

      <div className="grid gap-5 mb-8 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-navy-500">Total Revenue</p>
              <p className="text-2xl font-bold text-navy-900 mt-1">
                UGX {total.toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-primary-50">
              <DollarSign className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-navy-500">Routers</p>
              <p className="text-2xl font-bold text-navy-900 mt-1">{revenue.length}</p>
            </div>
            <div className="p-3 rounded-xl bg-accent-50">
              <BarChart3 className="w-6 h-6 text-accent-600" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-navy-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-navy-500">Transactions</p>
              <p className="text-2xl font-bold text-navy-900 mt-1">
                {revenue.reduce((s, r) => s + r.transaction_count, 0)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-primary-50">
              <TrendingUp className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-primary-50/30 p-4">
        <p className="text-sm text-slate-700">
          <strong>Connection trend reports:</strong> Open any router → Overview tab → download a PDF showing users/devices connected over time. Data is recorded every 15 minutes.
        </p>
      </div>

      {revenue.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-navy-200 bg-white p-16 text-center">
          <p className="text-navy-600 font-medium">No revenue data yet.</p>
          <p className="text-sm text-navy-500 mt-1">Revenue appears when vouchers are used.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-navy-200 bg-white shadow-card overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-navy-200 bg-navy-50/50">
                <th className="text-left py-4 px-6 text-sm font-semibold text-navy-700">
                  Router
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-navy-700">
                  Location
                </th>
                <th className="text-right py-4 px-6 text-sm font-semibold text-navy-700">
                  Revenue
                </th>
                <th className="text-right py-4 px-6 text-sm font-semibold text-navy-700">
                  Transactions
                </th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-navy-100 last:border-0 hover:bg-navy-50/50 transition"
                >
                  <td className="py-4 px-6 font-medium text-navy-900">{r.name}</td>
                  <td className="py-4 px-6 text-navy-600">{r.location || '—'}</td>
                  <td className="py-4 px-6 text-right font-semibold text-navy-900">
                    UGX {parseFloat(r.total_revenue || '0').toLocaleString()}
                  </td>
                  <td className="py-4 px-6 text-right text-navy-600">
                    {r.transaction_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
