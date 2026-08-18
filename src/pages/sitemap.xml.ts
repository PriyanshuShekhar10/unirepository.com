import type { APIRoute } from "astro";
import { allPages, getCategories } from "@/lib/wiki";

const SITE = "https://unirepository.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function w3cDate(value: string | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return day;
}

function urlEntry(path: string, lastmod?: string | null, imagePath?: string) {
  const loc = `${SITE}${path.startsWith("/") ? path : `/${path}`}`;
  const lines = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (imagePath) {
    const imageLoc = imagePath.startsWith("http")
      ? imagePath
      : `${SITE}${imagePath.startsWith("/") ? imagePath : `/${imagePath}`}`;
    lines.push(`    <image:image>`);
    lines.push(`      <image:loc>${escapeXml(imageLoc)}</image:loc>`);
    lines.push(`    </image:image>`);
  }
  lines.push(`  </url>`);
  return lines.join("\n");
}

export const GET: APIRoute = () => {
  const pages = allPages().filter((p) => p.status === "complete");
  const categories = getCategories();
  const wikiLast = pages
    .map((p) => w3cDate(p.updated_at))
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
    urlEntry("/", wikiLast),
    urlEntry("/about/"),
    urlEntry("/methodology/"),
    urlEntry("/faq/"),
    urlEntry("/contact/"),
    urlEntry("/privacy/"),
    urlEntry("/terms/"),
    urlEntry("/wiki/a-z/", wikiLast),
    urlEntry("/wiki/comparisons/", wikiLast),
    ...categories.map((c) => urlEntry(`/wiki/category/${c.slug}/`, wikiLast)),
    ...pages.map((p) =>
      urlEntry(
        `/wiki/${p.slug}/`,
        w3cDate(p.updated_at),
        p.infobox?.photo,
      ),
    ),
    `</urlset>`,
    ``,
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
