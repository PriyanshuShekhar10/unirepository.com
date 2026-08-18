import { OGImageRoute } from "astro-og-canvas";
import { wikiIndex, getCategories, displayTitle } from "@/lib/wiki";

const TAGLINE = "An encyclopedia of universities — starting with GCU.";

const pages: Record<string, { title: string; description: string }> = {
  index: { title: "UniRepository", description: TAGLINE },
  "wiki/a-z": { title: "A–Z Index", description: TAGLINE },
  about: { title: "About", description: TAGLINE },
  methodology: { title: "Methodology", description: TAGLINE },
  faq: { title: "FAQ", description: TAGLINE },
  contact: { title: "Contact", description: TAGLINE },
  privacy: { title: "Privacy Policy", description: TAGLINE },
  terms: { title: "Terms & Conditions", description: TAGLINE },
  "wiki/comparisons": { title: "University comparisons", description: TAGLINE },
  "404": { title: "Page not found", description: TAGLINE },
  "500": { title: "Server error", description: TAGLINE },
};
for (const c of getCategories()) {
  pages[`wiki/category/${c.slug}`] = { title: c.name, description: TAGLINE };
}
for (const e of wikiIndex) {
  pages[`wiki/${e.slug}`] = {
    title: displayTitle(e.title),
    description: TAGLINE,
  };
}

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[231, 231, 232]],
    border: { color: [36, 38, 42], width: 12, side: "block-end" },
    padding: 80,
    font: {
      title: { color: [36, 38, 42], size: 72, families: ["Georgia"] },
      description: { color: [84, 88, 96], size: 34, families: ["Georgia"] },
    },
  }),
});
