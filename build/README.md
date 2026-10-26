# Public Tracker: static build (Direction A)

Rebuilds the public betting tracker as a static site from `plays.json`, in the
Direction A design (`prototypes/direction-a-evolved.html`), after a premium
polish and compression pass: one sans for reading, mono only for labels and
table figures, lilac rationed to the key figures and the curve, hairlines
instead of shadows, numbered sections.

## Build

```sh
node build.mjs
```

That is the whole build: one script, Node's standard library only (Node 18+;
written against 24). No npm, no pip, nothing to install. It writes the site to
`dist/`.

The data file is found automatically: `../plays.json` when this folder sits
inside the site repo, `../site/plays.json` from the workspace copy. To use a
different file, pass its path: `node build.mjs path/to/plays.json`.

The build fails loudly on bad data: a play missing a field, a settled play
without `units_pl`, or an equity curve that does not end at the net figure.

## Preview

```sh
python3 -m http.server -d dist 8000    # then open http://127.0.0.1:8000/
```

Links between pages are relative folders (`about/`, `../odds/`), as on GitHub
Pages, so serve `dist/` over http rather than opening the files directly.

## Verify

```sh
node verify/check-data.mjs      # equity curve vs hero, inlined data, filter counts
node verify/check-sga.mjs       # the optional SGA page: good, bad and hostile sga.json files
python3 verify/check-pages.py   # headless Chromium: every page at 390px and 1440px
```

`check-data.mjs` recomputes everything from `plays.json` on its own (not with
the build's code): the cumulative sum of `units_pl` in date order must equal
the hero figure; the data inlined in the home page must match `plays.json` row
for row; and every sport × market × result filter combination is counted and
written to `verify/expected.json`.

`check-pages.py` (Python Playwright, the chrome-headless-shell in
`~/.cache/ms-playwright`; it `LD_PRELOAD`s `/tmp/chrome-shutdown.so` when that
file exists) serves `dist/` on 127.0.0.1 and checks each page for console
errors, requests leaving the box, failed loads, horizontal overflow and
sections left hidden. On the home page it clicks through every filter
combination in `expected.json` and compares the count, W-L-P, net units and
rows shown. It also checks reduced motion, the count-up, the theme toggle and
one worked example per calculator. It also tests the follow nudge (both
triggers, placement, focus, Esc, no layout shift) and screenshots it in place
at both widths into `verify/shots/` (git-ignored) for review. Both scripts
exit non-zero on failure.

## Build, verify and commit in one go

```sh
sh ship.sh
```

Runs the build and both checks, stopping at the first failure, then creates
the branch `redesign` in `../site`, copies this folder in as `build/` and
commits it. It does not push.

## Layout

```
build.mjs            the build: reads plays.json, computes figures, writes dist/
src/site.css         design system, extracted from the Direction A prototype
src/site.js          shared runtime: theme cross-fade, reveals, count-ups (window.PT)
src/home.js          home: equity curve, play log + filters, breakdown
src/tools.js         the calculators (logic carried over from the old site)
src/sga.js           SGA 20+ page: the ladder chart (drawn in its own width) and the slip viewer
src/pages/*.html     bodies of the inner pages ({{rel}} = path back to the root)
verify/              the two check scripts
dist/                output (committed so the result can be looked at directly)
```

`dist/` holds `index.html`, `about/`, eight tool pages
(`arbitrage`, `hedge`, `parlay`, `payout`, `odds`, `devig`, `poker`,
`cheat-sheet`), a self-contained `404.html`, `assets/` (CSS and JS, with
content-hash query strings), plus `plays.json`, `og.png`, `robots.txt` and a
regenerated `sitemap.xml`.

## What the pages do

- **Home.** 01 the record: net units with count-ups, the ledger (settled, ROI,
  W-L-P, win rate, last 20 results) and the equity curve (SVG, cumulative
  units by day, high and low marked, draw-in, hover and keyboard readout,
  30-day / all range). 02 the play log: sport, result and market filters on one
  control row, the live tally in the section head, a reset, the prototype's
  filter logic and FLIP row transitions, over all plays, paged 15 at a time;
  03 splits by sport, market and month (units P/L, W-L-P, ROI), tabs in the
  section head, beside the reading note; 04 the tools index.
  On a first visit ever, after 25 seconds or at 60% scroll depth, a small
  card (a bottom sheet on phones) asks the reader to follow on X. It is
  remembered as `pt-follow-seen` the moment it shows, so it never returns.
- **Every inner page** carries the record strip in the footer (home has it in
  the hero): net units, settled count, W-L-P, ROI, last update and the last 20
  results.
- **About** carries the old content over into the new design.
- **Tools.** The seven calculators plus the percent-to-odds cheat sheet. The
  maths, inputs, share links (`?ar-a=…`), reset and the poker table's local
  save are unchanged from the old site.

Motion: count-ups, chart draw-in, staggered reveals, filter transitions,
breakdown bars, tile and row hovers, and the theme cross-fade (View
Transitions, with a colour-transition fallback). All of it sits behind
`html.motion` and `(hover:hover)`, and `prefers-reduced-motion` turns it off,
mid-visit included.

Zero external requests: no CDN, no web font, no fetch. The home page's data is
inlined as JSON. Outbound links (posts on X, the Kalshi referral, the commit
history) are only links.

## SGA 20+ experiment (an optional page)

Bet Desk writes two things beside `plays.json`: `sga.json` (the experiment's games,
as multiples of the first stake, plus what each run started with and is worth now) and
a screenshot of each bet slip in `sga/proof/<id>.jpg`. When `sga.json` is there and
makes sense, the build adds `/sga/` (the roll, the profit, a ladder of bars, every
game, the slips), a small tab that hangs off the header on every other page (top right;
it points a newcomer at `/sga/` and is gone once used or closed: `pt-sga-seen`), a
one-line pointer under the home ticker, a line in the sitemap and the 404 page,
`assets/sga.js`, `dist/sga.json` (the same data in words) and the screenshots in
`dist/sga/proof/`. There is no SGA link in the menu.

- **No file, or a file that does not make sense, means no SGA page and a green
  build.** A warning is printed (`sga.json ignored: ...`). A problem with this
  optional page must never stop the record from updating. With no `sga.json`
  the output is identical to what it was before, apart from the stylesheet gaining
  rules.
- **Only the fields the build reads are used, and each is checked** (a date, a
  line, an American price, a result, a roll, points, a screenshot name). Anything
  else in the file, including anything that looks like money, never reaches a page.
  The opponent is cut to plain letters and digits. A screenshot is linked only if
  its file is in `sga/proof/`.
- The figures are multiples of the first stake. The only dollar figures are the two a
  run may carry as `usd: {start, bank}` (what it started with, what it is worth now):
  they give the profit counter and the "Started with $30" line. Both must be plain
  numbers (start above 0, bank 0 or more) or the pair is ignored and the page shows
  no money. Bet Desk writes them only while its "Show my dollar figures" box is
  ticked. There is no book and no stake of any single game in the data or on the page.
- A run of more than 8x is drawn on a log scale, and the chart says so.
- `node verify/check-sga.mjs` builds the site in a temp copy with good, bad and hostile
  `sga.json` files and checks the outcome (25 checks, no browser). `ship.sh` runs it.
- `verify/check-pages.py` includes `sga/` when it is built. It has not been run
  against this page here (no Playwright), but the page was looked at in a browser at
  390 px and 1440 px, dark and light, with no console errors and no sideways scroll.

## Changes from the old site

- The payout page's **screenshot reader is gone**. It downloaded Tesseract from
  jsDelivr when used, which breaks the zero-external-requests rule, and it
  cannot be bundled without npm. The rest of the payout tool is intact.
- Theme choice is stored as `pt-theme`. An old `rg.theme` choice is still read.
- The old tracker's month calendar, open-plays dropdown, unit-to-dollar box and
  "since your last visit" note are not in the Direction A design and were not
  carried over.
