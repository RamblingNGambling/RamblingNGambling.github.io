#!/usr/bin/env python3
"""Browser checks for dist/, in headless Chromium.

    python3 verify/check-pages.py

Run `node verify/check-data.mjs` first: it writes verify/expected.json, the
filter counts worked out straight from plays.json.

Serves dist/ on 127.0.0.1 and, for every page at 390px and 1440px:
  - no console errors or page errors
  - no request leaves 127.0.0.1 (no CDN, no web font, no fetch)
  - no horizontal overflow
Then on the home page: every filter combination against expected.json, the
equity curve end against the hero figure, reduced motion, the theme toggle.
Then one worked example per calculator. Exits non-zero on any failure.

Browser: the Playwright chrome-headless-shell under ~/.cache/ms-playwright.
If /tmp/chrome-shutdown.so exists it is LD_PRELOADed (this VM's recipe).
"""
import functools, glob, http.server, json, os, pathlib, socketserver, sys, threading
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
EXPECTED = json.loads((ROOT / "verify" / "expected.json").read_text())

PAGES = ["", "about/", "how-to-read/", "arbitrage/", "hedge/", "parlay/", "payout/", "odds/", "devig/",
         "poker/", "cheat-sheet/", "404.html"]
PAGE = 15    # rows the log shows before "Show more" (home.js PAGE)
VIEWPORTS = {"390": {"width": 390, "height": 844}, "1440": {"width": 1440, "height": 900}}

fails = 0
def check(cond, msg):
    global fails
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        fails += 1

# ---- local server ----
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
httpd = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(DIST)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{httpd.server_address[1]}/"

def browser_exe():
    hits = sorted(glob.glob(os.path.expanduser(
        "~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell")))
    return hits[-1] if hits else None

def watch(pg):
    """Collect console errors, page errors, failed loads and off-box requests."""
    log = {"errors": [], "external": [], "failed": []}
    pg.on("console", lambda m: m.type == "error" and log["errors"].append(m.text))
    pg.on("pageerror", lambda e: log["errors"].append(str(e)))
    def on_req(r):
        u = urlparse(r.url)
        if u.scheme in ("data", "blob", "about"):
            return
        if u.hostname not in ("127.0.0.1", "localhost"):
            log["external"].append(r.url)
    pg.on("request", on_req)
    pg.on("requestfailed", lambda r: log["failed"].append(r.url))
    pg.on("response", lambda r: r.status >= 400 and not r.url.endswith("/404.html") and log["failed"].append(f"{r.status} {r.url}"))
    return log

def settle(pg):
    """Scroll through the page so every reveal fires, then come back up."""
    pg.wait_for_timeout(300)
    h = pg.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < h:
        y += 600
        pg.evaluate(f"window.scrollTo(0,{y})")
        pg.wait_for_timeout(60)
    pg.wait_for_timeout(1500)

with sync_playwright() as p:
    env = dict(os.environ)
    if os.path.exists("/tmp/chrome-shutdown.so"):
        env["LD_PRELOAD"] = "/tmp/chrome-shutdown.so"
    exe = browser_exe()
    b = p.chromium.launch(executable_path=exe, env=env) if exe else p.chromium.launch(env=env)

    # ---- every page, both widths ----
    for vname, vp in VIEWPORTS.items():
        for path in PAGES:
            ctx = b.new_context(viewport=vp, color_scheme="dark", has_touch=(vname == "390"))
            pg = ctx.new_page()
            log = watch(pg)
            pg.goto(BASE + path, wait_until="load")
            settle(pg)
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            hidden = pg.evaluate("[...document.querySelectorAll('[data-rv]')].filter(e=>getComputedStyle(e).opacity<0.99).length")
            name = f"{vname:>4}px /{path}"
            check(not log["errors"], f"{name} console clean {log['errors'][:3] if log['errors'] else ''}")
            check(not log["external"], f"{name} no external requests {log['external'][:3] if log['external'] else ''}")
            check(not log["failed"], f"{name} no failed loads {log['failed'][:3] if log['failed'] else ''}")
            check(over <= 0, f"{name} no horizontal overflow (scrollWidth - clientWidth = {over})")
            check(hidden == 0, f"{name} every revealed section visible after scrolling ({hidden} still hidden)")
            ctx.close()

    # ---- home: equity curve, filters, motion, theme ----
    ctx = b.new_context(viewport=VIEWPORTS["1440"], color_scheme="dark", reduced_motion="reduce")
    pg = ctx.new_page()
    log = watch(pg)
    pg.goto(BASE, wait_until="load")
    data = pg.evaluate("JSON.parse(document.getElementById('pt-data').textContent)")
    last = data["series"][-1][1]
    hero = pg.get_attribute(".big", "aria-label")
    shown = pg.inner_text(".big").replace("−", "-").replace("u", "").strip()
    check(f"{last:.2f}" == f"{EXPECTED['net']:.2f}", f"equity curve ends at {last:.2f}u, plays.json net {EXPECTED['net']:.2f}u")
    check(shown.lstrip("+") == f"{abs(last):.2f}" or shown == f"{last:.2f}", f"hero shows {shown}u ({hero}) = curve end")
    endlab = pg.text_content("#chart .endlab") or ""
    check(endlab.replace("−", "-").rstrip("u").lstrip("+") == f"{abs(last):.2f}" or endlab.replace("−", "-").rstrip("u") == f"{last:.2f}",
          f"chart end label {endlab} = curve end")
    check(pg.evaluate("!document.documentElement.classList.contains('motion')"), "reduced motion: entrance motion is off")

    def tally():
        b_ = pg.locator("#tally b")
        n = b_.nth(0).inner_text() if b_.count() else "0"
        wlp = b_.nth(1).inner_text() if b_.count() > 1 else ""
        net = b_.nth(2).inner_text().replace("−", "-").rstrip("u") if b_.count() > 2 else ""
        return n, wlp, net
    bad = []
    for c in EXPECTED["combos"]:
        if c["sport"] != "All" and not pg.locator(f"#f-sport button[data-v='{c['sport']}']").count():
            bad.append((c, "no sport button")); continue
        pg.click(f"#f-sport button[data-v='{c['sport']}']")
        pg.select_option("#f-mkt", c["market"])
        pg.click(f"#f-res button[data-v='{c['result']}']")
        if c["n"] == 0:
            ok = pg.locator("#rows tr.state").count() == 1 and tally()[0] == "0"
        else:
            n, wlp, net = tally()
            want_net = "0.00" if abs(c["net"]) < 0.005 else f"{c['net']:+.2f}"
            ok = n == str(c["n"]) and wlp == c["wlp"] and net == want_net
            rows = pg.locator("#rows tr[data-k]").count()
            ok = ok and rows == min(PAGE, c["n"])
        if not ok:
            bad.append((c, tally()))
    check(not bad, f"filters: {len(EXPECTED['combos']) - len(bad)}/{len(EXPECTED['combos'])} combinations match plays.json "
                   f"(count, W-L-P, net, rows shown){' first miss: ' + str(bad[0]) if bad else ''}")
    # reset, paging
    pg.click("#f-sport button[data-v='All']"); pg.select_option("#f-mkt", "All"); pg.click("#f-res button[data-v='All']")
    check(pg.locator("#clear").is_hidden(), "clear button hidden with no filters")
    pg.click("#f-sport button[data-v='MLB']"); pg.click("#clear")
    check(tally()[0] == str(len(data["plays"])), "clear filters returns to the full log")
    if pg.locator("#more-all").count():
        pg.click("#more-all")
        check(pg.locator("#rows tr[data-k]").count() == len(data["plays"]), f"show all lists every play ({len(data['plays'])})")
    pg.click("#tab-market"); check(pg.inner_text("#brk-t") == "By market", "breakdown tabs switch")
    pg.click(".chartp .seg button[data-r='30']"); check("30 days" in pg.inner_text("#delta"), "chart range switches to 30 days")
    check(not log["errors"], f"home interactions console clean {log['errors'][:3]}")
    ctx.close()

    ctx = b.new_context(viewport=VIEWPORTS["1440"], color_scheme="dark")
    pg = ctx.new_page(); log = watch(pg); pg.goto(BASE, wait_until="load")
    check(pg.evaluate("document.documentElement.classList.contains('motion')"), "motion on when the reader allows it")
    pg.wait_for_timeout(1800)
    check(pg.inner_text(".big").replace("−", "-").rstrip("u").lstrip("+") == f"{abs(EXPECTED['net']):.2f}",
          "hero count-up lands on the real figure")
    pg.click("#f-sport button[data-v='NFL']"); pg.wait_for_timeout(500)   # FLIP transition path
    seq = []
    for _ in range(3):
        pg.click("#theme"); pg.wait_for_timeout(450)
        seq.append(pg.evaluate("[document.documentElement.dataset.pref, document.documentElement.dataset.theme]"))
    check(seq == [["dark", "dark"], ["light", "light"], ["auto", "dark"]], f"theme toggle cycles {seq}")
    check(not log["errors"], f"animated home console clean {log['errors'][:3]}")
    ctx.close()

    # ---- calculators: one worked example each ----
    def tool(path, steps, probe, want, label):
        c = b.new_context(viewport=VIEWPORTS["1440"], reduced_motion="reduce")
        q = c.new_page(); lg = watch(q); q.goto(BASE + path, wait_until="load")
        for s in steps:
            s(q)
        got = probe(q)
        check(want(got) and not lg["errors"], f"{label}: {got!r} {lg['errors'][:2] if lg['errors'] else ''}")
        c.close()
    tool("arbitrage/", [lambda q: q.fill("#ar-a", "+110"), lambda q: q.fill("#ar-b", "+110"), lambda q: q.fill("#ar-sa", "100")],
         lambda q: (q.input_value("#ar-sb"), q.inner_text("#ar-out")), lambda g: g == ("100.00", "+$10.00"),
         "arbitrage +110/+110, $100 on A -> $100 on B, +$10.00")
    tool("hedge/", [lambda q: q.fill("#hg-o", "+400"), lambda q: q.fill("#hg-s", "100"), lambda q: q.fill("#hg-h", "-140")],
         lambda q: q.inner_text("#hg-out"), lambda g: g == "+$108.33", "hedge +400 $100 vs -140 locks +$108.33")
    tool("parlay/?legs=%2B100%2C%2B100%2C%2B100&pl-s=10", [], lambda q: (q.inner_text("#pl-best"), q.inner_text("#pl-bestp")),
         lambda g: g == ("$80.00", "+$70.00"), "parlay 3 x +100 at $10 pays $80.00")
    tool("payout/", [lambda q: q.fill("#py-am", "+150")], lambda q: (q.input_value("#py-dec"), q.input_value("#py-frac"), q.inner_text("#py-pay")),
         lambda g: g == ("2.500", "3/2", "$25.00"), "payout +150 on $10 -> 2.500, 3/2, $25.00")
    tool("odds/", [lambda q: q.fill("#pc-in", "57"), lambda q: q.fill("#pc-o", "-250"), lambda q: q.fill("#pc-m", "1.83")],
         lambda q: (q.inner_text("#pc-out"), q.inner_text("#pc-oout"), q.inner_text("#pc-mout")),
         lambda g: g == ("-133", "71.43%", "-120"), "odds 57% -> -133, -250 -> 71.43%, 1.83x -> -120")
    tool("devig/", [lambda q: q.fill("#dv-a", "-110"), lambda q: q.fill("#dv-b", "-110")],
         lambda q: (q.inner_text("#dv-pa"), q.inner_text("#dv-oa")), lambda g: g == ("50.00%", "+100"), "devig -110/-110 -> 50.00%, +100")
    def poker_steps():
        def add(name):
            return lambda q: (q.fill("#pk-name", name), q.press("#pk-name", "Enter"))
        def cash(i, v):
            return lambda q: q.locator("#pk-rows input[aria-label='Cash-out']").nth(i).fill(v)
        return [add("Ann"), add("Ben"), cash(0, "150"), cash(1, "50")]
    tool("poker/", poker_steps(), lambda q: q.inner_text("#pk-pay"),
         lambda g: "Ben" in g and "Ann" in g and "$50.00" in g, "poker Ann +50 / Ben -50 -> Ben pays Ann $50.00")
    tool("cheat-sheet/", [lambda q: q.fill("#cf", "55")], lambda q: (q.locator("#csheet .crow:not(.hd)").count(), q.inner_text(".crow.hit")),
         lambda g: g[0] == 99 and "-122" in g[1], "cheat sheet 99 rows, 55% -> -122")

    b.close()
httpd.shutdown()
print(f"\n{fails} check(s) failed" if fails else "\nall page checks passed")
sys.exit(1 if fails else 0)
