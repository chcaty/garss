const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../docs');
const base = 'https://example.com/garss/';
const localFetch = async (url) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, new URL(url).pathname.replace('/garss/', '')), 'utf8')) });

test('reader loads a consistent published snapshot and resolves publisher names', async () => {
  const { loadCatalog } = await import('../docs/assets/reader/catalog.mjs');
  const catalog = await loadCatalog(localFetch, base);
  assert.ok(catalog.entries.length > 0);
  assert.ok(catalog.sources.length > 0);
  const article = catalog.entries[0];
  assert.equal(article.sourceTitle, catalog.sources.find((source) => source.id === article.source_id).title);
  assert.equal(catalog.sources.reduce((sum, source) => sum + source.count, 0), catalog.entries.length);
});

test('search, publisher filter, sort and pagination work together without mutating entries', async () => {
  const { loadCatalog, filterArticles, paginate } = await import('../docs/assets/reader/catalog.mjs');
  const { entries } = await loadCatalog(localFetch, base);
  const original = entries.map((entry) => entry.id);
  const source = entries[0].source_id;
  const filtered = filterArticles(entries, { source, query: entries[0].sourceTitle, order: 'oldest' });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((entry) => entry.source_id === source));
  assert.ok(filtered.every((entry, index) => !index || entry.timestamp >= filtered[index - 1].timestamp));
  assert.deepEqual(entries.map((entry) => entry.id), original);
  assert.equal(paginate(filtered, 999).page, Math.ceil(filtered.length / 30));
  assert.deepEqual(paginate([], -1), { items: [], page: 1, pages: 1 });
  assert.equal(filterArticles(entries, { query: 'impossible-query-1234567890' }).length, 0);
});

test('reader rejects mixed generations and propagates network failure for retry UI', async () => {
  const { loadCatalog } = await import('../docs/assets/reader/catalog.mjs');
  const mixedFetch = async (url) => {
    const response = await localFetch(url);
    const value = await response.json();
    if (url.endsWith('/articles.json')) value.generated_at = '2000-01-01T00:00:00Z';
    return { ok: true, json: async () => value };
  };
  await assert.rejects(loadCatalog(mixedFetch, base), /inconsistent/);
  await assert.rejects(loadCatalog(async () => ({ ok: false, status: 503 }), base), /503/);
});
