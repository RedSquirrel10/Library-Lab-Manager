import { Ban, CheckCircle2, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Borrower, BorrowerRole } from '../types';

interface BorrowersViewProps {
  borrowers: Borrower[];
  loading: boolean;
  onOpenAddBorrower: () => void;
}

export function BorrowersView({ borrowers, loading, onOpenAddBorrower }: BorrowersViewProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | BorrowerRole>('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return borrowers.filter((b) => {
      if (roleFilter !== 'All' && b.role !== roleFilter) return false;
      if (!q) return true;
      return (
        b.full_name.toLowerCase().includes(q) ||
        b.university_id.toLowerCase().includes(q) ||
        b.department.toLowerCase().includes(q) ||
        b.email.toLowerCase().includes(q)
      );
    });
  }, [borrowers, search, roleFilter]);

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
              placeholder="Search name, ID, department..."
              aria-label="Search borrowers"
              className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Role filter">
            {(['All', 'Student', 'TA', 'Faculty'] as const).map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  roleFilter === role
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onOpenAddBorrower}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Register Borrower
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Table: <span className="font-mono text-slate-700">borrowers</span> with aggregated{' '}
            <span className="font-mono text-slate-700">loans</span> &amp;{' '}
            <span className="font-mono text-slate-700">fines</span> counts
          </span>
          <span className="font-mono tabular-nums">{filtered.length} members</span>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-800">No borrowers match your search.</p>
            <button
              onClick={onOpenAddBorrower}
              className="mt-4 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
            >
              Register Borrower
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">University ID</th>
                  <th className="py-2.5 px-4">Borrower</th>
                  <th className="py-2.5 px-4">Department &amp; Cohort</th>
                  <th className="py-2.5 px-4 text-right">Active Loans</th>
                  <th className="py-2.5 px-4 text-right">Unpaid Fines</th>
                  <th className="py-2.5 px-4">Account Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((b) => (
                  <tr key={b.borrower_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                      {b.university_id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{b.full_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{b.email}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {b.department} · {b.role} ({b.year_of_study})
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                      {b.active_loans_count} / {b.max_borrow_limit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {b.unpaid_fines_total > 0 ? (
                        <span className="font-semibold text-red-700">${b.unpaid_fines_total.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-400">$0.00</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {b.status === 'Restricted' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                          <Ban className="w-3.5 h-3.5 shrink-0" />
                          Restricted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Active
                        </span>
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
