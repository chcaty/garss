import { normalize } from "../shared/dom.mjs";
import { safeExternalUrl } from "../review/urls.mjs";

async function readJson(fetch, url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
  return response.json();
}

/** Resolve immutable files through one manifest so publication cannot mix generations. */
export async function loadCatalog(fetch, baseUrl) {
  const metaUrl = new URL("./api/v1/meta.json", baseUrl);
  const meta = await readJson(fetch, metaUrl.href);
  if (!meta.snapshot_endpoint) throw new TypeError("Snapshot manifest is missing");
  const manifestUrl = new URL(meta.snapshot_endpoint, metaUrl);
  const manifest = await readJson(fetch, manifestUrl.href);
  if (manifest.snapshot_id !== meta.snapshot_id) throw new TypeError("Snapshot ID mismatch");
  const [feeds, articles] = await Promise.all([
    readJson(fetch, new URL(manifest.feeds_endpoint, manifestUrl).href),
    readJson(fetch, new URL(manifest.articles_endpoint, manifestUrl).href),
  ]);
  if (!Array.isArray(feeds.feeds) || !Array.isArray(articles.articles)
      || feeds.generated_at !== manifest.generated_at || articles.generated_at !== manifest.generated_at
      || !Number.isFinite(Date.parse(manifest.generated_at))) {
    throw new TypeError("Invalid or inconsistent catalog");
  }
  const sourceById = new Map(feeds.feeds.map((feed) => [feed.id, feed]));
  const entries = articles.articles.filter((article) => safeExternalUrl(article.url)
    && typeof article.title === "string" && Number.isFinite(Date.parse(article.published_at)))
    .map((article) => ({ ...article, sourceTitle: sourceById.get(article.source_id)?.title || article.source_id,
      timestamp: Date.parse(article.published_at),
      search: normalize(`${article.title} ${sourceById.get(article.source_id)?.title || article.source_id}`),
    }));
  const counts = new Map();
  for (const article of entries) counts.set(article.source_id, (counts.get(article.source_id) || 0) + 1);
  const sources = feeds.feeds.map((source) => ({ ...source, count: counts.get(source.id) || 0 }));
  return { sources, entries, generatedAt: manifest.generated_at };
}

export function filterArticles(entries, { query = "", source = "", order = "newest" } = {}) {
  const keyword = normalize(query);
  return entries.filter((article) => (!source || article.source_id === source)
    && (!keyword || article.search.includes(keyword)))
    .sort((left, right) => order === "oldest" ? left.timestamp - right.timestamp : right.timestamp - left.timestamp);
}

export function paginate(items, page, size = 30) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(1, Math.min(page, pages));
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}
