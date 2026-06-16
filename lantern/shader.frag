// lantern (Bloom) — a bloom of bioluminescent jellyfish seen from above: vivid
// sunlit blue water packed wall-to-wall with luminous translucent bells at every
// depth. Each bell is a soft glowing body with a bright membrane rim, a faint
// four-gonad cross, a fine tentacle fringe round the margin, and (up close) a
// caustic shimmer through the dome. Dense parallax layers recede into the deep.
// All motion is looping drift + slow rise, so the piece returns to itself.
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
uniform float u_speed;      // drift / rise / caustic speed multiplier
uniform float u_size;       // hero bell radius multiplier
uniform float u_glow;       // overall emission multiplier
uniform float u_structure;  // interior detail (caustic + gonads + ribs), 0..1
uniform float u_atmosphere; // vividness of the lit water fill
uniform float u_colorSpread;// hero bell-to-bell hue variety
uniform float u_saturation; // bell colour vividness
uniform float u_count;      // how many hero bells are alive, 3..48
uniform float u_depth;      // randomized depth: far ones shrink + fade + blur
uniform float u_shape;      // per-bell squash / tilt / rim distortion, 0..1
uniform float u_tentacles;  // marginal tentacle-fringe length, 0..1
uniform float u_haze;       // density of the parallax jelly layers, 0..1
uniform float u_variety;    // per-bell randomization of size / glow / detail / hue

const int MAX_LANTERNS = 48;  // GLSL needs a const loop bound; u_count culls

float hash11(float n) { return fract(sin(n * 91.37 + 2.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(41.3, 289.1)) + 1.7) * 43758.5453); }

// Read a palette entry with the house all-zero fallback to midnight.
vec3 pal(int i) {
  vec3 c = i == 0 ? u_palette[0] : i == 1 ? u_palette[1]
         : i == 2 ? u_palette[2] : u_palette[3];
  vec3 sum = u_palette[0] + u_palette[1] + u_palette[2] + u_palette[3];
  if (dot(sum, sum) < 1e-5) {
    if (i == 0) return vec3(0.231, 0.510, 0.965);
    if (i == 1) return vec3(0.659, 0.333, 0.969);
    if (i == 2) return vec3(0.133, 0.827, 0.933);
    return vec3(0.957, 0.247, 0.369);
  }
  return c;
}

// push or pull saturation around luma
vec3 satur(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(l), c, s), 0.0, 1.0);
}

// ridged caustic interference — bright web veins from summed travelling waves
float caustic(vec2 q, float t) {
  float v = sin(q.x * 6.3 + t)
          + sin(q.y * 5.7 - t * 0.8 + 1.3)
          + sin((q.x + q.y) * 4.4 + t * 0.6)
          + sin((q.x - q.y) * 5.1 - t * 0.5 + 2.1)
          + sin(length(q) * 9.0 - t * 1.1);
  v = abs(v) * 0.2;
  return pow(1.0 - clamp(v, 0.0, 1.0), 4.5);
}

// One translucent jelly bell at local coords `p`, radius `r`, tinted `col`.
//   detail 0..1  — interior structure (gonads + ribs, and caustic up close)
//   soft   0..1  — depth defocus: softer rim/body/core for far bells
//   fr     0..1  — marginal tentacle-fringe length
// Returns additive emissive colour. Body reads as bright translucent tissue
// (pushed toward white), rim + fringe are brighter membrane.
vec3 jelly(vec2 p, float r, float seed, float t, vec3 col,
           float detail, float soft, float fr) {
  float rad = length(p) / max(r, 1e-3);
  float flen = fr * 0.30;                     // fringe length past the rim
  if (rad > 1.06 + flen) return vec3(0.0);    // cutoff < 1 grid cell -> no clip
  float ang = atan(p.y, p.x);

  // translucent body
  float body = pow(smoothstep(1.02, 0.0, rad), mix(1.0, 1.55, soft));
  // CRISP bright membrane rim (sharp when near, only softening with depth)
  float rip = 0.025 * sin(ang * 6.0 + t * 0.8 + seed * 5.0);
  float rim = exp(-pow((rad - (0.9 + rip)) * mix(13.0, 4.0, soft), 2.0));
  // bright inner core
  float core = exp(-rad * rad * mix(6.0, 3.0, soft));

  float inner = 0.0;
  if (detail > 0.01) {
    // four moon-jelly gonad lobes
    inner += (0.5 + 0.5 * cos(ang * 4.0 + seed)) * exp(-pow((rad - 0.5) * 2.8, 2.0)) * 0.5;
    // fine radial canal filaments — crisp thin lines, the interior detail,
    // faded out before the rim so they read as canals, not a spoke wheel
    float ribN = 16.0 + floor(seed * 18.0);
    float ribs = pow(0.5 + 0.5 * sin(ang * ribN + sin(rad * 6.0 - t) * 0.8 + seed * 3.0), 6.0);
    inner += ribs * smoothstep(0.12, 0.45, rad) * (1.0 - smoothstep(0.72, 0.95, rad)) * 0.55;
    // caustic shimmer through the dome, near bells only (cost gate)
    if (detail > 0.45) {
      vec2 q = p / max(r, 1e-3) * 3.0 + seed * 7.0;
      inner += caustic(q, t * 0.7 + seed * 4.0) * 0.4 * smoothstep(0.95, 0.2, rad);
    }
    inner *= detail * mix(1.0, 0.45, soft);   // far bells blur out, near stay crisp
  }

  // tentacle fringe: MANY fine thin strands radiating just past the rim, clearly
  // visible but hair-fine (not chunky spikes); waves slowly, tapers to the tips.
  float fringe = 0.0;
  if (fr > 0.01) {
    float ro = (rad - 0.9) / max(flen, 1e-4);
    if (ro > 0.0 && ro < 1.0) {
      float wob = sin(t * 1.0 + seed * 5.0 + ang * 2.0) * 0.35;
      float nFr = 60.0 + floor(seed * 60.0);
      float comb = pow(0.5 + 0.5 * sin(ang * nFr + wob), 3.0);
      fringe = comb * (1.0 - ro * ro) * smoothstep(0.0, 0.15, ro);
    }
  }

  vec3 bodyC = mix(col, vec3(1.0), 0.26);   // tissue scatters toward white
  vec3 rimC  = mix(col, vec3(1.0), 0.50);
  return bodyC * (body * 0.55 + inner * 0.7 + core * 0.5)
       + rimC  * (rim * 0.85 + fringe * 0.45);
}

// One parallax layer of jellies: a hash grid with one slowly-rising, looping,
// faintly-pulsing bell per cell. `detail` gates interior structure; far layers
// pass 0 for plain bright domes.
vec3 hazeLayer(vec2 uv, float t, float scale, float drift, float detail,
               float bright, float fr, float sat, vec3 t0, vec3 t1, float so) {
  vec3 acc = vec3(0.0);
  vec2 cid = floor(uv * scale + so);
  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 cc = cid + vec2(float(ox), float(oy));
      if (hash21(cc + so + 13.1) > 0.86) continue;       // organic gaps
      float h = hash21(cc + so);
      float rise = fract(hash21(cc + so + 5.0) + t * drift * (0.6 + 0.8 * h));
      float sway = 0.08 * sin(t * 0.6 + h * 6.28);
      vec2  jc = (cc + vec2(0.2 + 0.6 * h + sway, rise)) / scale;   // kept off cell edges
      vec2  p  = (uv - jc) * scale;
      if (dot(p, p) > 1.0) continue;                     // splat fits inside a cell
      // radius capped so the bell never exceeds the 3x3 neighbourhood (no clip)
      float rr = mix(0.30, 0.58, h);
      float pulse = 0.85 + 0.15 * sin(t * 1.3 + h * 6.0);
      float vis = smoothstep(0.0, 0.12, rise) * (1.0 - smoothstep(0.86, 1.0, rise));
      vec3 c = satur(mix(t0, t1, h), sat);
      acc += jelly(vec2(p.x, p.y * 1.12), rr, h * 3.7, t, c, detail, 0.6, fr) * vis * pulse * bright;
    }
  }
  return acc;
}

void main() {
  vec2  res = u_resolution;
  vec2  uv  = (gl_FragCoord.xy - 0.5 * res) / res.y;   // y in -0.5..0.5
  float t   = u_time * u_speed;
  float structure = clamp(u_structure, 0.0, 1.0);

  // --- vivid sunlit deep water, never dead black ---
  float vgrad = smoothstep(-0.7, 0.7, uv.y);            // deep bottom .. bright top
  vec3 wDeep = satur(pal(0), 1.15) * 0.30;
  vec3 wSurf = satur(mix(pal(0), pal(2), 0.55), 1.15);
  vec3 water = mix(wDeep, wSurf, vgrad);
  // soft light shafts from the surface + caustic shimmer
  float shafts = pow(0.5 + 0.5 * sin(uv.x * 5.0 + 0.3), 3.0)
               + pow(0.5 + 0.5 * sin(uv.x * 8.3 - 1.1), 4.0) * 0.6;
  shafts *= smoothstep(-0.5, 0.65, uv.y);
  float shimmer = 0.5 + 0.5 * sin(uv.x * 3.0 + t * 0.25) * sin(uv.y * 2.3 - t * 0.2);
  water *= 0.72 + 0.34 * shimmer + 0.26 * shafts;
  vec3 col = water * (0.4 + 0.85 * u_atmosphere);

  // --- dense parallax jelly layers (the bulk of the bloom) ---
  if (u_haze > 0.01) {
    float hz = clamp(u_haze, 0.0, 1.0);
    vec3 L1 = hazeLayer(uv, t, mix(4.5,  9.0,  hz), 0.05,  0.5, 1.0, 0.0, u_saturation, pal(2), pal(0),  2.0);
    vec3 L2 = hazeLayer(uv, t, mix(7.0,  14.0, hz), 0.042, 0.3, 0.8, 0.0, u_saturation, pal(0), pal(1), 23.0);
    vec3 L3 = hazeLayer(uv, t, mix(11.0, 22.0, hz), 0.032, 0.0, 0.6, 0.0, u_saturation, pal(1), pal(2), 51.0);
    vec3 L4 = hazeLayer(uv, t, mix(18.0, 36.0, hz), 0.024, 0.0, 0.42,0.0, u_saturation, pal(2), pal(0), 87.0);
    col += (L1 + L2 + L3 + L4) * hz * u_glow * 0.6;
  }

  // --- hero bells: the big sharp foreground individuals ---
  for (int i = 0; i < MAX_LANTERNS; i++) {
    float fi = float(i);
    if (fi > u_count - 1.0) break;
    float ph = fi * 1.2566;
    float sp = 0.09 + 0.035 * fi;

    // depth, skewed toward NEAR so most hero bells stay big, crisp and detailed
    // (the deep, blurred, faraway field is carried by the haze layers)
    float dd = pow(hash11(fi * 1.7 + 3.0), 1.5) * clamp(u_depth, 0.0, 1.0);

    // per-bell randomization (scaled by u_variety)
    float var     = clamp(u_variety, 0.0, 1.0);
    float vSize   = mix(1.0, mix(0.66, 1.34, hash11(fi * 7.9 + 6.0)), var);
    float vGlow   = mix(1.0, mix(0.65, 1.25, hash11(fi * 9.3 + 8.0)), var);
    float vDetail = mix(1.0, mix(0.4,  1.0,  hash11(fi * 6.1 + 2.0)), var);
    float vHue    = (hash11(fi * 11.7 + 4.0) - 0.5) * 2.0 * var;

    // frame-filling hash anchor + small looping orbit
    vec2 anchor = vec2(hash11(fi * 1.3 + 0.5) * 1.9 - 0.95,
                       hash11(fi * 2.7 + 4.2) * 1.3 - 0.65);
    vec2 c = anchor + vec2(
      0.24 * sin(t * sp + ph) + 0.10 * cos(t * sp * 0.6 + ph * 1.7),
      0.20 * cos(t * sp * 0.8 + ph * 1.3) + 0.09 * sin(t * sp * 0.5 + ph)
    );

    float br = 0.55 + 0.45 * sin(t * (0.35 + 0.05 * fi) + ph * 2.0);
    float r  = mix(0.20, 0.34, 0.5 + 0.5 * sin(t * 0.3 + ph)) * u_size
             * mix(1.0, 0.32, dd) * vSize;

    vec2 d = uv - c;
    float reach = r * mix(1.7, 2.3, dd);
    if (dot(d, d) > reach * reach) continue;

    // per-bell shape: area-preserving squash, off-axis tilt, tri-lobe rim wobble
    float sh = clamp(u_shape, 0.0, 1.0);
    float aspect = mix(1.0, mix(0.72, 1.4, hash11(fi * 3.1 + 1.0)), sh);
    float tilt   = (hash11(fi * 5.7 + 9.0) - 0.5) * 2.6 * sh;
    float cs = cos(tilt), sn = sin(tilt);
    vec2 dl = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y);
    dl = vec2(dl.x / aspect, dl.y * aspect);
    float aw = atan(dl.y, dl.x);
    dl *= 1.0 + sh * 0.14 * sin(aw * 3.0 + fi * 2.0);

    // hue: two adjacent palette entries, nudged per-bell
    float sel = mod(fi * mix(0.0, 1.7, u_colorSpread) + vHue * 1.3 + t * 0.05 + 0.5, 4.0);
    vec3  cc  = mix(pal(int(sel)), pal(int(mod(sel + 1.0, 4.0))), fract(sel));
    cc = satur(cc, u_saturation);

    float detail = structure * vDetail;
    vec3 em = jelly(dl, r, fi * 0.37, t, cc, detail, dd, u_tentacles);
    float bright = mix(0.65, 1.0, br) * u_glow * vGlow * mix(1.0, 0.42, dd);
    col += em * bright;
  }

  // tone curve: overlaps bloom toward white without clipping, water stays rich
  col = col / (col + vec3(0.85));
  col = pow(col, vec3(0.82));

  gl_FragColor = vec4(col, 1.0);
}
