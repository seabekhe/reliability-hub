import { useAnalyticsQuery } from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { useMemo, useState } from 'react';
import { toNumber } from '../lib/formatters';
import type { OpCoCode } from '../lib/constants';
import { BandChart, type BandPoint } from './BandChart';
import { SOURCE_MODE } from '../lib/dataMode';
import { EmptyState, Panel, Segmented } from './ui';

type Grain = 'monthly' | 'yearly';
type Metric = 'saidi' | 'saifi';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function TrendChart({
  opco,
  metric,
  title,
}: {
  opco: OpCoCode;
  metric: Metric;
  title: string;
}) {
  const [grain, setGrain] = useState<Grain>('monthly');
  const parameters = useMemo(() => ({ opco: sql.string(opco) }), [opco]);

  const monthly = useAnalyticsQuery('kpi_trend', parameters);
  const yearly = useAnalyticsQuery('kpi_trend_yearly', parameters);
  const active = grain === 'monthly' ? monthly : yearly;
  const digits = metric === 'saidi' ? 1 : 3;

  const data = useMemo<BandPoint[]>(() => {
    const rows = (active.data ?? []) as Array<Record<string, unknown>>;
    const num = (r: Record<string, unknown>, k: string) => toNumber(r[`${k}_${metric}`] as number);

    if (grain === 'yearly') {
      return rows.map((r) => ({
        label: typeof r.period_label === 'string' ? r.period_label : '',
        actual: num(r, 'actual'),
        goal: num(r, 'goal'),
        band0: num(r, 'band0'),
        band200: num(r, 'band200'),
      }));
    }

    // The goal path runs to December so the remaining headroom is visible.
    const first = rows[0];
    if (!first) return [];
    const annualGoal = (num(first, 'goal') / toNumber(first.month as number)) * 12;
    const byMonth = new Map(rows.map((r) => [toNumber(r.month as number), num(r, 'actual')]));
    return MONTHS.map((label, i) => {
      const goal = (annualGoal / 12) * (i + 1);
      return {
        label,
        actual: byMonth.get(i + 1) ?? null,
        goal,
        band0: goal * 1.65,
        band200: goal * 0.5,
      };
    });
  }, [active.data, metric, grain]);

  return (
    <Panel
      title={title}
      subtitle={
        grain === 'monthly'
          ? SOURCE_MODE
            ? 'Cumulative year to date against the goal path. Funding bands are coming soon.'
            : 'Cumulative year to date against the goal path. Staying in the green earns funding.'
          : 'Full-year totals against each year’s goal. 2026 is partial, through July.'
      }
      actions={
        <Segmented<Grain>
          value={grain}
          onChange={setGrain}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
        />
      }
    >
      {data.length === 0 ? (
        <EmptyState>{active.loading ? 'Loading…' : 'No data for this selection'}</EmptyState>
      ) : (
        <BandChart data={data} digits={digits} hideFunding={SOURCE_MODE} />
      )}
    </Panel>
  );
}
