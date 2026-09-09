// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// erosion (Strata) - eroded terrain seen from straight above under a low
// raking sun. The height field is a ridged multifractal over gradient noise
// with analytic derivatives: the coarse octaves are Musgrave ridges,
// (1 - |noise|) squared so the divides run as sharp continuous crests with
// rounded valleys between; the finest octaves are inverted to canyons, a
// sharp V cut along the zero set of the noise, which is the gully network
// that dissects every flank. Each octave is gated by the one below so detail
// piles onto high ground, and from the third octave on it is damped by the
// slope accumulated so far, the derivative erosion trick that keeps steep
// flanks clean and lets sediment-like detail settle on the flats. On top of
// that, short rill striations are carved along the local fall line: windowed
// directional impulses whose crests run downhill in the frame given by the
// smooth slope of the two coarse octaves, gated to mid slopes only. Normals
// come from finite differences of the full height, lit by a sun that circles
// slowly at a low elevation so the relief flips its lit and shadowed faces
// over a long cycle. Colour is by altitude and aspect: warm sunlit slopes,
// cool sky fill in shadow, dark deposited floors with a thin valley haze.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;      // terrain features across the frame height (default 4.0)
uniform float u_erosion;    // slope damping and rill depth             (default 0.65)
uniform float u_sharpness;  // ridge sharpness / multifractal gain      (default 1.0)
uniform float u_sun;        // sun elevation, low is raking             (default 0.30)
uniform float u_drift;      // sun circling and terrain drift speed     (default 0.3)

const float TAU = 6.28318530718;
const mat2  M2  = mat2(0.80, 0.60, -0.60, 0.80);   // rotation used between octaves
const mat2  M2T = mat2(0.80, -0.60, 0.60, 0.80);   // its transpose, for gradients

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec2 q = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(q) * 43758.5453123) * 2.0 - 1.0;
}

// gradient noise with analytic gradient: x = value about -0.7..0.7,
// yz = d/dx, d/dy. Quintic fade so the second derivative is continuous.
vec3 noised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  vec2 ga = hash22(i);
  vec2 gb = hash22(i + vec2(1.0, 0.0));
  vec2 gc = hash22(i + vec2(0.0, 1.0));
  vec2 gd = hash22(i + vec2(1.0, 1.0));
  float va = dot(ga, f);
  float vb = dot(gb, f - vec2(1.0, 0.0));
  float vc = dot(gc, f - vec2(0.0, 1.0));
  float vd = dot(gd, f - vec2(1.0, 1.0));
  float k3 = va - vb - vc + vd;
  float v  = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * k3;
  vec2  g  = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.x * u.y * (ga - gb - gc + gd)
           + du * (u.yx * k3 + vec2(vb, vc) - va);
  return vec3(v, g);
}

float vnoise(vec2 p) { return noised(p).x * 0.7 + 0.5; }

// the landform: a ridged multifractal over gradient noise. Each octave is a
// Musgrave ridge, (1 - |noise|) squared so the divides run as sharp crests
// with rounded valleys between, and it is gated by the octave below so
// detail piles onto high ground and thins in the basins. From the third
// octave on it is also damped by the slope accumulated so far, the analytic
// derivative erosion trick: steep flanks stay clean while detail settles on
// the flats like sediment. Returns height about 0..1 and writes the smooth
// slope of the two coarse octaves to lowD for the rill frame.
float terrain(vec2 p, float sharp, float erosionK, out vec2 lowD) {
  float s = 0.0, a = 0.5, w = 1.0;
  vec2  d  = vec2(0.0);
  mat2  mt = mat2(1.0, 0.0, 0.0, 1.0);        // transpose of the cumulative warp
  lowD = vec2(0.0);
  for (int i = 0; i < 7; i++) {
    vec3  n  = noised(p);
    float v  = clamp(n.x * 1.5, -1.0, 1.0);
    vec2  g  = mt * (n.yz * 1.5);             // gradient in frame coords
    // |v| with a slightly rounded corner so a crest has a lit face and a
    // shadow face instead of a one pixel crack
    float av = sqrt(v * v + 0.004);
    float sg = v / av;                        // d|v|/dv, smooth through zero
    float r0 = 1.0 - av;
    float r, dr;
    if (i < 4) {
      // ridge form: sharp crest at the zero set, rounded valley between
      r  = r0 * r0 * w;
      dr = -2.0 * r0 * sg * w;
    } else {
      // canyon form: sharp V cut at the zero set, rounded ground between,
      // which is the gully network that dissects every flank
      r  = (0.30 + 0.70 * av) * w;
      dr = 0.70 * sg * w;
    }
    float damp = i < 2 ? 1.0 : 1.0 / (1.0 + erosionK * dot(d, d));
    s += a * r * damp;
    d += a * dr * g * damp;
    // multifractal gate: the next octave grows on high ground, floored so the
    // basins keep a little texture instead of going dead flat
    w = clamp(r * (1.4 + 1.4 * sharp), 0.25, 1.0);
    // a broad tilt under the first octave so no basin is dead level
    if (i == 0) { s += 0.10 * v; d += 0.10 * g; }
    if (i == 1) lowD = d;
    p  = M2 * p * 2.0 + vec2(11.7, 5.3);
    mt = mt * (M2T * 2.0);
    a *= 0.5;
  }
  return s;
}

// rill field: windowed directional impulses, one per cell of a grid laid
// over the terrain. Each impulse carries a cosine wave whose crests run along
// the local fall line (the wave vector points across the slope), under a
// Gaussian window, so the zero crossings of the sum are short channels that
// run downhill, start and stop where windows fade, and interleave between
// neighbouring impulses. The frame (down, across) is the slope at the pixel
// and only ever multiplies the small offset to an impulse, so it stays
// coherent however the slope turns. Returns the sum in x and the window
// weight in y so gaps between impulses can be told from true zero crossings.
vec2 rillField(vec2 p, vec2 across, float cells, float F, float seed) {
  vec2 q = p * cells;
  vec2 cell = floor(q), f = fract(q);
  float sum = 0.0, wsum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 off = vec2(float(i), float(j));
      vec2 id  = cell + off;
      float h1 = hash21(id + seed);
      float h2 = hash21(id * 1.7 + seed + 31.0);
      float h3 = hash21(id * 0.9 - seed + 57.0);
      vec2 d = f - (off + vec2(h1, h2));
      float wq = max(1.0 - dot(d, d), 0.0);
      float w = wq * wq * wq;                 // compact window, zero at one cell
      sum  += w * cos(TAU * F * dot(across, d) + h3 * TAU);
      wsum += w;
    }
  }
  return vec2(sum, wsum);
}

// rill carve at p for a given slope frame: V profile at the zero crossings of
// the impulse field, only where impulses actually reach
float rillCarve(vec2 p, vec2 across, float cells) {
  vec2 rc = rillField(p, across, cells, 3.0, 0.0);
  float vc = abs(rc.x) / max(rc.y, 0.05);
  return (1.0 - smoothstep(0.0, 0.6, vc)) * smoothstep(0.06, 0.30, rc.y);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t      = u_time * clamp(u_drift, 0.0, 3.0);
  float scl    = max(u_scale, 0.5);
  float sharp  = clamp(u_sharpness, 0.0, 2.0);
  float rillD  = clamp(u_erosion, 0.0, 1.5);
  float sunEl  = clamp(u_sun, 0.05, 1.0);

  // terrain coordinates: the frame height spans scl landform cells, and the
  // whole sheet drifts slowly under the camera
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * scl + vec2(3.1, 7.4)
         + vec2(0.012, 0.007) * t;

  // ---- height and finite-difference normal. The step is a little over one
  // device pixel in terrain units so the rills stay crisp but not aliased.
  float e  = 1.3 * scl / u_resolution.y;
  // the slope frame for the rills comes from the broad landform at the pixel
  vec2  lowD;
  float eroK  = 0.02 + 0.45 * rillD;
  float hBase = terrain(p, sharp, eroK, lowD);
  float slope = length(lowD);
  vec2  down  = lowD / max(slope, 1e-4);
  vec2  across = vec2(-down.y, down.x);
  // where water gathers: mid slopes, not the deposited floors, not the crests
  float gate = smoothstep(0.25, 0.80, slope)
             * (1.0 - smoothstep(0.65, 0.90, hBase))
             * smoothstep(0.12, 0.35, hBase);
  // dissection is patchy: some flanks are cut to ribbons, others left whole
  gate *= smoothstep(0.25, 0.60, vnoise(p * 1.7 + 41.0));
  float carve = rillD * 0.006 * gate;
  float cells = 11.0;
  vec2  dummy;
  float h  = hBase - carve * rillCarve(p, across, cells);
  float hx = terrain(p + vec2(e, 0.0), sharp, eroK, dummy) - carve * rillCarve(p + vec2(e, 0.0), across, cells);
  float hy = terrain(p + vec2(0.0, e), sharp, eroK, dummy) - carve * rillCarve(p + vec2(0.0, e), across, cells);
  // vertical exaggeration, in frame units, independent of the landform scale
  float vz = 0.55;
  vec3  n  = normalize(vec3(-(hx - h) * vz / e, -(hy - h) * vz / e, 1.0));

  // ---- a low sun that circles the sheet
  float az = 2.4 + t * 0.045;
  float ce = cos(sunEl * 1.4), se = sin(sunEl * 1.4);
  vec3  L  = vec3(cos(az) * ce, sin(az) * ce, se);
  float diff = clamp(dot(n, L), 0.0, 1.0);
  // soft terminator: the raking light wraps a touch so shadow faces keep form
  float wrapL = clamp(dot(n, L) * 0.8 + 0.2, 0.0, 1.0);
  float sky   = n.z * n.z;                      // sky fill, open ground sees more

  // ---- altitude bands
  float floorM = 1.0 - smoothstep(0.10, 0.32, h);   // deposited valley floor
  float crestM = smoothstep(0.62, 0.90, h);          // bare rock crest
  // slope steepness for rock versus soil
  float steep = 1.0 - n.z;
  steep = smoothstep(0.05, 0.45, steep);

  // ---- materials, all tinted from the palette but grounded in grey
  float lum0 = luma(c0), lum3 = luma(c3);
  vec3 soil  = mix(vec3(lum0), c0, 0.5) * 0.62;                // mid slopes
  vec3 rock  = mix(vec3(0.40), mix(c3, c1, 0.4), 0.4) * 0.80;  // steep faces
  vec3 crest = mix(vec3(0.75), c2, 0.30);                       // high bare tops
  vec3 depos = mix(vec3(lum3), c3, 0.5) * 0.36 + c0 * 0.05;    // valley fill
  vec3 alb = soil;
  alb = mix(alb, rock, steep * 0.7);
  alb = mix(alb, crest, crestM);
  alb = mix(alb, depos, floorM);

  // ---- light: warm sun from the second pole, cool sky from the third
  vec3 sunCol = mix(vec3(1.0), c1, 0.3) * 1.75;
  vec3 skyCol = mix(vec3(0.4), c2, 0.6) * 0.26;
  vec3 col = alb * (sunCol * mix(diff, wrapL, 0.2) + skyCol * sky);
  // shadow floors: valley bottoms sit in their own shade
  col *= 1.0 - 0.35 * floorM * (1.0 - diff);
  // valley haze: a thin cool mist pools where the ground is low
  float haze = floorM * 0.45 + (1.0 - h) * 0.12;
  col = mix(col, mix(c2, c0, 0.5) * 0.20, clamp(haze, 0.0, 0.7) * 0.55);
  // crest rim: the sun clips the highest ridges
  col += crest * crestM * diff * 0.18;

  // seat the sheet: gentle vignette
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.30 * smoothstep(0.30, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
