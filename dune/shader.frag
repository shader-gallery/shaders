// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// dune --- a sand sea from directly above at night (family: Strata)
//
// Long sinuous crest lines from anisotropic ridged noise, each crest shaded
// asymmetrically: a bright lit windward face that falls off gradually on one
// side of the line and a short dark slip face that drops sharply on the other,
// so the field reads as moonlit relief rather than flat strokes. Crests bend,
// fork and reconnect across the frame; hue drifts subtly through the palette
// down the transport direction; interdune basins rest at the near-black base.
//
// Motion: the whole ridge system translates and reshapes downwind with
// geological patience --- roughly one crest-spacing per minute at defaults ---
// crests merging and budding as the domain both drifts and morphs. Transport
// is continuous translation, evolution is phase-continuous: the march never
// stutters, no wrap, no reset.

precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // unused --- shader is fully presentable without it
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_wind;     // downwind transport + reshape rate; 0 becalms the sand (default 0.12)
uniform float u_spacing;  // ridge wavelength in css px, scaled by u_pixelRatio   (default 150)
uniform float u_relief;   // asymmetry between lit windward and dark slip faces    (default 0.7)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black house base
const float ANISO    = 4.0;    // along-crest stretch (crests run long & sinuous)
const float MORPH    = 0.040;  // evolution rate of the ridge shapes (per wind unit)
const vec2  WINDDIR  = vec2(0.0, 1.0); // downwind/transport direction (screen up->down)

// ---- 3D value noise + ridged fbm ----------------------------------------

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i);
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

const mat2 ROT2 = mat2(0.80, 0.60, -0.60, 0.80);

// anisotropic ridged fbm. (1 - |2n-1|) folds the noise into sharp ridge crests;
// the domain is stretched along the crest axis so ridges read as long sinuous
// lines rather than blobs. z is the slow evolution dimension.
float ridged(vec3 p) {
  // crests run horizontally (perpendicular to the vertical wind): stretch the
  // along-crest x axis so ridges run long & sinuous, keep the across-crest y
  // axis dense so successive crests stack and stay well separated downwind
  p.x /= ANISO;
  float s = 0.0, a = 0.55, norm = 0.0;
  for (int i = 0; i < 5; i++) {
    float n = vnoise(p);
    n = 1.0 - abs(2.0 * n - 1.0);   // ridge fold: 1 at crest, 0 in basin
    n = n * n;                       // sharpen the crest, deepen the basin
    s += a * n;
    norm += a;
    p = vec3(ROT2 * p.xy * 2.03, p.z * 1.27 + 11.3);
    a *= 0.52;
  }
  return s / norm; // ~[0,1], 1 at crests
}

// height -> palette ramp (tent-weighted blend, no dynamic indexing)
vec3 ramp(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  return a * max(0.0, 1.0 - abs(t))
       + b * max(0.0, 1.0 - abs(t - 1.0))
       + c * max(0.0, 1.0 - abs(t - 2.0))
       + d * max(0.0, 1.0 - abs(t - 3.0));
}

void main() {
  // palette + house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr  = max(u_pixelRatio, 0.25);
  vec2  res = u_resolution;
  float mn  = min(res.x, res.y);

  // crest spacing in device px -> noise frequency. one ridge period across the
  // squashed x axis spans roughly u_spacing css px.
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 8.0) * refScale * pr;
  float freq    = 1.0 / spacing;        // noise units per device px (pre-aniso)

  // continuous downwind transport: the whole field slides along WINDDIR. one
  // crest-spacing per ~minute at default wind -> very slow translate.
  float drift = u_time * u_wind * spacing * 0.020;   // device px translated
  vec2  fc    = gl_FragCoord.xy + WINDDIR * drift;

  // sample point in noise space (+ a fixed offset so the origin isn't special),
  // z = phase-continuous evolution so crests reshape, merge and bud
  float zEvo = u_time * u_wind * MORPH;
  vec3  q    = vec3(fc * freq + vec2(4.3, 1.7), zEvo);

  // heightfield + screen-space gradient (finite differences over a few px so the
  // slope is smooth enough to drive relief shading, not single-pixel noise)
  float e   = freq * 2.5;                    // ~2.5 device px in noise units
  float h   = ridged(q);
  float hx  = ridged(q + vec3(e, 0.0, 0.0));
  float hy  = ridged(q + vec3(0.0, e, 0.0));
  // gradient in height-per-(2.5px); amplify so slopes read as real relief
  vec2  grad = vec2(hx - h, hy - h) * (spacing * 0.18);

  float relief = clamp(u_relief, 0.0, 1.0);

  // --- crest line: bright thin ridge where h is near its local max ---------
  // realized ridged-fbm peaks well below 1; stretch the band so crests reach 1
  float hN = clamp((h - 0.30) * 2.2, 0.0, 1.0);
  // crest = top sliver of the height band, antialiased on h itself
  float crest = smoothstep(0.74, 0.96, hN);

  // --- asymmetric relief lighting -----------------------------------------
  // a low moon sits upwind: lightDir points from the windward side across each
  // crest. windward faces (gradient pointing upwind, i.e. against WINDDIR) catch
  // the light and glow with a broad gradual falloff; lee faces fall into shadow,
  // and the lee lip of each crest is the short hard-dark slip face.
  //   surface normal ~ (-grad, 1); light from -WINDDIR, low and grazing.
  vec3 nrm  = normalize(vec3(-grad, 1.0));
  vec3 ldir = normalize(vec3(-WINDDIR * (1.4 + 1.6 * relief), 0.55)); // grazing, asymmetry grows with relief
  float lambert = dot(nrm, ldir);                       // >0 windward-lit, <0 lee-shadow
  float windward = clamp(lambert, 0.0, 1.0);            // broad lit slope
  float lee      = clamp(-lambert, 0.0, 1.0);           // shadowed slip slope

  // moonlit relief: the gradual climb of the lit windward face up to the crest.
  // height gates it so basins stay dark; windward term carves the asymmetry.
  float lit      = hN * hN;                             // height-driven base luminance
  float litFace  = lit * windward;                      // windward bright
  // at relief 0 the asymmetry flattens to a faint near-symmetric line; at 1 it
  // cuts deep moonlit relief.
  float faceShade = mix(lit * 0.40, litFace * 1.45 + lit * 0.22, relief);
  // short hard dark slip band on the lee lip of each crest
  float slip = lee * crest;

  // --- colour: hue drifts down the transport direction --------------------
  // a slow gradient of palette position along WINDDIR + gentle time roll, so the
  // sand sea shifts hue downwind without a visible reset
  float along = dot(fc, WINDDIR) / (spacing * 7.0) + u_time * u_wind * 0.06;
  float hueT  = fract(along) ;
  // bias hue a touch by local height so crests and basins differ subtly
  vec3  sand  = ramp(fract(hueT + h * 0.12), c0, c1, c2, c3);

  // --- compose -------------------------------------------------------------
  vec3 col = BG;

  // the moonlit windward relief: broad soft fill, brightest just below the crest
  col += sand * faceShade * 1.05;

  // the crest line itself: a bright luminous lip, brightest on its lit side
  float crestGlow = crest * (0.45 + 0.55 * windward);
  col += sand * crestGlow * (0.6 + 0.7 * relief);

  // slip face: subtract light to carve the short hard dark drop on the lee side
  col *= 1.0 - slip * 0.85 * relief;

  // interdune basins: pull the deepest troughs down toward pure base, but leave
  // a faint sand tint so basins read as dark sand, not dead pixels
  float basin = smoothstep(0.40, 0.02, hN);
  col = mix(col, BG + sand * 0.012, basin * 0.55);

  // gentle vignette holding the corners down
  float r   = length((gl_FragCoord.xy - 0.5 * res) / (0.5 * res));
  float vig = 1.0 - 0.32 * smoothstep(0.6, 1.5, r);
  col *= vig;

  // de-banding dither
  col += (hash3(vec3(gl_FragCoord.xy, 0.5)) - 0.5) / 255.0;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
