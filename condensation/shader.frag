// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// condensation (Veil) - frost growing across a cold pane at night. Behind the
// glass sits a dark street of out-of-focus lights, soft bokeh discs drifting
// almost imperceptibly. From every edge of the pane frost advances inward as
// fern dendrites built from explicit geometry: stems at jittered spacing point
// in from the edge, each with its own tilt and length, and barbs leave every
// stem forward at sixty degrees (the branching angle of hexagonal ice) on a
// regular pitch, longest at the base and shortest at the tip, so each stem is
// a leaf. Two scales interleave, ferns from neighbouring stems overlap into a
// solid margin, and a granular band closes the ice at the very edge. Between
// the barbs a faint crystalline haze fills the leaf, and the clear glass shows
// through wherever no crystal has reached. Where ice sits in front of a light
// the light blurs and scatters into a milky glow (the bokeh discs are analytic,
// so their softness simply grows under the ice), facets glint on and off as
// they turn to the light, and the stems creep inward and thaw back on a long
// cycle. Every so often a breath fogs a soft round patch of the clear glass
// with a grey droplet haze that clears again.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_reach;    // how far in from the edges the frost gets  (default 0.75)
uniform float u_speed;    // advance, thaw and twinkle speed           (default 1.0)
uniform float u_feather;  // finger length and raggedness of the front (default 1.0)
uniform float u_sparkle;  // crystalline glints and rib brightness     (default 1.0)
uniform float u_breath;   // strength of the breath fog patch         (default 0.8)

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// polynomial smooth minimum: rounds the corners of the edge-distance field
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 rot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// one family of fern dendrites growing in from one edge. x runs along the
// edge, v is the distance in from it, W the stem pitch, growth the length
// budget. Returns the crisp crystal mask and the soft haze inside each leaf.
vec2 ferns(float x, float v, float W, float growth, float seed, float px) {
  float crisp = 0.0, haze = 0.0;
  float kc = floor(x / W);
  for (int i = -1; i <= 1; i++) {
    float k  = kc + float(i);
    float h0 = hash21(vec2(k * 1.3, seed));
    float h1 = hash21(vec2(k * 2.1, seed + 3.7));
    float h2 = hash21(vec2(k * 0.7, seed + 9.1));
    float sx = (k + 0.5 + (h0 - 0.5) * 0.55) * W;          // stem foot
    float L  = growth * (0.55 + 0.9 * h2);                 // stem length
    // local frame: u across the stem, w along it, tilted about the foot
    vec2  l  = rot(vec2(x - sx, v), (h1 - 0.5) * 0.6);
    // stems bow gently to one side as they grow
    l.x -= (h2 - 0.5) * 0.9 * l.y * l.y;
    float sgn = sign(l.x);
    float u  = abs(l.x), w = l.y;
    float on = step(0.0, w) * step(w, L);
    float taper = 1.0 - w / max(L, 1e-3);
    // the stem, thick at the foot and needle-thin at the tip
    float ws   = W * 0.022 * (0.35 + 0.65 * taper);
    float stem = smoothstep(ws + px, ws - px * 0.5, u) * on;
    // barbs: forward-leaning lines at sixty degrees off the stem on a
    // regular pitch, each shortening toward the tip and a little ragged
    float sp = W * 0.11;
    // barbs curve forward as they run out, and the two sides alternate
    float bw = w - u * 0.577 - u * u * 1.6 + sgn * sp * 0.25 * step(0.5, h0);
    float j  = floor(bw / sp + 0.5);
    float wj = j * sp;
    float jh = hash21(vec2(j * 1.7 + sgn, k + seed));
    float Lb = W * 0.95 * smoothstep(L * 1.02, L * 0.12, wj) * (0.45 + 0.55 * jh) * step(0.12, jh);
    float along = u * 1.155;
    float bd   = abs(bw - wj) * 0.866;
    float bwid = ws * 0.55 * (1.0 - along / max(Lb, 1e-3)) + px * 0.35;
    float barb = smoothstep(bwid + px, bwid - px * 0.5, bd) * step(along, Lb) * step(0.0, wj) * step(wj, L);
    // barbules: a finer pitch of short spurs off the barbs
    float sp2 = sp * 0.33;
    float bw2 = w + u * 0.577;
    float j2  = floor(bw2 / sp2 + 0.5);
    float bd2 = abs(bw2 - j2 * sp2) * 0.866;
    float spur = smoothstep(px * 1.2, px * 0.2, bd2) * step(along, Lb * 0.8) * on * 0.40;
    crisp = max(crisp, max(stem, max(barb, spur)));
    // the leaf silhouette: a soft haze of crystals too fine to draw
    float Lw  = W * 0.95 * smoothstep(L * 1.02, L * 0.12, w);
    float env = smoothstep(Lw, Lw * 0.3, along) * on;
    haze = max(haze, env);
  }
  return vec2(crisp, haze);
}

// the blurred light field behind the glass: a dark street of bokeh discs.
// soft is the disc edge softness (0.2 sharp focus, 1 fully scattered)
vec3 lights(vec2 p, float aspect, float t, float soft, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float k  = float(i);
    float h0 = hash21(vec2(k * 3.1, 7.0));
    float h1 = hash21(vec2(k * 1.7, 19.0));
    float h2 = hash21(vec2(k * 5.3, 31.0));
    float h3 = hash21(vec2(k * 2.9, 43.0));
    vec2  c  = vec2((h0 - 0.5) * (aspect + 0.3), (h1 - 0.5) * 1.15);
    c += 0.02 * vec2(sin(t * 0.11 + k * 1.3), cos(t * 0.09 + k * 2.1));
    float rad = 0.06 + 0.16 * h2 * h2;
    float d   = length(p - c);
    // a bokeh disc: bright rim when in focus, melting to a blob when scattered
    float disc = smoothstep(rad + rad * soft, rad - rad * (0.3 + 0.7 * (1.0 - soft)) * 0.6, d);
    float rim  = smoothstep(rad * 0.55, rad * 0.98, d) * disc * (1.0 - soft) * 0.5;
    float glow = exp(-d * d / (rad * rad * (2.2 + 3.5 * soft))) * 0.20 / (1.0 + 1.5 * soft);
    vec3  col = (h3 < 0.25) ? c0 : (h3 < 0.5) ? c1 : (h3 < 0.75) ? c2 : c3;
    col = mix(col, vec3(1.0), 0.22);
    // scattering spreads the energy: dimmer core, wider skirt
    float amp = (0.70 + 0.50 * h2) * mix(1.0, 0.6, soft);
    acc += col * amp * (disc * (0.7 + rim) + glow);
  }
  return acc;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float pr     = max(u_pixelRatio, 1.0);
  vec2  q      = gl_FragCoord.xy / pr;                 // css px, for grain and glints
  float px     = 1.0 / u_resolution.y;                 // frame units per device px
  float tp     = u_time * clamp(u_speed, 0.0, 3.0);
  float reach  = clamp(u_reach, 0.0, 1.0);
  float feath  = clamp(u_feather, 0.0, 2.0);
  float spark  = clamp(u_sparkle, 0.0, 2.0);
  float breath = clamp(u_breath, 0.0, 1.0);

  // ---- edge-distance field of the pane, rounded at the corners
  float ex = min(uv.x, 1.0 - uv.x) * aspect;
  float ey = min(uv.y, 1.0 - uv.y);
  float e  = smin(ex, ey, 0.22);
  // which edge is nearest decides the finger direction: fingers grow inward,
  // so from the top and bottom they run vertically, from the sides across
  float wV = smoothstep(-0.12, 0.12, ex - ey);

  // ---- the growth cycle: stems creep inward, then slowly thaw back
  float cyc    = 0.5 + 0.5 * sin(tp * TAU / 56.0 - 0.37);
  float growth = reach * (0.15 + 0.31 * cyc) * (0.6 + 0.4 * feath);
  float unev   = vnoise(p * 3.5 + 71.0) * 0.6 + vnoise(p * 9.0 + 83.0) * 0.4;

  // ---- fern dendrites from each edge, two scales, top/bottom and sides
  float sideV = step(0.5, uv.y) * 10.0;
  float sideH = step(0.5, uv.x) * 10.0;
  vec2 fV  = ferns(p.x, ey, 0.17, growth,        1.0 + sideV, px);
  vec2 fV2 = ferns(p.x, ey, 0.075, growth * 0.55, 21.0 + sideV, px);
  vec2 fH  = ferns(p.y, ex, 0.17, growth,        41.0 + sideH, px);
  vec2 fH2 = ferns(p.y, ex, 0.075, growth * 0.55, 61.0 + sideH, px);
  vec2 fernV = max(fV, fV2);
  vec2 fernH = max(fH, fH2);
  vec2 fern  = mix(fernH, fernV, wV);
  float crisp = fern.x;
  float haze  = fern.y;

  // ---- the granular margin: solid ice at the very edge, patchy
  float G = e - growth * 0.30 - 0.03 * (unev - 0.5);
  float band  = smoothstep(0.006, -0.006, G);
  float thick = clamp(-G / 0.20, 0.0, 1.0);
  thick = sqrt(thick) * (0.55 + 0.6 * unev);
  // fresh crystal at the outer fringe of the growth
  float fresh = smoothstep(growth * 0.30, growth * 1.1, e);

  // total ice coverage and how solid it is
  float frost = clamp(band * (0.35 + 0.5 * thick) + crisp * 0.95 + haze * 0.30, 0.0, 1.0);
  float dend  = crisp;

  // ---- breath: a soft round fog patch that blooms and clears
  float bph  = fract(tp / 15.0 + 0.05);
  float bAmt = smoothstep(0.0, 0.10, bph) * (1.0 - smoothstep(0.22, 1.0, bph)) * breath;
  vec2  bc   = vec2(0.10, -0.14);
  float bd   = length((p - bc) * vec2(1.0, 1.25));
  float bR   = 0.26 + 0.10 * bAmt;
  float mist = smoothstep(bR, bR * 0.35, bd) * (0.8 + 0.4 * vnoise(p * 6.0 + tp * 0.1));
  mist = clamp(mist * bAmt * 0.7, 0.0, 1.0) * (1.0 - band * 0.6);

  // ---- the night behind the glass
  float soft  = 0.22 + 0.7 * max(clamp(band * (0.4 + 0.6 * thick) + haze * 0.5 + crisp * 0.4, 0.0, 1.0), mist * 0.9);
  vec3  night = mix(vec3(0.030, 0.036, 0.050), c3 * 0.14 + c0 * 0.02, 0.6);
  night *= 0.85 + 0.35 * (0.5 - uv.y);                // a little city glow low down
  vec3  L = lights(p, aspect, tp, soft, c0, c1, c2, c3);
  // soft-clip so two lights stacking never blow to flat white
  L = 1.0 - exp(-L * 1.15);
  vec3  glass = night + L;
  // clear glass carries a faint cold reflection gradient
  glass += c0 * 0.02 * (1.0 - uv.y);

  // ---- ice: dim blue-grey where nothing lights it from behind, milky where
  // it scatters a light, brightest on the crystal ribs and the fresh fringe
  vec3  iceTint = mix(vec3(0.78, 0.83, 0.92), normalize(c0 + c2 + 0.2) * 0.8, 0.22);
  float lum     = dot(L, vec3(0.299, 0.587, 0.114));
  float solid   = clamp(band * thick + haze * 0.5, 0.0, 1.0);
  vec3  ice     = iceTint * (0.08 + 0.10 * solid)
                + iceTint * dend * (0.16 + 0.16 * spark) * (0.6 + 0.6 * fresh)
                + L * (0.55 + 0.20 * solid) + iceTint * lum * 0.5;
  ice *= 0.85 + 0.3 * unev;
  // fine grain in the granular ice
  float grain = hash21(floor(q * 0.7)) - 0.5;
  ice += grain * 0.07 * band * thick;
  // glints: small facets turning to the light, twinkling on and off
  vec2  gc  = floor(q * 0.12);
  float gh  = hash21(gc);
  float gh2 = hash21(gc + 7.7);
  vec2  gf  = fract(q * 0.12) - 0.5 + (vec2(gh, gh2) - 0.5) * 0.5;
  float gdot = smoothstep(0.22, 0.03, length(gf));
  float tw   = 0.5 + 0.5 * sin(tp * (0.5 + 1.2 * gh2) + gh * TAU);
  float gl   = smoothstep(0.86, 1.0, gh * 0.5 + tw * 0.5) * gdot * step(0.72, gh2);
  ice += mix(vec3(1.0), c2, 0.3) * gl * 1.1 * spark * frost;

  // ---- breath fog: grey warm droplet haze over the clear glass
  vec3 fog = mix(vec3(0.52, 0.50, 0.50), c1, 0.15) * (0.28 + 0.5 * lum) + L * 0.45;
  fog += (hash21(floor(q * 0.5) + 3.0) - 0.5) * 0.10;

  vec3 col = glass;
  col = mix(col, fog, mist);
  col = mix(col, ice, frost * (0.75 + 0.25 * solid));

  gl_FragColor = vec4(col, 1.0);
}
