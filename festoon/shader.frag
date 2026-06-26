// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// festoon (Veil) — a single string of small triangular bunting pennants strung
// across the frame on a shallow diagonal: anchored high on the left edge and
// running low off the right. Dozens of crisp little flat-shaded SDF triangles,
// each in its own palette hue, hang from a barely-visible line while everything
// around them falls to near-black. A gust of flutter travels down the string,
// lifting and snapping each flag's free tip one after another and catching a
// bright flash at the peak of its flutter; between gusts the flags idle-sway.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four flag hues, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flagSize;   // CSS-px length of each pennant       (default 56)
uniform float u_gustSpeed;  // how fast flutter waves travel       (default 0.5)
uniform float u_flutter;    // amplitude of each flag's lift/snap  (default 0.5)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const int   NFLAGS    = 26;     // flags along the string (constant loop bound)
const float SLOPE     = 0.34;   // shallow diagonal: vertical drop per unit x

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// signed distance to a triangle with corners a,b,c (Inigo Quilez)
float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
  vec2 e0 = b - a, e1 = c - b, e2 = a - c;
  vec2 v0 = p - a, v1 = p - b, v2 = p - c;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = BG;

  // --- the string geometry, in device px ---
  // Anchored high-left, running low-right on a shallow diagonal across the frame.
  vec2  pA  = vec2(0.04 * res.x, 0.80 * res.y);   // left anchor (high)
  vec2  dir = normalize(vec2(1.0, -SLOPE));        // along-string direction
  float span = res.x * 1.04;                       // run off the right edge
  // span the string a little past both edges so end flags aren't clipped oddly
  pA -= dir * span * 0.03;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float flagLen = max(u_flagSize, 8.0) * refScale * pr;       // pennant length (CSS px)
  float flagHalf = flagLen * 0.42;                 // half-width at the top
  // spacing so NFLAGS flags fill the span with a small gap between them
  float spacing = span / float(NFLAGS);

  // perpendicular (downward-ish) direction the pennants hang toward
  vec2 down = vec2(-dir.y, dir.x);                 // rotate dir +90°
  if (down.y > 0.0) down = -down;                  // ensure it points downward

  // palette with house fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- the faint hanging line itself ---
  // distance from this pixel to the string line (only the on-span portion)
  vec2  rel  = fc - pA;
  float alng = dot(rel, dir);
  vec2  onLine = pA + dir * clamp(alng, 0.0, span);
  float dLine = length(fc - onLine);
  float lineGlow = (1.0 - smoothstep(0.0, 1.6 * pr, dLine)) * 0.30;
  float onSpan = step(0.0, alng) * step(alng, span);
  col += vec3(0.55, 0.58, 0.66) * lineGlow * onSpan;

  // gust phase: a wave of flutter that travels from the anchored (left) end
  // off the right edge on a continuously advancing phase.
  float gustPhase = t * u_gustSpeed;

  // accumulate the nearest flags' contributions (check a few neighbours)
  for (int i = 0; i < NFLAGS; i++) {
    float fi = float(i) + 0.5;
    // attach point of flag i along the string
    float s0 = fi * spacing;
    vec2  attach = pA + dir * s0;

    // per-flag idle sway + the traveling gust envelope.
    // gust runs as a moving bump in along-string coordinate; index position is
    // fi/NFLAGS in 0..1 from the anchored end.
    float u = fi / float(NFLAGS);
    // a soft pulse that sweeps u from 0 toward 1 as gustPhase advances; every
    // ~2π it repeats but the phase never resets (continuous), and a fresh gust
    // overlaps the tail of the last so the chain is never fully still.
    float gx = fract(gustPhase * 0.5 - u);            // 0 at the gust front
    float gust = exp(-gx * gx * 26.0) + 0.55 * exp(-pow(gx - 0.5, 2.0) * 60.0);
    gust *= step(0.001, u_gustSpeed) * u_gustSpeed;   // no travel at speed 0

    // gentle independent idle sway so flags are never perfectly still
    float idle = sin(t * (0.9 + 0.27 * fi) + fi * 1.7) * 0.5 + 0.5;
    idle = (idle - 0.5) * 0.5;

    // flutter amount for this flag at this instant: idle + gust kick
    float flut = u_flutter * (0.28 * idle + 1.2 * gust);

    // flag-local frame: e = along-string position of the free tip below attach
    // The pennant is a downward triangle. Its two top corners sit on the line,
    // its tip hangs at depth flagLen below the midpoint. Flutter lifts & curls
    // the free tip sideways (along the string) and slightly up.
    float topGap = spacing * 0.10;                    // small gap between flags
    float halfW  = min(flagHalf, (spacing - topGap) * 0.5);

    vec2 topL = attach - dir * halfW;
    vec2 topR = attach + dir * halfW;
    // tip: base hang + flutter lift (up = -down) + lateral curl (along dir)
    float lift  = flut * flagLen * 0.55;              // how much the tip rises
    float curl  = flut * flagLen * 0.6 * sin(t * 3.0 + fi); // sideways snap
    vec2 tip = attach + down * (flagLen - lift) + dir * curl;

    float sd = sdTriangle(fc, topL, topR, tip);

    // antialiased fill (1 inside, fading at the edge)
    float fill = 1.0 - smoothstep(-1.2 * pr, 1.2 * pr, sd);
    if (fill <= 0.0001) continue;

    // per-flag hue: walk the palette wheel along the string
    float kk = fi * 0.37;
    float sw = fract(kk) * 4.0;
    float w0 = wheelW(sw, 0.0), w1 = wheelW(sw, 1.0), w2 = wheelW(sw, 2.0), w3 = wheelW(sw, 3.0);
    vec3  hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

    // flat shading with a subtle vertical gradient (brighter toward the line)
    float depth = clamp(dot(fc - attach, down) / flagLen, 0.0, 1.0);
    float shade = mix(1.0, 0.55, depth);

    // brightness flash at the peak of the flutter — a bright catch on the crest
    float flash = clamp(gust, 0.0, 1.0);
    vec3 body = hue * shade * (0.85 + 1.1 * flash);

    col = mix(col, body, fill * 0.95);

    // crisp rim glow on the edges and a small bloom that intensifies on flutter
    float edge = (1.0 - smoothstep(0.0, 2.2 * pr, abs(sd)));
    col += hue * edge * (0.18 + 0.5 * flash);
    float bloom = exp(-max(sd, 0.0) / (flagLen * 0.10));
    col += hue * bloom * (0.05 + 0.35 * flash);
  }

  // gentle vignette to settle the corners into the dark
  vec2 q = (fc - res * 0.5) / res;
  float vign = 1.0 - smoothstep(0.45, 1.0, length(q) * 1.25);
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
