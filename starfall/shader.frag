// starfall (Abyss) — a deep, drifting starfield. Three parallax layers of
// hash-placed points (no regular grid) of varying size and brightness rain down
// on a diagonal, each twinkling on its own phase; the brighter stars take a
// palette tint. Behind them, a faint fbm nebula carries the palette mood. Layers
// scroll on a continuous cell coordinate so the loop has no visible reset.
// Uniforms (from the runtime): u_time s, u_resolution device px, u_mouse,
// u_pixelRatio (capped DPR), u_palette[4] themeable 0..1 rgb.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;    // fall/twinkle speed multiplier  (default 1)
uniform float u_density;  // star density, 0..1            (default 0.5)
uniform float u_size;     // star size multiplier           (default 1)
uniform float u_nebula;   // nebula wash strength           (default 0.3)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near #09090B
const float CELL_CSS = 38.0;  // average star spacing (px) at base layer

// 2D hash -> 0..1
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 7.13));
}

// smooth value noise + fbm for the nebula wash
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * vnoise(p); p *= 2.02; a *= 0.5; }
  return s;
}

// one scrolling star layer; `scale`/`depth` set density + parallax brightness
vec3 starLayer(vec2 fc, vec2 res, float t, float scale, float depth) {
  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float cell = CELL_CSS * refScale * u_pixelRatio * scale;
  vec2 drift = vec2(0.18, -1.0) * t * cell * 0.45; // diagonal rain; seamless
  vec2 uv    = (fc + drift) / cell;
  vec2 id    = floor(uv);
  vec2 g     = fract(uv) - 0.5;

  vec3 acc = vec3(0.0);
  // 3x3 neighbourhood so a star's glow can spill across cell borders
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 off = vec2(float(i), float(j));
      vec2 cid = id + off;
      vec2 rnd = hash22(cid * 1.37 + 11.0);
      vec2 pos = off + (rnd - 0.5) * 0.82; // jitter within cell -> no grid
      float d  = length(g - pos);

      float seed = hash21(cid * 2.13 - 4.0);
      // density slides the presence threshold; default 0.5 keeps 0.78..0.97
      float th = 0.78 - (u_density - 0.5) * 0.3;
      float present = smoothstep(th, th + 0.19, seed); // sparse: most cells empty
      float size = mix(0.018, 0.07, hash21(cid + 19.0)) * (0.7 + depth) * u_size;

      // per-star twinkle, strictly positive (negatives would punch black specks)
      float ph  = rnd.x * 6.2831853;
      float tw  = 0.45 + 0.4 * sin(t * (0.8 + rnd.y * 1.8) + ph);

      // hot near-white core + wide palette-tinted halo, windowed to fade before
      // the sample edge so no glow is clipped at a cell border (no tiles)
      float win  = smoothstep(1.45, 0.6, d);
      float core = exp(-d * d / (size * size * 0.5));
      float halo = exp(-d / (size * 2.4 + 0.02));
      float vis  = present * tw * win;
      // pick this star's palette colour
      float bright = smoothstep(0.86, 1.0, seed);
      int   ci     = int(floor(hash21(cid - 8.0) * 4.0));
      vec3  tint   = u_palette[0];
      if (ci == 1) tint = u_palette[1];
      else if (ci == 2) tint = u_palette[2];
      else if (ci == 3) tint = u_palette[3];
      vec3 coreCol = mix(vec3(1.0), tint, 0.3 + bright * 0.4);
      acc += coreCol * core * vis * (0.9 + bright * 2.2);     // bright hot point
      acc += tint    * halo * vis * (0.4 + bright * 1.0);     // coloured bloom
    }
  }
  return acc * depth;
}

void main() {
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time * u_speed;
  vec2  uvn = (fc - 0.5 * res) / res.y; // aspect-correct, centered
  vec3  col = BG;

  // --- faint nebula: drifting fbm clouds carry palette colour so the whole
  // field wears the mood; two octaves cross-fade the hues ---
  vec2  np  = uvn * 1.6 + vec2(0.02 * t, -0.05 * t);
  float n0  = fbm(np);
  float n1  = fbm(np * 1.9 + 5.0);
  float radial = smoothstep(1.25, 0.0, length(uvn)); // sink edges into dark
  vec3  neb = mix(u_palette[0], u_palette[1], smoothstep(0.25, 0.75, n0));
  neb       = mix(neb, u_palette[2], smoothstep(0.4, 0.85, n1) * 0.7);
  neb       = mix(neb, u_palette[3], smoothstep(0.55, 0.95, n0 * n1) * 0.6);
  float density = pow(smoothstep(0.25, 0.85, n0 * 0.6 + n1 * 0.4), 1.6);
  col += neb * density * radial * u_nebula;

  // --- three parallax star layers, far -> near (dim/dense to bright/sparse)
  col += starLayer(fc, res, t, 1.6, 0.45);
  col += starLayer(fc, res, t, 1.0, 0.80);
  col += starLayer(fc, res, t, 0.62, 1.25);

  col *= 1.0 - 0.4 * dot(uvn, uvn);   // gentle vignette
  col = col / (col + 0.7);            // soft rolloff so bright stars bloom
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
