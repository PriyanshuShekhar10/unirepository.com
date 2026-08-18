import indexJson from "@/data/wiki/index.json";
import redirectsJson from "@/data/wiki/redirects.json";
import hubTemplate from "@/data/templates/university-hub.json";

export interface WikiSource {
  title: string;
  url: string;
  license?: string;
}

export interface InfoboxField {
  label: string;
  value: string;
  source?: string;
}

export interface WikiInfobox {
  label: string;
  fields: InfoboxField[];
  photo?: string;
  logo?: string;
}

export interface WikiSection {
  key: string;
  heading: string;
  level: 2 | 3;
  mode: "code" | "prose";
  component?: string;
  paragraphs: string[];
  status: "pending" | "done" | "failed" | "code" | "omitted";
  parentKey?: string;
}

export interface WikiPage {
  qid: string;
  slug: string;
  title: string;
  type: string;
  category: string;
  aliases: string[];
  infobox: WikiInfobox;
  summary: string;
  sections: WikiSection[];
  links_out: string[];
  sources: WikiSource[];
  updated_at: string;
  status: string;
  schoolSlugs?: string[];
}

export interface WikiIndexEntry {
  slug: string;
  title: string;
  type: string;
  category: string;
  summary: string;
  aliases: string[];
  schoolSlugs?: string[];
}

export const CATEGORY_META: Record<string, { name: string; blurb: string }> = {
  universities: {
    name: "Universities",
    blurb: "School hubs with sourced facts and encyclopedia-style entries.",
  },
  comparisons: {
    name: "Comparisons",
    blurb: "Head-to-head Scorecard snapshots of schools people actually compare.",
  },
  money: {
    name: "Money & admissions",
    blurb: "Tuition, net price, and how students get in.",
  },
  trust: {
    name: "Trust",
    blurb: "Accreditation, identity, and student opinions.",
  },
};

export const CATEGORY_ORDER = ["universities", "comparisons", "money", "trust"];

const pageModules = import.meta.glob<{ default: WikiPage }>(
  "../data/wiki/pages/*.json",
  { eager: true },
);

const pagesBySlug: Map<string, WikiPage> = (() => {
  const map = new Map<string, WikiPage>();
  for (const mod of Object.values(pageModules)) {
    const page = mod.default;
    map.set(page.slug, page);
  }
  return map;
})();

export const wikiIndex = indexJson as WikiIndexEntry[];
export const redirects = redirectsJson as Record<string, string>;

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function displayTitle(title: string): string {
  if (!title) return title;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function clampDescription(text: string, max = 155): string {
  const s = stripWikitext(text).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd()}…`;
}

export function ogKeyForPath(pathname: string): string {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  if (clean === "") return "index";
  if (
    clean === "wiki/a-z" ||
    clean === "about" ||
    clean === "methodology" ||
    clean === "faq" ||
    clean === "contact" ||
    clean === "privacy" ||
    clean === "terms" ||
    clean === "404" ||
    clean === "500" ||
    clean === "wiki/comparisons"
  ) {
    return clean;
  }
  const cat = clean.match(/^wiki\/category\/([a-z0-9-]+)$/);
  if (cat && getCategory(cat[1])) return clean;
  const slug = clean.match(/^wiki\/([a-z0-9-]+)$/);
  if (slug && hasPage(slug[1])) return clean;
  return "index";
}

export function getPage(slug: string): WikiPage | undefined {
  return pagesBySlug.get(slug);
}

export function hasPage(slug: string): boolean {
  return pagesBySlug.has(slug);
}

export function allPages(): WikiPage[] {
  return [...pagesBySlug.values()];
}

export function getBacklinks(slug: string): WikiIndexEntry[] {
  return wikiIndex.filter((e) => {
    const p = pagesBySlug.get(e.slug);
    return p?.links_out?.includes(slug);
  });
}

export interface WikiCategory {
  slug: string;
  name: string;
  blurb: string;
  entries: WikiIndexEntry[];
}

export function getCategories(): WikiCategory[] {
  const byCat = new Map<string, WikiIndexEntry[]>();
  for (const entry of wikiIndex) {
    const list = byCat.get(entry.category) ?? [];
    list.push(entry);
    byCat.set(entry.category, list);
  }
  const rank = (slug: string) => {
    const i = CATEGORY_ORDER.indexOf(slug);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...byCat.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([slug, entries]) => ({
      slug,
      name: CATEGORY_META[slug]?.name ?? slug,
      blurb: CATEGORY_META[slug]?.blurb ?? "",
      entries: [...entries].sort((a, b) => a.title.localeCompare(b.title)),
    }));
}

export function getCategory(slug: string): WikiCategory | undefined {
  return getCategories().find((c) => c.slug === slug);
}

export function categoryName(slug: string): string {
  return CATEGORY_META[slug]?.name ?? slug;
}

export const wikiCounts = {
  pages: pagesBySlug.size,
  links: allPages().reduce((n, p) => n + (p.links_out?.length ?? 0), 0),
  categories: new Set(wikiIndex.map((e) => e.category)).size,
};

export type WikiToken =
  | { type: "text"; value: string }
  | { type: "link"; slug: string; text: string; exists: boolean };

const LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function parseWikitext(text: string): WikiToken[] {
  const tokens: WikiToken[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    if (start > last) {
      tokens.push({ type: "text", value: text.slice(last, start) });
    }
    const slug = m[1].trim();
    const display = (m[2] ?? m[1]).trim();
    tokens.push({
      type: "link",
      slug,
      text: display,
      exists: hasPage(slug),
    });
    last = start + m[0].length;
  }
  if (last < text.length) {
    tokens.push({ type: "text", value: text.slice(last) });
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "link") continue;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    if (prev?.type === "text" && /\w$/.test(prev.value)) prev.value += " ";
    if (next?.type === "text" && /^\w/.test(next.value)) next.value = ` ${next.value}`;
  }
  return tokens;
}

export function stripWikitext(text: string): string {
  return parseWikitext(text)
    .map((t) => (t.type === "text" ? t.value : t.text))
    .join("");
}

export function flattenTemplateKeys() {
  const keys: { key: string; heading: string; mode: string; parent?: string }[] =
    [];
  for (const b of hubTemplate.blocks) {
    keys.push({ key: b.key, heading: b.heading, mode: b.mode });
    const children = "children" in b ? b.children : undefined;
    if (Array.isArray(children)) {
      for (const c of children) {
        keys.push({
          key: c.key,
          heading: c.heading,
          mode: c.mode,
          parent: b.key,
        });
      }
    }
  }
  return keys;
}

export function isProseReady(s: WikiSection): boolean {
  return (
    s.mode === "prose" &&
    s.status === "done" &&
    s.paragraphs.some((p) => p.trim().length > 0)
  );
}

export function sectionVisible(
  s: WikiSection,
  all: WikiSection[],
  opts: { hasReviews: boolean },
): boolean {
  if (s.mode === "code") {
    if (s.component === "reviews") return opts.hasReviews;
    if (s.component && s.component !== "none") return true;
    return all.some((c) => c.parentKey === s.key && isProseReady(c));
  }
  return isProseReady(s);
}

export function faqEntities(
  page: WikiPage,
): { q: string; a: string }[] {
  return page.sections
    .filter(
      (s) =>
        s.parentKey === "faqs" &&
        isProseReady(s) &&
        s.heading.trim().length > 0,
    )
    .map((s) => ({
      q: s.heading.trim(),
      a: s.paragraphs.join(" ").replace(/\s+/g, " ").trim(),
    }))
    .filter((x) => x.a.length > 0);
}
