#!/usr/bin/env node
/* Checks for the decoration added in October 2026: the looping scenes on the home Tools tiles
   and in the tool-page headers, and the dots and frame lines on the home hero.

     node verify/check-motion.mjs

   Builds the site in a throwaway copy (a temp folder) and checks the output: eight scenes on the
   home tiles and none in the "More tools" strips; one scene in each tool-page header; every
   scene is aria-hidden; a tile's link text is the same as without the scene; no dollar sign,
   book name or emoji in a scene; the hero frame is on the home page only; both CSS blocks and
   the reduced-motion rule are there; no regex lookbehind in the shared script or stylesheet;
   the page-wide halftone layer (.art-page) is on every page but the 404, and art.js stays old-browser safe.
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
// the SGA page (and its art) is only built when sga.json sits beside plays.json
const SGA_JSON = path.join(path.dirname(PLAYS), "sga.json"), SGA_PROOF = path.join(path.dirname(PLAYS), "sga", "proof");
if (fs.existsSync(SGA_JSON)) fs.copyFileSync(SGA_JSON, path.join(SITE, "sga.json"));
if (fs.existsSync(SGA_PROOF)) fs.cpSync(SGA_PROOF, path.join(SITE, "sga", "proof"), {recursive: true});
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
t("a tile's link text is the name and the summary, with or without its scene", () => {
  const tools = home.split('aria-label="Tools"')[1].split("</nav>")[0];
  const tiles = tools.match(/<a class="tool has-sc"[\s\S]*?<\/a>/g);
  assert.equal(tiles.length, 8);
  tiles.forEach(a => {
    const text = a.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "|").split("|").filter(Boolean);
    assert.equal(text.length, 2, a.slice(0, 80));
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
t("scenes move only while armed, and the runner needs html.deco", () => {
  assert.match(css, /\.deco \.tsc\.armed/);
  assert.match(js, /classList\.contains\("deco"\)/);
});
t("decoration runs on html.deco, which a script error elsewhere never removes", () => {
  const i = css.indexOf("/* ==== TOOL SCENES ==== */");
  assert.ok(i > 0, "scenes block");
  const deco = css.slice(i).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\.motion\b/.test(deco), "the scene, hero and art blocks must not use .motion");
  assert.match(css, /\.deco \.sg-step\.armed/, "the SGA step pictures");
  assert.ok(!/\.motion \.sg-step\.armed/.test(css));
  assert.match(home, /classList\.add\('deco'\)/);
  assert.match(home, /classList\.remove\('motion'\)/);
  assert.ok(!/classList\.remove\('deco'\)/.test(home), "an error must not remove deco");
  assert.match(home, /window\.__errs/);
  assert.match(js, /\?diag|diag\(/, "the ?diag report");
});
t("the pictures run on a script clock: CSS holds them paused, loops() sets currentTime", () => {
  const sga = fs.readFileSync(path.join(BUILD_SRC, "src", "sga.js"), "utf8");
  assert.ok(js.includes("function loops(") && js.includes("a.currentTime=it.t"), "site.js loops()");
  assert.ok(js.includes("loops,onReveal"), "loops is on window.PT");
  assert.ok(js.includes('loops(Array.prototype.slice.call(document.querySelectorAll(".tsc"))'), "the tool scenes use it");
  assert.ok(sga.includes("PT.loops(steps"), "the SGA step pictures use it");
  assert.ok(css.includes(".deco .tsc.scrub *,.deco .tsc.scrub *::after{animation-play-state:paused!important}"), "scene rule");
  assert.ok(css.includes(".deco .sg-step.scrub .sg-vis *,.deco .sg-step.scrub .sg-vis *::after{animation-play-state:paused!important}"), "step rule");
  assert.ok(css.includes(".deco .sg-step.armed:not(.run) .sg-vis *") && css.includes(".deco .tsc.armed:not(.run) *"), "the plain CSS fallback stays");
});
t("no regex lookbehind in the shared script or stylesheet (older iPhone Safari)", () => {
  assert.ok(!/\(\?<[=!]/.test(js));
  assert.ok(!/\(\?<[=!]/.test(css));
});

/* ---- halftone art (src/art.js): the canvas behind the home and SGA heroes ---- */
const artSrc = fs.readFileSync(path.join(BUILD_SRC, "src", "art.js"), "utf8");
const htmlPages = () => {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      if (e.isDirectory()) { if (e.name !== "assets" && e.name !== "proof") walk(path.join(d, e.name)); }
      else if (e.name.endsWith(".html")) out.push(path.join(d, e.name));
    }
  })(DIST);
  return out;
};
const relPath = f => path.relative(DIST, f).split(path.sep).join("/");
const sgaPage = fs.existsSync(path.join(DIST, "sga", "index.html")) ? page("sga") : "";
t("art: home and sga each hold exactly one .art with a canvas, hidden from screen readers", () => {
  assert.ok(sgaPage, "no sga page was built");
  for (const [name, html] of [["home", home], ["sga", sgaPage]]) {
    assert.equal(count(html, /class="art"/g), 1, name);
    assert.equal(count(html, /<div class="art" data-art="(home|sga)" aria-hidden="true"><canvas><\/canvas>/g), 1, name);
  }
  assert.match(home, /data-art="home"/);
  assert.match(sgaPage, /data-art="sga"/);
});
t("art: no other page carries one (tool pages, about, how to read, 404)", () => {
  for (const f of htmlPages()) {
    const r = relPath(f);
    if (r === "index.html" || r === "sga/index.html") continue;
    assert.equal(count(fs.readFileSync(f, "utf8"), /class="art"/g), 0, r);
  }
});
t("art: art.js is an asset, loaded once by every page built from the shared template (not the 404, not the redirect)", () => {
  assert.ok(fs.existsSync(path.join(DIST, "assets", "art.js")), "assets/art.js was not written");
  let pages = 0;
  for (const f of htmlPages()) {
    const r = relPath(f), h = fs.readFileSync(f, "utf8"), n = count(h, /<script src="[^"]*assets\/art\.js\?v=[0-9a-f]{8}"><\/script>/g);
    const shared = r !== "404.html" && /assets\/site\.css/.test(h);
    assert.equal(n, shared ? 1 : 0, r);
    if (shared) pages++;
  }
  assert.ok(pages >= 11, "only " + pages + " pages carry the shared template");
});
t("art: the picture sits inside the hero frame and the old dot field is gone", () => {
  assert.match(home, /<div class="hx-f" aria-hidden="true"><div class="art" data-art="home"/);
  assert.ok(!/hx-dots/.test(home), "hx-dots is still in the home page");
  assert.ok(!/hx-dots|--hx-a/.test(css), "hx-dots or --hx-a is still in the stylesheet");
  assert.match(sgaPage, /<section class="sg-hero"[^>]*>\s*<div class="art" data-art="sga"/);
});
t("art: the stylesheet block closes the file, is decoration only, and honours the theme and print", () => {
  const i = css.indexOf("/* ==== HALFTONE ART ==== */");
  assert.ok(i > 0 && css.indexOf("/* ==== HALFTONE ART ==== */", i + 1) < 0, "exactly one block");
  // only the picture block (/* ==== ART IMAGES ==== */) may follow it
  const j = css.indexOf("/* ==== ART IMAGES ====", i);
  const block = css.slice(i, j > 0 ? j : undefined);
  assert.ok(!block.slice(30).includes("/* ===="), "another block sits inside it");
  assert.match(block, /\.deco \.art\{animation:[^}]*backwards/);
  assert.match(block, /pointer-events:none/);
  assert.match(block, /z-index:-1/);
  assert.match(block, /@media print\{\.art\{display:none\}\}/);
  assert.match(block, /:root\[data-theme="light"\]\{--art-o:/);
});
t("art.js: still frame without html.deco, one loop, off-screen pause, redraw on theme and size, no random numbers", () => {
  assert.match(artSrc, /classList\.contains\("deco"\)/);
  assert.match(artSrc, /prefers-reduced-motion/);
  assert.match(artSrc, /IntersectionObserver/);
  assert.match(artSrc, /ResizeObserver/);
  assert.match(artSrc, /MutationObserver[\s\S]*data-theme/);
  assert.equal(count(artSrc, /requestAnimationFrame\(/g), 4, "one loop (a start and a re-arm) plus two coalesced redraws of the page layer");
  assert.ok(!/Math\.random/.test(artSrc), "Math.random would change the picture for each visit");
});
t("art.js: no dollar sign, book name or emoji, and no regex lookbehind", () => {
  assert.ok(!/\$/.test(artSrc), "dollar sign");
  assert.ok(!/fanduel|draftkings|bally|betmgm|caesars|espn bet|kalshi|fliff|prizepicks|underdog|bet365/i.test(artSrc), "book name");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(artSrc), "emoji");
  assert.ok(!/\(\?<[=!]/.test(artSrc), "lookbehind");
});

/* ---- the page-wide layer: one fixed canvas behind every page but the 404 ---- */
const shared = () => htmlPages().filter(f => relPath(f) !== "404.html" && /assets\/site\.css/.test(fs.readFileSync(f, "utf8")));
t("page art: every built page except 404 has exactly one .art-page, right after <body>, hidden from screen readers", () => {
  assert.ok(shared().length >= 11);
  for (const f of shared()) {
    const h = fs.readFileSync(f, "utf8"), r = relPath(f);
    assert.equal(count(h, /class="art-page"/g), 1, r);
    assert.match(h, /<body[^>]*>\s*<div class="art-page" aria-hidden="true"><canvas><\/canvas><\/div>/, r + " (placed right after body)");
  }
});
t("page art: the 404 and the redirect page have no layer and do not load art.js", () => {
  const nf = fs.readFileSync(path.join(DIST, "404.html"), "utf8");
  assert.equal(count(nf, /class="art-page"/g), 0);
  assert.equal(count(nf, /<script[^>]*art\.js/g), 0);
  for (const f of htmlPages()) {
    if (shared().includes(f)) continue;
    const h = fs.readFileSync(f, "utf8");
    assert.equal(count(h, /class="art-page"/g) + count(h, /<script[^>]*art\.js/g), 0, relPath(f));
  }
});
t("page art: the PAGE ART block is the last block of the stylesheet, fixed, behind everything, off in print", () => {
  const heads = [...css.matchAll(/\/\* ==== ([A-Z ]+?) =+/g)].map(m => m[1].trim());
  assert.equal(heads[heads.length - 1], "PAGE ART", "last block is " + heads[heads.length - 1]);
  assert.equal(heads.filter(x => x === "PAGE ART").length, 1);
  const block = css.slice(css.indexOf("/* ==== PAGE ART ===="));
  assert.match(block, /\.art-page\{position:fixed;[^}]*z-index:-1;[^}]*pointer-events:none/);
  assert.match(block, /@media print\{\.art-page\{display:none\}\}/);
  assert.match(block, /:root\[data-theme="light"\]\{--page-o:/);
  assert.ok(!/:has\(/.test(block), "the layer must not need :has");
  assert.ok(!/[^-a-z]inset:/.test(block), "longhand offsets only");
  // the two older rules stay as they were
  assert.ok(css.includes("html:has(.art){overflow-y:auto}") && css.includes("body:has(.art){overflow-x:clip}"));
});
t("art.js (page layer): one fixed canvas, 0.25 parallax, still frame at offset 0 without motion, cost guard, backing-store cap", () => {
  assert.match(artSrc, /PARALLAX = 0\.25/);
  assert.match(artSrc, /targetOff[\s\S]*animating\(\) \? [^:]*PARALLAX : 0/);
  assert.match(artSrc, /SLOW_MS = 8/);
  assert.match(artSrc, /\+\+p\.over >= 3/);
  assert.match(artSrc, /Math\.min\(window\.devicePixelRatio \|\| 1, 1\.5\)/);
  assert.match(artSrc, /2500000/);
    assert.match(artSrc, /addEventListener\("scroll", onScroll, \{passive: true\}\)/);
});
t("art.js: nothing newer than ES2017, and every newer browser API is guarded", () => {
  const code = artSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/\?\.[A-Za-z_(\[]/.test(code), "optional chaining");
  assert.ok(!/\?\?/.test(code), "nullish coalescing");
  assert.ok(!/roundRect|replaceAll|\.at\(|structuredClone|getAnimations|\.flat\(|Object\.fromEntries|matchAll/.test(code), "a newer method");
  assert.ok(!/\bclass\s+\w+|\bBigInt\b|\bimport\s*\(|\*\*=|\|\|=|&&=/.test(code), "newer syntax");
  assert.ok(!/\b(let|const)\s/.test(code), "this file uses var, as the rest of the shared scripts do");
  // guarded: observers, and the matchMedia listener with its older fallback
  assert.match(code, /if \(window\.ResizeObserver\)/);
  assert.match(code, /if \(window\.IntersectionObserver\)/);
  assert.match(code, /if \(window\.MutationObserver\)/);
  assert.match(code, /RM\.addEventListener\) RM\.addEventListener\("change", onRm\); else if \(RM\.addListener\)/);
  assert.match(code, /window\.matchMedia \? matchMedia/);
});

fs.rmSync(TMP, {recursive: true, force: true});
console.log(fail ? `\n${fail} FAILED, ${pass} passed.` : `\nPASS: ${pass} motion checks.`);
process.exit(fail ? 1 : 0);
