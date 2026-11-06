import { STATES } from "./states.js?v=10";
import { ASSIGNMENTS } from "./data.js?v=36";

const W = 975;
const H = 610;
const NS = "http://www.w3.org/2000/svg";

const $ = (id) => document.getElementById(id);
const mapEl = $("map");
const statesG = $("states");
const liftG = $("lift");
const logosEl = $("logos");
const tip = $("tip");
const panel = $("panel");
const inner = $("panel-inner");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const isSheet = () => innerWidth <= 760;

/* ---------- title: streamed like model output ---------- */

(() => {
  const el = $("title");
  // split the way a tokenizer would, leading spaces attached to the next token
  const tokens = ["The", " United", " States", " of", " Inf", "erence"];
  el.textContent = "";
  const spans = tokens.map((t) => {
    const s = document.createElement("span");
    s.className = "tok";
    s.setAttribute("aria-hidden", "true");
    s.textContent = t;
    el.appendChild(s);
    return s;
  });
  // the info icon waits until the title has finished streaming in
  const info = $("info");
  if (reduceMotion.matches) {
    spans.forEach((s) => s.classList.add("on"));
    info.classList.add("ready");
    $("subtitle").classList.add("ready");
    return;
  }
  // a caret "thinks" first, then follows each token as it lands
  const caret = document.createElement("span");
  caret.className = "caret";
  caret.setAttribute("aria-hidden", "true");
  el.appendChild(caret);
  let t = 900; // time to first token
  spans.forEach((s, i) => {
    setTimeout(() => {
      s.classList.add("on");
      caret.style.left = `${s.offsetLeft + s.offsetWidth}px`;
      if (i === spans.length - 1) {
        setTimeout(() => info.classList.add("ready"), 260);
        setTimeout(() => $("subtitle").classList.add("ready"), 380);
        setTimeout(() => caret.classList.add("done"), 1600);
      }
    }, t);
    t += 200 + Math.random() * 220 + (tokens[i + 1]?.startsWith(" ") ? 60 : 0);
  });
})();

/* about card: tap the info icon on touch devices */
{
  const info = $("info");
  const about = $("about");
  info.addEventListener("click", (e) => {
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    e.stopPropagation();
    about.classList.toggle("on");
  });
  document.addEventListener("pointerdown", (e) => {
    if (!info.contains(e.target)) about.classList.remove("on");
  });
}

let manifest = {};
try {
  manifest = await (await fetch("logos/manifest.json", { cache: "no-cache" })).json();
} catch {
  manifest = {};
}

/* ---------- color helpers ---------- */

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function colorsFor(p) {
  const primary = p.primary || "#8e8e93";
  const L = luminance(primary);
  // ink: the color a mono logo is drawn in on top of the fill
  const ink = p.ink || (L > 0.4 ? "#111113" : "#ffffff");
  // keep near-white fills visible on the light page and near-black fills visible on the dark page
  // fillCss: the same fill as a CSS background (a gradient fill is an SVG url() the card can't use)
  if (p.fill) return { fill: p.fill, fillDark: p.fillDark || p.fill, fillCss: p.fillCss || p.fill, ink };
  const fill = L > 0.88 ? p.secondary && luminance(p.secondary) < 0.88 ? p.secondary : "#e6e6e3" : primary;
  const fillDark = L < 0.03 ? "#2a2a2e" : fill;
  return { fill, fillDark, fillCss: fill, ink };
}

/* ---------- build ---------- */

const byName = new Map();
const order = STATES.map((s) => s.name); // alphabetical

for (const s of STATES) {
  const a = ASSIGNMENTS[s.name];
  if (!a) continue;
  const [pid, pname, why] = a;
  const p = manifest[pid] || {};
  const { fill, fillDark, fillCss, ink } = colorsFor(p);
  const delay = Math.round((s.cx / W) * 420 + (s.cy / H) * 120);

  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", s.d);
  path.setAttribute("class", "state");
  path.setAttribute("tabindex", "0");
  path.setAttribute("role", "button");
  path.setAttribute("aria-label", `${s.name}, ${pname}`);
  path.style.setProperty("--fill", fill);
  path.style.setProperty("--fill-dark", fillDark);
  path.style.setProperty("--d", `${delay}ms`);
  statesG.appendChild(path);

  // logo, sized to the largest circle that fits inside the state
  const size = Math.max(9, Math.min(34, s.r * 1.25));
  const logo = document.createElement("div");
  logo.className = "logo";
  logo.style.left = `${(s.cx / W) * 100}%`;
  logo.style.top = `${(s.cy / H) * 100}%`;
  // wide wordmarks set their own width (in map units) and aspect ratio
  logo.style.width = `${((p.logoWidth || size) / W) * 100}%`;
  if (p.aspect) logo.style.aspectRatio = p.aspect;
  logo.style.setProperty("--d", `${delay}ms`);
  if (p.file) logo.appendChild(logoNode(p, ink, pname));
  logosEl.appendChild(logo);

  const lift = 1 + Math.min(0.16, 2.4 / s.r);
  byName.set(s.name, { s, pid, pname, why, p, fill, fillDark, fillCss, ink, path, logo, lift, size });

  path.addEventListener("click", () => select(s.name));
  path.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(s.name, { instant: true });
    }
  });
  path.addEventListener("pointerenter", (e) => hoverOn(s.name, e));
  path.addEventListener("pointermove", moveTip);
  path.addEventListener("pointerleave", () => hoverOff(s.name));
}

function logoNode(p, ink, alt) {
  if (p.mono) {
    const g = document.createElement("div");
    g.className = "glyph";
    g.style.setProperty("--src", `url("logos/${p.file}?v=17")`);
    g.style.setProperty("--ink", ink);
    return g;
  }
  const img = document.createElement("img");
  img.src = `logos/${p.file}?v=17`;
  img.alt = alt;
  img.decoding = "async";
  img.draggable = false;
  return img;
}

// logos that disappear on their own brand color get a small white tile; the rest sit directly on the fill
for (const v of byName.values()) {
  if (!v.p.file || v.p.mono) continue;
  v.logo.classList.add("color");
}

/* ---------- tooltip: delayed first time, instant while moving between states ---------- */

let tipTimer = 0;
let tipWarmUntil = 0;
let tipX = 0;
let tipY = 0;

function hoverOn(name, e) {
  const v = byName.get(name);
  v.logo.classList.add("hover");
  if (e.pointerType !== "mouse") return;
  tip.textContent = v.pname;
  moveTip(e);
  clearTimeout(tipTimer);
  if (performance.now() < tipWarmUntil || tip.classList.contains("on")) {
    tip.classList.add("instant", "on");
  } else {
    tip.classList.remove("instant");
    tipTimer = setTimeout(() => tip.classList.add("on"), 420);
  }
}
function hoverOff(name) {
  byName.get(name).logo.classList.remove("hover");
  clearTimeout(tipTimer);
  if (tip.classList.contains("on")) tipWarmUntil = performance.now() + 350;
  tip.classList.remove("on");
}
function moveTip(e) {
  tipX = e.clientX;
  tipY = e.clientY;
  tip.style.transform = `translate(${Math.round(tipX)}px, ${Math.round(tipY)}px) translate(-50%, calc(-100% - 14px))`;
}

/* ---------- selection ---------- */

let current = null;
let liftPath = null;

function select(name, { instant = false } = {}) {
  if (!byName.has(name)) return;
  if (current === name) return close();
  const prev = current;
  current = name;
  const v = byName.get(name);

  $("prev").setAttribute("aria-label", `Previous state: ${neighbor(-1)}`);
  $("next").setAttribute("aria-label", `Next state: ${neighbor(1)}`);

  // dim everything else, lift the chosen state onto its own layer
  mapEl.classList.add("has-selection");
  for (const o of byName.values()) {
    o.path.classList.toggle("selected", o === v);
    o.logo.classList.toggle("selected", o === v);
    o.logo.style.removeProperty("--lift");
  }
  v.logo.style.setProperty("--lift", v.lift);
  // the state scales around its bounding-box center, so carry the logo along with it
  const bb = v.path.getBBox();
  const k = (v.lift - 1) / (v.p.logoWidth || v.size) * 100;
  v.logo.style.setProperty("--tx", `${((v.s.cx - (bb.x + bb.width / 2)) * k).toFixed(2)}%`);
  v.logo.style.setProperty("--ty", `${((v.s.cy - (bb.y + bb.height / 2)) * k).toFixed(2)}%`);
  setLift(v, instant);

  render(v, prev && !instant && !reduceMotion.matches);
  openPanel();
  history.replaceState(null, "", `#${slug(name)}`);
}

function setLift(v, instant) {
  if (liftPath) {
    const old = liftPath;
    old.classList.add("leaving");
    old.classList.remove("up");
    setTimeout(() => old.remove(), 160);
  }
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", v.s.d);
  p.style.setProperty("--fill", v.fill);
  p.style.setProperty("--fill-dark", v.fillDark);
  p.style.setProperty("--lift", v.lift);
  liftG.appendChild(p);
  liftPath = p;
  if (instant) {
    p.style.transition = "none";
    p.classList.add("up");
    p.getBoundingClientRect();
    p.style.transition = "";
  } else {
    p.getBoundingClientRect(); // commit the starting scale so the transition runs
    p.classList.add("up");
  }
}

function close() {
  if (!current) return;
  current = null;
  mapEl.classList.remove("has-selection");
  for (const o of byName.values()) {
    o.path.classList.remove("selected");
    o.logo.classList.remove("selected");
  }
  if (liftPath) {
    const old = liftPath;
    liftPath = null;
    old.classList.add("leaving");
    old.classList.remove("up");
    setTimeout(() => old.remove(), 160);
  }
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  panel.style.removeProperty("--drag");
  mapEl.style.transform = "";
  if (zoomRegion !== "all") applyZoom();
  history.replaceState(null, "", location.pathname + location.search);
}

function openPanel() {
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  panel.style.removeProperty("--drag");
  requestAnimationFrame(makeRoom);
}

/* keep the map visible beside (or above) the panel, using transforms only */
function makeRoom() {
  if (!current) return;
  // measure the untransformed layout box (getBoundingClientRect would include an in-flight transition)
  const sr = mapEl.offsetParent.getBoundingClientRect();
  const left = sr.left + mapEl.offsetLeft;
  const top = sr.top + mapEl.offsetTop;
  const m = { left, top, width: mapEl.offsetWidth, height: mapEl.offsetHeight, right: left + mapEl.offsetWidth, bottom: top + mapEl.offsetHeight };
  const gutter = isSheet() ? 16 : 24;
  if (isSheet() && zoomRegion !== "all") {
    mapEl.style.transform = "";
    applyZoom();
    return;
  }
  if (isSheet()) {
    const sheetTop = innerHeight - panel.offsetHeight - 8;
    const headerBottom = 60; // don't push the map under the title
    let ty;
    if (m.height <= sheetTop - headerBottom) {
      // the whole map fits above the sheet: sit it just under the title so every state stays tappable
      ty = headerBottom + Math.max(0, (sheetTop - headerBottom - m.height) / 2) - m.top;
    } else {
      // otherwise keep the selected state in view above the sheet
      const v = byName.get(current);
      const stateY = m.top + (v.s.cy / H) * m.height;
      ty = Math.max(headerBottom - m.top, Math.min(0, sheetTop - 40 - stateY));
    }
    ty = Math.min(0, ty);
    mapEl.style.transform = ty ? `translateY(${Math.round(ty)}px)` : "";
    return;
  }
  const availRight = innerWidth - panel.offsetWidth - gutter * 2;
  const overflow = m.right - availRight;
  if (overflow <= 0) {
    mapEl.style.transform = "";
    return;
  }
  const leftRoom = m.left - gutter;
  if (overflow <= leftRoom) {
    mapEl.style.transform = `translateX(${-Math.round(overflow)}px)`;
  } else {
    const s = (availRight - gutter) / m.width;
    mapEl.style.transform = `translateX(${-Math.round(leftRoom)}px) scale(${s.toFixed(4)})`;
  }
}

/* ---------- panel content ---------- */

function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function slug(n) {
  return n.toLowerCase().replace(/\s+/g, "-");
}
function host(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function contentHTML(v) {
  const { p } = v;
  let badge = "";
  if (p.file) {
    badge = p.mono
      ? `<div class="p-badge" style="--fill:${v.fillCss}"><div class="glyph" style="--src:url('logos/${esc(p.badgeFile || p.file)}?v=17');--ink:${v.ink}"></div></div>`
      : `<div class="p-badge" style="--fill:${v.fillCss}"><img src="logos/${esc(p.badgeFile || p.file)}?v=17" alt=""></div>`;
  }
  return `
    <p class="p-state">${esc(v.s.name)}</p>
    <div class="p-head">${badge}<h2 class="p-name">${esc(v.pname)}</h2></div>
    <p class="p-why">${esc(v.why)}</p>
    ${moreHTML(v)}`;
}

function moreHTML(v) {
  const { p } = v;
  const facts = Array.isArray(p.facts) && p.facts.length ? `<ul>${p.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";
  if (!p.tagline && !facts && !p.url) return "";
  return `<div class="p-more" style="--fill-dot:${v.fillCss}">
      ${p.tagline ? `<p>${esc(p.tagline)}</p>` : ""}
      ${facts}
      ${p.url ? `<a class="p-link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(host(p.url))}<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1h6v6M9 1L1 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` : ""}
    </div>`;
}

function swatchHTML(v) {
  const { p } = v;
  if (!p.file) return `<span class="swatch" style="--fill:${v.fillCss}"></span>`;
  return p.mono
    ? `<span class="swatch" style="--fill:${v.fillCss}"><span class="glyph" style="--src:url('logos/${esc(p.badgeFile || p.file)}?v=17');--ink:${v.ink}"></span></span>`
    : `<span class="swatch" style="--fill:${v.fillCss}"><img src="logos/${esc(p.badgeFile || p.file)}?v=17" alt=""></span>`;
}

let swapAnim = null;
function render(v, crossfade) {
  const html = contentHTML(v);
  swapAnim?.cancel();
  swapAnim = null;
  if (!crossfade) {
    inner.innerHTML = html;
    panel.scrollTop = 0;
    return;
  }
  // blur-crossfade between providers so it reads as one card changing, not two swapping
  swapAnim = inner.animate(
    [{ opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(3px)" }],
    { duration: 90, easing: "ease-out", fill: "forwards" }
  );
  const out = swapAnim;
  out.onfinish = () => {
    if (swapAnim !== out) return;
    inner.innerHTML = html;
    out.cancel();
    panel.scrollTop = 0;
    requestAnimationFrame(makeRoom);
    swapAnim = inner.animate(
      [{ opacity: 0, filter: "blur(3px)", transform: "translateY(3px)" }, { opacity: 1, filter: "blur(0px)", transform: "none" }],
      { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
    );
  };
}

/* ---------- dismissal ---------- */

$("close").addEventListener("click", close);

document.addEventListener("pointerdown", (e) => {
  if (!current) return;
  if (panel.contains(e.target) || e.target.closest?.(".state, .zoom-ctl")) return;
  close();
});

/* ---------- view all ---------- */

const allEl = $("all");
const allList = $("all-list");
const viewAllBtn = $("view-all");

allList.innerHTML = order
  .filter((n) => byName.has(n))
  .map((n, i) => {
    const v = byName.get(n);
    const id = `row-${slug(n)}`;
    return `<li class="row" style="--i:${Math.min(i, 16)}">
      <button class="row-btn" aria-expanded="false" aria-controls="${id}">
        ${swatchHTML(v)}
        <span><span class="row-state">${esc(n)}</span> <span class="row-arrow">→</span> <span class="row-name">${esc(v.pname)}</span></span>
        <svg class="row-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="row-body" id="${id}"><div><div class="row-detail">
        <p class="p-why">${esc(v.why)}</p>
        ${moreHTML(v)}
      </div></div></div>
    </li>`;
  })
  .join("");

allList.addEventListener("click", (e) => {
  const btn = e.target.closest(".row-btn");
  if (!btn) return;
  const row = btn.parentElement;
  const open = !row.classList.contains("expanded");
  row.classList.toggle("expanded", open);
  btn.setAttribute("aria-expanded", String(open));
});

function openAll() {
  if (current) close();
  allEl.classList.add("open");
  allEl.setAttribute("aria-hidden", "false");
  viewAllBtn.setAttribute("aria-expanded", "true");
  allEl.querySelector(".all-sheet").scrollTop = 0;
  $("all-close").focus({ preventScroll: true });
}
function closeAll() {
  allEl.classList.remove("open");
  allEl.setAttribute("aria-hidden", "true");
  viewAllBtn.setAttribute("aria-expanded", "false");
  viewAllBtn.focus({ preventScroll: true });
}
viewAllBtn.addEventListener("click", () => (allEl.classList.contains("open") ? closeAll() : openAll()));
$("all-close").addEventListener("click", closeAll);
$("all-backdrop").addEventListener("click", closeAll);

/* ---------- search: cmd/ctrl + k, by inference company ---------- */

const searchEl = $("search");
const searchInput = $("search-input");
const searchList = $("search-results");
const providers = [...byName.values()].sort((a, b) => a.pname.localeCompare(b.pname));
let matches = [];
let active = 0;
let searchReturnFocus = null;

// best matches first: name starts with the query, then a word in it does, then it appears anywhere,
// then (3+ letters) the letters appear in order, so "ggl" finds Google
function rank(v, q) {
  const name = v.pname.toLowerCase();
  if (!q) return 1;
  if (name.startsWith(q)) return 4;
  if (name.split(/[\s.\-]+/).some((w) => w.startsWith(q))) return 3;
  if (name.includes(q) || v.pid.includes(q.replace(/\s+/g, ""))) return 2;
  if (q.length < 3) return 0; // in-order letters only once the query says enough
  let i = 0;
  for (const ch of name) if (ch === q[i]) i++;
  return i === q.length ? 0.5 : 0;
}

function renderSearch() {
  const q = searchInput.value.trim().toLowerCase();
  matches = providers
    .map((v) => ({ v, r: rank(v, q) }))
    .filter((m) => m.r > 0)
    .sort((a, b) => b.r - a.r || a.v.pname.localeCompare(b.v.pname))
    .map((m) => m.v);
  active = 0;
  searchList.innerHTML = matches.length
    ? matches
        .map(
          (v, i) => `<li class="search-result" role="option" id="sr-${i}" data-i="${i}" aria-selected="${i === active}">
            ${swatchHTML(v)}<span class="s-name">${esc(v.pname)}</span><span class="s-state">${esc(v.s.name)}</span></li>`
        )
        .join("")
    : `<li class="search-empty" role="option" aria-disabled="true">No provider matches “${esc(searchInput.value.trim())}”</li>`;
  searchInput.setAttribute("aria-activedescendant", matches.length ? "sr-0" : "");
}

function setActive(i) {
  if (!matches.length) return;
  active = (i + matches.length) % matches.length;
  searchList.querySelectorAll(".search-result").forEach((li, j) => li.setAttribute("aria-selected", String(j === active)));
  const li = $(`sr-${active}`);
  searchInput.setAttribute("aria-activedescendant", li.id);
  li.scrollIntoView({ block: "nearest" });
}

function openSearch() {
  if (allEl.classList.contains("open")) closeAll();
  searchReturnFocus = document.activeElement;
  searchInput.value = "";
  renderSearch();
  searchEl.classList.add("open");
  searchEl.setAttribute("aria-hidden", "false");
  searchInput.focus({ preventScroll: true });
}
function closeSearch({ restoreFocus = true } = {}) {
  searchEl.classList.remove("open");
  searchEl.setAttribute("aria-hidden", "true");
  if (restoreFocus) searchReturnFocus?.focus?.({ preventScroll: true });
}
function pick(i) {
  const v = matches[i];
  if (!v) return;
  closeSearch({ restoreFocus: false });
  if (current !== v.s.name) select(v.s.name);
}

searchInput.addEventListener("input", renderSearch);
searchList.addEventListener("pointermove", (e) => {
  const li = e.target.closest(".search-result");
  if (li && Number(li.dataset.i) !== active) setActive(Number(li.dataset.i));
});
searchList.addEventListener("click", (e) => {
  const li = e.target.closest(".search-result");
  if (li) pick(Number(li.dataset.i));
});
$("search-backdrop").addEventListener("click", () => closeSearch());

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    searchEl.classList.contains("open") ? closeSearch() : openSearch();
    return;
  }
  if (!searchEl.classList.contains("open")) return;
  // while the search is open, it owns the keyboard
  e.stopImmediatePropagation();
  if (e.key === "Escape") closeSearch();
  else if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
  else if (e.key === "Enter") { e.preventDefault(); pick(active); }
});

document.addEventListener("keydown", (e) => {
  if (allEl.classList.contains("open")) {
    if (e.key === "Escape") closeAll();
    return;
  }
  if (e.key === "Escape" && current) {
    // keyboard actions are instant
    panel.style.transition = "none";
    close();
    panel.getBoundingClientRect();
    panel.style.transition = "";
    return;
  }
  if (!current || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
  e.preventDefault();
  const next = step(e.key === "ArrowRight" ? 1 : -1, { instant: true });
  byName.get(next).path.focus({ preventScroll: true });
});

/* previous / next: walk the states alphabetically, wrapping around */
function neighbor(dir) {
  const i = order.indexOf(current);
  return order[(i + dir + order.length) % order.length];
}
function step(dir, opts) {
  const next = neighbor(dir);
  select(next, opts);
  return next;
}
$("prev").addEventListener("click", () => step(-1));
$("next").addEventListener("click", () => step(1));

/* swipe the sheet down to dismiss — a quick flick is enough */
(() => {
  const grip = $("grip");
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let active = false;
  grip.addEventListener("pointerdown", (e) => {
    if (active || !isSheet()) return;
    active = true;
    startY = e.clientY;
    startT = performance.now();
    dy = 0;
    grip.setPointerCapture(e.pointerId);
    panel.classList.add("dragging");
  });
  grip.addEventListener("pointermove", (e) => {
    if (!active) return;
    const raw = e.clientY - startY;
    // friction when pulling up past the resting point
    dy = raw < 0 ? -Math.pow(-raw, 0.6) : raw;
    panel.style.setProperty("--drag", `${dy}px`);
  });
  const end = () => {
    if (!active) return;
    active = false;
    panel.classList.remove("dragging");
    const velocity = Math.abs(dy) / (performance.now() - startT);
    if (dy > 120 || (dy > 10 && velocity > 0.11)) close();
    else panel.style.removeProperty("--drag");
  };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
})();

addEventListener("resize", () => {
  applyZoom();
  if (!current) return;
  mapEl.style.transition = "none";
  makeRoom();
  mapEl.getBoundingClientRect();
  mapEl.style.transition = "";
});

/* ---------- phones: zoom into a region ---------- */

const REGIONS = {
  northeast: ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania", "Delaware", "Maryland"],
};
const zoomEl = $("zoom");
const stageEl = $("stage");
const zoomCtl = document.querySelector(".zoom-ctl");
let zoomRegion = "all";

function regionBox(name) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of REGIONS[name]) {
    const b = byName.get(n).path.getBBox();
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// scale and move the drawing so the region fills the space between the toggle and the bottom (or the open sheet)
function applyZoom() {
  if (zoomRegion === "all" || !isSheet()) {
    zoomEl.style.transform = "";
    stageEl.classList.remove("zoomed");
    return;
  }
  stageEl.classList.add("zoomed");
  const sr = stageEl.getBoundingClientRect();
  const mapLeft = sr.left + mapEl.offsetLeft;
  const mapTop = sr.top + mapEl.offsetTop;
  const u = mapEl.offsetWidth / W; // px per map unit
  const top = zoomCtl.getBoundingClientRect().bottom + 12;
  const bottom = current ? innerHeight - panel.offsetHeight - 20 : sr.bottom - 12;
  const left = sr.left + 12;
  const right = sr.right - 12;
  const r = regionBox(zoomRegion);
  const k = Math.min(5, (right - left) / (r.w * u), (bottom - top) / (r.h * u));
  const tx = (left + right) / 2 - mapLeft - k * (r.x + r.w / 2) * u;
  const ty = (top + bottom) / 2 - mapTop - k * (r.y + r.h / 2) * u;
  zoomEl.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${k.toFixed(3)})`;
  stageEl.style.setProperty("--k", k.toFixed(3));
}

zoomCtl.addEventListener("click", (e) => {
  const btn = e.target.closest(".zoom-btn");
  if (!btn || btn.dataset.zoom === zoomRegion) return;
  zoomRegion = btn.dataset.zoom;
  zoomCtl.querySelectorAll(".zoom-btn").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  if (current) makeRoom();
  else applyZoom();
});

/* deep link: /#utah */
const fromHash = decodeURIComponent(location.hash.slice(1));
if (fromHash) {
  const hit = order.find((n) => slug(n) === fromHash);
  if (hit) setTimeout(() => select(hit), 700);
}
