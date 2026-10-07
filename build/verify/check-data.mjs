#!/usr/bin/env node
/* Data checks for the built site, independent of the build's own maths.

     node verify/check-data.mjs [path/to/plays.json]

   1. Equity curve: the cumulative sum of units_pl in date order must end at
      the hero net-units figure printed on dist/index.html.
   2. The data inlined in dist/index.html must match plays.json row for row.
   3. Filters: every sport x market x result combination is counted straight
      from plays.json and written to verify/expected.json, which the browser
      check (check-pages.py) clicks through. A few are printed here.
   Exits non-zero on any mismatch. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const DIST = path.join(ROOT, "dist");
const arg = process.argv[2];
const PLAYS = arg ? path.resolve(arg)
  : [path.join(ROOT, "..", "plays.json"), path.join(ROOT, "..", "site", "plays.json")].find(p => fs.existsSync(p));
const raw = JSON.parse(fs.readFileSync(PLAYS, "utf8")).plays;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };
const R = {Win: "W", Loss: "L", Push: "P"};

/* ---------- 1. equity curve vs hero ---------- */
const settled = raw.map((p, i) => ({...p, i})).filter(p => R[p.result])
  .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i);
let run = 0;
const curve = [];
for (const p of settled) {
  run += p.units_pl;
  if (curve.length && curve[curve.length - 1][0] === p.date) curve[curve.length - 1][1] = run;
  else curve.push([p.date, run]);
}
const net = raw.filter(p => R[p.result]).reduce((a, p) => a + p.units_pl, 0);
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const hero = /class="big[^"]*"[^>]*aria-label="(Plus|Minus|) ?([\d.]+) units"/.exec(html);
const heroVal = hero ? (hero[1] === "Minus" ? -1 : 1) * +hero[2] : NaN;
console.log(`curve       ${curve.length} days, ${curve[0][0]} to ${curve[curve.length - 1][0]}, ends at ${run.toFixed(4)}u`);
console.log(`hero        ${hero ? hero[0].replace(/.*aria-label=/, "") : "(not found)"}`);
ok(Math.abs(run - net) < 1e-9, `cumulative sum in date order (${run.toFixed(6)}) equals plain sum of units_pl (${net.toFixed(6)})`);
ok(hero && heroVal.toFixed(2) === run.toFixed(2), `hero net units ${hero ? heroVal.toFixed(2) : "?"} equals curve end ${run.toFixed(2)}`);

/* ---------- 2. inlined data ---------- */
const m = /<script type="application\/json" id="pt-data">([\s\S]*?)<\/script>/.exec(html);
ok(!!m, "dist/index.html carries its data inline (#pt-data)");
const D = JSON.parse(m[1]);
ok(D.plays.length === raw.length, `inlined plays ${D.plays.length} = plays.json ${raw.length}`);
ok(D.series.length === curve.length && D.series.every((s, i) => s[0] === curve[i][0] && Math.abs(s[1] - curve[i][1]) < 1e-5),
  `inlined equity series matches the independent curve day by day (${curve.length} days)`);
ok(Math.abs(D.series[D.series.length - 1][1] - net) < 1e-5, "inlined series ends at the net figure");
let rowsOk = true;
for (const r of D.plays) {
  const p = raw[r[0]];
  if (!p || p.date !== r[1] || p.sport !== r[2] || p.market !== r[3] || p.play !== r[4] || (R[p.result] || p.result) !== r[8] ||
      Math.abs((R[p.result] ? p.units_pl : 0) - r[9]) > 1e-6) { rowsOk = false; console.log("  mismatch", r); break; }
}
ok(rowsOk, "every inlined row matches its plays.json row (date, sport, market, play, result, P/L)");
const order = D.plays.every((r, i) => !i || D.plays[i - 1][1] > r[1] || (D.plays[i - 1][1] === r[1] && D.plays[i - 1][0] > r[0]));
ok(order, "inlined log is newest first");
const recW = settled.filter(p => p.result === "Win").length, recL = settled.filter(p => p.result === "Loss").length, recP = settled.filter(p => p.result === "Push").length;
ok(html.includes(`<dd>${recW}-${recL}-${recP}</dd>`), `home ledger shows ${recW}-${recL}-${recP}`);

/* ---------- 3. filter combinations ---------- */
const uniq = k => [...new Set(raw.map(p => p[k]))].sort();
const combos = [];
for (const sport of ["All", ...uniq("sport")])
  for (const market of ["All", ...uniq("market")])
    for (const result of ["All", "W", "L", "P"]) {
      const list = raw.filter(p => (sport === "All" || p.sport === sport) && (market === "All" || p.market === market) &&
        (result === "All" || R[p.result] === result));
      const w = list.filter(p => p.result === "Win").length, l = list.filter(p => p.result === "Loss").length, pu = list.filter(p => p.result === "Push").length;
      const u = list.reduce((a, p) => a + (R[p.result] ? p.units_pl : 0), 0);
      combos.push({sport, market, result, n: list.length, wlp: `${w}-${l}-${pu}`, net: u});
    }
fs.writeFileSync(path.join(HERE, "expected.json"), JSON.stringify({net, days: curve.length, combos}, null, 1));
console.log(`filters     ${combos.length} combinations written to verify/expected.json`);
const show = [["MLB", "Moneyline", "All"], ["NFL", "Player prop", "W"], ["WNBA", "Spread", "L"], ["All", "Parlay", "All"],
  ["NCAAF", "All", "P"], ["MLB", "All", "P"], ["UFC", "All", "All"], ["All", "All", "All"]];
for (const [s, mk, r] of show) {
  const c = combos.find(c => c.sport === s && c.market === mk && c.result === r);
  if (c) console.log(`  ${(s + " / " + mk + " / " + r).padEnd(30)} ${String(c.n).padStart(4)} plays  ${c.wlp.padEnd(10)} ${(c.net >= 0 ? "+" : "") + c.net.toFixed(2)}u`);
}
// The same predicate the page uses, run over the inlined rows, must agree.
const page = (s, mk, r) => D.plays.filter(x => (s === "All" || x[2] === s) && (mk === "All" || x[3] === mk) && (r === "All" || x[8] === r)).length;
ok(combos.every(c => page(c.sport, c.market, c.result) === c.n), "page filter predicate over the inlined rows gives the same count for all combinations");
const all = combos.find(c => c.sport === "All" && c.market === "All" && c.result === "All");
ok(all.n === raw.length && Math.abs(all.net - net) < 1e-9, "unfiltered log total equals the record");

console.log(fails ? `\n${fails} check(s) failed` : "\nall data checks passed");
process.exit(fails ? 1 : 0);
