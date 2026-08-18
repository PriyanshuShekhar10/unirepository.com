import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  comparisonDifferentiator,
  comparisonTitle,
  vsSlug,
} from "../../src/lib/compare.ts";

export type WikiSection = {
  key: string;
  heading: string;
  level: 2 | 3;
  mode: "code" | "prose";
  component?: string;
  paragraphs: string[];
  status: "pending" | "done" | "failed" | "code" | "omitted";
  parentKey?: string;
};

export type WikiPage = {
  qid: string;
  slug: string;
  title: string;
  type: string;
  category: string;
  aliases: string[];
  infobox: {
    label: string;
    fields: { label: string; value: string }[];
    photo?: string;
    logo?: string;
  };
  summary: string;
  sections: WikiSection[];
  links_out: string[];
  sources: { title: string; url: string }[];
  updated_at: string;
  status: string;
  schoolSlugs?: string[];
};

type TemplateNode = {
  key: string;
  heading: string;
  level?: 2 | 3;
  mode: string;
  component?: string;
  minWords?: number;
  maxWords?: number;
  factKeys?: string[];
  omitIfUnsourced?: boolean;
  children?: TemplateNode[];
};

const ROOT = process.cwd();

export function pagesDir() {
  return resolve(ROOT, "src/data/wiki/pages");
}

export function pagePath(slug: string) {
  return resolve(pagesDir(), `${slug}.json`);
}

export function loadPage(slug: string): WikiPage | null {
  const p = pagePath(slug);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as WikiPage;
}

export function saveWikiPage(page: WikiPage) {
  page.updated_at = new Date().toISOString().slice(0, 10);
  const pending = page.sections.some(
    (s) => s.mode === "prose" && s.status === "pending",
  );
  if (page.status !== "omitted") {
    page.status = pending ? "drafting" : "complete";
  }
  mkdirSync(pagesDir(), { recursive: true });
  writeFileSync(pagePath(page.slug), `${JSON.stringify(page, null, 2)}\n`);
}

function subst(s: string, vars: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function flattenBlocks(
  blocks: TemplateNode[],
  vars: Record<string, string>,
): WikiSection[] {
  const out: WikiSection[] = [];
  for (const b of blocks) {
    out.push({
      key: b.key,
      heading: subst(b.heading, vars),
      level: b.level ?? 2,
      mode: b.mode as "code" | "prose",
      component: b.component,
      paragraphs: [],
      status: b.mode === "prose" ? "pending" : "code",
    });
    for (const c of b.children ?? []) {
      out.push({
        key: c.key,
        heading: subst(c.heading, vars),
        level: c.level ?? 3,
        mode: c.mode as "code" | "prose",
        component: c.component ?? "none",
        parentKey: b.key,
        paragraphs: [],
        status: c.mode === "prose" ? "pending" : "code",
      });
    }
  }
  return out;
}

type SchoolJson = {
  unitid: number;
  slug: string;
  name: string;
  abbrev: string;
  aliases?: string[];
  scorecard: Record<string, { value: unknown; source?: string }>;
  wikidata?: Record<string, { value: unknown }>;
  images?: { photo?: { url?: string }; logo?: { url?: string } };
};

export function loadSchoolJson(slug: string): SchoolJson {
  return JSON.parse(
    readFileSync(resolve(ROOT, "src/data/schools", `${slug}.json`), "utf8"),
  ) as SchoolJson;
}

export function instantiateHub(slug: string): WikiPage {
  const school = loadSchoolJson(slug);
  const tmpl = JSON.parse(
    readFileSync(
      resolve(ROOT, "src/data/templates/university-hub.json"),
      "utf8",
    ),
  ) as { blocks: TemplateNode[] };
  const city = String(school.scorecard.city?.value ?? "");
  const vars = {
    name: school.name,
    abbrev: school.abbrev,
    city,
  };
  const qid = String(school.wikidata?.qid?.value ?? "");
  const sc = school.scorecard;
  const title = `${school.name} (${school.abbrev})`;
  const page: WikiPage = {
    qid,
    slug,
    title,
    type: "university",
    category: "universities",
    aliases: school.aliases ?? [school.abbrev],
    infobox: {
      label: "university",
      fields: [],
      photo: school.images?.photo?.url,
      logo: school.images?.logo?.url,
    },
    summary: `${school.name} (${school.abbrev}) is a university${
      city ? ` in ${city}` : ""
    }. This entry compiles College Scorecard figures and related sources; UniRepository is not affiliated with ${school.abbrev}.`,
    sections: flattenBlocks(tmpl.blocks, vars),
    links_out: [],
    sources: [
      {
        title: "College Scorecard",
        url: `https://collegescorecard.ed.gov/school/?${school.unitid}`,
      },
    ],
    updated_at: new Date().toISOString().slice(0, 10),
    status: "drafting",
  };
  void sc;
  return page;
}

export function instantiateComparison(
  slugA: string,
  slugB: string,
): WikiPage {
  const a = loadSchoolJson(slugA);
  const b = loadSchoolJson(slugB);
  const slug = vsSlug(a.abbrev, b.abbrev);
  const diff = comparisonDifferentiator(
    { ownershipCode: a.scorecard.ownershipCode?.value as number, state: String(a.scorecard.state?.value ?? "") },
    { ownershipCode: b.scorecard.ownershipCode?.value as number, state: String(b.scorecard.state?.value ?? "") },
  );
  const title = comparisonTitle(a.abbrev, b.abbrev, diff);
  const tmpl = JSON.parse(
    readFileSync(
      resolve(ROOT, "src/data/templates/university-comparison.json"),
      "utf8",
    ),
  ) as { blocks: TemplateNode[] };
  const vars = {
    abbrevA: a.abbrev,
    abbrevB: b.abbrev,
    nameA: a.name,
    nameB: b.name,
  };
  const [first, second] =
    a.abbrev.toLowerCase() <= b.abbrev.toLowerCase() ? [a, b] : [b, a];
  return {
    qid: "",
    slug,
    title,
    type: "comparison",
    category: "comparisons",
    aliases: [`${second.abbrev} vs ${first.abbrev}`],
    infobox: { label: "comparison", fields: [] },
    summary: `${first.name} (${first.abbrev}) versus ${second.name} (${second.abbrev}). Also searched as ${second.abbrev} vs ${first.abbrev}. Scorecard table is sourced; prose is checked against those facts. UniRepository is not affiliated with either school.`,
    sections: flattenBlocks(tmpl.blocks, vars),
    links_out: [first.slug, second.slug],
    schoolSlugs: [first.slug, second.slug],
    sources: [
      {
        title: `College Scorecard — ${a.name}`,
        url: `https://collegescorecard.ed.gov/school/?${a.unitid}`,
      },
      {
        title: `College Scorecard — ${b.name}`,
        url: `https://collegescorecard.ed.gov/school/?${b.unitid}`,
      },
    ],
    updated_at: new Date().toISOString().slice(0, 10),
    status: "drafting",
  };
}

export function loadTemplateIndex(kind: "hub" | "comparison") {
  const file =
    kind === "hub"
      ? "university-hub.json"
      : "university-comparison.json";
  const tmpl = JSON.parse(
    readFileSync(resolve(ROOT, "src/data/templates", file), "utf8"),
  ) as { blocks: TemplateNode[] };
  const map = new Map<string, TemplateNode>();
  for (const b of tmpl.blocks) {
    map.set(b.key, b);
    for (const c of b.children ?? []) map.set(c.key, c);
  }
  return map;
}
