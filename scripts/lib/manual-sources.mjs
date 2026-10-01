import { canonicalFeedKey, candidateId } from "./reviews.mjs";
import { validateSourceProposal } from "../../docs/assets/review/source-proposal.mjs";
import { createHash } from "node:crypto";

export function planManualSources(sources, proposals, ledger = { schema_version: "1.0", proposals: {} }) {
  const next = structuredClone(sources);
  if (ledger.schema_version !== "1.0" || !ledger.proposals || typeof ledger.proposals !== "object") throw new TypeError("Invalid proposal ledger");
  const nextLedger = structuredClone(ledger);
  const urls = new Set(next.sources.map((source) => canonicalFeedKey(source.feed_url)));
  const ids = new Set(next.sources.map((source) => source.id));
  const names = new Set();
  let added = 0;
  for (const { name, payload } of proposals) {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(name) || names.has(name)) throw new TypeError("Invalid source proposal filename");
    names.add(name);
    const proposal = validateSourceProposal(payload);
    const digest = createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.keys(proposal).sort().map((key) => [key, proposal[key]])))).digest("hex");
    const processed = nextLedger.proposals[name];
    if (processed) {
      if (processed.digest !== digest) throw new TypeError("A processed proposal cannot be edited; create a new proposal");
      continue;
    }
    const key = canonicalFeedKey(proposal.feed_url);
    if (urls.has(key)) {
      const existing = next.sources.find((source) => canonicalFeedKey(source.feed_url) === key);
      nextLedger.proposals[name] = { digest, feed_url: proposal.feed_url, source_id: existing.id };
      continue;
    }
    const id = `M${candidateId(proposal.feed_url)}`;
    if (ids.has(id)) throw new TypeError("Manual source ID collision");
    next.sources.push({ id, display_id: id, title: proposal.title.trim(), description: proposal.description.trim(), feed_url: proposal.feed_url.trim(), category: proposal.category.trim(), icon: "" });
    urls.add(key); ids.add(id); added += 1;
    nextLedger.proposals[name] = { digest, feed_url: proposal.feed_url, source_id: id };
  }
  return { sources: next, added, ledger: nextLedger };
}
