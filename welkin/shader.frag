// welkin (Wake) — raymarched volumetric clouds under an analytic sky.
//
// A real volume, not a noise plane: the view ray is marched through a cloud slab
// between two heights, sampling a 3D FBM density field shaped by a cumulus
// vertical profile (flat-ish base, rounded billowing top). At every step a short
// secondary march toward the sun gives self-shadowing (Beer–Lambert), and the
// scattered light is integrated front-to-back with a powder term and a
// Henyey-Greenstein phase so backlit edges flare and deep cores stay dark.
// Behind it sits an analytic Rayleigh/Mie sky with a soft sun. Everything advects
// continuously on the wind, so there is no loop seam.
//
// Inspired by github.com/kotivas/skygl (precomputed scattering + raymarched
// volumetric clouds), reduced to a single real-time pass and recoloured through
// the gallery palette.
//
// Uniforms provided by the runtime:
//   u_time u_resolution u_mouse u_pixelRatio u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// controls (see meta.json)
uniform float u_sunHeight;  // sun elevation (dusk .. high day)
uniform float u_coverage;   // how much sky the clouds fill
uniform float u_density;    // optical thickness — wispy .. solid
uniform float u_detail;     // edge erosion / fine billowing
uniform float u_windSpeed;  // drift speed of the cloud field
uniform float u_camPitch;   // camera tilt: look toward horizon .. straight up
uniform float u_camYaw;     // camera pan around the vertical
uniform float u_camHeight;  // camera altitude: under the deck .. up among the clouds
uniform float u_cloudHeight;// vertical thickness of the cloud layer (towering)
uniform float u_groundLevel;// height of the generic ground plane
uniform float u_groundShade;// brightness of the ground surface (0 = dark void)

// ---- cloud slab geometry (world units; camera at origin) ----
// BASE is the flat cloud base; the top is BASE + u_cloudHeight (controllable), so
// the layer can range from a thin sheet to towering, deep-bodied cumulus.
const float BASE = 1.2;
const int   STEPS  = 56;    // primary march samples
const int   LSTEPS = 6;     // light march samples

// ---------- 3D value noise + fbm for the density volume ----------
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise3(p);
    p = p * 2.02 + vec3(11.3, 17.1, 5.7);
    a *= 0.5;
  }
  return v;
}

// Henyey-Greenstein phase
float hg(float mu, float g) {
  float gg = g * g;
  float den = 1.0 + gg - 2.0 * g * mu;
  return (1.0 - gg) / (12.566 * pow(max(den, 1e-4), 1.5));
}

// ---------- cloud density at a world point ----------
// detailOn=0 skips the fine erosion octave (used by the cheaper light march).
float cloudDensity(vec3 p, float wind, float detailOn) {
  // h: 0 at the flat base, 1 at the nominal top. Crowns may tower past 1, so do
  // NOT clamp the upper end — that hard cap is what reads as a flat-ceiling crop.
  float h = (p.y - BASE) / max(u_cloudHeight, 0.001);
  if (h < 0.0 || h > 1.6) return 0.0;

  vec3 q = p * 0.62;
  q.xz += vec2(wind, wind * 0.4);

  // low-freq shape, thresholded by coverage
  float base = fbm3(q);
  float cov  = clamp(u_coverage, 0.0, 1.0);
  float d    = smoothstep(1.0 - cov, 1.0 - cov + 0.22, base);

  // undulating per-column crown: a two-octave field sets each column's ceiling
  // anywhere from ~0.35 up to ~1.35, so cumulus tower well above the nominal top
  // and break the horizon as billows instead of reading as a flat-ceiling crop.
  float topVar = 0.6 * vnoise3(q * 1.1 + 19.0) + 0.4 * vnoise3(q * 2.7 + 4.0);
  float topH   = 0.35 + 1.0 * topVar;
  float prof = smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(topH - 0.26, topH, h));
  d *= prof;

  // erode the boundary with higher-frequency detail (more at the base = wispy
  // bottoms, denser rounded crowns)
  if (detailOn > 0.5) {
    float det = fbm3(q * 4.1 + 9.0);
    d -= det * u_detail * 0.7 * (1.0 - clamp(h, 0.0, 1.0) * 0.55);
  }
  return clamp(d, 0.0, 1.0);
}

// optical depth toward the sun (self-shadowing)
float lightMarch(vec3 p, vec3 sunDir, float wind) {
  float lstep = max(u_cloudHeight, 0.001) * 0.22;
  float sum = 0.0;
  vec3 s = sunDir * lstep;
  for (int i = 0; i < LSTEPS; i++) {
    p += s;
    sum += cloudDensity(p, wind, 0.0) * lstep;
  }
  return sum;
}

void main() {
  vec2 fc  = gl_FragCoord.xy;
  vec2 res = u_resolution;
  float t  = u_time;

  vec2 ndc = (2.0 * fc - res) / res.y;

  // --- camera: position (altitude) + orientation (pitch / yaw) ---
  float pitch = u_camPitch;
  float yaw   = u_camYaw;
  vec3  fwd   = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));
  vec3  right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3  upv   = cross(fwd, right);
  vec3  ro    = vec3(0.0, u_camHeight, 0.0);
  vec3  rd    = normalize(fwd + (ndc.x * right + ndc.y * upv) * 0.62);
  float up    = clamp(rd.y, 0.0, 1.0);

  float az = t * 0.015;
  vec3 sunDir = normalize(vec3(sin(az) * 0.5, max(u_sunHeight, -0.05) + 0.02, cos(az) * 0.3 + 0.8));
  float mu  = dot(rd, sunDir);
  float muc = max(mu, 0.0);

  // ---- palette → sky / light roles ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 zenithCol  = c3 * 0.42;
  vec3 skyCol     = c0 * 0.95;
  vec3 horizonCol = c1;
  vec3 sunTint    = c2;

  // ---- analytic sky behind the clouds ----
  float band = exp(-up * up * 22.0);
  vec3 sky = mix(horizonCol, skyCol, smoothstep(0.0, 0.34, up));
  sky = mix(sky, zenithCol, smoothstep(0.30, 1.0, up));
  sky += horizonCol * hg(muc, 0.82) * 0.7 * (0.5 + 0.5 * band);
  sky += sunTint * pow(muc, 250.0) * 0.9;          // soft sun, no bloom pass

  // ---- background: sky above, or a generic controllable ground plane below ----
  // a downward ray that clears the cloud base strikes a flat surface at
  // u_groundLevel; it hazes toward the horizon and is dimmed/lit by u_groundShade.
  vec3 bg = sky;
  if (rd.y < -0.001) {
    float tg = (u_groundLevel - ro.y) / rd.y;
    if (tg > 0.0) {
      float fog  = 1.0 - exp(-tg * 0.045);
      vec3  surf = mix(zenithCol * 0.6, skyCol * 0.55, 0.4) * (0.18 + u_groundShade * 1.5);
      // fade the surface into the SAME horizon-sky colour computed above, so the
      // ground meets the sky seamlessly with no hard brightness step at rd.y = 0.
      bg = mix(surf, sky, fog);
    }
  }

  // ---- volumetric cloud raymarch ----
  vec3  col = bg;
  // march bound sits ABOVE the nominal top so towering crowns (h up to ~1.15)
  // are sampled instead of being clipped flat at the nominal ceiling.
  float top = BASE + max(u_cloudHeight, 0.001) * 1.45;

  // intersect the ray with the cloud slab from wherever the camera sits (below,
  // inside, or above the deck); t0/t1 are the entry/exit distances.
  float t0 = 0.0, t1 = -1.0;
  if (abs(rd.y) > 1e-3) {
    float ta = (BASE - ro.y) / rd.y;
    float tb = (top  - ro.y) / rd.y;
    t0 = max(min(ta, tb), 0.0);
    t1 = max(ta, tb);
  } else if (ro.y > BASE && ro.y < top) {
    t0 = 0.0; t1 = 12.0;                            // inside, looking flat
  }

  if (t1 > t0) {
    t1 = min(t1, t0 + 9.0);                         // cap grazing spans
    float dt   = (t1 - t0) / float(STEPS);
    float wind = u_windSpeed * t * 0.25;
    float jit  = hash13(vec3(fc, t));               // dissolve slice banding

    vec3  sunLit  = mix(vec3(1.0), sunTint, 0.40) * 2.7;  // bright direct sun
    vec3  ambient = mix(skyCol, horizonCol, 0.5) * 1.15;  // daylight sky fill
    float phase   = hg(mu, 0.7) * 0.8 + hg(mu, -0.25) * 0.25 + 0.06;
    float sigma   = u_density * 7.0;

    float T = 1.0;
    vec3  L = vec3(0.0);
    for (int i = 0; i < STEPS; i++) {
      if (T < 0.02) break;
      float tt = t0 + dt * (float(i) + jit);
      vec3  p  = ro + rd * tt;
      float d  = cloudDensity(p, wind, 1.0);
      // fade only the far TAIL of each ray (relative to where it entered the
      // slab) into haze — distance-from-entry, so an aerial view from high
      // altitude keeps its near clouds instead of washing the whole sheet out.
      d *= exp(-max(tt - t0 - 4.0, 0.0) * 0.16);
      if (d > 0.002) {
        float od  = lightMarch(p, sunDir, wind);
        float sun = exp(-od * sigma);
        float pw  = 1.0 - exp(-d * 4.0);            // powder: dark sunward edges
        vec3  Sc  = sunLit * sun * phase * pw + ambient * (0.4 + 0.5 * d);
        float tr  = exp(-d * dt * sigma);
        L += T * (1.0 - tr) * Sc;
        T *= tr;
      }
    }

    // melt into haze only at the true horizon (grazing rays); full strength both
    // looking up AND looking down, so clouds stay visible from above the deck.
    float haze  = smoothstep(0.0, 0.12, abs(rd.y));
    float cover = (1.0 - T) * haze;
    col = bg * (1.0 - cover) + L * haze;
  }

  // gentle vignette
  float vign = 1.0 - smoothstep(0.78, 1.5, length((fc - 0.5 * res) / res));
  col *= vign;

  gl_FragColor = vec4(col, 1.0);
}
