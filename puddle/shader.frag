// puddle (Noir) — dark wet asphalt fills the frame; puddle patches are carved out
// by a low-frequency noise mask. Inside each puddle, wobbling vertical smears of
// unseen neon — columns of palette colour stretched downward by a domain-warped
// reflection — shimmer against the black water. The dry asphalt between holds only
// a faint grain and the dimmest spill of colour at the puddle edges. The smears
// wobble slowly as the warp field drifts, and at hash-timed moments a single drip
// lands in a puddle, sending one small expanding ring that bends the reflections
// for a second before fading.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four neon colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_wobble;     // side-to-side warp amplitude of the smears (default 0.5)
uniform float u_dripRate;   // frequency of drip rings breaking puddles  (default 0.4)
uniform float u_smearWidth; // width of neon columns, CSS px (scaled by pr) (default 32)

const vec3  BG       = vec3(0.030, 0.030, 0.038); // near-black wet asphalt
const float REF_LEN  = 520.0; // CSS px height the reflection columns stretch over

// --- hash / noise helpers (no textures) ------------------------------------
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// value noise on a 2D lattice
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// two-octave fbm for the low-frequency puddle mask + warp field
float fbm(vec2 p) {
  return 0.62 * vnoise(p) + 0.30 * vnoise(p * 2.07 + 11.3) + 0.12 * vnoise(p * 4.11 + 5.1);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // normalized coords, y-up, scaled so the look is DPR-independent
  vec2  uv  = (fc - ctr) / (res.y);          // ~[-0.8..0.8] x, [-0.5..0.5] y
  float aspect = res.x / res.y;

  vec3 col = BG;

  // palette fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ----- puddle mask: low-frequency noise carves wet patches out of asphalt --
  // slowly breathing field so the puddles aren't perfectly static
  vec2  pcoord = uv * vec2(1.7, 1.7) + vec2(0.0, t * 0.012);
  float pf     = fbm(pcoord);
  // puddle interior where the field is high; soft anti-aliased shoreline.
  // thresholds tuned so puddles cover ~half the frame in broad organic patches
  float puddle = smoothstep(0.40, 0.55, pf);
  float edge   = smoothstep(0.34, 0.40, pf) * (1.0 - smoothstep(0.40, 0.48, pf));

  // ----- faint asphalt grain on the dry stone ------------------------------
  float grain = vnoise(fc / pr * 0.9 + 3.0) * 0.5 + vnoise(fc / pr * 2.3 + 17.0) * 0.5;
  col += vec3(0.012, 0.012, 0.015) * (grain - 0.5) * (1.0 - puddle);

  // ----- drip rings: per-region hash-timed expanding ripples ----------------
  // partition space into regions; each fires sparse drips on its own clock.
  // a ring momentarily displaces the reflection sampling (warpKick).
  float warpKick = 0.0;
  float ringGlow = 0.0;
  vec2  rcell = floor(uv * 3.0 + vec2(7.0, 3.0));
  // look at this region + neighbours so rings near a border still reach us
  for (int gx = -1; gx <= 1; gx++) {
    for (int gy = -1; gy <= 1; gy++) {
      vec2 cell = rcell + vec2(float(gx), float(gy));
      float h0  = hash21(cell);
      float h1  = hash21(cell + 19.7);
      float h2  = hash21(cell + 41.3);
      // drip centre jittered within the region
      vec2 center = (cell + vec2(h0, h1)) / 3.0 - vec2(7.0, 3.0) / 3.0;
      // per-region period: faster as u_dripRate climbs; guarded against 0
      float period = mix(9.0, 2.0, clamp(u_dripRate, 0.0, 2.0) * 0.5);
      float phase  = (t + h2 * period) / period;
      float idx    = floor(phase);
      float age    = fract(phase) * period;        // seconds since this drip
      // re-roll the centre each cycle so successive drips don't stack
      float r2     = hash11(dot(cell, vec2(1.0, 57.0)) + idx);
      float r3     = hash11(dot(cell, vec2(7.0, 13.0)) + idx * 1.7);
      center = (cell + vec2(r2, r3)) / 3.0 - vec2(7.0, 3.0) / 3.0;
      // only some cycles actually drip (keeps accents sparse); gate widens with rate
      float fires  = step(0.62 - clamp(u_dripRate,0.0,2.0) * 0.16, hash11(idx * 3.1 + h0 * 13.0));
      // suppress drips on dry asphalt — rings only live in water
      float here   = smoothstep(0.40, 0.55, fbm(center * vec2(1.7,1.7) + vec2(0.0, t*0.012)));

      float d   = length((uv - center) * vec2(1.0, 1.0));
      float rad = age * 0.085;                     // ring expands outward
      float life= exp(-age * 0.9);                 // ring fades over ~1s
      float ring= exp(-pow((d - rad) * 26.0, 2.0)) * life * fires * here;
      ringGlow += ring;
      // signed push so reflections bend across the ring front
      warpKick += (d - rad) * exp(-pow((d - rad) * 18.0, 2.0)) * life * fires * here * 9.0;
    }
  }

  // ----- reflected neon smears inside the puddles ---------------------------
  // Columns of palette colour stretched downward (reflection), domain-warped so
  // they wobble side to side. Column index sets hue; width set by u_smearWidth.
  float smearW = max(u_smearWidth, 4.0) * pr;       // CSS px width of a column
  // depth: 0 near the top of frame (close to the unseen sign), ~1 at the bottom
  float depth = clamp(0.62 - uv.y, 0.0, 1.0);
  // horizontal column coordinate (in column-widths), warped by a drifting field.
  // the warp grows with depth so a straight sign smears more the deeper it reflects
  float warpField = fbm(vec2(uv.x * 1.7 + 4.0, uv.y * 0.5 - t * 0.05)) - 0.5;
  float wob = warpField * (0.5 + 1.5 * depth) * u_wobble + warpKick * 0.010;
  float colX = (fc.x / smearW) + wob * 2.2;

  // per-column identity: which columns are "lit" and their hue
  float ci    = floor(colX);
  float lit   = smoothstep(0.30, 0.72, hash11(ci * 1.37));    // some columns dark
  float hue   = fract(hash11(ci * 0.71) + t * 0.01);          // slow hue drift
  // crisp column profile: a bright narrow core with feathered shoulders
  float cf    = fract(colX) - 0.5;
  float core  = exp(-cf * cf * 30.0);                          // tight bright core
  float halo  = exp(-cf * cf * 5.0);                           // soft surround
  float colProfile = core + halo * 0.35;

  // vertical streaking — the reflection is STRETCHED downward, so brightness
  // varies along y in long smears, with a slow downward shimmer crawl
  float streak = vnoise(vec2(ci * 1.3, fc.y / (smearW * 2.2) + t * 0.25));
  float vshim  = 0.45 + 0.55 * sin(fc.y / (REF_LEN * pr) * 6.2831853 * 1.1
                                   - t * 0.6 + colX * 0.5);
  float along  = mix(0.55, 1.0, streak) * vshim;

  // blend palette by column hue (no dynamic array indexing)
  float s  = hue * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
  vec3  neon = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // reflection intensity: lit column × profile × streak. Brightest toward the
  // top of the puddle (near the unseen sign), dimming as it reflects deeper.
  float refl = colProfile * lit * along * (0.35 + 0.85 * (1.0 - depth));

  // confine reflections to water; let a dim spill bleed to the shoreline
  float water = puddle;
  vec3 reflCol = neon * refl;
  col += reflCol * (water * 2.0 + edge * 0.22);

  // a touch of broad puddle sheen (specular-ish dark gradient) so water reads wet
  col += neon * 0.05 * water * lit * (0.4 + 0.6 * (1.0 - depth));

  // drip rings: bright thin glow in the water, tinted by local neon
  col += (vec3(0.9) * 0.35 + neon * 0.65) * ringGlow * water * 1.4;

  // ----- finishing: vignette + gentle tone shaping -------------------------
  float vign = 1.0 - smoothstep(0.55, 1.25, length(uv * vec2(1.0 / max(aspect,1.0) * aspect, 1.0)));
  col *= mix(0.62, 1.0, vign);

  // gentle highlight knee so the brightest neon cores bloom without clipping flat,
  // applied lightly so the columns keep their saturation
  col = col / (1.0 + col * 0.32);
  col = pow(max(col, 0.0), vec3(0.96));

  gl_FragColor = vec4(col, 1.0);
}
