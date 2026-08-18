import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { closeMongo, optionalDb } from "./lib/mongo.ts";
import {
  fetchSchoolById,
  peerRow,
  scorecardBlock,
} from "./lib/scorecard.ts";
import {
  downloadCommonsFile,
  fetchWikidataByUnitid,
  publicMediaPath,
} from "./lib/wikidata.ts";

loadEnv();

type ClusterSchool = {
  name: string;
  abbrev: string;
  slug: string;
  unitid: number;
};

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function loadCluster(id: string): ClusterSchool[] {
  const path = resolve(process.cwd(), "src/data/clusters", `${id}.json`);
  const json = JSON.parse(readFileSync(path, "utf8")) as {
    schools: ClusterSchool[];
  };
  return json.schools;
}

function officialStub(unitid: number, schoolUrl: string, asOf: string) {
  const href = schoolUrl || "https://collegescorecard.ed.gov/";
  const npc = `https://collegescorecard.ed.gov/school/?${unitid}`;
  const f = (value: unknown, source = href) => ({
    value,
    source,
    retrieved_at: asOf,
  });
  return {
    retrieved_at: asOf,
    ctas: {
      apply: f(href),
      visit: f(href),
      requestInfo: f(href),
      catalog: f(href),
      npc: f(href),
      scorecardNpc: f(npc, "College Scorecard school page"),
    },
    admissions: {
      commonApp: f(null, "not in editorial file"),
      earlyDecision: f(null, "not in editorial file"),
    },
    identity: {},
    athletics: {},
    colleges: { value: [], source: "not in editorial file", retrieved_at: asOf },
    degreeLevels: {},
    notableAlumni: { value: [], retrieved_at: asOf },
    climate: { summary: f(null, "not in editorial file") },
    rankingsOutbound: {},
  };
}

async function seedOne(opts: {
  unitid: number;
  slug: string;
  abbrev: string;
  nameHint?: string;
  apiKey: string;
  asOf: string;
  fetchMedia: boolean;
}) {
  const { unitid, slug, abbrev, apiKey, asOf, fetchMedia } = opts;
  const schoolPath = resolve(process.cwd(), "src/data/schools", `${slug}.json`);
  mkdirSync(dirname(schoolPath), { recursive: true });
  const existing = existsSync(schoolPath)
    ? (JSON.parse(readFileSync(schoolPath, "utf8")) as Record<string, unknown>)
    : {};

  const raw = await fetchSchoolById(unitid, apiKey);
  const name = String(raw["school.name"] ?? opts.nameHint ?? slug);
  if (opts.nameHint) {
    const hint = opts.nameHint.toLowerCase();
    const got = name.toLowerCase();
    const tokens = hint.split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    const hits = tokens.filter((t) => got.includes(t)).length;
    if (tokens.length && hits < Math.min(2, tokens.length)) {
      throw new Error(
        `Scorecard ${unitid} is "${name}", expected something like "${opts.nameHint}"`,
      );
    }
  }
  const schoolUrl = String(raw["school.school_url"] ?? "");

  existing.unitid = unitid;
  existing.slug = slug;
  existing.name = name;
  existing.abbrev = abbrev;
  existing.aliases = existing.aliases ?? [abbrev];
  existing.asOf = asOf;
  existing.source = "https://collegescorecard.ed.gov/";
  existing.scorecard = scorecardBlock(raw, "College Scorecard", asOf);

  const hasWd = Boolean(
    existing.wikidata &&
      typeof existing.wikidata === "object" &&
      (existing.wikidata as { qid?: { value?: unknown } }).qid?.value,
  );
  if (!hasWd || process.argv.includes("--refresh-media")) {
    const wd = await fetchWikidataByUnitid(unitid);
    existing.wikidata = {
      qid: { value: wd.qid, source: "Wikidata P1771", asOf },
      foundedYear: { value: wd.foundedYear, source: "Wikidata P571", asOf },
      latitude: { value: wd.latitude, source: "Wikidata P625", asOf },
      longitude: { value: wd.longitude, source: "Wikidata P625", asOf },
      officialWebsite: {
        value: wd.website ?? schoolUrl,
        source: "Wikidata P856 / Scorecard",
        asOf,
      },
    };
    if (fetchMedia) {
      mkdirSync(resolve(process.cwd(), "public/media", slug), { recursive: true });
      const images: Record<string, unknown> = (existing.images as Record<string, unknown>) ?? {};
      if (wd.imageTitle) {
        const dest = publicMediaPath(slug, "campus.jpg");
        const saved = await downloadCommonsFile(wd.imageTitle, dest);
        if (saved) {
          images.photo = {
            url: `/media/${slug}/campus.jpg`,
            commonsTitle: wd.imageTitle,
            license: saved.license,
            artist: saved.artist,
            credit: "Wikimedia Commons",
          };
        }
      }
      if (wd.logoTitle) {
        const ext = wd.logoTitle.toLowerCase().endsWith(".svg") ? "svg" : "png";
        const dest = publicMediaPath(slug, `logo.${ext}`);
        const saved = await downloadCommonsFile(wd.logoTitle, dest);
        if (saved) {
          images.logo = {
            url: `/media/${slug}/logo.${ext}`,
            commonsTitle: wd.logoTitle,
            license: saved.license,
            artist: saved.artist,
            credit: "Wikimedia Commons",
          };
        }
      }
      existing.images = images;
      const photoUrl = (images.photo as { url?: string } | undefined)?.url;
      if (photoUrl) {
        existing.covers = [
          {
            src: photoUrl,
            alt: `${name} campus`,
            credit: "Wikimedia Commons",
          },
        ];
      }
      if (
        typeof wd.latitude === "number" &&
        typeof wd.longitude === "number" &&
        !existsSync(publicMediaPath(slug, "map.png"))
      ) {
        const py = spawnSync(
          "python3",
          [
            resolve(process.cwd(), "scripts/fetch-osm-map.py"),
            "--lat",
            String(wd.latitude),
            "--lon",
            String(wd.longitude),
            "--out",
            publicMediaPath(slug, "map.png"),
          ],
          { stdio: "inherit" },
        );
        if (py.status !== 0) console.log(`  OSM map skipped for ${slug}`);
      }
    }
  }

  writeFileSync(schoolPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`Seeded ${slug} (${unitid}).`);

  const officialPath = resolve(process.cwd(), "src/data/official", `${slug}.json`);
  const gcuOfficial = resolve(process.cwd(), "src/data/official/gcu.json");
  const hasOfficial =
    existsSync(officialPath) ||
    (slug === "grand-canyon-university" && existsSync(gcuOfficial));
  if (!hasOfficial) {
    writeFileSync(
      officialPath,
      `${JSON.stringify(officialStub(unitid, schoolUrl, asOf), null, 2)}\n`,
    );
    console.log(`  wrote official stub ${slug}.json`);
  }

  return { raw, slug, unitid, abbrev, name };
}

async function main() {
  const apiKey = requireEnv("DATA_GOV_API_KEY");
  const asOf = new Date().toISOString().slice(0, 10);
  const clusterId = argValue("--cluster") ?? "cluster-01";
  const unitidArg = argValue("--unitid");
  const fetchMedia = !process.argv.includes("--no-media");

  let targets: ClusterSchool[];
  if (unitidArg) {
    targets = [
      {
        unitid: Number(unitidArg),
        slug: argValue("--slug") ?? "",
        abbrev: argValue("--abbrev") ?? "",
        name: argValue("--name") ?? "",
      },
    ];
    if (!targets[0].slug || !targets[0].abbrev) {
      throw new Error("--unitid requires --slug and --abbrev");
    }
  } else {
    targets = loadCluster(clusterId);
  }

  const peersPath = resolve(process.cwd(), "src/data/schools/peers.json");
  const refresh = process.argv.includes("--refresh");
  const peerRows = [];
  for (const t of targets) {
    const schoolPath = resolve(process.cwd(), "src/data/schools", `${t.slug}.json`);
    if (existsSync(schoolPath) && !refresh) {
      console.log(`skip existing ${t.slug}`);
      continue;
    }
    try {
      const seeded = await seedOne({
        unitid: t.unitid,
        slug: t.slug,
        abbrev: t.abbrev,
        nameHint: t.name,
        apiKey,
        asOf,
        fetchMedia,
      });
      peerRows.push(peerRow(seeded.raw, t));
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.error(
        `Failed ${t.slug}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  if (unitidArg) {
    const slug = targets[0].slug;
    const schoolPath = resolve(process.cwd(), "src/data/schools", `${slug}.json`);
    if (!existsSync(schoolPath)) {
      throw new Error(`No school file written for ${slug}`);
    }
  }
  if (peerRows.length === 0 && !existsSync(peersPath)) {
    throw new Error("No schools seeded");
  }

  const existingPeers = existsSync(peersPath)
    ? (JSON.parse(readFileSync(peersPath, "utf8")) as {
        schools?: Record<string, unknown>[];
      })
    : { schools: [] };
  const bySlug = new Map<string, Record<string, unknown>>();
  for (const row of existingPeers.schools ?? []) {
    const slug = String(row.slug ?? "");
    if (slug) bySlug.set(slug, row);
  }
  for (const row of peerRows) {
    const slug = String((row as { slug?: string }).slug ?? "");
    if (slug) bySlug.set(slug, row as Record<string, unknown>);
  }
  writeFileSync(
    peersPath,
    `${JSON.stringify({ asOf, source: "College Scorecard API", schools: [...bySlug.values()] }, null, 2)}\n`,
  );
  console.log("Updated peers.json.");

  const db = await optionalDb();
  if (db) {
    for (const t of targets) {
      const p = resolve(process.cwd(), "src/data/schools", `${t.slug}.json`);
      if (!existsSync(p)) continue;
      const rec = JSON.parse(readFileSync(p, "utf8"));
      await db.collection("schools").updateOne(
        { unitid: t.unitid },
        { $set: { ...rec, unitid: t.unitid, updatedAt: new Date() } },
        { upsert: true },
      );
    }
  }
  await closeMongo();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
