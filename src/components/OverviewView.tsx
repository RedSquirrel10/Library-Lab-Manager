import { AlertTriangle, ArrowRight, BookOpen, CheckCircle2, Cpu, RotateCcw } from 'lucide-react';
import type { DashboardSummary, LoanRecord } from '../types';

interface OverviewViewProps {
  summary: DashboardSummary | null;
  loans: LoanRecord[];
  loading: boolean;
  onNavigate: (tab: 'catalog' | 'loans' | 'fines' | 'borrowers' | 'sql') => void;
  onReturnLoan: (loanId: number) => void;
  onOpenIssueLoan: () => void;
}

export function OverviewView({
  summary,
  loans,
  loading,
  onNavigate,
  onReturnLoan,
  onOpenIssueLoan,
}: OverviewViewProps) {
  if (loading || !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const urgentLoans = loans
    .filter((l) => l.status !== 'Returned')
    .slice(0, 6);

  const libraryStats = summary.domain_breakdown.find((d) => d.domain === 'Library');
  const labStats = summary.domain_breakdown.find((d) => d.domain === 'Lab');

  return (
    <div className="space-y-8">
      {/* 4-Column KPI Strip */}
      <section aria-label="Inventory summary metrics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Available Inventory</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
              {summary.available_units}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              of {summary.total_units} units
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>{summary.total_titles} catalog records</span>
            <button
              onClick={() => onNavigate('catalog')}
              className="text-blue-700 hover:text-blue-800 font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Browse <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Active Checkouts</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
              {summary.active_loans}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {summary.total_borrowers} borrowers
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Across Library &amp; Lab</span>
            <button
              onClick={() => onNavigate('loans')}
              className="text-blue-700 hover:text-blue-800 font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Manage <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Overdue Loans</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`text-3xl font-bold tracking-tight font-mono tabular-nums ${
                summary.overdue_loans > 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {summary.overdue_loans}
            </span>
            <span
              className={`text-xs font-medium inline-flex items-center gap-1 ${
                summary.overdue_loans > 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {summary.overdue_loans > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> Action needed
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> All on time
                </>
              )}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Past due date</span>
            <button
              onClick={() => onNavigate('loans')}
              className="text-blue-700 hover:text-blue-800 font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Review <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Outstanding Fines</div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span
              className={`text-3xl font-bold tracking-tight font-mono tabular-nums ${
                summary.unpaid_fines_total > 0 ? 'text-amber-700' : 'text-slate-900'
              }`}
            >
              ${summary.unpaid_fines_total.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              ${summary.collected_fines_total.toFixed(2)} paid
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Computed from overdue days</span>
            <button
              onClick={() => onNavigate('fines')}
              className="text-blue-700 hover:text-blue-800 font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              Ledger <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Main Split: Active & Overdue Queue + Category Utilization */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Active &amp; Overdue Checkout Queue</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Joined from <span className="font-mono text-slate-700">loans</span>,{' '}
                <span className="font-mono text-slate-700">inventory_items</span>, and{' '}
                <span className="font-mono text-slate-700">borrowers</span>
              </p>
            </div>
            <button
              onClick={() => onNavigate('loans')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0"
            >
              View all loans
            </button>
          </div>

          {urgentLoans.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-slate-700">No items are currently checked out.</p>
              <p className="text-xs text-slate-500 mt-1">Issue a library book or lab kit to track due dates.</p>
              <button
                onClick={onOpenIssueLoan}
                className="mt-4 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
              >
                Issue Loan
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Item &amp; Code</th>
                    <th className="py-2.5 px-4">Borrower</th>
                    <th className="py-2.5 px-4">Due Date</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Fine</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {urgentLoans.map((loan) => (
                    <tr key={loan.loan_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 truncate max-w-[230px]" title={loan.item_title}>
                          {loan.item_title}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          {loan.asset_code} · {loan.domain}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-900 font-medium">{loan.borrower_name}</div>
                        <div className="text-xs text-slate-500">{loan.department}</div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700">
                        {loan.due_date}
                      </td>
                      <td className="py-3 px-4">
                        {loan.status === 'Overdue' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Overdue ({loan.days_overdue}d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            Active
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
                        <button
                          onClick={() => onReturnLoan(loan.loan_id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Return
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Column: Domain Split & Category Utilization */}
        <section className="xl:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-slate-900">Collection Split</h2>
            <p className="text-xs text-slate-500 mt-0.5">Library volumes vs. Laboratory hardware</p>

            <div className="mt-4 divide-y divide-slate-100">
              <div className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-slate-900">Library Collection</div>
                    <div className="text-xs text-slate-500">{libraryStats?.titles ?? 0} titles</div>
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-sm font-semibold text-slate-900">
                    {libraryStats?.available_units ?? 0}/{libraryStats?.total_units ?? 0}
                  </div>
                  <div className="text-xs text-slate-500">available</div>
                </div>
              </div>

              <div className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Cpu className="w-4 h-4 text-blue-700 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-slate-900">Lab Equipment</div>
                    <div className="text-xs text-slate-500">{labStats?.titles ?? 0} instruments</div>
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-sm font-semibold text-slate-900">
                    {labStats?.available_units ?? 0}/{labStats?.total_units ?? 0}
                  </div>
                  <div className="text-xs text-slate-500">available</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Category Utilization</h2>
              <button
                onClick={() => onNavigate('sql')}
                className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap"
              >
                Inspect SQL
              </button>
            </div>
            <div className="mt-4 space-y-3.5">
              {summary.category_utilization.map((cat) => (
                <div key={cat.category_id}>
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium text-slate-800 truncate">{cat.name}</span>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0">
                      {cat.checked_out_units}/{cat.total_units} out · ${cat.daily_fine_rate.toFixed(2)}/d
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-700 rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(100, cat.utilization_pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
