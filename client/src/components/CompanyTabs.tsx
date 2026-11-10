import { BarChart, LineChart, useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { formatNum, toNumber } from '../lib/formatters';
import { rankColor } from '../lib/colors';
import { MapPanel } from './MapPanel';
import { ComingSoonPanel } from './ComingSoon';
import { EmptyState, Panel, Segmented } from './ui';
import { SOURCE_MODE } from '../lib/dataMode';
import type { OpCoCode } from '../lib/constants';

const param = (opco: string) => ({ opco: sql.string(opco) });

type CrcaHours = '2' | '3' | '4' | '5' | '6';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_COLORS = ['#2563eb', '#94a3b8', '#f59e0b', '#10b981', '#a855f7'];

function Donut({ pct, label }: { pct: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative grid place-items-center">
      <svg width={140} height={140} viewBox="0 0 140 140" className="-rotate-90">
        <circle cx={70} cy={70} r={r} strokeWidth={16} className="fill-none stroke-slate-100 dark:stroke-white/10" />
        <circle
          cx={70}
          cy={70}
          r={r}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="fill-none stroke-blue-600 dark:stroke-blue-400"
        />
      </svg>
      <div className="absolute text-center">
        <div className="tabular text-2xl font-semibold text-slate-900 dark:text-slate-50">{formatNum(pct, 1)}%</div>
        <div className="text-[10px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function CrcaSection({ opco }: { opco: OpCoCode }) {
  const [hours, setHours] = useState<CrcaHours>('2');
  const { data, loading } = useAnalyticsQuery('crca_monthly', param(opco));

  const model = useMemo(() => {
    const rows = (data ?? []).map((r) => ({
      year: toNumber(r.year),
      month: toNumber(r.month),
      total: toNumber(r.ci_total),
      within: toNumber((r as Record<string, unknown>)[`ci_${hours}h`] as number),
    }));
    if (rows.length === 0) return null;
    const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);
    const latest = years[0];
    const latestMonth = Math.max(...rows.filter((r) => r.year === latest).map((r) => r.month));

    const ytd = (year: number, through: number) => {
      const scoped = rows.filter((r) => r.year === year && r.month <= through);
      const t = scoped.reduce((s, r) => s + r.total, 0);
      return t > 0 ? (scoped.reduce((s, r) => s + r.within, 0) / t) * 100 : null;
    };

    const comparison = MONTHS.map((label, i) => {
      const point: Record<string, string | number | null> = { month: label };
      for (const y of years.slice(0, 4)) {
        point[String(y)] = y === latest && i + 1 > latestMonth ? null : ytd(y, i + 1);
      }
      return point;
    });

    const ordered = [...rows].sort((a, b) => a.year - b.year || a.month - b.month);
    const rolling = ordered
      .map((_, i) => {
        if (i < 11) return null;
        const window = ordered.slice(i - 11, i + 1);
        const t = window.reduce((s, r) => s + r.total, 0);
        const r = ordered[i];
        return {
          month: `${MONTHS[r.month - 1]} ${String(r.year).slice(2)}`,
          pct: t > 0 ? Number(((window.reduce((s, w) => s + w.within, 0) / t) * 100).toFixed(1)) : 0,
        };
      })
      .filter((p): p is { month: string; pct: number } => p != null)
      .slice(-19);

    return {
      latest,
      latestMonth,
      current: ytd(latest, latestMonth) ?? 0,
      prior: ytd(latest - 1, latestMonth),
      years: years.slice(0, 4).map(String),
      comparison,
      rolling,
    };
  }, [data, hours]);

  return (
    <Panel
      title={`CRCA-${hours}: customers restored within ${hours} hours`}
      subtitle="Share of interrupted customers back on within the threshold. Higher is better."
      actions={
        <Segmented<CrcaHours>
          value={hours}
          onChange={setHours}
          options={(['2', '3', '4', '5', '6'] as CrcaHours[]).map((h) => ({ value: h, label: `${h}h` }))}
        />
      }
    >
      {!model ? (
        <EmptyState>{loading ? 'Loading…' : 'No restoration data'}</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[200px_1fr_1fr]">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
            <div className="text-xs font-medium text-slate-500">
              {model.latest} YTD · through {MONTHS[model.latestMonth - 1]}
            </div>
            <Donut pct={model.current} label={`within ${hours}h`} />
            {model.prior != null && (
              <div className="text-[11px] text-slate-500">
                {model.current >= model.prior ? (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    ▲ {formatNum(model.current - model.prior, 1)} pts
                  </span>
                ) : (
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    ▼ {formatNum(model.prior - model.current, 1)} pts
                  </span>
                )}{' '}
                vs {model.latest - 1} same period
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">YTD comparison by year (%)</div>
            <LineChart
              data={model.comparison}
              xKey="month"
              yKey={model.years}
              showLegend
              showSymbol
              height={240}
              colors={YEAR_COLORS}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Rolling 12 months (%)</div>
            <LineChart
              data={model.rolling}
              xKey="month"
              yKey={['pct']}
              showSymbol
              showLegend={false}
              height={240}
              colors={['#2563eb']}
              options={{
                yAxis: { type: 'value' },
                grid: { left: 8, right: 12, top: 8, bottom: 8, containLabel: true },
              }}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

export function ResiliencyTab({ opco }: { opco: OpCoCode }) {
  return (
    <div className="space-y-5">
    <CrcaSection opco={opco} />
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="Customers restored within 10 hours"
        subtitle="Segments add up to the share restored inside ten hours. Dips mark major storm years."
      >
        <BarChart
          queryKey="resiliency_yearly"
          parameters={param(opco)}
          xKey="year_label"
          yKey={['Within 1 hour', 'Within 2 hours', 'Within 10 hours']}
          stacked
          showLegend
          height={300}
          colors={['#1d4ed8', '#60a5fa', '#bfdbfe']}
        />
      </Panel>
      <Panel title="Customers interrupted per incident" subtitle="Lower means outages are better isolated">
        <LineChart
          queryKey="resiliency_yearly"
          parameters={param(opco)}
          xKey="year_label"
          yKey={['Customers interrupted per incident']}
          showSymbol
          height={300}
          colors={['#2563eb']}
        />
      </Panel>
    </div>
    </div>
  );
}

function Delta({ value }: { value: number }) {
  // Lower is better for both CX measures, so a decrease is the good direction.
  const good = value <= 0;
  const Icon = value <= 0 ? ArrowDown : ArrowUp;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        good
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/15 dark:text-rose-300'
      }`}
    >
      <Icon className="h-3 w-3" />
      {formatNum(Math.abs(value), 1)}%
    </span>
  );
}

function CxCard({
  title,
  ytd,
  ytdDelta,
  l12m,
  l12mDelta,
  decimals,
}: {
  title: string;
  ytd: number;
  ytdDelta: number;
  l12m: number;
  l12mDelta: number;
  decimals: number;
}) {
  return (
    <Panel title={title}>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
          <div className="text-xs text-slate-500">Year to date</div>
          <div className="tabular mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {formatNum(ytd, decimals)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Delta value={ytdDelta} /> vs prior 7 years
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
          <div className="text-xs text-slate-500">Last 12 months</div>
          <div className="tabular mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {formatNum(l12m, decimals)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <Delta value={l12mDelta} /> vs prior 12 months
          </div>
        </div>
      </div>
    </Panel>
  );
}

type RankMapVariant = 'reliability' | 'cx';

function asNum(value: unknown) {
  return toNumber(value as number | string | null | undefined);
}

function workgroupScore(row: Record<string, unknown>, variant: RankMapVariant) {
  if (variant === 'cx') return asNum(row.saidi);
  return asNum(row.overall_rank);
}

export function WorkgroupRankMap({
  opco,
  title,
  bestLabel,
  worstLabel,
  variant = 'reliability',
}: {
  opco: OpCoCode;
  title: string;
  bestLabel: string;
  worstLabel: string;
  variant?: RankMapVariant;
}) {
  const { data } = useAnalyticsQuery('workgroup_rank', param(opco));
  const rows = data ?? [];
  const scored = [...rows]
    .map((r) => ({ ...r, _score: workgroupScore(r as Record<string, unknown>, variant) }))
    .sort((a, b) => a._score - b._score);
  const ranked = scored.map((r, i) => ({ ...r, _rank: i + 1 }));
  const max = Math.max(ranked.length, 1);

  const points = ranked
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => {
      const rank = r._rank;
      const saidi = formatNum(r.saidi, 1);
      const label =
        variant === 'cx'
          ? `${String(r.workgroup)} · ${String(r.pd_area)} · ${saidi} min per customer`
          : `#${rank} ${String(r.workgroup)} · ${String(r.pd_area)} · SAIDI ${saidi}`;
      return {
        lat: r.lat as number,
        lon: r.lon as number,
        color: rankColor(rank, max),
        radius: variant === 'cx' ? 8 + Math.min(18, toNumber(r.saidi) / 28) : 14,
        badge: variant === 'cx' ? saidi : String(rank),
        label,
      };
    });

  const polygons = ranked.flatMap((r) => {
    const raw = r.geojson;
    if (typeof raw !== 'string' || !raw) return [];
    try {
      const gj = JSON.parse(raw) as { coordinates?: number[][][] };
      if (!gj.coordinates) return [];
      return [{ rings: gj.coordinates, color: rankColor(r._rank, max), label: String(r.workgroup) }];
    } catch {
      return [];
    }
  });

  return (
    <div className="space-y-2">
      {SOURCE_MODE && (
        <ComingSoonPanel
          compact
          title="Workgroup boundary polygons"
          description="Source data not available yet."
        />
      )}
      <MapPanel points={points} polygons={SOURCE_MODE ? [] : polygons} title={title} height={400} />
      <div className="grid gap-1.5 px-1 sm:grid-cols-2">
        {ranked.map((r) => (
              <div key={`${String(r.workgroup)}-${r._rank}`} className="flex items-center gap-2 text-xs">
                <span
                  className="tabular grid h-5 min-w-5 shrink-0 place-items-center rounded px-1 text-[10px] font-semibold text-white"
                  style={{ background: rankColor(r._rank, max) }}
                >
                  {variant === 'cx' ? formatNum(r.saidi, 0) : r._rank}
                </span>
                <span className="truncate text-slate-700 dark:text-slate-200">{String(r.workgroup)}</span>
                <span className="truncate text-slate-400">· {String(r.pd_area)}</span>
              </div>
            ))}
      </div>
      <div className="flex items-center gap-3 px-1 text-[11px] text-slate-500">
        <span>{bestLabel}</span>
        <div className="flex h-1.5 w-32 overflow-hidden rounded-full">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="flex-1" style={{ background: rankColor(i, 5) }} />
          ))}
        </div>
        <span>{worstLabel}</span>
      </div>
    </div>
  );
}

export function CustomerExperienceTab({ opco }: { opco: OpCoCode }) {
  const { data, loading } = useAnalyticsQuery('cx_metrics', param(opco));
  const row = data?.[0];

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-start">
      <div className="space-y-5">
        {row ? (
          <>
            <CxCard
              title="Outage minutes per customer"
              ytd={toNumber(row.avg_minutes_ytd)}
              ytdDelta={toNumber(row.avg_minutes_delta_7yr)}
              l12m={toNumber(row.avg_minutes_l12m)}
              l12mDelta={toNumber(row.avg_minutes_delta_12m)}
              decimals={1}
            />
            <CxCard
              title="Outages per customer"
              ytd={toNumber(row.avg_count_ytd)}
              ytdDelta={toNumber(row.avg_count_delta_7yr)}
              l12m={toNumber(row.avg_count_l12m)}
              l12mDelta={toNumber(row.avg_count_delta_12m)}
              decimals={3}
            />
          </>
        ) : (
          <EmptyState>{loading ? 'Loading…' : 'No customer experience data'}</EmptyState>
        )}
      </div>
      <WorkgroupRankMap
        opco={opco}
        variant="cx"
        title="Outage minutes by workgroup"
        bestLabel="Fewer minutes"
        worstLabel="More minutes"
      />
    </div>
  );
}

