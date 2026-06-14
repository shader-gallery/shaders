// char (Smolder) — REFRAMED onto a 3D OBJECT: the creeping burn-front now eats
// across a slowly turning sphere instead of a flat sheet. The ember terminator
// sweeps over the surface in object space, so the char it leaves — graded
// incandescent rim, glowing ember-crack network, cooling speckle sparks — is
// painted ON the globe and rotates with it. Ahead of the front the surface is
// virgin dark, lit by a key light + cool fresnel so the form reads in 3D; behind
// it the charred hemisphere glows. Two staggered burns crossfade while the
// surface is featureless so the consumption never visibly resets. The magenta/
// blue rim is kept as char's signature; everything themes from u_palette.
precision highp float;

uniform float u_time;        // seconds, monotonically increasing
uniform vec2  u_resolution;  // drawing-buffer size in device pixels
uniform vec2  u_mouse;       // pointer in device px, (0,0) when absent — unused
uniform float u_pixelRatio;  // devicePixelRatio of the buffer
uniform vec3  u_palette[4];  // four theme colours, 0..1 rgb

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_frontSpeed;     // how fast the burn front sweeps across the object (default 0.3)
uniform float u_rimWidth;       // width of the graded incandescent rim (default 14)
uniform float u_sparkDensity;   // amount of cooling speckle sparks on the char (default 0.45)
uniform float u_edgeRaggedness; // FBM perturbation of the front contour (default 1)
uniform float u_spin;           // rotation speed of the object (default 0.5)
uniform float u_zoom;           // camera zoom-out; larger fits the whole globe (default 1.6)

const vec3  BG  = vec3(0.020, 0.020, 0.028); // house near-black
const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// 3D value noise (trilinear), C1
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);
  return mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise3(p);
    p = p * 1.92 + vec3(11.7, 5.3, 2.1);
    a *= 0.5;
  }
  return s;
}

// object rotation: spin about Y, fixed tilt about X so both poles show.
mat3 rotMat(float a) {
  float ca = cos(a), sa = sin(a);
  mat3 ry = mat3(ca, 0.0, -sa,  0.0, 1.0, 0.0,  sa, 0.0, ca);
  float cx = cos(0.5), sx = sin(0.5);
  mat3 rx = mat3(1.0, 0.0, 0.0,  0.0, cx, -sx,  0.0, sx, cx);
  return rx * ry;
}

// one burn sheet painted in object space. Returns emissive rgb in .rgb and the
// char coverage (0 virgin .. 1 fully charred) in .a. `c` is the receding
// threshold the front sits at along the sweep axis.
vec4 burnSheet(vec3 lp, vec3 seed, float c, float ragAmp, float rimF,
               float sparkAmt, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  vec3 sweepDir = normalize(vec3(0.70, 0.42, 0.55));
  float sl = dot(sweepDir, lp);                         // -R .. R across object
  float f  = sl + ragAmp * (fbm3(lp * 1.7 + seed) - 0.5) * 2.0;
  float sd = f - c;                                     // >0 virgin ahead, <0 char

  float charAmt = smoothstep(rimF * 0.6, -rimF * 0.4, sd);
  float behind  = max(-sd, 0.0);
  float emberFade = exp(-behind * 2.6);                 // embers cool into the char

  vec3 emis = vec3(0.0);

  // glowing ember-crack network veining the charred surface (the shared
  // crack technique with kintsugi: ridged noise -> thin incandescent seams).
  float crackN = fbm3(lp * 5.5 + seed * 2.3);
  float crack  = 1.0 - smoothstep(0.0, 0.090, abs(crackN - 0.5));
  float crack2 = 1.0 - smoothstep(0.0, 0.055, abs(fbm3(lp * 11.0 + seed) - 0.5));
  emis += mix(c3, c1, 0.35) * (crack * 0.55 + crack2 * 0.30) * charAmt * emberFade;
  // broad dim ember bed glowing up through the char
  emis += (c3 * 0.55 + c2 * 0.45) * charAmt * (0.10 + 0.55 * emberFade) * 0.18
        * (0.45 + 0.55 * crackN);

  // cooling speckle sparks on the char side (cheap 3D-noise threshold)
  float spk   = fbm3(lp * 16.0 + seed * 3.7);
  float spark = smoothstep(0.66, 0.74, spk) * charAmt * sparkAmt;
  emis += mix(vec3(1.0, 0.9, 0.7), c3, 0.3) * spark * (0.3 + 0.7 * emberFade) * 1.3;

  // incandescent rim graded across its width (hottest c3 -> c1 -> c0 -> c2)
  float q  = clamp(-sd / rimF * 0.5 + 0.5, 0.0, 1.0);
  float on = 1.0 - smoothstep(0.0, rimF, abs(sd));
  vec3 ramp = c3;
  ramp = mix(ramp, c1, smoothstep(0.06, 0.34, q));
  ramp = mix(ramp, c0, smoothstep(0.34, 0.62, q));
  ramp = mix(ramp, c2, smoothstep(0.62, 0.95, q));
  float env = on * (0.10 + 0.90 * exp(-max(q, 0.0) * 1.9));
  float hot = exp(-(sd * sd) / (rimF * rimF * 0.06)); // thin white-hot crest
  emis += ramp * env * 1.10;
  emis += (c3 * 0.70 + vec3(0.30, 0.27, 0.22)) * hot * 0.50;

  // preheat bleeding a little into the virgin surface ahead of the front
  float ah = max(sd, 0.0);
  emis += (c3 * 0.85 + c1 * 0.15) * 0.30 * exp(-ah / (rimF * 0.6));

  return vec4(emis, charAmt);
}

// visibility weight over a sheet phase: full while its front crosses the object,
// fading in while virgin and out once fully char; rise/fall half a cycle apart
// so the two staggered sheets sum to ~1 (no dip at handoff).
float vis(float p) {
  return smoothstep(0.345, 0.405, p) * (1.0 - smoothstep(0.845, 0.905, p));
}

void main() {
  // palette with house fallback (headless contexts can leave it zeroed)
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr   = max(u_pixelRatio, 0.25);
  vec2  frag = gl_FragCoord.xy;
  vec2  res  = max(u_resolution.xy, vec2(1.0));
  float t    = u_time;

  float rimF    = max(u_rimWidth, 1.0) * 0.006;       // field-unit rim width
  float ragAmp  = clamp(u_edgeRaggedness, 0.0, 4.0) * 0.22;
  float sparkA  = clamp(u_sparkDensity, 0.0, 1.0);
  float rate    = max(u_frontSpeed, 0.001) * 0.06;
  float spin    = u_spin;

  // ---- camera ray (perspective); u_zoom widens the field of view so the whole
  // globe fits on any aspect (it was clipped top/bottom on wide/full screens).
  float zoom = max(u_zoom, 0.2);
  vec2 uv = (frag - 0.5 * res) / res.y;
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv * 1.05 * zoom, -1.6));

  // ---- analytic ray-sphere
  float R = 1.30;
  float b = dot(ro, rd);
  float cc = dot(ro, ro) - R * R;
  float disc = b * b - cc;

  vec3 col = BG;

  if (disc > 0.0) {
    float tHit = -b - sqrt(disc);
    if (tHit > 0.0) {
      vec3 p = ro + rd * tHit;
      vec3 n = normalize(p);
      mat3 rot = rotMat(t * spin * 0.3);
      vec3 lp = rot * p;                 // object-space sample (turns with object)

      // two crossfaded burns sweeping along the object's sweep axis
      float ph0 = fract(t * rate + 0.53);
      float ph1 = fract(ph0 + 0.5);
      float w0 = vis(ph0), w1 = vis(ph1);
      float cT0 = mix(-1.55, 1.55, ph0);
      float cT1 = mix(-1.55, 1.55, ph1);

      vec4 s0 = burnSheet(lp, vec3(3.7, 17.3, 1.1), cT0, ragAmp, rimF, sparkA, c0, c1, c2, c3);
      vec4 s1 = burnSheet(lp, vec3(-11.1, 5.9, 8.4), cT1, ragAmp, rimF, sparkA, c0, c1, c2, c3);

      float wsum = max(w0 + w1, 1e-3);
      float charAmt = (s0.a * w0 + s1.a * w1) / wsum;
      vec3 emis = s0.rgb * w0 + s1.rgb * w1;

      // ---- base surface material: a SOLID, clearly-visible marbled sphere so
      // the object reads as a real 3D body BEFORE the burn reaches it (was near
      // black / invisible). Palette-tinted continents of marbling over a lit body.
      float grain  = fbm3(lp * 2.6 + 2.0);
      float grain2 = fbm3(lp * 7.5 + 7.0);
      float veinM  = 1.0 - smoothstep(0.0, 0.10, abs(fbm3(lp * 4.0 + 11.0) - 0.5));
      vec3 matLo = mix(c0, c1, 0.5) * 0.34 + vec3(0.05);     // body base
      vec3 matHi = mix(c2, c0, 0.5) * 0.55 + vec3(0.08);     // lighter marbling
      vec3 surf  = mix(matLo, matHi, smoothstep(0.36, 0.66, grain));
      surf *= 0.74 + 0.5 * grain2;                            // mottle the surface
      surf += mix(c2, c0, 0.4) * veinM * 0.12;                // faint surface veining
      // char darkens (but never to invisible — a charred crust, not a hole)
      vec3 baseMat = mix(surf, surf * 0.16 + vec3(0.012), charAmt);

      vec3 L = normalize(vec3(0.55, 0.65, 0.55));
      float diff = clamp(dot(n, L), 0.0, 1.0);
      float fres = 1.0 - clamp(dot(n, -rd), 0.0, 1.0);
      fres = fres * fres * fres;
      vec3 lit = baseMat * (0.34 + 0.95 * diff);             // brighter ambient floor
      // soft specular sheen so the unburnt body reads as a solid ball
      vec3 H = normalize(L - rd);
      float spec = pow(max(dot(n, H), 0.0), 22.0) * (1.0 - 0.8 * charAmt);
      lit += vec3(1.0, 0.97, 0.92) * spec * 0.22;
      lit += mix(c2, c0, 0.5) * fres * 0.45;                 // cool atmosphere rim

      col = lit + emis;                                       // emissive embers on top
    }
  }

  // gentle vignette to seat the object in the dark frame
  vec2 v = frag / res;
  col *= 1.0 - 0.32 * smoothstep(0.45, 1.12, length(v - 0.5) * 1.42);

  // tiny dither to keep long glow gradients band-free
  col += (hash21(frag + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
