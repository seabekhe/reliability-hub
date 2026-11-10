import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';

export type Row = Record<string, unknown>;

export type SelectFilter = { key: string; label: string; field?: string };
export type TextFilter = { key: string; label: string; field?: string; placeholder?: string };

type Config = {
  dateField?: string;
  selects: SelectFilter[];
  texts: TextFilter[];
  hideTypeless?: boolean;
};

function cell(row: Row, field: string) {
  const v = row[field];
  return v == null ? '' : String(v);
}

function dayOf(value: string) {
  return value.slice(0, 10);
}

export function useMapTableFilters(rows: Row[], config: Config) {
  const { dateField, selects, texts, hideTypeless } = config;
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const typelessOn = Boolean(hideTypeless) && params.get('typeless') === '1';

  const selected = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of selects) {
      const v = params.get(`f_${s.key}`);
      if (v) out[s.key] = v;
    }
    for (const t of texts) {
      const v = params.get(`t_${t.key}`);
      if (v) out[t.key] = v;
    }
    return out;
  }, [params, selects, texts]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const clear = () => {
    const next = new URLSearchParams(params);
    for (const key of ['q', 'from', 'to', 'typeless']) next.delete(key);
    for (const s of selects) next.delete(`f_${s.key}`);
    for (const t of texts) next.delete(`t_${t.key}`);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (dateField) {
        const day = dayOf(cell(row, dateField));
        if (from && day && day < from) return false;
        if (to && day && day > to) return false;
      }
      for (const s of selects) {
        const want = selected[s.key];
        if (want && cell(row, s.field ?? s.key) !== want) return false;
      }
      for (const t of texts) {
        const want = selected[t.key]?.trim().toLowerCase();
        if (want && !cell(row, t.field ?? t.key).toLowerCase().includes(want)) return false;
      }
      if (typelessOn && !cell(row, 'device_type').trim()) return false;
      if (!needle) return true;
      return Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(needle));
    });
  }, [rows, q, from, to, selected, selects, texts, dateField, typelessOn]);

  const options = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const s of selects) {
      const field = s.field ?? s.key;
      const values = new Set<string>();
      for (const row of rows) {
        const ok = selects.every((other) => {
          if (other.key === s.key) return true;
          const want = selected[other.key];
          return !want || cell(row, other.field ?? other.key) === want;
        });
        if (!ok) continue;
        const v = cell(row, field);
        if (v) values.add(v);
      }
      out[s.key] = [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return out;
  }, [rows, selects, selected]);

  const active =
    Number(Boolean(q)) +
    Number(Boolean(from)) +
    Number(Boolean(to)) +
    Number(typelessOn) +
    Object.values(selected).filter(Boolean).length;

  return {
    filtered,
    q,
    from,
    to,
    typelessOn,
    selected,
    options,
    active,
    set,
    clear,
    dateField,
    selects,
    texts,
    hideTypeless,
  };
}

const fieldClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100';

export function FilterBar({
  model,
  dateLabel = 'Started',
}: {
  model: ReturnType<typeof useMapTableFilters>;
  dateLabel?: string;
}) {
  const {
    q,
    from,
    to,
    typelessOn,
    selected,
    options,
    active,
    set,
    clear,
    dateField,
    selects,
    texts,
    hideTypeless,
  } = model;
  const [open, setOpen] = useState(false);

  const chips: string[] = [];
  if (from || to) chips.push(`${dateLabel} ${from || '…'} – ${to || '…'}`);
  for (const s of selects) {
    if (selected[s.key]) chips.push(`${s.label}: ${selected[s.key]}`);
  }
  for (const t of texts) {
    if (selected[t.key]) chips.push(`${t.label}: ${selected[t.key]}`);
  }
  if (typelessOn) chips.push('Typed devices only');

  return (
    <div className="sticky top-16 z-20 rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-950/90">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <span className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => set('q', e.target.value)}
            placeholder="Search area, feeder, device, cause…"
            className={`${fieldClass} pl-8`}
          />
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
            open || active
              ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-200'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {active > 0 && (
            <span className="tabular rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white dark:bg-blue-400 dark:text-slate-950">
              {active}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {active > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/5 dark:hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {!open && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-2 dark:border-white/10">
          {chips.map((chip) => (
            <span
              key={chip}
              className="max-w-[220px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-white/10 dark:text-slate-300"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 dark:border-white/10">
          {dateField && (
            <div className="flex flex-wrap gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">{dateLabel} from</span>
                <input type="date" value={from} onChange={(e) => set('from', e.target.value)} className={fieldClass} />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">to</span>
                <input type="date" value={to} onChange={(e) => set('to', e.target.value)} className={fieldClass} />
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {selects.map((s) => (
              <label key={s.key} className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">{s.label}</span>
                <select
                  value={selected[s.key] ?? ''}
                  onChange={(e) => set(`f_${s.key}`, e.target.value)}
                  className={`${fieldClass} ${selected[s.key] ? 'border-blue-300 bg-blue-50 dark:border-blue-400/40 dark:bg-blue-500/15' : ''}`}
                >
                  <option value="">All</option>
                  {(options[s.key] ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {texts.map((t) => (
              <label key={t.key} className="space-y-1">
                <span className="text-[11px] font-medium text-slate-500">{t.label}</span>
                <input
                  value={selected[t.key] ?? ''}
                  onChange={(e) => set(`t_${t.key}`, e.target.value)}
                  placeholder={t.placeholder ?? t.label}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
          {hideTypeless && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={typelessOn}
                onChange={(e) => set('typeless', e.target.checked ? '1' : '')}
              />
              Hide events with no device type
            </label>
          )}
        </div>
      )}
    </div>
  );
}
