const INDEXABLE = new Set(["unirepository.com", "www.unirepository.com"]);

function hostname(request) {
  try {
    const raw = request.headers.get("host") || new URL(request.url).hostname;
    return String(raw).split(":")[0].toLowerCase();
  } catch {
    return "";
  }
}

export async function onRequest(context) {
  const host = hostname(context.request);
  const allowed = INDEXABLE.has(host);
  const url = new URL(context.request.url);

  if (!allowed && url.pathname === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  const res = await context.next();
  if (allowed) return res;

  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
