import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const dateInCentralTime = (date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const currentPublishDate = process.env.TME_BUILD_DATE || dateInCentralTime(new Date());

const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const exists = async (relativePath) => {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
};

const publicPages = [
  "index.html",
  "municipal/index.html",
  "speaking.html",
  "client-stories.html",
  "two-minute-execution/index.html"
];

for (const page of publicPages) {
  const html = await read(page);
  const primaryNavigation = html.match(/<nav class="nav"[\s\S]*?<\/nav>/)?.[0] || "";
  check(!primaryNavigation.includes('href="/two-minute-execution"'), `${page}: Two-Minute Execution should be hidden from primary navigation`);
  check(html.includes("Problem + Results"), `${page}: Problem + Results label changed or missing`);
  check(html.includes(">About<"), `${page}: About label changed or missing`);
  check(html.includes('aria-label="Primary navigation"'), `${page}: primary navigation label missing`);
  check(html.includes('aria-controls="mobile-menu"'), `${page}: mobile menu control missing`);
}

const archiveHtml = await read("two-minute-execution/index.html");
check(archiveHtml.includes('id="message-search"'), "Archive: search control missing");
check(archiveHtml.includes('id="category-filter"'), "Archive: category filter missing");
check(archiveHtml.includes('id="archive-empty"'), "Archive: empty state missing");
check(archiveHtml.includes("https://form.jotform.com/261679188283068"), "Archive: existing signup form missing");

const contentDirectory = path.join(root, "content", "two-minute-execution");
const draftFiles = (await readdir(contentDirectory)).filter((filename) => filename.endsWith(".md"));
check(draftFiles.length === 6, `Expected 6 sample drafts, found ${draftFiles.length}`);

const draftSlugs = [];
for (const filename of draftFiles) {
  const source = await readFile(path.join(contentDirectory, filename), "utf8");
  check(source.includes('"status": "draft"'), `${filename}: sample is not marked draft`);
  const slug = source.match(/"slug":\s*"([^"]+)"/)?.[1];
  if (slug) draftSlugs.push(slug);
}

const publicMessages = JSON.parse(await read("two-minute-execution/messages.json"));
check(Array.isArray(publicMessages), "messages.json must contain an array");
const publicSlugs = new Set(publicMessages.map((message) => message.slug));
for (const slug of draftSlugs) {
  check(!publicSlugs.has(slug), `Draft sample leaked into messages.json (${slug})`);
}
for (const message of publicMessages) {
  check(message.publishDate <= currentPublishDate, `Future message leaked into production (${message.slug})`);
}
const categories = JSON.parse(await read("two-minute-execution/categories.json"));
check(Array.isArray(categories), "categories.json must contain an array");
check(categories.length === 9, `Expected 9 initial categories, found ${categories.length}`);

const sitemap = await read("sitemap.xml");
check(sitemap.includes(`${"https://bullardbusinessexecution.com"}/two-minute-execution`), "Sitemap: archive route missing");
for (const slug of draftSlugs) {
  check(!sitemap.includes(slug), `Sitemap: draft slug leaked (${slug})`);
  check(!(await exists(`two-minute-execution/${slug}/index.html`)), `Draft page was generated (${slug})`);
}

const localReferences = [];
for (const page of publicPages) {
  const html = await read(page);
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const reference = match[1];
    if (
      reference.startsWith("#") ||
      reference.startsWith("mailto:") ||
      reference.startsWith("tel:") ||
      /^[a-z][a-z0-9+.-]*:/i.test(reference)
    ) continue;
    localReferences.push({ page, reference });
  }
}

for (const { page, reference } of localReferences) {
  const clean = reference.split("#")[0].split("?")[0];
  if (!clean || clean === "/") continue;
  let target;
  if (clean.startsWith("/")) {
    const relative = clean.slice(1);
    target = path.extname(relative) ? relative : `${relative.replace(/\/$/, "")}/index.html`;
  } else {
    const relative = path.normalize(path.join(path.dirname(page), clean));
    target = path.extname(relative) ? relative : `${relative.replace(/\/$/, "")}/index.html`;
  }
  check(await exists(target), `${page}: broken local reference ${reference} -> ${target}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${publicPages.length} public pages, ${draftFiles.length} hidden drafts, and ${localReferences.length} local references.`);
