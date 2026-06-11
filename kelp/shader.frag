// kelp (Sough) — a stand of kelp seen in section: dark ribbon blades anchored
// to an uneven seafloor band along the bottom edge, rising most of the frame's
// height with a gentle intrinsic waviness and a small float bulb where blade
// meets tip. The water column is near-black with the faintest depth grade and a
// few dim suspended motes drifting independently of the surge. When a surge
// front rolls across the stand, the downstream blade edges light: a thin rim of
// glow climbs each ribbon, brightest at the wavering tip and the float bulbs.
// Colour climbs the column — roots in the deepest hue, tips in the palest, the
// bulbs glinting in a fourth. Between surges the forest hangs nearly still and
// near-black; calm is the resting state, excitation intermittent and travelling.
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
uniform float u_surgeRate;    // how often surge fronts roll through    (default 0.3)
uniform float u_sway;         // how far blades lean / overshoot        (default 1)
uniform float u_bladeWidth;   // ribbon width in CSS px                 (default 14)
uniform float u_rimGlow;      // brightness of the climbing edge light  (default 1)

const vec3  BG          = vec3(0.030, 0.032, 0.041); // near-black water base
const float SPACING_CSS = 92.0;   // css px between ribbon roots (a dense stand)
const int   BLADES      = 18;      // ribbons drawn (covers a wide buffer)
const float FLOOR_CSS   = 70.0;   // seafloor band height from the bottom (css px)
const float WIDTH_MUL   = 3.2;     // ribbons are WIDE flat blades, not wires
const float TWO_PI      = 6.2831853;

// cheap hash for per-blade variation and motes
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// triangular palette weight on a 0..4 wheel (no dynamic array indexing)
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = BG;

  // faint depth grade: a touch lighter toward the surface (top), darker at depth
  float depth = fc.y / res.y;               // 0 floor .. 1 surface
  col += BG * 0.55 * smoothstep(0.0, 1.0, depth);

  // palette with house fallback (headless can leave the array zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float spacing  = SPACING_CSS * pr;
  float floorH   = FLOOR_CSS * pr;
  // a kelp blade is a WIDE flat ribbon, not a wire: the param width is the
  // strap/frond control, but the body is scaled up so it reads as a broad blade
  float halfW    = max(u_bladeWidth, 0.5) * 0.5 * WIDTH_MUL * pr;
  float colTop   = res.y;                   // blades rise to near the top
  float rootBase = floorH;                  // anchored on the seafloor band

  // --- surge fronts: coherent invisible disturbances sweep across the field as
  // travelling waves of bow-and-spring-back. A front is a moving Gaussian in x;
  // its phase advances slowly (heavier than air). Calm is the resting state, so
  // between fronts the displacement decays to near zero. ---
  float surgeRate = max(u_surgeRate, 0.02);
  float frontX = res.x * (fract(t * surgeRate * 0.16) * 1.6 - 0.3); // sweeps L->R, off-screen margins
  float frontW = res.x * 0.34;               // spatial width of one front

  // a slow second front, offset in time/phase, so the field is occasionally
  // double-excited and never on a single clean metronome
  float frontX2 = res.x * (fract(t * surgeRate * 0.16 + 0.53) * 1.6 - 0.3);

  // --- draw the ranks of ribbons (constant loop bound) ---
  // we render a window of blades around the visible columns; each blade i has a
  // root x, intrinsic waviness, and its own response to passing fronts.
  for (int i = 0; i < BLADES; i++) {
    float fi    = float(i);
    float rootX = (fi + 0.5) * spacing;
    // jitter root position + an uneven seafloor anchor height
    float jx    = (hash11(fi + 3.1) - 0.5) * spacing * 0.45;
    rootX      += jx;
    float anchorY = rootBase * (0.35 + 0.55 * hash11(fi + 7.7));

    // per-blade properties
    float hPhase = hash11(fi + 1.3) * TWO_PI;     // intrinsic wave phase
    float hLen   = 0.78 + 0.22 * hash11(fi + 9.2); // fraction of column reached
    // tips stay within frame (top margin) so the wavering tip + float bulb read
    float tipY   = mix(colTop * 0.66, colTop * 0.93, hLen);
    float wig    = (0.5 + 0.6 * hash11(fi + 5.5));  // intrinsic waviness amount

    // surge response: how strongly THIS blade's roots feel the passing front,
    // by proximity of its root to the front centre (Gaussian envelope)
    float dx1 = (rootX - frontX) / frontW;
    float dx2 = (rootX - frontX2) / frontW;
    float env = exp(-dx1*dx1) + 0.7 * exp(-dx2*dx2); // 0 calm .. ~1.7 in a front

    // height parameter along this blade for the current pixel
    float yLocal = fc.y - anchorY;
    float span   = max(tipY - anchorY, 1.0);
    float s = clamp(yLocal / span, 0.0, 1.0);    // 0 root .. 1 tip
    // taper: a kelp blade is a wide flat ribbon for most of its length, holding
    // near-full width up the column and narrowing only at the very holdfast and
    // softly toward the wavering tip — never a wire
    float taper = mix(0.82, 1.0, smoothstep(0.0, 0.08, s))     // slight slim at root
                * mix(1.0, 0.62, smoothstep(0.86, 1.0, s));    // gentle narrow near tip

    // --- bend shape ---
    // roots never move; bend grows with height (s^1.6) and lags up the blade so
    // the tip trails and overshoots. The front's arrival time at the tip is
    // delayed, producing the travelling bow-and-spring-back.
    float lag    = s * 1.4;                       // propagation delay up the blade
    float drive  = env * sin(t * surgeRate * TWO_PI * 0.5 - lag * 2.2);
    // elastic overshoot: a faster, decaying springy term on the return
    float spring = env * 0.45 * sin(t * surgeRate * TWO_PI * 0.9 - lag * 3.3);
    float bend   = (drive + spring) * u_sway;
    // intrinsic residual sway (millimetres) so it's never perfectly frozen
    float idle   = 0.06 * sin(t * 0.6 + hPhase + s * 3.0);

    float pow16  = s * s * (s * 0.6 + 0.4);       // ~s^1.6 growth of bend w/ height
    float xOff   = (bend * pow16 + idle * s) * spacing * 1.05;
    // intrinsic gentle waviness of the relaxed ribbon (css-scaled, independent
    // of blade width so wide fronds don't over-wiggle)
    float wavAmp = 7.0 * pr;
    xOff += sin(s * 5.0 + hPhase) * wig * wavAmp * (0.4 + 0.4 * s);

    // centreline x of the ribbon at this height
    float centerX = rootX + xOff;
    float w = halfW * taper;

    // signed horizontal distance into the ribbon body
    float dxr = (fc.x - centerX);
    float adx = abs(dxr);

    // is this pixel within this blade's vertical extent? body runs right up to
    // the tip so the float bulb sits ON the blade end, not floating above it
    float vmask = step(anchorY - 2.0*pr, fc.y) * (1.0 - smoothstep(tipY - 4.0*pr, tipY + 2.0*pr, fc.y));

    // ribbon body extent + cross-width sheen
    float body = (1.0 - smoothstep(w - 2.0*pr, w + 2.0*pr, adx)) * vmask;
    float across = adx / max(w, 1.0);                     // 0 centre .. 1 edge
    // broad central sheen across the flat blade, dimming toward the rims, so the
    // wide ribbon surface reads as a flat blade and not an outline
    float sheen  = mix(0.45, 1.15, 1.0 - across*across);  // bright spine, dim rims

    // downstream edge = trailing side relative to bend direction. The rim lights
    // only while bending: a thin bright line riding the downstream edge, with a
    // dimmer answering glimmer on the upstream edge.
    float bendDir = sign(bend + 0.0001);
    float edgeX   = dxr * bendDir;                        // >0 on downstream half
    float edgeDist = abs(adx - w);                        // distance from either rim
    float rimBand  = 1.0 - smoothstep(0.0, 2.6*pr, edgeDist);
    float downMask = mix(0.28, 1.0, step(0.0, edgeX));    // downstream brightest
    float flex = clamp(abs(bend) * 0.85, 0.0, 1.4);       // lit only while flexing
    float rim  = rimBand * vmask * flex * downMask;

    // colour climbs the column: roots deepest hue (c0), mid (c1), tips palest
    // (c2) — blended by height with cyclic weights, no dynamic indexing.
    float sc = s * 2.0;                            // 0..2 across c0->c1->c2
    float w0 = wheelW(sc, 0.0), w1 = wheelW(sc, 1.0), w2 = wheelW(sc, 2.0);
    vec3  rampCol = (c0*w0 + c1*w1 + c2*w2) / max(w0+w1+w2, 0.001);

    // faint vertical caustic shimmer crawling up the blade surface — seats the
    // wide ribbon underwater (column light playing over the flat frond)
    float caustic = 0.5 + 0.5 * sin(s * 9.0 - t * 0.7 + hPhase + across * 2.0);

    // dark ribbon body: a visible near-black slate slab across the FULL width so
    // the wide flat blade reads (not a wire), with a soft central sheen + a
    // breath of caustic. While flexing, the broad downstream surface picks up the
    // faintest climbing colour, like light grazing the bent blade; at rest it
    // stays near-black.
    // a dim but VISIBLE slate fill (lighter than the water) tinted by the height
    // ramp, so the full ribbon width reads as a flat blade surface even at rest;
    // the central spine sits brightest, rims fall away into the rim light.
    vec3 slate   = mix(BG * 1.6, rampCol * 0.10, 0.5);
    vec3 bodyCol = slate * sheen
                 + rampCol * (0.030 + 0.020 * caustic) * sheen
                 + rampCol * (0.16 * flex) * sheen * downMask * u_rimGlow;
    col = mix(col, bodyCol, body);

    // tip emphasis: rim brightest where the blade wavers near its tip
    float tipBoost = 1.0 + 1.6 * smoothstep(0.55, 1.0, s);
    col += rampCol * rim * 0.95 * tipBoost * u_rimGlow;

    // a thin soft bloom just outside the rim so edges catch light cleanly
    float bloom = exp(-edgeDist / (3.5*pr)) * vmask * flex * downMask;
    col += rampCol * bloom * 0.22 * u_rimGlow;

    // --- small float bulb where blade meets tip (rides the bent tip centreline) ---
    // a slim elongated lozenge clearly NARROWER than the wide blade, sitting just
    // below the very tip; near-dark at rest, it only glints in the fourth hue when
    // a surge bends the blade.
    float bulbY = tipY - 8.0*pr;
    // the tip's x: evaluate the bend at s=1 so the bulb sits on the blade end
    float bp16  = 1.0 * (1.0 * 0.6 + 0.4);
    float tipX  = rootX + (bend * bp16 + idle) * spacing * 1.05
                  + sin(5.0 + hPhase) * wig * (7.0*pr) * 0.8;
    vec2  bp    = vec2(fc.x - tipX, fc.y - bulbY);
    float bulbR = max(halfW * 0.40, 2.0*pr);     // clearly narrower than the blade
    float bd    = length(bp / vec2(bulbR, bulbR * 2.4));   // elongated lozenge
    float bulb  = (1.0 - smoothstep(0.6, 1.0, bd));
    // bulb is a near-dark node at rest, glinting only while flexing
    float bulbLit = 0.04 + 0.96 * flex;
    col += c3 * bulb * 0.55 * bulbLit * u_rimGlow;
    col += c3 * exp(-bd*2.2) * 0.05 * flex * u_rimGlow;  // bulb halo, surge-only
  }

  // --- a few dim suspended motes drifting independently of the surge ---
  for (int m = 0; m < 18; m++) {
    float fm = float(m);
    float mx = hash11(fm + 0.5) * res.x;
    float drift = sin(t * (0.05 + 0.04*hash11(fm+2.0)) + fm) * 30.0*pr;
    float my = mod(hash11(fm + 4.0) * res.y + t * (6.0 + 8.0*hash11(fm+6.0)) * pr, res.y);
    vec2  mp = vec2(fc.x - (mx + drift), fc.y - my);
    float md = length(mp);
    float mote = exp(-md*md / (8.0*pr*pr));
    col += mix(c2, c1, hash11(fm+8.0)) * mote * 0.06;
  }

  // gentle vignette + slightly darker floor band to seat the holdfasts
  vec2 uv = fc / res;
  float vign = 1.0 - smoothstep(0.55, 1.25, length((uv - 0.5) * vec2(1.05, 1.0)));
  col *= mix(0.7, 1.0, vign);
  float floorShade = 1.0 - 0.45 * (1.0 - smoothstep(0.0, floorH, fc.y));
  col *= floorShade;

  // soft tonemap to keep accents from blowing out
  col = col / (1.0 + col * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
