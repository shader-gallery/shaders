// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// crystal (Facet) - the view from inside a cut gem. The frame is the interior
// of the stone: a handful of facet planes, each an oriented half-space, are
// applied as mirror folds one after another, so every fold is one internal
// reflection off a facet. Whatever lies beyond the last fold is a single
// studio environment (a soft sky gradient, one hot lamp, one strip light) and
// the fold chain scatters that environment across the frame as a set of
// large overlapping translucent planes, each tinted by the facet it came
// through and dimmed by the number of bounces it took. Facet edges are the
// fold lines themselves: a hard bright seam with a soft halo, and the whole
// chain is evaluated once per colour channel at a slightly different
// refractive rotation, so every seam and every reflected lamp splits into
// dispersion fringes, red on one flank, blue on the other. A second, larger
// fold set turns the other way behind the first for parallax depth. No cell
// gather anywhere: planes, folds and a light, nothing else.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_facets;     // facet planes per fold set, 3..8      (default 7)
uniform float u_dispersion; // channel split at seams and lamps     (default 1.0)
uniform float u_spin;       // turn speed of the stone              (default 0.3)
uniform float u_clarity;    // light kept per internal reflection   (default 0.78)
uniform float u_scale;      // facet size, frame-relative           (default 1.0)
uniform float u_mouseInfluence; // pointer strength, 0 ignores the mouse (default 0.0)

const int MAXF = 8;

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 pickCol(float k){
  float x = mod(floor(k), 4.0);
  vec3 a = c0;
  a = mix(a, c1, step(0.5, x));
  a = mix(a, c2, step(1.5, x));
  a = mix(a, c3, step(2.5, x));
  return a;
}

// the studio beyond the last facet: a sky gradient, a hot lamp and a strip
// light. Every internal reflection shows this same room from a new angle.
float studio(vec2 q, float t){
  float sky  = 0.30 + 0.25 * clamp(q.y * 0.6 + 0.5, 0.0, 1.0);
  // the lamp hangs off to one side of the room and swings a little
  vec2  lamp = vec2(-0.75 + 0.35 * cos(t * 0.21), 0.55 + 0.25 * sin(t * 0.17));
  vec2  dl   = q - lamp;
  float spot = 0.9 * exp(-dot(dl, dl) * 5.5) + 1.6 * exp(-dot(dl, dl) * 40.0);
  // a thin strip light across the room, the long specular in every facet
  vec2  sd   = vec2(cos(0.9 + t * 0.05), sin(0.9 + t * 0.05));
  float sl   = abs(dot(q - vec2(-0.3, -0.4), sd));
  float strip = 0.7 * exp(-sl * sl * 220.0) + 0.18 * exp(-sl * sl * 12.0);
  return sky + spot + strip;
}

// one fold set. p is folded through up to MAXF oriented planes; returns the
// lit value seen along this path, the seam glow, and accumulates a tint.
// rotBias is the per-channel refractive offset that makes the dispersion.
float gem(vec2 p, float t, float rotBias, float seed, float dirn,
          out float seam, out vec3 tint, out float bounces){
  seam = 1e3;
  tint = vec3(1.0);
  bounces = 0.0;
  float atten = 1.0;
  float clar = clamp(u_clarity, 0.3, 0.98);
  float nF = clamp(u_facets, 3.0, float(MAXF));
  float spin = t * dirn * (0.06 + 0.03 * seed);
  for (int i = 0; i < MAXF; i++){
    if (float(i) >= nF) break;
    float k = float(i);
    // plane orientation: golden-angle spread so no two facets are parallel,
    // plus a slow individual rock so the stone breathes
    float a = k * 2.39996 + seed * 1.3 + spin + rotBias * (0.6 + 0.4 * sin(k * 1.7))
            + 0.08 * sin(t * 0.23 + k * 1.9 + seed);
    vec2  n = vec2(cos(a), sin(a));
    // plane offset from centre: the facets do not meet at one point, so the
    // figure is a stack of shards, not a radial star
    float d = 0.22 + 0.34 * fract(k * 0.618 + seed * 0.37)
            + 0.05 * sin(t * 0.19 + k * 2.3 + seed * 3.1);
    float s = dot(p, n) - d;
    float sBack = dot(p, n) + d;          // the opposite facet of the pair
    float sm = min(abs(s), abs(sBack));
    seam = min(seam, sm);
    // fold through whichever side of the pair we are outside of
    if (s > 0.0){
      p -= 2.0 * s * n;
      atten *= clar;
      bounces += 1.0;
      tint *= mix(vec3(1.0), pickCol(k), 0.5);
    } else if (sBack < 0.0){
      p -= 2.0 * sBack * n;
      atten *= clar;
      bounces += 1.0;
      tint *= mix(vec3(1.0), pickCol(k + 1.0), 0.5);
    }
  }
  return studio(p * 1.15, t) * atten;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2  uv     = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  float t      = u_time * clamp(u_spin, 0.0, 2.0);
  float scl    = 1.0 / max(u_scale, 0.25);
  float disp   = clamp(u_dispersion, 0.0, 3.0) * 0.018;

  // frame-relative coordinates, then the whole stone turns slowly
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 2.0 * scl;
  p = rot(t * 0.03) * p;
  // the unfolded kernel (the one facet you look straight through) sits up
  // toward the light, not dead centre, so the composition has a direction
  p += vec2(0.62, -0.34);

  // pointer: a gentle tilt of the stone, zero at rest
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  p += m * 0.25 * u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));

  // ---- near fold set, once per channel for dispersion
  float seamR, seamG, seamB, bR, bG, bB;
  vec3  tintR, tintG, tintB;
  float lR = gem(p, t, -disp, 0.0,  1.0, seamR, tintR, bR);
  float lG = gem(p, t,  0.0,  0.0,  1.0, seamG, tintG, bG);
  float lB = gem(p, t,  disp, 0.0,  1.0, seamB, tintB, bB);

  // ---- far fold set: larger, turning the other way, seen through the first
  float seamF, bF;
  vec3  tintF;
  float lF = gem(p * 0.55 + vec2(0.31, -0.17), t, 0.0, 1.0, -1.0, seamF, tintF, bF);

  // ---- assemble the interior
  // ground: the body colour of the stone, a deep desaturated pole
  vec3 body = mix(vec3(luma(c3)), c3, 0.55);
  vec3 col  = body * 0.10;

  // the far set: soft, dim, a translucent depth behind everything
  float farSeam = exp(-seamF * seamF * 900.0) * 0.5;
  vec3  farCol  = tintF * (lF * 0.28 + farSeam);
  col += farCol * mix(vec3(0.6), c1, 0.3);

  // the near set: light per channel through its own tint, so seams and lamps
  // arrive split into fringes
  vec3 nearLit = vec3(lR * tintR.r, lG * tintG.g, lB * tintB.b);
  // translucent facet planes: each bounce mixes the plane tint in; the
  // straight-through kernel takes the pale pole so it is glass, not grey
  vec3 planeTint = mix(vec3(1.0), tintG, 0.6);
  planeTint = mix(planeTint, mix(c2, vec3(1.0), 0.35), 0.5 * (1.0 - min(bG, 1.0)));
  col += nearLit * 0.55 * planeTint;

  // facet seams: hard bright line plus soft halo, per channel
  float px = 2.0 * scl / u_resolution.y;   // one device pixel in frame units
  vec3 seam = vec3(
    smoothstep(px * 1.6, 0.0, seamR) + 0.35 * exp(-seamR * seamR * 1800.0),
    smoothstep(px * 1.6, 0.0, seamG) + 0.35 * exp(-seamG * seamG * 1800.0),
    smoothstep(px * 1.6, 0.0, seamB) + 0.35 * exp(-seamB * seamB * 1800.0));
  vec3 seamCol = mix(vec3(1.0), c2, 0.35);
  col += seam * seamCol * (0.35 + 0.35 * lG);

  // fire: the sweep of the lamp across a facet flashes it; keep the flash
  // in the pale pole so it reads as light, not paint
  float fire = smoothstep(1.4, 2.6, lG);
  col += fire * mix(c2, vec3(1.0), 0.5) * 0.45;

  // subtle depth cue: more bounces means deeper in the stone, cooler and
  // dimmer, so the shards stack instead of tiling
  col *= 1.0 - 0.06 * bG;
  col = mix(col, col * mix(vec3(1.0), c0, 0.25), clamp(bG * 0.15, 0.0, 0.6));

  // the light enters the stone from the upper left, so the whole interior
  // falls off toward the lower right: one light direction, not a centred glow
  vec2  pw = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float key = 0.62 + 0.70 * clamp(0.5 - dot(pw, vec2(0.62, -0.78)) * 0.9, 0.0, 1.0);
  col *= key;

  // filmic-ish shoulder so the lamp reflections keep detail
  col = col / (1.0 + col * 0.35);
  gl_FragColor = vec4(col, 1.0);
}
