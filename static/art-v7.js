// Engine 7, thick paint pours (visits 150 to 164). Kept unchanged so their
// links keep opening exactly what those visitors saw.
// sepand.dev, engine 7: the history, poured as thick oil.
//
// Every visit that has ever happened is a pour of paint: a puddle of rings in
// its era's colours, dropped where its hash says, pushing older paint aside.
// A real fluid simulation (thick, heavily damped) carries the paint, and each
// era moves it its own way: tilting, swirling, combing like marbled paper,
// blooming outward, or lying still. The currents carry fractal detail in the
// range people find most restful to look at, and every edge is a curve.
// The whole history is replayed oldest first; yours pours last and keeps a
// thin-film shimmer. Then the paint rests, and only the light moves over it,
// on a loop.

export const LOOP = 60; // seconds for the light to come back around
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

function era(seedHex, sitesHex) {
  const S0 = hexBytes(seedHex), D = hexBytes(sitesHex || "00".repeat(32));
  // A new door changes how every later era moves, not its colours.
  const S = S0.map((x, i) => (i < 8 ? x : x ^ D[i]));
  const u = i => S[i % 32] / 255;
  const hue = u(13), scheme = S[14] % 4;
  const offs = [[0, .06, .5, .12, .56], [0, .33, .67, .08, .41], [0, .5, .04, .54, .25], [0, .42, .58, .1, .5]][scheme];
  const sat = 0.42 + u(15) * 0.28;
  const pal = offs.map((o, i) => hsl(hue + o, sat * (i % 2 ? 0.75 : 1), [0.42, 0.6, 0.3, 0.74, 0.5][i]));
  return {
    // 0 tilt, 1 swirl, 2 comb (marbling), 3 bloom, 4 still
    kind: S[0] % 5, pal,
    dir: u(16) * TAU, center: [0.3 + u(17) * 0.4, 0.3 + u(18) * 0.4], spin: u(19) < 0.5 ? -1 : 1,
    comb: 2 + Math.floor(u(20) * 6), freq: 1.2 + u(21) * 2.2, seed: u(22) * 100,
    flow: 0.6 + u(23) * 0.8,
  };
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
    out.push({ ...s, i, x: best.x, y: best.y, rPx });
  }
  return out;
}

// ---- shaders ---------------------------------------------------------------------

const VS = `#version 300 es
in vec2 a; out vec2 vUv;
void main(){ vUv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform vec4 uDoors[${MAX_SITES}]; uniform int uDoorN;
bool inDoor(vec2 p){ for (int i = 0; i < ${MAX_SITES}; i++) { if (i >= uDoorN) break; if (length(p - uDoors[i].xy) < uDoors[i].z) return true; } return false; }
`;

// Carry a field along the velocity.
const ADVECT = HEAD + `
uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt, uDiss; uniform vec4 uGround; uniform float uIsDye;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec4 r = texture(uSrc, vUv - uDt * v * uTexel) * uDiss;
  if (inDoor(vUv)) r = uIsDye > 0.5 ? uGround : vec4(0.0);
  o = r;
}`;

// Sharper paint (MacCormack): correct the blur a plain advection step adds,
// clamped to the neighbourhood it came from so it never overshoots.
const MACCORMACK = HEAD + `
uniform sampler2D uVel, uSrc, uHat, uBack; uniform vec2 uTexel, uDyeTexel; uniform float uDt; uniform vec4 uGround;
void main(){
  vec2 p = vUv - uDt * texture(uVel, vUv).xy * uTexel;
  vec4 r = texture(uHat, vUv) + 0.5 * (texture(uSrc, vUv) - texture(uBack, vUv));
  vec2 i = floor(p / uDyeTexel - 0.5) + 0.5;
  vec4 a = texture(uSrc, i * uDyeTexel), b = texture(uSrc, (i + vec2(1, 0)) * uDyeTexel);
  vec4 c = texture(uSrc, (i + vec2(0, 1)) * uDyeTexel), d = texture(uSrc, (i + 1.0) * uDyeTexel);
  r = clamp(r, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
  if (inDoor(vUv)) r = uGround;
  o = r;
}`;

// The era's currents, the thickness of the oil, and its sluggishness.
const FLOW = HEAD + `
uniform sampler2D uVel; uniform vec2 uTexel; uniform float uKind, uDir, uSpin, uComb, uFreq, uSeed, uAmt, uDamp;
uniform vec2 uCenter;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// Fractal noise with gain 0.66 (Hurst ~0.6): contours of fractal dimension ~1.4.
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.66; } return s; }
vec2 curl(vec2 p){ float e = 0.01;
  float n1 = fbm(p + vec2(0, e)), n2 = fbm(p - vec2(0, e)), n3 = fbm(p + vec2(e, 0)), n4 = fbm(p - vec2(e, 0));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e); }
void main(){
  // Thick oil: velocity is smoothed with its neighbours and slowly damped.
  vec2 v = texture(uVel, vUv).xy;
  vec2 nb = (texture(uVel, vUv + vec2(uTexel.x, 0)).xy + texture(uVel, vUv - vec2(uTexel.x, 0)).xy
           + texture(uVel, vUv + vec2(0, uTexel.y)).xy + texture(uVel, vUv - vec2(0, uTexel.y)).xy) * 0.25;
  v = mix(v, nb, 0.6) * uDamp;
  vec2 p = vUv * uFreq + uSeed;
  vec2 c = curl(p) * 0.35, d = vUv - uCenter, dir = vec2(cos(uDir), sin(uDir));
  vec2 f;
  if (uKind < 0.5)      f = dir + c;                                                   // tilt
  else if (uKind < 1.5) f = uSpin * vec2(-d.y, d.x) * 3.0 / (0.2 + length(d)) + c;     // swirl
  else if (uKind < 2.5) f = dir * sin(dot(vUv, vec2(-dir.y, dir.x)) * uComb * 6.2832) * 1.4 + 0.5 * c; // comb
  else if (uKind < 3.5) f = normalize(d + 1e-4) * 0.9 + c;                             // bloom
  else                  f = c * 1.3;                                                   // still
  v += f * uAmt;
  if (inDoor(vUv)) v = vec2(0.0);
  o = vec4(v, 0.0, 1.0);
}`;

// A pour: the paint pushes outward from where it lands, with a little twist.
const SPLAT_VEL = HEAD + `
uniform sampler2D uVel; uniform vec2 uPoint; uniform float uRadius; uniform vec2 uPush;
void main(){
  vec2 v = texture(uVel, vUv).xy, d = vUv - uPoint;
  float r = length(d), f = exp(-r * r / (uRadius * uRadius * 1.6));
  vec2 n = r > 1e-5 ? d / r : vec2(0.0);
  v += (n * uPush.x + vec2(-n.y, n.x) * uPush.y) * f;
  o = vec4(v, 0.0, 1.0);
}`;

// The paint itself: concentric rings, crisp edged, like a puddle pour.
const SPLAT_DYE = HEAD + `
uniform sampler2D uSrc; uniform vec2 uPoint; uniform float uRadius, uBands, uMine;
uniform vec3 uC0, uC1, uC2;
void main(){
  vec4 dye = texture(uSrc, vUv);
  float t = length(vUv - uPoint) / uRadius;
  float b = mod(floor(t * uBands), 3.0);
  vec3 col = b < 0.5 ? uC0 : b < 1.5 ? uC1 : uC2;
  float m = 1.0 - smoothstep(0.96, 1.0, t);
  // Thin pale seams between rings: the "lacing" of a real pour.
  float seam = 1.0 - smoothstep(0.0, 0.06, abs(fract(t * uBands + 0.5) - 0.5) * 2.0);
  col = mix(col, vec3(1.0), seam * 0.25 * step(0.05, t));
  o = mix(dye, vec4(col, uMine > 0.5 ? 1.0 : 0.0), m);
}`;

const DIV = HEAD + `
uniform sampler2D uVel; uniform vec2 uTexel;
void main(){
  float L = texture(uVel, vUv - vec2(uTexel.x, 0)).x, R = texture(uVel, vUv + vec2(uTexel.x, 0)).x;
  float B = texture(uVel, vUv - vec2(0, uTexel.y)).y, T = texture(uVel, vUv + vec2(0, uTexel.y)).y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const JACOBI = HEAD + `
uniform sampler2D uP, uDiv; uniform vec2 uTexel;
void main(){
  float L = texture(uP, vUv - vec2(uTexel.x, 0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0)).x;
  float B = texture(uP, vUv - vec2(0, uTexel.y)).x, T = texture(uP, vUv + vec2(0, uTexel.y)).x;
  o = vec4((L + R + B + T - texture(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRAD = HEAD + `
uniform sampler2D uP, uVel; uniform vec2 uTexel;
void main(){
  float L = texture(uP, vUv - vec2(uTexel.x, 0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0)).x;
  float B = texture(uP, vUv - vec2(0, uTexel.y)).x, T = texture(uP, vUv + vec2(0, uTexel.y)).x;
  vec2 v = texture(uVel, vUv).xy - vec2(R - L, T - B);
  if (inDoor(vUv)) v = vec2(0.0);
  o = vec4(v, 0.0, 1.0);
}`;

// The surface: glossy thick paint under a light that circles once a loop.
const DISPLAY = HEAD + `
uniform sampler2D uDye; uniform vec2 uTexel; uniform vec4 uCrop; uniform float uTh, uDark, uRim; uniform vec3 uGround;
float lum(vec2 p){ return dot(texture(uDye, p).rgb, vec3(0.3, 0.59, 0.11)); }
void main(){
  vec2 uv = uCrop.xy + vUv * uCrop.zw;
  // A breath of movement in the surface itself, periodic in the loop.
  uv += 0.0007 * vec2(sin(uv.y * 31.0 + uTh), cos(uv.x * 27.0 - uTh));
  vec4 c = texture(uDye, uv);
  vec2 e = uTexel * 1.6;
  float dx = lum(uv + vec2(e.x, 0)) - lum(uv - vec2(e.x, 0)), dy = lum(uv + vec2(0, e.y)) - lum(uv - vec2(0, e.y));
  vec3 N = normalize(vec3(-dx * 7.0, -dy * 7.0, 1.0));
  vec3 L = normalize(vec3(cos(uTh) * 0.55, sin(uTh) * 0.55 + 0.25, 1.0)), H = normalize(L + vec3(0, 0, 1));
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 110.0) * 0.55 + pow(nh, 14.0) * 0.07;
  vec3 col = c.rgb * (0.82 + 0.18 * dot(N, L)) + spec;
  // Yours keeps a thin-film shimmer, like oil on water.
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (lum(uv) * 2.2 + uTh / 6.2832 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, col * 0.55 + film * 0.55, c.a * 0.5) + spec * c.a * 0.6;
  // Doors: clean holes with a glossy rim.
  for (int i = 0; i < ${MAX_SITES}; i++) {
    if (i >= uDoorN) break;
    float r = length(uv - uDoors[i].xy) / uDoors[i].z;
    if (r < 1.0) col = mix(uGround * 0.94, uGround, smoothstep(0.55, 0.95, 1.0 - r) + 0.4);
    col += uRim * smoothstep(0.08, 0.0, abs(r - 1.0)) * (0.5 + 0.5 * sin(atan(uv.y - uDoors[i].y, uv.x - uDoors[i].x) - uTh));
  }
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ---- the simulation -----------------------------------------------------------------

function sim(canvas, opts) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
  gl.getExtension("OES_texture_float_linear");
  const SV = opts.simRes, SD = opts.dyeRes;
  const compile = (src) => {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, src]]) {
      const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(p, sh);
    }
    gl.bindAttribLocation(p, 0, "a"); gl.linkProgram(p);
    const U = {};
    return { p, u: n => (n in U ? U[n] : (U[n] = gl.getUniformLocation(p, n))) };
  };
  const P = { advect: compile(ADVECT), flow: compile(FLOW), sv: compile(SPLAT_VEL), sd: compile(SPLAT_DYE),
              div: compile(DIV), jac: compile(JACOBI), grad: compile(GRAD), show: compile(DISPLAY), mc: compile(MACCORMACK) };
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = (w, h, ifmt, fmt) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fb, w, h };
  };
  const pair = (w, h, i, f) => { const a = tex(w, h, i, f), b = tex(w, h, i, f); return { r: a, w: b, swap() { [this.r, this.w] = [this.w, this.r]; } }; };
  const vel = pair(SV, SV, gl.RG16F, gl.RG), prs = pair(SV, SV, gl.R16F, gl.RED), div = tex(SV, SV, gl.R16F, gl.RED);
  const dye = pair(SD, SD, gl.RGBA16F, gl.RGBA), hat = tex(SD, SD, gl.RGBA16F, gl.RGBA), back = tex(SD, SD, gl.RGBA16F, gl.RGBA);

  let doors = [], ground = [0, 0, 0];
  const bindT = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); return unit; };
  const run = (prog, target, set) => {
    gl.useProgram(prog.p);
    gl.uniform1i(prog.u("uDoorN"), doors.length);
    const arr = new Float32Array(4 * MAX_SITES); doors.forEach((d, i) => arr.set([d.u, d.v, d.r, 0], i * 4));
    gl.uniform4fv(prog.u("uDoors[0]"), arr);
    set(prog);
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const DT = 0.6;

  return {
    gl,
    reset(g, d) {
      ground = g; doors = d;
      for (const t of [dye.r, dye.w]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(g[0], g[1], g[2], 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      for (const t of [vel.r, vel.w, prs.r, prs.w]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    },
    pour(p) {
      run(P.sv, vel.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform2f(pr.u("uPoint"), p.x, p.y);
        gl.uniform1f(pr.u("uRadius"), p.r); gl.uniform2f(pr.u("uPush"), p.push, p.twist); }); vel.swap();
      run(P.sd, dye.w, pr => { gl.uniform1i(pr.u("uSrc"), bindT(0, dye.r.t)); gl.uniform2f(pr.u("uPoint"), p.x, p.y);
        gl.uniform1f(pr.u("uRadius"), p.r); gl.uniform1f(pr.u("uBands"), p.bands); gl.uniform1f(pr.u("uMine"), p.mine ? 1 : 0);
        gl.uniform3fv(pr.u("uC0"), p.c[0]); gl.uniform3fv(pr.u("uC1"), p.c[1]); gl.uniform3fv(pr.u("uC2"), p.c[2]); }); dye.swap();
    },
    step(E, amt) {
      const tx = [1 / SV, 1 / SV];
      run(P.flow, vel.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform2fv(pr.u("uTexel"), tx);
        gl.uniform1f(pr.u("uKind"), E.kind); gl.uniform1f(pr.u("uDir"), E.dir); gl.uniform1f(pr.u("uSpin"), E.spin);
        gl.uniform1f(pr.u("uComb"), E.comb); gl.uniform1f(pr.u("uFreq"), E.freq); gl.uniform1f(pr.u("uSeed"), E.seed);
        gl.uniform2fv(pr.u("uCenter"), E.center); gl.uniform1f(pr.u("uAmt"), amt * E.flow); gl.uniform1f(pr.u("uDamp"), 0.94); }); vel.swap();
      run(P.advect, vel.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform1i(pr.u("uSrc"), bindT(1, vel.r.t));
        gl.uniform2fv(pr.u("uTexel"), tx); gl.uniform1f(pr.u("uDt"), DT); gl.uniform1f(pr.u("uDiss"), 1); gl.uniform1f(pr.u("uIsDye"), 0); }); vel.swap();
      run(P.div, div, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform2fv(pr.u("uTexel"), tx); });
      for (let k = 0; k < opts.iters; k++) {
        run(P.jac, prs.w, pr => { gl.uniform1i(pr.u("uP"), bindT(0, prs.r.t)); gl.uniform1i(pr.u("uDiv"), bindT(1, div.t)); gl.uniform2fv(pr.u("uTexel"), tx); }); prs.swap();
      }
      run(P.grad, vel.w, pr => { gl.uniform1i(pr.u("uP"), bindT(0, prs.r.t)); gl.uniform1i(pr.u("uVel"), bindT(1, vel.r.t)); gl.uniform2fv(pr.u("uTexel"), tx); }); vel.swap();
      const adv = (src, dst, dt) => run(P.advect, dst, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform1i(pr.u("uSrc"), bindT(1, src.t));
        gl.uniform2fv(pr.u("uTexel"), tx); gl.uniform1f(pr.u("uDt"), dt); gl.uniform1f(pr.u("uDiss"), 1);
        gl.uniform4f(pr.u("uGround"), ground[0], ground[1], ground[2], 0); gl.uniform1f(pr.u("uIsDye"), 1); });
      adv(dye.r, hat, DT); adv(hat, back, -DT);
      run(P.mc, dye.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform1i(pr.u("uSrc"), bindT(1, dye.r.t));
        gl.uniform1i(pr.u("uHat"), bindT(2, hat.t)); gl.uniform1i(pr.u("uBack"), bindT(3, back.t));
        gl.uniform2fv(pr.u("uTexel"), tx); gl.uniform2f(pr.u("uDyeTexel"), 1 / SD, 1 / SD); gl.uniform1f(pr.u("uDt"), DT);
        gl.uniform4f(pr.u("uGround"), ground[0], ground[1], ground[2], 0); }); dye.swap();
    },
    show(crop, theta, dark, rim) {
      run(P.show, null, pr => { gl.uniform1i(pr.u("uDye"), bindT(0, dye.r.t)); gl.uniform2f(pr.u("uTexel"), 1 / SD, 1 / SD);
        gl.uniform4fv(pr.u("uCrop"), crop); gl.uniform1f(pr.u("uTh"), theta); gl.uniform1f(pr.u("uDark"), dark ? 1 : 0);
        gl.uniform1f(pr.u("uRim"), rim); gl.uniform3fv(pr.u("uGround"), ground); });
    },
  };
}

// ---- the plan: every pour, in order ------------------------------------------------

const MAX_POURS = 360, STEPS_PER_POUR = 4, SETTLE = 90, MINE_STEPS = 110;

// W, H in css px. The simulation is a square that covers the screen; the
// screen shows its middle.
function plan(state, doors, W, H) {
  const ch = state.chain, n = ch.n, M = Math.max(W, H);
  const crop = [0.5 - W / M / 2, 0.5 - H / M / 2, W / M, H / M];
  const toSim = (x, y) => [crop[0] + x / W * crop[2], crop[1] + (1 - y / H) * crop[3]];
  const sd = doors.map(d => { const [u, v] = toSim(d.x, d.y); return { ...d, u, v, r: d.rPx / M }; });
  const eras = {};
  const getEra = e => (eras[e] ??= era(ch.seeds[e] || state.epoch_seed, state.sites_digest));
  // Long histories: every recent visit pours, the oldest are thinned out.
  const idx = [];
  const last = n - 1;
  if (last <= MAX_POURS) for (let i = 0; i < last; i++) idx.push(i);
  else {
    const old = MAX_POURS / 3, stride = Math.ceil((last - MAX_POURS * 2 / 3) / old);
    for (let i = 0; i < last - MAX_POURS * 2 / 3; i += stride) idx.push(i);
    for (let i = Math.ceil(last - MAX_POURS * 2 / 3); i < last; i++) idx.push(i);
  }
  // Pours shrink a little as the history grows, so the surface keeps its grain.
  const size = clamp(1.25 / (1 + Math.log10(idx.length + 1) * 0.45), 0.45, 1);
  const pour = (i, mine) => {
    const b = ch.h.subarray(i * 8, i * 8 + 8), E = getEra((ch.e[i * 2] << 8) | ch.e[i * 2 + 1]);
    const fx = (b[0] << 8 | b[1]) / 65535, fy = (b[2] << 8 | b[3]) / 65535;
    let x = crop[0] + (0.06 + fx * 0.88) * crop[2], y = crop[1] + (0.06 + fy * 0.88) * crop[3];
    for (const d of sd) {                       // never pour into a door
      const dx = x - d.u, dy = y - d.v, r = Math.hypot(dx, dy);
      if (r < d.r * 1.6) { x = d.u + dx / (r || 1) * d.r * 1.6; y = d.v + dy / (r || 1) * d.r * 1.6; }
    }
    const k = b[7];
    const c = [E.pal[k % 5], E.pal[(k + 1 + (b[6] & 1)) % 5], E.pal[(k + 3) % 5]];
    return { i, E, x, y, mine,
      r: (mine ? 0.12 : (0.045 + b[4] / 255 * 0.09) * size) * Math.min(1, 1.2 * Math.min(crop[2], crop[3]) + 0.4),
      bands: mine ? 4 : 1 + (b[5] % 4), c,
      push: (mine ? 9 : 4 + b[6] / 255 * 6), twist: ((b[5] >> 2) / 63 - 0.5) * 6 };
  };
  return { n, crop, doors: sd, pours: idx.map(i => pour(i, false)), mine: pour(n - 1, true) };
}

// ---- live: the pour, watched ---------------------------------------------------------

export function createArt(canvas, opts = {}) {
  const S = sim(canvas, { simRes: 192, dyeRes: 1024, iters: 18, ...opts });
  if (!S) return null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let genes, P, k, sub, perFrame, onVisit, done, mineStep;
  function stepsLeftOthers() { return (P.pours.length - k) * STEPS_PER_POUR - sub; }
  return {
    set(gn, doors = [], cb) {
      genes = gn; if (cb) onVisit = cb;
      const W = canvas.clientWidth || innerWidth, H = canvas.clientHeight || innerHeight;
      P = plan(gn.state, doors, W, H);
      S.reset(genes.bg, P.doors);
      k = 0; sub = 0; done = false; mineStep = -1;
      // The replay length grows with the history; steps are fixed, only their pace varies.
      const seconds = clamp(6 + 1.6 * Math.log2(P.pours.length + 1), 7, 18);
      perFrame = reduce ? 1e9 : Math.max(1, Math.ceil(P.pours.length * STEPS_PER_POUR / (seconds * 60)));
    },
    runToEnd() { while (!done) this.advance(1e9); },
    advance(budget) {
      let n = budget;
      while (n-- > 0 && !done) {
        if (k < P.pours.length) {
          const p = P.pours[k];
          if (sub === 0) { S.pour(p); if (onVisit) onVisit(p.i + 1); }
          S.step(p.E, 0.035);
          if (++sub >= STEPS_PER_POUR) { sub = 0; k++; }
        } else if (mineStep < 0) {
          mineStep = 0; if (onVisit) onVisit(P.n);
          return;                                 // yours starts on its own frame
        } else if (mineStep < MINE_STEPS + SETTLE) {
          if (mineStep % 12 === 0 && mineStep < 48) S.pour({ ...P.mine, r: P.mine.r * (0.55 + mineStep / 100) });
          S.step(P.mine.E, mineStep < MINE_STEPS ? 0.02 : 0.004);
          mineStep++;
          if (!reduce && mineStep < MINE_STEPS + SETTLE) return;   // yours, one step a frame
        } else done = true;
      }
    },
    draw(theta) {
      if (!done) this.advance(perFrame);
      S.show(P.crop, theta, genes.dark, 0.18);
    },
    // Exactly the frame on screen, for keeping.
    snapshot() { return canvas; },
    get done() { return done; },
  };
}

// ---- cards ----------------------------------------------------------------

export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

// Puts the caption and door names over a finished frame.
export function caption(src, state, genes, doors, scale) {
  const w = src.width, h = src.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = css(genes.ink);
  g.font = `${Math.round(12 * scale)}px ${MONO}`;
  for (const d of doors) g.fillText(d.name, d.x * scale, d.y * scale);
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  const pad = 20 * scale, fs = 10 * scale;
  const fade = g.createLinearGradient(0, h - fs * 9 - pad, 0, h);
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

// A finished piece at any size, off screen (link previews).
export function renderCard(state, genes, theta, w, h, cssScale) {
  const scale = cssScale || Math.min(w, h) / 420;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  Object.defineProperty(c, "clientWidth", { value: w / scale }); Object.defineProperty(c, "clientHeight", { value: h / scale });
  const doors = placeDoors(state, state.sites || [], w / scale, h / scale);
  const art = createArt(c, { simRes: 112, dyeRes: 640, iters: 8 });     // lighter: drawn in software on the server
  if (!art) return c;
  art.set(genes, doors);
  art.runToEnd();
  art.draw(theta);
  return caption(c, state, genes, doors, scale);
}

// What the page says about the visit.
export const WORDS = {
  yours: "the last pour is yours, the one that shimmers. it won't come again.",
  theirs: "the last pour was someone's, ",
};
