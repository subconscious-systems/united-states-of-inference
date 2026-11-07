// Regenerates the crawler-facing files from data.js + logos/manifest.json:
//   - the static State → Provider list inside index.html (readable without JS)
//   - the JSON-LD block in index.html
//   - llms.txt and sitemap.xml
// Run after changing any assignment or provider:  node scripts/build-meta.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://subconscious-systems.github.io/united-states-of-inference/";
const TITLE = "The United States of Inference";
const DESCRIPTION =
  "There are so many inference providers. How do you tell them apart? A map that gives each of 50 AI inference providers the US state it is most like (not where it is based), with what makes each one different.";

const { ASSIGNMENTS } = await import(join(root, "data.js"));
const manifest = JSON.parse(readFileSync(join(root, "logos/manifest.json"), "utf8"));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const rows = Object.keys(ASSIGNMENTS)
  .sort()
  .map((state) => {
    const [pid, provider, why] = ASSIGNMENTS[state];
    const p = manifest[pid] || {};
    return { state, provider, why, url: p.url || "", tagline: p.tagline || "", facts: p.facts || [] };
  });

/* ---------- index.html: static list + JSON-LD ---------- */

const listHTML = rows
  .map(
    (r) => `        <li class="row"><a href="#${slug(r.state)}"><strong>${esc(r.state)}</strong> → ${esc(r.provider)}</a>: ${esc(r.why)}${
      r.tagline ? ` ${esc(r.tagline)}.` : ""
    }</li>`
  )
  .join("\n");

const jsonld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}#website`,
      url: SITE,
      name: TITLE,
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": "https://subconscious.dev/#org" },
    },
    {
      "@type": "Article",
      "@id": `${SITE}#article`,
      url: SITE,
      headline: TITLE,
      description: DESCRIPTION,
      image: { "@type": "ImageObject", url: `${SITE}og.png?v=2`, width: 1200, height: 630 },
      datePublished: "2026-11-06",
      author: { "@id": "https://subconscious.dev/#org" },
      publisher: { "@id": "https://subconscious.dev/#org" },
      isPartOf: { "@id": `${SITE}#website` },
      mainEntity: { "@id": `${SITE}#providers` },
    },
    {
      "@type": "Organization",
      "@id": "https://subconscious.dev/#org",
      name: "Subconscious",
      url: "https://subconscious.dev",
    },
    {
      "@type": "ItemList",
      "@id": `${SITE}#providers`,
      name: "AI inference providers by US state",
      numberOfItems: rows.length,
      itemListElement: rows.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE}#${slug(r.state)}`,
        item: {
          "@type": "Organization",
          name: r.provider,
          ...(r.url ? { url: r.url } : {}),
          description: [r.tagline, ...r.facts].filter(Boolean).join(". "),
          areaServed: r.state,
        },
        name: `${r.state}: ${r.provider}`,
        description: r.why,
      })),
    },
  ],
};

const between = (src, tag, body) => {
  const re = new RegExp(`(<!-- ${tag}:start -->)[\\s\\S]*?(\\s*<!-- ${tag}:end -->)`);
  if (!re.test(src)) throw new Error(`missing ${tag} markers in index.html`);
  // a function replacer, so "$" in the copy (prices like $20B) is never read as a pattern
  return src.replace(re, (_, start, end) => `${start}\n${body}${end}`);
};

let html = readFileSync(join(root, "index.html"), "utf8");
html = between(html, "prerender", listHTML);
html = between(html, "jsonld", `  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>`);
writeFileSync(join(root, "index.html"), html);

/* ---------- llms.txt ---------- */

const llms = `# ${TITLE}

> ${DESCRIPTION}

Made by Subconscious (https://subconscious.dev). Each state is matched to one AI inference provider, with a one-line reason and the things that set that provider apart. The match is about character, not location: a provider gets the state it is most like (its ethos, what it is known for, what it does), not the state where it is headquartered. Link to a state with ${SITE}#<state-name>, for example ${SITE}#texas.

## States

${rows
  .map(
    (r) =>
      `### ${r.state}: ${r.provider}\n\n${r.why}\n\n${r.tagline ? `${r.tagline}.\n\n` : ""}${r.facts.map((f) => `- ${f}`).join("\n")}${
        r.url ? `\n\nWebsite: ${r.url}` : ""
      }\n\nOn the map: ${SITE}#${slug(r.state)}`
  )
  .join("\n\n")}
`;
writeFileSync(join(root, "llms.txt"), llms);

/* ---------- agents.md: everything on the page, for agents ---------- */

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const byProvider = [...rows].sort((a, b) => a.provider.localeCompare(b.provider));
const agents = `# ${TITLE}: data for agents

${DESCRIPTION}

Source: ${SITE} · Made by Subconscious (https://subconscious.dev)

## How to read this

- There are ${rows.length} states and ${rows.length} providers. Each state has exactly one provider, and each provider has exactly one state.
- The match is about character, not location. A provider gets the state it is most like (its ethos, what it is known for, what it does), not the state where it is headquartered.
- The list is not ranked. States are in alphabetical order.
- Deep link to any state with ${SITE}#<state-name>, for example ${SITE}#texas.

## State → provider

| State | Provider | Why | Website |
| --- | --- | --- | --- |
${rows.map((r) => `| ${cell(r.state)} | ${cell(r.provider)} | ${cell(r.why)} | ${r.url} |`).join("\n")}

## Provider → state

| Provider | State |
| --- | --- |
${byProvider.map((r) => `| ${cell(r.provider)} | ${cell(r.state)} |`).join("\n")}

## Providers in detail

${rows
  .map(
    (r) =>
      `### ${r.provider} (${r.state})\n\n${r.why}\n\n${r.tagline ? `${r.tagline}.\n\n` : ""}${r.facts.map((f) => `- ${f}`).join("\n")}${
        r.url ? `\n\nWebsite: ${r.url}` : ""
      }\n\nOn the map: ${SITE}#${slug(r.state)}`
  )
  .join("\n\n")}
`;
writeFileSync(join(root, "agents.md"), agents);

// the same Markdown as a page that opens in the browser (a bare .md link downloads)
writeFileSync(
  join(root, "agents.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>agents.md · ${TITLE}</title>
  <meta name="description" content="Every state and provider match on ${TITLE}, as Markdown for agents.">
  <link rel="canonical" href="${SITE}agents.html">
  <link rel="alternate" type="text/markdown" href="agents.md">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <meta name="color-scheme" content="dark light">
  <style>
    :root { --bg: #0c0c0d; --fg: #ededed; --muted: #8e8e93; }
    @media (prefers-color-scheme: light) { :root { --bg: #fafaf9; --fg: #161616; --muted: #6b6b70; } }
    body { margin: 0; background: var(--bg); color: var(--fg); }
    nav { max-width: 860px; margin: 0 auto; padding: 20px 16px 0; font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; display: flex; gap: 16px; }
    nav a { color: var(--muted); text-decoration: none; } nav a:hover { color: var(--fg); }
    pre { max-width: 860px; margin: 0 auto; padding: 20px 16px 48px; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <nav><a href="./">← Back to the map</a><a href="agents.md">Raw agents.md</a></nav>
  <pre>${esc(agents)}</pre>
</body>
</html>
`
);

/* ---------- README.md: the full table ---------- */

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf8");
const readmeTable = `| State | Provider | Why |
| --- | --- | --- |
${rows.map((r) => `| [${cell(r.state)}](${SITE}#${slug(r.state)}) | ${r.url ? `[${cell(r.provider)}](${r.url})` : cell(r.provider)} | ${cell(r.why)} |`).join("\n")}`;
writeFileSync(readmePath, between(readme, "readme", readmeTable));

/* ---------- sitemap.xml ---------- */

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}llms.txt</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}agents.html</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}agents.md</loc><lastmod>${today}</lastmod></url>
</urlset>
`
);

console.log(`wrote ${rows.length} states to index.html, README.md, llms.txt, agents.md, sitemap.xml`);
