import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "./lib/env.ts";
import { closeMongo, optionalDb } from "./lib/mongo.ts";

loadEnv();

type Page = {
  slug: string;
  title: string;
  type: string;
  category: string;
  summary: string;
  aliases: string[];
  schoolSlugs?: string[];
};

async function main() {
  const dir = resolve(process.cwd(), "src/data/wiki/pages");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const pages: Page[] = files.map(
    (f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Page,
  );
  const index = pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    type: p.type,
    category: p.category,
    summary: p.summary,
    aliases: p.aliases,
    schoolSlugs: (p as { schoolSlugs?: string[] }).schoolSlugs,
  }));
  writeFileSync(
    resolve(process.cwd(), "src/data/wiki/index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  console.log(`Exported ${index.length} wiki index entries.`);

  const db = await optionalDb();
  if (db) {
    for (const p of pages) {
      const full = JSON.parse(
        readFileSync(resolve(dir, `${p.slug}.json`), "utf8"),
      );
      await db.collection("pages").updateOne(
        { slug: p.slug },
        { $set: { ...full, updatedAt: new Date() } },
        { upsert: true },
      );
    }
    console.log("Upserted pages into Mongo.");
  }
  await closeMongo();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
