// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// ballpit (Shoal) - a frame packed edge to edge with shaded spheres at four
// depths. Far spheres are small, crisp and fogged; near ones are large, sparse
// and soft-focused. Each sphere gets a real material: wrapped diffuse, a tight
// specular, a lit-side rim, self-shading toward the limb, and a contact
// occlusion ring that darkens whatever sits behind its edge. Everything drifts
// slowly with a gentle per-sphere wobble so the pit reads as settling, never
// as a fixed grid: each depth has its own grid rotation, jitter and drift.
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_drift;   // drift and wobble speed              (default 0.35)
uniform float u_packing; // sphere size against its slot        (default 1.0)
uniform float u_focus;   // soft-focus strength on near layers  (default 1.0)
uniform float u_gloss;   // specular and rim strength           (default 1.0)
uniform float u_shadow;  // contact occlusion between overlaps  (default 0.85)

vec3 c0, c1, c2, c3;

float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2  hash22(vec2 p){
  return vec2(hash21(p), hash21(p + vec2(41.3, 17.9)));
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec3 pickCol(float k){
  float x = floor(fract(k) * 4.0);
  vec3 a = c0;
  a = mix(a, c1, step(0.5, x));
  a = mix(a, c2, step(1.5, x));
  a = mix(a, c3, step(2.5, x));
  return a;
}

// one depth layer: sphere colour, coverage, and the distance outside the
// nearest sphere edge (in frame units) for the contact occlusion of what lies
// behind. near runs 0 (far) to 1 (closest).
void layer(vec2 p, float cell, float seed, float density, float near, float t,
           out vec3 col, out float alpha, out float outDist){
  vec2 drift = vec2(0.012 + 0.05 * near, -0.006 - 0.02 * near) * t;
  vec2 q = rot(seed * 1.9) * (p + drift) / cell;
  vec2 ci = floor(q);

  // every sphere in a layer sits at its own depth rank, so where two overlap
  // the front one occludes cleanly along its circular edge rather than the
  // two cutting each other on a chord
  float bestZ = -1.0;
  float bestRank = -1.0;
  vec3 bestN = vec3(0.0, 0.0, 1.0);
  float bestK = 0.0;
  float minOut = 10.0;
  vec3 nearN = vec3(0.0, 0.0, 1.0);
  float nearK = 0.0;

  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 id = ci + vec2(float(x), float(y));
      vec2 h = hash22(id + seed);
      float h3 = hash21(id * 1.31 + seed * 2.7);
      float h4 = hash21(id * 0.77 + seed * 5.1);
      if (h4 > density) continue;
      float rank = hash21(id * 2.13 + seed * 3.3);
      // gentle per-sphere wobble: the settling
      vec2 wob = vec2(sin(t * 0.7 * (0.6 + h.x) + h.y * 6.2832),
                      cos(t * 0.55 * (0.6 + h.y) + h.x * 6.2832)) * 0.06;
      vec2 ctr = id + 0.5 + (h - 0.5) * 0.6 + wob;
      float r = mix(0.34, 0.6, h3) * u_packing;
      vec2 dv = q - ctr;
      float d = length(dv);
      float o = d - r;
      if (o < minOut){
        minOut = o;
        float dc = min(d, r * 0.999);
        nearN = vec3(dv / max(d, 1e-4) * dc / r, sqrt(max(r * r - dc * dc, 0.0)) / r);
        nearK = h3 * 0.97 + h.x * 0.31 + seed * 0.17;
      }
      if (d < r && rank > bestRank){
        bestRank = rank;
        bestZ = sqrt(r * r - d * d);
        bestN = vec3(dv / r, bestZ / r);
        bestK = h3 * 0.97 + h.x * 0.31 + seed * 0.17;
      }
    }
  }

  // in-layer contact occlusion: how close the nearest sphere in FRONT of the
  // chosen one comes to this point
  float frontOut = 10.0;
  for (int y = -1; y <= 1; y++){
    for (int x = -1; x <= 1; x++){
      vec2 id = ci + vec2(float(x), float(y));
      float h4 = hash21(id * 0.77 + seed * 5.1);
      if (h4 > density) continue;
      float rank = hash21(id * 2.13 + seed * 3.3);
      if (rank <= bestRank) continue;
      vec2 h = hash22(id + seed);
      float h3 = hash21(id * 1.31 + seed * 2.7);
      vec2 wob = vec2(sin(t * 0.7 * (0.6 + h.x) + h.y * 6.2832),
                      cos(t * 0.55 * (0.6 + h.y) + h.x * 6.2832)) * 0.06;
      vec2 ctr = id + 0.5 + (h - 0.5) * 0.6 + wob;
      float r = mix(0.34, 0.6, h3) * u_packing;
      frontOut = min(frontOut, length(q - ctr) - r);
    }
  }
  float innerAO = 1.0 - u_shadow * 0.55 * exp(-max(frontOut, 0.0) * cell / (0.02 + 0.06 * near));

  vec3 N = bestZ > 0.0 ? bestN : nearN;
  float k = bestZ > 0.0 ? bestK : nearK;

  // material
  vec3 albedo = pickCol(k) * (0.8 + 0.4 * fract(k * 7.3));
  vec3 L = normalize(vec3(-0.45, 0.6, 0.66));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(N, L) * 0.75 + 0.25, 0.0);
  float ndh = max(dot(N, H), 0.0);
  float s8 = ndh * ndh; s8 *= s8; s8 *= s8;
  float s64 = s8 * s8; s64 *= s64; s64 *= s64;
  float blur = clamp(near * u_focus, 0.0, 1.0);
  float spec = mix(s64, s8 * 0.4, blur * 0.8);
  float limb = 1.0 - N.z;
  float limb2 = limb * limb;
  float rim = limb2 * limb * max(dot(N.xy, L.xy) * 2.0 + 0.3, 0.0);
  float selfAO = 1.0 - 0.45 * limb2;

  col = albedo * (0.22 + 0.85 * diff) * selfAO * innerAO;
  col += vec3(1.0) * spec * 0.9 * u_gloss;
  col += mix(albedo, vec3(1.0), 0.6) * rim * 0.5 * u_gloss;

  // depth fog on the far layers
  vec3 fog = mix(c3, c0, 0.5) * 0.22;
  col = mix(col, fog, (1.0 - near) * 0.42);

  // coverage with a soft edge that widens toward the camera
  float soft = (0.0035 + 0.055 * blur) / cell;
  alpha = 1.0 - smoothstep(-soft * 0.5, soft * 0.5, minOut);
  outDist = max(minOut, 0.0) * cell;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.545,0.361,0.965); c1 = vec3(0.925,0.282,0.6);
    c2 = vec3(0.298,0.733,0.91); c3 = vec3(0.984,0.749,0.141);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  float t = u_time * u_drift;

  // the pit floor: deep palette gradient, mostly hidden
  vec3 acc = mix(c3 * 0.1, c0 * 0.07, uv.y);

  vec3 lc; float la; float lo;
  float shadow = u_shadow * 0.6;

  // far to near: cell size in frame units (height = 2), seed, density, nearness
  layer(p, 0.15, 1.0, 1.0, 0.0, t, lc, la, lo);
  acc = mix(acc * (1.0 - shadow * exp(-lo / 0.02)), lc, la);

  layer(p, 0.28, 2.0, 0.92, 0.3, t, lc, la, lo);
  acc = mix(acc * (1.0 - shadow * exp(-lo / 0.035)), lc, la);

  layer(p, 0.5, 3.0, 0.62, 0.62, t, lc, la, lo);
  acc = mix(acc * (1.0 - shadow * exp(-lo / 0.06)), lc, la);

  layer(p, 0.95, 4.0, 0.34, 1.0, t, lc, la, lo);
  acc = mix(acc * (1.0 - shadow * 0.8 * exp(-lo / 0.1)), lc, la);

  gl_FragColor = vec4(acc, 1.0);
}
