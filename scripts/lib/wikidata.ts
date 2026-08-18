import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const UA =
  "UniRepository/0.1 (encyclopedia; +https://unirepository.com; contact@unirepository.com)";

type Wd = {
  qid: string | null;
  foundedYear: number | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  imageTitle: string | null;
  logoTitle: string | null;
};

export async function fetchWikidataByUnitid(unitid: number): Promise<Wd> {
  const empty: Wd = {
    qid: null,
    foundedYear: null,
    latitude: null,
    longitude: null,
    website: null,
    imageTitle: null,
    logoTitle: null,
  };
  const query = `SELECT ?item ?inception ?coord ?website ?image ?logo WHERE {
  ?item wdt:P1771 "${unitid}" .
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P154 ?logo }
} LIMIT 1`;
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  const res = await fetch(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA } });
  if (!res.ok) return empty;
  const json = (await res.json()) as {
    results?: { bindings?: Record<string, { value?: string }>[] };
  };
  const row = json.results?.bindings?.[0];
  if (!row) return empty;
  const item = row.item?.value ?? "";
  const qid = item.split("/").pop() || null;
  let foundedYear: number | null = null;
  if (row.inception?.value) {
    const y = Number(row.inception.value.slice(0, 4));
    if (Number.isFinite(y)) foundedYear = y;
  }
  let latitude: number | null = null;
  let longitude: number | null = null;
  const coord = row.coord?.value ?? "";
  const m = coord.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
  if (m) {
    longitude = Number(m[1]);
    latitude = Number(m[2]);
  }
  const fileFromUri = (v?: string) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v.split("/").pop() ?? "") || null;
    } catch {
      return null;
    }
  };
  return {
    qid,
    foundedYear,
    latitude,
    longitude,
    website: row.website?.value ?? null,
    imageTitle: fileFromUri(row.image?.value),
    logoTitle: fileFromUri(row.logo?.value),
  };
}

const FREE = /cc[ -]?by|cc0|public domain|pd-|cc-zero/i;

export async function downloadCommonsFile(
  title: string,
  destPath: string,
): Promise<{ url: string; license: string; artist: string } | null> {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("titles", title.startsWith("File:") ? title : `File:${title}`);
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url|extmetadata|mime");
  api.searchParams.set("format", "json");
  const res = await fetch(api, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: Array<{
            url?: string;
            mime?: string;
            extmetadata?: Record<string, { value?: string }>;
          }>;
        }
      >;
    };
  };
  const page = Object.values(json.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;
  const license = String(info.extmetadata?.LicenseShortName?.value ?? info.extmetadata?.License?.value ?? "");
  if (license && !FREE.test(license) && !/public domain/i.test(license)) {
    console.log(`  skip Commons ${title} (license ${license})`);
    return null;
  }
  const img = await fetch(info.url, { headers: { "User-Agent": UA } });
  if (!img.ok) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, buf);
  const artist = String(info.extmetadata?.Artist?.value ?? "Wikimedia Commons")
    .replace(/<[^>]+>/g, "")
    .trim();
  return { url: destPath, license: license || "see Commons", artist };
}

export function publicMediaPath(slug: string, file: string) {
  return resolve(process.cwd(), "public/media", slug, file);
}
