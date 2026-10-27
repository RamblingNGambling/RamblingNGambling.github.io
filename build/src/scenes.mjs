/* Tool scenes: eight small looping pictures, one per tool, drawn as inline SVG.

   Each value is an <svg> string. The tiles on the home page carry them (and,
   from the tool-page headers, the same pictures again). All colour, type and
   motion live in the TOOL SCENES block at the end of site.css; this file holds
   geometry and class names only, so a scene reads in both themes.

   Rules every scene follows:
   - The markup is the finished picture (the "still"). Motion only ever plays
     from it: parts clear, then rebuild step by step, then hold the still.
   - No money, no stakes, no book names, no emoji. Only abstract labels and
     prices or percentages whose arithmetic is right.
   - Classes are prefixed tsc-. A class such as tsc-ar-sa names the part that
     moves; tsc-n, tsc-p, tsc-w, tsc-d, tsc-c are plain looks (neutral, accent,
     accent wash, down, chip); tsc-o* set the transform origin.

   Prices used and their checks:
     fair odds   25% = +300, 50% = +100, 75% = -300      (100 x 75/25 = 300)
     parlay      1.91 x 2.50 = 4.775 (4.78), x 1.83 = 8.73825 (8.74)
     payout      +150 pays 1.5 x stake; -150 pays 100/150 = 0.667 x stake
     devig       52 + 52 = 104%; shaved to 50 + 50 = 100%
     odds        -200 = 66.7%, +100 = 50%, +300 = 25%
*/

const svg = body => `<svg class="tsc" viewBox="0 0 200 96" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" aria-hidden="true" focusable="false">${body}</svg>`;
const T = (x, y, s, c = "") => `<text class="tsc-t${c ? " " + c : ""}" x="${x}" y="${y}">${s}</text>`;

/* poker: two payers on the left, two receivers on the right */
const POKER = [["A", 34, 24, "d"], ["B", 34, 72, "d"], ["C", 166, 24, "a"], ["D", 166, 72, "a"]];
const dot = ([ch, x, y, k]) =>
  `<circle class="tsc-dot" cx="${x}" cy="${y}" r="10"/>` +
  `<circle class="tsc-rg ${k === "d" ? "tsc-rd" : "tsc-ra"} tsc-hid tsc-pk-rg" cx="${x}" cy="${y}" r="10"/>` +
  T(x, y + 3, ch, "tsc-m tsc-f2") +
  `<g class="tsc-pk-ck tsc-oc"><circle class="tsc-bd" cx="${x + 9}" cy="${y - 9}" r="5"/><path class="tsc-ck" d="M${x + 6.6} ${y - 8.8}l1.6 1.7l3-3.4"/></g>`;

export const SCENES = {
  /* 1. arbitrage: two stakes stack to a line; two equal returns rise past it */
  arbitrage: svg(
    `<path class="tsc-ax" d="M12 80H188"/>` +
    T(37, 91, "staked", "tsc-m") + T(98, 91, "A wins", "tsc-m") + T(138, 91, "B wins", "tsc-m") +
    `<rect class="tsc-n tsc-ob tsc-ar-sa" x="22" y="62" width="30" height="18"/>` +
    `<rect class="tsc-n2 tsc-ob tsc-ar-sb" x="22" y="40" width="30" height="22"/>` +
    T(37, 74, "A", "tsc-m tsc-ar-la") + T(37, 54, "B", "tsc-m tsc-ar-lb") +
    `<rect class="tsc-p tsc-ob tsc-ar-ba" x="84" y="34" width="28" height="46"/>` +
    `<rect class="tsc-p tsc-ob tsc-ar-bb" x="124" y="34" width="28" height="46"/>` +
    `<line class="tsc-ds tsc-ar-ln" x1="22" y1="40" x2="160" y2="40"/>` +
    `<g class="tsc-oc tsc-ar-ch"><rect class="tsc-w" x="160" y="33" width="32" height="14" rx="7"/>${T(176, 43, "+15%", "tsc-m tsc-fa")}</g>`
  ),

  /* 2. hedge: a lopsided pair of outcomes; the hedge arrives and both end level above zero */
  hedge: svg(
    `<path class="tsc-ax" d="M18 52H186"/>` + T(11, 55, "0", "tsc-m") +
    T(39, 91, "bet wins", "tsc-m") + T(99, 91, "hedge", "tsc-m") + T(159, 91, "bet loses", "tsc-m") +
    `<line class="tsc-ds tsc-hg-ln" x1="24" y1="28" x2="174" y2="28"/>` +
    T(174, 23, "locked", "tsc-e tsc-hg-lk") +
    `<rect class="tsc-p tsc-ob tsc-hg-w" x="24" y="28" width="30" height="24"/>` +
    `<rect class="tsc-d tsc-ot tsc-hid tsc-hg-ld" x="144" y="52" width="30" height="20"/>` +
    `<rect class="tsc-p tsc-ob tsc-hg-lu" x="144" y="28" width="30" height="24"/>` +
    `<rect class="tsc-n tsc-hg-h" x="92" y="52" width="14" height="12"/>`
  ),

  /* 3. parlay: three legs land, a stair of three multiples rises */
  parlay: svg(
    `<path class="tsc-ax" d="M88 80H188"/>` +
    [[12, 1, "x1.91"], [38, 2, "x2.50"], [64, 3, "x1.83"]].map(([y, n, m]) =>
      `<g class="tsc-pl-c${n}"><rect class="tsc-c" x="10" y="${y}" width="64" height="20" rx="5"/>${T(19, y + 13, n)}${T(66, y + 13, m, "tsc-e tsc-f1")}</g>`).join("") +
    `<rect class="tsc-w tsc-ob tsc-pl-b1" x="92" y="67" width="26" height="13"/>` +
    `<rect class="tsc-w tsc-ob tsc-pl-b2" x="124" y="47" width="26" height="33"/>` +
    `<rect class="tsc-p tsc-ob tsc-pl-b3" x="156" y="20" width="26" height="60"/>` +
    T(105, 63, "1.91x", "tsc-m tsc-pl-t1") + T(137, 43, "4.78x", "tsc-m tsc-pl-t2") + T(169, 16, "8.74x", "tsc-m tsc-fa tsc-pl-t3")
  ),

  /* 4. payout: the profit extension stretches and shrinks with the price */
  payout: svg(
    `<rect class="tsc-n" x="18" y="38" width="60" height="26"/>` +
    `<rect class="tsc-p tsc-ol tsc-py-x" x="78" y="38" width="90" height="26"/>` +
    T(48, 77, "stake", "tsc-m") + T(84, 77, "profit") +
    `<rect class="tsc-c" x="18" y="10" width="44" height="16" rx="8"/>` +
    T(40, 21, "+150", "tsc-m tsc-f1 tsc-oc tsc-py-cp") + T(40, 21, "-150", "tsc-m tsc-f1 tsc-oc tsc-hid tsc-py-cn") +
    T(168, 33, "1.5x", "tsc-e tsc-fa tsc-oc tsc-py-rp") + T(118, 33, "0.667x", "tsc-e tsc-fa tsc-oc tsc-hid tsc-py-rn")
  ),

  /* 5. odds converter: a gauge fills as price and percent swap through pairs */
  odds: svg(
    `<path class="tsc-gt" pathLength="1" d="M12 70A42 42 0 0 1 96 70"/>` +
    `<path class="tsc-gf tsc-od-g" pathLength="1" d="M12 70A42 42 0 0 1 96 70"/>` +
    `<path class="tsc-ax" d="M54 19V24"/>` + T(12, 82, "0%", "tsc-m") + T(96, 82, "100%", "tsc-m") +
    `<rect class="tsc-c" x="112" y="14" width="76" height="20" rx="6"/>` + T(120, 27, "odds") +
    T(180, 27, "-200", "tsc-e tsc-f1 tsc-oc tsc-hid tsc-od-p1") + T(180, 27, "+300", "tsc-e tsc-f1 tsc-oc tsc-hid tsc-od-p2") + T(180, 27, "+100", "tsc-e tsc-f1 tsc-oc tsc-od-p3") +
    `<g class="tsc-oc tsc-od-sw"><path class="tsc-gl" d="M146 52V42M143 45L146 42L149 45M154 42V52M151 49L154 52L157 49"/></g>` +
    `<rect class="tsc-c" x="112" y="60" width="76" height="20" rx="6"/>` + T(120, 73, "pct") +
    T(180, 73, "66.7%", "tsc-e tsc-fa tsc-oc tsc-hid tsc-od-p1") + T(180, 73, "25%", "tsc-e tsc-fa tsc-oc tsc-hid tsc-od-p2") + T(180, 73, "50%", "tsc-e tsc-fa tsc-oc tsc-od-p3")
  ),

  /* 6. devig: 52 + 52 overshoots 100%; the overhang is shaved and both sides settle at 50 */
  devig: svg(
    T(51, 35, "A", "tsc-m") + T(121, 35, "B", "tsc-m") +
    `<rect class="tsc-p tsc-ol tsc-dv-a" x="16" y="40" width="70" height="18"/>` +
    `<rect class="tsc-n tsc-ol tsc-dv-b" x="86" y="40" width="70" height="18"/>` +
    `<rect class="tsc-d tsc-ol tsc-hid tsc-dv-o" x="156" y="40" width="5.6" height="18"/>` +
    `<path class="tsc-tk" d="M156 30V68"/>` + T(156, 25, "100%", "tsc-m") +
    T(51, 52, "50%", "tsc-m tsc-f2 tsc-dv-l5") + T(121, 52, "50%", "tsc-m tsc-f2 tsc-dv-l5") +
    T(52, 52, "52%", "tsc-m tsc-f2 tsc-hid tsc-dv-l4") + T(125, 52, "52%", "tsc-m tsc-f2 tsc-hid tsc-dv-l4") +
    T(162, 76, "104%", "tsc-e tsc-fd tsc-hid tsc-dv-t") +
    `<g class="tsc-oc tsc-dv-c"><rect class="tsc-w" x="120" y="66" width="36" height="14" rx="7"/>${T(138, 76, "fair", "tsc-m tsc-fa")}</g>`
  ),

  /* 7. poker settle-up: payments run from payers to receivers, rings settle */
  poker: svg(
    `<path class="tsc-ax" d="M46 24H152M46 72H152M45.3 67.9L154.7 28.1"/>` +
    `<path class="tsc-ah" d="M148 21L152 24L148 27M148 69L152 72L148 75M151 32.6L154.7 28.1L149 27"/>` +
    POKER.map(dot).join("") +
    `<circle class="tsc-pu tsc-pk-p1" cx="47" cy="24" r="2.5"/>` +
    `<circle class="tsc-pu tsc-pk-p2" cx="48.1" cy="66.9" r="2.5"/>` +
    `<circle class="tsc-pu tsc-pk-p3" cx="47" cy="72" r="2.5"/>` +
    T(100, 90, "3 payments", "tsc-m")
  ),

  /* 8. cheat sheet: a band steps down the rows of percent and fair price */
  "cheat-sheet": svg(
    T(34, 14, "percent") + T(166, 14, "odds", "tsc-e") +
    `<path class="tsc-ax" d="M30 19H170"/><path class="tsc-hl" d="M30 44H170M30 64H170"/>` +
    `<rect class="tsc-w tsc-ch-b" x="24" y="44" width="152" height="20" rx="4"/>` +
    T(36, 37, "25%", "tsc-f2") + T(164, 37, "+300", "tsc-e tsc-f1") +
    T(36, 57, "50%", "tsc-f2") + T(164, 57, "+100", "tsc-e tsc-f1") +
    T(36, 77, "75%", "tsc-f2") + T(164, 77, "-300", "tsc-e tsc-f1")
  )
};
