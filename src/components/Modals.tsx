import { X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { Borrower, Category, FineRecord, InventoryItem } from '../types';

interface IssueLoanModalProps {
  open: boolean;
  items: InventoryItem[];
  borrowers: Borrower[];
  preselectedItemId?: number | null;
  onClose: () => void;
  onSubmit: (payload: {
    item_id: number;
    borrower_id: number;
    custom_days?: number;
    notes: string;
  }) => Promise<void>;
}

export function IssueLoanModal({
  open,
  items,
  borrowers,
  preselectedItemId,
  onClose,
  onSubmit,
}: IssueLoanModalProps) {
  const availableItems = items.filter((i) => i.available_copies > 0 && i.condition_status !== 'Maintenance');
  const [itemId, setItemId] = useState<string>('');
  const [borrowerId, setBorrowerId] = useState<string>('');
  const [customDays, setCustomDays] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotes('');
    if (preselectedItemId) {
      setItemId(String(preselectedItemId));
      const matched = items.find((i) => i.item_id === preselectedItemId);
      setCustomDays(matched ? String(matched.loan_period_days) : '7');
    } else if (availableItems.length > 0) {
      setItemId(String(availableItems[0].item_id));
      setCustomDays(String(availableItems[0].loan_period_days));
    } else {
      setItemId('');
      setCustomDays('7');
    }
    const eligibleBorrower = borrowers.find(
      (b) => b.status === 'Active' && b.active_loans_count < b.max_borrow_limit
    );
    setBorrowerId(eligibleBorrower ? String(eligibleBorrower.borrower_id) : '');
  }, [open, preselectedItemId]);

  if (!open) return null;

  const selectedItem = items.find((i) => String(i.item_id) === itemId);
  const selectedBorrower = borrowers.find((b) => String(b.borrower_id) === borrowerId);

  const previewDueDate = (() => {
    const days = Math.max(1, Number(customDays) || selectedItem?.loan_period_days || 7);
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  })();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!itemId || !borrowerId) {
      setError('Please select both an available item and an eligible borrower.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        item_id: Number(itemId),
        borrower_id: Number(borrowerId),
        custom_days: Number(customDays) || undefined,
        notes,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="issue-loan-title">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="issue-loan-title" className="text-base font-semibold text-slate-900">
            Issue New Loan
          </h2>
          <button onClick={onClose} aria-label="Close modal" className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Inventory Item</label>
            <select
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                const next = items.find((i) => String(i.item_id) === e.target.value);
                if (next) setCustomDays(String(next.loan_period_days));
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {availableItems.length === 0 ? (
                <option value="">No available items in stock</option>
              ) : (
                availableItems.map((item) => (
                  <option key={item.item_id} value={item.item_id}>
                    [{item.asset_code}] {item.title} ({item.available_copies}/{item.total_copies} avail.)
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Borrower</label>
            <select
              value={borrowerId}
              onChange={(e) => setBorrowerId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              <option value="">Select borrower...</option>
              {borrowers.map((b) => {
                const blocked = b.status === 'Restricted' || b.active_loans_count >= b.max_borrow_limit;
                return (
                  <option key={b.borrower_id} value={b.borrower_id} disabled={blocked}>
                    {b.full_name} ({b.university_id}) — {b.active_loans_count}/{b.max_borrow_limit} loans
                    {b.status === 'Restricted' ? ' [Restricted]' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Loan Duration (Days)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Computed Due Date</label>
              <div className="px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                {previewDueDate}
              </div>
            </div>
          </div>

          {selectedItem && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center justify-between">
              <span>
                Category policy: <strong>{selectedItem.category_name}</strong>
              </span>
              <span className="font-mono tabular-nums">
                Late fine: ${selectedItem.daily_fine_rate.toFixed(2)}/day
              </span>
            </div>
          )}

          {selectedBorrower && selectedBorrower.unpaid_fines_total > 0 && (
            <div className="text-xs text-amber-700">
              Note: This borrower currently has ${selectedBorrower.unpaid_fines_total.toFixed(2)} in unpaid fines.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Course / Lab Notes (Optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. CS-202 Lab Section B"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || availableItems.length === 0}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? 'Issuing...' : 'Confirm Checkout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddItemModalProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onSubmit: (payload: {
    asset_code: string;
    title: string;
    category_id: number;
    location_shelf: string;
    total_copies: number;
    unit_value: number;
  }) => Promise<void>;
}

export function AddItemModal({ open, categories, onClose, onSubmit }: AddItemModalProps) {
  const [assetCode, setAssetCode] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [locationShelf, setLocationShelf] = useState('');
  const [totalCopies, setTotalCopies] = useState('3');
  const [unitValue, setUnitValue] = useState('85');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAssetCode('');
    setTitle('');
    setLocationShelf('');
    setTotalCopies('3');
    setUnitValue('85');
    if (categories.length > 0) {
      setCategoryId(String(categories[0].category_id));
    }
  }, [open, categories]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        asset_code: assetCode,
        title,
        category_id: Number(categoryId),
        location_shelf: locationShelf,
        total_copies: Number(totalCopies),
        unit_value: Number(unitValue),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="add-item-title">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="add-item-title" className="text-base font-semibold text-slate-900">
            Add Library or Lab Item
          </h2>
          <button onClick={onClose} aria-label="Close modal" className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Asset Code</label>
              <input
                type="text"
                required
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value)}
                placeholder="e.g. LAB-MCU-320"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Category (FK)</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {categories.map((cat) => (
                  <option key={cat.category_id} value={cat.category_id}>
                    {cat.domain} — {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Item Title / Equipment Model</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. ESP32-S3 DevKitC-1 Sensor Kit"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Total Copies</label>
              <input
                type="number"
                min={1}
                required
                value={totalCopies}
                onChange={(e) => setTotalCopies(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Unit Value ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={unitValue}
                onChange={(e) => setUnitValue(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Shelf / Cabinet</label>
              <input
                type="text"
                required
                value={locationShelf}
                onChange={(e) => setLocationShelf(e.target.value)}
                placeholder="Lab C · Cab 05"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AddBorrowerModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    university_id: string;
    full_name: string;
    email: string;
    department: string;
    year_of_study: string;
    role: string;
    max_borrow_limit: number;
  }) => Promise<void>;
}

export function AddBorrowerModal({ open, onClose, onSubmit }: AddBorrowerModalProps) {
  const [universityId, setUniversityId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [yearOfStudy, setYearOfStudy] = useState('2nd Year');
  const [role, setRole] = useState('Student');
  const [maxLimit, setMaxLimit] = useState('4');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUniversityId('');
    setFullName('');
    setEmail('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        university_id: universityId,
        full_name: fullName,
        email,
        department,
        year_of_study: yearOfStudy,
        role,
        max_borrow_limit: Number(maxLimit) || 4,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="add-borrower-title">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="add-borrower-title" className="text-base font-semibold text-slate-900">
            Register Borrower
          </h2>
          <button onClick={onClose} aria-label="Close modal" className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{error}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">University ID</label>
              <input
                type="text"
                required
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                placeholder="e.g. STU-2025-0410"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Nadia Patel"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Campus Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nadia.p@campus.edu"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Department</label>
              <input
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="Student">Student</option>
                <option value="TA">TA</option>
                <option value="Faculty">Faculty</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Year / Standing</label>
              <input
                type="text"
                value={yearOfStudy}
                onChange={(e) => setYearOfStudy(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Borrow Limit</label>
              <input
                type="number"
                min={1}
                max={20}
                value={maxLimit}
                onChange={(e) => setMaxLimit(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register Borrower'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface PayFineModalProps {
  fine: FineRecord | null;
  onClose: () => void;
  onSubmit: (fineId: number, amount: number) => Promise<void>;
}

export function PayFineModal({ fine, onClose, onSubmit }: PayFineModalProps) {
  const remaining = fine ? Math.max(0, Number((fine.amount_due - fine.amount_paid).toFixed(2))) : 0;
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fine) {
      setAmount(remaining.toFixed(2));
      setError(null);
    }
  }, [fine, remaining]);

  if (!fine) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const val = Number(amount);
    if (Number.isNaN(val) || val <= 0) {
      setError('Enter a payment amount greater than $0.00.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(fine.fine_id, val);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="pay-fine-title">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 id="pay-fine-title" className="text-base font-semibold text-slate-900">
            Record Fine Payment
          </h2>
          <button onClick={onClose} aria-label="Close modal" className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{error}</div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs">
            <div className="font-semibold text-slate-900">{fine.borrower_name}</div>
            <div className="text-slate-600">{fine.item_title}</div>
            <div className="font-mono text-slate-500 pt-1">
              Assessed: ${fine.amount_due.toFixed(2)} · Paid: ${fine.amount_paid.toFixed(2)} · Balance:{' '}
              <strong className="text-slate-900">${remaining.toFixed(2)}</strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Payment Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remaining}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
