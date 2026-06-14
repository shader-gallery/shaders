// corona (Omen) — an absolute-black disc, darker than the background, a true
// void, betrayed only by what rims it: dozens of radial hairline filaments
// hugging the circumference like corona discharge at an eclipse's edge. Each
// filament is a short, slightly curved streak rooted at the rim and reaching
// outward, hash-varied in length and brightness, coloured by an angular blend
// of the palette so the ring shifts hue gradually around its circuit. A faint
// diffuse ring-glow underlies the filaments and fades into the dark field.
// The roots migrate slowly around the circumference like a current carrying
// the whole rim; each streak flickers and stretches on its own hash-offset
// phase; at long intervals one filament erupts into a streamer that detaches
// and dissolves into the dark. The disc itself never moves.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, 0..1 rgb
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_disc;         // void disc diameter, css px (default 320)
uniform float u_flickerSpeed; // filament flicker + rim drift rate (default 0.4)
uniform float u_reach;        // max filament reach beyond the rim, css px (default 70)
uniform float u_eruptRate;    // streamer eruption frequency, 0 = never (default 0.25)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black field ~#09090B
const float SECT     = 96.0;          // filaments around the circumference
const float TAU      = 6.28318530718;
const float DRIFT    = 0.012;         // rim current, revolutions/sec at speed 1
const float EPOCH    = 6.0;           // eruption scheduling period, seconds
const float STREAM_T = 3.4;           // streamer max reach, in reach units

float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// angular palette blend: s in revolutions, cycles through all four colours
vec3 wheel(float s, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float w = fract(s) * 4.0;
  return c0 * wheelW(w, 0.0) + c1 * wheelW(w, 1.0) +
         c2 * wheelW(w, 2.0) + c3 * wheelW(w, 3.0);
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;

  // theme palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float spd     = max(u_flickerSpeed, 0.0);
  float R       = max(u_disc, 40.0) * 0.5 * pr;  // void radius, device px
  float reachPx = max(u_reach, 4.0) * pr;        // filament reach, device px
  float aa      = max(pr * 0.8, 0.8);

  vec2  rel = fc - 0.5 * res;
  float d   = length(rel);
  float a   = atan(rel.y, rel.x) / TAU + 0.5;    // screen angle, 0..1
  float driftA = u_time * spd * DRIFT;           // rim current (rev)
  float u   = fract(a - driftA);                 // drifting rim coordinate
  float slot = floor(u * SECT);

  float t = max(d - R, 0.0) / reachPx;           // distance past rim, reach units
  float slotArc = TAU * max(d, R) / SECT;        // device px per slot here

  // eruption schedule: hash-gated epochs; one slot per epoch may stream free
  float rate  = clamp(u_eruptRate, 0.0, 1.0);
  float ep    = floor(u_time / EPOCH);
  float ef    = fract(u_time / EPOCH);
  float durF  = mix(0.35, 0.88, rate);           // active fraction of the epoch
  float gOn   = step(0.001, rate) * step(hash12(vec2(ep, 19.7)), 0.15 + 0.85 * rate);
  float act   = gOn * (1.0 - step(durF, ef));
  float ph    = clamp(ef / max(durF, 1e-3), 0.0, 1.0);
  float eslot = floor(hash12(vec2(ep, 41.3)) * SECT);

  float fl = u_time * spd;                       // shared flicker clock

  // slow brightness current circling the rim with the drift (3 soft lobes)
  float current = 0.78 + 0.34 * sin((a - driftA * 1.6) * TAU * 3.0);

  vec3 acc = vec3(0.0);

  // ---- rim filaments: pixel's slot plus neighbours (curl can lean ±2.5) ----
  for (int k = -3; k <= 3; k++) {
    float j  = slot + float(k);
    float jm = mod(j + SECT, SECT);              // wrapped id, seam-continuous
    float h1 = hash12(vec2(jm, 1.7));            // length
    float h2 = hash12(vec2(jm, 9.2));            // phase
    float h3 = hash12(vec2(jm, 23.5));           // curl + rate jitter
    float h4 = hash12(vec2(jm, 47.9));           // gain + hue jitter

    float curl   = (h3 - 0.5) * 0.9;             // sideways lean, slot units
    float angOff = curl * pow(max(t, 0.0), 1.4); // streak curves as it reaches
    float sway   = 0.22 * sin(fl * (0.5 + 0.5 * h1) + h3 * TAU); // root wobble
    float du     = u * SECT - (j + 0.5) - angOff - sway;
    float ad     = abs(du) * slotArc;            // device px off the centreline

    // per-filament life: length swell + brightness flicker, hash-offset phases
    float swell = 0.76 + 0.32 * sin(fl * (0.9 + 0.7 * h3) + h2 * TAU);
    float lenJ  = (0.30 + 0.70 * h1) * swell;
    float br    = 0.55 + 0.45 * sin(fl * (1.6 + 1.4 * h2) + h1 * TAU);
    br *= 0.75 + 0.25 * sin(fl * 0.37 + h4 * TAU);

    float tn   = clamp(t / max(lenJ, 1e-3), 0.0, 1.0);
    float prof = pow(1.0 - tn, 1.6) * (1.0 - smoothstep(0.90, 1.0, tn));
    prof += exp(-t * 9.0) * 0.7;                 // bright anchor at the root

    float w    = mix(1.5, 0.65, tn) * pr * 0.5;  // hairline, tapering half-width
    float core = 1.0 - smoothstep(w - aa, w + aa, ad);
    float halo = exp(-(ad * ad) / (9.0 * pr * pr)) * 0.30;

    float rootA = fract((j + 0.5) / SECT + driftA);  // current screen angle
    vec3  fcol  = wheel(rootA + 0.04 * (h4 - 0.5), c0, c1, c2, c3);

    acc += fcol * (core + halo) * prof * br * (0.55 + 0.45 * h4) * current;

    // rare eruption: this slot's filament arcs free, detaches, dissolves
    if (act > 0.5 && abs(jm - eslot) < 0.5) {
      float tipT  = STREAM_T * smoothstep(0.0, 0.50, ph);
      float baseT = (STREAM_T - 0.1) * pow(smoothstep(0.30, 1.0, ph), 1.4);
      float ea    = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.78, 1.0, ph));
      float win   = smoothstep(baseT - 0.18, baseT + 0.22, t)
                  * (1.0 - smoothstep(tipT - 0.30, tipT + 0.04, t));
      float wS    = mix(2.2, 0.8, clamp(t / STREAM_T, 0.0, 1.0)) * pr * 0.5;
      float coreS = 1.0 - smoothstep(wS - aa, wS + aa, ad);
      float haloS = exp(-(ad * ad) / (36.0 * pr * pr)) * 0.5;
      acc += fcol * (coreS * 2.1 + haloS * 1.3) * win * ea;

      // root flare lighting the local rim as the streamer lets go
      float flare = exp(-t * 2.6) * exp(-du * du * 0.55)
                  * smoothstep(0.0, 0.10, ph) * (1.0 - smoothstep(0.22, 0.55, ph));
      acc += fcol * flare * 0.9;
    }
  }

  // ---- faint diffuse ring-glow under the filaments + thin limb at the rim ----
  float out1 = max(d - R, 0.0);
  vec3  gcol = wheel(a, c0, c1, c2, c3);
  float glow = exp(-out1 / max(reachPx * 0.40, 6.0)) * 0.14
             + exp(-out1 / max(reachPx * 1.60, 24.0)) * 0.055
             + exp(-out1 / max(reachPx * 4.50, 60.0)) * 0.028;
  float limb = exp(-out1 / (2.5 * pr)) * 0.22;
  acc += gcol * (glow * current + limb * (0.7 + 0.3 * current));

  // faint starfield filling the surrounding void (in-shader, replacing the backdrop):
  // dim hash-scattered twinkling stars in the dark sky around the eclipse.
  vec2  sc    = fc / pr;
  vec2  scell = floor(sc / 24.0);
  vec2  sfr   = fract(sc / 24.0) - 0.5;
  float sh    = hash12(scell + 3.0);
  float star  = step(0.85, sh) * exp(-dot(sfr, sfr) * 62.0)
              * (0.45 + 0.55 * sin(u_time * (0.4 + sh) + sh * 40.0));
  acc += wheel(hash12(scell + 9.0), c0, c1, c2, c3) * star * 0.45;

  // ---- compose: true-void disc, vignetted dark field, soft-knee tone map ----
  float mask = smoothstep(R - aa, R + aa, d);    // 0 inside the void
  float vig  = 1.0 - 0.35 * smoothstep(0.45, 1.05, length(rel / max(res.y, 1.0)));
  vec3  lit  = 1.0 - exp(-acc * 1.5);
  vec3  col  = (BG + lit) * vig * mask;

  gl_FragColor = vec4(col, 1.0);
}
