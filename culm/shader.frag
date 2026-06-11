// culm (Sough) — a sparse grove of thick bamboo canes crossing the frame:
// broad near-vertical columns at hash-jittered spacing, divided by swollen node
// rings, with small leaf strokes near the tops. The canes stay near-black at
// rest; a gust front sweeps across the grove cane by cane, and each struck cane
// answers from the ground up — a sparkle of node glints climbs it joint by
// joint (lowest ring flaring first, the run rising to the leafy tip) while the
// stiff upper internodes bow with a quick elastic overshoot. Light travels UP
// the plant rather than across the field. Between fronts the grove is the
// stillest, darkest field in the family.
//
// Uniforms provided by the runtime:
//   u_time        seconds, monotonically increasing
//   u_resolution  drawing-buffer size in device pixels
//   u_mouse       pointer in device pixels (0,0 when absent)
//   u_pixelRatio  devicePixelRatio used for the buffer
//   u_palette[4]  four glow colours, themeable (0..1 rgb)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_gustRate;   // how often gust fronts cross the grove   (default 0.35)
uniform float u_bend;       // tip throw + glint-run brightness        (default 0.8)
uniform float u_spacing;    // css-px between canes (×u_pixelRatio)     (default 48)
uniform float u_nodeGlow;   // node-ring glint brightness              (default 1)

const vec3  BG          = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float NODE_CSS    = 64.0;   // css-px between node rings up a cane
const int   CANES       = 11;     // max canes considered (literal loop bound)
const int   NODES       = 9;      // max node rings per cane (literal loop bound)

// hash helpers (no textures)
float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

// cyclic triangular weight for palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // normalized vertical 0 at ground, 1 at top of frame
  float yN  = fc.y / max(res.y, 1.0);

  vec3 col = BG;

  // Palette with house fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacing = max(u_spacing, 8.0) * refScale * pr;       // css-px cane spacing
  float nodeLen = NODE_CSS * pr;                  // px between node rings
  float gust    = max(u_gustRate, 0.0001);

  // gust front: a coherent disturbance travels horizontally across the grove.
  // frontX sweeps left->right across the field; each cane fires when the front
  // reaches its x. Long becalmed quiet between fronts (gate is sparse in time).
  float sweepDur = 3.4;                            // seconds for a front to cross
  float cycle    = sweepDur / gust;                // calm + sweep period
  float phase    = t / max(cycle, 0.001);
  float frontId  = floor(phase);                   // which gust front
  float frontF   = fract(phase);                   // 0..1 progress of this front
  // front position across the field in px; only "active" during first chunk so
  // the rest of the cycle is becalmed quiet.
  float activeFrac = sweepDur / max(cycle, 0.001); // fraction of cycle that sweeps
  float frontX = frontF / max(activeFrac, 0.001);  // 0..1 sweep coordinate (>1 = calm)

  // base x in css-px sweep space
  float fieldW = res.x;

  // how many canes the frame holds at this spacing — the grove always crosses
  // the full frame; tighter spacing packs in more visible culms (6..CANES),
  // wider spacing thins it out, holding ~6-10 visible columns.
  float wantN = clamp(floor(fieldW / spacing), 6.0, float(CANES));
  float gap   = fieldW / wantN;                    // even slot width across frame

  for (int i = 0; i < CANES; i++) {
    float fi = float(i);
    if (fi > wantN - 0.5) continue;                // only draw the wanted count
    // each cane anchored in its slot, hash-jittered within the gap
    float jitter = (hash11(fi * 3.17 + 11.0) - 0.5) * gap * 0.4;
    float caneX  = (fi + 0.5) * gap + jitter;

    // cane geometry: thick column, slight per-cane width variation. Width keys
    // off the requested css spacing so wider gaps read as broader canes.
    float halfW  = spacing * (0.20 + 0.08 * hash11(fi * 1.7 + 4.0));

    // --- gust excitation for THIS cane (front sweeps across) ---
    // cane's normalized x position in the field
    float caneXN = caneX / max(fieldW, 1.0);
    // how recently the front reached this cane: 0 at arrival, grows after
    float dx     = frontX - caneXN;
    // a soft window around the arrival moment -> this cane is "struck"
    float strike = exp(-pow(max(dx, 0.0) * 5.5, 2.0)) * step(0.0, dx) * step(frontX, 1.2);
    // occasional solitary shiver between fronts (one lone cane, very faint)
    float lone   = step(0.90, hash11(fi * 5.3 + frontId * 1.0))
                 * (0.5 + 0.5 * sin(t * 2.1 + fi)) * 0.18;
    // a barely-there idle breath so the becalmed grove is alive, not frozen
    float idle   = (0.5 + 0.5 * sin(t * 0.5 + fi * 1.7)) * 0.05;
    float exc    = clamp(strike + lone + idle, 0.0, 1.2);  // excitation 0..~1

    // --- stiff bow: roots never move, hinge in the upper internodes ---
    // bow grows with height^2 (stiff base, flexible top), tip overshoots.
    float caneSeed = hash11(fi * 2.9 + 1.0);
    float bowDir   = (caneSeed > 0.5) ? 1.0 : -1.0;
    // elastic overshoot: damped oscillation right after the strike
    float since    = max(dx, 0.0);
    float osc      = sin(since * 22.0) * exp(-since * 6.0);
    float bowAmt   = exc * u_bend * (0.6 + 0.4 * osc) * bowDir;
    float heightF  = yN;                            // 0 ground..1 top
    float bowPx    = bowAmt * heightF * heightF * spacing * 0.9;

    // displaced cane centre at this row
    float cx = caneX + bowPx;
    float dxc = fc.x - cx;

    // --- cane body mask (soft edges) ---
    float edge   = smoothstep(halfW + pr * 1.4, halfW - pr * 0.6, abs(dxc));
    // round the very top into a tip
    float topFade = smoothstep(0.99, 0.84, yN);
    float body   = edge * topFade;

    // cane base colour: hash a blend of two ADJACENT palette colours
    float caneHue = hash11(fi * 4.1 + 7.0) * 4.0;
    float aw0 = wheelW(caneHue, 0.0), aw1 = wheelW(caneHue, 1.0);
    float aw2 = wheelW(caneHue, 2.0), aw3 = wheelW(caneHue, 3.0);
    vec3  caneCol = (c0*aw0 + c1*aw1 + c2*aw2 + c3*aw3) / max(aw0+aw1+aw2+aw3, 0.001);
    // glints pull from the REMAINING pair (offset by 2 on the wheel)
    float glintHue = mod(caneHue + 2.0, 4.0);
    float gw0 = wheelW(glintHue, 0.0), gw1 = wheelW(glintHue, 1.0);
    float gw2 = wheelW(glintHue, 2.0), gw3 = wheelW(glintHue, 3.0);
    vec3  glintCol = (c0*gw0 + c1*gw1 + c2*gw2 + c3*gw3) / max(gw0+gw1+gw2+gw3, 0.001);

    // faint cane face: near-black at rest, a thin sheen so the column reads.
    // a soft vertical highlight down the centre gives the cane volume.
    float sheen = smoothstep(halfW, 0.0, abs(dxc));  // brighter toward centre line
    float face  = 0.35 + 0.65 * pow(sheen, 1.5);     // fills the whole column, brightest mid
    col += caneCol * body * face * (0.10 + 0.18 * exc);

    // both edges of the column get a thin rim so the cylinder reads, the
    // leading bent edge brightening when the cane is struck.
    float rim = smoothstep(pr*3.0, 0.0, abs(abs(dxc) - halfW)) * body;
    col += caneCol * rim * (0.10 + 0.55 * exc);

    // --- node-ring glints climbing the cane joint by joint ---
    // the run rises ring by ring: ring n lights when the climb reaches its height
    float caneH = res.y * topFade;                  // visible height
    // climb progress 0..1 up the cane, driven by time since strike (rises)
    float climb = clamp(since * 3.2, 0.0, 1.3);     // 0 at root, rises to top
    // echo: a faint glint-run rings back DOWN after reaching the tip
    float echo  = clamp((since - 0.42) * 2.6, 0.0, 1.0);

    float glow = 0.0;
    for (int n = 0; n < NODES; n++) {
      float fn = float(n);
      float ny = (fn + 0.5) * nodeLen;              // node ring height in px
      if (ny > res.y) continue;
      float nyN = ny / max(res.y, 1.0);             // 0..1
      // node centre x (follows the bow at that height)
      float nbow = bowAmt * nyN * nyN * spacing * 0.9;
      float ncx  = caneX + nbow;
      vec2  d    = vec2(fc.x - ncx, fc.y - ny);
      // swollen ring: a flattened ellipse band around the node
      float ringD = length(d * vec2(0.65, 1.6) / max(halfW, 1.0));
      float ringMask = exp(-ringD * ringD * 2.2);
      // this ring fires when the climb reaches its normalized height
      float lit = exp(-pow((climb - nyN) * 4.5, 2.0));
      // echo lights it again on the way down
      float litE = exp(-pow((echo - (1.0 - nyN)) * 4.5, 2.0)) * 0.5;
      float fire = (lit + litE) * exc;
      glow += ringMask * fire;
    }
    // bend also drives how brightly each joint registers as the run climbs
    col += glintCol * glow * u_nodeGlow * (0.45 + 0.55 * u_bend) * 0.9 * topFade;

    // --- sparse leaf strokes near the top ---
    float leafSeed = hash11(fi * 6.7 + 2.0);
    float leafY    = 0.80 + 0.12 * leafSeed;        // near top
    float leafSide = (hash11(fi*8.1+3.0) > 0.5) ? 1.0 : -1.0;
    float lbow     = bowAmt * leafY * leafY * spacing * 0.9;
    vec2  lp       = vec2(fc.x - (caneX + lbow + leafSide * halfW * 1.6),
                          fc.y - leafY * res.y);
    // thin slanted blade
    float blade    = exp(-pow((lp.x - leafSide * lp.y * 0.5) / (halfW*0.9), 2.0))
                   * exp(-pow(lp.y / (spacing*0.9), 2.0));
    col += glintCol * blade * (0.05 + 0.55 * exc) * u_nodeGlow * 0.6;
  }

  // gentle vignette to keep the frame composed and edges dark
  vec2 uvc = (fc - res*0.5) / res;
  float vign = 1.0 - smoothstep(0.42, 0.95, length(uvc * vec2(1.0, 0.9)));
  col *= mix(0.72, 1.0, vign);

  // subtle ground darkening / sky-lift so the grove reads as rooted
  col *= mix(0.85, 1.06, smoothstep(0.0, 0.6, yN));

  col = max(col, vec3(0.0));
  gl_FragColor = vec4(col, 1.0);
}
