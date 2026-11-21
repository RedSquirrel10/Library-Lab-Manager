import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FinePaymentStatus, FineRecord } from '../types';

interface FinesViewProps {
  fines: FineRecord[];
  loading: boolean;
  onOpenPayFine: (fine: FineRecord) => void;
  onWaiveFine: (fineId: number) => Promise<void>;
  onSyncFines: () => Promise<void>;
}

export function FinesView({ fines, loading, onOpenPayFine, onWaiveFine, onSyncFines }: FinesViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | FinePaymentStatus>('All');
  const [syncing, setSyncing] = useState(false);

  const filteredFines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fines.filter((f) => {
      if (statusFilter !== 'All' && f.payment_status !== statusFilter) return false;
      if (!q) return true;
      return (
        f.borrower_name.toLowerCase().includes(q) ||
        f.university_id.toLowerCase().includes(q) ||
        f.item_title.toLowerCase().includes(q) ||
        f.asset_code.toLowerCase().includes(q)
      );
    });
  }, [fines, search, statusFilter]);

  const totals = useMemo(() => {
    return fines.reduce(
      (acc, f) => {
        acc.assessed += f.amount_due;
        acc.paid += f.amount_paid;
        if (f.payment_status === 'Unpaid' || f.payment_status === 'Partial') {
          acc.outstanding += Math.max(0, f.amount_due - f.amount_paid);
        }
        return acc;
      },
      { assessed: 0, paid: 0, outstanding: 0 }
    );
  }, [fines]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSyncFines();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Ledger Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Outstanding Balance</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-red-700">
            ${totals.outstanding.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Borrowers restricted automatically at $15.00+</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Total Collected</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            ${totals.paid.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Settled fine payments</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Total Assessed</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
            ${totals.assessed.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Across {fines.length} overdue loan records</div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search borrower or asset..."
              aria-label="Search fines ledger"
              className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Fine status filter">
            {(['All', 'Unpaid', 'Partial', 'Paid', 'Waived'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === status
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Recalculate Overdue Fines
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Relational 4-table join: <span className="font-mono text-slate-700">fines ⋈ loans ⋈ borrowers ⋈ inventory_items</span>
          </span>
          <span className="font-mono tabular-nums">{filteredFines.length} records</span>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredFines.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-800">No fine records match this view.</p>
            <p className="text-xs text-slate-500 mt-1">Overdue loans automatically populate the fines ledger.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Fine ID</th>
                  <th className="py-2.5 px-4">Borrower</th>
                  <th className="py-2.5 px-4">Item &amp; Loan</th>
                  <th className="py-2.5 px-4 text-right">Calculation</th>
                  <th className="py-2.5 px-4 text-right">Amount Due</th>
                  <th className="py-2.5 px-4 text-right">Paid</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredFines.map((fine) => {
                  const balance = Math.max(0, fine.amount_due - fine.amount_paid);
                  const canSettle = fine.payment_status === 'Unpaid' || fine.payment_status === 'Partial';
                  return (
                    <tr key={fine.fine_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500">
                        #{fine.fine_id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{fine.borrower_name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{fine.university_id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 max-w-[220px] truncate" title={fine.item_title}>
                          {fine.item_title}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          Loan #{fine.loan_id} · Due {fine.due_date}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {fine.days_overdue}d × ${fine.daily_rate.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                        ${fine.amount_due.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        ${fine.amount_paid.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {fine.payment_status === 'Unpaid' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Unpaid (${balance.toFixed(2)})
                          </span>
                        ) : fine.payment_status === 'Partial' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Partial (${balance.toFixed(2)} left)
                          </span>
                        ) : fine.payment_status === 'Paid' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            Waived
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canSettle ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => onOpenPayFine(fine)}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                            >
                              Record Payment
                            </button>
                            <button
                              onClick={() => onWaiveFine(fine.fine_id)}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                            >
                              Waive
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">
                            {fine.settled_at ?? 'Settled'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
