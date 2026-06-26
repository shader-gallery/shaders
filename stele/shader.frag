// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// stele (Plinth) - a memorial field of rectangular slabs on a strict grid,
// seen from a high eye tilted steeply down. True raymarched solids: a 2D DDA
// walks the grid cell by cell and intersects each cells hashed box exactly,
// so nearer slabs genuinely occlude farther ones in perspective. Flat lit
// tops carry a faint sheet of sky light that blends palette colour 1 into
// colour 2 with distance; faces fall to near black; alley mist pools with
// colour 0; rare slabs bear an inscribed seam of colour 3. The camera glides
// diagonally across the field forever - the world itself never moves.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_glideSpeed;     // camera glide speed over the field       (default 0.35)
uniform float u_slabSpacing;    // grid pitch / lane width, world units    (default 2.6)
uniform float u_heightVariance; // spread of slab heights around the mean  (default 0.35)
uniform float u_seamGlow;       // brightness of rare inscribed top seams  (default 0.7)

const vec3  BG      = vec3(0.035, 0.035, 0.043); // house near-black base
const float FL      = 0.95;  // focal length (vertical FOV about 55 deg)
const float CAM_H   = 7.5;   // eye height above the ground plane
const float PITCH   = 0.84;  // downward tilt of the gaze, radians
const float YAW0    = 0.62;  // diagonal heading across the grid, radians
const float H0      = 1.7;   // common slab height
const float HEX     = 0.78;  // slab footprint half extent in x
const float HEZ     = 0.50;  // slab footprint half extent in z
const float MAXDIST = 26.0;  // fog swallows everything beyond this
const float FOG_D   = 0.060; // quadratic fog density
const int   STEPS   = 32;    // DDA cell visits (constant loop bound)

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 res = u_resolution;
  vec2 fc  = gl_FragCoord.xy;
  vec2 uv  = (fc - 0.5 * res) / max(res.y, 1.0);

  // Theme colours come from u_palette. Some headless poster contexts cannot
  // bind a vec3[] uniform, leaving it all-zero; fall back to the default
  // midnight hues so a poster never renders black.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- camera: constant diagonal glide, slow yaw sway, steep downward gaze ---
  float glide = max(u_glideSpeed, 0.0) * 4.0;
  float yaw   = YAW0 + 0.12 * sin(u_time * 0.05);
  vec2  tdir  = vec2(sin(YAW0), cos(YAW0));
  vec3  ro    = vec3(3.7, CAM_H, 1.3) + vec3(tdir.x, 0.0, tdir.y) * glide * u_time;

  float cp = cos(PITCH), sp = sin(PITCH);
  vec3 fw = vec3(sin(yaw) * cp, -sp, cos(yaw) * cp);
  vec3 ri = normalize(vec3(fw.z, 0.0, -fw.x));
  vec3 up = normalize(cross(fw, ri));
  vec3 rd = normalize(ri * uv.x + up * uv.y + fw * FL);

  // guard the ray so the DDA and the ground hit never divide by zero
  if (abs(rd.x) < 1e-5) rd.x = (rd.x < 0.0) ? -1e-5 : 1e-5;
  if (abs(rd.z) < 1e-5) rd.z = (rd.z < 0.0) ? -1e-5 : 1e-5;
  if (rd.y > -1e-4)     rd.y = -1e-4;
  vec3 ird = 1.0 / rd;

  float P    = max(u_slabSpacing, 1.8); // cell pitch (param, guarded)
  float vAmt = clamp(u_heightVariance, 0.0, 1.0);

  // --- DDA over grid cells; exact ray-box hit inside each visited cell ---
  vec2 cell   = floor(ro.xz / P);
  vec2 stp    = sign(rd.xz);
  vec2 tDelta = abs(vec2(P) * ird.xz);
  vec2 nextB  = (cell + max(stp, vec2(0.0))) * P;
  vec2 tMax   = (nextB - ro.xz) * ird.xz;

  float tHit = -1.0;
  vec3  nrm  = vec3(0.0);
  vec2  hitCC = vec2(0.0);
  float hitH = 1.0;
  float hitR1 = 0.0; // per-slab brightness hash
  float hitR2 = 0.0; // per-slab seam hash

  for (int i = 0; i < STEPS; i++) {
    vec2  ch = mod(cell, 1024.0); // wrap ids far beyond any sightline
    float r0 = hash21(ch);
    float h  = H0 * (1.0 + (r0 - 0.5) * 1.8 * vAmt);
    vec2  cc = (cell + 0.5) * P;
    vec3  bmin = vec3(cc.x - HEX, 0.0, cc.y - HEZ);
    vec3  bmax = vec3(cc.x + HEX, h,   cc.y + HEZ);
    vec3  ta = (bmin - ro) * ird;
    vec3  tb = (bmax - ro) * ird;
    vec3  tmn = min(ta, tb);
    vec3  tmx = max(ta, tb);
    float tn = max(max(tmn.x, tmn.y), tmn.z);
    float tf = min(min(tmx.x, tmx.y), tmx.z);
    if (tn < tf && tf > 0.0 && tn < MAXDIST) {
      tHit  = tn;
      hitCC = cc;
      hitH  = h;
      hitR1 = hash21(ch + vec2(2.7, 9.4));
      hitR2 = hash21(ch + vec2(7.3, 3.1));
      if (tmn.x > tmn.y && tmn.x > tmn.z)      nrm = vec3(-stp.x, 0.0, 0.0);
      else if (tmn.y > tmn.z)                  nrm = vec3(0.0, 1.0, 0.0);
      else                                     nrm = vec3(0.0, 0.0, -stp.y);
      break;
    }
    if (tMax.x < tMax.y) { cell.x += stp.x; tMax.x += tDelta.x; }
    else                 { cell.y += stp.y; tMax.y += tDelta.y; }
    if (min(tMax.x, tMax.y) > MAXDIST + P) break;
  }

  // luminous haze the far field dissolves into; brighter toward frame top
  // where the sheet of sky light hangs
  vec3 haze = (BG + c2 * 0.105 + c1 * 0.045) * (1.0 + 0.40 * smoothstep(0.0, 0.5, uv.y));

  vec3 col;
  if (tHit > 0.0) {
    vec3  hp  = ro + rd * tHit;
    float fd  = tHit * FOG_D;
    float fog = 1.0 - exp(-fd * fd);
    float skyMix = smoothstep(2.0, 16.0, tHit);  // colour 1 near, colour 2 far
    vec3  tint = mix(c1, c2, skyMix);
    float pix  = tHit * 1.8 / (res.y * FL);      // world size of one pixel here

    if (nrm.y > 0.5) {
      // ---- flat lit top ----
      vec2  lp = hp.xz - hitCC;
      vec2  e2 = vec2(HEX, HEZ) - abs(lp);
      float e  = min(e2.x, e2.y);                // distance to the top rim
      float bMul = 0.84 + 0.32 * hitR1;
      float hMul = 1.0 + 0.18 * clamp((hitH / H0 - 1.0) * 1.1, -1.0, 1.0);
      vec3  surf = BG + tint * (0.30 * bMul * hMul);
      // faint rim light where the mass meets the glow
      surf += tint * 0.10 * exp(-e / max(0.05 + pix, 1e-3));
      // rare inscribed seam of colour 3 across the top face; its light also
      // spills faintly over the whole chosen top
      float seamOn = step(0.80, hitR2);
      float oFlag  = step(0.5, fract(hitR2 * 37.0));
      float sc     = mix(lp.y, lp.x, oFlag);
      float core   = 1.0 - smoothstep(0.045, 0.057 + pix * 1.6, abs(sc));
      float halo   = exp(-abs(sc) / 0.22);
      float sg     = max(u_seamGlow, 0.0);
      surf += c3 * sg * seamOn * (core + halo * 0.32 + 0.10);
      vec3 faceCol = mix(surf, haze, fog);
      // antialias the silhouette into an estimate of the alley behind it
      vec3 gutCol = mix(BG * 0.6 + c0 * 0.10, haze, fog);
      float aa = smoothstep(0.0, pix * 1.5, e);
      col = mix(gutCol, faceCol, aa);
    } else {
      // ---- side face falling away into near black ----
      float yr = clamp(hp.y / max(hitH, 0.001), 0.0, 1.0);
      float fa = mix(0.7, 1.0, abs(nrm.z));
      vec3 surf = BG * 0.55
                + tint * 0.05 * yr * yr * yr * fa            // faint sky bleed
                + tint * 0.18 * exp(-(hitH - hp.y) / 0.12)   // lit crest line
                + c0 * 0.03 * (1.0 - yr);                    // mist at the base
      col = mix(surf, haze, fog);
    }
  } else {
    // ---- alley floor: pooled mist carrying colour 0, breathing slowly ----
    float tg = -ro.y * ird.y;
    vec3  hp = ro + rd * tg;
    float fd  = tg * FOG_D;
    float fog = 1.0 - exp(-fd * fd);
    float br  = 0.5 + 0.5 * sin(dot(hp.xz, vec2(0.07, 0.09)) - u_time * 0.22);
    vec3  surf = BG * 0.6 + c0 * (0.05 + 0.05 * br);
    col = mix(surf, haze, min(fog * 1.1, 1.0));
  }

  // gentle vignette and a whisper of dither against banding in the fog
  col *= 1.0 - 0.30 * smoothstep(0.45, 1.05, length(uv));
  col += (hash21(fc * 0.7) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
