import {
  ArrowLeftRight,
  BookMarked,
  Database,
  LayoutDashboard,
  Menu,
  Plus,
  Receipt,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { BorrowersView } from './components/BorrowersView';
import { CatalogView } from './components/CatalogView';
import { FinesView } from './components/FinesView';
import { LoansView } from './components/LoansView';
import { AddBorrowerModal, AddItemModal, IssueLoanModal, PayFineModal } from './components/Modals';
import { OverviewView } from './components/OverviewView';
import { RelationalSqlView } from './components/RelationalSqlView';
import type {
  Borrower,
  Category,
  ConditionStatus,
  DashboardSummary,
  FineRecord,
  InventoryItem,
  LoanRecord,
  TableSchemaInfo,
} from './types';

type ActiveTab = 'overview' | 'catalog' | 'loans' | 'fines' | 'borrowers' | 'sql';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'catalog', label: 'Inventory Catalog', icon: BookMarked },
  { id: 'loans', label: 'Borrow & Returns', icon: ArrowLeftRight },
  { id: 'fines', label: 'Overdue Fines', icon: Receipt },
  { id: 'borrowers', label: 'Borrowers', icon: Users },
  { id: 'sql', label: 'Relational SQL', icon: Database },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [fines, setFines] = useState<FineRecord[]>([]);
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [schema, setSchema] = useState<TableSchemaInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [preselectedItemId, setPreselectedItemId] = useState<number | null>(null);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [addBorrowerModalOpen, setAddBorrowerModalOpen] = useState(false);
  const [payFineTarget, setPayFineTarget] = useState<FineRecord | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 4000);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setErrorBanner(null);
      const [sumRes, catRes, itemRes, loanRes, fineRes, borRes, schRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/categories'),
        fetch('/api/items'),
        fetch('/api/loans'),
        fetch('/api/fines'),
        fetch('/api/borrowers'),
        fetch('/api/schema'),
      ]);

      if (!sumRes.ok || !itemRes.ok || !loanRes.ok || !fineRes.ok || !borRes.ok || !schRes.ok) {
        throw new Error('Failed to load relational inventory records from server.');
      }

      const [sumData, catData, itemData, loanData, fineData, borData, schData] = await Promise.all([
        sumRes.json(),
        catRes.json(),
        itemRes.json(),
        loanRes.json(),
        fineRes.json(),
        borRes.json(),
        schRes.json(),
      ]);

      setSummary(sumData);
      setCategories(catData);
      setItems(itemData);
      setLoans(loanData);
      setFines(fineData);
      setBorrowers(borData);
      setSchema(schData);
    } catch (err) {
      setErrorBanner((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleIssueLoan = async (payload: {
    item_id: number;
    borrower_id: number;
    custom_days?: number;
    notes: string;
  }) => {
    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not issue loan.');
    }
    await refreshAll();
    showToast(`Loan #${data.loan_id} checked out and inventory updated.`);
  };

  const handleReturnLoan = async (loanId: number) => {
    const res = await fetch(`/api/loans/${loanId}/return`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || 'Failed to return item.');
      return;
    }
    await refreshAll();
    if (data.fine_assessed > 0) {
      showToast(
        `Returned Loan #${loanId} (${data.days_overdue}d overdue · $${data.fine_assessed.toFixed(2)} fine assessed).`
      );
    } else {
      showToast(`Returned Loan #${loanId} on time. Availability restored.`);
    }
  };

  const handleAddItem = async (payload: {
    asset_code: string;
    title: string;
    category_id: number;
    location_shelf: string;
    total_copies: number;
    unit_value: number;
  }) => {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to add inventory item.');
    }
    await refreshAll();
    showToast(`Added ${data.asset_code} to inventory catalog.`);
  };

  const handleUpdateItem = async (
    itemId: number,
    patch: { total_copies?: number; condition_status?: ConditionStatus }
  ) => {
    const res = await fetch(`/api/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || 'Failed to update inventory item.');
      return;
    }
    await refreshAll();
    showToast(`Updated ${data.asset_code} record.`);
  };

  const handleAddBorrower = async (payload: {
    university_id: string;
    full_name: string;
    email: string;
    department: string;
    year_of_study: string;
    role: string;
    max_borrow_limit: number;
  }) => {
    const res = await fetch('/api/borrowers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to register borrower.');
    }
    await refreshAll();
    showToast(`Registered borrower ${data.full_name}.`);
  };

  const handlePayFine = async (fineId: number, amount: number) => {
    const res = await fetch(`/api/fines/${fineId}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to record fine payment.');
    }
    await refreshAll();
    showToast(`Recorded $${amount.toFixed(2)} payment (${data.payment_status}).`);
  };

  const handleWaiveFine = async (fineId: number) => {
    const res = await fetch(`/api/fines/${fineId}/waive`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || 'Failed to waive fine.');
      return;
    }
    await refreshAll();
    showToast(`Fine #${fineId} marked as Waived.`);
  };

  const handleSyncFines = async () => {
    const res = await fetch('/api/fines/sync', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setErrorBanner(data.error || 'Failed to synchronize overdue fines.');
      return;
    }
    await refreshAll();
    showToast(`Synchronized overdue loans (${data.syncedFines} fine records updated).`);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  const selectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 px-6 flex items-center border-b border-slate-200">
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              selectTab('overview');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ShelfLedger
          </a>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => selectTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </span>
                {item.id === 'fines' && summary && summary.overdue_loans > 0 && (
                  <span className="font-mono tabular-nums text-xs text-red-700 font-semibold">
                    {summary.overdue_loans}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500">
          <div className="font-medium text-slate-700">Campus Inventory DBMS</div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-400">SQLite · 5 Relational Tables</div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-64 max-w-full bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="font-display text-lg font-bold tracking-tight text-slate-900">ShelfLedger</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => selectTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">Workspace</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{currentNav.label}</h1>
            </div>
          </div>

          <button
            onClick={() => {
              setPreselectedItemId(null);
              setIssueModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Issue Loan
          </button>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1400px] w-full mx-auto space-y-6">
          {errorBanner && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4 text-xs text-red-800">
              <span>{errorBanner}</span>
              <button
                onClick={() => setErrorBanner(null)}
                className="font-medium underline shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {toastMessage && (
            <div
              role="status"
              className="p-3.5 bg-slate-900 text-white rounded-xl flex items-center justify-between gap-4 text-xs shadow-sm"
            >
              <span>{toastMessage}</span>
              <button
                onClick={() => setToastMessage(null)}
                className="text-slate-300 hover:text-white shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewView
              summary={summary}
              loans={loans}
              loading={loading}
              onNavigate={(tab) => selectTab(tab)}
              onReturnLoan={handleReturnLoan}
              onOpenIssueLoan={() => {
                setPreselectedItemId(null);
                setIssueModalOpen(true);
              }}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogView
              items={items}
              categories={categories}
              loading={loading}
              onOpenAddItem={() => setAddItemModalOpen(true)}
              onOpenIssueForItem={(item) => {
                setPreselectedItemId(item.item_id);
                setIssueModalOpen(true);
              }}
              onUpdateItem={handleUpdateItem}
            />
          )}

          {activeTab === 'loans' && (
            <LoansView
              loans={loans}
              loading={loading}
              onReturnLoan={handleReturnLoan}
              onOpenIssueLoan={() => {
                setPreselectedItemId(null);
                setIssueModalOpen(true);
              }}
            />
          )}

          {activeTab === 'fines' && (
            <FinesView
              fines={fines}
              loading={loading}
              onOpenPayFine={(fine) => setPayFineTarget(fine)}
              onWaiveFine={handleWaiveFine}
              onSyncFines={handleSyncFines}
            />
          )}

          {activeTab === 'borrowers' && (
            <BorrowersView
              borrowers={borrowers}
              loading={loading}
              onOpenAddBorrower={() => setAddBorrowerModalOpen(true)}
            />
          )}

          {activeTab === 'sql' && <RelationalSqlView schema={schema} loading={loading} />}
        </main>
      </div>

      {/* Modals */}
      <IssueLoanModal
        open={issueModalOpen}
        items={items}
        borrowers={borrowers}
        preselectedItemId={preselectedItemId}
        onClose={() => setIssueModalOpen(false)}
        onSubmit={handleIssueLoan}
      />

      <AddItemModal
        open={addItemModalOpen}
        categories={categories}
        onClose={() => setAddItemModalOpen(false)}
        onSubmit={handleAddItem}
      />

      <AddBorrowerModal
        open={addBorrowerModalOpen}
        onClose={() => setAddBorrowerModalOpen(false)}
        onSubmit={handleAddBorrower}
      />

      <PayFineModal
        fine={payFineTarget}
        onClose={() => setPayFineTarget(null)}
        onSubmit={handlePayFine}
      />
    </div>
  );
}
