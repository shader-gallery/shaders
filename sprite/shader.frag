// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// sprite (Omen) - branching electric arcs crossing the whole frame. Several
// bolts run corner to corner and edge to edge, each a jagged multi-octave path
// with a white-hot core, a saturated glow halo in its own palette colour, and
// secondary forks that peel off and die out. The air between them carries
// charge: a drifting haze lit by the nearest arcs, plus a dust of tiny sparks,
// so the frame never drops to black between strikes. Strikes flare the bolts
// far brighter for a moment, then the arcs settle back to a steady crackle.
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_bolts;     // number of arcs crossing the frame     (default 5)
uniform float u_branching; // how many forks peel off each arc      (default 0.85)
uniform float u_flicker;   // crackle and re-shape speed            (default 1.0)
uniform float u_glow;      // halo width and brightness             (default 1.0)
uniform float u_charge;    // ambient charge in the air             (default 0.75)

vec3 c0, c1, c2, c3;

float hash11(float n){ return fract(sin(n * 78.233) * 43758.5453123); }
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// 1D value noise; linear blend keeps the kinks, smooth blend rolls them off
float n1lin(float x){
  float i = floor(x), f = fract(x);
  return mix(hash11(i), hash11(i + 1.0), f);
}
float n1smooth(float x){
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), f);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p = p * 2.05 + vec2(7.3, 3.1);
    a *= 0.5;
  }
  return s;
}

// jagged lateral offset of an arc as a function of distance along it
float arcPath(float s, float seed, float jit){
  float o = (n1smooth(s * 1.4 + seed + jit * 0.3) - 0.5) * 0.55;
  o += (n1lin(s * 5.0 + seed * 1.7 + jit) - 0.5) * 0.17;
  o += (n1lin(s * 17.0 + seed * 3.1 + jit * 2.0) - 0.5) * 0.05;
  return o;
}

vec3 pal(float k){
  float x = fract(k) * 4.0;
  vec3 a = mix(c0, c1, clamp(x, 0.0, 1.0));
  a = mix(a, c2, clamp(x - 1.0, 0.0, 1.0));
  a = mix(a, c3, clamp(x - 2.0, 0.0, 1.0));
  a = mix(a, c0, clamp(x - 3.0, 0.0, 1.0));
  return a;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.071,0.953,0.831); c1 = vec3(0.965,0.224,0.682);
    c2 = vec3(0.682,0.969,0.235); c3 = vec3(0.224,0.42,0.965);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
  float t = u_time * u_flicker;
  float glowW = max(u_glow, 0.05);

  vec3 col = vec3(0.0);
  float haloSum = 0.0;   // total halo energy here, lights the haze and sparks

  for (int i = 0; i < 6; i++){
    float fi = float(i);
    if (fi >= u_bolts) break;
    float seed = fi * 17.31 + 3.7;

    // each arc re-rolls its lean and jitter every few frames: the crackle
    float epoch = floor(t * 9.0 + hash11(seed) * 9.0);
    float jit = epoch * 0.173;

    // arcs are spread across the frame by index, then jittered; they lean
    // between near-vertical and a shallow diagonal so together they cross
    // the whole frame rather than clustering
    float spread = (fi + 0.5) / max(u_bolts, 1.0) - 0.5;
    vec2 o = vec2(spread * 2.0 * aspect * 0.9 + (hash11(seed * 2.1) - 0.5) * 0.5,
                  (hash11(seed * 4.3) - 0.5) * 0.8);
    float lean = (hash11(seed * 1.3) - 0.5) * 1.6 + (n1smooth(t * 0.1 + seed) - 0.5) * 0.3;
    vec2 dir = normalize(vec2(sin(lean), cos(lean)));
    vec2 nrm = vec2(dir.y, -dir.x);

    vec2 q = p - o;
    float s = dot(q, dir);
    float d = dot(q, nrm);

    float off = arcPath(s, seed, jit);
    float dist = abs(d - off);

    // strike envelope: a steady crackle with occasional hard flares
    float steady = 0.55 + 0.45 * n1lin(t * 16.0 + seed * 5.0);
    float flare = n1smooth(t * 0.7 + seed * 2.9);
    flare = smoothstep(0.62, 0.98, flare);
    float amp = steady * (0.6 + 2.2 * flare);

    // main arc: hot core, tight halo, wide bloom
    float coreW = 0.0045;
    float core = exp(-dist * dist / (coreW * coreW));
    float halo = exp(-dist / (0.035 * glowW));
    float wide = exp(-dist / (0.3 * glowW)) * 0.28;

    // secondary forks that peel off along the arc and die out
    float fork = 0.0;
    for (int j = 0; j < 3; j++){
      float fj = float(j);
      float on = step(fj + 0.5, u_branching * 3.0 + 0.01);
      if (on < 0.5) break;
      float fseed = seed * 3.7 + fj * 11.9 + epoch * 0.31;
      float s0 = (hash11(fseed) - 0.5) * 2.6;          // where it leaves the arc
      float side = sign(hash11(fseed * 1.9) - 0.5);
      float slope = side * mix(0.45, 1.3, hash11(fseed * 2.7));
      float len = mix(0.35, 0.9, hash11(fseed * 3.3));
      float along = s - s0;
      float u = along * sign(slope);
      float fade = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(len * 0.5, len, u));
      float foff = off + along * slope + (n1lin(along * 12.0 + fseed) - 0.5) * 0.08
                 + (n1lin(along * 33.0 + fseed * 1.7) - 0.5) * 0.03;
      float fd = abs(d - foff);
      float fcore = exp(-fd * fd / (0.003 * 0.003));
      float fhalo = exp(-fd / (0.022 * glowW));
      fork += fade * (fcore * 0.9 + fhalo * 0.55);
    }

    vec3 haloCol = pal(fi * 0.25 + 0.05);
    vec3 wideCol = pal(fi * 0.25 + 0.3);
    vec3 coreCol = mix(haloCol, vec3(1.0), 0.85);

    col += coreCol * core * amp * 1.4;
    col += haloCol * halo * amp * 0.9;
    col += wideCol * wide * amp * 0.6;
    col += mix(coreCol, haloCol, 0.5) * fork * amp * 0.8;
    haloSum += (halo + wide * 1.5) * amp;
  }

  // charged air: a drifting haze that brightens toward the arcs, over a deep
  // palette base so the frame is never dead
  float hz = fbm(p * 1.3 + vec2(t * 0.05, -t * 0.03));
  float hz2 = fbm(p * 3.1 - vec2(t * 0.02, t * 0.04));
  vec3 base = mix(c3, c0, 0.5) * 0.045;
  vec3 haze = mix(c0, c1, hz2) * (0.05 + 0.16 * hz) * u_charge;
  haze += pal(hz * 0.6) * min(haloSum, 3.0) * 0.06 * u_charge;
  col += base + haze;

  // spark dust: tiny points that flicker up where the air is charged
  vec2 spPx = gl_FragCoord.xy / (5.0 * u_pixelRatio);
  vec2 cell = floor(spPx);
  float sp = hash21(cell + floor(t * 6.0) * 0.61);
  vec2 spOff = vec2(hash21(cell * 1.7 + 3.1), hash21(cell * 2.3 + 7.7)) * 0.6 + 0.2;
  float spR = length(fract(spPx) - spOff);
  sp = smoothstep(0.975, 1.0, sp) * smoothstep(0.32, 0.05, spR);
  col += vec3(1.0) * sp * (0.2 + min(haloSum, 2.0) * 0.6) * u_charge;

  gl_FragColor = vec4(col, 1.0);
}
