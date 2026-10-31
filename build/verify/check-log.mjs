#!/usr/bin/env node
/* The play log's filter rules and summary, tested on the code that ships.
   Pulls the "filter logic" block out of src/home.js (not a copy), runs it over the rows inlined in
   dist/index.html, and compares with figures worked out here, straight from plays.json, with its
   own result words (Win, Loss, Push, Pending) and its own loops.

     node build.mjs && node verify/check-log.mjs

   Covers: sport, market and result filters including Pending; the text search (case, spaces, word
   order, play or game only); the date range (one-sided, one day, backwards); the summary (count,
   W-L-P, net, open, units risked) for every combination; units risked rounding the same in any order;
   Clear filters' "active" test; and the markup and styles the phone view relies on.
   What needs a browser (typing, Details, focus) is in log-scenario.js and log-phone.js, run by check-pages.py. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(HERE, "..");
const PLAYS = [path.join(BUILD, "..", "plays.json"), path.join(BUILD, "..", "site", "plays.json")].find(p => fs.existsSync(p));
if (!PLAYS) throw new Error("plays.json not found next to the build folder");
const raw = JSON.parse(fs.readFileSync(PLAYS, "utf8")).plays;
const indexPath = path.join(BUILD, "dist", "index.html");
if (!fs.existsSync(indexPath)) throw new Error("dist/index.html missing: run node build.mjs first");
const html = fs.readFileSync(indexPath, "utf8");
const D = JSON.parse(html.match(/<script type="application\/json" id="pt-data">([\s\S]*?)<\/script>/)[1].replace(/\\u003c/g, "<"));
const src = fs.readFileSync(path.join(BUILD, "src", "home.js"), "utf8");
const css = fs.readFileSync(path.join(BUILD, "src", "site.css"), "utf8");

const a = src.indexOf("/* ---------- filter logic"), b = src.indexOf("/* ---------- end filter logic ----------");
assert.ok(a > 0 && b > a, "filter logic block not found in src/home.js");
const L = new Function(src.slice(a, b) + "\nreturn {isSettled,isOpen,rangeBad,textOk,dateOk,resOk,matches,isActive,summarize};")();
const u2 = new Function(src.match(/const u2=[^\n]+/)[0] + "\nreturn u2;")();

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS: " + name); } catch (e) { fail++; console.log("FAIL: " + name + "\n      " + String(e.message).split("\n")[0]); } };
const NONE = {sport: "All", market: "All", result: "All", q: "", from: "", to: ""};
const F = o => ({...NONE, ...o});
const CODE = {Win: "W", Loss: "L", Push: "P"};
const ROWS = D.plays;

// Worked out here, from the file: filter by plays.json fields and result words.
function expectFor(f) {
  const q = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const bad = f.from && f.to && f.from > f.to;
  const keep = raw.filter(p => !bad
    && (f.sport === "All" || p.sport === f.sport) && (f.market === "All" || p.market === f.market)
    && (f.result === "All" || (f.result === "Pending" ? p.result === "Pending" : CODE[p.result] === f.result))
    && q.every(w => (p.play + " " + (p.game || "")).toLowerCase().includes(w))
    && (!f.from || p.date >= f.from) && (!f.to || p.date <= f.to));
  const s = {n: keep.length, w: 0, l: 0, p: 0, open: 0, netMicro: 0, riskMicro: 0};
  for (const p of keep) {
    if (p.result === "Win") s.w++; else if (p.result === "Loss") s.l++; else if (p.result === "Push") s.p++; else if (p.result === "Pending") s.open++;
    if (CODE[p.result]) { s.netMicro += Math.round(p.units_pl * 1e6); s.riskMicro += Math.round(p.units * 1e6); }
  }
  return s;
}
const gotFor = f => { const s = L.summarize(ROWS.filter(r => L.matches(f, r))); return {...s, netMicro: Math.round(s.net * 1e6), riskMicro: Math.round(s.risk * 1e6)}; };
const sameSummary = (f, label) => {
  const g = gotFor(f), e = expectFor(f);
  assert.deepEqual([g.n, g.w, g.l, g.p, g.open], [e.n, e.w, e.l, e.p, e.open], label + " counts");
  assert.ok(Math.abs(g.netMicro - e.netMicro) <= 5, label + " net " + g.net);          // a few millionths of float noise at most
  assert.equal(u2(g.risk), (Math.round(e.riskMicro / 1e4) / 100).toFixed(2), label + " risked");
};

const SPORTS = ["All", ...new Set(raw.map(p => p.sport))], MARKETS = ["All", ...new Set(raw.map(p => p.market))];
t("the page holds every row of plays.json, and the Pending play is not settled", () => {
  assert.equal(ROWS.length, raw.length);
  assert.equal(ROWS.filter(r => L.isOpen(r[8])).length, raw.filter(p => p.result === "Pending").length);
  assert.ok(ROWS.every(r => L.isSettled(r[8]) === !!CODE[raw[r[0]].result]), "settled flag agrees row by row");
});
t("no filters: the summary is the whole record", () => { sameSummary(NONE, "whole log"); assert.equal(gotFor(NONE).n, raw.length); });
t("every sport x market x result (including Pending): count, W-L-P, open, net and risked all match", () => {
  let n = 0;
  for (const sport of SPORTS) for (const market of MARKETS) for (const result of ["All", "W", "L", "P", "Pending"]) { sameSummary(F({sport, market, result}), `${sport}/${market}/${result}`); n++; }
  assert.ok(n >= 100, "combinations run: " + n);
});
t("Pending is the open plays only, and shows no settled figures", () => {
  const g = gotFor(F({result: "Pending"}));
  assert.equal(g.n, raw.filter(p => p.result === "Pending").length);
  assert.deepEqual([g.w, g.l, g.p, g.settled], [0, 0, 0, 0]);
  assert.equal(g.open, g.n);
});
t("search: any case, extra spaces, any word order; every word must be in the play or its game", () => {
  for (const q of ["mcmillan", "MCMILLAN", "  mcmillan  ", "over receiving", "receiving over", "OVER   rec", "parlay", "zzzzqq", "o", "5", "+", "yards over 4"])
    sameSummary(F({q}), `search "${q}"`);
  assert.equal(gotFor(F({q: "zzzzqq"})).n, 0);
  assert.equal(gotFor(F({q: "   "})).n, raw.length, "a blank search is no filter");
});
t("search looks at the play and the game only, not the sport or market", () => {
  const sport = raw.find(p => p.sport === "WNBA");
  const hit = L.textOk(F({q: "wnba"}), [0, "2026-01-01", "WNBA", "Spread", "Some Player Over 1.5", "", 0, 1, "W", 0.9, ""]);
  assert.equal(hit, false, "'wnba' in the sport column alone does not match");
  assert.equal(L.textOk(F({q: "lakers"}), [0, "2026-01-01", "NBA", "Spread", "Some Player Over 1.5", "Lakers vs Suns", 0, 1, "W", 0.9, ""]), true, "a word in the game matches");
  assert.ok(sport);
});
t("dates: from, to, both, one day, outside the data, and a backwards range matching nothing", () => {
  const days = [...new Set(raw.map(p => p.date))].sort(), first = days[0], last = days[days.length - 1], mid = days[Math.floor(days.length / 2)];
  for (const [from, to] of [[first, last], [mid, ""], ["", mid], [mid, mid], [first, first], [last, last], ["2000-01-01", "2000-12-31"], ["2099-01-01", ""], ["", "1999-01-01"]])
    sameSummary(F({from, to}), `dates ${from || "…"} to ${to || "…"}`);
  assert.equal(gotFor(F({from: "2026-10-20", to: "2026-10-01"})).n, 0, "backwards matches nothing");
  assert.equal(L.rangeBad(F({from: "2026-10-20", to: "2026-10-01"})), true);
  assert.equal(L.rangeBad(F({from: "2026-10-01", to: "2026-10-01"})), false, "the same day is a valid range");
  assert.equal(L.rangeBad(F({from: "2026-10-01"})), false);
});
t("everything at once", () => {
  for (const f of [F({sport: "NFL", result: "L", q: "over", from: "2026-10-01", to: "2026-10-30"}), F({sport: "MLB", market: "Moneyline", result: "W", from: "2026-08-01"}),
                   F({market: "Player prop", q: "rec yds", to: "2026-10-26"}), F({sport: "NFL", result: "Pending", q: "mcconkey"})]) sameSummary(f, JSON.stringify(f));
});
t("isActive: true for any filter, false for none, and a blank search is not a filter", () => {
  assert.equal(L.isActive(NONE), false);
  for (const o of [{sport: "NFL"}, {market: "Total"}, {result: "Pending"}, {q: "x"}, {from: "2026-10-01"}, {to: "2026-10-01"}]) assert.equal(L.isActive(F(o)), true, JSON.stringify(o));
  assert.equal(L.isActive(F({q: "   "})), false);
});
t("units risked: the same plays give the same figure in any order, and a half cent rounds up", () => {
  const rows = ROWS.filter(r => L.isSettled(r[8]));
  const want = u2(L.summarize(rows).risk);
  for (let k = 0; k < 40; k++) {
    const sh = rows.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = (i * 7919 + k * 104729) % (i + 1); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    assert.equal(u2(L.summarize(sh).risk), want, "order " + k);
  }
  assert.equal(u2(31.675), "31.68"); assert.equal(u2(31.675000000000004), "31.68"); assert.equal(u2(31.67499999999999), "31.68", "float noise below the half cent still reads .68");
  assert.equal(u2(0), "0.00"); assert.equal(u2(256.9477), "256.95");
  const m = html.match(/on ([0-9.]+)u risked/);
  assert.equal(m[1], u2(L.summarize(ROWS.filter(r => L.isSettled(r[8]))).risk), "the record above the log reads the same figure");
});
t("the markup: labelled search and date boxes, an error line other readers are told about, the full-record tag, the Pending button is built by script", () => {
  for (const id of ["f-q", "f-from", "f-to"]) assert.match(html, new RegExp(`<label[^>]*for="${id}"`), id + " has a label");
  assert.match(html, /<input type="search" id="f-q"[^>]*autocomplete="off"/);
  assert.match(html, /<input type="date" id="f-from"/); assert.match(html, /<input type="date" id="f-to"/);
  assert.match(html, /<p class="fine err ferr" id="f-err" aria-live="polite"><\/p>/);
  assert.match(html, /<p class="rtag" data-rv>Full record<span> · [A-Z][a-z]{2} \d{1,2}[^<]*<\/span><\/p>/);   // the period itself is held by check-record.mjs
  assert.match(src, /\["Pending","Pending"\]/);
  assert.match(src, /e\.target\.closest\("a,button,summary,details"\)/, "a tap on Details must not open the post");
});
t("the phone view keeps the open count and units risked, shows stake, and hides the wide Details cell on desktop", () => {
  assert.ok(!/\.ledger p,\.ledger>\.lform\{display:none\}/.test(css), "the sublabels are no longer all hidden on phones");
  assert.match(css, /\.ledger>\.lform,\.ledger>div:nth-child\(4\) p\{display:none\}/);
  assert.ok(!/\.log td\.c-stake\{display:none\}/.test(css), "the stake is not hidden on phones");
  assert.match(css, /\.c-more\{display:none\}/);
  assert.match(css, /\.log td\.c-more\{display:block/);
  assert.match(css, /\.log tr\[data-open\] \.res \.w-txt\{position:static/, "Pending stays visible as a word on phones");
  assert.ok(!/\.log \.nolink\{display:none\}/.test(css), "a missing link is not hidden on phones");
});
t("rows: an unsettled play gets a dash for profit and the word for result; every row carries Details; links come from the same field", () => {
  assert.match(src, /const profit=settled\?uHTML\(pl\):`<span class="zero-v" aria-hidden="true">–<\/span><span class="sr">No profit yet, not settled<\/span>`/);
  assert.match(src, /<td class="c-more"><details><summary aria-label="Details for \$\{esc\(play\)\}">Details<\/summary>/);
  assert.match(src, /No post link on file/);
  assert.match(src, /noopener noreferrer/);
});
t("units only: no dollar figure on the home page except the approved SGA chip", () => {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const money = body.match(/[+−-]?\$\d[\d.,]*/g) || [];
  const chip = (body.match(/<a class="sgchip[\s\S]*?<\/a>/) || [""])[0];
  for (const m of money) assert.ok(chip.includes(m), "a dollar figure outside the SGA chip: " + m);
  // home.js uses $ as its selector helper and in template placeholders; it must never use one as a currency sign
  assert.ok(!/\$\d|["']\$["']|`\$[^{(]/.test(src), "home.js writes a dollar figure or a currency sign");
});

console.log(fail ? `\n${fail} FAILED, ${pass} passed.` : `\nPASS: ${pass} play log checks.`);
process.exit(fail ? 1 : 0);
