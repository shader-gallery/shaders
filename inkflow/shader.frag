// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// inkflow (Current) - drops of luminous ink released into still dark water,
// seen side on. Each drop sinks as a column that mushrooms at its head,
// billows along its flanks and sheds thin tendrils that trail behind, then
// thins to haze and is replaced by a fresh drop. There is no feedback buffer,
// so the plume is built analytically: a sinking column with a width that
// grows as the square root of the distance travelled (diffusion) and a bulge
// at the head (the vortex ring), pushed through a domain warp whose amplitude
// grows away from the drop point so the fresh neck stays smooth while the
// old body folds and billows. A ridged noise field, stretched along the fall
// direction, carves the tendrils. Density is evaluated three times for a
// finite-difference normal so every billow is shaded as a volume lit from
// the surface above. The ink pigment separates as it spreads: the dense core
// holds one palette pole, the mid body another, and the thinnest fringe a
// third, so every plume carries a chromatic edge. Old ink lingers as a faint
// tint in the water so the frame never falls to flat black.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;       // drop cadence and sink rate         (default 0.3)
uniform float u_turbulence;  // how hard the water folds the ink   (default 1.0)
uniform float u_spread;      // how wide the ink diffuses          (default 1.0)
uniform float u_tendrils;    // strength of the trailing filaments (default 0.8)
uniform float u_separation;  // pigment separation at the fringe   (default 0.7)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const int   NP     = 5;      // drops in flight
const float PERIOD = 26.0;   // seconds per drop cycle at speed 1

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
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

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm4(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.07;
}
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.14;
}

float ridged5(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    float n = 1.0 - abs(2.0 * vnoise(p) - 1.0);
    s += a * n * n;
    p = M2 * p * 2.11 + vec2(7.3, 3.1);
    a *= 0.52;
  }
  return s;
}

// Total ink density at frame point p. aspect sizes the drop spacing, t is
// scaled time. Returns density in .x, the age-weighted mean of the
// contributing plumes in .y (older ink has spread its pigment further) and
// the fibre texture in .z.
vec3 ink(vec2 p, float aspect, float t, float turb, float spread, float tend) {
  // two-stage domain warp: the slow roll of the water folds the ink into
  // lobes, and folds the folds, which is where the billowing comes from
  vec2 q = vec2(fbm4(p * 1.3 + vec2(t * 0.05, -t * 0.03)),
                fbm4(p * 1.3 + vec2(4.7, 2.9) + vec2(-t * 0.04, t * 0.02))) - 0.5;
  vec2 r = vec2(fbm4(p * 1.3 + 1.6 * q + vec2(1.7, 9.2) + vec2(0.0, t * 0.06)),
                fbm4(p * 1.3 + 1.6 * q + vec2(8.3, 2.8) + vec2(0.0, t * 0.05))) - 0.5;
  vec2 wq = q + 0.8 * r;
  // fibrous streaks: ridged noise in the folded domain, stretched a little
  // along the fall so the fibres trail
  vec2  pw  = p + wq * 0.9 * turb;
  float fib = ridged5(pw * vec2(3.2, 2.2) + vec2(0.0, t * 0.12));
  float tdr = smoothstep(0.62, 0.95, fib);          // the thin bright threads

  float dens = 0.0, ageAcc = 0.0;
  for (int i = 0; i < NP; i++) {
    float k     = float(i);
    float phase = hash11(k + 3.0);
    float cyc   = floor(t / PERIOD + phase);
    float age   = fract(t / PERIOD + phase);      // 0 fresh .. 1 dissolved
    float hj    = hash11(cyc * 7.0 + k * 13.0);
    float hk    = hash11(cyc * 3.0 + k * 5.0 + 1.0);
    // drop site: spread across the top, jittered per cycle
    float x0 = ((k + 0.5) / float(NP) * 2.0 - 1.0) * aspect * 1.08 + (hj - 0.5) * 0.45 * aspect / float(NP) * 2.0;
    float y0 = 1.02 + hk * 0.12;
    // the column sinks fast then slows as it spreads its momentum
    float L  = (2.55 + 0.3 * hk) * (1.0 - exp(-age * 2.6));
    // local coordinates, with warp growing away from the drop so the fresh
    // neck stays a clean thread and the old body folds
    vec2  qq = p - vec2(x0, y0);
    float s  = -qq.y;                             // distance travelled, down
    float sn = clamp(s / max(L, 1e-3), 0.0, 1.0);
    float wA = turb * (0.05 + 0.30 * sn) * (0.6 + 0.7 * age);
    float xl = qq.x + wq.x * wA + (hj - 0.5) * 0.5 * s * s * 0.35;
    float sl = s + wq.y * wA * 0.7;
    // width: diffusion root growth plus the rolled-up head
    float w  = spread * (0.014 + 0.065 * sqrt(max(sn, 0.0)) * (0.55 + 1.0 * age));
    // a fresh drop is a small round bead; the cap only rolls out wide once
    // the column has travelled a while
    float hd = exp(-(sl - L) * (sl - L) / max(0.05 + 0.03 * L * L, 1e-3));
    w += spread * (0.05 + 0.27 * smoothstep(0.0, 1.3, L)) * hd * (1.0 - 0.3 * age);
    float ra  = xl / max(w, 1e-3);
    float ra2 = ra * ra;
    float body = exp(-ra2 * 1.1);
    // along the column: nothing above the drop, and a rounded cap below the
    // head that closes sooner out at the flanks, so the head is a dome
    float tail  = max(sl - L, 0.0) / (0.6 * w + 0.15);
    float capF  = exp(-(tail * tail) * (1.0 + 1.6 * ra2));
    float along = smoothstep(-0.05, 0.08, sl) * capF;
    // the fibres carry most of the density; the smooth body is a thin veil
    float d = body * along * (0.45 + 1.9 * fib) * (0.8 + 1.0 * hd) * 1.6;
    // tendrils: the bright threads reach out past the body in a wide sheath
    float sheath = exp(-ra2 * 0.10) * along;
    d += tend * tdr * sheath * (0.4 + 0.8 * sn) * 1.3;
    // old ink has spread thin
    d *= 1.0 - 0.5 * age;
    // the drop fades in at release and dissolves at the end of its cycle
    float life = smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(0.62, 1.0, age));
    d *= life;
    dens   += d;
    ageAcc += d * age;
  }
  return vec3(dens, ageAcc / max(dens, 1e-4), fib);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  res    = u_resolution;
  vec2  uv     = gl_FragCoord.xy / res;
  float aspect = res.x / res.y;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0;
  float t      = u_time * clamp(u_speed, 0.0, 2.0) + 40.0;
  float turb   = clamp(u_turbulence, 0.0, 2.5);
  float spread = clamp(u_spread, 0.3, 2.5);
  float tend   = clamp(u_tendrils, 0.0, 2.0);
  float sep    = clamp(u_separation, 0.0, 1.5);

  // optional pointer: a gentle stir that pushes the sample point, zero at rest
  vec2 m = (u_mouse / res - 0.5) * vec2(aspect, 1.0) * 2.0;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2 dm = p - m;
  p += mAmt * normalize(dm + vec2(1e-3, 0.0)) * 0.08 * exp(-dot(dm, dm) * 4.0);

  // ---- density, plus one sample above for a whisper of top light
  float e  = 0.014;
  vec3  d0 = ink(p, aspect, t, turb, spread, tend);
  float dy = ink(p + vec2(0.0, e), aspect, t, turb, spread, tend).x;
  float D   = d0.x;
  float age = d0.y;
  float fib = d0.z;
  // optical thickness: ink saturates
  float T   = 1.0 - exp(-D * 1.05);
  // lit from the surface: the top of every lobe is a little brighter than
  // its underside, the way daylight enters a tank
  float dif = clamp(0.5 + 6.0 * (D - dy), 0.0, 1.0);

  // ---- the water: near black, tinted by the deepest pole, lit from above,
  // carrying the haze of ink that dissolved on earlier cycles
  vec3 lum3  = vec3(0.299, 0.587, 0.114);
  vec3 deep  = mix(vec3(0.050, 0.054, 0.066), mix(vec3(dot(c3, lum3)), c3, 0.55) * 0.30, 0.50);
  float haze = fbm4(p * 0.7 + vec2(t * 0.02, t * 0.035)) - 0.5;
  vec3 water = deep * (0.70 + 0.80 * uv.y) * (1.0 + haze * 0.6);
  water += mix(c0, c2, 0.5) * 0.07 * smoothstep(-0.25, 0.45, haze) * (0.4 + 0.6 * uv.y);

  // ---- pigment separation: the thin fringe, the body and the dense core
  // each take a pole, with thresholds that spread apart with u_separation
  // and with age, so a fresh neck is nearly one colour and an old billow
  // shows all three. Backlit ink: the thin fringe glows translucent, the
  // dense core goes darker and more saturated.
  float spr   = sep * (0.6 + 0.6 * age);
  float fBody = smoothstep(0.06 + 0.06 * spr, 0.45 + 0.20 * spr, T);
  float fCore = smoothstep(0.55 + 0.10 * spr, 0.97, T);
  vec3 fringe = mix(c2, vec3(1.0), 0.25);
  vec3 bodyC  = mix(fringe, c0, 0.55 + 0.45 * sep);
  // the core keeps its fibre structure so the thickest ink is never flat
  vec3 coreC  = mix(c0, c1, 0.80) * (0.55 + 0.55 * fib);
  vec3 inkCol = mix(fringe, bodyC, fBody);
  inkCol = mix(inkCol, coreC, fCore);

  // ---- luminous ink: emission follows thickness, fades into the opaque
  // core, and the fibres carry the highlights
  float glowAmt = T * (1.0 - 0.5 * fCore) * (0.9 + 0.8 * fib) * 1.2;
  float shade   = 0.75 + 0.35 * dif;
  vec3  col = water * (1.0 - T * 0.9);
  col += inkCol * glowAmt * shade;

  // seat the frame: gentle vignette, lighter toward the surface
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.22 * smoothstep(0.3, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
