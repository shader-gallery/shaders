// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
// torii (Plinth) - a processional avenue of gates running dead away from the eye.
// One gate SDF (two round pillars, a long gently curved lintel, a lower tie-beam)
// is repeated down the view axis by domain repetition, each instance hash-leaned
// and hash-scaled a few percent off true so the avenue reads ancient rather than
// stamped. The structures are true raymarched 3D solids (fixed-step sphere march
// with a constant bound); nearer gates genuinely occlude farther ones in one-point
// perspective. The underside of every lintel catches a faint warm rim of colour 3
// like a long-extinguished lantern, a thin ankle-height mist of colour 2 hangs
// between the pillars, and the far field dissolves from the colour-0 base into
// colour 1 fog. The camera dollies forward at a constant ceremonial pace down the
// centerline - the world itself never moves; only the eye travels.
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
uniform float u_dollySpeed;   // camera advance speed down the avenue   (default 0.4)
uniform float u_gateSpacing;  // world distance between successive gates (default 4)
uniform float u_lanternGlow;  // warmth caught under lintel + ankle mist (default 0.8)
uniform float u_fogDensity;   // how many gates survive before the haze  (default 0.7)

const vec3  BG      = vec3(0.035, 0.035, 0.043); // house near-black base
const float FL      = 1.35;   // focal length (narrowish, processional)
const float CAM_H   = 0.28;   // eye height lifted a touch so the gaze looks DOWN the
                              // avenue rather than across a slab; recession reads as depth.
const float PILLAR_X = 1.55;  // half-distance between the two pillars
const float PILLAR_R = 0.34;  // pillar radius
const float GATE_TOP  = 2.05; // height of the lintel band
const float TIE_Y     = 0.55; // height of the lower tie-beam
const float MAXDIST = 90.0;   // clip distance
const int   STEPS   = 110;    // march steps (constant loop bound)

float hash11(float p) {
  return fract(sin(p * 127.1 + 3.7) * 43758.5453123);
}

// distance to a vertical round-capped pillar (capsule) at x = cx, spanning y in [0,h]
float sdPillar(vec3 p, float cx, float h, float r) {
  vec3 q = p - vec3(cx, clamp(p.y, 0.0, h), 0.0);
  return length(q) - r;
}

// distance to a horizontal round-capped bar along x, centered at height cy,
// spanning |x| <= hx, with radius r, bowed downward by sag at the ends
float sdBar(vec3 p, float cy, float hx, float r) {
  vec3 q = p;
  q.y -= cy;
  q.x -= clamp(q.x, -hx, hx);
  return length(q) - r;
}

// one gate sitting at local space (origin at gate center on the floor plane),
// already hash-perturbed for lean/scale by the caller
float sdGate(vec3 p, float lean, float sxz, float topY) {
  // apply a tiny lean: shear x by height
  p.x += lean * (p.y - 1.0);
  float px = PILLAR_X * sxz;
  float pr = PILLAR_R * sxz;
  // two pillars rising to just under the lintel
  float pa = sdPillar(p, -px, topY + 0.30, pr);
  float pb = sdPillar(p,  px, topY + 0.30, pr);
  float pil = min(pa, pb);
  // gently curved lintel: a bowed bar across the top, sagging at the middle.
  // model the bow by lowering cy as |x| shrinks (a shallow upward arch), giving
  // the classic torii kasagi sweep.
  float arch = 0.16 * sxz * (1.0 - clamp(abs(p.x) / max(px + 0.6, 0.001), 0.0, 1.0));
  float lintel = sdBar(p, topY + arch, px + 0.62 * sxz, pr * 1.05);
  // a slim second beam just under the lintel (shimaki) for layered silhouette
  float beam2 = sdBar(p, topY - 0.42 * sxz, px + 0.20 * sxz, pr * 0.72);
  // lower tie-beam (nuki) between the pillars
  float tie = sdBar(p, TIE_Y * sxz + 0.15, px + 0.05, pr * 0.80);
  return min(min(pil, lintel), min(beam2, tie));
}

// scene SDF: gates repeated along z by domain repetition. zRep is the period.
// Returns distance; writes the per-instance hash-derived params via globals.
float gLean, gScale, gTopY, gCellId;

float mapScene(vec3 p, float zRep) {
  // which gate cell are we in? round to nearest so we sit centered on a gate.
  float id   = floor(p.z / zRep + 0.5);
  float lz   = p.z - id * zRep;       // local z within the cell, centered
  float wid  = mod(id, 4096.0);       // wrap ids so hashes stay stable far out
  float lean  = (hash11(wid) - 0.5) * 0.14;        // few-percent off-true lean
  float scl   = 1.0 + (hash11(wid + 11.0) - 0.5) * 0.16; // hash scale
  float topY  = GATE_TOP * scl + (hash11(wid + 23.0) - 0.5) * 0.18;
  gLean = lean; gScale = scl; gTopY = topY; gCellId = wid;
  vec3 lp = vec3(p.x, p.y, lz);
  return sdGate(lp, lean, scl, topY);
}

void main() {
  vec2 res = u_resolution;
  vec2 fc  = gl_FragCoord.xy;
  vec2 uv  = (fc - 0.5 * res) / max(res.y, 1.0);

  // Theme colours come from u_palette. Some headless poster contexts cannot
  // bind a vec3[] uniform, leaving it all-zero; fall back to midnight hues.
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float zRep  = max(u_gateSpacing, 1.5);
  float speed = max(u_dollySpeed, 0.0);
  float lan   = max(u_lanternGlow, 0.0);
  float fogK  = max(u_fogDensity, 0.05);

  // --- camera: dead-straight dolly down the centerline (+z), eye near gate band.
  // The avenue is seamless because the dolly only ever advances; gate hashes shift
  // one cell at a time as we cross each period, so nothing pops or resets.
  vec3 ro = vec3(0.0, 1.0 + CAM_H, speed * 4.0 * u_time);
  // tiny ceremonial sway so the procession breathes (not the world)
  ro.x += 0.05 * sin(u_time * 0.18);
  ro.y += 0.04 * sin(u_time * 0.23 + 1.3);

  // gaze tilts gently down the avenue: with the lifted eye this drops the horizon
  // toward mid-frame and opens the floor's recession, so we look INTO the corridor
  // and the nested gates stack toward a vanishing point near screen center.
  vec3 fw = normalize(vec3(0.0, -0.085, 1.0));
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = normalize(cross(fw, ri));
  vec3 rd = normalize(ri * uv.x + up * uv.y + fw * FL);

  // --- fixed-step sphere march with a constant bound; nearer gates occlude far ---
  float t = 0.30;
  float d = 1e9;
  float hit = -1.0;
  float hLean = 0.0, hScale = 1.0, hTopY = GATE_TOP, hLz = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    d = mapScene(p, zRep);
    if (d < 0.0015 * t + 0.0009) {
      hit = t;
      hLean = gLean; hScale = gScale; hTopY = gTopY;
      hLz   = p.z - floor(p.z / zRep + 0.5) * zRep;
      break;
    }
    t += d;
    if (t > MAXDIST) break;
  }

  // far haze: deepens from the colour-0 base into colour 1, brighter toward
  // the vanishing point at frame center where the avenue dissolves. Kept dim so
  // the monuments stay near-black mass and the glow reads as accent, not wash.
  float vp   = exp(-dot(uv, uv) * 7.0);          // tight glow at the vanishing point
  vec3  haze = BG + c0 * 0.045 + c1 * (0.02 + 0.16 * vp);

  // ground plane at y = 0 (the avenue floor the gates stand on). Take whichever
  // is nearer: the marched mass or the floor, so gate bases sit on the ground.
  float tFloor = (rd.y < -1e-4) ? (-ro.y / rd.y) : 1e9;
  bool floorWins = (tFloor < MAXDIST) && (hit < 0.0 || tFloor < hit);

  vec3 col;
  if (floorWins) {
    // ---- avenue floor: dim stone path that genuinely recedes toward the eye's
    // vanishing point, with a breathing ankle mist of colour 2 ----
    vec3  fp  = ro + rd * tFloor;
    float fd  = tFloor * 0.075 * fogK;
    float fog = 1.0 - exp(-fd * fd);
    // depth term: 0 right under the eye, ->1 out at the vanishing point.
    float fdepth = clamp(tFloor / 28.0, 0.0, 1.0);
    // TRUE perspective centerline seam: a bright path-runner that is wide nearby
    // and narrows as it recedes, so it visibly converges to the vanishing point
    // instead of reading as a constant-width stripe across a slab.
    float seamW  = mix(2.2, 0.45, fdepth);
    float center = exp(-pow(fp.x / seamW, 2.0));
    // worn paving lifts smoothly with depth so the near floor isn't a flat dark
    // slab and there's no hard tonal step; the seam is the brightest floor note.
    float fcurve = sqrt(fdepth); // ease the brightening so the near edge isn't abrupt
    vec3  paving = BG * (0.7 + 0.5 * fcurve) + c1 * (0.05 + 0.13 * fcurve) * center;
    // faint perspective cross-ribs (paving courses) marching to the vanishing
    // point reinforce the recession without fighting the gates above.
    float ribs   = 0.5 + 0.5 * sin(fp.z * 0.7 - u_time * speed * 1.2);
    paving += c1 * 0.035 * pow(ribs, 3.0) * (1.0 - 0.6 * fdepth);
    // ankle mist hugging the centerline between the pillar lines, breathing slowly
    float band    = exp(-pow(fp.x / 1.35, 2.0));
    float breathe = 0.5 + 0.5 * sin(u_time * 0.4 - fp.z * 0.12);
    paving += c2 * lan * 0.11 * band * (0.5 + 0.5 * breathe);
    // the floor recedes into its OWN dim haze (no vanishing-point bloom, which
    // belongs above the horizon) so the near pavement stays dark, not washed.
    vec3 floorHaze = BG + c0 * 0.05 + c1 * 0.03;
    col = mix(paving, floorHaze, fog);
  } else if (hit > 0.0) {
    vec3 p = ro + rd * hit;
    // surface normal via small SDF gradient (constant offsets)
    vec2 e = vec2(0.0025, 0.0);
    float dx = mapScene(p + e.xyy, zRep) - mapScene(p - e.xyy, zRep);
    float dy = mapScene(p + e.yxy, zRep) - mapScene(p - e.yxy, zRep);
    float dz = mapScene(p + e.yyx, zRep) - mapScene(p - e.yyx, zRep);
    vec3  nrm = normalize(vec3(dx, dy, dz) + 1e-6);

    // distance fog: tuned by how many gate-periods survive. Higher fogDensity =>
    // fewer gates visible (the avenue dissolves sooner).
    float fd  = hit * 0.075 * fogK;
    float fog = 1.0 - exp(-fd * fd);

    // base stone: cool tint blending colour1 (near) -> colour2 with depth, but
    // kept dim so the structures stay ancient and mute. Mass is near-black.
    float depth = smoothstep(2.0, 40.0, hit);
    vec3  stone = mix(c1, c2, depth);

    // key light from up the avenue / overhead, so tops & near faces catch a sheen.
    // Mass stays mostly near-black; only grazed surfaces lift toward the stone hue.
    float key = clamp(dot(nrm, normalize(vec3(0.2, 0.55, -0.8))), 0.0, 1.0);
    float amb = 0.10 + 0.16 * (nrm.y * 0.5 + 0.5);
    vec3  surf = BG * 0.55 + stone * (0.05 + 0.26 * key) * (amb + 0.35);

    // faint warm rim of colour 3 where mass meets glow: undersides of the lintel
    // (downward-facing normals above tie height) glow as if lit by old lanterns.
    float underside = clamp(-nrm.y, 0.0, 1.0);
    float aboveTie  = smoothstep(TIE_Y + 0.4, hTopY - 0.2, p.y);
    float lintelRim = underside * aboveTie;
    surf += c3 * lan * (0.45 * lintelRim + 0.18 * pow(lintelRim, 0.5));

    // edge rim: silhouette grazing where view is tangent to the surface
    float fres = pow(1.0 - clamp(dot(nrm, -rd), 0.0, 1.0), 2.5);
    surf += stone * fres * 0.22;

    // thin ankle-height mist of colour 2 hanging between the pillars, low down
    float ankle = exp(-pow((p.y - 0.45) / 0.42, 2.0));
    float betweenPillars = 1.0 - smoothstep(PILLAR_X * 0.9, PILLAR_X * 1.6, abs(p.x));
    surf += c2 * lan * 0.16 * ankle * betweenPillars;

    col = mix(surf, haze, fog);
  } else {
    // upward ray clearing every gate: open haze above the avenue, dimming with
    // height so the top of frame settles into the near-black base.
    float sky = smoothstep(0.6, -0.1, uv.y);
    col = haze * (0.55 + 0.45 * sky);
  }

  // gentle vignette and a whisper of dither against banding in the fog. The
  // falloff starts later and rolls off softly to the corners so the lower edge
  // fades smoothly into the dark surround instead of clipping to a hard band.
  col *= 1.0 - 0.26 * smoothstep(0.55, 1.35, length(uv));
  col += (hash11(dot(fc, vec2(0.13, 0.71))) - 0.5) * 0.006;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
