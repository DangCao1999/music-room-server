const ISO = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** YouTube contentDetails.duration ("PT3M33S") → seconds. "P0D" (live) → 0. Invalid → null. */
export function parseIsoDuration(value: string): number | null {
  if (value === 'PT' || value === 'P') return null;
  const m = ISO.exec(value);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}
