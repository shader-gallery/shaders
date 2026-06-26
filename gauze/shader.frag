// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// gauze (Strand) - a node network seen through a shallow depth of field. Glow
// nodes are scattered through depth and linked by hairline threads; only the
// nodes near the focal plane resolve to sharp points, while those nearer or
// farther swell into soft out-of-focus bokeh discs - big and faint, the energy
// spread thin. The focal plane racks slowly back and forth so the web breathes
// in and out of focus, different strands sharpening as others bloom. Open
// threads only; the field between them is left to the soft glow.
// (ASCII-only comments: the headless poster compiler is fussy about apostrophes.)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_cell;     // node grid spacing, css px            (default 78)
uniform float u_focus;    // focal-plane depth, 0..1               (default 0.5)
uniform float u_dof;      // out-of-focus bokeh swell              (default 1.0)
uniform float u_rack;     // focus rack speed                      (default 0.4)
uniform float u_reach;    // thread proximity reach                (default 1.3)
uniform float u_nodeSize; // sharp node radius                     (default 1.0)
uniform float u_hue;      // hue spread across the field           (default 1.0)

const vec3  BG       = vec3(0.035, 0.035, 0.043);
const float NODE_CSS = 2.1;
const float LINE_CSS = 1.4;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

// node screen position for a cell: jittered anchor circled on a slow hashed orbit
vec2 nodePos(vec2 cid, float spacing, float t) {
  vec2 h  = hash2(cid);
  vec2 h2 = hash2(cid + 19.0);
  vec2 anchor = (cid + 0.25 + 0.5 * h) * spacing;
  float per = mix(14.0, 36.0, h2.x);
  float ang = t * (6.2831853 / per) + h2.y * 6.2831853;
  return anchor + vec2(cos(ang), sin(ang)) * spacing * 0.18;
}
float nodeDepth(vec2 cid) { return hash2(cid + 7.0).x; }   // 0..1 depth of the node

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float spacing = max(u_cell, 18.0) * refScale * pr;
  float nodeR   = NODE_CSS * pr * max(u_nodeSize, 0.1);
  float lw      = LINE_CSS * pr;
  float blurMax = spacing * 0.55 * max(u_dof, 0.0);

  // focal plane racks slowly back and forth through depth (phase-continuous)
  float focus = clamp(u_focus + 0.42 * sin(t * u_rack * 0.5), 0.02, 0.98);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 baseId = floor(fc / spacing);
  vec3 acc = vec3(0.0);

  // --- bokeh discs over a 5x5 neighbourhood (discs can swell well past a cell).
  for (int j = 0; j < 5; j++) {
    for (int i = 0; i < 5; i++) {
      vec2 cid = baseId + vec2(float(i) - 2.0, float(j) - 2.0);
      vec2 np  = nodePos(cid, spacing, t);
      float z  = nodeDepth(cid);
      float coc = nodeR + abs(z - focus) * blurMax;        // circle of confusion
      float dist = distance(fc, np);
      // light spread as the disc swells: sharp node = bright point, blurred = softer
      // and dimmer disc, but kept visible (gentle linear falloff, not 1/area).
      float den  = 1.0 + coc / nodeR;
      float disc = (1.0 - smoothstep(coc * 0.5, coc, dist)) / den;
      float rq   = (dist - coc * 0.82) / max(coc * 0.18, 1.0);   // (x*x, not pow: neg base -> NaN in ANGLE)
      float rim  = exp(-rq * rq) * 0.5 / den;                    // bokeh rim
      float hue  = (cid.x * 0.11 + cid.y * 0.07) * u_hue + z * 0.3 + t * 0.01;
      acc += wheelCol(hue, c0, c1, c2, c3) * (disc + rim) * 3.2;
    }
  }

  // --- threads: proximity links over the inner 3x3, blurred by the pair depth.
  float thresh = spacing * 1.1 * max(u_reach, 0.1);
  for (int a = 0; a < 9; a++) {
    for (int b = 0; b < 9; b++) {
      if (b <= a) continue;
      vec2 ca = baseId + vec2(float(a/3) - 1.0, float(int(mod(float(a),3.0))) - 1.0);
      vec2 cb = baseId + vec2(float(b/3) - 1.0, float(int(mod(float(b),3.0))) - 1.0);
      vec2 pa = nodePos(ca, spacing, t);
      vec2 pb = nodePos(cb, spacing, t);
      float d = distance(pa, pb);
      if (d > thresh) continue;
      float za = nodeDepth(ca), zb = nodeDepth(cb);
      float coc = 0.5 * (abs(za - focus) + abs(zb - focus)) * blurMax;
      vec2 ba = pb - pa;
      float h = clamp(dot(fc - pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
      float sd = length((fc - pa) - ba * h);
      float w  = lw + coc * 0.5;
      float close = 1.0 - d / thresh;
      float stroke = (1.0 - smoothstep(0.0, w, sd)) / max(1.0 + coc / (nodeR * 2.0), 1.0);
      float halo   = (w / (sd + w * 1.4)); halo = halo * halo * 0.35;
      vec3 cc = wheelCol((ca.x * 0.11 + ca.y * 0.07) * u_hue + t * 0.01, c0, c1, c2, c3);
      acc += cc * (stroke + halo) * close * 1.35;
    }
  }

  acc = vec3(1.0) - exp(-acc * 1.1);
  gl_FragColor = vec4(BG + acc, 1.0);
}
