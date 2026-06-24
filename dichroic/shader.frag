// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// dichroic (Kaleido) — dichroic glass: the mirror-fold sampled at a slightly
// different angle per colour channel, so every reflected edge splits into an
// oil-slick iridescence — cyan on one side, magenta on the other. Concentric
// shard bands rotate through the wedge; where they cross the seams the colour
// fringes flare. Jewel-bright, restless, prismatic on near-black.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_segments;  // mirror-fold count       (default 8)
uniform float u_split;     // chromatic split amount  (default 1.0)
uniform float u_spin;      // shard rotation speed     (default 0.2)
uniform float u_bands;     // shard band density       (default 5)

const vec3 BG = vec3(0.033, 0.033, 0.042);

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 palBlend(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float h) {
  float s = fract(h) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

// scalar field of the folded shard pattern at a given channel-angle offset
float shardField(vec2 p, float angOff, float N, float bands, float t, float spin) {
  float r   = length(p);
  float a   = atan(p.y, p.x) + angOff;
  float seg = 6.2831853 / N;
  a += t * spin;
  a  = mod(a, seg);
  a  = abs(a - seg * 0.5);
  // concentric shard bands that swirl: radius modulated by the folded angle
  float band = sin((r * bands - a * 2.0) * 6.2831853 - t * 0.6);
  float seam = exp(-a * a * 30.0);          // bright mirror seam
  return smoothstep(-0.2, 0.9, band) * smoothstep(1.1, 0.05, r) + seam * 0.5 * smoothstep(0.9, 0.05, r);
}

void main() {
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float mn  = min(res.x, res.y);
  vec2  p   = (gl_FragCoord.xy - ctr) / mn;
  float t   = u_time;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float N     = max(floor(u_segments), 2.0);
  float bands = max(u_bands, 0.5);
  // per-channel angular offset → dichroic split. Offset scales with 1/N so the
  // fringe stays a constant visual width regardless of fold count.
  float off = u_split * 0.06 / N * 6.2831853;

  float fr = shardField(p, -off, N, bands, t, u_spin);
  float fg = shardField(p,  0.0, N, bands, t, u_spin);
  float fb = shardField(p,  off, N, bands, t, u_spin);

  // base glass hue from the green (centre) sample; the R/B offsets fringe it
  vec3 base = palBlend(c0, c1, c2, c3, length(p) * 0.8 + atan(p.y, p.x) * 0.08 + t * 0.04);

  vec3 col = BG;
  // compose: each channel weighted by its own folded field → iridescent edges
  col += base * fg;
  // dichroic fringe: push red/blue apart where the fields disagree
  col.r += (fr - fg) * 0.7 * (0.5 + 0.5 * base.r);
  col.b += (fb - fg) * 0.7 * (0.5 + 0.5 * base.b);
  col.g += (0.5 * (fr + fb) - fg) * 0.25;

  // luminous core, dark rim
  float r = length(p);
  col *= smoothstep(1.16, 0.04, r);
  col += palBlend(c0, c1, c2, c3, 0.4 + t * 0.05) * exp(-r * r * 65.0) * 0.28;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
