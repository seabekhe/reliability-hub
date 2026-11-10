import { useState } from 'react';
import { Clock } from 'lucide-react';
import { PageHeader, Panel, Pill, Tabs } from './ui';

export function ComingSoonTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-400">
      <Clock className="h-3 w-3" />
      Coming soon
      {label ? <span className="normal-case tracking-normal text-slate-400">· {label}</span> : null}
    </span>
  );
}

export function ComingSoonPanel({
  title,
  compact = false,
  description = 'Not in this release.',
}: {
  title: string;
  compact?: boolean;
  description?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 dark:border-white/15 dark:bg-white/[0.03] ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
        <Clock className="h-3 w-3" />
        Coming soon
      </div>
      <div className={`${compact ? 'mt-1.5 text-sm' : 'mt-2 text-base'} font-semibold text-slate-700 dark:text-slate-200`}>
        {title}
      </div>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </div>
  );
}

function GhostScorecard({ label, description }: { label: string; description: string }) {
  return (
    <Panel>
      <div className="pt-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{label}</div>
            <div className="text-xs text-slate-500">{description}</div>
          </div>
          <Pill tone="warn">Coming soon</Pill>
        </div>
        <div className="flex items-end gap-8">
          <div>
            <div className="text-xs text-slate-700 dark:text-slate-200">Actual YTD</div>
            <div className="tabular text-4xl font-semibold tracking-tight text-slate-300 dark:text-slate-600">—</div>
          </div>
          <div className="pb-1">
            <div className="text-xs text-slate-500">Annual goal</div>
            <div className="tabular text-xl font-medium text-slate-300 dark:text-slate-600">—</div>
          </div>
          <div className="pb-1">
            <div className="text-xs text-slate-500">Projected year-end</div>
            <div className="tabular text-xl font-medium text-slate-300 dark:text-slate-600">—</div>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-white/10" />
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Of annual goal used</span>
            <span>Year elapsed</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
          <span className="text-xs text-slate-500">Projected year-end funding</span>
          <span className="text-xs text-slate-300">—</span>
        </div>
      </div>
    </Panel>
  );
}

function GhostChart({ title }: { title: string }) {
  return (
    <Panel title={title} subtitle="Available when this OpCo is released">
      <div className="flex h-[220px] items-end gap-2 px-1">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-slate-100 dark:bg-white/10"
            style={{ height: `${28 + ((i * 17) % 55)}%` }}
          />
        ))}
      </div>
    </Panel>
  );
}

function GhostList({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Panel title={title} subtitle={subtitle} padded={false}>
      <ul className="divide-y divide-slate-100 dark:divide-white/10">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-5 py-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-400 dark:bg-white/10">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-2/5 rounded bg-slate-100 dark:bg-white/10" />
              <div className="h-2.5 w-1/4 rounded bg-slate-100 dark:bg-white/10" />
            </div>
            <div className="h-3.5 w-10 rounded bg-slate-100 dark:bg-white/10" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type ExecTab = 'overview' | 'reliability' | 'resiliency' | 'cx';

function PerformanceSkeleton({ company }: { company: string }) {
  const [tab, setTab] = useState<ExecTab>('overview');
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${company} · 2026 year to date`}
        title="Performance"
        description={`${company} reliability against this year's goals. Metrics land when this OpCo is released.`}
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
      {tab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <GhostScorecard label="SAIDI" description="Average outage minutes per customer" />
            <GhostScorecard label="SAIFI" description="Average interruptions per customer" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <GhostChart title="SAIDI against goal" />
            <GhostChart title="SAIFI against goal" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <GhostList title="Worst performing feeders" subtitle="Highest severity index (SAIDI × SAIFI)" />
            <GhostList title="PD areas moving the wrong way" subtitle="Largest SAIDI increase vs prior year" />
          </div>
        </div>
      ) : (
        <ComingSoonPanel
          title={`${company} ${tab === 'cx' ? 'customer experience' : tab}`}
          description="This tab uses the same layout as the other operating companies when it is live."
        />
      )}
    </div>
  );
}

function PageSkeleton({
  company,
  title,
  description,
}: {
  company: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={company} title={title} description={description} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {['—', '—', '—', '—'].map((value, i) => (
          <Panel key={i}>
            <div className="pt-3 pb-1">
              <div className="h-3 w-20 rounded bg-slate-100 dark:bg-white/10" />
              <div className="mt-2 tabular text-3xl font-semibold text-slate-300 dark:text-slate-600">{value}</div>
            </div>
          </Panel>
        ))}
      </div>
      <GhostChart title={title} />
      <GhostList title="Detail" subtitle="Same tables and filters as the other operating companies, once this OpCo is live" />
    </div>
  );
}

const PAGE_COPY: Record<string, { title: string; description: string }> = {
  '/rankings': {
    title: 'Rankings',
    description: 'Workgroup and PD area rank versus peers.',
  },
  '/historical': {
    title: 'Historical',
    description: 'Compare years side by side, month by month.',
  },
  '/incidents': {
    title: 'Incidents',
    description: 'Most recent outage events, with repeat counts on the same feeder.',
  },
  '/devices': {
    title: 'Devices',
    description: 'Protective devices ranked by incidents in the last 12 months.',
  },
  '/customers': {
    title: 'Customer incidents',
    description: 'Customers with the most repeat outages.',
  },
  '/wpf': {
    title: 'Worst performing feeders',
    description: 'Feeders ranked by severity index.',
  },
  '/groups': {
    title: 'Groups',
    description: 'Crew and engineering lists your team works from.',
  },
  '/help': {
    title: 'Help request',
    description: 'Ask the Reliability support team.',
  },
  '/settings': {
    title: 'Settings',
    description: 'Appearance and map preferences.',
  },
};

export function OperatorPreviewShell({ company, path }: { company: string; path: string }) {
  if (path === '/') return <PerformanceSkeleton company={company} />;
  const copy = PAGE_COPY[path] ?? { title: 'Coming soon', description: `${company} is not in this release.` };
  return <PageSkeleton company={company} title={copy.title} description={copy.description} />;
}
