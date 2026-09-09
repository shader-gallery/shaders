// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// waxseal (Burnish) - a wax seal pressed onto parchment, seen under warm
// raking light from the upper left. The sheet fills the frame: long laid
// fibres in two directions, a cloudy pulp mottle, a fine tooth speckle, and
// broad soft wrinkles whose shading shows the light direction. Age gathers at
// the borders as a translucent brown stain that stays clear of the middle, so
// the left two thirds of the sheet stay even and quiet for a wordmark. The
// seal sits right of centre: an irregular squeezed-out wax disc with a rim
// bead and one drip lobe, its face pressed down by the die and a raised mark
// left standing on it, a faceted eight-point compass rose inside a beaded
// legend ring and a border ring. The wax is a real height field: normals come
// from finite differences, lit with diffuse, a tight glossy specular and a
// warm subsurface glow where the light passes through the thin shoulder. The
// seal casts a soft shadow and a contact darkening onto the paper, and two
// ribbon tails run out from under it toward the lower right corner. The light
// sweeps slowly through a shallow arc so the specular walks across the rose
// and the facets trade brightness, with a faint candle flicker in the level.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) - unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_sealSize;  // wax disc radius in css px                (default 120)
uniform float u_relief;    // depth of the die impression and mark     (default 1.0)
uniform float u_sweep;     // speed of the raking light sweep          (default 0.3)
uniform float u_age;       // border staining and foxing on the sheet  (default 0.6)
uniform float u_gloss;     // wax specular strength                    (default 0.8)

const float TAU = 6.28318530718;

// ---------------------------------------------------------------- noise ---
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
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(13.1, 7.7);
    amp *= 0.5;
  }
  return v;
}

// -------------------------------------------------------- seal geometry ---
// q is seal-local, in units of the wax radius (1.0 = nominal edge).
// Signed distance-ish to the squeezed wax outline: negative inside.
float sealEdge(vec2 q) {
  float r = length(q);
  vec2  nd = q / max(r, 1e-4);
  float a = atan(q.y, q.x);
  // low frequency wobble so the blob reads as pressed wax, not a coin
  float wob = 0.045 * sin(a * 3.0 + 0.7)
            + 0.030 * sin(a * 5.0 - 1.9)
            + 0.018 * sin(a * 7.0 + 3.1);
  // one drip lobe toward the lower left where the wax ran before it set
  float lobe = 0.16 * smoothstep(0.80, 1.0, dot(nd, normalize(vec2(-0.55, -0.83))));
  return r - (1.0 + wob + lobe);
}

// Raised design left by the die on the pressed face. Returns 0..1 height.
float markHeight(vec2 q) {
  float r = length(q);
  float a = atan(q.y, q.x);
  // border ring at 0.70
  float ring = 1.0 - smoothstep(0.0, 0.028, abs(r - 0.70));
  // beaded legend: 28 small domes on the 0.585 circle, standing in for letters
  float k  = a * 28.0 / TAU;
  float dx = (fract(k) - 0.5) * (TAU / 28.0) * 0.585;
  float dy = r - 0.585;
  float bl = length(vec2(dx, dy)) / 0.030;
  float bead = sqrt(max(0.0, 1.0 - bl * bl));
  // eight-point compass rose with straight kite edges: four long points on
  // the axes, four short on the diagonals. Each 45 degree sector holds one
  // point; b is the angle off that point axis, and the kite edge in polar
  // form is len*w / (w*cos b + len*|sin b|). Each point is a ridge sloping
  // down to both edges, with one side of the ridge held lower as a facet.
  float sec  = floor((a + TAU / 16.0) / (TAU / 8.0));
  float b    = a - sec * (TAU / 8.0);
  float lng  = 1.0 - mod(sec + 8.0, 2.0);          // 1 on axis points, 0 on diagonals
  float len  = mix(0.30, 0.51, lng);
  float w    = mix(0.062, 0.085, lng);
  float rs   = len * w / (w * cos(b) + len * abs(sin(b)));
  float star = smoothstep(rs, rs - 0.02, r);
  float ridge = 1.0 - 0.45 * clamp(abs(r * sin(b)) / w, 0.0, 1.0);
  float facet = smoothstep(-0.04, 0.04, b);
  star *= ridge * mix(0.70, 1.0, facet);
  // hub disc and a pin at the very centre
  float hub = smoothstep(0.11, 0.08, r);
  float pin = smoothstep(0.035, 0.015, r);
  return max(ring, max(max(bead, star), hub * 0.8 + pin * 0.4));
}

// Full wax height field in units of the radius (about 0..1.25).
float waxHeight(vec2 q, float relief) {
  float d = sealEdge(q);
  // rounded shoulder from the paper up to the plateau
  float body = smoothstep(0.0, -0.17, d);
  // squeezed rim bead riding the shoulder
  float dd = (d + 0.13) / 0.075;
  float bead = 0.20 * exp(-dd * dd);
  // the die presses the face down inside the border, the mark stands up on it
  float r = length(q);
  float face = smoothstep(0.79, 0.74, r);
  float h = body * (1.0 + bead);
  h -= 0.26 * relief * face;
  h += 0.36 * relief * face * markHeight(q);
  // wax lumpiness on the plateau, none on the pressed face
  h += 0.035 * (vnoise(q * 7.0 + 3.0) - 0.5) * body * (1.0 - face);
  return h;
}

void main() {
  float pr = max(u_pixelRatio, 0.5);
  vec2  res = u_resolution;
  vec2  fc  = gl_FragCoord.xy;
  vec2  p   = fc / pr;                 // css px, origin bottom left
  vec2  csz = res / pr;
  float t   = u_time;

  // ---- palette fallback (headless contexts can zero the array) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  float R      = max(u_sealSize, 30.0);
  float relief = clamp(u_relief, 0.0, 2.0);
  float age    = clamp(u_age, 0.0, 1.0);
  float gloss  = max(u_gloss, 0.0);

  // ---- light: raking from the upper left, sweeping a shallow arc ----
  float ang  = 2.35 + 0.55 * sin(t * u_sweep * 0.5);
  vec2  L2   = vec2(cos(ang), sin(ang));
  vec3  L    = normalize(vec3(L2 * 0.88, 0.48));
  vec3  V    = vec3(0.0, 0.0, 1.0);
  vec3  H    = normalize(L + V);
  // candle level: a slow breathing flicker in the overall light
  float flick = 0.97 + 0.03 * vnoise(vec2(t * 2.7, 1.3)) + 0.015 * vnoise(vec2(t * 9.1, 5.7));

  // ---- materials from the palette ----
  // parchment: a cream tinted a little by the palest palette entry
  vec3  cream = vec3(0.99, 0.94, 0.80);
  vec3  pale  = c2 / max(max(c2.r, max(c2.g, c2.b)), 0.25);
  vec3  paperC = cream * mix(vec3(1.0), pale, 0.09);
  // wax: the deep end of the palette, darkened toward pigment
  vec3  waxC  = mix(c3, c0, 0.30);
  float wl    = dot(waxC, vec3(0.299, 0.587, 0.114));
  waxC = mix(waxC, waxC * (0.24 / max(wl, 0.2)), 0.7) * 0.9;
  vec3  waxGlow = mix(c3, c1, 0.5);           // subsurface colour, warmer
  // ribbon: the middle palette entry pulled toward grey cloth
  vec3  ribC  = mix(mix(c1, c2, 0.25), vec3(dot(c1, vec3(0.333))), 0.30) * 1.15;

  // ---- parchment surface: wrinkles, fibres, tooth ----
  // broad wrinkle height (css px), lit as a surface with finite differences
  // two scales: broad cockle of the sheet plus a few sharper creases where
  // the page was once folded, so the raking light has real relief to catch
  vec2  wq = p * 0.0045;
  float e  = 0.0045 * 2.0;
  float h0 = fbm(wq)                   + 0.5 * fbm(p * 0.0016 + 50.0);
  float hx = fbm(wq + vec2(e, 0.0))    + 0.5 * fbm((p + vec2(2.0, 0.0)) * 0.0016 + 50.0);
  float hy = fbm(wq + vec2(0.0, e))    + 0.5 * fbm((p + vec2(0.0, 2.0)) * 0.0016 + 50.0);
  vec3  pn = normalize(vec3(-(hx - h0) * 7.0, -(hy - h0) * 7.0, 1.0));
  float pdiff = 0.66 + 0.46 * max(dot(pn, L), 0.0);
  // laid fibres in two directions plus a fine speckle tooth
  float fibA = vnoise(p * vec2(0.055, 1.35) + 7.0);
  float fibB = vnoise(vec2(p.x * 0.42 + p.y * 0.91, -p.x * 0.91 + p.y * 0.42) * vec2(1.35, 0.055) + 21.0);
  float mottle = fbm(p * 0.012 + 40.0);
  float tooth = hash21(floor(p * 1.7));
  float fibre = (fibA - 0.5) * 0.09 + (fibB - 0.5) * 0.06 + (mottle - 0.5) * 0.14 + (tooth - 0.5) * 0.035;
  // raking falloff across the sheet: brighter toward the light source corner
  vec2  cn = (p - csz * 0.5) / (csz.y * 0.5);
  float fall = 0.84 + 0.16 * clamp(dot(cn, L2) * 0.5 + 0.5, 0.0, 1.0);

  vec3 paper = paperC * (pdiff * fall * flick * 1.07) * (1.0 + fibre);

  // age: brown stain creeping in from the borders, foxing spots, kept out of the middle
  vec2  ed = min(p, csz - p) / csz.y;          // distance to nearest frame edge
  float border = 1.0 - smoothstep(0.0, 0.30, min(ed.x, ed.y));
  float stainN = fbm(p * 0.006 + 9.0);
  float stain = border * smoothstep(0.30, 0.75, stainN + border * 0.35);
  float fox = smoothstep(0.78, 0.92, fbm(p * 0.05 + 3.0)) * border * 0.5;
  vec3  stainC = vec3(0.62, 0.45, 0.28);
  paper *= mix(vec3(1.0), stainC, (stain * 0.9 + fox) * age);
  // soft darkening right at the sheet edge so the frame reads as an old page
  paper *= 1.0 - 0.18 * age * (1.0 - smoothstep(0.0, 0.08, min(ed.x, ed.y)));

  // ---- seal placement: right of centre, leaving the left clear ----
  vec2  ctr = vec2(csz.x * 0.735, csz.y * 0.53);
  vec2  q   = (p - ctr) / R;
  float d   = sealEdge(q);

  // ---- ribbon tails running out from under the seal to the lower right ----
  vec3 col = paper;
  float ribbonMask = 0.0;
  float ribbonShade = 0.0;
  {
    // two straight tails, each a strip along a direction from the centre
    vec2 dirs[2];
    dirs[0] = normalize(vec2(0.62, -0.78));
    dirs[1] = normalize(vec2(0.86, -0.51));
    for (int i = 0; i < 2; i++) {
      vec2  dr = dirs[i];
      float along = dot(q, dr);
      float across = dot(q, vec2(-dr.y, dr.x));
      float wHalf = 0.21;
      // the tail starts under the seal and runs off frame, with a slight curl
      across += 0.06 * sin(along * 1.7 + float(i) * 2.0);
      float strip = (1.0 - smoothstep(wHalf - 0.012, wHalf + 0.012, abs(across)))
                  * smoothstep(0.2, 0.35, along);
      // cloth shading: a shallow cylinder across the width lit by the same
      // raking light, a soft fold wave along the length, and a satin sheen
      float u  = across / wHalf;
      vec3  nr = normalize(vec3(vec2(-dr.y, dr.x) * u * 0.9, 0.75));
      float fold = 0.88 + 0.12 * sin(along * 3.2 + float(i) * 1.3 + 0.6);
      float lit = (0.45 + 0.65 * max(dot(nr, L), 0.0)) * fold;
      lit += 0.55 * pow(max(dot(nr, H), 0.0), 10.0);
      ribbonShade = max(ribbonShade, lit * strip);
      ribbonMask = max(ribbonMask, strip);
    }
    // ribbon shadow on the paper, offset away from the light
    float shTail = 0.0;
    for (int i = 0; i < 2; i++) {
      vec2  dr = dirs[i];
      vec2  qs = q + L2 * 0.05;
      float along = dot(qs, dr);
      float across = dot(qs, vec2(-dr.y, dr.x)) + 0.06 * sin(along * 1.7 + float(i) * 2.0);
      shTail = max(shTail, (1.0 - smoothstep(0.17, 0.28, abs(across))) * smoothstep(0.2, 0.35, along));
    }
    col *= 1.0 - 0.28 * shTail * (1.0 - ribbonMask);
    col = mix(col, ribC * ribbonShade * flick * fall, ribbonMask);
  }

  // ---- seal shadow and contact darkening on the sheet ----
  float dSh = sealEdge(q + L2 * 0.11);
  float shadow = 1.0 - smoothstep(-0.02, 0.16, dSh);
  float contact = exp(-max(d, 0.0) / 0.06);
  col *= 1.0 - 0.42 * shadow * (1.0 - 0.5 * ribbonMask);
  col *= 1.0 - 0.22 * contact * (1.0 - 0.5 * ribbonMask);

  // ---- the wax itself ----
  float inside = 1.0 - smoothstep(-0.006, 0.006, d);
  if (inside > 0.001) {
    float eps = 1.6 / R;                        // finite difference step, ~1.6 css px
    float w0 = waxHeight(q, relief);
    float wx = waxHeight(q + vec2(eps, 0.0), relief);
    float wy = waxHeight(q + vec2(0.0, eps), relief);
    vec3  n  = normalize(vec3(-(wx - w0) / eps * 0.09, -(wy - w0) / eps * 0.09, 1.0));

    float ndl  = dot(n, L);
    float diff = 0.30 + 0.70 * max(ndl, 0.0);
    // recess occlusion: the pressed face and the low grooves sit in shade
    float occ  = mix(0.72, 1.0, clamp(w0, 0.0, 1.0));
    // glossy wax: a tight specular that walks with the light
    float spec = pow(max(dot(n, H), 0.0), 60.0) * gloss * 0.9;
    spec += pow(max(dot(n, H), 0.0), 8.0) * gloss * 0.18;
    // fresnel sheen toward grazing normals on the shoulder
    float fres = pow(1.0 - max(n.z, 0.0), 3.0);
    // subsurface: the thin shoulder glows on the side facing away from the light
    float thin = 1.0 - smoothstep(0.0, -0.20, d);
    float back = 0.5 - 0.5 * dot(normalize(q + 1e-4), L2);
    float sss  = thin * (0.35 + 0.65 * back) * 0.9;

    vec3 wax = waxC * diff * occ * flick;
    wax += waxGlow * sss * 0.55;
    wax += vec3(1.0, 0.96, 0.90) * spec * flick;
    wax += mix(waxC, vec3(1.0), 0.5) * fres * 0.25;
    col = mix(col, wax, inside);
  }

  // gentle filmic compress and clamp
  col = col / (1.0 + col * 0.12);
  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
