// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// wildfire (Smolder) — REFRAMED COSMIC: an emission nebula rather than a fire.
// The magenta/cyan ragged spreading perimeters that always read as nebular gas
// are now exactly that — slow expanding ionization shells lit warm-to-cool across
// their stroke, with brighter star-forming knots strung along them. They float
// over a luminous palette-tinted gas field threaded by dark dust lanes (two
// large-scale colour regions, pink and blue), and a multi-layer twinkling
// starfield sits on top; the brightest stars halo into spikes through post bloom.
// The interiors the shells have swept read as denser glowing gas pockets, so each
// "blob" is a filled cloud with a bright rim. The cool magenta/cyan palette is the
// feature here (this piece goes cosmic, not warm-ember like its Smolder siblings).
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device px, (0,0) when absent — unused
//   u_pixelRatio  devicePixelRatio of the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spreadRate;   // how fast each gas shell dilates outward (default 0.15)
uniform float u_lineWidth;    // stroke width of the glowing shell, css px, scaled by u_pixelRatio (default 8)
uniform float u_knotIntensity;// brightness boost of the star-forming knots along the shells; 0 evens them (default 0.8)
uniform float u_terrainDrag;  // how strongly turbulence distorts the shells; 0 = clean rings (default 0.55)
uniform float u_starDensity;  // how many stars populate the field, 0..1 (default 0.5)
uniform float u_gasAmount;    // brightness/coverage of the nebula gas field, 0..1.5 (default 0.9)

const vec3  BG  = vec3(0.018, 0.016, 0.030); // deep-space near-black
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// smooth value noise (C1)
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave fbm, rotated per octave; range ~[0,0.95], mean ~0.5
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.616, 1.214, -1.214, 1.616);
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = m * p + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// Each shell lives on its own cycle. Born tight at phase 0, it dilates
// monotonically; once swollen past the frame corners it is invisible and its slot
// re-ignites at a fresh hash-chosen point. `vis` fades it in from birth and out
// once huge, hiding the birth pop and the retire crossfade.
float vis(float ph) {
  float born = smoothstep(0.0, 0.06, ph);
  float gone = 1.0 - smoothstep(0.80, 1.0, ph);
  return born * gone;
}

// One expanding ionization shell. Returns the additive gas-shell contribution and
// accumulates the swept-interior coverage via `swept` (used to fill the cloud body
// with denser glowing gas). `slot` selects an independent origin + cycle phase.
vec3 shellLayer(vec2 fragPx, float slot, float phase, float vw,
                vec3 c0, vec3 c1, vec3 c2, vec3 c3,
                float linePx, float dragAmp, float knot,
                float t, float pr, vec2 res, inout float swept) {
  // origin: hash-chosen from `slot`, which the caller bumps by the cycle index
  // each re-ignition so a slot lights somewhere new every cycle.
  vec2 hp = vec2(slot * 13.7 + 2.3, slot * 5.1 - 1.9);
  vec2 ign = vec2(hash21(hp), hash21(hp + 9.31));
  ign = mix(vec2(0.22), vec2(0.78), ign) * res;

  vec2 d = (fragPx - ign) / max(pr, 0.25);
  float r = length(d) / 90.0;            // ~screens of radius
  float ang = atan(d.y, d.x);

  // turbulence: low-freq FBM keyed to angle + radius so the shell bulges and
  // stalls. Static per slot (contour fixed; only the threshold rises).
  vec2 q = vec2(cos(ang), sin(ang)) * (r * 1.4) + vec2(slot * 3.1, -slot * 2.2);
  float terr = (fbm(q * 1.7 + 4.0) - 0.5) * dragAmp;
  float fieldVal = r + terr;

  float thr = phase * 2.4;               // current shell radius
  float sd = fieldVal - thr;             // signed dist to shell (>0 outside)

  float linU = linePx / (pr * 90.0);
  float lh = max(linU, 0.004);

  // ---- swept interior: the gas the shell has passed through (cloud body).
  float inside = smoothstep(lh * 0.4, -lh * 0.6, sd);
  swept = max(swept, inside * vw);

  // ---- the incandescent shell stroke, graded across its width.
  // u: 0 at the leading (outer) edge, 1 at the trailing inner side. c3 -> c1 -> c0 -> c2.
  float u = clamp(-sd / lh * 0.5 + 0.5, 0.0, 1.0);
  float on = exp(-(sd * sd) / (lh * lh)); // gaussian stroke, AA by construction
  vec3 ramp = c3;
  ramp = mix(ramp, c1, smoothstep(0.10, 0.40, u));
  ramp = mix(ramp, c0, smoothstep(0.40, 0.68, u));
  ramp = mix(ramp, c2, smoothstep(0.68, 0.98, u));

  // star-forming knots: brighter beads strung along the shell, drifting slowly.
  float knr = vnoise(vec2(ang * 2.4 + slot * 4.0, t * 0.25 + slot))
            * 0.65
            + vnoise(vec2(ang * 6.1 - slot * 2.0, t * 0.15 + slot * 3.0)) * 0.35;
  float kn = smoothstep(0.58, 0.90, knr);
  float knotBoost = 1.0 + knot * (3.2 * kn - 0.5 * (1.0 - kn));

  float crest = exp(-(sd * sd) / (lh * lh * 0.10)); // bright thread at the crest

  // shells dim a touch as they grow huge so an old broad loop reads fainter.
  float ageDim = mix(1.05, 0.62, smoothstep(0.15, 0.95, phase));

  vec3 col = vec3(0.0);
  col += ramp * on * 0.95 * knotBoost * ageDim;
  col += (c3 * 0.7 + c2 * 0.3) * crest * (0.45 + 0.6 * kn) * ageDim;

  // ionization glow bleeding just outside the shell into the surrounding gas
  float ahead = max(sd, 0.0);
  float halo = 0.22 * exp(-ahead / (lh * 1.6));
  col += (c1 * 0.6 + c2 * 0.4) * halo * ageDim;

  return col * vw;
}

// Multi-layer twinkling starfield. Tight cores so cells never read boxy; the
// brightest stars halo into spikes through the post bloom pass.
vec3 starField(vec2 p, float t, float density, vec3 cwarm, vec3 ccool) {
  vec3 acc = vec3(0.0);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float scale = 16.0 + fl * 30.0;            // cell size in css px
    vec2 cp = p / scale;
    vec2 cell = floor(cp);
    vec2 f = fract(cp);
    float h = hash21(cell + fl * 41.3);
    float thr = 1.0 - clamp(density, 0.0, 1.0) * (0.16 - fl * 0.03);
    float present = step(thr, h);
    vec2 sp = vec2(hash21(cell + fl + 1.7), hash21(cell + fl * 2.0 + 4.3));
    float dd = length(f - sp);
    float bright = hash21(cell + fl * 7.0 + 9.1);
    float sz = 110.0 + bright * 240.0 - fl * 22.0; // core tightness
    float core = exp(-dd * dd * sz);
    float tw = 0.55 + 0.45 * sin(t * (1.2 + bright * 3.5) + h * 40.0);
    vec3 sc = mix(ccool, cwarm, bright * bright);  // most cool-white, a few warm
    acc += sc * core * present * tw * (0.4 + 1.2 * bright);
  }
  return acc;
}

void main() {
  float pr  = max(u_pixelRatio, 0.25);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = max(u_resolution.xy, vec2(1.0));
  vec2  cssP = fc / pr;
  float t   = u_time;

  float linePx = max(u_lineWidth, 1.0) * pr;
  float drag   = clamp(u_terrainDrag, 0.0, 1.0) * 0.9;
  float knot   = clamp(u_knotIntensity, 0.0, 1.5);
  float rate   = max(u_spreadRate, 0.001) * 0.06; // cycles/sec scaler
  float gasAmt = clamp(u_gasAmount, 0.0, 1.5);

  // ---- palette with house fallback (headless contexts can zero the array)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // ---- nebula gas field: luminous palette-tinted FBM filling the frame.
  // Slow drift so the gas breathes without the rings moving.
  vec2 gp = cssP + vec2(8.0, -5.0) * t * 0.6;
  float g1 = fbm(gp / 260.0 + 1.7);
  float g2 = fbm(gp / 110.0 + 8.0);
  float g3 = fbm(gp /  44.0 + 3.0);
  float gas = g1 * 0.5 + g2 * 0.35 + g3 * 0.15;       // ~0..0.9
  gas = smoothstep(0.18, 0.95, gas);                  // lift contrast, kill flat murk
  // two large-scale colour regions: a pink/magenta zone and a blue zone, with
  // teal highlights riding the densest knots.
  float zone = fbm(cssP / 360.0 + 20.0);
  vec3 gasCol = mix(c1, c0, smoothstep(0.34, 0.66, zone));
  gasCol = mix(gasCol, c3, smoothstep(0.45, 0.85, g2) * 0.35); // magenta cores
  gasCol = mix(gasCol, c2, smoothstep(0.70, 0.98, g3) * 0.40); // teal highlights
  // dark dust lanes: a separate FBM carves filamentary obscuration through the gas.
  float dust = smoothstep(0.52, 0.82, fbm(cssP / 150.0 + 40.0));
  vec3 col = BG + gasCol * gas * gasAmt * (1.0 - 0.62 * dust);

  // ---- three expanding ionization shells on staggered cycles (the ragged blobs).
  float base = t * rate;
  float p0 = fract(base + 0.00), p1 = fract(base + 0.34), p2 = fract(base + 0.67);
  float k0 = floor(base + 0.00), k1 = floor(base + 0.34), k2 = floor(base + 0.67);
  float v0 = vis(p0), v1 = vis(p1), v2 = vis(p2);

  float swept = 0.0;
  vec3 shells = vec3(0.0);
  shells += shellLayer(fc, 1.7 + k0 * 3.1, p0, v0, c0, c1, c2, c3, linePx, drag, knot, t, pr, res, swept);
  shells += shellLayer(fc, 8.3 + k1 * 3.1, p1, v1, c0, c1, c2, c3, linePx, drag, knot, t, pr, res, swept);
  shells += shellLayer(fc, 4.9 + k2 * 3.1, p2, v2, c0, c1, c2, c3, linePx, drag, knot, t, pr, res, swept);

  // swept interiors read as denser glowing gas pockets (filled clouds, bright rim)
  col += (c1 * 0.5 + c0 * 0.3 + c2 * 0.2) * swept * 0.22 * gasAmt;
  col += shells;

  // ---- starfield on top; brightest stars bloom into spikes via post.
  col += starField(cssP, t, u_starDensity, vec3(1.0, 0.92, 0.82), c2 * 0.7 + vec3(0.5));

  // gentle vignette to seat the field in the dark frame
  vec2 uv = fc / res;
  col *= 1.0 - 0.34 * smoothstep(0.40, 1.12, length(uv - 0.5) * 1.42);

  // soft filmic rolloff keeps the hottest knots/stars from clipping flat
  col = col / (1.0 + col * 0.42);

  // tiny dither to keep long gas gradients band-free
  col += (hash21(fc + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(col, 1.0);
}
