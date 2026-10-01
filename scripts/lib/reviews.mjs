import { createHash } from "node:crypto";
import { validateReviewPayload } from "../../docs/assets/review/validation.mjs";

export function canonicalFeedKey(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new TypeError("Unsupported feed URL");
  const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  return `//${url.host.toLowerCase()}${path}${url.search}`;
}

export function candidateId(url) {
  return createHash("sha256").update(canonicalFeedKey(url)).digest("hex").slice(0, 20);
}

/** Compute the complete change first; invalid input never partially updates a catalog. */
export function planReviews({ sources, catalog, published, submissions }) {
  if (sources.schema_version !== "1.0" || !Array.isArray(sources.sources)
      || published.schema_version !== "1.0" || !published.decisions
      || !Array.isArray(catalog.candidates)) throw new TypeError("Invalid source or review catalog");
  const nextSources = structuredClone(sources);
  const nextPublished = structuredClone(published);
  const known = new Map(catalog.candidates.map((candidate) => [candidate.id, candidate]));
  const sourceByUrl = new Map(nextSources.sources.map((source) => [canonicalFeedKey(source.feed_url), source]));
  const ids = new Set(nextSources.sources.map((source) => source.id));
  const events = [];
  const files = new Set();
  for (const { name, payload } of submissions) {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(name) || files.has(name)) throw new TypeError("Invalid submission filename");
    files.add(name);
    for (const decision of validateReviewPayload(payload)) {
      if (Date.parse(decision.reviewed_at) > Date.parse(payload.exported_at)) throw new TypeError(`Review timestamp exceeds export time: ${decision.id}`);
      if (candidateId(decision.candidate.feed_url) !== decision.id) throw new TypeError(`Candidate URL identity mismatch: ${decision.id}`);
      const current = known.get(decision.id);
      const previous = nextPublished.decisions[decision.id];
      // Retired entries are acceptable only if the repository already has that exact decision.
      if (!current && (!previous || previous.feed_url !== decision.candidate.feed_url)) {
        throw new TypeError(`Candidate is no longer in the catalog: ${decision.id}`);
      }
      if (!current && previous && !sourceByUrl.has(canonicalFeedKey(decision.candidate.feed_url))
          && Date.parse(decision.reviewed_at) > Date.parse(previous.updated_at)) {
        throw new TypeError(`Retired candidate requires a fresh catalog review: ${decision.id}`);
      }
      if (current && current.feed_url !== decision.candidate.feed_url) throw new TypeError(`Candidate snapshot URL changed: ${decision.id}`);
      events.push({ ...decision, candidate: current || decision.candidate, name });
    }
  }
  events.sort((a, b) => Date.parse(a.reviewed_at) - Date.parse(b.reviewed_at) || a.name.localeCompare(b.name));
  let added = 0;
  let recorded = 0;
  const latest = new Map();
  for (const decision of events) {
    const existing = latest.get(decision.id);
    if (existing && Date.parse(existing.reviewed_at) === Date.parse(decision.reviewed_at) && existing.status !== decision.status) {
      throw new TypeError(`Conflicting decisions at the same timestamp: ${decision.id}`);
    }
    latest.set(decision.id, decision);
  }
  for (const decision of latest.values()) {
    const prior = nextPublished.decisions[decision.id];
    if (prior && Date.parse(prior.updated_at) > Date.parse(decision.reviewed_at)) continue;
    if (prior && Date.parse(prior.updated_at) === Date.parse(decision.reviewed_at)) {
      if (prior.status !== decision.status) throw new TypeError(`Conflicting decisions at the same timestamp: ${decision.id}`);
      continue;
    }
    const key = canonicalFeedKey(decision.candidate.feed_url);
    let source = sourceByUrl.get(key);
    if (decision.status === "approved" && !source) {
      const id = `E${decision.id}`;
      if (ids.has(id)) throw new TypeError(`Source ID collision: ${id}`);
      const title = decision.candidate.title.trim();
      if (!title) throw new TypeError(`Source title is empty: ${decision.id}`);
      source = { id, display_id: id, title, description: decision.candidate.description,
        feed_url: decision.candidate.feed_url, category: decision.candidate.categories.find((value) => value.trim()) || "外部订阅", icon: "" };
      nextSources.sources.push(source);
      sourceByUrl.set(key, source); ids.add(id); added += 1;
    }
    // Rejecting a candidate records its review; it never silently deletes a formal source.
    nextPublished.decisions[decision.id] = { status: decision.status, updated_at: decision.reviewed_at,
      feed_url: decision.candidate.feed_url, submission: decision.name, source_id: source?.id || "" };
    recorded += 1;
  }
  const nextCatalog = { ...catalog, candidates: catalog.candidates.filter((candidate) => !sourceByUrl.has(canonicalFeedKey(candidate.feed_url))) };
  nextCatalog.candidate_count = nextCatalog.candidates.length;
  return { sources: nextSources, published: nextPublished, catalog: nextCatalog, added, recorded };
}
