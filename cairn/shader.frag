// cairn (Plinth) - a moor of balanced stone cairns receding into luminous haze.
// Each cell of a jittered ground grid holds a cairn: a vertical stack of five
// flattened rounded stones of decreasing girth, each teetering a little off the
// one below so no two stacks read alike, with some cells left bare. Raymarched
// as true 3D solids over a flat ground plane (fixed-step march, constant bound)
// so nearer cairns genuinely occlude farther ones in perspective. Exponential
// distance fog climbs from a near-black base through palette colour 0 into a
// faint horizon band of colour 1; each stone takes a thin rim of colour 2 where
// its silhouette meets brighter fog behind it, and a sparse hash-chosen few wear
// a faint moss-vein of colour 3 near their crowns. The world holds still while
// the camera dollies forward along a gently sinuous lane threaded between the
// stacks - the eye travels, the stones do not. Rounded boulders set this apart
// from menhir's sharp prisms and the family's cut-stone geometry.
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
uniform float u_fogDensity;   // how fast distance dissolves the cairns  (default 1.0)
uniform float u_cairnSpacing; // world gap between cairns                (default 4.2)
uniform float u_rimGlow;      // strength of the bright silhouette rim   (default 0.9)

const vec3  BG      = vec3(0.035, 0.035, 0.043); // house near-black base
const float FL      = 1.25;  // focal length (vertical FOV ~44 deg)
const float CAM_H   = 1.55;  // eye height above the ground plane (a walker)
const float MAXDIST = 70.0;  // march reaches this far before giving up
const int   STEPS   = 115;   // fixed-step march iterations (constant bound)
const float STEPMUL = 0.80;  // fraction of SDF taken each step (safe march)

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// safe (underestimating) distance to a flattened ellipsoid stone centred at c
// with per-axis radii rad. The min-radius scaling keeps it a lower bound so the
// fixed-step march never overshoots the surface.
float sdStoneEll(vec3 p, vec3 c, vec3 rad) {
  vec3 q = (p - c) / rad;
  return (length(q) - 1.0) * min(rad.x, min(rad.y, rad.z));
}

// one cairn: a stack of five flattened rounded boulders, decreasing in girth and
// teetering on their own hashed offsets. Returns the union distance, the crown
// height (for the moss vein) and a stable seed.
float sdCairn(vec3 p, vec2 cc, float spacing, out float topY, out float seedOut) {
  float r0 = hash21(cc);
  float r1 = hash21(cc + vec2(2.7, 9.4));
  float r2 = hash21(cc + vec2(7.3, 3.1));
  float r3 = hash21(cc + vec2(5.1, 1.9));
  seedOut = r2;

  // jitter the footprint within its cell so the moor reads as scattered
  vec2 jit  = (vec2(r0, r1) - 0.5) * spacing * 0.42;
  vec3 base = vec3(cc.x + jit.x, 0.0, cc.y + jit.y);
  vec3 q    = p - base;

  float baseR = mix(0.40, 0.62, r3);        // bottom boulder half-girth
  float teeter = (0.30 + 0.55 * r1);        // how drunkenly the stack leans
  float d = 1e9;
  float y = 0.0;
  // five stones, unrolled (constant bound)
  for (int s = 0; s < 5; s++) {
    float fs = float(s);
    float k  = fs / 4.0;                     // 0 bottom .. 1 crown
    float rr = baseR * mix(1.0, 0.34, k);    // shrink toward the crown
    float hh = rr * 0.60;                     // flattened (ellipsoid) half-height
    // teeter offset grows a touch toward the top, hashed per stone + per cairn
    float off = baseR * 0.20 * teeter * (0.4 + k);
    float cx = sin(fs * 2.31 + r0 * 6.2831) * off;
    float cz = cos(fs * 1.73 + r2 * 6.2831) * off;
    y += hh;                                  // centre of this stone
    d = min(d, sdStoneEll(q, vec3(cx, y, cz), vec3(rr, hh, rr * 0.92)));
    y += hh * 0.84;                           // next stone overlaps slightly
  }
  topY = y;
  return d;
}

void main() {
  vec2 res = u_resolution;
  vec2 fc  = gl_FragCoord.xy;
  vec2 uv  = (fc - 0.5 * res) / max(res.y, 1.0);

  // Theme colours come from u_palette; headless poster contexts can leave the
  // vec3[] uniform all-zero, so fall back to the default midnight hues.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float spacing = max(u_cairnSpacing, 2.0);
  float fogK    = max(u_fogDensity, 0.0) * 0.030;
  float rimAmt  = max(u_rimGlow, 0.0);

  // --- camera: a slow forward dolly down a gently sinuous lane ---
  float dist  = max(u_dollySpeed, 0.0) * 2.2 * u_time;     // metres walked
  float laneX = sin(dist * 0.10) * spacing * 0.55;          // sinuous path in x
  vec3  ro    = vec3(laneX, CAM_H, dist);

  float dXdZ = cos(dist * 0.10) * 0.10 * spacing * 0.55;    // d(laneX)/d(dist)
  vec3  fw   = normalize(vec3(dXdZ, -0.06, 1.0));            // slight downward gaze
  vec3  ri   = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3  up   = normalize(cross(fw, ri));
  vec3  rd   = normalize(ri * uv.x + up * uv.y + fw * FL);
  if (abs(rd.y) < 1e-4) rd.y = (rd.y < 0.0) ? -1e-4 : 1e-4;

  // --- fixed-step SDF march over the scattered field + ground plane ---
  float t = 0.4;
  float tHit = -1.0;
  float hitTopY = 1.0;
  float hitSeed = 0.0;
  bool  hitGround = false;

  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;

    float dGround = p.y;                 // flat ground at y = 0
    vec2  baseCell = floor(p.xz / spacing);
    float dScene = dGround;
    bool  sceneIsGround = true;
    float bestTop = 1.0;
    float bestSeed = 0.0;

    for (int gx = -1; gx <= 1; gx++) {
      for (int gz = -1; gz <= 1; gz++) {
        vec2 cellId = baseCell + vec2(float(gx), float(gz));
        vec2 cw     = mod(cellId, 2048.0);     // wrap ids; field is endless
        vec2 cc     = (cellId + 0.5) * spacing;

        // ~40% of cells are bare moor
        float present = step(0.40, hash21(cw + vec2(13.0, 17.0)));
        // clear the lane: suppress cairns within half a lane of the path
        float pathX = sin(cc.y * 0.10) * spacing * 0.55;
        present *= step(spacing * 0.55, abs(cc.x - pathX));

        if (present > 0.5) {
          float topY, seed;
          float dS = sdCairn(p, cc, spacing, topY, seed);
          if (dS < dScene) {
            dScene = dS;
            sceneIsGround = false;
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
      hitTopY = bestTop;
      hitSeed = bestSeed;
      break;
    }
    t += d * STEPMUL;
    if (t > MAXDIST) break;
  }

  // ---- fog luminance profile by depth ----
  float horizon = smoothstep(-0.04, 0.16, rd.y);
  vec3  fogCol  = BG + c0 * 0.16 + c1 * (0.10 + 0.22 * horizon);

  vec3 col;

  if (tHit > 0.0 && !hitGround) {
    vec3 p = ro + rd * tHit;
    vec2 e = vec2(0.0025 * tHit + 0.004, 0.0);

    // recompute the nearest present cairn around p for the normal
    vec2 nbase = floor(p.xz / spacing);
    vec2 useCC = (nbase + 0.5) * spacing;
    float useTop = hitTopY;
    float bd = 1e9;
    for (int gx = -1; gx <= 1; gx++) {
      for (int gz = -1; gz <= 1; gz++) {
        vec2 cellId = nbase + vec2(float(gx), float(gz));
        vec2 cw     = mod(cellId, 2048.0);
        vec2 cc     = (cellId + 0.5) * spacing;
        float present = step(0.40, hash21(cw + vec2(13.0, 17.0)));
        float pathX = sin(cc.y * 0.10) * spacing * 0.55;
        present *= step(spacing * 0.55, abs(cc.x - pathX));
        if (present > 0.5) {
          float tp2, sd2;
          float dS = sdCairn(p, cc, spacing, tp2, sd2);
          if (dS < bd) { bd = dS; useCC = cc; useTop = tp2; }
        }
      }
    }

    float tp, sd;
    float nxp = sdCairn(p + vec3(e.x, 0.0, 0.0), useCC, spacing, tp, sd);
    float nxm = sdCairn(p - vec3(e.x, 0.0, 0.0), useCC, spacing, tp, sd);
    float nyp = sdCairn(p + vec3(0.0, e.x, 0.0), useCC, spacing, tp, sd);
    float nym = sdCairn(p - vec3(0.0, e.x, 0.0), useCC, spacing, tp, sd);
    float nzp = sdCairn(p + vec3(0.0, 0.0, e.x), useCC, spacing, tp, sd);
    float nzm = sdCairn(p - vec3(0.0, 0.0, e.x), useCC, spacing, tp, sd);
    vec3 nrm = normalize(vec3(nxp - nxm, nyp - nym, nzp - nzm) + 1e-6);

    float fd  = tHit * fogK;
    float fog = 1.0 - exp(-fd * fd);
    float fogLum = dot(fogCol, vec3(0.299, 0.587, 0.114)) * (0.5 + fog);

    float facing = max(dot(nrm, -rd), 0.0);
    float h01 = clamp(p.y / max(useTop, 0.001), 0.0, 1.0);
    // rounded boulders catch a touch more facing light than sharp prisms, and
    // the seam shadows between stacked stones read as horizontal dark bands
    float seam = 0.6 + 0.4 * sin(p.y * (6.2831 / max(useTop, 0.001)) * 5.0 - 0.5);
    vec3  body = BG * 0.7
               + c0 * 0.060 * facing * seam            // faint volume + seam shading
               + c0 * 0.05 * (1.0 - h01);              // mist pooling at the base

    float graze = 1.0 - facing;
    float fres  = pow(graze, 1.8) * 0.85 + pow(graze, 5.0) * 0.8;
    vec3  rim   = c2 * fres * fogLum * rimAmt * 2.6;
    body += rim;

    // sparse moss vein of colour 3 on a hash-chosen few crowns
    float veinOn = step(0.82, hitSeed);
    float crown  = smoothstep(0.58, 0.95, h01);
    float vein   = crown * (0.5 + 0.5 * sin(p.y * 7.0 + hitSeed * 31.0));
    body += c3 * veinOn * vein * 0.16 * (0.4 + 0.6 * fres);

    col = mix(body, fogCol, fog);
  } else if (tHit > 0.0 && hitGround) {
    float fd  = tHit * fogK;
    float fog = 1.0 - exp(-fd * fd);
    vec3  hp  = ro + rd * tHit;
    float br  = 0.5 + 0.5 * sin(dot(hp.xz, vec2(0.06, 0.08)));
    vec3  surf = BG * 0.65 + c0 * (0.03 + 0.03 * br);
    col = mix(surf, fogCol, min(fog * 1.15, 1.0));
  } else {
    float glowUp = smoothstep(-0.10, 0.35, rd.y);
    col = BG + c0 * 0.12 + c1 * (0.07 + 0.20 * glowUp);
    col += c1 * 0.10 * exp(-abs(rd.y) * 14.0);
  }

  col *= 1.0 - 0.32 * smoothstep(0.45, 1.10, length(uv));
  col += (hash21(fc * 0.7 + u_time) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
