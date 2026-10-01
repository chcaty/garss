const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test, before } = require("node:test");
let createReviewer;
let validateReviewPayload;

before(async () => {
  ({ createReviewer } = await import("../docs/assets/review/app.mjs"));
  ({ validateReviewPayload } = await import("../docs/assets/review/validation.mjs"));
});

const root = path.join(__dirname, "..");
const timestamp = "2026-09-30T00:00:00Z";
const candidate = {
  id: "0123456789abcdef0123", title: "Example", feed_url: "https://example.com/feed",
  site_url: "", description: "", language: "", categories: [], packs: [],
  sources: ["example"], generated: false, review_required: true,
};
const decision = { id: candidate.id, status: "approved", reviewed_at: timestamp, candidate };
const payload = (decisions) => ({
  schema_version: "1.0", schema_url: "https://example.com/schema.json",
  catalog_generated_at: timestamp, exported_at: timestamp,
  decision_count: decisions.length, decisions,
});

test("generated Ajv validator enforces the published schema contract", () => {
  const mutations = [
    (value) => delete value.schema_url,
    (value) => { value.schema_url = "not a URI"; },
    (value) => { value.extra = true; },
    (value) => { value.decisions[0].extra = true; },
    (value) => { value.decisions[0].candidate.sources = []; },
    (value) => { value.decisions[0].candidate.generated = "false"; },
    (value) => { value.decisions[0].reviewed_at = "2026-02-30T00:00:00Z"; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(payload([decision]));
    mutate(value);
    assert.throws(() => validateReviewPayload(value), TypeError);
  }
  assert.deepEqual(validateReviewPayload(payload([decision])), [decision]);
  const generated = fs.readFileSync(path.join(root, "docs/assets/review/contract.mjs"), "utf8");
  assert.doesNotMatch(generated, /new Function\(|\beval\(/);
});

function pageHarness(serviceWorker, stored = "{}") {
  const nodes = new Map();
  const requests = [];
  const writes = [];
  const makeNode = () => ({
    value: "", textContent: "", hidden: false,
    children: [], attributes: {}, listeners: {},
    classList: { toggle() {} },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute(name, value) { this.attributes[name] = value; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); }, remove() {}, click() {},
  });
  const byId = (id) => {
    if (!nodes.has(id)) nodes.set(id, makeNode());
    return nodes.get(id);
  };
  const context = {
    Intl, URL, Set, Map, Date, JSON, Blob,
    navigator: { onLine: true, ...(serviceWorker ? { serviceWorker } : {}) },
    localStorage: { getItem: () => stored, setItem: (key, value) => writes.push(value) },
    document: { getElementById: byId, createElement: makeNode, body: makeNode() },
    window: {
      addEventListener() {}, clearTimeout() {}, setTimeout() {},
      history: { replaceState() {} },
      location: { protocol: "https:", hostname: "example.com", hash: "", href: "https://example.com/garss/review.html" },
    },
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ candidates: [], generated_at: timestamp }) };
    },
  };
  const review = createReviewer(context);
  review.state.candidates = [{ ...candidate, _search: "example" }];
  return { review: { ...review, validateReviewPayload }, requests, writes, byId };
}

test("catalog loads even when service worker registration never resolves", async () => {
  const page = pageHarness({ register: () => new Promise(() => {}), addEventListener() {} });
  await page.review.start();
  assert.deepEqual(page.requests, ["./api/v1/meta.json", "./api/v1/feed-candidates.json", "./api/v1/review-decisions.json", "./api/v1/feed-health.json"]);
  assert.equal(page.byId("import-reviews").disabled, false);
  assert.equal(page.byId("export-reviews").disabled, false);
});

test("review tabs support keyboard navigation and a single tab stop", async () => {
  const page = pageHarness();
  const focused = [];
  page.byId("candidate-tab").focus = () => focused.push("candidate");
  page.byId("route-tab").focus = () => focused.push("route");
  page.review.state.routesLoaded = true;
  await page.review.start();
  let prevented = false;
  page.byId("candidate-tab").listeners.keydown({ key: "ArrowRight", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(page.byId("candidate-tab").attributes.tabindex, "-1");
  assert.equal(page.byId("route-tab").attributes.tabindex, "0");
  assert.equal(page.byId("candidate-panel").hidden, true);
  page.byId("route-tab").listeners.keydown({ key: "Home", preventDefault() {} });
  assert.equal(page.byId("candidate-tab").attributes.tabindex, "0");
  assert.deepEqual(focused, ["route", "candidate"]);
});

test("failed import leaves memory and local storage unchanged", async () => {
  const page = pageHarness();
  await page.review.importReviews({ size: 100, text: async () => JSON.stringify(payload([decision, null])) });
  assert.equal(Object.keys(page.review.state.decisions).length, 0);
  assert.equal(page.writes.length, 0);
  assert.match(page.byId("toast").textContent, /未导入任何记录/);
});

test("duplicate IDs, invalid timestamps and mismatched snapshots are rejected", () => {
  const page = pageHarness();
  const invalid = [
    [decision, decision],
    [{ ...decision, reviewed_at: "invalid" }],
    [{ ...decision, reviewed_at: "2026-02-30T00:00:00Z" }],
    [{ ...decision, candidate: { ...candidate, id: "aaaaaaaaaaaaaaaaaaaa" } }],
    [{ ...decision, candidate: { ...candidate, feed_url: "javascript:alert(1)" } }],
  ];
  for (const decisions of invalid) {
    assert.throws(() => page.review.validateReviewPayload(payload(decisions)));
  }
});

test("valid import writes one complete result and skips absent candidates", async () => {
  const page = pageHarness();
  const absent = {
    ...decision, id: "aaaaaaaaaaaaaaaaaaaa",
    candidate: { ...candidate, id: "aaaaaaaaaaaaaaaaaaaa" },
  };
  await page.review.importReviews({ size: 100, text: async () => JSON.stringify(payload([decision, absent])) });
  assert.equal(page.writes.length, 1);
  assert.equal(JSON.parse(page.writes[0])[candidate.id].status, "approved");
  assert.equal(Object.keys(page.review.state.decisions).length, 1);
});

test("responsive rows retain cell semantics and update selection highlighting", async () => {
  const page = pageHarness();
  await page.review.importReviews({ size: 100, text: async () => JSON.stringify(payload([decision])) });
  const row = page.byId("candidate-rows").children[0];
  assert.equal(row.attributes.role, "row");
  assert.equal(row.attributes["data-status"], "approved");
  assert.equal(row.children.length, 6);
  assert.ok(row.children.every((cell) => cell.attributes.role === "cell" && cell.attributes["data-label"]));
  const target = row.children[0].children[0];
  assert.equal(target.className, "checkbox-target");
  const checkbox = target.children[0];
  checkbox.checked = true;
  checkbox.listeners.change();
  assert.equal(row.attributes["data-selected"], "true");
  assert.equal(page.byId("approve-selected").disabled, false);
});

test("malformed local decisions are removed before use", () => {
  const stored = JSON.stringify({
    [candidate.id]: null,
    aaaaaaaaaaaaaaaaaaaa: { status: "approved", updated_at: "invalid" },
  });
  assert.equal(Object.keys(pageHarness(null, stored).review.state.decisions).length, 0);
});

function workerHarness({ fetch, cached = null, cacheFailure = false, setTimer = setTimeout } = {}) {
  const listeners = {};
  const deleted = [];
  const puts = [];
  const cache = {
    match: async () => cached && cached.clone(),
    put: async (request, response) => {
      if (cacheFailure) throw new Error("quota exceeded");
      puts.push(await response.text());
    },
  };
  const context = {
    URL, Response, AbortController, Set, Promise, encodeURIComponent,
    setTimeout: setTimer, clearTimeout,
    fetch: fetch || (async () => new Response("fresh")),
    caches: {
      open: async () => cache, match: cache.match,
      keys: async () => ["garss-review-%2Fgarss%2F-v1", "garss-review-%2Fother%2F-v1"],
      delete: async (key) => { deleted.push(key); },
    },
    self: {
      registration: { scope: "https://example.com/garss/" },
      location: { origin: "https://example.com" }, clients: { claim: async () => {} },
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "docs/service-worker.js"), "utf8"), context);
  function request(relativePath, mode = "cors") {
    let response;
    const tasks = [];
    listeners.fetch({
      request: { url: `https://example.com${relativePath}`, method: "GET", mode },
      respondWith: (promise) => { response = promise; },
      waitUntil: (promise) => tasks.push(promise),
    });
    return { response, tasks };
  }
  return { request, listeners, deleted, puts };
}

test("server errors and network failures fall back to cached catalog", async () => {
  for (const fetch of [
    async () => new Response("failed", { status: 503 }),
    async () => { throw new Error("offline"); },
  ]) {
    const worker = workerHarness({ fetch, cached: new Response("cached") });
    const response = await worker.request("/garss/api/v1/feed-candidates.json").response;
    assert.equal(await response.text(), "cached");
  }
});

test("slow catalog request is aborted and falls back to cache", async () => {
  const worker = workerHarness({
    cached: new Response("cached"),
    setTimer: (callback) => { queueMicrotask(callback); return undefined; },
    fetch: (request, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }),
  });
  const response = await worker.request("/garss/api/v1/feed-candidates.json").response;
  assert.equal(await response.text(), "cached");
});

test("cache write failure does not discard a successful network response", async () => {
  const worker = workerHarness({ cacheFailure: true });
  const response = await worker.request("/garss/api/v1/feed-candidates.json").response;
  assert.equal(await response.text(), "fresh");
});

test("asset refresh is kept alive after returning cached content", async () => {
  const worker = workerHarness({ cached: new Response("cached") });
  const event = worker.request("/garss/assets/review.js");
  assert.equal(await (await event.response).text(), "cached");
  assert.equal(event.tasks.length, 1);
  await Promise.all(event.tasks);
  assert.deepEqual(worker.puts, ["fresh"]);
});

test("worker ignores homepage and other projects and preserves their caches", async () => {
  const worker = workerHarness();
  assert.equal(worker.request("/garss/", "navigate").response, undefined);
  assert.equal(worker.request("/other/review.html", "navigate").response, undefined);
  let activated;
  worker.listeners.activate({ waitUntil: (promise) => { activated = promise; } });
  await activated;
  assert.deepEqual(worker.deleted, ["garss-review-%2Fgarss%2F-v1"]);
});

test("shell upgrade preserves catalogs from a legacy cache at the same URL", async () => {
  const sourceUrl = "https://example.com/garss/api/v1/rsshub-routes.json";
  const copied = new Map();
  const listeners = {};
  let skipped = false;
  const context = {
    URL, Response, Set, Promise, encodeURIComponent,
    caches: {
      keys: async () => ["garss-review-v1-20260930"],
      open: async (key) => key === "garss-review-v1-20260930" ? {
        match: async (url) => url === sourceUrl ? new Response("old routes") : undefined,
      } : {
        addAll: async () => {}, match: async (url) => copied.get(url),
        put: async (url, response) => copied.set(url, await response.text()),
      },
    },
    self: {
      registration: { scope: "https://example.com/garss/" },
      addEventListener: (name, callback) => { listeners[name] = callback; },
      skipWaiting: async () => { skipped = true; },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "docs/service-worker.js"), "utf8"), context);
  let installed;
  listeners.install({ waitUntil: (promise) => { installed = promise; } });
  await installed;
  assert.equal(copied.get(sourceUrl), "old routes");
  assert.equal(skipped, true);
});
