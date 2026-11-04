// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Slot canyon seen from the sand floor looking straight up: overlapping sandstone lobes
// with flowing strata narrow toward a bright winding slit of sky, bounce light warms the
// rims while the deep folds sink into blue-black shade, and lit sand drifts down.
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest (unused)
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_strata;  // density of the flowing sandstone strata (default 1.0)
uniform float u_bounce;  // strength of the light bouncing down the walls (default 1.0)
uniform float u_dust;    // amount of falling lit sand (default 0.7)
uniform float u_drift;   // speed of the slow parallax drift along the slit (default 1.0)

float h21(vec2 p){ return fract(sin(dot(p, vec2(57.913, 213.71))) * 6143.87); }
vec2 h22(vec2 p){ return vec2(h21(p), h21(p + vec2(11.9, 37.2))); }
float vn(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vn(p);
    p = mat2(1.62, 1.17, -1.17, 1.62) * p + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return s;
}

// warm sandstone ramp: deep clay to near-white
vec3 ramp(vec3 c0, vec3 c1, vec3 c2, vec3 c3, float x){
  x = clamp(x, 0.0, 1.0);
  vec3 a = mix(c3 * 0.35, c3, smoothstep(0.0, 0.25, x));
  a = mix(a, c0, smoothstep(0.25, 0.55, x));
  a = mix(a, c1, smoothstep(0.55, 0.8, x));
  a = mix(a, c2, smoothstep(0.8, 1.0, x));
  return a;
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 res = u_resolution;
  float asp = res.x / res.y;
  vec2 p = vec2((gl_FragCoord.x / res.x - 0.5) * asp, gl_FragCoord.y / res.y - 0.5);
  float px = 1.0 / res.y;
  float t = u_time;
  float dr = t * u_drift;

  // slit axis runs diagonally, biased off-centre
  float ca = cos(0.55), sa = sin(0.55);
  vec2 r = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);
  float sx = r.x;
  float cl = 0.11 + 0.10 * sin(sx * 2.3 + 0.8) + 0.045 * sin(sx * 5.1 - 1.2 + dr * 0.02);
  float d = r.y - cl;
  float ad = abs(d);
  float side = d > 0.0 ? 1.0 : -1.0;

  vec3 hot = vec3(1.0, 0.97, 0.93);
  vec3 cold = vec3(0.006, 0.012, 0.045);
  vec3 coldMid = vec3(0.030, 0.060, 0.170);

  // sky through the slit: white-hot spine, a cool pale sky at its edges
  vec3 skyCool = vec3(0.62, 0.78, 1.0);
  vec3 col = mix(hot * 1.2, skyCool * 0.95, smoothstep(0.0, 0.05, ad));
  col *= 0.9 + 0.15 * vn(vec2(sx * 5.0 + dr * 0.03, 3.0));

  // the slot pinches shut and swells into chambers along its length
  float pinch = 0.45 + 1.1 * vn(vec2(sx * 1.6 + dr * 0.012, 1.7));

  // canyon wall lobes from the rim (far, bright) down to the floor (near, dark)
  for (int kk = 0; kk < 6; kk++) {
    float k = float(kk);
    float nearK = k / 5.0;
    float xk = sx * (1.0 + 0.3 * k) + dr * (0.006 + 0.010 * k) + side * 4.7 + k * 13.1;
    float sw = vn(vec2(xk * (0.9 + 0.25 * k), k * 5.0 + side * 2.0)) - 0.5;
    float ed = (0.03 + 0.05 * k + 0.009 * k * k) * pinch
             + (0.05 + 0.11 * nearK) * sw * 2.0
             + 0.012 * (1.0 + nearK) * (vn(vec2(xk * 3.7, k + side)) - 0.5);
    ed = max(ed, 0.007 + 0.01 * k);
    float u = ad - ed;

    // contact shade cast by this lobe onto what lies beyond it
    float occ = exp(-max(-u, 0.0) / (0.025 + 0.02 * nearK));
    col *= 1.0 - 0.6 * occ * step(u, 0.0);

    // strata follow the lobe edge and fold with it
    float uw = max(u, 0.0);
    float warp = fbm(vec2(xk * 1.4, uw * 9.0 + k));
    float v = (uw * (34.0 - 3.0 * k) + warp * 2.6 + xk * 0.15) * u_strata;
    float band = 0.5 + 0.5 * sin(v * 6.2831853);
    float groove = smoothstep(0.1, 0.0, abs(fract(v) - 0.5) - 0.36);
    float grain = vn(vec2(xk * 60.0, uw * 160.0));

    // light: rims catch the bounce, the wall turns away into cold shade
    float I = mix(1.0, 0.3, pow(nearK, 0.7)) * u_bounce * exp(-ad * 1.1);
    float rimL = exp(-uw / (0.008 + 0.014 * nearK));
    float body = exp(-uw * (4.0 + 2.5 * k));
    float Ir = max(I, 0.4 * u_bounce);
    float lum = I * (0.3 * band + 0.7) * (0.3 + 0.7 * body) + 0.5 * rimL * Ir;
    vec3 stone = ramp(c0, c1, c2, c3, lum * 0.9 + 0.07 * grain);
    // keep the sandstone saturated: lean the mid-tones toward the strongest theme colour
    stone = mix(stone, c0 * vec3(1.15, 0.85, 0.7), 0.35 * smoothstep(0.15, 0.6, lum) * (1.0 - rimL));
    stone *= clamp(lum * 1.35, 0.0, 1.3);
    stone *= 1.0 - 0.35 * groove;
    vec3 shade = cold * (1.6 - nearK) + coldMid * (0.8 - 0.5 * nearK) * (0.5 + 0.5 * band) * (1.0 - body * 0.6);
    vec3 wallc = shade + stone;
    wallc += hot * rimL * rimL * 0.3 * I;

    float m = smoothstep(-1.2 * px, 1.2 * px, u);
    col = mix(col, wallc, m);
  }

  // glow of the slit spilling over the near folds
  col += mix(c0, c1, 0.5) * 0.10 * u_bounce * exp(-ad * 9.0);

  // falling sand caught in the light, three depths
  for (int kk = 0; kk < 3; kk++) {
    float k = float(kk);
    float sc = 10.0 + k * 8.0;
    vec2 g = r * sc + vec2(t * 0.05 * (1.0 + k) * u_drift + k * 7.0, t * 0.02);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    vec2 hh = h22(id + k * 23.0);
    vec2 off = (hh - 0.5) * 0.6 + 0.1 * vec2(sin(t * 0.37 + hh.x * 6.28), cos(t * 0.29 + hh.y * 6.28));
    float rad = (0.035 + 0.05 * h21(id + 5.3)) * (1.0 + 0.5 * k);
    float mm = smoothstep(rad, rad * 0.15, length(f - off));
    float tw = 0.55 + 0.45 * sin(t * (0.6 + hh.x) + hh.y * 17.0);
    float present = step(1.0 - u_dust * 0.45, h21(id + 9.1));
    float lit = exp(-ad * 7.0);
    col += mm * tw * present * lit * mix(c1, hot, 0.5) * (1.0 - 0.25 * k);
  }

  gl_FragColor = vec4(col, 1.0);
}
