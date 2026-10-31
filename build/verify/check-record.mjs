#!/usr/bin/env node
/* The record's period, its last data update, and "How the record is counted", held against the data.

     node verify/check-record.mjs

   Builds the site in throwaway copies (a temp folder) with changed data files, so it can prove what the
   page does NOT use: the period comes from the first and last settled play, the update line is the stamp
   inside plays.json (a different stamp gives a different line; no stamp gives no "Data updated"), and the
   clock at build time is never shown. Then each claim in the explainer is checked against plays.json:
   ROI and units risked, a push adds 0u, win rate leaves pushes out, an open play is not in the record,
   a parlay is one row, and the SGA 20+ rollover is not in the record. No dependencies, no browser. */
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
function build(mutate, {sga = true} = {}) {
  const site = path.join(TMP, "s" + (++n)), b = path.join(site, "build");
  fs.mkdirSync(b, {recursive: true});
  const data = JSON.parse(JSON.stringify(REAL)); if (mutate) mutate(data);
  fs.writeFileSync(path.join(site, "plays.json"), JSON.stringify(data));
  if (sga && HAS_SGA) { fs.copyFileSync(SGA_FILE, path.join(site, "sga.json")); if (fs.existsSync(SGA_PROOF)) fs.cpSync(SGA_PROOF, path.join(site, "sga", "proof"), {recursive: true}); }
  fs.copyFileSync(path.join(BUILD, "build.mjs"), path.join(b, "build.mjs"));
  fs.cpSync(path.join(BUILD, "src"), path.join(b, "src"), {recursive: true});
  const r = spawnSync(process.execPath, [path.join(b, "build.mjs")], {cwd: TMP, encoding: "utf8"});
  assert.equal(r.status, 0, r.stderr);
  const dist = path.join(b, "dist");
  return {data, read: p => fs.readFileSync(path.join(dist, p), "utf8"), has: p => fs.existsSync(path.join(dist, p))};
}
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("PASS: " + name); } catch (e) { fail++; console.log("FAIL: " + name + "\n      " + String(e.message).split("\n")[0]); } };
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&middot;/g, "·").replace(/\s+/g, " ");
const grab = (html, re) => (html.match(re) || [""])[0];
const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const dmd = d => MO[+d.slice(5, 7) - 1] + " " + (+d.slice(8)), dlong = d => dmd(d) + ", " + d.slice(0, 4);
const SETTLED = new Set(["Win", "Loss", "Push"]);
const settledOf = d => d.plays.filter(p => SETTLED.has(p.result)).map(p => p.date).sort();

const real = build();
const home = real.read("index.html");
const dates = settledOf(real.data), first = dates[0], last = dates[dates.length - 1];

t("period: the record's first and last settled play, nothing else (the open play's later date is not in it)", () => {
  const want = first.slice(0, 4) === last.slice(0, 4) ? `${dmd(first)} – ${dlong(last)}` : `${dlong(first)} – ${dlong(last)}`;
  assert.equal(text(grab(home, /<p class="rtag"[\s\S]*?<\/p>/)).trim(), `Full record · ${want}`);
  const open = real.data.plays.filter(p => p.result === "Pending").map(p => p.date);
  if (open.length && open.some(d => d > last)) assert.ok(!text(grab(home, /<p class="rtag"[\s\S]*?<\/p>/)).includes(dlong(open.sort().pop())), "the open play's date is not the period's end");
});
t("update line: the stamp in plays.json, word for word, beside the latest result's date", () => {
  const line = text(grab(home, /<p class="rupd"[\s\S]*?<\/p>/)).trim();
  assert.equal(line, `Data updated ${REAL.updated} · latest result ${dmd(last)} · How this is counted`);
  assert.match(home, /<time datetime="\d{4}-\d{2}-\d{2}">/);
});
t("update line is the data's stamp, never the clock: a different stamp gives a different line", () => {
  const stamp = "Mar 3, 2025, 9:15 AM EST";
  const b = build(d => { d.updated = stamp; });
  const h = b.read("index.html");
  assert.equal(grab(h, /<time[^>]*>([\s\S]*?)<\/time>/).replace(/<[^>]+>/g, ""), stamp);
  assert.match(h, /<time datetime="2025-03-03">/);
  assert.ok(!text(h).includes(REAL.updated), "the old stamp is gone");
  assert.match(b.read("sitemap.xml"), /<lastmod>2025-03-03<\/lastmod>/, "the sitemap uses the data's date too, not the build date");
});
t("no stamp in the file: no 'Data updated' claim, only the latest result, and no build date anywhere", () => {
  const b = build(d => { delete d.updated; });
  const h = b.read("index.html"), line = text(grab(h, /<p class="rupd"[\s\S]*?<\/p>/)).trim();
  assert.equal(line, `latest result ${dmd(last)} · How this is counted`);
  assert.ok(!/Data updated/.test(text(h)));
  const lastmods = [...b.read("sitemap.xml").matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map(m => m[1]);
  assert.ok(lastmods.every(d => d === last), "sitemap lastmod is the latest result: " + lastmods.join());
});
t("the explainer has its anchor, and the link beside the total reaches it", () => {
  assert.match(home, /<a href="#how">How this is counted<\/a>/);
  assert.match(home, /<div class="panel how" id="how"/);
  assert.equal((home.match(/id="how"/g) || []).length, 1);
});
t("explainer: units, ROI, pushes, pending, parlays are each there", () => {
  const how = text(grab(home, /<div class="panel how"[\s\S]*?<\/dl>/));
  for (const dt of ["Units", "ROI", "Pushes", "Pending", "Parlays"]) assert.ok(how.includes(` ${dt} `), dt);
  assert.ok(how.includes("The size of a unit is not published."));
  assert.ok(!/\$/.test(how) && !/\$|worth|dollar/i.test(how.replace("The size of a unit is not published.", "")), "units only: no money in the explainer");
});
t("ROI line: net units and units risked from settled plays, worked out here from the file", () => {
  let net = 0, risk = 0, w = 0, l = 0, p = 0;
  for (const x of real.data.plays) if (SETTLED.has(x.result)) { net += Math.round(x.units_pl * 1e6); risk += Math.round(x.units * 1e6); if (x.result === "Win") w++; else if (x.result === "Loss") l++; else p++; }
  net /= 1e6; risk /= 1e6;
  const f = (v, d = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d);
  const riskTxt = (Math.round(Math.round(risk * 1e6) / 1e4) / 100).toFixed(2);
  const how = text(grab(home, /<div class="panel how"[\s\S]*?<\/dl>/));
  assert.ok(how.includes(`${f(net)}u on ${riskTxt}u risked is ${f(net / risk * 100, 1)}%`), "ROI sentence: " + how.match(/ROI[^.]*\./));
  assert.equal(text(home).includes(`on ${riskTxt}u risked`), true, "and the same risked figure sits under the ROI tile");
  // win rate leaves pushes out
  const wr = (w / (w + l) * 100).toFixed(1);
  assert.ok(text(grab(home, /<dl class="ledger">[\s\S]*?<\/dl>/)).includes(`${wr} %`) || text(grab(home, /<dl class="ledger">[\s\S]*?<\/dl>/)).includes(`${wr}%`), "win rate is won / (won + lost): " + wr);
});
t("pushes: every push in the file adds 0u, so 'a push adds 0u' is true", () => {
  const pushes = REAL.plays.filter(x => x.result === "Push");
  assert.ok(pushes.length > 0, "there is a push to check");
  assert.ok(pushes.every(x => x.units_pl === 0), "a push with a non-zero profit would make the explainer wrong");
});
t("pending: an open play is shown as open, and is in none of the record's figures", () => {
  const open = REAL.plays.filter(x => x.result === "Pending").length;
  assert.ok(text(home).includes(`${open} open right now`));
  const b = build(d => { d.plays.push({...d.plays[0], play: "Test Open Play Over 1.5", result: "Pending", units_pl: null, post: "", date: "2026-11-02"}); });
  const h = b.read("index.html"), keep = s => text(grab(h, /<dl class="ledger">[\s\S]*?<\/dl>/)).replace(/\d+ open right now/, "");
  assert.equal(keep(), text(grab(home, /<dl class="ledger">[\s\S]*?<\/dl>/)).replace(/\d+ open right now/, ""), "an extra open play changes only the open count");
  assert.ok(text(h).includes(`${open + 1} open right now`));
  assert.equal(text(grab(h, /<p class="rtag"[\s\S]*?<\/p>/)), text(grab(home, /<p class="rtag"[\s\S]*?<\/p>/)), "and not the period");
});
t("parlays: every Parlay play is one row with one stake and one result", () => {
  const par = REAL.plays.filter(x => x.market === "Parlay");
  assert.ok(par.length > 0);
  assert.ok(par.every(x => typeof x.units === "number" && x.units > 0 && typeof x.result === "string"), "one numeric stake and one result per parlay row");
  const log = JSON.parse(grab(home, /<script type="application\/json" id="pt-data">([\s\S]*?)<\/script>/).replace(/^[^>]*>/, "").replace(/<\/script>$/, "").replace(/\\u003c/g, "<"));
  assert.equal(log.plays.filter(r => r[3] === "Parlay").length, par.length, "the page counts each parlay row once");
});
t("SGA: the line says the rollover is not in the record (and adds no link); and the data agrees (no rollover game is in plays.json)", () => {
  if (!HAS_SGA) return;
  const how = text(grab(home, /<div class="panel how"[\s\S]*?<\/dl>/));
  assert.ok(how.includes("SGA 20+ Not in this record."), "the SGA line");
  assert.ok(!/href="sga\/"/.test(grab(home, /<div class="panel how"[\s\S]*?<\/dl>/)), "the explainer does not add a second link to the SGA page: the chip is the home page's one promotion");
  assert.equal((home.match(/href="sga\/"/g) || []).length, 1, "one link to the SGA page on the home page");
  const sga = JSON.parse(fs.readFileSync(SGA_FILE, "utf8"));
  const gameDates = (sga.runs || []).flatMap(r => (r.g || r.days || []).map(g => g.d || g.date)).filter(Boolean).sort();
  assert.ok(gameDates.length > 0, "the rollover has games to compare");
  const clash = REAL.plays.filter(x => x.date >= gameDates[0] && /gilgeous|\bsga\b/i.test(x.play + " " + (x.game || "")));
  assert.equal(clash.length, 0, "a play on Shai Gilgeous-Alexander on or after the rollover began would need its own explanation: " + JSON.stringify(clash.map(c => c.play)));
});
t("SGA: with no rollover data the explainer carries no SGA line and no link to a page that is not built", () => {
  const b = build(null, {sga: false}), h = b.read("index.html");
  assert.ok(!b.has("sga/index.html"));
  assert.ok(!/SGA 20\+/.test(text(grab(h, /<div class="panel how"[\s\S]*?<\/dl>/))));
  assert.ok(!/href="sga\/"/.test(h));
});
t("a file with no settled plays still builds: no period, no update claim beyond the stamp, no crash", () => {
  const b = build(d => { d.plays = d.plays.filter(x => x.result === "Pending"); });
  const h = b.read("index.html");
  assert.ok(!/<span> · /.test(grab(h, /<p class="rtag"[\s\S]*?<\/p>/)), "no period without settled plays");
  assert.ok(!/latest result/.test(text(h)));
});

fs.rmSync(TMP, {recursive: true, force: true});
console.log(fail ? `\n${fail} FAILED, ${pass} passed.` : `\nPASS: ${pass} record checks.`);
process.exit(fail ? 1 : 0);
