// Draws favicon.svg: the contiguous US, each state in its provider's color, on a dark tile.
// Run after changing state colors:  node scripts/build-favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { STATES } = await import(join(root, "states.js"));
const { ASSIGNMENTS } = await import(join(root, "data.js"));
const manifest = JSON.parse(readFileSync(join(root, "logos/manifest.json"), "utf8"));

const lum = (hex) => {
  const c = hex.replace("#", "").match(/../g).map((h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
// black brands are drawn light (a negative) so they read against the dark tile
const DARK = "#d9d9de";
// same rules as colorsFor() in app.js, dark theme
function fillFor(p) {
  if (p.fill) {
    const f = p.fill.startsWith("url(") ? p.primary : p.fillDark || p.fill;
    return lum(f) < 0.03 ? DARK : f;
  }
  const primary = p.primary || "#8e8e93";
  const L = lum(primary);
  if (L > 0.88) return p.secondary && lum(p.secondary) < 0.88 ? p.secondary : "#e6e6e3";
  return L < 0.03 ? DARK : primary;
}

// Ramer–Douglas–Peucker: drop points that sit within eps of the line through their neighbors
function simplify(pts, eps) {
  if (pts.length < 4) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let max = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const dist = Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / len;
    if (dist > max) { max = dist; at = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
}

// contiguous states only, path coordinates rounded and tiny islands dropped
const GRID = 2;
const keep = STATES.filter((s) => s.name !== "Alaska" && s.name !== "Hawaii");
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
const shapes = keep.map((s) => {
  const rings = s.d.split("Z").filter(Boolean).map((ring) =>
    ring.replace(/^M/, "").split("L").map((pt) => pt.split(",").map(Number))
  );
  const area = (r) => Math.abs(r.reduce((a, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return a + x * y2 - x2 * y; }, 0)) / 2;
  const big = rings.filter((r) => area(r) > 150);
  const d = big.map((r) => {
    const pts = [];
    for (const [x, y] of r) {
      const q = [Math.round(x / GRID) * GRID, Math.round(y / GRID) * GRID];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
      minX = Math.min(minX, q[0]); minY = Math.min(minY, q[1]); maxX = Math.max(maxX, q[0]); maxY = Math.max(maxY, q[1]);
    }
    const half = Math.floor(pts.length / 2); // split the closed ring so the endpoints differ
    const simple = [...simplify(pts.slice(0, half + 1), 2.2).slice(0, -1), ...simplify(pts.slice(half), 2.2)];
    return "M" + simple.map((p) => p.join(",")).join("L") + "Z";
  }).join("");
  const p = manifest[(ASSIGNMENTS[s.name] || [])[0]] || {};
  return `<path fill="${fillFor(p)}" d="${d}"/>`;
});

// fit the map in the tile with a margin, keeping its aspect
const w = maxX - minX, h = maxY - minY;
const T = 100, pad = 3, s = (T - 2 * pad) / w;
const tx = pad - minX * s, ty = (T - h * s) / 2 - minY * s;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}"><rect width="${T}" height="${T}" rx="20" fill="#0c0c0d"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})" stroke="#0c0c0d" stroke-width="${(0.7 / s).toFixed(2)}" stroke-linejoin="round">${shapes.join("")}</g></svg>\n`;
writeFileSync(join(root, "favicon.svg"), svg);
console.log(`favicon.svg: ${(svg.length / 1024).toFixed(1)} KB`);
