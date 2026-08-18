# UniRepository: GCU hub (current plan)

GCU only. Encyclopedia chrome from all-about-ukraine. Other schools, vs-articles, and GitHub Actions graph-growth stay in **Later**.

Conversion: organic traffic. Apply / Visit / Request Info = **outbound links to gcu.edu**, not forms on our site.

## Design

Port `/Users/priyanshu/Code/all-about-ukraine/web`: paper tokens, Base/Header/Footer/ThemeToggle/Wikitext, wiki `[slug].astro`, A–Z, Pagefind, about/faq/legal.

- Canvas `#e7e7e8`, ink `#24262a`, Georgia serif, `.ui` system-ui, radius 0, underlined `.doclink`s, 820px column, dark mode
- Header: original SVG “U”

Article: breadcrumb → H1 **Grand Canyon University (GCU)** + aliases → infobox (photo/seal + facts) → Contents → nested H2/H3 → sources

## Generate / validate (every prose H3)

Not one-shot. Not one call per H2. **One OpenAI call per H3**, then a **separate validate call**, **at least 3 rounds**.

1. Generate that `sectionKey` only (facts + already-written sibling H3s)
2. Validate vs fact JSON: `{ pass, inventedNumbers[], rewriteHints }`. Any number not in facts = fail
3. Repeat until 3 rounds done; keep last passing draft
4. If 3 fails, omit that H3

**Never AI:** infobox numbers, logo/photo, CTA hrefs, OSM map, comparison/stat tables, SVG charts.

`npm run grow` resumes at the next empty H3. `npm run grow -- --all` fills remaining pending sections.

## Data acquisition

GCU IPEDS **104717**. Every fact `{ value, source, asOf }`.

### Keys (`.env`, never commit)

- Have: `OPENAI_API_KEY`, `MONGODB_URI` (db `unirepository` on the refocus Atlas cluster), `DATA_GOV_API_KEY`
- Optional later: Reddit OAuth. **v1 Reddit uses OpenAI `web_search` only**

### Do not scrape

US News, Forbes, Niche, Princeton Review, gcu.edu at grow-time.

### Layer 1 — College Scorecard

`npm run seed:scorecard` → `GET https://api.data.gov/ed/collegescorecard/v1/schools?id=104717&api_key=...`

Name, city, ownership (for-profit as Scorecard reports), religion code, enrollment, admission rate, SAT/ACT, tuition, net price, room/board, completion, retention, 10-year median **earnings** (not employment rate), demographics, CIP program shares, student-faculty if present.

Same pull for peer ids (ASU, UArizona, Liberty, SNHU) for Compare/Similar **tables only** — no wiki hubs for those schools yet.

Private school: do not fake in-state vs out-of-state if Scorecard does not split them.

### Layer 2 — Wikidata + Commons

Founded (P571), coords (P625), site (P856), athletics/conference, P18 photo, P154 logo (CC/PD only → `public/media/grand-canyon-university/`), notable alumni. Acres only if a property exists.

### Layer 3 — HLC / DAPIP

Institutional accreditation (HLC since-year/status). Programmatic only if DAPIP or official.json has a URL.

### Layer 4 — `src/data/official/gcu.json`

Editorial, source URL + `retrieved_at` per field: CTA URLs, fee, deadlines, Common App, ED/EA, English tests, housing/dining, college list, degree levels, honors, CPT/OPT **links**. Missing field → omit that H3.

### Layer 5 — Map / climate / safety

OSM static map; cited Phoenix climate; link GCU Annual Security Report (do not scrape the PDF). The map is baked from OSM tiles (`npm run map:osm`) so the page does not hotlink a third-party static-map host.

### Layer 6 — Reddit (Reviews)

`npm run reddit:briefs` — Responses API `web_search` with `allowed_domains: ["reddit.com"]`. Keep `url_citation`s. **HEAD/GET** each link; keep only live `reddit.com/r/.../comments/...`. Store in `src/data/reddit/gcu.json`. Label **Sourced from Reddit**. No search tool = do not write Reviews.

### Layer 7 — Rankings

**No rank integers / Niche grades.** Outbound links to US News / Forbes / Niche profiles (URLs in official.json) + HLC facts on-page.

### Honest gaps (do not fake)

Employment rate; live NPC math; club/Greek/meal-plan lists unless official.json has them; political climate.

## 21 hub blocks

1. Hero — code (name, logo, photo, facts, CTAs)
2. Snapshot — known for, strengths, majors, size, mascot, division (prose around facts)
3. Rankings — HLC + outbound ranking links
4. Admissions — Scorecard rates/tests + official.json deadlines/fee/English
5. Cost — Scorecard money + NPC links
6. Programs — CIP + college list
7. Degree levels — official.json
8. Student life — demographics + official/Wikidata
9. Housing & dining — official.json + room/board $
10. Campus — city, OSM, climate, ASR link
11. Career — completion + median earnings; no fake employment %
12. Internships & research — official.json or omit
13. International — Scorecard share + official visa/CPT/OPT links (not legal advice)
14. Diversity — Scorecard demographics
15. Reviews — Reddit briefs only
16. Alumni — Wikidata or omit
17. Compare — Scorecard rows vs ASU, UArizona, Liberty, SNHU
18. Similar — Scorecard filter by rate/tuition/size
19. Statistics — Layer 1 table (code)
20. FAQs — one H3 per question; reuse fact keys; no FAQPage schema
21. CTA — same gcu.edu links as Hero

Spokes (`/tuition`, `/admissions`, …) after the hub H2 is ready. Canonical: hub for `gcu`; spoke for `gcu tuition`. Redirect `/wiki/gcu/` → hub.

Skip: portal, login, Halo, library, jobs, logo-download pages.

GCU landmines: IRS tax-exempt vs ED for-profit for Title IV; HLC is separate; Christian identity differs campus vs online.

## Stack

Astro static MPA, Tailwind v4, sitemap, astro-og-canvas, Pagefind. Mongo `schools`, `pages`, `jobs`, `reddit_briefs`. Export JSON then build (`npm run wiki:export`). JSON-LD: WebSite, Article, BreadcrumbList, CollegeOrUniversity + alternateName GCU; QAPage only if Reviews is real Q&A.

## Later

Other universities; full vs articles (both hubs must exist); GitHub Action multi-school queue.
