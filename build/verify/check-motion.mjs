#!/usr/bin/env node
/* Checks for the decoration added in October 2026: the looping scenes on the home Tools tiles
   and in the tool-page headers, and the dots and frame lines on the home hero.

     node verify/check-motion.mjs

   Builds the site in a throwaway copy (a temp folder) and checks the output: eight scenes on the
   home tiles and none in the "More tools" strips; one scene in each tool-page header; every
   scene is aria-hidden; a tile's link text is the same as without the scene; no dollar sign,
   book name or emoji in a scene; the hero frame is on the home page only; both CSS blocks and
   the reduced-motion rule are there; no regex lookbehind in the shared script or stylesheet.
   Exits non-zero on any failure. No dependencies, no browser. */
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "motion-check-"));
const SITE = path.join(TMP, "site");
fs.mkdirSync(path.join(SITE, "build"), {recursive: true});
fs.copyFileSync(PLAYS, path.join(SITE, "plays.json"));
fs.copyFileSync(path.join(BUILD_SRC, "build.mjs"), path.join(SITE, "build", "build.mjs"));
fs.cpSync(path.join(BUILD_SRC, "src"), path.join(SITE, "build", "src"), {recursive: true});
const run = spawnSync(process.execPath, [path.join(SITE, "build", "build.mjs")], {cwd: TMP, encoding: "utf8"});
const DIST = path.join(SITE, "build", "dist");

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS: " + name); } catch (e) { fail++; console.log("FAIL: " + name + "\n      " + String(e.message).split("\n")[0]); } };
const page = p => fs.readFileSync(path.join(DIST, p, "index.html"), "utf8");
const SLUGS = ["arbitrage", "hedge", "parlay", "payout", "odds", "devig", "poker", "cheat-sheet"];
const count = (s, re) => (s.match(re) || []).length;

t("the build succeeds", () => assert.equal(run.status, 0, run.stderr));
const home = fs.existsSync(path.join(DIST, "index.html")) ? fs.readFileSync(path.join(DIST, "index.html"), "utf8") : "";
const scenesSrc = fs.readFileSync(path.join(BUILD_SRC, "src", "scenes.mjs"), "utf8");
const css = fs.readFileSync(path.join(BUILD_SRC, "src", "site.css"), "utf8");
const js = fs.readFileSync(path.join(BUILD_SRC, "src", "site.js"), "utf8");

t("home: eight scenes, one on each Tools tile", () => {
  const tools = home.split('aria-label="Tools"')[1].split("</nav>")[0];
  assert.equal(count(tools, /<a class="tool has-sc"/g), 8);
  assert.equal(count(tools, /<svg[^>]*class="tsc"/g), 8);
});
t("every scene is hidden from screen readers", () => {
  const svgs = home.match(/<svg[^>]*class="tsc"[^>]*>/g) || [];
  assert.equal(svgs.length, 8);
  for (const s of svgs) assert.match(s, /aria-hidden="true"/);
});
t("a tile's link text is the number, the name and the summary, with or without its scene", () => {
  const tools = home.split('aria-label="Tools"')[1].split("</nav>")[0];
  const tiles = tools.match(/<a class="tool has-sc"[\s\S]*?<\/a>/g);
  assert.equal(tiles.length, 8);
  tiles.forEach((a, i) => {
    const text = a.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "|").split("|").filter(Boolean);
    assert.equal(text.length, 3, a.slice(0, 80));
    assert.equal(text[0], String(i + 1).padStart(2, "0"));
  });
});
t("tool pages: one scene in each header, none in the More tools strip", () => {
  for (const s of SLUGS) {
    const p = page(s);
    assert.equal(count(p, /class="tsc-hero"/g), 1, s + " header");
    const more = p.split('aria-label="More tools"')[1].split("</nav>")[0];
    assert.equal(count(more, /tsc/g), 0, s + " more-tools strip");
  }
});
t("the other pages carry no scene", () => {
  for (const s of ["about"]) assert.equal(count(page(s), /class="tsc/g), 0, s);
});
t("scenes.mjs has all eight, with no dollar sign, book name or emoji", () => {
  for (const s of SLUGS) assert.ok(new RegExp(`["']?${s}["']?\\s*:`).test(scenesSrc), s);
  assert.ok(!/\$/.test(scenesSrc.replace(/\$\{/g, "")), "dollar sign");
  assert.ok(!/fanduel|draftkings|bally|betmgm|caesars|espn bet|kalshi|fliff|prizepicks|underdog|bet365/i.test(scenesSrc), "book name");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(scenesSrc), "emoji");
});
t("the hero frame is on the home page only", () => {
  assert.equal(count(home, /class="hx-f"/g), 1);
  assert.equal(count(page("about"), /hx-f/g), 0);
});
t("the stylesheet has both blocks and the reduced-motion rule for scenes", () => {
  assert.ok(css.includes("/* ==== TOOL SCENES ==== */"));
  assert.ok(css.includes("/* ==== HERO TOUCHES ===="));
  assert.match(css, /prefers-reduced-motion:reduce\)\s*\{[^}]*\.tsc/);
});
t("scenes move only while armed, and the runner needs html.motion", () => {
  assert.match(css, /\.motion \.tsc\.armed/);
  assert.match(js, /classList\.contains\("motion"\)/);
});
t("no regex lookbehind in the shared script or stylesheet (older iPhone Safari)", () => {
  assert.ok(!/\(\?<[=!]/.test(js));
  assert.ok(!/\(\?<[=!]/.test(css));
});

fs.rmSync(TMP, {recursive: true, force: true});
console.log(fail ? `\n${fail} FAILED, ${pass} passed.` : `\nPASS: ${pass} motion checks.`);
process.exit(fail ? 1 : 0);
