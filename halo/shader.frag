// halo (Shoal) — total solar eclipse. A dark occulting moon hangs high in the
// frame; around its limb a bright corona blazes, its edge frayed by ridged FBM
// into the filamental streamers and prominences of a real eclipse. A thin warm
// chromosphere rings the limb, and a faint diamond-ring point flares at one
// side. Behind it all a slow-twinkling starfield fills the deep space, occulted
// to black behind the moon. The corona crawls slowly around the disc (noise
// drifted in the angular domain, periodic so seamless), the radius breathes a
// few percent, and the streamers shimmer with warped noise — all very slow,
// nothing that can reset.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_haloRadius;  // CSS-px radius of the occulting moon (default 200), times u_pixelRatio in code
uniform float u_fray;        // depth/reach of the corona streamers      (default 1)
uniform float u_waverSpeed;  // crawl speed of streamers + shimmer        (default 0.18)
uniform float u_starDensity; // density of the background starfield       (default 1.0)
uniform float u_posX;        // moon centre x, fraction of width          (default 0.40)
uniform float u_posY;        // moon centre y, fraction of height         (default 0.62)

const vec3  BG          = vec3(0.018, 0.020, 0.032); // deep space base
// disc centre lift above frame centre, as a FRACTION of disc radius so the
// eclipse hangs high at every radius and its full corona stays on-screen.
const float DISC_LIFT_FRAC = 0.55;

// --- hash / value noise (no textures, all procedural) ---
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Periodic value noise on an angle a (0..2pi): sample on a circle of radius rad in a
// noise plane so it is seamless in the angular domain, plus a free axis (radius/time).
float pnoise1(float a, float freq, float yaxis) {
  vec2 q = vec2(cos(a), sin(a)) * freq;
  return vnoise(q + vec2(0.0, yaxis));
}

// ridged fbm over the periodic angular noise — feathery filamental tongues for the corona
float ridgedFray(float a, float yaxis) {
  float sum = 0.0;
  float amp = 0.55;
  float fr  = 3.0;
  for (int o = 0; o < 4; o++) {
    float n = pnoise1(a, fr, yaxis * (1.0 + float(o) * 0.37));
    n = 1.0 - abs(2.0 * n - 1.0);   // ridge
    n = n * (0.55 + 0.45 * n);
    sum += n * amp;
    amp *= 0.5;
    fr  *= 2.0;
  }
  return sum; // ~0..1 range
}

// one starfield layer: hashed cells, sparse points, slow twinkle. `thresh` gates how
// many cells carry a star (higher thresh = fewer stars).
float starLayer(vec2 fc, float cell, float t, float seed, float thresh) {
  vec2 g  = fc / cell;
  vec2 id = floor(g);
  vec2 f  = fract(g);
  float h3 = hash21(id + seed + 19.3);
  if (h3 > thresh) return 0.0;                 // only some cells host a star
  float h  = hash21(id + seed);
  float h2 = hash21(id + seed + 7.1);
  vec2  sc = vec2(0.25 + 0.5 * h, 0.25 + 0.5 * h2);
  float d  = length((f - sc) * vec2(1.0, 1.0));
  float bright = 0.35 + 0.65 * h;
  float tw = 0.55 + 0.45 * sin(t * (0.4 + h * 1.8) + h2 * 6.2831);
  // tiny crisp core + faint glow
  float core = smoothstep(0.06, 0.0, d);
  float glow = smoothstep(0.22, 0.0, d) * 0.25;
  return (core + glow) * bright * tw;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // guard radius against a 0 param so nothing divides by zero / explodes
  float reqR = max(u_haloRadius, 1.0) * pr;
  // Soft-contain the moon so its full corona stays on-screen across the radius range.
  float maxVisible = min(res.x, res.y) * 0.34;
  float baseR = maxVisible * (1.0 - exp(-reqR / maxVisible));

  // moon centre: user-positioned, with a barely-there slow horizontal drift.
  float offX = res.x * clamp(u_posX, 0.0, 1.0) + 0.018 * res.x * sin(t * 0.05);
  vec2 ctr = vec2(offX, res.y * clamp(u_posY, 0.0, 1.0));
  vec2 d   = fc - ctr;
  float r  = length(d);
  float ang = atan(d.y, d.x); // -pi..pi

  float wsp = u_waverSpeed;

  // --- breathing radius (a few percent, very slow, two incommensurate sines) ---
  float breathe = 1.0
    + 0.014 * sin(t * (0.18 + wsp * 0.6))
    + 0.010 * sin(t * (0.11 + wsp * 0.37) + 1.7);
  float discR = baseR * breathe;

  // --- corona streamers: ridged noise drifting in the angular domain (crawls) ---
  float crawl = t * wsp * 0.40;
  float fray  = ridgedFray(ang + crawl, t * wsp * 0.22);
  // a coarser angular modulation carves the broad streamer "petals" of a real corona
  float petals = 0.55 + 0.45 * pnoise1(ang * 1.0 + crawl * 0.6, 2.0, t * wsp * 0.1);

  // limb of the moon (the eclipse edge)
  float aa = max(2.0 * pr, baseR * 0.010);
  float limbR = discR;
  float inMoon = 1.0 - smoothstep(limbR - aa, limbR + aa, r);

  // Palette fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 coolSky  = mix(c0, c2, 0.5);      // cool corona body
  vec3 warmCore = mix(c3, c1, 0.35);     // warm chromosphere / inner glow
  vec3 starCol  = mix(vec3(0.85, 0.90, 1.0), c2, 0.18);

  vec3 col = BG;

  // ---- starfield (behind everything; occulted by the moon) -----------------
  float dens = clamp(u_starDensity, 0.0, 2.0);
  // higher density -> lower threshold (more cells populated) + a finer layer
  float th1 = mix(0.82, 0.30, clamp(dens, 0.0, 1.0));
  float th2 = mix(0.92, 0.55, clamp(dens, 0.0, 1.0));
  float stars = starLayer(fc, 46.0 * pr, t, 3.0,  th1)
              + starLayer(fc, 26.0 * pr, t, 91.0, th2) * 0.8;
  // faint nebular wash so deep space isn't a flat black field
  float neb = vnoise(fc / res.xy * 3.0 + vec2(t * wsp * 0.03, 0.0));
  col += coolSky * 0.030 * neb;
  col += starCol * stars * 1.4;

  // ---- the corona: bright frayed light streaming OUTWARD from the limb ------
  // base outward falloff, reach scaled by u_fray; streamers from fray+petals.
  float reach = baseR * (0.9 + 1.4 * u_fray);
  float outward = exp(-max(r - limbR, 0.0) / max(reach, 1.0));
  // streamer modulation: brighter where fray/petals peak, feathery between
  float streamer = (0.35 + 0.65 * fray) * petals;
  float corona = outward * streamer * (1.0 - inMoon);
  // a hot, thin inner ring right at the limb (the brightest part of the corona)
  float innerRing = exp(-abs(r - limbR) / max(aa * 6.0, baseR * 0.045)) * (1.0 - inMoon);

  // ---- chromosphere: thin warm band hugging the limb ------------------------
  float chromo = exp(-abs(r - limbR) / max(baseR * 0.02, aa * 3.0)) * (1.0 - inMoon);

  // ---- diamond-ring / Baily's bead: one bright flare at a fixed limb angle --
  float beadAng = 2.3 + 0.15 * sin(t * 0.07);
  float angDiff = ang - beadAng;
  // keep periodic: use cos of the difference for a smooth angular bump
  float beadGate = pow(max(0.0, cos(angDiff)), 40.0);
  float bead = beadGate * exp(-abs(r - limbR) / max(baseR * 0.05, aa * 4.0)) * (1.0 - inMoon);

  // ---- composite the light --------------------------------------------------
  col += coolSky  * corona     * 0.9;
  col += mix(coolSky, vec3(1.0), 0.4) * innerRing * 0.8;
  col += warmCore * chromo     * 0.7;
  col += mix(warmCore, vec3(1.0), 0.6) * bead * 1.6;

  // ---- the moon: dark occulting disc ---------------------------------------
  // earthshine — a barely-there cool fill so the moon reads as a sphere, not a hole;
  // and it occults the stars/nebula behind it.
  float earthshine = (0.012 + 0.010 * (1.0 - clamp(r / max(limbR, 1.0), 0.0, 1.0)));
  col = mix(col, coolSky * earthshine, inMoon);

  // gentle vignette to settle the corners into deep space
  float vign = 1.0 - smoothstep(0.50, 1.18, length((fc - res * 0.5) / res));
  col *= mix(0.7, 1.0, vign);

  // soft luminance ceiling: keep the brightest corona/bead a luminous glow, never a
  // blown-out white clip. Roll values above ~0.7 toward a gentle shoulder.
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float capped = lum - 0.30 * max(lum - 0.68, 0.0);
  col *= capped / max(lum, 1e-4);

  gl_FragColor = vec4(col, 1.0);
}
