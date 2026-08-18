import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { searchSchoolByName, slugifyName } from "./lib/scorecard.ts";

loadEnv();

type DraftSchool = { name: string; abbrev: string; state?: string };
type DraftCluster = { id?: string; title: string; schools: DraftSchool[] };

const CLUSTER1 = {
  id: "cluster-01",
  title: "GCU search peers",
  schools: [
    { name: "Grand Canyon University", abbrev: "GCU", state: "AZ", slug: "grand-canyon-university", unitid: 104717 },
    { name: "Southern New Hampshire University", abbrev: "SNHU", state: "NH", slug: "southern-new-hampshire-university", unitid: 183026 },
    { name: "Western Governors University", abbrev: "WGU", state: "UT", slug: "western-governors-university", unitid: 445188 },
    { name: "Arizona State University", abbrev: "ASU", state: "AZ", slug: "arizona-state-university", unitid: 104151 },
    { name: "University of Phoenix", abbrev: "Phoenix", state: "AZ", slug: "university-of-phoenix", unitid: 484613 },
    { name: "Liberty University", abbrev: "Liberty", state: "VA", slug: "liberty-university", unitid: 232557 },
    { name: "Northern Arizona University", abbrev: "NAU", state: "AZ", slug: "northern-arizona-university", unitid: 105330 },
    { name: "Purdue University Global", abbrev: "PurdueGlobal", state: "IN", slug: "purdue-university-global", unitid: 489779 },
    { name: "Capella University", abbrev: "Capella", state: "MN", slug: "capella-university", unitid: 413413 },
  ],
};

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object in model output");
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

async function draftClusters(client: OpenAI): Promise<DraftCluster[]> {
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_GROW_MODEL?.trim() || "gpt-4.1-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Return JSON { "clusters": [{ "title": string, "schools": [{ "name": string, "abbrev": string, "state": string }] }] }. US degree-granting 4-year institutions only. Groups of 8-10 that people actually compare (not merely similar enrollment). No ranks, no unitids, no diploma mills, no invented names.',
      },
      {
        role: "user",
        content: `Produce about 22 additional clusters (~190 schools) of real US 4-year colleges. Do NOT include these already-used names: Grand Canyon University, Southern New Hampshire University, Western Governors University, Arizona State University, University of Phoenix, Liberty University, Northern Arizona University, Purdue University Global, Capella University. Cluster themes may include: California CSUs, HBCUs, Christian colleges, Big Ten, nursing-heavy, competency-based, large online privates (other than the excluded set), Texas publics, New England liberals arts, etc.`,
      },
    ],
  });
  const json = parseJsonObject(res.choices[0]?.message?.content ?? "");
  const clusters = json.clusters;
  if (!Array.isArray(clusters)) throw new Error("No clusters array");
  return clusters as DraftCluster[];
}

async function bindCluster(
  draft: DraftCluster,
  apiKey: string,
  used: Set<number>,
  id: string,
) {
  const schools = [];
  for (const s of draft.schools) {
    try {
      const row = await searchSchoolByName(s.name, apiKey);
      if (!row) {
        console.log(`  drop ${s.name} (no Scorecard)`);
        continue;
      }
      const unitid = Number(row.id ?? row["id"]);
      if (!Number.isFinite(unitid) || used.has(unitid)) {
        console.log(`  drop ${s.name} (bad or duplicate unitid ${unitid})`);
        continue;
      }
      used.add(unitid);
      const officialName = String(row["school.name"] ?? s.name);
      schools.push({
        name: officialName,
        abbrev: s.abbrev.replace(/[^A-Za-z0-9]/g, "") || officialName.slice(0, 6),
        state: String(row["school.state"] ?? s.state ?? ""),
        slug: slugifyName(officialName),
        unitid,
      });
    } catch (err) {
      console.log(`  drop ${s.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (schools.length < 4) return null;
  return {
    id,
    title: draft.title,
    status: "active" as const,
    schools: schools.slice(0, 10),
    omits: [],
  };
}

async function main() {
  const append = process.argv.includes("--append");
  const apiKey = requireEnv("DATA_GOV_API_KEY");
  const dir = resolve(process.cwd(), "src/data/clusters");
  mkdirSync(dir, { recursive: true });

  const used = new Set<number>(CLUSTER1.schools.map((s) => s.unitid));
  let ids = ["cluster-01"];
  let n = 2;

  if (append) {
    ids = [];
    for (const f of readdirSync(dir).filter((x) => /^cluster-\d+\.json$/.test(x))) {
      const c = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as {
        id: string;
        schools: { unitid: number }[];
      };
      ids.push(c.id);
      for (const s of c.schools) used.add(s.unitid);
    }
    ids.sort();
    n = ids.reduce((max, id) => {
      const num = Number(id.replace("cluster-", ""));
      return Number.isFinite(num) ? Math.max(max, num + 1) : max;
    }, 2);
  } else {
    writeFileSync(
      resolve(dir, "cluster-01.json"),
      `${JSON.stringify({ ...CLUSTER1, omits: [] }, null, 2)}\n`,
    );
  }

  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  console.log(append ? `Appending from cluster-${String(n).padStart(2, "0")}…` : "Drafting additional clusters…");
  let drafts = await draftClusters(client);
  for (const d of drafts) {
    const bound = await bindCluster(d, apiKey, used, `cluster-${String(n).padStart(2, "0")}`);
    if (!bound) continue;
    writeFileSync(
      resolve(dir, `${bound.id}.json`),
      `${JSON.stringify(bound, null, 2)}\n`,
    );
    ids.push(bound.id);
    console.log(`Wrote ${bound.id} (${bound.schools.length} schools) — ${bound.title}`);
    n += 1;
  }

  if (!append && ids.length < 3) {
    console.log("Retrying draft for more clusters…");
    drafts = await draftClusters(client);
    for (const d of drafts) {
      const bound = await bindCluster(
        d,
        apiKey,
        used,
        `cluster-${String(n).padStart(2, "0")}`,
      );
      if (!bound) continue;
      writeFileSync(
        resolve(dir, `${bound.id}.json`),
        `${JSON.stringify(bound, null, 2)}\n`,
      );
      ids.push(bound.id);
      n += 1;
    }
  }

  writeFileSync(
    resolve(dir, "queue.json"),
    `${JSON.stringify({ ids }, null, 2)}\n`,
  );
  console.log(`Queue: ${ids.length} clusters, ${used.size} unique unitids.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
