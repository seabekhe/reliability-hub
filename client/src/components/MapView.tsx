import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Locate, Minus, Plus } from 'lucide-react';
import { MAP_STYLE_KEY } from '../lib/constants';

export type MapPoint = {
  lat: number | string;
  lon: number | string;
  label?: string;
  tone?: string;
  /** Explicit color, overriding `tone` — used for continuous scales like rank. */
  color?: string;
  /** Explicit radius in pixels, overriding the default dot size. */
  radius?: number;
  /** Short text drawn inside the marker, e.g. a rank number. */
  badge?: string;
  /** Stable id for click handlers (e.g. device name). */
  id?: string;
  /** Draw a selection ring around this marker. */
  selected?: boolean;
};

export type MapPolygon = {
  /** GeoJSON Polygon coordinates: [[[lon, lat], ...]] */
  rings: number[][][];
  color: string;
  label?: string;
};

const TONE_COLOR: Record<string, string> = {
  hot: '#e11d48',
  cool: '#2563eb',
  neutral: '#f59e0b',
};

const TILE = 256;
const MIN_ZOOM = 5;
const MAX_ZOOM = 16;

const tileUrl = (style: string, z: number, x: number, y: number) => {
  if (style === 'dark') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
  }
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
};

/** Web Mercator projection, in normalized 0..1 world units. */
const projectX = (lon: number) => (lon + 180) / 360;
const projectY = (lat: number) => {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
};
const unprojectLon = (x: number) => x * 360 - 180;
const unprojectLat = (y: number) => {
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

type Resolved = {
  lat: number;
  lon: number;
  label: string;
  tone: string;
  color?: string;
  radius?: number;
  badge?: string;
  id?: string;
  selected?: boolean;
};
type View = { cx: number; cy: number; zoom: number };

function inUsSouth(lat: number, lon: number) {
  return lat > 24 && lat < 38 && lon > -92 && lon < -80;
}

function fitView(points: Resolved[], polygons: MapPolygon[], width: number, height: number): View {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  const consider = (lon: number, lat: number) => {
    const x = projectX(lon);
    const y = projectY(lat);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const p of points) consider(p.lon, p.lat);
  for (const poly of polygons) {
    for (const ring of poly.rings) {
      for (const [lon, lat] of ring) consider(lon, lat);
    }
  }
  const spanX = Math.max(maxX - minX, 1e-5);
  const spanY = Math.max(maxY - minY, 1e-5);
  const pad = 1.08;
  const raw = Math.min(
    Math.log2(width / (TILE * spanX * pad)),
    Math.log2(height / (TILE * spanY * pad)),
  );
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(raw + 0.35)));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, zoom };
}

type Marker = {
  key: string;
  left: number;
  top: number;
  radius: number;
  color: string;
  label: string;
  count: number;
  badge: string;
  clustered: boolean;
  id?: string;
  selected?: boolean;
};

function buildMarkers(
  resolved: Resolved[],
  cluster: boolean,
  view: View,
  originX: number,
  originY: number,
  worldSize: number,
): Marker[] {
  if (!cluster) {
    return resolved.map((p, i) => ({
      key: p.id ?? `p${i}`,
      left: projectX(p.lon) * worldSize - originX,
      top: projectY(p.lat) * worldSize - originY,
      radius: p.selected ? Math.max(p.radius ?? 5, 10) : (p.radius ?? 5),
      color: p.color ?? TONE_COLOR[p.tone] ?? TONE_COLOR.neutral,
      label: p.label,
      count: 1,
      badge: p.badge ?? '',
      clustered: false,
      id: p.id,
      selected: p.selected,
    }));
  }

  const cell = view.zoom >= 13 ? 18 : view.zoom >= 11 ? 28 : 40;
  const buckets = new Map<
    string,
    {
      left: number;
      top: number;
      count: number;
      hot: number;
      labels: string[];
      tone: string;
      color?: string;
      id?: string;
      selected?: boolean;
      radius?: number;
      badge?: string;
    }
  >();
  for (const p of resolved) {
    const left = projectX(p.lon) * worldSize - originX;
    const top = projectY(p.lat) * worldSize - originY;
    const key = `${Math.round(left / cell)}:${Math.round(top / cell)}`;
    const b = buckets.get(key);
    if (b) {
      b.left += left;
      b.top += top;
      b.count += 1;
      if (p.tone === 'hot') b.hot += 1;
      if (b.labels.length < 4 && p.label) b.labels.push(p.label);
      b.id = undefined;
      b.selected = b.selected || p.selected;
    } else {
      buckets.set(key, {
        left,
        top,
        count: 1,
        hot: p.tone === 'hot' ? 1 : 0,
        labels: p.label ? [p.label] : [],
        tone: p.tone,
        color: p.color,
        id: p.id,
        selected: p.selected,
        radius: p.radius,
        badge: p.badge,
      });
    }
  }

  return [...buckets.entries()].map(([key, b]) => {
    const left = b.left / b.count;
    const top = b.top / b.count;
    if (b.count === 1) {
      return {
        key,
        left,
        top,
        radius: b.selected ? Math.max(b.radius ?? 5, 10) : (b.radius ?? 5),
        color: b.color ?? TONE_COLOR[b.tone] ?? TONE_COLOR.cool,
        label: b.labels[0] ?? '',
        count: 1,
        badge: b.badge ?? '',
        clustered: false,
        id: b.id,
        selected: b.selected,
      };
    }
    const hotShare = b.hot / b.count;
    const color =
      hotShare >= 0.45 ? TONE_COLOR.hot : hotShare >= 0.15 ? TONE_COLOR.neutral : TONE_COLOR.cool;
    const extra = b.count > 4 ? ` +${b.count - 4} more` : '';
    return {
      key,
      left,
      top,
      radius: Math.min(28, 10 + Math.sqrt(b.count) * 1.6),
      color,
      label: `${b.count.toLocaleString()} devices\n${b.labels.join('\n')}${extra}`,
      count: b.count,
      badge: b.count >= 10 ? String(b.count) : String(b.count),
      clustered: true,
    };
  });
}

export function MapView({
  points,
  polygons = [],
  title,
  legend,
  cluster = false,
  height = 480,
  focus = null,
  onPointClick,
}: {
  points: MapPoint[];
  polygons?: MapPolygon[];
  title: string;
  legend?: Array<{ tone: string; label: string }>;
  /** Group nearby points into counted bubbles — useful for dense customer data. */
  cluster?: boolean;
  height?: number;
  /** Pan/zoom to a point when this changes (e.g. gallery click → device on map). */
  focus?: { lat: number; lon: number; zoom?: number; key?: string } | null;
  /** Fired when a non-cluster marker is clicked. */
  onPointClick?: (point: MapPoint) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<View>({ cx: projectX(-86.8), cy: projectY(32.7), zoom: 7 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const fitted = useRef('');
  const lastFocusKey = useRef('');
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const dark = typeof window !== 'undefined' && localStorage.getItem(MAP_STYLE_KEY) === 'Dark';
  const tileStyle = dark ? 'dark' : 'light';

  const resolved = useMemo<Resolved[]>(
    () =>
      points
        .map((p) => ({
          lat: Number(p.lat),
          lon: Number(p.lon),
          label: p.label ?? '',
          tone: p.tone ?? 'neutral',
          color: p.color,
          radius: p.radius,
          badge: p.badge,
          id: p.id,
          selected: p.selected,
        }))
        .filter(
          (p) =>
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lon) &&
            !(p.lat === 0 && p.lon === 0) &&
            inUsSouth(p.lat, p.lon),
        ),
    [points],
  );

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const applyFit = useCallback(() => {
    if ((resolved.length === 0 && polygons.length === 0) || width === 0) return;
    setView(fitView(resolved, polygons, width, height));
  }, [resolved, polygons, width, height]);

  useEffect(() => {
    if ((resolved.length === 0 && polygons.length === 0) || width === 0) return;
    const key = `${resolved.length}:${resolved[0]?.lat}:${resolved[0]?.lon}:${polygons.length}:${width}`;
    if (fitted.current === key) return;
    fitted.current = key;
    setView(fitView(resolved, polygons, width, height));
  }, [resolved, polygons, width, height]);

  useEffect(() => {
    if (!focus || width === 0) return;
    const lat = Number(focus.lat);
    const lon = Number(focus.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const key = focus.key ?? `${lat},${lon},${focus.zoom ?? 12}`;
    if (lastFocusKey.current === key) return;
    lastFocusKey.current = key;
    setView({
      cx: projectX(lon),
      cy: projectY(lat),
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, focus.zoom ?? 12)),
    });
  }, [focus, width]);

  const worldSize = TILE * Math.pow(2, view.zoom);
  const originX = view.cx * worldSize - width / 2;
  const originY = view.cy * worldSize - height / 2;

  const tiles = useMemo(() => {
    if (width === 0) return [];
    const count = Math.pow(2, view.zoom);
    const out: Array<{ key: string; url: string; left: number; top: number }> = [];
    const x0 = Math.floor(originX / TILE);
    const x1 = Math.floor((originX + width) / TILE);
    const y0 = Math.floor(originY / TILE);
    const y1 = Math.floor((originY + height) / TILE);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= count) continue;
        const wrapped = ((x % count) + count) % count;
        out.push({
          key: `${view.zoom}/${x}/${y}`,
          url: tileUrl(tileStyle, view.zoom, wrapped, y),
          left: x * TILE - originX,
          top: y * TILE - originY,
        });
      }
    }
    return out;
  }, [view.zoom, originX, originY, width, height, tileStyle]);

  const markers = useMemo(
    () => (width === 0 ? [] : buildMarkers(resolved, cluster, view, originX, originY, worldSize)),
    [resolved, cluster, view, originX, originY, worldSize, width],
  );

  const zoomAt = useCallback(
    (delta: number, clientX?: number, clientY?: number) => {
      setView((v) => {
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom + delta));
        if (nextZoom === v.zoom) return v;
        const el = container.current;
        if (!el || clientX == null || clientY == null) return { ...v, zoom: nextZoom };
        const rect = el.getBoundingClientRect();
        const oldSize = TILE * Math.pow(2, v.zoom);
        const newSize = TILE * Math.pow(2, nextZoom);
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const worldX = v.cx + (localX - width / 2) / oldSize;
        const worldY = v.cy + (localY - height / 2) / oldSize;
        return {
          zoom: nextZoom,
          cx: worldX - (localX - width / 2) / newSize,
          cy: Math.max(0, Math.min(1, worldY - (localY - height / 2) / newSize)),
        };
      });
    },
    [width, height],
  );

  useEffect(() => {
    const el = container.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? -1 : 1, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-marker]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({
      ...v,
      cx: d.cx - (e.clientX - d.x) / worldSize,
      cy: Math.max(0, Math.min(1, d.cy - (e.clientY - d.y) / worldSize)),
    }));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const centerLabel = `${unprojectLat(view.cy).toFixed(2)}°, ${unprojectLon(view.cx).toFixed(2)}°`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <span className="text-sm font-semibold text-slate-950 dark:text-white">{title}</span>
        <span className="tabular text-xs text-slate-700 dark:text-slate-200">
          {resolved.length.toLocaleString()} locations
        </span>
      </div>

      <div
        ref={container}
        style={{ height }}
        className={`relative w-full overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none ${dark ? 'bg-[#0b1220]' : 'bg-[#d4e0ea]'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            width={TILE}
            height={TILE}
            className="absolute pointer-events-none"
            style={{ left: t.left, top: t.top }}
          />
        ))}

        {width > 0 && polygons.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none" width={width} height={height}>
            {polygons.map((poly, i) => {
              const d = poly.rings
                .map(
                  (ring) =>
                    ring
                      .map(([lon, lat], idx) => {
                        const x = projectX(lon) * worldSize - originX;
                        const y = projectY(lat) * worldSize - originY;
                        return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ') + ' Z',
                )
                .join(' ');
              return (
                <path
                  key={`poly-${i}`}
                  d={d}
                  fill={poly.color}
                  fillOpacity={0.18}
                  stroke={poly.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                >
                  {poly.label ? <title>{poly.label}</title> : null}
                </path>
              );
            })}
          </svg>
        )}

        {markers.map((m) => (
          <div
            key={m.key}
            data-marker
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
            style={{
              left: m.left,
              top: m.top,
              width: m.radius * 2,
              height: m.radius * 2,
              borderRadius: '9999px',
              background: m.color,
              opacity: m.clustered ? 0.88 : 0.92,
              border: m.selected ? '3px solid #0891b2' : '2px solid rgba(255,255,255,0.95)',
              boxShadow: m.selected
                ? '0 0 0 4px rgba(8,145,178,0.35), 0 1px 4px rgba(15,23,42,0.35)'
                : '0 1px 4px rgba(15,23,42,0.35)',
              fontSize: m.count >= 100 ? 10 : 11,
              fontWeight: 700,
              color: '#ffffff',
              zIndex: m.selected ? 3 : m.clustered ? 2 : 1,
            }}
            onPointerEnter={() => setTip({ x: m.left, y: m.top, text: m.label })}
            onPointerLeave={() => setTip(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (m.clustered) {
                zoomAt(2, e.clientX, e.clientY);
                return;
              }
              if (!onPointClick || !m.id) return;
              const match = points.find((p) => p.id === m.id);
              if (match) onPointClick(match);
            }}
          >
            {m.badge}
          </div>
        ))}

        {tip && (
          <div
            className="absolute z-10 max-w-[240px] rounded-lg bg-slate-950/90 px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg pointer-events-none whitespace-pre-line"
            style={{
              left: Math.min(Math.max(8, tip.x + 12), Math.max(8, width - 248)),
              top: Math.max(8, tip.y - 12),
            }}
          >
            {tip.text}
          </div>
        )}

        <div className="absolute top-3 right-3 flex flex-col rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-white/15 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => zoomAt(1)}
            disabled={view.zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="h-8 w-8 text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center dark:text-slate-200 dark:hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomAt(-1)}
            disabled={view.zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="h-8 w-8 text-slate-700 hover:bg-slate-50 disabled:opacity-40 border-t border-slate-200 flex items-center justify-center dark:text-slate-200 dark:hover:bg-white/5 dark:border-white/15"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={applyFit}
            aria-label="Fit to incidents"
            className="h-8 w-8 text-slate-700 hover:bg-slate-50 border-t border-slate-200 flex items-center justify-center dark:text-slate-200 dark:hover:bg-white/5 dark:border-white/15"
          >
            <Locate className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="absolute bottom-1.5 right-2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-700 pointer-events-none dark:bg-slate-900/90 dark:text-slate-200">
          © Esri · z{view.zoom} · {centerLabel}
        </div>
      </div>

      {legend && legend.length > 0 && (
        <div className="px-5 py-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {cluster ? (
            <>
              {legend.map((item) => (
                <span key={item.tone} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: TONE_COLOR[item.tone] ?? TONE_COLOR.neutral }}
                  />
                  {item.label}
                </span>
              ))}
              <span className="ml-auto">Scroll to zoom · click a count to split it</span>
            </>
          ) : (
            <>
              {legend.map((item) => (
                <span key={item.tone} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: TONE_COLOR[item.tone] ?? TONE_COLOR.neutral }}
                  />
                  {item.label}
                </span>
              ))}
              <span className="ml-auto">Drag to pan · hover a dot for detail</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
