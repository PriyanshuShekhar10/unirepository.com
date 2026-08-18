/** Numbers a prose draft is allowed to use (from sourced fact JSON). */

const DISCOURSE_SMALL = new Set(
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "150"].map(String),
);

export function addNumericToken(set: Set<string>, n: number): void {
  if (!Number.isFinite(n)) return;
  set.add(String(n));
  set.add(String(Math.round(n)));
  set.add(n.toFixed(1));
  set.add(n.toFixed(2));
  set.add(n.toLocaleString("en-US"));
  set.add(n.toLocaleString("en-US", { maximumFractionDigits: 0 }));
  if (n > 0 && n <= 1) {
    const pct = n * 100;
    set.add(pct.toFixed(1));
    set.add(pct.toFixed(2));
    set.add(String(Math.round(pct * 10) / 10));
    set.add(String(Math.round(pct)));
  }
}

export function walkAllowedNumbers(value: unknown, set: Set<string>): void {
  if (typeof value === "number") {
    addNumericToken(set, value);
    return;
  }
  if (typeof value === "string") {
    for (const m of value.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
      addNumericToken(set, Number(m[0].replace(/,/g, "")));
    }
    return;
  }
  if (Array.isArray(value)) {
    addNumericToken(set, value.length);
    for (const item of value) walkAllowedNumbers(item, set);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) walkAllowedNumbers(v, set);
  }
}

export function extractNumberTokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\$?\d[\d,]*(?:\.\d+)?%?/g)) {
    const raw = m[0].replace(/[$,%]/g, "");
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    out.push(raw.replace(/,/g, ""));
  }
  return out;
}

export function inventedNumbers(text: string, allowed: Set<string>): string[] {
  const allowedNums = [...allowed]
    .map((t) => Number(t.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
  const invented: string[] = [];
  for (const token of extractNumberTokens(text)) {
    const n = Number(token);
    const variants = new Set<string>();
    addNumericToken(variants, n);
    variants.add(token);
    const exact =
      DISCOURSE_SMALL.has(String(Math.round(n))) ||
      [...variants].some((v) => allowed.has(v));
    const close = allowedNums.some((x) => {
      if (x <= 0) return false;
      if (x >= 1000 && Math.abs(n - x) / x <= 0.015) return true;
      if (x >= 10000 && Math.round(n / 1000) === Math.round(x / 1000))
        return true;
      return false;
    });
    if (!exact && !close) invented.push(token);
  }
  return [...new Set(invented)];
}
