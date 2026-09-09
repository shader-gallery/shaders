// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// scales (Burnish) - the flank of a fish seen close: rows of rounded scales,
// each row laid a semi-pitch across from the one beneath it and overlapping
// it, so only the lower arc of every scale shows. There is no cell gather
// here: the scales sit on an offset-row lattice, and a pixel asks only the
// six scales that can physically reach it (two columns in the row in front,
// its own row, and the row behind), front to back, in painter order. The
// first one that covers the pixel is the scale we see; every scale in front
// of it that did not cover throws a soft contact shadow onto it from its
// edge. The lattice lives in a log-polar map of the body so scale size grows
// smoothly toward the head and the rows bow gently, and the whole sheet is
// wrapped onto a horizontal body cylinder so the rows foreshorten toward the
// back and the belly. Each scale is a shallow tilted dome with growth rings,
// a raised free edge that catches a rim light, and an iridescent sheen that
// shifts between palette poles with the viewing angle. A slow flex runs down
// the body and tilts the scales as it passes, so a band of highlights travels
// along the flank while the light itself drifts across.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;    // scale columns across the frame         (default 11)
uniform float u_overlap;  // scale radius against the column pitch  (default 0.64)
uniform float u_gloss;    // specular, rim and sheen strength       (default 1.0)
uniform float u_flex;     // depth of the travelling body flex      (default 0.6)
uniform float u_speed;    // animation speed                        (default 0.5)

const float ROW = 0.5;   // row pitch in lattice units (column pitch is 1)

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

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// body surface: frame point p (y in -1..1) -> point on the flank cylinder.
// returns (x along the body, s arc length round the girth) and the angle.
vec3 flank(vec2 p, float t, float flex) {
  float rb = 1.12;                              // body radius in frame units
  float th = asin(clamp(p.y / rb, -0.999, 0.999));
  float s  = rb * th;
  // the swimming flex: a slow wave running down the body that lifts and
  // drops the rows a little as it passes
  s += 0.05 * flex * sin(p.x * 2.2 - t * 0.9);
  return vec3(p.x, s, th);
}

// lattice coords of a flank point: log-polar about a pole off the right of
// the frame, so scale size grows toward the left (the head) and rows bow
vec2 lattice(vec2 fp, float dens) {
  vec2 z = fp - vec2(3.4, 0.0);
  float r = length(z);
  float a = atan(z.y, -z.x);                    // 0 along the body axis
  // one lattice unit is one scale pitch; the same factor on both axes keeps
  // the map conformal, and it is chosen so dens columns fit the frame width
  // at the centre of the body
  float k = dens * 1.06;
  return vec2(log(r) * k, a * k);
}

// centre, radius and identity of the scale in column i of row k
void scaleAt(float i, float k, out vec2 c, out float rad, out float id) {
  float ox = 0.5 * mod(k, 2.0);
  id  = hash21(vec2(i, k) + 0.37);
  float jx = hash21(vec2(i, k) * 1.7 + 9.1) - 0.5;
  float jy = hash21(vec2(i, k) * 2.3 + 4.7) - 0.5;
  c   = vec2(i + ox + 0.5 + jx * 0.06, (k + 0.5) * ROW + jy * 0.03);
  rad = clamp(u_overlap, 0.5, 0.75) * (1.0 + (id - 0.5) * 0.05);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  float aspect = res.x / res.y;
  vec2  uv     = gl_FragCoord.xy / res;
  vec2  p      = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  float t      = u_time * clamp(u_speed, 0.0, 3.0);
  float flex   = clamp(u_flex, 0.0, 1.5);
  float gloss  = clamp(u_gloss, 0.0, 2.0);
  float dens   = max(u_scale, 3.0);

  // ---- body and lattice, plus a finite-difference pixel footprint for AA
  vec3 fk  = flank(p, t, flex);
  vec2 q   = lattice(fk.xy, dens);
  vec2 pdx = p + vec2(2.0 / res.y, 0.0);
  vec2 qdx = lattice(flank(pdx, t, flex).xy, dens);
  float px = length(qdx - q);                   // lattice units per device px
  float aa = px * 0.9;

  // ---- painter walk: row in front, own row, row behind; two columns each.
  // The first scale that covers the pixel wins; the ones passed before it
  // (which are in front) leave their edge distance for the contact shadow.
  float j = floor(q.y / ROW);
  vec2  wc = vec2(0.0); float wr = 1.0, wid = 0.0;
  float found = 0.0;
  float dfront = 10.0;                          // distance to the nearest front edge
  float dwin   = 10.0;                          // signed distance to the winner edge
  for (int kk = 1; kk >= -1; kk--) {
    float k  = j + float(kk);
    float ox = 0.5 * mod(k, 2.0);
    float ic = floor(q.x - ox - 0.5);
    // the two columns that bracket the pixel in this row
    vec2  ca, cb; float ra, rb, ia, ib;
    scaleAt(ic,       k, ca, ra, ia);
    scaleAt(ic + 1.0, k, cb, rb, ib);
    // scales are a touch wider than tall, so the metric squeezes y a little
    float da = length((q - ca) * vec2(1.0, 1.08)) - ra;
    float db = length((q - cb) * vec2(1.0, 1.08)) - rb;
    float ranka = hash21(vec2(ic, k) * 3.1 + 1.3);
    float rankb = hash21(vec2(ic + 1.0, k) * 3.1 + 1.3);
    if (found < 0.5) {
      bool ina = da < aa, inb = db < aa;
      if (ina && inb) {
        // both reach: the higher rank lies on top, the other is behind it
        if (ranka > rankb) { wc = ca; wr = ra; wid = ia; dwin = da; }
        else               { wc = cb; wr = rb; wid = ib; dwin = db; }
        found = 1.0;
      } else if (ina) {
        wc = ca; wr = ra; wid = ia; dwin = da; found = 1.0;
        if (rankb > ranka) dfront = min(dfront, db);
      } else if (inb) {
        wc = cb; wr = rb; wid = ib; dwin = db; found = 1.0;
        if (ranka > rankb) dfront = min(dfront, da);
      } else {
        dfront = min(dfront, min(da, db));
      }
    }
  }

  // ---- the winning scale in its own frame
  vec2  d   = (q - wc) * vec2(1.0, 1.08);
  float dl  = length(d);
  vec2  nd  = d / wr;                            // -1..1 across the scale
  float rr  = clamp(dl / wr, 0.0, 1.0);
  float cov = 1.0 - smoothstep(-aa, aa, dwin);   // AA at the free edge

  // per-scale tilt: the free edge lifts a little off the body, and the flex
  // wave passing along the body rocks each scale in turn
  float wave = sin(wc.x * 0.55 + wc.y * 0.25 - t * 1.4);
  float tilt = 0.10 + 0.32 * flex * wave;
  // growth rings: fine concentric circuli across the exposed field
  float ring = sin(rr * rr * 46.0 + wid * 6.28) * (1.0 - rr * 0.4);
  // radial striations, a few per scale
  float radi = sin(atan(nd.y, nd.x) * 9.0 + wid * 6.28);
  // shallow dome plus the tilt, in the tangent frame of the body
  vec2  slope = nd * 0.38 + normalize(nd + 1e-5) * ring * 0.045
              + normalize(nd + 1e-5) * radi * 0.012 * rr;
  vec3  nl = normalize(vec3(slope.x, slope.y - tilt, 1.0));

  // body cylinder frame: tangent round the girth and outward normal
  float th = fk.z;
  vec3  T  = vec3(0.0, cos(th), -sin(th));
  vec3  Nb = vec3(0.0, sin(th),  cos(th));
  vec3  N  = normalize(nl.x * vec3(1.0, 0.0, 0.0) + nl.y * T + nl.z * Nb);

  // ---- light: a key from upper left that drifts across, plus the viewer
  vec3 L = normalize(vec3(-0.55 + 0.35 * sin(t * 0.37), 0.72, 0.62));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float ndl  = dot(N, L);
  float diff = clamp(ndl * 0.7 + 0.3, 0.0, 1.0);
  float ndh  = max(dot(N, H), 0.0);
  float s4 = ndh * ndh; s4 *= s4;
  float s16 = s4 * s4;
  float s64 = s16 * s16;
  float ndv  = max(dot(N, V), 0.0);
  float fres = 1.0 - ndv; fres = fres * fres;

  // ---- material: dark dorsal skin countershading to a paler belly, the
  // palette laid on as iridescence rather than paint
  float body = smoothstep(-1.0, 1.0, -p.y);      // 0 at the back, 1 at the belly
  vec3  deep = mix(vec3(luma(c3)), c3, 0.55) * 0.20 + c0 * 0.06;
  vec3  skin = mix(vec3(luma(c0)), c0, 0.55) * 0.42;
  vec3  pale = mix(vec3(luma(c2)), c2, 0.30) * 0.62;
  vec3  albedo = mix(deep, skin, smoothstep(0.0, 0.55, body));
  albedo = mix(albedo, pale, smoothstep(0.55, 1.0, body));
  // scale to scale variation: a touch lighter or darker, a hint of hue shift
  albedo *= 0.84 + 0.30 * wid;
  float hsel = hash21(wc * 5.3);
  vec3  hueC = mix(c1, c2, smoothstep(0.3, 0.6, hsel));
  hueC = mix(hueC, c0, smoothstep(0.6, 0.9, hsel));
  albedo = mix(albedo, hueC * 0.55, 0.22);

  // iridescence: the sheen colour walks c1 -> c2 -> c0 with the view angle and
  // the position along the body, so neighbouring scales flash different hues
  float ph = ndv * 5.0 + fk.x * 1.6 + wave * 0.6 + t * 0.15;
  vec3  irid = mix(c1, c2, 0.5 + 0.5 * sin(ph));
  irid = mix(irid, c0, 0.5 + 0.5 * sin(ph * 0.61 + 2.0));
  float sheen = (0.10 + 0.35 * fres) * s4 * gloss + (0.05 + 0.16 * fres) * diff * gloss
              + 0.35 * s16 * gloss;

  // free-edge rim: the lifted edge of the scale is a bright thread
  float edge = 1.0 - smoothstep(0.0, 0.16 + aa * 2.0, -dwin);
  edge *= smoothstep(-0.02, 0.0, -dwin);
  float rimLit = 0.35 + 0.65 * clamp(dot(normalize(d + 1e-5), L.xy) * 1.4 + 0.5, 0.0, 1.0);
  vec3  rim = mix(vec3(1.0), c2, 0.45) * edge * rimLit * (0.60 + 0.5 * ndv) * gloss;

  // contact shadow from the scales in front: dark under their edges, and a
  // deeper pocket right where this scale slides beneath them
  float shad = exp(-max(dfront, 0.0) / 0.075);
  float pocket = exp(-max(dfront, 0.0) / 0.018);
  float ao = 1.0 - 0.60 * shad - 0.25 * pocket;
  // the flank turning away under the belly and along the back
  float turn = 0.55 + 0.45 * Nb.z;

  vec3 col = albedo * (0.22 + 0.82 * diff) * ao * turn;
  col += albedo * ring * 0.05 * diff;
  col += irid * sheen * ao * 1.3;
  col += irid * fres * 0.08 * gloss;
  col += mix(vec3(1.0), c2, 0.3) * s64 * 0.45 * gloss * ao;
  col += rim * (0.6 + 0.4 * ao);

  // slivers between scales (should be rare): the dark underskin
  col = mix(deep * 0.6, col, cov);

  // fine skin noise so the surface never reads as vector-clean
  col *= 0.96 + 0.08 * vnoise(gl_FragCoord.xy / max(u_pixelRatio, 0.5) * 0.7);

  gl_FragColor = vec4(col, 1.0);
}
