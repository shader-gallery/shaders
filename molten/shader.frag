// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;           // how fast the metal flows/merges   (default 0.5)
uniform float u_viscosity;      // blob merge softness (smin k)       (default 0.55)
uniform float u_spread;         // how far the blobs roam            (default 0.85)
uniform float u_polish;         // specular sharpness / mirror finish (default 0.7)
uniform float u_mouseInfluence; // pointer pull on the cluster        (default 0.0)

// palette globals (filled in main, used by env())
vec3 c0, c1, c2, c3;

float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float gTime, gSpread, gVisc;

// SDF: smooth union of drifting spheres → a liquid-mercury cluster
float map(vec3 p){
  float d = 1e5;
  float k = 0.18 + 0.5 * gVisc;
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    vec3 c = vec3(
      sin(gTime * (0.7 + fi * 0.05) + fi * 1.7),
      cos(gTime * (0.6 + fi * 0.07) + fi * 2.3),
      sin(gTime * (0.8 + fi * 0.04) + fi * 0.9)
    ) * gSpread;
    d = smin(d, length(p - c) - 0.74, k);
  }
  return d;
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

// procedural studio environment, palette-tinted — what the chrome reflects
vec3 env(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  // vertical gradient: dark floor pole -> mid -> bright top (bright so the
  // chrome reads as a polished mirror, not a dark plastic ball)
  vec3 col = mix(c3 * 0.30, c0 * 1.25, smoothstep(0.0, 0.60, y));
  col = mix(col, c2 * 1.55, smoothstep(0.52, 1.0, y));
  // a hot overhead studio softbox + a cool side rim — the things it reflects
  col += c2 * 1.3 * pow(smoothstep(0.62, 1.0, y), 3.0);
  col += c1 * 0.45 * pow(max(rd.x * 0.5 + 0.5, 0.0), 4.0);
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
  gSpread = 0.5 + u_spread;
  gVisc = u_viscosity;

  // camera: slightly above, looking at the cluster; close so it fills frame
  vec3 ro = vec3(0.0, 0.25, 3.4);
  // optional pointer parallax (gated, zero at rest)
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.2;
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  // raymarch — const loop bound; break on non-param conditions only
  float tt = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 78; i++){
    vec3 p = ro + rd * tt;
    float d = map(p);
    if (d < 0.0015){ hit = 1.0; break; }
    if (tt > 9.0) break;
    tt += d * 0.9;
  }

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    vec3 ref = reflect(rd, n);
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);

    // mirror reflection of the environment (chrome)
    vec3 reflCol = env(ref);

    // crisp studio specular highlights
    vec3 L1 = normalize(vec3(0.5, 0.85, 0.35));
    vec3 L2 = normalize(vec3(-0.6, 0.3, 0.5));
    float shin = mix(20.0, 240.0, u_polish);
    float spec = pow(max(dot(ref, L1), 0.0), shin)
               + 0.5 * pow(max(dot(ref, L2), 0.0), shin * 0.6);

    // METAL: high reflectance at all angles (no dielectric face-on dropoff).
    // A faint palette tint keeps coloured themes from washing to pure mirror.
    vec3 tint = mix(vec3(0.92), c0 * 1.4, 0.30);
    col = reflCol * tint;
    col += reflCol * fres * 0.7;                       // grazing rim brightens
    col += vec3(1.0) * spec * (0.5 + 0.5 * u_polish);  // studio speculars
    // gentle vertical AO so the underside grounds the cluster
    col *= 0.62 + 0.38 * (n.y * 0.5 + 0.5);
  } else {
    // misses show the same environment so the frame fills edge-to-edge
    col = env(rd) * 0.9;
  }

  gl_FragColor = vec4(col, 1.0);
}
