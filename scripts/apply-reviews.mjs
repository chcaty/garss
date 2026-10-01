import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planReviews } from "./lib/reviews.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (filename) => JSON.parse(await fs.readFile(path.join(root, filename), "utf8"));
const names = (await fs.readdir(path.join(root, "reviews"))).filter((name) => name.endsWith(".json")).sort();
const submissions = await Promise.all(names.map(async (name) => ({ name, payload: await read(`reviews/${name}`) })));
const [sources, catalog, published] = await Promise.all([
  read("sources.json"), read("docs/api/v1/feed-candidates.json"), read("docs/api/v1/review-decisions.json"),
]);
const plan = planReviews({ sources, catalog, published, submissions });
const summary = `Review submissions: ${names.length}; decisions to record: ${plan.recorded}; feeds to add: ${plan.added}`;
console.log(summary);
const targetsIndex = process.argv.indexOf("--targets");
if (targetsIndex !== -1) {
  const existingIds = new Set(sources.sources.map((source) => source.id));
  const targets = plan.sources.sources.filter((source) => !existingIds.has(source.id)).map((source) => source.feed_url);
  const destination = path.resolve(root, process.argv[targetsIndex + 1]);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, `${JSON.stringify(targets, null, 2)}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (process.argv.includes("--apply")) {
  const updates = [["sources.json", plan.sources], ["docs/api/v1/feed-candidates.json", plan.catalog], ["docs/api/v1/review-decisions.json", plan.published]];
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
