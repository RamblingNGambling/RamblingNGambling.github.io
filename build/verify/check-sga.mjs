#!/usr/bin/env node
/* Checks for the optional SGA 20+ page.

     node verify/check-sga.mjs

   Builds the site in a throwaway copy (a temp folder, never the real one) with good, bad and
   hostile sga.json files and checks what comes out: no file means no page; junk is ignored
   with a warning and the rest of the site still builds; books, stakes and markup that sneak
   into the file reach no page; the only dollar figures are a run's starting stake and what it
   is worth now, and only when both are plain numbers; a screenshot is linked only if its file
   is there. Exits non-zero on any failure. No dependencies, no browser. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD_SRC = path.resolve(HERE, "..");
const PLAYS = [path.join(BUILD_SRC, "..", "plays.json"), path.join(BUILD_SRC, "..", "site", "plays.json")].find(p => fs.existsSync(p));
if (!PLAYS) throw new Error("plays.json not found next to the build folder");

/* a private copy: <tmp>/site/{plays.json, build/{build.mjs, src}} */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sga-check-"));
const SITE = path.join(TMP, "site");
fs.mkdirSync(path.join(SITE, "build"), {recursive: true});
fs.copyFileSync(PLAYS, path.join(SITE, "plays.json"));
fs.copyFileSync(path.join(BUILD_SRC, "build.mjs"), path.join(SITE, "build", "build.mjs"));
fs.cpSync(path.join(BUILD_SRC, "src"), path.join(SITE, "build", "src"), {recursive: true});
const BUILD = path.join(SITE, "build", "build.mjs"), DIST = path.join(SITE, "build", "dist");
const FILE = path.join(SITE, "sga.json"), PROOF = path.join(SITE, "sga", "proof");
fs.mkdirSync(PROOF, {recursive: true});
fs.writeFileSync(path.join(PROOF, "aaaaaaaa11111111.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

const game = (o = {}) => ({d: "2026-10-25", o: "vs LAC", l: 20, p: -670, r: "Win", f: 1, x: 1.1493, s: 34, ...o});
const file = (runs, o = {}) => ({units_only: true, updated: "Oct 25, 2026, 10:56 PM EDT", line: 20, runs, ...o});
function build(content) {
  if (content === null) fs.rmSync(FILE, {force: true});
  else fs.writeFileSync(FILE, typeof content === "string" ? content : JSON.stringify(content));
  const r = spawnSync(process.execPath, [BUILD], {cwd: TMP, encoding: "utf8"});
  return {code: r.status, out: r.stdout, err: r.stderr, has: p => fs.existsSync(path.join(DIST, p)),
          read: p => fs.readFileSync(path.join(DIST, p), "utf8")};
}
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS: " + name); }
let record = "";
try {
  test("no file: no page, no link, and the build succeeds", () => {
    const b = build(null);
    assert.equal(b.code, 0, b.err);
    assert(!b.has("sga/index.html") && !b.has("sga.json"));
    assert(!b.read("index.html").includes("sgchip") && !b.read("sitemap.xml").includes("/sga/") && !b.read("404.html").includes("/sga/"));
    for (const p of ["index.html", "about/index.html", "404.html"]) assert(!b.read(p).includes('id="sgfloat"'), p + " has the floating tab");
    record = b.out.split("\n").find(l => l.startsWith("record"));
    assert(record, "the build prints its record line");
  });

  test("a good file builds the page, the data file, the floating tab, the home line, the sitemap line and the 404 link", () => {
    const b = build(file([{n: 1, st: "live", g: [game({pf: "aaaaaaaa11111111", pm: 1})]}]));
    assert.equal(b.code, 0, b.err);
    assert(b.has("sga/index.html") && b.has("sga.json") && b.has("sga/proof/aaaaaaaa11111111.jpg"));
    assert(b.read("index.html").includes('class="sgchip') && b.read("about/index.html").includes('href="../sga/"'));
    assert(b.read("sitemap.xml").includes("/sga/") && b.read("404.html").includes('href="/sga/"'));
    const j = JSON.parse(b.read("sga.json"));
    assert.equal(j.units_only, true, "no dollar figure in the file: it says so");
    assert.equal(j.profit_usd, undefined);
    assert.equal(j.runs[0].games[0].slip, "sga/proof/aaaaaaaa11111111.jpg");
    const p = b.read("sga/index.html");
    assert.equal(p.match(/<h1/g).length, 1);
    assert(p.includes("Betting SGA 20+ points <em>for the season.</em>") && p.includes("Every win goes straight onto the next game."));
    assert(!p.includes("Started with") && !/\$\d/.test(p) && !p.includes("<dt>Profit</dt>"), "no dollar figure given: none shown");
    assert(!p.includes("How it works") && !p.includes("Where the prices come from") && !p.includes("The first stake is not shown."));
  });

  test("the floating tab hangs in the header of every page but the SGA page, and the menu has no SGA link", () => {
    const b = build(file([{n: 1, st: "live", g: [game()]}]));
    assert.equal(b.code, 0, b.err);
    for (const p of ["index.html", "about/index.html", "odds/index.html", "404.html"]) {
      const page = b.read(p), head = page.match(/<header class="top">[\s\S]*?<\/header>/)[0];
      assert.equal((page.match(/id="sgfloat"/g) || []).length, 1, p);
      assert(head.includes('id="sgfloat"'), p + ": the tab is inside the header");
      assert(head.includes("pt-sga-seen") && head.includes("SGA 20+ for the season"), p);
      assert(!head.match(/<nav[\s\S]*?<\/nav>/)[0].includes("sga"), p + ": the menu has no SGA link");
    }
    assert(b.read("about/index.html").includes('href="../sga/"'), "a nested page points one folder up");
    const own = b.read("sga/index.html");
    assert(!own.includes('id="sgfloat"'), "the SGA page does not point at itself");
    assert(b.read("assets/sga.js").includes("pt-sga-seen"), "opening the SGA page marks the tab as used");
  });

  for (const [name, content, why] of [
    ["not JSON", "this is not json {", "not valid JSON"],
    ["not an SGA file", {runs: []}, "not an SGA file"],
    ["units_only false", file([{n: 1, st: "live", g: [game()]}], {units_only: false}), "not an SGA file"],
    ["runs not a list", file("x"), "not an SGA file"],
    ["a run with a bad status", file([{n: 1, st: "winning", g: [game()]}]), "run 1"],
    ["a price that is not a price", file([{n: 1, st: "live", g: [game({p: 5})]}]), "run 1, game 1"],
    ["a bad date", file([{n: 1, st: "live", g: [game({d: "10/25/2026"})]}]), "run 1, game 1"],
    ["a result nobody knows", file([{n: 1, st: "live", g: [game({r: "Cashout"})]}]), "run 1, game 1"],
    ["a roll that is text", file([{n: 1, st: "live", g: [game({x: "big"})]}]), "run 1, game 1"],
    ["points that are negative", file([{n: 1, st: "live", g: [game({s: -3})]}]), "run 1, game 1"]
  ]) test("junk is ignored with a warning and the rest of the site still builds: " + name, () => {
    const b = build(content);
    assert.equal(b.code, 0, b.err);
    assert(!b.has("sga/index.html") && !b.has("sga.json"));
    assert(b.err.includes("sga.json ignored: " + why), b.err);
    assert(b.has("index.html") && b.has("about/index.html"), "the rest of the site is built");
    assert(!b.read("index.html").includes("sgchip"));
  });

  test("an empty list, or runs with no games, gives no page and no warning", () => {
    for (const c of [file([]), file([{n: 1, st: "live", g: []}])]) {
      const b = build(c);
      assert.equal(b.code, 0);
      assert(!b.has("sga/index.html"));
      assert.equal(b.err.trim(), "");
    }
  });

  test("money, books and stakes that sneak into the file reach no page and no data file", () => {
    const evil = file([{n: 1, st: "live", stake: 777.77, bankroll: 99999, g: [game({stake: 555.55, amt: 4242.42, book: "ZZBook", cash: 31337, tag: "ZZTag", deposit: 8675309})]}],
      {stake: 11111, bankroll: 22222, unitSize: 33333, books: ["ZZBook"]});
    const b = build(evil);
    assert.equal(b.code, 0, b.err);
    for (const p of ["sga/index.html", "sga.json", "index.html", "sitemap.xml"])
      for (const secret of ["777.77", "99999", "555.55", "4242.42", "ZZBook", "31337", "ZZTag", "8675309", "11111", "22222", "33333"])
        assert(!b.read(p).includes(secret), p + " carried " + secret);
  });

  test("text from the file is cleaned: no markup, no dollar sign, a length limit", () => {
    const b = build(file([{n: 1, st: "live", g: [game({o: "<img src=x onerror=alert(1)> $500 " + "Z".repeat(60)})]}]));
    assert.equal(b.code, 0, b.err);
    const page = b.read("sga/index.html");
    assert(!page.includes("<img src=x") && !page.includes("onerror=") && !page.includes("$500") && !page.includes("Z".repeat(30)));
    const o = JSON.parse(b.read("sga.json")).runs[0].games[0].opponent;
    assert(o.length <= 24 && !/[<>$]/.test(o), o);
  });

  test("a screenshot is linked only if its file exists and its name is plain", () => {
    const b = build(file([{n: 1, st: "live", g: [
      game({pf: "aaaaaaaa11111111"}), game({d: "2026-10-26", pf: "bbbbbbbb22222222"}),
      game({d: "2026-10-27", pf: "../../plays"}), game({d: "2026-10-28", pf: "AAAA1111"})]}]));
    assert.equal(b.code, 0, b.err);
    const page = b.read("sga/index.html");
    assert.equal((page.match(/class="sgpf"/g) || []).length, 1);
    assert(page.includes("proof/aaaaaaaa11111111.jpg"));
    assert(!page.includes("bbbbbbbb22222222") && !page.includes("../../plays") && !page.includes("AAAA1111"));
    assert(b.has("sga/proof/aaaaaaaa11111111.jpg") && !b.has("sga/proof/bbbbbbbb22222222.jpg"));
  });

  /* the one place money may appear: what a run started with and what it is worth now (the "usd" of a run) */
  const dollars = page => [...new Set(page.match(/\$\d[\d,]*(?:\.\d\d)?/g) || [])].sort();

  test("a run's starting stake and worth give a profit counter, 'Started with' in the intro, and nothing more", () => {
    const b = build(file([{n: 1, st: "live", usd: {start: 30, bank: 34.481}, g: [game({pf: "aaaaaaaa11111111", pm: 0})]}]));
    assert.equal(b.code, 0, b.err);
    const p = b.read("sga/index.html");
    assert(p.includes("Started with $30 on Oct 25. Every win goes straight onto the next game."), "intro");
    assert(p.includes('<dt>Profit</dt><dd class="pos">+$<span data-cu="4.48" data-dp="2">4.48</span></dd><p>worth $34.48 now</p>'), "profit tile");
    assert(p.includes('class="ledger five"'));
    assert.deepEqual(dollars(p), ["$30", "$34.48"], "the only dollar figures on the page");
    assert(b.read("index.html").includes("1.15x · +$4.48"), "the floating tab carries the figure");
    const j = JSON.parse(b.read("sga.json"));
    assert.equal(j.units_only, false, "a file with dollar figures does not say it is units only");
    assert.equal(j.profit_usd, 4.48);
    assert.deepEqual([j.runs[0].started_with_usd, j.runs[0].worth_now_usd, j.runs[0].profit_usd], [30, 34.48, 4.48]);
  });

  test("a figure that is not a plain starting stake and worth is ignored: the page shows no money at all", () => {
    for (const usd of [{start: 0, bank: 5}, {start: -3, bank: 5}, {start: "30", bank: 31}, {start: 30}, {start: 30, bank: -1},
      {start: 1e9, bank: 1}, {start: NaN, bank: 1}, "lots", null, [30, 31]]) {
      const b = build(file([{n: 1, st: "live", usd, g: [game()]}]));
      assert.equal(b.code, 0, b.err);
      assert(b.has("sga/index.html"), JSON.stringify(usd) + ": the page still builds");
      const p = b.read("sga/index.html"), j = JSON.parse(b.read("sga.json"));
      assert(!/\$\d/.test(p) && !p.includes("<dt>Profit</dt>") && !p.includes("Started with"), JSON.stringify(usd));
      assert(!b.read("index.html").includes("+$") && j.units_only === true && j.profit_usd === undefined && j.runs[0].started_with_usd === undefined, JSON.stringify(usd));
    }
  });

  test("anything else tucked inside a run's dollar figures is dropped", () => {
    const b = build(file([{n: 1, st: "live", usd: {start: 30, bank: 34.48, cash: 31337, book: "ZZBook", stake: 555.55, bankroll: 99999}, g: [game({stake: 777.77})]}]));
    assert.equal(b.code, 0, b.err);
    for (const p of ["sga/index.html", "sga.json", "index.html"])
      for (const secret of ["31337", "ZZBook", "555.55", "99999", "777.77"]) assert(!b.read(p).includes(secret), p + " carried " + secret);
    assert.deepEqual(dollars(b.read("sga/index.html")), ["$30", "$34.48"]);
  });

  test("profit adds up across runs, shows a minus when down, and fills the earlier-runs column", () => {
    const b = build(file([{n: 1, st: "bust", usd: {start: 30, bank: 0}, g: [game(), game({d: "2026-10-27", r: "Loss", f: 1.1493, x: 0})]},
      {n: 2, st: "live", usd: {start: 30, bank: 12.5}, g: [game({d: "2026-10-30"})]}]));
    assert.equal(b.code, 0, b.err);
    const p = b.read("sga/index.html");
    assert(p.includes('<dt>Profit</dt><dd class="">−$<span data-cu="47.50" data-dp="2">47.50</span></dd><p>2 runs combined</p>'), "−30 and −17.50 make −47.50");
    assert(p.includes('<th scope="col" class="num">Profit</th>') && p.includes('<td class="num">−$30</td>'), "the earlier run's profit");
    assert(p.includes("Started with $30 on Oct 25."), "the first run's start");
    assert.equal(JSON.parse(b.read("sga.json")).profit_usd, -47.5);
    assert(b.read("index.html").includes("−$47.50"));
  });

  test("a run that ends on a miss shows what it started with, not what it is worth", () => {
    const b = build(file([{n: 1, st: "bust", usd: {start: 30, bank: 0}, g: [game(), game({d: "2026-10-27", r: "Loss", f: 1.1493, x: 0})]}]));
    const p = b.read("sga/index.html");
    assert(p.includes("<p>started with $30</p>") && p.includes("−$<span"));
  });

  test("every state of a run reads right: bust, cashed out, first game open, a long run on a log scale", () => {
    let b = build(file([{n: 1, st: "bust", g: [game(), game({d: "2026-10-27", r: "Loss", f: 1.1493, x: 0, s: 14})]}]));
    let p = b.read("sga/index.html");
    assert(p.includes("Run 1 ended") && p.includes('class="big down"') && p.includes("One miss ended it."));
    b = build(file([{n: 1, st: "cashed", g: [game()]}]));
    p = b.read("sga/index.html");
    assert(p.includes("Run 1 cashed out") && p.includes("Cashed out after 1 win in a row."));
    b = build(file([{n: 1, st: "live", g: [game({r: "Pending", f: 1, x: 1, s: undefined})]}]));
    p = b.read("sga/index.html");
    assert(p.includes("game open") && p.includes("The open game vs LAC is at"));
    const long = Array.from({length: 46}, (_, i) => game({d: new Date(Date.UTC(2026, 7, 2 + i)).toISOString().slice(0, 10), f: Math.pow(1.11, i), x: Math.pow(1.11, i + 1)}));
    b = build(file([{n: 1, st: "live", g: long}]));
    p = b.read("sga/index.html");
    const data = JSON.parse(p.match(/<script type="application\/json" id="sg-data">(.*?)<\/script>/s)[1]);
    assert.equal(data.g.length, 46);
    assert(data.peak > 8, "a run this big is drawn on a log scale by sga.js");
  });

  test("two runs: the latest in full, the earlier one in a table", () => {
    const b = build(file([{n: 1, st: "bust", g: [game(), game({d: "2026-10-27", r: "Loss", f: 1.1493, x: 0})]}, {n: 2, st: "live", g: [game({d: "2026-10-30"})]}]));
    const p = b.read("sga/index.html");
    assert(p.includes("Run 2, every game in order") && p.includes("Earlier runs") && p.includes("On a miss") && p.includes("2 runs"));
  });

  test("the record on the home page is the same with or without the SGA page", () => {
    const b = build(file([{n: 1, st: "live", g: [game()]}]));
    assert.equal(b.out.split("\n").find(l => l.startsWith("record")), record);
  });
} finally {
  fs.rmSync(TMP, {recursive: true, force: true});
}
console.log("PASS: " + n + " SGA page checks.");
