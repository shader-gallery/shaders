// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// anemone (Bloom) — a FIELD of sea-anemone organisms filling the frame rather
// than one bloom floating in black. Each is a ring of soft tentacle lobes built
// from polar petal SDFs, rim-lit with a warm core, breathing open and closed on a
// long eased cycle with the contraction rippling around the ring; tips sway and
// can spiral via a twist. Blooms are scattered on a jittered grid at varied sizes,
// lobe counts, breath phases and palette rotations, overlapping into a dense
// translucent anemone bed. All motion is sinusoidal — it loops with no reset.
//
// Uniforms provided by the runtime:
//   u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_breathSpeed;  // rate of the open/close easing cycle      (default 0.6)
uniform float u_bloomSize;    // base bloom radius in css px              (default 150)
uniform float u_lobeCount;    // base tentacle lobe count, floored        (default 13)
uniform float u_density;      // how densely the field packs, 0..1        (default 0.6)
uniform float u_twist;        // spiral twist of the tentacles            (default 0.3)

const vec3  BG     = vec3(0.020, 0.020, 0.028);
const float TWO_PI = 6.28318530718;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// one anemone organism centred at the origin of p (device px). Returns its
// additive colour contribution. `reach` is the open tentacle length in px.
vec3 anemoneBloom(vec2 p, float reach, float lobes, float breathPh, float twist,
                  float hueOff, float t, float bs, float pr,
                  vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float ang = atan(p.y, p.x);
  float r   = length(p);
  if (r > reach * 1.15) return vec3(0.0);            // cheap bound

  lobes = max(floor(lobes + 0.5), 3.0);

  float breath = 0.5 - 0.5 * cos(t * bs * 0.55 + breathPh);
  breath = breath * breath * (3.0 - 2.0 * breath);

  float a01     = ang / TWO_PI + 0.5;
  float lobePos = a01 * lobes;
  float lobeId  = floor(lobePos);

  float ripplePh = lobeId / lobes * TWO_PI;
  float ripple   = 0.5 - 0.5 * cos(t * bs * 0.55 + breathPh - ripplePh);
  ripple = ripple * ripple * (3.0 - 2.0 * ripple);
  float open = mix(breath, ripple, 0.55);

  float reachM0 = mix(0.42, 1.0, open);
  float reachPx = reach * reachM0;
  float lobeHalf = (TWO_PI / lobes) * 0.5;

  float sway = sin(t * bs * 0.32 + lobeId * 1.7) * lobeHalf * 0.35;

  float lobeC = (lobeId + 0.5) / lobes;
  // gentle per-lobe variation so the tentacles aren't an identical rigid pinwheel
  float lhash  = hash21(vec2(lobeId, floor(hueOff * 6.0) + 3.0));
  float lhash2 = hash21(vec2(lobeId, floor(hueOff * 6.0) + 11.0));
  float reachL = reachPx * mix(0.85, 1.12, lhash);   // slightly uneven lengths
  float rN    = r / max(reachL, 1.0);
  // soft twist + a subtle per-lobe wave so each arm curls a touch differently
  float dAng  = (a01 - lobeC);
  dAng -= floor(dAng + 0.5);
  dAng = dAng * TWO_PI + sway + rN * twist * 1.6
       + sin(rN * 3.6 + lobeId * 1.7) * 0.10;

  float perp   = abs(sin(dAng)) * r;
  float reachM = 1.0 - smoothstep(0.90, 1.05, rN);

  float gapPx   = lobeHalf * reachL;
  float fat     = sin(clamp(rN, 0.0, 1.0) * 3.14159265);
  float widthPx = gapPx * (0.16 + 0.80 * fat) * mix(0.86, 1.16, lhash2);
  float aa      = 2.0 * pr;

  float sideM = (1.0 - smoothstep(widthPx - aa, widthPx + aa, perp)) * reachM;
  float baseM = smoothstep(0.06, 0.20, rN);
  float body  = sideM * baseM;
  float across = perp / max(widthPx, 1e-3);

  float rim = smoothstep(0.45, 0.98, across) * sideM
            + smoothstep(0.74, 1.0, rN) * reachM * sideM;

  float s  = fract(lobeC + hueOff + t * 0.01) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  hue = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
  float lum = dot(hue, vec3(0.299, 0.587, 0.114));
  vec3  lobeCol = mix(hue, mix(hue, vec3(lum), 0.72), smoothstep(0.15, 1.0, rN));

  float swell = mix(0.45, 1.0, open);
  vec3  col = vec3(0.0);
  col += lobeCol * body * 0.42 * swell;
  col += lobeCol * rim  * 0.85 * swell;

  float bloom = reachM * (1.0 - smoothstep(0.10, 1.0, rN))
              * exp(-(perp * perp) / (widthPx * widthPx * 1.8 + 1.0));
  col += lobeCol * bloom * 0.20 * swell;

  vec3  warm = normalize(c0 + c3 * 1.4 + vec3(0.25, 0.12, 0.04)) * 1.2;
  float core = exp(-r * r / (reach * reach * 0.08));
  col += warm * core * mix(0.08, 0.22, breath);
  return col;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float bs    = u_breathSpeed;
  float baseR = max(u_bloomSize, 20.0) * pr;
  float lobeN = max(u_lobeCount, 3.0);
  float dens  = clamp(u_density, 0.0, 1.0);
  float twist = u_twist;

  // jittered grid of blooms; denser packing shrinks the cell. Blooms reach ~85%
  // of a cell so neighbours overlap into a continuous anemone bed.
  float cell = baseR * mix(2.1, 1.15, dens);
  vec2  g    = fc / cell;
  vec2  baseCell = floor(g);

  vec3 col = BG;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 cid = baseCell + vec2(float(dx), float(dy));
      float h0 = hash21(cid + 0.5);
      float h1 = hash21(cid + 9.1);
      float h2 = hash21(cid + 17.7);
      float h3 = hash21(cid + 23.3);
      float h4 = hash21(cid + 31.9);
      vec2 center = (cid + vec2(0.25 + 0.5 * h0, 0.25 + 0.5 * h1)) * cell;
      float reach = cell * (0.68 + 0.42 * h2);
      float lobes = lobeN + floor(h3 * 6.0) - 2.0;
      float bph   = h4 * TWO_PI;
      float hoff  = h0 * 4.0;
      col += anemoneBloom(fc - center, reach, lobes, bph, twist, hoff, t, bs, pr,
                          c0, c1, c2, c3);
    }
  }

  // gentle vignette + soft tonemap so overlapping blooms don't clip flat
  float vign = 1.0 - smoothstep(0.62, 1.30, length((fc - res * 0.5) / res));
  col *= mix(0.82, 1.0, vign);
  col = col / (col + vec3(0.65)) * 1.5;

  gl_FragColor = vec4(col, 1.0);
}
