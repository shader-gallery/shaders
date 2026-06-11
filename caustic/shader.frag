// caustic (Shoal) — the pool-bottom light net: two jittered Voronoi cell layers
// each glow along their borders (F2-F1 ridges), multiplied into a sharp filament
// web with hot knots where lines cross, on near-black ground. The two layers
// drift opposite ways while each cell's jitter point orbits a slow sin/cos phase,
// so the net fattens, thins and rewires continuously — liquid wander, no reset.
// Hue varies gently by position and cell id so the four palette colours read as
// regional tints, not a rainbow wash.
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
uniform float u_shearSpeed;  // relative drift rate between the two layers (default 0.3)
uniform float u_cellCss;     // cell size in css px, scaled by u_pixelRatio   (default 160)
uniform float u_filament;    // ridge falloff sharpness exponent             (default 2)

const vec3  BG = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B

// hash a cell id -> pseudo-random vec2 in 0..1
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// Voronoi over a drifting + orbiting jitter field. Returns:
//   .x = F2 - F1 (border ridge distance, in cell units)
//   .y = a stable scalar id for the nearest cell (for hue)
vec2 caustic(vec2 uv, float t, float seed) {
  vec2 g = floor(uv);
  vec2 f = uv - g;
  float f1 = 8.0, f2 = 8.0;   // nearest, 2nd-nearest squared-ish distances
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 lat = vec2(float(i), float(j));
      vec2 h   = hash2(g + lat + seed);
      // each cell's jitter point orbits on its own slow sin/cos phase
      float ph = 6.2831853 * (h.x + h.y);
      vec2 jit = 0.5 + 0.42 * vec2(sin(t + ph), cos(t * 0.86 + ph * 1.31));
      vec2 d   = lat + jit - f;
      float dist = dot(d, d);
      if (dist < f1) {
        f2 = f1; f1 = dist;
        id = h.x + h.y * 1.37;     // stable per-cell id
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  return vec2(sqrt(f2) - sqrt(f1), id);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  vec3 col = BG;

  // cell size in device px; guard against a 0 param
  float cell = max(u_cellCss, 1.0) * pr;
  // normalized-ish coords so the web scales with resolution but keeps cell size
  vec2 p = (fc - ctr) / cell;

  // the two layers drift in different directions in an unbounded domain so the
  // web never visibly resets; shear speed sets how fast they rewire relative
  // to each other
  float spd = u_shearSpeed;
  float tA = t * (0.25 + spd * 0.9);
  float tB = t * (0.25 + spd * 0.9) * 1.27;
  vec2 driftA = vec2( 0.11, 0.07) * t * (0.4 + spd);
  vec2 driftB = vec2(-0.09, 0.13) * t * (0.4 + spd);

  vec2 layA = caustic(p + driftA, tA, 0.0);
  vec2 layB = caustic(p * 1.43 + driftB, tB, 19.7);

  // ridge: bright along cell borders (small F2-F1), sharpness from u_filament.
  // tighter smoothstep window -> hairline filaments rather than soft blotches
  float fil = max(u_filament, 0.1);
  float wA = pow(1.0 - smoothstep(0.0, 0.28, layA.x), fil);
  float wB = pow(1.0 - smoothstep(0.0, 0.28, layB.x), fil);

  // the web is both layers' filaments laid over each other; hot knots flare
  // where the two ridges cross (the multiply term), giving the classic
  // caustic glints at line intersections without darkening the strands away.
  float web  = max(wA, wB);
  float knot = wA * wB;

  // hue varies gently by position and cell id -> regional palette tints
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // blend cell ids of both layers + slow position roll for regional tinting
  float k = layA.y * 0.5 + layB.y * 0.5
          + (p.x * 0.06 + p.y * 0.05) + t * 0.01;
  float s  = fract(k) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  tint = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // radial vignette keeps the edges dark and the centre luminous
  float vign = 1.0 - smoothstep(0.18, 0.95, length((fc - ctr) / res));

  // compose: filament web + hot knots, all on near-black ground
  col += tint * web * 0.78 * vign;
  col += tint * knot * 1.15 * vign;
  // white-hot core at the brightest knots so crossings glint
  col += vec3(1.0) * pow(knot, 1.8) * 0.4 * vign;

  gl_FragColor = vec4(col, 1.0);
}
