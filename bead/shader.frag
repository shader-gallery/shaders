precision highp float;

// ----------------------------------------------------------------------------
// Bead — Noir family
//
// Rain on the inside of a dark window. A sparse constellation of large
// condensation droplets sits on near-black glass; each thick water lens traps
// a sharp inverted miniature of an unseen neon sign — a small geometric glyph
// burning upside-down in a single palette hue. Nothing glows between the
// drops. Each bead swells on its own clock; some slide into a neighbour and
// coalesce through a smooth-min water neck, and when one passes critical
// weight it breaks loose and plunges off the bottom in under a second,
// leaving a brief wet line while a new droplet condenses elsewhere.
//
// Drops are processed as merge PAIRS so a coalescing couple renders as ONE
// blended water body (metaball union), never as two stacked badges. The
// census is radius-aware: small sizes show eight beads on a loose grid,
// large sizes thin out to five survivors that glide to corners + centre,
// and radii are soft-capped against neighbour spacing.
// ----------------------------------------------------------------------------

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent (unused)
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_dropSize;      // mean droplet radius, css px (x u_pixelRatio)   (default 56)
uniform float u_lifecycleRate; // swell/merge/fall tempo, 0 = stasis            (default 0.5)
uniform float u_signFlicker;   // raggedness of the neon glyphs' flicker        (default 0.4)
uniform float u_glint;         // brightness of the crescent rim highlights     (default 0.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043);
const float SWELL_LO = 0.62;   // radius factor at birth
const float SWELL_HI = 1.16;   // radius factor at critical weight
const float FALL_SEC = 0.7;    // real seconds a plunge takes
const float STROKE   = 0.085;  // glyph tube half-width in lens space

// light arrives from upper-left, as from a streetlamp above the window
const vec2 LDIR = vec2(-0.4537, 0.8911); // normalize(vec2(-0.5, 0.982))

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec2 hash21(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// smooth 1-D value noise, for tube sputter
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f));
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// faint diagonal city sheen on the pane (also sampled inverted inside lenses)
float sheenAt(vec2 nuv) {
  return 0.012 * (0.5 + 0.5 * sin((nuv.x * 1.6 - nuv.y * 0.9) * 3.1 + 1.3));
}

// visibility order: the five survivors at a small census sit at the four
// corners and the centre of the frame, so a thinned constellation stays spread
float rankOf(float fi) {
  if (fi < 0.5) return 0.0;       // slot 0: top-left corner survivor
  else if (fi < 1.5) return 5.0;
  else if (fi < 2.5) return 4.0;  // slot 2: centre survivor
  else if (fi < 3.5) return 1.0;  // slot 3: top-right corner survivor
  else if (fi < 4.5) return 2.0;  // slot 4: bottom-left corner survivor
  else if (fi < 5.5) return 6.0;
  else if (fi < 6.5) return 7.0;
  return 3.0;                     // slot 7: bottom-right corner survivor
}

// spread layout the survivors glide toward as drops grow heavy
vec2 xHome(float rk) {
  if (rk < 0.5) return vec2(0.17, 0.75);
  else if (rk < 1.5) return vec2(0.83, 0.75);
  else if (rk < 2.5) return vec2(0.17, 0.25);
  else if (rk < 3.5) return vec2(0.83, 0.25);
  return vec2(0.50, 0.50);
}

// soft knee so radii saturate smoothly against neighbour spacing
float softCap(float R, float cap) {
  float knee = 0.72 * cap;
  float over = max(R - knee, 0.0);
  return min(R, knee) + (cap - knee) * (1.0 - exp(-over / max(cap - knee, 1.0)));
}

// one fixed neon glyph per slot (8 distinct signs, never repeated in-frame),
// all vertically asymmetric so the thick-lens inversion reads as upside-down
// signage — and none of them UI icons.
float glyphDist(vec2 u, float gid) {
  float d = 1e3;
  if (gid < 0.5) {
    // five-point star outline, point-up (burns point-down inside the lens)
    vec2 P0 = vec2(0.0, 0.44),    P1 = vec2(-0.4185, 0.136),
         P2 = vec2(-0.2586, -0.356), P3 = vec2(0.2586, -0.356),
         P4 = vec2(0.4185, 0.136);
    vec2 I0 = vec2(-0.1058, 0.1456), I1 = vec2(-0.1712, -0.0556),
         I2 = vec2(0.0, -0.18),      I3 = vec2(0.1712, -0.0556),
         I4 = vec2(0.1058, 0.1456);
    d = min(min(min(sdSeg(u, P0, I0), sdSeg(u, I0, P1)),
                min(sdSeg(u, P1, I1), sdSeg(u, I1, P2))),
            min(min(sdSeg(u, P2, I2), sdSeg(u, I2, P3)),
                min(min(sdSeg(u, P3, I3), sdSeg(u, I3, P4)),
                    min(sdSeg(u, P4, I4), sdSeg(u, I4, P0)))));
  } else if (gid < 1.5) {
    // triangle, point up
    vec2 a = vec2(-0.38, -0.28), b = vec2(0.38, -0.28), c = vec2(0.0, 0.40);
    d = min(min(sdSeg(u, a, b), sdSeg(u, b, c)), sdSeg(u, c, a));
  } else if (gid < 2.5) {
    // lightning zig
    d = min(min(sdSeg(u, vec2(-0.24, 0.44), vec2(0.10, 0.06)),
                sdSeg(u, vec2(0.10, 0.06), vec2(-0.10, -0.02))),
            sdSeg(u, vec2(-0.10, -0.02), vec2(0.24, -0.44)));
  } else if (gid < 3.5) {
    // "T" — the clearest upside-down read
    d = min(sdSeg(u, vec2(-0.34, 0.36), vec2(0.34, 0.36)),
            sdSeg(u, vec2(0.0, 0.36), vec2(0.0, -0.42)));
  } else if (gid < 4.5) {
    // martini glass with olive — bar signage
    d = min(min(sdSeg(u, vec2(-0.32, 0.40), vec2(0.0, 0.02)),
                sdSeg(u, vec2(0.32, 0.40), vec2(0.0, 0.02))),
            min(sdSeg(u, vec2(0.0, 0.02), vec2(0.0, -0.30)),
                sdSeg(u, vec2(-0.18, -0.36), vec2(0.18, -0.36))));
    d = min(d, abs(length(u - vec2(0.10, 0.27)) - 0.055));
  } else if (gid < 5.5) {
    // hanging diamond with a dash below — pawn-shop vibe
    vec2 t = vec2(0.0, 0.42), r = vec2(0.26, 0.04),
         m = vec2(0.0, -0.30), l = vec2(-0.26, 0.04);
    d = min(min(sdSeg(u, t, r), sdSeg(u, r, m)),
            min(sdSeg(u, m, l), sdSeg(u, l, t)));
    d = min(d, sdSeg(u, vec2(-0.14, -0.44), vec2(0.14, -0.44)));
  } else if (gid < 6.5) {
    // three stacked bars, widest on top (inverts to widest-at-bottom)
    d = min(min(sdSeg(u, vec2(-0.34, 0.30), vec2(0.34, 0.30)),
                sdSeg(u, vec2(-0.22, 0.02), vec2(0.22, 0.02))),
            sdSeg(u, vec2(-0.11, -0.26), vec2(0.11, -0.26)));
  } else {
    // umbrella: canopy arc + chord + hooked stem
    float arc = abs(length(u - vec2(0.0, 0.04)) - 0.34)
              + max(0.04 - u.y, 0.0) * 1.6;
    d = min(arc, sdSeg(u, vec2(-0.32, 0.04), vec2(0.32, 0.04)));
    d = min(d, min(sdSeg(u, vec2(0.0, 0.44), vec2(0.0, -0.30)),
                   sdSeg(u, vec2(0.0, -0.30), vec2(0.10, -0.36))));
  }
  return d;
}

// every slot keeps its own sign forever -> no glyph repeats within a frame
float glyphId(float fi) { return mod(fi * 3.0 + 1.0, 8.0); }

// one palette hue per drop, chosen by hash (no dynamic indexing)
vec3 pickHue(float h, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  return mix(mix(c0, c1, step(0.25, h)), mix(c2, c3, step(0.75, h)), step(0.5, h));
}

// home position for slot fi at cycle cyc; jitter shrinks as drops grow so
// spacing stays radius-aware, and survivors glide to the spread layout
vec2 homeFor(float fi, float cyc, vec2 res, float pr, float sizeNorm,
             float Rmean, out float Rbase) {
  float seed = fi * 41.7 + cyc * 269.3;
  float h0 = hash11(seed + 0.7);
  float Rcap = min(res.x, res.y) * mix(0.155, 0.205, sizeNorm);
  Rbase = softCap(Rmean * mix(0.78, 1.24, h0), Rcap / SWELL_HI);
  float Rmax = Rbase * SWELL_HI;

  float ci = mod(fi, 4.0), ri = floor(fi / 4.0);
  vec2 j = hash21(fi * 17.31 + cyc * 113.7 + 4.2) - 0.5;
  float cellW = res.x * 0.25;
  float freeX = max(cellW * 0.5 - Rmax - 6.0 * pr, 0.0);
  float freeY = max(res.y * 0.20 - Rmax * 0.85 - 4.0 * pr, 0.0);
  vec2 gHome = vec2((ci + 0.5) * cellW + (ri - 0.5) * cellW * 0.10 + j.x * 1.6 * freeX,
                    mix(0.715, 0.305, ri) * res.y + j.y * 1.4 * freeY);

  float reLay = smoothstep(0.55, 0.95, sizeNorm);
  vec2 sHome = (xHome(rankOf(fi)) + j * 0.024) * res;
  return mix(gHome, sHome, reLay);
}

// full lifecycle state of one slot; also paints its wet line / residue
void slotState(float fi, vec2 p, vec2 res, float pr, float rate, float Rmean,
               float sizeNorm, vec3 c0, vec3 c1, vec3 c2, vec3 c3, float glint,
               float mergeOK, vec2 mergeTarget, float partnerVis,
               inout vec3 col,
               out vec2 center, out vec2 home, out float R, out float alpha,
               out float fp, out float s, out float seed, out vec3 hue,
               out float merging, out float visW) {
  float period = mix(14.0, 27.0, hash11(fi * 7.77 + 1.3)); // seconds at rate 1
  float phase  = u_time * rate / period + hash11(fi * 3.17 + 9.1) * 7.0;
  float cyc = floor(phase);
  s = fract(phase);
  seed = fi * 41.7 + cyc * 269.3;
  float h1 = hash11(seed + 5.1);   // hue pick
  float h3 = hash11(seed + 13.3);  // merge gate

  // census: eight beads when small, thinning to five spread survivors
  float rk = rankOf(fi);
  float N = mix(8.9, 4.9, sizeNorm);
  visW = smoothstep(0.0, 0.35, N - rk);

  float Rbase;
  home = homeFor(fi, cyc, res, pr, sizeNorm, Rmean, Rbase);

  // slow swell toward critical weight; newborns START SMALL and grow, so a
  // condensing drop reads as a tiny intentional bead, not a ghost disc
  float gs = min(s / 0.85, 1.0);
  gs = gs * gs * (3.0 - 2.0 * gs);
  float birth = smoothstep(0.0, 0.10, s);
  R = Rbase * mix(SWELL_LO, SWELL_HI, gs) * mix(0.55, 1.0, birth);

  hue = pickHue(h1, c0, c1, c2, c3);
  alpha = smoothstep(0.0, 0.04, s) * visW; // quick condense, hides the respawn

  // heavy drops are too massive to slide: merges fade out at large sizes
  float mergeGate = 1.0 - smoothstep(0.55, 0.8, sizeNorm);
  merging = mergeOK * step(h3, 0.42) * step(0.5, partnerVis)
          * step(0.5, visW) * step(0.5, mergeGate);

  center = home;
  fp = 0.0;
  if (merging > 0.5) {
    // long slow drift, quick coalesce at the end of the cycle
    float m = smoothstep(0.10, 0.92, s);
    m = m * m;
    center = mix(home, mergeTarget, m);
  } else {
    // critical weight: plunge off the bottom in ~FALL_SEC real seconds
    float sRel = 1.0 - clamp(FALL_SEC * rate / period, 0.0015, 0.4);
    if (s > sRel) {
      fp = clamp((s - sRel) / max(1.0 - sRel, 1e-4), 0.0, 1.0);
      center.y = home.y - fp * fp * (home.y + 3.0 * R);
    }
  }

  // --- wet line during the fall, with a soft-onset top edge -----------------
  float trailW = max(1.4 * pr, R * 0.08);
  if (fp > 0.001) {
    float tx = smoothstep(trailW, trailW * 0.25, abs(p.x - home.x));
    float ty = smoothstep(center.y - 2.0, center.y + 6.0 * pr, p.y)
             * (1.0 - smoothstep(home.y - R * 0.55, home.y + R * 0.35, p.y));
    float grad = mix(1.0, 0.45, smoothstep(center.y, home.y, p.y));
    col += mix(vec3(0.5), hue, 0.85) * tx * ty * grad
         * 0.34 * (1.0 - fp * 0.55) * (0.35 + 0.65 * glint) * visW;
  }
  // --- residue of the previous plunge, fading in real seconds ---------------
  if (merging < 0.5 && s < 0.45) {
    float seedP = fi * 41.7 + (cyc - 1.0) * 269.3;
    float mergedPrev = mergeOK * step(hash11(seedP + 13.3), 0.42)
                     * step(0.5, partnerVis) * step(0.5, mergeGate);
    if (mergedPrev < 0.5) {
      float RbaseP;
      vec2 homeP = homeFor(fi, cyc - 1.0, res, pr, sizeNorm, Rmean, RbaseP);
      float tIn = s * period / max(rate, 1e-3);
      float fade = exp(-tIn * 1.6);
      if (fade > 0.01) {
        vec3 hueP = pickHue(hash11(seedP + 5.1), c0, c1, c2, c3);
        float RP = RbaseP * SWELL_HI;
        float txp = smoothstep(trailW, trailW * 0.25, abs(p.x - homeP.x));
        float typ = 1.0 - smoothstep(homeP.y - RP * 0.7, homeP.y + RP * 0.45, p.y);
        col += mix(vec3(0.5), hueP, 0.85) * txp * typ * 0.30 * fade
             * (0.35 + 0.65 * glint) * visW;
      }
    }
  }
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 p   = gl_FragCoord.xy;
  vec2 res = u_resolution;
  float pr   = max(u_pixelRatio, 0.5);
  float rate = max(u_lifecycleRate, 0.0);
  float Rmean = max(u_dropSize, 6.0) * pr;
  float sizeNorm = clamp((u_dropSize - 24.0) / 86.0, 0.0, 1.0);
  float glint  = clamp(u_glint, 0.0, 1.0);
  float flickP = clamp(u_signFlicker, 0.0, 1.0);

  // --- bare glass: near-black, a whisper of sheen, gentle vignette ---------
  vec2 nuv = p / res;
  float sheen = sheenAt(nuv);
  float vig = smoothstep(1.25, 0.35, length(nuv - 0.5) * 1.6);
  vec3 col = BG * (0.78 + 0.30 * vig) + vec3(sheen * 0.6, sheen * 0.7, sheen);

  // --- four merge pairs (even slot absorbs its odd neighbour) ---------------
  for (int pi = 0; pi < 4; pi++) {
    float fe = float(pi) * 2.0;
    float fo = fe + 1.0;

    vec2 cE, hmE; float RE, aE, fpE, sE, seedE, mgE, vE; vec3 hueE;
    slotState(fe, p, res, pr, rate, Rmean, sizeNorm, c0, c1, c2, c3, glint,
              0.0, vec2(0.0), 1.0, col,
              cE, hmE, RE, aE, fpE, sE, seedE, hueE, mgE, vE);

    vec2 cO, hmO; float RO, aO, fpO, sO, seedO, mgO, vO; vec3 hueO;
    slotState(fo, p, res, pr, rate, Rmean, sizeNorm, c0, c1, c2, c3, glint,
              1.0, hmE, vE, col,
              cO, hmO, RO, aO, fpO, sO, seedO, hueO, mgO, vO);

    // --- coalescing physics: absorbed mass, shrink, contact wobble ----------
    float sep  = distance(cE, cO);
    float Rsum = max(RE + RO, 1e-3);
    float u01  = sep / Rsum;
    float identO = 1.0; // how much the absorbed drop is still its own sign
    if (mgO > 0.5) {
      float absorbed = 1.0 - smoothstep(0.15, 0.95, u01);
      float endEase  = 1.0 - smoothstep(0.93, 1.0, sO);
      RE *= 1.0 + 0.14 * absorbed * endEase;
      RO *= mix(0.60, 1.0, smoothstep(0.05, 0.55, u01));
      float contact = smoothstep(1.30, 0.95, u01) * smoothstep(0.18, 0.55, u01);
      float wob = sin(u_time * 22.0 + fe * 7.0) * 0.05 * contact;
      RE *= 1.0 + wob;
      RO *= 1.0 - wob;
      identO = smoothstep(0.30, 0.75, u01);
    }

    // --- pair union SDF: a merging couple is ONE water body -----------------
    vec2 vE2 = p - cE;
    vE2.y /= 1.0 + 1.44 * fpE * (1.0 - fpE); // teardrop stretch mid-fall
    vE2.x *= 1.0 + 0.30 * fpE;
    vec2 vO2 = p - cO;
    vO2.y /= 1.0 + 1.44 * fpO * (1.0 - fpO);
    vO2.x *= 1.0 + 0.30 * fpO;
    float dE = length(vE2) - RE + step(aE, 0.003) * 1e5;
    float dO = length(vO2) - RO + step(aO, 0.003) * 1e5;

    float k = max(mix(2.0 * pr, 0.45 * min(RE, RO), mgO), 1.0);
    float hb = clamp(0.5 + 0.5 * (dO - dE) / k, 0.0, 1.0);
    float dU = mix(dO, dE, hb) - k * hb * (1.0 - hb); // smooth-min neck

    float aaPx = 1.6 * pr;
    if (dU > aaPx * 2.0) continue;

    float inside  = smoothstep(aaPx * 0.6, -aaPx * 0.6, dU);
    float Rloc    = max(mix(RO, RE, hb), 1.0);
    float t       = clamp(1.0 + dU / Rloc, 0.0, 1.0); // 0 centre .. 1 surface
    float alphaLoc = mix(aO, aE, hb);
    vec3  hueB    = mix(hueO, hueE, hb);
    vec2  cB      = mix(cO, cE, hb);

    // --- water-lens body: lit just above pane, thin meniscus, refraction ----
    float men = smoothstep(0.915, 0.995, t);
    vec3 body = BG * (1.16 + 0.20 * (1.0 - t) - 0.30 * men);
    vec2 refrUV = cB / res - (nuv - cB / res) * 0.85; // inverted mini-pane
    body += vec3(0.7, 0.8, 1.0) * sheenAt(refrUV) * 4.0;
    // refracted streetlamp: the unseen light above-left arrives inverted,
    // as a soft transmission patch in the lower-right of every lens
    vec2 qB = (p - cB) / max(Rloc, 1.0);
    vec2 lampQ = qB + LDIR * 0.38;
    body += vec3(0.55, 0.62, 0.78) * exp(-dot(lampQ, lampQ) * 5.5)
          * (0.05 + 0.06 * glint);
    body += hueB * 0.07 * (1.0 - t * t); // ambient tint even when sign is off

    // --- inverted miniature neon signs, one per lobe -------------------------
    vec2 qE = vE2 / max(RE, 1.0); float qqE = dot(qE, qE);
    float magE = max(1.0 - 0.55 * qqE, 0.22);
    float gdE = glyphDist(-qE * 0.92 / magE, glyphId(fe));
    float ftE = u_time + hash11(seedE + 21.0) * 90.0;
    float sputE = clamp(0.06 + 1.20 * vnoise(ftE * 7.0 + fe * 31.0), 0.0, 1.0)
                * step(0.22, vnoise(ftE * 21.0 + fe * 53.0));
    float flickE = mix(1.0, max(sputE, 0.05), flickP) * (1.0 - 0.8 * fpE);
    float aaUE = 1.8 * pr * magE / max(RE, 1.0);
    float coreE = smoothstep(STROKE + aaUE, STROKE - aaUE, gdE);
    float haloE = exp(-gdE * gdE * 26.0) * 0.55;
    float visE = smoothstep(1.0, 0.78, sqrt(qqE));
    vec3 signE = (hueE * 1.35 + vec3(0.30) * coreE) * (coreE + haloE) * flickE * visE;

    vec2 qO = vO2 / max(RO, 1.0); float qqO = dot(qO, qO);
    float magO = max(1.0 - 0.55 * qqO, 0.22);
    float gdO = glyphDist(-qO * 0.92 / magO, glyphId(fo));
    float ftO = u_time + hash11(seedO + 21.0) * 90.0;
    float sputO = clamp(0.06 + 1.20 * vnoise(ftO * 7.0 + fo * 31.0), 0.0, 1.0)
                * step(0.22, vnoise(ftO * 21.0 + fo * 53.0));
    float flickO = mix(1.0, max(sputO, 0.05), flickP) * (1.0 - 0.8 * fpO);
    float aaUO = 1.8 * pr * magO / max(RO, 1.0);
    float coreO = smoothstep(STROKE + aaUO, STROKE - aaUO, gdO);
    float haloO = exp(-gdO * gdO * 26.0) * 0.55;
    float visO = smoothstep(1.0, 0.78, sqrt(qqO));
    vec3 signO = (hueO * 1.35 + vec3(0.30) * coreO) * (coreO + haloO)
               * flickO * visO * identO;

    // --- crescent rim highlight on the UNION surface (no inner rims) --------
    vec2 nE = vE2 / max(length(vE2), 1e-4);
    vec2 nO = vO2 / max(length(vO2), 1e-4);
    vec2 nrm = normalize(mix(nO, nE, hb) + vec2(1e-5));
    float rimW = max(1.2 * pr, Rloc * 0.042);
    float rimBand = smoothstep(rimW, rimW * 0.15, abs(dU + rimW * 0.8));
    float cres = pow(max(dot(nrm, LDIR), 0.0), 3.2);
    float back = pow(max(dot(nrm, -LDIR), 0.0), 4.0) * 0.16;
    float rimI = rimBand * (cres + back) * (0.16 + 2.3 * glint);
    vec3 rim = mix(vec3(0.9, 0.95, 1.0), hueB, 0.35) * rimI;

    // specular bead per lobe
    vec2 spE = qE - LDIR * 0.42;
    vec2 spO = qO - LDIR * 0.42;
    float spec = (exp(-dot(spE, spE) * 90.0) * hb
                + exp(-dot(spO, spO) * 90.0) * (1.0 - hb))
               * (0.05 + 1.8 * glint);

    vec3 drop = body + signE + signO + rim + vec3(0.9, 0.95, 1.0) * spec;
    col = mix(col, drop, inside * alphaLoc);

    // hair-thin bright edge where glass meets water (always faintly there,
    // so unlit / freshly-condensing lenses still read as intentional glass)
    float edge = smoothstep(aaPx, 0.0, abs(dU)) * (0.11 + 0.26 * glint)
               * (0.30 + 0.70 * max(cres, back * 1.8));
    col += mix(vec3(0.8), hueB, 0.3) * edge * sqrt(alphaLoc);
  }

  // gentle tone shoulder, keeps the jewels from clipping
  col = col / (1.0 + 0.22 * col);
  gl_FragColor = vec4(col, 1.0);
}
