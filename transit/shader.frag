// transit (Noir) — a rain-slick crossroads seen from a high corner window. Two
// roads cross low in the frame as faint wet seams in the dark, governed by an
// unseen traffic signal whose tiny corner lamp shifts hue each phase. On the
// axis that has the green, head- and taillight trails stream through the
// junction (cool blue-white one way, warm red-amber the other) while the cross
// street holds a standing queue of idling lights stacked at its stop line, each
// lamp doubled by a smeared reflection on the wet road beneath. The signal
// alternates on a steady cycle; at the change the stopped queue peels through
// the junction car by car and the moving side bleeds to a halt and re-stacks.
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
uniform float u_traffic;      // vehicle density in flows + queues   (default 0.8)
uniform float u_signalPeriod; // seconds per full signal cycle       (default 16)
uniform float u_flowSpeed;    // trail travel speed on moving axis    (default 1)
uniform float u_streakWidth;  // trail core thickness, css px         (default 2.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black wet asphalt
const float NLANE    = 6.0;   // lane clocks per direction (const loop bound)
const float NQUEUE   = 7.0;   // max stacked cars in a standing queue
const float TAU      = 6.2831853;

// hash helpers — cheap, deterministic, no textures
float hash11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

// soft round bloom around a point
float blob(vec2 d, float r) {
  return exp(-dot(d, d) / max(r * r, 1e-6));
}

// directional comet streak: a bright head at d=0 with an exponential tail
// trailing in -dir along the travel axis a, thin across axis b. wA/wB are the
// half-widths in those axes; len is the tail length. dir = +/-1 travel sign.
float streak(float da, float db, float dir, float wA, float wB, float len) {
  // across-axis falloff (always tight)
  float across = exp(-(db*db) / max(wB*wB, 1e-6));
  // along-axis: head bloom + a one-sided tail behind the car
  float s = da * dir;                 // >0 ahead of car, <0 behind it
  float head = exp(-(da*da) / max(wA*wA, 1e-6));
  float tail = (s <= 0.0) ? exp(s / max(len, 1e-4)) : exp(-(s*s)/max(wA*wA,1e-6));
  return across * max(head, tail);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized coords: x right, y up, aspect-correct around centre
  vec2  uv  = (fc - 0.5 * res) / res.y;   // y in [-0.5,0.5]
  float aspect = res.x / res.y;

  // ---- guarded params ----
  float traffic = clamp(u_traffic, 0.0, 4.0);          // density 0.2..2
  float period  = max(u_signalPeriod, 2.0);            // never divide by ~0
  float flowSp  = max(u_flowSpeed, 0.05);
  float wpx     = max(u_streakWidth, 0.4) * pr;        // core width in device px
  float w       = wpx / res.y;                         // core width in uv units
  // faster traffic smears into longer comet tails (long-exposure feel) so
  // FLOW_SPEED reads even in a still frame: slow = short bright dashes,
  // fast = long streaked flashes spanning much of the road
  float tlen    = w * (2.5 + 18.0 * flowSp);
  // smooth density ramp: at min, sparse lone cars; at max, nearly every slot
  float dens    = clamp((traffic - 0.2) / 1.8, 0.0, 1.0); // 0..1 across range

  // ---- palette with house fallback ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  // role assignment: c2 = cool head/tail-light flow, c3 = warm flow,
  // c0 = standing-queue idle glow, signal lamp cycles all four.
  vec3 coolCol = c2;          // blue-white stream
  vec3 warmCol = c3;          // red-amber stream
  vec3 queueCol = mix(c3, c0, 0.5); // dim idling brake glow

  // ---- intersection geometry ----
  // The crossroads sits low in the frame; junction centre below middle.
  vec2 J = vec2(0.04, -0.16);          // junction centre in uv
  // horizontal road runs along y = J.y; vertical road along x = J.x.
  float dRoadH = uv.y - J.y;           // signed dist to horizontal road centre
  float dRoadV = uv.x - J.x;           // signed dist to vertical road centre
  float roadHalf = 0.10;               // half road width

  // ---- signal cycle ----
  // phase in [0,1); first half: horizontal axis flows, vertical queues.
  // second half swaps. A short all-stop margin at each change lets the queue
  // peel and the flow bleed without snapping.
  float cyc   = t / period;
  float phase = fract(cyc);
  // green strength per axis: smooth on/off so flows build & decay, never snap.
  float marg  = 0.10;                                   // change margin
  float gH = smoothstep(0.0, marg, phase) * (1.0 - smoothstep(0.5 - marg, 0.5, phase));
  float gV = smoothstep(0.5, 0.5 + marg, phase) * (1.0 - smoothstep(1.0 - marg, 1.0, phase));

  vec3 col = BG;

  // faint wet seams: the two roads as barely-there sheen in the dark
  float seamH = (1.0 - smoothstep(roadHalf*0.5, roadHalf*1.3, abs(dRoadH)));
  float seamV = (1.0 - smoothstep(roadHalf*0.5, roadHalf*1.3, abs(dRoadV)));
  col += vec3(0.02,0.025,0.035) * (seamH + seamV) * 0.6;
  // wet junction box where the two roads cross — a faint pooled sheen that
  // catches whichever flow is active, anchoring the civic geometry
  float jbox = (1.0 - smoothstep(roadHalf*0.8, roadHalf*1.7, abs(dRoadH)))
             * (1.0 - smoothstep(roadHalf*0.8, roadHalf*1.7, abs(dRoadV)));
  col += vec3(0.03,0.035,0.05) * jbox * 0.5;

  // accumulators for glow and its mirrored wet reflection
  vec3 glow = vec3(0.0);

  // =========================================================================
  // HORIZONTAL AXIS  — runs left<->right. When gH high: streak flow.
  //                    When gH low: standing queue stacked before the junction.
  // =========================================================================
  // two lane offsets straddling the road centre (oncoming + outgoing)
  for (int li = 0; li < int(NLANE); li++) {
    float fi   = float(li);
    float lane = (fi + 0.5) / NLANE;             // 0..1 across road
    float laneY = J.y + (lane - 0.5) * (roadHalf * 1.55);
    float dir  = lane < 0.5 ? -1.0 : 1.0;        // travel direction
    // warm one way, cool the other (head vs tail lights)
    vec3  flowCol = dir > 0.0 ? coolCol : warmCol;

    float clk = hash11(fi * 3.17 + 1.3);         // hash-staggered lane clock

    // ---- flowing streaks (active when gH) ----
    // each lane emits a train of cars at staggered offsets
    for (int ci = 0; ci < int(NLANE); ci++) {
      float fci = float(ci);
      // car presence thinned by traffic density (smooth ramp, ci-th slot fills
      // progressively so more cars appear as traffic rises)
      float thresh = (float(ci) + 0.5) / NLANE;     // 0..1 per slot
      float pres = smoothstep(thresh + 0.15, thresh - 0.15, 1.0 - dens)
                 * (0.55 + 0.45*hash11(fci*5.0+fi)); // some lanes brighter
      // car position cycles along x; speed scales with flowSpeed
      float sp   = (0.55 + 0.25*hash11(fci*2.1)) * flowSp;
      float off  = hash11(fci*5.7 + fi) + clk;
      float span = 1.3 * aspect;                              // travel range
      float carX = mod(off + dir * t * sp * 0.20, 2.0*span) - span;
      vec2  cp   = vec2(carX, laneY);
      vec2  d    = uv - cp;
      // comet: bright head + exponential tail trailing behind travel dir
      float trail = streak(d.x, d.y, dir, w*1.6, w*1.4, tlen);
      float amt = trail * pres * gH;
      glow += flowCol * amt;
      // wet-road reflection: mirror about road centre, smeared & dimmer
      vec2 dr = uv - vec2(cp.x, 2.0*J.y - cp.y - 0.015);
      float refl = streak(dr.x, dr.y, dir, w*1.6, w*3.2, tlen);
      glow += flowCol * refl * pres * gH * 0.35;
    }

    // ---- standing queue (active when 1-gH): cars stacked at stop line ----
    // queue forms on the side approaching the junction; stack behind stop line.
    float stopX = J.x - roadHalf*1.15;            // stop line just left of jct
    for (int qi = 0; qi < int(NQUEUE); qi++) {
      float fq = float(qi);
      // deeper queue with more traffic: ~1 car at min, full stack at max.
      // car qi exists when its index sits below the queue depth.
      float depth = 1.0 + dens * (NQUEUE - 1.0);
      float present = 1.0 - smoothstep(depth - 0.8, depth + 0.2, fq);
      // each car spaced behind the stop line
      float gap = roadHalf * 1.4;
      // peel-out: when the queue gets the green (gH rising), cars advance &
      // leave one by one — model with phase so motion is continuous.
      float qx = stopX - fq * gap;
      // small idle creep / brake breathing
      float brake = 0.6 + 0.4*sin(t*1.7 + fq*1.1 + fi);
      vec2  cp = vec2(qx, laneY);
      vec2  d  = uv - cp;
      float lamp = blob(d / max(w*1.3,1e-4), 1.0);
      float amt = lamp * present * (1.0 - gH) * brake;
      glow += queueCol * amt;
      // reflection beneath each idling lamp
      vec2 dr = uv - vec2(qx, 2.0*J.y - laneY - 0.015);
      float refl = blob(vec2(dr.x, dr.y/ max(w*3.0,1e-4)*1.0) / max(w*1.3,1e-4), 1.0);
      glow += queueCol * refl * present * (1.0 - gH) * brake * 0.4;
    }
  }

  // =========================================================================
  // VERTICAL AXIS — runs up<->down. gV flows, (1-gV) queues. Mirror of above.
  // =========================================================================
  for (int li = 0; li < int(NLANE); li++) {
    float fi   = float(li);
    float lane = (fi + 0.5) / NLANE;
    float laneX = J.x + (lane - 0.5) * (roadHalf * 1.55);
    float dir  = lane < 0.5 ? -1.0 : 1.0;
    vec3  flowCol = dir > 0.0 ? warmCol : coolCol;

    float clk = hash11(fi * 4.41 + 7.7);

    for (int ci = 0; ci < int(NLANE); ci++) {
      float fci = float(ci);
      float thresh = (float(ci) + 0.5) / NLANE;
      float pres = smoothstep(thresh + 0.15, thresh - 0.15, 1.0 - dens)
                 * (0.55 + 0.45*hash11(fci*5.0+fi+9.0));
      float sp   = (0.55 + 0.25*hash11(fci*3.3+2.0)) * flowSp;
      float off  = hash11(fci*6.1 + fi+5.0) + clk;
      float spanY = 1.0;
      float carY = mod(off + dir * t * sp * 0.20, 2.0*spanY) - spanY;
      vec2  cp   = vec2(laneX, carY);
      vec2  d    = uv - cp;
      // comet along the vertical (y) axis: head + tail behind travel dir
      float trail = streak(d.y, d.x, dir, w*1.6, w*1.4, tlen);
      float amt = trail * pres * gV;
      glow += flowCol * amt;
      vec2 dr = uv - vec2(cp.x, 2.0*J.y - cp.y - 0.015);
      float refl = streak(dr.y, dr.x, -dir, w*1.6, w*1.4, tlen);
      glow += flowCol * refl * pres * gV * 0.30;
    }

    // standing queue along vertical road: stacked below the junction
    float stopY = J.y + roadHalf*1.15;
    for (int qi = 0; qi < int(NQUEUE); qi++) {
      float fq = float(qi);
      float depth = 1.0 + dens * (NQUEUE - 1.0);
      float present = 1.0 - smoothstep(depth - 0.8, depth + 0.2, fq);
      float gap = roadHalf * 1.4;
      float qy = stopY + fq * gap;
      float brake = 0.6 + 0.4*sin(t*1.7 + fq*1.3 + fi*0.7);
      vec2  cp = vec2(laneX, qy);
      vec2  d  = uv - cp;
      float lamp = blob(d / max(w*1.3,1e-4), 1.0);
      float amt = lamp * present * (1.0 - gV) * brake;
      glow += queueCol * amt;
      vec2 dr = uv - vec2(laneX, 2.0*J.y - qy - 0.015);
      float refl = blob(dr / max(w*2.2,1e-4), 1.0);
      glow += queueCol * refl * present * (1.0 - gV) * brake * 0.4;
    }
  }

  // =========================================================================
  // signal lamp — tiny corner lamp whose hue shifts each phase
  // =========================================================================
  vec2 lampP = vec2(J.x + roadHalf*1.3, J.y + roadHalf*1.3);
  // hue cycles across the four palette entries with the signal phase
  float hk = fract(cyc * 0.5) * 4.0;
  vec3 lampCol = c0;
  if      (hk < 1.0) lampCol = mix(c0, c1, hk);
  else if (hk < 2.0) lampCol = mix(c1, c2, hk-1.0);
  else if (hk < 3.0) lampCol = mix(c2, c3, hk-2.0);
  else               lampCol = mix(c3, c0, hk-3.0);
  vec2 dl = uv - lampP;
  float lampGlow = blob(dl / max(w*1.6,1e-4), 1.0);
  glow += lampCol * lampGlow * 1.2;
  // its own wet reflection
  vec2 dlr = uv - vec2(lampP.x, 2.0*J.y - lampP.y - 0.02);
  glow += lampCol * blob(vec2(dlr.x, dlr.y/max(w*3.0,1e-4))/max(w*1.6,1e-4),1.0) * 0.4;

  // ---- bokeh: rain-blurred out-of-focus light orbs in upper frame; more and
  // brighter as traffic rises (distant city signage filling up) ----
  for (int bi = 0; bi < 7; bi++) {
    float fb = float(bi);
    vec2 bp = vec2( (hash11(fb*1.7)-0.5)*aspect*1.1, 0.12 + hash11(fb*4.2)*0.34 );
    float br = 0.025 + hash11(fb*2.3)*0.035;
    float tw = 0.7 + 0.3*sin(t*0.6 + fb*2.0);
    // higher-index orbs only light up at higher traffic
    float bThresh = fb / 7.0;
    float bPresent = smoothstep(bThresh + 0.2, bThresh - 0.1, 1.0 - dens);
    vec3 bc = mix(coolCol, warmCol, hash11(fb*5.5));
    glow += bc * blob((uv-bp)/max(br,1e-4),1.0) * 0.13 * tw * (0.4 + 0.6*bPresent);
  }

  // motion-blur road wash: the active flowing axis throws a smeared band of
  // light across the wet asphalt that spreads wider and brighter the faster the
  // traffic moves — makes FLOW_SPEED legible across the whole road, not just
  // along individual streaks.
  float washSpread = 0.5 + 0.9 * flowSp;
  // horizontal road wash (active with gH), tracked along x by the flow
  float washH = (1.0 - smoothstep(0.0, roadHalf*washSpread, abs(dRoadH)))
              * (0.5 + 0.5*sin(uv.x*9.0 - t*flowSp*2.0));
  glow += mix(coolCol, warmCol, 0.5) * washH * gH * 0.16 * (0.4 + 0.5*flowSp);
  // vertical road wash (active with gV), tracked along y
  float washV = (1.0 - smoothstep(0.0, roadHalf*washSpread, abs(dRoadV)))
              * (0.5 + 0.5*sin(uv.y*11.0 - t*flowSp*2.0));
  glow += mix(coolCol, warmCol, 0.5) * washV * gV * 0.16 * (0.4 + 0.5*flowSp);

  // bloom on the glow, then tone & composite
  vec3 bloomed = glow + glow*glow*0.5;
  col += bloomed;

  // rain on the glass: faint diagonal streaks drifting down, subtle
  float rain = sin((uv.x*40.0 + uv.y*14.0) - t*2.0);
  rain = smoothstep(0.95, 1.0, rain);
  col += vec3(0.02,0.025,0.03) * rain * (0.4 + 0.6*max(0.0, uv.y));

  // vignette: dark corners, luminous junction low-centre
  float vign = 1.0 - smoothstep(0.45, 1.15, length(uv * vec2(0.9,1.0)));
  col *= mix(0.55, 1.0, vign);

  // gentle filmic-ish tone so bright cores don't clip harshly
  col = col / (col + vec3(0.85)) * 1.85;

  gl_FragColor = vec4(col, 1.0);
}
