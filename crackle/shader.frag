precision highp float;

// ----------------------------------------------------------------------------
// Crackle — Mosaic family
//
// Craquelure as refraction. A static two-scale fracture web — coarse shards
// each crazed with finer hairlines — but no crack is ever drawn. Behind the
// glaze a deep, slow aurora blends the four palette colours, and every shard
// samples it through its own slight offset and tilt, so the luminous field
// arrives shattered: hue and brightness jump cleanly at every crack, and the
// fine crazing shears the gradient in miniature inside each shard.
// ----------------------------------------------------------------------------

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_shard;       // coarse shard size, css px              (default 160)
uniform float u_fieldSpeed;  // creep rate of the aurora colour field  (default 0.12)
uniform float u_shatter;     // shard sample offset, fraction of size  (default 0.55)
uniform float u_fineMix;     // strength of hairline micro-offsets     (default 0.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043);
const float QSCALE   = 3.0;   // aurora-space units spanning the short screen axis
const float FINE     = 4.0;   // fine crazing cells per coarse shard (per axis)
const float OFF_AMP  = 1.25;  // coarse offset amplitude, shard-sizes at shatter=1
const float FINE_AMP = 1.9;   // fine offset amplitude, fine-cell sizes
const float TILT_AMP = 0.8;   // max per-shard tilt in radians at shatter=1

// palette colours promoted to globals after the fallback block in main()
vec3 g0, g1, g2, g3;

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.2317, 0.2483, 0.1991));
  p3 += dot(p3, p3.yzx + 23.19);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.2317);
  p3 += dot(p3, p3.yzx + 23.19);
  return fract((p3.x + p3.y) * p3.z);
}

// Nearest-two Voronoi over a jittered grid. Static geometry: the sites never
// move — all motion lives in how each cell samples the field behind it.
void voro2(vec2 x, out vec2 cellA, out vec2 siteA, out vec2 cellB, out vec2 siteB) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float dA = 1e9;
  float dB = 1e9;
  cellA = vec2(0.0); siteA = vec2(0.0);
  cellB = vec2(0.0); siteB = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 id = n + g;
      vec2 s = id + hash22(id);
      vec2 r = s - n - f;
      float d = dot(r, r);
      if (d < dA) {
        dB = dA; cellB = cellA; siteB = siteA;
        dA = d;  cellA = id;    siteA = s;
      } else if (d < dB) {
        dB = d;  cellB = id;    siteB = s;
      }
    }
  }
}

// Signed distance from x to the bisector between the two nearest sites;
// positive inside cell A. Used only to antialias the discontinuity (~1.5px).
float edgeDist(vec2 x, vec2 sA, vec2 sB) {
  vec2 d = sB - sA;
  return dot(0.5 * (sA + sB) - x, d / max(length(d), 1e-5));
}

// Per-cell slow Lissajous wander — hash-phased so neighbours never agree.
vec2 lissajous(vec2 cell, float t) {
  vec2 h1 = hash22(cell + 7.31);
  vec2 h2 = hash22(cell + 19.7);
  return vec2(sin(t * (0.09 + 0.17 * h1.x) + h2.x * 6.2831),
              cos(t * (0.09 + 0.17 * h1.y) + h2.y * 6.2831));
}

// The colour field behind the glaze: four palette hues blended through a
// slowly creeping, gently folded gradient with dark valleys between ridges.
vec3 aurora(vec2 q, float t) {
  vec2 w = q + vec2(0.42, 0.26) * t;   // one-directional creep
  vec2 r = w;
  r.x += 0.55 * sin(w.y * 1.35 + t * 0.41);
  r.y += 0.55 * sin(w.x * 1.10 - t * 0.33);

  float b0 = 0.5 + 0.5 * sin(r.x * 1.45 + r.y * 0.55 + t * 0.23);
  float b1 = 0.5 + 0.5 * sin(r.y * 1.75 - r.x * 0.65 - t * 0.19 + 2.1);
  float b2 = 0.5 + 0.5 * sin((r.x + r.y) * 1.05 + t * 0.16 + 4.2);
  float b3 = 0.5 + 0.5 * sin((r.x - r.y) * 1.30 - t * 0.27 + 1.2);
  float w0 = b0 * b0; w0 *= w0 * b0;   // ^5 — keeps hues pure, not grey-mixed
  float w1 = b1 * b1; w1 *= w1 * b1;
  float w2 = b2 * b2; w2 *= w2 * b2;
  float w3 = b3 * b3; w3 *= w3 * b3;
  vec3 col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3) / max(w0 + w1 + w2 + w3, 1e-4);
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.22);   // mild sat lift

  float l1 = 0.5 + 0.5 * sin(r.x * 0.95 - r.y * 1.20 + t * 0.21 + 0.6);
  float l2 = 0.5 + 0.5 * sin(r.x * 0.60 + r.y * 0.85 - t * 0.15 + 3.4);
  float lum = pow(l1, 3.4) * (0.35 + 0.65 * l2) + 0.24 * pow(l2, 4.0);
  return max(col, 0.0) * (0.02 + 0.92 * lum);
}

// One shard's view of the aurora: rotate about its own site (the tilt), then
// shift by its wandering offset plus the shared fine-crazing micro-offset.
vec3 sampleShard(vec2 q, vec2 cell, vec2 siteQ, float amp, float tR, vec2 fOff, float tF) {
  vec2 h = hash22(cell + 41.7);
  float ang = (h.x - 0.5) * 2.0 * TILT_AMP * u_shatter
            + 0.05 * sin(tR * (0.11 + 0.10 * h.y) + h.y * 6.2831) * u_shatter;
  float cs = cos(ang);
  float sn = sin(ang);
  vec2 d = q - siteQ;
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  vec2 off = lissajous(cell, tR) * amp;
  return aurora(siteQ + d + off + fOff, tF);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  g0 = c0; g1 = c1; g2 = c2; g3 = c3;

  float pr      = max(u_pixelRatio, 0.25);
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float shardPx = max(u_shard, 24.0) * refScale * pr;                 // css px -> device px
  float minRes  = max(min(u_resolution.x, u_resolution.y), 1.0);

  vec2  px = gl_FragCoord.xy;
  vec2  cp = px / shardPx;                 // coarse fracture lattice space
  vec2  q  = px / minRes * QSCALE;         // aurora space (q == cp * k)
  float k  = shardPx / minRes * QSCALE;    // one shard, in aurora units

  float tField = u_time * u_fieldSpeed;    // aurora clock (param-scaled)
  float tRef   = u_time;                   // refraction clock (fixed slow rates)

  // coarse fracture web — static geometry, antialiased discontinuity
  vec2 cellA, siteA, cellB, siteB;
  voro2(cp, cellA, siteA, cellB, siteB);
  float eC  = edgeDist(cp, siteA, siteB);
  float aaC = 1.6 / shardPx;
  float wC  = 0.5 + 0.5 * smoothstep(0.0, aaC, eC);

  // fine crazing nested inside the current shard (lattice re-seeded per shard
  // so hairlines never continue across a coarse crack)
  vec2 fp = cp * FINE + hash22(cellA + 3.3) * 31.7;
  vec2 fcA, fsA, fcB, fsB;
  voro2(fp, fcA, fsA, fcB, fsB);
  float eF  = edgeDist(fp, fsA, fsB);
  float aaF = 1.6 * FINE / shardPx;
  float wF  = 0.5 + 0.5 * smoothstep(0.0, aaF, eF);

  float fineAmp = u_fineMix * u_shatter * FINE_AMP * (k / FINE);
  vec2 fOffA = (hash22(fcA + 11.1) - 0.5) * 2.0 + 0.35 * lissajous(fcA, tRef * 0.7);
  vec2 fOffB = (hash22(fcB + 11.1) - 0.5) * 2.0 + 0.35 * lissajous(fcB, tRef * 0.7);
  vec2 fOff  = mix(fOffB, fOffA, wF) * fineAmp;

  // each shard refracts the aurora through its own offset + tilt
  float ampC = u_shatter * OFF_AMP * k;
  vec3 colA = sampleShard(q, cellA, siteA * k, ampC, tRef, fOff, tField);
  vec3 colB = sampleShard(q, cellB, siteB * k, ampC, tRef, fOff, tField);
  vec3 em = mix(colB, colA, wC);

  // soft highlight roll-off, gentle vignette, dither against banding
  em = 1.0 - exp(-em * 1.15);
  vec2 ndc = (px - 0.5 * u_resolution) / minRes;
  float vig = 1.0 - 0.32 * smoothstep(0.55, 1.45, length(ndc) * 2.0);
  vec3 col = BG + em * vig;
  col += (hash12(px) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
