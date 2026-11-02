// Engine 2, the first line drawings (visits 85 to 102). Kept unchanged so their
// links keep opening exactly what those visitors saw.
// sepand.dev art engine.
//
// A visit is a 256-bit hash from the server's chain. What you see is a pure
// function of four things:
//   epoch seed : the hash that last broke the rarity record. It sets the
//                structure: space, symmetry, which fields draw lines, palette.
//   sites      : the doors that existed when you came. Their fingerprint is
//                folded into the structure, so every new door changes the work.
//   visit hash : this visit only. Where the doors sit, how the lines bend.
//   n          : how many visits came before. More visits, more lines.
// Motion only ever uses whole-number multiples of one loop angle, so the piece
// repeats exactly every LOOP seconds and never drifts.

export const LOOP = 24; // seconds
export const MAX_SITES = 8;

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const FRAG = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uPx;            // device pixels per css pixel
uniform float uTh;            // loop angle 0..2pi
uniform vec4 uG, uH;          // structure / visit seeds in 0..1
uniform float uN, uCells, uSrc, uSym, uMap;
uniform float uZoom, uAmp, uTwist, uBreak;
uniform vec2 uOff;
uniform vec4 uW;              // field weights: contour, cells, waves, flow
uniform vec4 uW2;             // second line family weights
uniform float uLinesA, uLinesB, uWidthA, uWidthB, uAlphaA, uAlphaB, uHair;
uniform vec3 uBg, uBg2, uInk1, uInk2, uInk3;
uniform float uGrain;
uniform vec4 uSite[${MAX_SITES}];   // xy centre (uv), z radius (uv), w swirl
uniform float uSiteN;

const float TAU = 6.28318530718;

float h1(float x){ return fract(sin(x * 91.3458 + 47.853) * 43758.5453); }
float hp(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
float harm(float r){ float k = floor(r * 3.0) + 1.0; return r > 0.5 ? k : -k; }

// Anti-aliased line on the iso-levels of x, width w in css pixels.
float iso(float x, float w){
  float d = abs(fract(x + 0.5) - 0.5);
#ifdef GL_OES_standard_derivatives
  float fw = max(fwidth(x), 1e-5);
#else
  float fw = 0.0035 * uLinesA;
#endif
  // Where lines crowd closer than a few pixels they would only shimmer, so
  // they fade into the ground instead.
  float crowd = 1.0 - smoothstep(0.12, 0.3, fw);
  return (1.0 - smoothstep(w * uPx * 0.5 - 0.5, w * uPx * 0.5 + 0.5, d / fw)) * crowd;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // Doors: each one twists the space around it and keeps a quiet room inside.
  vec2 q = uv;
  float calm = 0.0, ring = 0.0;
  for (int i = 0; i < ${MAX_SITES}; i++) {
    if (float(i) >= uSiteN) break;
    vec4 s = uSite[i];
    vec2 d = q - s.xy;
    float r = length(d);
    float f = exp(-r * r / (s.z * s.z * 7.0));
    float k = harm(h1(float(i) * 3.3 + uH.y * 7.0));
    q = s.xy + rot(d, s.w * f * (1.0 + 0.3 * sin(k * uTh + float(i))));
    float ru = length(uv - s.xy) / s.z;
    calm = max(calm, 1.0 - smoothstep(0.9, 1.0, ru));
    ring = max(ring, iso(ru, 1.2) * (1.0 - smoothstep(1.0, 1.1, ru)) * smoothstep(0.85, 0.95, ru));
  }

  vec2 p = rot(q * uZoom, uTwist * sin(uTh + uG.x * TAU)) - uOff;
  vec2 raw = p;
  if (uSym > 1.5) {
    float a = atan(p.y, p.x), sec = TAU / uSym;
    a = mod(a, sec); a = abs(a - 0.5 * sec);
    p = mix(length(p) * vec2(cos(a), sin(a)), raw, uBreak);
  }
  if (uMap > 0.5 && uMap < 1.5) {
    float r = length(p) + 1e-3;
    p = rot(p / r * (log(r) * 1.4 + 2.2), 0.6 + uG.z);
  } else if (uMap > 1.5) {
    p = p / max(dot(p, p), 0.04) * 0.6;
  }

  for (int i = 0; i < 16; i++) {
    if (float(i) >= uN) break;
    float fi = float(i);
    float r1 = h1(fi * 1.7 + uH.x * 91.0), r2 = h1(fi * 3.1 + uG.y * 53.0);
    float r3 = h1(fi * 5.3 + uH.z * 17.0), r4 = h1(fi * 7.9 + uG.w * 29.0);
    vec2 d = vec2(cos(r1 * TAU), sin(r1 * TAU));
    float f = mix(0.5, 2.6, r2) * (1.0 + fi * 0.1);
    float k = harm(r3);
    float amp = uAmp / (1.0 + fi * 0.45);
    p += amp * vec2(sin(dot(p, d) * f + k * uTh + r4 * TAU),
                    cos(dot(p, vec2(-d.y, d.x)) * f * 1.13 - k * uTh + r1 * TAU));
  }

  // Smooth scalar fields. Lines are drawn on their level sets.
  float contour = p.x * cos(uG.z * TAU) + p.y * sin(uG.z * TAU) + 0.5 * sin(length(p) * 2.1 + uH.y * TAU);
  float d1 = 9.0, d2 = 9.0;
  for (int j = 0; j < 20; j++) {
    if (float(j) >= uCells) break;
    float fj = float(j);
    vec2 b = vec2(h1(fj * 2.3 + uH.w * 37.0), h1(fj * 4.1 + uG.x * 71.0)) * 3.2 - 1.6;
    float m = harm(h1(fj * 6.7 + uH.x * 13.0));
    float rr = 0.15 + 0.35 * h1(fj * 8.3 + uG.y * 19.0);
    vec2 c = b + rr * vec2(cos(m * uTh + fj), sin(m * uTh + fj));
    float dd = length(p - c);
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
  }
  float cells = d1;
  float waves = 0.0;
  for (int j = 0; j < 7; j++) {
    if (float(j) >= uSrc) break;
    float fj = float(j);
    vec2 c = vec2(h1(fj * 3.7 + uG.w * 11.0), h1(fj * 9.1 + uH.y * 23.0)) * 2.4 - 1.2;
    waves += length(p - c) * (0.6 + h1(fj + uH.z * 7.0)) * (mod(fj, 2.0) * 2.0 - 1.0);
  }
  waves /= max(uSrc, 1.0);
  float flow = p.y + 0.4 * sin(p.x * 1.3 + uTh);
  vec4 F = vec4(contour, cells, waves, flow);

  float a = dot(uW, F) / max(dot(uW, vec4(1.0)), 1e-3);
  float b = dot(uW2, F) / max(dot(uW2, vec4(1.0)), 1e-3);

  float lineA = iso(a * uLinesA, uWidthA) * uAlphaA;
  float lineB = iso(b * uLinesB, uWidthB) * uAlphaB;
  // Cell edges as true hairlines: about one css pixel wide wherever they are.
  float e = d2 - d1;
#ifdef GL_OES_standard_derivatives
  float ef = max(fwidth(e), 1e-5);
#else
  float ef = 0.004;
#endif
  float hair = uHair * (1.0 - smoothstep(0.4 * uPx, 0.4 * uPx + 1.0, e / ef)) * (1.0 - smoothstep(0.12, 0.3, ef)) * 0.6;

  // Quiet ground: two close tones, barely moving.
  float g = 0.5 + 0.5 * sin(dot(uv, vec2(0.8, 1.3)) + 0.3 * sin(uTh));
  vec3 col = mix(uBg, uBg2, g * 0.7 + 0.15 * dot(uv, uv));

  float open = 1.0 - calm;
  vec3 inkA = mix(uInk1, uInk2, 0.5 + 0.5 * sin(a * 0.9 + uG.w * TAU));
  col = mix(col, uInk3, hair * open);
  col = mix(col, uInk3, lineB * open);
  col = mix(col, inkA, lineA * open);
  col = mix(col, uInk1, ring * 0.9);

  col += (hp(gl_FragCoord.xy) - 0.5) * uGrain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ---- genome ------------------------------------------------------------------

const hexBytes = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
const u = (b, i) => b[i % b.length] / 255;

function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const f = n => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
export const css = (c, a = 1) => `rgba(${c.map(x => Math.round(x * 255)).join(",")},${a})`;

// FNV-1a, enough to give each door name its own stream of numbers.
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

export function genome(state) {
  const E = hexBytes(state.epoch_seed), H = hexBytes(state.hash);
  const S = hexBytes(state.sites_digest || "00".repeat(32));
  // Structure = epoch seed folded with the doors' fingerprint. Palette bytes
  // (0..7) stay the epoch's own, so a new door re-shapes rather than recolours.
  const G = E.map((x, i) => (i < 8 ? x : x ^ S[i]));
  const n = Math.max(1, state.n), lg = Math.log2(n + 1);

  const hue = u(G, 3), vh = (u(H, 3) - 0.5) * 0.06;
  const dark = G[4] % 3 === 0;           // a third of epochs are night pieces
  const bgS = 0.06 + u(G, 5) * 0.1;
  const bg = dark ? hsl(hue + 0.5, bgS, 0.075 + u(G, 6) * 0.04) : hsl(hue + 0.08, bgS, 0.9 + u(G, 6) * 0.05);
  const bg2 = dark ? hsl(hue + 0.55, bgS, 0.11) : hsl(hue + 0.12, bgS * 1.3, 0.86);
  const spread = 0.08 + u(G, 7) * 0.35;
  const sat = 0.14 + u(G, 2) * 0.22;
  const L1 = dark ? 0.72 : 0.3, L2 = dark ? 0.58 : 0.45, L3 = dark ? 0.32 : 0.74;
  const ink1 = hsl(hue + vh, sat, L1);
  const ink2 = hsl(hue + spread + vh, sat * 0.9, L2);
  const ink3 = hsl(hue - spread * 0.5, sat * 0.7, L3);

  const syms = [0, 0, 0, 0, 0, 0, 3, 5, 7, 11];
  const w = [u(G, 8), u(G, 9), u(G, 10), u(G, 11)].map(x => x * x);
  w[G[12] % 4] += 1.2;
  const w2 = [u(G, 30), u(G, 31), u(G, 28), u(G, 29)].map(x => x * x);
  w2[(G[12] + 1 + (G[27] % 3)) % 4] += 1.2;

  return {
    dark, ink: ink1, bg,
    uG: [u(G, 0), u(G, 1), u(G, 2), u(G, 6)],
    uH: [u(H, 0), u(H, 1), u(H, 2), u(H, 6)],
    uN: Math.min(16, 2 + lg * 1.1),
    uCells: Math.min(20, Math.round(3 + lg * 1.4)),
    uSrc: Math.min(7, Math.round(1 + lg * 0.5)),
    uSym: syms[G[13] % syms.length],
    uMap: [0, 0, 0, 1, 2][G[14] % 5],
    uZoom: 1.1 + u(G, 15) * 1.2 + u(H, 15) * 0.3,
    uAmp: 0.18 + u(G, 16) * 0.35,
    uTwist: (u(G, 22) - 0.5) * 0.6,
    uBreak: 0.2 + u(G, 26) * 0.5,
    uOff: [(u(G, 24) - .5) * 1.6 + (u(H, 24) - .5) * .3, (u(G, 25) - .5) * 1.4 + (u(H, 25) - .5) * .3],
    uW: w, uW2: w2,
    // Line density grows with every visit.
    uLinesA: 4 + u(G, 17) * 6 + lg * 1.1,
    uLinesB: 2 + u(G, 19) * 4 + lg * 0.7,
    uWidthA: 1.0 + u(G, 20) * 0.9,
    uWidthB: 0.7,
    uAlphaA: 0.85,
    uAlphaB: Math.min(0.55, 0.12 + lg * 0.035) * (G[18] % 4 === 0 ? 0 : 1),
    uHair: n > 64 && G[21] % 2 === 0 ? 1 : 0,
    uBg: bg, uBg2: bg2, uInk1: ink1, uInk2: ink2, uInk3: ink3,
    uGrain: dark ? 0.035 : 0.025,
  };
}

// Where the doors sit, in shader uv (y up, unit = shorter side) and css px.
// Deterministic from the visit and each door's name, kept clear of the edges,
// the corner button and the bottom bar, and apart from each other.
export function placeDoors(state, sites, W, H) {
  const m = Math.min(W, H);
  const rPx = Math.max(52, Math.min(92, m * 0.11));
  const r = rPx / m;
  const out = [];
  const padX = rPx + 14, top = rPx + 74, bottom = rPx + 110;
  for (const [i, s] of sites.slice(0, MAX_SITES).entries()) {
    const R = rng(fnv(state.hash + "|" + s.name));
    let best = null;
    for (let t = 0; t < 40; t++) {
      const x = padX + R() * Math.max(1, W - 2 * padX), y = top + R() * Math.max(1, H - top - bottom);
      const gap = out.length ? Math.min(...out.map(o => Math.hypot(o.x - x, o.y - y) - o.rPx - rPx)) : Infinity;
      if (!best || gap > best.gap) best = { x, y, gap };
      if (gap > rPx) break;
    }
    const swirl = (R() < 0.5 ? -1 : 1) * (0.9 + R() * 1.6);
    out.push({ ...s, i, x: best.x, y: best.y, rPx, u: (best.x - W / 2) / m, v: (H / 2 - best.y) / m, r, swirl });
  }
  return out;
}

// ---- renderer ----------------------------------------------------------------

export function createArt(canvas, opts = {}) {
  const gl = canvas.getContext("webgl", {
    antialias: false, alpha: false, preserveDrawingBuffer: !!opts.preserve,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  gl.getExtension("OES_standard_derivatives");
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  const uni = name => (U[name] ??= gl.getUniformLocation(prog, name));

  let genes = null, doors = [];
  return {
    gl,
    set(g, d = []) { genes = g; doors = d; },
    draw(theta, pxPerCss = 1) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uni("uRes"), canvas.width, canvas.height);
      gl.uniform1f(uni("uPx"), pxPerCss);
      gl.uniform1f(uni("uTh"), theta);
      for (const [k, v] of Object.entries(genes)) {
        if (k[0] !== "u") continue;
        const l = uni(k);
        if (!l) continue;
        if (typeof v === "number") gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
        else gl.uniform4fv(l, v);
      }
      const arr = new Float32Array(4 * MAX_SITES);
      doors.forEach((d, i) => arr.set([d.u, d.v, d.r, d.swirl], i * 4));
      gl.uniform4fv(uni("uSite[0]"), arr);
      gl.uniform1f(uni("uSiteN"), doors.length);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

// ---- share card ----------------------------------------------------------------

export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

export function fmtHash(h) { return h.match(/.{4}/g).join(" "); }

// Full-bleed art with its doors named, and a small typed caption.
export function renderCard(state, genes, theta, w, h) {
  const scale = Math.min(w, h) / 420;     // the card reads like a ~420px screen
  const cw = w / scale, ch = h / scale;
  const doors = placeDoors(state, state.sites || [], cw, ch);
  const glc = document.createElement("canvas");
  glc.width = w; glc.height = h;
  const art = createArt(glc, { preserve: true });
  art.set(genes, doors); art.draw(theta, scale);
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const x = out.getContext("2d");
  x.drawImage(glc, 0, 0);
  art.gl.getExtension("WEBGL_lose_context")?.loseContext();

  x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = css(genes.ink);
  x.font = `${Math.round(12 * scale)}px ${MONO}`;
  for (const d of doors) x.fillText(d.name, d.x * scale, d.y * scale);

  x.textAlign = "left"; x.textBaseline = "alphabetic";
  const pad = 20 * scale, fs = 10 * scale;
  x.fillStyle = css(genes.ink); x.font = `600 ${Math.round(fs * 1.4)}px ${MONO}`;
  x.fillText("sepand.dev", pad, h - pad - fs * 4.2);
  x.fillStyle = css(genes.ink, 0.7); x.font = `${Math.round(fs)}px ${MONO}`;
  x.fillText(`no. ${state.n.toLocaleString("en-US")}  ·  ${state.when}`, pad, h - pad - fs * 2.5);
  const hx = fmtHash(state.hash);
  x.font = `${Math.round(fs * 0.8)}px ${MONO}`;
  x.fillText(hx.slice(0, 39), pad, h - pad - fs * 1.1);
  x.fillText(hx.slice(40), pad, h - pad);
  return out;
}
