export function buildReviewPayload({ state, ids, schemaUrl, now = new Date() }) {
  const allowed = ids ? new Set(ids) : null;
  const candidates = new Map(state.candidates.map((candidate) => [candidate.id, candidate]));
  const decisions = Object.entries(state.decisions)
    .filter(([id, decision]) => candidates.has(id) && (!allowed || allowed.has(id)) && ["approved", "rejected"].includes(decision.status))
    .map(([id, decision]) => {
      const { _search, ...candidate } = candidates.get(id);
      return { id, status: decision.status, reviewed_at: decision.updated_at, candidate };
    }).sort((a, b) => a.id.localeCompare(b.id));
  return { schema_url: schemaUrl, schema_version: "1.0", catalog_generated_at: state.candidateGeneratedAt,
    exported_at: now.toISOString(), decision_count: decisions.length, decisions };
}

export function effectiveDecision(state, id) {
  const local = state.decisions[id];
  const published = state.publishedDecisions?.[id];
  return !published || (local && Date.parse(local.updated_at) > Date.parse(published.updated_at)) ? local : published;
}

export function unpublishedIds(state) {
  const known = new Set(state.candidates.map((candidate) => candidate.id));
  return Object.keys(state.decisions).filter((id) => known.has(id)
    && ["approved", "rejected"].includes(state.decisions[id].status)
    && (!state.publishedDecisions?.[id] || Date.parse(state.decisions[id].updated_at) > Date.parse(state.publishedDecisions[id].updated_at)));
}
