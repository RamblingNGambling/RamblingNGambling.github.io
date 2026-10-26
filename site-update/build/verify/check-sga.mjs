#!/usr/bin/env node
/* Checks for the optional SGA 20+ page.

     node verify/check-sga.mjs

   Builds the site in a throwaway copy (a temp folder, never the real one) with good, bad and
   hostile sga.json files and checks what comes out: no file means no page; junk is ignored
   with a warning and the rest of the site still builds; money, books and markup that sneak
   into the file reach no page; a screenshot is linked only if its file is there. Exits
   non-zero on any failure. No dependencies, no browser. */
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
    record = b.out.split("\n").find(l => l.startsWith("record"));
    assert(record, "the build prints its record line");
  });

  test("a good file builds the page, the data file, the menu link, the home line, the sitemap line and the 404 link", () => {
    const b = build(file([{n: 1, st: "live", g: [game({pf: "aaaaaaaa11111111", pm: 1})]}]));
    assert.equal(b.code, 0, b.err);
    assert(b.has("sga/index.html") && b.has("sga.json") && b.has("sga/proof/aaaaaaaa11111111.jpg"));
    assert(b.read("index.html").includes('class="sgchip') && b.read("about/index.html").includes('href="../sga/"'));
    assert(b.read("sitemap.xml").includes("/sga/") && b.read("404.html").includes('href="/sga/"'));
    const j = JSON.parse(b.read("sga.json"));
    assert.equal(j.units_only, true);
    assert.equal(j.runs[0].games[0].slip, "sga/proof/aaaaaaaa11111111.jpg");
    assert.equal(b.read("sga/index.html").match(/<h1/g).length, 1);
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

  test("dollar amounts left visible on a slip change what the page claims", () => {
    let b = build(file([{n: 1, st: "live", g: [game({pf: "aaaaaaaa11111111", pm: 1})]}]));
    assert(b.read("sga/index.html").includes("The first stake is not shown."));
    b = build(file([{n: 1, st: "live", g: [game({pf: "aaaaaaaa11111111", pm: 0})]}]));
    assert(!b.read("sga/index.html").includes("The first stake is not shown."));
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
