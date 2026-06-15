// nova (Abyss) — a supernova remnant. A bright progenitor star burns off-centre,
// wreathed in a persistent glowing nebula of turbulent gas and radial filaments
// that never goes dark. From it, expanding shells of light are shed continuously
// and phase-staggered, so there is always a ragged FBM-torn ring sweeping across
// the frame while another is being born and a third dissolving into the dark — no
// blank interval. The shells cycle through the palette as they age (hot cyan core
// → violet → ember red), filaments crawl, and the gas slowly churns. Unbounded
// drift — nothing snaps back.
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
uniform float u_novaPeriod;  // seconds per shell-shedding cycle (default 26)
uniform float u_ringWidth;   // shell thickness in css px        (default 22)
uniform float u_filament;    // FBM raggedness of the rims 0..1   (default 0.6)
uniform float u_glow;        // intensity of the persistent remnant gas (default 1)

const vec3  BG       = vec3(0.030, 0.030, 0.044); // near-black base
const float TWOPI    = 6.2831853;
const int   NSHELL   = 3;                          // overlapping shells in flight

// --- hash / value-noise / fbm (no textures) -------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.123);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(11.3, 7.1);
    amp *= 0.5;
  }
  return v;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  float mn  = min(res.x, res.y);
  vec2  uv  = (fc - 0.5 * res) / mn;

  // progenitor near a frame edge so shells sweep across the whole frame
  vec2  src = vec2(-0.28, 0.20);

  // palette fallback (house convention)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 col = BG;

  vec2  d2   = uv - src;
  float dist = length(d2);
  float ang  = atan(d2.y, d2.x);
  float fil  = clamp(u_filament, 0.0, 1.0);
  vec2  acrd = vec2(cos(ang), sin(ang));

  // ---- persistent remnant nebula: turbulent gas + radial filaments ---------
  // always lit so the interior never goes blank between sheddings. Gas churns
  // slowly; filaments radiate from the source and crawl.
  float gasN  = fbm(d2 * 2.6 + vec2(t * 0.02, -t * 0.015));
  float gasFall = exp(-dist * 1.5);                       // concentrated near source
  float fila  = fbm(vec2(ang / TWOPI * 9.0 + t * 0.03, dist * 3.2 - t * 0.05));
  float interior = gasFall * (0.35 + 0.9 * gasN) * (0.55 + 0.9 * fila);
  // colour the gas: hot violet/cyan near the core fading to ember red outward
  vec3 gasCol = mix(mix(c2, c1, 0.5), c3, smoothstep(0.0, 0.7, dist));
  col += gasCol * interior * (0.55 * clamp(u_glow, 0.0, 2.0));

  // ---- expanding shells (continuous, phase-staggered) ----------------------
  float period = max(u_novaPeriod, 4.0);
  float maxR   = 1.75;                                    // reaches off the far corner
  float wBase  = (max(u_ringWidth, 1.0) * pr) / mn;
  vec3  shellAccum = vec3(0.0);
  for (int k = 0; k < NSHELL; k++) {
    // each shell offset by 1/NSHELL of the cycle -> one is always mid-flight
    float ph = fract(t / period + float(k) / float(NSHELL) + 0.13 * float(k));
    float er = ph;                                        // 0..1 expansion
    float rg = 1.0 - pow(1.0 - er, 1.4);                  // ease-out leap then settle
    float ringR = rg * maxR;

    // FBM-torn rim (coarse bulges + fine strands), seeded per shell
    float seed = float(k) * 7.3;
    float ragCoarse = fbm(acrd * 3.0 + vec2(13.0 + seed, 5.0)) - 0.5;
    float ragFine   = fbm(acrd * 9.0 + vec2(seed, ringR * 0.5)) - 0.5;
    float ragged = ragCoarse * 0.7 + ragFine * 0.5;
    float ragR = ringR + ragged * fil * 0.26;

    float wN = wBase * (0.7 + 0.8 * er);
    float ringFade = (1.0 - er * 0.5) * (1.0 - smoothstep(0.86, 1.0, er));
    ringFade *= smoothstep(0.0, 0.05, er);                // born softly
    float widthDim = 0.045 / (wN + 0.045);

    float shell  = exp(-pow((dist - ragR) / max(wN, 1e-3), 2.0));
    float strand = mix(1.0, 0.30 + 1.5 * fbm(acrd * 14.0 + ringR * 2.0 + seed), fil);
    float ring   = shell * ringFade * strand * widthDim;

    // shell colour cycles through the palette as it ages
    vec3 ringCol = mix(c2, c1, smoothstep(0.0, 0.55, er));
    ringCol = mix(ringCol, c3, smoothstep(0.5, 1.0, er));
    vec3 core = mix(ringCol, vec3(1.0), 0.30 * (1.0 - er));
    shellAccum += core * ring;
  }
  col += shellAccum * 2.7;

  // ---- progenitor star: persistent bright core, gentle pulse ---------------
  float pulse = 0.85 + 0.15 * sin(t * 0.9);
  float starCore = exp(-pow(dist / 0.013, 2.0));
  float starGlow = exp(-dist / 0.10);
  vec3  starCol  = mix(c2, vec3(1.0), 0.45);
  col += starCol * starGlow * (0.55 * pulse);
  col += vec3(1.0) * starCore * 1.4 * pulse;

  // ---- starfield (denser than before so the void reads populated) ----------
  vec2  sgrid = uv * 9.0;
  vec2  cid   = floor(sgrid);
  vec2  cf    = fract(sgrid) - 0.5;
  float rnd   = hash21(cid * 1.7 + 3.1);
  float present = step(0.66, rnd);                        // ~34% of cells host a star
  vec2  jitter  = (vec2(hash21(cid + 5.2), hash21(cid + 9.8)) - 0.5) * 0.7;
  float sdStar  = length(cf - jitter);
  float twk     = 0.45 + 0.55 * sin(t * (1.1 + 1.8 * hash21(cid + 1.1)) + rnd * 31.4);
  float starPt  = exp(-pow(sdStar / 0.05, 2.0)) * present * twk;
  vec3  fieldCol = mix(mix(c0, vec3(1.0), 0.3), c2, hash21(cid + 7.7));
  col += fieldCol * starPt * 0.28;

  // ---- finishing ---------------------------------------------------------
  float vign = 1.0 - smoothstep(0.45, 1.15, length(uv) * 1.3);
  col *= mix(0.72, 1.0, vign);
  col = col / (1.0 + col * 0.33);                          // soft filmic clamp

  gl_FragColor = vec4(col, 1.0);
}
