import type { CSSProperties } from 'react';

/** Position 0 = best, 1 = worst, on a green → amber → red scale. */
function hueFor(t: number) {
  return 145 - Math.max(0, Math.min(1, t)) * 145;
}

/** Solid fill for rank cells; white text reads on every step in both themes. */
export function rankStyle(rank: number, max: number): CSSProperties {
  const t = max <= 1 ? 0 : (rank - 1) / (max - 1);
  return { background: `hsl(${hueFor(t)} 62% 40%)`, color: 'white' };
}

export function rankColor(rank: number, max: number) {
  const t = max <= 1 ? 0 : (rank - 1) / (max - 1);
  return `hsl(${hueFor(t)} 62% 42%)`;
}

/**
 * Translucent tint for metric cells where higher is worse. Alpha-based so it
 * sits on white and dark surfaces without separate palettes.
 */
export function heatStyle(value: number, min: number, max: number): CSSProperties | undefined {
  if (!Number.isFinite(value) || max <= min) return undefined;
  const t = (value - min) / (max - min);
  return { background: `hsl(${hueFor(t)} 75% 45% / ${0.14 + t * 0.32})` };
}

/** Ranks values 1..n where the lowest value is rank 1. */
export function rankBy<T>(rows: T[], value: (row: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => value(a) - value(b));
  return new Map(sorted.map((row, i) => [row, i + 1]));
}
