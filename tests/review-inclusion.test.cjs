const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
let planReviews, candidateId;
const now = '2026-10-01T10:00:00Z';
async function fixture() {
  ({ planReviews, candidateId } = await import('../scripts/lib/reviews.mjs'));
  const candidate = { id: candidateId('https://example.com/feed'), title: 'Example', description: 'A feed', feed_url: 'https://example.com/feed', site_url: '', categories: ['Technology'], language: 'en', packs: [], sources: ['test'], generated: false, review_required: true };
  const payload = (status = 'approved', timestamp = now) => ({ schema_url: 'https://example.com/schema', schema_version: '1.0', catalog_generated_at: now, exported_at: timestamp, decision_count: 1, decisions: [{ id: candidate.id, status, reviewed_at: timestamp, candidate: { ...candidate } }] });
  return { candidate, payload, sources: { schema_version: '1.0', sources: [{ id: 'B001', display_id: 'B001', title: 'Existing', description: '', feed_url: 'https://existing.com/rss', category: 'Tech', icon: '' }] }, catalog: { candidate_count: 1, candidates: [candidate] }, published: { schema_version: '1.0', decisions: {} } };
}
test('approved review adds one stable source, records repository status and removes candidate', async () => {
  const f = await fixture();
  const result = planReviews({ ...f, submissions: [{ name: 'batch.json', payload: f.payload() }] });
  assert.equal(result.added, 1);
  assert.equal(result.sources.sources[1].id, `E${f.candidate.id}`);
  assert.equal(result.catalog.candidate_count, 0);
  assert.equal(result.published.decisions[f.candidate.id].status, 'approved');
  const replay = planReviews({ sources: result.sources, catalog: result.catalog, published: result.published, submissions: [{ name: 'batch.json', payload: f.payload() }] });
  assert.equal(replay.added, 0); assert.equal(replay.recorded, 0);
  assert.equal(f.sources.sources.length, 1);
});
test('latest rejection prevents an older approval from being included', async () => {
  const f = await fixture();
  const result = planReviews({ ...f, submissions: [{ name: 'old.json', payload: f.payload() }, { name: 'new.json', payload: f.payload('rejected', '2026-10-01T11:00:00Z') }] });
  assert.equal(result.added, 0); assert.equal(result.sources.sources.length, 1);
  assert.equal(result.published.decisions[f.candidate.id].status, 'rejected');
  assert.equal(result.catalog.candidate_count, 1);
});
test('duplicate feed URLs preserve existing identity and rejection never deletes a formal source', async () => {
  const f = await fixture();
  f.sources.sources[0].feed_url = 'http://example.com/feed/';
  const result = planReviews({ ...f, submissions: [{ name: 'batch.json', payload: f.payload() }] });
  assert.equal(result.added, 0); assert.equal(result.published.decisions[f.candidate.id].source_id, 'B001');
  const rejected = planReviews({ sources: result.sources, catalog: result.catalog, published: result.published, submissions: [{ name: 'reject.json', payload: f.payload('rejected', '2026-10-01T11:00:00Z') }] });
  assert.equal(rejected.sources.sources.length, 1);
});
test('forged, expired and conflicting submissions fail without mutating inputs', async () => {
  const f = await fixture();
  const forged = f.payload(); forged.decisions[0].candidate.feed_url = 'https://evil.example/rss';
  assert.throws(() => planReviews({ ...f, submissions: [{ name: 'bad.json', payload: forged }] }), /identity mismatch/);
  assert.throws(() => planReviews({ ...f, catalog: { candidates: [] }, submissions: [{ name: 'old.json', payload: f.payload() }] }), /no longer/);
  assert.throws(() => planReviews({ ...f, submissions: [{ name: 'a.json', payload: f.payload() }, { name: 'b.json', payload: f.payload('rejected') }] }), /Conflicting/);
  assert.equal(f.sources.sources.length, 1); assert.deepEqual(f.published.decisions, {});
});
test('candidate URL identity agrees with the published Python catalog', async () => {
  await fixture();
  const { candidates } = JSON.parse(fs.readFileSync(new URL('../docs/api/v1/feed-candidates.json', `file://${__filename.replaceAll('\\', '/')}`), 'utf8'));
  for (const candidate of candidates) assert.equal(candidateId(candidate.feed_url), candidate.id, candidate.feed_url);
});

test('online submission includes only selected unpublished decisions and matches export schema', async () => {
  const f = await fixture();
  const { prepareSubmission } = await import('../docs/assets/review/online.mjs');
  const { validateReviewPayload } = await import('../docs/assets/review/validation.mjs');
  const state = { candidates: [f.candidate], candidateGeneratedAt: now, selectedIds: new Set(), decisions: { [f.candidate.id]: { status: 'approved', updated_at: now } }, publishedDecisions: {} };
  const result = prepareSubmission(state, 'https://example.com/schema', new Date(now));
  assert.equal(result.count, 1); assert.equal(result.upload, false);
  const url = new URL(result.url);
  assert.equal(url.origin, 'https://github.com');
  assert.ok(url.searchParams.get('filename').startsWith('reviews/'));
  assert.equal(validateReviewPayload(JSON.parse(url.searchParams.get('value'))).length, 1);
  state.selectedIds.add('another-id');
  assert.equal(prepareSubmission(state, 'https://example.com/schema'), null);
  state.selectedIds.clear(); state.publishedDecisions[f.candidate.id] = { status: 'approved', updated_at: now };
  assert.equal(prepareSubmission(state, 'https://example.com/schema'), null);
});

test('large submission uses downloadable JSON instead of an oversized edit URL', async () => {
  const f = await fixture();
  const { prepareSubmission } = await import('../docs/assets/review/online.mjs');
  f.candidate.description = '说明'.repeat(2000);
  const result = prepareSubmission({ candidates: [f.candidate], candidateGeneratedAt: now, selectedIds: new Set(), decisions: { [f.candidate.id]: { status: 'approved', updated_at: now } } }, 'https://example.com/schema');
  assert.equal(result.upload, true);
  assert.equal(result.url, 'https://github.com/chcaty/garss/upload/main/reviews');
  assert.equal(JSON.parse(result.content).decision_count, 1);
});

test('published decisions survive local undo and older local records cannot override them', async () => {
  const f = await fixture();
  const { effectiveDecision } = await import('../docs/assets/review/payload.mjs');
  const state = { decisions: { [f.candidate.id]: { status: 'approved', updated_at: '2026-10-01T09:00:00Z' } }, publishedDecisions: { [f.candidate.id]: { status: 'rejected', updated_at: now } } };
  assert.equal(effectiveDecision(state, f.candidate.id).status, 'rejected');
  state.decisions[f.candidate.id].updated_at = '2026-10-01T11:00:00Z';
  assert.equal(effectiveDecision(state, f.candidate.id).status, 'approved');
  delete state.decisions[f.candidate.id];
  assert.equal(effectiveDecision(state, f.candidate.id).status, 'rejected');
});

test('offset-equivalent timestamps cannot hide conflicting decisions', async () => {
  const f = await fixture();
  const equivalent = f.payload('rejected', '2026-10-01T12:00:00+02:00');
  assert.throws(() => planReviews({ ...f, submissions: [{ name: 'a.json', payload: f.payload() }, { name: 'b.json', payload: equivalent }] }), /Conflicting/);
  const accepted = planReviews({ ...f, submissions: [{ name: 'a.json', payload: f.payload() }] });
  assert.throws(() => planReviews({ sources: accepted.sources, catalog: accepted.catalog, published: accepted.published, submissions: [{ name: 'b.json', payload: equivalent }] }), /Conflicting/);
});

test('retired rejected candidates require fresh catalog review before approval', async () => {
  const f = await fixture();
  const rejected = planReviews({ ...f, submissions: [{ name: 'a.json', payload: f.payload('rejected') }] });
  assert.throws(() => planReviews({ sources: rejected.sources, catalog: { candidates: [] }, published: rejected.published, submissions: [{ name: 'b.json', payload: f.payload('approved', '2026-10-01T11:00:00Z') }] }), /fresh catalog/);
});
