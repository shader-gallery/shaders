// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// Slot canyon - looking up a sinuous sandstone corridor, layer after layer of
// curved, cross-bedded walls closing toward a bright slit of sky. Light bounces
// down the lips of the walls, a slow shaft falls through drifting haze and dust
// motes, and each step deeper sits further back in luminous air.
precision highp float;

uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, unused
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_haze;    // air between the wall layers            (default 0.6)
uniform float u_beam;    // brightness of the falling light shaft  (default 0.75)
uniform float u_strata;  // density of the sandstone bedding       (default 1.0)
uniform float u_drift;   // speed of the dust and the haze         (default 0.5)

vec3 c0, c1, c2, c3;
vec3 s0, s1, s2, s3;
float gT;

// strip the grey out of a pastel theme colour, keep its hue at full strength
vec3 pure(vec3 c){
  vec3 k = c - 0.82 * min(c.r, min(c.g, c.b));
  return k / max(max(k.r, max(k.g, k.b)), 1e-3);
}

float hs(vec2 p){
  p = fract(p * vec2(0.2147, 0.1789));
  p += dot(p, p.yx + 41.37);
  return fract(p.x * p.y * 1.7);
}

float vn(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hs(i), b = hs(i + vec2(1.0, 0.0));
  float c = hs(i + vec2(0.0, 1.0)), d = hs(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fb(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    v += a * vn(p);
    p = p * 2.07 + vec2(3.3, 8.9);
    a *= 0.5;
  }
  return v;
}

// the falling shaft of light: returns its strength at p
float shaft(vec2 p, float slitX){
  vec2 o = vec2(slitX + 0.02 + 0.03 * sin(gT * 0.11), 0.56);
  vec2 dir = normalize(vec2(-0.3 + 0.16 * sin(gT * 0.13 + 1.0), -1.0));
  vec2 rel = p - o;
  float along = dot(rel, dir);
  float perp = dot(rel, vec2(-dir.y, dir.x));
  float w = 0.012 + 0.075 * max(along, 0.0);
  float core = exp(-perp * perp / (w * w));
  float dust = 0.55 + 0.75 * fb(vec2(perp * 18.0, along * 3.0 - gT * 0.12 * u_drift));
  return core * dust * smoothstep(0.0, 0.08, along) * exp(-along * 0.9);
}

// drifting dust motes on one depth layer
float motes(vec2 p, float cell, float seed, float rad){
  float s = 0.0;
  vec2 q = p + vec2(gT * 0.006, -gT * 0.012) * u_drift * (1.0 + seed * 0.3);
  vec2 g = floor(q / cell);
  for (int j = 0; j < 4; j++){
    vec2 cid = g + vec2(float(j - (j / 2) * 2), float(j / 2));
    float h = hs(cid + seed * 7.1);
    if (h > 0.55) continue;
    vec2 c = (cid + 0.2 + 0.6 * vec2(hs(cid + 3.7 + seed), hs(cid + 9.1 + seed))) * cell;
    c += 0.25 * cell * vec2(sin(gT * 0.4 * u_drift + h * 30.0), cos(gT * 0.3 * u_drift + h * 17.0));
    float r = rad * (0.4 + 1.2 * hs(cid + 5.5));
    float d = length(q - c);
    float tw = 0.6 + 0.4 * sin(gT * (0.5 + h) + h * 50.0);
    s += smoothstep(r, r * 0.2, d) * tw;
  }
  return s;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  s0 = pure(c0); s1 = pure(c1); s2 = pure(c2); s3 = pure(c3);
  gT = u_time;
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  float slitX = -0.2;

  // beyond everything: the slit of sky, white-mint at its heart, blue at the sides
  float skyD = abs(uv.x - slitX - 0.03 * sin(uv.y * 6.0));
  vec3 col = mix(s0 * 0.35, mix(c3, vec3(1.0), 0.45), exp(-skyD * 9.0)) * (0.5 + 0.7 * smoothstep(-0.4, 0.5, uv.y));

  // canyon floor of drifted sand, seen through the widest gaps
  float fl = -0.3 + 0.03 * sin(uv.x * 3.0);
  if (uv.y < fl){
    float fd = fl - uv.y;
    float rip = 0.5 + 0.5 * sin((uv.y * 60.0 + 4.0 * fb(uv * vec2(3.0, 8.0))) / (0.4 + fd * 3.0));
    vec3 sand = s1 * 0.05 + s2 * 0.06 * rip;
    float pool = exp(-pow(length((uv - vec2(slitX - 0.2, -0.4)) * vec2(1.0, 2.6)) / 0.18, 2.0));
    sand += mix(c2, vec3(1.0), 0.3) * pool * 0.5 * u_beam * (0.7 + 0.3 * rip);
    col = mix(col, sand, smoothstep(0.0, 0.03, fd));
  }

  float lightY = smoothstep(-0.55, 0.5, uv.y);
  vec3 hazeCol = mix(mix(c1, c0, lightY), mix(c3, vec3(1.0), 0.3), lightY * lightY);

  const int N = 6;
  for (int i = 0; i < N; i++){
    float fi = float(i);
    float t = fi / float(N - 1);          // 0 far .. 1 near
    float seed = fi * 13.71 + 2.0;

    // the meandering centre line of the gap in this layer
    float y = uv.y;
    float topK = 0.12 + 0.88 * smoothstep(0.5, 0.05, y);
    float amp = mix(0.035, 0.16, t) * topK;
    float cx = slitX + amp * sin(y * mix(6.0, 2.6, t) + seed)
             + amp * 0.5 * sin(y * mix(13.0, 5.5, t) + seed * 1.7)
             + (fb(vec2(y * 2.5, seed)) - 0.5) * mix(0.04, 0.14, t) * topK;
    // opening grows toward the floor, the two walls bulge independently
    float open = smoothstep(0.62, -0.55, y);
    float w = mix(0.018, 0.035, t) + mix(0.05, 0.62, t) * open * open
            + 0.012 * smoothstep(0.25, 0.5, y);
    float nl = fb(vec2(y * mix(7.0, 3.0, t), seed + 4.0));
    float nr = fb(vec2(y * mix(7.0, 3.0, t), seed + 9.0));
    float dl = (cx - w * (0.6 + 0.8 * nl)) - uv.x;
    float dr = uv.x - (cx + w * (0.6 + 0.8 * nr));
    float d = max(dl, dr);                // > 0 inside the wall
    float side = dl > dr ? -1.0 : 1.0;
    float aa = 1.5 * px + 0.002 * (1.0 - t);
    float inside = smoothstep(-aa, aa, d);

    // rounded lobes: a scalloped bulge term shades the wall like a carved surface
    float lobe = fb(vec2(d * mix(14.0, 6.0, t), y * mix(9.0, 4.0, t)) + seed);
    // flowing cross-bedded strata that follow the curve of each wall
    float v = d * 1.4 * side + y * 0.55 + 0.04 * (lobe - 0.5);
    float bands = sin(v * mix(95.0, 38.0, t) * u_strata + 3.0 * lobe);
    float fine = sin(v * mix(260.0, 120.0, t) * u_strata + 7.0 * lobe);
    float parting = smoothstep(0.93, 0.995, sin(v * mix(47.0, 19.0, t) * u_strata + 1.3 + 2.0 * lobe));
    float grainS = vn(uv * vec2(260.0, 190.0) + seed) * 0.6 + vn(uv * 90.0 - seed) * 0.4;
    float strata = (0.5 + 0.32 * smoothstep(-0.3, 0.9, bands) + 0.1 * fine) * (1.0 - 0.45 * parting)
                 * (0.84 + 0.3 * grainS);

    // bounce light: the lip catches it, it dies into the body of the wall
    float lip = exp(-d * mix(28.0, 6.0, t));
    float sun = mix(0.35, 1.0, lightY) * (0.75 + 0.5 * lobe);
    // glow runs pink high up, lavender in the middle, blue low and deep
    vec3 lit = mix(mix(s0, s1, smoothstep(-0.5, 0.0, y)), s2, smoothstep(-0.05, 0.45, y));
    lit = mix(lit, mix(c2, vec3(1.0), 0.4), lip * lip * lightY * 0.6);
    vec3 dark = mix(s1 * 0.045, s0 * 0.04, t) + s2 * 0.02 * lobe;
    vec3 wall = dark * strata + lit * lip * sun * strata * mix(0.95, 0.6, t);
    // weak ambient bounce keeps the bedding legible deep into each wall
    wall += lit * strata * 0.07 * (0.3 + lightY) * (0.6 + 0.6 * lobe);
    // where the shaft lands on a wall it warms and brightens, and it travels
    float hit = shaft(uv * vec2(0.85, 1.0) + vec2(-0.03 * (1.0 - t), 0.0), slitX);
    wall += mix(s2, s3, 0.25) * hit * u_beam * (0.25 + 0.6 * lip) * strata * mix(1.0, 0.7, t);
    // a cool rim where the edge turns away toward the sky
    wall += mix(c0, c3, 0.5) * smoothstep(0.004 + 0.004 * t, 0.0, d) * 0.25 * lightY;
    // low down, sky light bounced off the sand floor turns the lips mint
    wall += s3 * exp(-d * mix(30.0, 12.0, t)) * smoothstep(0.0, -0.5, y) * 0.22 * strata;
    // distance: deeper walls sit back in luminous air
    float far = (1.0 - t) * u_haze;
    wall = mix(wall, hazeCol * (0.25 + 0.35 * lightY), far * 0.65);
    col = mix(col, wall, inside);

    // a drifting sheet of haze between this wall and the next one in front
    float sheet = fb(uv * vec2(2.2, 4.0) + vec2(gT * 0.06 * u_drift + seed, -gT * 0.02 * u_drift));
    col += hazeCol * smoothstep(0.35, 0.8, sheet) * u_haze * 0.05 * (0.4 + lightY) * (1.0 - t * 0.6);

    // the shaft hangs in the middle depth; motes sit at three depths
    if (i == 4) {
      col += mix(c3, vec3(1.0), 0.4) * shaft(uv, slitX) * u_beam * 0.7;
    }
    if (i == 1 || i == 3 || i == 5) {
      float ms = motes(uv, mix(0.05, 0.11, t), fi, mix(0.002, 0.006, t));
      float inBeam = shaft(uv, slitX);
      col += mix(c2, vec3(1.0), 0.5) * ms * (0.06 + 0.9 * inBeam * u_beam) * mix(0.6, 1.0, t);
    }
  }

  // the near part of the shaft hangs in the air in front of the closest walls
  col += mix(c3, vec3(1.0), 0.5) * shaft(uv, slitX) * u_beam * 0.3;

  // the slit of sky overhead spills light over the topmost lips
  float sd = abs(uv.x - slitX - 0.01);
  float spill = exp(-sd * sd / 0.0009) * smoothstep(0.2, 0.5, uv.y);
  col += mix(c3, vec3(1.0), 0.5) * spill * 0.45 + mix(s0, c3, 0.5) * exp(-sd * 7.0) * smoothstep(0.1, 0.5, uv.y) * 0.08;

  gl_FragColor = vec4(col, 1.0);
}
