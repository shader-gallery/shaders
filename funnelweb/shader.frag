// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// funnelweb (Strand) - a funnel-weaver web wound into a vortex. Two counter-
// winding families of logarithmic-spiral threads cross into a swirling web that
// coils down toward an off-centre throat, faint radial spokes tying the arms
// together. The threads crowd as they near the throat and the whole figure
// drifts slowly inward, so the web seems to spin away down the funnel while the
// depths sink to black. Open strands; never a filled cell.
// (ASCII-only comments: the headless poster compiler is fussy about apostrophes.)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spokes;    // radial spokes down the funnel       (default 16)
uniform float u_pitch;     // ring depth spacing                   (default 0.9)
uniform float u_swirl;     // how far the funnel twists with depth  (default 1.1)
uniform float u_recede;    // inward drift speed of the rings       (default 0.35)
uniform float u_line;      // thread half-width, css px             (default 1.1)
uniform float u_depth;     // how dark the throat sinks             (default 0.7)
uniform float u_hue;       // hue spread along the funnel           (default 1.0)

const vec3 BG = vec3(0.035, 0.035, 0.043);

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  float lw  = max(u_line, 0.3) * refScale * pr;
  float nS  = max(floor(u_spokes + 0.5), 4.0);
  float da  = 6.2831853 / nS;
  float pitch = max(u_pitch, 0.2);

  // vanishing point off the centre (rule of thirds) so the tunnel leans
  vec2 vp = res * vec2(0.62, 0.43);
  vec2 d  = fc - vp;
  float r = max(length(d), 2.0);
  float ang = atan(d.y, d.x);
  float lr = log(r);                                   // depth coordinate (perspective)

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 acc = vec3(0.0);
  float TWO = 6.2831853;
  float wind = u_swirl;                                // turns the threads wind in

  // depth fog: the throat (small r) sinks toward black, the mouth stays lit
  float mouth = clamp(r / (min(res.x, res.y) * 0.55), 0.0, 1.0);
  float fog = mix(1.0 - clamp(u_depth, 0.0, 1.0), 1.0, mouth);

  // --- two counter-winding logarithmic-spiral thread families. Each is a set of
  // lines of constant (depth -/+ wind*angle); where the two cross they weave a
  // swirling vortex web that spins down into the off-centre throat instead of the
  // flat concentric rings. The whole figure drifts inward over time.
  float drift = t * u_recede * 0.5;
  float fA = lr / pitch - wind * ang / TWO - drift;    // clockwise arms
  float fB = lr / pitch + wind * ang / TWO - drift;    // anticlockwise arms
  float dA = abs(fract(fA + 0.5) - 0.5) * r * pitch;   // local px to nearest arm
  float dB = abs(fract(fB + 0.5) - 0.5) * r * pitch;
  float armA = smoothstep(lw * 1.4, 0.0, dA);
  float armB = smoothstep(lw * 1.4, 0.0, dB);
  float iA = floor(fA + 0.5);
  float iB = floor(fB + 0.5);
  vec3 colA = wheelCol(iA * 0.13 * u_hue + lr * 0.05 + t * 0.006, c0, c1, c2, c3);
  vec3 colB = wheelCol(iB * 0.13 * u_hue + 0.5 + lr * 0.05 + t * 0.008, c0, c1, c2, c3);
  acc += colA * armA * 1.1 * fog;
  acc += colB * armB * 1.1 * fog;

  // --- faint radial spokes (also swept by the swirl) tie the spiral arms together
  // so it reads as one web rather than two loose spirals.
  float aS = ang + wind * lr * 0.5;
  float phi = aS - floor(aS / da + 0.5) * da;
  float spoke = smoothstep(lw * 1.3, 0.0, abs(r * sin(phi)));
  acc += wheelCol(floor(aS / da + 0.5) * 0.07 * u_hue + 0.2, c0, c1, c2, c3) * spoke * 0.5 * fog;

  // bright glow knot at the throat where the vortex winds shut (off-centre)
  acc += colA * exp(-pow(r / (min(res.x,res.y) * 0.07), 2.0)) * 0.3 * (1.0 - clamp(u_depth,0.0,1.0));

  acc = vec3(1.0) - exp(-acc * 1.7);
  gl_FragColor = vec4(BG + acc, 1.0);
}
