// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// rosace (Burnish) — a rose-engine guilloché, the lathe-turned ornament cut into
// watch dials and banknote medallions. Two families of concentric rosette curves
// (radius modulated by cos(petals*angle), each ring's phase advancing with radius
// so the lobes precess into a spirograph weave) are engraved as fine bright
// hairlines into a dark burnished-metal ground. Where the two families cross, the
// lines interleave into the dense moiré barleycorn texture guilloché is prized
// for. The whole rose turns on its lathe slowly while the lobe phases drift, so
// the engraving shimmers and breathes without ever reading frozen or wrapping —
// the engine still cutting. Sibling of guilloche's linear wave-braid: same craft,
// the circular rose-engine instead of the straight-line machine.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four engraving glint colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_petals;     // lobes per rosette ring                      (default 11)
uniform float u_lineFreq;   // concentric line spacing (rings per ref)     (default 26)
uniform float u_waveAmp;    // depth of the rosette lobes, 0..1            (default 0.5)
uniform float u_turnSpeed;  // lathe rotation + phase-drift rate           (default 0.3)

const vec3  BG    = vec3(0.034, 0.034, 0.043); // dark burnished alloy ~#09090B
const float TAU   = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}
vec3 palWheel(float s, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  s = fract(s) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 1e-3);
}

// one rosette line-family: thin bright hairlines along the contours of
// (radius modulated by a cos lobe whose phase precesses with radius). Returns a
// 0..1 engraved-line coverage plus, via `crest`, how close to a line crest we
// are (for the metallic glint).
float rosette(float r, float ang, float petals, float freq, float amp,
              float twist, float phase, out float crest) {
  // radius pushed in/out by the petal lobe; the lobe phase precesses with r so
  // successive rings rotate → the spirograph weave rather than nested circles.
  float lobe = amp * 0.5 * cos(petals * ang + r * twist + phase);
  float u    = (r * (1.0 + lobe)) * freq;     // line coordinate
  float fw   = fract(u);
  float tri  = abs(fw - 0.5) * 2.0;           // 0 at a line crest → 1 mid-gap
  crest = tri;
  // hairline: bright right at the crest, sharp falloff. AA via fwidth-free
  // smoothstep tied to the local line pitch.
  return 1.0 - smoothstep(0.06, 0.16, tri);
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float mn  = min(res.x, res.y);
  float t   = u_time;

  // palette + house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // off-centre composition: bias the rose's hub up-and-left of dead centre so
  // the medallion reads composed, not a symmetric target.
  vec2  hub = ctr + vec2(-0.10 * mn, 0.07 * mn);
  vec2  v   = fc - hub;
  // normalise radius to the frame so the rose fills the frame at any resolution
  float r   = length(v) / (0.5 * mn);
  float ang = atan(v.y, v.x);

  float petals = max(u_petals, 2.0);
  // P0-C: line spacing is a feature count across the frame, resolution-stable.
  float freq   = max(u_lineFreq, 4.0);
  float amp    = clamp(u_waveAmp, 0.0, 1.0);
  float spin   = t * u_turnSpeed;

  // two rosette families with different petal counts + counter-twist; they cross
  // into the dense guilloché moiré. The lathe turns (ang offset) while the lobe
  // phases drift, so the engraving shimmers continuously.
  float crestA, crestB;
  float lineA = rosette(r, ang + spin * 0.25, petals,        freq,
                        amp, 5.0,  spin * 1.3,       crestA);
  float lineB = rosette(r, ang - spin * 0.18, petals + 4.0,  freq * 1.07,
                        amp * 0.8, -3.5, -spin * 0.9 + 2.1,  crestB);

  // engraving coverage: either family's hairline cuts the metal
  float engrave = max(lineA, lineB);
  // where both families cross, the cut is deepest → brightest barleycorn nodes
  float weave   = lineA * lineB;

  // metallic glint: the crest of each line catches lamplight; sharpen for a
  // burnished specular highlight that rolls as the rose turns.
  float crest = max(1.0 - crestA, 1.0 - crestB);
  float glint = pow(crest, 4.0);

  // hue rolls slowly with radius + angle so the rings read through the palette
  // like light refracting off engine-turned metal (restrained, position-driven)
  float hue   = r * 1.6 + ang / TAU + t * 0.02;
  vec3  metal = palWheel(hue, c0, c1, c2, c3);
  // a burnished silver-white for the brightest crests so it reads as cut metal
  vec3  silver = vec3(0.86, 0.89, 0.96);

  // dark burnished ground with a faint radial sheen so the plate isn't flat black
  float sheen = 0.5 + 0.5 * cos(ang * 2.0 - spin + r * 3.0);
  vec3  col   = BG + metal * 0.025 * sheen;

  // lay the engraving: tinted hairlines, brighter glinting crests, hottest at the
  // barleycorn crossings
  col += metal  * engrave * 0.42;
  col += mix(metal, silver, 0.6) * engrave * glint * 0.55;
  col += silver * weave * glint * 0.5;

  // a small bright boss at the rose hub (the lathe centre), off-centre with it
  float boss = exp(-r * r * 26.0);
  col += mix(metal, silver, 0.5) * boss * 0.5;

  // soft-knee tone map keeps the brightest glints from clipping
  col = BG + (1.0 - exp(-(col - BG) * 1.25));

  // composed vignette, darker toward the corners
  float vig = 1.0 - 0.5 * smoothstep(0.55, 1.25, length(v) / (0.5 * mn));
  col = BG + (col - BG) * vig;

  // ~1-LSB dither to break banding on the smooth ground sheen
  col += (hash21(fc) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
