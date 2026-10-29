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
node verify/check-art-slot.mjs  # the optional hero pictures in art/: good, bad and hostile files
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
src/site.js          shared runtime: theme cross-fade, reveals, count-ups, the .seg pill (window.PT)
src/home.js          home: equity curve, play log + filters, breakdown
src/tools.js         the calculators (logic carried over from the old site)
src/sga.js           SGA 20+ page: the ladder chart, the slip viewer, the tagline and the three step visuals
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
  filter logic and FLIP row transitions, over all plays, paged 15 at a time (Show more moves keyboard focus to the first row it added);
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
  The headline result of each calculator (Profit, Locked in, Payout, Best case
  profit) also shows what it was and how far it moved (`.chg` under the figure,
  written by the last block of `tools.js`): once typing has been quiet for 700 ms,
  a move between two settled readings reads like `+$1.10  was $4.20`, in the accent
  colour for a gain and the down colour for a loss. A reset, a blank or half-typed
  price clears it at once and starts the comparison afresh, so it never says "was $0.00" from
  the empty state; a break-even (+$0.00) is a real result. The line is always in the layout
  so nothing shifts, and a cell too narrow for both shows the change only. The poker difference is a check,
  not a result, and has none.

Motion: count-ups, chart draw-in, staggered reveals, filter transitions,
breakdown bars, tile and row hovers, a sliding pill under the chosen button of
every segmented control (`.seg`: chart range, play filters, breakdown tabs, the
tools' mode switches), and the theme cross-fade (View Transitions, with a
colour-transition fallback). All of it sits behind `html.motion` (the pill, as
decoration, behind `html.deco`) and `(hover:hover)`, and `prefers-reduced-motion`
turns it off, mid-visit included.

The copy buttons (Copy link on every tool page, Copy results on the poker page)
confirm themselves for 1.6 s with a check that draws in beside the word Copied
(`copyFlash()` in `tools.js`; `.cl`, `.cl-d` and `.ck` in `site.css`). The idle
label and the Copied face share one grid cell, so the button is as wide as the
wider of the two and nothing beside it moves. The button keeps its name through
`aria-label`, and a polite live region announces what was copied. The draw is
decoration (`html.deco`); with reduced motion the finished check and the word
just show. A refused clipboard still falls back to the prompt.

The pill is the group's `::before`, placed by `--px --py --pw --ph` that
`site.js` sets from the chosen button (`aria-pressed` or `aria-selected`), so a
page script that redraws its buttons does not lose it. The first placement, a
resize and a key press snap; a click slides it in 200 ms on the site's one curve.
With no script, or with nothing chosen, the chosen button keeps its own fill.

Zero external requests: no CDN, no web font, no fetch. The home page's data is
inlined as JSON. Outbound links (posts on X, the Kalshi referral, the commit
history) are only links.

## SGA 20+ experiment (an optional page)

Bet Desk writes two things beside `plays.json`: `sga.json` (the experiment's games,
as multiples of the first stake, plus what each run started with and is worth now) and
a screenshot of each bet slip in `sga/proof/<id>.jpg`. When `sga.json` is there and
makes sense, the build adds `/sga/`, a small tab that hangs off the header on every other
page (top right; it points a newcomer at `/sga/` and is gone once used or closed:
`pt-sga-seen`), a one-line pointer under the home ticker, a line in the sitemap and the
404 page, `assets/sga.js`, `dist/sga.json` (the same data in words) and the screenshots in
`dist/sga/proof/`. There is no SGA link in the menu.

The page was redesigned on 26 October 2026 (`sgaBody()` in `build.mjs`, the block "SGA 20+
page" in `src/site.css`, and `src/sga.js`). From top to bottom:

1. **Hero.** A kicker, the headline "Betting SGA 20+ points for the season." (the only
   gradient on the page, and it is on the text), a lead line, one button ("Follow
   @gamblingv1ctim on X") and a note with the update time and a link to `sga.json`. The
   lead line opens with "Started with $30 on Oct 25." when dollar figures are on.
2. **The roll card**, beside the hero (under it on a phone). A status pill, the big
   multiple of the first stake (it counts up), one sentence on where the run stands and a
   stats grid. The grid has the profit (only with dollar figures), wins in a row, best roll,
   record, average points and games. There is no row of game pips (removed 26 Oct). From two
   wins in a row, a short line says how likely that streak was at the prices taken.
3. **01 The ladder.** A bar chart of the roll after each game, with a legend.
4. **The tagline.** One large line. Each word goes from muted to full ink as the reader
   scrolls it past a line 30% up from the bottom of the screen.
5. **02 How it works.** Three cards: one bet on each game, a win goes onto the next game,
   a miss ends the run. Each card has a looping picture. The loop plays only while its
   card is on screen.
6. **03 Game by game.** A table of every game in the current run. A second table lists
   the earlier runs, when there are any.
7. **04 Proof of placement.** The slip screenshots, with a viewer: a tap opens it, a tap on
   the slip zooms to 2x toward that point, a drag or the arrow keys pan within the
   picture's edges, and a tap again (or the minus button) fits it back. A tap outside
   the slip, the cross or Esc closes. The zoom eases behind `html.deco`; a drag and the
   keys snap. Tab stays inside the viewer and the page behind does not scroll. Only if a game has one. It is the last section.

There is no Questions section, no FAQPage block and no closing card. Darren removed them
on 26 October 2026. The hero button is the only follow button.

Design rules (from the landing-page-design skill):

- Spacing only 4, 8, 12, 16, 24, 32, 40, 48, 64, 80 and 96 px. Type only the Tailwind
  steps 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72 and 96 px. Radii 4, 8, 12, 16 and 24
  px, with the nested rule: an inner radius is the outer radius minus the gap.
- Flat backgrounds: cards `#181818`, wells `#1F1F1F`, chips `#272727` in dark; the site's
  own tokens in light. The only gradient is on the headline text (white to `#9B9B9B` in
  dark, black to `#666` in light).
- One primary action: the follow button. No hyphens or em dashes in the copy. No pronouns
  for people.
- One base curve, `cubic-bezier(.22,1,.36,1)`. Scroll reveals rise 32 px, once.
- Motion for the three cards follows the design-to-motion skill (website mode): a card
  rises in with a blur, then its picture loops while the card is on screen. All of it
  sits behind `html.motion`. With reduced motion the pictures stand still, the tagline
  shows at full ink and nothing animates.

Not applied, on purpose:

- The skill's Geist/Manrope font. It needs a font download, and it would split the site's
  single typeface. The page keeps the site's system sans and system mono.
- The skill's list of allowed dark ground colours. The ground `#0A0A0B` and the header
  are shared by every page, so they stay.

Rules that still hold:

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
  they give the profit figure, the "worth now" line and the "Started with $30" line.
  Both must be plain numbers (start above 0, bank 0 or more) or the pair is ignored and
  the page shows no money. Bet Desk writes them only while its "Show my dollar figures"
  box is ticked. There is no book and no stake of any single game in the data or on the
  page.
- A run of more than 8x is drawn on a log scale, and the chart says so.
- `node verify/check-sga.mjs` builds the site in a temp copy with good, bad and hostile
  `sga.json` files and checks the outcome (32 checks, no browser). `ship.sh` runs it.
- `verify/check-pages.py` includes `sga/` when it is built. It has not been run
  against this page here (no Playwright). The redesigned page was looked at in a browser at
  320, 375, 768, 1100 and 1280 px, dark and light, with no console errors and no sideways
  scroll. Its reveals and the three step loops need a visible tab: in a hidden tab the
  page stays faint until the tab is shown, as the rest of the site does.

## Changes from the old site

- The payout page's **screenshot reader is gone**. It downloaded Tesseract from
  jsDelivr when used, which breaks the zero-external-requests rule, and it
  cannot be bundled without npm. The rest of the payout tool is intact.
- Theme choice is stored as `pt-theme`. An old `rg.theme` choice is still read.
- The old tracker's month calendar, open-plays dropdown, unit-to-dollar box and
  "since your last visit" note are not in the Direction A design and were not
  carried over.
