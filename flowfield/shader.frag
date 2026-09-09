// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// flowfield (Current) - curl-noise streamlines, the dense field of long thin
// trails a particle system leaves when it is advected through a divergence
// free velocity field. The runtime is a single pass with no feedback buffer,
// so the trails are built analytically with line integral convolution: from
// every pixel the streamline is traced a fixed arc length upstream and
// downstream (unit-speed steps so the trace length is even), and a sparse
// speck field is averaged along that trace. Every speck the trace crosses
// smears into a line lying exactly on its streamline, so the frame fills with
// thousands of aligned dashes that chain into long trails. The velocity is
// the curl of a two-octave value-noise potential with analytic derivatives
// (so it is exactly divergence free, no finite differencing), plus a steady
// base current that stretches the swirls into long combed sweeps. Brightness
// and hue follow speed: slow water near the vortex cores is dim and cool,
// the fast shear lanes between vortices burn bright toward the warm pole. A
// travelling phase along the trace makes the dashes stream in the flow
// direction while the potential itself evolves slowly, so vortices wander,
// split and merge over time. Beneath the trails a dim speed haze lights the
// ground so the field reads as depth, not lines on black.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;    // vortex scale, swirls per frame height   (default 1.2)
uniform float u_current;  // steady base current through the field  (default 0.55)
uniform float u_length;   // trail length, css px each way          (default 30)
uniform float u_density;  // how many specks seed trails            (default 0.35)
uniform float u_speed;    // evolution and streaming speed          (default 0.35)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const int NSTEP = 24;     // trace steps each way

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// value noise with analytic derivatives: returns (value, d/dx, d/dy)
vec3 noised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  // quintic fade: C2 continuous, so the curl field shows no cell seams
  vec2 u  = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k3 = a - b - c + d;
  float v  = a + k1 * u.x + k2 * u.y + k3 * u.x * u.y;
  return vec3(v, du.x * (k1 + k3 * u.y), du.y * (k2 + k3 * u.x));
}

// plain value noise for the ground and the speck seeds
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

// velocity at frame point p: curl of a two-octave potential plus base flow.
// The time offset slides each octave across a different direction so the
// vortices wander instead of rigidly translating.
vec2 velocity(vec2 p, float t, float scl, float cur) {
  vec2 q = p * scl;
  vec3 n1 = noised(q + vec2(t * 0.11, -t * 0.07));
  vec3 n2 = noised(M2 * q * 2.3 + vec2(-t * 0.16, t * 0.12) + 7.3);
  // potential gradient: octave 2 is scaled by its frequency via chain rule
  vec2 g = n1.yz + (M2 * n2.yz * 2.3) * 0.45;
  // curl: rotate the gradient a quarter turn. Not scaled by scl, so the
  // speed range holds when the vortex scale changes
  vec2 v = vec2(g.y, -g.x) * 0.55;
  // steady current, tilted a little so it does not read as a screen axis
  v += cur * vec2(0.96, 0.28);
  return v;
}

// sparse speck field at css-pixel scale q. Smooth, so a trace stepping a
// couple of pixels at a time still samples it continuously. Raised to a
// power so only the crests seed a trail.
float specks(vec2 q, float dens) {
  // one noise sheet on an odd rotation so its lattice never lines up with
  // the screen or with the dominant current
  vec2 qa = vec2(0.94 * q.x - 0.34 * q.y, 0.34 * q.x + 0.94 * q.y);
  float n = vnoise(qa * 0.42 + 13.0);
  float thr = 0.87 - 0.12 * dens;
  // a dense faint population plus the rare crests as bright leaders
  float faint  = smoothstep(thr, thr + 0.05, n);
  float leader = smoothstep(thr + 0.05, thr + 0.11, n);
  return faint * faint * 0.25 + leader;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr     = max(u_pixelRatio, 0.5);
  vec2  res    = u_resolution;
  float aspect = res.x / res.y;
  vec2  uv     = gl_FragCoord.xy / res;
  vec2  p      = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t      = u_time * clamp(u_speed, 0.0, 2.0);
  float scl    = max(u_scale, 0.3) * 1.6;
  float cur    = clamp(u_current, 0.0, 2.0) * 0.5;
  float dens   = clamp(u_density, 0.0, 1.0);
  float lenPx  = clamp(u_length, 6.0, 80.0);

  // css px <-> frame units
  float pxF  = pr / res.y;                 // one css px in frame units
  float hF   = lenPx / float(NSTEP) * pxF;   // trace step, frame units
  float stepPx = lenPx / float(NSTEP);

  // optional pointer vortex, zero at rest
  vec2  mF   = (u_mouse / res - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  // ---- velocity at the pixel (for speed shading)
  vec2  v0 = velocity(p, t, scl, cur);
  {
    vec2 d = p - mF; float r2 = dot(d, d) + 0.01;
    v0 += mAmt * vec2(-d.y, d.x) * 0.06 / r2;
  }
  float spd0 = length(v0);

  // ---- line integral convolution along the streamline, both directions.
  // Each direction traces NSTEP unit-speed steps, accumulating the speck field
  // under a travelling phase (dashes stream downstream) and a soft taper so
  // trails fade at their ends instead of stopping dead.
  float acc = 0.0, wsum = 0.0;
  float phaseK = 6.2831 / (lenPx * 0.9);   // one dash cycle per trail length
  float travel = t * 9.0;                  // px per second, in phase units
  float spdSum = 0.0;
  // per-pixel jitter of the sample phase along the trace turns the
  // step-versus-speck aliasing (a beaded ladder along each line) into a
  // fine grain, which reads as particles rather than as a pattern
  float jit = hash21(gl_FragCoord.xy * 0.731 + 0.5) - 0.5;
  for (int dir = 0; dir < 2; dir++) {
    float sgn = (dir == 0) ? 1.0 : -1.0;
    vec2 q = p;
    for (int i = 0; i < NSTEP; i++) {
      vec2 v = velocity(q, t, scl, cur);
      vec2 d = q - mF; float r2 = dot(d, d) + 0.01;
      v += mAmt * vec2(-d.y, d.x) * 0.06 / r2;
      float sp = length(v);
      float hh = (i == 0) ? hF * (0.5 + jit) : hF;
      q += sgn * v / max(sp, 1e-4) * hh;
      float s   = sgn * (float(i) + 0.5 + jit) * stepPx;    // signed arc, css px
      float tap = 1.0 - float(i + 1) / float(NSTEP + 1);
      tap = tap * (2.0 - tap);
      float ph  = 0.72 + 0.28 * cos(s * phaseK - travel * phaseK);
      float w   = tap * ph;
      acc  += w * specks(q * res.y / pr, dens);
      wsum += w;
      spdSum += sp;
    }
  }
  float lic = acc / max(wsum, 1e-4);
  // mean speed along the trace: smoother than the point speed, and it is the
  // speed the trail actually experienced
  float spd = (spd0 + spdSum) / float(2 * NSTEP + 1);

  // normalise speed against the field amplitude: 0 at a still core, 1 on the
  // brightest shear lane, slightly above where the current and a vortex add
  float spdN = clamp(spd / (0.42 + cur * 0.55), 0.0, 1.6);
  // contrast curve: stagnant water goes properly dark, lanes go hot
  spdN = smoothstep(0.12, 1.15, spdN) * 1.3;
  float spdG = spdN * spdN * 0.6;

  // ---- trail contrast: sparse specks average low, so lift and sharpen
  float trail = smoothstep(0.008, 0.16, lic);
  trail *= 0.12 + 0.88 * spdN * sqrt(spdN);    // brightness by speed
  trail += 0.45 * smoothstep(0.22, 0.60, lic) * spdG;  // leaders flare where fast

  // ---- colour by speed: cool dim pole in slow water, bright pole on the fast
  // lanes, the warm pole flaring where the flow is fastest of all
  vec3 slowCol = mix(c0, c3, 0.35) * 0.55;
  vec3 fastCol = c2;
  vec3 hotCol  = mix(c1, vec3(1.0), 0.35);
  vec3 lineCol = mix(slowCol, fastCol, smoothstep(0.10, 0.65, spdN));
  lineCol = mix(lineCol, hotCol, smoothstep(0.75, 1.25, spdN));

  // ---- ground: a dim speed haze, blue-black in the still cores, lifting to
  // a smoky tint of the fast pole along the lanes, plus a slow mottle so the
  // dark is never flat
  float mottle = vnoise(p * 3.0 + vec2(t * 0.05, 0.0)) * 0.5
               + vnoise(p * 7.0 - vec2(0.0, t * 0.04)) * 0.5;
  vec3 deep = mix(c3, c0, 0.4) * 0.07 + vec3(0.008, 0.010, 0.016);
  vec3 haze = mix(c0, c2, 0.5) * 0.22;
  vec3 ground = mix(deep, haze, spdG * (0.55 + 0.25 * mottle));
  ground += c1 * 0.04 * smoothstep(0.9, 1.3, spdN);

  // ---- composite: additive light over the ground
  vec3 col = ground + lineCol * trail * 1.15;

  // a whisper of glow: the speck field softened by the trace already bleeds
  // along the flow; add a touch across it from the neighbouring speed
  col += fastCol * 0.03 * spdG;

  // seat the frame
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.20 * smoothstep(0.30, 1.0, length(vq) * 1.42);

  gl_FragColor = vec4(col, 1.0);
}
