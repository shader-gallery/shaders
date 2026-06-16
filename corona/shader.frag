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
uniform float u_reach;        // max filament reach beyond the rim, css px (default 110)
uniform float u_eruptRate;    // streamer eruption frequency, 0 = never (default 0.25)
uniform float u_density;      // filaments around the circumference (default 130)
uniform float u_turbulence;   // filament writhe: curl + sway + swell amount (default 0.55)
uniform float u_centerX;      // disc centre, short-axis units, -1..1 (default 0)
uniform float u_centerY;      // disc centre, short-axis units, -1..1 (default 0)
uniform float u_starDensity;  // star field fill, 0 = empty sky .. 1 = crowded (default 0.5)
uniform float u_starGlow;     // star brightness (default 0.45)
uniform float u_starHue;      // star colour: 0 = palette-tinted .. 1 = white (default 0.3)
uniform float u_starSpeed;    // star twinkle rate (default 1.0)
uniform float u_sphere;       // 0 = flat black void .. 1 = shaded 3D dark orb (default 0.4)
uniform float u_sphereLight;  // sphere light direction, degrees around the disc (default 130)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black field ~#09090B
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
  float SECT    = clamp(u_density, 16.0, 300.0); // filaments around the circumference
  float turb    = clamp(u_turbulence, 0.0, 1.0);
  float reachPx = max(u_reach, 4.0) * pr;        // filament reach, device px
  float aa      = max(pr * 0.8, 0.8);

  // disc centre, movable: short-axis units about the screen centre
  vec2  ctr = 0.5 * res + vec2(u_centerX, u_centerY) * res.y;
  vec2  rel = fc - ctr;
  float d   = length(rel);
  float a   = atan(rel.y, rel.x) / TAU + 0.5;    // screen angle, 0..1
  float driftA = u_time * spd * DRIFT;           // rim current (rev)

  float R   = max(u_disc, 40.0) * 0.5 * pr;      // clean circular void radius, device px

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

    float tAmp   = mix(0.35, 1.7, turb);         // turbulence -> writhe amplitude
    float curl   = (h3 - 0.5) * 0.9 * tAmp;      // sideways lean, slot units
    float angOff = curl * pow(max(t, 0.0), 1.4); // streak curves as it reaches
    float sway   = 0.22 * tAmp * sin(fl * (0.5 + 0.5 * h1) + h3 * TAU); // root wobble
    float du     = u * SECT - (j + 0.5) - angOff - sway;
    float ad     = abs(du) * slotArc;            // device px off the centreline

    // per-filament life: length swell + brightness flicker, hash-offset phases
    float swell = 0.76 + 0.32 * tAmp * sin(fl * (0.9 + 0.7 * h3) + h2 * TAU);
    float lenJ  = (0.30 + 0.70 * h1) * swell;
    float br    = 0.55 + 0.45 * sin(fl * (1.6 + 1.4 * h2) + h1 * TAU);
    br *= 0.75 + 0.25 * sin(fl * 0.37 + h4 * TAU);

    float tn   = clamp(t / max(lenJ, 1e-3), 0.0, 1.0);
    float prof = pow(1.0 - tn, 1.6) * (1.0 - smoothstep(0.90, 1.0, tn));
    prof += exp(-t * 9.0) * 0.7;                 // bright anchor at the root

    float w    = mix(2.1, 0.8, tn) * pr * 0.5;   // tapering half-width
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
  float glow = exp(-out1 / max(reachPx * 0.40, 6.0)) * 0.20
             + exp(-out1 / max(reachPx * 1.60, 24.0)) * 0.085
             + exp(-out1 / max(reachPx * 4.50, 60.0)) * 0.045;
  float limb = exp(-out1 / (2.5 * pr)) * 0.30;
  acc += gcol * (glow * current + limb * (0.7 + 0.3 * current));

  // starfield: real stars, not blurry dots. crisp cores, a brightness skew so
  // most are faint pinpricks and a rare few blaze, diffraction-spike glints on
  // the bright ones, hash-jittered placement + colour. 3x3 cell scan so big
  // stars and their spikes never clip at a cell boundary.
  float starSpd = max(u_starSpeed, 0.0);
  float thr     = mix(0.97, 0.55, clamp(u_starDensity, 0.0, 1.0)); // density -> star chance
  float sHue    = clamp(u_starHue, 0.0, 1.0);
  vec2  sc      = fc / pr;
  vec2  gid     = floor(sc / 26.0);
  vec2  gf      = fract(sc / 26.0);
  vec3  starAcc = vec3(0.0);
  for (int yy = -1; yy <= 1; yy++) {
    for (int xx = -1; xx <= 1; xx++) {
      vec2  off = vec2(float(xx), float(yy));
      vec2  id  = gid + off;
      float sh  = hash12(id + 3.0);
      if (sh > thr) {                                  // a star lives in this cell
        vec2  pos = off + vec2(hash12(id + 5.1), hash12(id + 8.3)) - gf; // px->star, cell units
        float r2  = dot(pos, pos);
        float mag = pow(hash12(id + 11.7), 2.6);       // brightness skew: mostly faint
        float tw  = 0.55 + 0.45 * sin(u_time * starSpd * (0.5 + sh) + sh * 40.0);
        float core = exp(-r2 * mix(340.0, 120.0, mag)) // sharp pinprick (bigger when bright)
                   + 0.45 * exp(-r2 * 64.0) * mag;     // soft bloom on bright ones
        float spkL = mix(46.0, 13.0, mag);             // bright stars throw longer spikes
        float glint = (exp(-pos.x * pos.x * 950.0) + exp(-pos.y * pos.y * 950.0))
                    * exp(-r2 * spkL) * mag;
        vec3  base = mix(wheel(hash12(id + 9.0), c0, c1, c2, c3), vec3(1.0), sHue);
        base = mix(base, vec3(1.0), mag * 0.55);       // hot stars burn toward white
        starAcc += base * (core + glint * 1.3) * mag * tw;
      }
    }
  }
  acc += starAcc * max(u_starGlow, 0.0) * 2.0;

  // ---- compose: void disc (flat or shaded orb), vignetted field, tone map ----
  float mask = smoothstep(R - aa, R + aa, d);    // 0 inside the void, 1 outside
  vec2  vrel = (fc - 0.5 * res) / max(res.y, 1.0); // screen-centred (vignette stays put)
  float vig  = 1.0 - 0.35 * smoothstep(0.45, 1.05, length(vrel));
  vec3  lit  = 1.0 - exp(-acc * 1.9);
  vec3  col  = (BG + lit) * vig * mask;

  // optional 3D sphere shading inside the disc: a dark dimensional orb instead of
  // a flat black cutout. fake hemisphere normal -> soft directional sheen, limb
  // brightening (fresnel) and a centre->edge radial gradient, all kept dark so it
  // still reads as an eclipse/black orb. u_sphere fades flat-void <-> shaded orb.
  float sphAmt = clamp(u_sphere, 0.0, 1.0);
  float inside = 1.0 - mask;
  if (sphAmt * inside > 0.0) {
    float nz   = sqrt(max(R * R - d * d, 0.0)) / max(R, 1.0); // hemisphere z
    vec3  n    = vec3(rel / max(R, 1.0), nz);
    float la   = radians(u_sphereLight);
    vec3  L    = normalize(vec3(cos(la), sin(la), 0.7));
    float dif  = max(dot(n, L), 0.0);
    float fres = pow(1.0 - nz, 2.6);                         // limb glow
    float rg   = smoothstep(0.0, 1.0, d / max(R, 1.0));      // centre->edge gradient
    vec3  tint = wheel(a, c0, c1, c2, c3);
    vec3  orb  = tint * (0.035 + 0.20 * dif + 0.13 * fres + 0.06 * rg);
    col += orb * sphAmt * inside * vig;
  }

  gl_FragColor = vec4(col, 1.0);
}
