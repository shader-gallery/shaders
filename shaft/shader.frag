// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// shaft (Shoal) - volumetric light rays. A dense fan of soft, near-parallel
// shafts pours from one light source sitting just off the top-left corner and
// rakes down across the whole frame. Ray intensity is layered 1D noise over the
// angle around the source: a few broad bright sheets carrying many fine soft
// striations, every ray fading gently at its edges instead of cutting a hard
// cone. Two fainter fans from slightly displaced sources sit behind the first
// for depth. Inside the light there is visible dust: fine drifting motes and a
// slow turbulent haze that thickens and thins along the beams. A dim tinted
// fog fills the frame between and beyond the rays so no corner goes dead.
// Rays drift slowly across the fan and the haze rolls along the beam
// direction on unbounded phases, so nothing ever snaps back.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent, unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;     // drift pace of rays and haze          (default 0.5)
uniform float u_rays;      // ray density across the fan           (default 1.0)
uniform float u_dust;      // dust motes and haze inside the beam  (default 0.8)
uniform float u_haze;      // ambient fog between the rays         (default 0.35)
uniform float u_sourceX;   // source x, fraction of width          (default -0.25)
uniform float u_sourceY;   // source y, fraction of height, up     (default 1.35)
uniform float u_intensity; // overall light level                  (default 1.2)

const vec3  BG  = vec3(0.035, 0.035, 0.043); // house near-black base
const float TAU = 6.28318530718;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453123); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// 1D value noise, smooth
float vnoise1(float x) {
  float i = floor(x), f = fract(x);
  float s = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), s);
}

float vnoise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s;
}

// sparse scatter of soft round motes: one candidate per cell at a hashed
// offset, only the brighter hashes survive, each breathing on its own phase
float moteField(vec2 q, float t) {
  vec2 i = floor(q), f = fract(q);
  float m = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2  o  = vec2(float(x), float(y));
      vec2  c  = i + o;
      vec2  h  = vec2(hash21(c + 0.37), hash21(c + 7.91));
      float sz = 0.05 + 0.13 * hash21(c + 3.3);
      float br = smoothstep(0.58, 1.0, hash21(c + 11.1));
      br *= 0.55 + 0.45 * sin(t * 1.1 + hash21(c + 5.5) * TAU);
      vec2  d  = f - (o + h);
      m += br * exp(-dot(d, d) / (sz * sz));
    }
  }
  return m;
}

// cyclic 4-stop palette loop a->b->c->d->a, no dynamic indexing
vec3 palLoop(float u, vec3 a, vec3 b, vec3 c, vec3 d) {
  float x   = fract(u) * 4.0;
  float seg = floor(x);
  float f   = smoothstep(0.0, 1.0, fract(x));
  vec3 lo = seg < 0.5 ? a : seg < 1.5 ? b : seg < 2.5 ? c : d;
  vec3 hi = seg < 0.5 ? b : seg < 1.5 ? c : seg < 2.5 ? d : a;
  return mix(lo, hi, f);
}

// angular deviation of a frame corner from the fan aim, used to size the fan
float cornerDev(vec2 corner, vec2 S, float aim) {
  vec2 v = corner - S;
  float d = atan(v.y, v.x) - aim;
  d = d - TAU * floor(d / TAU + 0.5);   // wrap to -pi..pi
  return abs(d);
}

// One fan of light from source S. Returns linear additive colour.
vec3 lightFan(vec2 p, vec2 S, float aim, float halfw, float seed, float t,
              float dens, float dust, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec2  v   = p - S;
  float r   = max(length(v), 1e-3);
  float ang = atan(v.y, v.x);
  float da  = ang - aim;
  da = da - TAU * floor(da / TAU + 0.5);
  float a   = da / halfw;               // -1..1 across the fan

  // layered 1D noise over angle: broad sheets, mid bands, fine striations.
  // each octave drifts at its own rate so rays slide, split and rejoin.
  float broad = vnoise1(a * 5.0 * dens + seed + t * 0.05);
  float mid   = vnoise1(a * 14.0 * dens + seed * 3.1 + 7.3 - t * 0.09);
  float fine  = vnoise1(a * 42.0 * dens + seed * 7.7 + 19.1 + t * 0.14);
  float n = 0.42 * broad + 0.36 * mid + 0.22 * fine;
  // carve soft shafts and gaps: a wide smoothstep keeps edges feathered,
  // and the broad octave gates the whole thing so a few wide sheets carry
  // the fine slivers rather than every sliver reading the same
  float sheet = smoothstep(0.30, 0.85, broad);
  float rays = smoothstep(0.34, 0.80, n);
  rays = rays * rays * (0.15 + 0.85 * sheet) * 1.9;
  rays += 0.05 * fine * fine;            // faint fill so gaps are not dead

  // fan envelope: brightest along the aim, feathering toward the fan sides
  float env = 0.40 + 0.60 * (1.0 - smoothstep(0.35, 1.10, abs(a)));

  // distance falloff away from the source, softly
  float fall = exp(-(r - 0.3) * 0.85) + 0.05;

  // volume haze in fan space (angle across, radius along), rolling outward
  vec2  q    = vec2(a * 2.2, r * 1.4 - t * 0.12);
  float haze = 0.55 + 0.45 * fbm(q * 1.6 + seed);
  float wisp = fbm(q * 3.5 + vec2(seed, -t * 0.05));
  haze = mix(haze, haze * (0.6 + 0.8 * wisp), dust * 0.6);

  // dust motes: soft round sprites scattered in screen space, drifting down
  // the beam and twinkling slowly; two sizes for depth
  vec2  dir   = vec2(cos(aim), sin(aim));
  float motes = moteField(p * 26.0 + dir * t * 0.9 + seed * 3.0, t);
  motes += 0.6 * moteField(p * 52.0 + dir * t * 1.5 + seed * 5.0 + 17.0, t * 1.3);

  float light = rays * env * fall * haze * (1.0 + motes * dust * 2.4);

  // colour: each ray leans to its own palette stop across the fan
  vec3 keyCol = mix(c0, c2, 0.5);
  vec3 rayCol = palLoop(a * 0.35 + seed * 0.13 + t * 0.006, c0, c1, c2, c3);
  vec3 tint   = mix(keyCol, rayCol, 0.6);

  vec3 acc = tint * light;
  // soft directional glow hugging the source side of the frame
  acc += keyCol * env * exp(-r * 1.3) * 0.55;
  return acc;
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = gl_FragCoord.xy / res;
  float asp = res.x / max(res.y, 1.0);
  vec2  p   = vec2(uv.x * asp, uv.y);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float t    = u_time * max(u_speed, 0.0);
  float dens = max(u_rays, 0.2);
  float dust = clamp(u_dust, 0.0, 2.0);

  // primary source in frame-relative units (x scaled by aspect)
  vec2  S   = vec2(u_sourceX * asp, u_sourceY);
  vec2  ctr = vec2(0.5 * asp, 0.5);
  vec2  cv  = ctr - S;
  float aim = atan(cv.y, cv.x);
  float halfw = max(max(cornerDev(vec2(0.0, 0.0), S, aim),
                        cornerDev(vec2(asp, 0.0), S, aim)),
                    max(cornerDev(vec2(0.0, 1.0), S, aim),
                        cornerDev(vec2(asp, 1.0), S, aim)));
  halfw = max(halfw, 0.05);

  // three fans: the key light plus two displaced, dimmer fans behind it
  vec2 dirN = normalize(vec2(-cv.y, cv.x));
  vec3 acc = lightFan(p, S, aim, halfw, 0.0, t, dens, dust, c0, c1, c2, c3);
  acc += 0.55 * lightFan(p, S + dirN * 0.18, aim, halfw, 4.7, t * 0.8, dens * 0.8, dust, c0, c1, c2, c3);
  acc += 0.35 * lightFan(p, S - dirN * 0.22, aim, halfw, 9.3, t * 1.15, dens * 1.3, dust, c0, c1, c2, c3);

  // ambient fog: slow drifting field tinted from the dark end of the palette,
  // brighter toward the source, never zero anywhere in the frame
  vec2  fp   = p * 1.7 + vec2(t * 0.03, -t * 0.02);
  float fogN = fbm(fp);
  float rS   = length(p - S);
  vec3  fogCol = mix(c0, c3, 0.25 + 0.5 * fogN) * 0.6;
  acc += fogCol * max(u_haze, 0.0) * (0.35 + 0.5 * fogN) * (0.4 + 0.6 * exp(-rS * 0.6));

  // soft-knee tone map keeps shaft cores from blowing out
  vec3 col = BG + (1.0 - exp(-acc * max(u_intensity, 0.0)));

  // ~1-LSB hash dither breaks 8-bit banding in the broad soft gradients
  col += (hash21(gl_FragCoord.xy) - 0.5) * (1.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
