import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { readFileSync } from "node:fs";

const SITE = process.env.SITE_URL ?? "https://unirepository.com";

const wikiDir = new URL("./src/data/wiki/", import.meta.url);
const redirects = JSON.parse(
  readFileSync(new URL("redirects.json", wikiDir), "utf-8"),
);
const aliasUrls = new Set(
  Object.keys(redirects).map((from) => `${SITE}/wiki/${from}/`),
);

export default defineConfig({
  site: SITE,
  trailingSlash: "always",
  integrations: [
    sitemap({
      filter: (page) =>
        !aliasUrls.has(page) &&
        !page.startsWith(`${SITE}/og/`) &&
        page !== `${SITE}/404/` &&
        page !== `${SITE}/500/` &&
        page !== `${SITE}/wiki/search/` &&
        page !== `${SITE}/sitemap.xml` &&
        page !== `${SITE}/sitemap.xml/`,
      serialize(item) {
        const u = item.url;
        if (u === `${SITE}/`) item.priority = 1.0;
        else if (u.includes("/wiki/category/")) item.priority = 0.6;
        else if (u === `${SITE}/wiki/a-z/`) item.priority = 0.55;
        else if (u.startsWith(`${SITE}/wiki/`)) item.priority = 0.8;
        else item.priority = 0.5;
        item.changefreq = "weekly";
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
