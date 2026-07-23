import { readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const contentDirectory = path.join(root, "content", "two-minute-execution");
const outputDirectory = path.join(root, "two-minute-execution");
const manifestPath = path.join(outputDirectory, "generated-pages.json");
const siteUrl = "https://bullardbusinessexecution.com";
const includeDrafts = process.argv.includes("--preview-drafts");

const requiredFields = [
  "title",
  "slug",
  "publishDate",
  "category",
  "summary",
  "relatedMessages",
  "status",
  "featured",
  "seoTitle",
  "seoDescription"
];
const categories = JSON.parse(await readFile(path.join(contentDirectory, "categories.json"), "utf8"));
if (!Array.isArray(categories) || categories.some((category) => typeof category !== "string" || !category.trim())) {
  throw new Error("categories.json must contain an array of category names");
}

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const escapeJsonForHtml = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");

const safeUrl = (value = "") => {
  if (!value) return "";
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`Unsupported media URL: ${value}`);
  return parsed.toString();
};

const markdownParagraphs = (value = "") => value
  .trim()
  .split(/\n\s*\n/)
  .filter(Boolean)
  .map((paragraph) => `<p>${escapeHtml(paragraph.replace(/\s*\n\s*/g, " "))}</p>`)
  .join("\n");

const parseEntry = (filename, source) => {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: expected JSON front matter between --- lines`);

  const metadata = JSON.parse(match[1]);
  for (const field of requiredFields) {
    if (!(field in metadata)) throw new Error(`${filename}: missing ${field}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug)) {
    throw new Error(`${filename}: slug must contain lowercase letters, numbers, and hyphens only`);
  }
  if (!["draft", "published"].includes(metadata.status)) {
    throw new Error(`${filename}: status must be draft or published`);
  }
  if (!Array.isArray(metadata.relatedMessages)) {
    throw new Error(`${filename}: relatedMessages must be an array`);
  }

  const sections = {};
  const sectionPattern = /^## (Thought|Question|Action)\s*\n([\s\S]*?)(?=^## |\s*$)/gm;
  for (const section of match[2].matchAll(sectionPattern)) sections[section[1].toLowerCase()] = section[2].trim();
  for (const section of ["thought", "question", "action"]) {
    if (!sections[section]) throw new Error(`${filename}: missing ${section} section`);
  }

  return {
    ...metadata,
    sourceType: metadata.sourceType || "",
    sourceTitle: metadata.sourceTitle || "",
    sourceAuthorOrOrganization: metadata.sourceAuthorOrOrganization || "",
    sourceNote: metadata.sourceNote || "",
    audioUrl: safeUrl(metadata.audioUrl || ""),
    videoUrl: safeUrl(metadata.videoUrl || ""),
    ...sections
  };
};

const files = (await readdir(contentDirectory)).filter((filename) => filename.endsWith(".md")).sort();
const entries = [];
for (const filename of files) {
  entries.push(parseEntry(filename, await readFile(path.join(contentDirectory, filename), "utf8")));
}

const slugs = new Set();
for (const entry of entries) {
  if (slugs.has(entry.slug)) throw new Error(`Duplicate slug: ${entry.slug}`);
  if (!categories.includes(entry.category)) throw new Error(`${entry.slug}: unknown category ${entry.category}`);
  slugs.add(entry.slug);
}

const published = entries
  .filter((entry) => entry.status === "published")
  .sort((a, b) => b.publishDate.localeCompare(a.publishDate));

const visibleEntries = (includeDrafts ? entries : published)
  .slice()
  .sort((a, b) => b.publishDate.localeCompare(a.publishDate));

const publicMessages = visibleEntries.map((entry) => ({
  title: entry.title,
  slug: entry.slug,
  publishDate: entry.publishDate,
  category: entry.category,
  summary: entry.summary,
  featured: Boolean(entry.featured),
  preview: includeDrafts && entry.status === "draft"
}));

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "messages.json"), `${JSON.stringify(publicMessages, null, 2)}\n`);
await writeFile(path.join(outputDirectory, "categories.json"), `${JSON.stringify(categories, null, 2)}\n`);

let previousGenerated = [];
try {
  previousGenerated = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  previousGenerated = [];
}

const publishedSlugs = new Set(visibleEntries.map((entry) => entry.slug));
for (const staleSlug of previousGenerated) {
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(staleSlug) && !publishedSlugs.has(staleSlug)) {
    await rm(path.join(outputDirectory, staleSlug), { recursive: true, force: true });
  }
}

const formatDate = (value) => new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
}).format(new Date(`${value}T12:00:00Z`));

const relatedEntries = (entry) => {
  const manuallySelected = entry.relatedMessages
    .map((slug) => visibleEntries.find((candidate) => candidate.slug === slug))
    .filter(Boolean);

  const sameCategory = visibleEntries.filter((candidate) => (
    candidate.slug !== entry.slug &&
    candidate.category === entry.category &&
    !manuallySelected.some((selected) => selected.slug === candidate.slug)
  ));

  const entryWords = new Set(`${entry.title} ${entry.summary}`.toLowerCase().match(/[a-z]{5,}/g) || []);
  const keywordMatches = visibleEntries
    .filter((candidate) => candidate.slug !== entry.slug)
    .map((candidate) => {
      const candidateWords = `${candidate.title} ${candidate.summary}`.toLowerCase().match(/[a-z]{5,}/g) || [];
      return { candidate, score: candidateWords.filter((word) => entryWords.has(word)).length };
    })
    .filter(({ score, candidate }) => (
      score > 0 &&
      !manuallySelected.some((selected) => selected.slug === candidate.slug) &&
      !sameCategory.some((selected) => selected.slug === candidate.slug)
    ))
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }) => candidate);

  return [...manuallySelected, ...sameCategory, ...keywordMatches].slice(0, 3);
};

const card = (entry) => `
          <article class="message-card">
            <div class="message-meta">
              <span>${escapeHtml(entry.category)}</span>
              <time datetime="${escapeHtml(entry.publishDate)}">${escapeHtml(formatDate(entry.publishDate))}</time>
            </div>
            <h3>${escapeHtml(entry.title)}</h3>
            <p>${escapeHtml(entry.summary)}</p>
            <a class="text-link" href="/two-minute-execution/${encodeURIComponent(entry.slug)}/">Read the message</a>
          </article>`;

const sourceMarkup = (entry) => {
  if (!entry.sourceNote && !entry.sourceTitle && !entry.sourceAuthorOrOrganization) return "";
  const details = [entry.sourceTitle, entry.sourceAuthorOrOrganization].filter(Boolean).join(" — ");
  return `
        <aside class="source-note">
          <strong>Source note</strong>
          ${entry.sourceNote ? `<p>${escapeHtml(entry.sourceNote)}</p>` : ""}
          ${details ? `<p>${escapeHtml(details)}</p>` : ""}
        </aside>`;
};

const mediaMarkup = (entry) => {
  const audio = entry.audioUrl ? `
          <div>
            <strong>Listen</strong>
            <audio class="audio-player" controls preload="metadata" src="${escapeHtml(entry.audioUrl)}"></audio>
          </div>` : "";
  const video = entry.videoUrl ? `
          <div>
            <strong>Watch</strong>
            <iframe class="video-frame" title="${escapeHtml(entry.title)} video" src="${escapeHtml(entry.videoUrl)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
          </div>` : "";
  if (!audio && !video) return "";
  return `<section class="media-panel" aria-label="Message media">${audio}${video}</section>`;
};

const navScript = `
  <script>
    const menuToggle = document.querySelector(".menu-toggle");
    const mobileMenu = document.querySelector("#mobile-menu");
    if (menuToggle && mobileMenu) {
      const closeMenu = () => {
        menuToggle.setAttribute("aria-expanded", "false");
        mobileMenu.classList.remove("is-open");
        mobileMenu.hidden = true;
      };
      menuToggle.addEventListener("click", () => {
        const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
        menuToggle.setAttribute("aria-expanded", String(!isOpen));
        mobileMenu.hidden = isOpen;
        mobileMenu.classList.toggle("is-open", !isOpen);
      });
      mobileMenu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
      window.addEventListener("resize", () => {
        if (window.matchMedia("(min-width: 1101px)").matches) closeMenu();
      });
    }
  </script>`;

const renderPage = (entry, chronologicalIndex) => {
  const chronological = [...visibleEntries].sort((a, b) => a.publishDate.localeCompare(b.publishDate));
  const currentIndex = chronological.findIndex((candidate) => candidate.slug === entry.slug);
  const previous = chronological[currentIndex - 1];
  const next = chronological[currentIndex + 1];
  const related = relatedEntries(entry);
  const canonical = `${siteUrl}/two-minute-execution/${entry.slug}/`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.title,
    description: entry.summary,
    datePublished: entry.publishDate,
    author: { "@type": "Person", name: "Kevin Bullard" },
    publisher: { "@type": "Organization", name: "Bullard Business Execution", url: siteUrl },
    mainEntityOfPage: canonical
  };

  const previousNext = previous || next ? `
        <nav class="message-nav" aria-label="Previous and next messages">
          ${previous ? `<a href="/two-minute-execution/${encodeURIComponent(previous.slug)}/"><small>Previous message</small>${escapeHtml(previous.title)}</a>` : "<span></span>"}
          ${next ? `<a href="/two-minute-execution/${encodeURIComponent(next.slug)}/"><small>Next message</small>${escapeHtml(next.title)}</a>` : "<span></span>"}
        </nav>` : "";

  const relatedMarkup = related.length ? `
    <section class="related section-pad" aria-labelledby="related-title">
      <div class="shell">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Keep going</span>
            <h2 id="related-title">Related messages</h2>
          </div>
          <a class="text-link" href="/two-minute-execution#archive">Browse the library</a>
        </div>
        <div class="message-grid">
${related.map(card).join("\n")}
        </div>
      </div>
    </section>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(entry.seoDescription)}">
  ${includeDrafts && entry.status === "draft" ? '<meta name="robots" content="noindex, nofollow">' : ""}
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(entry.seoTitle)}">
  <meta property="og:description" content="${escapeHtml(entry.seoDescription)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="article:published_time" content="${escapeHtml(entry.publishDate)}">
  <meta property="article:section" content="${escapeHtml(entry.category)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(entry.seoTitle)}">
  <meta name="twitter:description" content="${escapeHtml(entry.seoDescription)}">
  <title>${escapeHtml(entry.seoTitle)}</title>
  <link rel="stylesheet" href="../styles.css">
  <script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>
</head>
<body>
  <nav class="nav" aria-label="Primary navigation">
    <div class="shell nav-inner">
      <a class="brand" href="/" aria-label="Bullard Business Execution home">
        <img class="brand-logo" src="/assets/bbe-logo.png" alt="" aria-hidden="true">
        <span>Bullard<br>Business Execution</span>
      </a>
      <ul class="nav-links">
        <li><a href="/">Business</a></li>
        <li><a href="/municipal">Municipalities</a></li>
        <li><a href="/two-minute-execution" aria-current="page">Two-Minute Execution</a></li>
        <li><a href="/#problem">Problem + Results</a></li>
        <li><a href="/#experience">About</a></li>
        <li><a href="/speaking.html">Speaking</a></li>
      </ul>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu">
        <span class="menu-icon" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>Menu</span>
      </button>
    </div>
    <div class="mobile-menu" id="mobile-menu" hidden>
      <div class="mobile-menu-inner">
        <a href="/">Business</a>
        <a href="/municipal">Municipalities</a>
        <a href="/two-minute-execution" aria-current="page">Two-Minute Execution</a>
        <a href="/#problem">Problem + Results</a>
        <a href="/#experience">About</a>
        <a href="/speaking.html">Speaking</a>
      </div>
    </div>
  </nav>

  <header class="message-hero">
    <div class="shell">
      <a class="back-link" href="/two-minute-execution#archive">Back to Two-Minute Execution</a>
      <span class="eyebrow">${includeDrafts && entry.status === "draft" ? "Draft preview · " : ""}${escapeHtml(entry.category)} · ${escapeHtml(formatDate(entry.publishDate))}</span>
      <h1>${escapeHtml(entry.title)}</h1>
      <p>${escapeHtml(entry.summary)}</p>
    </div>
  </header>

  <main>
    <article class="section-pad">
      <div class="shell message-body">
        <div class="tqa-stack">
          <section class="tqa-block thought" aria-labelledby="thought-title">
            <h2 id="thought-title">Thought</h2>
            ${markdownParagraphs(entry.thought)}
          </section>
          <section class="tqa-block question" aria-labelledby="question-title">
            <h2 id="question-title">Question</h2>
            ${markdownParagraphs(entry.question)}
          </section>
          <section class="tqa-block action" aria-labelledby="action-title">
            <h2 id="action-title">Action</h2>
            ${markdownParagraphs(entry.action)}
          </section>
        </div>
${sourceMarkup(entry)}
${mediaMarkup(entry)}
${previousNext}
      </div>
    </article>
${relatedMarkup}
    <section class="section-pad">
      <div class="shell">
        <div class="soft-cta">
          <div>
            <h2>Put the next message to work.</h2>
            <p>Get two short leadership and execution insights each week, or talk with Bullard Business Execution about the patterns keeping work from moving.</p>
          </div>
          <div>
            <a class="button accent" href="/two-minute-execution#signup">Get Two-Minute Execution</a>
            <a class="button" href="https://meet.bullardbusinessexecution.com/execution-diagnosis">Book a Diagnosis Call</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="shell footer-inner">
      <span class="brand">
        <img class="brand-logo" src="/assets/bbe-logo.png" alt="" aria-hidden="true">
        <span>Bullard Business Execution</span>
      </span>
      <div class="footer-links" aria-label="Footer navigation">
        <a href="/">Business</a>
        <a href="/municipal">Municipalities</a>
        <a href="/two-minute-execution">Two-Minute Execution</a>
        <a href="/#problem">Problem + Results</a>
        <a href="/#experience">About</a>
        <a href="/speaking.html">Speaking</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
      </div>
      <p class="footer-rights">&copy;2026 All Rights Reserved. Bullard Business Execution.</p>
    </div>
  </footer>
${navScript}
</body>
</html>
`;
};

const chronological = [...visibleEntries].sort((a, b) => a.publishDate.localeCompare(b.publishDate));
for (const entry of visibleEntries) {
  const messageDirectory = path.join(outputDirectory, entry.slug);
  await mkdir(messageDirectory, { recursive: true });
  await writeFile(path.join(messageDirectory, "index.html"), renderPage(entry, chronological.indexOf(entry)));
}

await writeFile(manifestPath, `${JSON.stringify(visibleEntries.map((entry) => entry.slug), null, 2)}\n`);

const sitemapRoutes = [
  "/",
  "/municipal",
  "/two-minute-execution",
  "/speaking.html",
  "/client-stories.html",
  "/privacy.html",
  "/terms.html",
  ...visibleEntries.map((entry) => `/two-minute-execution/${entry.slug}/`)
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapRoutes.map((route) => `  <url><loc>${siteUrl}${route}</loc></url>`).join("\n")}
</urlset>
`;

await writeFile(path.join(root, "sitemap.xml"), sitemap);

console.log(includeDrafts
  ? `Built a local preview with ${entries.length} draft and published messages. Run without --preview-drafts before committing.`
  : `Built Two-Minute Execution with ${published.length} published and ${entries.length - published.length} draft messages.`);
