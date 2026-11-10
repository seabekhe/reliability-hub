import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1 min-w-0">
        {eyebrow && (
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-blue-700 dark:text-blue-300">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  footer,
  padded = true,
  className = '',
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  padded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800 ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'px-5 pb-5' : ''}>{children}</div>
      {footer && (
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
          {footer}
        </div>
      )}
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center rounded-lg bg-slate-200 p-0.5 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-md font-medium transition-colors ${
              size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
            } ${
              active
                ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-white'
                : 'hover:text-slate-950 dark:hover:text-white'
            }`}
          >
            {o.label}
            {o.count != null && (
              <span
                className={`tabular rounded px-1 text-[10px] ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                    : 'bg-slate-200/70 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                }`}
              >
                {o.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (next: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-slate-100'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const SOLID = {
  bad: 'bg-rose-600 text-white',
  warn: 'bg-amber-500 text-white',
  good: 'bg-emerald-600 text-white',
  info: 'bg-blue-600 text-white',
  neutral: 'bg-slate-500 text-white',
} as const;

/** Filled badge for states that must stand out in dense tables (priority, needs review). */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${SOLID[tone]}`}>
      {children}
    </span>
  );
}

const TONES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
  bad: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/20',
  warn: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-400/20',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10',
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
      {children}
    </div>
  );
}
