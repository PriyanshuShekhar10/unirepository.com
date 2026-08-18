export const SCORECARD_FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.zip",
  "school.school_url",
  "school.ownership",
  "school.religious_affiliation",
  "latest.student.size",
  "latest.admissions.admission_rate.overall",
  "latest.admissions.sat_scores.average.overall",
  "latest.cost.tuition.in_state",
  "latest.cost.tuition.out_of_state",
  "latest.cost.roomboard.oncampus",
  "latest.cost.roomboard.offcampus",
  "latest.cost.booksupply",
  "latest.cost.otherexpense.oncampus",
  "latest.cost.attendance.academic_year",
  "latest.completion.completion_rate_4yr_150nt",
  "latest.student.retention_rate.four_year.full_time",
  "latest.earnings.10_yrs_after_entry.median",
  "latest.earnings.6_yrs_after_entry.median",
  "latest.aid.median_debt.completers.overall",
  "latest.aid.pell_grant_rate",
  "latest.student.demographics.men",
  "latest.student.demographics.women",
  "latest.student.demographics.race_ethnicity.white",
  "latest.student.demographics.race_ethnicity.black",
  "latest.student.demographics.race_ethnicity.hispanic",
  "latest.student.demographics.race_ethnicity.asian",
  "latest.student.share_firstgeneration",
  "latest.student.share_25_older",
  "latest.student.demographics.student_faculty_ratio",
  "latest.academics.program_percentage.health",
  "latest.academics.program_percentage.business_marketing",
  "latest.academics.program_percentage.public_administration_social_service",
  "latest.academics.program_percentage.education",
  "latest.academics.program_percentage.computer",
  "latest.academics.program_percentage.security_law_enforcement",
].join(",");

export function pick(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function fact(value: unknown, source: string, asOf: string) {
  return { value: value ?? null, source, asOf };
}

export function ownershipLabel(code: unknown): string {
  if (code === 1) return "Public";
  if (code === 2)
    return "Private nonprofit (as College Scorecard reports ownership code 2)";
  if (code === 3) return "Private for-profit";
  return "Not reported";
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function fetchSchoolById(
  id: number,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const url = new URL("https://api.data.gov/ed/collegescorecard/v1/schools");
  url.searchParams.set("id", String(id));
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("fields", SCORECARD_FIELDS);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scorecard ${id} HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  const row = json.results?.[0];
  if (!row) throw new Error(`Scorecard ${id}: empty results`);
  return row;
}

export async function searchSchoolByName(
  name: string,
  apiKey: string,
): Promise<Record<string, unknown> | null> {
  const url = new URL("https://api.data.gov/ed/collegescorecard/v1/schools");
  url.searchParams.set("school.name", name);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("fields", SCORECARD_FIELDS);
  url.searchParams.set("per_page", "5");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Scorecard search HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Record<string, unknown>[] };
  const rows = json.results ?? [];
  if (rows.length === 0) return null;
  const want = name.trim().toLowerCase();
  const exact = rows.find((r) => {
    const n = String(r["school.name"] ?? "").toLowerCase();
    return n === want || n.startsWith(want);
  });
  return exact ?? rows[0];
}

export function scorecardBlock(
  raw: Record<string, unknown>,
  src: string,
  asOf: string,
) {
  return {
    name: fact(raw["school.name"], src, asOf),
    city: fact(raw["school.city"], src, asOf),
    state: fact(raw["school.state"], src, asOf),
    zip: fact(raw["school.zip"], src, asOf),
    schoolUrl: fact(raw["school.school_url"], src, asOf),
    ownershipCode: fact(
      raw["school.ownership"],
      `${src} school.ownership (1=public, 2=private nonprofit, 3=private for-profit)`,
      asOf,
    ),
    ownershipLabel: fact(ownershipLabel(raw["school.ownership"]), src, asOf),
    religiousAffiliationCode: fact(
      raw["school.religious_affiliation"],
      src,
      asOf,
    ),
    undergraduateEnrollment: fact(raw["latest.student.size"], src, asOf),
    admissionRate: fact(
      raw["latest.admissions.admission_rate.overall"],
      src,
      asOf,
    ),
    satAverage: fact(
      raw["latest.admissions.sat_scores.average.overall"],
      src,
      asOf,
    ),
    tuitionInState: fact(raw["latest.cost.tuition.in_state"], src, asOf),
    tuitionOutOfState: fact(raw["latest.cost.tuition.out_of_state"], src, asOf),
    roomBoardOnCampus: fact(raw["latest.cost.roomboard.oncampus"], src, asOf),
    roomBoardOffCampus: fact(raw["latest.cost.roomboard.offcampus"], src, asOf),
    bookSupply: fact(raw["latest.cost.booksupply"], src, asOf),
    otherExpenseOnCampus: fact(
      raw["latest.cost.otherexpense.oncampus"],
      src,
      asOf,
    ),
    costOfAttendance: fact(
      raw["latest.cost.attendance.academic_year"],
      src,
      asOf,
    ),
    completionRate150: fact(
      raw["latest.completion.completion_rate_4yr_150nt"],
      src,
      asOf,
    ),
    retentionRateFt: fact(
      raw["latest.student.retention_rate.four_year.full_time"],
      src,
      asOf,
    ),
    medianEarnings10yr: fact(
      raw["latest.earnings.10_yrs_after_entry.median"],
      src,
      asOf,
    ),
    medianEarnings6yr: fact(
      raw["latest.earnings.6_yrs_after_entry.median"],
      src,
      asOf,
    ),
    medianDebtCompleters: fact(
      raw["latest.aid.median_debt.completers.overall"],
      src,
      asOf,
    ),
    pellGrantRate: fact(raw["latest.aid.pell_grant_rate"], src, asOf),
    shareMen: fact(raw["latest.student.demographics.men"], src, asOf),
    shareWomen: fact(raw["latest.student.demographics.women"], src, asOf),
    shareWhite: fact(
      raw["latest.student.demographics.race_ethnicity.white"],
      src,
      asOf,
    ),
    shareBlack: fact(
      raw["latest.student.demographics.race_ethnicity.black"],
      src,
      asOf,
    ),
    shareHispanic: fact(
      raw["latest.student.demographics.race_ethnicity.hispanic"],
      src,
      asOf,
    ),
    shareAsian: fact(
      raw["latest.student.demographics.race_ethnicity.asian"],
      src,
      asOf,
    ),
    shareFirstGeneration: fact(
      raw["latest.student.share_firstgeneration"],
      src,
      asOf,
    ),
    share25Older: fact(raw["latest.student.share_25_older"], src, asOf),
    studentFacultyRatio: fact(
      raw["latest.student.demographics.student_faculty_ratio"],
      src,
      asOf,
    ),
    programShareHealth: fact(
      raw["latest.academics.program_percentage.health"],
      src,
      asOf,
    ),
    programShareBusiness: fact(
      raw["latest.academics.program_percentage.business_marketing"],
      src,
      asOf,
    ),
    programSharePublicAdmin: fact(
      raw["latest.academics.program_percentage.public_administration_social_service"],
      src,
      asOf,
    ),
    programShareEducation: fact(
      raw["latest.academics.program_percentage.education"],
      src,
      asOf,
    ),
    programShareComputer: fact(
      raw["latest.academics.program_percentage.computer"],
      src,
      asOf,
    ),
    programShareSecurity: fact(
      raw["latest.academics.program_percentage.security_law_enforcement"],
      src,
      asOf,
    ),
  };
}

export function peerRow(
  raw: Record<string, unknown>,
  meta: { slug: string; unitid: number; abbrev: string },
) {
  return {
    slug: meta.slug,
    unitid: meta.unitid,
    name: raw["school.name"],
    abbrev: meta.abbrev,
    ownershipCode: raw["school.ownership"],
    city: raw["school.city"],
    state: raw["school.state"],
    undergraduateEnrollment: raw["latest.student.size"],
    admissionRate: raw["latest.admissions.admission_rate.overall"],
    tuitionInState: raw["latest.cost.tuition.in_state"],
    tuitionOutOfState: raw["latest.cost.tuition.out_of_state"],
    completionRate150: raw["latest.completion.completion_rate_4yr_150nt"],
    medianEarnings10yr: raw["latest.earnings.10_yrs_after_entry.median"],
  };
}
