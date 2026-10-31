#!/usr/bin/env node
/* Checks for the optional SGA 20+ page.

     node verify/check-sga.mjs

   Builds the site in a throwaway copy (a temp folder, never the real one) with good, bad and
   hostile sga.json files and checks what comes out: no file means no page; junk is ignored
   with a warning and the rest of the site still builds; books, stakes and markup that sneak
   into the file reach no page; the only dollar figures are a run's starting stake and what it
   is worth now, and only when both are plain numbers; a screenshot is linked only if its file
   is there. It also checks the page's own sections: the hero and its one X button, the three
   "How it works" cards, the tagline, the slip gallery, that the FAQ, the closing card and the
   games strip stay off the page, and the copy rules for the written text (no em dash, no
   spaced hyphen, no emoji, no he/she/his/him/her). Exits non-zero on any failure. No
   dependencies, no browser. */
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
/* the visible words of some html: no scripts, no styles, no tags, entities decoded, spaces squeezed */
const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = html => decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const ldOf = page => (page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
const stepOf = (page, k) => (page.match(new RegExp('<div class="sg-st">\\s*<p class="n">Step ' + k + "</p>[\\s\\S]*?</div>")) || [])[0];
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
    assert(p.includes('Betting SGA 20+ points <span class="sg-br">for the season.</span>'), "the headline");
    assert(p.includes('<p class="sg-lead" data-rv>Every win goes straight onto the next game, and one miss ends the run.</p>'), "the lead line, no dollars");
    assert(!p.includes("Started with") && !/\$\d/.test(p) && !p.includes("<dt>Profit</dt>"), "no dollar figure given: none shown");
    assert(p.includes('<dl class="sg-stats odd">'), "five cells without the profit cell: the grid is marked odd");
    assert(p.includes("How one run works") && (p.match(/class="sg-card sg-step"/g) || []).length === 3, "the three How it works cards");
    assert(!p.includes("Where the prices come from") && !p.includes("The first stake is not shown."));
  });

  test("the floating tab hangs in the header of every page but the SGA page and the home page (the home page has the chip instead), and the menu has no SGA link", () => {
    const b = build(file([{n: 1, st: "live", g: [game()]}]));
    assert.equal(b.code, 0, b.err);
    const home = b.read("index.html");
    assert(!home.includes('id="sgfloat"'), "the home page has no floating tab: the chip is its one promotion");
    assert.equal((home.match(/href="sga\/"/g) || []).length, 1, "one link to the SGA page on the home page");
    assert(!home.match(/<header class="top">[\s\S]*?<\/header>/)[0].match(/<nav[\s\S]*?<\/nav>/)[0].includes("sga"), "index.html: the menu has no SGA link");
    for (const p of ["about/index.html", "odds/index.html", "404.html"]) {
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
    assert.equal((page.match(/class="sgpf sg-card"/g) || []).length, 1);
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
    assert(p.includes("Started with $30 on Oct 25. Every win goes straight onto the next game, and one miss ends the run."), "intro");
    assert(p.includes('<div class="pt"><dt>Profit</dt><dd class="pos">+$<span>4.48</span></dd><p>worth $34.48 now</p></div>'), "profit tile");
    assert(p.includes('<dl class="sg-stats">') && !p.includes("sg-stats odd"), "six cells with the profit cell: an even grid");
    assert.deepEqual(dollars(p), ["$30", "$34.48"], "the only dollar figures on the page");
    const chip = b.read("index.html").match(/<a class="sgchip[\s\S]*?<\/a>/)[0];
    assert(chip.includes("1.15x · 1 win in a row · +$4.48"), "the home page's chip carries the approved dollar profit");
    assert(b.read("odds/index.html").includes("1.15x · +$4.48"), "the floating tab on the other pages still carries it");
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
      assert(!/\$\d/.test(p) && !p.includes("<dt>Profit</dt>") && !p.includes("Started with") && !p.includes("What does the profit mean?"), JSON.stringify(usd));
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
    assert(p.includes('<dt>Profit</dt><dd class="">−$<span>47.50</span></dd><p>2 runs combined</p>'), "−30 and −17.50 make −47.50");
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
    assert(p.includes("Run 1 ended") && p.includes('class="sg-pill bust"') && p.includes('class="sg-big down"') && p.includes("One miss ended it."));
    assert(p.includes("<dt>Record</dt><dd>1–1</dd>"), "the record has an en dash");
    b = build(file([{n: 1, st: "cashed", g: [game()]}]));
    p = b.read("sga/index.html");
    assert(p.includes("Run 1 cashed out") && p.includes('class="sg-pill "') && p.includes("Cashed out after 1 win in a row."));
    assert(p.includes("<dt>Record</dt><dd>1–0</dd>") && p.includes('class="sg-big"') && !p.includes('class="sg-big down"'));
    b = build(file([{n: 1, st: "live", g: [game({r: "Pending", f: 1, x: 1, s: undefined})]}]));
    p = b.read("sga/index.html");
    assert(p.includes("game open") && p.includes('class="sg-pill live"') && p.includes("The open game vs LAC is at"));
    const long = Array.from({length: 46}, (_, i) => game({d: new Date(Date.UTC(2026, 7, 2 + i)).toISOString().slice(0, 10), f: Math.pow(1.11, i), x: Math.pow(1.11, i + 1)}));
    b = build(file([{n: 1, st: "live", g: long}]));
    p = b.read("sga/index.html");
    const data = JSON.parse(p.match(/<script type="application\/json" id="sg-data">(.*?)<\/script>/s)[1]);
    assert.equal(data.g.length, 46);
    assert(data.peak > 8, "a run this big is drawn on a log scale by sga.js");
    assert(/about a 1 in \d+ chance/.test(p) && !p.includes("1-in-"), "a long shot reads as '1 in N'");
  });

  test("two runs: the latest in full, the earlier one in a table", () => {
    const b = build(file([{n: 1, st: "bust", g: [game(), game({d: "2026-10-27", r: "Loss", f: 1.1493, x: 0})]}, {n: 2, st: "live", g: [game({d: "2026-10-30"})]}]));
    const p = b.read("sga/index.html");
    assert(p.includes("Run 2, every game in order") && p.includes('<th scope="col">Earlier runs</th>') && p.includes("On a miss") && p.includes("2 runs"));
    assert(p.includes('<th scope="col">W–L</th>') && p.includes("<td>1–1</td>"), "the earlier run's record, with an en dash");
    assert(p.includes("<dt>Record</dt><dd>2–1</dd>"), "the record adds up across runs");
    const t = p.match(/<div class="sg-card sg-tbl sg-games"[\s\S]*?<\/table>/)[0];
    assert.equal((t.match(/<tr>/g) || []).length, 1 + 1, "the game table shows the latest run only: its header row and one game");
    for (const c of ["c-date", "c-play", "c-odds", "c-res", "c-roll"]) assert(t.includes('class="' + c), c);
  });

  test("the record on the home page is the same with or without the SGA page", () => {
    const b = build(file([{n: 1, st: "live", g: [game()]}]));
    assert.equal(b.out.split("\n").find(l => l.startsWith("record")), record);
  });

  test("the hero has the one button, a link to the X profile, and every new-tab link opens safely", () => {
    const p = build(file([{n: 1, st: "live", g: [game({pf: "aaaaaaaa11111111"})]}])).read("sga/index.html");
    const btns = p.match(/<a class="sg-btn"[^>]*>[\s\S]*?<\/a>/g) || [];
    assert.equal(btns.length, 1, "one button, in the hero");
    assert(btns[0].includes('href="https://x.com/gamblingv1ctim"'), "points at the X profile");
    assert(btns[0].includes('rel="noopener noreferrer"') && btns[0].includes('target="_blank"'));
    assert(p.match(/<section class="sg-hero"[\s\S]*?<\/section>/)[0].includes(btns[0]), "the button is in the hero");
    for (const a of p.match(/<a [^>]*target="_blank"[^>]*>/g)) assert(a.includes('rel="noopener noreferrer"'), a);
  });

  test("no FAQ, no FAQ schema, no closing card and no games strip on the page", () => {
    for (const run of [{n: 1, st: "live", g: [game({pf: "aaaaaaaa11111111"})]}, {n: 1, st: "live", usd: {start: 30, bank: 34.48}, g: [game()]}]) {
      const p = build(file([run])).read("sga/index.html"), t = textOf(p);
      assert(!p.includes("<details") && !p.includes('id="faq"') && !t.includes("Questions people ask"), "no questions");
      assert(!ldOf(p) && !p.includes("FAQPage"), "no FAQ schema");
      assert(!p.includes("sg-endsec") && !t.includes("Follow the run."), "no closing card");
      assert(!p.includes("sg-pipsrow") && !t.includes("Games, oldest first"), "no games strip in the roll card");
    }
  });

  test("the tagline has whole sentences, one span per word, and the words add up to the sentence", () => {
    const p = build(file([{n: 1, st: "live", g: [game()]}])).read("sga/index.html");
    const inner = p.match(/<p class="sg-tagline" id="sg-tagline">([\s\S]*?)<\/p>/)[1];
    const words = [...inner.matchAll(/<span class="w">([^<]*)<\/span>/g)].map(m => decode(m[1]));
    const sentence = decode(inner.replace(/<[^>]+>/g, ""));
    assert(words.length >= 12, words.length + " words");
    assert(words.every(w => w && !/\s/.test(w)), "one word in each span");
    assert.equal(words.join(" "), sentence, "the spans are the sentence, in order, with nothing added or lost");
    assert(/[.!?]$/.test(sentence) && (sentence.match(/[^.!?]+[.!?]/g) || []).length >= 2, "at least two sentences: " + sentence);
  });

  test("the written copy has no em dash, no spaced hyphen, no emoji and no he, she, his, him or her", () => {
    const rules = [[/—/, "em dash"], [/ - /, "spaced hyphen"], [/\p{Extended_Pictographic}|️|‍/u, "emoji"], [/\b(?:he|she|his|him|her)\b/i, "pronoun"]];
    const broken = s => rules.filter(([re]) => re.test(s.replaceAll("Gilgeous-Alexander", "Gilgeous Alexander"))).map(r => r[1]);
    for (const [s, what] of [["a — b", "em dash"], ["a - b", "spaced hyphen"], ["go 🔥", "emoji"], ["he won", "pronoun"], ["Her turn", "pronoun"], ["on his own", "pronoun"]])
      assert.deepEqual(broken(s), [what], "the rule must catch: " + s);
    for (const ok of ["Shai Gilgeous-Alexander scores 20+", "Every win goes on", "whether the other one", "−670 to +150"]) assert.deepEqual(broken(ok), [], ok);
    const fixtures = [
      file([{n: 1, st: "live", g: [game()]}]),
      file([{n: 1, st: "live", usd: {start: 30, bank: 34.48}, g: [game({pf: "aaaaaaaa11111111"})]}]),
      file([{n: 1, st: "bust", g: [game({r: "Loss", f: 1, x: 0})]}, {n: 2, st: "live", g: [game({d: "2026-10-30", r: "Pending", f: 1, x: 1, s: undefined})]}]),
      file([{n: 1, st: "cashed", g: [game({p: 150, f: 1, x: 2.5})]}])];
    for (const c of fixtures) {
      const p = build(c).read("sga/index.html");
      const parts = [
        ...(p.match(/<p class="sg-lead"[^>]*>[\s\S]*?<\/p>/g) || []),
        ...(p.match(/<p class="sg-tagline"[^>]*>[\s\S]*?<\/p>/g) || []),
        ...(p.match(/<div class="sg-st">[\s\S]*?<\/div>/g) || [])];
      assert(parts.length >= 1 + 1 + 3, "found the lead, the tagline and three cards: " + parts.length);
      for (const part of parts) assert.deepEqual(broken(textOf(part)), [], textOf(part));
    }
  });

  test("how it works: step 2 quotes the first win's price and its roll before and after, and says nothing of the sort without a win", () => {
    let p = build(file([{n: 1, st: "live", g: [game({p: -670, f: 1, x: 1.1493}), game({d: "2026-10-26", p: -300, f: 1.1493, x: 1.532})]}])).read("sga/index.html");
    let t = textOf(stepOf(p, 2));
    assert(t.includes("−670") && t.includes("1.00x") && t.includes("1.15x"), t);
    assert(!t.includes("−300") && !t.includes("1.53x"), "only the first win is quoted: " + t);
    p = build(file([{n: 1, st: "live", g: [game({p: 150, f: 1, x: 2.5})]}])).read("sga/index.html");
    t = textOf(stepOf(p, 2));
    assert(t.includes("+150") && t.includes("1.00x") && t.includes("2.50x"), "a plus price: " + t);
    for (const g of [[game({r: "Pending", f: 1, x: 1, s: undefined})], [game({r: "Loss", f: 1, x: 0})], [game({r: "Void", f: 1, x: 1, s: undefined})]]) {
      p = build(file([{n: 1, st: g[0].r === "Loss" ? "bust" : "live", g}])).read("sga/index.html");
      t = textOf(stepOf(p, 2));
      assert(t.includes("The whole payout becomes the next stake.") && !/\bfrom\b/i.test(t) && !/\d/.test(t.replace("Step 2", "")), "no win, no 'from' clause: " + t);
    }
    assert.equal((p.match(/<p class="n">Step \d<\/p>/g) || []).length, 3);
  });

  test("the slip gallery is there only when a screenshot is", () => {
    for (const run of [{n: 1, st: "live", g: [game()]}, {n: 1, st: "live", g: [game({pf: "bbbbbbbb22222222"})]}]) {
      const p = build(file([run])).read("sga/index.html");
      assert(!p.includes('id="proof"') && !p.includes("Proof of placement") && !p.includes("sg-slips") && !p.includes("proof/"), "no screenshot file: no gallery");
    }
    const p = build(file([{n: 1, st: "live", g: [game({pf: "aaaaaaaa11111111"})]}])).read("sga/index.html");
    assert(p.includes('id="proof"') && p.includes("proof/aaaaaaaa11111111.jpg"));
  });

  test("the step pictures do not restyle the About page's .cols (every page shares one stylesheet)", () => {
    const css = fs.readFileSync(path.join(BUILD_SRC, "src", "site.css"), "utf8");
    assert.ok(/^\.cols\{display:grid/m.test(css), "the About two-column rule is there");
    assert.ok(!/^\.cols\{[^}]*position:absolute/m.test(css), "an unscoped .cols{position:absolute} breaks the About page");
    assert.deepEqual(css.split(String.fromCharCode(10)).filter(l => /^\.(col|peak)[{.\s]/.test(l)), [], "an unscoped .col or .peak rule");
    assert.ok(/^\.sg-vis \.cols\{position:absolute/m.test(css), "the step pictures keep their bars");
  });
} finally {
  fs.rmSync(TMP, {recursive: true, force: true});
}
console.log("PASS: " + n + " SGA page checks.");
