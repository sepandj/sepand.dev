// Engine 4, the first history of threads (visits 122 to 138). Kept unchanged so their
// links keep opening exactly what those visitors saw.
// sepand.dev, engine 4: the history, one thread per visit.
//
// Every visit that has ever happened is a thread. Each one starts where its
// own hash says, follows the currents of the era (epoch) it was born in, and
// bends around the doors. Eras differ in their currents, colours and stroke,
// so a rare visit that opens a new era changes everything drawn after it.
// The page draws the whole history oldest first, then yours, brighter, last.

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

// ---- the history ---------------------------------------------------------------

export async function prepare(state) {
  const r = await fetch(`/api/chain/${state.n}`);
  if (!r.ok) throw new Error("chain");
  const d = await r.json();
  state.chain = { n: d.n, h: b64(d.h), e: b64(d.e), seeds: d.seeds };
}

// ---- eras ---------------------------------------------------------------------

const STYLES = ["solid", "beads", "dashes", "double", "solid", "beads"];

function era(seedHex, sitesHex, dark) {
  const S0 = hexBytes(seedHex), D = hexBytes(sitesHex || "00".repeat(32));
  // The doors' fingerprint folds into the currents (not the colours), so a new
  // door bends every thread drawn after it.
  const S = S0.map((x, i) => (i < 8 ? x : x ^ D[i]));
  const u = i => S[i % 32] / 255;
  const R = rng((S[8] << 24 | S[9] << 16 | S[10] << 8 | S[11]) >>> 0);
  const terms = [];
  const nt = 3 + (S[12] % 4);
  for (let i = 0; i < nt; i++) {
    const f = 0.6 + R() * 2.6, a = R() * TAU;
    terms.push({ fx: f * Math.cos(a), fy: f * Math.sin(a), ph: R() * TAU, amp: (0.5 + R()) / (1 + i * 0.5) });
  }
  // Palette: 5 colours around the era's hue, muted but alive.
  const hue = u(13), scheme = S[14] % 4;
  const offs = [[0, .06, .12, -.06, -.12], [0, .33, .67, .05, .38], [0, .5, .03, .53, .25], [0, .42, .58, .08, .5]][scheme];
  const sat = 0.32 + u(15) * 0.28;
  const pal = offs.map((o, i) => hsl(hue + o, sat * (i % 2 ? 0.8 : 1), dark ? 0.66 + 0.06 * (i % 3) : 0.42 + 0.05 * (i % 3)));
  return {
    kind: S[0] % 5, terms, pal, style: STYLES[S[1] % STYLES.length],
    c: [(u(16) - 0.5) * 1.2, (u(17) - 0.5) * 1.2], rot: (u(18) - 0.5) * 2.4, spin: u(19) < 0.5 ? -1 : 1,
    drift: [Math.cos(u(20) * TAU), Math.sin(u(20) * TAU)], cell: [1.2 + u(21) * 2.4, 1.2 + u(22) * 2.4],
    step: 0.006 + u(23) * 0.004, len: 0.6 + u(24) * 0.9,
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

// ---- drawing ---------------------------------------------------------------------

// Everything needed to draw the history at a given size (W, H in device px).
function plan(state, genes, doors, W, H, cssPx) {
  const ch = state.chain, n = ch.n, half = Math.min(W, H) / 2;
  const wDoors = doors.map(d => ({ ...d, wx: (d.x * cssPx - W / 2) / half, wy: (H / 2 - d.y * cssPx) / half, wr: d.rPx * cssPx / half }));
  const eras = {};
  const getEra = e => (eras[e] ??= era(ch.seeds[e] || state.epoch_seed, state.sites_digest, genes.dark));
  // Very long histories: keep every recent thread, thin out the oldest.
  const KEEP = 5000, idx = [];
  if (n <= KEEP) for (let i = 0; i < n; i++) idx.push(i);
  else {
    const stride = Math.ceil((n - KEEP / 2) / (KEEP / 2));
    for (let i = 0; i < n - KEEP / 2; i += stride) idx.push(i);
    for (let i = n - KEEP / 2; i < n; i++) idx.push(i);
  }
  return { n, W, H, half, cssPx, wDoors, getEra, idx, ax: W / 2 / half, ay: H / 2 / half, chain: ch };
}

// Follow the current from (x, y) for up to `steps`, as screen points.
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

// One thread as a flat list of screen points. Yours starts on screen and runs
// both ways from there, so it is always long and in view.
function thread(P, i, mine = false) {
  const { h, e } = P.chain;
  const b = h.subarray(i * 8, i * 8 + 8);
  const E = P.getEra((e[i * 2] << 8) | e[i * 2 + 1]);
  const fx = (b[0] << 8 | b[1]) / 65535 * 2 - 1, fy = (b[2] << 8 | b[3]) / 65535 * 2 - 1;
  const wob = (b[6] / 255 - 0.5) * 0.6;
  if (mine) {
    // Several starts, all from your own hash; the longest path is yours.
    const R = rng((b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0);
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
    return { pts: best, E, b };
  }
  const steps = Math.round((120 + b[4] / 255 * 380) * E.len);
  return { pts: trace(P, E, fx * (P.ax + 0.1), fy * (P.ay + 0.1), steps, b[5] & 1 ? 1 : -1, wob), E, b };
}

function stroke(g, T, color, width, alpha, cssPx) {
  const p = T.pts;
  if (p.length < 4) return;
  g.strokeStyle = css(color, alpha); g.fillStyle = css(color, alpha); g.lineWidth = width;
  g.lineCap = "round"; g.lineJoin = "round";
  const style = T.E.style;
  if (style === "beads") {
    for (let k = 0; k < p.length; k += 8) { g.beginPath(); g.arc(p[k], p[k + 1], width * 0.85, 0, TAU); g.fill(); }
    return;
  }
  g.setLineDash(style === "dashes" ? [6 * cssPx, 5 * cssPx] : []);
  const path = off => {
    g.beginPath();
    for (let k = 0; k < p.length; k += 2) {
      let X = p[k], Y = p[k + 1];
      if (off) {
        const j = Math.min(k + 2, p.length - 2), i0 = Math.max(k - 2, 0);
        const tx = p[j] - p[i0], ty = p[j + 1] - p[i0 + 1], l = Math.hypot(tx, ty) || 1;
        X += -ty / l * off; Y += tx / l * off;
      }
      k ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.stroke();
  };
  if (style === "double") { g.lineWidth = width * 0.6; path(1.6 * cssPx); path(-1.6 * cssPx); }
  else path(0);
  g.setLineDash([]);
}

function threadStyle(P, T, i, mine) {
  const age = P.n > 1 ? i / (P.n - 1) : 1;            // 0 oldest .. 1 newest
  const col = T.E.pal[T.b[7] % T.E.pal.length];
  if (mine) return { col, w: (2.4 + Math.min(1.6, Math.log10(P.n + 1) * 0.5)) * P.cssPx, a: 1 };
  // Older threads recede; in a crowded history every thread gets quieter.
  const crowd = Math.max(0.35, Math.min(1, Math.sqrt(800 / P.n)));
  return { col, w: (0.7 + 0.8 * age) * P.cssPx, a: (0.3 + 0.55 * Math.pow(age, 0.8)) * crowd };
}

// Door outlines: closed wavy lines that gain lobes and rings as the history grows.
function drawDoors(g, P, genes, state) {
  const H = hexBytes(state.hash), lg = Math.log2(P.n + 1);
  const K = 2 + Math.floor(lg / 1.5);
  const rings = 1 + Math.min(3, Math.floor(lg / 3));
  for (const d of P.wDoors) {
    const cx = d.x * P.cssPx, cy = d.y * P.cssPx, R = d.rPx * P.cssPx;
    const col = hsl(d.hue, genes.dark ? 0.35 : 0.4, genes.dark ? 0.7 : 0.38);
    g.fillStyle = css(genes.bg, 0.92);
    g.beginPath(); g.arc(cx, cy, R * 0.97, 0, TAU); g.fill();
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
      g.strokeStyle = css(col, r ? 0.45 / r : 0.95); g.lineWidth = (r ? 0.7 : 1.3) * P.cssPx; g.stroke();
    }
  }
}

function drawMine(g, P, T, k, glow, bg) {
  const st = threadStyle(P, T, P.n - 1, true);
  const n = Math.max(4, Math.floor(T.pts.length * k / 2) * 2);
  const part = { ...T, pts: T.pts.slice(0, n) };
  // A channel of bare ground under it, so it cuts clear of a dense weave.
  stroke(g, { ...part, E: { ...part.E, style: "solid" } }, bg, st.w + 5 * P.cssPx, 0.85, P.cssPx);
  g.shadowColor = css(st.col, 0.6); g.shadowBlur = glow * P.cssPx;
  stroke(g, part, st.col, st.w, st.a, P.cssPx);
  g.shadowBlur = 0;
  if (part.pts.length > 1) { g.fillStyle = css(st.col); g.beginPath(); g.arc(part.pts[0], part.pts[1], 3.2 * P.cssPx, 0, TAU); g.fill(); }
}

export function createArt(canvas) {
  const g = canvas.getContext("2d");
  if (!g) return null;
  let genes, doors, P, hist, doorLayer, cursor = 0, built = false, myStart = 0, myT = null;
  const off = () => { const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height; return c; };
  function rebuild() {
    P = plan(genes.state, genes, doors, canvas.width, canvas.height, canvas.width / innerWidth);
    hist = off(); doorLayer = off();
    drawDoors(doorLayer.getContext("2d"), P, genes, genes.state);
    cursor = 0; built = P.idx.length <= 1; myStart = 0;
    myT = thread(P, P.n - 1, true);
  }
  function grow(budgetMs) {
    const t0 = performance.now(), hg = hist.getContext("2d");
    while (cursor < P.idx.length - 1 && performance.now() - t0 < budgetMs) {   // everyone before you
      const i = P.idx[cursor++];
      const th = thread(P, i), st = threadStyle(P, th, i, false);
      stroke(hg, th, st.col, st.w, st.a, P.cssPx);
    }
    if (cursor >= P.idx.length - 1) built = true;
  }
  return {
    set(gn, d = []) { genes = gn; doors = d; rebuild(); },
    draw(theta) {
      if (!built) grow(10);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = css(genes.bg); g.fillRect(0, 0, canvas.width, canvas.height);
      // Breathing: the whole weave sways a hair around the centre.
      const s = 1 + 0.004 * Math.sin(theta), a = 0.002 * Math.sin(theta + 1.3);
      g.translate(canvas.width / 2, canvas.height / 2); g.rotate(a); g.scale(s, s); g.translate(-canvas.width / 2, -canvas.height / 2);
      g.drawImage(hist, 0, 0);
      g.drawImage(doorLayer, 0, 0);
      if (built) {                                  // yours draws itself in, then glows softly
        if (!myStart) myStart = performance.now();
        const k = Math.min(1, (performance.now() - myStart) / 1800);
        drawMine(g, P, myT, k, 5 + 2 * Math.sin(theta * 3), genes.bg);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    },
  };
}

// ---- share card ----------------------------------------------------------------

export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

export function renderCard(state, genes, theta, w, h) {
  const scale = Math.min(w, h) / 420;
  const doors = placeDoors(state, state.sites || [], w / scale, h / scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const P = plan(state, genes, doors, w, h, scale);
  g.fillStyle = css(genes.bg); g.fillRect(0, 0, w, h);
  for (let k = 0; k < P.idx.length - 1; k++) {
    const i = P.idx[k], th = thread(P, i), st = threadStyle(P, th, i, false);
    stroke(g, th, st.col, st.w, st.a, scale);
  }
  drawDoors(g, P, genes, state);
  drawMine(g, P, thread(P, P.n - 1, true), 1, 6, genes.bg);

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
