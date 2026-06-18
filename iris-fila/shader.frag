// fila (Rosette) — a filament-halo iris filling the frame: the base iris and its
// few hundred fibers are pushed to a dense hair-thin halo of luminous strands, each
// with a hashed length so the field feathers like a nebula or a dandelion clock
// rather than reading as solid spokes. There is no hard dark pupil here — a soft
// luminous core blooms at the centre and the strands radiate out past the
// corners, brightest mid-field and feathering into a faint halo at the edges.
// Colour blends cyclically through the palette by angle; the whole halo drifts
// and shimmers, strands brightening and dimming on per-strand phases.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fila;       // number of hair-thin strands around the circle (default 520)
uniform float u_feather;    // how much strand lengths vary (feathered halo)  (default 0.6)
uniform float u_drift;      // shimmer / drift rate of the strands            (default 0.5)
uniform float u_coreGlow;   // luminous core radius, css px (×pixelRatio)     (default 80)

const vec3  BG   = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU  = 6.28318530718;

float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

float hash11(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // guard params against the unfed-uniform = 0.0 case so extremes/headless stay sane
  float filaCount = max(u_fila, 32.0);
  float feather   = clamp(u_feather, 0.0, 1.0);
  float driftRate = max(u_drift, 0.0);
  float coreR     = max(u_coreGlow, 15.0) * pr;

  // --- polar coordinates ---
  vec2  d    = fc - ctr;
  float ang  = atan(d.y, d.x);          // -PI..PI
  float rad  = length(d);
  float maxR = length(res) * 0.5;       // half-diagonal: outward==1 at the corner
  float outward = clamp(rad / maxR, 0.0, 1.0);

  // slow drift of the whole halo
  float spin = t * 0.012;

  // ====================================================================
  // FILAMENT FIELD
  // The strand index is continuous in angle: f = (ang/TAU)*N. Evaluate the
  // two nearest integer strands and keep the stronger so hair-thin strands
  // stay crisp and anti-aliased without dynamic array indexing. Each strand
  // has a hashed reach (feathered halo), brightness and drift phase.
  // ====================================================================
  float fa  = (ang / TAU + 0.5 + spin) * filaCount;
  float fi0 = floor(fa);
  float fi1 = fi0 + 1.0;

  float filaLum  = 0.0;
  float colAngle = ang;
  float haloAccum = 0.0; // soft additive halo from near-strands so gaps glow

  for (int k = 0; k < 2; k++) {
    float fi  = (k == 0) ? fi0 : fi1;
    float fiw = mod(fi, filaCount);
    float h   = hash11(fiw + 1.0);
    float h2  = hash11(fiw + 47.0);
    float h3  = hash11(fiw + 113.0);

    // a faint sideways wander so strands are not dead-straight (silken)
    float wander = 0.10 * sin(outward * 6.0 + h * TAU + t * driftRate * 0.5);
    float fd     = fa - (fi + 0.5 + wander);

    // hair-thin strand profile (much tighter than the base iris)
    float across = exp(-pow(fd / 0.42, 2.0));

    // hashed reach: feather mixes from uniform-long toward widely-varied
    float reach  = mix(1.05, mix(0.45, 1.15, h), feather);
    // radial envelope: rises off the core, feathers out toward the tip
    float along  = smoothstep(0.0, 0.12, outward)
                 * (1.0 - smoothstep(reach * 0.55, reach, outward));

    // per-strand shimmer on its own phase (phase-continuous)
    float sh     = 0.6 + 0.4 * sin(t * driftRate * TAU * (0.5 + h2) + h * TAU);
    float fb     = 0.45 + 0.55 * h3;

    float lum = across * along * sh * fb;
    haloAccum += lum * 0.5;
    if (lum > filaLum) {
      filaLum = lum;
      colAngle = (fiw / filaCount - 0.5) * TAU;
    }
  }

  // ====================================================================
  // PALETTE: colour by strand angle, blending the four hues cyclically
  // ====================================================================
  float hue = (colAngle / TAU + 0.5) + 0.10 * outward + t * 0.008;
  float s   = fract(hue) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 filaCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ====================================================================
  // RADIAL SHADING: brightest mid-field, feathering into a faint edge halo
  // ====================================================================
  float radialFall = mix(0.6, 1.0, smoothstep(0.0, 0.22, outward))
                   * (1.0 - 0.78 * smoothstep(0.32, 1.0, outward));

  vec3 col = BG;

  // dense strand field
  col += filaCol * filaLum * radialFall * 0.9;
  // soft halo glow between strands so the field reads as continuous luminous
  // tissue (no dead-black gaps), feathering out
  col += filaCol * haloAccum * radialFall * 0.10;

  // luminous core bloom at the centre (soft, not a hard pupil)
  float core = exp(-pow(rad / coreR, 2.0));
  col += mix(filaCol, vec3(1.0), 0.35) * core * 0.7;
  // a broader inner glow so the centre reads as a soft bright heart
  float innerGlow = exp(-pow(rad / (coreR * 2.6), 2.0));
  col += filaCol * innerGlow * 0.18;

  // settle the very corners so framing stays composed
  float vign = 1.0 - 0.42 * smoothstep(0.6, 1.18, outward);
  col *= vign;

  // gentle tone shaping
  col = col / (1.0 + col * 0.34);

  gl_FragColor = vec4(col, 1.0);
}
