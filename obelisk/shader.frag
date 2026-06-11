// obelisk (Plinth) - a single needle rising alone out of a rolling sea of fog
// under an empty near-black sky. One elongated, slightly tapering square shaft
// crowned by a beveled pyramidion, raymarched as a true 3D solid (fixed-step
// SDF marching with constant bounds). The fog sea below is a low-octave FBM
// surface tinted palette colour 0 with crest highlights of colour 1, lapping
// partway up the shaft and hiding the ground. The shaft edge facing the sky
// glow carries a continuous hairline rim of colour 2 up its full height, and
// the pyramidion tip holds a faint star-point of colour 3 with a small halo.
// The camera rides a slow helical bob - a steady orbit whose altitude swells
// and settles - so the fog drops away to reveal the needle on the rise and
// climbs back over its base on the descent. The monument stands utterly still.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_orbitSpeed;  // how fast the camera spirals around the shaft   (default 0.2)
uniform float u_fogLevel;    // how high the rolling fog sea laps up the shaft  (default 0.7)
uniform float u_tipGlow;     // brightness of the pyramidion star-point + halo  (default 0.8)
uniform float u_rimGlow;     // strength of the hairline light up the lit edge  (default 1.0)

const vec3  BG      = vec3(0.035, 0.035, 0.043); // house near-black base
const float FL      = 1.6;    // focal length
const float ORBIT_R = 13.0;   // orbit radius around the shaft
const float SHAFT_H = 6.0;    // height of the square shaft below the cap
const float HALF_W  = 0.58;   // half-width of the shaft at its base
const float TAPER   = 0.16;   // fractional narrowing of the shaft toward the top
const float CAP_H   = 1.05;   // height of the pyramidion above the shaft
const float MAXDIST = 60.0;   // far clip for the march
const int   STEPS   = 110;    // raymarch steps (constant loop bound)

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// low-octave fbm for the fog-sea surface
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  v += a * vnoise(p);            p *= 2.02; a *= 0.5;
  v += a * vnoise(p);            p *= 2.03; a *= 0.5;
  v += a * vnoise(p);
  return v;
}

// box SDF
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// the monument: a tapering square shaft topped by a beveled pyramidion.
// returns the signed distance; p is in monument-local space (shaft centred on
// the y axis, base at y = 0).
float sdMonument(vec3 p) {
  float t = clamp(p.y / SHAFT_H, 0.0, 1.0);
  float hw = HALF_W * (1.0 - TAPER * t);
  vec3 sp = p - vec3(0.0, SHAFT_H * 0.5, 0.0);
  float shaft = sdBox(sp, vec3(hw, SHAFT_H * 0.5, hw));

  // pyramidion: cross-section shrinks linearly with height to a beveled point.
  float topW = HALF_W * (1.0 - TAPER);
  float ct = clamp((p.y - SHAFT_H) / CAP_H, 0.0, 1.0);
  float cw = topW * (1.0 - ct);
  cw = max(cw, 0.012);
  vec3 cp = p - vec3(0.0, SHAFT_H + CAP_H * 0.5, 0.0);
  float cap = sdBox(cp, vec3(cw, CAP_H * 0.5, cw));

  return min(shaft, cap);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(
    sdMonument(p + e.xyy) - sdMonument(p - e.xyy),
    sdMonument(p + e.yxy) - sdMonument(p - e.yxy),
    sdMonument(p + e.yyx) - sdMonument(p - e.yyx)
  ));
}

void main() {
  vec2 res = u_resolution;
  vec2 fc  = gl_FragCoord.xy;
  vec2 uv  = (fc - 0.5 * res) / max(res.y, 1.0);

  // Theme colours come from u_palette. Some headless poster contexts cannot
  // bind a vec3[] uniform, leaving it all-zero; fall back to midnight.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- camera: steady orbit + a slow altitude swell (helical bob) ---
  float spd  = max(u_orbitSpeed, 0.0);
  float ang  = u_time * spd * 0.5;
  float bob  = 0.5 + 0.5 * sin(u_time * spd * 0.21);
  float camY = 2.2 + bob * 4.0;                // eye height above the base
  vec3  ro   = vec3(sin(ang) * ORBIT_R, camY, cos(ang) * ORBIT_R);
  // look toward the upper-mid shaft so the needle + tip + sea + sky all frame
  vec3  ta   = vec3(0.0, 4.0, 0.0);

  vec3 fw = normalize(ta - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, ri);
  vec3 rd = normalize(ri * uv.x + up * uv.y + fw * FL);

  // sky-glow direction: one faint bright quarter of the empty sky. Fixed in
  // world space, so the rim catches different corners as the orbit turns.
  vec3 glowDir = normalize(vec3(0.55, 0.30, -0.78));

  // --- empty near-black sky with a faint glow gradient toward glowDir ---
  float skyUp = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  float skyGl = clamp(dot(rd, glowDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = BG * (0.5 + 0.5 * skyUp);
  sky += c2 * 0.06 * pow(skyGl, 3.0);
  sky += c1 * 0.020 * skyUp;

  vec3 col = sky;
  float sceneT = MAXDIST;     // depth of whatever we shade as the solid scene

  // --- raymarch the monument (sphere-tracing, constant bound) ---
  float t = 0.0;
  float hit = -1.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = sdMonument(p);
    if (d < 0.0012 * t + 0.001) { hit = t; break; }
    t += d * 0.85;
    if (t > MAXDIST) break;
  }

  if (hit > 0.0) {
    vec3 p  = ro + rd * hit;
    vec3 n  = calcNormal(p);
    float yr = clamp(p.y / (SHAFT_H + CAP_H), 0.0, 1.0);

    float sky2 = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 surf = BG * 0.5 + c1 * 0.05 * sky2 * sky2;

    float diff = clamp(dot(n, glowDir), 0.0, 1.0);
    surf += mix(c1, c2, yr) * 0.11 * diff;

    // continuous hairline rim of colour 2 on the edge facing the glow. a
    // sharp grazing core plus a softer wash so the lit edge reads up the
    // whole height and responds strongly to the rim-glow slider.
    float graze = 1.0 - clamp(dot(n, -rd), 0.0, 1.0);
    float face = clamp(dot(n, glowDir), 0.0, 1.0);
    float fmask = smoothstep(0.05, 0.7, face);
    float rimCore = pow(graze, 3.0) * fmask;          // hairline
    float rimWash = pow(graze, 1.2) * fmask;          // soft edge wash
    surf += c2 * max(u_rimGlow, 0.0) * (rimCore * 2.2 + rimWash * 0.85);

    // gentle distance dissolve into the sky for the far reaches of the shaft
    float fd = hit / MAXDIST;
    surf = mix(surf, sky, smoothstep(0.5, 1.0, fd) * 0.5);

    col = surf;
    sceneT = hit;
  }

  // --- pyramidion tip star-point + halo ---
  vec3 tipW = vec3(0.0, SHAFT_H + CAP_H, 0.0);
  vec3 toTip = tipW - ro;
  float tipDist = length(toTip);
  vec3 tipDir = toTip / max(tipDist, 1e-3);
  float onAxis = clamp(dot(rd, tipDir), 0.0, 1.0);
  float star = pow(onAxis, 12000.0);
  float halo = pow(onAxis, 90.0);                 // broader, more visible halo
  float tipVisible = 1.0;
  if (hit > 0.0 && hit < tipDist - 0.25 && onAxis < 0.9996) tipVisible = 0.0;
  float tg = max(u_tipGlow, 0.0);
  vec3 tipCol = c3 * tg * (star * 1.8 + halo * 0.35);
  col += tipCol * tipVisible;

  // --- fog sea: a rolling horizontal layer seen receding to a horizon ---
  // mean surface height set by the param; pyramidion + tip always above it.
  float fogTop = max(u_fogLevel, 0.0) * 2.6;   // world height of the mean surface
  if (rd.y < -1e-3) {
    float tf = (fogTop - ro.y) / rd.y;         // ray hits the mean fog plane
    if (tf > 0.0 && tf < sceneT) {             // only where not behind solid
      vec3 fp = ro + rd * tf;
      // rolling surface relief drives crest highlights (sea breathes slowly)
      float surfN = fbm(fp.xz * 0.16 + vec2(u_time * 0.03, u_time * 0.045));
      float crest = smoothstep(0.46, 0.82, surfN);
      vec3 fogCol = BG * 0.7 + c0 * (0.24 + 0.28 * surfN) + c1 * 0.42 * crest;
      // dissolve into the sky at the far horizon so the sea has a soft edge
      float fhz = smoothstep(0.0, MAXDIST * 0.55, tf);
      fogCol = mix(fogCol, sky, fhz * 0.92);
      // coverage: full deep in the sea, feathering out over a vertical band
      // near the waterline so the shaft pierces it rather than meeting a cut.
      // the rolling surface relief modulates the waterline for a soft lapping.
      float depth = fogTop - fp.y;             // > 0 once below mean surface
      float cover = smoothstep(-0.35, 0.6, depth + (surfN - 0.5) * 0.9);
      col = mix(col, fogCol, cover);
    }
  }

  // gentle vignette and a whisper of dither against banding in the fog/sky
  col *= 1.0 - 0.30 * smoothstep(0.42, 1.08, length(uv));
  col += (hash21(fc * 0.7 + fract(u_time)) - 0.5) * 0.006;

  col = max(col, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
