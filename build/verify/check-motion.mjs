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
t("calculator headline results show what they were and the signed change, on a line that is always there", () => {
  const tools = fs.readFileSync(path.join(BUILD_SRC, "src", "tools.js"), "utf8");
  const chg = s => count(page(s), /<i class="chg" aria-hidden="true"><\/i>/g);
  assert.deepEqual(["arbitrage", "hedge", "payout", "parlay"].map(chg), [1, 1, 2, 1], "one line in each Profit, Locked in, Payout and Best case profit cell");
  for (const s of ["odds", "devig", "poker", "cheat-sheet"]) assert.equal(chg(s), 0, s + " has no headline profit");
  assert.match(css, /\.asum i\.chg\{display:flex;flex-wrap:wrap;[^}]*height:1\.4em;overflow:hidden/, "the line is reserved, and a narrow cell clips the old figure");
  assert.match(css, /\.deco \.chg\.up\{animation:chg-up/, "the entrance is decoration");
  assert.ok(!/\.motion \.chg/.test(css), "the change line must not depend on .motion");
  assert.ok(tools.includes("setTimeout(settle,700)"), "it waits for typing to stop");
  assert.ok(tools.includes("!f.closest('#pk-sum')"), "the poker difference is not a result");
  assert.ok(tools.includes("if(!m[1]&&n===0)return null"), "an unsigned $0.00 is the empty state; a signed +$0.00 is a real break-even");
  assert.ok(tools.includes("if(v===null){clear();base=null;baseTxt=txt;return}") && tools.includes("if(base!==null&&Math.abs(v-base)>=.005)"), "only the empty state clears the comparison; zero does not");
  assert.ok(tools.includes("if(read(f.textContent)===null){clear();base=null;return}"), "a reset clears the line at once, not after the 700 ms wait");
  assert.match(css, /\.chg \.d\{margin-left:auto;max-width:100%;overflow:hidden;text-overflow:ellipsis\}/, "the change is right-aligned from its own margin, so a narrow cell never clips its sign");
  assert.ok(!/\.asum i\.chg\{[^}]*justify-content/.test(css), "flex-end would overflow to the left and clip the sign");
});
t("the stylesheet has both blocks and the reduced-motion rule for scenes", () => {
  assert.ok(css.includes("/* ==== TOOL SCENES ==== */"));
  assert.ok(css.includes("/* ==== HERO TOUCHES ===="));
  assert.match(css, /prefers-reduced-motion:reduce\)\s*\{[^}]*\.tsc/);
});
t("slip viewer: a tap zooms toward the point, a drag or the arrow keys pan, a tap on the backdrop closes", () => {
  const sga = fs.readFileSync(path.join(BUILD_SRC, "src", "sga.js"), "utf8");
  assert.ok(sga.includes("const Z=2,"), "zoom is 2x");
  assert.ok(sga.includes("-(cx-lb.clientWidth/2)*(Z-1)"), "a tap zooms toward the tapped point, measured from the dialog's centre");
  assert.ok(/pan=\(nx,ny\)=>\{[^}]*Math\.max\(-bx,Math\.min\(bx,nx\)\)/.test(sga), "panning is clamped to the picture's edges");
  assert.ok(sga.includes("pointerdown") && sga.includes("pointermove") && sga.includes("pointerup") && sga.includes("pointercancel"), "drag uses pointer events");
  assert.ok(sga.includes("ArrowLeft:[64,0]") && sga.includes("ev.preventDefault();jump()"), "the arrow keys pan, without easing");
  assert.ok(sga.includes('ev.key==="Tab"') && sga.includes("f[ev.shiftKey?1:0].focus()"), "Tab stays inside the dialog");
  assert.ok(sga.includes("if(ev.altKey||ev.ctrlKey||ev.metaKey)return;"), "Alt+arrow is left to the browser");
  assert.ok(sga.includes("else if(SCROLL.indexOf(ev.key)>=0)ev.preventDefault()") && sga.includes('"wheel"'), "the page behind does not scroll");
  assert.ok(sga.includes("if(lb)close();opener=a;"), "one viewer at a time");
  assert.ok(sga.includes("ev.detail===0"), "a key press on the zoom button does not wait");
  assert.ok(sga.includes("ev.target===lb"), "only the backdrop closes, so a tap on the slip can zoom");
  assert.ok(!/lb\.addEventListener\("click",close\)/.test(sga), "a tap on the slip no longer closes");
  assert.match(css, /\.sglb img\.drag\{cursor:grabbing;transition:none!important\}/, "a drag does not ease");
  assert.match(css, /\.deco \.sglb img\{transition:transform \.24s var\(--ease\)\}/, "the ease is decoration");
  assert.ok(!/\.motion \.sglb/.test(css), "the viewer must not depend on .motion");
  assert.ok(!/\.sglb\{[^}]*cursor:zoom-out/.test(css), "the backdrop no longer says zoom-out");
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
t("segmented controls: one pill under the chosen button, a snap first and a slide after", () => {
  assert.match(css, /\.seg\.pill::before\{[^}]*transform:translate\(var\(--px\),var\(--py\)\)/, "the pill");
  assert.match(css, /\.seg\.pill button\[aria-pressed="true"\],\.seg\.pill button\[aria-selected="true"\]\{background:none/, "the button gives up its fill");
  assert.match(css, /\.deco \.seg\.go::before\{transition:transform[^}]*width[^}]*\}/, "the slide waits for .go");
  assert.ok(!/\.motion \.seg/.test(css), "the pill must not depend on .motion");
  assert.ok(js.includes('classList.remove("go")') && js.includes('classList.add("go")'), "the first placement and a resize snap");
  assert.ok(js.includes("performance.now()-key<150"), "a key press snaps");
  assert.ok(js.includes('attributeFilter:["aria-pressed","aria-selected"]'), "follows both kinds of chosen button");
});
t("copy buttons: a check draws in, behind html.deco, on every tool page and the poker results", () => {
  const tools = fs.readFileSync(path.join(BUILD_SRC, "src", "tools.js"), "utf8");
  assert.match(css, /\.ck path\{stroke-dasharray:1 2;stroke-dashoffset:0\}/, "the finished check is the plain state");
  assert.match(css, /\.deco \.ghost\.done \.ck path\{animation:ck-draw/, "the draw is decoration");
  assert.match(css, /@keyframes ck-draw\{from\{stroke-dashoffset:1\}/);
  assert.ok(!/\.motion \.(ck|ghost\.done)/.test(css), "the check must not depend on .motion");
  assert.equal(count(tools, /copyFlash\(/g), 3, "the helper and its two callers");
  assert.ok(tools.includes("copyFlash(btn,'Link copied')") && tools.includes("copyFlash(b,'Results copied')"));
  assert.match(css, /\.cl>\*\{grid-area:1\/1;/, "both faces share one grid cell, so the width holds");
  assert.ok(tools.includes("b.setAttribute('aria-label',name)"), "the button keeps its name while a face is hidden");
  assert.ok(tools.includes("setAttribute('aria-live','polite')"), "the copy is announced");
  assert.ok(!/\b(b|btn)\.textContent='Copied'/.test(tools), "no copy button swaps its own text any more");
  for (const s of SLUGS.filter(x => x !== "cheat-sheet")) assert.ok(page(s).includes('class="ghost tlink"'), s);
  assert.ok(page("poker").includes('id="pk-copy"'));
});
t("the play log's Show more buttons hand keyboard focus to the first added row", () => {
  const homeJs = fs.readFileSync(path.join(BUILD_SRC, "src", "home.js"), "utf8");
  assert.match(homeJs, /function loadMore\(n\)\{[^}]*first\.focus\(\{preventScroll:true\}\)/, "the helper");
  assert.ok(homeJs.includes('mn.addEventListener("click",()=>loadMore(limit+50))') && homeJs.includes('ma.addEventListener("click",()=>loadMore(Infinity))'), "both buttons use it");
  assert.ok(!/limit\+=50;renderLog|limit=Infinity;renderLog/.test(homeJs), "no button redraws the log without it");
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

/* ---- 30 Oct 2026: less competing motion ---- */
const homeJs = fs.readFileSync(path.join(BUILD_SRC, "src", "home.js"), "utf8");
t("no count-up: no script counts a figure up, and no page asks for it", () => {
  assert.ok(!/countUp|data-cu|dataset\.cu|dataset\.to/.test(js + homeJs), "a count-up is still in site.js or home.js");
  assert.ok(!/countUp/.test(fs.readFileSync(path.join(BUILD_SRC, "src", "sga.js"), "utf8")), "sga.js");
  for (const [name, html] of [["home", home], ["sga", sgaPage], ["about", page("about")]]) assert.ok(!/data-cu|data-to=/.test(html), name + " still carries a count-up attribute");
  assert.ok(!/PT\.countUp|countUp\s*[,}]/.test(js), "window.PT still exports countUp");
});
t("no count-up: the headline figure is whole in the markup, and its parts keep no ids a script would write to", () => {
  const big = home.match(/<p class="big[^"]*"[^>]*>([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, "");
  assert.match(big, /^[+−-]?\d+\.\d\du$/, "headline reads like +22.03u: " + big);
  assert.ok(!/id="cu-[id]"/.test(home), "cu-i / cu-d are gone");
});
t("ticker: scrolls by itself, but only when motion is allowed (loop of two copies, behind html.motion, pauses on hover)", () => {
  const strip = home.match(/<div class="tick"[^>]*>[\s\S]*?<\/div><\/div>/)[0];
  assert.match(strip, /aria-hidden="true"/);
  assert.match(strip, /tabindex="-1"/, "never a tab stop");
  const items = count(strip, /class="tk-i[" ]/g), dups = count(strip, /class="tk-i tk-dup"/g);
  assert.ok(items >= 2 && items % 2 === 0 && dups === items / 2, `two identical copies for a seamless loop (${items} items, ${dups} marked as the second copy)`);
  assert.match(strip, /style="--tick-d:\d+s"/, "the loop length is passed to the page");
  assert.match(css, /@keyframes tick\{to\{transform:translateX\(-50%\)\}\}/, "the loop is half the track");
  assert.match(css, /\.motion \.tick-track\{animation:tick var\(--tick-d,42s\) linear infinite\}/, "it runs only under html.motion");
  assert.match(css, /\.motion \.tick:hover \.tick-track\{animation-play-state:paused\}/, "it pauses on hover");
  const rules = css.split("\n").filter(l => /\.tick(-track)?(?![\w-])/.test(l) && /animation/.test(l));   // .tick and .tick-track, not .tickd (the calculator settle)
  assert.ok(rules.length === 2 && rules.every(l => /^\.motion /.test(l)), "no .tick animation outside html.motion: " + rules.join(" | "));
});
t("ticker: with motion off it is a still strip you scroll by hand, one copy of the plays, never dimming the newest", () => {
  assert.match(css, /html:not\(\.motion\) \.tick\{overflow-x:auto/, "the strip scrolls by hand");
  assert.match(css, /html:not\(\.motion\) \.tk-dup\{display:none\}/, "no play shows twice");
  assert.match(css, /html:not\(\.motion\) \.tick\{[^}]*mask-image:linear-gradient\(90deg,#000 calc\(100% - 56px\),transparent\)/, "only the right edge fades");
});
t("SGA: the home page carries one promotion (the chip); the header tab stays on the other pages", () => {
  if (!sgaPage) return;   // no sga.json beside plays.json: nothing to promote, nothing to count
  assert.equal(count(home, /href="sga\/"/g), 1, "exactly one link to the SGA page on the home page");
  assert.equal(count(home, /class="sgchip/g), 1);
  assert.equal(count(home, /id="sgfloat"/g), 0, "no floating tab on the home page");
  for (const s of ["about", "odds", "arbitrage"]) assert.equal(count(page(s), /id="sgfloat"/g), 1, s + " keeps the tab");
});
t("SGA dots pulse three times, then rest (no endless animation on a promotion)", () => {
  const dots = css.split("\n").filter(l => /\.sg(chip|float)[^{]*\.sgdot\{animation/.test(l));
  assert.equal(dots.length, 2, "both dot rules are there");
  for (const l of dots) assert.ok(!/infinite/.test(l) && /ease-in-out 3\b/.test(l), l);
});

/* ---- 31 Oct 2026: a quieter background (the decoration only) ---- */
t("quieter background: the hero art and the page layer sit at half the strength they had, per theme, and still show", () => {
  const val = (re, what) => { const m = css.match(re); assert.ok(m, what + " not found"); return +m[1]; };
  const WAS = {artDark: .4, artLight: .26, pageDark: .25, pageLight: .17};
  const now = {
    artDark: val(/:root\{--art-o:([0-9.]+);/, "--art-o (dark)"), artLight: val(/:root\[data-theme="light"\]\{--art-o:([0-9.]+)\}/, "--art-o (light)"),
    pageDark: val(/:root\{--page-o:([0-9.]+)\}/, "--page-o (dark)"), pageLight: val(/:root\[data-theme="light"\]\{--page-o:([0-9.]+)\}/, "--page-o (light)")
  };
  for (const k of Object.keys(WAS)) {
    assert.ok(now[k] <= WAS[k] / 2 + 1e-9, `${k}: ${now[k]} is not half of ${WAS[k]} or less`);
    assert.ok(now[k] >= WAS[k] / 2 - 0.01, `${k}: ${now[k]} is quieter than half of ${WAS[k]}: the pattern would vanish`);
  }
});
t("quieter background: only the art layers use those levels (nothing that holds text, a table or a chart)", () => {
  assert.equal(count(css, /var\(--art-o\)/g), 1, "--art-o drives one rule");
  assert.equal(count(css, /var\(--page-o\)/g), 1, "--page-o drives one rule");
  assert.match(css, /\.art\{[^}]*opacity:var\(--art-o\)/);
  assert.match(css, /\.art-page\{[^}]*opacity:var\(--page-o\)/);
  assert.match(css, /\.art\{[^}]*z-index:-1/); assert.match(css, /\.art-page\{[^}]*z-index:-1/);
});
t("quieter background: the hero art keeps its middle lighter than its sides (mask: full at the edges, --art-mid between 24% and 76%)", () => {
  const mid = +(css.match(/--art-mid:([0-9.]+)/) || [])[1];
  assert.ok(mid > 0 && mid < 1, "--art-mid is between 0 and 1: " + mid);
  assert.match(css, /mask-image:linear-gradient\(#000 0,#000 var\(--art-f,66%\),transparent 100%\),linear-gradient\(90deg,#000 0,rgba\(0,0,0,var\(--art-mid\)\) 24%,rgba\(0,0,0,var\(--art-mid\)\) 76%,#000 100%\)/);
  assert.match(css, /mask-composite:intersect/); assert.match(css, /-webkit-mask-composite:source-in/);
});
t("quieter background: the page layer's own map is unchanged, so it stays mainly in the gutters (inside the column at most 30% of the gutter strength)", () => {
  const ic = +(artSrc.match(/var PMAP = \{ic: ([0-9.]+)/) || [])[1];
  assert.ok(ic > 0 && ic <= 0.3, "column cap " + ic);
});
t("nearly plain surfaces: every panel that holds a table, chart or form is opaque in both themes", () => {
  assert.match(css, /\.panel\{background:var\(--s1\);/);
  for (const m of css.matchAll(/--s1:\s*(#[0-9A-Fa-f]{3,8}|rgb[a]?\([^)]*\))/g)) {
    const v = m[1];
    assert.ok(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v) || (/^rgb\(/.test(v)), "--s1 is a solid colour, not translucent: " + v);
  }
  assert.ok(count(css, /--s1:/g) >= 2, "a dark and a light --s1");
  for (const cls of ["panel logp", "panel chartp", "panel bpanel"]) assert.ok(home.includes(`class="${cls}`), cls + " is a panel");
  for (const s of ["arbitrage", "hedge", "parlay", "payout", "odds", "devig", "poker"]) assert.ok(/class="panel tcard/.test(page(s)), s + ": its form sits in a panel");
});

fs.rmSync(TMP, {recursive: true, force: true});
console.log(fail ? `\n${fail} FAILED, ${pass} passed.` : `\nPASS: ${pass} motion checks.`);
process.exit(fail ? 1 : 0);
