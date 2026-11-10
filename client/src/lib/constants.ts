export const LIVE_OPCOS = ['OC1', 'OC2', 'OC3'] as const;

export type OpCoCode = (typeof LIVE_OPCOS)[number];

/** Default company when the URL has no `opco` param. */
export const LIVE_OPCO: OpCoCode = 'OC1';

export const OPCO_META: ReadonlyArray<{ code: OpCoCode; name: string; short: OpCoCode }> = [
  { code: 'OC1', name: 'OC1', short: 'OC1' },
  { code: 'OC2', name: 'OC2', short: 'OC2' },
  { code: 'OC3', name: 'OC3', short: 'OC3' },
];

export const LIVE_OPCO_META = OPCO_META[0];

/** Kept empty — all operating companies are live. */
export const COMING_SOON_OPCOS: ReadonlyArray<{ code: OpCoCode; name: string; short: OpCoCode }> = [];

export function isOpCoCode(value: string | null | undefined): value is OpCoCode {
  return LIVE_OPCOS.includes(value as OpCoCode);
}

export function opcoMeta(code: OpCoCode) {
  return OPCO_META.find((item) => item.code === code) ?? LIVE_OPCO_META;
}

export const REPORTING_AS_OF = '2026-07-31';

export const MAP_STYLE_KEY = 'reliability.mapStyle';
