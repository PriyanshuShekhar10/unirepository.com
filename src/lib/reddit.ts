import type { RedditBrief, RedditBriefsFile } from "./reddit-types";

export type { RedditBrief, RedditBriefsFile };

const redditModules = import.meta.glob<{ default: RedditBriefsFile }>(
  "../data/reddit/*.json",
  { eager: true },
);

const FILE_ALIAS: Record<string, string> = {
  "grand-canyon-university": "gcu",
};

function fileBase(path: string): string {
  return (path.split("/").pop() ?? "").replace(/\.json$/, "");
}

const byKey = new Map<string, RedditBriefsFile>();
for (const [path, mod] of Object.entries(redditModules)) {
  byKey.set(fileBase(path), mod.default);
}

const EMPTY: RedditBriefsFile = {
  asOf: null,
  label: "Sourced from Reddit",
  briefs: [],
};

export function redditBriefsFile(slug = "grand-canyon-university"): RedditBriefsFile {
  const key = FILE_ALIAS[slug] ?? slug;
  return byKey.get(key) ?? EMPTY;
}

export function redditBriefs(slug = "grand-canyon-university"): RedditBrief[] {
  return redditBriefsFile(slug).briefs.filter(
    (b) => b.url && b.title && /reddit\.com\/r\/[^/]+\/comments\//i.test(b.url),
  );
}

export function hasRedditBriefs(slug = "grand-canyon-university"): boolean {
  return redditBriefs(slug).length > 0;
}
