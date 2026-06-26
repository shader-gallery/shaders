// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// burst (Rosette) — a starburst iris filling the frame: where the base iris has
// a dark pupil, burst inverts it into a HOT white core that throws long thin
// sharp rays out past the corners. Rays vary in length and brightness off a
// per-ray hash (a few dominant spikes among many fine ones, like a lens star),
// each twinkling on its own phase. Colour blends cyclically through the palette
// by angle, hottest (near-white) at the core and saturating to hue along the
// rays. The field between rays stays dark so the spikes read crisp, with a soft
// halo so the frame never goes dead-black.
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
uniform float u_rays;      // number of rays around the circle         (default 120)
uniform float u_sharpness; // ray thinness / spike crispness           (default 0.6)
uniform float u_twinkle;   // per-ray pulse rate                       (default 0.5)
uniform float u_heat;      // hot-core radius, css px (×pixelRatio)     (default 70)

const vec3  BG   = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float TAU  = 6.28318530718;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// cheap per-ray hash → 0..1 (stable per integer ray index)
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
  float rayCount  = max(u_rays, 8.0);
  float sharp     = clamp(u_sharpness, 0.0, 1.0);
  float twinkRate = max(u_twinkle, 0.0);
  float heatR     = max(u_heat, 15.0) * pr;

  // --- polar coordinates centred on the star ---
  vec2  d    = fc - ctr;
  float ang  = atan(d.y, d.x);          // -PI..PI
  float rad  = length(d);
  float maxR = length(res) * 0.5;       // half-diagonal: outward==1 at the corner
  float outward = clamp(rad / maxR, 0.0, 1.0);

  vec3  col     = BG;
  float rayLum  = 0.0;
  float colAngle = ang;

  // slow rotation of the whole star (felt, not seen)
  float spin = t * 0.015;

  // ====================================================================
  // RAY FIELD
  // The ray index is a continuous function of angle: r = (ang/TAU)*N.
  // Evaluate the two nearest integer rays and keep the stronger so spikes
  // stay crisp and anti-aliased without dynamic array indexing. Each ray
  // has a hashed length, brightness and twinkle phase; thin rays are sharp
  // spikes, a few hashed-long rays dominate like a camera lens star.
  // ====================================================================
  float ra  = (ang / TAU + 0.5 + spin) * rayCount; // continuous ray coordinate
  float ri0 = floor(ra);
  float ri1 = ri0 + 1.0;

  // angular ray half-width in ray-units; sharpness thins the spikes
  float halfw = mix(0.5, 0.08, sharp);

  for (int k = 0; k < 2; k++) {
    float ri  = (k == 0) ? ri0 : ri1;
    float riw = mod(ri, rayCount);          // wrap so hashes match across the seam
    float h   = hash11(riw + 1.0);
    float h2  = hash11(riw + 31.0);
    float h3  = hash11(riw + 91.0);

    // angular distance from this pixel to the ray centre, in ray-units
    float rd     = ra - (ri + 0.5);
    // crisp spike profile across the ray (gaussian in ray-units)
    float across = exp(-pow(rd / halfw, 2.0));

    // this ray reach: a few rays are long (reach the corner), most short.
    // bias toward short with a power so long spikes are the exception
    float reach  = mix(0.32, 1.15, pow(h, 1.6));
    // radial falloff: bright at the core, tapering to the ray tip
    float along  = (1.0 - smoothstep(reach * 0.35, reach, outward));

    // per-ray twinkle: brightness pulses on its own phase (phase-continuous)
    float tw     = 0.6 + 0.4 * sin(t * twinkRate * TAU * (0.6 + 0.8 * h2) + h * TAU);
    // hashed base brightness so rays differ in intensity
    float rb     = 0.4 + 0.6 * h3;

    float lum = across * along * tw * rb;
    if (lum > rayLum) {
      rayLum = lum;
      colAngle = (riw / rayCount - 0.5) * TAU; // colour follows the winning ray
    }
  }

  // ====================================================================
  // PALETTE: colour by ray angle, blending the four hues cyclically + slow roll
  // ====================================================================
  float hue = (colAngle / TAU + 0.5) + t * 0.008;
  float s   = fract(hue) * 4.0;
  float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }
  vec3 rayCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);

  // ====================================================================
  // HOT CORE: a bright near-white centre that the rays erupt from. Its glow
  // whitens the inner rays and fills the centre so it is the protagonist
  // (the inverse of the base iris dark pupil).
  // ====================================================================
  float core   = exp(-pow(rad / heatR, 2.0));               // tight white-hot centre
  float corona = exp(-pow(rad / (heatR * 3.2), 2.0));       // broad coloured halo

  // radial brightness of the ray field: hottest near the core
  float radialFall = mix(1.3, 0.45, smoothstep(0.0, 0.6, outward));

  // ====================================================================
  // COMPOSE
  // ====================================================================
  // rays, whitened toward the hot core so the centre blooms to near-white
  vec3 rayTint = mix(rayCol, vec3(1.0), core * 0.85);
  col += rayTint * rayLum * radialFall * 1.1;

  // broad coloured corona halo so the field between rays never reads dead-black
  col += rayCol * corona * 0.22;
  // the white-hot core itself
  col += mix(rayCol, vec3(1.0), 0.8) * core * 1.4;

  // settle the very corners so framing stays composed (light touch — rays must
  // still be allowed to reach the edge)
  float vign = 1.0 - 0.32 * smoothstep(0.7, 1.2, outward);
  col *= vign;

  // gentle tone shaping to avoid blow-out while keeping the hot core luminous
  col = col / (1.0 + col * 0.30);

  gl_FragColor = vec4(col, 1.0);
}
