import { useEffect, useRef, useState } from 'react';

export interface BandPoint {
  label: string;
  actual: number | null;
  goal: number;
  /** Value at which funding hits 0% (worse than goal). */
  band0: number;
  /** Value at which funding hits 200% (better than goal). */
  band200: number;
}

const PAD = { top: 12, right: 16, bottom: 28, left: 48 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

/**
 * Goal-tracking chart in the Reliability style: the red region is where funding
 * erodes toward 0%, the green region is where it climbs toward 200%.
 */
export function BandChart({
  data,
  height = 280,
  digits = 1,
  hideFunding = false,
}: {
  data: BandPoint[];
  height?: number;
  digits?: number;
  hideFunding?: boolean;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!wrap.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const top = niceMax(
    Math.max(...data.flatMap((d) => [d.band0, d.actual ?? 0, d.goal])) * 1.05,
  );
  const n = data.length;
  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

  const line = (pts: Array<[number, number]>) =>
    pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = (upper: number[], lower: number[]) =>
    `${line(upper.map((v, i) => [x(i), y(v)]))} ${lower
      .map((v, i) => [x(i), y(v)] as [number, number])
      .reverse()
      .map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`)
      .join(' ')} Z`;

  const goals = data.map((d) => d.goal);
  const actualPts = data
    .map((d, i) => (d.actual == null ? null : ([x(i), y(d.actual)] as [number, number])))
    .filter((p): p is [number, number] => p != null);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);
  const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: digits });
  const h = hover != null ? data[hover] : null;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };

  return (
    <div ref={wrap} className="relative w-full select-none">
      <svg width={width} height={height} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-slate-100 dark:stroke-white/10"
            />
            <text
              x={PAD.left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-slate-400 text-[10px] tabular-nums"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        <path d={area(data.map((d) => d.band0), goals)} className="fill-rose-500/15 dark:fill-rose-400/15" />
        <path d={area(goals, data.map((d) => d.band200))} className="fill-emerald-500/15 dark:fill-emerald-400/15" />
        <path d={line(data.map((d, i) => [x(i), y(d.band0)]))} className="fill-none stroke-rose-400/60" strokeWidth={1} />
        <path d={line(data.map((d, i) => [x(i), y(d.band200)]))} className="fill-none stroke-emerald-500/60" strokeWidth={1} />
        <path
          d={line(goals.map((g, i) => [x(i), y(g)]))}
          className="fill-none stroke-slate-500 dark:stroke-slate-300"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        {actualPts.length > 0 && (
          <>
            <path d={line(actualPts)} className="fill-none stroke-blue-600 dark:stroke-blue-400" strokeWidth={2.5} strokeLinejoin="round" />
            {actualPts.map(([px, py], i) => (
              <circle
                key={i}
                cx={px}
                cy={py}
                r={hover === i ? 5 : 3.5}
                className="fill-white stroke-blue-600 dark:fill-slate-900 dark:stroke-blue-400"
                strokeWidth={2}
              />
            ))}
          </>
        )}

        {data.map((d, i) => (
          <text
            key={d.label}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            className={`text-[10px] ${hover === i ? 'fill-slate-900 dark:fill-white font-medium' : 'fill-slate-400'}`}
          >
            {d.label}
          </text>
        ))}

        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            className="stroke-slate-300 dark:stroke-white/20"
          />
        )}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {h && hover != null && (
        <div
          className="pointer-events-none absolute z-10 w-44 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-[11px] shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-900/95"
          style={{
            left: Math.min(Math.max(x(hover) - 88, 0), width - 176),
            top: 0,
          }}
        >
          <div className="mb-1 font-semibold text-slate-900 dark:text-slate-50">{h.label}</div>
          <Row swatch="bg-blue-600" label="Actual" value={h.actual == null ? '—' : fmt(h.actual)} strong />
          <Row swatch="bg-slate-500" label="Goal" value={fmt(h.goal)} />
          {!hideFunding && (
            <>
              <Row swatch="bg-rose-400" label="0% funding" value={fmt(h.band0)} />
              <Row swatch="bg-emerald-500" label="200% funding" value={fmt(h.band200)} />
            </>
          )}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-12 text-[11px] text-slate-500 dark:text-slate-400">
        <Legend className="h-0.5 w-4 bg-blue-600 dark:bg-blue-400" label="Actual" />
        <Legend
          className="h-0 w-4 border-t-2 border-dashed border-slate-500 dark:border-slate-300"
          label={hideFunding ? 'Goal' : 'Goal (100% funding)'}
        />
        {hideFunding ? (
          <span className="text-[11px] uppercase tracking-[0.06em] text-slate-400">Coming soon · funding bands</span>
        ) : (
          <>
            <Legend className="h-2.5 w-4 rounded-sm bg-rose-500/20" label="Toward 0% funding" />
            <Legend className="h-2.5 w-4 rounded-sm bg-emerald-500/20" label="Toward 200% funding" />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ swatch, label, value, strong }: { swatch: string; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className={`h-2 w-2 rounded-full ${swatch}`} />
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`tabular ml-auto ${strong ? 'font-semibold text-slate-900 dark:text-slate-50' : 'text-slate-700 dark:text-slate-200'}`}>
        {value}
      </span>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={className} />
      {label}
    </span>
  );
}
