/* The optional hero pictures ("art slots").

   Darren may drop a picture into the site repo's art/ folder: art/home.jpg for the home hero,
   art/sga.jpg for the SGA hero (.webp and .png work too). With no picture there is simply no
   picture. The folder is put in the repo by a person, so every file in it is untrusted: each is
   checked below, a bad one is skipped with a console warning, and nothing here can stop the
   build. Node's standard library only.

   Exports (used by build.mjs):
     loadArtSlots(siteDir)  read and check <siteDir>/art; returns the manifest
                            {key: {file, ext, bytes, w, h, hash}}
     writeArtSlots(distDir) copy the accepted pictures to <distDir>/art/<key>.<ext>
     artImg(key)            the <img> markup for a hero, or "" when there is no picture
                            (the text {{rel}} is replaced by page() with the way back to the root) */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ART_KEYS = ["home", "sga"];
const EXTS = ["webp", "jpg", "jpeg", "png"];          // the order they are looked for
const MAX_BYTES = 900 * 1024;
const MIN_PX = 400, MAX_PX = 6000;

let MANIFEST = {};                                    // key -> {file, ext, bytes, w, h, hash}
const BYTES = {};                                     // key -> the checked bytes, so exactly those are written

/* ---------- the pixel size, read from the file's own header; null if it does not make sense ---------- */
function jpegSize(b) {
  if (!(b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    if (m === 0xff) { i++; continue; }                // fill byte
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }   // no length
    if (m === 0xd9 || m === 0xda) return null;        // end, or the picture data, with no frame header before it
    const len = b.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {   // a frame header (SOF)
      if (i + 9 > b.length) return null;
      return {w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5)};
    }
    i += 2 + len;
  }
  return null;
}
function pngSize(b) {
  if (b.length < 24 || b.compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0, 8, 0, 8) !== 0) return null;
  if (b.readUInt32BE(8) !== 13 || b.toString("latin1", 12, 16) !== "IHDR") return null;
  return {w: b.readUInt32BE(16), h: b.readUInt32BE(20)};
}
function webpSize(b) {
  if (b.length < 30 || b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return null;
  const k = b.toString("latin1", 12, 16);
  if (k === "VP8 ") {                                 // lossy: 3 byte frame tag, start code 9D 01 2A, then 14 bit sizes
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff};
  }
  if (k === "VP8L") {                                 // lossless: signature 2F, then 14 bit (size - 1) each
    if (b[20] !== 0x2f) return null;
    const v = b.readUInt32LE(21);
    return {w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1};
  }
  if (k === "VP8X") {                                 // extended: 24 bit (size - 1) each
    return {w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1};
  }
  return null;
}
const KINDS = {
  jpg: {name: "a JPEG", size: jpegSize}, jpeg: {name: "a JPEG", size: jpegSize},
  png: {name: "a PNG", size: pngSize}, webp: {name: "a WEBP", size: webpSize}
};

/* ---------- read and check one candidate; returns an accepted entry or a reason string ---------- */
function check(dir, key, ext) {
  const name = key + "." + ext, p = path.join(dir, name);
  let st;
  try { st = fs.lstatSync(p); } catch (e) { return "cannot be read"; }
  if (st.isSymbolicLink()) return "is a link, not a file";
  if (!st.isFile()) return "is not a file";
  if (st.size < 1) return "is empty";
  if (st.size > MAX_BYTES) return "is " + Math.ceil(st.size / 1024) + " KB; the limit is " + MAX_BYTES / 1024 + " KB";
  let buf;
  try { buf = fs.readFileSync(p); } catch (e) { return "cannot be read"; }
  if (buf.length > MAX_BYTES) return "is over " + MAX_BYTES / 1024 + " KB";
  const kind = KINDS[ext], size = kind.size(buf);
  if (!size) return "is not " + kind.name + " (the file does not start like one, or its header is damaged)";
  if (!(size.w >= MIN_PX && size.w <= MAX_PX && size.h >= MIN_PX && size.h <= MAX_PX))
    return "is " + size.w + " x " + size.h + " pixels; both sides must be between " + MIN_PX + " and " + MAX_PX;
  return {file: name, ext, bytes: buf.length, w: size.w, h: size.h, hash: crypto.createHash("sha1").update(buf).digest("hex"), buf};
}

export function loadArtSlots(siteDir) {
  MANIFEST = {};
  for (const k of Object.keys(BYTES)) delete BYTES[k];
  const dir = path.join(siteDir, "art");
  let st, names;
  try { st = fs.lstatSync(dir); } catch (e) { return MANIFEST; }          // no art folder: no pictures, no message
  try {
    if (st.isSymbolicLink() || !st.isDirectory()) { console.warn("art ignored: art is not a plain folder"); return MANIFEST; }
    names = new Set(fs.readdirSync(dir));
    for (const key of ART_KEYS) {
      let used = null;
      for (const ext of EXTS) {
        const name = key + "." + ext;
        if (!names.has(name)) continue;
        if (used) { console.warn("art/" + name + " ignored: art/" + used + " is already used for " + key); continue; }
        const r = check(dir, key, ext);
        if (typeof r === "string") { console.warn("art/" + name + " ignored: " + r); continue; }
        used = name;
        BYTES[key] = r.buf;
        MANIFEST[key] = {file: r.file, ext: r.ext, bytes: r.bytes, w: r.w, h: r.h, hash: r.hash};
      }
    }
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const m = /^(.*)\.(webp|jpg|jpeg|png)$/.exec(n);
      if (m && ART_KEYS.includes(m[1])) continue;                         // handled above
      console.warn("art/" + n + " ignored: the name must be exactly " + ART_KEYS.map(k => k + ".jpg").join(" or ") + " (or .webp, .png)");
    }
  } catch (e) {
    console.warn("art ignored: " + (e && e.message || e));
    MANIFEST = {};
    for (const k of Object.keys(BYTES)) delete BYTES[k];
  }
  return MANIFEST;
}

export function writeArtSlots(distDir) {
  const keys = Object.keys(MANIFEST);
  if (!keys.length) return;
  try {
    const out = path.join(distDir, "art");
    fs.mkdirSync(out, {recursive: true});
    for (const k of keys) fs.writeFileSync(path.join(out, k + "." + MANIFEST[k].ext), BYTES[k]);
  } catch (e) {
    console.warn("art not copied: " + (e && e.message || e));
  }
}

export function artImg(key) {
  const m = Object.prototype.hasOwnProperty.call(MANIFEST, key) ? MANIFEST[key] : null;
  if (!m) return "";
  return `<img class="art-img" src="{{rel}}art/${key}.${m.ext}?v=${m.hash.slice(0, 8)}" alt="" width="${m.w}" height="${m.h}" decoding="async" fetchpriority="low">`;
}
