import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import OpenAI from "openai";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { closeMongo, optionalDb } from "./lib/mongo.ts";
import { inventedNumbers, walkAllowedNumbers } from "./lib/numbers.ts";
import { uniqueContentPercent } from "../src/lib/compare.ts";
import { vsSlug } from "../src/lib/compare.ts";
import {
  instantiateComparison,
  instantiateHub,
  loadPage,
  loadSchoolJson,
  loadTemplateIndex,
  saveWikiPage,
  type WikiPage,
  type WikiSection,
} from "./lib/wiki-page.ts";

loadEnv();

type TemplateNode = {
  key: string;
  heading: string;
  mode: string;
  minWords?: number;
  maxWords?: number;
  factKeys?: string[];
  omitIfUnsourced?: boolean;
};

type ClusterSchool = {
  name: string;
  abbrev: string;
  slug: string;
  unitid: number;
};

type ClusterFile = {
  id: string;
  title: string;
  status?: string;
  schools: ClusterSchool[];
  omits?: { a: string; b: string; reason: string }[];
};

const ROOT = process.cwd();
const ROUNDS = 3;
const MODEL = process.env.OPENAI_GROW_MODEL?.trim() || "gpt-4.1-mini";
const HUBS_PER_DAY = Number(process.env.GROW_HUBS_PER_DAY ?? 2);

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object in model output");
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

function delayBlocked(): boolean {
  if (
    process.argv.includes("--ignore-delay") ||
    process.env.GROW_IGNORE_DELAY === "1"
  ) {
    return false;
  }
  const p = resolve(ROOT, "src/data/clusters/grow-not-before.json");
  if (!existsSync(p)) return false;
  const json = JSON.parse(readFileSync(p, "utf8")) as { utc?: string };
  if (!json.utc) return false;
  return Date.now() < new Date(json.utc).getTime();
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function clusterPath(id: string) {
  return resolve(ROOT, "src/data/clusters", `${id}.json`);
}

function loadQueue(): string[] {
  const q = loadJson<{ ids: string[] }>(
    resolve(ROOT, "src/data/clusters/queue.json"),
  );
  return q.ids;
}

function activeCluster(): ClusterFile | null {
  for (const id of loadQueue()) {
    const c = loadJson<ClusterFile>(clusterPath(id));
    const allHubs = c.schools.every((s) => loadPage(s.slug)?.status === "complete");
    const neededVs = vsCandidates(c).filter((pair) => {
      if (isOmitted(c, pair[0].slug, pair[1].slug)) return false;
      const slug = vsSlug(pair[0].abbrev, pair[1].abbrev);
      return loadPage(slug)?.status !== "complete";
    });
    if (!allHubs || neededVs.length > 0) return c;
  }
  return null;
}

function vsCandidates(c: ClusterFile): [ClusterSchool, ClusterSchool][] {
  const out: [ClusterSchool, ClusterSchool][] = [];
  for (let i = 0; i < c.schools.length; i++) {
    for (let j = i + 1; j < c.schools.length; j++) {
      out.push([c.schools[i], c.schools[j]]);
    }
  }
  return out;
}

function isOmitted(c: ClusterFile, a: string, b: string) {
  return (c.omits ?? []).some(
    (o) => (o.a === a && o.b === b) || (o.a === b && o.b === a),
  );
}

function saveCluster(c: ClusterFile) {
  writeFileSync(clusterPath(c.id), `${JSON.stringify(c, null, 2)}\n`);
}

function logOmit(c: ClusterFile, a: string, b: string, reason: string) {
  c.omits = c.omits ?? [];
  if (!isOmitted(c, a, b)) c.omits.push({ a, b, reason });
  saveCluster(c);
  console.log(`omit vs ${a} / ${b}: ${reason}`);
}

function officialPath(slug: string) {
  const named = resolve(ROOT, "src/data/official", `${slug}.json`);
  if (existsSync(named)) return named;
  if (slug === "grand-canyon-university") {
    return resolve(ROOT, "src/data/official/gcu.json");
  }
  return named;
}

function factBagForSlug(slug: string): Record<string, unknown> {
  const school = loadSchoolJson(slug);
  const bag: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(school.scorecard)) bag[k] = v.value;
  for (const [k, v] of Object.entries(school.wikidata ?? {})) {
    bag[`wikidata.${k}`] = v.value;
  }
  const offPath = officialPath(slug);
  if (existsSync(offPath)) {
    const official = loadJson<Record<string, unknown>>(offPath);
    const identity = official.identity as Record<string, { value: unknown }> | undefined;
    const athletics = official.athletics as Record<string, { value: unknown }> | undefined;
    const degreeLevels = official.degreeLevels as
      | Record<string, { value: unknown }>
      | undefined;
    const ctas = official.ctas as Record<string, { value: unknown }> | undefined;
    const admissions = official.admissions as
      | Record<string, { value: unknown }>
      | undefined;
    const climate = official.climate as { summary?: { value: unknown } } | undefined;
    const colleges = official.colleges as { value?: unknown } | undefined;
    const alumni = official.notableAlumni as { value?: unknown } | undefined;
    if (identity) {
      for (const [k, v] of Object.entries(identity)) bag[`identity.${k}`] = v.value;
    }
    if (athletics) {
      for (const [k, v] of Object.entries(athletics)) bag[`athletics.${k}`] = v.value;
    }
    if (degreeLevels) {
      for (const [k, v] of Object.entries(degreeLevels))
        bag[`degreeLevels.${k}`] = v.value;
    }
    if (ctas) {
      for (const [k, v] of Object.entries(ctas)) bag[`ctas.${k}`] = v.value;
    }
    if (admissions) {
      for (const [k, v] of Object.entries(admissions))
        bag[`admissions.${k}`] = v.value;
    }
    bag["climate.summary"] = climate?.summary?.value;
    bag.colleges = colleges?.value;
    bag.notableAlumni = alumni?.value ?? [];
  }
  bag.city = school.scorecard.city?.value;
  bag.state = school.scorecard.state?.value;
  bag.zip = school.scorecard.zip?.value;
  bag.name = school.name;
  bag.abbrev = school.abbrev;
  return bag;
}

function pairBag(slugA: string, slugB: string): Record<string, unknown> {
  const a = factBagForSlug(slugA);
  const b = factBagForSlug(slugB);
  const bag: Record<string, unknown> = { ...a, ...b };
  for (const [k, v] of Object.entries(a)) bag[`a.${k}`] = v;
  for (const [k, v] of Object.entries(b)) bag[`b.${k}`] = v;
  return bag;
}

function factMissing(keys: string[] | undefined, bag: Record<string, unknown>) {
  if (!keys?.length) return false;
  return keys.some((k) => {
    const v = bag[k];
    if (v == null || v === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}

function siblingProse(page: WikiPage, section: WikiSection): string {
  const parent = section.parentKey;
  return page.sections
    .filter(
      (s) =>
        s.mode === "prose" &&
        s.status === "done" &&
        s.key !== section.key &&
        (parent ? s.parentKey === parent : true),
    )
    .map((s) => `### ${s.heading}\n${s.paragraphs.join("\n\n")}`)
    .join("\n\n");
}

function wordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
}

async function chatJson(
  client: OpenAI,
  system: string,
  user: string,
): Promise<Record<string, unknown>> {
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return parseJsonObject(res.choices[0]?.message?.content ?? "");
}

async function growOne(
  client: OpenAI,
  page: WikiPage,
  section: WikiSection,
  tmpl: TemplateNode,
  bag: Record<string, unknown>,
  allowed: Set<string>,
  names: { full: string; abbrev: string },
) {
  if (tmpl.omitIfUnsourced && factMissing(tmpl.factKeys, bag)) {
    section.status = "omitted";
    section.paragraphs = [];
    console.log(`omit ${section.key} (unsourced)`);
    return;
  }

  const relevant: Record<string, unknown> = {};
  for (const k of tmpl.factKeys ?? []) relevant[k] = bag[k];
  const siblings = siblingProse(page, section);
  let hints = "";
  let lastPass: string[] | null = null;

  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`  generate ${section.key} round ${round}/${ROUNDS}`);
    const gen = await chatJson(
      client,
      `You write encyclopedia prose for UniRepository. Output JSON { "paragraphs": string[] }.
Rules:
- Only this heading. No H2/H3 markdown, no bullet lists unless facts are a named college list.
- Every numeral must already appear in FACTS (including percents and dollar amounts).
- Do not invent US News/Niche/Forbes ranks, employment rates, club lists, or net-price calculator results.
- Do not give legal, visa, or admissions advice. Link facts only.
- Neutral encyclopedic tone. First mention ${names.full} (${names.abbrev}), then ${names.abbrev}.
- Do not claim affiliation with the school.
- Do not copy another university's Title IV, faith, or landmine language.
- Word count about ${tmpl.minWords ?? 70}–${tmpl.maxWords ?? 160} words total.`,
      `HEADING: ${section.heading} (${section.key})
FACTS (JSON): ${JSON.stringify(relevant, null, 2)}
ALREADY WRITTEN SIBLINGS:\n${siblings || "(none)"}
REWRITE HINTS:\n${hints || "(none)"}
Return JSON only.`,
    );

    const paragraphs = Array.isArray(gen.paragraphs)
      ? (gen.paragraphs as unknown[]).map((p) => String(p).trim()).filter(Boolean)
      : String(gen.text ?? gen.paragraph ?? "")
          .split(/\n\n+/)
          .map((p) => p.trim())
          .filter(Boolean);

    const draft = paragraphs.join("\n\n");
    const invented = inventedNumbers(draft, allowed);

    console.log(`  validate ${section.key} round ${round}/${ROUNDS}`);
    const val = await chatJson(
      client,
      `You are a fact checker. Output JSON { "pass": boolean, "inventedNumbers": string[], "rewriteHints": string }.
pass=false if any number is not in FACTS (formatting differences like 73371 vs 73,371 vs 73.4% from a 0.734 rate are OK).
pass=false for ranks, employment rates, or unsourced lists.`,
      `HEADING: ${section.heading}
FACTS: ${JSON.stringify(relevant, null, 2)}
DRAFT:\n${draft}`,
    );

    const modelPass = val.pass === true && invented.length === 0;
    const words = wordCount(paragraphs);
    const tooShort = tmpl.minWords ? words < Math.floor(tmpl.minWords * 0.6) : false;
    const pass = modelPass && !tooShort && paragraphs.length > 0;

    if (pass) {
      lastPass = paragraphs;
      hints = "";
      console.log(`  pass round ${round} (${words} words)`);
    } else {
      const extra = [
        invented.length ? `Invented numbers: ${invented.join(", ")}` : "",
        tooShort ? `Too short (${words} words)` : "",
        typeof val.rewriteHints === "string" ? val.rewriteHints : "",
      ]
        .filter(Boolean)
        .join(" ");
      hints = extra || "Rewrite using only FACTS; drop unsourced numbers.";
      console.log(`  fail round ${round}: ${hints.slice(0, 180)}`);
    }
  }

  if (lastPass) {
    section.paragraphs = lastPass;
    section.status = "done";
  } else {
    section.paragraphs = [];
    section.status = "failed";
    console.log(`  omitted after ${ROUNDS} failed rounds: ${section.key}`);
  }
}

function pendingProse(page: WikiPage, retryFailed: boolean) {
  return page.sections.filter((s) => {
    if (s.mode !== "prose") return false;
    if (s.status === "pending") return true;
    if (retryFailed && s.status === "failed") return true;
    return false;
  });
}

async function fillPage(
  client: OpenAI,
  page: WikiPage,
  bag: Record<string, unknown>,
  names: { full: string; abbrev: string },
  kind: "hub" | "comparison",
  all: boolean,
  retryFailed: boolean,
) {
  const tmplMap = loadTemplateIndex(kind);
  const allowed = new Set<string>();
  walkAllowedNumbers(bag, allowed);
  const reddit =
    kind === "hub"
      ? resolve(ROOT, "src/data/reddit", `${page.slug}.json`)
      : "";
  const gcuReddit = resolve(ROOT, "src/data/reddit/gcu.json");
  if (kind === "hub" && existsSync(reddit)) {
    walkAllowedNumbers(loadJson(reddit), allowed);
  } else if (page.slug === "grand-canyon-university" && existsSync(gcuReddit)) {
    walkAllowedNumbers(loadJson(gcuReddit), allowed);
  }

  const queue = pendingProse(page, retryFailed);
  const work = all ? queue : queue.slice(0, 1);
  const db = await optionalDb();
  for (const section of work) {
    const tmpl = tmplMap.get(section.key) ?? {
      key: section.key,
      heading: section.heading,
      mode: "prose",
    };
    console.log(`Grow ${page.slug} / ${section.key} — ${section.heading}`);
    await growOne(client, page, section, tmpl, bag, allowed, names);
    saveWikiPage(page);
    if (db) {
      await db.collection("pages").updateOne(
        { slug: page.slug },
        { $set: { ...page, updatedAt: new Date() } },
        { upsert: true },
      );
      await db.collection("jobs").insertOne({
        type: "grow",
        slug: page.slug,
        sectionKey: section.key,
        status: section.status,
        at: new Date(),
      });
    }
  }
  return page;
}

function statePath() {
  return resolve(ROOT, "src/data/clusters/grow-state.json");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState(): { day: string; hubsCompleted: string[] } {
  const p = statePath();
  if (!existsSync(p)) return { day: todayKey(), hubsCompleted: [] };
  const s = loadJson<{ day?: string; hubsCompleted?: string[] }>(p);
  if (s.day !== todayKey()) return { day: todayKey(), hubsCompleted: [] };
  return { day: s.day, hubsCompleted: s.hubsCompleted ?? [] };
}

function saveState(s: { day: string; hubsCompleted: string[] }) {
  writeFileSync(statePath(), `${JSON.stringify(s, null, 2)}\n`);
}

function ensureSeeded(school: ClusterSchool) {
  const p = resolve(ROOT, "src/data/schools", `${school.slug}.json`);
  if (existsSync(p)) return;
  console.log(`Seeding ${school.slug} before hub grow…`);
  const r = spawnSync(
    "npx",
    [
      "tsx",
      "scripts/seed-scorecard.ts",
      "--unitid",
      String(school.unitid),
      "--slug",
      school.slug,
      "--abbrev",
      school.abbrev,
      "--name",
      school.name,
    ],
    { stdio: "inherit", cwd: ROOT },
  );
  if (r.status !== 0) throw new Error(`seed failed for ${school.slug}`);
}

function thinPair(a: ClusterSchool, b: ClusterSchool): boolean {
  const sa = loadSchoolJson(a.slug);
  const sb = loadSchoolJson(b.slug);
  const empty = (s: typeof sa) =>
    s.scorecard.undergraduateEnrollment?.value == null &&
    s.scorecard.tuitionInState?.value == null &&
    s.scorecard.admissionRate?.value == null;
  return empty(sa) && empty(sb);
}

function vsProse(page: WikiPage): string {
  return page.sections
    .filter((s) => s.mode === "prose" && s.status === "done")
    .map((s) => s.paragraphs.join(" "))
    .join(" ");
}

function uniquenessOk(page: WikiPage, cluster: ClusterFile): number {
  const others = vsCandidates(cluster)
    .map(([x, y]) => {
      try {
        return loadPage(vsSlug(x.abbrev, y.abbrev));
      } catch {
        return null;
      }
    })
    .filter((p): p is WikiPage => Boolean(p) && p.slug !== page.slug && p.status === "complete")
    .map(vsProse);
  return uniqueContentPercent(vsProse(page), others);
}

async function connectVs(
  client: OpenAI,
  cluster: ClusterFile,
  newSlug: string,
) {
  const self = cluster.schools.find((s) => s.slug === newSlug);
  if (!self) return;
  const mates = cluster.schools.filter(
    (s) => s.slug !== newSlug && loadPage(s.slug)?.status === "complete",
  );
  for (const mate of mates) {
    if (isOmitted(cluster, self.slug, mate.slug)) continue;
    if (thinPair(self, mate)) {
      logOmit(cluster, self.slug, mate.slug, "thin-pair");
      continue;
    }
    let page = (() => {
      try {
        return loadPage(vsSlug(self.abbrev, mate.abbrev));
      } catch {
        return null;
      }
    })();
    if (!page) {
      page = instantiateComparison(self.slug, mate.slug);
      saveWikiPage(page);
    }
    if (page.status === "complete") continue;
    const bag = pairBag(self.slug, mate.slug);
    page = await fillPage(
      client,
      page,
      bag,
      { full: `${self.name} vs ${mate.name}`, abbrev: `${self.abbrev} vs ${mate.abbrev}` },
      "comparison",
      true,
      false,
    );
    const proseDone = page.sections.filter(
      (s) => s.mode === "prose" && s.status === "done",
    );
    if (proseDone.length === 0) {
      logOmit(cluster, self.slug, mate.slug, "table-only");
      page.status = "omitted";
      saveWikiPage(page);
      continue;
    }
    const uniq = uniquenessOk(page, cluster);
    console.log(`  uniqueness ${page.slug}: ${uniq.toFixed(1)}%`);
    if (uniq < 30) {
      logOmit(cluster, self.slug, mate.slug, `unique-content ${uniq.toFixed(0)}% < 30`);
      page.status = "omitted";
      saveWikiPage(page);
      continue;
    }
    if (uniq < 40) {
      logOmit(cluster, self.slug, mate.slug, `unique-content ${uniq.toFixed(0)}% < 40`);
      page.status = "omitted";
      saveWikiPage(page);
      continue;
    }
  }
}

function nextSchool(cluster: ClusterFile): ClusterSchool | null {
  const drafting = cluster.schools.find(
    (s) => loadPage(s.slug)?.status === "drafting",
  );
  if (drafting) return drafting;
  return (
    cluster.schools.find((s) => {
      const p = loadPage(s.slug);
      return !p || p.status === "drafting" || p.status === "pending";
    }) ?? null
  );
}

function exportWiki() {
  const r = spawnSync("npx", ["tsx", "scripts/export-wiki.ts"], {
    stdio: "inherit",
    cwd: ROOT,
  });
  if (r.status !== 0) console.log("wiki:export failed");
}

async function untilQuota(client: OpenAI) {
  const state = loadState();
  while (state.hubsCompleted.length < HUBS_PER_DAY) {
    const cluster = activeCluster();
    if (!cluster) {
      console.log("no pending cluster");
      break;
    }
    const school = nextSchool(cluster);
    if (!school) {
      cluster.status = "complete";
      saveCluster(cluster);
      console.log(`cluster ${cluster.id} complete`);
      continue;
    }
    ensureSeeded(school);
    let page = loadPage(school.slug);
    if (!page) {
      page = instantiateHub(school.slug);
      saveWikiPage(page);
    }
    if (page.status !== "complete") {
      page = await fillPage(
        client,
        page,
        factBagForSlug(school.slug),
        { full: school.name, abbrev: school.abbrev },
        "hub",
        true,
        false,
      );
    }
    page = loadPage(school.slug)!;
    if (page.status === "complete") {
      if (!state.hubsCompleted.includes(school.slug)) {
        state.hubsCompleted.push(school.slug);
        saveState(state);
      }
      await connectVs(client, cluster, school.slug);
    } else {
      console.log(`hub ${school.slug} still drafting; resume next run`);
      break;
    }
  }
  exportWiki();
}

async function growSlug(
  client: OpenAI,
  slug: string,
  all: boolean,
  retryFailed: boolean,
) {
  const page = loadPage(slug);
  if (!page) throw new Error(`No wiki page ${slug}`);
  const kind = page.type === "comparison" ? "comparison" : "hub";
  const bag =
    kind === "comparison" && page.schoolSlugs?.length === 2
      ? pairBag(page.schoolSlugs[0], page.schoolSlugs[1])
      : factBagForSlug(slug);
  const school = kind === "hub" ? loadSchoolJson(slug) : null;
  await fillPage(
    client,
    page,
    bag,
    school
      ? { full: school.name, abbrev: school.abbrev }
      : { full: page.title, abbrev: page.title },
    kind,
    all,
    retryFailed,
  );
}

async function main() {
  if (delayBlocked()) {
    console.log("Grow delayed until grow-not-before.json timestamp.");
    return;
  }
  requireEnv("OPENAI_API_KEY");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const untilQuotaFlag =
    process.argv.includes("--until-quota") || process.env.GROW_UNTIL_QUOTA === "1";
  const all = process.argv.includes("--all") || process.env.GROW_ALL === "1";
  const retryFailed = process.argv.includes("--retry-failed");
  const slugFlag = (() => {
    const i = process.argv.indexOf("--slug");
    return i >= 0 ? process.argv[i + 1] : undefined;
  })();

  if (untilQuotaFlag) {
    await untilQuota(client);
  } else if (slugFlag) {
    await growSlug(client, slugFlag, all, retryFailed);
  } else if (loadPage("grand-canyon-university")) {
    await growSlug(client, "grand-canyon-university", all, retryFailed);
  } else {
    await untilQuota(client);
  }

  await closeMongo();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
