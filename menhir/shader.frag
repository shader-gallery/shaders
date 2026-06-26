// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// menhir (Plinth) - a plain of scattered standing stones receding into luminous
// haze. Tapered, slightly leaning prism SDFs, one per cell of a jittered ground
// grid: a per-cell hash sets each stone's height, lean, girth, and leaves some
// cells empty. Raymarched as true 3D solids with a constant-bound fixed-step
// march over a flat ground plane, so nearer menhirs genuinely occlude farther
// ones in perspective. Exponential distance fog climbs from a near-black base
// through palette colour 0 into a faint horizon band of colour 1; each stone
// takes a thin rim of colour 2 where its silhouette meets brighter fog behind
// it, and a sparse hash-chosen few carry a faint vein of colour 3 near their
// crowns. The world holds perfectly still while the camera dollies forward
// along a gently sinuous lane threaded between the stones - the eye travels,
// the monuments do not. Cells within half a lane of the path are suppressed so
// the way ahead is always clear.
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
uniform float u_dollySpeed;   // forward walking speed along the lane   (default 0.3)
uniform float u_fogDensity;   // how fast distance dissolves stones      (default 1.0)
uniform float u_stoneSpacing; // world gap between stones                (default 4.0)
uniform float u_rimGlow;      // strength of the bright silhouette rim   (default 0.9)

const vec3  BG      = vec3(0.035, 0.035, 0.043); // house near-black base
const float FL      = 1.25;  // focal length (vertical FOV ~44 deg)
const float CAM_H   = 1.55;  // eye height above the ground plane (a walker)
const float MAXDIST = 70.0;  // march reaches this far before giving up
const int   STEPS   = 110;   // fixed-step march iterations (constant bound)
const float STEPMUL = 0.85;  // fraction of SDF taken each step (safe march)

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// signed distance to an axis box of half-extents b
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// per-cell stone params packed: returns true mass via the scene distance.
// p is world position; we evaluate one tapered, leaning prism for the given
// cell centre. The prism tapers toward its crown and leans by a hashed amount.
float sdStone(vec3 p, vec2 cc, float spacing, out float topY, out float seedOut) {
  float r0 = hash21(cc);
  float r1 = hash21(cc + vec2(2.7, 9.4));
  float r2 = hash21(cc + vec2(7.3, 3.1));
  float r3 = hash21(cc + vec2(5.1, 1.9));
  seedOut = r2;

  // jitter the footprint within its cell so the field reads as scattered,
  // never gridded (kept inside the cell so neighbours don't interpenetrate)
  vec2 jit = (vec2(r0, r1) - 0.5) * spacing * 0.42;
  vec3 base = vec3(cc.x + jit.x, 0.0, cc.y + jit.y);

  float height = mix(1.6, 4.6, r1);              // stone height
  float girth  = mix(0.22, 0.46, r3) * mix(0.8, 1.25, r0); // half width
  topY = height;

  // local frame: shift to base, lean the upper part slightly
  vec3 q = p - base;
  float lean = (r2 - 0.5) * 0.30;                 // small lean amount
  vec2 leanDir = normalize(vec2(r0 - 0.5, r3 - 0.5) + 1e-4);
  float h01 = clamp(q.y / max(height, 0.001), 0.0, 1.0);
  q.xz -= leanDir * lean * q.y;                   // shear with height -> lean

  // taper: narrower toward the crown
  float taper = mix(1.0, 0.55, h01);
  vec3 b = vec3(girth * taper, height * 0.5, girth * 0.78 * taper);
  vec3 c = vec3(0.0, height * 0.5, 0.0);
  return sdBox(q - c, b);
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

  float spacing = max(u_stoneSpacing, 2.0);
  float fogK    = max(u_fogDensity, 0.0) * 0.030;
  float rimAmt  = max(u_rimGlow, 0.0);

  // --- camera: a slow forward dolly down a gently sinuous lane ---
  // the world is fixed; only the eye advances along +z, swaying in x
  float dist = max(u_dollySpeed, 0.0) * 2.2 * u_time;     // metres walked
  float laneX = sin(dist * 0.10) * spacing * 0.55;        // sinuous path in x
  vec3  ro = vec3(laneX, CAM_H, dist);

  // heading follows the tangent of the lane so we always look down it
  float dXdZ = cos(dist * 0.10) * 0.10 * spacing * 0.55;  // d(laneX)/d(dist)
  vec3  fw   = normalize(vec3(dXdZ, -0.06, 1.0));          // slight downward gaze
  vec3  ri   = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3  up   = normalize(cross(fw, ri));
  vec3  rd   = normalize(ri * uv.x + up * uv.y + fw * FL);

  if (abs(rd.y) < 1e-4) rd.y = (rd.y < 0.0) ? -1e-4 : 1e-4;

  // lane centre in world x at a given world z (so we can clear the path)
  // path: laneX(z) = sin(z*0.10) * spacing*0.55

  // --- fixed-step SDF march over the scattered field + ground plane ---
  float t = 0.4;
  float tHit = -1.0;
  vec2  hitCC = vec2(0.0);
  float hitTopY = 1.0;
  float hitSeed = 0.0;
  bool  hitGround = false;

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;

    // nearest scene distance: ground plane + the 3x3 cells around p.xz
    float dGround = p.y;                 // flat ground at y = 0

    vec2 baseCell = floor(p.xz / spacing);
    float dScene = dGround;
    bool  sceneIsGround = true;
    vec2  bestCC = vec2(0.0);
    float bestTop = 1.0;
    float bestSeed = 0.0;

    // evaluate the 9 neighbouring cells (constant unrolled bound)
    for (int gx = -1; gx <= 1; gx++) {
      for (int gz = -1; gz <= 1; gz++) {
        vec2 cellId = baseCell + vec2(float(gx), float(gz));
        vec2 cw     = mod(cellId, 2048.0);      // wrap ids; field is endless
        vec2 cc     = (cellId + 0.5) * spacing;

        // emptiness: ~38% of cells carry no stone
        float present = step(0.38, hash21(cw + vec2(13.0, 17.0)));
        // clear the lane: suppress stones within half a lane of the path
        float pathX = sin(cc.y * 0.10) * spacing * 0.55;
        float clear = step(spacing * 0.55, abs(cc.x - pathX));
        present *= clear;

        if (present > 0.5) {
          float topY, seed;
          float dS = sdStone(p, cc, spacing, topY, seed);
          if (dS < dScene) {
            dScene = dS;
            sceneIsGround = false;
            bestCC = cw;
            bestTop = topY;
            bestSeed = seed;
          }
        }
      }
    }

    float d = dScene;
    if (d < 0.0015 * t + 0.0008) {
      tHit = t;
      hitGround = sceneIsGround;
      hitCC = bestCC;
      hitTopY = bestTop;
      hitSeed = bestSeed;
      break;
    }
    t += d * STEPMUL;
    if (t > MAXDIST) break;
  }

  // ---- fog luminance profile by depth: near-black base -> colour 0 ->
  //      faint horizon band of colour 1 (also rises toward the frame top) ----
  // a helper inline below uses tHit; define the haze colour for a depth.
  float horizon = smoothstep(-0.04, 0.16, rd.y);   // band near eye level / up
  vec3  fogCol  = BG + c0 * 0.16 + c1 * (0.10 + 0.22 * horizon);

  vec3 col;

  if (tHit > 0.0 && !hitGround) {
    // surface normal by central differences on the chosen stone's SDF
    vec3 p = ro + rd * tHit;
    vec2 e = vec2(0.0025 * tHit + 0.004, 0.0);
    float tp; float sd;
    vec2 ccWorld = (floor(p.xz / spacing) + 0.5) * spacing; // not used directly
    // re-evaluate the specific hit cell from its wrapped id is lossy, so
    // recompute the nearest stone normal over the 3x3 again at p +/- eps.
    // (cheap: reuse sdStone for the nearest neighbour by scanning once more)
    // Find nearest cell centre to p in world space:
    vec2 nbase = floor(p.xz / spacing);

    // small macro-free normal: sample scene-stone distance via nearest cell
    // We approximate using the hit cell centre reconstructed from p directly.
    // Determine the actual nearest present stone centre around p:
    float bd = 1e9; vec2 useCC = (nbase + 0.5) * spacing; float useTop = hitTopY;
    for (int gx = -1; gx <= 1; gx++) {
      for (int gz = -1; gz <= 1; gz++) {
        vec2 cellId = nbase + vec2(float(gx), float(gz));
        vec2 cw     = mod(cellId, 2048.0);
        vec2 cc     = (cellId + 0.5) * spacing;
        float present = step(0.38, hash21(cw + vec2(13.0, 17.0)));
        float pathX = sin(cc.y * 0.10) * spacing * 0.55;
        present *= step(spacing * 0.55, abs(cc.x - pathX));
        if (present > 0.5) {
          float tp2, sd2;
          float dS = sdStone(p, cc, spacing, tp2, sd2);
          if (dS < bd) { bd = dS; useCC = cc; useTop = tp2; }
        }
      }
    }

    float dx1, dx2, sdt;
    float nxp = sdStone(p + vec3(e.x, 0.0, 0.0), useCC, spacing, sdt, dx1);
    float nxm = sdStone(p - vec3(e.x, 0.0, 0.0), useCC, spacing, sdt, dx1);
    float nyp = sdStone(p + vec3(0.0, e.x, 0.0), useCC, spacing, sdt, dx1);
    float nym = sdStone(p - vec3(0.0, e.x, 0.0), useCC, spacing, sdt, dx1);
    float nzp = sdStone(p + vec3(0.0, 0.0, e.x), useCC, spacing, sdt, dx1);
    float nzm = sdStone(p - vec3(0.0, 0.0, e.x), useCC, spacing, sdt, dx1);
    vec3 nrm = normalize(vec3(nxp - nxm, nyp - nym, nzp - nzm) + 1e-6);

    // distance fog: near stones stay near-silhouette, far ones dissolve
    float fd  = tHit * fogK;
    float fog = 1.0 - exp(-fd * fd);
    // luminance of the fog behind this depth (what the rim catches)
    float fogLum = dot(fogCol, vec3(0.299, 0.587, 0.114)) * (0.5 + fog);

    // the stone body: near pure silhouette, only a whisper of facing light
    float facing = max(dot(nrm, -rd), 0.0);
    float h01 = clamp(p.y / max(useTop, 0.001), 0.0, 1.0);
    vec3  body = BG * 0.7
               + c0 * 0.045 * facing                  // faint volume read
               + c0 * 0.05 * (1.0 - h01);             // mist pooling at base

    // fresnel-style rim where the edge meets brighter fog behind it,
    // weighted by the fog luminance at this depth. A tight grazing-angle term
    // lights the silhouette outline; the broader term gives it body.
    float graze = 1.0 - facing;
    float fres  = pow(graze, 1.8) * 0.85 + pow(graze, 5.0) * 0.8;
    vec3  rim   = c2 * fres * fogLum * rimAmt * 2.6;
    body += rim;

    // sparse crown vein of colour 3 on a hash-chosen few stones
    float veinOn = step(0.82, hitSeed);
    float crown  = smoothstep(0.62, 0.96, h01);       // upper part of the stone
    float vein   = crown * (0.5 + 0.5 * sin(p.y * 7.0 + hitSeed * 31.0));
    body += c3 * veinOn * vein * 0.16 * (0.4 + 0.6 * fres);

    col = mix(body, fogCol, fog);
  } else if (tHit > 0.0 && hitGround) {
    // ---- ground plane: dark, mist carrying colour 0, lost quickly to fog ----
    float fd  = tHit * fogK;
    float fog = 1.0 - exp(-fd * fd);
    vec3  hp  = ro + rd * tHit;
    float br  = 0.5 + 0.5 * sin(dot(hp.xz, vec2(0.06, 0.08)));
    vec3  surf = BG * 0.65 + c0 * (0.03 + 0.03 * br);
    col = mix(surf, fogCol, min(fog * 1.15, 1.0));
  } else {
    // ---- sky / deep haze: the luminous band the field dissolves into ----
    float glowUp = smoothstep(-0.10, 0.35, rd.y);
    col = BG + c0 * 0.12 + c1 * (0.07 + 0.20 * glowUp);
    // a soft horizon line glow where the fog is densest
    col += c1 * 0.10 * exp(-abs(rd.y) * 14.0);
  }

  // gentle vignette and a whisper of dither against banding in the fog
  col *= 1.0 - 0.32 * smoothstep(0.45, 1.10, length(uv));
  col += (hash21(fc * 0.7 + u_time) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
