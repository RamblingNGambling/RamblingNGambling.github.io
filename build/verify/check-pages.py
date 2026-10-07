#!/usr/bin/env python3
"""Browser checks for dist/, in headless Chromium.

    python3 verify/check-pages.py

Run `node verify/check-data.mjs` first: it writes verify/expected.json, the
filter counts worked out straight from plays.json.

Serves dist/ on 127.0.0.1 and, for every page at 390px and 1440px:
  - no console errors or page errors
  - no request leaves 127.0.0.1 (no CDN, no web font, no fetch), except
    exactly one: the Umami script at UMAMI_SRC, stubbed with empty JS so the
    checks need no network and send no test traffic
  - the Umami snippet, with the right website ID, exactly once
  - no horizontal overflow
Then on the home page: every filter combination against expected.json, the
equity curve end against the hero figure, reduced motion, the theme toggle,
and the first-visit follow nudge (trigger, placement, focus, Esc, no layout
shift), screenshotted in place at both widths into verify/shots/ for review.
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

PAGES = ["", "about/", "arbitrage/", "hedge/", "parlay/", "payout/", "odds/", "devig/",
         "poker/", "cheat-sheet/", "404.html"]
PAGE = 15    # rows the log shows before "Show more" (home.js PAGE)
SHOTS = ROOT / "verify" / "shots"   # screenshots for review (git-ignored)
SEEN = "try{localStorage.setItem('pt-follow-seen','1')}catch(e){}"   # a returning reader: no follow nudge
VIEWPORTS = {"390": {"width": 390, "height": 844}, "1440": {"width": 1440, "height": 900}}
# The one allowed external request. Only this exact URL; the rest of the domain
# (including the beacon the real script would send) still counts as off-box.
UMAMI_SRC = "https://cloud.umami.is/script.js"
UMAMI_ID = "55eb5498-a3ca-4912-846f-c48e59a9971a"
UMAMI = f'<script defer src="{UMAMI_SRC}" data-website-id="{UMAMI_ID}"></script>'

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
    log = {"errors": [], "external": [], "failed": [], "umami": 0}
    pg.on("console", lambda m: m.type == "error" and log["errors"].append(m.text))
    pg.on("pageerror", lambda e: log["errors"].append(str(e)))
    def on_req(r):
        u = urlparse(r.url)
        if u.scheme in ("data", "blob", "about"):
            return
        if r.url == UMAMI_SRC:   # answered by the stub in context()
            log["umami"] += 1
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

    def context(**kw):
        """A browser context whose Umami script request is fulfilled locally with
        empty JS: nothing reaches cloud.umami.is."""
        c = b.new_context(**kw)
        c.route(lambda u: u == UMAMI_SRC,
                lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))
        return c

    # ---- the analytics snippet, in the built files ----
    for path in PAGES:
        f = DIST / (path if path.endswith(".html") else path + "index.html")
        html = f.read_text()
        check(html.count(UMAMI) == 1 and html.count("cloud.umami.is") == 1 and html.count("data-website-id") == 1
              and html.rstrip().endswith(UMAMI + "\n</body>\n</html>"),
              f"/{path} carries the Umami snippet once, website ID {UMAMI_ID}, just before </body>")

    # ---- every page, both widths ----
    for vname, vp in VIEWPORTS.items():
        for path in PAGES:
            ctx = context(viewport=vp, color_scheme="dark", has_touch=(vname == "390"))
            pg = ctx.new_page()
            log = watch(pg)
            pg.goto(BASE + path, wait_until="load")
            settle(pg)
            over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            hidden = pg.evaluate("[...document.querySelectorAll('[data-rv]')].filter(e=>getComputedStyle(e).opacity<0.99).length")
            name = f"{vname:>4}px /{path}"
            check(not log["errors"], f"{name} console clean {log['errors'][:3] if log['errors'] else ''}")
            check(not log["external"], f"{name} no external requests but Umami {log['external'][:3] if log['external'] else ''}")
            tags = pg.evaluate("[...document.scripts].filter(s=>/umami/i.test(s.outerHTML)).map(s=>[s.src,s.dataset.websiteId,s.defer])")
            check(tags == [[UMAMI_SRC, UMAMI_ID, True]] and log["umami"] == 1,
                  f"{name} one Umami script, right ID, deferred, loaded once from the stub ({tags}, {log['umami']} request(s))")
            check(not log["failed"], f"{name} no failed loads {log['failed'][:3] if log['failed'] else ''}")
            check(over <= 0, f"{name} no horizontal overflow (scrollWidth - clientWidth = {over})")
            check(hidden == 0, f"{name} every revealed section visible after scrolling ({hidden} still hidden)")
            ctx.close()

    # ---- home: equity curve, filters, motion, theme ----
    ctx = context(viewport=VIEWPORTS["1440"], color_scheme="dark", reduced_motion="reduce")
    ctx.add_init_script(SEEN)   # the follow nudge has its own checks below
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

    ctx = context(viewport=VIEWPORTS["1440"], color_scheme="dark")
    ctx.add_init_script(SEEN)
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

    # ---- home: the first-visit follow nudge ----
    # A fresh context has empty localStorage, i.e. a first visit. Scroll just
    # short of 60% (nothing), then past it (the card), screenshot it in place
    # for review, then Esc, and a reload must not bring it back.
    NUDGE = """(()=>{const e=document.getElementById('nudge'),r=e.getBoundingClientRect(),a=document.activeElement;
      return {role:e.getAttribute('role'),label:e.getAttribute('aria-label')||'',focus:a&&a.id,inside:e.contains(a),
        pos:getComputedStyle(e).position,l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,
        flag:localStorage.getItem('pt-follow-seen'),pad:document.documentElement.style.getPropertyValue('--nudge-h')}})()"""
    def at_depth(pg, f, nudge=0):
        pg.evaluate(f"window.scrollTo(0, document.documentElement.scrollHeight*{f} - innerHeight + {nudge})")
    SHOTS.mkdir(exist_ok=True)
    for vname, vp in VIEWPORTS.items():
        ctx = context(viewport=vp, color_scheme="dark", has_touch=(vname == "390"))
        ctx.add_init_script("window.__ls=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__ls.push([e.startTime,e.value])))"
                            ".observe({type:'layout-shift',buffered:true})")
        pg = ctx.new_page(); log = watch(pg); pg.goto(BASE, wait_until="load")
        n = f"{vname:>4}px nudge"
        pg.wait_for_timeout(800)
        check(pg.locator("#nudge").is_hidden(), f"{n}: hidden on arrival")
        at_depth(pg, .55); pg.wait_for_timeout(300)
        check(pg.locator("#nudge").is_hidden(), f"{n}: still hidden at 55% scroll depth")
        t0 = pg.evaluate("performance.now()")
        at_depth(pg, .6, 2); pg.wait_for_timeout(900)
        s = pg.evaluate(NUDGE)
        check(pg.locator("#nudge").is_visible(), f"{n}: shows at 60% scroll depth")
        check(s["role"] == "dialog" and "@gamblingv1ctim" in s["label"], f"{n}: role=dialog, aria-label {s['label']!r}")
        check(s["focus"] == "nudge-x", f"{n}: dismiss button focused on open (focus on #{s['focus']})")
        check(s["flag"] == "1", f"{n}: pt-follow-seen set once shown")
        if vname == "1440":
            check(s["pos"] == "fixed" and s["w"] <= 322 and 0 < s["vw"] - s["r"] <= 40 and 0 < s["vh"] - s["b"] <= 40,
                  f"{n}: fixed card bottom-right, {s['w']:.0f}px wide, {s['vw'] - s['r']:.0f}px/{s['vh'] - s['b']:.0f}px in")
        else:
            check(s["pos"] == "fixed" and s["l"] == 0 and s["r"] == s["vw"] and abs(s["b"] - s["vh"]) < 1 and s["h"] <= s["vh"] * .2,
                  f"{n}: bottom sheet, full width, {s['h']:.0f}px tall ({s['h'] / s['vh']:.0%} of the screen)")
        check(s["pad"] and abs(float(s["pad"].rstrip("px")) - (s["vh"] - s["t"])) < 1, f"{n}: page padded by the {s['pad']} it covers")
        shift = pg.evaluate(f"window.__ls.filter(e=>e[0]>={t0}).reduce((a,e)=>a+e[1],0)")
        check(shift < 0.001, f"{n}: no layout shift when it appears (CLS {shift:.4f})")
        over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(over <= 0, f"{n}: no horizontal overflow ({over})")
        pg.screenshot(path=str(SHOTS / f"nudge-{vname}.png"))
        print(f"     screenshot: {SHOTS / f'nudge-{vname}.png'}")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(400)
        s = pg.evaluate(NUDGE)
        check(pg.locator("#nudge").is_hidden() and not s["inside"] and not s["pad"], f"{n}: Esc dismisses, focus leaves the card, padding removed")
        pg.reload(wait_until="load"); at_depth(pg, 1); pg.wait_for_timeout(600)
        check(pg.locator("#nudge").is_hidden(), f"{n}: not shown again on the next visit")
        check(not log["errors"], f"{n}: console clean {log['errors'][:3]}")
        ctx.close()
    # The 25-second trigger on a fake clock, reduced motion, and the follow link.
    ctx = context(viewport=VIEWPORTS["1440"], color_scheme="dark", reduced_motion="reduce")
    pg = ctx.new_page(); log = watch(pg); pg.clock.install(); pg.goto(BASE, wait_until="load")
    pg.evaluate("document.getElementById('f-mkt').focus({preventScroll:true})")
    pg.clock.run_for(23000)
    check(pg.locator("#nudge").is_hidden(), "nudge: hidden at 23s without scrolling")
    pg.clock.run_for(3000)
    s = pg.evaluate(NUDGE)
    check(pg.locator("#nudge").is_visible() and s["focus"] == "nudge-x", "nudge: shows by 25s without scrolling")
    check(pg.evaluate("document.getElementById('nudge').getAnimations().length === 0 && getComputedStyle(document.getElementById('nudge')).opacity === '1'"),
          "nudge: reduced motion, appears instantly")
    go = pg.locator("#nudge-go")
    check(go.get_attribute("href") == "https://x.com/gamblingv1ctim" and go.get_attribute("target") == "_blank"
          and "noopener" in (go.get_attribute("rel") or ""), "nudge: follow link to x.com/gamblingv1ctim, new tab, noopener")
    pg.evaluate("addEventListener('click',e=>{if(e.target.closest('#nudge-go'))e.preventDefault()})")   # stay on the box
    pg.click("#nudge-go")
    s = pg.evaluate(NUDGE)
    check(pg.locator("#nudge").is_hidden() and s["flag"] == "1" and s["focus"] == "f-mkt",
          f"nudge: follow click closes it, flag set, focus back on #{s['focus']}")
    check(not log["errors"] and not log["external"], f"nudge: console clean, nothing off the box {log['errors'][:3]}")
    ctx.close()

    # ---- calculators: one worked example each ----
    def tool(path, steps, probe, want, label):
        c = context(viewport=VIEWPORTS["1440"], reduced_motion="reduce")
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
