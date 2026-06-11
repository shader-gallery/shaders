// lens (Shoal) — caustics and refracted light. Three large invisible lens blobs
// roam a deliberately faint background — a barely-there diagonal gradient
// threaded with dim FBM wisps near the house dark base. Each blob displaces the
// background's sampling coordinates radially through a smooth SDF falloff (zero
// at center and beyond the edge, strongest mid-rim), magnifying and smearing
// whatever lies behind it, and a hairline bright rim ignites exactly where the
// displacement gradient peaks, tinted per-blob from the palette. The only entry
// whose subject is distortion itself — light bends instead of emitting.
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
uniform float u_lens;     // CSS-px radius of each lens blob   (default 260), scaled by u_pixelRatio
uniform float u_roam;     // Lissajous drift speed             (default 0.2)
uniform float u_refract;  // refraction / magnify strength     (default 1.2)

const vec3  BG       = vec3(0.035, 0.035, 0.043); // near-black base ~#09090B
const float NLENS    = 3.0;                        // number of roaming lens blobs (literal const)

// cheap hash + value-noise for the faint background wisps
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + vec2(7.1, 3.7);
    a *= 0.5;
  }
  return v;
}

// the faint background field, sampled in CSS-px space. Deliberately dim: a
// barely-there diagonal gradient threaded with low FBM wisps over the dark base.
vec3 background(vec2 uvc, float t, vec3 ca, vec3 cb) {
  // diagonal gradient, very gentle
  float g = clamp(0.5 + dot(uvc, normalize(vec2(0.7, 0.55))) * 0.45, 0.0, 1.0);
  // slow drifting FBM wisps
  float w = fbm(uvc * 2.1 + vec2(t * 0.05, -t * 0.03));
  w = smoothstep(0.45, 0.95, w);
  vec3 tint = mix(ca, cb, g);
  // keep it faint — wisps and gradient ride just above the dark base
  vec3 col = BG;
  col += tint * (0.045 + 0.10 * g);   // dim diagonal wash
  col += tint * w * 0.13;             // dim threaded wisps
  return col;
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  // normalized, aspect-correct coordinates in "tile units" (centred, ~[-1,1] in y)
  float minside = min(res.x, res.y);
  vec2  uv = (fc - ctr) / minside;       // sampling space
  float aspect = res.x / res.y;

  // Palette fallback (headless contexts can leave the array zeroed).
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  // lens radius in sampling units (CSS px -> device px -> sampling units)
  float lensR = max(u_lens, 1.0) * pr / minside;
  float roam  = u_roam;
  float refr  = max(u_refract, 0.0);

  // accumulate radial displacement from all lenses, plus a per-pixel rim glow
  vec2  disp = vec2(0.0);
  vec3  rim  = vec3(0.0);

  for (int i = 0; i < 3; i++) {  // NLENS, literal bound
    float fi = float(i);
    // incommensurate Lissajous frequencies per blob — no readable repeat,
    // all sinusoidal so there is no wrap to hide.
    float px = 0.62 * sin(t * roam * (0.23 + fi * 0.071) + fi * 2.1)
             + 0.18 * sin(t * roam * (0.41 + fi * 0.053) + fi * 5.3);
    float py = 0.50 * sin(t * roam * (0.19 + fi * 0.067) + fi * 4.7)
             + 0.16 * sin(t * roam * (0.37 + fi * 0.043) + fi * 1.3);
    vec2 center = vec2(px * (aspect * 0.55), py * 0.55);

    vec2  d  = uv - center;
    float r  = length(d);
    float rn = r / max(lensR, 1e-4);                 // 0 at center, 1 at edge

    // smooth SDF falloff: zero at center AND beyond edge, strongest mid-rim.
    // f peaks near rn~0.5; gradient (rim) peaks where f changes fastest.
    float inside = 1.0 - smoothstep(0.0, 1.0, rn);   // 1 center -> 0 edge
    float falloff = inside * smoothstep(0.0, 0.55, rn); // 0 at center, 0 at edge
    falloff = falloff * 4.0;                          // normalize the product peak ~1

    // per-blob breathing of refraction strength on its own phase
    float refrBreath = 0.7 + 0.3 * sin(t * roam * 0.8 + fi * 2.4);
    float strength = refr * refrBreath;

    // radial displacement: push sampling outward through the falloff so the
    // background magnifies (pulled-in) and smears across the rim.
    vec2 dir = d / max(r, 1e-4);
    disp += -dir * falloff * lensR * 0.55 * strength;

    // hairline rim where the displacement gradient peaks (edge of falloff band).
    // band centred where the radial derivative of falloff is largest (~rn 0.78).
    float band = exp(-pow((rn - 0.80) / 0.085, 2.0));
    float rimBreath = 0.6 + 0.4 * sin(t * roam * 1.1 + fi * 1.7);
    // per-blob tint cycles through palette entries
    vec3 tintA = (i == 0) ? c0 : ((i == 1) ? c2 : c1);
    vec3 tintB = (i == 0) ? c2 : ((i == 1) ? c3 : c0);
    vec3 tint  = mix(tintA, tintB, 0.5 + 0.5 * sin(t * roam * 0.5 + fi));
    rim += tint * band * rimBreath * (0.7 + 0.5 * strength);
  }

  // sample the faint background at the displaced coordinates -> magnify/smear
  vec3 col = background(uv + disp, t, mix(c0, c2, 0.5), mix(c1, c3, 0.5));

  // ignite the hairline rim on top
  col += rim * 0.55;

  // gentle vignette to keep the frame composed and edges dark
  float vign = 1.0 - smoothstep(0.55, 1.25, length(uv) / max(aspect, 1.0));
  col *= mix(0.78, 1.0, vign);

  // subtle tone shaping — keep blacks near house base, accents luminous
  col = max(col, BG * 0.85);

  gl_FragColor = vec4(col, 1.0);
}
