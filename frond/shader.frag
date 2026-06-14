// frond (Smolder) — REFRAMED as a POTHOS VINE (Epipremnum aureum): a curtain of
// small heart-shaped leaves trailing down several vines, filling the frame. Each
// leaf keeps frond's identity at small scale — a glowing midrib + herringbone
// veins and a glowing margin (the blue-vein / red-margin contrast) — plus cream
// variegation. The vine SHAPES are fixed; only a gentle oscillating breeze sways
// the leaves and the trailing tips (no sideways drift). Leaves are z-composited so
// the nearest one wins, reading as layered foliage rather than additive mush.
// Fully palette-themeable.
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_leafSize;     // heart leaf radius in CSS px (default 38)
uniform float u_leafDensity;  // how full the curtain is, 0..1 (default 0.7)
uniform float u_veinGlow;     // brightness of the cool midrib/herringbone veins (default 0.7)
uniform float u_marginGlow;   // brightness of the warm glowing leaf margin (default 0.6)
uniform float u_sway;         // breeze sway amount, 0..1 (default 0.5)
uniform float u_variegation;  // cream variegation patch amount, 0..1 (default 0.5)

const vec3  BG = vec3(0.015, 0.022, 0.018); // deep foliage near-black
const int   VINES  = 6;
const int   LEAVES = 9;

float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
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
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

// STATIC vine shape: fixed curve hanging from the top of the frame down past the
// bottom, wandering horizontally. No time term — the shape never drifts.
vec2 vinePoint(float fv, float s, vec2 res, out vec2 tang) {
  float h0 = hash11(fv * 1.7 + 1.0);
  float h1 = hash11(fv * 2.3 + 4.0);
  float startX = (fv + 0.5) / float(VINES) * res.x + (h0 - 0.5) * res.x * 0.12;
  float amp    = res.x * (0.05 + 0.09 * h1);
  float freq   = 1.2 + 1.3 * h0;
  float phase  = fv * 2.1;
  float y = res.y * 1.12 - s * res.y * 1.24;             // top -> bottom
  float wob = sin(s * freq * 3.14159 + phase) + 0.4 * sin(s * freq * 6.3 + phase * 1.7);
  float x = startX + amp * wob;
  float s2 = s + 1.0 / 64.0;
  float wob2 = sin(s2 * freq * 3.14159 + phase) + 0.4 * sin(s2 * freq * 6.3 + phase * 1.7);
  float x2 = startX + amp * wob2;
  float y2 = res.y * 1.12 - s2 * res.y * 1.24;
  tang = normalize(vec2(x2 - x, y2 - y));
  return vec2(x, y);
}

// heart / cordate implicit, lobes at +y (cleft toward petiole), cusp/tip at -y.
float heartField(vec2 p) {
  float x = p.x, y = p.y;
  float a = x * x + y * y - 1.0;
  return a * a * a - x * x * y * y * y;
}

void main() {
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  float pr   = max(u_pixelRatio, 0.25);
  vec2  cssP = gl_FragCoord.xy / pr;
  vec2  res  = max(u_resolution / pr, vec2(1.0));
  float t    = u_time;

  float leafR  = max(u_leafSize, 8.0);
  float dens   = clamp(u_leafDensity, 0.0, 1.0);
  float vGlow  = clamp(u_veinGlow, 0.0, 1.5);
  float mGlow  = clamp(u_marginGlow, 0.0, 1.5);
  float sway   = clamp(u_sway, 0.0, 1.0);
  float varieg = clamp(u_variegation, 0.0, 1.0);

  // palette-derived leaf colours
  vec3 foliageHi = c2 * 0.55 + c0 * 0.12 + vec3(0.02);   // lit leaf face
  vec3 foliageLo = c2 * 0.20 + c1 * 0.10;                // shadowed leaf
  vec3 veinCol   = c0 * 0.95 + c2 * 0.25 + vec3(0.05);   // cool veins
  vec3 marginC   = c3 * 1.00 + c1 * 0.15;                // warm margin
  vec3 varCol    = c2 * 0.6  + vec3(0.45);               // pale cream variegation
  vec3 stemCol   = c2 * 0.45 + c0 * 0.16;

  // base + stem layer (behind the leaves)
  vec3 base = BG + (c2 * 0.05 + c1 * 0.03) * vnoise(cssP / 90.0);
  float activeLeaves = mix(3.0, float(LEAVES), dens);

  // z-buffer: keep the nearest leaf covering this pixel (clean occlusion)
  float bestZ = -1.0;
  vec3  bestCol = vec3(0.0);
  float bestCov = 0.0;

  for (int vi = 0; vi < VINES; vi++) {
    float fv = float(vi);
    if (fv > mix(2.5, float(VINES), dens)) continue;

    vec2 prevAttach = vec2(0.0);
    bool havePrev = false;

    for (int li = 0; li < LEAVES; li++) {
      float fl = float(li);
      if (fl >= activeLeaves) break;

      float s = (fl + 0.6) / float(LEAVES);
      vec2 tang;
      vec2 P = vinePoint(fv, s, res, tang);
      vec2 nrm = vec2(-tang.y, tang.x);

      // gentle OSCILLATING breeze: sways more toward the trailing tip, never drifts
      float swayA = sin(t * 1.1 + fv * 2.0 + s * 3.2) * sway * leafR * 0.9 * (0.3 + s);
      vec2 Pp = P + nrm * swayA;

      // stem segment (drawn into the base, behind leaves)
      if (havePrev) {
        float ds = sdSeg(cssP, prevAttach, Pp);
        base += stemCol * exp(-ds * ds / (leafR * leafR * 0.020)) * 0.7;
      }
      prevAttach = Pp;
      havePrev = true;

      // leaves hang downward with a slight alternating outward splay
      float side = (mod(fl, 2.0) < 1.0) ? 1.0 : -1.0;
      float hSize = 0.78 + 0.5 * hash11(fv * 5.0 + fl * 1.7);
      float hDep  = hash11(fv * 11.0 + fl * 2.3);          // depth 0..1 (front=1)
      float lr    = leafR * hSize * (0.72 + 0.5 * hDep);
      vec2 tipDir = normalize(vec2(side * 0.55, -1.0));     // hang down + splay
      // sway the hang direction a touch (swing), in step with the breeze
      float swR = sin(t * 1.1 + fv * 2.0 + s * 3.2 + 0.6) * sway * 0.18;
      tipDir = normalize(tipDir + nrm * swR);
      vec2 ctr = Pp + tipDir * lr * 1.05;

      vec2 rel = cssP - ctr;
      if (dot(rel, rel) > lr * lr * 3.0) continue;

      // leaf-local frame: +y points up toward the cleft/petiole (= -tipDir)
      vec2 up = -tipDir;
      vec2 rt = vec2(up.y, -up.x);
      vec2 q  = vec2(dot(rel, rt), dot(rel, up)) / lr;

      vec2 hp = vec2(q.x * 1.04, q.y * 1.12 + 0.42);
      float f = heartField(hp);
      float cov = smoothstep(0.10, -0.22, f);
      if (cov < 0.02) continue;

      // veins: midrib + herringbone (in leaf-local space)
      float midrib = exp(-hp.x * hp.x / 0.009);
      float herb = abs(hp.x) * 2.3 - hp.y;
      float lp2  = fract(herb * 2.2) - 0.5;
      float lat  = exp(-(lp2 * lp2) / 0.013) * smoothstep(0.95, 0.2, abs(hp.x));
      float veins = max(midrib, lat * 0.7);
      // margin band hugging the outline
      float rim = exp(-f * f / 0.022) * smoothstep(0.16, -0.05, f);
      // variegation blotches
      float vg = vnoise(q * 3.2 + vec2(fv * 4.0, fl * 2.0));
      float varMask = smoothstep(0.58, 0.84, vg) * varieg;
      // simple form shading: brighter near the midrib/upper leaf, darker at edges
      float shade = clamp(0.45 + 0.55 * (1.0 - abs(hp.x)) - 0.2 * smoothstep(0.0,-0.2,f), 0.0, 1.0);

      vec3 leafCol = mix(foliageLo, foliageHi, shade);
      leafCol = mix(leafCol, varCol, varMask * 0.7);
      leafCol += veinCol * veins * vGlow * 0.7;
      leafCol += marginC * rim * mGlow * 0.9;
      leafCol *= 0.55 + 0.6 * hDep;                          // far leaves a bit dimmer

      if (hDep > bestZ) {                                    // nearest leaf wins
        bestZ = hDep;
        bestCol = leafCol;
        bestCov = cov;
      }
    }
  }

  vec3 col = mix(base, bestCol, bestCov);

  // gentle vignette
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  col *= 1.0 - 0.28 * smoothstep(0.5, 1.15, length(uv - 0.5) * 1.40);

  // tiny dither
  col += (hash21(gl_FragCoord.xy + fract(t) * vec2(13.1, 7.7)) - 0.5) * 0.004;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
