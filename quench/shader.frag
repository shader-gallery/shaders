// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;           // wave travel speed                    (default 0.4)
uniform float u_swell;          // wave height / chop                   (default 0.6)
uniform float u_heat;           // molten emissive glow in the troughs  (default 0.7)
uniform float u_polish;         // mirror finish of the metal surface    (default 0.7)
uniform float u_mouseInfluence; // pointer parallax                     (default 0.0)

vec3 c0, c1, c2, c3;
float gTime, gAmp;

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
  float s = 0.0, a = 0.55;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = rot * p * 2.02 + vec2(11.3, 7.1); a *= 0.5; }
  return s;
}

// molten surface height at world xz
float waves(vec2 xz){
  vec2 p = xz * 0.55;
  float h = 0.55 * fbm(p + vec2(gTime * 0.35, gTime * 0.12));
  h += 0.28 * fbm(p * 2.1 - vec2(gTime * 0.25, 0.0));
  return (h - 0.5) * gAmp;
}

vec3 env(vec3 rd){
  // hot forge sky: deep at the horizon, bright above
  float y = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(c3 * 0.4, c0 * 1.1, smoothstep(0.0, 0.55, y));
  col = mix(col, c2 * 1.4, smoothstep(0.5, 1.0, y));
  col += c1 * 0.7 * pow(smoothstep(0.55, 1.0, y), 3.0);
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
  gAmp = 0.25 + 0.7 * clamp(u_swell, 0.0, 1.0);

  // camera looking low across the molten sea so it recedes to a horizon
  vec3 ro = vec3(0.0, 1.05, 3.0);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xz += mo * mAmt * 1.2;
  vec3 ta = vec3(0.0, 0.0, -3.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  // heightfield march: walk forward, find where the ray drops below the
  // surface, refine by linear interpolation between the last two samples
  float t = 0.0, lastDiff = ro.y - waves(ro.xz), lastT = 0.0;
  float hitT = -1.0;
  for (int i = 0; i < 110; i++){
    vec3 p = ro + rd * t;
    float diff = p.y - waves(p.xz);
    if (diff < 0.0){
      hitT = mix(lastT, t, lastDiff / max(lastDiff - diff, 1e-4));
      break;
    }
    lastDiff = diff; lastT = t;
    t += 0.05 + t * 0.025;
    if (t > 32.0) break;
  }

  vec3 col;
  if (hitT > 0.0){
    vec3 p = ro + rd * hitT;
    // normal from the height gradient (finite differences)
    float e = 0.04;
    float hL = waves(p.xz - vec2(e, 0.0)), hR = waves(p.xz + vec2(e, 0.0));
    float hD = waves(p.xz - vec2(0.0, e)), hU = waves(p.xz + vec2(0.0, e));
    vec3 n = normalize(vec3(hL - hR, 2.0 * e, hD - hU));

    vec3 ref = reflect(rd, n);
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    vec3 reflCol = env(ref);

    // molten metal: high reflectance + a hot emissive glow that pools in the
    // troughs (low height) like lava between cooling crests
    float height = waves(p.xz) / max(gAmp, 0.1);     // ~ -0.5..0.5
    float trough = smoothstep(0.15, -0.35, height);  // 1 in the low valleys
    vec3 emissive = (c0 * 1.2 + c1 * 0.5) * trough * u_heat;

    vec3 tint = mix(vec3(0.92), c0 * 1.3, 0.3);
    col = reflCol * tint;
    col += reflCol * fres * 0.7;
    col += emissive;

    // sharp sun glint off the crests
    vec3 L = normalize(vec3(0.3, 0.8, -0.5));
    float spec = pow(max(dot(ref, L), 0.0), mix(30.0, 260.0, u_polish));
    col += vec3(1.0) * spec * (0.5 + 0.5 * u_polish);

    // distance haze toward the horizon so it fills smoothly
    col = mix(col, env(vec3(0.0, 0.02, -1.0)), smoothstep(12.0, 30.0, hitT));
  } else {
    col = env(rd);   // hot sky above the horizon fills the top of the frame
  }

  gl_FragColor = vec4(col, 1.0);
}
