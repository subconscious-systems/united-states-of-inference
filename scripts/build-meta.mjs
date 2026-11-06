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

/* ---------- sitemap.xml ---------- */

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}llms.txt</loc><lastmod>${today}</lastmod></url>
</urlset>
`
);

console.log(`wrote ${rows.length} states to index.html, llms.txt, sitemap.xml`);
