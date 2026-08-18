/** Undirected vs URLs: abbrevs A–Z, one slug per pair. */

export function slugAbbrev(abbrev: string): string {
  return abbrev
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function vsSlug(
  abbrevA: string,
  abbrevB: string,
  slugA?: string,
  slugB?: string,
): string {
  const a = slugAbbrev(abbrevA);
  const b = slugAbbrev(abbrevB);
  if (!a || !b) {
    throw new Error(`Cannot build vs slug from "${abbrevA}" / "${abbrevB}"`);
  }
  if (a === b) {
    const sa = (slugA ?? "").replace(/[^a-z0-9]+/g, "");
    const sb = (slugB ?? "").replace(/[^a-z0-9]+/g, "");
    if (sa && sb && sa !== sb) return [sa, sb].sort().join("-vs-");
    throw new Error(`Cannot build vs slug from "${abbrevA}" / "${abbrevB}"`);
  }
  return [a, b].sort().join("-vs-");
}

/** Title/H1 order: GCU-first when GCU is in the pair, else abbrev A–Z. Slug stays A–Z. */
export function comparisonLead(
  abbrevA: string,
  abbrevB: string,
): [string, string] {
  const a = slugAbbrev(abbrevA);
  const b = slugAbbrev(abbrevB);
  if (a === "gcu") return [abbrevA, abbrevB];
  if (b === "gcu") return [abbrevB, abbrevA];
  return a <= b ? [abbrevA, abbrevB] : [abbrevB, abbrevA];
}

export function comparisonTitle(
  abbrevA: string,
  abbrevB: string,
  differentiator: string,
): string {
  const [lead, other] = comparisonLead(abbrevA, abbrevB);
  const diff = differentiator.trim();
  const title = diff ? `${lead} vs ${other}: ${diff}` : `${lead} vs ${other}`;
  if (title.length >= 30 && title.length <= 60) return title;
  if (title.length < 30) {
    const padded = `${lead} vs ${other}: cost, size, accreditation`;
    return padded.length <= 60 ? padded : padded.slice(0, 60);
  }
  return title.slice(0, 60).replace(/\s+\S*$/, "").trim();
}

export function comparisonDifferentiator(a: ScorecardBits, b: ScorecardBits): string {
  const ownA = a.ownershipCode;
  const ownB = b.ownershipCode;
  if (ownA != null && ownB != null && ownA !== ownB) {
    return "control, tuition, size";
  }
  if (a.state && b.state && a.state !== b.state) {
    return "tuition, size, location";
  }
  return "tuition, size, accreditation";
}

export type ScorecardBits = {
  ownershipCode?: number | null;
  state?: string | null;
};

export function tokenizeProse(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

/** Unique-content % vs other pages. Boilerplate nav is not in `text`. */
export function uniqueContentPercent(text: string, others: string[]): number {
  const words = tokenizeProse(text);
  if (words.length === 0) return 0;
  const otherSet = new Set(others.flatMap(tokenizeProse));
  let unique = 0;
  for (const w of words) {
    if (!otherSet.has(w)) unique += 1;
  }
  return (unique / words.length) * 100;
}
