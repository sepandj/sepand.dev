// Engine 1, used by visits made before the line drawings (visits 1 to 84).
// Kept unchanged so their links keep opening exactly what those visitors saw.
// sepand.dev art engine.
//
// A visit is a 256-bit hash from the server's chain. Everything you see is a
// pure function of three things:
//   epoch seed : the hash that last broke the "rarity record" (most leading zero
//                bits ever seen). It sets the structure: symmetry, space,
//                fields, palette family. A new record = a drastic change.
//   visit hash : this visit only. Variations inside the epoch's structure.
//   n          : how many visits came before. More visits, more layers.
// Motion only ever uses whole-number multiples of one loop angle, so the
// animation repeats exactly every LOOP seconds and the state never drifts.

export const LOOP = 24; // seconds

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTh;            // loop angle 0..2pi
uniform vec4 uG, uH;          // epoch / visit seeds in 0..1
uniform float uN;             // warp layers
uniform float uCells;         // moving cells
uniform float uSrc;           // interference sources
uniform float uSym;           // 0 = none, else fold order
uniform float uMap;           // 0 plane, 1 log-spiral, 2 inversion
uniform float uZoom, uAmp, uDens, uLineN, uLineW, uGrain, uTwist;
uniform vec4 uW;              // field weights: contour, cells, waves, flow
uniform vec3 uPa, uPb, uPc, uPd;
uniform vec3 uInk;
uniform float uInkAmt;
uniform vec2 uOff;            // where the centre went
uniform float uBreak;         // how much of the symmetry survives
uniform vec4 uM;              // which field masks the second layer
uniform float uMix;           // strength of the second layer
uniform float uShift;         // second layer's palette offset

const float TAU = 6.28318530718;

float h1(float x){ return fract(sin(x * 91.3458 + 47.853) * 43758.5453); }
float hp(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
float harm(float r){ float k = floor(r * 3.0) + 1.0; return r > 0.5 ? k : -k; } // nonzero integer

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec2 p = rot(uv * uZoom, uTwist * sin(uTh + uG.x * TAU)) - uOff;
  vec2 raw = p;

  if (uSym > 1.5) {                       // mirror fold, then partly undone
    float a = atan(p.y, p.x), sec = TAU / uSym;
    a = mod(a, sec); a = abs(a - 0.5 * sec);
    p = mix(length(p) * vec2(cos(a), sin(a)), raw, uBreak);
  }
  if (uMap > 0.5 && uMap < 1.5) {          // logarithmic radial stretch
    // Built from the direction vector, not the angle, so there is no seam.
    float r = length(p) + 1e-3;
    p = rot(p / r * (log(r) * 1.4 + 2.2), 0.6 + uG.z);
  } else if (uMap > 1.5) {                 // inversion
    p = p / max(dot(p, p), 0.04) * 0.6;
  }

  for (int i = 0; i < 18; i++) {           // layered domain warping
    if (float(i) >= uN) break;
    float fi = float(i);
    float r1 = h1(fi * 1.7 + uH.x * 91.0), r2 = h1(fi * 3.1 + uG.y * 53.0);
    float r3 = h1(fi * 5.3 + uH.z * 17.0), r4 = h1(fi * 7.9 + uG.w * 29.0);
    vec2 d = vec2(cos(r1 * TAU), sin(r1 * TAU));
    float f = mix(0.5, 3.2, r2) * (1.0 + fi * 0.12);
    float k = harm(r3);
    float amp = uAmp / (1.0 + fi * 0.4);
    p += amp * vec2(sin(dot(p, d) * f + k * uTh + r4 * TAU),
                    cos(dot(p, vec2(-d.y, d.x)) * f * 1.13 - k * uTh + r1 * TAU));
  }

  // contour field
  float s = p.x * cos(uG.z * TAU) + p.y * sin(uG.z * TAU) + 0.6 * sin(length(p) * 2.7 + uH.y * TAU);
  float contour = 0.5 + 0.5 * sin(s * uDens);

  // moving cells (each point circles with a whole-number speed)
  float d1 = 9.0, d2 = 9.0;
  for (int j = 0; j < 28; j++) {
    if (float(j) >= uCells) break;
    float fj = float(j);
    vec2 b = vec2(h1(fj * 2.3 + uH.w * 37.0), h1(fj * 4.1 + uG.x * 71.0)) * 3.2 - 1.6;
    float m = harm(h1(fj * 6.7 + uH.x * 13.0));
    float rr = 0.15 + 0.35 * h1(fj * 8.3 + uG.y * 19.0);
    vec2 c = b + rr * vec2(cos(m * uTh + fj), sin(m * uTh + fj));
    float dd = length(p - c);
    if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
  }
  float cells = smoothstep(0.0, 0.35, d2 - d1);

  // interference
  float waves = 0.0;
  for (int j = 0; j < 9; j++) {
    if (float(j) >= uSrc) break;
    float fj = float(j);
    vec2 c = vec2(h1(fj * 3.7 + uG.w * 11.0), h1(fj * 9.1 + uH.y * 23.0)) * 2.4 - 1.2;
    waves += sin(length(p - c) * (6.0 + 10.0 * h1(fj + uH.z * 7.0)) - harm(h1(fj * 2.9 + uG.z)) * uTh);
  }
  waves = 0.5 + 0.5 * waves / max(uSrc, 1.0);

  // flow stripes
  float flow = 0.5 + 0.5 * sin(p.y * uDens * 0.7 + 2.0 * sin(p.x * 1.3 + uTh));

  vec4 F = vec4(contour, cells, waves, flow);
  float sw = max(dot(uW, vec4(1.0)), 1e-3);
  float v = dot(uW, F) / sw;
  float v2 = dot(uW.wzyx, F) / sw;                     // the same fields, re-weighted
  float mask = smoothstep(0.35, 0.65, dot(uM, F) + 0.25 * sin(raw.x * 1.7 - raw.y * 2.3 + uTh)) * uMix;
  vec3 col = mix(uPa + uPb * cos(TAU * (uPc * v + uPd)),
                 uPa + uPb * cos(TAU * (uPc * v2 + uPd + uShift)), mask);
  v = mix(v, v2, mask);

  // engraved lines
  float ln = abs(fract(v * uLineN) - 0.5);
  float line = 1.0 - smoothstep(uLineW, uLineW + 0.06, ln);
  col = mix(col, uInk, line * uInkAmt);

  // fixed grain + soft vignette
  col += (hp(gl_FragCoord.xy) - 0.5) * uGrain;
  col *= 1.0 - 0.25 * dot(uv, uv);
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

// Cosine palette between two colours: a +- b, all channels in phase.
function duo(c1, c2, cyc) {
  return {
    a: c1.map((x, i) => (x + c2[i]) / 2),
    b: c1.map((x, i) => (x - c2[i]) / 2),
    c: [cyc, cyc, cyc],
  };
}

export function genome(state) {
  const G = hexBytes(state.epoch_seed), H = hexBytes(state.hash);
  const n = Math.max(1, state.n), lg = Math.log2(n + 1);

  const hue = u(G, 3), vh = (u(H, 3) - 0.5) * 0.12; // epoch hue, visit nudge
  const fam = G[4] % 6;
  let pal;
  if (fam === 0) {                       // spectral
    pal = { a: [.5, .5, .5], b: [.5, .5, .5], c: [1, 1, 1], d: [hue, hue + .33, hue + .67] };
  } else if (fam === 1) {                // ink on paper
    pal = duo(hsl(hue + vh, .25, .12), hsl(hue + .08, .3, .88), .5 + u(G, 5));
  } else if (fam === 2) {                // neon in the dark
    pal = duo(hsl(hue + vh, .6, .04), hsl(hue + vh, 1, .6), .5 + u(G, 5));
  } else if (fam === 3) {                // complement
    pal = duo(hsl(hue + vh, .75, .35), hsl(hue + .5 + vh, .7, .7), 1);
  } else if (fam === 4) {                // pastel drift
    pal = { a: [.78, .76, .8], b: [.18, .2, .16], c: [1, 1, 1], d: [hue + vh, hue + .2, hue + .45] };
  } else {                               // metallic
    pal = { a: [.55, .52, .48], b: [.45, .45, .45], c: [2, 2, 2], d: [hue, hue + .05, hue + .1] };
  }
  pal.d = pal.d || [vh, vh, vh];

  const syms = [0, 0, 0, 0, 0, 0, 3, 5, 7, 11];
  const w = [u(G, 8), u(G, 9), u(G, 10), u(G, 11)].map(x => x * x);
  w[G[12] % 4] += 1.2;                   // one field always leads

  return {
    uG: [u(G, 0), u(G, 1), u(G, 2), u(G, 6)],
    uH: [u(H, 0), u(H, 1), u(H, 2), u(H, 6)],
    uN: Math.min(18, 3 + lg * 1.3),
    uCells: Math.min(28, Math.round(3 + lg * 1.8)),
    uSrc: Math.min(9, Math.round(1 + lg * 0.6)),
    uSym: syms[G[13] % syms.length],
    uMap: [0, 0, 0, 1, 2][G[14] % 5],
    uOff: [(u(G, 24) - .5) * 1.6 + (u(H, 24) - .5) * .3, (u(G, 25) - .5) * 1.4 + (u(H, 25) - .5) * .3],
    uBreak: 0.2 + u(G, 26) * 0.5,
    uM: [0, 1, 2, 3].map(i => i === G[27] % 4 ? 1 : 0),
    uMix: Math.min(1, (0.25 + u(G, 28) * 0.75) * Math.min(1, lg / 5)),
    uShift: 0.2 + u(G, 29) * 0.6,
    uZoom: 1.2 + u(G, 15) * 1.6 + u(H, 15) * 0.4,
    uAmp: 0.25 + u(G, 16) * 0.5,
    uDens: 3 + u(G, 17) * 8 + lg * 0.6,
    uLineN: G[18] % 3 === 0 ? 0 : 2 + Math.floor(u(G, 19) * 6 + lg * 0.5),
    uLineW: 0.02 + u(G, 20) * 0.05,
    uGrain: 0.03 + u(G, 21) * 0.05,
    uTwist: (u(G, 22) - 0.5) * 0.8,
    uW: w,
    uPa: pal.a, uPb: pal.b, uPc: pal.c, uPd: pal.d,
    uInk: fam === 2 ? [1, 1, 1] : hsl(hue, .3, .08),
    uInkAmt: G[18] % 3 === 0 ? 0 : 0.35 + u(G, 23) * 0.5,
  };
}

// ---- renderer ----------------------------------------------------------------

export function createArt(canvas, opts = {}) {
  const gl = canvas.getContext("webgl", {
    antialias: false, alpha: false, preserveDrawingBuffer: !!opts.preserve,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
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

  let genes = null;
  return {
    gl,
    set(g) { genes = g; },
    draw(theta) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uni("uRes"), canvas.width, canvas.height);
      gl.uniform1f(uni("uTh"), theta);
      for (const [k, v] of Object.entries(genes)) {
        const l = uni(k);
        if (!l) continue;
        if (typeof v === "number") gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
        else gl.uniform4fv(l, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

// ---- share card ----------------------------------------------------------------

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

export function fmtHash(h) { return h.match(/.{4}/g).join(" "); }

// Full-bleed art with a small typed caption. Returns a 2D canvas.
export function renderCard(state, genes, theta, w, h) {
  const glc = document.createElement("canvas");
  glc.width = w; glc.height = h;
  const art = createArt(glc, { preserve: true });
  art.set(genes); art.draw(theta);
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const x = out.getContext("2d");
  x.drawImage(glc, 0, 0);
  art.gl.getExtension("WEBGL_lose_context")?.loseContext();

  const pad = Math.round(Math.min(w, h) * 0.06), fs = Math.max(12, Math.round(Math.min(w, h) * 0.024));
  const g = x.createLinearGradient(0, h * 0.62, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
  x.fillStyle = g; x.fillRect(0, h * 0.62, w, h * 0.38);
  x.fillStyle = "rgba(255,255,255,.94)";
  x.textBaseline = "alphabetic";
  x.font = `600 ${Math.round(fs * 1.5)}px ${MONO}`;
  x.fillText("sepand.dev", pad, h - pad - fs * 4.4);
  x.font = `${fs}px ${MONO}`;
  x.fillStyle = "rgba(255,255,255,.8)";
  x.fillText(`no. ${state.n.toLocaleString("en-US")}  ·  ${state.when}`, pad, h - pad - fs * 2.6);
  const hx = fmtHash(state.hash), half = Math.ceil(hx.length / 2 / 5) * 5;
  x.font = `${Math.round(fs * 0.82)}px ${MONO}`;
  x.fillStyle = "rgba(255,255,255,.62)";
  x.fillText(hx.slice(0, half).trim(), pad, h - pad - fs * 1.1);
  x.fillText(hx.slice(half).trim(), pad, h - pad);
  return out;
}
