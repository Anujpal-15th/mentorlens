// Value helpers shared by the replay, drawings and result view. No DOM.

// Compact JSON with a space after commas, so [1,2] reads as [1, 2].
export function formatValue(v) {
  if (v === undefined) return '—';
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${formatValue(x)}`).join(', ')}}`;
  }
  return JSON.stringify(v) ?? String(v);
}

export function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
