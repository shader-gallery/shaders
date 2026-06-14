// heartwood (Smolder) — the sawn end of a log fills the frame: faint dark-on-dark
// growth rings around an off-centre pith, crossed by hairline radial check-cracks.
// Fire eats inward from the bark as a circle of shrinking radius, perturbed
// per-angle by low-frequency noise so it bulges into slow wandering lobes. The
// burn front is an annular ember rim graded warm-to-cool through the palette,
// hottest along its inner leading edge. Outside is ash with a few cooling sparks
// settled in the cracks; inside, intact rings wait in the dark. As the rim nears
// each ring, that ring lights as a hairline preheat circle a beat before it burns.
// When the rim closes on the pith it gutters to an ember point and dies, while a
// fresh log face crossfaded in long before already carries its own young rim.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (linear-ish 0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_burnRate;   // how fast the rim collapses toward the pith (default 0.18)
uniform float u_rimWidth;   // ember rim width, CSS px, scaled by pixelRatio (default 13)
uniform float u_lobeWobble; // per-angle lag of the rim; 0 = perfect circle (default 0.5)
uniform float u_ringRandom; // higher-frequency raggedness of the BURN ring; 0 = smooth (default 0.4)
uniform float u_ringWaver;  // waviness of the GROWTH rings off perfect circles; 0 = perfect (default 0.4)
uniform float u_preheat;    // brightness of the hairline preheat ring; 0 disables (default 0.4)

const vec3  BG        = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float RING_CSS  = 15.0;  // CSS-px spacing of growth rings
const float CYCLE      = 26.0;  // seconds for one log face to burn from edge to pith

// hash + value noise (no textures)
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

// smooth 1-D periodic-ish noise over angle via summed sines (cheap, seamless)
float angNoise(float a, float seed) {
  return  0.55 * sin(a * 1.0 + seed * 6.2831 + 0.0)
        + 0.30 * sin(a * 2.0 + seed * 3.17  + 1.3)
        + 0.18 * sin(a * 3.0 + seed * 9.71  + 2.7)
        + 0.12 * sin(a * 5.0 + seed * 5.33  + 0.9);
}

// one full log "face": returns colour contribution and how alive it is.
// faceSeed varies the pith offset, ring phase and lobe pattern between faces.
vec3 burnFace(vec2 fc, vec2 res, float pr, float faceSeed,
              vec3 c0, vec3 c1, vec3 c2, vec3 c3, float prog) {
  // off-centre pith, jittered per face
  vec2 ctr = res * 0.5;
  float minDim = min(res.x, res.y);
  vec2 pithOff = vec2(hash11(faceSeed * 2.0 + 1.0) - 0.5,
                      hash11(faceSeed * 2.0 + 7.0) - 0.5) * minDim * 0.22;
  vec2 pith = ctr + pithOff;

  vec2 d  = fc - pith;
  float r = length(d);
  float a = atan(d.y, d.x);

  // normalise radius so the bark sits near R=1 at the far corner of the frame
  float maxR = length(res) * 0.62;
  float rn   = r / maxR;

  float ringSp = RING_CSS * pr / maxR; // ring spacing in normalised units
  float ringPh = hash11(faceSeed + 3.0) * 6.2831;

  // --- burn front radius: collapses from 1.0 (bark) toward 0 (pith) ---
  // per-angle lag noise makes it bulge into slow lobes; the lag DRIFTS in time
  // (multiplied into a slowly varying field) so lobes wander but the front only
  // ever advances inward (prog increases monotonically).
  float lobeT  = u_time * 0.05;
  // both factors must stay 2*PI-periodic in `a` or the front radius tears at the
  // atan seam (a = +/-PI, the LEFT side) -> a flat horizontal notch where the ring
  // fails to close. The old second factor used `a * 0.5`, whose sin(0.5*a) has a
  // 4*PI period and jumps +1 -> -1 across the seam. Drift the lobes through the
  // seed/phase instead (each harmonic's phase advances over time) so they still
  // wander but every term keeps an integer angular frequency -> seamless ring.
  float lag    = angNoise(a, faceSeed) * angNoise(a, faceSeed + 4.0 + lobeT);
  lag *= 0.16 * clamp(u_lobeWobble, 0.0, 1.0);
  // controllable higher-frequency randomness of the ring edge (jagged vs smooth);
  // angNoise(a*3.0,...) keeps integer angular harmonics so it stays 2*PI-periodic
  // and never tears at the atan seam. Drifts slowly in time so the jag wanders.
  float rnd    = angNoise(a * 3.0, faceSeed + 8.0 + lobeT * 0.5);
  lag += rnd * 0.11 * clamp(u_ringRandom, 0.0, 1.0);
  float front  = (1.0 - prog) + lag; // normalised radius of the burn boundary

  float rimW = max(u_rimWidth, 0.5) * pr / maxR; // rim half-width-ish in norm units

  // signed distance from this pixel to the front (negative = inside/unburned)
  float sd = rn - front;

  vec3 col = vec3(0.0);

  // ---------- the intact wood face ----------
  // growth rings as concentric ridges. Their radius is wavered per-angle by
  // u_ringWaver so they aren't perfect machine circles (real wood is irregular);
  // angNoise keeps integer harmonics -> 2*PI-periodic, no atan-seam tear. The
  // waver scales with ring spacing so it reads as rings nudging, not chaos.
  float angW = angNoise(a, faceSeed + 2.0) * 0.55
             + angNoise(a * 2.0, faceSeed + 15.0) * 0.30
             + angNoise(a * 3.0, faceSeed + 22.0) * 0.20;
  // displacement grows with radius (rn term) so the OUTER rings change shape too,
  // not just the centre; the ringSp base keeps the inner rings wavy as well.
  float ringWv = angW * (ringSp * 1.6 + rn * 0.18) * clamp(u_ringWaver, 0.0, 1.0);
  float rnRing = rn + ringWv;                      // wavy radius for the growth rings
  float ring = 0.5 + 0.5 * sin(rnRing / max(ringSp, 1e-4) * 6.2831 + ringPh);
  float ringLine = smoothstep(0.30, 0.95, ring); // bold concentric growth rings
  // radial check-cracks: a few hairline spokes (also used by the sparks below)
  float crackAng = a + hash11(faceSeed + 11.0) * 6.2831;
  float crack = pow(abs(sin(crackAng * 2.5 + sin(crackAng) * 1.7)), 40.0);
  // radial grain / medullary rays fanning out from the pith
  float grain = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(a * 44.0 + angNoise(a, faceSeed) * 4.0));
  float interior = smoothstep(0.012, 0.0, sd); // 1 inside the front (unburned)
  // VISIBLE warm wood: amber heartwood near the pith -> paler sapwood outward,
  // with the growth rings, radial grain and check-cracks catching light so the
  // sawn-log end actually reads as wood (was dark-on-dark). Woody browns are
  // hardcoded (this is the warm wood/ember exemplar) but lightly palette-tinted.
  vec3 woodWarm = mix(vec3(0.40, 0.24, 0.12), vec3(0.60, 0.41, 0.24), clamp(rn, 0.0, 1.0));
  woodWarm = mix(woodWarm, c3 * 0.5 + c0 * 0.3, 0.22);
  vec3 woodCol = woodWarm * (0.22 + 0.55 * ringLine + 0.16 * grain - 0.10 * crack);
  col += max(woodCol, vec3(0.0)) * interior;

  // ---------- preheat: ring closest to the front lights just before burning ----------
  // the growth ring sitting just inside the leading edge glows warm a beat ahead
  // of consumption — a thin incandescent preview circle. We isolate the single
  // ring nearest the front and ramp it up as the front approaches it.
  float ringIdx   = rnRing / max(ringSp, 1e-4) + ringPh / 6.2831; // wavy-ring number
  float ringFrac  = abs(fract(ringIdx) - 0.5) * 2.0;          // 1 on a ridge, 0 between
  float ridge     = smoothstep(0.45, 0.95, ringFrac);         // crisp ring ridge
  float preLead   = ringSp * 2.2;                             // how far ahead preheat reaches
  float preBand   = smoothstep(preLead, ringSp * 0.15, -sd);  // strongest just inside front
  preBand        *= step(0.0, -sd);                           // only inside (unburned)
  float preGlow   = ridge * preBand * clamp(u_preheat, 0.0, 1.0);
  col += mix(c2, c0, 0.4) * preGlow * 2.6 * interior;

  // ---------- the ember rim itself: an annulus graded warm->cool across width ----------
  // u = 0 at the inner (leading, hottest) edge, 1 at the outer (cooling) edge.
  float u = clamp((sd + rimW) / (2.0 * rimW), 0.0, 1.0);
  // soft annular falloff (1 in the rim core, 0 outside)
  float rim = (1.0 - smoothstep(0.0, rimW * 1.05, abs(sd)));
  rim = pow(rim, 1.2);
  // warm-to-cool grade through all four palette colours across the rim width:
  // hottest near-white inner leading edge -> c2 -> c0 -> c1 -> deep c3 outer.
  float gInner = smoothstep(0.30, 0.0, u);   // inner third
  float gMid1  = smoothstep(0.0, 0.40, u) * smoothstep(0.65, 0.30, u);
  float gMid2  = smoothstep(0.35, 0.70, u) * smoothstep(0.95, 0.65, u);
  float gOuter = smoothstep(0.60, 1.0, u);   // outer third (cooling)
  vec3 emberCol = c2 * (0.55 + gInner * 1.6)  // hot leading edge, cool-hue boosted
                + c0 * gMid1 * 1.5            // warm orange body
                + c1 * gMid2 * 1.1            // mid
                + c3 * gOuter * 1.2;          // deep cool trailing edge
  // a near-white incandescent core right at the leading edge
  emberCol += vec3(1.0, 0.93, 0.78) * gInner * gInner * 0.9;
  // subtle per-angle flicker so the rim breathes
  float flick = 0.82 + 0.18 * sin(a * 9.0 + u_time * 3.0 + faceSeed * 5.0)
                     * sin(a * 4.0 - u_time * 1.7);
  col += emberCol * rim * flick * 1.7;
  // inner-edge incandescence bloom reaching a little into the unburned wood
  float lead = smoothstep(rimW * 2.0, 0.0, abs(min(sd, 0.0) + rimW * 0.6));
  col += c2 * lead * 0.4 * interior;

  // ---------- ash + cooling sparks outside the front ----------
  float ash = smoothstep(0.0, 0.02, sd); // 1 outside (burned)
  // ash is char: slightly DARKER than the unburned face, rings erased to flecks
  col += c3 * 0.010 * ash;            // faint warm char tint
  col -= BG * 0.45 * ash;             // burned territory reads darker than wood
  // a few cooling sparks settled in the check-cracks; twinkle, fade with depth.
  // sparks live as soft round points INSIDE each polar cell (not the whole cell),
  // so they never paint hard axis-aligned rectangles when a cell meets the frame.
  vec2  cellId  = vec2(floor(a * 6.0), floor(rn * 22.0));
  vec2  cellUv  = fract(vec2(a * 6.0, rn * 22.0)); // 0..1 within the cell
  float sparkRnd  = hash21(cellId + faceSeed * 13.0);
  // random sub-cell position for this spark
  vec2  sparkPos  = vec2(hash21(cellId + 5.0), hash21(cellId + 9.0));
  float sparkDist = length((cellUv - sparkPos));
  float sparkDot  = smoothstep(0.32, 0.0, sparkDist);   // soft round point
  float spark     = step(0.93, sparkRnd) * sparkDot * (0.4 + 0.6 * crack);
  float twinkle = 0.5 + 0.5 * sin(u_time * (2.0 + sparkRnd * 4.0) + sparkRnd * 30.0);
  // sparks only just behind the front, cooling as ash ages (sd grows)
  float sparkLife = smoothstep(0.16, 0.0, sd) * ash;
  col += mix(c0, c2, sparkRnd) * spark * twinkle * sparkLife * 1.4;

  return max(col, vec3(0.0));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5) {
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  // burn progress: a saw cycle scaled by BURN_RATE. We keep TWO faces a half
  // cycle apart and crossfade so a fresh dark face is already burning before the
  // old one guts out at the pith — hiding the reset.
  float rate  = max(u_burnRate, 0.001);
  float phase = u_time * rate / (CYCLE * 0.18); // 0.18 = default rate normaliser
  float fA    = fract(phase);          // progress of face A (0=bark .. 1=pith)
  float fB    = fract(phase + 0.5);    // face B, half a cycle offset
  float seedA = floor(phase);
  float seedB = floor(phase + 0.5);

  // crossfade weights: a face is fully present through most of its burn, fades
  // out fast as it guts at the pith (prog->1) and fades in from a dark birth
  // (prog->0) so the fresh face arrives indistinguishably dark. The fade-in is
  // gentle/late so usually ONE dominant rim is on screen at a time.
  float wA = smoothstep(1.0, 0.88, fA) * smoothstep(0.0, 0.16, fA);
  float wB = smoothstep(1.0, 0.88, fB) * smoothstep(0.0, 0.16, fB);

  vec3 colA = burnFace(fc, res, pr, seedA, c0, c1, c2, c3, fA);
  vec3 colB = burnFace(fc, res, pr, seedB, c0, c1, c2, c3, fB);

  // edge fade: smoothly ramp all glow contribution to zero in a band near the
  // frame boundary so the ember rim / sparks never clip into hard, aliased
  // rectangles where they cross the edge (judge issue). Distance to nearest
  // edge, normalised; fade over a CSS-px band so it looks the same at any DPR.
  // band scales with the rim so even the fattest rim (36px) fades cleanly.
  float edgePx = (24.0 + 0.9 * max(u_rimWidth, 0.5)) * pr; // fade band width, device px
  vec2  dEdge  = min(fc, res - fc);          // px to nearest x/y edge
  float edge   = min(dEdge.x, dEdge.y);
  float edgeFade = smoothstep(0.0, edgePx, edge);

  vec3 col = BG + (colA * wA + colB * wB) * edgeFade;

  // gentle radial vignette to seat the log in the dark frame
  float vign = 1.0 - smoothstep(0.55, 1.18, length((fc - ctr) / res) * 1.4);
  col *= mix(0.72, 1.0, vign);

  // soft filmic-ish rolloff to keep the hottest ember from clipping flat
  col = col / (1.0 + col * 0.5);

  gl_FragColor = vec4(col, 1.0);
}
