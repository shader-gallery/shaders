



// cradle (Loom) - anchored string art with depth. Bright cradle-point anchors
// sit on the screen edges; chords fan from each to its neighbours. The figure is
// drawn in several nested depth levels (front reaches the edges, deeper ones sit
// inset and dimmer) and can be twisted / skewed off-axis to break the symmetry.
// (Comments kept short/ASCII - the headless-gl poster compiler is fussy.)
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_anchors;
uniform float u_linesPer;
uniform float u_morphSpeed;
uniform float u_line;
uniform float u_glintSpeed;
uniform float u_scatter;
uniform float u_tint;
uniform float u_layers;
uniform float u_depth;
uniform float u_depthFade;
uniform float u_twist;
uniform float u_skew;
uniform float u_layerSeed;

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}


vec2 anchorPos(float idx, float nA, vec2 ctr, vec2 halfExt, float t, float morph,
               float scatter, float rot, float seed) {
  // even angle around the ring, plus a per-anchor random angular offset so the
  // anchors stay on the screen edge but at uneven, asymmetric positions. rot
  // turns the whole ring (per-layer parallax); seed re-lays the jitter per layer.
  float jit = (hash11(idx + 1.0 + seed) - 0.5) * scatter * (6.2831853 / nA) * 1.7;
  float ang = 6.2831853 * idx / nA + t * morph * 0.13 + jit + rot;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 tt = halfExt / max(abs(dir), vec2(0.0001));
  float tedge = min(tt.x, tt.y);
  float br = 0.975 + 0.022 * sin(t * morph * 0.27 + idx * 1.7);
  br *= 1.0 - scatter * 0.14 * hash11(idx + 9.3 + seed);   // tiny radial scatter
  return ctr + dir * tedge * br;
}

// perspective-ish shear: x stretches with height and y compresses toward the
// top, tilting the whole figure off its symmetric centre to add a vanishing read.
vec2 skewP(vec2 p, vec2 ctr, vec2 rad, float sk) {
  vec2 r = p - ctr;
  float ny = r.y / max(rad.y, 1.0);
  r.x *= 1.0 + sk * ny;
  r.y *= 1.0 - sk * 0.18 * ny;
  return ctr + r;
}


float segDistH(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.0), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  float pr  = u_pixelRatio;
  vec2  fc  = gl_FragCoord.xy;
  vec2  res = u_resolution;
  vec2  ctr = res * 0.5;
  float t   = u_time;

  float refScale = min(res.x, res.y) / (max(pr, 1.0) * 400.0);
  vec2  rad = res * 0.5;
  float nA  = max(floor(u_anchors + 0.5), 3.0);
  float mPer = max(floor(u_linesPer + 0.5), 1.0);
  float lw  = max(u_line, 0.4) * refScale * pr;
  float nL  = max(floor(u_layers + 0.5), 1.0);

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 acc = vec3(0.0);

  // draw back-to-front so nearer layers read brightest over the dim deep ones.
  for (int L = 4; L >= 0; L--) {
    if (float(L) >= nL) continue;
    float lf = nL > 1.0 ? float(L) / (nL - 1.0) : 0.0;   // 0 = front, 1 = deepest
    float scaleL = 1.0 - u_depth * lf * 0.72;            // deeper sits inset
    float rotL = u_twist * lf * 3.14159;                 // per-layer twist
    float seedL = float(L) * 31.7 * u_layerSeed;         // independent jitter
    float dimL = mix(1.0, max(0.0, 1.0 - u_depthFade), lf);
    float lwL = lw * mix(1.0, 0.78, lf);                 // deeper lines thinner
    float hueL = float(L) * 0.11;
    vec2 radL = rad * scaleL;


    for (int i = 0; i < 24; i++) {
      if (float(i) >= nA) break;
      vec2 A = skewP(anchorPos(float(i), nA, ctr, radL, t, u_morphSpeed, u_scatter, rotL, seedL), ctr, rad, u_skew);
      for (int k = 1; k <= 12; k++) {
        if (float(k) > mPer) break;
        vec2 B = skewP(anchorPos(mod(float(i) + float(k), nA), nA, ctr, radL, t, u_morphSpeed, u_scatter, rotL, seedL), ctr, rad, u_skew);
        float h;
        float d = segDistH(fc, A, B, h);

        float core = smoothstep(lwL, 0.0, d);
        float halo = lwL / (d + lwL * 1.3);
        halo = halo * halo * 0.6;

        vec3 cc = wheelCol(float(k) / mPer * 0.7 + float(i) * 0.013 + t * 0.02 + hueL, c0, c1, c2, c3);
        // line colour: u_tint mixes the chord between white (0) and full palette (1)
        vec3 lc = mix(vec3(1.0), cc, clamp(u_tint, 0.0, 1.0));
        float bead = exp(-pow((fract(h - t * u_glintSpeed * 0.25 + float(i) * 0.31) - 0.5) * 7.0, 2.0));
        acc += lc * (core * 1.0 + halo) * (0.68 + 0.45 * bead) * dimL;
      }
    }


    for (int i = 0; i < 24; i++) {
      if (float(i) >= nA) break;
      vec2 A = skewP(anchorPos(float(i), nA, ctr, radL, t, u_morphSpeed, u_scatter, rotL, seedL), ctr, rad, u_skew);
      float dn = length(fc - A);
      float node = exp(-pow(dn / (lwL * 3.5), 2.0));
      vec3 cc = wheelCol(float(i) / nA + t * 0.02 + hueL, c0, c1, c2, c3);
      vec3 nc = mix(vec3(1.0), cc, clamp(u_tint, 0.0, 1.0) * 0.7 + 0.15);
      acc += nc * node * 1.3 * dimL;
    }
  }


  float rr = length((fc - ctr) / res);
  vec3 back = wheelCol(0.15 + rr * 0.6 + t * 0.01, c0, c1, c2, c3);
  vec3 col = back * (0.10 + 0.05 * (1.0 - rr)) + acc;


  float vign = 1.0 - smoothstep(0.62, 1.3, rr);
  col *= mix(0.85, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
