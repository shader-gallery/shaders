// Shale — fractured stone plates over ember light (family: Mosaic)
//
// A voronoi partition where every plate is shaded as one flat facet: a
// hash-tilted normal catches a low raking light whose angle slowly wanders,
// so neighbouring plates sit a stop apart and gradually trade brightness.
// Between the plates, fissures glow from below in the palette's warmest
// hue, brightest where the gap runs widest. Each seed's offset and each
// plate's separation ride very slow hash-phased sines — plates ease apart
// and reseat with tectonic patience, no net drift, no reset, no sweeps.

precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // unused — shader is fully presentable without it
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_plate;    // average plate diameter, css px, scaled by u_pixelRatio (default 200)
uniform float u_drift;    // breathing rate of the fissures               (default 0.25)
uniform float u_fissure;  // max gap width at full separation, css px     (default 6)

const float TAU = 6.28318530718;

float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)),
                        dot(p, vec2(269.5, 183.3)))) * 43758.5453123);
}

// seed position for lattice cell g: hashed base + slow hash-phased wobble.
// base offset stays in [0.15, 0.85] and wobble is +-0.085, so seeds never
// leave their cell and the 3x3 / 5x5 neighbourhood scans stay valid.
vec2 seedPos(vec2 g, float t) {
  vec2 h = hash2(g);
  float ph = TAU * hash1(g + 19.19);
  vec2 wob = vec2(sin(t + ph), cos(t * 0.81 + ph * 1.93));
  return g + vec2(0.15) + 0.70 * h + 0.085 * wob;
}

// per-plate separation 0..1 — how far this plate has eased from its bed.
// two incommensurate sines so the breathing never reads as a metronome.
float sepOsc(vec2 g, float t) {
  float ph = TAU * hash1(g + 7.31);
  float s = 0.72 * sin(t + ph) + 0.28 * sin(t * 0.618 + ph * 2.7);
  return mix(0.14, 1.0, 0.5 + 0.5 * clamp(s, -1.0, 1.0));
}

void main() {
  // palette + house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr = max(u_pixelRatio, 0.25);
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float S = max(u_plate, 8.0) * refScale * pr;   // plate diameter in device px (css * dpr)
  vec2  p  = gl_FragCoord.xy / S;      // cell-space coordinates
  float aa = 1.6 / S;                  // ~1.6 device px of smoothstep antialias

  float tw = u_time * u_drift * 0.30;  // seed wobble clock   (very slow)
  float ts = u_time * u_drift * 0.55;  // separation clock    (slow)

  // ---- voronoi pass 1: nearest seed ------------------------------------
  vec2 n = floor(p);
  float md = 1e9;
  vec2 mg = n, mr = n;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = n + vec2(float(i), float(j));
    vec2 o = seedPos(g, tw);
    vec2 d = o - p;
    float dd = dot(d, d);
    if (dd < md) { md = dd; mg = g; mr = o; }
  }

  // ---- pass 2: distance to the nearest plate border (perpendicular
  //      bisector), tracking which neighbour owns that border ------------
  float ed = 1e9;
  vec2 ng = mg;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = seedPos(g, tw);
    vec2 dr = o - mr;
    float l2 = dot(dr, dr);
    if (l2 > 1e-7) {
      float d = dot(0.5 * (mr + o) - p, dr / sqrt(l2));
      if (d < ed) { ed = d; ng = g; }
    }
  }

  // ---- fissure geometry: each side of a border recedes by its plate's
  //      half-gap, so seams breathe as the two plates' phases slide ------
  float fis  = max(u_fissure, 0.0) * pr / S;  // max full gap, cell units
  float oscA = sepOsc(mg, ts);
  float oscB = sepOsc(ng, ts);
  float gA   = 0.5 * fis * oscA;              // own-side half gap
  float wide = 0.5 * (oscA + oscB);           // 0.14..1: how wide this seam runs

  float plate = smoothstep(gA - aa, gA + aa, ed);

  // glow profiles, floored at a couple of device px and energy-compensated so
  // sub-pixel seams render as dim continuous lines (no dotted/beaded aliasing)
  float pxc  = 1.0 / S;                       // one device pixel, cell units
  float gVis = max(gA, 1.4 * pxc);
  float thin = gA / gVis;
  float body = 1.0 - smoothstep(0.0, gVis + 0.8 * pxc, ed);
  float cw   = max(0.55 * gVis, 2.2 * pxc);   // hot-core width, never sub-pixel
  float core = 1.0 - smoothstep(0.0, cw, ed);
  core *= core; core *= core;                 // ^4, but on a smooth wide profile
  float coreE = clamp(0.55 * gA / cw, 0.0, 1.0);  // core fades on thin seams

  // ---- flat facet shading: hash-tilted normal, low raking light whose
  //      angle wanders a few degrees so facets exchange brightness -------
  vec2 tilt = (hash2(mg * 1.93 + vec2(4.7)) - 0.5) * 1.45;
  vec3 nrm  = normalize(vec3(tilt, 1.0));
  float la  = -2.35 + 0.16 * sin(u_time * 0.057) + 0.11 * sin(u_time * 0.0364 + 1.7);
  vec3 L    = normalize(vec3(cos(la), sin(la), 0.36));
  float dif = clamp(dot(nrm, L), 0.0, 1.0);

  float hueA = hash1(mg + 2.13);
  vec3 tint  = mix(c0, c2, hueA);
  tint       = mix(tint, c1, 0.30 * hash1(mg + 5.37));
  vec3 slate = mix(vec3(dot(tint, vec3(0.299, 0.587, 0.114))), tint, 0.45);
  vec3 facet = vec3(0.030, 0.031, 0.040)
             + slate * (0.045 + 0.55 * dif * dif + 0.10 * dif);

  // ---- ember light in the gaps, brightest where they run widest --------
  vec3 emberBody = c3;
  vec3 emberHot  = mix(c3, vec3(1.0), 0.32);
  vec3 crack = vec3(0.012, 0.010, 0.016)
             + wide * (0.72 * thin * pow(body, 1.25) * emberBody
                     + 1.05 * coreE * core * emberHot);

  // under-light bleeding up over plate rims nearest the fissures
  float rim = exp(-max(ed - gA, 0.0) * S / (12.0 * pr));
  vec3 col  = mix(crack, facet + emberBody * (0.22 * wide * rim), plate);

  // gentle vignette to seat the slab field
  vec2 q  = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  vec2 vq = (q - 0.5) * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  col *= 1.0 - 0.38 * smoothstep(0.35, 1.05, length(vq));

  gl_FragColor = vec4(col, 1.0);
}
