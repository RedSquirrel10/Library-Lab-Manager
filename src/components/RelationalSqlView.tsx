import { AlertCircle, Database, KeyRound, Link2, Play } from 'lucide-react';
import { useState } from 'react';
import type { TableSchemaInfo } from '../types';

interface RelationalSqlViewProps {
  schema: TableSchemaInfo[];
  loading: boolean;
}

const PRESET_QUERIES: Array<{ label: string; description: string; sql: string }> = [
  {
    label: 'Overdue Items & Fines (4-Table Join)',
    description: 'Joins loans, borrowers, inventory_items, and categories to compute overdue days and unpaid balances.',
    sql: `SELECT
  l.loan_id,
  b.university_id,
  b.full_name AS borrower,
  i.asset_code,
  i.title,
  c.name AS category,
  l.due_date,
  f.days_overdue,
  f.amount_due,
  f.payment_status
FROM loans l
INNER JOIN borrowers b ON l.borrower_id = b.borrower_id
INNER JOIN inventory_items i ON l.item_id = i.item_id
INNER JOIN categories c ON i.category_id = c.category_id
LEFT JOIN fines f ON l.loan_id = f.loan_id
WHERE l.status = 'Overdue'
ORDER BY f.amount_due DESC;`,
  },
  {
    label: 'Category Stock & Utilization (GROUP BY)',
    description: 'Aggregates total units, available units, and checked-out percentage per category.',
    sql: `SELECT
  c.domain,
  c.name AS category_name,
  c.loan_period_days,
  c.daily_fine_rate,
  COUNT(i.item_id) AS item_titles,
  SUM(i.total_copies) AS total_units,
  SUM(i.available_copies) AS available_units,
  SUM(i.total_copies - i.available_copies) AS checked_out
FROM categories c
LEFT JOIN inventory_items i ON c.category_id = i.category_id
GROUP BY c.category_id
ORDER BY checked_out DESC, c.domain ASC;`,
  },
  {
    label: 'Borrower Load & Fine Exposure',
    description: 'Lists every borrower with their current checked-out items and total unpaid fine balance.',
    sql: `SELECT
  b.university_id,
  b.full_name,
  b.department,
  b.status,
  COUNT(CASE WHEN l.returned_at IS NULL THEN 1 END) AS active_loans,
  b.max_borrow_limit,
  ROUND(COALESCE(SUM(CASE WHEN f.payment_status IN ('Unpaid', 'Partial') THEN f.amount_due - f.amount_paid ELSE 0 END), 0), 2) AS unpaid_fines
FROM borrowers b
LEFT JOIN loans l ON b.borrower_id = l.borrower_id
LEFT JOIN fines f ON l.loan_id = f.loan_id
GROUP BY b.borrower_id
ORDER BY unpaid_fines DESC, active_loans DESC;`,
  },
];

export function RelationalSqlView({ schema, loading }: RelationalSqlViewProps) {
  const [selectedTable, setSelectedTable] = useState<string>('loans');
  const [sqlText, setSqlText] = useState<string>(PRESET_QUERIES[0].sql);
  const [queryResult, setQueryResult] = useState<{
    columns: string[];
    rows: Array<Record<string, unknown>>;
    total_rows: number;
    elapsed_ms: number;
  } | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const runQuery = async (queryToRun?: string) => {
    const targetSql = queryToRun ?? sqlText;
    setRunning(true);
    setQueryError(null);
    try {
      const res = await fetch('/api/sql-inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: targetSql }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQueryError(data.error || 'Failed to execute query.');
        setQueryResult(null);
      } else {
        setQueryResult(data);
      }
    } catch (err) {
      setQueryError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const activeTableInfo = schema.find((t) => t.name === selectedTable) ?? schema[0];

  return (
    <div className="space-y-8">
      {/* Relational Schema Explorer */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Normalized Relational Schema (3NF)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live SQLite tables with enforced <span className="font-mono text-slate-700">PRIMARY KEY</span>,{' '}
              <span className="font-mono text-slate-700">FOREIGN KEY</span>, and{' '}
              <span className="font-mono text-slate-700">CHECK</span> constraints
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">PRAGMA foreign_keys = ON</span>
        </div>

        {loading ? (
          <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {schema.map((tbl) => {
              const isSelected = tbl.name === activeTableInfo?.name;
              return (
                <button
                  key={tbl.name}
                  onClick={() => {
                    setSelectedTable(tbl.name);
                    const previewSql = `SELECT * FROM ${tbl.name} LIMIT 25;`;
                    setSqlText(previewSql);
                    runQuery(previewSql);
                  }}
                  className={`text-left bg-white rounded-xl p-4 border transition-colors ${
                    isSelected
                      ? 'border-blue-600 ring-1 ring-blue-600/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900 truncate">{tbl.name}</span>
                    <span className="font-mono tabular-nums text-xs text-slate-500 shrink-0">
                      {tbl.row_count} rows
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
                    {tbl.columns.slice(0, 6).map((col) => {
                      const fk = tbl.foreign_keys.find((f) => f.from === col.name);
                      return (
                        <div key={col.name} className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono text-slate-700 truncate flex items-center gap-1">
                            {col.pk > 0 && <KeyRound className="w-3 h-3 text-amber-600 shrink-0" />}
                            {fk && <Link2 className="w-3 h-3 text-blue-600 shrink-0" />}
                            {col.name}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400 shrink-0">{col.type}</span>
                        </div>
                      );
                    })}
                    {tbl.columns.length > 6 && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        +{tbl.columns.length - 6} more columns
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Table Foreign Keys & DDL */}
        {activeTableInfo && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Database className="w-4 h-4 text-blue-700" />
                <span className="font-mono">{activeTableInfo.name}</span>
                <span className="text-xs font-normal text-slate-500">· Foreign Key Links</span>
              </div>

              {activeTableInfo.foreign_keys.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Root lookup/entity table (referenced by child tables via foreign keys).
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {activeTableInfo.foreign_keys.map((fk, idx) => (
                    <div key={idx} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-slate-800">
                        {fk.from} → {fk.table}.{fk.to}
                      </span>
                      <span className="font-mono text-slate-500 shrink-0">ON DELETE {fk.on_delete}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-7">
              <div className="text-xs font-medium text-slate-500 mb-2">SQLite DDL Definition</div>
              <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
                {activeTableInfo.create_sql}
              </pre>
            </div>
          </div>
        )}
      </section>

      {/* Live SQL Query Console */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Read-Only SQL Join &amp; Query Console</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Execute live <span className="font-mono text-slate-700">SELECT</span> queries across the relational tables
            </p>
          </div>
          <button
            onClick={() => runQuery()}
            disabled={running}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Running...' : 'Run SQL Query'}
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_QUERIES.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  setSqlText(preset.sql);
                  runQuery(preset.sql);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-md transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <textarea
            value={sqlText}
            onChange={(e) => setSqlText(e.target.value)}
            rows={7}
            spellCheck={false}
            aria-label="SQL query editor"
            className="w-full p-4 font-mono text-xs bg-slate-950 text-slate-100 rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/40 leading-relaxed"
          />

          {queryError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>{queryError}</div>
            </div>
          )}

          {queryResult && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Returned <strong className="text-slate-900 font-mono tabular-nums">{queryResult.total_rows}</strong>{' '}
                  row(s)
                </span>
                <span className="font-mono tabular-nums">{queryResult.elapsed_ms} ms</span>
              </div>

              {queryResult.rows.length === 0 ? (
                <div className="p-6 border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                  Query executed successfully and returned 0 rows.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-mono font-medium text-slate-600">
                        {queryResult.columns.map((col) => (
                          <th key={col} className="py-2 px-3 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                      {queryResult.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50">
                          {queryResult.columns.map((col) => (
                            <td key={col} className="py-2 px-3 text-slate-800 whitespace-nowrap max-w-[260px] truncate">
                              {row[col] === null ? <span className="text-slate-400">NULL</span> : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
