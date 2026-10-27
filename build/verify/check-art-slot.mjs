#!/usr/bin/env node
/* Checks for the optional hero pictures (the art slots, src/artslot.mjs).

     node verify/check-art-slot.mjs

   Builds the site in a throwaway copy (a temp folder, never the real one). First it calls the
   picture reader directly: the pixel size read from JPEG, PNG and WEBP headers, and the exact
   edges of the rules (size 1..900 KB, both sides 400..6000 px). Then it builds the whole site
   with good and hostile art/ folders and checks what comes out: no folder means no picture and
   no dist/art; good files give the img markup (with width and height) and are copied; a file
   with the wrong first bytes (an HTML page named home.jpg), too big, too small, empty, a link,
   a wrong name or a wrong key is skipped with a warning, the build still exits 0, and every
   file of the site is byte for byte what it is with no art folder. Exits non-zero on any
   failure. No dependencies, no browser. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath, pathToFileURL} from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD_SRC = path.resolve(HERE, "..");
const PLAYS = [path.join(BUILD_SRC, "..", "plays.json"), path.join(BUILD_SRC, "..", "site", "plays.json")].find(p => fs.existsSync(p));
if (!PLAYS) throw new Error("plays.json not found next to the build folder");

/* a private copy: <tmp>/site/{plays.json, sga.json, build/{build.mjs, src}} */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "art-check-"));
const SITE = path.join(TMP, "site");
fs.mkdirSync(path.join(SITE, "build"), {recursive: true});
fs.copyFileSync(PLAYS, path.join(SITE, "plays.json"));
fs.copyFileSync(path.join(BUILD_SRC, "build.mjs"), path.join(SITE, "build", "build.mjs"));
fs.cpSync(path.join(BUILD_SRC, "src"), path.join(SITE, "build", "src"), {recursive: true});
const BUILD = path.join(SITE, "build", "build.mjs"), DIST = path.join(SITE, "build", "dist");
const ART = path.join(SITE, "art");
/* a small SGA file, so the SGA page (the second hero) is built too */
fs.writeFileSync(path.join(SITE, "sga.json"), JSON.stringify({units_only: true, updated: "Oct 25, 2026, 10:56 PM EDT", line: 20,
  runs: [{n: 1, st: "live", g: [{d: "2026-10-25", o: "vs LAC", l: 20, p: -670, r: "Win", f: 1, x: 1.1493, s: 34}]}]}));

/* ---------- make test pictures: only the headers matter, the rest is filler ---------- */
const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u16 = n => Buffer.from([n >> 8 & 255, n & 255]);
const le16 = n => Buffer.from([n & 255, n >> 8 & 255]);
const le24 = n => Buffer.from([n & 255, n >> 8 & 255, n >> 16 & 255]);
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const pad = n => Buffer.alloc(Math.max(0, n));

function png(w, h, total = 0) {                      // a real, valid PNG (grey, 8 bit, all black)
  const chunk = (t, d) => Buffer.concat([u32(d.length), Buffer.from(t, "latin1"), d, u32(crc32(Buffer.concat([Buffer.from(t, "latin1"), d])))]);
  const ihdr = Buffer.concat([u32(w), u32(h), Buffer.from([8, 0, 0, 0, 0])]);
  const rows = Buffer.alloc(h * (w + 1));            // each row: filter byte 0, then w zero pixels
  const out = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  return total > out.length ? Buffer.concat([out, pad(total - out.length)]) : out;
}
function jpeg(w, h, {total = 0, sof = 0xc0} = {}) {  // JFIF header, a table, a Huffman table, the frame header, the scan header, filler
  const seg = (m, d) => Buffer.concat([Buffer.from([0xff, m]), u16(d.length + 2), d]);
  const head = Buffer.concat([Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
    seg(0xdb, Buffer.concat([Buffer.from([0]), pad(64)])),
    seg(0xc4, Buffer.concat([Buffer.from([0]), pad(16), Buffer.from([0])])),     // DHT: marker C4 is not a frame header
    seg(sof, Buffer.concat([Buffer.from([8]), u16(h), u16(w), Buffer.from([3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])])),
    seg(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]))]);
  const out = Buffer.concat([head, pad(8), Buffer.from([0xff, 0xd9])]);
  return total > out.length ? Buffer.concat([head, pad(total - head.length - 2), Buffer.from([0xff, 0xd9])]) : out;
}
function webp(kind, w, h, total = 0) {
  let body;
  if (kind === "VP8X") body = Buffer.concat([Buffer.from("VP8X"), le16(10), le16(0), Buffer.from([0, 0, 0, 0]), le24(w - 1), le24(h - 1)]);
  else if (kind === "VP8 ") body = Buffer.concat([Buffer.from("VP8 "), le16(24), le16(0), Buffer.from([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a]), le16(w), le16(h), pad(16)]);
  else { const v = ((w - 1) | ((h - 1) << 14)) >>> 0, b = Buffer.alloc(4); b.writeUInt32LE(v); body = Buffer.concat([Buffer.from("VP8L"), le16(12), le16(0), Buffer.from([0x2f]), b, pad(8)]); }
  body = Buffer.concat([body, pad(total - 12 - body.length)]);
  const size = Buffer.alloc(4); size.writeUInt32LE(body.length + 4);
  return Buffer.concat([Buffer.from("RIFF"), size, Buffer.from("WEBP"), body]);
}
const sha = b => crypto.createHash("sha1").update(b).digest("hex");

/* ---------- the reader, called directly (it keeps state, so each call starts afresh) ---------- */
const {loadArtSlots, writeArtSlots, artImg} = await import(pathToFileURL(path.join(BUILD_SRC, "src", "artslot.mjs")).href);
function load(files) {                               // files: {name: Buffer}; returns {m, warns}
  const dir = fs.mkdtempSync(path.join(TMP, "unit-"));
  for (const [n, d] of Object.entries(files)) { fs.mkdirSync(path.join(dir, "art"), {recursive: true}); fs.writeFileSync(path.join(dir, "art", n), d); }
  const warns = [], was = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  try { return {m: loadArtSlots(dir), warns, dir}; } finally { console.warn = was; }
}

/* ---------- the whole build, in the throwaway copy ---------- */
function walk(dir, base = dir, out = {}) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out[path.relative(base, p).split(path.sep).join("/")] = sha(fs.readFileSync(p));
  }
  return out;
}
function build(files) {                              // files: null (no art folder) or {name: Buffer | string}
  fs.rmSync(ART, {recursive: true, force: true});
  if (files) { fs.mkdirSync(ART, {recursive: true}); for (const [n, d] of Object.entries(files)) fs.writeFileSync(path.join(ART, n), d); }
  const r = spawnSync(process.execPath, [BUILD], {cwd: TMP, encoding: "utf8"});
  return {code: r.status, out: r.stdout, err: r.stderr, tree: walk(DIST), has: p => fs.existsSync(path.join(DIST, p)),
          read: p => fs.readFileSync(path.join(DIST, p), "utf8")};
}
const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]).sort();
const HAS = '<img class="art-img"';
const imgTag = (page, key) => (page.match(new RegExp('<img class="art-img" src="[^"]*art/' + key + '\\.[a-z]+\\?v=[0-9a-f]{8}"[^>]*>')) || [])[0];

let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS: " + name); }
try {
  /* ===== the reader ===== */
  test("sizes are read from JPEG (plain and progressive), PNG and WEBP (lossy, lossless, extended) headers", () => {
    const cases = [["home.jpg", jpeg(1200, 600)], ["home.jpeg", jpeg(1234, 567, {sof: 0xc2})], ["home.png", png(1500, 700)],
      ["sga.webp", webp("VP8X", 2400, 1200)], ["sga.jpg", jpeg(2400, 1200, {sof: 0xc1})]];
    for (const [name, buf] of cases) {
      const key = name.split(".")[0];
      const {m, warns} = load({[name]: buf});
      assert.deepEqual(warns, [], name + ": " + warns);
      assert(m[key], name + " is accepted");
    }
    for (const [kind, w, h] of [["VP8 ", 1920, 1080], ["VP8L", 2400, 1200], ["VP8X", 2400, 1200], ["VP8L", 6000, 400], ["VP8 ", 400, 6000]]) {
      const {m, warns} = load({"home.webp": webp(kind, w, h)});
      assert(m.home && m.home.w === w && m.home.h === h, kind + " " + w + "x" + h + ": " + JSON.stringify(m) + warns);
    }
    const {m} = load({"home.jpg": jpeg(1234, 567)});
    assert.deepEqual([m.home.w, m.home.h, m.home.ext, m.home.file], [1234, 567, "jpg", "home.jpg"]);
    assert.equal(m.home.hash.slice(0, 8), sha(jpeg(1234, 567)).slice(0, 8));
    const p = load({"home.png": png(1500, 700)}).m.home;
    assert.deepEqual([p.w, p.h], [1500, 700]);
  });

  test("the edges of the rules: 400 and 6000 pixels, 900 KB", () => {
    for (const [w, h, ok] of [[400, 400, true], [399, 400, false], [400, 399, false], [6000, 6000, true], [6001, 400, false], [400, 6001, false], [65535, 65535, false]]) {
      for (const [name, buf] of [["home.jpg", jpeg(w, h)], ["home.webp", webp("VP8X", Math.min(w, 16777216), Math.min(h, 16777216))]]) {
        const r = load({[name]: buf});
        assert.equal(!!r.m.home, ok, name + " " + w + "x" + h);
        if (!ok) assert(r.warns.length === 1 && r.warns[0].includes("art/" + name + " ignored") && r.warns[0].includes("pixels"), r.warns.join("|"));
      }
    }
    assert(load({"home.jpg": jpeg(1200, 600, {total: 900 * 1024})}).m.home, "exactly 900 KB is accepted");
    const big = load({"home.jpg": jpeg(1200, 600, {total: 900 * 1024 + 1})});
    assert(!big.m.home && big.warns[0].includes("KB"), "one byte over is not: " + big.warns);
  });

  test("bad bytes are refused: empty, HTML, the wrong kind, a cut-off header, a header with no size", () => {
    const bad = {
      "empty file": ["home.jpg", Buffer.alloc(0)],
      "an HTML page named home.jpg": ["home.jpg", Buffer.from("<!doctype html><title>x</title>" + "x".repeat(2000))],
      "a PNG named .jpg": ["home.jpg", png(1200, 600)],
      "a JPEG named .png": ["home.png", jpeg(1200, 600)],
      "a PNG named .webp": ["home.webp", png(1200, 600)],
      "a WEBP named .jpg": ["home.jpg", webp("VP8X", 1200, 600)],
      "a JPEG that stops after the first marker": ["home.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a])],
      "a JPEG with the scan before any frame header": ["home.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])],
      "a JPEG with a segment of length 0": ["home.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])],
      "a PNG with the wrong first chunk": ["home.png", Buffer.concat([png(1200, 600).subarray(0, 12), Buffer.from("IDAT"), png(1200, 600).subarray(16)])],
      "a PNG cut off in the header": ["home.png", png(1200, 600).subarray(0, 20)],
      "a WEBP that says RIFF but not WEBP": ["home.webp", Buffer.concat([Buffer.from("RIFF"), pad(4), Buffer.from("WAVE"), pad(40)])],
      "a lossy WEBP without its start code": ["home.webp", Buffer.concat([webp("VP8 ", 1200, 600).subarray(0, 23), pad(20)])],
      "a lossless WEBP without its signature": ["home.webp", Buffer.concat([webp("VP8L", 1200, 600).subarray(0, 20), Buffer.from([0x00]), pad(20)])],
      "a WEBP with an unknown chunk": ["home.webp", Buffer.concat([webp("VP8X", 1200, 600).subarray(0, 12), Buffer.from("ABCD"), pad(30)])]
    };
    for (const [what, [name, buf]] of Object.entries(bad)) {
      const r = load({[name]: buf});
      assert(!r.m.home, what + " must not be accepted");
      assert(r.warns.length === 1 && r.warns[0].includes("art/" + name + " ignored"), what + ": " + r.warns.join("|"));
    }
  });

  test("only the keys home and sga, exact names, a plain folder; webp, then jpg, jpeg, png; dot files are silent", () => {
    let r = load({"other.jpg": jpeg(1200, 600), "hero.png": png(1200, 600), "Home.JPG": jpeg(1200, 600), "home.gif": pad(100), "notes.txt": Buffer.from("hi")});
    assert.deepEqual(r.m, {});
    assert.equal(r.warns.length, 5, r.warns.join("|"));
    for (const w of ["art/other.jpg ignored", "art/hero.png ignored", "art/Home.JPG ignored", "art/home.gif ignored", "art/notes.txt ignored"]) assert(r.warns.some(x => x.startsWith(w)), w + " in " + r.warns.join("|"));
    r = load({"home.png": png(1200, 600), "home.jpg": jpeg(1200, 600), "home.webp": webp("VP8X", 1200, 600), "sga.jpeg": jpeg(1200, 600), "sga.png": png(1200, 600), ".gitkeep": Buffer.alloc(0)});
    assert.equal(r.m.home.file, "home.webp");
    assert.equal(r.m.sga.file, "sga.jpeg");
    assert.deepEqual(r.warns.map(w => w.split(" ignored")[0]).sort(), ["art/home.jpg", "art/home.png", "art/sga.png"], r.warns.join("|"));
    r = load({"home.webp": Buffer.from("RIFFxxxxWEBPjunk" + "x".repeat(40)), "home.png": png(1200, 600)});
    assert.equal(r.m.home.file, "home.png", "a bad webp does not hide a good png");
    assert.equal(r.warns.length, 1);
    const none = load({});
    assert.deepEqual(none.m, {});
    assert.deepEqual(none.warns, []);
  });

  test("artImg: nothing without a picture; with one, the exact markup; writeArtSlots makes no folder when there is nothing", () => {
    load({});
    assert.equal(artImg("home"), "");
    assert.equal(artImg("sga"), "");
    assert.equal(artImg("other"), "");
    assert.equal(artImg("__proto__"), "");
    assert.equal(artImg("constructor"), "");
    const out = path.join(TMP, "unit-out-none");
    fs.mkdirSync(out);
    writeArtSlots(out);
    assert(!fs.existsSync(path.join(out, "art")), "no art folder made");
    const buf = jpeg(2400, 1200);
    load({"home.jpg": buf});
    const hash = sha(buf).slice(0, 8);
    assert.equal(artImg("home"), `<img class="art-img" src="{{rel}}art/home.jpg?v=${hash}" alt="" width="2400" height="1200" decoding="async" fetchpriority="low">`);
    assert.equal(artImg("sga"), "", "no sga picture: no sga markup");
    const out2 = path.join(TMP, "unit-out-some");
    fs.mkdirSync(out2);
    writeArtSlots(out2);
    assert(fs.readFileSync(path.join(out2, "art", "home.jpg")).equals(buf), "the file is copied byte for byte");
    assert.deepEqual(fs.readdirSync(path.join(out2, "art")), ["home.jpg"]);
    load({});                                         // a later load forgets the picture
    assert.equal(artImg("home"), "");
  });

  /* ===== the whole build ===== */
  const base = build(null);
  test("no art folder: no art-img, no dist/art, exit 0, and the build is repeatable", () => {
    assert.equal(base.code, 0, base.err);
    assert.equal(base.err.trim(), "", "no warning when there is no folder: " + base.err);
    assert(!base.has("art"), "no dist/art");
    for (const p of Object.keys(base.tree)) if (p.endsWith(".html")) assert(!base.read(p).includes(HAS), p);
    assert(base.has("sga/index.html"), "the SGA page is built, so the test can see its hero");
    assert.deepEqual(changed(base.tree, build(null).tree), [], "two builds give the same files");
  });

  const homeJpg = jpeg(1200, 600), sgaPng = png(800, 500);
  test("good JPEG and PNG: img markup on the home and SGA heroes, files copied, nothing else changes", () => {
    const b = build({"home.jpg": homeJpg, "sga.png": sgaPng, ".gitkeep": ""});
    assert.equal(b.code, 0, b.err);
    assert.equal(b.err.trim(), "", "no warning: " + b.err);
    const home = imgTag(b.read("index.html"), "home"), sga = imgTag(b.read("sga/index.html"), "sga");
    assert(home && sga, "both pages show their picture");
    assert.equal(home, `<img class="art-img" src="art/home.jpg?v=${sha(homeJpg).slice(0, 8)}" alt="" width="1200" height="600" decoding="async" fetchpriority="low">`);
    assert.equal(sga, `<img class="art-img" src="../art/sga.png?v=${sha(sgaPng).slice(0, 8)}" alt="" width="800" height="500" decoding="async" fetchpriority="low">`);
    assert(!b.read("index.html").includes("{{rel}}") && !b.read("sga/index.html").includes("{{rel}}"));
    assert(fs.readFileSync(path.join(DIST, "art", "home.jpg")).equals(homeJpg) && fs.readFileSync(path.join(DIST, "art", "sga.png")).equals(sgaPng), "copied byte for byte");
    assert.deepEqual(changed(base.tree, b.tree), ["art/home.jpg", "art/sga.png", "index.html", "sga/index.html"], "only the two heroes and the two files differ");
    assert(!b.read("index.html").includes("art/sga") && !b.read("sga/index.html").includes("art/home"), "each hero has only its own picture");
    assert(b.read("assets/site.css").includes("/* ==== ART IMAGES ===="), "the stylesheet has the art block");
  });

  test("good WEBP: used before a JPEG of the same key; the JPEG is a warning", () => {
    const webpBuf = webp("VP8X", 2400, 1200), b = build({"home.webp": webpBuf, "home.jpg": homeJpg});
    assert.equal(b.code, 0, b.err);
    assert(imgTag(b.read("index.html"), "home").includes('src="art/home.webp?v=') && imgTag(b.read("index.html"), "home").includes('width="2400" height="1200"'));
    assert(b.has("art/home.webp") && !b.has("art/home.jpg"), "only the used file is copied");
    assert(b.err.includes("art/home.jpg ignored"), b.err);
    assert(!b.read("sga/index.html").includes(HAS), "no sga picture: none on the SGA page");
  });

  test("a good picture next to bad ones: the good one is used, the others are warnings", () => {
    const b = build({"home.jpg": homeJpg, "sga.jpg": Buffer.from("<html>not a picture</html>"), "other.jpg": homeJpg});
    assert.equal(b.code, 0, b.err);
    assert(b.read("index.html").includes(HAS) && !b.read("sga/index.html").includes(HAS));
    assert.deepEqual(Object.keys(b.tree).filter(k => k.startsWith("art/")), ["art/home.jpg"]);
    assert(b.err.includes("art/sga.jpg ignored") && b.err.includes("art/other.jpg ignored"), b.err);
  });

  test("exactly 900 KB builds", () => {
    const b = build({"home.jpg": jpeg(1200, 600, {total: 900 * 1024})});
    assert.equal(b.code, 0, b.err);
    assert(b.read("index.html").includes(HAS) && b.has("art/home.jpg"));
  });

  const hostile = [
    ["an HTML file named home.jpg", {"home.jpg": "<!doctype html><script>alert(1)</script>"}, "art/home.jpg ignored"],
    ["a PNG named home.jpg", {"home.jpg": png(1200, 600)}, "art/home.jpg ignored"],
    ["a file over 900 KB", {"home.jpg": jpeg(1200, 600, {total: 900 * 1024 + 1})}, "art/home.jpg ignored"],
    ["a picture that is too small", {"home.png": png(300, 200)}, "art/home.png ignored"],
    ["a picture that is too big in pixels", {"sga.webp": webp("VP8X", 6001, 1200)}, "art/sga.webp ignored"],
    ["an empty file", {"home.jpg": Buffer.alloc(0)}, "art/home.jpg ignored"],
    ["an unknown key", {"other.jpg": homeJpg}, "art/other.jpg ignored"],
    ["a wrong-case name", {"Home.jpg": homeJpg, "SGA.PNG": sgaPng}, "art/Home.jpg ignored"],
    ["a picture named for a page that is not a hero", {"about.jpg": homeJpg, "hero.png": sgaPng}, "art/about.jpg ignored"]
  ];
  for (const [what, files, warn] of hostile) {
    test("bad art (" + what + "): a warning, exit 0, every file of the site unchanged", () => {
      const b = build(files);
      assert.equal(b.code, 0, b.err);
      assert(b.err.includes(warn), "the warning names the file: " + b.err);
      assert.deepEqual(changed(base.tree, b.tree), []);
      assert(!b.has("art"), "no dist/art");
    });
  }

  test("art is a file, not a folder: a warning, exit 0, nothing changes", () => {
    fs.rmSync(ART, {recursive: true, force: true});
    fs.writeFileSync(ART, "not a folder");
    const r = spawnSync(process.execPath, [BUILD], {cwd: TMP, encoding: "utf8"});
    assert.equal(r.status, 0, r.stderr);
    assert(r.stderr.includes("art ignored"), r.stderr);
    assert.deepEqual(changed(base.tree, walk(DIST)), []);
    fs.rmSync(ART, {force: true});
  });

  /* links: skipped where the machine does not allow creating one */
  const real = path.join(SITE, "real-picture.jpg");
  fs.writeFileSync(real, homeJpg);
  const linkOk = (target, where, type) => { try { fs.rmSync(where, {recursive: true, force: true}); fs.symlinkSync(target, where, type); return true; } catch (e) { return false; } };
  fs.rmSync(ART, {recursive: true, force: true});
  fs.mkdirSync(ART);
  if (linkOk(real, path.join(ART, "home.jpg"))) {
    test("a link named home.jpg (to a good picture): a warning, exit 0, nothing changes", () => {
      const r = spawnSync(process.execPath, [BUILD], {cwd: TMP, encoding: "utf8"});
      assert.equal(r.status, 0, r.stderr);
      assert(r.stderr.includes("art/home.jpg ignored") && r.stderr.includes("link"), r.stderr);
      assert.deepEqual(changed(base.tree, walk(DIST)), []);
    });
  } else console.log("SKIP: a link named home.jpg (this machine does not allow creating links)");
  fs.rmSync(ART, {recursive: true, force: true});
  const realDir = path.join(SITE, "real-art");
  fs.mkdirSync(realDir, {recursive: true});
  fs.writeFileSync(path.join(realDir, "home.jpg"), homeJpg);
  if (linkOk(realDir, ART, "junction")) {
    test("art itself is a link to a folder: a warning, exit 0, nothing changes", () => {
      const r = spawnSync(process.execPath, [BUILD], {cwd: TMP, encoding: "utf8"});
      assert.equal(r.status, 0, r.stderr);
      assert(r.stderr.includes("art ignored"), r.stderr);
      assert.deepEqual(changed(base.tree, walk(DIST)), []);
    });
  } else console.log("SKIP: art as a link to a folder (this machine does not allow creating links)");
  try { fs.unlinkSync(ART); } catch (e) { fs.rmSync(ART, {recursive: true, force: true}); }

  test("the art block in site.css: dark theme only, a CSS-only fade-in, no lookbehind, only art- classes", () => {
    const css = fs.readFileSync(path.join(BUILD_SRC, "src", "site.css"), "utf8");
    const i = css.indexOf("/* ==== ART IMAGES ===="), j = css.indexOf("/* ==== ", i + 5);
    assert(i > 0 && css.indexOf("/* ==== ART IMAGES ====", i + 5) === -1, "one art block");
    const block = css.slice(i, j === -1 ? css.length : j);
    assert(/:root\[data-theme="light"\]\s+\.art-img\{display:none\}/.test(block), "hidden in the light theme");
    assert(/html\.deco\s+\.art-img\{animation:[^}]*backwards/.test(block), "fade-in under html.deco with fill-mode backwards");
    assert(block.includes("mask-image") && block.includes("mix-blend-mode:screen") && block.includes("object-position:right center"));
    assert(!block.includes("(?<"), "no lookbehind");
    for (const sel of block.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.[a-z][\w-]*/g) || []) assert(sel === ".art" || sel === ".deco" || sel.startsWith(".art-"), "a class outside the art- prefix: " + sel);
  });
} finally {
  fs.rmSync(TMP, {recursive: true, force: true});
}
console.log("PASS: " + n + " art slot checks.");
