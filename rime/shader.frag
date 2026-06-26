// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;           // drift speed of the ice cluster        (default 0.32)
uniform float u_subsurface;     // inner glow / translucence             (default 0.7)
uniform float u_frost;          // surface roughness                     (default 0.5)
uniform float u_spread;         // how far the spheres roam              (default 0.9)
uniform float u_mouseInfluence; // pointer parallax                      (default 0.0)

vec3 c0, c1, c2, c3;
float gTime, gSpread;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n0 = mix(mix(hash(i.xy + i.z * 37.0), hash(i.xy + vec2(1.0,0.0) + i.z*37.0), f.x),
                 mix(hash(i.xy + vec2(0.0,1.0) + i.z*37.0), hash(i.xy + vec2(1.0,1.0) + i.z*37.0), f.x), f.y);
  float n1 = mix(mix(hash(i.xy + (i.z+1.0)*37.0), hash(i.xy + vec2(1.0,0.0) + (i.z+1.0)*37.0), f.x),
                 mix(hash(i.xy + vec2(0.0,1.0) + (i.z+1.0)*37.0), hash(i.xy + vec2(1.0,1.0) + (i.z+1.0)*37.0), f.x), f.y);
  return mix(n0, n1, f.z);
}

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// distinct ice spheres (only lightly fused) — return distance
float map(vec3 p){
  float d = 1e5;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    vec3 c = vec3(
      sin(gTime * (0.5 + fi * 0.05) + fi * 2.4),
      cos(gTime * (0.6 + fi * 0.06) + fi * 1.1),
      sin(gTime * (0.4 + fi * 0.04) + fi * 3.3)
    ) * gSpread;
    d = smin(d, length(p - c) - 0.66, 0.12);   // small k = stay distinct
  }
  return d;
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0016, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

vec3 env(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.5, c0 * 1.15, smoothstep(0.0, 0.65, y));
  col = mix(col, c2 * 1.45, smoothstep(0.5, 1.0, y));
  col += c1 * 0.45 * pow(smoothstep(0.6, 1.0, y), 2.0);
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  gTime = u_time * u_flow;
  gSpread = 0.55 + u_spread;

  vec3 ro = vec3(0.0, 0.12, 3.5);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.0;
  vec3 ww = normalize(vec3(0.0) - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.55 * ww);

  float tt = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 80; i++){
    vec3 p = ro + rd * tt;
    float d = map(p);
    if (d < 0.0016){ hit = 1.0; break; }
    if (tt > 9.0) break;
    tt += d * 0.9;
  }

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    // frosted micro-roughness
    vec3 jit = vec3(vnoise(p * 8.0), vnoise(p * 8.0 + 19.0), vnoise(p * 8.0 + 41.0)) - 0.5;
    n = normalize(n + jit * (0.4 * u_frost));

    float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    vec3 refl = env(reflect(rd, n));
    vec3 transm = env(refract(rd, n, 0.72));

    // subsurface: ice glows from within, brightest where the surface faces
    // away from us (back-lit thin edges) — a soft icy-cyan inner light
    float thin = pow(1.0 - abs(dot(rd, n)), 1.5);
    vec3 sss = (c2 * 1.1 + c0 * 0.4) * thin * u_subsurface;

    // milky frosted body + subsurface, fresnel blends the surface reflection
    vec3 body = mix(transm, c2 * 1.15 + 0.18, 0.35 * u_frost) + sss;
    col = mix(body, refl, fres * 0.55);

    // crisp ice glint
    vec3 L = normalize(vec3(0.45, 0.85, 0.4));
    float spec = pow(max(dot(reflect(rd, n), L), 0.0), 90.0);
    col += vec3(1.0) * spec * 0.5;
    col *= 0.78 + 0.26 * (n.y * 0.5 + 0.5);
  } else {
    col = env(rd) * 0.8;
  }

  gl_FragColor = vec4(col, 1.0);
}
