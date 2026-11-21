import { AlertTriangle, CheckCircle2, Clock, Plus, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LoanRecord, LoanStatus } from '../types';

interface LoansViewProps {
  loans: LoanRecord[];
  loading: boolean;
  onReturnLoan: (loanId: number) => Promise<void>;
  onOpenIssueLoan: () => void;
}

export function LoansView({ loans, loading, onReturnLoan, onOpenIssueLoan }: LoansViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | LoanStatus>('All');
  const [returningId, setReturningId] = useState<number | null>(null);

  const filteredLoans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter((loan) => {
      if (statusFilter !== 'All' && loan.status !== statusFilter) return false;
      if (!q) return true;
      return (
        loan.item_title.toLowerCase().includes(q) ||
        loan.asset_code.toLowerCase().includes(q) ||
        loan.borrower_name.toLowerCase().includes(q) ||
        loan.university_id.toLowerCase().includes(q) ||
        loan.notes.toLowerCase().includes(q)
      );
    });
  }, [loans, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      All: loans.length,
      Active: loans.filter((l) => l.status === 'Active').length,
      Overdue: loans.filter((l) => l.status === 'Overdue').length,
      Returned: loans.filter((l) => l.status === 'Returned').length,
    };
  }, [loans]);

  const handleReturn = async (loanId: number) => {
    setReturningId(loanId);
    try {
      await onReturnLoan(loanId);
    } finally {
      setReturningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search borrower, asset code, item..."
              aria-label="Search loans"
              className="w-full sm:w-72 pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Loan status filter">
            {(['All', 'Overdue', 'Active', 'Returned'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === status
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status} ({counts[status]})
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onOpenIssueLoan}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Issue Loan
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Relational 3-table join: <span className="font-mono text-slate-700">loans ⋈ inventory_items ⋈ borrowers</span>
          </span>
          <span className="font-mono tabular-nums">{filteredLoans.length} records</span>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredLoans.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-800">No loan transactions match this filter.</p>
            <p className="text-xs text-slate-500 mt-1">Issue a new loan or switch the status filter above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Loan ID</th>
                  <th className="py-2.5 px-4">Item &amp; Asset</th>
                  <th className="py-2.5 px-4">Borrower</th>
                  <th className="py-2.5 px-4">Borrowed</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4">Returned</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Late Fine</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLoans.map((loan) => (
                  <tr key={loan.loan_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500">
                      #{loan.loan_id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 max-w-[230px] truncate" title={loan.item_title}>
                        {loan.item_title}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {loan.asset_code} · ${loan.daily_fine_rate.toFixed(2)}/day
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{loan.borrower_name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {loan.university_id} · {loan.department}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {loan.borrowed_at}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-800 font-medium whitespace-nowrap">
                      {loan.due_date}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                      {loan.returned_at ?? '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {loan.status === 'Overdue' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Overdue ({loan.days_overdue}d)
                        </span>
                      ) : loan.status === 'Active' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Returned
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {loan.accrued_fine > 0 ? (
                        <span className="font-semibold text-red-700">${loan.accrued_fine.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-400">$0.00</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {loan.returned_at === null ? (
                        <button
                          disabled={returningId === loan.loan_id}
                          onClick={() => handleReturn(loan.loan_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {returningId === loan.loan_id ? 'Returning...' : 'Return Item'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
