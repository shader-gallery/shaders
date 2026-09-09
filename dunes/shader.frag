// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// dunes (Strata) - a sand sea seen from a low vantage on a crest, the sun a
// few degrees above the horizon off to one side so its light rakes across the
// field. The terrain is a real height field marched from the camera: a
// system of transverse dunes with the asymmetric profile of the real thing,
// a long convex windward slope that rises to a sharp brink and a short steep
// slip face falling away downwind, the crest lines wandering sinuously and
// the dune heights swelling and dying along them. Fine wind ripples cross the
// windward faces (slip faces are avalanche-smoothed and carry almost none)
// and migrate slowly downwind. Shading is Lambert from the low sun with a
// marched soft shadow, so slip faces sit in long cool shadow while every
// ripple crest on the lit faces catches a rim of light, plus a sky ambient
// term, a grazing-angle sun glitter of individual sand grains, aerial haze
// into the horizon, and a thin veil of blowing sand streaming across the
// lowest sky. The camera drifts slowly along the crests.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;     // camera drift along the crests          (default 0.35)
uniform float u_spacing;   // dune wavelength, world units            (default 7.0)
uniform float u_relief;    // dune height                             (default 1.3)
uniform float u_ripple;    // wind ripple strength on the faces       (default 1.0)
uniform float u_sunAngle;  // sun elevation above the horizon, deg    (default 6.0)

const float PI = 3.14159265;

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

// wind blows along W (unit, xz plane); crests run along C, perpendicular
const vec2 W = vec2(-0.971,  0.240);
const vec2 C = vec2(-0.240, -0.971);

// the dune profile over one wavelength, f in 0..1 downwind. Windward rise
// with a rounded trough and a non-zero slope at the brink, then a slip face
// that leaves the brink sharp and eases into the next trough.
float duneProfile(float f) {
  const float brink = 0.72;
  float x = clamp(f / brink, 0.0, 1.0);
  float wind = x * x * (2.0 - x);
  float y = clamp((f - brink) / (1.0 - brink), 0.0, 1.0);
  float oy = 1.0 - y;
  float slip = oy * oy;
  return f < brink ? wind : slip;
}

// the big dune system alone (used for shadow rays and the march)
// returns height; also writes the phase f so callers know which face we are on
float duneBase(vec2 q, float t, out float f) {
  float spacing = max(u_spacing, 2.0);
  float d = dot(q, W);
  float a = dot(q, C);
  // crest lines snake along their length and the whole system creeps downwind
  float wander = (vnoise(vec2(a * 0.070, d * 0.030) + vec2(3.1, 7.7)) - 0.5) * 5.5
               + (vnoise(vec2(a * 0.21, d * 0.09) + vec2(1.3, 2.7)) - 0.5) * 1.6;
  float u = (d + wander - t * 0.08) / spacing;
  f = fract(u);
  float prof = duneProfile(f);
  // heights swell and die along the crest so no two dunes match
  float amp = 0.40 + 0.60 * vnoise(vec2(a * 0.09, floor(u) * 0.61) + vec2(9.0, 4.0));
  // a broad slow swell under everything, the older bigger draa the dunes ride on
  float swell = (vnoise(q * 0.028 + 21.0) - 0.5) * 2.2;
  return prof * amp * max(u_relief, 0.0) + swell;
}

// full terrain: dunes plus wind ripples, ripple amplitude fading with distance
float terrain(vec2 q, float t, float dist) {
  float f;
  float h = duneBase(q, t, f);
  float d = dot(q, W);
  float a = dot(q, C);
  // ripples live on the windward face; the slip face is avalanche-smooth
  float onWind = 1.0 - 0.85 * smoothstep(0.70, 0.74, f) * (1.0 - smoothstep(0.96, 1.0, f));
  // ripple crests wander a little and the train migrates downwind
  float rw = (vnoise(vec2(a * 1.3, d * 0.45) + 5.0) - 0.5) * 1.1;
  float rip = sin((d + rw) * 30.0 - t * 1.4);
  // asymmetric ripple: sharpen the crests a touch
  rip = rip * 0.7 + rip * rip * 0.3;
  float fade = exp(-dist * 0.075);
  return h + rip * 0.026 * max(u_ripple, 0.0) * onWind * fade;
}

vec3 terrainNormal(vec2 q, float t, float dist) {
  float e = 0.012 + 0.006 * dist;
  float hx1 = terrain(q + vec2(e, 0.0), t, dist);
  float hx0 = terrain(q - vec2(e, 0.0), t, dist);
  float hz1 = terrain(q + vec2(0.0, e), t, dist);
  float hz0 = terrain(q - vec2(0.0, e), t, dist);
  return normalize(vec3(hx0 - hx1, 2.0 * e, hz0 - hz1));
}

// soft shadow toward the sun over the base dune field
float sunShadow(vec3 p, vec3 L, float t) {
  float res = 1.0;
  float s = 0.25;
  for (int i = 0; i < 14; i++) {
    vec3 sp = p + L * s;
    float f;
    float h = duneBase(sp.xz, t, f);
    float gap = sp.y - h;
    res = min(res, 6.0 * gap / s);
    if (res < 0.0) break;
    s += 0.35 + s * 0.22;
  }
  return clamp(res, 0.0, 1.0);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2  sc     = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  float t      = u_time * clamp(u_speed, 0.0, 2.0);

  // ---- palette-derived materials: sand from the pale pole, sky from the dark
  float l0 = luma(c0), l1 = luma(c1), l2 = luma(c2), l3 = luma(c3);
  vec3 sandLit  = mix(vec3(0.82, 0.78, 0.70) * (0.75 + 0.35 * l2), c2, 0.42);
  vec3 sandDark = mix(vec3(0.20, 0.19, 0.20) * (0.6 + 0.6 * l3), c3, 0.45) * 0.55;
  vec3 sunCol   = mix(vec3(1.0, 0.93, 0.82), c1, 0.50) * 1.15;
  vec3 skyTop   = mix(vec3(l3) * 0.35, c3, 0.55) * 0.55;
  vec3 skyHor   = mix(vec3(l0) * 0.8, c0, 0.55) * 0.75;
  vec3 hazeCol  = mix(skyHor, sunCol, 0.35);

  // ---- sun, low and near the right edge of the frame
  float el  = radians(clamp(u_sunAngle, 1.0, 30.0));
  vec3  L   = normalize(vec3(0.68 * cos(el), sin(el), 0.73 * cos(el)));

  // ---- camera: standing on the field, drifting along the crests
  float pitch = 0.24;
  vec2  camXZ = C * t * 1.1 + vec2(3.0, -2.0);
  // stand on top of the local draa swell, above the dune tops, so the near
  // field never walls off the view
  float swellCam = (vnoise(camXZ * 0.028 + 21.0) - 0.5) * 2.2;
  vec3  ro = vec3(camXZ.x, swellCam + max(u_relief, 0.0) + 1.5, camXZ.y);
  vec3  rd = normalize(vec3(sc.x, sc.y - pitch, 1.55));

  // ---- march the height field
  float hMax = max(u_relief, 0.0) + 1.3 + 2.0;
  float dist = 0.0, prevD = 0.0, prevGap = 1.0;
  float hit = 0.0;
  vec3  p = ro;
  for (int i = 0; i < 80; i++) {
    p = ro + rd * dist;
    if (p.y > hMax && rd.y >= 0.0) break;
    float gap = p.y - terrain(p.xz, t, dist);
    if (gap < 0.0012 * dist) {
      // linear refine between the last two samples
      dist = mix(prevD, dist, clamp(prevGap / max(prevGap - gap, 1e-4), 0.0, 1.0));
      hit = 1.0;
      break;
    }
    prevD = dist; prevGap = gap;
    // steps are capped so grazing rays cannot skip a whole dune crest
    dist += clamp(gap * 0.6, 0.03 + 0.006 * dist, 1.2);
    if (dist > 52.0) break;
  }

  // ---- sky: gradient, sun glow, sun disc, horizon haze band
  float sunDot  = max(dot(rd, L), 0.0);
  float up      = sqrt(clamp(rd.y * 2.4, 0.0, 1.0));
  vec3  sky     = mix(skyHor, skyTop, up);
  float glow    = exp(-(1.0 - sunDot) * 26.0);
  float glow2   = exp(-(1.0 - sunDot) * 4.5);
  sky += sunCol * (glow * 0.55 + glow2 * 0.12);
  float disc    = smoothstep(0.99935, 0.99965, sunDot);
  sky = mix(sky, sunCol * 1.6, disc);
  // haze thickening toward the horizon line
  float hazeBand = exp(-max(rd.y, 0.0) * 14.0);
  sky = mix(sky, hazeCol, hazeBand * 0.85);
  // thin high streaks, the last of the night haze lit from below
  float cir = vnoise(vec2(sc.x * 1.6 + t * 0.04, sc.y * 9.0) + 40.0) * 0.6
            + vnoise(vec2(sc.x * 3.7 - t * 0.03, sc.y * 21.0) + 60.0) * 0.4;
  sky *= 1.0 + (cir - 0.5) * 0.16 * smoothstep(0.0, 0.25, rd.y);

  vec3 col = sky;

  if (hit > 0.5) {
    p = ro + rd * dist;
    vec3  N   = terrainNormal(p.xz, t, dist);
    float f;
    float hb  = duneBase(p.xz, t, f);
    float ndl = max(dot(N, L), 0.0);
    float sh  = sunShadow(p + vec3(0.0, 0.02, 0.0), L, t);
    // brink: the crest line itself, a hair of extra light where sand is thinnest
    float brink = exp(-abs(f - 0.72) * 60.0);

    // sky ambient: more on upward faces, tinted toward the horizon colour
    vec3  amb = mix(skyHor, skyTop, 0.5 + 0.5 * N.y) * (0.55 + 0.45 * N.y);
    vec3  albedo = mix(sandDark, sandLit, 0.92);
    // slip faces are slightly darker and cooler: coarser avalanche sand
    albedo = mix(albedo, sandDark * 1.6, 0.35 * smoothstep(0.71, 0.76, f) * (1.0 - smoothstep(0.95, 1.0, f)));

    vec3 lit = albedo * (sunCol * ndl * sh * 1.5 + amb * 0.95 + sandDark * 0.5);

    // grazing sun glitter: individual grains flash where the face just catches
    // the sun; grains are a hash on the sand at a fixed world scale, fading with
    // distance so the far field does not sparkle to noise
    vec3  H     = normalize(L - rd);
    float ndh   = max(dot(N, H), 0.0);
    float spec  = ndh * ndh; spec *= spec; spec *= spec; spec *= spec; spec *= spec;
    float cell  = 1.0 / (0.012 + dist * 0.0045);
    vec2  gq    = p.xz * cell;
    float grain = hash21(floor(gq) + floor(t * 0.5));
    float gdot  = smoothstep(0.5, 0.15, length(fract(gq) - 0.5));
    float glint = spec * step(0.975, grain) * gdot * sh * exp(-dist * 0.10) * 3.0;
    lit += sunCol * glint;
    // the brink catches a fine line of backlight
    lit += sunCol * brink * 0.28 * sh;

    // aerial perspective: distance into the haze. The far field converges on
    // the sky colour in the same direction, so distant crests melt into the
    // horizon instead of standing against it
    float fog = 0.88 * (1.0 - exp(-dist * dist * 0.0012));
    vec3  fogCol = sky;
    col = mix(lit, fogCol, fog);
    // and the low blowing-sand layer over the far field
    float far = smoothstep(12.0, 45.0, dist);
    col = mix(col, fogCol, far * 0.20);
  }

  // ---- blowing sand: a thin streaky veil drifting across the horizon band
  float horizY = pitch;
  float above  = sc.y - horizY;
  float veilW  = exp(-abs(above + 0.02) * 9.0);
  vec2  vq     = vec2(sc.x * 2.2 - t * 0.55, sc.y * 26.0);
  float veil   = vnoise(vq + 3.0) * 0.6 + vnoise(vq * vec2(2.3, 1.7) - t * 0.4) * 0.4;
  veil = smoothstep(0.45, 0.85, veil) * veilW * 0.22;
  col = mix(col, hazeCol * 1.05, veil);

  // sun glare bleeding over the near-horizon
  col += sunCol * exp(-length(sc - vec2(1.44, horizY + 0.02)) * 3.2) * 0.10;

  // fine film grain in the sand at device pixel scale keeps the surface matte
  float fg = hash21(gl_FragCoord.xy + fract(u_time) * 7.0) - 0.5;
  col += fg * 0.012;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
