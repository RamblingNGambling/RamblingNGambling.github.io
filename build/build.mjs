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
const ASSET = {};
for (const f of ["site.css", "site.js", "home.js", "tools.js"]) {
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
// script error drops it so nothing stays hidden.
const PREPAINT = `<script>
(function(){
  var r=document.documentElement,p='auto';
  try{p=localStorage.getItem('pt-theme')||localStorage.getItem('rg.theme')||'auto'}catch(e){}
  if(p!=='dark'&&p!=='light')p='auto';
  var dark=p==='dark'||(p==='auto'&&!matchMedia('(prefers-color-scheme: light)').matches);
  r.dataset.pref=p;r.dataset.theme=dark?'dark':'light';r.style.colorScheme=dark?'dark':'light';
  if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    r.classList.add('motion');addEventListener('error',function(){r.classList.remove('motion')});
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
// Both the home index and the inner pages' "More tools" give each tool a
// number, its name and a one-line summary, at every width.
const toolIndex = (rel, skip) => TOOLS.filter(t => t[0] !== skip).map((t, i) =>
  `<a class="tool" data-rv href="${rel}${t[0]}/"><span class="i">${String(i + 1).padStart(2, "0")}</span><span class="nm">${h(t[1])}</span><span class="sd">${h(t[2])}</span></a>`).join("\n      ");

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
      ${a(rel + "how-to-read/", "How to read", "read")}
      ${a(rel + "about/", "About", "about")}
    </nav>
    <button class="theme" id="theme" type="button" aria-label="Theme">
      <svg id="th-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>
      <span class="tl" id="th-lab">Auto</span>
    </button>
  </div>
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
        <a href="${rel}how-to-read/">How to read</a>
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
<a class="skip" href="#main">Skip to the content</a>

${header(rel, active, home)}

${body.replaceAll("{{rel}}", rel)}

${footer(rel, home)}

<script src="${rel}${ASSET["site.js"]}"></script>
${scripts.map(s => `<script src="${rel}${ASSET[s]}"></script>`).join("\n")}
${UMAMI}
</body>
</html>
`;
  const out = path.join(DIST, slug, "index.html");
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, html);
  return out;
}

/* ---------- home ---------- */
const first = settled.length ? settled[0].date : "", last = settled.length ? settled[settled.length - 1].date : "";
const span = !first ? "nothing settled yet"
  : first.slice(0, 4) === last.slice(0, 4) ? `${dmd(first)} to ${dlong(last)}` : `${dlong(first)} to ${dlong(last)}`;
const netAbs = Math.abs(A.u).toFixed(2).split(".");
const netWord = A.u < -0.004 ? "Minus" : A.u > 0.004 ? "Plus" : "";
// "Oct 7, 2026, 1:24 AM EDT" reads as "Oct 7, 1:24 AM EDT" beside a span that already names the year.
const updShort = (RAW.updated || "–").replace(/^([A-Z][a-z]+\.? \d{1,2}), \d{4}(,)?/, "$1$2");
const dataJson = JSON.stringify(DATA).replace(/</g, "\\u003c");

/* ---------- ticker: the last 15 settled results, newest first. Pure CSS
   marquee under the hero; the track carries two identical halves so the
   loop is seamless. Same figures the log shows, so nothing new to verify. */
const TICK_N = 15;
const tickPlays = settled.slice(-TICK_N).reverse();
const tickHalf = tickPlays.map(p =>
  `<span class="tk-i"><span class="tk-d">${dmd(p.date)}</span><span class="tk-p">${h(p.play)}</span><span class="tk-u ${cls(p.pl)}">${signed(p.pl)}u</span><span class="tk-s">&rarr;</span></span>`).join("");
const ticker = tickHalf
  ? `<div class="tick" aria-hidden="true"><div class="tick-track" style="--tick-d:${Math.max(24, Math.round(tickPlays.length * 2.8))}s">${tickHalf}${tickHalf}</div></div>`
  : "";

const homeBody = `<main class="wrap" id="main">

  <!-- ============ 01 RECORD ============ -->
  <section class="record" id="record" aria-labelledby="rec-h">
    <h1 class="sr" id="rec-h">Public Tracker: the record</h1>
    <p class="eyebrow" data-rv><span class="no">01</span><span>The record</span>
      <span class="ey-r"><span>${span}</span><span class="dot"> · </span><span>Updated ${h(updShort)} · <a href="plays.json">plays.json</a></span></span></p>
    <div class="hero">
      <div>
        <p class="big${A.u < -0.004 ? " down" : ""}" data-rv data-to="${round(A.u, 6)}" aria-label="${netWord} ${Math.abs(A.u).toFixed(2)} units">${A.u < -0.004 ? MINUS : A.u > 0.004 ? "+" : ""}<span id="cu-i">${netAbs[0]}</span><span class="pt">.</span><span id="cu-d">${netAbs[1]}</span><span class="u">u</span></p>
      </div>
      <dl class="ledger">
        <div data-rv><dt>Settled</dt><dd><span data-cu="${A.n}">${A.n}</span></dd><p>${OPEN} open right now</p></div>
        <div data-rv><dt>ROI</dt><dd>${A.roi < 0 ? MINUS : A.roi > 0 ? "+" : ""}<span data-cu="${Math.abs(A.roi * 100).toFixed(1)}" data-dp="1">${Math.abs(A.roi * 100).toFixed(1)}</span><small>%</small></dd><p>on ${A.risk.toFixed(2)}u risked</p></div>
        <div data-rv><dt>W-L-P</dt><dd>${A.w}-${A.l}-${A.p}</dd><p>pushes return the stake</p></div>
        <div data-rv><dt>Win rate</dt><dd>${(A.wr * 100).toFixed(1)}<small>%</small></dd><p>${A.wr < 0.5 && A.u > 0 ? "Under half, still up. " : ""}<a href="#reading">Why</a></p></div>
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

    ${ticker}
  </section>

  <!-- ============ 02 LOG ============ -->
  <section id="log" aria-labelledby="log-h">
    <div class="shead" data-rv>
      <div><p class="eyebrow"><span class="no">02</span><span>Play log</span></p><h2 id="log-h">Every play, newest first</h2></div>
      <div class="tally" id="tally" aria-live="polite"><span>Loading</span></div>
    </div>

    <div class="panel logp" data-rv>
      <div class="ctl" id="filters">
        <div class="fgroup"><span class="sr" id="lab-sport">Sport</span><div class="seg" id="f-sport" role="group" aria-labelledby="lab-sport"></div></div>
        <div class="fgroup"><span class="sr" id="lab-res">Result</span><div class="seg" id="f-res" role="group" aria-labelledby="lab-res"></div></div>
        <div class="fgroup"><label class="sr" for="f-mkt">Market</label><span class="sel"><select id="f-mkt"></select></span></div>
      </div>
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
      <a class="xhint" id="xhint" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><span>See the post that called it</span><span class="xh-t"><span class="xh-d">—</span> timestamped before the event <i>↗</i></span></a>
    </div>
  </section>

  <!-- ============ 03 BREAKDOWN + READING ============ -->
  <section id="breakdown" aria-labelledby="brk-h">
    <div class="shead" data-rv>
      <div><p class="eyebrow"><span class="no">03</span><span>Breakdown</span></p><h2 id="brk-h">Where the units came from</h2></div>
      <div class="seg" role="tablist" aria-label="Split by" id="brk-tabs">
        <button type="button" role="tab" id="tab-sport" aria-selected="true" aria-controls="brk-panel" data-k="sport">Sport</button>
        <button type="button" role="tab" id="tab-market" aria-selected="false" aria-controls="brk-panel" data-k="market" tabindex="-1">Market</button>
        <button type="button" role="tab" id="tab-month" aria-selected="false" aria-controls="brk-panel" data-k="month" tabindex="-1">Month</button>
      </div>
    </div>
    <div class="split">
      <div class="panel bpanel" data-rv>
        <div id="brk-panel" role="tabpanel" aria-labelledby="tab-sport">
          <table class="brk">
            <caption class="sr"><span id="brk-t">By sport</span>, all ${A.n} settled plays</caption>
            <thead><tr><th scope="col" id="brk-col">Sport</th><th scope="col" class="num">Plays</th><th scope="col" class="num c-wlp">W-L-P</th>
              <th scope="col" class="c-bar"><span class="sr">Units, drawn from zero</span></th><th scope="col" class="num">Units</th><th scope="col" class="num">ROI</th></tr></thead>
            <tbody id="brk-rows"></tbody>
          </table>
          <p class="bnote">All ${A.n} settled plays. ROI is units won over units risked; pushes count as risked, voids do not. Rows marked † have fewer than 10 plays: read them as a record, not a rate.</p>
        </div>
      </div>

      <aside class="read" id="reading" data-rv aria-labelledby="read-h">
        <p class="q" id="read-h">A losing win rate can still be a winning record.</p>
        <p>Not every bet pays the same. The price decides how often a play has to land just to break even:</p>
        <dl class="be">
          <dt>At −110</dt><dd>52.4% to break even</dd>
          <dt>At +150</dt><dd>40.0% to break even</dd>
        </dl>
        <p>So the win rate on its own says very little. <b>ROI</b> is the number that counts, and the <b>sample size</b> beside it matters as much.</p>
        <div class="links">
          <a class="lbtn pri" href="how-to-read/">How to read the record</a>
          <a class="lbtn" href="about/">About</a>
        </div>
      </aside>
    </div>
  </section>

  <!-- ============ 04 TOOLS ============ -->
  <section id="tools" aria-labelledby="tools-h">
    <div class="shead" data-rv>
      <div><p class="eyebrow"><span class="no">04</span><span>Tools</span></p><h2 id="tools-h">The arithmetic around a bet slip</h2></div>
    </div>
    <nav class="tools" aria-label="Tools">
      ${toolIndex("", "")}
    </nav>
  </section>
</main>

<!-- first visit only: home.js shows it after 25s or 60% scroll, once ever -->
<div class="nudge" id="nudge" role="dialog" aria-label="Follow @${HANDLE} on X" hidden>
  <p class="eyebrow">New here</p>
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
      <div><p class="eyebrow">More tools</p><h2 id="more-h">The other tools</h2></div>
      <p>Each one opens on its own page.</p>
    </div>
    <nav class="tools" aria-label="Other tools">
      ${toolIndex("{{rel}}", skip)}
    </nav>
  </section>`;

built.push(page({slug: "about", title: "About", desc: "Who is behind this tracker, the books used, and the disclosure.",
  active: "about", body: read("about.html")}));
built.push(page({slug: "how-to-read", title: "How to read it",
  desc: "What the numbers on the tracker mean: units, ROI, win rate, sample size, pushes and voids.",
  active: "read", body: read("how-to-read.html")}));

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
for (const [slug, key, title, desc] of TOOL_PAGES) {
  const body = `<main class="wrap" id="main">
${read(slug + ".html")}
  ${moreTools(slug)}
</main>`;
  built.push(page({slug, title, desc, active: "tool", tool: key, body, scripts: ["tools.js"]}));
}

/* ---------- 404: self-contained, because it is served at any depth ---------- */
{
  const css = fs.readFileSync(path.join(SRC, "site.css"), "utf8");
  const js = fs.readFileSync(path.join(SRC, "site.js"), "utf8");
  const links = TOOL_PAGES.map(t => `<a class="lbtn" href="/${t[0]}/">${h(t[2])}</a>`).join("\n          ");
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
          <a class="lbtn" href="/how-to-read/">How to read it</a>
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
${[["", "daily", "1.0"], ["about"], ["how-to-read"], ...TOOL_PAGES.map(t => [t[0]])].map(([s, f = "monthly", pr = "0.7"]) =>
  `  <url><loc>${ORIGIN}/${s ? s + "/" : ""}</loc><lastmod>${lastmod}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join("\n")}
</urlset>
`);

/* ---------- report ---------- */
console.log(`plays.json  ${path.relative(process.cwd(), PLAYS_PATH) || PLAYS_PATH}`);
console.log(`record      ${A.n} settled · ${A.w}-${A.l}-${A.p} · ${signed(A.u)}u · ROI ${signed(A.roi * 100, 1)}% · ${series.length} days`);
console.log(`wrote       ${built.length} pages to ${path.relative(process.cwd(), DIST) || DIST}`);
for (const f of built) console.log("            " + path.relative(DIST, f));
