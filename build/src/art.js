/* Halftone art. Pure decoration, aria-hidden and behind the content; nothing on the page
   depends on this file running. It paints two things:
   - the hero bands: every .art[data-art] (home and SGA) holds a canvas and gets one scene;
   - the page layer: the one fixed .art-page canvas on every page but the 404, a tall world that
     travels with the scroll (see "the page layer" below), fainter, and empty under the bands.

   The hero bands (the page layer reuses the lattice, the noise, the orb and the ridge pieces):

   - The picture is a rotated halftone lattice (offset rows, so a checkerboard).
     Each dot has an "ink" value 0..1: radius = maxR * sqrt(ink), alpha = .2 + .8 * ink,
     drawn in the theme accent (read from --acc, re-read when html[data-theme] changes).
   - The noise is value noise from a seeded table, so every visitor sees the same
     picture. Nothing is drawn from a random number at run time.
   - A "calm" map is measured from the text in the hero (headline, figures, ledger,
     buttons) and pulls the ink down behind it, so the words stay clear at any width.
   - One rAF loop (about 30 fps) is shared by every art. It runs only while a canvas is
     on screen and the tab is visible, and only when html.deco is set and reduced
     motion is off. Otherwise one still frame is drawn and nothing else happens.
   - Sizes are re-read with a ResizeObserver; a zero-size canvas is skipped until it has size. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var nodes = doc.querySelectorAll(".art[data-art]");
  var pageEl = doc.querySelector(".art-page");
  if (!nodes.length && !pageEl) return;
  try {
    var probe = doc.createElement("canvas");
    if (!probe.getContext || !probe.getContext("2d")) return;
  } catch (e) { return; }

  var TAU = Math.PI * 2;
  var M = 24;          // spare px at each side of a ridge table, for the parallax shift
  var NL = 12;         // ink levels: one batched fill per level and frame
  var T0 = 11;         // scene time of the still frame, in seconds
  var ANGLE = 0.29;    // lattice rotation, radians
  var FRAME = 33;      // ms between frames: about 30 fps

  /* ---------- seeded value noise ---------- */
  var PERM = new Uint8Array(512), VAL = new Float32Array(256);
  (function () {
    var a = 20261027;
    function rnd() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    var i, j, k, tmp;
    for (i = 0; i < 256; i++) { VAL[i] = rnd(); PERM[i] = i; }
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; tmp = PERM[i]; PERM[i] = PERM[j]; PERM[j] = tmp; }
    for (k = 0; k < 256; k++) PERM[k + 256] = PERM[k];
  })();
  function vn(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    xi &= 255; yi &= 255;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = VAL[PERM[PERM[xi] + yi]], b = VAL[PERM[PERM[xi + 1] + yi]];
    var c = VAL[PERM[PERM[xi] + yi + 1]], d = VAL[PERM[PERM[xi + 1] + yi + 1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct) {
    var s = 0, amp = 0.5, f = 1, tot = 0, i;
    for (i = 0; i < oct; i++) { s += amp * vn(x * f + i * 17.3, y * f + i * 5.1); tot += amp; amp *= 0.5; f *= 2.03; }
    return s / tot;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  /* A ridge profile is a table of heights, one per px, with M spare px each side. */
  function table(w, fn) {
    var n = Math.ceil(w) + 2 * M + 3, t = new Float32Array(n), i;
    for (i = 0; i < n; i++) t[i] = fn(i - M);
    return t;
  }
  function look(t, x) {
    var i = x + M;
    if (i < 0) i = 0; else if (i > t.length - 2) i = t.length - 2;
    var i0 = i | 0, f = i - i0;
    return t[i0] + (t[i0 + 1] - t[i0]) * f;
  }
  // rim light on a crest: a value 0..1 that is high where the surface faces the orb
  function lit(a, s, x, slope) {
    var face = 0.5 - 0.5 * clamp(slope * s.dir * 1.4, -1, 1);       // slope > 0 falls to the right
    var near = Math.exp(-Math.pow((x - s.ox) / (0.6 * a.w), 2));
    return clamp(0.50 + 0.50 * near, 0, 1) * (0.55 + 0.45 * face);
  }

  /* ---------- sky pieces shared by both scenes ---------- */
  function orbInk(s, x, y) {
    var dx = x - s.ox, dy = y - s.oy, d2 = dx * dx + dy * dy, R = s.Rt, d;
    if (d2 > s.reach2) return 0;
    d = Math.sqrt(d2);
    if (d < R) {
      var e = smooth(R, R * 0.84, d);                                   // soft edge, 0 at the rim
      return 0.50 + 0.46 * e * (1 - 0.35 * (d / R));
    }
    var h = Math.exp(-(d - R) / (s.halo * R));
    // faint concentric rings in the halo, as if engraved
    return 0.62 * h * s.hk * (0.9 + 0.1 * Math.cos((d - R) * 0.19));
  }
  function cloudInk(a, s, x, y, t) {
    var b = s.cloud;
    var band = smooth(b[0], b[1], y) * (1 - smooth(b[2], b[3], y));
    if (band <= 0) return 0;
    var c = fbm((x + s.drift) * s.cfx, y * s.cfy + t * 0.006 + 4.1, 2);
    var m = smooth(s.cth, s.cth + 0.2, c) * band;
    if (m <= 0) return 0;
    var dx = x - s.ox, dy = y - s.oy;
    var glow = Math.exp(-Math.sqrt(dx * dx + dy * dy) / (s.cr * 2.6));
    return m * s.cink * (0.4 + 0.9 * glow);
  }

  /* ---------- scene: home ----------
     An orb at the upper right over three ridgelines, back to front; the crests catch
     light from the orb and the dots thin out downward. The ink fades toward the left,
     where the big figure is. */
  var HOME = {
    fit: function (a) {
      var W = a.w, H = a.h, sky = a.sky, small = W < 700, s = {};
      s.ox = W * (small ? 0.76 : 0.80);
      s.R = clamp(sky * 0.28, 20, 54);
      s.oy = Math.max(sky * 0.44, s.R + 40);          // clear of the header tab that hangs 32px into the page
      s.halo = 1.3;
      s.reach2 = Math.pow(s.R * 7, 2);
      s.dir = 1;
      s.cloud = [sky * 0.04, sky * 0.22, sky * 0.55, sky * 0.9];
      s.cfx = 0.0036; s.cfy = 0.017; s.cth = 0.47; s.cink = 0.85; s.cr = s.R;
      var sc = clamp(W / 1100, 0.55, 1.6);
      var spec = [
        // crest mean (x sky), amplitude (x sky), wavelength px, seed, body ink, body fall, rim ink, rim width, parallax px, dip at the orb
        [0.38, 0.36, 520, 3.1, 0.80, 50, 0.85, 7, 5, 1.0],
        [0.60, 0.27, 340, 9.7, 0.90, 56, 1.00, 7, 8, 0.7],
        [0.82, 0.19, 230, 17.9, 1.00, 64, 1.00, 8, 12, 0.4]
      ];
      s.cr3 = []; s.body = []; s.fall = []; s.rim = []; s.rw = []; s.par = []; s.sh = [0, 0, 0];
      spec.forEach(function (p, k) {
        var amp = sky * p[1], wl = p[2] * sc, base = sky * p[0] + amp * 0.58;
        s.cr3.push(table(W, function (x) {
          var u = x / wl + p[3];
          // fbm hugs 0.5, so it is stretched first; a ridged fold then gives peaks and soft valleys
          var rid = 1 - Math.abs(2 * clamp(0.5 + (fbm(u, 1.7 + k, 3) - 0.5) * 2.7, 0, 1) - 1);
          var lump = clamp(0.5 + (fbm(u * 2.4 + 5, 8.1 + k, 2) - 0.5) * 2.2, 0, 1);
          var tilt = 0.10 * sky * Math.pow(clamp(x / W, 0, 1), 1.4);     // the land climbs toward the orb
          var dip = p[9] * amp * Math.exp(-Math.pow((x - s.ox) / (2.4 * s.R), 2));   // a notch for the orb to sit in
          return base - amp * (0.62 * Math.pow(rid, 1.15) + 0.38 * lump) - tilt + dip;
        }));
        s.body.push(p[4]); s.fall.push(p[5]); s.rim.push(p[6]); s.rw.push(p[7]); s.par.push(p[8] * sc);
      });
      s.haze = sky * 0.75;
      a.s = s;
    },
    prep: function (a, t) {
      var s = a.s, k;
      for (k = 0; k < 3; k++) s.sh[k] = s.par[k] * Math.sin(t * 0.27 + k * 1.9);
      var br = Math.sin(t * 0.8);
      s.Rt = s.R * (1 + 0.028 * br);
      s.hk = 1 + 0.08 * br;
      s.drift = t * 5.5;
    },
    ink: function (a, x, y, t) {
      var s = a.s, W = a.w, k, d, cy, v, fx;
      fx = 0.12 + 0.88 * smooth(0.04, 0.60, x / W);
      for (k = 2; k >= 0; k--) {
        cy = look(s.cr3[k], x + s.sh[k]);
        d = y - cy;
        if (d >= 0) {
          var rim = 0, body, sl = 0;
          if (d < s.rw[k] * 4) {
            var tb = s.cr3[k], xs = x + s.sh[k];
            sl = (look(tb, xs + 5) - look(tb, xs - 5)) / 10;
            var dn = d / Math.sqrt(1 + sl * sl);
            rim = s.rim[k] * Math.exp(-dn / s.rw[k]) * lit(a, s, x, sl);
          }
          body = s.body[k] * Math.exp(-d / s.fall[k]) * (0.62 + 0.38 * vn(x * 0.021 + k * 9, y * 0.075))
            * (0.62 + 0.38 * Math.sin(d * 0.36 + 4 * vn(x * 0.01, k)))
            * (0.22 + 0.78 * smooth(7, 32, d));                       // a dark gap under the crest line, as if engraved
          v = rim + body * (1 - rim);
          return v * fx;
        }
      }
      // sky: a haze that gathers toward the horizon, the orb and its halo, the clouds
      var hz = 0.12 * Math.exp(-(s.haze - y) / (a.sky * 0.45));
      if (y > s.haze) hz = 0.12;
      var o = orbInk(s, x, y);
      var c = cloudInk(a, s, x, y, t);
      v = 1 - (1 - o) * (1 - hz) * (1 - c);
      return v * fx;
    }
  };

  /* ---------- scene: sga ----------
     A staircase that climbs from left to right, each step taller than the last (the
     roll compounding), with a fainter second staircase behind it and a small orb. */
  var SGA = {
    fit: function (a) {
      var W = a.w, H = a.h, small = W < 700, s = {};
      var side = a.span > W * 0.4;                                    // the card sits to the right: the orb peeks out beside it
      s.ox = side ? a.span - W * 0.03 : W * (small ? 0.80 : 0.84);
      s.oy = side ? Math.min(H * 0.20, 150) : Math.min(H * 0.15, 130);
      s.R = clamp(W * (side ? 0.024 : 0.034), 16, 34);
      s.halo = 1.3;
      s.reach2 = Math.pow(s.R * 7, 2);
      s.dir = 1;
      s.cloud = [H * 0.03, H * 0.16, H * 0.30, H * 0.50];
      s.cfx = 0.0034; s.cfy = 0.016; s.cth = 0.54; s.cink = 0.42; s.cr = s.R * 1.5;
      // the stairs climb to where the roll card starts (or across the width when the card is below)
      var span = a.span > W * 0.4 ? a.span : W * 0.97;
      var base = H * 0.93;
      var rise = Math.min(H * 0.62, span * 0.5);
      function stairs(n, g, y0, amp, bump, seed, sp) {
        var sw = sp / n, rw = Math.max(12, sw * 0.08);
        var tops = [], i, tot = Math.pow(g, n - 1) - 1;
        for (i = 0; i < n; i++) tops.push(y0 - amp * (Math.pow(g, i) - 1) / tot);
        return table(W, function (x) {
          var u = x / sw, i0 = Math.floor(u), f = u - i0, c, c2;
          i0 = clamp(i0, 0, n - 1);
          c = tops[i0]; c2 = tops[Math.min(i0 + 1, n - 1)];
          c += (c2 - c) * smooth(1 - rw / sw, 1, f);
          return c + bump * (fbm(x * 0.03 + seed, 2.3, 2) - 0.5);
        });
      }
      s.cr3 = [stairs(11, 1.18, base - H * 0.09, rise * 0.8, 3, 3.3, span * 1.03), stairs(7, 1.3, base, rise, 2, 8.1, span * 0.98)];
      s.body = [0.34, 0.58]; s.fall = [110, 150]; s.rim = [0.6, 1.0]; s.rw = [7, 10]; s.par = [4, 9]; s.sh = [0, 0];
      a.s = s;
    },
    prep: function (a, t) {
      var s = a.s;
      s.sh[0] = s.par[0] * Math.sin(t * 0.29);
      s.sh[1] = s.par[1] * Math.sin(t * 0.29 + 1.6);
      var br = Math.sin(t * 0.8);
      s.Rt = s.R * (1 + 0.03 * br);
      s.hk = 1 + 0.09 * br;
      s.drift = t * 5;
    },
    ink: function (a, x, y, t) {
      var s = a.s, W = a.w, k, d, cy, v, fx;
      fx = 0.30 + 0.70 * smooth(0.04, 0.62, x / W);
      for (k = 1; k >= 0; k--) {
        var tb = s.cr3[k], xs = x + s.sh[k];
        cy = look(tb, xs);
        d = y - cy;
        if (d >= 0) {
          var rim = 0, sl = 0, body;
          if (d < s.rw[k] * 4) {
            sl = (look(tb, xs + 6) - look(tb, xs - 6)) / 12;
            var dn = d / Math.sqrt(1 + sl * sl);
            // treads catch the light, risers do not
            rim = s.rim[k] * Math.exp(-dn / s.rw[k]) * (0.35 + 0.65 * Math.exp(-sl * sl * 1.5));
          }
          body = s.body[k] * Math.exp(-d / s.fall[k]) * (0.6 + 0.4 * vn(x * 0.02 + k * 5, y * 0.07))
            * (0.8 + 0.2 * Math.sin(d * 0.34 + 4 * vn(x * 0.01, k + 2)));
          v = rim + body * (1 - rim);
          return v * fx;
        }
      }
      var hz = 0.10 * Math.exp(-(a.h * 0.7 - y) / (a.h * 0.22));
      if (y > a.h * 0.7) hz = 0.10;
      v = 1 - (1 - orbInk(s, x, y)) * (1 - hz) * (1 - cloudInk(a, s, x, y, t));
      return v * fx;
    }
  };

  var SCENES = {home: HOME, sga: SGA};
  // Ink left behind text (a share of the full ink; "small" on a phone), the margin past the text, and the soft edge.
  var CALM = {home: {floor: 0.10, small: 0.18, pad: 8, feather: 34}, sga: {floor: 0.32, small: 0.26, pad: 8, feather: 30}};
  var TEXT = "h1,h2,h3,p,dl,a,button";
  var CARD = ".panel,.sg-card";

  /* ---------- colour ---------- */
  var rgb = [192, 139, 245];
  function readColor() {
    var v = "";
    try { v = getComputedStyle(root).getPropertyValue("--acc") || ""; } catch (e) {}
    v = v.trim();
    var m, out = null;
    if (v.charAt(0) === "#") {
      m = /([0-9a-f]{6}|[0-9a-f]{3})/i.exec(v);
      if (m) {
        var h = m[1];
        if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
        out = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
      }
    } else if (v.slice(0, 3) === "rgb") {
      m = v.match(/[0-9.]+/g);
      if (m && m.length >= 3) out = [+m[0], +m[1], +m[2]];
    }
    if (out) rgb = out;
  }
  function styles() {
    var out = [], l;
    for (l = 0; l < NL; l++) {
      var ink = (l + 0.5) / NL;
      out.push("rgba(" + Math.round(rgb[0]) + "," + Math.round(rgb[1]) + "," + Math.round(rgb[2]) + "," + (0.2 + 0.8 * ink).toFixed(3) + ")");
    }
    return out;
  }

  /* ---------- the arts ---------- */
  var arts = [], range = null;
  var stats = {arts: []};
  try { window.PTArt = stats; } catch (e) {}

  function Art(el) {
    this.el = el;
    this.key = el.getAttribute("data-art");
    this.scene = SCENES[this.key];
    this.canvas = el.querySelector("canvas");
    this.ctx = null;
    this.w = 0; this.h = 0; this.n = 0;
    this.vis = true;           // until the observer says otherwise
    this.t = T0;
    this.stat = {key: this.key, draws: 0, ms: 0, avg: 0, w: 0, h: 0, dots: 0};
    stats.arts.push(this.stat);
  }

  function lattice(a, pitch) {
    var W = a.w, H = a.h, c = Math.cos(ANGLE), s = Math.sin(ANGLE), dv = pitch * 0.5;
    var diag = Math.sqrt(W * W + H * H), cx = W / 2, cy = H / 2;
    var nu = Math.ceil(diag / pitch) + 2, nv = Math.ceil(diag / dv) + 2;
    var xs = [], ys = [], i, j, u, v, x, y, off;
    for (j = -nv; j <= nv; j++) {
      v = j * dv; off = (j & 1) ? 0.5 : 0;
      for (i = -nu; i <= nu; i++) {
        u = (i + off) * pitch;
        x = cx + u * c - v * s; y = cy + u * s + v * c;
        if (x > -pitch && x < W + pitch && y > -pitch && y < H + pitch) { xs.push(x); ys.push(y); }
      }
    }
    var n = xs.length;
    a.n = n; a.X = new Float32Array(xs); a.Y = new Float32Array(ys);
    a.C = new Float32Array(n); a.R = new Float32Array(n);
    a.idx = [];
    for (i = 0; i < NL; i++) a.idx.push(new Uint32Array(n));
    a.cnt = new Int32Array(NL);
    a.maxR = pitch * 0.42;
  }

  // Text boxes in the art's own pixels. A reveal still in progress moves a block by a
  // translate: that is taken back out, so the box is where the text will rest.
  function box(el, host, ref, r) {
    var dx = 0, dy = 0, n, tr, m;
    for (n = el; n && n !== host; n = n.parentElement) {
      try {
        tr = getComputedStyle(n).transform;
        if (tr && tr !== "none") { m = new DOMMatrix(tr); dx += m.m41; dy += m.m42; }
      } catch (e) {}
    }
    return [r.left - dx - ref.left, r.top - dy - ref.top, r.right - dx - ref.left, r.bottom - dy - ref.top];
  }
  function measure(a) {
    var host = a.el.closest("section") || a.el.parentElement, ref = a.el.getBoundingClientRect(), out = [], cards = [];
    a.rects = out; a.cards = cards; a.sky = a.h * 0.34; a.span = 0;
    if (!host) return;
    if (!range && doc.createRange) range = doc.createRange();
    var list = host.querySelectorAll(TEXT), i, j, el, r, rs, up, b, top = 1e9;
    for (i = 0; i < list.length; i++) {
      el = list[i];
      if (a.el.contains(el)) continue;
      up = el.parentElement ? el.parentElement.closest(TEXT) : null;
      if (up && host.contains(up)) continue;                       // a link inside a paragraph: the paragraph covers it
      if (el.tagName === "DL" || el.tagName === "A" || el.tagName === "BUTTON" || !range) rs = [el.getBoundingClientRect()];
      else { range.selectNodeContents(el); rs = range.getClientRects(); }     // one box per line of text
      for (j = 0; j < rs.length; j++) {
        r = rs[j];
        if (r.width < 8 || r.height < 6) continue;
        b = box(el, host, ref, r);
        out.push(b);
        if (b[2] - b[0] > 40 && b[1] < top) top = b[1];
      }
    }
    if (top < 1e9) a.sky = clamp(top, 60, a.h * 0.8);
    list = host.querySelectorAll(CARD);
    for (i = 0; i < list.length; i++) {
      el = list[i]; r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      b = box(el, host, ref, r);
      cards.push(b);
      // a card in the right half and near the top: the picture should climb up to its left edge
      if (b[0] > a.w * 0.45 && b[1] < a.h * 0.5 && (!a.span || b[0] < a.span)) a.span = b[0] - 16;
    }
  }

  function calm(a) {
    var cell = 10, gw = Math.ceil(a.w / cell) + 2, gh = Math.ceil(a.h / cell) + 2;
    var g = new Float32Array(gw * gh), i, j, k, cfg = CALM[a.key] || CALM.home;
    for (i = 0; i < g.length; i++) g[i] = 1;
    var rects = a.rects, F = cfg.feather, P = cfg.pad, floor = a.w < 700 ? cfg.small : cfg.floor;   // a phone has no free corner, so a little more shows
    for (k = 0; k < rects.length; k++) {
      var r = rects[k], x0 = r[0] - P, y0 = r[1] - P, x1 = r[2] + P, y1 = r[3] + P;
      var c0 = Math.max(0, Math.floor((x0 - F) / cell)), c1 = Math.min(gw - 1, Math.ceil((x1 + F) / cell));
      var r0 = Math.max(0, Math.floor((y0 - F) / cell)), r1 = Math.min(gh - 1, Math.ceil((y1 + F) / cell));
      for (j = r0; j <= r1; j++) {
        for (i = c0; i <= c1; i++) {
          var px = i * cell, py = j * cell;
          var ex = Math.max(x0 - px, 0, px - x1), ey = Math.max(y0 - py, 0, py - y1);
          var dist = Math.sqrt(ex * ex + ey * ey);
          if (dist >= F) continue;
          var v = 1 - (1 - floor) * (1 - smooth(0, F, dist));
          if (v < g[j * gw + i]) g[j * gw + i] = v;
        }
      }
    }
    var cards = a.cards, q, cd;
    for (k = 0; k < a.n; k++) {
      var gx = a.X[k] / cell, gy = a.Y[k] / cell;
      var ix = clamp(Math.floor(gx), 0, gw - 2), iy = clamp(Math.floor(gy), 0, gh - 2);
      var fx = clamp(gx - ix, 0, 1), fy = clamp(gy - iy, 0, 1);
      var p00 = g[iy * gw + ix], p10 = g[iy * gw + ix + 1], p01 = g[(iy + 1) * gw + ix], p11 = g[(iy + 1) * gw + ix + 1];
      a.C[k] = p00 + (p10 - p00) * fx + (p01 - p00) * fy + (p00 - p10 - p01 + p11) * fx * fy;
      // behind an opaque card nothing shows, so those dots are not worked out at all
      for (q = 0; q < cards.length; q++) {
        cd = cards[q];
        if (a.X[k] > cd[0] + 10 && a.X[k] < cd[2] - 10 && a.Y[k] > cd[1] + 10 && a.Y[k] < cd[3] - 10) { a.C[k] = 0; break; }
      }
    }
  }

  function fit(a) {
    // 0: cannot fit yet; 1: fitted and nothing moved; 2: fitted and the picture needs a redraw
    var cv = a.canvas;
    if (!cv || !a.scene) return 0;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!(w > 0 && h > 0)) { a.w = 0; a.h = 0; return 0; }       // hidden or not laid out yet: try again on resize
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!a.ctx) a.ctx = cv.getContext("2d");
    if (!a.ctx) return 0;
    var changed = Math.abs(w - a.w) > 0.5 || Math.abs(h - a.h) > 0.5 || dpr !== a.dpr || !a.n;
    if (changed) {
      a.w = w; a.h = h; a.dpr = dpr;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      a.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lattice(a, w < 560 ? 12 : w < 1500 ? 13 : 14);
      a.stat.w = Math.round(w); a.stat.h = Math.round(h); a.stat.dots = a.n;
    }
    measure(a);
    var sig = Math.round(a.sky / 8) + "|" + Math.round(a.span / 8), csig = a.rects.length + ":", k, q = 0;
    for (k = 0; k < a.rects.length; k++) q += Math.round(a.rects[k][0] + a.rects[k][1] * 3 + a.rects[k][2] * 5 + a.rects[k][3] * 7);
    for (k = 0; k < a.cards.length; k++) q += Math.round(a.cards[k][0] + a.cards[k][1] * 3 + a.cards[k][2] * 5 + a.cards[k][3] * 7);
    csig += q;
    if (!changed && sig === a.sig && csig === a.csig) return 1;
    if (changed || sig !== a.sig) { a.sig = sig; a.scene.fit(a); }
    a.csig = csig;
    calm(a);
    a.styles = styles();
    return 2;
  }

  function draw(a) {
    if (!(a.w > 0) || !a.ctx) return;
    var t0 = performance.now();
    var ctx = a.ctx, sc = a.scene, n = a.n, X = a.X, Y = a.Y, C = a.C, R = a.R, idx = a.idx, cnt = a.cnt;
    var i, l, v, r, k, j, x, y, arr, mr = a.maxR, t = a.t;
    sc.prep(a, t);
    for (l = 0; l < NL; l++) cnt[l] = 0;
    for (i = 0; i < n; i++) {
      if (C[i] <= 0) continue;
      v = sc.ink(a, X[i], Y[i], t) * C[i];
      if (v <= 0) continue;
      if (v > 1) v = 1;
      r = mr * Math.sqrt(v);
      if (r < 0.35) continue;
      l = (v * NL) | 0; if (l >= NL) l = NL - 1;
      R[i] = r; idx[l][cnt[l]++] = i;
    }
    ctx.clearRect(0, 0, a.w, a.h);
    for (l = 0; l < NL; l++) {
      if (!cnt[l]) continue;
      ctx.fillStyle = a.styles[l];
      ctx.beginPath();
      arr = idx[l];
      for (k = 0; k < cnt[l]; k++) {
        j = arr[k]; x = X[j]; y = Y[j]; r = R[j];
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
    }
    var ms = performance.now() - t0, st = a.stat;
    st.draws++; st.ms = ms; st.avg = st.avg ? st.avg * 0.9 + ms * 0.1 : ms;
  }

  /* ---------- the page layer ----------
     One fixed canvas the size of the screen (.art-page, behind every page). It shows a tall
     "world", viewport + 0.25 * (page height - viewport) high, and the world is lifted by
     0.25 * scrollY, so a scroll carries the reader down through the landscape: sky and orb
     first, ridges in the middle, water last. The lattice belongs to the world, not to the
     glass, so the dots travel with the picture.

     How strong it is comes from a map of the screen, never from measuring text (the layer
     does not move with the text): a low cap inside the content column (.wrap), full strength
     in the gutters beside it, and a little extra near the top and bottom edges. Under the
     solid part of a hero band (.art) it adds nothing, and it fades in under the band's soft
     edge. Without html.deco (or with reduced motion) one frame is drawn at offset 0; only
     the hero hole follows a scroll then, and only while a band is on screen.

     Cost: if a frame takes over 8 ms three times running, the layer stops animating and is
     redrawn only after scrolling stops. Every call to a newer API is guarded. */
  var PARALLAX = 0.25;     // the world moves at a quarter of the scroll speed
  var WORLD_Q = 64;        // world height is rounded to this: a small change in page height redraws nothing
  var DRIFT = 66;          // ms between frames when only the slow drift moves (about 15 fps)
  var SLOW_MS = 8;         // a frame dearer than this, three times running, ends the animation
  var PMAP = {ic: 0.26, edge: 0.35, floor: 0.08, gamma: 0.62, ramp: 150, g0: 110, g1: 14};
  try { stats.map = PMAP; } catch (e) {}      // for the checks: the strength map can be read and changed from a test page

  function stairsTable(W, n, g, y0, amp, bump, seed, sp) {
    var sw = sp / n, rw = Math.max(12, sw * 0.08);
    var tops = [], i, tot = Math.pow(g, n - 1) - 1;
    for (i = 0; i < n; i++) tops.push(y0 - amp * (Math.pow(g, i) - 1) / tot);
    return table(W, function (x) {
      var u = x / sw, i0 = Math.floor(u), f = u - i0, c, c2;
      i0 = clamp(i0, 0, n - 1);
      c = tops[i0]; c2 = tops[Math.min(i0 + 1, n - 1)];
      c += (c2 - c) * smooth(1 - rw / sw, 1, f);
      return c + bump * (fbm(x * 0.03 + seed, 2.3, 2) - 0.5);
    });
  }
  // haze, orb and clouds: one value 0..1 (sky only; y is in world px)
  function pageSky(p, s, x, y, t) {
    var hz = y > s.haze ? 0.12 : 0.12 * Math.exp(-(s.haze - y) / s.hzw);
    return 1 - (1 - orbInk(s, x, y)) * (1 - hz) * (1 - cloudInk(p, s, x, y, t));
  }
  // rows of dots that open out toward the viewer, shimmering, with the orb lit on them
  function seaInk(p, s, x, y, t) {
    var d = y - s.sea;
    if (d <= 0) return 0;
    var depth = smooth(0, p.h * 1.3, d), edge = smooth(0, 60, d);
    var wave = 0.5 + 0.5 * Math.sin(Math.sqrt(d) * 3.1 + 2.4 * vn(x * 0.004, d * 0.012) - t * 0.9);
    var v = s.seaInk * (0.20 + 0.80 * depth) * (0.40 + 0.60 * wave) * edge;
    var rx = (x - s.ox) / (s.R * 2.6 + d * 0.12);
    var refl = s.seaRefl * Math.exp(-rx * rx) * (0.45 + 0.55 * wave) * smooth(0, 80, d);
    return 1 - (1 - v) * (1 - refl);
  }
  // the front-most ridge under a point, as ink; -1 above them all
  function ridgeHit(p, s, x, y) {
    var k, tb, xs, d, rim, sl, dn, body;
    for (k = s.cr3.length - 1; k >= 0; k--) {
      tb = s.cr3[k]; xs = x + s.sh[k];
      d = y - look(tb, xs);
      if (d >= 0) {
        rim = 0;
        if (d < s.rw[k] * 4) {
          sl = (look(tb, xs + 5) - look(tb, xs - 5)) / 10;
          dn = d / Math.sqrt(1 + sl * sl);
          rim = s.rim[k] * Math.exp(-dn / s.rw[k]) * lit(p, s, x, sl);
        }
        body = s.body[k] * Math.exp(-d / s.fall[k]) * (0.62 + 0.38 * vn(x * 0.021 + k * 9, y * 0.075))
          * (0.62 + 0.38 * Math.sin(d * 0.36 + 4 * vn(x * 0.01, k)))
          * (0.22 + 0.78 * smooth(7, 32, d));
        return rim + body * (1 - rim);
      }
    }
    return -1;
  }
  // the front-most stair under a point: treads catch the light, risers do not
  function stairHit(p, s, x, y) {
    var k, tb, xs, d, rim, sl, dn, body;
    for (k = s.cr3.length - 1; k >= 0; k--) {
      tb = s.cr3[k]; xs = x + s.sh[k];
      d = y - look(tb, xs);
      if (d >= 0) {
        rim = 0;
        if (d < s.rw[k] * 4) {
          sl = (look(tb, xs + 6) - look(tb, xs - 6)) / 12;
          dn = d / Math.sqrt(1 + sl * sl);
          rim = s.rim[k] * Math.exp(-dn / s.rw[k]) * (0.35 + 0.65 * Math.exp(-sl * sl * 1.5));
        }
        body = s.body[k] * Math.exp(-d / s.fall[k]) * (0.6 + 0.4 * vn(x * 0.02 + k * 5, y * 0.07))
          * (0.8 + 0.2 * Math.sin(d * 0.34 + 4 * vn(x * 0.01, k + 2)));
        return rim + body * (1 - rim);
      }
    }
    return -1;
  }
  function pagePrep(p, t) {
    var s = p.s, k;
    for (k = 0; k < s.sh.length; k++) s.sh[k] = s.par[k] * Math.sin(t * 0.27 + k * 1.9);
    var br = Math.sin(t * 0.8);
    s.Rt = s.R * (1 + 0.028 * br);
    s.hk = 1 + 0.08 * br;
    s.drift = t * 5.5;
  }
  function pageSkyBase(p, s, yr, sk, oyK, cink) {
    var W = p.w, Hv = p.h, small = W < 700;
    s.ox = W * (small ? 0.76 : 0.80);
    s.oy = Hv * oyK;
    s.halo = 1.3; s.reach2 = Math.pow(s.R * 7, 2); s.dir = 1;
    s.cloud = [Hv * 0.05, Hv * 0.22, yr + sk * 0.05, yr + sk * 0.4];
    s.cfx = 0.0036; s.cfy = 0.017; s.cth = 0.47; s.cink = cink; s.cr = s.R;
    s.haze = yr + sk * 0.75; s.hzw = sk * 0.45;
  }
  function pageRidges(p, s, yr, sk, spec) {
    var W = p.w, sc = clamp(W / 1100, 0.55, 1.6);
    s.cr3 = []; s.body = []; s.fall = []; s.rim = []; s.rw = []; s.par = []; s.sh = [];
    spec.forEach(function (q, k) {
      var amp = sk * q[1], wl = q[2] * sc, base = yr + sk * q[0] + amp * 0.58;
      s.cr3.push(table(W, function (x) {
        var u = x / wl + q[3];
        var rid = 1 - Math.abs(2 * clamp(0.5 + (fbm(u, 1.7 + k, 3) - 0.5) * 2.7, 0, 1) - 1);
        var lump = clamp(0.5 + (fbm(u * 2.4 + 5, 8.1 + k, 2) - 0.5) * 2.2, 0, 1);
        var tilt = 0.10 * sk * Math.pow(clamp(x / W, 0, 1), 1.4);
        return base - amp * (0.62 * Math.pow(rid, 1.15) + 0.38 * lump) - tilt;
      }));
      s.body.push(q[4]); s.fall.push(q[5]); s.rim.push(q[6]); s.rw.push(q[7]); s.par.push(q[8] * sc); s.sh.push(0);
    });
  }

  // crest mean (x sk), amplitude (x sk), wavelength px, seed, body ink, body fall, rim ink, rim width, parallax px
  var P_HOME = {
    fit: function (p) {
      var Hv = p.h, WH = p.wh, s = {};
      var sk = Hv * 0.5, yr = Math.max(Hv * 0.62, WH * 0.36);
      s.R = clamp(Hv * 0.055, 24, 50);
      pageSkyBase(p, s, yr, sk, 0.34, 0.85);
      pageRidges(p, s, yr, sk, [
        [0.38, 0.36, 520, 3.1, 0.80, 50, 0.85, 7, 5],
        [0.60, 0.27, 340, 9.7, 0.90, 56, 1.00, 7, 8],
        [0.82, 0.19, 230, 17.9, 1.00, 64, 1.00, 8, 12]
      ]);
      s.sea = yr + sk * 1.0 + 70; s.seaInk = 0.85; s.seaRefl = 0.7;
      p.s = s;
    },
    ink: function (p, x, y, t) {
      var s = p.s, v = ridgeHit(p, s, x, y);
      if (v < 0) v = pageSky(p, s, x, y, t);
      if (y > s.sea) v = 1 - (1 - v) * (1 - seaInk(p, s, x, y, t));
      return v;
    }
  };
  var P_CALM = {
    fit: function (p) {
      var Hv = p.h, WH = p.wh, s = {};
      var sk = Hv * 0.5, yr = Math.max(Hv * 0.6, WH * 0.45);
      s.R = clamp(Hv * 0.04, 18, 34);
      pageSkyBase(p, s, yr, sk, 0.28, 0.42);
      pageRidges(p, s, yr, sk, [[0.40, 0.22, 420, 5.3, 0.62, 60, 0.85, 7, 6]]);
      s.sea = yr + sk * 0.7 + 60; s.seaInk = 0.75; s.seaRefl = 0.6;
      p.s = s;
    },
    ink: function (p, x, y, t) {
      var s = p.s, v = ridgeHit(p, s, x, y);
      if (v < 0) v = pageSky(p, s, x, y, t);
      if (y > s.sea) v = 1 - (1 - v) * (1 - seaInk(p, s, x, y, t));
      return v;
    }
  };
  var P_SGA = {
    fit: function (p) {
      var W = p.w, Hv = p.h, WH = p.wh, s = {};
      var sk = Hv * 0.5, yr = Math.max(Hv * 0.62, WH * 0.40);
      s.R = clamp(W * 0.03, 18, 40);
      pageSkyBase(p, s, yr, sk, 0.30, 0.42);
      s.cloud = [Hv * 0.05, Hv * 0.20, yr - sk * 0.3, yr + sk * 0.1];
      var rise = Math.min(Hv * 0.5, W * 0.45), base = yr + rise;
      s.cr3 = [stairsTable(W, 11, 1.18, base - rise * 0.06, rise * 0.8, 3, 3.3, W * 1.03), stairsTable(W, 7, 1.3, base, rise, 2, 8.1, W * 0.98)];
      s.body = [0.34, 0.58]; s.fall = [110, 150]; s.rim = [0.6, 1.0]; s.rw = [7, 10]; s.par = [4, 9]; s.sh = [0, 0];
      s.sea = base + 190; s.seaInk = 0.7; s.seaRefl = 0.6;
      p.s = s;
    },
    ink: function (p, x, y, t) {
      var s = p.s, v = stairHit(p, s, x, y);
      if (v < 0) v = pageSky(p, s, x, y, t);
      if (y > s.sea) v = 1 - (1 - v) * (1 - seaInk(p, s, x, y, t));
      return v;
    }
  };
  var PAGE_SCENES = {home: P_HOME, sga: P_SGA, calm: P_CALM};

  var PG = null;           // the page layer, or null on a page without one

  var LUT = null, LUT_G = 0;
  function gammaLut(g) {
    if (LUT && LUT_G === g) return LUT;
    LUT = new Float32Array(256); LUT_G = g;
    for (var i = 0; i < 256; i++) LUT[i] = Math.pow(i / 255, g);
    return LUT;
  }

  function PageLayer(el) {
    this.el = el;
    this.canvas = el.querySelector("canvas");
    this.ctx = null;
    this.w = 0; this.h = 0; this.vh = 0; this.docH = 0; this.wh = 0; this.n = 0; this.pitch = 14;
    this.off = 0; this.sy = 0; this.t = T0; this.tPrev = 0; this.lastDraw = 0;
    this.slow = false; this.over = 0; this.holeVis = false;
    this.c0 = 0; this.c1 = 0; this.bands = []; this.sig = "";
    var key = doc.querySelector(".art[data-art=\"sga\"]") ? "sga" : doc.querySelector(".art[data-art=\"home\"]") ? "home" : "calm";
    this.key = key; this.scene = PAGE_SCENES[key];
    this.stat = {key: key, draws: 0, ms: 0, avg: 0, w: 0, h: 0, dots: 0, pitch: 0, slow: false, off: 0};
    stats.page = this.stat;
  }
  function scrollY() { return window.pageYOffset || root.scrollTop || 0; }
  function pageHeight() {
    var b = doc.body;
    return Math.max(root.scrollHeight || 0, b ? b.scrollHeight || 0 : 0);
  }
  function maxScroll(p) { return Math.max(0, p.docH - p.vh); }      // the page height is read when the layer is fitted, not on every frame
  function targetOff(p, sy) { return animating() ? clamp(sy, 0, maxScroll(p)) * PARALLAX : 0; }

  // the content column: the .wrap's box without its side padding
  function pageColumn(p) {
    var el = doc.querySelector("main.wrap") || doc.querySelector(".wrap"), c0 = 0, c1 = p.w;
    if (el) {
      var r = el.getBoundingClientRect(), pl = 0, pr = 0;
      try { var cs = getComputedStyle(el); pl = parseFloat(cs.paddingLeft) || 0; pr = parseFloat(cs.paddingRight) || 0; } catch (e) {}
      c0 = r.left + pl; c1 = r.right - pr;
    }
    if (!(c1 - c0 > 120)) { c0 = 0; c1 = p.w; }
    p.c0 = c0; p.c1 = c1;
  }
  // the hero bands: where they sit on the page, how tall, and how far down they stay solid
  function pageBands(p) {
    var list = doc.querySelectorAll(".art[data-art]"), out = [], sy = scrollY(), i, el, r, h, f, m, cs, v;
    for (i = 0; i < list.length; i++) {
      el = list[i]; r = el.getBoundingClientRect(); h = r.height;
      if (!(h > 40)) continue;
      f = 0.66; v = "";
      try { cs = getComputedStyle(el); v = (cs.getPropertyValue("--art-f") || "").trim(); } catch (e) {}
      if (v.slice(-1) === "%") f = (parseFloat(v) || 66) / 100;
      else { m = /calc\(\s*100%\s*-\s*([0-9.]+)px\s*\)/.exec(v); if (m) f = clamp(1 - parseFloat(m[1]) / h, 0, 1); }
      out.push({top: r.top + sy, h: h, solid: h * f});
    }
    p.bands = out;
  }

  // 0: cannot fit yet; 1: fitted and nothing moved; 2: fitted and the picture needs a redraw
  function pageFit(p) {
    var cv = p.canvas;
    if (!cv || !p.scene) return 0;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!(w > 0 && h > 0)) return 0;
    if (!p.ctx) p.ctx = cv.getContext("2d");
    if (!p.ctx) return 0;
    var vh = window.innerHeight || root.clientHeight || h, small = w < 700;
    var dpr = small ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    dpr = Math.min(dpr, Math.sqrt(2500000 / (w * h)));
    var changed = Math.abs(w - p.w) > 0.5 || Math.abs(h - p.h) > 0.5 || Math.abs(dpr - (p.dpr || 0)) > 0.01 || !p.n;
    if (changed) {
      p.w = w; p.h = h; p.dpr = dpr;
      cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
      p.ctx.setTransform(cv.width / w, 0, 0, cv.height / h, 0, 0);
      p.pitch = small ? 16 : clamp(Math.sqrt(2 * w * h / 12000), 15, 21);
      p.maxR = p.pitch * 0.42;
      var cap = Math.ceil(2 * (w + 2 * p.pitch) * (h + 2 * p.pitch) / (p.pitch * p.pitch) * 1.2) + 64, l;
      p.X = new Float32Array(cap); p.Y = new Float32Array(cap); p.Z = new Float32Array(cap); p.R = new Float32Array(cap);
      p.idx = [];
      for (l = 0; l < NL; l++) p.idx.push(new Uint32Array(cap));
      p.cnt = new Int32Array(NL);
      p.n = 0; p.latOff = -1e9;
      p.stat.w = Math.round(w); p.stat.h = Math.round(h); p.stat.pitch = Math.round(p.pitch * 10) / 10;
    }
    p.vh = vh; p.docH = pageHeight();
    var sc = maxScroll(p), wh = Math.round((h + PARALLAX * sc) / WORLD_Q) * WORLD_Q;
    var c0 = p.c0, c1 = p.c1, hs = p.bands.length + "|" + Math.round(p.bands.length ? p.bands[0].h : 0);
    pageColumn(p); pageBands(p);
    var hs2 = p.bands.length + "|" + Math.round(p.bands.length ? p.bands[0].h : 0);
    var sig = Math.round(w) + "x" + Math.round(h) + "x" + wh;
    var moved = changed || sig !== p.sig || Math.abs(c0 - p.c0) > 1 || Math.abs(c1 - p.c1) > 1 || hs !== hs2;
    if (!moved && p.styles) return 1;
    if (changed || sig !== p.sig) { p.sig = sig; p.wh = wh; p.scene.fit(p); }
    p.styles = styles();
    return 2;
  }

  // The lattice is fixed to the world: only the dots inside the window [off, off + h] are kept, row by row.
  function pageLattice(p) {
    var W = p.w, H = p.h, pitch = p.pitch, dv = pitch * 0.5, c = Math.cos(ANGLE), s = Math.sin(ANGLE);
    var cx = W / 2, off = p.off, xlo = -pitch, xhi = W + pitch, ylo = off - pitch, yhi = off + H + pitch;
    var vmin = 1e9, vmax = -1e9, v, k, corners = [[xlo, ylo], [xhi, ylo], [xlo, yhi], [xhi, yhi]];
    for (k = 0; k < 4; k++) {
      v = -(corners[k][0] - cx) * s + corners[k][1] * c;
      if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    var j0 = Math.floor(vmin / dv) - 1, j1 = Math.ceil(vmax / dv) + 1, j, i0, i1, i, offj, ulo, uhi, u, n = 0, cap = p.X.length;
    var X = p.X, Y = p.Y, Z = p.Z;
    for (j = j0; j <= j1; j++) {
      v = j * dv; offj = (j & 1) ? 0.5 : 0;
      ulo = Math.max((xlo - cx + v * s) / c, (ylo - v * c) / s);
      uhi = Math.min((xhi - cx + v * s) / c, (yhi - v * c) / s);
      if (uhi < ulo) continue;
      i0 = Math.ceil(ulo / pitch - offj); i1 = Math.floor(uhi / pitch - offj);
      for (i = i0; i <= i1 && n < cap; i++) {
        u = (i + offj) * pitch;
        X[n] = cx + u * c - v * s; Z[n] = u * s + v * c; Y[n] = Z[n] - off; n++;
      }
    }
    p.n = n; p.latOff = off;
  }

  function pageDraw(p, now) {
    if (!(p.w > 0) || !p.ctx || !p.styles) return;
    var t0 = performance.now(), sy = scrollY(), off;
    p.vh = window.innerHeight || p.vh;                 // a phone toolbar sliding away changes the visible height
    off = targetOff(p, sy);
    p.off = off; p.sy = sy;
    if (Math.abs(off - p.latOff) > 1e-6) pageLattice(p);
    if (now) { p.t += Math.min(Math.max(now - (p.tPrev || now), 0), 150) / 1000; p.tPrev = now; }
    var ctx = p.ctx, sc = p.scene, n = p.n, X = p.X, Y = p.Y, Z = p.Z, R = p.R, idx = p.idx, cnt = p.cnt, mr = p.maxR, t = p.t;
    var ic = PMAP.ic, eb = PMAP.edge, fl = PMAP.floor, lut = gammaLut(PMAP.gamma), ramp = PMAP.ramp, vh = p.vh;
    var gl0 = p.c0 - PMAP.g0, gl1 = p.c0 - PMAP.g1, gr0 = p.c1 + PMAP.g1, gr1 = p.c1 + PMAP.g0;
    var bands = p.bands, nb = PMAP.hole === 0 ? 0 : bands.length, tops = [], b, holeVis = false;
    for (b = 0; b < nb; b++) {
      tops.push(bands[b].top - sy);
      if (tops[b] < vh && tops[b] + bands[b].h > 0) holeVis = true;
    }
    pagePrep(p, t);
    var i, l, v, r, x, ys, g, e, base, hk, I;
    for (l = 0; l < NL; l++) cnt[l] = 0;
    for (i = 0; i < n; i++) {
      x = X[i]; ys = Y[i];
      hk = 1;
      for (b = 0; b < nb; b++) {
        if (ys > tops[b] && ys < tops[b] + bands[b].h) hk *= smooth(tops[b] + bands[b].solid, tops[b] + bands[b].h, ys);
      }
      if (hk <= 0.003) continue;
      e = 0;
      if (ys < ramp) e = 1 - smooth(0, ramp, ys);
      else if (ys > vh - ramp) e = 1 - smooth(vh - ramp, vh, ys);
      base = ic * (1 + eb * e);
      g = x < p.c0 ? 1 - smooth(gl0, gl1, x) : x > p.c1 ? smooth(gr0, gr1, x) : 0;
      I = (base + (1 - base) * g) * hk;
      v = sc.ink(p, x, Z[i], t);
      v = lut[((1 - (1 - v) * (1 - fl)) * 255) | 0] * I;      // lifted, so more dots reach the cap without the brightest one passing it
      if (v <= 0) continue;
      if (v > 1) v = 1;
      r = mr * Math.sqrt(v);
      if (r < 0.45) continue;
      l = (v * NL) | 0; if (l >= NL) l = NL - 1;
      R[i] = r; idx[l][cnt[l]++] = i;
    }
    var tInk = performance.now();
    ctx.clearRect(0, 0, p.w, p.h);
    var k, j, arr;
    for (l = 0; l < NL; l++) {
      if (!cnt[l]) continue;
      ctx.fillStyle = p.styles[l];
      ctx.beginPath();
      arr = idx[l];
      for (k = 0; k < cnt[l]; k++) {
        j = arr[k]; x = X[j]; ys = Y[j]; r = R[j];
        if (r < 1.3) { ctx.rect(x - r, ys - r, 2 * r, 2 * r); continue; }     // a speck: a square draws the same and costs less
        ctx.moveTo(x + r, ys);
        ctx.arc(x, ys, r, 0, TAU);
      }
      ctx.fill();
    }
    p.holeVis = holeVis;
    var ms = performance.now() - t0, st = p.stat;
    st.draws++; st.ms = ms; st.avg = st.avg ? st.avg * 0.9 + ms * 0.1 : ms; st.dots = n; st.off = Math.round(off); st.ink = tInk - t0;
    // the first few frames pay for compiling the script and the first layout: they are not counted
    if (st.draws > 6 && ms > SLOW_MS) { if (++p.over >= 3 && !p.slow) { p.slow = true; st.slow = true; } } else p.over = 0;
    p.lastDraw = now || t0;
  }

  /* ---------- the loop ---------- */
  var RM = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var raf = 0, last = 0;
  function motionOn() { return root.classList.contains("deco") && !(RM && RM.matches); }
  function animating() { return motionOn() && !doc.hidden; }
  function wanted() {
    if (!animating()) return false;
    if (PG && PG.w > 0 && !PG.slow) return true;
    for (var i = 0; i < arts.length; i++) if (arts[i].vis && arts[i].w > 0) return true;
    return false;
  }
  function tick(now) {
    raf = 0;
    if (!wanted()) { last = 0; return; }
    try {
      if (!last) last = now - FRAME;
      var dt = now - last;
      if (dt >= FRAME) {
        last = now;
        var step = Math.min(dt, 100) / 1000;
        for (var i = 0; i < arts.length; i++) {
          var a = arts[i];
          if (!a.vis || !(a.w > 0)) continue;
          a.t += step;
          draw(a);
        }
        // the page layer: a scroll moves it, otherwise only the slow drift does
        if (PG && !PG.slow && PG.w > 0 && (Math.abs(targetOff(PG, scrollY()) - PG.off) > 0.05 || now - PG.lastDraw >= DRIFT)) pageDraw(PG, now);
      }
    } catch (e) { PG = null; }                 // an error here must never reach window.onerror (window.onerror ends html.motion for the whole site)
    raf = requestAnimationFrame(tick);
  }
  function kick() { if (!raf && wanted()) { last = 0; raf = requestAnimationFrame(tick); } }
  function still(a) { if (a.w > 0) draw(a); }
  // a redraw of the page layer outside the loop: reduced motion, a hidden tab coming back, a slow device after a scroll
  var pgRaf = 0, pgTimer = 0;
  function pageStill() {
    if (!PG || pgRaf) return;
    pgRaf = requestAnimationFrame(function () {
      pgRaf = 0;
      try { if (PG && PG.w > 0) pageDraw(PG, 0); } catch (e) { PG = null; }
    });
  }
  function bandOn(p, sy) {
    for (var i = 0; i < p.bands.length; i++) { var top = p.bands[i].top - sy; if (top < p.vh && top + p.bands[i].h > 0) return true; }
    return false;
  }
  function onScroll() {
    if (!PG) return;
    if (!motionOn()) { if (PG.holeVis || bandOn(PG, scrollY())) pageStill(); return; }     // no parallax: only the hero hole follows, and only near a band
    if (PG.slow) { if (pgTimer) clearTimeout(pgTimer); pgTimer = setTimeout(function () { pgTimer = 0; pageStill(); }, 140); }
  }

  /* ---------- wiring ---------- */
  var i;
  for (i = 0; i < nodes.length; i++) {
    var a = new Art(nodes[i]);
    if (!a.canvas || !a.scene) continue;
    arts.push(a);
  }
  if (pageEl) { try { PG = new PageLayer(pageEl); if (!PG.canvas || !PG.scene) PG = null; } catch (e) { PG = null; } }
  if (!arts.length && !PG) return;
  readColor();
  arts.forEach(function (a) { if (fit(a)) still(a); });
  var pageRefit = function () {
    if (!PG) return;
    try { if (pageFit(PG) === 2 && (!animating() || PG.slow)) pageDraw(PG, 0); } catch (e) { PG = null; }
  };
  var pgFitRaf = 0;
  var pageSched = function () {
    if (!PG || pgFitRaf) return;
    pgFitRaf = requestAnimationFrame(function () { pgFitRaf = 0; pageRefit(); kick(); });
  };
  pageRefit();

  var refit = function (a) { if (fit(a) === 2 && (!animating() || !a.vis)) still(a); };
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function (es) {
      es.forEach(function (e) {
        arts.forEach(function (a) {
          if (e.target === a.canvas || e.target === a.host) refit(a);
        });
      });
      pageSched();
      kick();
    });
    arts.forEach(function (a) {
      a.host = a.el.closest("section");
      ro.observe(a.canvas);
      if (a.host) ro.observe(a.host);               // the text moves when the page below it settles
    });
    if (PG) { ro.observe(PG.canvas); if (doc.body) ro.observe(doc.body); }     // the screen, and the page height
  } else {
    window.addEventListener("resize", function () { arts.forEach(refit); pageSched(); kick(); });
  }
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { arts.forEach(refit); pageSched(); });
  window.addEventListener("load", function () { arts.forEach(refit); pageSched(); kick(); });
  window.addEventListener("scroll", onScroll, {passive: true});
  window.addEventListener("orientationchange", function () { setTimeout(pageSched, 300); });

  if (window.MutationObserver) {
    new MutationObserver(function () {
      readColor();
      arts.forEach(function (a) { a.styles = styles(); still(a); });
      if (PG) { PG.styles = styles(); pageStill(); }
    }).observe(root, {attributes: true, attributeFilter: ["data-theme"]});
  }

  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        arts.forEach(function (a) { if (a.el === e.target) { a.vis = e.isIntersecting; a.stat.vis = a.vis; } });
      });
      kick();
    }, {threshold: 0});
    arts.forEach(function (a) { a.vis = false; io.observe(a.el); });
  }
  doc.addEventListener("visibilitychange", function () { if (!doc.hidden) pageSched(); kick(); });
  if (RM) {
    var onRm = function () { if (RM.matches) { arts.forEach(still); pageStill(); } else { pageSched(); kick(); } };
    if (RM.addEventListener) RM.addEventListener("change", onRm); else if (RM.addListener) RM.addListener(onRm);
  }
  kick();
})();
