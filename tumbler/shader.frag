// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// tumbler (Kaleido) — the feel of turning the tube: angular glass shards in the
// object cell that each tumble on their own axis while the mirror-fold reflects
// them. As the shards rotate and slide the reflected figure keeps re-locking
// into new symmetric arrangements — the characteristic "click and reshuffle" of
// a kaleidoscope being turned. Hard-edged chips of colour on near-black.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_segments;     // mirror-fold count          (default 7)
uniform float u_tumbleSpeed;  // per-shard tumble rate       (default 1.0)
uniform float u_shardScale;   // shard size                  (default 1.0)
uniform float u_rotateSpeed;  // whole-tube rotation         (default 0.12)

const vec3 BG = vec3(0.032, 0.032, 0.041);

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 palBlend(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float h) {
  float s = fract(h) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

// signed distance to a square chip (rotated, half-size hs)
float sdBox(vec2 p, float hs) { vec2 d = abs(p) - hs; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

void main() {
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float mn  = min(res.x, res.y);
  vec2  p   = (gl_FragCoord.xy - ctr) / mn;
  float t   = u_time;

  float r   = length(p);
  float a   = atan(p.y, p.x);
  float N   = max(floor(u_segments), 2.0);
  float seg = 6.2831853 / N;
  a += t * u_rotateSpeed;
  a  = mod(a, seg);
  a  = abs(a - seg * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // shard lattice in the folded space; each cell holds a chip tumbling on its own axis
  float cs = mix(5.5, 2.4, clamp((u_shardScale - 0.4) / 2.1, 0.0, 1.0)); // cells across
  vec2  g  = q * cs;
  g += vec2(sin(t * 0.1) * 0.3, t * 0.16);   // slow slide through the cell

  vec2 id = floor(g);
  vec3  csum = vec3(0.0);
  float wsum = 0.0;
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2  cid = id + vec2(float(ox), float(oy));
      float h   = hash21(cid);
      // chip centre wobbles; chip tumbles (rotates) at a per-chip rate
      vec2  cc  = cid + 0.5 + 0.18 * vec2(sin(t * 0.4 + h * 6.3), cos(t * 0.33 + h * 4.1));
      float ang = (h - 0.5) * 6.2831853 + t * u_tumbleSpeed * (0.6 + h) * (h < 0.5 ? 1.0 : -1.0);
      float ca = cos(ang), sa = sin(ang);
      vec2  lp = mat2(ca, -sa, sa, ca) * (g - cc);
      float hs = 0.22 + 0.16 * h;
      float d  = sdBox(lp, hs);
      float chip = smoothstep(0.06, 0.0, d);        // hard-ish chip body
      float edge = smoothstep(0.05, 0.0, abs(d));   // bright cut edge
      float w  = chip;
      csum += palBlend(c0, c1, c2, c3, h * 1.8 + t * 0.02) * (chip + edge * 0.7);
      wsum += w;
    }
  }
  vec3  shards = csum / max(wsum, 0.001);
  float cover  = min(wsum, 1.0);

  vec3 col = BG;
  col += shards * cover * 1.3;

  // luminous core, dark rim
  col *= smoothstep(1.2, 0.05, r);
  col += palBlend(c0, c1, c2, c3, 0.3 + t * 0.05) * exp(-r * r * 70.0) * 0.22;

  gl_FragColor = vec4(col, 1.0);
}
