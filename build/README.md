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
one worked example per calculator. Both scripts exit non-zero on failure.

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
src/pages/*.html     bodies of the inner pages ({{rel}} = path back to the root)
verify/              the two check scripts
dist/                output (committed so the result can be looked at directly)
```

`dist/` holds `index.html`, `about/`, `how-to-read/`, eight tool pages
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
  section head, beside the how-to-read note; 04 the tools index.
- **Every inner page** carries the record strip in the footer (home has it in
  the hero): net units, settled count, W-L-P, ROI, last update and the last 20
  results.
- **About** and **How to read** carry the old content over into the new design.
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

## Changes from the old site

- The payout page's **screenshot reader is gone**. It downloaded Tesseract from
  jsDelivr when used, which breaks the zero-external-requests rule, and it
  cannot be bundled without npm. The rest of the payout tool is intact.
- Theme choice is stored as `pt-theme`. An old `rg.theme` choice is still read.
- The old tracker's month calendar, open-plays dropdown, unit-to-dollar box and
  "since your last visit" note are not in the Direction A design and were not
  carried over.
