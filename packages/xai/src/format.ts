/** Formats a number with three significant digits and a Turkish decimal comma, e.g. 0.12903 -> "0,129". */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const decimals = Math.max(0, Math.min(6, 2 - Math.floor(Math.log10(Math.abs(value)))));
  return Number(value.toFixed(decimals)).toString().replace('.', ',');
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'tanımlı değil';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'evet' : 'hayır';
  return String(value);
}
