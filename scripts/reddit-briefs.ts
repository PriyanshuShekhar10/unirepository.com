import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import { loadEnv, requireEnv } from "./lib/env.ts";
import { closeMongo, optionalDb } from "./lib/mongo.ts";

loadEnv();

type Brief = {
  title: string;
  url: string;
  subreddit?: string;
  summary: string;
};

const OUT = resolve(process.cwd(), "src/data/reddit/gcu.json");
const PERMALINK =
  /^https?:\/\/(www\.)?reddit\.com\/r\/[A-Za-z0-9_]+\/comments\/[A-Za-z0-9]+/i;

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object in model output");
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizePermalink(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)reddit\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(
      /\/r\/([A-Za-z0-9_]+)\/comments\/([A-Za-z0-9]+)/i,
    );
    if (!m) return null;
    return `https://www.reddit.com/r/${m[1]}/comments/${m[2]}/`;
  } catch {
    return null;
  }
}

async function permalinkLive(url: string): Promise<boolean> {
  const headers = {
    "user-agent": "UniRepository/0.1 (encyclopedia; +https://unirepository.com)",
    accept: "text/html",
  };
  try {
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers,
    });
    if (head.ok) return true;
    const get = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers,
    });
    return get.ok;
  } catch {
    return false;
  }
}

function citationsFromResponse(resp: {
  output?: Array<{
    type?: string;
    content?: Array<{
      annotations?: Array<{ type?: string; url?: string }>;
    }>;
  }>;
}): string[] {
  const urls: string[] = [];
  for (const item of resp.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      for (const a of part.annotations ?? []) {
        if (a.type === "url_citation" && a.url) urls.push(a.url);
      }
    }
  }
  return urls;
}

async function main() {
  requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_REDDIT_MODEL?.trim() || "gpt-4.1";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  console.log("Reddit briefs: web_search allowed_domains=reddit.com");
  let resp;
  try {
    resp = await client.responses.create({
      model,
      tools: [
        {
          type: "web_search",
          filters: { allowed_domains: ["reddit.com"] },
        },
      ],
      include: ["web_search_call.action.sources"],
      input: `Search reddit.com for recent threads about Grand Canyon University or GCU (worth it, online, nursing, advisors, transfer, legit). Prefer r/GrandCanyonUniversity, r/college, r/nursing, r/StudentLoans.

Return JSON only:
{ "briefs": [ { "title": string, "url": string, "subreddit": string, "summary": string } ] }

Rules:
- url MUST be a reddit.com/r/.../comments/... permalink (not /search, not old.reddit listing pages, not developers.reddit.com).
- 4–8 briefs. Paraphrase; do not invent threads.
- summary: 1–2 sentences, labeled as student opinion.`,
    });
  } catch (err) {
    console.error(
      "web_search unavailable; writing empty briefs rather than inventing threads.",
    );
    console.error(err instanceof Error ? err.message : err);
    writeFileSync(
      OUT,
      `${JSON.stringify({ asOf: null, label: "Sourced from Reddit", briefs: [] }, null, 2)}\n`,
    );
    return;
  }

  const cited = citationsFromResponse(resp as never);
  const text = (resp as { output_text?: string }).output_text ?? "";
  let parsed: Brief[] = [];
  try {
    const obj = parseJsonObject(text);
    parsed = Array.isArray(obj.briefs) ? (obj.briefs as Brief[]) : [];
  } catch {
    parsed = [];
  }

  const candidates = [
    ...parsed.map((b) => ({ ...b, url: normalizePermalink(b.url) ?? b.url })),
    ...cited.map((url) => ({
      title: "",
      url: normalizePermalink(url) ?? url,
      summary: "",
    })),
  ];

  const seen = new Set<string>();
  const live: Brief[] = [];
  for (const b of candidates) {
    const url = normalizePermalink(b.url);
    if (!url || seen.has(url) || !PERMALINK.test(url)) continue;
    seen.add(url);
    const ok = await permalinkLive(url);
    console.log(`  ${ok ? "live" : "drop"} ${url}`);
    if (!ok) continue;
    const fromModel = parsed.find(
      (p) => normalizePermalink(p.url) === url,
    );
    live.push({
      title: fromModel?.title || b.title || "Reddit thread about GCU",
      url,
      subreddit: (fromModel?.subreddit || url.match(/\/r\/([^/]+)/)?.[1] || "").replace(
        /^r\//,
        "",
      ),
      summary:
        fromModel?.summary ||
        "Student discussion on Reddit; read the thread for context. Not an official GCU review.",
    });
    if (live.length >= 8) break;
  }

  const payload = {
    asOf: live.length ? new Date().toISOString().slice(0, 10) : null,
    label: "Sourced from Reddit",
    briefs: live,
  };
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${live.length} live Reddit briefs.`);

  const db = await optionalDb();
  if (db) {
    await db.collection("reddit_briefs").updateOne(
      { slug: "grand-canyon-university" },
      { $set: { ...payload, slug: "grand-canyon-university", updatedAt: new Date() } },
      { upsert: true },
    );
  }
  await closeMongo();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
