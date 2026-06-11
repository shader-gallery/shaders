// chaff (Sough) — a low rank of ripe seed-heads leans in from the bottom edge as
// dim drooping silhouettes that never rise past the lower quarter. Invisible gust
// fronts sweep across the rank as traveling waves of bow-and-spring-back; the
// heads a front bends shed a few glowing chaff motes that lift, stream downwind
// along shallow ballistic arcs, tumble, and fade well before leaving the frame.
// Every mote's position is a pure function of the shared gust schedule and a
// per-mote hash — the same maths that bows a head also times its release, so the
// field is stateless and seamlessly looping. Motes take their hue from the parent
// head's position along the rank (blending all four palette colours); the bent
// heads themselves catch only a faint rim. Calm is the resting state: between
// gusts the field is almost still and almost dark.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent) — unused here
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_gustRate;     // how often a front crosses the rank   (default 0.4)
uniform float u_chaffDensity; // hash-gated fraction that releases     (default 0.8)
uniform float u_drift;        // how far downwind motes carry & fade   (default 1)
uniform float u_moteSize;     // chaff fleck size, css px              (default 3)

const vec3  BG         = vec3(0.030, 0.031, 0.040); // near-black field at rest
const float HEAD_COUNT = 26.0;   // seed-heads across the rank (const, not a param)
const float MOTE_LIFE  = 7.5;    // seconds a mote stays aloft before it has faded
const float FRONT_LEN  = 0.34;   // gust-front width as a fraction of screen width

// 1D hash -> [0,1)
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
// 2D hash -> [0,1)
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = max(u_pixelRatio, 0.5);
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec2  uv  = fc / res;                 // 0..1, y up
  float aspect = res.x / max(res.y, 1.0);

  // faint vertical ground gradient: the rank sits low, so the very bottom is a
  // touch warmer-dark; the air above fades to true near-black.
  vec3 col = BG * (1.0 + smoothstep(0.30, 0.0, uv.y) * 0.28);

  // palette with house fallback (headless contexts can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float gustRate = max(u_gustRate, 0.001);
  float density  = clamp(u_chaffDensity, 0.0, 1.0);
  float drift    = max(u_drift, 0.05);
  float moteR    = max(u_moteSize, 0.5) * pr;

  // --- shared gust schedule -------------------------------------------------
  // Gust fronts arrive at a hash-staggered cadence and sweep left->right across
  // the rank. We model a small ring of overlapping fronts: each has a launch
  // time and a leading-edge position f(t) that travels from -FRONT_LEN to
  // 1+FRONT_LEN over its crossing. A head at normalised x is "bent" by the
  // front when the front's leading edge is near it; bend springs back behind.
  // Front period scales inversely with gustRate so the slider reads as cadence.
  float frontPeriod = 2.0 / gustRate;       // seconds between successive fronts
  float crossDur    = 3.6;                  // seconds a front takes to cross

  // accumulators
  float headLight = 0.0;   // rim glow on bent heads
  vec3  moteAcc   = vec3(0.0);

  // ---- draw the rank of drooping seed-head silhouettes ----------------------
  // The rank is a soft dark mound across the bottom; individual heads are bumps
  // with drooping tips. Heads never rise past ~lower quarter (y < 0.26).
  // We evaluate the nearest few heads to this column.
  float xCol = uv.x;
  // total bend of THIS column, summed over active fronts (for head lean & rim)
  float colBend = 0.0;

  // ---- iterate fronts (const bound) ----------------------------------------
  // 4 overlapping front slots cover cadence from very slow to brisk without
  // changing iteration count (gustRate only scales timing).
  for (int fi = 0; fi < 4; fi++) {
    float fId   = floor(t / frontPeriod) - float(fi);   // which front instance
    float fHash = hash11(fId * 1.7 + 3.1);
    // launch time of this front, jittered a little so cadence isn't metronomic
    float launch = (fId + 0.5 + (fHash - 0.5) * 0.5) * frontPeriod;
    float age    = (t - launch);                         // seconds since launch
    // normalised progress of the leading edge across the rank
    float prog   = age / crossDur;                       // <0 not yet, >1 gone
    // leading-edge x position (sweeps left to right)
    float edge   = prog * (1.0 + 2.0 * FRONT_LEN) - FRONT_LEN;

    // strength envelope: a front rises and dies over its crossing (an exhale)
    float fLive  = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.55, 1.15, prog));
    float fAmp   = fLive * (0.7 + 0.3 * fHash);

    // bend felt by THIS column: a traveling gaussian behind the leading edge
    float dxCol  = (xCol - edge);
    // the bow trails just behind the edge then springs back
    float bowCol = exp(-(dxCol * dxCol) / (FRONT_LEN * FRONT_LEN * 0.5))
                 * smoothstep(0.0, -FRONT_LEN * 0.6, -max(dxCol, -FRONT_LEN));
    colBend += fAmp * exp(-(dxCol * dxCol) / (FRONT_LEN * FRONT_LEN * 0.5));

    // ---- motes shed by this front -----------------------------------------
    // Each front sheds chaff from the heads it bends. We iterate candidate
    // motes (const bound); each maps to a parent head along the rank via hash.
    // Releases are staggered along the front's crossing (each head sheds as the
    // edge reaches it) so the drift trails downwind like a comet, not a clump.
    for (int mi = 0; mi < 22; mi++) {
      float mF = float(mi);
      // per-mote hash bundle keyed on (front instance, mote index)
      vec2  hk = vec2(fId * 0.713 + 1.0, mF * 1.91 + 7.0);
      float ha = hash21(hk);
      float hb = hash21(hk + 19.7);
      float hc = hash21(hk + 41.3);
      float hd = hash21(hk + 63.9);

      // density gate: only a hash-fraction of candidates actually release
      float gate = step(1.0 - density, ha);
      if (gate < 0.5) continue;

      // parent head position along the rank (normalised x of the head)
      float headX = (floor(hb * HEAD_COUNT) + 0.5) / HEAD_COUNT;

      // time since this head was bent by this front (the release moment): the
      // front's leading edge reaches headX at this fraction of the crossing.
      float headHitProg = (headX + FRONT_LEN) / (1.0 + 2.0 * FRONT_LEN);
      float relTime = launch + headHitProg * crossDur;  // absolute release time
      float life    = (t - relTime);                    // seconds aloft
      // small per-mote launch jitter so a head sheds a little puff over time
      life -= hc * 0.7;
      if (life < 0.0) continue;

      float lifeN = life / (MOTE_LIFE * (0.6 + 0.7 * hd));
      if (lifeN > 1.0) continue;

      // head root position (anchored, never moves): low on the rank
      float rootY = 0.085 + 0.045 * hash11(headX * 51.0);
      vec2  root  = vec2(headX, rootY);

      // ballistic arc, downwind (to the right) with decelerating drift and a
      // gentle tumble. Position is a pure function of life & hashes. Motes are
      // carried well across the field so the downwind streaming is legible.
      float launchSpd = (0.26 + 0.24 * hb) * drift;     // initial horizontal push
      float lift      = (0.34 + 0.22 * hc) * drift;     // stronger upward kick so motes fill the air column
      // ease-out so motes decelerate (hides the fade-out wrap)
      float eo = 1.0 - exp(-life * 1.25);
      float px = root.x + launchSpd * eo;
      // up then settle: rise on a sin-ish arc, never far above the lower quarter
      float arc = sin(min(lifeN, 1.0) * 2.05);          // up then easing back
      float py = root.y + lift * arc + 0.14 * eo;       // net rise carries motes up into the frame
      // feathery tumble wobble, scaled by remaining life
      float tw = (1.0 - lifeN);
      px += 0.014 * sin(life * 3.1 + hc * 6.2831) * tw;
      py += 0.011 * sin(life * 2.3 + hd * 6.2831) * tw;

      // keep motes inside the lower portion / on screen (they fade before edge)
      vec2 mpos = vec2(px, py);

      // fade: quick fade-in at release, long feathery fade-out
      float fIn  = smoothstep(0.0, 0.10, lifeN);
      float fOut = 1.0 - smoothstep(0.45, 1.0, lifeN);
      float env  = fIn * fOut;
      // the drift also thins as the parent front dies (gust empties out)
      env *= (0.45 + 0.55 * fAmp);

      // soft glowing fleck — distance in aspect-corrected uv, then to px
      vec2 dpos = (uv - mpos);
      dpos.x *= aspect;
      float dpx = length(dpos) * res.y;       // distance in device px
      float core = exp(-(dpx * dpx) / (moteR * moteR * 2.0));
      float halo = exp(-(dpx * dpx) / (moteR * moteR * 22.0));
      float shape = core * 0.95 + halo * 0.42;

      // hue from parent head position along the rank — sweep all four palette
      // colours across the rank (no dynamic array indexing).
      float s  = headX * 4.0;
      float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
      vec3  tint = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
      tint = normalize(tint + 1e-4) * 1.18;

      moteAcc += tint * (shape * env);
    }

    headLight += fAmp;
  }

  // ---- render the seed-head rank silhouette --------------------------------
  // A row of HEAD_COUNT drooping heads. Each head is a thin stalk + a drooping
  // seed cluster, leaning with the local bend. Heads stay below the lower
  // quarter. Drawn near-black (silhouette) with a faint palette rim when bent.
  {
    // which head column are we near
    float hx   = uv.x * HEAD_COUNT;
    float hId  = floor(hx);
    float hLoc = fract(hx) - 0.5;                 // -0.5..0.5 within the head slot
    float hh   = hash11(hId * 7.3 + 1.0);

    float headXn = (hId + 0.5) / HEAD_COUNT;       // this head's normalised x
    float rootY  = 0.085 + 0.045 * hash11(headXn * 51.0);
    float height = 0.105 + 0.055 * hh;             // head reach (kept low)
    // local bend pushes the tip downwind (right) and slightly down (droop+bow)
    float lean   = colBend * (0.10 + 0.05 * hh);

    // parametric stalk from root up to drooping tip; sample silhouette mask
    // build a soft mask: distance from current pixel to the leaning stalk line.
    float yy = uv.y;
    float stalkT = clamp((yy - rootY) / max(height, 0.001), 0.0, 1.0);
    // tip droops over: x offset grows with height (droop) + lean from gust
    float droop  = stalkT * stalkT;                // quadratic droop
    float baseX  = (hId + 0.5) / HEAD_COUNT;
    float stalkX = baseX + (lean + 0.018) * droop;
    float dStalk = abs(uv.x - stalkX) * aspect;
    // stalk thickness in uv
    float stalkW = 0.0016 + 0.0010 * hh;
    float stalkMask = (1.0 - smoothstep(stalkW, stalkW * 2.2, dStalk))
                    * step(rootY, yy) * (1.0 - smoothstep(height * 0.95, height, yy - rootY));

    // seed cluster: a ripe drooping head near the tip — an elongated teardrop
    // that hangs down and leans downwind, fatter than the stalk so it reads as
    // a heavy nodding seed-head (wheat/oat/reed plume) rather than a bare twig.
    vec2 tip = vec2(stalkX + (lean + 0.018) * 0.45, rootY + height);
    vec2 dC  = (uv - tip); dC.x *= aspect;
    // anisotropic: narrow in x, longer down the droop axis (hangs below tip)
    float clW = 0.012 + 0.006 * hh;                // head half-width
    float clH = 0.030 + 0.014 * hh;                // head length (drooping down)
    // bias the vertical term so the mass hangs below the tip
    float dy = dC.y + clH * 0.45;
    float cluster = exp(-((dC.x * dC.x) / (clW * clW) + (dy * dy) / (clH * clH)) * 0.9);
    cluster *= step(rootY, yy);

    float headMask = clamp(stalkMask * 0.8 + cluster, 0.0, 1.0);

    // silhouette: darken toward true black where a head is (it occludes the
    // faint ground glow), so heads read as near-black shapes at rest.
    col = mix(col, BG * 0.35, headMask * 0.9);

    // faint palette rim that the bent edges catch — only when this column is
    // bent by a gust. Hue by head position, kept thin & dim.
    float s  = headXn * 4.0;
    float w0 = wheelW(s, 0.0), w1 = wheelW(s, 1.0), w2 = wheelW(s, 2.0), w3 = wheelW(s, 3.0);
    vec3  rimTint = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
    // rim sits on the edge of the head mask (gradient of the mask ~ its rim)
    float rim = headMask * (1.0 - headMask) * 4.0;
    float bend01 = clamp(colBend, 0.0, 1.0);
    // steady resting rim + cluster glow so the seed-head rank always reads at the
    // bottom (was near-black at rest), brightening as a gust bends it
    col += rimTint * rim * (0.22 + bend01 * 0.85) * 0.20;
    // a touch of cluster glow, always faintly lit (seed-head catching ground light)
    col += rimTint * cluster * (0.09 + bend01 * 0.85) * 0.10;
  }

  // add the motes on top (they are the show)
  col += moteAcc * 2.7;

  // gentle soft clamp so bright motes bloom without harsh clip
  col = col / (1.0 + col * 0.42);
  col = pow(max(col, 0.0), vec3(0.95));

  // subtle vignette to keep the frame composed and the corners dark
  vec2 vd = uv - 0.5; vd.x *= aspect;
  float vign = 1.0 - smoothstep(0.45, 0.95, length(vd));
  col *= mix(0.78, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
