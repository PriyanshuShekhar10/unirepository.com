import type { OfficialRecord, SchoolRecord } from "@/lib/schools";
import { getOfficial, getSchool } from "@/lib/schools";

export type Fact = { value: unknown; source?: string; asOf?: string; retrieved_at?: string; note?: string };

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "Not in College Scorecard";
  return `${(n * 100).toFixed(digits)}%`;
}

export function usd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "Not in College Scorecard";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "Not in College Scorecard";
  return new Intl.NumberFormat("en-US").format(n);
}

export function ownershipLabel(code: number | null | undefined): string {
  if (code === 1) return "Public";
  if (code === 2) return "Private nonprofit";
  if (code === 3) return "Private for-profit";
  return "Not reported";
}

/** @deprecated use getSchool(slug) */
export function gcuSchool() {
  return getSchool("grand-canyon-university")!;
}

/** @deprecated use getOfficial(slug) */
export function gcuOfficial() {
  return getOfficial("grand-canyon-university");
}

export function schoolCovers(school: SchoolRecord) {
  return (school.covers ?? []) as Array<{
    src: string;
    alt: string;
    credit: string;
  }>;
}

export function gcuCovers() {
  const s = getSchool("grand-canyon-university");
  return s ? schoolCovers(s) : [];
}

export function ctaValue(
  official: OfficialRecord,
  key: string,
  fallback?: string,
): string | undefined {
  const v = official.ctas?.[key]?.value;
  if (typeof v === "string" && v) return v;
  return fallback;
}

export function factNum(school: SchoolRecord, key: string): number | null {
  const v = school.scorecard[key]?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function factStr(school: SchoolRecord, key: string): string | null {
  const v = school.scorecard[key]?.value;
  return typeof v === "string" && v ? v : null;
}

export function factBagFor(
  school: SchoolRecord,
  official: OfficialRecord,
): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(school.scorecard)) bag[k] = v.value;
  for (const [k, v] of Object.entries(school.wikidata ?? {})) {
    bag[`wikidata.${k}`] = v.value;
  }
  for (const [k, v] of Object.entries(school.accreditation ?? {})) {
    bag[`accreditation.${k}`] = v.value;
  }
  bag.city = school.scorecard.city?.value;
  bag.state = school.scorecard.state?.value;
  bag.zip = school.scorecard.zip?.value;
  bag["identity.christian"] = official.identity?.christian?.value;
  bag["identity.titleIvNote"] = official.identity?.titleIvNote?.value;
  bag["athletics.mascot"] = official.athletics?.mascot?.value;
  bag["athletics.division"] = official.athletics?.division?.value;
  bag["athletics.conference"] = official.athletics?.conference?.value;
  bag.colleges = official.colleges?.value;
  for (const [k, v] of Object.entries(official.degreeLevels ?? {})) {
    bag[`degreeLevels.${k}`] = v.value;
  }
  bag["climate.summary"] = official.climate?.summary?.value;
  bag["admissions.commonApp"] = official.admissions?.commonApp?.value;
  bag["admissions.earlyDecision"] = official.admissions?.earlyDecision?.value;
  for (const [k, v] of Object.entries(official.ctas ?? {})) {
    bag[`ctas.${k}`] = v.value;
  }
  bag.notableAlumni = official.notableAlumni?.value ?? [];
  return bag;
}
