// sepand.dev, engine 8: the history, poured as oil.
//
// Every visit that has ever happened is a thin stream of coloured oil, poured
// along a path its hash chooses. A fluid simulation carries it: heavy, damped,
// spreading under its own weight. Each era moves it its own way (tilting,
// swirling, combing, blooming, or lying still), with currents whose fractal
// detail sits in the range people find most restful, and every edge is a curve.
// Oil is drawn as oil: clear where thin, deep and rich where thick, bending the
// grain beneath it, with a sharp meniscus at its edge, a rainbow film where it
// thins out, and glints of light. The names of the other sites are set into the
// surface and the oil flows around their letters.
// The whole history is replayed oldest first; yours pours last and shimmers.
// Then the oil rests, and only the light moves, on a loop.

export const LOOP = 60; // seconds for the light to come back around
export const MAX_SITES = 8;
export const fixedScale = true;
export const namesInArt = true;

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
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

// ---- the history ---------------------------------------------------------------

export async function prepare(state) {
  const r = await fetch(`/api/chain/${state.n}`);
  if (!r.ok) throw new Error("chain");
  const d = await r.json();
  state.chain = { n: d.n, h: b64(d.h), x: b64(d.x || d.h), e: b64(d.e), seeds: d.seeds };
}

// ---- colour ---------------------------------------------------------------------

// Every colour is equally likely: three bytes of the visit's own hash, taken
// straight as red, green and blue. About one stream in 64 is a metal instead.
const METALS = [
  [1.0, 0.78, 0.34],   // gold
  [0.95, 0.55, 0.38],  // copper
  [0.93, 0.93, 0.96],  // silver
  [0.62, 0.66, 0.72],  // steel
  [0.8, 0.56, 0.3],    // bronze
  [0.94, 0.68, 0.62],  // rose gold
];
function colourOf(X) {
  if (X[3] < 4) return { c: METALS[X[4] % METALS.length], metal: true };
  return { c: [X[0] / 255, X[1] / 255, X[2] / 255], metal: false };
}

// ---- eras ---------------------------------------------------------------------

function era(seedHex, sitesHex) {
  const S0 = hexBytes(seedHex), D = hexBytes(sitesHex || "00".repeat(32));
  // A new site changes how every later era moves, not its colours.
  const S = S0.map((x, i) => (i < 8 ? x : x ^ D[i]));
  const u = i => S[i % 32] / 255;
  const hue = u(13), scheme = S[14] % 4;
  const offs = [[0, .06, .5, .12, .56], [0, .33, .67, .08, .41], [0, .5, .04, .54, .25], [0, .42, .58, .1, .5]][scheme];
  const sat = 0.55 + u(15) * 0.35;
  const pal = offs.map((o, i) => hsl(hue + o, sat * (i % 2 ? 0.8 : 1), [0.45, 0.55, 0.4, 0.6, 0.5][i]));
  return {
    kind: S[0] % 5, pal,                       // 0 tilt, 1 swirl, 2 comb, 3 bloom, 4 still
    dir: u(16) * TAU, center: [0.3 + u(17) * 0.4, 0.3 + u(18) * 0.4], spin: u(19) < 0.5 ? -1 : 1,
    comb: 2 + Math.floor(u(20) * 6), freq: 1.2 + u(21) * 2.2, seed: u(22) * 100,
    flow: 0.5 + u(23) * 0.7,
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

// Where each site's name is set into the surface: position, size and angle all
// come from the visit and the name. Returned in css px with the text's box.
let measurer;
function textWidth(text, px) {
  measurer ??= document.createElement("canvas").getContext("2d");
  measurer.font = `600 ${px}px ${MONO}`;
  return measurer.measureText(text).width + text.length * px * 0.18;     // letter spacing
}
export function placeDoors(state, sites, W, H) {
  const m = Math.min(W, H), out = [];
  for (const [i, s] of sites.slice(0, MAX_SITES).entries()) {
    const R = rng(fnv(state.hash + "|" + s.name));
    const px = Math.round(clamp(m * (0.06 + R() * 0.05), 24, 64));
    const angle = (R() - 0.5) * 0.5;
    const w = textWidth(s.name, px), h = px * 1.2;
    const half = Math.abs(Math.cos(angle)) * w / 2 + Math.abs(Math.sin(angle)) * h / 2 + 16;
    const halfY = Math.abs(Math.sin(angle)) * w / 2 + Math.abs(Math.cos(angle)) * h / 2 + 16;
    let best = null;
    for (let t = 0; t < 40; t++) {
      const x = half + R() * Math.max(1, W - 2 * half), y = 80 + halfY + R() * Math.max(1, H - 200 - 2 * halfY);
      const gap = out.length ? Math.min(...out.map(o => Math.hypot(o.x - x, o.y - y) - o.w / 2 - w / 2)) : Infinity;
      if (!best || gap > best.gap) best = { x, y, gap };
      if (gap > 40) break;
    }
    out.push({ ...s, i, x: best.x, y: best.y, px, angle, w, h });
  }
  return out;
}

// The names as a texture over the square simulation: red = the letters
// (the oil can't enter), green = a soft halo for the meniscus around them.
function nameMask(doors, size, toSim, M) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, size, size);
  const put = (style, blur) => {
    for (const d of doors) {
      const [u, v] = toSim(d.x, d.y), px = d.px / M * size;
      g.save(); g.translate(u * size, (1 - v) * size); g.rotate(d.angle);
      g.font = `600 ${px}px ${MONO}`; g.textAlign = "center"; g.textBaseline = "middle";
      if ("letterSpacing" in g) g.letterSpacing = `${px * 0.18}px`;
      g.shadowColor = style; g.shadowBlur = blur; g.fillStyle = style;
      g.fillText(d.name, 0, 0);
      g.restore();
    }
  };
  g.globalCompositeOperation = "lighter";
  put("rgb(0,140,0)", size * 0.012);              // halo
  put("rgb(255,0,0)", 0);                         // letters
  return c;
}

// ---- shaders ---------------------------------------------------------------------

const VS = `#version 300 es
in vec2 a; out vec2 vUv;
void main(){ vUv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uMask;
bool inName(vec2 p){ return texture(uMask, p).r > 0.5; }
`;

const ADVECT = HEAD + `
uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt; uniform vec4 uEmpty;
void main(){
  vec2 v = texture(uVel, vUv).xy;
  o = inName(vUv) ? uEmpty : texture(uSrc, vUv - uDt * v * uTexel);
}`;

// Sharper oil (MacCormack): correct the blur a plain advection step adds,
// clamped to the neighbourhood it came from so it never overshoots.
const MACCORMACK = HEAD + `
uniform sampler2D uVel, uSrc, uHat, uBack; uniform vec2 uTexel, uDyeTexel; uniform float uDt; uniform vec4 uEmpty;
void main(){
  vec2 p = vUv - uDt * texture(uVel, vUv).xy * uTexel;
  vec4 r = texture(uHat, vUv) + 0.5 * (texture(uSrc, vUv) - texture(uBack, vUv));
  vec2 i = floor(p / uDyeTexel - 0.5) + 0.5;
  vec4 a = texture(uSrc, i * uDyeTexel), b = texture(uSrc, (i + vec2(1, 0)) * uDyeTexel);
  vec4 c = texture(uSrc, (i + vec2(0, 1)) * uDyeTexel), d = texture(uSrc, (i + 1.0) * uDyeTexel);
  r = clamp(r, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
  o = inName(vUv) ? uEmpty : r;
}`;

// Currents of the era, the oil spreading under its own weight, and its
// heaviness (smoothing and damping).
const FLOW = HEAD + `
uniform sampler2D uVel, uDye; uniform vec2 uTexel; uniform float uKind, uDir, uSpin, uComb, uFreq, uSeed, uAmt, uDamp, uSpread;
uniform vec2 uCenter;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// Fractal noise with gain 0.66 (Hurst ~0.6): contours of fractal dimension ~1.4.
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.66; } return s; }
vec2 curl(vec2 p){ float e = 0.01;
  return vec2(fbm(p + vec2(0, e)) - fbm(p - vec2(0, e)), -(fbm(p + vec2(e, 0)) - fbm(p - vec2(e, 0)))) / (2.0 * e); }
void main(){
  vec2 v = texture(uVel, vUv).xy;
  vec2 nb = (texture(uVel, vUv + vec2(uTexel.x, 0)).xy + texture(uVel, vUv - vec2(uTexel.x, 0)).xy
           + texture(uVel, vUv + vec2(0, uTexel.y)).xy + texture(uVel, vUv - vec2(0, uTexel.y)).xy) * 0.25;
  v = mix(v, nb, 0.55) * uDamp;
  // Gravity: oil runs from where it is deep to where it is shallow.
  float aL = texture(uDye, vUv - vec2(uTexel.x, 0)).a, aR = texture(uDye, vUv + vec2(uTexel.x, 0)).a;
  float aB = texture(uDye, vUv - vec2(0, uTexel.y)).a, aT = texture(uDye, vUv + vec2(0, uTexel.y)).a;
  v -= vec2(aR - aL, aT - aB) * uSpread;
  vec2 c = curl(vUv * uFreq + uSeed) * 0.35, d = vUv - uCenter, dir = vec2(cos(uDir), sin(uDir));
  vec2 f;
  if (uKind < 0.5)      f = dir + c;
  else if (uKind < 1.5) f = uSpin * vec2(-d.y, d.x) * 3.0 / (0.2 + length(d)) + c;
  else if (uKind < 2.5) f = dir * sin(dot(vUv, vec2(-dir.y, dir.x)) * uComb * 6.2832) * 1.4 + 0.5 * c;
  else if (uKind < 3.5) f = normalize(d + 1e-4) * 0.9 + c;
  else                  f = c * 1.3;
  v += f * uAmt;
  if (inName(vUv)) v = vec2(0.0);
  o = vec4(v, 0.0, 1.0);
}`;

// A stream of oil: a little more poured at the moving spout, pushed along.
const POUR_VEL = HEAD + `
uniform sampler2D uVel; uniform vec2 uPoint, uPush; uniform float uRadius;
void main(){
  vec2 d = vUv - uPoint; float f = exp(-dot(d, d) / (uRadius * uRadius * 2.0));
  o = vec4(texture(uVel, vUv).xy + uPush * f, 0.0, 1.0);
}`;
const POUR_OIL = HEAD + `
uniform sampler2D uSrc; uniform vec2 uPoint; uniform float uRadius, uAmt; uniform vec3 uC;
void main(){
  vec4 d = texture(uSrc, vUv);
  vec2 q = vUv - uPoint; float f = exp(-dot(q, q) / (uRadius * uRadius)) * uAmt;
  float a = d.a + f;
  o = inName(vUv) ? d : vec4((d.rgb * d.a + uC * f) / max(a, 1e-4), a);
}`;
// Marks that ride along with the oil: red = yours, green = metal.
const POUR_MINE = HEAD + `
uniform sampler2D uSrc; uniform vec2 uPoint; uniform float uRadius; uniform vec2 uWhich;
void main(){
  vec2 q = vUv - uPoint; float f = exp(-dot(q, q) / (uRadius * uRadius)) * 0.8;
  vec2 m = texture(uSrc, vUv).rg;
  o = vec4(min(vec2(1.0), m + uWhich * f), 0.0, 1.0);
}`;

// Oil spreading under its own weight (thin-film / porous-medium flow): mass
// moves down the thickness gradient with mobility ~ thickness^3, so deep oil
// runs and thin oil barely creeps. Fronts stay sharp, like a real puddle.
// Colour travels with the oil that moves.
const SPREAD = HEAD + `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uK; uniform vec4 uEmpty;
void main(){
  vec4 c = texture(uSrc, vUv);
  if (inName(vUv)) { o = uEmpty; return; }
  float h = c.a, h3 = h * h * h;
  vec3 mass = c.rgb * h; float hn = h;
  vec2 off[4] = vec2[4](vec2(uTexel.x, 0), vec2(-uTexel.x, 0), vec2(0, uTexel.y), vec2(0, -uTexel.y));
  for (int i = 0; i < 4; i++) {
    vec2 q = vUv + off[i];
    vec4 n = inName(q) ? vec4(c.rgb, h) : texture(uSrc, q);    // names are walls
    // h^3 for the run of deep oil, plus a little levelling so pours merge.
    float m = min(0.5 * (h3 + n.a * n.a * n.a), 4.0) + 1.6 * step(0.004, max(h, n.a));
    float flux = uK * m * (n.a - h);                            // > 0: oil comes in
    hn += flux;
    mass += flux > 0.0 ? n.rgb * flux : c.rgb * flux;
  }
  hn = max(hn, 0.0);
  o = vec4(hn > 1e-4 ? clamp(mass / hn, 0.0, 1.0) : c.rgb, hn);
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
  o = vec4(inName(vUv) ? vec2(0.0) : v, 0.0, 1.0);
}`;

// The surface: oil over a fine-grained ground, lit by a light that circles
// once a loop. Only the light depends on the loop, so the piece itself rests.
const DISPLAY = HEAD + `
uniform sampler2D uDye, uMine; uniform vec2 uTexel; uniform vec4 uCrop; uniform float uTh, uDark, uPx;
uniform vec3 uGround, uInk;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
// The ground: fine grain with faint long fibres, so the oil has something to bend.
vec3 ground(vec2 p){
  float fib = vnoise(vec2(p.x * 40.0, p.y * 900.0)) * 0.6 + vnoise(vec2(p.x * 700.0, p.y * 30.0)) * 0.4;
  float grain = vnoise(p * 1400.0);
  return uGround * (0.955 + 0.05 * fib + 0.03 * grain);
}
float T(vec2 p){ return texture(uDye, p).a; }
void main(){
  vec2 uv = uCrop.xy + vUv * uCrop.zw;
  vec4 d = texture(uDye, uv);
  float t = d.a;
  // Surface slope from the depth, read over a few texels so the oil is smooth.
  vec2 e = uTexel * 2.6;
  float tx = T(uv + vec2(e.x, 0)) - T(uv - vec2(e.x, 0)), ty = T(uv + vec2(0, e.y)) - T(uv - vec2(0, e.y));
  tx += 0.5 * (T(uv + vec2(e.x, e.y)) - T(uv - vec2(e.x, -e.y)) + T(uv + vec2(e.x, -e.y)) - T(uv - vec2(e.x, e.y)));
  ty += 0.5 * (T(uv + vec2(e.x, e.y)) - T(uv + vec2(e.x, -e.y)) + T(uv + vec2(-e.x, e.y)) - T(uv - vec2(e.x, e.y)));
  vec3 N = normalize(vec3(-tx * 0.5, -ty * 0.5, 1.0));
  float cover = smoothstep(0.03, 0.045, t);                 // where there is oil at all (thinner film is not drawn)
  // Through the oil: the ground, bent, then coloured by how deep the oil is.
  // On a dark ground the oil's own colour glows instead.
  vec3 base = ground(uv + N.xy * 0.012 * cover);
  vec3 absorb = (1.0 - d.rgb) * 2.6 + 0.05;
  float body = 1.0 - exp(-t * 2.2);
  vec3 lightDeep = base * exp(-absorb * t * 1.6) + d.rgb * body * 0.12;
  vec3 darkDeep = base * exp(-absorb * t) * 0.6 + d.rgb * body * 0.95;
  vec3 col = mix(ground(uv), mix(lightDeep, darkDeep, uDark), cover);
  // Rainbow film where the oil thins out at its edges.
  float thin = cover * (1.0 - smoothstep(0.04, 0.12, t));
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (t * 9.0 + uTh / 6.2832 * 0.0 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, col * 0.75 + film * 0.3, thin * 0.45);
  // Its edge: a sharp meniscus line, darker, with a bright lip just inside.
  // Only where oil meets bare ground.
  float w = max(fwidth(t), 1e-5);
  float lip = (1.0 - smoothstep(0.0, 1.6 * uPx, abs(t - 0.036) / w)) * (1.0 - smoothstep(0.045, 0.08, t));
  col = mix(col, col * 0.62, lip * 0.75);
  // Light: a sharp glint and a broad sheen, plus a little sky at grazing angles.
  vec3 L = normalize(vec3(cos(uTh) * 0.5, sin(uTh) * 0.5 + 0.3, 1.0)), H = normalize(L + vec3(0, 0, 1));
  float nh = max(dot(N, H), 0.0);
  float fres = pow(1.0 - N.z, 2.0);
  col += cover * (pow(nh, 260.0) * 0.95 + pow(nh, 28.0) * 0.1 + fres * 0.35);
  // Metal: an opaque mirror, tinted, reflecting a soft studio of light.
  vec2 marks = texture(uMine, uv).rg;
  float met = smoothstep(0.15, 0.5, marks.g) * cover;
  vec3 Rf = reflect(vec3(0, 0, -1), N);
  float studio = 0.35 + 0.65 * smoothstep(-0.2, 0.6, Rf.y * cos(uTh * 0.5) + Rf.x * sin(uTh * 0.5));
  vec3 metal = d.rgb * (0.18 + 0.82 * studio) + pow(nh, 90.0) * mix(d.rgb, vec3(1.0), 0.5) * 1.2;
  col = mix(col, metal, met);
  // Yours keeps a thin-film shimmer all over.
  float m = marks.r * cover;
  vec3 film2 = 0.5 + 0.5 * cos(6.2832 * (t * 4.0 + dot(N.xy, vec2(1.5, -1.0)) + uTh / 6.2832 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, col * 0.55 + film2 * 0.55, m * 0.55) + m * pow(nh, 60.0) * 0.5;
  // The names: set into the surface, the oil heaped against their sides.
  vec4 mk = texture(uMask, uv);
  col += cover * mk.g * (1.0 - mk.r) * 0.18;
  col = mix(col, uInk, smoothstep(0.35, 0.65, mk.r));
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ---- the simulation -----------------------------------------------------------------

function sim(canvas, opts) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;
  gl.getExtension("OES_texture_float_linear");
  const SV = opts.simRes, SD = opts.dyeRes, SM = Math.max(256, SD >> 1);
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
  const P = { advect: compile(ADVECT), mc: compile(MACCORMACK), flow: compile(FLOW), pv: compile(POUR_VEL),
              po: compile(POUR_OIL), pm: compile(POUR_MINE), div: compile(DIV), jac: compile(JACOBI),
              grad: compile(GRAD), show: compile(DISPLAY), spread: compile(SPREAD) };
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
  const mine = pair(SM, SM, gl.RG16F, gl.RG);
  const mask = gl.createTexture();

  let ground = [0, 0, 0];
  const bindT = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); return unit; };
  const run = (prog, target, set) => {
    gl.useProgram(prog.p);
    gl.uniform1i(prog.u("uMask"), bindT(7, mask));
    set(prog);
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); gl.viewport(0, 0, target.w, target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const DT = 0.6, tx = [1 / SV, 1 / SV];
  const empty = () => [ground[0], ground[1], ground[2], 0];

  return {
    reset(g, maskCanvas) {
      ground = g;
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      for (const t of [dye.r, dye.w]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(g[0], g[1], g[2], 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      for (const t of [vel.r, vel.w, prs.r, prs.w, mine.r, mine.w]) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    },
    // One drop of the stream at the spout.
    pour(x, y, r, push, c, amt, isMine, metal) {
      run(P.pv, vel.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform2f(pr.u("uPoint"), x, y);
        gl.uniform1f(pr.u("uRadius"), r * 1.6); gl.uniform2fv(pr.u("uPush"), push); }); vel.swap();
      run(P.po, dye.w, pr => { gl.uniform1i(pr.u("uSrc"), bindT(0, dye.r.t)); gl.uniform2f(pr.u("uPoint"), x, y);
        gl.uniform1f(pr.u("uRadius"), r); gl.uniform1f(pr.u("uAmt"), amt); gl.uniform3fv(pr.u("uC"), c); }); dye.swap();
      if (isMine || metal) { run(P.pm, mine.w, pr => { gl.uniform1i(pr.u("uSrc"), bindT(0, mine.r.t)); gl.uniform2f(pr.u("uPoint"), x, y);
        gl.uniform1f(pr.u("uRadius"), r * 1.2); gl.uniform2f(pr.u("uWhich"), isMine ? 1 : 0, metal ? 1 : 0); }); mine.swap(); }
    },
    step(E, amt) {
      run(P.flow, vel.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform1i(pr.u("uDye"), bindT(1, dye.r.t));
        gl.uniform2fv(pr.u("uTexel"), tx);
        gl.uniform1f(pr.u("uKind"), E.kind); gl.uniform1f(pr.u("uDir"), E.dir); gl.uniform1f(pr.u("uSpin"), E.spin);
        gl.uniform1f(pr.u("uComb"), E.comb); gl.uniform1f(pr.u("uFreq"), E.freq); gl.uniform1f(pr.u("uSeed"), E.seed);
        gl.uniform2fv(pr.u("uCenter"), E.center); gl.uniform1f(pr.u("uAmt"), amt * E.flow);
        gl.uniform1f(pr.u("uDamp"), 0.93); gl.uniform1f(pr.u("uSpread"), 0.7); }); vel.swap();
      run(P.advect, vel.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform1i(pr.u("uSrc"), bindT(1, vel.r.t));
        gl.uniform2fv(pr.u("uTexel"), tx); gl.uniform1f(pr.u("uDt"), DT); gl.uniform4f(pr.u("uEmpty"), 0, 0, 0, 0); }); vel.swap();
      run(P.div, div, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform2fv(pr.u("uTexel"), tx); });
      for (let k = 0; k < opts.iters; k++) {
        run(P.jac, prs.w, pr => { gl.uniform1i(pr.u("uP"), bindT(0, prs.r.t)); gl.uniform1i(pr.u("uDiv"), bindT(1, div.t)); gl.uniform2fv(pr.u("uTexel"), tx); }); prs.swap();
      }
      run(P.grad, vel.w, pr => { gl.uniform1i(pr.u("uP"), bindT(0, prs.r.t)); gl.uniform1i(pr.u("uVel"), bindT(1, vel.r.t)); gl.uniform2fv(pr.u("uTexel"), tx); }); vel.swap();
      const adv = (src, dst, dt, em) => run(P.advect, dst, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform1i(pr.u("uSrc"), bindT(1, src.t));
        gl.uniform2fv(pr.u("uTexel"), tx); gl.uniform1f(pr.u("uDt"), dt); gl.uniform4fv(pr.u("uEmpty"), em); });
      adv(dye.r, hat, DT, empty()); adv(hat, back, -DT, empty());
      run(P.mc, dye.w, pr => { gl.uniform1i(pr.u("uVel"), bindT(0, vel.r.t)); gl.uniform1i(pr.u("uSrc"), bindT(1, dye.r.t));
        gl.uniform1i(pr.u("uHat"), bindT(2, hat.t)); gl.uniform1i(pr.u("uBack"), bindT(3, back.t));
        gl.uniform2fv(pr.u("uTexel"), tx); gl.uniform2f(pr.u("uDyeTexel"), 1 / SD, 1 / SD); gl.uniform1f(pr.u("uDt"), DT);
        gl.uniform4fv(pr.u("uEmpty"), empty()); }); dye.swap();
      adv(mine.r, mine.w, DT, [0, 0, 0, 0]); mine.swap();
      for (let k = 0; k < 2; k++) {
        run(P.spread, dye.w, pr => { gl.uniform1i(pr.u("uSrc"), bindT(0, dye.r.t)); gl.uniform2f(pr.u("uTexel"), 1 / SD, 1 / SD);
          gl.uniform1f(pr.u("uK"), 0.02); gl.uniform4fv(pr.u("uEmpty"), empty()); }); dye.swap();
      }
    },
    show(crop, theta, genes, pxPerTexel) {
      run(P.show, null, pr => { gl.uniform1i(pr.u("uDye"), bindT(0, dye.r.t)); gl.uniform1i(pr.u("uMine"), bindT(1, mine.r.t));
        gl.uniform2f(pr.u("uTexel"), 1 / SD, 1 / SD); gl.uniform4fv(pr.u("uCrop"), crop); gl.uniform1f(pr.u("uTh"), theta);
        gl.uniform1f(pr.u("uDark"), genes.dark ? 1 : 0); gl.uniform1f(pr.u("uPx"), pxPerTexel);
        gl.uniform3fv(pr.u("uGround"), genes.bg); gl.uniform3fv(pr.u("uInk"), genes.ink); });
    },
  };
}

// ---- the plan: every stream, in order ------------------------------------------------

const MAX_POURS = 360, SETTLE = 120, MINE_DROPS = 70;

// W, H in css px. The simulation is a square covering the screen; the screen
// shows its middle.
function plan(state, doors, W, H, maxPours = MAX_POURS) {
  const ch = state.chain, n = ch.n, M = Math.max(W, H);
  const crop = [0.5 - W / M / 2, 0.5 - H / M / 2, W / M, H / M];
  const toSim = (x, y) => [crop[0] + x / W * crop[2], crop[1] + (1 - y / H) * crop[3]];
  const eras = {};
  const getEra = e => (eras[e] ??= era(ch.seeds[e] || state.epoch_seed, state.sites_digest));
  const idx = [], last = n - 1;
  if (last <= maxPours) for (let i = 0; i < last; i++) idx.push(i);
  else {
    const old = maxPours / 3, stride = Math.ceil((last - maxPours * 2 / 3) / old);
    for (let i = 0; i < last - maxPours * 2 / 3; i += stride) idx.push(i);
    for (let i = Math.ceil(last - maxPours * 2 / 3); i < last; i++) idx.push(i);
  }
  // Each stream is thinner the longer the history, so the surface keeps detail.
  const size = clamp(1.2 / (1 + Math.log10(idx.length + 1) * 0.4), 0.5, 1);
  const stream = (i, mine) => {
    const b = ch.h.subarray(i * 8, i * 8 + 8), E = getEra((ch.e[i * 2] << 8) | ch.e[i * 2 + 1]);
    const R = rng((b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0);
    const fx = (b[0] << 8 | b[1]) / 65535, fy = (b[2] << 8 | b[3]) / 65535;
    const drops = mine ? MINE_DROPS : 8 + (b[4] % 10);
    let x = crop[0] + (0.08 + fx * 0.84) * crop[2], y = crop[1] + (0.08 + fy * 0.84) * crop[3];
    let heading = b[5] / 255 * TAU;
    const turn = ((b[6] / 255) - 0.5) * (mine ? 0.22 : 0.5);   // how the spout's path curls
    const speed = (mine ? 0.0042 : 0.004 + R() * 0.006) * Math.min(crop[2], crop[3]) / 0.6;
    const r = (mine ? 0.05 : 0.028 + R() * 0.035) * size;
    const X = ch.x.subarray(i * 8, i * 8 + 8), { c: col, metal } = colourOf(X);
    const path = [];
    for (let k = 0; k < drops; k++) {
      heading += turn + (R() - 0.5) * 0.25;
      x += Math.cos(heading) * speed; y += Math.sin(heading) * speed;
      // the spout stays on screen, turning back at the edges
      if (x < crop[0] + 0.03 || x > crop[0] + crop[2] - 0.03) { heading = Math.PI - heading; x = clamp(x, crop[0] + 0.03, crop[0] + crop[2] - 0.03); }
      if (y < crop[1] + 0.03 || y > crop[1] + crop[3] - 0.03) { heading = -heading; y = clamp(y, crop[1] + 0.03, crop[1] + crop[3] - 0.03); }
      path.push({ x, y, push: [Math.cos(heading) * 1.2, Math.sin(heading) * 1.2], c: col });
    }
    return { i, E, r, path, metal, amt: mine ? 1.8 : 1.5 };
  };
  return { n, crop, M, doors, mask: nameMask(doors, 1024, toSim, M), streams: idx.map(i => stream(i, false)), mine: stream(n - 1, true) };
}

// ---- live: the pour, watched ---------------------------------------------------------

export function createArt(canvas, opts = {}) {
  const O = { simRes: 192, dyeRes: 1024, iters: 18, ...opts };
  const S = sim(canvas, O);
  if (!S) return null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let genes, P, k, drop, perFrame, onVisit, done, mineDrop;
  const art = {
    set(gn, doors = [], cb) {
      genes = gn; if (cb) onVisit = cb;
      const W = canvas.clientWidth || innerWidth, H = canvas.clientHeight || innerHeight;
      P = plan(gn.state, doors, W, H, O.maxPours);
      S.reset(genes.bg, P.mask);
      k = 0; drop = 0; done = false; mineDrop = -1;
      const total = P.streams.reduce((s, x) => s + x.path.length, 0);
      const seconds = clamp(6 + 1.6 * Math.log2(P.streams.length + 1), 7, 18);
      perFrame = reduce ? 1e9 : Math.max(1, Math.ceil(total / (seconds * 60)));
    },
    runToEnd() { while (!done) art.advance(1e9, true); },
    advance(budget, all) {
      let n = budget;
      while (n-- > 0 && !done) {
        if (k < P.streams.length) {
          const s = P.streams[k], p = s.path[drop];
          if (drop === 0 && onVisit) onVisit(s.i + 1);
          S.pour(p.x, p.y, s.r, p.push, p.c, s.amt, false, s.metal);
          S.step(s.E, 0.012);
          if (++drop >= s.path.length) { drop = 0; k++; }
        } else if (mineDrop < 0) {
          mineDrop = 0; if (onVisit) onVisit(P.n);
          if (!all) return;
        } else if (mineDrop < MINE_DROPS + SETTLE) {
          const m = P.mine;
          if (mineDrop < MINE_DROPS) { const p = m.path[mineDrop]; S.pour(p.x, p.y, m.r, p.push, p.c, m.amt, true, m.metal); }
          S.step(m.E, mineDrop < MINE_DROPS ? 0.008 : 0.002);
          mineDrop++;
          if (!reduce && !all) return;                // yours, one drop a frame
        } else done = true;
      }
    },
    draw(theta) {
      if (!done) art.advance(perFrame);
      S.show(P.crop, theta, genes, canvas.width / (P.crop[2] * O.dyeRes));
    },
    snapshot() { return canvas; },
    get done() { return done; },
  };
  return art;
}

// ---- cards ----------------------------------------------------------------

// Puts the caption over a finished frame (the names are already in the art).
export function caption(src, state, genes, doors, scale) {
  const w = src.width, h = src.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.drawImage(src, 0, 0);
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
  // Lighter: link previews are drawn in software on the server.
  const art = createArt(c, { simRes: 112, dyeRes: 512, iters: 8, maxPours: 60 });
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
