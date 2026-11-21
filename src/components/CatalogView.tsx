import { AlertTriangle, CheckCircle2, Plus, Search, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Category, ConditionStatus, DomainType, InventoryItem } from '../types';

interface CatalogViewProps {
  items: InventoryItem[];
  categories: Category[];
  loading: boolean;
  onOpenAddItem: () => void;
  onOpenIssueForItem: (item: InventoryItem) => void;
  onUpdateItem: (
    itemId: number,
    patch: { total_copies?: number; condition_status?: ConditionStatus }
  ) => Promise<void>;
}

export function CatalogView({
  items,
  categories,
  loading,
  onOpenAddItem,
  onOpenIssueForItem,
  onUpdateItem,
}: CatalogViewProps) {
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<'All' | DomainType>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'All' | 'Available' | 'CheckedOut'>('All');

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (domainFilter !== 'All' && item.domain !== domainFilter) return false;
      if (categoryFilter !== 'all' && String(item.category_id) !== categoryFilter) return false;
      if (availabilityFilter === 'Available' && item.available_copies <= 0) return false;
      if (availabilityFilter === 'CheckedOut' && item.available_copies === item.total_copies) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.asset_code.toLowerCase().includes(q) ||
        item.category_name.toLowerCase().includes(q) ||
        item.location_shelf.toLowerCase().includes(q)
      );
    });
  }, [items, search, domainFilter, categoryFilter, availabilityFilter]);

  const availableCategories = useMemo(() => {
    if (domainFilter === 'All') return categories;
    return categories.filter((c) => c.domain === domainFilter);
  }, [categories, domainFilter]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:flex-none">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, asset code, shelf..."
              aria-label="Search inventory catalog"
              className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          {/* Domain Segmented Control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg" role="group" aria-label="Domain filter">
            {(['All', 'Library', 'Lab'] as const).map((dom) => (
              <button
                key={dom}
                onClick={() => {
                  setDomainFilter(dom);
                  setCategoryFilter('all');
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  domainFilter === dom
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {dom}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          >
            <option value="all">All Categories</option>
            {availableCategories.map((cat) => (
              <option key={cat.category_id} value={cat.category_id}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as 'All' | 'Available' | 'CheckedOut')}
            aria-label="Filter by availability"
            className="px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          >
            <option value="All">All Availability</option>
            <option value="Available">Available Now</option>
            <option value="CheckedOut">Has Active Loans</option>
          </select>
        </div>

        <button
          onClick={onOpenAddItem}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Catalog Item
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-900 font-mono tabular-nums">{filteredItems.length}</strong> of{' '}
            <span className="font-mono tabular-nums">{items.length}</span> records in{' '}
            <span className="font-mono text-slate-700">inventory_items</span>
          </span>
          <span>Relational FK: category_id → categories.category_id</span>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-800">No inventory items match the current filters.</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing the search query or adding a new book or lab kit.</p>
            <button
              onClick={onOpenAddItem}
              className="mt-4 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors"
            >
              Add Catalog Item
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Asset Code</th>
                  <th className="py-2.5 px-4">Title &amp; Category</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4 text-right">Loan Term</th>
                  <th className="py-2.5 px-4 text-right">Fine / Day</th>
                  <th className="py-2.5 px-4 text-right">Available</th>
                  <th className="py-2.5 px-4">Condition</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredItems.map((item) => {
                  const isUnavailable = item.available_copies === 0 || item.condition_status === 'Maintenance';
                  const isLow = item.available_copies === 1 && item.total_copies > 1;
                  return (
                    <tr key={item.item_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs font-medium text-slate-700 whitespace-nowrap">
                        {item.asset_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{item.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {item.domain} · {item.category_name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {item.location_shelf}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {item.loan_period_days}d
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        ${item.daily_fine_rate.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 font-mono tabular-nums text-xs font-semibold">
                          {item.available_copies === 0 ? (
                            <span className="text-red-700">0 / {item.total_copies}</span>
                          ) : isLow ? (
                            <span className="text-amber-700">
                              {item.available_copies} / {item.total_copies}
                            </span>
                          ) : (
                            <span className="text-emerald-700">
                              {item.available_copies} / {item.total_copies}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={item.condition_status}
                          onChange={(e) =>
                            onUpdateItem(item.item_id, {
                              condition_status: e.target.value as ConditionStatus,
                            })
                          }
                          aria-label={`Condition for ${item.title}`}
                          className="text-xs bg-transparent border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:border-blue-600"
                        >
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Maintenance">Maintenance</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => onUpdateItem(item.item_id, { total_copies: item.total_copies + 1 })}
                            title="Add 1 copy to stock"
                            className="px-2 py-1 text-xs font-mono text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors"
                          >
                            +1
                          </button>
                          <button
                            disabled={isUnavailable}
                            onClick={() => onOpenIssueForItem(item)}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                              isUnavailable
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-blue-700 text-white hover:bg-blue-800'
                            }`}
                          >
                            {item.condition_status === 'Maintenance' ? (
                              <>
                                <Wrench className="w-3 h-3" /> Maint.
                              </>
                            ) : item.available_copies === 0 ? (
                              <>
                                <AlertTriangle className="w-3 h-3" /> Out
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3 h-3" /> Borrow
                              </>
                            )}
                          </button>
                        </div>
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
