import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Columns3,
  Download,
  Rows3,
  Rows4,
  Search,
  X,
} from 'lucide-react';
import { heatStyle, rankStyle } from '../lib/colors';

type Cell = string | number | null | undefined;

export interface Column<R> {
  key: string;
  label: string;
  /** Raw value used for sorting, searching, filters, heat and CSV. Defaults to `row[key]`. */
  value?: (row: R) => Cell;
  render?: (row: R) => ReactNode;
  numeric?: boolean;
  align?: 'left' | 'right' | 'center';
  /** `true` tints by magnitude (higher is worse); `'rank'` draws a solid rank badge. */
  heat?: boolean | 'rank';
  /** Offer a dropdown filter of this column's distinct values. */
  filter?: boolean;
  /** Hidden until switched on in the column picker. */
  hidden?: boolean;
  sortable?: boolean;
  csv?: boolean;
  digits?: number;
  hint?: string;
}

export function IdChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
      {children}
    </span>
  );
}

function rawValue<R>(col: Column<R>, row: R): Cell {
  if (col.value) return col.value(row);
  return (row as Record<string, Cell>)[col.key];
}

function formatCell(v: Cell, digits?: number) {
  if (v == null || v === '') return '—';
  if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)))) {
    const n = Number(v);
    return digits != null
      ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return String(v);
}

function csvEscape(v: Cell) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const selectClass =
  'h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200';
const iconBtn =
  'flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5';

export function DataGrid<R>({
  rows,
  columns,
  rowKey,
  loading,
  title,
  subtitle,
  toolbar,
  actions,
  defaultSort,
  pageSize: initialPageSize = 25,
  exportName = 'export',
  footer,
  emptyText = 'No rows match these filters',
  searchPlaceholder = 'Search…',
  noun = 'rows',
  urlState = true,
}: {
  rows: R[];
  columns: Array<Column<R>>;
  rowKey: (row: R, index: number) => string;
  loading?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Extra controls placed after the filters (e.g. a view toggle). */
  toolbar?: ReactNode;
  /** Buttons placed at the right of the header (e.g. "New group"). */
  actions?: ReactNode;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  pageSize?: number;
  exportName?: string;
  footer?: ReactNode;
  emptyText?: string;
  searchPlaceholder?: string;
  noun?: string;
  /** Mirror search and filters into the URL so saved views restore them. */
  urlState?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const [localQuery, setLocalQuery] = useState('');
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});

  const query = urlState ? (params.get('q') ?? '') : localQuery;
  const filters = useMemo(() => {
    if (!urlState) return localFilters;
    const out: Record<string, string> = {};
    for (const c of columns) {
      const v = params.get(`f_${c.key}`);
      if (c.filter && v) out[c.key] = v;
    }
    return out;
  }, [urlState, localFilters, params, columns]);

  const setQuery = (v: string) => {
    if (!urlState) return setLocalQuery(v);
    const p = new URLSearchParams(params);
    if (v) p.set('q', v);
    else p.delete('q');
    setParams(p, { replace: true });
  };
  const setFilter = (key: string, v: string) => {
    if (!urlState) return setLocalFilters((f) => ({ ...f, [key]: v }));
    const p = new URLSearchParams(params);
    if (v) p.set(`f_${key}`, v);
    else p.delete(`f_${key}`);
    setParams(p, { replace: true });
  };
  const clearAll = () => {
    if (!urlState) {
      setLocalQuery('');
      setLocalFilters({});
      return;
    }
    const p = new URLSearchParams(params);
    p.delete('q');
    for (const c of columns) p.delete(`f_${c.key}`);
    setParams(p, { replace: true });
  };

  const [sortKey, setSortKey] = useState(defaultSort?.key ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSort?.dir ?? 'desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [compact, setCompact] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.hidden).map((c) => c.key)),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  const resetKey = `${query}|${JSON.stringify(filters)}|${rows.length}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const visibleCols = columns.filter((c) => !hidden.has(c.key));

  const filterOptions = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of columns.filter((col) => col.filter)) {
      const set = new Set<string>();
      for (const r of rows) {
        const v = rawValue(c, r);
        if (v != null && v !== '') set.add(String(v));
      }
      out[c.key] = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return out;
  }, [rows, columns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      for (const [key, v] of Object.entries(filters)) {
        const col = columns.find((c) => c.key === key);
        if (col && v && String(rawValue(col, r) ?? '') !== v) return false;
      }
      if (!q) return true;
      return columns.some((c) => String(rawValue(c, r) ?? '').toLowerCase().includes(q));
    });
  }, [rows, columns, query, filters]);

  const ranges = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};
    for (const c of columns.filter((col) => col.heat)) {
      let min = Infinity;
      let max = -Infinity;
      for (const r of rows) {
        const n = Number(rawValue(c, r));
        if (!Number.isFinite(n)) continue;
        min = Math.min(min, n);
        max = Math.max(max, n);
      }
      out[c.key] = { min, max };
    }
    return out;
  }, [rows, columns]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = rawValue(col, a);
      const bv = rawValue(col, b);
      if (col.numeric || col.heat) return (Number(av ?? 0) - Number(bv ?? 0)) * dir;
      return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true }) * dir;
    });
  }, [filtered, columns, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const activeFilters = Object.values(filters).filter(Boolean).length + (query ? 1 : 0);

  const toggleSort = (col: Column<R>) => {
    if (col.sortable === false) return;
    if (col.key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(col.key);
      setSortDir(col.numeric || col.heat === true ? 'desc' : 'asc');
    }
  };

  const exportCsv = () => {
    const cols = visibleCols.filter((c) => c.csv !== false);
    const lines = [
      cols.map((c) => csvEscape(c.label)).join(','),
      ...sorted.map((r) => cols.map((c) => csvEscape(rawValue(c, r))).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellPad = compact ? 'px-3 py-1' : 'px-3 py-2';

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900/60 dark:shadow-none">
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-60 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/20"
          />
        </div>
        {columns
          .filter((c) => c.filter)
          .map((c) => (
            <select
              key={c.key}
              value={filters[c.key] ?? ''}
              onChange={(e) => setFilter(c.key, e.target.value)}
              className={`${selectClass} ${filters[c.key] ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-200' : ''}`}
              aria-label={`Filter by ${c.label}`}
            >
              <option value="">All {c.label}</option>
              {(filterOptions[c.key] ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ))}
        {toolbar}
        {activeFilters > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-100"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="tabular text-xs text-slate-500 dark:text-slate-400">
            {loading
              ? 'Loading…'
              : `${sorted.length.toLocaleString()}${sorted.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ''} ${noun}`}
          </span>
          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            className={iconBtn}
            title={compact ? 'Comfortable rows' : 'Compact rows'}
          >
            {compact ? <Rows3 className="h-3.5 w-3.5" /> : <Rows4 className="h-3.5 w-3.5" />}
          </button>
          <div className="relative" ref={pickerRef}>
            <button type="button" onClick={() => setPickerOpen((v) => !v)} className={iconBtn}>
              <Columns3 className="h-3.5 w-3.5" /> Columns
              {hidden.size > 0 && (
                <span className="tabular rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-400">
                  {columns.length - hidden.size}/{columns.length}
                </span>
              )}
            </button>
            {pickerOpen && (
              <div className="absolute right-0 z-30 mt-1.5 max-h-80 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-slate-900">
                {columns.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.key)}
                      onChange={() =>
                        setHidden((h) => {
                          const next = new Set(h);
                          if (next.has(c.key)) next.delete(c.key);
                          else next.add(c.key);
                          return next;
                        })
                      }
                      className="accent-blue-600"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={exportCsv} className={iconBtn} title="Download the filtered rows as CSV">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="max-h-[640px] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              {visibleCols.map((c) => {
                const active = sortKey === c.key;
                const right = c.align === 'right' || (c.align == null && (c.numeric || c.heat === true));
                const center = c.align === 'center' || c.heat === 'rank';
                return (
                  <th
                    key={c.key}
                    title={c.hint}
                    className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 ${cellPad} font-medium text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400 ${
                      right ? 'text-right' : center ? 'text-center' : 'text-left'
                    }`}
                  >
                    {c.sortable === false ? (
                      c.label
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSort(c)}
                        className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white ${active ? 'text-slate-900 dark:text-white' : ''}`}
                      >
                        {c.label}
                        {active ? (
                          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={rowKey(r, i)} className="hover:bg-blue-50/40 dark:hover:bg-white/[0.04]">
                {visibleCols.map((c) => {
                  const right = c.align === 'right' || (c.align == null && (c.numeric || c.heat === true));
                  const center = c.align === 'center' || c.heat === 'rank';
                  const base = `whitespace-nowrap border-b border-slate-100 ${cellPad} text-slate-700 dark:border-white/5 dark:text-slate-300 ${
                    right ? 'text-right tabular-nums' : center ? 'text-center' : ''
                  }`;
                  const v = rawValue(c, r);
                  let content: ReactNode;
                  if (c.render) content = c.render(r);
                  else if (c.heat === 'rank') {
                    const n = Number(v);
                    content = Number.isFinite(n) && v != null ? (
                      <span
                        className="tabular inline-grid h-6 min-w-[28px] place-items-center rounded-md px-1.5 text-[11px] font-semibold"
                        style={rankStyle(n, ranges[c.key]?.max ?? n)}
                      >
                        {n}
                      </span>
                    ) : (
                      '—'
                    );
                  } else if (c.heat) {
                    const n = Number(v);
                    const range = ranges[c.key];
                    content = (
                      <span
                        className="tabular inline-block min-w-[52px] rounded px-1.5 py-0.5 text-right"
                        style={range ? heatStyle(n, range.min, range.max) : undefined}
                      >
                        {formatCell(v, c.digits)}
                      </span>
                    );
                  } else content = formatCell(v, c.numeric ? c.digits : undefined);
                  return (
                    <td key={c.key} className={base}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="px-4 py-12 text-center text-sm text-slate-500">
                  {emptyText}
                </td>
              </tr>
            )}
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="px-4 py-12 text-center text-sm text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{footer}</div>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="h-7 rounded-md border border-slate-200 bg-white px-1 text-slate-700 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={current === 0}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="tabular px-1">
              {current + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={current >= pageCount - 1}
              className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HeatLegend({ label = 'Shading: better → worse' }: { label?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-16 rounded-full"
        style={{ background: 'linear-gradient(90deg, hsl(145 62% 40%), hsl(72 62% 40%), hsl(0 62% 40%))' }}
      />
      {label}
    </span>
  );
}
