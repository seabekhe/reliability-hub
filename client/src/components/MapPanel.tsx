import { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import type { MapView as MapViewType } from './MapView';

// MapLibre is ~800 kB, and only the three geographic pages need it. Loading it
// on demand keeps the Executive Summary landing page light.
const MapView = lazy(() =>
  import('./MapView').then((m) => ({ default: m.MapView })),
);

export function MapPanel(props: ComponentProps<typeof MapViewType>) {
  const height = props.height ?? 420;
  return (
    <Suspense
      fallback={
        <div
          className="rounded-2xl border border-slate-200 bg-white flex items-center justify-center text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400"
          style={{ height: height + 48 }}
        >
          Loading map…
        </div>
      }
    >
      <MapView {...props} />
    </Suspense>
  );
}
