// kelp (Sough) — a kelp forest in section, deep underwater. Wide ribbon blades
// rise from an uneven seafloor in three depth-layered ranks (near blades large,
// bright and sharp; far ranks smaller, dimmer and hazed blue), each a rounded
// cylinder-shaded frond with a gentle intrinsic waviness, a curving bent-over
// tip and a small float bulb. The water column is a real blue-teal depth
// gradient lit by crepuscular god-rays slanting down from the surface, a faint
// caustic shimmer, and bubbles rising through it. When a surge front rolls
// across the stand the downstream blade edges light — a rim of glow climbing
// each ribbon, brightest at the wavering tips and bulbs.
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
uniform float u_density;      // forest crowding (spacing scale)        (default 1)
uniform float u_randomize;    // per-blade variation: 0 uniform .. 1    (default 1)
uniform float u_height;       // blade height scale                     (default 1)
uniform float u_rays;         // crepuscular god-ray intensity          (default 1)
uniform float u_caustic;      // background caustic shimmer intensity    (default 1)
uniform float u_bubbles;      // bubble amount / brightness              (default 1)
uniform float u_bubbleSize;   // bubble radius scale                     (default 1)
uniform float u_distort;      // refractive horizontal distortion        (default 0)
uniform float u_dof;          // depth-of-field blur falloff             (default 0.6)
uniform float u_focus;        // focal depth plane 0 far .. 1 near       (default 0.85)

const vec3  BG          = vec3(0.020, 0.034, 0.052); // deep underwater base (blue)
const float SPACING_CSS = 74.0;   // css px between ribbon roots (nearest rank)
const int   BLADES      = 14;     // ribbons per rank
const int   LAYERS      = 5;      // depth-layered ranks (perspective)
const float FLOOR_CSS   = 70.0;   // seafloor band height from the bottom (css px)
const float WIDTH_MUL   = 3.2;    // ribbons are WIDE flat blades, not wires
const float TWO_PI      = 6.2831853;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// ridged noise: sharp bright veins (1 on the ridge line, 0 in the troughs)
float ridge(vec2 p) { return 1.0 - abs(2.0 * vnoise(p) - 1.0); }

// water-surface caustics: two animated ridged-noise layers, domain-warped and
// crossed into a bright interweaving net of refracted light — the cellular
// caustic web sunlight casts onto everything underwater.
float caustics(vec2 p, float t) {
  // gentle domain warp so the net curves and breathes rather than sitting still
  vec2 q = p + 0.30 * vec2(vnoise(p * 1.6 + vec2(0.0,  t * 0.18)),
                           vnoise(p * 1.6 + vec2(7.3, -t * 0.13)));
  // two crossed ridged layers -> thin bright filaments where their veins coincide
  float r1 = ridge(q * 4.2 + vec2(0.0,      -t * 0.30));
  float r2 = ridge(q * 5.0 + vec2(t * 0.22,  t * 0.16) + 11.0);
  float net = pow(r1 * r2, 3.2) * 2.6;
  // a finer third layer adds sparkling caustic detail
  float r3 = ridge(q * 8.5 + vec2(-t * 0.18, t * 0.12) + 3.0);
  net += pow(r1 * r3, 4.0) * 1.3;
  float wide = pow(ridge(q * 1.8 + vec2(0.0, -t * 0.20)), 3.0) * 0.16; // faint broad shimmer
  return net + wide;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  // palette with house fallback
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }
  vec3 waterDeep = mix(BG, c0 * 0.20, 0.5);
  vec3 waterSurf = mix(c2, c0, 0.5) * 0.5;

  float depth = fc.y / res.y;               // 0 floor .. 1 surface

  // ---- underwater environment ----------------------------------------------
  // blue depth gradient (brighter toward the surface)
  vec3 col = mix(waterDeep, waterSurf, smoothstep(0.0, 1.0, depth));

  // crepuscular god-rays slanting down from the surface, strongest up top
  float rc = (fc.x * 0.5 + (res.y - fc.y) * 0.42) / (res.x * 0.18);
  float rays = pow(0.5 + 0.5 * sin(rc * 1.0 + t * 0.05), 6.0)
             + pow(0.5 + 0.5 * sin(rc * 1.7 - 1.3 + t * 0.03), 9.0) * 0.7
             + pow(0.5 + 0.5 * sin(rc * 0.6 + 2.1 - t * 0.02), 5.0) * 0.5;
  rays *= smoothstep(0.05, 0.9, depth);     // pour from the surface down
  col += mix(c2, vec3(1.0), 0.4) * rays * 0.06 * clamp(u_rays, 0.0, 2.0);

  // water-like caustics: a bright refracted net pouring over the scene from the
  // surface, strongest up top and fading into the depths (u_caustic scales it).
  float cAmt = clamp(u_caustic, 0.0, 2.0);
  vec2  cuv  = fc / (150.0 * pr);
  float caus = caustics(cuv, t);
  vec3  causCol = mix(c2, vec3(0.82, 0.95, 1.0), 0.7);
  col += causCol * caus * 0.07 * smoothstep(0.05, 1.0, depth) * cAmt;
  // a brighter caustic ceiling so the surface area reads as lit, rippling water
  col += causCol * caus * 0.16 * smoothstep(0.74, 1.0, depth) * cAmt;

  float refScale = min(u_resolution.x, u_resolution.y) / (max(u_pixelRatio, 1.0) * 400.0);
  float spacingN = SPACING_CSS * refScale * pr;
  float floorH   = FLOOR_CSS * pr;
  float colTop   = res.y;

  float surgeRate = max(u_surgeRate, 0.02);
  float frontX  = res.x * (fract(t * surgeRate * 0.16) * 1.6 - 0.3);
  float frontW  = res.x * 0.34;
  float frontX2 = res.x * (fract(t * surgeRate * 0.16 + 0.53) * 1.6 - 0.3);

  // cross-section light for cylindrical blade volume (from upper-left, toward viewer)
  vec2 Lc = normalize(vec2(-0.5, 0.86));

  // swash-style controls: forest crowding, per-blade variation, blade height
  float dens = clamp(u_density, 0.6, 2.2);
  float rnd  = clamp(u_randomize, 0.0, 1.0);   // 0 = even rank, 1 = full scatter
  float hgt  = clamp(u_height, 0.5, 1.4);

  // refractive distortion: a vertical wave of horizontal displacement warps the
  // blades + bulbs like light bent through stirring water (u_distort scales it).
  float distort = clamp(u_distort, 0.0, 1.0);
  float warpX = distort * (13.0 * pr) * (0.6 * sin(depth * 9.0 - t * 0.5)
                                       + 0.4 * sin(depth * 19.0 + t * 0.32));
  float fx = fc.x + warpX;   // distorted horizontal coordinate for the kelp

  // ---- depth-layered kelp forest: far -> near ------------------------------
  for (int L = 0; L < LAYERS; L++) {
    float fl  = float(L) / float(LAYERS - 1);   // 0 far .. 1 near
    float dim = mix(0.5, 1.0, fl);
    float widthScale = mix(0.55, 1.0, fl);
    float spacing = spacingN * mix(0.62, 1.0, fl) / dens;   // far ranks denser; u_density crowds
    float floorLift = (1.0 - fl) * res.y * 0.16;     // far holdfasts sit higher
    float haze = (1.0 - fl) * 0.55;                  // far ranks hazed blue
    float topScale = mix(0.80, 1.0, fl);             // far blades shorter
    float halfW = max(u_bladeWidth, 0.5) * 0.5 * WIDTH_MUL * pr * widthScale;
    float xoff = fl * 37.0 * pr;                     // stagger ranks horizontally

    // depth of field: ranks away from the focal plane soften (wider edge feather)
    // and haze more, so the forest recedes into an organic blur rather than every
    // rank being crisp. u_focus picks the sharp plane, u_dof the falloff strength.
    float defocus  = abs(fl - clamp(u_focus, 0.0, 1.0)) * clamp(u_dof, 0.0, 1.5);
    float edgeSoft = (2.0 + 16.0 * defocus) * pr;    // half-feather of the blade edge
    haze = clamp(haze + defocus * 0.55, 0.0, 0.93);

    for (int i = 0; i < BLADES; i++) {
      float fi    = float(i);
      float seed  = fi + fl * 23.0;
      float rootX = (fi + 0.5) * spacing + xoff;
      // u_randomize pulls each blade's jitter / height / wave toward the mean, so
      // 0 yields an even rank of identical blades and 1 the full natural scatter.
      rootX += (hash11(seed + 3.1) - 0.5) * spacing * 0.45 * rnd;
      float anchorY = floorLift + floorH * (0.35 + 0.55 * mix(0.5, hash11(seed + 7.7), rnd));

      float hPhase = mix(0.5, hash11(seed + 1.3), rnd) * TWO_PI;
      float hLen   = 0.78 + 0.22 * mix(0.5, hash11(seed + 9.2), rnd);
      float tipY   = mix(colTop * 0.62, colTop * 0.94, hLen) * topScale + floorLift * 0.5;
      tipY = anchorY + (tipY - anchorY) * hgt;       // u_height scales blade length
      float wig    = 0.5 + 0.6 * mix(0.5, hash11(seed + 5.5), rnd);

      float dx1 = (rootX - frontX) / frontW;
      float dx2 = (rootX - frontX2) / frontW;
      float env = exp(-dx1*dx1) + 0.7 * exp(-dx2*dx2);

      float yLocal = fc.y - anchorY;
      float span   = max(tipY - anchorY, 1.0);
      float s = clamp(yLocal / span, 0.0, 1.0);
      // natural kelp silhouette: a flared holdfast base gripping the floor, a full
      // mid-blade, and a tip that tapers to a fine frayed point (not a blunt stub).
      float taper = mix(1.18, 1.0, smoothstep(0.0, 0.14, s))
                  * mix(1.0, 0.22, smoothstep(0.70, 1.0, s));

      float lag    = s * 1.4;
      float drive  = env * sin(t * surgeRate * TWO_PI * 0.5 - lag * 2.2);
      float spring = env * 0.45 * sin(t * surgeRate * TWO_PI * 0.9 - lag * 3.3);
      float bend   = (drive + spring) * u_sway;
      float idle   = 0.06 * sin(t * 0.6 + hPhase + s * 3.0);
      float pow16  = s * s * (s * 0.6 + 0.4);
      float xOff   = (bend * pow16 + idle * s) * spacing * 1.05;
      // intrinsic waviness + a curving bent-over tip (kelp leans over near the top)
      xOff += sin(s * 5.0 + hPhase) * wig * (7.0 * pr) * (0.4 + 0.4 * s);
      float tipCurl = smoothstep(0.55, 1.0, s);
      xOff += tipCurl * tipCurl * (18.0 * pr) * (hash11(seed + 2.2) > 0.5 ? 1.0 : -1.0) * wig;

      float centerX = rootX + xOff;
      float w = halfW * taper;
      float dxr = fx - centerX;
      float adx = abs(dxr);

      float vmask = step(anchorY - 2.0*pr, fc.y)
                  * (1.0 - smoothstep(tipY - 4.0*pr - edgeSoft*0.5, tipY + 2.0*pr + edgeSoft*0.5, fc.y));
      float body  = (1.0 - smoothstep(w - edgeSoft, w + edgeSoft, adx)) * vmask;

      // ---- cylindrical shading across the ribbon (volume, not a flat strip) ----
      float lx = clamp(dxr / max(w, 1.0), -1.0, 1.0);
      float nz = sqrt(max(1.0 - lx * lx, 0.0));
      float diff = clamp(dot(vec2(lx, nz), Lc), 0.0, 1.0);
      float spec = pow(diff, 7.0);
      // translucent kelp also lit from above (surface light) -> brighter up the blade
      float fromAbove = mix(0.55, 1.1, s);
      float shade = (0.22 + 0.7 * diff + 0.7 * spec) * fromAbove;

      // colour climbs the column: roots deep blue (c0) -> teal (c2) -> pale tip
      float sc = s * 2.0;
      float w0 = wheelW(sc, 0.0), w1 = wheelW(sc, 1.0), w2 = wheelW(sc, 2.0);
      vec3  rampCol = (c0*w0 + c1*w1 + c2*w2) / max(w0+w1+w2, 0.001);
      // lean kelp toward blue-green/teal and haze far ranks toward the water
      vec3 kelpCol = mix(rampCol, mix(c2, vec3(0.4,0.8,0.7), 0.3), 0.25);
      kelpCol = mix(kelpCol, waterSurf, haze);

      // bright, clearly-visible blade body (translucent frond), painted with
      // occlusion (mix) so near ranks sit in front of far ranks.
      vec3 bodyCol = kelpCol * shade * (0.7 + 0.5 * env) * dim;
      col = mix(col, bodyCol, body * 0.94);

      // ---- holdfast: a dark rooted clump gripping the seafloor at the base -----
      float hbd  = length((vec2(fx, fc.y) - vec2(rootX, anchorY))
                          / vec2(w * 1.8 + 2.0*pr, floorH * 0.40));
      float tend = 0.55 + 0.45 * sin((fx - rootX) / (3.0*pr) + hash11(seed + 4.4) * 6.0);
      float hold = (1.0 - smoothstep(0.40, 1.0, hbd)) * step(fc.y, anchorY + floorH * 0.55);
      vec3  holdCol = mix(vec3(0.09, 0.07, 0.05), rampCol * 0.55, 0.30);
      col = mix(col, holdCol, hold * (0.42 + 0.30 * tend) * dim);

      // ---- surge rim light on the downstream edge ----
      float bendDir  = sign(bend + 0.0001);
      float edgeX    = dxr * bendDir;
      float edgeDist = abs(adx - w);
      float rimBand  = 1.0 - smoothstep(0.0, 2.6*pr, edgeDist);
      float downMask = mix(0.30, 1.0, step(0.0, edgeX));
      float flex     = clamp(abs(bend) * 0.85, 0.0, 1.4);
      float rim      = rimBand * vmask * flex * downMask;
      float tipBoost = 1.0 + 1.6 * smoothstep(0.55, 1.0, s);
      col += rampCol * rim * 0.95 * tipBoost * dim * u_rimGlow;
      float bloom = exp(-edgeDist / (3.5*pr)) * vmask * flex * downMask;
      col += rampCol * bloom * 0.24 * dim * u_rimGlow;

      // ---- float bulb (gas bladder) at the bent tip — amber and translucent,
      // present on only some blades the way real kelp pneumatocysts are ----
      float hasBulb = step(0.42, hash11(seed + 8.8));
      float bulbY = tipY - 7.0*pr;
      float tipX  = rootX + (bend + idle) * spacing * 1.05
                    + sin(5.0 + hPhase) * wig * (7.0*pr) * 0.8
                    + (18.0*pr) * (hash11(seed + 2.2) > 0.5 ? 1.0 : -1.0) * wig;
      vec2  bp    = vec2(fx - tipX, fc.y - bulbY);   // fx carries the distortion warp
      float bulbR = max(halfW * 0.55, 2.2*pr);
      float bd    = length(bp / vec2(bulbR, bulbR * 1.6));   // rounder, less elongated
      float bulb  = 1.0 - smoothstep(0.55, 1.0, bd);
      float bulbLit = 0.26 + 0.74 * flex;
      vec3  bulbCol = mix(rampCol, vec3(0.95, 0.78, 0.42), 0.5);   // amber float
      col += bulbCol * bulb * 0.55 * bulbLit * dim * hasBulb;
      col += vec3(0.98,0.92,0.70) * (1.0 - smoothstep(0.0, 0.42, bd)) * 0.18 * bulbLit * dim * hasBulb;
      col += bulbCol * exp(-bd*2.0) * 0.05 * (0.4 + 0.6*flex) * dim * hasBulb;
    }
  }

  // ---- rising bubbles drifting up through the column (u_bubbles amount/bright,
  // u_bubbleSize radius) ------------------------------------------------------
  float bAmt  = clamp(u_bubbles, 0.0, 2.0);
  float bSize = clamp(u_bubbleSize, 0.3, 3.0);
  for (int m = 0; m < 20; m++) {
    float fm = float(m);
    float bvis = step(hash11(fm + 8.0), min(bAmt, 1.0));   // thin the count when low
    float mx = hash11(fm + 0.5) * res.x;
    float wob = sin(t * (0.4 + 0.5*hash11(fm+2.0)) + fm) * 14.0*pr;
    float my = mod(hash11(fm + 4.0) * res.y + t * (10.0 + 14.0*hash11(fm+6.0)) * pr, res.y);
    vec2  mp = vec2(fc.x - (mx + wob), fc.y - my);
    float md = length(mp);
    float r  = (1.5 + 2.5*hash11(fm+3.0)) * pr * bSize;
    // bubble: bright thin rim + faint core
    float ring = exp(-pow((md - r) / (1.2*pr), 2.0));
    float core = exp(-md*md / (r*r*0.8));
    col += mix(c2, vec3(0.9,0.95,1.0), 0.5) * (ring * 0.5 + core * 0.18) * 0.7 * bvis * bAmt;
  }

  // gentle vignette + darker seafloor band to seat the holdfasts
  vec2 uv = fc / res;
  float vign = 1.0 - smoothstep(0.55, 1.28, length((uv - 0.5) * vec2(1.05, 1.0)));
  col *= mix(0.74, 1.0, vign);
  float floorShade = 1.0 - 0.40 * (1.0 - smoothstep(0.0, floorH, fc.y));
  col *= floorShade;

  col = col / (1.0 + col * 0.55);   // soft tonemap
  gl_FragColor = vec4(col, 1.0);
}
