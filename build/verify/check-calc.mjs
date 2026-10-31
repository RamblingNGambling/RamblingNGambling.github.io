/* Calculator input rules, tested on the code that ships.
   Pulls readOdds and readAmt out of src/tools.js (not a copy) and runs them on good and bad text.
   The page behaviour (messages, hidden results, aria) is not covered here: it needs a browser.

     node verify/check-calc.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, "..", "src", "tools.js"), "utf8");
const a = src.indexOf("function readOdds(s){");
const b = src.indexOf("return {v:v};\n}", src.indexOf("function readAmt(")) + "return {v:v};\n}".length;
if (a < 0 || b < a) { console.error("FAIL: readOdds / readAmt not found in src/tools.js"); process.exit(1); }
const { readOdds, readAmt } = new Function(src.slice(a, b) + "\nreturn {readOdds, readAmt};")();

let fails = 0;
const check = (ok, label, extra) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !extra ? "" : "  " + extra}`); };
const near = (x, y) => Math.abs(x - y) < 1e-9;

/* every supported price form still reads, and to the same decimal price as before */
for (const [t, d] of [["+150", 2.5], ["150", 2.5], ["-110", 1 + 100 / 110], ["−110", 1 + 100 / 110], ["+100", 2], ["-100", 2],
                      ["2.5", 2.5], ["1.91", 1.91], ["1.01", 1.01], ["99.99", 99.99], [" +1,250 ", 13.5], ["-1000", 1.1]]) {
  const r = readOdds(t);
  check(r.d !== undefined && r.d !== null && near(r.d, d) && !r.err, `odds "${t}" reads as ${d.toFixed(4)}`, JSON.stringify(r));
}
/* American is +100 or higher, or -100 or lower: everything between is refused, with a reason that says so */
for (const [t, frag] of [["+50", "+50 is not valid American odds"], ["+99", "+99 is not valid American odds"], ["+0", "not valid American odds"],
                         ["-50", "-50 is not valid American odds"], ["-99", "-99 is not valid American odds"], ["-99.9", "not valid American odds"],
                         ["+2.5", "not valid American odds"], ["0", "too low"], ["1", "too low"], ["0.5", "too low"], ["1.0", "too low"],
                         ["abc", "not a price"], ["1e3", "not a price"], ["+", "not a price"], ["--5", "not a price"], ["12/5", "not a price"]]) {
  const r = readOdds(t);
  check(r.d === null && typeof r.err === "string" && r.err.includes(frag), `odds "${t}" refused: ${frag}`, JSON.stringify(r));
}
/* empty is not an error */
for (const t of ["", "   ", null, undefined]) { const r = readOdds(t); check(r.d === null && r.err === "" && r.empty === true, `odds ${JSON.stringify(t)} is empty, not an error`, JSON.stringify(r)); }
/* a half-typed price is told apart from a wrong one (the page waits for the first, scolds the second) */
for (const t of ["+", "+1", "+11", "-", "-9", "-99", "1", "1.", "0", "0.5"]) check(readOdds(t).more === true, `odds "${t}" could still grow valid`);
for (const t of ["abc", "+150a", "1e3", "12/5"]) check(!readOdds(t).more, `odds "${t}" cannot grow valid`);

/* amounts: digits and one point, $ and commas allowed, never negative, zero only where asked */
for (const [t, v] of [["100", 100], ["$1,000", 1000], ["25.50", 25.5], [".5", 0.5], ["10.", 10], [" 7 ", 7]]) {
  const r = readAmt(t); check(r.v === v && !r.err, `amount "${t}" reads as ${v}`, JSON.stringify(r));
}
for (const [t, frag] of [["-10", "cannot be negative"], ["−10", "cannot be negative"], ["abc", "Use digits only"], ["1e3", "Use digits only"],
                         ["1.2.3", "Use digits only"], ["12abc", "Use digits only"], ["0", "above 0"], ["0.00", "above 0"]]) {
  const r = readAmt(t); check(r.v === null && r.err.includes(frag), `amount "${t}" refused: ${frag}`, JSON.stringify(r));
}
check(readAmt("0", true).v === 0 && !readAmt("0", true).err, "a fee of 0 is allowed");
check(readAmt("0.00", true).v === 0, "a fee of 0.00 is allowed");
check(readAmt("-1", true).err.includes("cannot be negative"), "a fee below 0 is refused");
check(readAmt("").empty === true && readAmt("").err === "", "an empty amount is not an error");
check(readAmt("0").more === true && readAmt("abc").more === false, "a lone 0 is half-typed, text is not");

console.log(fails ? `\n${fails} check(s) failed` : "\nall calculator checks passed");
process.exit(fails ? 1 : 0);
