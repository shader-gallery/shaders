// nerve (Omen) — a living neural culture. Dozens of dim, soft-edged nuclei are
// seeded blue-noise across a near-black dish, each holding a barely-visible
// resting glow. Excitation waves start at hash-random cells on staggered phases
// and roll node-to-node across the field over many seconds: a cell blooms bright
// in a palette hue keyed to its position, then slumps into a darker-than-rest
// refractory shadow as the wavefront curves on past it. No lines are ever drawn —
// the wiring is invisible; the light hops cell-to-cell as discrete point-flashes,
// reading as curved wavefronts sweeping a stationary constellation.
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
uniform float u_fireRate;     // how often new excitation waves start    (default 0.35)
uniform float u_spreadSpeed;  // node-to-node cascade propagation rate    (default 0.3)
uniform float u_spacing;      // cell spacing in CSS px, *u_pixelRatio    (default 56)
uniform float u_afterglow;    // ember + refractory shadow linger length  (default 0.45)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black dish ~#09090B
const float NUCLEUS  = 0.34;   // nucleus core radius as a fraction of spacing
const int   SRC_CT   = 7;      // concurrent wave sources crossing the dish
const float DISH_CSS = 1400.0; // reference dish extent (for source travel scale)

// cheap 2D hash -> 0..1
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 11.7));
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

  vec3 col = BG;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 6.0) * refScale * pr;

  // ---- cell constellation: a jittered grid reads as blue-noise seeding ----
  // We examine the 3x3 neighbourhood of grid cells so a nucleus near a border
  // still lights this fragment. Each grid slot holds exactly one nucleus,
  // pushed off-lattice by a per-slot hash jitter.
  vec2 gid = floor(fc / spacing);

  // ---- palette: hue keyed to nucleus position (a fixed map over the dish) ----
  vec3 p0 = u_palette[0], p1 = u_palette[1], p2 = u_palette[2], p3 = u_palette[3];
  if (dot(p0,p0)+dot(p1,p1)+dot(p2,p2)+dot(p3,p3) < 1e-5) {
    p0 = vec3(0.231,0.510,0.965); p1 = vec3(0.659,0.333,0.969);
    p2 = vec3(0.133,0.827,0.933); p3 = vec3(0.957,0.247,0.369);
  }

  // ---- emission accumulated from this fragment's neighbouring nuclei ----
  vec3  emit = vec3(0.0);   // additive glow: resting embers + firing blooms
  float dark = 0.0;         // subtractive refractory shadow (darker than rest)

  // propagation: distance the wavefront travels per second, in spacings
  float speed = mix(0.6, 9.0, clamp(u_spreadSpeed, 0.0, 1.0)); // spacings / sec
  // afterglow shapes how long ember + refractory linger behind the front
  float glowTail = mix(0.55, 4.5, clamp(u_afterglow, 0.0, 1.0));
  float refrTail = mix(0.9, 5.0, clamp(u_afterglow, 0.0, 1.0));
  // fire rate -> wave launch cadence; more rate = shorter gaps between cascades
  float period = mix(34.0, 5.0, clamp(u_fireRate, 0.0, 1.0)); // sec between launches

  for (int oy = -1; oy <= 1; oy++) {
    for (int ox = -1; ox <= 1; ox++) {
      vec2 cid = gid + vec2(float(ox), float(oy));
      // nucleus position: cell centre + hashed jitter (kept inside the cell so
      // neighbouring nuclei never overlap), giving an even blue-noise scatter
      vec2 jit = (hash22(cid) - 0.5) * 0.66;
      vec2 npos = (cid + 0.5 + jit) * spacing;

      vec2 d = fc - npos;
      float r2 = dot(d, d) / (spacing * spacing);
      // soft gaussian nucleus body: brightest at centre, fading to nothing —
      // reads as a soft-edged dot, never a ring/outline (the spec draws no lines)
      float body = exp(-r2 / (NUCLEUS * NUCLEUS * 0.5));
      if (body <= 0.002) continue;

      // resting breath: every nucleus barely pulses so the field is never still
      float rest = 0.05 + 0.03 * sin(t * 0.5 + hash21(cid) * 6.2831853);

      // ---- this nucleus's activation from each travelling wavefront ----
      float act = 0.0;     // firing strength (0..~1)
      float dip = 0.0;     // refractory strength (0..~1)
      // grid distance of this nucleus from dish centre, in spacings, used to
      // place it on the radially-expanding wavefronts
      vec2  ncell = cid + 0.5;
      vec2  cgrid = ctr / spacing;

      for (int s = 0; s < SRC_CT; s++) {
        float fs = float(s);
        // each source fires on its own staggered phase; cycle so waves keep
        // launching forever with no global reset
        float ph = t / period + fs * 0.61803398;
        float waveIdx = floor(ph);          // which launch of this source
        float local   = fract(ph) * period; // seconds since this source fired

        // source origin: a hash-random cell, re-chosen each launch so wavefronts
        // start all over the dish rather than from fixed points
        vec2  shash = hash22(vec2(fs * 13.1, waveIdx * 7.7));
        float spread = (DISH_CSS * pr / spacing); // dish half-extent in spacings
        vec2  srcCell = (shash - 0.5) * spread + cgrid;

        // wavefront radius (in spacings) grows from the source over time
        float front = local * speed;
        // distance from this nucleus to the source, in spacings
        float dist  = length(ncell - srcCell);

        // signed offset of this nucleus from the wavefront, in spacings:
        //   band > 0  -> front hasn't reached it yet (still at rest)
        //   band ~ 0  -> firing right now (the bright bloom)
        //   band < 0  -> front has passed; cooling ember / refractory shadow
        float band  = (dist - front);
        float behind = max(0.0, -band);

        // firing flash: a sharp travelling shell, antialiased; node-to-node hop
        float shell = exp(-band * band / 0.9);

        // cooling ember trailing the front — AFTERGLOW sets how far it lingers.
        // exp falloff over glowTail spacings; amplitude also scales with afterglow
        // so at afterglow=0 the cell snaps straight back to rest (no wake).
        float ember = exp(-behind / glowTail) * smoothstep(0.0, 0.4, behind)
                      * (0.15 + 0.85 * clamp(u_afterglow, 0.0, 1.0));

        // refractory shadow sits just behind the front, then the ember cools into
        // it; AFTERGLOW lengthens and deepens this darker-than-rest slump.
        float refShadow = exp(-behind / refrTail) * smoothstep(0.0, 0.5, behind)
                          * (0.2 + 0.8 * clamp(u_afterglow, 0.0, 1.0));

        // only emit while the wave is alive and still on the dish
        float alive = smoothstep(0.0, 1.5, local) * (1.0 - smoothstep(spread * 0.55, spread * 0.9, front));

        act = max(act, max(shell, ember) * alive);
        dip = max(dip, refShadow * alive);
      }

      // ---- this nucleus' hue: keyed to its fixed grid position + a very slow
      // drift so the colour map breathes without a visible loop ----
      float kk = hash21(cid) + (cid.x * 0.013 - cid.y * 0.011) + t * 0.008;
      float ss = fract(kk) * 4.0;
      float w0 = wheelW(ss,0.0), w1 = wheelW(ss,1.0), w2 = wheelW(ss,2.0), w3 = wheelW(ss,3.0);
      vec3 hue = (p0*w0 + p1*w1 + p2*w2 + p3*w3) / max(w0+w1+w2+w3, 0.001);

      // refractory suppresses this nucleus' rest+fire (darker-than-rest slump)
      float supp = 1.0 - 0.9 * dip;
      // brightness of THIS nucleus: dim resting ember -> bright firing bloom
      float lvl = (rest + act * 2.2) * max(supp, 0.0);
      // emission: hue scaled by level, plus a hot white-ish core when fully firing
      vec3 glow = hue * lvl + vec3(1.0) * (act * act) * 0.35 * max(supp, 0.0);

      // additive accumulation weighted by the soft gaussian body
      emit += glow * body;
      // refractory darkens the dish where this nucleus sits, behind the front
      dark  = max(dark, dip * body);
    }
  }

  // ---- compose over the near-black dish ----
  col = BG;
  col += emit;                          // resting embers + firing point-flashes
  col -= (BG + vec3(0.02,0.02,0.03)) * dark * 0.9; // refractory shadow, below rest

  // radial vignette keeps the dish edges dark, centre luminous
  float vign = 1.0 - smoothstep(0.45, 1.20, length((fc - ctr) / res));
  col *= mix(0.74, 1.0, vign);

  col = max(col, vec3(0.0));
  gl_FragColor = vec4(col, 1.0);
}
