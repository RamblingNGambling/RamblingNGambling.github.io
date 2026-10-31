#!/usr/bin/env node
/* The record's period label, held against the data, and the clock kept out of it.

     node verify/check-record.mjs

   Builds the site in throwaway copies (a temp folder) with changed data files. Proves the period beside the
   total ("Full record · Jul 19 – Oct 30, 2026") is the first and last SETTLED play in plays.json, that an
   open play with a later date does not move it, that a file with no settled plays builds with no period, and
   that nothing the site writes as a date comes from the clock at build time (the sitemap's lastmod is the
   data's own stamp, or the latest result when there is none). It also holds the home page to the short
   version agreed on 31 Oct 2026: no update line and no "How the record is counted" box under the total.
   No dependencies, no browser. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.resolve(HERE, "..");
const PLAYS = [path.join(BUILD, "..", "plays.json"), path.join(BUILD, "..", "site", "plays.json")].find(p => fs.existsSync(p));
if (!PLAYS) throw new Error("plays.json not found next to the build folder");
const REAL = JSON.parse(fs.readFileSync(PLAYS, "utf8"));
const SGA_FILE = path.join(path.dirname(PLAYS), "sga.json"), SGA_PROOF = path.join(path.dirname(PLAYS), "sga", "proof");
const HAS_SGA = fs.existsSync(SGA_FILE);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "record-check-"));
let n = 0;
function build(mutate) {
  const site = path.join(TMP, "s" + (++n)), b = path.join(site, "build");
  fs.mkdirSync(b, {recursive: true});
  const data = JSON.parse(JSON.stringify(REAL)); if (mutate) mutate(data);
  fs.writeFileSync(path.join(site, "plays.json"), JSON.stringify(data));
  if (HAS_SGA) { fs.copyFileSync(SGA_FILE, path.join(site, "sga.json")); if (fs.existsSync(SGA_PROOF)) fs.cpSync(SGA_PROOF, path.join(site, "sga", "proof"), {recursive: true}); }
  fs.copyFileSync(path.join(BUILD, "build.mjs"), path.join(b, "build.mjs"));
  fs.cpSync(path.join(BUILD, "src"), path.join(b, "src"), {recursive: true});
  const r = spawnSync(process.execPath, [path.join(b, "build.mjs")], {cwd: TMP, encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
  const dist = path.join(b, "dist");
  return {data, read: p => fs.readFileSync(path.join(dist, p), "utf8")};
}
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS: " + name); } catch (e) { fail++; console.log("FAIL: " + name + "\n      " + String(e.message).split("\n")[0]); } };
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const tag = html => text((html.match(/<p class="rtag"[\s\S]*?<\/p>/) || [""])[0]).trim();
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dmd = d => MO[+d.slice(5, 7) - 1] + " " + (+d.slice(8)), dlong = d => dmd(d) + ", " + d.slice(0, 4);
const SETTLED = new Set(["Win", "Loss", "Push"]);
const settledDates = d => d.plays.filter(p => SETTLED.has(p.result)).map(p => p.date).sort();

const real = build();
const home = real.read("index.html");
const dates = settledDates(real.data), first = dates[0], last = dates[dates.length - 1];
const period = (f, l) => f.slice(0, 4) === l.slice(0, 4) ? `${dmd(f)} – ${dlong(l)}` : `${dlong(f)} – ${dlong(l)}`;

t("period: the record's first and last settled play, worked out here from the file", () => {
  assert.equal(tag(home), `Full record · ${period(first, last)}`);
});
t("an open play dated after the last result does not move the period", () => {
  const b = build(d => { d.plays.push({...d.plays[0], play: "Test Open Play Over 1.5", result: "Pending", units_pl: null, post: "", date: "2099-01-02"}); });
  assert.equal(tag(b.read("index.html")), tag(home));
  assert.ok(!tag(b.read("index.html")).includes("2099"));
});
t("a period that crosses a year shows both years", () => {
  const b = build(d => { const p = d.plays.find(x => SETTLED.has(x.result)); p.date = "2025-12-30"; });
  assert.match(tag(b.read("index.html")), /^Full record · Dec 30, 2025 – [A-Z][a-z]{2} \d{1,2}, 2026$/);
});
t("a file with no settled plays still builds, with no period", () => {
  const b = build(d => { d.plays = d.plays.filter(x => x.result === "Pending"); });
  assert.equal(tag(b.read("index.html")), "Full record");
});
t("no date on the site comes from the clock: the sitemap uses the data's stamp, or the latest result when there is none", () => {
  const stamped = build(d => { d.updated = "Mar 3, 2025, 9:15 AM EST"; });
  assert.match(stamped.read("sitemap.xml"), /<lastmod>2025-03-03<\/lastmod>/);
  const bare = build(d => { delete d.updated; });
  const lastmods = [...bare.read("sitemap.xml").matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map(m => m[1]);
  assert.ok(lastmods.length > 0 && lastmods.every(d => d === last), "lastmod is the latest result: " + lastmods.join());
});
t("the home page stays short: no update line and no explainer box under the total", () => {
  assert.ok(!/class="rupd"|id="how"|class="panel how"|How the record is counted|How this is counted|Data updated/.test(home));
});

fs.rmSync(TMP, {recursive: true, force: true});
console.log(fail ? `\n${fail} FAILED, ${pass} passed.` : `\nPASS: ${pass} record checks.`);
process.exit(fail ? 1 : 0);
