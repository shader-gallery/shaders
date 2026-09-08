// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;           // how fast the metal rolls              (default 0.3)
uniform float u_relief;         // height of the swells, normal tilt     (default 1.1)
uniform float u_ripple;         // domain-warp folding of the surface    (default 1.0)
uniform float u_gloss;          // sharpness of the reflected light bands (default 0.85)
uniform float u_mouseInfluence; // pointer push on the surface           (default 0.0)

vec3 c0, c1, c2, c3;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 7.7);
    a *= 0.42;
  }
  return s;
}

// the rolling metal: a domain-warped field, folded through abs so the
// swells carry ferrofluid ridges rather than soft cushions
float height(vec2 p, float t){
  float w = max(u_ripple, 0.0);
  vec2 q = vec2(fbm(p + vec2(t * 0.35, 0.0)), fbm(p + vec2(4.4, 1.9) - t * 0.28));
  vec2 r = vec2(fbm(p + w * 1.2 * q + vec2(1.3, 8.2) + t * 0.22),
                fbm(p + w * 1.2 * q + vec2(7.9, 2.1) - t * 0.19));
  float h = fbm(p + w * 1.0 * r);
  float ridge = 1.0 - abs(h * 2.0 - 1.0);
  return mix(h, ridge * ridge, 0.35);
}

// what the mirror reflects: a studio with a hard horizon, a dark floor and a
// stack of sharp strip lights. The bands are what make it read as chrome.
vec3 env(vec3 rd){
  float y = rd.y;
  float x = rd.x;
  float soft = mix(0.09, 0.012, clamp(u_gloss, 0.0, 1.0));
  // floor: near-black with a faint palette pool reflected up at the horizon
  vec3 floorCol = mix(c3 * 0.16, c3 * 0.48, smoothstep(-0.9, 0.0, y));
  // sky: brightest just above the horizon, falling to a deep tone overhead
  vec3 skyCol = mix(c0 * 0.85, c3 * 0.15, smoothstep(0.0, 0.85, y));
  float hz = smoothstep(-soft, soft, y);
  vec3 col = mix(floorCol, skyCol, hz);
  // strip lights: long softboxes at set elevations, edges set by gloss
  float s1 = smoothstep(0.12 - soft, 0.12 + soft, y) - smoothstep(0.26 - soft, 0.26 + soft, y);
  float s2 = smoothstep(0.40 - soft, 0.40 + soft, y) - smoothstep(0.47 - soft, 0.47 + soft, y);
  float s3 = smoothstep(0.62 - soft, 0.62 + soft, y) - smoothstep(0.80 - soft, 0.80 + soft, y);
  col += (c2 * 1.2 + 0.7) * s1;
  col += (c1 * 1.1 + 0.3) * s2;
  col += (c2 * 0.8 + 0.5) * s3;
  // a coloured rim light off to one side, and a cooler one on the other
  float side1 = smoothstep(0.55 - soft, 0.55 + soft, x) - smoothstep(0.78 - soft, 0.78 + soft, x);
  float side2 = smoothstep(-0.85 - soft, -0.85 + soft, x) - smoothstep(-0.62 - soft, -0.62 + soft, x);
  col += c1 * 1.3 * side1 * smoothstep(-0.3, 0.3, y);
  col += c0 * 0.9 * side2 * smoothstep(-0.5, 0.2, y);
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 1.5;
  float t = u_time * u_flow;

  // optional pointer push: a bulge under the cursor, zero at rest
  vec2 mo = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0) * 1.5;
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  float md = length(p - mo);
  float bump = mAmt * 0.9 * exp(-md * md * 2.5);

  // height and normal by finite differences
  float e = 0.02;
  float h0 = height(p, t) + bump;
  float hx = height(p + vec2(e, 0.0), t) + mAmt * 0.9 * exp(-dot(p + vec2(e, 0.0) - mo, p + vec2(e, 0.0) - mo) * 2.5);
  float hy = height(p + vec2(0.0, e), t) + mAmt * 0.9 * exp(-dot(p + vec2(0.0, e) - mo, p + vec2(0.0, e) - mo) * 2.5);
  float amp = 0.95 * u_relief;
  vec3 n = normalize(vec3(-(hx - h0) / e * amp, -(hy - h0) / e * amp, 1.0));
  // tilt the whole sheet back a little so the flats sit just above the
  // horizon line instead of on it
  n = normalize(n + vec3(0.0, 0.22, 0.0));

  // mirror the studio in the surface
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 R = reflect(-V, n);
  vec3 refl = env(R);

  // metal: high reflectance everywhere, faint palette body tint, grazing rim
  float ndv = max(dot(n, V), 0.0);
  float fr1 = 1.0 - ndv;
  float fres = fr1 * fr1 * fr1;
  vec3 tint = mix(vec3(0.90), c0 * 1.3, 0.28);
  vec3 col = refl * tint;
  col += refl * fres * 0.5;

  // hard key speculars so the crests snap
  vec3 L1 = normalize(vec3(0.35, 0.8, 0.5));
  vec3 L2 = normalize(vec3(-0.7, 0.2, 0.6));
  float shin = mix(40.0, 400.0, clamp(u_gloss, 0.0, 1.0));
  float sp = pow(max(dot(R, L1), 0.0), shin) + 0.6 * pow(max(dot(R, L2), 0.0), shin * 0.5);
  col += vec3(1.0) * sp * 0.9;

  // valleys sink into shadow
  float depthAO = smoothstep(0.0, 0.7, h0);
  col *= 0.68 + 0.32 * depthAO;

  gl_FragColor = vec4(col, 1.0);
}
