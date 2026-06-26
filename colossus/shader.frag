// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// colossus (Plinth) — two colossal seated figures flank a narrow defile,
// abstracted to stacked primitives (plinth block, folded-leg wedge, torso slab,
// rounded head), mirrored across the path and repeated deeper into haze. A true
// raymarched 3D scene: nearer monuments occlude farther ones in real perspective.
// The camera cranes — a slow vertical excursion blended with a faint forward
// drift, rising from among the knees until faces emerge from the fog overhead,
// then settling on a long sinusoidal cycle with no endpoint snap. Altitude haze
// grades from a colour-0 floor to a dim colour-1 crown around the heads; a faint
// rim of colour 2 catches where mass meets the brighter fog; a colour-3 ember
// glows in the crevice where each figure meets its plinth.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four theme colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_craneSpeed;  // camera rise/settle speed along the figures (default 0.2)
uniform float u_craneRange;  // how far the excursion travels: knees..faces  (default 1.0)
uniform float u_fogDensity;  // altitude haze strength on bodies + deep pairs (default 1.0)
uniform float u_emberGlow;   // warmth of the offering-light at each base     (default 0.6)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PATH_HALF = 2.2;   // half-width of the defile between the figure pairs
const float ROW_GAP   = 9.0;   // spacing between successive figure pairs along +z
const int   MARCH     = 84;    // raymarch steps (constant bound)
const float TMAX      = 46.0;  // far clip distance

// --- SDF primitives -------------------------------------------------------
float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}
// rounded box
float sdRBox(vec3 p, vec3 b, float r) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) - r + min(max(d.x, max(d.y, d.z)), 0.0);
}
float sdSphere(vec3 p, float r) { return length(p) - r; }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// One seated colossus, modelled in its own local frame with the base at y=0,
// facing -x (toward the path centre). Built from stacked primitives.
float sdFigure(vec3 p) {
  // plinth block (the pedestal the figure sits on)
  float d = sdRBox(p - vec3(0.0, 0.9, 0.0), vec3(1.7, 0.9, 2.0), 0.12);
  // folded-leg wedge: knees jut toward the path (-x), shins low and forward
  vec3 lp = p - vec3(-0.7, 2.1, 0.0);
  float legs = sdRBox(lp, vec3(1.25, 0.85, 1.7), 0.25);
  d = smin(d, legs, 0.35);
  // torso slab: tall block rising from the hips, set back from the knees
  vec3 tp = p - vec3(0.55, 4.2, 0.0);
  float torso = sdRBox(tp, vec3(1.05, 1.7, 1.55), 0.3);
  d = smin(d, torso, 0.45);
  // shoulders: a wider, shallower slab capping the torso
  vec3 sp = p - vec3(0.4, 5.7, 0.0);
  float shoulders = sdRBox(sp, vec3(1.15, 0.5, 1.75), 0.28);
  d = smin(d, shoulders, 0.4);
  // rounded head sitting atop the shoulders
  vec3 hp = p - vec3(0.25, 6.85, 0.0);
  float head = sdSphere(hp, 0.85);
  d = smin(d, head, 0.3);
  return d;
}

// The whole monument field: a pair of mirrored figures per row, several rows
// receding along +z. Constant loop bound; figures are static (the eye moves).
float sdScene(vec3 p, out float baseY) {
  float d = 1e9;
  baseY = 0.0;
  // mirror across the path: right figure at +x, left figure at -x (rotated 180)
  for (int i = 0; i < 4; i++) {
    float z = float(i) * ROW_GAP;
    // right-hand figure (sits at +x, faces -x = toward path)
    vec3 pr = p - vec3(PATH_HALF + 1.7, 0.0, z);
    float fr = sdFigure(pr);
    // left-hand figure: mirror x so its knees also face the path
    vec3 pl = p - vec3(-(PATH_HALF + 1.7), 0.0, z);
    pl.x = -pl.x;
    float fl = sdFigure(pl);
    float row = min(fr, fl);
    if (row < d) { d = row; }
  }
  return d;
}

float map(vec3 p) { float b; return sdScene(p, b); }

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0025, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  res = u_resolution;
  vec2  uv  = (gl_FragCoord.xy - 0.5 * res) / max(res.y, 1.0);
  float t   = u_time;

  // palette + headless fallback (midnight)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // --- crane camera: long sinusoidal vertical excursion + faint forward drift.
  // Guard params so the min ends of ranges stay presentable.
  float cspeed = max(u_craneSpeed, 0.0);
  float crange = max(u_craneRange, 0.0);
  // breath in [0,1]: starts low among the knees, rises to the faces, settles.
  float breath = 0.5 - 0.5 * cos(t * cspeed);
  float camY   = 1.6 + breath * (4.6 * crange);          // climb among knees -> faces
  float camZ   = -6.5 + breath * (1.1 * crange);         // faint forward drift as it rises
  vec3  ro = vec3(0.0, camY, camZ);
  // look target: ahead and slightly up; as the camera climbs it levels toward
  // the faces overhead, so they emerge from fog at the top of the breath.
  vec3  ta = vec3(0.0, 1.8 + breath * 4.4 * crange, 3.5);

  // camera basis
  vec3 fwd = normalize(ta - ro);
  vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 upv = cross(rgt, fwd);
  vec3 rd  = normalize(uv.x * rgt + uv.y * upv + 1.45 * fwd);

  // --- raymarch with constant bounds ---
  float dist = 0.0;
  float hit  = -1.0;
  vec3  pHit = ro;
  for (int i = 0; i < MARCH; i++) {
    vec3 p = ro + rd * dist;
    float d = map(p);
    if (d < 0.0025 * dist + 0.002) { hit = dist; pHit = p; break; }
    dist += d * 0.85;
    if (dist > TMAX) break;
  }

  // --- altitude haze: grades from a colour-0 floor to a dim colour-1 crown.
  // Sample fog colour at a given world height.
  // We compute final colour by compositing solid (if any) over the fog.
  float fogD = max(u_fogDensity, 0.0);

  vec3 col = BG;

  // background fog colour as a function of look height for the missed ray
  float skyH = ro.y + rd.y * TMAX;           // approximate height the ray drifts to
  float skyT = clamp(skyH / 8.5, 0.0, 1.0);  // 0 at floor, 1 around head height
  vec3  fogFloor = mix(BG, c0 * 0.12, 0.7);  // dim colour-0 base at the path floor
  vec3  fogCrown = c1 * 0.16;                // dim colour-1 crown up among the heads
  vec3  skyCol   = mix(fogFloor, fogCrown, smoothstep(0.0, 1.0, skyT));

  if (hit > 0.0) {
    vec3 n = calcNormal(pHit);

    // recover which figure/base this point belongs to for the ember crevice.
    // ember sits in the seam where the legs/torso meet the plinth (~y in 1.6..2.4)
    float seam = exp(-pow((pHit.y - 1.95) * 1.35, 2.0));   // vertical band at the base seam
    // only near the figures (not on the far floor) — gate by |x| being near a plinth
    float nearPlinth = smoothstep(6.0, 3.4, abs(pHit.x));
    float ember = seam * nearPlinth;

    // monument body: very dark stone, faintly lit from above.
    float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    vec3  stone = mix(vec3(0.012,0.012,0.018), c0 * 0.045 + c1 * 0.025, up * 0.5);

    // faint rim of colour 2 where mass meets the higher, brighter fog: a thin
    // edge only (sharp fresnel), strongest on upward faces high up where the
    // bright fog backs them — should trace silhouettes, not flood the slabs.
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.5);
    float highUp = smoothstep(2.0, 7.0, pHit.y);            // stronger toward shoulders/jaw
    float rim = fres * (0.25 + 0.75 * highUp);
    vec3  rimCol = c2 * rim * 0.75;

    // ember glow in the crevice (colour 3), warm offering-light
    vec3 emberCol = c3 * ember * (0.55 * u_emberGlow);

    col = stone + rimCol + emberCol;

    // distance/altitude fog over the solid: fades the figure into haze with
    // height and with depth. Heavier with u_fogDensity.
    float hT = clamp(pHit.y / 8.5, 0.0, 1.0);
    vec3  fogCol = mix(fogFloor, fogCrown, smoothstep(0.0, 1.0, hT));
    float fogAmt = 1.0 - exp(-hit * (0.026 * fogD));        // depth fog
    float altAmt = smoothstep(3.5, 8.5, pHit.y) * (0.55 * fogD); // altitude swallow
    float swallow = clamp(fogAmt + altAmt, 0.0, 1.0);
    col = mix(col, fogCol, swallow);
  } else {
    col = skyCol;
  }

  // a soft glow band where the bright fog crown sits, so heads emerge from light
  // rather than from a hard edge (only visible where the ray points upward).
  float crownGlow = smoothstep(0.0, 1.0, skyT) * smoothstep(0.0, 0.4, rd.y);
  col += c1 * crownGlow * 0.06;

  // gentle floor ember spill into the lower haze (the offerings light the base mist)
  float lowMist = smoothstep(2.5, -1.0, ro.y + rd.y * 6.0);
  col += c3 * lowMist * 0.04 * u_emberGlow;

  // composed vignette keeps the frame edges dark and the defile luminous
  float vign = 1.0 - smoothstep(0.55, 1.35, length(uv));
  col *= mix(0.65, 1.0, vign);

  // subtle filmic-ish tonemap, tone toward dark (no brightness lift)
  col = max(col, 0.0);
  col = col / (col + 0.9);

  // dither to kill banding in the smooth fog gradients
  float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (dn - 0.5) * (1.5 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
