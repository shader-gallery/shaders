// banner (Veil) — a single long swallow-tailed pennant hangs alone in an empty
// near-black field. A tapering 2D SDF silhouette, pinned at the hoist on the
// left, whose edges and surface are displaced by a travelling wind-wave that
// grows in amplitude toward the free swallow-tail. Surface shading comes from
// the wave's derived normals (a sliding sheen along crests), hue blending along
// the cloth's length, and a soft ring emblem riding the surface that shears and
// stretches as each wave passes beneath it.
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
uniform float u_windSpeed;   // travelling-wave speed along the pennant (default 0.5)
uniform float u_span;        // pennant length hoist->tip, css px        (default 560)
uniform float u_emblemGlow;  // brightness of the ring emblem            (default 0.5)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float PI       = 3.14159265;
const float TAU      = 6.28318531;

// cyclic triangular weight for a palette entry centred at c on a 0..4 wheel
float wheelW(float s, float c) {
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}

// The travelling wave: vertical displacement of the cloth at length-fraction x
// (0 hoist .. 1 tip) and phase. Amplitude grows toward the free end so the
// pinned hoist barely stirs while the tail flutters. Returns displacement in
// banner-local y units (banner half-height ~ 0.5).
float waveDisp(float x, float ph) {
  // amplitude envelope: ~0 at hoist, growing toward tip (quadratic-ish ramp)
  float amp = x * x * 0.55 + x * 0.10;
  // primary wind-wave plus a smaller second harmonic for organic cloth motion
  float w  = sin(x * 5.2 - ph);
  float w2 = sin(x * 9.7 - ph * 1.7 + 0.6) * 0.35;
  return (w + w2) * amp;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  float t   = u_time;

  vec3 col = BG;

  // ---- palette with house fallback (headless can leave the array zeroed) ----
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // ---- banner-local coordinate frame ----------------------------------------
  // span is the full pennant length in css px; guard against 0 so min slider is
  // still a (tiny) banner rather than a divide-by-zero.
  float span = max(u_span, 1.0) * pr;
  float H    = span * 0.30;                 // hoist half-height proportional to length
  vec2  ctr  = res * 0.5;
  // centre the pennant; the hoist sits left of centre so the tail can stream right
  vec2  org  = ctr - vec2(span * 0.46, 0.0);
  // p.x in [0..1] along the cloth, p.y in banner half-height units (~ +/-1 at hoist)
  vec2  rel  = fc - org;
  float x    = rel.x / span;                // length fraction (can be <0 or >1 off-cloth)
  float y    = rel.y / H;                    // vertical in half-height units

  // ---- travelling wave & the cloth's local sheet ---------------------------
  float ph    = t * u_windSpeed * 2.2;       // continuously advancing phase
  float disp  = waveDisp(x, ph);             // cloth centreline displacement (half-height units)
  // surface slope from analytic derivative -> drives sheen & normal shear
  float dx    = 0.012;
  float slope = (waveDisp(x + dx, ph) - waveDisp(x - dx, ph)) / (2.0 * dx);

  // ---- pennant silhouette (SDF) --------------------------------------------
  float yc = y - disp;                                       // pixel y relative to the displaced cloth centreline

  // half-height of the cloth tapers from 1.0 at the hoist toward the tip
  float taper = mix(1.0, 0.46, clamp(x, 0.0, 1.0));         // body half-height profile

  // swallow-tail: the trailing edge is a deep V-notch. The rightmost reachable
  // length-fraction depends on distance from the centreline: the two outer forks
  // reach x=1.0 while the centre is cut back to ~xNotch, forming the swallow.
  float ay      = abs(yc) / max(taper, 0.001);               // 0 centre .. 1 outer edge of cloth
  float xNotch  = 0.78;                                      // how far back the centre of the fork is cut
  float rightEdge = mix(xNotch, 1.0, clamp(ay, 0.0, 1.0));   // V-shaped trailing edge

  // SDFs (px-ish): vertical band, hoist end, and the V swallow-tail trailing edge
  float sdY   = (abs(yc) - taper) * H;                       // >0 above/below the cloth band
  float sdXl  = (-x) * span;                                 // >0 left of the hoist
  float sdXr  = (x - rightEdge) * span;                      // >0 past the V trailing edge
  float sd    = max(max(sdY, sdXl), sdXr);                   // >0 outside the cloth
  float halfH = taper;                                       // local half-height for shading below

  // soft anti-aliased coverage of the cloth silhouette
  float aa    = pr * 1.4;
  float cloth = 1.0 - smoothstep(0.0, aa, sd);

  // ---- surface shading on the cloth ----------------------------------------
  // a pseudo-normal from the slope; sheen rides the crests (where slope ~ 0 and
  // the cloth faces "up") sliding along the length as the wave travels.
  float nlen  = sqrt(1.0 + slope * slope);
  float facing = 1.0 / nlen;                                 // 1 on a flat crest, less on steep slopes
  // fold lighting: treat the wave slope as a surface tilt lit from the upper-left.
  // crests (slope rising through 0) catch light, the backs of folds fall to dark,
  // giving travelling bands of brightness rolling along the cloth.
  float fold   = clamp(0.5 - slope * 0.6, 0.0, 1.0);         // 0 dark trough .. 1 lit crest face
  fold = fold * fold;
  // crest sheen: a tight specular streak riding the very top of each wave crest
  float crest  = 0.5 + 0.5 * cos(x * 5.2 - ph);              // 1 at crests of the primary wave
  float sheen  = pow(clamp(crest, 0.0, 1.0), 6.0) * facing;
  // shade across the band height so the cloth reads as a lit sheet, edges darker
  float across = 0.5 + 0.5 * cos((yc / max(halfH, 0.001)) * PI * 0.5);
  float shade  = mix(0.10, 1.0, across) * mix(0.30, 1.0, fold);

  // hue blends along the cloth length: palette wheel walked by x with a slow roll
  float s  = fract(x * 0.85 + t * 0.015) * 4.0;
  float w0 = wheelW(s,0.0), w1 = wheelW(s,1.0), w2 = wheelW(s,2.0), w3 = wheelW(s,3.0);
  vec3  hue = (c0*w0 + c1*w1 + c2*w2 + c3*w3) / max(w0+w1+w2+w3, 0.001);

  // base cloth colour: dark body + travelling fold light + sheen on the crests
  vec3 clothCol = hue * (shade * 0.50 + sheen * 0.80);
  // a brighter edge-light along the silhouette so the pennant reads crisply
  float rim = (1.0 - smoothstep(0.0, aa * 2.0, abs(sd))) * cloth;
  clothCol += hue * rim * 0.5;

  // ---- emblem: a soft glowing ring riding the cloth ------------------------
  // the emblem sits at a fixed length-fraction; it follows the cloth's vertical
  // displacement and shears/stretches with the local slope as waves pass under.
  float ex = 0.40;                                            // length-fraction of emblem centre
  float edisp = waveDisp(ex, ph);                             // cloth displacement under the emblem
  float eshear = slope * 0.45;                                // local cloth slope -> emblem skew
  float ux = (x - ex) * 6.5;                                  // stretch along the cloth length
  float uy = (y - edisp);                                     // vertical, anchored to the emblem's cloth point
  uy -= eshear * ux * 0.12;                                   // shear with each passing wave
  float er = length(vec2(ux, uy * 2.1));                      // elliptical ring radius
  // soft annulus: glow peaking at radius ~1.0
  float ring = exp(-pow((er - 1.0) * 2.4, 2.0));
  // emblem brightens as a wave crest passes beneath it
  float ePulse = 0.55 + 0.45 * (0.5 + 0.5 * cos(ex * 5.2 - ph));
  vec3  emblemCol = mix(c2, c3, 0.5) * ring * ePulse * u_emblemGlow * 1.6;

  // ---- composite cloth + emblem, masked to the silhouette ------------------
  vec3 surf = clothCol + emblemCol * cloth;
  col += surf * cloth;

  // ---- soft halo just outside the cloth so it floats in the dark ------------
  float halo = (1.0 - smoothstep(0.0, span * 0.06, max(sd, 0.0))) * (1.0 - cloth);
  // halo only where we're vertically near the band (avoid a big rectangle glow)
  float haloMask = 1.0 - smoothstep(0.0, span * 0.05, max(sdY, 0.0));
  col += hue * halo * haloMask * 0.10 * (0.5 + 0.5 * sheen);

  // gentle global vignette to settle the empty field
  float vign = 1.0 - smoothstep(0.35, 1.1, length((fc - ctr) / res));
  col *= mix(0.82, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
