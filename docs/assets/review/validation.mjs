import { safeExternalUrl } from "./urls.mjs";
import validateContract from "./contract.mjs";

export function validTimestamp(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  return Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60 &&
    new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) === match[1];
}

export function validateReviewPayload(payload) {
  if (
    !validateContract(payload) ||
    payload.decision_count !== payload.decisions.length ||
    !validTimestamp(payload.exported_at) || !validTimestamp(payload.catalog_generated_at)
  ) throw new TypeError("invalid review export");

  const seenIds = new Set();
  for (const decision of payload.decisions) {
    if (seenIds.has(decision.id) || !validTimestamp(decision.reviewed_at)) {
      throw new TypeError("invalid or duplicate decision");
    }
    seenIds.add(decision.id);
    const candidate = decision.candidate;
    if (candidate.id !== decision.id || !safeExternalUrl(candidate.feed_url)) {
      throw new TypeError("invalid candidate snapshot");
    }
  }
  return payload.decisions;
}
