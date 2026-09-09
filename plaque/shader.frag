// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// plaque (Burnish) - an engraved metal plaque. Brushed brass or steel fills the
// whole frame edge to edge; a chamfered plate rim, a hairline border rule and a
// slotted screw in each corner sell the object. In the left third a ring emblem
// is cut INTO the metal (a heavy outer ring, a bezel of radial ticks, a hairline
// inner ring and a six-spoke star) as real V-grooves: the wall facing the light
// is bright cut metal, the far wall falls into shadow and the bottom of each cut
// holds a dark oxidised fill. To its right a long flat-bottomed recess with
// chamfered walls is left empty and even, a satin band waiting for a wordmark.
// The face is shaded with an anisotropic Ward lobe along the brush direction so a
// point key light sweeping left and right drags a tall vertical sheen across
// the brushing, breaking up on the fine scratch normals and flipping the lit
// and shadowed groove walls as it passes. Everything is procedural.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_sweepSpeed;   // key light sweep rate                (default 0.35)
uniform float u_brushGrain;   // scratch depth of the brushing        (default 0.6)
uniform float u_engraveDepth; // groove depth multiplier              (default 1.0)
uniform float u_emblemSize;   // emblem radius, fraction of height    (default 0.24)
uniform float u_polish;       // tightness of the anisotropic sheen   (default 0.55)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float PI  = 3.14159265;
const float TAU = 6.28318531;

// ---- hash / noise (no textures) --------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
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

// ---- 2D distance helpers -----------------------------------------------------
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
// fold the plane into n angular sectors so one segment SDF becomes n ticks
vec2 foldSector(vec2 p, float n) {
  float sec = TAU / n;
  float a   = atan(p.y, p.x);
  a = mod(a + sec * 0.5, sec) - sec * 0.5;
  return length(p) * vec2(cos(a), sin(a));
}

// ---- brushing: long horizontal scratches as a tiny height field ----------
// value noise stretched hard along x (three octaves) plus sparse longer
// scratches gated per 2px row. Returns height in CSS px (fractions of a px).
float brushField(vec2 p, float grain) {
  float s = 0.0;
  s += 0.50 * vnoise(vec2(p.x * 0.012,       p.y * 0.85));
  s += 0.30 * vnoise(vec2(p.x * 0.031 + 7.3, p.y * 1.70 + 3.1));
  s += 0.20 * vnoise(vec2(p.x * 0.070 + 2.2, p.y * 3.30 + 9.4));
  float row   = floor(p.y * 0.5);
  float g     = hash21(vec2(row, 11.0));
  float along = vnoise(vec2(p.x * 0.004 + g * 40.0, row * 0.37));
  float tri   = 1.0 - abs(fract(p.y * 0.5) - 0.5) * 2.0;
  float sc    = step(0.965, g) * smoothstep(0.40, 0.70, along) * tri;
  return ((s - 0.5) * 0.55 + sc * 0.9) * grain;
}

// ---- plate relief -----------------------------------------------------------
// Signed height below the face in CSS px (positive = cut into the metal,
// negative = raised). Also returns how much dark fill sits at this point and
// whether we are on the flat satin floor of the wordmark band.
struct Layout {
  vec2  size;    // plate size in CSS px
  float m;       // corner margin
  vec2  C;       // emblem centre
  float R;       // emblem radius
  vec2  bandC;   // band centre
  vec2  bandH;   // band extents from its centre
  float depth;   // engrave depth multiplier
};

// a cut: sd is the signed distance to the filled outline (negative inside),
// ww is the wall width, d the full depth. Linear walls = a crisp chamfer.
float cut(float sd, float ww, float d) {
  return d * clamp(-sd / ww, 0.0, 1.0);
}
float fillOf(float sd, float ww) {
  return smoothstep(ww * 0.55, ww * 1.0, -sd);
}

float relief(vec2 q, Layout L, out float fill, out float floorM, out float dome) {
  float h = 0.0;
  fill = 0.0; floorM = 0.0; dome = 0.0;
  float dm = L.depth;

  // chamfered plate rim: the outer band slopes away toward the frame edge
  float dEdge = min(min(q.x, L.size.x - q.x), min(q.y, L.size.y - q.y));
  float rimW  = L.size.y * 0.022;
  h = max(h, 7.0 * clamp(1.0 - dEdge / rimW, 0.0, 1.0));

  // hairline border rule, inset from the rim
  vec2  hs    = L.size * 0.5;
  float sdB   = abs(sdBox(q - hs, hs - L.m * 1.6)) - 1.3;
  h    = max(h, cut(sdB, 1.3, 2.2 * dm));
  fill = max(fill, fillOf(sdB, 1.3));

  // corner screws: raised slotted domes in a shallow countersink. The plane is
  // folded by quadrant so one SDF places all four; the slot angle varies per
  // corner from the quadrant id.
  vec2  rel   = q - hs;
  float qid   = step(0.0, rel.x) + 2.0 * step(0.0, rel.y);
  vec2  s     = abs(rel) - (hs - L.m * 0.85);
  float rs    = length(s);
  float Rs    = L.m * 0.30;
  float rn    = clamp(rs / Rs, 0.0, 1.0);
  float domeH = -5.5 * (1.0 - rn * rn) * step(rs, Rs);
  float sink  = abs(rs - Rs * 1.14) - 1.4;
  float ang   = 0.35 + qid * 1.17;
  vec2  sr    = vec2(s.x * cos(ang) - s.y * sin(ang), s.x * sin(ang) + s.y * cos(ang));
  float slot  = max(sdBox(sr, vec2(Rs * 0.82, 1.5)), rs - Rs * 0.92);
  float screwH = domeH + cut(slot, 1.5, 3.2);
  h = mix(h, screwH, step(rs, Rs));
  h = max(h, cut(sink, 1.4, 2.0 * dm));
  fill = max(fill, fillOf(slot, 1.5) * step(rs, Rs));
  fill = max(fill, fillOf(sink, 1.4));
  dome = step(rs, Rs) * (1.0 - fillOf(slot, 1.5));

  // ---- the ring emblem: a sunk medallion with a chamfered circular wall (the
  // heavy outer ring), its satin floor carrying a hairline ring, a bezel of
  // radial ticks, an inner hairline ring and a six-spoke star, all cut deeper
  vec2  l   = q - L.C;
  float r   = length(l);
  float R   = L.R;
  float mw  = R * 0.07;                          // medallion wall width
  float sdM = r - R;
  float mf  = cut(sdM, mw, 5.0 * dm);            // medallion floor depth
  h = max(h, mf);
  floorM = max(floorM, smoothstep(mw * 0.8, mw * 1.15, -sdM));
  float sd;
  // hairline ring just inside the wall
  sd = abs(r - R * 0.84) - (R * 0.010 + 0.8);
  h = max(h, mf + cut(sd, R * 0.010 + 0.8, 2.4 * dm)); fill = max(fill, fillOf(sd, R * 0.010 + 0.8));
  // bezel ticks: sixteen short, four cardinal long
  vec2 f16 = foldSector(l, 16.0);
  sd = sdBox(f16 - vec2(R * 0.70, 0.0), vec2(R * 0.065, R * 0.011 + 0.7));
  h = max(h, mf + cut(sd, R * 0.011 + 0.7, 3.0 * dm)); fill = max(fill, fillOf(sd, R * 0.011 + 0.7));
  vec2 f4 = foldSector(l, 4.0);
  sd = sdBox(f4 - vec2(R * 0.65, 0.0), vec2(R * 0.13, R * 0.02 + 0.6));
  h = max(h, mf + cut(sd, R * 0.02 + 0.6, 3.6 * dm)); fill = max(fill, fillOf(sd, R * 0.02 + 0.6));
  // inner hairline ring
  sd = abs(r - R * 0.48) - (R * 0.010 + 0.8);
  h = max(h, mf + cut(sd, R * 0.010 + 0.8, 2.4 * dm)); fill = max(fill, fillOf(sd, R * 0.010 + 0.8));
  // six-spoke star and a centre boss cut
  vec2 f6 = foldSector(l, 6.0);
  sd = sdBox(f6 - vec2(R * 0.26, 0.0), vec2(R * 0.14, R * 0.028 + 0.6));
  h = max(h, mf + cut(sd, R * 0.028 + 0.6, 4.0 * dm)); fill = max(fill, fillOf(sd, R * 0.028 + 0.6));
  sd = r - R * 0.075;
  h = max(h, mf + cut(sd, R * 0.045, 4.0 * dm)); fill = max(fill, fillOf(sd, R * 0.045));

  // ---- the wordmark band: a flat-bottomed recess with chamfered walls ----
  float ww  = 6.0;
  float sdW = sdBox(q - L.bandC, L.bandH);
  h = max(h, cut(sdW, ww, 5.0 * dm));
  floorM = max(floorM, smoothstep(ww * 0.8, ww * 1.15, -sdW));

  return h;
}

// Ward anisotropic lobe (times N.L). T is the brush direction, B across it.
float ward(vec3 N, vec3 L, vec3 V, vec3 T, vec3 B, float ax, float ay) {
  vec3  H  = normalize(L + V);
  float NL = max(dot(N, L), 0.0);
  float NV = max(dot(N, V), 1e-3);
  float NH = max(dot(N, H), 1e-3);
  float ht = dot(H, T) / ax;
  float hb = dot(H, B) / ay;
  float e  = -(ht * ht + hb * hb) / (NH * NH);
  return exp(e) / (4.0 * PI * ax * ay * sqrt(max(NL * NV, 1e-4))) * NL;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  res = u_resolution;
  vec2  q   = gl_FragCoord.xy / pr;             // CSS px, origin bottom-left
  float t   = u_time;

  // ---- palette fallback (headless contexts can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // params (guard against unset 0.0)
  float sweep  = max(u_sweepSpeed, 0.0);
  float grain  = max(u_brushGrain, 0.0);
  float polish = clamp(u_polish, 0.0, 1.0);

  // ---- metal tint from the palette: hue of the two lead colours, mostly desaturated
  const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
  vec3  accent = mix(c0, c1, 0.5);
  vec3  hue    = accent / max(dot(accent, LW), 0.05);
  vec3  tint   = mix(vec3(1.0), hue, 0.38) * 0.60;           // brushed brass / steel
  vec3  keyCol = mix(vec3(1.0), c2 / max(dot(c2, LW), 0.05), 0.10);
  vec3  fillCol = mix(vec3(0.045), c3 * 0.30, 0.45);         // oxidised fill in the cuts

  // ---- layout in CSS px ----
  Layout L;
  L.size  = res / pr;
  float W = L.size.x, H = L.size.y;
  L.m     = 0.065 * H;
  L.R     = clamp(u_emblemSize, 0.08, 0.42) * H;
  L.C     = vec2(0.28 * W, 0.50 * H);
  float bl = L.C.x + L.R * 1.30;
  float br = W - L.m * 1.6 - 0.05 * W;
  L.bandC = vec2((bl + br) * 0.5, L.C.y);
  L.bandH = vec2(max((br - bl) * 0.5, 20.0), min(0.075 * H, L.R * 0.34));
  L.depth = max(u_engraveDepth, 0.0);

  // ---- relief and its normal by central differences ----
  float fill, floorM, dome, f1, m1, d1;
  float eps = 0.75;
  float h0 = relief(q, L, fill, floorM, dome);
  float hx = relief(q + vec2(eps, 0.0), L, f1, m1, d1) - relief(q - vec2(eps, 0.0), L, f1, m1, d1);
  float hy = relief(q + vec2(0.0, eps), L, f1, m1, d1) - relief(q - vec2(0.0, eps), L, f1, m1, d1);
  hx /= 2.0 * eps; hy /= 2.0 * eps;

  // masks: cut walls, satin floor, raised dome, brushed face
  float wallM = smoothstep(0.12, 0.6, h0) * (1.0 - floorM) * (1.0 - dome);
  float faceM = (1.0 - wallM) * (1.0 - floorM) * (1.0 - dome);

  // brushing: scratch slope across the brush direction, finer on the satin floor
  float bAmt = mix(0.25, 1.0, faceM) * (1.0 - dome) * (1.0 - wallM * 0.7);
  float be   = 0.6;
  float bs   = (brushField(q + vec2(0.0, be), grain) - brushField(q - vec2(0.0, be), grain)) / (2.0 * be);
  // gentle plate waviness so the sheen does not read as a ruler-straight bar
  const float WAVE = 0.5;
  vec2  wq   = q * 0.0035;
  float wx   = vnoise(wq + vec2(0.02, 0.0)) - vnoise(wq - vec2(0.02, 0.0));
  float wy   = vnoise(wq + vec2(0.0, 0.02)) - vnoise(wq - vec2(0.0, 0.02));

  // relief height is negative when cut, so the surface normal tilts uphill
  vec3 N = normalize(vec3(hx - wx * WAVE, hy - bs * bAmt - wy * WAVE, 1.0));

  // ---- scene in units of frame height ----
  float A   = W / H;
  vec3  P   = vec3(q / H, 0.0);
  vec3  Eye = vec3(0.5 * A, 0.5, 2.4);
  vec3  V   = normalize(Eye - P);
  vec3  T0  = vec3(1.0, 0.0, 0.0);                   // brush direction
  vec3  B   = normalize(cross(N, T0));
  vec3  T   = cross(B, N);

  // key light sweeps left and right on a slow sine; optional pointer pull
  float ph  = t * sweep * 0.55 - 2.06;
  vec3  Lp  = vec3(0.5 * A + 0.80 * A * sin(ph), 0.40 + 0.14 * sin(ph * 0.5 + 1.3), 0.58);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  Lp.xy = mix(Lp.xy, (u_mouse / pr) / H, 0.5 * mAmt);
  vec3  Lp2 = vec3(0.55 * A, 1.7, 2.4);              // distant soft fill, a broad wash
  // a second, dimmer room light hangs near the right edge and barely drifts,
  // so the plate always carries a faint second streak the key sweeps through
  vec3  Lp3 = vec3(0.98 * A + 0.05 * A * sin(ph * 0.7 + 2.0), 1.02, 0.55);

  // anisotropy per material
  float axF = mix(0.17, 0.05, polish), ayF = mix(0.36, 0.16, polish);
  float ax  = axF * faceM + 0.16 * wallM + 0.30 * floorM + 0.09 * dome;
  float ay  = ayF * faceM + 0.16 * wallM + 0.30 * floorM + 0.09 * dome;
  float specGain = 0.62 * faceM + 0.95 * wallM + 0.35 * floorM + 1.0 * dome;

  float diff = 0.0, spec = 0.0;
  {
    vec3  d   = Lp - P;
    float r2  = dot(d, d);
    vec3  Ld  = d / sqrt(r2);
    float I   = 1.6 / (0.15 + r2);
    diff += max(dot(N, Ld), 0.0) * I;
    spec += ward(N, Ld, V, T, B, ax, ay) * I;
  }
  {
    vec3  d   = Lp2 - P;
    float r2  = dot(d, d);
    vec3  Ld  = d / sqrt(r2);
    float I   = 3.0 / (0.8 + r2);
    diff += max(dot(N, Ld), 0.0) * I * 0.5;
    spec += ward(N, Ld, V, T, B, ax, ay) * I * 0.35;
  }
  {
    vec3  d   = Lp3 - P;
    float r2  = dot(d, d);
    vec3  Ld  = d / sqrt(r2);
    float I   = 1.2 / (0.15 + r2);
    diff += max(dot(N, Ld), 0.0) * I * 0.7;
    spec += ward(N, Ld, V, T, B, ax, ay) * I * 0.7;
  }

  // blurred environment in the reflection: dark floor, brighter sky above
  vec3  Rf  = reflect(-V, N);
  float sky = smoothstep(-0.6, 0.7, Rf.y);
  float amb = mix(0.17, 0.44, sky);

  vec3 col = tint * (amb + diff * 0.36);
  col += spec * specGain * mix(tint, vec3(1.0), 0.30) * keyCol;

  // satin floors of the band and medallion: sunk, a few shades darker, very even
  col *= 1.0 - 0.34 * floorM;
  // dark fill in the bottom of every cut, still catching a little ambient
  col = mix(col, fillCol * (0.6 + 0.8 * amb), fill * 0.92);

  // corners fall off a little so the rim reads as an edge, not a frame line
  vec2  vq  = (q - L.size * 0.5) / H;
  col *= 1.0 - 0.10 * smoothstep(0.45, 0.95, length(vq));

  // soft knee on the sheen so the sweep blooms rather than clips
  col = col / (1.0 + 0.30 * col);
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
