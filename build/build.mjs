#!/usr/bin/env node
/* Public Tracker static build. No dependencies: Node's standard library only.

     node build.mjs [path/to/plays.json]

   Reads plays.json, works out every figure the pages show, and writes the
   site to ./dist. Page bodies live in ./src/pages, the design system in
   ./src/site.css and ./src/site.js. External requests: local assets plus
   exactly one analytics script (Umami, UMAMI below, on every page). All data
   is inlined and every other asset is a local file. Nothing else leaves the
   site. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {SCENES} from "./src/scenes.mjs";
import {loadArtSlots, writeArtSlots, artImg} from "./src/artslot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "src");
const DIST = path.join(HERE, "dist");
const ORIGIN = "https://ramblingngambling.github.io";
const HANDLE = "gamblingv1ctim";

/* ---------- input ---------- */
// The data file is the one in the site repo: ../plays.json when this folder
// sits inside the repo, ../site/plays.json from the workspace copy.
function findPlays() {
  const arg = process.argv[2] || process.env.PLAYS_JSON;
  if (arg) return path.resolve(arg);
  for (const p of [path.join(HERE, "..", "plays.json"), path.join(HERE, "..", "site", "plays.json")])
    if (fs.existsSync(p)) return p;
  throw new Error("plays.json not found. Pass its path: node build.mjs path/to/plays.json");
}
const PLAYS_PATH = findPlays();
const RAW = JSON.parse(fs.readFileSync(PLAYS_PATH, "utf8"));
if (!RAW || !Array.isArray(RAW.plays)) throw new Error(PLAYS_PATH + " has no plays array");
const SITE_DIR = path.dirname(PLAYS_PATH);
loadArtSlots(SITE_DIR);   // optional hero pictures in art/ (src/artslot.mjs): a bad file is a warning, never an error

/* ---------- the SGA 20+ experiment (optional) ----------
   Bet Desk writes sga.json beside plays.json, and a screenshot of each bet slip to sga/proof/.
   With no file, or one that does not make sense, there is simply no SGA page: a problem here must
   never stop the record from updating, so it is a warning and not an error. Only the fields read
   below are used and each is checked, so nothing else in the file can reach a page. Every figure
   is a multiple of the first stake. The only dollar figures are what each run started with and what it is
   worth now, and Bet Desk writes them only while Darren's "Show my dollar figures" box is ticked. There
   is no book and no per-game stake in the file, and nothing else money-like is ever read. */
const SGA = loadSga();
function loadSga() {
  const file = path.join(SITE_DIR, "sga.json");
  if (!fs.existsSync(file)) return null;
  const bad = why => { console.warn("sga.json ignored: " + why); return null; };
  const num = v => typeof v === "number" && isFinite(v);
  let j;
  try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return bad("not valid JSON"); }
  if (!j || j.units_only !== true || !Array.isArray(j.runs)) return bad("not an SGA file");
  const runs = [];
  for (const [ri, r] of j.runs.entries()) {
    if (!r || !Array.isArray(r.g) || !["live", "bust", "cashed"].includes(r.st)) return bad("run " + (ri + 1));
    const g = [];
    for (const [gi, x] of r.g.entries()) {
      if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.d) || !num(x.l) || x.l <= 0 || !num(x.p) || Math.abs(x.p) < 100 ||
          !["Pending", "Win", "Loss", "Void"].includes(x.r) || !num(x.f) || x.f < 0 || !num(x.x) || x.x < 0 ||
          (x.s !== undefined && !(num(x.s) && x.s >= 0)))
        return bad(`run ${ri + 1}, game ${gi + 1}`);
      const o = {d: x.d, o: String(x.o || "").replace(/[^A-Za-z0-9 @.&'\-]/g, "").trim().slice(0, 24),
                 l: x.l, p: x.p, r: x.r, f: x.f, x: x.x};
      if (x.s !== undefined) o.s = x.s;
      // a screenshot is linked only if its file is really there
      if (typeof x.pf === "string" && /^[a-z0-9]{8,40}$/.test(x.pf) && fs.existsSync(path.join(SITE_DIR, "sga", "proof", x.pf + ".jpg"))) {
        o.pf = x.pf; o.pm = x.pm === 0 ? 0 : 1;
      }
      g.push(o);
    }
    // the two dollar fields, each checked; anything else under "usd" is dropped
    let usd = null;
    if (r.usd && typeof r.usd === "object" && num(r.usd.start) && r.usd.start > 0 && r.usd.start < 1e7 &&
        num(r.usd.bank) && r.usd.bank >= 0 && r.usd.bank < 1e9)
      usd = {start: Math.round(r.usd.start * 100) / 100, bank: Math.round(r.usd.bank * 100) / 100};
    if (g.length) runs.push({n: num(r.n) && r.n > 0 ? Math.floor(r.n) : ri + 1, st: r.st, g, usd});
  }
  return runs.length ? {runs} : null;
}

/* ---------- helpers ---------- */
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MINUS = "−";
const h = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const signed = (v, d = 2) => { const a = Math.abs(v).toFixed(d); return +a === 0 ? (0).toFixed(d) : (v > 0 ? "+" : MINUS) + a; };
const cls = v => v > 0.004 ? "pos" : v < -0.004 ? "neg" : "zero-v";
const dlong = s => { const [y, m, d] = s.split("-"); return MO[+m - 1] + " " + (+d) + ", " + y; };
const dmd = s => { const [, m, d] = s.split("-"); return MO[+m - 1] + " " + (+d); };
const round = (v, d = 6) => +v.toFixed(d);
const RESULT = {Win: "W", Loss: "L", Push: "P"};
const XRE = /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/i;
const tile = r => `<span class="t ${r.toLowerCase()}" aria-hidden="true">${r}</span>`;

/* ---------- the record ---------- */
// Plays keep their file order as a tiebreak inside a day, so "the last 20"
// and "newest first" mean the same thing they meant on the old page.
const plays = RAW.plays.map((p, k) => {
  for (const f of ["date", "sport", "market", "play", "result"])
    if (typeof p[f] !== "string") throw new Error(`play ${k}: missing ${f}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error(`play ${k}: bad date ${p.date}`);
  const r = RESULT[p.result] || p.result;
  const settled = r === "W" || r === "L" || r === "P";
  if (settled && !(typeof p.units_pl === "number" && isFinite(p.units_pl))) throw new Error(`play ${k}: settled without units_pl`);
  return {k, date: p.date, sport: p.sport, market: p.market, play: p.play, game: p.game || "",
    odds: +p.odds, units: +p.units, r, settled, pl: settled ? p.units_pl : 0,
    post: XRE.test(p.post || "") ? p.post : ""};
});
const chron = plays.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.k - b.k);
const settled = chron.filter(p => p.settled);

function agg(list) {
  const a = {n: 0, w: 0, l: 0, p: 0, u: 0, risk: 0};
  for (const b of list) {
    if (!b.settled) continue;
    a.n++; a[b.r.toLowerCase()]++; a.u += b.pl; a.risk += b.units;
  }
  a.roi = a.risk > 0 ? a.u / a.risk : 0;
  a.wr = a.w + a.l > 0 ? a.w / (a.w + a.l) : 0;
  return a;
}
const A = agg(plays);
const OPEN = plays.filter(p => !p.settled && p.r !== "Void").length;

// Cumulative units at the close of each day with settled plays.
const series = [];
{
  let run = 0;
  for (const p of settled) {
    run += p.pl;
    const last = series[series.length - 1];
    if (last && last[0] === p.date) last[1] = run; else series.push([p.date, run]);
  }
}
const form = settled.slice(-20).map(p => p.r).join("");

// Splits: sport and market ranked by units, month in calendar order.
function split(keyOf, order) {
  const g = new Map();
  for (const p of settled) { const k = keyOf(p) || "--"; if (!g.has(k)) g.set(k, []); g.get(k).push(p); }
  let rows = [...g].map(([k, list]) => { const a = agg(list); return [k, a.n, a.w, a.l, a.p, round(a.u, 4), round(a.risk, 4)]; });
  if (order === "units") rows.sort((x, y) => y[5] - x[5]);
  return rows;
}
const upd = /^([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(RAW.updated || "");
const updIso = upd ? `${upd[3]}-${String(MO.indexOf(upd[1]) + 1).padStart(2, "0")}-${upd[2].padStart(2, "0")}` : (settled.length ? settled[settled.length - 1].date : "");
const monthRows = split(p => p.date.slice(0, 7)).sort((x, y) => x[0] < y[0] ? -1 : 1).map(r => {
  const [y, m] = r[0].split("-");
  return [MO[+m - 1] + " " + y + (r[0] === updIso.slice(0, 7) ? ", so far" : ""), ...r.slice(1)];
});
const brk = {sport: split(p => p.sport, "units"), market: split(p => p.market, "units"), month: monthRows};

// Filter options in the prototype's order; anything new joins at the end by count.
function ordered(base, keyOf) {
  const c = new Map();
  for (const p of plays) c.set(keyOf(p), (c.get(keyOf(p)) || 0) + 1);
  return base.filter(x => c.has(x)).concat([...c.keys()].filter(x => !base.includes(x)).sort((a, b) => c.get(b) - c.get(a)));
}
const sportOrder = ordered(["NFL","MLB","WNBA","NCAAF","UFC"], p => p.sport);
const marketOrder = ordered(["Spread","Moneyline","Total","Player prop","Parlay","Other"], p => p.market);

const newest = plays.slice().sort((a, b) => a.date > b.date ? -1 : a.date < b.date ? 1 : b.k - a.k);
const DATA = {
  updated: RAW.updated || "",
  net: round(A.u, 6),
  plays: newest.map(p => [p.k, p.date, p.sport, p.market, p.play, p.game, p.odds, p.units, p.r, round(p.pl, 6), p.post]),
  series: series.map(([d, v]) => [d, round(v, 6)]),
  form, brk, sportOrder, marketOrder
};
// The curve has to land where the headline does, or one of them is wrong.
if (series.length && Math.abs(series[series.length - 1][1] - A.u) > 1e-9)
  throw new Error("equity curve does not end at the net figure");

/* ---------- assets ---------- */
fs.rmSync(DIST, {recursive: true, force: true});
fs.mkdirSync(path.join(DIST, "assets"), {recursive: true});
writeArtSlots(DIST);
const ASSET = {};
for (const f of ["site.css", "site.js", "home.js", "tools.js", "sga.js", "art.js"]) {
  const body = fs.readFileSync(path.join(SRC, f), "utf8");
  fs.writeFileSync(path.join(DIST, "assets", f), body);
  ASSET[f] = `assets/${f}?v=${crypto.createHash("sha1").update(body).digest("hex").slice(0, 8)}`;
}
const read = f => fs.readFileSync(path.join(SRC, "pages", f), "utf8");

/* ---------- shared chrome ---------- */
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230B0B0D'/%3E%3Cpath d='M5 21.5 L11.5 13 L17 17 L27 6.5' stroke='%23C08BF5' stroke-width='3.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";
// Resolve the theme before first paint so there is no flash. pref is what the
// reader chose, theme is what is drawn; the old site's key is honoured once.
// Entrance motion is opt-in: html.motion only without reduced motion, and any
// script error drops it so nothing stays hidden. html.deco is the same opt-in for
// pure decoration (scenes, art, frame lines): it never hides content, so a script
// error somewhere else must not switch it off. Errors are kept in window.__errs
// for the ?diag report (site.js).
const PREPAINT = `<script>
(function(){
  var r=document.documentElement,p='auto';
  try{p=localStorage.getItem('pt-theme')||localStorage.getItem('rg.theme')||'auto'}catch(e){}
  if(p!=='dark'&&p!=='light')p='auto';
  var dark=p==='dark'||(p==='auto'&&!matchMedia('(prefers-color-scheme: light)').matches);
  r.dataset.pref=p;r.dataset.theme=dark?'dark':'light';r.style.colorScheme=dark?'dark':'light';
  window.__errs=[];
  addEventListener('error',function(e){try{if(window.__errs.length<6)window.__errs.push(((e&&e.message)||'error')+' @'+String((e&&e.filename)||'').split('/').pop()+':'+((e&&e.lineno)||0))}catch(x){}});
  if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    r.classList.add('deco');r.classList.add('motion');addEventListener('error',function(){r.classList.remove('motion')});
  }
})();
</script>`;

// The one external request: Umami analytics, cookie-free. Every page carries
// it once, just before </body>. verify/check-pages.py allows this exact URL
// and nothing else.
const UMAMI = `<script defer src="https://cloud.umami.is/script.js" data-website-id="55eb5498-a3ca-4912-846f-c48e59a9971a"></script>`;

const TOOLS = [
  ["arbitrage", "Arbitrage", "Split stakes across books to lock a profit"],
  ["hedge", "Hedge", "Lock a profit on a bet you already hold"],
  ["parlay", "Parlay", "Price a parlay or a round robin"],
  ["payout", "Payout", "What a stake returns at any price"],
  ["odds", "Odds converter", "Convert between percentages and prices"],
  ["devig", "Devig", "Strip the margin to find the fair price"],
  ["poker", "Poker settle-up", "Who pays whom after a home game"],
  ["cheat-sheet", "Percent to odds", "Fair odds for every percent, 1 to 99"]
];
// Both the home index and the inner pages' "More tools" list each tool with
// its name and a one-line summary, at every width.
// The home index also carries a small looping scene on each tile (scenes.mjs,
// decorative: aria-hidden, so a tile's link name is unchanged).
const toolIndex = (rel, skip, nonum) => TOOLS.filter(t => t[0] !== skip).map(t => {
  const sc = nonum ? "" : SCENES[t[0]];
  return `<a class="tool${sc ? " has-sc" : ""}" data-rv href="${rel}${t[0]}/">${sc ? `<span class="tsc-box">${sc}</span>` : ""}<span class="nm">${h(t[1])}</span><span class="sd">${h(t[2])}</span></a>`;
}).join("\n      ");

const XSVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x=".5" y=".5" width="31" height="31" rx="7" fill="#0B0B0D" stroke="var(--line2)"/><path d="M5 21.5 L11.5 13 L17 17 L27 6.5" stroke="#C08BF5" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function header(rel, active, home) {
  const a = (href, label, key) => `<a href="${href}"${key && key === active ? ' aria-current="page"' : ""}>${label}</a>`;
  const hm = home ? "" : rel;
  return `<header class="top">
  <div class="wrap">
    <a class="brand" href="${home ? "#record" : rel}" aria-label="Public Tracker, back to the record">
      ${XSVG}
      <span><b>Public Tracker</b><span>@${HANDLE}</span></span>
    </a>
    <nav class="nav" aria-label="Primary">
      ${a(hm + "#record", "Record")}
      ${a(hm + "#log", "Log")}
      ${a(hm + "#breakdown", "Breakdown")}
      ${a(hm + "#tools", "Tools", "tool")}
      <span class="sep" aria-hidden="true"></span>
      ${a(rel + "about/", "About", "about")}
    </nav>
    <button class="theme" id="theme" type="button" aria-label="Theme">
      <svg id="th-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>
      <span class="tl" id="th-lab">Auto</span>
    </button>
  </div>${SGA && active !== "sga" && !home ? sgaFloat(rel) : ""}
</header>`;
}

const formTiles = form ? [...form].map(tile).join("") : "";
const formLabel = (() => {
  const w = [...form].filter(r => r === "W").length, l = [...form].filter(r => r === "L").length, p = form.length - w - l;
  return `Last ${form.length} results, oldest first: ${w} won, ${l} lost, ${p} push`;
})();

function footer(rel, home) {
  const hm = home ? "" : rel;
  return `<footer>
  <div class="wrap">
    ${home ? "" : `<div class="rstrip" data-rv aria-label="The record so far">
      <a class="rs-net ${cls(A.u)}" href="${hm}#record">${signed(A.u)}u</a>
      <dl>
        <div><dt>Settled</dt><dd>${A.n}</dd></div>
        <div><dt>W-L-P</dt><dd>${A.w}-${A.l}-${A.p}</dd></div>
        <div><dt>ROI</dt><dd>${signed(A.roi * 100, 1)}%</dd></div>
        <div><dt>Updated</dt><dd>${h(updIso ? dlong(updIso) : "–")}</dd></div>
      </dl>
      ${form ? `<div class="pips" role="img" aria-label="${formLabel}">${formTiles}</div>` : ""}
    </div>`}
    <div class="fbar">
      <nav class="flinks" aria-label="Footer">
        <a href="https://x.com/${HANDLE}" target="_blank" rel="noopener noreferrer">@${HANDLE} on X</a>
        <a href="${rel}plays.json">plays.json</a>
        <a href="${rel}about/">About</a>
      </nav>
      <p>If betting stops being fun, stop.</p>
    </div>
  </div>
</footer>`;
}

function page({slug, title, desc, body, active, scripts = [], tool = "", home = false, extraHead = ""}) {
  const rel = slug ? "../" : "";
  const url = ORIGIN + "/" + (slug ? slug + "/" : "");
  const full = title ? `${title} · Public Tracker` : "Public Tracker · @" + HANDLE;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0B0B0D" media="(prefers-color-scheme:dark)">
<meta name="theme-color" content="#F5F4F7" media="(prefers-color-scheme:light)">
<title>${h(full)}</title>
<meta name="description" content="${h(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="${ICON}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="@${HANDLE}">
<meta property="og:title" content="${h(full)}">
<meta property="og:description" content="${h(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:creator" content="@${HANDLE}">
${PREPAINT}
<link rel="stylesheet" href="${rel}${ASSET["site.css"]}">${extraHead}
</head>
<body${tool ? ` data-tool="${tool}"` : ""}>
${ARTPAGE}
<a class="skip" href="#main">Skip to the content</a>

${header(rel, active, home)}

${body.replaceAll("{{rel}}", rel)}

${footer(rel, home)}

<script src="${rel}${ASSET["site.js"]}"></script>
${scripts.concat("art.js").map(s => `<script src="${rel}${ASSET[s]}"></script>`).join("\n")}
${UMAMI}
</body>
</html>
`;
  const out = path.join(DIST, slug, "index.html");
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, html);
  return out;
}

/* ---------- halftone art ----------
   Decoration behind the home and SGA heroes: a canvas painted by src/art.js, aria-hidden, and a slot
   for a picture from src/artslot.mjs. Nothing on the page depends on it. */
// The page-wide layer: one fixed canvas behind every page except 404 (src/art.js paints it; PAGE ART in the stylesheet places it).
const ARTPAGE = `<div class="art-page" aria-hidden="true"><canvas></canvas></div>`;
const artBlock = key => `<div class="art" data-art="${key}" aria-hidden="true"><canvas></canvas>${artImg(key)}</div>`;

/* ---------- the SGA 20+ page ---------- */
const impl = o => o > 0 ? 100 / (o + 100) : -o / (-o + 100);
const sgaBig = x => x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
const sx = x => sgaBig(x) + "x";
const sgaOdds = o => o > 0 ? "+" + o : MINUS + Math.abs(o);
const sgaMult = o => 1 + (o > 0 ? o / 100 : 100 / Math.abs(o));
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
function sgaStat(run) {
  const s = {w: 0, l: 0, v: 0, p: 0, peak: 1, prob: 1, pts: [], open: null, last: null};
  for (const x of run.g) {
    if (x.r === "Win") { s.w++; s.prob *= impl(x.p); }
    else if (x.r === "Loss") { s.l++; s.prob *= impl(x.p); }
    else if (x.r === "Void") s.v++;
    else { s.p++; s.open = x; }
    s.peak = Math.max(s.peak, x.x, x.f);
    if (typeof x.s === "number" && (x.r === "Win" || x.r === "Loss")) s.pts.push(x.s);
    s.last = x;
  }
  s.held = run.st === "bust" ? 0 : (s.last ? s.last.x : 1);
  s.avg = s.pts.length ? s.pts.reduce((a, b) => a + b, 0) / s.pts.length : null;
  return s;
}
const usdFmt = v => "$" + (Math.abs(v) % 1 ? Math.abs(v).toFixed(2) : String(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const usdSigned = v => (v > 0.004 ? "+" : v < -0.004 ? MINUS : "") + usdFmt(Math.abs(v) < 0.005 ? 0 : v);
const SGAS = SGA && (() => {
  const runs = SGA.runs, cur = runs[runs.length - 1], cs = sgaStat(cur);
  let tw = 0, tl = 0, tp = 1, profit = 0;
  for (const r of runs) { const s = sgaStat(r); tw += s.w; tl += s.l; tp = Math.max(tp, s.peak); if (r.usd) profit += r.usd.bank - r.usd.start; }
  return {runs, cur, cs, tw, tl, tp, usd: runs.some(r => r.usd), profit: round(profit, 2)};
})();
// the line on the home page that points at it: the home page's one SGA pointer (it has no header tab)
function sgaChip() {
  if (!SGAS) return "";
  const {cur, cs} = SGAS, over = cur.st !== "live" && !cs.open;
  const t = cur.st === "bust" ? `last run ${plural(cs.w, "win")} · peaked ${sx(cs.peak)}`
    : cur.st === "cashed" ? `cashed out at ${sx(cs.held)}`
    : `${sx(cs.held)} · ${plural(cs.w, "win")} in a row${SGAS.usd ? " · " + usdSigned(SGAS.profit) : ""}`;   // the approved dollar profit, as the header tab showed it before the chip became the home page's only pointer
  return `<a class="sgchip${over ? " over" : ""}" href="sga/" data-rv><span class="sgdot" aria-hidden="true"></span><b>SGA 20+ rollover</b><span class="sgs">${h(t)}</span><span class="sga" aria-hidden="true">&rarr;</span></a>`;
}
// The small tab that hangs off the header, top right, on every page but SGA's own: it points a newcomer at
// the experiment. It sits inside the header so it stays flush under it however the header wraps. It is gone
// for good once it has been used or dismissed (pt-sga-seen); its script sits right after it, so a reader
// who has already seen it never gets a flash of it.
function sgaFloat(rel) {
  const {cur, cs} = SGAS;
  const t = cur.st === "bust" ? `last run peaked ${sx(cs.peak)}` : cur.st === "cashed" ? `cashed out at ${sx(cs.held)}`
    : `${sx(cs.held)}${SGAS.usd ? " · " + usdSigned(SGAS.profit) : ""}`;
  return `<div class="sgfloat" id="sgfloat">
  <a href="${rel}sga/">${cur.st === "live" ? '<span class="sgdot" aria-hidden="true"></span>' : ""}<span class="sgtxt"><b>SGA 20+ for the season</b><i>${h(t)}</i></span><span class="sga" aria-hidden="true">&rarr;</span></a>
  <button type="button" class="sgfx" aria-label="Hide this">&times;</button>
</div>
<script>(function(){var b=document.getElementById("sgfloat");if(!b)return;try{if(localStorage.getItem("pt-sga-seen")){b.remove();return}}catch(e){}var x=b.querySelector(".sgfx");if(x)x.onclick=function(){try{localStorage.setItem("pt-sga-seen","1")}catch(e){}b.remove()}})();</script>`;
}
const sgaTile = r => r === "Win" ? tile("W") : r === "Loss" ? tile("L") : r === "Void" ? tile("P") : '<span class="t o" aria-hidden="true">O</span>';
const sgaWord = r => r === "Win" ? "Win" : r === "Loss" ? "Loss" : r === "Void" ? "Sat out" : "Open";
// Phosphor Regular icons (MIT), 256 grid, drawn as fills.
const PH = {
  up: "M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z",
  check: "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"
};
const ico = d => `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
const XMARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/></svg>';

function sgaBody() {
  const {runs, cur, cs, tw, tl, tp} = SGAS;
  const bust = cur.st === "bust", cash = cur.st === "cashed";
  const status = bust ? `Run ${cur.n} ended` : cash ? `Run ${cur.n} cashed out` : cs.open ? `Run ${cur.n} · game open` : `Run ${cur.n} · live`;
  let sub;
  if (bust) sub = `It peaked at ${sx(cs.peak)} after ${plural(cs.w, "win")} in a row. One miss ended it.`;
  else if (cash) sub = `Cashed out after ${plural(cs.w, "win")} in a row.`;
  else if (cs.open) sub = `${cs.w ? plural(cs.w, "win") + " in a row. " : ""}The open game${cs.open.o ? " " + cs.open.o : ""} is at ${sgaOdds(cs.open.p)}: a hit takes it to ${sx(cs.held * sgaMult(cs.open.p))}, a miss ends the run.`;
  else sub = cs.w ? `${plural(cs.w, "win")} in a row. Waiting on the next game.` : "Waiting on the first game.";
  const prob = cs.w >= 2 && !bust
    ? `<p class="sg-prob">At the prices taken, getting this far was about a ${cs.prob < 0.01 ? "1 in " + Math.round(1 / cs.prob) : Math.round(cs.prob * 100) + "%"} chance by the books' own numbers, margin included.</p>` : "";
  const r1 = runs[0], started = r1.usd ? `Started with ${usdFmt(r1.usd.start)} on ${dmd(r1.g[0].d)}. ` : "";
  const pf = SGAS.profit;
  const pfSub = runs.length > 1 ? `${plural(runs.length, "run")} combined`
    : cur.usd && cur.st !== "bust" ? `worth ${usdFmt(cur.usd.bank)} now` : cur.usd ? `started with ${usdFmt(cur.usd.start)}` : "";
  const bigTxt = bust ? "0" : sgaBig(cs.held);
  const big = `<p class="sg-big${bust ? " down" : ""}" aria-label="${bust ? "Zero" : sx(cs.held).replace("x", " times")} the first stake"><span>${bigTxt}</span><span class="u">x</span></p>`;
  const cell = (dt, dd, note) => `<div><dt>${dt}</dt><dd>${dd}</dd>${note ? `<p>${note}</p>` : ""}</div>`;
  const cells = [
    SGAS.usd ? `<div class="pt"><dt>Profit</dt><dd class="${pf > 0.004 ? "pos" : ""}">${pf > 0.004 ? "+" : pf < -0.004 ? MINUS : ""}$<span>${Math.abs(pf).toFixed(2)}</span></dd>${pfSub ? `<p>${h(pfSub)}</p>` : ""}</div>` : "",
    cell("Wins in a row", `<span>${cs.w}</span>`),
    cell("Best roll", sx(tp)),
    cell("Record", `${tw}–${tl}`, plural(runs.length, "run")),
    cell("Avg points", cs.avg == null ? "–" : cs.avg.toFixed(1)),
    cell("Games", String(cur.g.length), runs.length > 1 ? `in run ${cur.n}` : "")
  ].filter(Boolean);
  const slips = [];
  for (const r of runs) for (const x of r.g) if (x.pf) slips.push({run: r.n, x});
  slips.reverse();
  const rows = cur.g.map(x => `<tr>
        <td class="c-date">${dmd(x.d)}</td>
        <td class="c-play"><span class="full">Shai Gilgeous-Alexander</span><span class="abbr">SGA</span> ${h(x.l)}+ points<span class="g"><span class="md">${dmd(x.d)}${x.o || typeof x.s === "number" || x.r === "Void" ? " · " : ""}</span>${[x.o ? h(x.o) : "", typeof x.s === "number" ? x.s + " pts" : x.r === "Void" ? "did not play" : ""].filter(Boolean).map(t => `<span class="nw">${t}</span>`).join(" · ")}</span></td>
        <td class="c-odds num">${sgaOdds(x.p)}</td>
        <td class="c-res"><span class="res">${sgaTile(x.r)}<span class="w-txt">${sgaWord(x.r)}</span></span></td>
        <td class="c-roll num">${x.r === "Loss" ? "0x" : x.r === "Pending" ? "–" : sx(x.x)}</td></tr>`).join("");
  const earlier = runs.slice(0, -1).reverse().map(r => {
    const s = sgaStat(r), f = r.g[0].d, l = r.g[r.g.length - 1].d;
    return `<tr><th scope="row">Run ${r.n}<span class="thin"> · ${dmd(f)}${l !== f ? " – " + dmd(l) : ""}</span></th><td>${r.g.length}</td><td>${s.w}–${s.l}</td><td>${sx(s.peak)}</td><td>${r.st === "bust" ? "On a miss" : r.st === "cashed" ? "Cashed out at " + sx(s.held) : "Open"}</td>${SGAS.usd ? `<td class="num">${r.usd ? usdSigned(r.usd.bank - r.usd.start) : ""}</td>` : ""}</tr>`;
  }).join("");

  const cta = `<a class="sg-btn" href="https://x.com/${HANDLE}" target="_blank" rel="noopener noreferrer">${XMARK}Follow @${HANDLE} on X${ico(PH.up)}<span class="sr"> (opens in a new tab)</span></a>`;
  const hero = `<section class="sg-hero" aria-labelledby="sg-h1">
    ${artBlock("sga")}
    <div class="sg-copy">
      <h1 class="sg-h1" id="sg-h1" data-rv>Betting SGA 20+ points <span class="sg-br">for the season.</span></h1>
      <p class="sg-lead" data-rv>${started}Every win goes straight onto the next game, and one miss ends the run.</p>
      <div class="sg-cta" data-rv>${cta}</div>
      <p class="sg-note" data-rv>Updated ${h(updDay)}${updTime ? h(updTime) : ""} · <a href="../sga.json">sga.json</a></p>
    </div>
    <div class="sg-card sg-roll" role="group" aria-label="The roll" data-rv>
      <div class="sg-rhead">
        <p class="sg-pill ${bust ? "bust" : cash ? "" : "live"}"><i aria-hidden="true"></i>${h(status)}</p>
        <p class="sg-lab">The roll</p>
      </div>
      ${big}
      <p class="sg-sub">${h(sub)}</p>
      ${prob}
      <dl class="sg-stats${cells.length % 2 ? " odd" : ""}">
        ${cells.join("\n        ")}
      </dl>
    </div>
  </section>`;

  const ladder = `<section class="sg-sec" id="roll" aria-labelledby="sg-lad-h">
    <div class="sg-head" data-rv>
      <h2 id="sg-lad-h">Run ${cur.n}, bar by bar</h2>
    </div>
    <div class="sg-card sg-chart" data-rv>
      <div class="chart sgladder" id="sg-ladder"></div>
      <div class="sg-legend" aria-hidden="true"><span class="w">hit</span><span class="l">missed</span><span class="v">sat out</span><span class="o">open</span><span class="z">first stake = 1.00x</span></div>
    </div>
  </section>`;

  const tagline = `<section class="sg-tagsec" aria-label="The idea">
    <p class="sg-tagline" id="sg-tagline">${"Every win goes onto the next game. One miss ends the run. Win or lose, it stays on this page.".split(" ").map(w => `<span class="w">${w}</span>`).join(" ")}</p>
  </section>`;

  const fw = cur.g.find(x => x.r === "Win"), lg = cur.g[cur.g.length - 1];
  const how = `<section class="sg-sec" aria-labelledby="sg-how-h">
    <div class="sg-head" data-rv>
      <h2 id="sg-how-h">How one run works</h2>
    </div>
    <div class="sg-how">
      <article class="sg-card sg-step" data-rv>
        <div class="sg-vis v1" aria-hidden="true">
          <div class="sg-slip">
            <p class="who">Shai Gilgeous-Alexander</p>
            <p class="ln">20+ points${lg.o ? " · " + h(lg.o) : ""}</p>
            <div class="rw"><span class="pr">${sgaOdds(lg.p)}</span><span class="ok">${ico(PH.check)}Placed</span></div>
          </div>
        </div>
        <div class="sg-st">
          <p class="n">Step 1</p>
          <h3>One bet on each game</h3>
          <p>The bet is Shai Gilgeous-Alexander to score 20 or more points. The price is whatever the book is offering that day.</p>
        </div>
      </article>
      <article class="sg-card sg-step" data-rv>
        <div class="sg-vis v2" aria-hidden="true">
          <div class="cols">
            <div class="col" style="--d:0s"><span class="tl">${tile("W")}</span><i class="bar" style="--h:38%"></i></div>
            <div class="col" style="--d:.6s"><span class="tl">${tile("W")}</span><i class="bar" style="--h:58%"></i></div>
            <div class="col" style="--d:1.2s"><span class="tl">${tile("W")}</span><i class="bar" style="--h:78%"></i></div>
          </div>
        </div>
        <div class="sg-st">
          <p class="n">Step 2</p>
          <h3>A win goes onto the next game</h3>
          <p>The whole payout becomes the next stake.${fw ? ` At ${sgaOdds(fw.p)}, a win took the roll from ${sx(fw.f)} to ${sx(fw.x)}.` : ""}</p>
        </div>
      </article>
      <article class="sg-card sg-step" data-rv>
        <div class="sg-vis v3" aria-hidden="true">
          <div class="peak"><span>peak</span></div>
          <div class="cols">
            <div class="col" style="--d:0s"><span class="tl">${tile("W")}</span><i class="bar" style="--h:42%"></i></div>
            <div class="col" style="--d:.6s"><span class="tl">${tile("W")}</span><i class="bar" style="--h:62%"></i></div>
            <div class="col miss"><span class="tl">${tile("L")}</span><i class="bar" style="--h:80%"></i></div>
          </div>
        </div>
        <div class="sg-st">
          <p class="n">Step 3</p>
          <h3>A miss ends the run</h3>
          <p>Fall one point short and the roll drops to zero. The run is closed, and the most it reached stays on the page.</p>
        </div>
      </article>
    </div>
  </section>`;

  const games = `<section class="sg-sec" id="games" aria-labelledby="gm-h">
    <div class="sg-head" data-rv>
      <h2 id="gm-h">Run ${cur.n}, every game in order</h2>
    </div>
    <div class="sg-card sg-tbl sg-games" data-rv>
      <table class="sgl">
        <caption class="sr">Run ${cur.n}, game by game</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Play</th><th scope="col" class="num">Price</th><th scope="col">Result</th><th scope="col" class="num">Roll</th></tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    ${earlier ? `<div class="sg-card sg-tbl sg-earlier" data-rv>
      <table class="sgl">
        <caption class="sr">Earlier runs</caption>
        <thead><tr><th scope="col">Earlier runs</th><th scope="col">Games</th><th scope="col">W–L</th><th scope="col">Peak</th><th scope="col">Ended</th>${SGAS.usd ? '<th scope="col" class="num">Profit</th>' : ""}</tr></thead>
        <tbody>${earlier}</tbody>
      </table>
    </div>` : ""}
  </section>`;

  const gallery = slips.length ? `
  <section class="sg-sec" id="proof" aria-labelledby="pf-h">
    <div class="sg-head" data-rv>
      <h2 id="pf-h">The bet slip for each game</h2>
      <p>A screenshot taken when each bet was placed. Ticket numbers are blurred before a screenshot is saved.</p>
    </div>
    <div class="sg-slips" data-rv>
      ${slips.map(s => { const alt = `Bet slip, ${dmd(s.x.d)}${s.x.o ? ", " + s.x.o : ""}, ${sgaOdds(s.x.p)}`;
        return `<a class="sgpf sg-card" href="proof/${s.x.pf}.jpg" target="_blank" rel="noopener noreferrer" title="${h(alt)}"><img src="proof/${s.x.pf}.jpg" alt="${h(alt)}" loading="lazy" width="760" height="1500"><span>${runs.length > 1 ? `Run ${s.run} · ` : ""}${dmd(s.x.d)} · ${h(s.x.o || "game")} · ${sgaOdds(s.x.p)}</span></a>`; }).join("\n      ")}
    </div>
  </section>` : "";

  const chart = {g: cur.g.map(x => ({r: x.r, f: round(x.f, 4), x: round(x.x, 4)})), peak: round(cs.peak, 4),
    label: "Bar chart of the roll going into each game of run " + cur.n};
  return `<main class="wrap sga" id="main">
  ${hero}
  ${ladder}
  ${tagline}
  ${how}
  ${games}
${gallery}
</main>
<script type="application/json" id="sg-data">${JSON.stringify(chart).replace(/</g, "\\u003c")}</script>`;
}

/* ---------- home ---------- */
const netAbs = Math.abs(A.u).toFixed(2).split(".");
const netWord = A.u < -0.004 ? "Minus" : A.u > 0.004 ? "Plus" : "";
// Units risked, to the cent. Stakes carry up to four decimals, so a total can land on a half cent
// (31.675); summing them in a different order moves it by 1e-15 and toFixed would flip. Round to
// a millionth first, then half up, so the same plays always read the same. home.js has the same rule.
const u2 = v => (Math.round(Math.round(v * 1e6) / 1e4) / 100).toFixed(2);
// The period the record covers: its first and last settled play. Dates come from the plays themselves.
const recFirst = settled.length ? settled[0].date : "", recLast = settled.length ? settled[settled.length - 1].date : "";
const recPeriod = !recFirst ? "" : recFirst.slice(0, 4) === recLast.slice(0, 4) ? `${dmd(recFirst)} – ${dlong(recLast)}` : `${dlong(recFirst)} – ${dlong(recLast)}`;
// When the data last changed: the stamp Bet Desk writes into plays.json when Darren publishes it. Never the time the
// page is built or opened. A file with no stamp says only when the latest result was.
const recUpdated = [RAW.updated ? `Data updated <time${updIso ? ` datetime="${updIso}"` : ""}>${h(RAW.updated)}</time>` : "", recLast ? `latest result ${dmd(recLast)}` : ""].filter(Boolean).join(" · ");
// "Oct 7, 2026, 1:24 AM EDT" is shown as "Oct 7, 1:24 AM EDT"; the footer carries the year.
const updShort = (RAW.updated || "–").replace(/^([A-Z][a-z]+\.? \d{1,2}), \d{4}(,)?/, "$1$2");
// Phones show only the day ("Updated Oct 7"); the time sits in its own span so CSS can drop it.
const [, updDay = updShort, updTime = ""] = updShort.match(/^([A-Z][a-z]+\.? \d{1,2})(,.*)?$/) || [];
const dataJson = JSON.stringify(DATA).replace(/</g, "\\u003c");

/* ---------- latest results: the last 15 settled plays, newest first. A still
   strip under the chart that the reader can scroll sideways; it does not move
   by itself. Same figures the log shows, so nothing new to verify. */
const TICK_N = 15;
const tickPlays = settled.slice(-TICK_N).reverse();
const tickHalf = tickPlays.map(p =>
  `<span class="tk-i"><span class="tk-d">${dmd(p.date)}</span><span class="tk-p">${h(p.play)}</span><span class="tk-u ${cls(p.pl)}">${signed(p.pl)}u</span><span class="tk-s">&rarr;</span></span>`).join("");
const ticker = tickHalf
  ? `<div class="tick" aria-hidden="true" tabindex="-1"><div class="tick-track">${tickHalf}</div></div>`
  : "";

/* ---------- how the record is counted ----------
   Each line states a rule the code above already follows (agg(): settled plays only, pushes in the
   denominator and out of the win rate, one row per play) or one written down in architecture.md
   (a round robin is one row per parlay). Nothing here is a rule the page does not apply. The SGA
   line appears only when the SGA page does. check-record.mjs holds every claim against plays.json. */
const howSga = SGAS
  ? `<div><dt>SGA 20+</dt><dd>Not in this record. The rollover has its own page (linked just above) and its own totals. A normal play on Shai Gilgeous-Alexander counts here like any other.</dd></div>`
  : "";
const howBlock = `<div class="panel how" id="how" data-rv>
      <h3 class="how-h">How the record is counted</h3>
      <dl class="how-l">
        <div><dt>Units</dt><dd>Stakes and results are in units (u). The size of a unit is not published.</dd></div>
        <div><dt>ROI</dt><dd>Net units divided by units risked, settled plays only: ${signed(A.u)}u on ${u2(A.risk)}u risked is ${signed(A.roi * 100, 1)}%.</dd></div>
        <div><dt>Pushes</dt><dd>A push returns the stake, so it adds 0u. It counts as a settled play and as the P in W-L-P, and its stake stays in units risked. Win rate is won divided by won plus lost, so pushes are left out.</dd></div>
        <div><dt>Pending</dt><dd>A play that has not settled is open. It is not in the record, the ROI, the win rate or the chart until it settles. The open count is under Settled.</dd></div>
        <div><dt>Parlays</dt><dd>A parlay is one play: one stake, one result, however many legs. A round robin is logged as one play for each parlay in it.</dd></div>
        ${howSga}
      </dl>
    </div>`;

const homeBody = `<main class="wrap" id="main">

  <!-- ============ 01 RECORD ============ -->
  <section class="record" id="record" aria-labelledby="rec-h">
    <div class="hx-f" aria-hidden="true">${artBlock("home")}<i class="hx-v"></i><i class="hx-v r"></i></div>
    <h1 class="sr" id="rec-h">Public Tracker: the record</h1>
    <div class="hero">
      <div>
        <p class="rtag" data-rv>Full record${recPeriod ? `<span> · ${recPeriod}</span>` : ""}</p>
        <p class="big${A.u < -0.004 ? " down" : ""}" data-rv aria-label="${netWord} ${Math.abs(A.u).toFixed(2)} units">${A.u < -0.004 ? MINUS : A.u > 0.004 ? "+" : ""}<span>${netAbs[0]}</span><span class="pt">.</span><span>${netAbs[1]}</span><span class="u">u</span></p>
        <p class="rupd" data-rv>${recUpdated}${recUpdated ? " · " : ""}<a href="#how">How this is counted</a></p>
      </div>
      <dl class="ledger">
        <div data-rv><dt>Settled</dt><dd>${A.n}</dd><p>${OPEN} open right now</p></div>
        <div data-rv><dt>ROI</dt><dd>${A.roi < 0 ? MINUS : A.roi > 0 ? "+" : ""}${Math.abs(A.roi * 100).toFixed(1)}<small>%</small></dd><p>on ${u2(A.risk)}u risked</p></div>
        <div data-rv><dt>W-L-P</dt><dd>${A.w}-${A.l}-${A.p}</dd></div>
        <div data-rv><dt>Win rate</dt><dd>${(A.wr * 100).toFixed(1)}<small>%</small></dd><p>${A.wr < 0.5 && A.u > 0 ? "Under half, still up." : ""}</p></div>
        <div class="lform" data-rv><dt>Last ${form.length}, oldest first</dt><dd><div class="pips" id="pips" role="img"></div></dd></div>
      </dl>
    </div>

    <div class="panel chartp" data-rv>
      <div class="phead">
        <h3>Cumulative units by day<span class="delta" id="delta"></span></h3>
        <div class="seg" role="group" aria-label="Chart range">
          <button type="button" data-r="30" aria-pressed="false">30 days</button>
          <button type="button" data-r="0" aria-pressed="true">All</button>
        </div>
      </div>
      <div class="chart" id="chart">
        <div class="tip" id="tip" aria-hidden="true"></div>
      </div>
    </div>

    ${ticker}${SGA ? "\n    " + sgaChip() : ""}

    ${howBlock}
  </section>

  <!-- ============ 02 LOG ============ -->
  <section id="log" aria-labelledby="log-h">
    <div class="shead" data-rv>
      <div><h2 id="log-h">Every play, newest first</h2></div>
      <div class="tally" id="tally" aria-live="polite"><span>Loading</span></div>
    </div>

    <div class="panel logp" data-rv>
      <div class="ctl" id="filters">
        <div class="fgroup"><span class="sr" id="lab-sport">Sport</span><div class="seg" id="f-sport" role="group" aria-labelledby="lab-sport"></div></div>
        <div class="fgroup"><span class="sr" id="lab-res">Result</span><div class="seg" id="f-res" role="group" aria-labelledby="lab-res"></div></div>
        <div class="fgroup"><label class="sr" for="f-mkt">Market</label><span class="sel"><select id="f-mkt"></select></span></div>
      </div>
      <div class="ctl ctl2" id="filters2">
        <div class="fgroup fq"><label class="sr" for="f-q">Search the log by player or play</label><input type="search" id="f-q" class="fin" placeholder="Search player or play" autocomplete="off" spellcheck="false" enterkeyhint="search"></div>
        <div class="fgroup fd" role="group" aria-labelledby="lab-dates"><span class="sr" id="lab-dates">Date range</span>
          <label class="fl" for="f-from">From</label><input type="date" id="f-from" class="fin">
          <label class="fl" for="f-to">To</label><input type="date" id="f-to" class="fin"></div>
      </div>
      <p class="fine err ferr" id="f-err" aria-live="polite"></p>
      <table class="log">
        <caption class="sr">Play log, newest first</caption>
        <thead><tr>
          <th scope="col">Date</th><th scope="col">Play</th><th scope="col">Sport</th><th scope="col">Market</th>
          <th scope="col" class="num">Odds</th><th scope="col" class="num">Stake</th><th scope="col">Result</th>
          <th scope="col" class="num">P/L</th><th scope="col"><span class="sr">Post on X</span></th>
        </tr></thead>
        <tbody id="rows">
          <tr class="state"><td colspan="9"><b>Loading the log</b>The full log is also published as <a href="plays.json">plays.json</a>.</td></tr>
        </tbody>
      </table>
      <div class="more" id="more" hidden></div>
      <a class="xhint" id="xhint" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><span>See the post</span><span class="xh-t">timestamped before the event <i>↗</i></span></a>
    </div>
  </section>

  <!-- ============ 03 BREAKDOWN + READING ============ -->
  <section id="breakdown" aria-labelledby="brk-h">
    <div class="shead" data-rv>
      <div><h2 id="brk-h">Where the units came from</h2></div>
      <div class="seg" role="tablist" aria-label="Split by" id="brk-tabs">
        <button type="button" role="tab" id="tab-sport" aria-selected="true" aria-controls="brk-panel" data-k="sport">Sport</button>
        <button type="button" role="tab" id="tab-market" aria-selected="false" aria-controls="brk-panel" data-k="market" tabindex="-1">Market</button>
        <button type="button" role="tab" id="tab-month" aria-selected="false" aria-controls="brk-panel" data-k="month" tabindex="-1">Month</button>
      </div>
    </div>
    <div class="panel bpanel" data-rv>
        <div id="brk-panel" role="tabpanel" aria-labelledby="tab-sport">
          <table class="brk">
            <caption class="sr"><span id="brk-t">By sport</span>, all ${A.n} settled plays</caption>
            <thead><tr><th scope="col" id="brk-col">Sport</th><th scope="col" class="num">Plays</th><th scope="col" class="num c-wlp">W-L-P</th>
              <th scope="col" class="c-bar"><span class="sr">Units, drawn from zero</span></th><th scope="col" class="num">Units</th><th scope="col" class="num">ROI</th></tr></thead>
            <tbody id="brk-rows"></tbody>
          </table>
          <p class="bnote">All ${A.n} settled plays. † fewer than 10 plays.</p>
        </div>
      </div>
  </section>

  <!-- ============ 04 TOOLS ============ -->
  <section id="tools" aria-labelledby="tools-h">
    <div class="shead" data-rv>
      <div><h2 id="tools-h">The arithmetic around a bet slip</h2></div>
    </div>
    <nav class="tools" aria-label="Tools">
      ${toolIndex("", "")}
    </nav>
  </section>
</main>

<!-- first visit only: home.js shows it after 25s or 60% scroll, once ever -->
<div class="nudge" id="nudge" role="dialog" aria-label="Follow @${HANDLE} on X" hidden>
  <p class="nd-t">Plays go up on X before they land here.</p>
  <a class="nd-go" id="nudge-go" href="https://x.com/${HANDLE}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/></svg>Follow @${HANDLE}<span class="sr"> (opens in a new tab)</span></a>
  <button class="nd-x" id="nudge-x" type="button" aria-label="Dismiss"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
</div>
<script type="application/json" id="pt-data">${dataJson}</script>`;

const built = [];
built.push(page({slug: "", title: "", home: true,
  desc: `Every play posted on X by @${HANDLE}, logged in units before the event starts. ${A.n} settled plays, ${signed(A.u)}u, ${signed(A.roi * 100, 1)}% ROI.`,
  body: homeBody, active: "", scripts: ["home.js"]}));

/* ---------- inner pages ---------- */
const moreTools = skip => `<section class="morecalc" aria-labelledby="more-h">
    <div class="shead" data-rv>
      <div><h2 id="more-h">More tools</h2></div>
    </div>
    <nav class="tools mtools" aria-label="More tools">
      ${toolIndex("{{rel}}", skip, true)}
    </nav>
  </section>`;

built.push(page({slug: "about", title: "About", desc: "Who is behind this tracker, the books used, and the disclosure.",
  active: "about", body: read("about.html")}));

const TOOL_PAGES = [
  ["arbitrage", "arb", "Arbitrage calculator", "Two-way arbitrage calculator: enter two prices, get the stake split, the return, and whether the pair locks a profit."],
  ["hedge", "hedge", "Hedge calculator", "Hedge a bet you already hold: the stake that locks a profit, and whether it beats the book's cash-out."],
  ["parlay", "parlay", "Parlay and round robin calculator", "Price a parlay from its legs or split it into a round robin, and see what each number of winning legs pays."],
  ["payout", "payout", "Payout calculator", "Payout for any stake and price: American, decimal, fractional, implied percent or a Kalshi multiplier."],
  ["odds", "odds", "Odds converter", "Convert a percentage to American odds, odds back to a percentage, and an exchange multiplier to a price."],
  ["devig", "devig", "Devig calculator", "Remove the vig from a two-way market with the multiplicative, additive or power method."],
  ["poker", "poker", "Poker settlement calculator", "Settle a home poker game. Enter buy-ins and cash-outs, see who pays whom in the fewest payments, and split a miscount fairly across the table."],
  ["cheat-sheet", "cheat", "Percent to American odds", "Every percentage from 1 to 99, whole or in halves, with its fair American and decimal price."]
];
// The tool's scene again, at the right of the page header (CSS shows it from
// 1000px up and hides it below). src/pages/*.html stay as they are; the scene
// is added here, to the one header each page has.
const withHeroScene = (html, slug) => {
  if (!SCENES[slug] || html.split('<header class="phero">').length !== 2 || html.split("</header>").length !== 2)
    throw new Error(`${slug}: expected exactly one phero header`);
  return html.replace('<header class="phero">', '<header class="phero has-sc">')
    .replace("</header>", `  <div class="tsc-hero" data-rv>${SCENES[slug]}</div>\n    </header>`);
};
for (const [slug, key, title, desc] of TOOL_PAGES) {
  const body = `<main class="wrap" id="main">
${withHeroScene(read(slug + ".html"), slug)}
  ${moreTools(slug)}
</main>`;
  built.push(page({slug, title, desc, active: "tool", tool: key, body, scripts: ["tools.js"]}));
}

/* ---------- SGA 20+: the page, its screenshots and its data ---------- */
if (SGA) {
  built.push(page({slug: "sga", title: "SGA 20+ rollover",
    desc: "Betting Shai Gilgeous-Alexander over 20 points for the season, every win rolled onto the next game. The live multiplier, the profit, every price and every result.",
    active: "sga", body: sgaBody(), scripts: ["sga.js"]}));
  const proofDir = path.join(DIST, "sga", "proof");
  const used = new Set(SGA.runs.flatMap(r => r.g.map(x => x.pf).filter(Boolean)));
  if (used.size) fs.mkdirSync(proofDir, {recursive: true});
  for (const id of used) fs.copyFileSync(path.join(SITE_DIR, "sga", "proof", id + ".jpg"), path.join(proofDir, id + ".jpg"));
  // the same data as a plain file, in words: multiples of the first stake, nothing else
  fs.writeFileSync(path.join(DIST, "sga.json"), JSON.stringify({
    units_only: !SGAS.usd,
    note: "Every roll is a multiple of the first stake. Dollar figures, when present, are what a run started with and what it is worth now. There is no book and no per-game stake in this file.",
    updated: RAW.updated || "",
    ...(SGAS.usd ? {profit_usd: SGAS.profit} : {}),
    runs: SGA.runs.map(r => ({run: r.n, status: r.st,
      ...(r.usd ? {started_with_usd: r.usd.start, worth_now_usd: r.usd.bank, profit_usd: round(r.usd.bank - r.usd.start, 2)} : {}),
      games: r.g.map(x => ({
      date: x.d, opponent: x.o, line: x.l, price: x.p, result: x.r, points: x.s === undefined ? null : x.s,
      roll_before: round(x.f, 4), roll_after: round(x.x, 4), slip: x.pf ? `sga/proof/${x.pf}.jpg` : null}))}))
  }, null, 2) + "\n");
}

/* ---------- how-to-read redirect: the page was removed but the URL may be shared ---------- */
{
  const dir = path.join(DIST, "how-to-read");
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Public Tracker · @${HANDLE}</title>
<meta http-equiv="refresh" content="0; url=${ORIGIN}/">
<link rel="canonical" href="${ORIGIN}/">
</head>
<body>
<p><a href="${ORIGIN}/">Back to the tracker</a></p>
</body>
</html>
`);
  built.push(path.join(dir, "index.html"));
}

/* ---------- 404: self-contained, because it is served at any depth ---------- */
{
  const css = fs.readFileSync(path.join(SRC, "site.css"), "utf8");
  const js = fs.readFileSync(path.join(SRC, "site.js"), "utf8");
  const links = (SGA ? ['<a class="lbtn" href="/sga/">SGA 20+ rollover</a>'] : []).concat(TOOL_PAGES.map(t => `<a class="lbtn" href="/${t[0]}/">${h(t[2])}</a>`)).join("\n          ");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="robots" content="noindex,follow">
<title>Page not found · Public Tracker</title>
<link rel="icon" href="${ICON}">
${PREPAINT}
<style>${css}</style>
</head>
<body>
${header("/", "", false)}
<main class="wrap" id="main">
  <div class="phero">
    <p class="kicker" data-rv>404</p>
    <h1 class="th" data-rv>That page is <em>not here</em>.</h1>
    <p class="lede" data-rv>The address may be old, or it may have a typo in it. Everything on this site is one of the pages below.</p>
    <div class="links" data-rv>
          <a class="lbtn pri" href="/">Back to the tracker</a>
          <a class="lbtn" href="/about/">About</a>
          ${links}
    </div>
  </div>
</main>
<script>${js}</script>
${UMAMI}
</body>
</html>
`;
  fs.writeFileSync(path.join(DIST, "404.html"), html);
  built.push(path.join(DIST, "404.html"));
}

/* ---------- data and crawler files ---------- */
fs.copyFileSync(PLAYS_PATH, path.join(DIST, "plays.json"));
for (const f of ["og.png", "robots.txt"]) {
  const p = path.join(SITE_DIR, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, f));
}
const lastmod = updIso || new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[["", "daily", "1.0"], ["about"], ...(SGA ? [["sga", "daily", "0.6"]] : []), ...TOOL_PAGES.map(t => [t[0]])].map(([s, f = "monthly", pr = "0.7"]) =>
  `  <url><loc>${ORIGIN}/${s ? s + "/" : ""}</loc><lastmod>${lastmod}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`);

/* ---------- report ---------- */
console.log(`plays.json  ${path.relative(process.cwd(), PLAYS_PATH) || PLAYS_PATH}`);
console.log(`record      ${A.n} settled · ${A.w}-${A.l}-${A.p} · ${signed(A.u)}u · ROI ${signed(A.roi * 100, 1)}% · ${series.length} days`);
console.log(`wrote       ${built.length} pages to ${path.relative(process.cwd(), DIST) || DIST}`);
for (const f of built) console.log("            " + path.relative(DIST, f));
