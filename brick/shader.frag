// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// brick (Burnish) - a running-bond brick wall in raking light. The coursing
// is a plain offset-row lattice at css-pixel scale, every brick found by a
// per-cell hash: its own fired tone (dark headers, pale stretchers, a few
// flashed with the second pole), a slightly different size and lean, and
// its own mottle. The wall is a height field: brick faces sit proud with a
// rounded arris, the mortar bed lies recessed and gritty, and the edges are
// eaten by noise so corners chip and arrises crumble. Normals come from
// finite differences of that height, so a low sun sweeping slowly across
// the wall throws real relief: lit arrises on the sun side, a soft shadow
// dropped into the joint on the far side, and mortar that darkens where a
// brick face stands between it and the light. The camera drifts a little
// so the courses slide, and the sun angle turns over the minute.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_scale;      // brick course height, css px          (default 30)
uniform float u_depth;      // mortar recess and relief depth        (default 1.2)
uniform float u_wear;       // chipped arrises and crumbled corners  (default 1.0)
uniform float u_variation;  // tonal spread between bricks           (default 1.0)
uniform float u_sun;        // speed of the raking sun sweep         (default 0.1)

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 M2 = mat2(0.80, 0.60, -0.60, 0.80);

float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = M2 * p * 2.03 + vec2(11.7, 5.3);
    a *= 0.5;
  }
  return s * 1.14;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// ---- the coursing. q in css px. Returns the brick cell id in .xy and the
// signed distance to the brick face edge (negative inside) in .z, with the
// per-brick size jitter and lean already applied.
vec3 course(vec2 q, float bh, float bw, float joint) {
  float row = floor(q.y / bh);
  float off = mod(row, 2.0) * 0.5 * bw;               // running bond
  float colf = (q.x + off) / bw;
  float col = floor(colf);
  vec2 id = vec2(col, row);
  vec2 l = vec2((colf - col) * bw - bw * 0.5, (q.y / bh - row) * bh - bh * 0.5);
  // per-brick jitter: size, lean, and a slight shift in the bed
  float h1 = hash21(id + 0.37), h2 = hash21(id + 5.11), h3 = hash21(id + 9.73);
  vec2 hs = vec2(bw, bh) * 0.5 - joint * 0.5;
  hs -= vec2(h1, h2) * joint * 0.35;
  l += vec2(h3 - 0.5, h1 - 0.5) * joint * 0.4;
  float lean = (h2 - 0.5) * 0.03;
  l = vec2(l.x - l.y * lean, l.y + l.x * lean * 0.3);
  vec2 dd = abs(l) - hs;
  float d = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
  return vec3(id, d);
}

// ---- the height field, css px in and relief height out (0 = mortar bed).
// Brick faces stand proud with a rounded arris; wear eats the edge outward
// from the joint, more at the corners; both surfaces carry their own grain.
float heightAt(vec2 q, float bh, float bw, float joint, float wear, float t) {
  vec3 c = course(q, bh, bw, joint);
  vec2 id = c.xy;
  float d = c.z;
  // chipped arrises: the edge wanders on a noise seeded per brick, and
  // larger bites come off where a second noise peaks near the edge
  float n1 = vnoise(q * 0.35 + id * 7.0) - 0.5;
  float n2 = vnoise(q * 0.09 + id * 3.0 + 31.0);
  float bite = smoothstep(0.72, 0.94, n2) * wear * joint * 1.4;
  d += n1 * wear * joint * 0.30 + bite;
  // face height with a rounded arris about half a joint wide
  float arris = joint * 0.55;
  float face = smoothstep(0.0, arris, -d);
  face = face * face * (3.0 - 2.0 * face);
  // brick face grain: sand mottle plus a few pits
  float mottle = fbm3(q * 0.16 + id * 1.7) - 0.5;
  float pit = smoothstep(0.70, 0.84, fbm3(q * 0.22 + id * 2.3 + 53.0));
  float brickH = 1.0 + mottle * 0.10 - pit * 0.16;
  // mortar bed: coarse gritty sand, slumped a little away from the brick
  float grit = (vnoise(q * 0.9 + 17.0) - 0.5) * 0.10 + (hash21(floor(q * 1.3)) - 0.5) * 0.05;
  float mortarH = 0.0 + grit;
  return mix(mortarH, brickH, face);
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr    = max(u_pixelRatio, 0.5);
  float bh    = clamp(u_scale, 10.0, 80.0);          // course height, css px
  float bw    = bh * 2.15;                            // stretcher length
  float joint = max(bh * 0.14, 1.5);                  // mortar joint width
  float depth = clamp(u_depth, 0.0, 3.0);
  float wear  = clamp(u_wear, 0.0, 2.0);
  float vari  = clamp(u_variation, 0.0, 1.5);
  float t     = u_time * clamp(u_sun, 0.0, 1.0);

  // css-px wall coordinates with a slow bounded camera drift
  vec2 q = gl_FragCoord.xy / pr;
  q += vec2(sin(t * 0.55), 0.35 * cos(t * 0.41)) * bh * 2.0;

  // ---- relief: height and finite-difference normal
  float eps = 1.0;
  float h  = heightAt(q, bh, bw, joint, wear, t);
  float hx = heightAt(q + vec2(eps, 0.0), bh, bw, joint, wear, t);
  float hy = heightAt(q + vec2(0.0, eps), bh, bw, joint, wear, t);
  float reliefPx = depth * joint * 1.2;               // relief height in css px
  vec3 n = normalize(vec3(-(hx - h) * reliefPx, -(hy - h) * reliefPx, eps));

  // ---- the raking sun: low, sweeping round the wall over the minute
  float sunA = 2.55 + 0.6 * sin(t * 0.9);
  vec3 L = normalize(vec3(cos(sunA), sin(sunA), 0.42));
  float diff = max(dot(n, L), 0.0);
  // cast shadow into the joint: a brick face standing sunward of a low
  // point blocks the sun. Probe the face mask a short way up the sun ray.
  float faceHere = smoothstep(0.35, 0.65, h);
  float probe = joint * (0.9 + 0.8 * depth);
  vec3 cs = course(q + L.xy * probe, bh, bw, joint);
  float blocker = smoothstep(0.0, joint * 0.4, -cs.z);
  float shadow = 1.0 - 0.75 * blocker * (1.0 - faceHere) * min(depth, 1.5) / 1.5;
  // joints are also darker by occlusion alone
  float ao = 1.0 - 0.35 * (1.0 - faceHere) * min(depth, 1.5) / 1.5;

  // ---- materials, tinted by the palette but always fired clay and mortar
  vec3 cell = course(q, bh, bw, joint);
  vec2 id = cell.xy;
  float tone  = hash21(id + 2.71);
  float flash = hash21(id + 8.13);
  float lumAll = luma(c0 + c1 + c2 + c3) * 0.25;
  // brick body: the first pole as an earthy fired tone
  vec3 clayA = mix(vec3(luma(c0)), c0, 0.62) * 0.98;
  vec3 clayB = mix(vec3(luma(c3)), c3, 0.55) * 0.62;         // dark burnt headers
  vec3 clayC = mix(vec3(luma(c1)), c1, 0.55) * 1.00;         // flashed bricks
  float toneMix = clamp(0.5 + (tone - 0.5) * (0.4 + 1.6 * vari), 0.0, 1.0);
  vec3 brick = mix(clayB, clayA, toneMix);
  brick = mix(brick, clayC, smoothstep(0.86, 0.90, flash) * vari);
  // firing mottle across each face, and a sooty darkening in the pits
  float mottle = fbm3(q * 0.16 + id * 1.7) - 0.5;
  brick *= 1.0 + mottle * 0.22 * (0.5 + vari);
  brick *= 0.78 + 0.22 * smoothstep(0.55, 1.05, h);
  // mortar: a warm sandy grey built from the whole palette luminance
  vec3 mortar = mix(vec3(lumAll), (c2 + c0) * 0.5, 0.16) * 0.85 + vec3(0.10);
  mortar *= 0.9 + 0.2 * (vnoise(q * 0.9 + 17.0) - 0.5) + 0.1 * (hash21(floor(q * 1.3)) - 0.5);
  // efflorescence: pale salts bloom on a few faces near the bed
  float salt = smoothstep(0.72, 0.95, fbm3(q * 0.05 + 99.0)) * 0.25;
  vec3 albedo = mix(mortar, brick, faceHere);
  albedo = mix(albedo, albedo * 0.5 + vec3(0.42), salt * (1.0 - 0.5 * faceHere));

  // ---- shade: matte clay, a hint of sheen where glazed faces catch the sun
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float spec = max(dot(n, H), 0.0);
  spec = spec * spec; spec = spec * spec; spec = spec * spec;      // ^8
  float glaze = smoothstep(0.90, 0.96, flash) * faceHere * 0.18;
  vec3 skyTint = mix(vec3(1.0), c2, 0.25);
  vec3 col = albedo * (0.20 * skyTint + 1.05 * (diff / L.z) * shadow) * ao;
  col += spec * glaze * mix(vec3(1.0), c1, 0.3);
  // a low sun also grades the whole wall: brighter toward the light
  vec2 uv = gl_FragCoord.xy / u_resolution;
  col *= 0.72 + 0.55 * dot(uv - 0.5, L.xy);

  gl_FragColor = vec4(col, 1.0);
}
