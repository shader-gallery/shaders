// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// foil (Burnish) - a foil-stamped emblem on dark card. The card fills the
// frame: a dark, palette-tinted stock with long fibre, laid lines and tooth,
// lit by one lamp parked just off the upper right corner, so the sheet is
// bright and textured toward that corner and falls away evenly toward the
// lower left. In the left third sits a procedural mark (a heavy ring, a hairline
// inner ring, an interlaced two-square octagram and a centre boss) pressed
// INTO the card: the stamp is a height field built from the mark SDF, so the
// deboss has a real bevel, a lit rim on the side facing the lamp, a wall
// shadow on the other, and contact occlusion inside the recess. The pressed
// floor is metallic foil: a tinted metal with a brushed (anisotropic) finish
// that follows each stroke, lit by a broad studio band plus a tight streak,
// and a slow looping light sweep that crosses the sheet and makes the foil
// flash as it passes. The right two thirds are left even and quiet for a
// wordmark.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_lightSweep;  // speed of the sweep and lamp swing         (default 0.5)
uniform float u_depth;       // deboss depth in CSS px                    (default 5.0)
uniform float u_markSize;    // emblem radius, fraction of frame height   (default 0.27)
uniform float u_shine;       // foil specular and flash strength          (default 1.0)
uniform float u_grain;       // card fibre, laid-line and tooth strength   (default 0.6)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const float PI = 3.14159265;

// ---- hash / noise ------------------------------------------------------------
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
// card fibre: 3 octaves, stretched along x like a laid stock
float fibre(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * vnoise(p);
    p = p * 2.1 + vec2(7.3, 3.1);
    amp *= 0.5;
  }
  return v;
}

// ---- the mark ------------------------------------------------------------------
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
// signed distance to the emblem in mark-local units (outer radius 1.0).
// Negative inside the foil. A union of thin strokes and one solid boss.
float markSD(vec2 q) {
  float len = length(q);
  float ring  = abs(len - 1.0) - 0.075;            // heavy outer ring
  float hair  = abs(len - 0.80) - 0.014;           // hairline inner ring
  // interlaced octagram: two square outlines, one turned 45 degrees
  float hs = 0.535;                                // half side, corners at r ~0.757
  float sq1 = abs(sdBox(q, vec2(hs))) - 0.028;
  float c45 = 0.70710678;
  vec2  qr  = vec2(q.x * c45 - q.y * c45, q.x * c45 + q.y * c45);
  float sq2 = abs(sdBox(qr, vec2(hs))) - 0.028;
  float boss = len - 0.13;                         // solid centre disc
  return min(min(ring, hair), min(min(sq1, sq2), boss));
}

// stamp height field (device px) from the mark SDF (device px). The foil area
// is pressed down by depth; the paper slopes into it across the bevel and
// rises in a faint bruise ridge just outside the die edge.
float stampH(float sd, float depth, float bevel) {
  float press = smoothstep(bevel, -bevel * 0.45, sd);
  float ridge = exp(-(sd - bevel * 1.6) * (sd - bevel * 1.6) / (bevel * bevel * 2.5)) * step(0.0, sd);
  return -depth * press + depth * 0.10 * ridge;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  uv  = fc / res;
  float aspect = res.x / res.y;
  float t   = u_time;

  // ---- palette with house fallback (headless can leave the array zeroed) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec3 LUMW = vec3(0.299, 0.587, 0.114);

  // ---- materials from the palette ------------------------------------------
  // card: the darkest entry pulled most of the way to grey and pinned dark, so
  // it reads as coloured stock (a warm brown, a slate, a navy) not a colour field
  float l3 = dot(c3, LUMW);
  vec3  cardAlb = mix(vec3(l3), c3, 0.30) / max(l3, 0.05) * 0.165;
  // foil: a metal tinted between the lightest and first entries, pinned bright
  vec3  foilMix = mix(c0, c2, 0.62);
  float lf = dot(foilMix, LUMW);
  vec3  foilAlb = mix(vec3(lf), foilMix, 0.78) / max(lf, 0.05) * 0.70;

  // ---- the lamp: parked just off the upper left corner, swinging slowly -------
  float spd   = max(u_lightSweep, 0.0);
  float swing = t * spd * 0.35 + 2.1;
  vec2  fp    = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  // lamp position in frame units, a little outside the corner
  vec2  lampP = vec2(0.62 * aspect + 0.22 + 0.30 * sin(swing * 0.6),
                      0.78 + 0.22 * sin(swing * 0.9));
  vec2  toLamp = lampP - fp;
  float dLamp  = length(toLamp);
  float el     = 0.40 + 0.05 * sin(swing * 0.7);  // elevation above the card
  vec3  L      = normalize(vec3(toLamp / max(dLamp, 1e-3) * cos(el), sin(el)));
  vec3  V      = vec3(0.0, 0.0, 1.0);
  vec3  H      = normalize(L + V);
  // inverse-square style falloff across the sheet: bright corner, even fade.
  // The far corner keeps a floor so the wordmark region stays readable.
  float spatial = 0.10 + 3.2 / (1.0 + dLamp * dLamp * 1.3);
  float spatialF = sqrt(spatial) * 0.85;           // metal sees the room more than the lamp

  // ---- card texture ----------------------------------------------------------
  float grain = clamp(u_grain, 0.0, 1.0);
  // fibre height field and its slope (finite differences, no derivatives)
  vec2  fq  = fc / pr * vec2(0.42, 0.95);          // fine, stretched along x
  float e   = 0.6;
  float f0  = fibre(fq);
  float fx  = fibre(fq + vec2(e, 0.0)) - f0;
  float fy  = fibre(fq + vec2(0.0, e)) - f0;
  // long loose fibres: a very stretched noise, occasional bright strands
  vec2  sq  = fc / pr * vec2(0.022, 0.36) + vec2(3.0, 11.0);
  float s0  = vnoise(sq);
  float sy  = vnoise(sq + vec2(0.0, 0.25)) - s0;
  float strand = smoothstep(0.64, 0.80, s0) * 0.30;
  // laid lines: a soft periodic ridge across the sheet
  float laid = sin(fc.y / pr * 2.0 * PI / 7.5 + f0 * 2.0) * 0.5 + 0.5;
  // per-pixel tooth, kept small so it reads as stock not static
  float tooth = vnoise(fc / pr * 0.9 + vec2(31.0, 17.0));

  // ---- the stamp: height, normal, masks ---------------------------------------
  float R    = max(u_markSize, 0.05) * res.y;      // emblem radius, device px
  vec2  C    = vec2(res.x * 0.22, res.y * 0.50);   // left third, room on the right
  float depth = max(u_depth, 0.0) * pr;
  float bevel = 3.6 * pr;
  float epx   = 1.2 * pr;                          // finite-difference step, device px

  float sd  = markSD((fc - C) / R) * R;
  float sdx = markSD((fc + vec2(epx, 0.0) - C) / R) * R;
  float sdX = markSD((fc - vec2(epx, 0.0) - C) / R) * R;
  float sdy = markSD((fc + vec2(0.0, epx) - C) / R) * R;
  float sdY = markSD((fc - vec2(0.0, epx) - C) / R) * R;

  float h0 = stampH(sd, depth, bevel);
  float hx = (stampH(sdx, depth, bevel) - stampH(sdX, depth, bevel)) / (2.0 * epx);
  float hy = (stampH(sdy, depth, bevel) - stampH(sdY, depth, bevel)) / (2.0 * epx);
  // outward direction of the die edge, for occlusion, rim and brush terms
  vec2  g  = vec2(sdx - sdX, sdy - sdY) / (2.0 * epx);
  float gl = length(g);
  vec2  gn = gl > 1e-4 ? g / gl : vec2(0.0, 1.0);

  // foil covers the pressed floor; the bevel band is still paper
  float foilM = 1.0 - smoothstep(-1.2 * pr, 0.3 * pr, sd);

  // ---- card shading -----------------------------------------------------------
  // paper normal: stamp slope + fibre and strand slopes scaled by grain
  vec3 nC = normalize(vec3(-hx - fx * 2.2 * grain,
                           -hy - fy * 2.2 * grain - sy * 0.7 * grain, 1.0));
  float dC = max(dot(nC, L), 0.0);
  float paperShade = 0.30 + 1.45 * dC;             // ambient + raking diffuse
  paperShade *= 1.0 - grain * 0.07 * (laid - 0.5);
  paperShade *= 1.0 + grain * 0.08 * (tooth - 0.5);
  paperShade *= 1.0 + grain * strand;
  // the die bruises the stock: a hair darker just around the mark
  paperShade *= 1.0 - 0.10 * exp(-max(sd, 0.0) / (bevel * 2.0));
  // a low sheen on the coated stock where the lamp glances off it
  float sC  = max(dot(nC, H), 0.0);
  float sC2 = sC * sC; float sC4 = sC2 * sC2; float sC8 = sC4 * sC4;
  vec3 card = cardAlb * paperShade * spatial + cardAlb * sC8 * sC8 * 0.9 * spatial;

  // ---- foil shading -----------------------------------------------------------
  // the foil floor follows a gentle undulation of the stock, so a soft sheen
  // gradient crosses the mark instead of a flat fill; plus a tiny crinkle
  vec2  wq  = fc / (R * 1.3) + vec2(2.0, 5.0);
  float w0  = vnoise(wq);
  float wx  = vnoise(wq + vec2(0.05, 0.0)) - w0;
  float wy  = vnoise(wq + vec2(0.0, 0.05)) - w0;
  float crk = (tooth - 0.5) * 0.05;
  vec3 nF = normalize(vec3(-hx * 0.6 - wx * 3.2 + crk, -hy * 0.6 - wy * 3.2 - crk, 1.0));
  // reflected view vector into a broad studio environment: a bright band whose
  // direction tracks the lamp, over a dim floor
  vec3  Rv   = reflect(-V, nF);
  vec2  bandDir = normalize(L.xy);
  float band = smoothstep(-0.55, 0.45, dot(Rv.xy, bandDir) * 3.0 + Rv.z * 0.4 - 0.25);
  float env  = 0.22 + 0.78 * band;
  float dF   = max(dot(nF, L), 0.0);
  // brushed finish: the brush runs ALONG each stroke (perpendicular to the die
  // edge), so the highlight is a streak that follows rings and bars. Kajiya-Kay
  // style: bright where the half vector is perpendicular to the brush tangent.
  vec3  T    = vec3(-gn.y, gn.x, 0.0);
  float TdH  = dot(T, H);
  float sinTH = sqrt(max(1.0 - TdH * TdH, 0.0));
  float a2 = sinTH * sinTH; float a4 = a2 * a2; float a16 = a4 * a4 * a4 * a4;
  float aniso = a16 * a16 * a16 * smoothstep(0.0, 0.35, dF);
  // the fine brush lines themselves, as a hairline modulation along T
  float brush = vnoise(vec2(dot(fc, gn), dot(fc, T.xy) * 0.04) * 0.8 + 9.0);
  float sF   = max(dot(nF, H), 0.0);
  float s2   = sF * sF;
  float s4   = s2 * s2;
  float s16  = s4 * s4 * s4 * s4;
  float shine = max(u_shine, 0.0);
  float spec = (aniso * 1.1 + s16 * s16 * 0.6 + s4 * s2 * 0.25) * shine;
  vec3 foil = foilAlb * (env * 0.85 + dF * 0.30) * (0.92 + 0.16 * brush) * spatialF
            + mix(foilAlb, vec3(1.0), 0.55) * spec;

  // light sweep: a soft bright bar crosses the sheet on a loop and the foil
  // catches it as a flash. The bar is only visible in the foil (a mirror sees
  // the moving light; the matte card does not).
  vec2  swDir  = normalize(vec2(1.0, -0.55));
  float swPos  = mix(-1.5, 1.7, fract(t * spd * 0.09 + 0.62));
  float swD    = dot(fp, swDir) - swPos;
  float flash  = exp(-swD * swD * 28.0) * (0.55 + 0.45 * band);
  foil += mix(foilAlb, vec3(1.0), 0.7) * flash * (0.9 + 0.6 * aniso) * shine * 0.9;
  // the coated stock catches a whisper of the same sweep as a broad sheen
  card += cardAlb * flash * 0.9 * (0.6 + 0.4 * sC2);

  // contact occlusion inside the recess against the wall that faces the light
  float toLight = dot(gn, L.xy);
  float dClamp  = clamp(depth / (3.0 * pr), 0.0, 1.0);
  float occ = max(toLight, 0.0) * exp(-max(-sd, 0.0) / (bevel * 1.4)) * 0.55;
  foil *= 1.0 - occ * dClamp;
  // and a soft wall shadow that also reaches a little onto the paper bevel
  float wall = max(toLight, 0.0) * exp(-abs(sd) / (bevel * 0.9)) * 0.40 * dClamp;
  card *= 1.0 - wall;
  // the lit rim: the bevel facing away from the wall catches the lamp hard
  float rim = max(-toLight, 0.0) * exp(-abs(sd - bevel * 0.5) / (bevel * 0.6)) * 0.6 * dClamp;
  card += cardAlb * rim * 2.2 * spatialF;

  // ---- composite ----------------------------------------------------------------
  vec3 col = mix(card, foil, foilM);

  // optional pointer flourish: the pointer adds a faint second highlight on the
  // foil only, gated to zero at rest (u_mouse == 0 means no pointer)
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  if (mAmt > 0.002) {
    vec3 Lm = normalize(vec3((u_mouse - fc) / res.y, 0.6));
    vec3 Hm = normalize(Lm + V);
    float sm = max(dot(nF, Hm), 0.0);
    float sm2 = sm * sm; float sm4 = sm2 * sm2; float sm16 = sm4 * sm4 * sm4 * sm4;
    col += mix(foilAlb, vec3(1.0), 0.5) * sm16 * sm16 * 0.6 * mAmt * foilM;
  }

  col = col / (1.0 + col * 0.18);
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
