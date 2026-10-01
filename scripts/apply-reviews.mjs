import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planReviews, canonicalFeedKey } from "./lib/reviews.mjs";
import { planManualSources } from "./lib/manual-sources.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (filename) => JSON.parse(await fs.readFile(path.join(root, filename), "utf8"));
const names = (await fs.readdir(path.join(root, "reviews"))).filter((name) => name.endsWith(".json")).sort();
const submissions = await Promise.all(names.map(async (name) => ({ name, payload: await read(`reviews/${name}`) })));
const [sources, catalog, published] = await Promise.all([
  read("sources.json"), read("docs/api/v1/feed-candidates.json"), read("docs/api/v1/review-decisions.json"),
]);
const plan = planReviews({ sources, catalog, published, submissions });
const proposalNames = (await fs.readdir(path.join(root, "source-proposals"))).filter((name) => name.endsWith(".json")).sort();
const proposals = await Promise.all(proposalNames.map(async (name) => ({ name, payload: await read(`source-proposals/${name}`) })));
const manual = planManualSources(plan.sources, proposals, await read("docs/api/v1/source-proposals.json"));
plan.sources = manual.sources;
const includedUrls = new Set(plan.sources.sources.map((source) => canonicalFeedKey(source.feed_url)));
plan.catalog.candidates = plan.catalog.candidates.filter((candidate) => !includedUrls.has(canonicalFeedKey(candidate.feed_url)));
plan.catalog.candidate_count = plan.catalog.candidates.length;
const summary = `Review submissions: ${names.length}; manual proposals: ${proposalNames.length}; decisions to record: ${plan.recorded}; feeds to add: ${plan.added + manual.added}`;
console.log(summary);
const targetsIndex = process.argv.indexOf("--targets");
if (targetsIndex !== -1) {
  const existingIds = new Set(sources.sources.map((source) => source.id));
  const publishedFeeds = await read("docs/api/v1/feeds.json");
  const previousUrls = new Map(publishedFeeds.feeds.map((feed) => [feed.id, feed.feed_url]));
  const targets = [...new Set(plan.sources.sources.filter((source) => new URL(source.feed_url).hostname !== "access.xtlmrmig.cc" &&
    (!existingIds.has(source.id) || previousUrls.get(source.id) !== source.feed_url)).map((source) => source.feed_url))];
  const destination = path.resolve(root, process.argv[targetsIndex + 1]);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(targets, null, 2)}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (process.argv.includes("--apply")) {
  const updates = [["sources.json", plan.sources], ["docs/api/v1/feed-candidates.json", plan.catalog], ["docs/api/v1/review-decisions.json", plan.published], ["docs/api/v1/source-proposals.json", manual.ledger]];
  for (const [filename, payload] of updates) {
    const destination = path.join(root, filename);
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    const previous = await fs.readFile(destination, "utf8");
    if (content.replaceAll("\r\n", "\n") === previous.replaceAll("\r\n", "\n")) continue;
    const temporary = `${destination}.review-tmp`;
    try { await fs.writeFile(temporary, content); await fs.rename(temporary, destination); }
    finally { await fs.rm(temporary, { force: true }); }
  }
} else if (!process.argv.includes("--check")) {
  throw new Error("Choose --check (no changes) or --apply");
}
