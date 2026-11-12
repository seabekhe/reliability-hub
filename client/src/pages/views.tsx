import {
  BarChart,
  Button,
  Input,
  LineChart,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Minus, Pencil, Plus, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { formatInt, formatNum, formatPct, toNumber } from '../lib/formatters';
import { heatStyle, rankBy, rankColor } from '../lib/colors';
import { ComingSoonPanel, ComingSoonTag } from '../components/ComingSoon';
import { SOURCE_MODE } from '../lib/dataMode';
import { MapPanel } from '../components/MapPanel';
import { MAP_STYLE_KEY } from '../lib/constants';
import { applyColorMode, getStoredColorMode, type ColorMode } from '../lib/theme';
import { TrendChart } from '../components/TrendChart';
import { DataGrid, HeatLegend, IdChip, type Column } from '../components/DataGrid';
import { FilterBar, useMapTableFilters } from '../components/FilterBar';
import { CustomerExperienceTab, ResiliencyTab } from '../components/CompanyTabs';
import { Badge, EmptyState, PageHeader, Panel, Pill, Segmented, Tabs, type Tone } from '../components/ui';
import type { OpCoCode } from '../lib/constants';
import { OPCO_META, REPORTING_AS_OF, opcoMeta } from '../lib/constants';

function opcoParam(opco: string) {
  return { opco: sql.string(opco) };
}

function datasetParam(opco: string, dataset: string) {
  return { opco: sql.string(opco), dataset: sql.string(dataset) };
}

type DataSet = 'Reported' | 'CX';

/** Share of the reporting year elapsed at the as-of date — the pace line for YTD-vs-annual goals. */
const YEAR_ELAPSED = Number(REPORTING_AS_OF.slice(5, 7)) / 12;
const str = (v: unknown, fallback = '') => (v == null || v === '' ? fallback : String(v as string | number));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Keep a URL search param in sync so saved views capture page filters. */
function useParamState<T extends string>(key: string, fallback: T) {
  const [params, setParams] = useSearchParams();
  const value = (params.get(key) as T | null) ?? fallback;
  const set = (next: T) => {
    const p = new URLSearchParams(params);
    if (next === fallback) p.delete(key);
    else p.set(key, next);
    setParams(p, { replace: true });
  };
  return [value, set] as const;
}

function fundingTone(funding: number): Tone {
  if (funding >= 100) return 'good';
  if (funding >= 70) return 'warn';
  return 'bad';
}

function Scorecard({
  label,
  description,
  actual,
  goal,
  projected,
  funding,
  digits,
}: {
  label: string;
  description: string;
  actual: number;
  goal: number;
  projected: number;
  funding: number;
  digits: number;
}) {
  const used = goal > 0 ? actual / goal : 0;
  const beating = actual <= goal;
  const onPace = used <= YEAR_ELAPSED;
  const fill = Math.min(1, used);

  return (
    <Panel>
      <div className="pt-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{label}</div>
            <div className="text-xs text-slate-500">{description}</div>
          </div>
          <Pill tone={beating ? 'good' : 'bad'}>{beating ? 'Within annual goal' : 'Above annual goal'}</Pill>
        </div>

        <div className="flex items-end gap-8">
          <div>
            <div className="text-xs text-slate-700 dark:text-slate-200">Actual YTD</div>
            <div
              className={`tabular text-4xl font-semibold tracking-tight ${beating ? 'text-slate-900 dark:text-slate-50' : 'text-rose-600 dark:text-rose-400'}`}
            >
              {formatNum(actual, digits)}
            </div>
          </div>
          <div className="pb-1">
            <div className="text-xs text-slate-500">Annual goal</div>
            <div className="tabular text-xl font-medium text-slate-600 dark:text-slate-300">
              {formatNum(goal, digits)}
            </div>
          </div>
          <div className="pb-1">
            <div className="text-xs text-slate-500">Projected year-end</div>
            <div className="tabular text-xl font-medium text-slate-600 dark:text-slate-300">
              {formatNum(projected, digits)}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${onPace ? 'bg-blue-600' : 'bg-amber-500'}`}
              style={{ width: `${fill * 100}%` }}
            />
            <div
              className="absolute -top-1 -bottom-1 w-0.5 rounded bg-slate-900 dark:bg-white"
              style={{ left: `${YEAR_ELAPSED * 100}%` }}
              title="Share of the year elapsed"
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>
              <span className="tabular font-medium text-slate-700 dark:text-slate-200">{formatPct(used * 100)}</span> of
              annual goal used
            </span>
            <span>
              {onPace ? 'On pace' : 'Ahead of pace'} · {formatPct(YEAR_ELAPSED * 100)} of year elapsed
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
          <span className="text-xs text-slate-500">Projected year-end funding</span>
          {SOURCE_MODE ? <ComingSoonTag label="" /> : <Pill tone={fundingTone(funding)}>{formatPct(funding)}</Pill>}
        </div>
      </div>
    </Panel>
  );
}

function KpiScorecards({ opco }: { opco: OpCoCode }) {
  const { data, loading } = useAnalyticsQuery('kpi_ytd', opcoParam(opco));
  const row = data?.[0];
  if (!row) {
    return <EmptyState>{loading ? 'Loading scorecards…' : 'No KPI data'}</EmptyState>;
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Scorecard
        label="SAIDI"
        description="Average outage minutes per customer"
        actual={toNumber(row.saidi_actual)}
        goal={toNumber(row.saidi_goal)}
        projected={toNumber(row.saidi_ye_proj)}
        funding={toNumber(row.saidi_funding_pct)}
        digits={1}
      />
      <Scorecard
        label="SAIFI"
        description="Average interruptions per customer"
        actual={toNumber(row.saifi_actual)}
        goal={toNumber(row.saifi_goal)}
        projected={toNumber(row.saifi_ye_proj)}
        funding={toNumber(row.saifi_funding_pct)}
        digits={3}
      />
    </div>
  );
}

function AttentionPanel({ opco }: { opco: OpCoCode }) {
  const { data: feeders } = useAnalyticsQuery('worst_feeders', datasetParam(opco, 'Reported'));
  const { data: areas } = useAnalyticsQuery('company_breakdown', opcoParam(opco));

  const worstFeeders = (feeders ?? []).slice(0, 5);
  const risingAreas = useMemo(
    () =>
      [...(areas ?? [])]
        .map((a) => ({
          pd_area: String(a.pd_area),
          actual: toNumber(a.saidi_actual),
          delta: toNumber(a.saidi_actual) - toNumber(a.saidi_prior),
        }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5),
    [areas]
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="Worst performing feeders"
        subtitle="Highest severity index (SAIDI × SAIFI)"
        actions={
          <Link
            to={`/wpf?opco=${opco}`}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            All feeders <ArrowRight className="h-3 w-3" />
          </Link>
        }
        padded={false}
      >
        <ul className="divide-y divide-slate-100 dark:divide-white/10">
          {worstFeeders.map((f, i) => (
            <li key={`${f.feeder_id}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
              <span className="tabular grid h-6 w-6 place-items-center rounded-md bg-rose-50 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  Feeder {String(f.feeder_id)} · {String(f.substation)}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {String(f.pd_area)} · {String(f.workgroup)} · {formatInt(f.event_count)} events
                </div>
              </div>
              <div className="text-right">
                <div className="tabular text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {formatNum(f.si, 1)}
                </div>
                <div className="text-[11px] text-slate-400">SI</div>
              </div>
            </li>
          ))}
          {worstFeeders.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">Loading…</li>}
        </ul>
      </Panel>

      <Panel
        title="PD areas moving the wrong way"
        subtitle="Largest SAIDI increase vs prior year"
        actions={
          <Link
            to={`/?opco=${opco}&tab=reliability`}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Reliability tab <ArrowRight className="h-3 w-3" />
          </Link>
        }
        padded={false}
      >
        <ul className="divide-y divide-slate-100 dark:divide-white/10">
          {risingAreas.map((a) => (
            <li key={a.pd_area} className="flex items-center gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{a.pd_area}</div>
                <div className="text-xs text-slate-500">SAIDI {formatNum(a.actual, 1)}</div>
              </div>
              <Pill tone={a.delta > 0 ? 'bad' : 'good'}>
                {a.delta > 0 ? '+' : ''}
                {formatNum(a.delta, 1)} min
              </Pill>
            </li>
          ))}
          {risingAreas.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">Loading…</li>}
        </ul>
      </Panel>
    </div>
  );
}

function OverviewTab({ opco, persona }: { opco: OpCoCode; persona: 'exec' | 'opco' }) {
  return (
    <div className="space-y-6">
      <KpiScorecards opco={opco} />
      <div className="grid gap-5 lg:grid-cols-2">
        <TrendChart opco={opco} metric="saidi" title="SAIDI against goal" />
        <TrendChart opco={opco} metric="saifi" title="SAIFI against goal" />
      </div>
      <AttentionPanel opco={opco} />
      {persona === 'exec' && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Operating companies</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {OPCO_META.map((item) => (
              <Link
                key={item.code}
                to={`/?opco=${item.code}&tab=reliability`}
                className={`group rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-blue-300 dark:bg-slate-900/60 dark:hover:border-blue-400/40 ${
                  item.code === opco
                    ? 'border-blue-300 dark:border-blue-400/40'
                    : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </div>
                <div className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {item.name}
                </div>
                <div className="mt-1 flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  Open reliability detail{' '}
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReliabilityTab({ opco }: { opco: OpCoCode }) {
  const { data } = useAnalyticsQuery('company_breakdown', opcoParam(opco));
  const [metric, setMetric] = useState<'saidi' | 'saifi'>('saidi');
  const chart = useMemo(
    () =>
      (data ?? []).map((r) => ({
        pd_area: String(r.pd_area),
        '2026 YTD': toNumber(metric === 'saidi' ? r.saidi_actual : r.saifi_actual),
        'Prior year YTD': toNumber(metric === 'saidi' ? r.saidi_prior : r.saifi_prior),
      })),
    [data, metric]
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <TrendChart opco={opco} metric="saidi" title="SAIDI distribution against goal" />
        <TrendChart opco={opco} metric="saifi" title="SAIFI distribution against goal" />
      </div>
      <Panel
        title={`${metric.toUpperCase()} by PD area`}
        subtitle="This year to date against the same period last year"
        actions={
          <Segmented
            value={metric}
            onChange={setMetric}
            options={[
              { value: 'saidi', label: 'SAIDI' },
              { value: 'saifi', label: 'SAIFI' },
            ]}
          />
        }
      >
        {chart.length === 0 ? (
          <EmptyState>Loading…</EmptyState>
        ) : (
          <BarChart
            data={chart}
            xKey="pd_area"
            yKey={['2026 YTD', 'Prior year YTD']}
            showLegend
            height={320}
            colors={['#2563eb', '#cbd5e1']}
          />
        )}
      </Panel>
    </div>
  );
}

type ExecTab = 'overview' | 'reliability' | 'resiliency' | 'cx';

export function ExecutivePage({ opco, persona = 'exec' }: { opco: OpCoCode; persona?: 'exec' | 'opco' }) {
  const [tab, setTab] = useParamState<ExecTab>('tab', 'overview');
  const exec = persona === 'exec';
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={exec ? 'Omed Utilities · 2026 year to date' : `${opcoMeta(opco).name} · 2026 year to date`}
        title={exec ? 'Executive summary' : 'Performance'}
        description={
          exec
            ? 'Portfolio view across OC1, OC2, and OC3.'
            : `${opcoMeta(opco).name} reliability against this year's goals, and what to look at next.`
        }
      />
      <Tabs<ExecTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'reliability', label: 'Reliability' },
          { value: 'resiliency', label: 'Resiliency' },
          { value: 'cx', label: 'Customer experience' },
        ]}
      />
      {tab === 'overview' && <OverviewTab opco={opco} persona={persona} />}
      {tab === 'reliability' && <ReliabilityTab opco={opco} />}
      {tab === 'resiliency' && <ResiliencyTab opco={opco} />}
      {tab === 'cx' && <CustomerExperienceTab opco={opco} />}
    </div>
  );
}

type RankRow = Record<string, unknown> & { demi4_rank: number; cemi10_rank: number };

export function RankingsPage({ opco }: { opco: OpCoCode }) {
  const { data, loading } = useAnalyticsQuery('reliability_rankings', opcoParam(opco));
  const rows = useMemo<RankRow[]>(() => {
    const base = (data ?? []) as Array<Record<string, unknown>>;
    const demi = rankBy(base, (r) => toNumber(r.demi4 as number));
    const cemi = rankBy(base, (r) => toNumber(r.cemi10 as number));
    return base.map((r) => ({ ...r, demi4_rank: demi.get(r) ?? 0, cemi10_rank: cemi.get(r) ?? 0 }));
  }, [data]);

  const columns: Array<Column<RankRow>> = [
    { key: 'overall_rank', label: 'Overall', heat: 'rank', hint: 'Rank 1 is best' },
    { key: 'pd_area', label: 'PD area', filter: true },
    { key: 'workgroup', label: 'Workgroup', filter: true },
    { key: 'customers_served', label: 'Customers served', numeric: true },
    { key: 'customers_interrupted', label: 'Customers int.', numeric: true },
    { key: 'saifi', label: 'SAIFI', heat: true, digits: 3 },
    { key: 'saifi_rank', label: 'SAIFI rank', heat: 'rank' },
    { key: 'cmi', label: 'CMI', heat: true, digits: 0 },
    { key: 'saidi', label: 'SAIDI', heat: true, digits: 1 },
    { key: 'saidi_rank', label: 'SAIDI rank', heat: 'rank' },
    { key: 'demi4', label: 'DEMI-4', heat: true, digits: 2, hint: 'Customers exceeding four hours out' },
    { key: 'demi4_rank', label: 'DEMI-4 rank', heat: 'rank' },
    { key: 'cemi10_customers', label: 'CEMI-10 cust.', numeric: true, hidden: true },
    { key: 'cemi10', label: 'CEMI-10', heat: true, digits: 2, hint: 'Customers with ten or more interruptions' },
    { key: 'cemi10_rank', label: 'CEMI-10 rank', heat: 'rank' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance"
        title="Reliability rankings"
        description={`PD areas and workgroups ranked within ${opco}. Green is best, red is worst, for every rank and metric.`}
      />
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r, i) => `${String(r.workgroup)}-${i}`}
        loading={loading}
        defaultSort={{ key: 'overall_rank', dir: 'asc' }}
        exportName={`${opco.toLowerCase()}-reliability-rankings`}
        searchPlaceholder="Search PD area or workgroup…"
        noun="workgroups"
        footer={
          <>
            <HeatLegend />
            <span>
              Ranks are within {opco}. DEMI-4 and CEMI-10 ranks are computed in the app from the values shown.
            </span>
          </>
        }
      />
    </div>
  );
}

type HistMetric = 'saidi' | 'saifi' | 'cpi';
type HistView = 'ytd' | 'monthly';
type HistRange = '3' | '5';

const HIST_META: Record<HistMetric, { label: string; long: string; digits: number }> = {
  saidi: { label: 'SAIDI', long: 'Outage minutes per customer', digits: 1 },
  saifi: { label: 'SAIFI', long: 'Interruptions per customer', digits: 3 },
  cpi: { label: 'CPI', long: 'Customers per incident', digits: 1 },
};
const YEAR_COLORS = ['#2563eb', '#94a3b8', '#f59e0b', '#10b981', '#a855f7'];

export function HistoricalPage({ opco }: { opco: OpCoCode }) {
  const [metric, setMetric] = useParamState<HistMetric>('metric', 'saidi');
  const [viewParam, setView] = useParamState<HistView>('view', 'ytd');
  const [range, setRange] = useParamState<HistRange>('years', '3');
  const [heat, setHeat] = useState(true);
  const [dataset, setDataset] = useParamState<DataSet>('dataset', 'Reported');
  const { data, loading } = useAnalyticsQuery('kpi_heatmap', datasetParam(opco, dataset));
  const meta = HIST_META[metric];
  // CPI is a ratio, so a running total has no meaning.
  const view: HistView = metric === 'cpi' ? 'monthly' : viewParam;

  const model = useMemo(() => {
    const rows = (data ?? []).map((r) => ({
      year: toNumber(r.year),
      month: toNumber(r.month),
      value: toNumber((r as Record<string, unknown>)[metric] as number),
    }));
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a).slice(0, Number(range));
    const grid = new Map<number, Array<{ monthly: number; ytd: number } | null>>();
    for (const y of years) {
      let running = 0;
      grid.set(
        y,
        MONTHS.map((_, i) => {
          const hit = rows.find((r) => r.year === y && r.month === i + 1);
          if (!hit) return null;
          running += hit.value;
          return { monthly: hit.value, ytd: running };
        })
      );
    }
    const chart = MONTHS.map((label, i) => {
      const point: Record<string, string | number | null> = { month: label };
      for (const y of years) {
        const cell = grid.get(y)?.[i];
        point[String(y)] = cell ? Number((view === 'ytd' ? cell.ytd : cell.monthly).toFixed(meta.digits)) : null;
      }
      return point;
    });
    const all = [...grid.values()].flat().filter((c): c is { monthly: number; ytd: number } => c != null);
    const min = Math.min(...all.map((c) => c.monthly));
    const max = Math.max(...all.map((c) => c.monthly));
    return { years, grid, chart, min, max };
  }, [data, metric, range, view, meta.digits]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance"
        title="Historical"
        description="Compare years side by side, month by month. Spot storm seasons and recurring weak months."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<HistMetric>
          size="md"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'saidi', label: 'SAIDI' },
            { value: 'saifi', label: 'SAIFI' },
            { value: 'cpi', label: 'CPI' },
          ]}
        />
        <Segmented<HistView>
          size="md"
          value={view}
          onChange={setView}
          options={
            metric === 'cpi'
              ? [{ value: 'monthly', label: 'Monthly' }]
              : [
                  { value: 'ytd', label: 'Year to date' },
                  { value: 'monthly', label: 'Monthly' },
                ]
          }
        />
        <Segmented<HistRange>
          size="md"
          value={range}
          onChange={setRange}
          options={[
            { value: '3', label: 'Last 3 years' },
            { value: '5', label: 'Last 5 years' },
          ]}
        />
        <Segmented<DataSet>
          size="md"
          value={dataset}
          onChange={setDataset}
          options={[
            { value: 'Reported', label: 'Reported' },
            { value: 'CX', label: 'CX' },
          ]}
        />
        <span className="text-xs text-slate-700 dark:text-slate-200">Level: {opco}</span>
      </div>

      <Panel
        title={`${meta.label} ${view === 'ytd' ? 'year to date' : 'by month'}`}
        subtitle={`${meta.long}. 2026 runs through ${MONTHS[Number(REPORTING_AS_OF.slice(5, 7)) - 1]}.`}
      >
        {model.years.length === 0 ? (
          <EmptyState>{loading ? 'Loading…' : 'No data'}</EmptyState>
        ) : (
          <LineChart
            data={model.chart}
            xKey="month"
            yKey={model.years.map(String)}
            showLegend
            showSymbol
            height={320}
            colors={YEAR_COLORS}
          />
        )}
      </Panel>

      <Panel
        title="Detailed breakdown"
        subtitle={
          view === 'ytd' ? 'Running total, with the month’s own contribution underneath.' : 'Value for each month.'
        }
        padded={false}
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={heat}
              onChange={(e) => setHeat(e.target.checked)}
              className="accent-blue-600"
            />
            Heatmap
          </label>
        }
        footer={heat ? <HeatLegend label="Shading by monthly value: lower → higher" /> : undefined}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 border-y border-slate-200 bg-slate-50 px-4 py-2 text-left font-medium text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400">
                  Year
                </th>
                {MONTHS.map((m) => (
                  <th
                    key={m}
                    className="border-y border-slate-200 bg-slate-50 px-2 py-2 text-right font-medium text-slate-500 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400"
                  >
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.years.map((y, yi) => (
                <tr key={y}>
                  <td className="sticky left-0 border-b border-slate-100 bg-white px-4 py-2 font-medium text-slate-800 dark:border-white/5 dark:bg-slate-900 dark:text-slate-100">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: YEAR_COLORS[yi] }} />
                    {y}
                  </td>
                  {(model.grid.get(y) ?? []).map((cell, i) => (
                    <td
                      key={i}
                      className="border-b border-slate-100 px-2 py-1.5 text-right tabular-nums dark:border-white/5"
                      style={cell && heat ? heatStyle(cell.monthly, model.min, model.max) : undefined}
                    >
                      {cell ? (
                        <>
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            {formatNum(view === 'ytd' ? cell.ytd : cell.monthly, meta.digits)}
                          </div>
                          {view === 'ytd' && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              ▲ {formatNum(cell.monthly, meta.digits)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'bad'; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-slate-900/60 dark:shadow-none">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={`tabular mt-0.5 text-2xl font-semibold tracking-tight ${tone === 'bad' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-50'}`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

const TAG_TONE: Record<string, string> = {
  EX: 'bg-orange-500 text-white',
  PRI: 'bg-yellow-400 text-yellow-950',
  RP: 'bg-sky-500 text-white',
  QMO: 'bg-amber-500 text-white',
  OMO: 'bg-amber-600 text-white',
};
const THREAT_TONE: Record<string, Tone> = {
  Enhanced: 'bad',
  Moderate: 'bad',
  Marginal: 'warn',
  Slight: 'warn',
  Normal: 'neutral',
};

function TagPills({ value }: { value: string }) {
  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length === 0) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  return (
    <div className="flex gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${TAG_TONE[t] ?? 'bg-slate-400 text-white'}`}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

type StatusFilter = 'all' | 'Reported' | 'CX' | 'Closed';
type Row = Record<string, unknown>;

function startMs(row: Row) {
  const raw = String(row.start_time ?? '');
  const t = Date.parse(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  return Number.isFinite(t) ? t : 0;
}

function withRepeats(rows: Row[]): Row[] {
  const indexed = rows.map((row, i) => ({ row, i, feeder: String(row.feeder_id ?? ''), t: startMs(row) }));
  const byFeeder = new Map<string, typeof indexed>();
  for (const item of indexed) {
    const list = byFeeder.get(item.feeder) ?? [];
    list.push(item);
    byFeeder.set(item.feeder, list);
  }
  const windows = [
    ['repeat_1mo', 30 * 86400000],
    ['repeat_3mo', 90 * 86400000],
    ['repeat_6mo', 180 * 86400000],
    ['repeat_12mo', 365 * 86400000],
  ] as const;
  const out = rows.map((row) => ({ ...row }));
  for (const group of byFeeder.values()) {
    group.sort((a, b) => a.t - b.t);
    for (const item of group) {
      for (const [key, span] of windows) {
        let n = 0;
        for (const other of group) {
          if (other.t > item.t) break;
          if (item.t - other.t <= span) n += 1;
        }
        out[item.i][key] = n;
      }
    }
  }
  return out;
}

function useAllIncidents(opco: OpCoCode, status: StatusFilter) {
  const statusValue = status === 'all' ? '' : status;
  const p2023 = useMemo(
    () => ({ opco: sql.string(opco), status: sql.string(statusValue), year: sql.string('2023') }),
    [opco, statusValue]
  );
  const p2024 = useMemo(
    () => ({ opco: sql.string(opco), status: sql.string(statusValue), year: sql.string('2024') }),
    [opco, statusValue]
  );
  const p2025 = useMemo(
    () => ({ opco: sql.string(opco), status: sql.string(statusValue), year: sql.string('2025') }),
    [opco, statusValue]
  );
  const p2026 = useMemo(
    () => ({ opco: sql.string(opco), status: sql.string(statusValue), year: sql.string('2026') }),
    [opco, statusValue]
  );
  const y2023 = useAnalyticsQuery('incidents', p2023);
  const y2024 = useAnalyticsQuery('incidents', p2024);
  const y2025 = useAnalyticsQuery('incidents', p2025);
  const y2026 = useAnalyticsQuery('incidents', p2026);
  const parts = [y2023, y2024, y2025, y2026];
  const rows = useMemo(
    () => withRepeats(parts.flatMap((p) => (p.data ?? []) as Row[])),
    [y2023.data, y2024.data, y2025.data, y2026.data]
  );
  return {
    rows,
    loading: parts.some((p) => p.loading),
    error: parts.find((p) => p.error)?.error ?? null,
  };
}

const INCIDENT_COLUMNS: Array<Column<Row>> = [
  { key: 'tags', label: 'Tags', render: (r) => <TagPills value={str(r.tags)} /> },
  {
    key: 'threat_level',
    label: 'Threat',
    render: (r) => <Pill tone={THREAT_TONE[String(r.threat_level)] ?? 'neutral'}>{str(r.threat_level, '—')}</Pill>,
  },
  { key: 'status', label: 'Status' },
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'substation', label: 'Substation' },
  { key: 'feeder_id', label: 'Feeder', render: (r) => <IdChip>{String(r.feeder_id)}</IdChip> },
  { key: 'device_type', label: 'Device type' },
  { key: 'device', label: 'Device', render: (r) => <IdChip>{str(r.device, '—')}</IdChip> },
  { key: 'cause', label: 'Cause' },
  { key: 'incident_id', label: 'Incident', render: (r) => <IdChip>{String(r.incident_id)}</IdChip>, hidden: true },
  { key: 'start_time', label: 'Start' },
  { key: 'duration_min', label: 'Duration (min)', numeric: true },
  { key: 'ci_sustained', label: 'CI (sus)', heat: true, digits: 0 },
  { key: 'cmi', label: 'CMI', heat: true, digits: 0 },
  { key: 'repeat_1mo', label: '1 mo', heat: true, digits: 0, hint: 'Incidents on this feeder in the prior month' },
  { key: 'repeat_3mo', label: '3 mo', heat: true, digits: 0 },
  { key: 'repeat_6mo', label: '6 mo', heat: true, digits: 0 },
  { key: 'repeat_12mo', label: '12 mo', heat: true, digits: 0 },
];

const INCIDENT_SELECTS = [
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'substation', label: 'Substation' },
  { key: 'device_type', label: 'Device type' },
  { key: 'cause', label: 'Cause' },
  { key: 'threat_level', label: 'Threat' },
  { key: 'tags', label: 'Tags' },
];
const INCIDENT_TEXTS = [
  { key: 'feeder_id', label: 'Feeder', placeholder: 'Feeder ID' },
  { key: 'device', label: 'Device', placeholder: 'Device name' },
  { key: 'incident_id', label: 'Incident', placeholder: 'Incident ID' },
];

export function IncidentsPage({ opco }: { opco: OpCoCode }) {
  const [status, setStatus] = useParamState<StatusFilter>('status', 'all');
  const { rows, loading, error } = useAllIncidents(opco, status);
  const { data: wgRows } = useAnalyticsQuery('workgroup_rank', opcoParam(opco));
  const filters = useMapTableFilters(rows, {
    dateField: 'start_time',
    selects: INCIDENT_SELECTS,
    texts: INCIDENT_TEXTS,
    hideTypeless: true,
  });
  const view = filters.filtered;
  const polygons = useMemo(() => {
    const max = (wgRows ?? []).reduce((m, r) => Math.max(m, toNumber(r.overall_rank)), 1);
    return (wgRows ?? []).flatMap((r) => {
      const raw = r.geojson;
      if (typeof raw !== 'string' || !raw) return [];
      try {
        const gj = JSON.parse(raw) as { coordinates?: number[][][] };
        if (!gj.coordinates) return [];
        return [
          {
            rings: gj.coordinates,
            color: rankColor(toNumber(r.overall_rank), max),
            label: String(r.workgroup),
          },
        ];
      } catch {
        return [];
      }
    });
  }, [wgRows]);

  const stats = useMemo(() => {
    let ci = 0;
    let cmi = 0;
    let severe = 0;
    for (const r of view) {
      ci += toNumber(r.ci_sustained as number);
      cmi += toNumber(r.cmi as number);
      if (r.threat_level === 'Enhanced' || r.threat_level === 'Moderate') severe += 1;
    }
    return { count: view.length, ci, cmi, severe };
  }, [view]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Incidents"
        description="Every outage in the selected status. Filters apply to the cards, map, and table."
        actions={
          <Segmented<StatusFilter>
            size="md"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'All' },
              { value: 'Reported', label: 'Reported' },
              { value: 'CX', label: 'CX' },
              { value: 'Closed', label: 'Closed' },
            ]}
          />
        }
      />
      <FilterBar model={filters} />
      {error && <EmptyState>{error}</EmptyState>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Incidents" value={loading ? '…' : stats.count.toLocaleString()} />
        <Stat label="Customers interrupted" value={loading ? '…' : formatInt(stats.ci)} />
        <Stat label="Customer minutes (CMI)" value={loading ? '…' : formatInt(stats.cmi)} />
        <Stat label="Enhanced or moderate threat" value={loading ? '…' : stats.severe.toLocaleString()} tone="bad" />
      </div>
      {SOURCE_MODE && (
        <ComingSoonPanel compact title="Workgroup boundary polygons" description="Source data not available yet." />
      )}
      <MapPanel
        points={view.map((r) => ({
          lat: r.lat as number,
          lon: r.lon as number,
          label: `${String(r.cause)} · ${String(r.pd_area)} · ${String(r.threat_level)}`,
          tone: r.threat_level === 'Enhanced' || r.threat_level === 'Moderate' ? 'hot' : 'cool',
        }))}
        polygons={SOURCE_MODE ? [] : polygons}
        cluster
        height={520}
        title="Where incidents happened"
        legend={[
          { tone: 'hot', label: 'Enhanced or moderate threat' },
          { tone: 'cool', label: 'Marginal, slight or normal' },
        ]}
      />
      <DataGrid
        rows={view}
        columns={INCIDENT_COLUMNS}
        rowKey={(r, i) => str(r.incident_id, String(i))}
        loading={loading}
        urlState={false}
        defaultSort={{ key: 'start_time', dir: 'desc' }}
        exportName={`oc1-incidents-${status}`}
        searchPlaceholder="Search this page…"
        noun="incidents"
        emptyText={error ? error : loading ? 'Loading…' : 'No incidents match these filters'}
        footer={
          <>
            <HeatLegend label="Shading: lower → higher impact" />
            <span>CMI = customers interrupted × minutes. 1/3/6/12 mo = prior incidents on the same feeder.</span>
          </>
        }
      />
    </div>
  );
}

const FLAG_TONE: Record<string, Tone> = { Primary: 'bad', Recurring: 'warn', Watch: 'info' };
const PRIORITY: Record<number, { label: string; tone: Tone }> = {
  1: { label: 'High', tone: 'bad' },
  2: { label: 'Medium', tone: 'warn' },
  3: { label: 'Low', tone: 'info' },
};

function DeviceTrend({ row }: { row: Row }) {
  const recent = toNumber(row.mo_3 as number) / 3;
  const baseline = toNumber(row.mo_12 as number) / 12;
  if (baseline === 0) return <Minus className="mx-auto h-3.5 w-3.5 text-slate-300" />;
  const ratio = recent / baseline;
  if (ratio > 1.15) {
    return (
      <span
        title="Last 3 months running above the 12-month rate"
        className="inline-flex text-rose-600 dark:text-rose-400"
      >
        <TrendingUp className="h-4 w-4" />
      </span>
    );
  }
  if (ratio < 0.85) {
    return (
      <span
        title="Last 3 months running below the 12-month rate"
        className="inline-flex text-emerald-600 dark:text-emerald-400"
      >
        <TrendingDown className="h-4 w-4" />
      </span>
    );
  }
  return <Minus className="mx-auto h-3.5 w-3.5 text-slate-400" />;
}

const DEVICE_COLUMNS: Array<Column<Row>> = [
  {
    key: 'flags',
    label: 'Flags',
    render: (r) =>
      r.flags ? (
        <div className="flex gap-1">
          {str(r.flags)
            .split(',')
            .map((f) => f.trim())
            .filter(Boolean)
            .map((f) => (
              <Pill key={f} tone={FLAG_TONE[f] ?? 'neutral'}>
                {f}
              </Pill>
            ))}
        </div>
      ) : (
        '—'
      ),
  },
  {
    key: 'priority',
    label: 'Priority',
    value: (r) => (r.priority == null ? '' : (PRIORITY[toNumber(r.priority as number)]?.label ?? str(r.priority))),
    render: (r) => {
      const p = r.priority == null ? undefined : PRIORITY[toNumber(r.priority as number)];
      return p ? <Badge tone={p.tone}>{p.label}</Badge> : <span className="text-slate-300 dark:text-slate-600">—</span>;
    },
  },
  { key: 'assignee', label: 'Assignee' },
  {
    key: 'status',
    label: 'Status',
    render: (r) =>
      r.status === 'Needs Review' ? (
        <Badge tone="bad">Needs review</Badge>
      ) : (
        <Pill tone="good">{str(r.status, '—')}</Pill>
      ),
  },
  { key: 'device', label: 'Device', render: (r) => <IdChip>{String(r.device)}</IdChip> },
  { key: 'device_type', label: 'Type' },
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'substation', label: 'Substation' },
  { key: 'feeder_id', label: 'Feeder', render: (r) => <IdChip>{String(r.feeder_id)}</IdChip> },
  { key: 'mo_1', label: '1 mo', heat: true, digits: 0, hint: 'Incidents in the last month' },
  { key: 'mo_3', label: '3 mo', heat: true, digits: 0 },
  { key: 'mo_6', label: '6 mo', heat: true, digits: 0 },
  { key: 'mo_12', label: '12 mo', heat: true, digits: 0 },
  {
    key: 'trend',
    label: 'Trend',
    align: 'center',
    sortable: false,
    csv: false,
    value: () => null,
    render: (r) => <DeviceTrend row={r} />,
  },
];

const DEVICE_SELECTS = [
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'substation', label: 'Substation' },
  { key: 'device_type', label: 'Device type' },
  { key: 'flags', label: 'Flag' },
  { key: 'status', label: 'Status' },
  { key: 'assignee', label: 'Assignee' },
];
const DEVICE_TEXTS = [
  { key: 'feeder_id', label: 'Feeder', placeholder: 'Feeder ID' },
  { key: 'device', label: 'Device', placeholder: 'Device name' },
];

export function DevicesPage({ opco }: { opco: OpCoCode }) {
  const [dataset, setDataset] = useParamState<DataSet>('dataset', 'Reported');
  const { data, loading, error } = useAnalyticsQuery('devices', datasetParam(opco, dataset));
  const rows = useMemo(() => (data ?? []) as Row[], [data]);
  const filters = useMapTableFilters(rows, { selects: DEVICE_SELECTS, texts: DEVICE_TEXTS });
  const view = filters.filtered;
  const review = view.filter((r) => r.status === 'Needs Review').length;
  const high = view.filter((r) => toNumber(r.priority as number) === 1).length;
  const rising = view.filter(
    (r) => toNumber(r.mo_12 as number) > 0 && toNumber(r.mo_3 as number) / 3 > (toNumber(r.mo_12 as number) / 12) * 1.15
  ).length;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Devices"
        description="Protective devices ranked by incidents in the last 12 months. Filters apply to the cards, map, and table."
        actions={
          <Segmented<DataSet>
            size="md"
            value={dataset}
            onChange={setDataset}
            options={[
              { value: 'Reported', label: 'Reported' },
              { value: 'CX', label: 'CX' },
            ]}
          />
        }
      />
      <FilterBar model={filters} />
      {error && <EmptyState>{error}</EmptyState>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Devices tracked" value={loading ? '…' : view.length.toLocaleString()} />
        <Stat label="Needs review" value={loading ? '…' : review.toLocaleString()} tone="bad" />
        <Stat label="High priority" value={loading ? '…' : high.toLocaleString()} tone="bad" />
        <Stat
          label="Trending up"
          value={loading ? '…' : rising.toLocaleString()}
          hint="Last 3 months above the 12-month rate"
        />
      </div>
      <MapPanel
        points={view.map((r) => ({
          lat: r.lat as number,
          lon: r.lon as number,
          label: `${String(r.device)} · ${String(r.status)}`,
          tone: r.status === 'Needs Review' ? 'hot' : 'cool',
        }))}
        cluster
        height={480}
        title="Device locations"
        legend={[
          { tone: 'hot', label: 'Needs review' },
          { tone: 'cool', label: 'Healthy' },
        ]}
      />
      <DataGrid
        rows={view}
        columns={DEVICE_COLUMNS}
        rowKey={(r, i) => `${String(r.device)}-${i}`}
        loading={loading}
        urlState={false}
        defaultSort={{ key: 'mo_12', dir: 'desc' }}
        exportName="oc1-devices"
        searchPlaceholder="Search this page…"
        noun="devices"
        emptyText={error ? error : 'No devices match these filters'}
        footer={<HeatLegend label="Shading: fewer → more incidents" />}
      />
    </div>
  );
}

const DEFECT_LABEL: Record<string, string> = {
  vegetation_encroachment: 'Vegetation',
  damaged_insulator: 'Insulator',
  leaning_pole: 'Leaning pole',
  conductor_damage: 'Conductor',
  clear: 'Clear',
};

/** Matches map risk colors: High=red, Medium=amber, Low=blue. */
const FINDING_TONE: Record<string, Tone> = {
  Critical: 'bad',
  Elevated: 'warn',
  Watch: 'info',
  Clear: 'info',
};

function riskTone(band: string): 'hot' | 'neutral' | 'cool' {
  if (band === 'High') return 'hot';
  if (band === 'Medium') return 'neutral';
  return 'cool';
}

const INSPECTION_SELECTS = [
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'substation', label: 'Substation' },
  { key: 'device_type', label: 'Device type' },
  { key: 'defect_type', label: 'Defect' },
  { key: 'finding_status', label: 'Finding' },
  { key: 'source', label: 'Source' },
];
const INSPECTION_TEXTS = [
  { key: 'feeder_id', label: 'Feeder', placeholder: 'Feeder ID' },
  { key: 'device', label: 'Device', placeholder: 'Device name' },
];

const INSPECTION_COLUMNS: Array<Column<Row>> = [
  {
    key: 'finding_status',
    label: 'Finding',
    render: (r) => <Badge tone={FINDING_TONE[str(r.finding_status)] ?? 'neutral'}>{str(r.finding_status, '—')}</Badge>,
  },
  {
    key: 'defect_type',
    label: 'Defect',
    value: (r) => DEFECT_LABEL[str(r.defect_type)] ?? str(r.defect_type),
  },
  { key: 'severity', label: 'Severity', heat: true, digits: 0 },
  {
    key: 'confidence',
    label: 'Confidence',
    render: (r) => formatPct(toNumber(r.confidence as number) * 100),
  },
  { key: 'device', label: 'Device', render: (r) => <IdChip>{String(r.device)}</IdChip> },
  { key: 'device_type', label: 'Type' },
  { key: 'feeder_id', label: 'Feeder', render: (r) => <IdChip>{String(r.feeder_id)}</IdChip> },
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'source', label: 'Source' },
  {
    key: 'device_mo_12',
    label: 'Device 12 mo',
    heat: true,
    digits: 0,
    hint: 'Trailing incidents on this device',
  },
  { key: 'captured_at', label: 'Captured' },
  {
    key: 'summary',
    label: 'Summary',
    sortable: false,
    value: (r) => str(r.summary),
  },
];

export function InspectionsPage({ opco }: { opco: OpCoCode }) {
  const { data, loading, error } = useAnalyticsQuery('inspection_findings', opcoParam(opco));
  const riskQuery = useAnalyticsQuery('inspection_device_risk', opcoParam(opco));
  const rows = useMemo(() => (data ?? []) as Row[], [data]);
  const riskRows = useMemo(() => (riskQuery.data ?? []) as Row[], [riskQuery.data]);
  const filters = useMapTableFilters(rows, { selects: INSPECTION_SELECTS, texts: INSPECTION_TEXTS });
  const view = filters.filtered;
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDevice(null);
    setSelectedId(null);
  }, [opco]);

  const open = view.filter((r) => str(r.defect_type) !== 'clear').length;
  const critical = view.filter((r) => str(r.finding_status) === 'Critical').length;
  const highRisk = riskRows.filter((r) => str(r.risk_band) === 'High').length;

  const deviceHasImages = useMemo(() => {
    if (!selectedDevice) return false;
    return rows.some((r) => str(r.device) === selectedDevice);
  }, [rows, selectedDevice]);

  const gallery = useMemo(() => {
    const scoped = selectedDevice ? view.filter((r) => str(r.device) === selectedDevice) : view;
    return [...scoped]
      .sort((a, b) => toNumber(b.severity as number) - toNumber(a.severity as number))
      .slice(0, 12);
  }, [view, selectedDevice]);

  const galleryEmptyMessage = selectedDevice
    ? deviceHasImages
      ? `No frames match the current filters for device ${selectedDevice}`
      : `No images captured yet for device ${selectedDevice}`
    : 'No inspection frames match these filters';

  const selectedFinding =
    (selectedId ? gallery.find((r) => str(r.inspection_id) === selectedId) : undefined) ??
    gallery[0] ??
    null;

  const mapFocus = useMemo(() => {
    if (!selectedDevice) return null;
    const fromFinding =
      selectedFinding && str(selectedFinding.device) === selectedDevice
        ? selectedFinding
        : view.find((r) => str(r.device) === selectedDevice);
    const fromRisk = riskRows.find((r) => str(r.device) === selectedDevice);
    const lat = toNumber((fromFinding?.lat ?? fromRisk?.lat) as number);
    const lon = toNumber((fromFinding?.lon ?? fromRisk?.lon) as number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
    return {
      lat,
      lon,
      zoom: 12,
      key: selectedId ?? selectedDevice,
    };
  }, [selectedDevice, selectedId, selectedFinding, view, riskRows]);

  const mapRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Inspections"
        description="Field inspection photos with pre-baked computer-vision findings. Model is stubbed — swap in multimodal ai_query later without changing this page."
      />
      <FilterBar model={filters} />
      {error && <EmptyState>{error}</EmptyState>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Inspections" value={loading ? '…' : view.length.toLocaleString()} />
        <Stat label="Open findings" value={loading ? '…' : open.toLocaleString()} tone="bad" />
        <Stat label="Critical" value={loading ? '…' : critical.toLocaleString()} tone="bad" />
        <Stat
          label="High-risk devices"
          value={riskQuery.loading ? '…' : highRisk.toLocaleString()}
          hint="Findings + trailing incidents"
        />
      </div>
      <div ref={mapRef}>
        <MapPanel
          points={riskRows.map((r) => {
            const device = str(r.device);
            const active = selectedDevice === device;
            return {
              id: device,
              lat: r.lat as number,
              lon: r.lon as number,
              label: `${device} · ${String(r.risk_band)} · ${String(DEFECT_LABEL[str(r.latest_defect)] ?? r.latest_defect)}`,
              tone: riskTone(str(r.risk_band)),
              selected: active,
              radius: active ? 12 : undefined,
            };
          })}
          cluster={!selectedDevice}
          focus={mapFocus}
          onPointClick={(point) => {
            const device = point.id;
            if (!device) return;
            setSelectedDevice(device);
            setSelectedId(null);
          }}
          height={420}
          title="Device inspection risk"
          legend={[
            { tone: 'hot', label: 'High risk' },
            { tone: 'neutral', label: 'Medium risk' },
            { tone: 'cool', label: 'Low risk' },
          ]}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">Inspection gallery</div>
              <div className="text-xs text-slate-500">
                {selectedDevice
                  ? `Device ${selectedDevice} · badges use the same High / Medium / Low colors as the map`
                  : 'Highest-severity frames · click a map pin to filter by device'}
              </div>
            </div>
            {selectedDevice && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDevice(null);
                  setSelectedId(null);
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Clear device
              </button>
            )}
          </div>
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading frames…</div>
          ) : gallery.length === 0 ? (
            <EmptyState>{galleryEmptyMessage}</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gallery.map((r) => {
                const active = selectedFinding && str(selectedFinding.inspection_id) === str(r.inspection_id);
                return (
                  <button
                    key={str(r.inspection_id)}
                    type="button"
                    onClick={() => {
                      setSelectedDevice(str(r.device));
                      setSelectedId(str(r.inspection_id));
                      mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    className={`overflow-hidden rounded-xl border text-left transition ${
                      active
                        ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                        : 'border-slate-200 hover:border-slate-300 dark:border-white/10'
                    }`}
                  >
                    <img
                      src={str(r.thumbnail_data_url)}
                      alt={`${DEFECT_LABEL[str(r.defect_type)] ?? str(r.defect_type)} on ${str(r.device)}`}
                      className="aspect-[3/2] w-full object-cover bg-slate-900"
                    />
                    <div className="space-y-1 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={FINDING_TONE[str(r.finding_status)] ?? 'neutral'}>
                          {DEFECT_LABEL[str(r.defect_type)] ?? str(r.defect_type)}
                        </Badge>
                        <span className="tabular text-[11px] text-slate-500">sev {str(r.severity)}</span>
                      </div>
                      <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                        {str(r.device)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel>
          <div className="space-y-4 px-1">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">Selected finding</div>
              <div className="text-xs text-slate-500">
                {selectedFinding
                  ? str(selectedFinding.image_credit, 'Field Inspection Library')
                  : selectedDevice
                    ? `Device ${selectedDevice}`
                    : 'Select a frame'}
              </div>
            </div>
            {!selectedFinding ? (
              <EmptyState>
                {selectedDevice && !deviceHasImages
                  ? `No images captured yet for device ${selectedDevice}`
                  : selectedDevice
                    ? galleryEmptyMessage
                    : 'Select a frame to review the finding'}
              </EmptyState>
            ) : (
              <>
                <img
                  src={str(selectedFinding.thumbnail_data_url)}
                  alt={str(selectedFinding.inspection_id)}
                  className="aspect-[3/2] w-full rounded-xl object-cover bg-slate-900"
                />
                <div className="flex flex-wrap gap-2">
                  <Badge tone={FINDING_TONE[str(selectedFinding.finding_status)] ?? 'neutral'}>
                    {str(selectedFinding.finding_status)}
                  </Badge>
                  <Pill tone="neutral">{DEFECT_LABEL[str(selectedFinding.defect_type)] ?? str(selectedFinding.defect_type)}</Pill>
                  <Pill tone="neutral">sev {str(selectedFinding.severity)}</Pill>
                  <Pill tone="neutral">{formatPct(toNumber(selectedFinding.confidence as number) * 100)}</Pill>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Device</div>
                    <div className="font-medium text-slate-900 dark:text-slate-50">{str(selectedFinding.device)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Feeder</div>
                    <div className="font-medium text-slate-900 dark:text-slate-50">{str(selectedFinding.feeder_id)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Source</div>
                    <div className="font-medium text-slate-900 dark:text-slate-50">{str(selectedFinding.source)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Captured</div>
                    <div className="font-medium text-slate-900 dark:text-slate-50">{str(selectedFinding.captured_at)}</div>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {str(selectedFinding.summary)}
                </p>
                <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-white/10">
                  {str(selectedFinding.commons_title) || str(selectedFinding.image_rel_path)} ·{' '}
                  {str(selectedFinding.image_license, 'CC')}
                </div>
              </>
            )}
          </div>
        </Panel>
      </div>
      <div className="overflow-x-auto">
        <div className="mb-3 flex flex-wrap gap-2">
          {riskRows.slice(0, 8).map((r) => (
            <button
              key={str(r.device)}
              type="button"
              onClick={() => {
                setSelectedDevice(str(r.device));
                setSelectedId(null);
                mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                selectedDevice === str(r.device)
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300'
              }`}
            >
              <span className="font-medium">{str(r.device)}</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              <span className={str(r.risk_band) === 'High' ? 'text-rose-600 dark:text-rose-400' : ''}>
                {str(r.risk_band)} · {formatNum(toNumber(r.risk_score as number), 0)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <DataGrid
        rows={view}
        columns={INSPECTION_COLUMNS}
        rowKey={(r, i) => `${String(r.inspection_id)}-${i}`}
        loading={loading}
        urlState={false}
        defaultSort={{ key: 'severity', dir: 'desc' }}
        exportName="inspections"
        searchPlaceholder="Search inspections…"
        noun="inspections"
        emptyText={error ? error : 'No inspections match these filters'}
      />
    </div>
  );
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h.toLocaleString()}h ${m}m` : `${m}m`;
}

type MinIncidents = '0' | '10' | '20' | '30';

const CUSTOMER_COLUMNS: Array<Column<Row>> = [
  {
    key: 'account_no',
    label: 'Account #',
    value: (r) => str(r.account_no),
    render: (r) => <IdChip>{String(r.account_no)}</IdChip>,
  },
  {
    key: 'meter_nos',
    label: 'Meter #',
    value: (r) => str(r.meter_nos) || str(r.meter_no),
    render: (r) => {
      const meters = str(r.meter_nos || r.meter_no)
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      if (meters.length === 0) return '—';
      return (
        <span className="flex flex-wrap gap-1">
          {meters.map((m) => (
            <IdChip key={m}>{m}</IdChip>
          ))}
        </span>
      );
    },
  },
  { key: 'address', label: 'Address' },
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'substation', label: 'Substation' },
  {
    key: 'feeder_id',
    label: 'Feeder',
    value: (r) => str(r.feeder_id),
    render: (r) => <IdChip>{String(r.feeder_id)}</IdChip>,
  },
  { key: 'total_incidents', label: 'Total incidents', heat: true, digits: 0 },
  {
    key: 'total_duration',
    label: 'Total duration',
    heat: true,
    render: (r) => formatDuration(toNumber(r.total_duration as number)),
    hint: 'Total minutes out across all incidents',
  },
  { key: 'last_incident', label: 'Last incident' },
];

const CUSTOMER_SELECTS = [
  { key: 'pd_area', label: 'PD area' },
  { key: 'workgroup', label: 'Workgroup' },
  { key: 'substation', label: 'Substation' },
];
const CUSTOMER_TEXTS = [
  { key: 'feeder_id', label: 'Feeder', placeholder: 'Feeder ID' },
  { key: 'account_no', label: 'Account', placeholder: 'Account #' },
  { key: 'meter_nos', label: 'Meter', placeholder: 'Meter #' },
];

export function CustomersPage({ opco }: { opco: OpCoCode }) {
  const { data, loading, error } = useAnalyticsQuery('customer_incidents', opcoParam(opco));
  const [minIncidents, setMinIncidents] = useParamState<MinIncidents>('min', '0');
  const all = useMemo(() => (data ?? []) as Row[], [data]);
  const scoped = useMemo(
    () => all.filter((r) => toNumber(r.total_incidents as number) >= Number(minIncidents)),
    [all, minIncidents]
  );
  const filters = useMapTableFilters(scoped, {
    dateField: 'last_incident',
    selects: CUSTOMER_SELECTS,
    texts: CUSTOMER_TEXTS,
  });
  const view = filters.filtered;
  const chronic = view.filter((r) => toNumber(r.total_incidents as number) > 20).length;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Customer incidents"
        description="Customers with the most repeat outages. Filters apply to the cards, map, and table."
      />
      <FilterBar model={filters} dateLabel="Last outage" />
      {error && <EmptyState>{error}</EmptyState>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Customers listed" value={loading ? '…' : view.length.toLocaleString()} />
        <Stat label="More than 20 incidents" value={loading ? '…' : chronic.toLocaleString()} tone="bad" />
        <Stat label="Data from" value={REPORTING_AS_OF} />
      </div>
      <MapPanel
        points={view.map((r) => ({
          lat: r.lat as number,
          lon: r.lon as number,
          label: `${String(r.address)} · meter ${String(r.meter_no)} · ${toNumber(r.total_incidents as number)} incidents`,
          tone: toNumber(r.total_incidents as number) > 20 ? 'hot' : 'neutral',
        }))}
        title="Repeat-outage density"
        cluster
        legend={[
          { tone: 'hot', label: 'More than 20 incidents' },
          { tone: 'neutral', label: '20 or fewer incidents' },
        ]}
      />
      <DataGrid
        rows={view}
        columns={CUSTOMER_COLUMNS}
        rowKey={(r, i) => `${String(r.account_no)}-${i}`}
        loading={loading}
        urlState={false}
        defaultSort={{ key: 'total_incidents', dir: 'desc' }}
        exportName="oc1-customer-incidents"
        searchPlaceholder="Search this page…"
        noun="customers"
        emptyText={error ? error : 'No customers match these filters'}
        toolbar={
          <Segmented<MinIncidents>
            value={minIncidents}
            onChange={setMinIncidents}
            options={[
              { value: '0', label: 'All' },
              { value: '10', label: '10+' },
              { value: '20', label: '20+' },
              { value: '30', label: '30+' },
            ]}
          />
        }
        footer={
          <>
            <HeatLegend label="Shading: fewer → more" />
            <span>Data from {REPORTING_AS_OF}</span>
          </>
        }
      />
    </div>
  );
}

type WpfLevel = 'feeders' | 'workgroups' | 'pd_areas';

interface WpfRow {
  key: string;
  rank: number;
  pd_area: string;
  workgroup: string;
  substation: string;
  feeder_id: string;
  feeders: number;
  customers_served: number;
  ci: number;
  saifi: number;
  cmi: number;
  saidi: number;
  si: number;
  cpi: number;
  event_count: number;
}

function aggregateWpf(rows: Row[], level: WpfLevel): WpfRow[] {
  if (level === 'feeders') {
    return rows.map((r) => ({
      key: String(r.feeder_id),
      rank: toNumber(r.wpf_rank as number),
      pd_area: String(r.pd_area),
      workgroup: String(r.workgroup),
      substation: String(r.substation),
      feeder_id: String(r.feeder_id),
      feeders: 1,
      customers_served: toNumber(r.customers_served as number),
      ci: toNumber(r.ci as number),
      saifi: toNumber(r.saifi as number),
      cmi: toNumber(r.cmi as number),
      saidi: toNumber(r.saidi as number),
      si: toNumber(r.si as number),
      cpi: toNumber(r.cpi as number),
      event_count: toNumber(r.event_count as number),
    }));
  }
  const groups = new Map<string, WpfRow>();
  for (const r of rows) {
    const key = level === 'workgroups' ? `${String(r.pd_area)}|${String(r.workgroup)}` : String(r.pd_area);
    const g =
      groups.get(key) ??
      ({
        key,
        rank: 0,
        pd_area: String(r.pd_area),
        workgroup: level === 'workgroups' ? String(r.workgroup) : '',
        substation: '',
        feeder_id: '',
        feeders: 0,
        customers_served: 0,
        ci: 0,
        saifi: 0,
        cmi: 0,
        saidi: 0,
        si: 0,
        cpi: 0,
        event_count: 0,
      } satisfies WpfRow);
    g.feeders += 1;
    g.customers_served += toNumber(r.customers_served as number);
    g.ci += toNumber(r.ci as number);
    g.cmi += toNumber(r.cmi as number);
    g.event_count += toNumber(r.event_count as number);
    groups.set(key, g);
  }
  const out = [...groups.values()].map((g) => {
    const saifi = g.customers_served ? g.ci / g.customers_served : 0;
    const saidi = g.customers_served ? g.cmi / g.customers_served : 0;
    return { ...g, saifi, saidi, si: saifi * saidi, cpi: g.event_count ? g.ci / g.event_count : 0 };
  });
  out.sort((a, b) => b.si - a.si);
  return out.map((g, i) => ({ ...g, rank: i + 1 }));
}

/** AI-drafted briefs for the top worst performing feeders. Text is generated from computed facts; planners must verify. */
function FeederBriefs({ opco }: { opco: OpCoCode }) {
  const { data, loading } = useAnalyticsQuery('feeder_briefs', opcoParam(opco));
  const briefs = (data ?? []) as Row[];

  return (
    <Panel
      title="AI feeder briefs"
      subtitle="Drafted by Claude from computed feeder facts for the top 10 worst performing feeders. Planner review required."
      padded={false}
    >
      {briefs.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
          {loading ? 'Loading…' : 'No briefs yet. They appear after the next reliability-gold refresh.'}
        </p>
      ) : (
        <ul className="grid gap-px bg-slate-100 dark:bg-white/10 md:grid-cols-2">
          {briefs.map((b) => (
            <li key={String(b.feeder_id)} className="bg-white p-5 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                    Feeder {String(b.feeder_id)} · {String(b.substation)}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {String(b.pd_area)} · {String(b.workgroup)}
                  </div>
                </div>
                <Pill tone="bad">WPF rank {String(b.wpf_rank)}</Pill>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">{String(b.brief)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Pill tone="info">SI {formatNum(toNumber(b.si as number), 1)}</Pill>
                <Pill>Avg restore {formatInt(toNumber(b.avg_restore_min as number))} min</Pill>
                <Pill>
                  {formatInt(toNumber(b.events_last_12m as number))} events last 12m vs{' '}
                  {formatInt(toNumber(b.events_prior_12m as number))} prior
                </Pill>
                <Pill>{formatNum(toNumber(b.cx_share_pct as number), 0)}% CX events</Pill>
              </div>
              <div className="mt-3 text-[11px] text-slate-400">
                Top causes: {String(b.top_causes)} · AI-generated {String(b.generated_at).slice(0, 10)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function WpfPage({ opco }: { opco: OpCoCode }) {
  const [dataset, setDataset] = useParamState<DataSet>('dataset', 'Reported');
  const { data, loading } = useAnalyticsQuery('worst_feeders', datasetParam(opco, dataset));
  const [level, setLevel] = useParamState<WpfLevel>('level', 'feeders');
  const rows = useMemo(() => aggregateWpf((data ?? []) as Row[], level), [data, level]);

  const columns: Array<Column<WpfRow>> = [
    { key: 'rank', label: 'WPF rank', numeric: true, align: 'center', hint: 'Rank 1 = highest severity index' },
    { key: 'pd_area', label: 'PD area', filter: true },
    ...(level !== 'pd_areas' ? [{ key: 'workgroup', label: 'Workgroup', filter: true } as Column<WpfRow>] : []),
    ...(level === 'feeders'
      ? ([
          { key: 'substation', label: 'Substation' },
          { key: 'feeder_id', label: 'Feeder', render: (r) => <IdChip>{r.feeder_id}</IdChip> },
        ] as Array<Column<WpfRow>>)
      : ([{ key: 'feeders', label: 'Feeders', numeric: true }] as Array<Column<WpfRow>>)),
    { key: 'customers_served', label: 'Customers served', numeric: true },
    { key: 'ci', label: 'CI', heat: true, digits: 0 },
    { key: 'saifi', label: 'SAIFI', heat: true, digits: 3 },
    { key: 'cmi', label: 'CMI', heat: true, digits: 0 },
    { key: 'saidi', label: 'SAIDI', heat: true, digits: 1 },
    { key: 'si', label: 'SI', heat: true, digits: 1, hint: 'Severity index = SAIDI × SAIFI' },
    { key: 'cpi', label: 'CPI', heat: true, digits: 1, hint: 'Customers per incident' },
    { key: 'event_count', label: 'Events', numeric: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Worst performing feeders"
        description="Feeders ranked by severity index (SAIDI × SAIFI) from incident facts since 2024. Roll up to workgroup or PD area to see where the bad feeders cluster."
      />
      {level === 'feeders' && dataset === 'Reported' && <FeederBriefs opco={opco} />}
      <DataGrid
        key={level}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.key}
        loading={loading}
        defaultSort={{ key: 'rank', dir: 'asc' }}
        exportName={`oc1-wpf-${level}`}
        searchPlaceholder="Search…"
        noun={level === 'feeders' ? 'feeders' : level === 'workgroups' ? 'workgroups' : 'PD areas'}
        toolbar={
          <>
            <Segmented<DataSet>
              value={dataset}
              onChange={setDataset}
              options={[
                { value: 'Reported', label: 'Reported' },
                { value: 'CX', label: 'CX' },
              ]}
            />
            <Segmented<WpfLevel>
              value={level}
              onChange={setLevel}
              options={[
                { value: 'feeders', label: 'Feeders' },
                { value: 'workgroups', label: 'Workgroups' },
                { value: 'pd_areas', label: 'PD areas' },
              ]}
            />
          </>
        }
        footer={
          <>
            <HeatLegend label="Shading: better → worse" />
            {level !== 'feeders' && <span>Rollups are customer-weighted across the worst feeders only.</span>}
          </>
        }
      />
    </div>
  );
}

type GroupRow = {
  id: number;
  name: string;
  description: string;
  pd_area: string;
  workgroup: string;
  members: string;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function splitMembers(members: string) {
  return members
    .split(/[,;\n]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

function GroupDialog({
  initial,
  pdAreas,
  workgroups,
  onClose,
  onSaved,
}: {
  initial: GroupRow | null;
  pdAreas: string[];
  workgroups: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [pdArea, setPdArea] = useState(initial?.pd_area ?? '');
  const [workgroup, setWorkgroup] = useState(initial?.workgroup ?? '');
  const [members, setMembers] = useState<string[]>(splitMembers(initial?.members ?? ''));
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addDraft = () => {
    const next = splitMembers(draft).filter((m) => !members.includes(m));
    if (next.length) setMembers([...members, ...next]);
    setDraft('');
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const all = [...members, ...splitMembers(draft).filter((m) => !members.includes(m))];
    const body = JSON.stringify({ name, description, pd_area: pdArea, workgroup, members: all.join(', ') });
    await fetch(initial ? `/api/groups/${initial.id}` : '/api/groups', {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {initial ? 'Edit group' : 'New group'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mobile storm crews"
              autoFocus
            />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PD area">
              <Input value={pdArea} onChange={(e) => setPdArea(e.target.value)} list="group-pd-areas" />
              <datalist id="group-pd-areas">
                {pdAreas.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="Workgroup">
              <Input value={workgroup} onChange={(e) => setWorkgroup(e.target.value)} list="group-workgroups" />
              <datalist id="group-workgroups">
                {workgroups.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label={`Members (${members.length})`}>
            <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-lg border border-[var(--input)] px-2 py-1.5 focus-within:border-blue-400 dark:bg-slate-950">
              {members.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                >
                  {m}
                  <button
                    type="button"
                    onClick={() => setMembers(members.filter((x) => x !== m))}
                    aria-label={`Remove ${m}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addDraft();
                  }
                }}
                onBlur={addDraft}
                placeholder={members.length ? '' : 'Type an email or user ID, press Enter'}
                className="min-w-[160px] flex-1 bg-transparent text-sm outline-none dark:text-slate-100"
              />
            </div>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-white/10">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!name.trim() || saving}>
            {initial ? 'Save changes' : 'Create group'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MemberChips({ members }: { members: string }) {
  const list = splitMembers(members);
  if (list.length === 0) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const shown = list.slice(0, 3);
  return (
    <div className="flex items-center gap-1" title={list.join(', ')}>
      {shown.map((m) => (
        <span
          key={m}
          className="max-w-[160px] truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 dark:bg-white/10 dark:text-slate-200"
        >
          {m}
        </span>
      ))}
      {list.length > shown.length && (
        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-200">
          +{list.length - shown.length}
        </span>
      )}
    </div>
  );
}

export function GroupsPage({ opco }: { opco: OpCoCode }) {
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GroupRow | null | 'new'>(null);
  const { data: rankings } = useAnalyticsQuery('reliability_rankings', opcoParam(opco));
  const pdAreas = useMemo(() => [...new Set((rankings ?? []).map((r) => String(r.pd_area)))].sort(), [rankings]);
  const workgroups = useMemo(() => [...new Set((rankings ?? []).map((r) => String(r.workgroup)))].sort(), [rankings]);

  const load = () =>
    fetch('/api/groups')
      .then((r) => r.json() as Promise<GroupRow[]>)
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);

  const remove = async (g: GroupRow) => {
    if (!window.confirm(`Delete “${g.name}”?`)) return;
    await fetch(`/api/groups/${g.id}`, { method: 'DELETE' });
    await load();
  };

  const columns: Array<Column<GroupRow>> = [
    {
      key: 'name',
      label: 'Group',
      render: (g) => (
        <div className="min-w-[180px]">
          <div className="font-medium text-slate-900 dark:text-slate-50">{g.name}</div>
          {g.description && <div className="max-w-[280px] truncate text-[11px] text-slate-500">{g.description}</div>}
        </div>
      ),
    },
    { key: 'description', label: 'Description', hidden: true },
    {
      key: 'pd_area',
      label: 'PD area',
      filter: true,
      render: (g) => (g.pd_area ? <Pill tone="info">{g.pd_area}</Pill> : '—'),
    },
    { key: 'workgroup', label: 'Workgroup', filter: true },
    { key: 'member_count', label: 'Members', numeric: true, value: (g) => splitMembers(g.members).length },
    { key: 'members', label: 'Member list', render: (g) => <MemberChips members={g.members} /> },
    {
      key: 'actions',
      label: '',
      sortable: false,
      csv: false,
      value: () => null,
      render: (g) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => setEditing(g)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200"
            aria-label={`Edit ${g.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void remove(g)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            aria-label={`Delete ${g.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Groups"
        description="Crew and engineering lists your team works from. Saved instantly to app storage, not the warehouse."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New group
          </Button>
        }
      />
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(g) => String(g.id)}
        loading={loading}
        defaultSort={{ key: 'name', dir: 'asc' }}
        exportName="oc1-groups"
        searchPlaceholder="Search groups or members…"
        noun="groups"
        emptyText="No groups yet. Create one to share a crew or engineering list."
      />
      {editing && (
        <GroupDialog
          initial={editing === 'new' ? null : editing}
          pdAreas={pdAreas}
          workgroups={workgroups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

const HELP_TONE: Record<string, Tone> = { Open: 'warn', Closed: 'good', Resolved: 'good' };

export function HelpPage({ email }: { email: string }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [rows, setRows] = useState<Array<{ id: number; subject: string; status: string; created_at: string }>>([]);
  const load = () =>
    fetch('/api/help')
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    if (!subject.trim() || !body.trim()) return;
    await fetch('/api/help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: email, subject, body }),
    });
    setSubject('');
    setBody('');
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Help request"
        description="Report a data question or app issue to the Reliability support team."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr] items-start">
        <Panel title="New request">
          <div className="space-y-3">
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="What happened?">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-[var(--input)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:bg-slate-950 dark:text-slate-100"
              />
            </Field>
            <Button onClick={() => void submit()} disabled={!subject.trim() || !body.trim()}>
              Submit request
            </Button>
          </div>
        </Panel>
        <Panel title="Your recent requests" padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {rows.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No requests yet.</li>}
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.subject}</div>
                  <div className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <Pill tone={HELP_TONE[r.status] ?? 'neutral'}>{r.status}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function SettingsPage({ email }: { email: string }) {
  const [pdArea, setPdArea] = useState('');
  const [workgroup, setWorkgroup] = useState('');
  const [timeFormat, setTimeFormat] = useState('Standard');
  const [mapStyle, setMapStyle] = useState('Light');
  const [colorMode, setColorMode] = useState<ColorMode>(getStoredColorMode);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`/api/prefs/${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then(
        (
          p: {
            pd_area?: string | null;
            workgroup?: string | null;
            time_format?: string;
            map_style?: string;
            color_mode?: string;
          } | null
        ) => {
          if (!p) return;
          setPdArea(p.pd_area ?? '');
          setWorkgroup(p.workgroup ?? '');
          setTimeFormat(p.time_format ?? 'Standard');
          setMapStyle(p.map_style ?? 'Light');
          if (p.map_style) localStorage.setItem(MAP_STYLE_KEY, p.map_style);
          const mode: ColorMode = p.color_mode === 'Dark' ? 'Dark' : 'Light';
          setColorMode(mode);
          applyColorMode(mode);
        }
      )
      .catch(() => undefined);
  }, [email]);

  const saveColorMode = async (next: ColorMode) => {
    setColorMode(next);
    applyColorMode(next);
    await fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: email, color_mode: next }),
    }).catch(() => undefined);
  };

  const save = async () => {
    const res = await fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_email: email,
        pd_area: pdArea,
        workgroup,
        time_format: timeFormat,
        map_style: mapStyle,
        color_mode: colorMode,
      }),
    });
    if (res.ok) localStorage.setItem(MAP_STYLE_KEY, mapStyle);
    setMsg(res.ok ? 'Preferences saved' : 'Could not save preferences');
    setTimeout(() => setMsg(''), 2500);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Personal defaults, stored against your signed-in email."
      />
      <Panel title="Appearance" className="max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Color mode</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Applies immediately and is saved to your account.
            </div>
          </div>
          <Segmented<ColorMode>
            size="md"
            value={colorMode}
            onChange={(next) => void saveColorMode(next)}
            options={[
              { value: 'Light', label: 'Light' },
              { value: 'Dark', label: 'Dark' },
            ]}
          />
        </div>
      </Panel>
      <Panel title="Profile" subtitle={email} className="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Home PD area">
              <Input value={pdArea} onChange={(e) => setPdArea(e.target.value)} />
            </Field>
            <Field label="Home workgroup">
              <Input value={workgroup} onChange={(e) => setWorkgroup(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Time format">
              <Select value={timeFormat} onValueChange={setTimeFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard">Standard (2:30 PM)</SelectItem>
                  <SelectItem value="Military">24-hour (14:30)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Map style">
              <Select value={mapStyle} onValueChange={setMapStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Light">Light</SelectItem>
                  <SelectItem value="Dark">Dark</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
            <Button onClick={() => void save()}>Save preferences</Button>
            {msg && <span className="text-sm text-slate-500 dark:text-slate-400">{msg}</span>}
          </div>
        </div>
      </Panel>
    </div>
  );
}
