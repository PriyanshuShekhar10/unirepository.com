export type Fact = {
  value: unknown;
  source?: string;
  asOf?: string;
  retrieved_at?: string;
  note?: string;
};

export type SchoolRecord = {
  unitid: number;
  slug: string;
  name: string;
  abbrev: string;
  aliases?: string[];
  asOf?: string;
  source?: string;
  scorecard: Record<string, Fact>;
  wikidata?: Record<string, Fact> & { qid?: Fact };
  accreditation?: Record<string, Fact>;
  images?: {
    photo?: { url?: string };
    logo?: { url?: string };
  };
  covers?: Array<{ src: string; alt: string; credit: string }>;
};

export type OfficialRecord = {
  retrieved_at?: string;
  ctas?: Record<string, Fact>;
  admissions?: Record<string, Fact>;
  identity?: Record<string, Fact>;
  athletics?: Record<string, Fact>;
  colleges?: Fact;
  degreeLevels?: Record<string, Fact>;
  notableAlumni?: Fact;
  climate?: { summary?: Fact };
  rankingsOutbound?: Record<string, Fact>;
};

const schoolModules = import.meta.glob<{ default: SchoolRecord }>(
  "../data/schools/*.json",
  { eager: true },
);

const officialModules = import.meta.glob<{ default: OfficialRecord }>(
  "../data/official/*.json",
  { eager: true },
);

const OFFICIAL_FILE: Record<string, string> = {
  "grand-canyon-university": "gcu",
};

function fileBase(path: string): string {
  const name = path.split("/").pop() ?? "";
  return name.replace(/\.json$/, "");
}

const schoolsBySlug: Map<string, SchoolRecord> = (() => {
  const map = new Map<string, SchoolRecord>();
  for (const [path, mod] of Object.entries(schoolModules)) {
    const rec = mod.default;
    if (!rec?.slug || !rec.unitid) continue;
    if (fileBase(path) === "peers") continue;
    map.set(rec.slug, rec);
  }
  return map;
})();

const officialByKey: Map<string, OfficialRecord> = (() => {
  const map = new Map<string, OfficialRecord>();
  for (const [path, mod] of Object.entries(officialModules)) {
    map.set(fileBase(path), mod.default);
  }
  return map;
})();

const EMPTY_OFFICIAL: OfficialRecord = {
  ctas: {},
  admissions: {},
  identity: {},
  athletics: {},
  degreeLevels: {},
  rankingsOutbound: {},
};

export function getSchool(slug: string): SchoolRecord | undefined {
  return schoolsBySlug.get(slug);
}

export function allSchools(): SchoolRecord[] {
  return [...schoolsBySlug.values()];
}

export function getOfficial(slug: string): OfficialRecord {
  const key = OFFICIAL_FILE[slug] ?? slug;
  return officialByKey.get(key) ?? EMPTY_OFFICIAL;
}

export function schoolUrl(school: SchoolRecord): string {
  const raw = school.scorecard.schoolUrl?.value;
  return typeof raw === "string" && raw ? raw : "#";
}

export function factString(fact: Fact | undefined): string | null {
  const v = fact?.value;
  if (v == null || v === "") return null;
  return String(v);
}

export function factNumber(fact: Fact | undefined): number | null {
  const v = fact?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function infoboxFieldsFor(school: SchoolRecord, official: OfficialRecord) {
  const sc = school.scorecard;
  const city = factString(sc.city) ?? "";
  const state = factString(sc.state) ?? "";
  const zip = factString(sc.zip) ?? "";
  const founded = school.wikidata?.foundedYear?.value;
  const ratio = factNumber(sc.studentFacultyRatio);
  const rows: { label: string; value: string }[] = [];
  if (city || state) {
    rows.push({
      label: "Location",
      value: [city, state, zip].filter(Boolean).join(", ").replace(/, (\d)/, " $1"),
    });
  }
  if (founded != null) rows.push({ label: "Founded", value: String(founded) });
  if (factString(sc.ownershipLabel)) {
    rows.push({ label: "Control", value: String(sc.ownershipLabel.value) });
  }
  const faith = factString(official.identity?.christian);
  if (faith) rows.push({ label: "Religious affiliation", value: faith });
  const ug = factNumber(sc.undergraduateEnrollment);
  if (ug != null) {
    rows.push({
      label: "Undergraduate enrollment",
      value: new Intl.NumberFormat("en-US").format(ug),
    });
  }
  const admit = factNumber(sc.admissionRate);
  if (admit != null) {
    rows.push({
      label: "Acceptance rate",
      value: `${(admit * 100).toFixed(1)}%`,
    });
  }
  if (ratio != null) {
    rows.push({ label: "Student-faculty ratio", value: `${ratio}:1` });
  }
  const site = factString(sc.schoolUrl);
  if (site) rows.push({ label: "Official site", value: site });
  return rows;
}
