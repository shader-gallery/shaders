// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// confetti (Shoal) - a slow fall of paper confetti filling the frame at four
// depths. Every piece is a real rectangle in 3D: it carries its own tumble
// about a flip axis, a swing tilt coupled to its side-to-side flutter, and a
// lazy spin, and it is projected to the screen by inverting the rotation. As
// a piece turns edge-on it thins to a hairline and vanishes, then opens again
// showing the other face, so the fall reads as paper turning in air, not as
// sprites. Faces are lit from the upper front: the face toward the light is
// bright, the face away is shadowed, and a piece between the viewer and the
// light glows with paper translucency. Each piece drops a soft contact shadow
// on whatever lies behind it. Far pieces are small, crisp and fogged into the
// haze; near pieces are large, soft-focused and faintly transparent. The
// ground is a lit haze, brightest overhead, so the whole frame is composed.
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_fall;     // fall and drift speed              (default 0.6)
uniform float u_flutter;  // tumble rate and swing width       (default 1.0)
uniform float u_size;     // piece size against its slot       (default 1.0)
uniform float u_density;  // fraction of slots holding a piece (default 0.75)
uniform float u_focus;    // soft-focus on the near layers     (default 1.0)

vec3 c0, c1, c2, c3;
vec3 groundCol;

float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  hash22(vec2 p){ return vec2(hash21(p), hash21(p + vec2(41.3, 17.9))); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec3 pickCol(float k){
  float x = floor(fract(k) * 4.0);
  vec3 a = c0;
  a = mix(a, c1, step(0.5, x));
  a = mix(a, c2, step(1.5, x));
  a = mix(a, c3, step(2.5, x));
  return a;
}

// rotation about x, then y, then z, as the three columns of the matrix.
// We only ever need the images of the basis vectors, so build them directly.
void tumbleFrame(float ax, float ay, float az, out vec3 ex, out vec3 ey, out vec3 ez){
  float cx = cos(ax), sx = sin(ax);
  float cy = cos(ay), sy = sin(ay);
  float cz = cos(az), sz = sin(az);
  // Rz * Ry * Rx applied to (1,0,0), (0,1,0), (0,0,1)
  ex = vec3(cz * cy, sz * cy, -sy);
  ey = vec3(cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx);
  ez = vec3(cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx);
}

// one depth layer. p is frame units (height = 2). Returns the piece colour,
// its coverage, and the soft shadow it throws on what lies behind.
// near runs 0 (far) to 1 (closest to the camera).
void layer(vec2 p, float cell, float seed, float near, float t, float pxF,
           out vec3 col, out float alpha, out float shadow){
  float fall = max(u_fall, 0.0);
  float flut = max(u_flutter, 0.0);
  // parallax: near pieces fall faster on screen and catch more sideways drift
  vec2 scroll = vec2(-(0.03 + 0.05 * near) * fall * t + 0.08 * sin(t * 0.21 + seed),
                      (0.14 + 0.30 * near) * fall * t);
  vec2 q = (p + scroll) / cell;
  vec2 ci = floor(q);

  float bestSd = 1e9;          // screen-space signed distance to the chosen piece
  float bestRank = -1.0;
  vec3  bestCol = vec3(0.0);
  float shadowAcc = 0.0;
  // the light: upper front left. Shadows fall down and to the right.
  vec3 L = normalize(vec3(-0.35, 0.75, 0.56));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  // shadow offset in cell units grows with the gap to the layer behind
  vec2 shOff = vec2(0.022, -0.034) * (0.5 + 0.7 * near) / cell;
  float shBlur = (0.010 + 0.016 * near) / cell;     // cell units
  float blur = clamp(near * u_focus, 0.0, 1.0);
  float aa = pxF / cell * 1.2 + blur * blur * 0.06;  // AA width in cell units
  float bestFace = 1.0;        // |ez.z| of the chosen piece, 0 when edge-on

  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 id = ci + vec2(float(x), float(y));
      vec2 h  = hash22(id + seed * 7.0);
      float h3 = hash21(id * 1.31 + seed * 2.7);
      float h4 = hash21(id * 0.77 + seed * 5.1);
      if (h4 > u_density) continue;
      float h5 = hash21(id * 2.13 + seed * 3.3);
      float h6 = hash21(id * 0.59 + seed * 9.7);

      // flutter: a side-to-side swing with a small bob, own rate and phase
      float wf = (0.9 + 1.3 * h.x) * flut;
      float ph = h.y * 6.2832;
      float swing = sin(t * wf + ph);
      vec2 ctr = id + 0.5 + (h - 0.5) * 0.5
               + vec2(0.16 * swing, 0.05 * cos(2.0 * (t * wf + ph))) * flut / (0.6 + 0.4 * u_size);

      // orientation: a steady flip about x, a tilt about y coupled to the
      // swing (paper banks into its swing), and a slow spin about z
      float ax = t * (0.5 + 1.4 * h3) * flut + h5 * 6.2832;
      float ay = 0.55 * swing * min(flut, 1.5) + (h6 - 0.5) * 1.2;
      float az = t * 0.25 * (h5 - 0.5) * flut + h3 * 6.2832;
      vec3 ex, ey, ez;
      tumbleFrame(ax, ay, az, ex, ey, ez);

      // piece size in cell units, oblong paper
      float a = mix(0.13, 0.24, h3) * u_size;
      float b = a * mix(0.42, 0.80, h6);

      // invert the screen projection: d = u*ex.xy + v*ey.xy. The 2x2
      // determinant of a rotation top-left block equals ez.z, so an edge-on
      // piece (ez.z -> 0) blows up to a hairline exactly as it should.
      float det = ez.z;
      float sdet = sign(det) * max(abs(det), 1e-3);
      vec2 d = q - ctr;
      float u = ( ey.y * d.x - ey.x * d.y) / sdet;
      float v = (-ex.y * d.x + ex.x * d.y) / sdet;
      // screen-space signed distance, per local axis, then boxed
      float su = length(ex.xy), sv = length(ey.xy);
      float sd = max((abs(u) - a) * su, (abs(v) - b) * sv);

      // shadow test from the same piece, displaced along the light
      vec2 ds = d - shOff;
      float us = ( ey.y * ds.x - ey.x * ds.y) / sdet;
      float vs = (-ex.y * ds.x + ex.x * ds.y) / sdet;
      float sds = max((abs(us) - a) * su, (abs(vs) - b) * sv);
      shadowAcc = max(shadowAcc, 1.0 - smoothstep(-shBlur * 0.5, shBlur * 1.5, sds));

      bool inside = sd < 0.0;
      bool take = inside ? (h5 > bestRank || bestSd >= 0.0) : (bestSd >= 0.0 && sd < bestSd);
      if (take){
        bestSd = sd;
        bestRank = inside ? h5 : bestRank;
        bestFace = abs(det);
        // face toward the camera
        vec3 N = ez.z < 0.0 ? -ez : ez;
        float facing = dot(N, L);
        // paper colour: palette, with a share of pale near-white pieces so
        // the fall has sparkle and not just four flat hues
        vec3 albedo = pickCol(h3 * 3.97 + h.x * 0.31 + seed * 0.17);
        albedo = mix(albedo, vec3(0.94), step(0.78, h6) * 0.75);
        albedo *= 0.85 + 0.3 * h5;
        float diff = max(facing, 0.0);
        float back = max(-facing, 0.0);           // lit from behind: translucent
        float ndh = max(dot(N, H), 0.0);
        float s4 = ndh * ndh; s4 *= s4;
        float spec = s4 * s4 * 0.35;              // soft paper sheen
        vec3 lit = albedo * (0.30 + 0.85 * diff)
                 + albedo * albedo * 1.3 * back    // saturated glow through the sheet
                 + vec3(spec);
        // the near layer is out of focus: a touch softer and dimmer
        bestCol = lit * (1.0 - 0.15 * blur);
      }
    }
  }

  // depth fog toward the haze on the far layers
  col = mix(bestCol, groundCol * 1.4, (1.0 - near) * 0.32);
  alpha = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, bestSd);
  alpha *= 1.0 - 0.18 * blur;                     // near pieces go faintly transparent
  // an out-of-focus piece seen edge-on is a smear of nothing: let it fade
  alpha *= mix(1.0, smoothstep(0.02, 0.22, bestFace), blur);
  shadow = shadowAcc;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  float pxF = 2.0 / u_resolution.y;               // one device px in frame units
  float t = u_time;

  // ---- the ground: a dark haze built from the palette, lit from overhead
  // so the top of the frame is brighter, with slow drifting cloud in it
  vec3 deep = (c0 + c1 + c2 + c3) * 0.25;
  float lum = dot(deep, vec3(0.299, 0.587, 0.114));
  deep = mix(vec3(lum), deep, 0.30);              // desaturate to a charcoal room tone
  float cloud = vnoise(p * 1.3 + vec2(t * 0.02, -t * 0.03)) * 0.6
              + vnoise(p * 2.9 - vec2(t * 0.01, t * 0.04)) * 0.4;
  float overhead = smoothstep(-1.2, 1.4, uv.y * 2.0 - 0.6 + (cloud - 0.5) * 0.5);
  float beam = exp(-((uv.x - 0.5) * (uv.x - 0.5)) * 3.0);
  groundCol = deep * (0.07 + 0.24 * overhead + 0.14 * overhead * beam)
            + mix(c2, c1, 0.5) * 0.035 * cloud;
  vec3 acc = groundCol;

  vec3 lc; float la; float ls;

  // far to near: cell size in frame units (height = 2), seed, nearness
  layer(p, 0.17, 1.0, 0.0, t, pxF, lc, la, ls);
  acc = mix(acc * (1.0 - 0.30 * ls), lc, la);

  layer(p, 0.30, 2.0, 0.33, t, pxF, lc, la, ls);
  acc = mix(acc * (1.0 - 0.38 * ls), lc, la);

  layer(p, 0.54, 3.0, 0.66, t, pxF, lc, la, ls);
  acc = mix(acc * (1.0 - 0.40 * ls), lc, la);

  layer(p, 0.96, 4.0, 1.0, t, pxF, lc, la, ls);
  acc = mix(acc * (1.0 - 0.32 * ls), lc, la);

  gl_FragColor = vec4(acc, 1.0);
}
