export const toNumber = (value: number | string | null | undefined): number =>
  Number(value ?? 0);

export const formatNum = (value: number | string | null | undefined, digits = 1): string =>
  toNumber(value).toFixed(digits);

export const formatPct = (value: number | string | null | undefined): string =>
  `${Math.round(toNumber(value))}%`;

export const formatInt = (value: number | string | null | undefined): string =>
  Math.round(toNumber(value)).toLocaleString();
