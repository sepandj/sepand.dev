// sepand.dev, engine 5: the history, woven while you watch.
//
// Every visit that has ever happened is a ribbon of a few strands. Each one
// starts where its own hash says, follows the currents of the era (epoch) it
// was born in, curls around the doors, and leaves a wash of colour behind.
// Eras differ in their currents, colours and stroke, so a rare visit that
// opens a new era changes everything drawn after it. The page replays the
// whole history, oldest first, then draws yours, slowly and brightest, last.

export const LOOP = 90; // seconds
export const MAX_SITES = 8;
export const fixedScale = true;

const TAU = Math.PI * 2;

// ---- small helpers ---------------------------------------------------------

const hexBytes = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = n => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
export const css = (c, a = 1) => `rgba(${c.map(x => Math.round(x * 255)).join(",")},${a})`;
export function fmtHash(h) { return h.match(/.{4}/g).join(" "); }
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- the history ---------------------------------------------------------------

export async function prepare(state) {
  const r = await fetch(`/api/chain/${state.n}`);
  if (!r.ok) throw new Error("chain");
  const d = await r.json();
  state.chain = { n: d.n, h: b64(d.h), e: b64(d.e), seeds: d.seeds };
}

// ---- eras ---------------------------------------------------------------------

const STYLES = ["solid", "beads", "dashes", "double", "solid", "solid"];

function era(seedHex, sitesHex, dark) {
  const S0 = hexBytes(seedHex), D = hexBytes(sitesHex || "00".repeat(32));
  // The doors' fingerprint folds into the currents (not the colours), so a new
  // door bends every strand drawn after it.
  const S = S0.map((x, i) => (i < 8 ? x : x ^ D[i]));
  const u = i => S[i % 32] / 255;
  const R = rng((S[8] << 24 | S[9] << 16 | S[10] << 8 | S[11]) >>> 0);
  const terms = [];
  const nt = 3 + (S[12] % 4);
  for (let i = 0; i < nt; i++) {
    const f = 0.6 + R() * 2.6, a = R() * TAU;
    terms.push({ fx: f * Math.cos(a), fy: f * Math.sin(a), ph: R() * TAU, amp: (0.5 + R()) / (1 + i * 0.5) });
  }
  // Palette: five colours around the era's hue.
  const hue = u(13), scheme = S[14] % 4;
  const offs = [[0, .07, .14, -.07, -.14], [0, .33, .67, .05, .38], [0, .5, .04, .54, .25], [0, .42, .58, .09, .5]][scheme];
  const sat = 0.45 + u(15) * 0.3;
  const pal = offs.map((o, i) => hsl(hue + o, sat * (i % 2 ? 0.85 : 1), dark ? 0.6 + 0.06 * (i % 3) : 0.44 + 0.06 * (i % 3)));
  return {
    kind: S[0] % 5, terms, pal, style: STYLES[S[1] % STYLES.length],
    c: [(u(16) - 0.5) * 1.2, (u(17) - 0.5) * 1.2], rot: (u(18) - 0.5) * 2.4, spin: u(19) < 0.5 ? -1 : 1,
    drift: [Math.cos(u(20) * TAU), Math.sin(u(20) * TAU)], cell: [1.2 + u(21) * 2.4, 1.2 + u(22) * 2.4],
    step: 0.006 + u(23) * 0.004, len: 0.7 + u(24) * 0.8, spread: 0.03 + u(25) * 0.09,
  };
}

// Direction of the current at (x, y) in an era, with the doors as whirlpools.
function flow(E, x, y, doors, wob) {
  let vx = 0, vy = 0;
  for (const t of E.terms) {                 // curl of a sum of waves
    const c = t.amp * Math.cos(t.fx * x + t.fy * y + t.ph + wob);
    vx += c * t.fy; vy -= c * t.fx;
  }
  const dx = x - E.c[0], dy = y - E.c[1], r = Math.hypot(dx, dy) + 1e-3;
  switch (E.kind) {
    case 1: vx = 0.5 * vx + E.spin * -dy / r + 0.25 * dx / r; vy = 0.5 * vy + E.spin * dx / r + 0.25 * dy / r; break; // spiral
    case 2: vx = 0.6 * vx + E.drift[0] * 1.4; vy = 0.6 * vy + E.drift[1] * 1.4; break;                               // currents
    case 3: { const [a, b] = E.cell;                                                                                // cells
      vx = 0.35 * vx + b * Math.sin(a * x + E.rot) * Math.cos(b * y); vy = 0.35 * vy - a * Math.cos(a * x + E.rot) * Math.sin(b * y); break; }
    case 4: vx = 0.6 * vx + dx / r; vy = 0.6 * vy + dy / r; break;                                                 // bloom
  }
  for (const d of doors) {
    const ex = x - d.wx, ey = y - d.wy, rr = Math.hypot(ex, ey) + 1e-4;
    const k = Math.exp(-(((rr - d.wr) / (0.8 * d.wr)) ** 2)) * 2.2;
    vx += d.spin * -ey / rr * k; vy += d.spin * ex / rr * k;      // circulate
    if (rr < d.wr * 1.25) { const push = (d.wr * 1.25 - rr) / d.wr * 5; vx += ex / rr * push; vy += ey / rr * push; }
  }
  const m = Math.hypot(vx, vy) + 1e-6;
  return [vx / m, vy / m];
}

// ---- genome ---------------------------------------------------------------------

export function genome(state) {
  const E = hexBytes(state.epoch_seed);
  const u = i => E[i] / 255;
  // Ground and type colour: the same formula the server uses to paint the page
  // before this script runs (app.py colours()), so nothing flashes.
  const hue = u(3), dark = E[4] % 3 === 0, bgS = 0.06 + u(5) * 0.1;
  const bg = dark ? hsl(hue + 0.5, bgS, 0.075 + u(6) * 0.04) : hsl(hue + 0.08, bgS, 0.9 + u(6) * 0.05);
  const ink = hsl(hue, 0.14 + u(2) * 0.22, dark ? 0.72 : 0.3);
  return { dark, bg, ink, state };
}

// Where the doors sit, in css px, so the links match the drawing.
export function placeDoors(state, sites, W, H) {
  const m = Math.min(W, H);
  const rPx = Math.max(50, Math.min(86, m * 0.105));
  const out = [];
  const padX = rPx + 18, top = rPx + 78, bottom = rPx + 116;
  for (const [i, s] of sites.slice(0, MAX_SITES).entries()) {
    const R = rng(fnv(state.hash + "|" + s.name));
    let best = null;
    for (let t = 0; t < 40; t++) {
      const x = padX + R() * Math.max(1, W - 2 * padX), y = top + R() * Math.max(1, H - top - bottom);
      const gap = out.length ? Math.min(...out.map(o => Math.hypot(o.x - x, o.y - y) - o.rPx - rPx)) : Infinity;
      if (!best || gap > best.gap) best = { x, y, gap };
      if (gap > rPx) break;
    }
    out.push({ ...s, i, x: best.x, y: best.y, rPx, spin: R() < 0.5 ? -1 : 1, hue: (fnv(s.name) % 1000) / 1000 });
  }
  return out;
}

// ---- the plan: every strand to draw, in order --------------------------------------

const STRAND_BUDGET = 9000;

// W, H in device px; cssPx = device px per css px.
function plan(state, genes, doors, W, H, cssPx) {
  const ch = state.chain, n = ch.n, half = Math.min(W, H) / 2;
  const wDoors = doors.map(d => ({ ...d, wx: (d.x * cssPx - W / 2) / half, wy: (H / 2 - d.y * cssPx) / half, wr: d.rPx * cssPx / half }));
  const eras = {};
  const getEra = e => (eras[e] ??= era(ch.seeds[e] || state.epoch_seed, state.sites_digest, genes.dark));
  // Which visits to draw (all, until the history is very long) and how many
  // strands each ribbon gets (fewer, the longer the history).
  const KEEP = 4000, idx = [];
  if (n <= KEEP) for (let i = 0; i < n - 1; i++) idx.push(i);
  else {
    const stride = Math.ceil((n - KEEP / 2) / (KEEP / 2));
    for (let i = 0; i < n - KEEP / 2; i += stride) idx.push(i);
    for (let i = n - KEEP / 2; i < n - 1; i++) idx.push(i);
  }
  const perVisit = clamp(Math.floor(STRAND_BUDGET / Math.max(1, idx.length)), 1, 6);
  const strands = [];
  idx.forEach((i, r) => {
    const b = ch.h.subarray(i * 8, i * 8 + 8);
    const m = Math.min(perVisit, 2 + (b[4] % 5));
    for (let s = 0; s < m; s++) strands.push({ i, s, r });
  });
  const crowd = clamp(Math.sqrt(900 / Math.max(1, idx.length * perVisit / 3)), 0.3, 1);
  return { n, W, H, half, cssPx, wDoors, getEra, idx, strands, crowd,
           ax: W / 2 / half, ay: H / 2 / half, chain: ch, visits: idx.length };
}

// Follow the current from (x, y) for up to `steps`, as flat screen points.
function trace(P, E, x, y, steps, dir, wob) {
  const pts = [];
  for (let s = 0; s < steps; s++) {
    let inside = false;
    for (const d of P.wDoors) if (Math.hypot(x - d.wx, y - d.wy) < d.wr) inside = true;
    if (inside || Math.abs(x) > P.ax + 0.3 || Math.abs(y) > P.ay + 0.3) break;
    pts.push(P.W / 2 + x * P.half, P.H / 2 - y * P.half);
    const [ux, uy] = flow(E, x, y, P.wDoors, wob);                       // midpoint step
    const [vx, vy] = flow(E, x + ux * E.step * 0.5 * dir, y + uy * E.step * 0.5 * dir, P.wDoors, wob);
    x += vx * E.step * dir; y += vy * E.step * dir;
  }
  return pts;
}

// One strand of a visit's ribbon, with how it should look.
function strand(P, { i, s }) {
  const { h, e } = P.chain;
  const b = h.subarray(i * 8, i * 8 + 8);
  const E = P.getEra((e[i * 2] << 8) | e[i * 2 + 1]);
  const R = rng(((b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) ^ (s * 0x9e3779b9)) >>> 0);
  const fx = (b[0] << 8 | b[1]) / 65535 * 2 - 1, fy = (b[2] << 8 | b[3]) / 65535 * 2 - 1;
  const x = fx * (P.ax + 0.1) + (s ? (R() - 0.5) * E.spread * 2 : 0);
  const y = fy * (P.ay + 0.1) + (s ? (R() - 0.5) * E.spread * 2 : 0);
  const steps = Math.round((140 + b[4] / 255 * 360) * E.len * (s ? 0.7 + R() * 0.5 : 1));
  const wob = (b[6] / 255 - 0.5) * 0.6 + s * 0.04;
  const pts = trace(P, E, x, y, steps, b[5] & 1 ? 1 : -1, wob);
  const age = P.n > 2 ? i / (P.n - 2) : 1;                 // 0 oldest .. 1 newest
  const col = E.pal[(b[7] + s) % E.pal.length];
  const w = (0.6 + 0.9 * age) * (s ? 0.6 + R() * 0.6 : 1.3) * P.cssPx;
  const a = (0.42 + 0.5 * Math.pow(age, 0.8)) * P.crowd;
  return { pts, E, b, col, w, a, style: E.style, wash: s === 0, washW: (14 + (b[3] % 32)) * P.cssPx };
}

// Yours: several starts from your own hash, the longest path, traced both ways.
function mineStrand(P) {
  const i = P.n - 1, { h, e } = P.chain;
  const b = h.subarray(i * 8, i * 8 + 8);
  const E = P.getEra((e[i * 2] << 8) | e[i * 2 + 1]);
  const R = rng((b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0);
  const fx = (b[0] << 8 | b[1]) / 65535 * 2 - 1, fy = (b[2] << 8 | b[3]) / 65535 * 2 - 1;
  const wob = (b[6] / 255 - 0.5) * 0.6;
  let best = null;
  for (let t = 0; t < 8; t++) {
    const x = (t ? R() * 2 - 1 : fx) * (P.ax - 0.25), y = (t ? R() * 2 - 1 : fy) * (P.ay - 0.35);
    const back = trace(P, E, x, y, 420, -1, wob), fwd = trace(P, E, x, y, 420, 1, wob);
    const pts = [];
    for (let k = back.length - 2; k >= 2; k -= 2) pts.push(back[k], back[k + 1]);
    const all = pts.concat(fwd);
    if (!best || all.length > best.length) best = all;
    if (best.length > 900) break;
  }
  const col = E.pal[b[7] % E.pal.length];
  return { pts: best, E, b, col, w: (2.6 + Math.min(1.6, Math.log10(P.n + 1) * 0.5)) * P.cssPx, a: 1,
           style: "solid", wash: true, washW: 36 * P.cssPx };
}

// ---- strokes ---------------------------------------------------------------------

// Draw points [from, to) of a strand (indices count points, not floats).
function drawRange(g, T, from, to, cssPx) {
  const p = T.pts, n = p.length / 2;
  to = Math.min(to, n);
  if (to - from < 1 || n < 2) return;
  g.strokeStyle = css(T.col, T.a); g.fillStyle = css(T.col, T.a);
  g.lineCap = "round"; g.lineJoin = "round";
  if (T.style === "beads") {
    for (let k = Math.ceil(from / 4) * 4; k < to; k += 4) { g.beginPath(); g.arc(p[2 * k], p[2 * k + 1], T.w * 0.8, 0, TAU); g.fill(); }
    return;
  }
  const a = Math.max(0, from - 1);
  const path = off => {
    g.beginPath();
    for (let k = a; k < to; k++) {
      let X = p[2 * k], Y = p[2 * k + 1];
      if (off) {
        const j = Math.min(k + 1, n - 1), i0 = Math.max(k - 1, 0);
        const tx = p[2 * j] - p[2 * i0], ty = p[2 * j + 1] - p[2 * i0 + 1], l = Math.hypot(tx, ty) || 1;
        X += -ty / l * off; Y += tx / l * off;
      }
      k === a ? g.moveTo(X, Y) : g.lineTo(X, Y);
    }
    g.stroke();
  };
  if (T.style === "dashes") {
    if (!T.cum) { T.cum = new Float32Array(n); for (let k = 1; k < n; k++) T.cum[k] = T.cum[k - 1] + Math.hypot(p[2 * k] - p[2 * k - 2], p[2 * k + 1] - p[2 * k - 1]); }
    g.setLineDash([7 * cssPx, 5 * cssPx]); g.lineDashOffset = T.cum[a];
  }
  if (T.style === "double") { g.lineWidth = T.w * 0.6; path(1.7 * cssPx); path(-1.7 * cssPx); }
  else { g.lineWidth = T.w; path(0); }
  g.setLineDash([]);
}

// The soft colour a ribbon leaves behind.
function drawWash(g, T, alpha) {
  const p = T.pts;
  if (p.length < 8) return;
  g.strokeStyle = css(T.col, alpha); g.lineWidth = T.washW; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath();
  for (let k = 0; k < p.length; k += 6) k ? g.lineTo(p[k], p[k + 1]) : g.moveTo(p[k], p[k + 1]);
  g.stroke();
}

// Door outlines: closed wavy lines that gain lobes and rings as the history grows.
function drawDoors(g, P, genes, state) {
  const H = hexBytes(state.hash), lg = Math.log2(P.n + 1);
  const K = 2 + Math.floor(lg / 1.5);
  const rings = 1 + Math.min(3, Math.floor(lg / 3));
  for (const d of P.wDoors) {
    const cx = d.x * P.cssPx, cy = d.y * P.cssPx, R = d.rPx * P.cssPx;
    const col = hsl(d.hue, genes.dark ? 0.45 : 0.5, genes.dark ? 0.66 : 0.4);
    g.fillStyle = css(genes.bg, 0.94);
    g.beginPath(); g.arc(cx, cy, R * 0.97, 0, TAU); g.fill();
    g.fillStyle = css(col, 0.07); g.fill();
    for (let r = 0; r < rings; r++) {
      g.beginPath();
      for (let s = 0; s <= 240; s++) {
        const th = s / 240 * TAU;
        let rad = 1;
        for (let k = 1; k <= K; k++) rad += (H[(k * 3 + r + d.i) % 32] / 255 - 0.5) * 0.12 / k * Math.cos(k * th + H[(k * 5 + r) % 32] / 255 * TAU);
        const rr = R * (1 - r * 0.07) * rad;
        const X = cx + Math.cos(th) * rr, Y = cy + Math.sin(th) * rr;
        s ? g.lineTo(X, Y) : g.moveTo(X, Y);
      }
      g.strokeStyle = css(col, r ? 0.5 / r : 0.95); g.lineWidth = (r ? 0.8 : 1.4) * P.cssPx; g.stroke();
    }
  }
}

// Washes are painted at a fraction of the resolution and scaled back up, which
// softens their edges like wet colour on paper.
const WS = 6;
function washCanvas(w, h) {
  const c = document.createElement("canvas"); c.width = Math.ceil(w / WS); c.height = Math.ceil(h / WS);
  const g = c.getContext("2d"); g.setTransform(1 / WS, 0, 0, 1 / WS, 0, 0); return c;
}
function drawSoft(g, wash, w, h) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(wash, 0, 0, w, h); }

function washAlpha(genes, P) { return (genes.dark ? 0.1 : 0.085) * Math.max(0.45, P.crowd); }

function drawMine(g, T, upto, cssPx, bg, glow) {
  const n = T.pts.length / 2, k = Math.max(2, Math.floor(upto));
  // A channel of bare ground under it, so it cuts clear of the weave.
  drawRange(g, { ...T, col: bg, a: 0.85, w: T.w + 5 * cssPx }, 0, k, cssPx);
  g.shadowColor = css(T.col, 0.7); g.shadowBlur = glow * cssPx;
  drawRange(g, T, 0, k, cssPx);
  g.shadowBlur = 0;
  if (n) { g.fillStyle = css(T.col); g.beginPath(); g.arc(T.pts[0], T.pts[1], 3.4 * cssPx, 0, TAU); g.fill(); }
}

// ---- live: the weave, drawn while you watch ---------------------------------------------

export function createArt(canvas, opts = {}) {
  const g = canvas.getContext("2d");
  if (!g) return null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let genes, doors, P, wash, lines, doorLayer, mineLayer, sched, next, active, t0, total, mine, mineDone, onVisit;
  const off = () => { const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height; return c; };

  function rebuild() {
    P = plan(genes.state, genes, doors, canvas.width, canvas.height, canvas.width / (canvas.clientWidth || innerWidth));
    wash = washCanvas(canvas.width, canvas.height); lines = off(); doorLayer = off(); mineLayer = off();
    drawDoors(doorLayer.getContext("2d"), P, genes, genes.state);
    // The replay takes longer the longer the history is.
    total = reduce ? 0 : clamp(4 + 2 * Math.log2(P.visits + 1), 6, 18) * 1000;
    const V = Math.max(1, P.visits - 1);
    sched = P.strands.map(st => ({ ...st, at: total * 0.9 * Math.pow(st.r / V, 0.85) + st.s * 90 }));
    next = 0; active = []; t0 = performance.now(); mine = null; mineDone = false;
  }

  function advance(now) {
    const el = now - t0, lg = lines.getContext("2d"), wg = wash.getContext("2d");
    const budget = performance.now() + 14;
    while (next < sched.length && sched[next].at <= el && performance.now() < budget) {
      const T = strand(P, sched[next]);
      T.start = sched[next].at; T.drawn = 0; T.n = T.pts.length / 2;
      T.dur = reduce ? 0 : 500 + T.n * 3.2;
      if (T.wash && onVisit) onVisit(sched[next].i + 1);
      active.push(T); next++;
    }
    const keep = [];
    for (const T of active) {
      const k = T.dur ? Math.floor(T.n * clamp((el - T.start) / T.dur, 0, 1)) : T.n;
      if (k > T.drawn) { drawRange(lg, T, T.drawn, k, P.cssPx); T.drawn = k; }
      if (T.drawn >= T.n) { if (T.wash) drawWash(wg, T, washAlpha(genes, P)); }
      else keep.push(T);
    }
    active = keep;
    if (next >= sched.length && !active.length && !mine) {
      mine = mineStrand(P); mine.start = el; mine.n = mine.pts.length / 2;
      if (onVisit) onVisit(P.n);
    }
  }

  return {
    set(gn, d = [], cb) { genes = gn; doors = d; if (cb) onVisit = cb; rebuild(); },
    onVisit(cb) { onVisit = cb; },
    draw(theta, _px, now = performance.now()) {
      if (!mineDone) advance(now);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = css(genes.bg); g.fillRect(0, 0, canvas.width, canvas.height);
      // Breathing: the whole weave sways a hair around the centre.
      const s = 1 + 0.004 * Math.sin(theta), a = 0.002 * Math.sin(theta + 1.3);
      g.translate(canvas.width / 2, canvas.height / 2); g.rotate(a); g.scale(s, s); g.translate(-canvas.width / 2, -canvas.height / 2);
      drawSoft(g, wash, canvas.width, canvas.height);
      g.drawImage(lines, 0, 0);
      // Glowing tips on the strands still growing.
      for (const T of active) {
        const k = Math.max(0, T.drawn - 1);
        if (T.n < 2) continue;
        g.fillStyle = css(T.col, 0.95); g.beginPath(); g.arc(T.pts[2 * k], T.pts[2 * k + 1], T.w * 1.3 + 0.8 * P.cssPx, 0, TAU); g.fill();
      }
      g.drawImage(doorLayer, 0, 0);
      if (mine) {
        const el = now - t0;
        if (!mineDone) {
          const k = reduce ? mine.n : mine.n * clamp((el - mine.start) / 3600, 0, 1);
          const mg = mineLayer.getContext("2d");
          mg.clearRect(0, 0, mineLayer.width, mineLayer.height);
          if (k >= mine.n) { drawWash(wash.getContext("2d"), mine, washAlpha(genes, P) * 1.6); mineDone = true; }
          drawMine(mg, mine, k, P.cssPx, genes.bg, 7);
          if (!mineDone && k > 1) {            // the travelling light at its tip
            const j = Math.floor(k) - 1;
            g.drawImage(mineLayer, 0, 0);
            g.fillStyle = css([1, 1, 1], genes.dark ? 0.9 : 0.75);
            g.beginPath(); g.arc(mine.pts[2 * j], mine.pts[2 * j + 1], 2.4 * P.cssPx, 0, TAU); g.fill();
            g.setTransform(1, 0, 0, 1, 0, 0);
            return;
          }
        }
        g.globalAlpha = 0.86 + 0.14 * Math.sin(theta * 4);
        g.drawImage(mineLayer, 0, 0);
        g.globalAlpha = 1;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    },
  };
}

// ---- share card ----------------------------------------------------------------

export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

// The finished weave, drawn all at once. Pass `cssScale` (device px per css
// px of the screen it should match) to get exactly what that screen shows.
export function renderCard(state, genes, theta, w, h, cssScale) {
  const scale = cssScale || Math.min(w, h) / 420;
  const doors = placeDoors(state, state.sites || [], w / scale, h / scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const P = plan(state, genes, doors, w, h, scale);
  g.fillStyle = css(genes.bg); g.fillRect(0, 0, w, h);
  const wash = washCanvas(w, h);
  const wg = wash.getContext("2d"), lines = document.createElement("canvas"); lines.width = w; lines.height = h;
  const lg = lines.getContext("2d");
  for (const st of P.strands) {
    const T = strand(P, st);
    drawRange(lg, T, 0, T.pts.length / 2, scale);
    if (T.wash) drawWash(wg, T, washAlpha(genes, P));
  }
  const my = mineStrand(P);
  drawWash(wg, my, washAlpha(genes, P) * 1.6);
  drawSoft(g, wash, w, h); g.drawImage(lines, 0, 0);
  drawDoors(g, P, genes, state);
  drawMine(g, my, my.pts.length / 2, scale, genes.bg, 7);

  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = css(genes.ink);
  g.font = `${Math.round(12 * scale)}px ${MONO}`;
  for (const d of doors) g.fillText(d.name, d.x * scale, d.y * scale);
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  const pad = 20 * scale, fs = 10 * scale;
  const fade = g.createLinearGradient(0, h - fs * 9 - pad, 0, h);       // soft ground behind the caption
  fade.addColorStop(0, css(genes.bg, 0)); fade.addColorStop(0.45, css(genes.bg, 0.85)); fade.addColorStop(1, css(genes.bg, 0.92));
  g.fillStyle = fade; g.fillRect(0, h - fs * 9 - pad, w, fs * 9 + pad);
  g.fillStyle = css(genes.ink); g.font = `600 ${Math.round(fs * 1.4)}px ${MONO}`;
  g.fillText("sepand.dev", pad, h - pad - fs * 4.2);
  g.fillStyle = css(genes.ink, 0.7); g.font = `${Math.round(fs)}px ${MONO}`;
  g.fillText(`no. ${state.n.toLocaleString("en-US")}  ·  ${state.when}`, pad, h - pad - fs * 2.5);
  const hx = fmtHash(state.hash);
  g.font = `${Math.round(fs * 0.8)}px ${MONO}`;
  g.fillText(hx.slice(0, 39), pad, h - pad - fs * 1.1);
  g.fillText(hx.slice(40), pad, h - pad);
  return c;
}
