





// cradle (Loom) - anchored string art. Bright cradle-point anchors sit on the
// screen edges; chords fan from each to its neighbours and the overlapping
// families trace glowing envelope curves. Full description in meta.json.
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

float wheelW(float s, float c) { float d = abs(s - c); return max(0.0, 1.0 - min(d, 4.0 - d)); }
vec3 wheelCol(float k, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  float s = fract(k) * 4.0;
  float a = wheelW(s, 0.0), b = wheelW(s, 1.0), cc = wheelW(s, 2.0), dd = wheelW(s, 3.0);
  return (c0 * a + c1 * b + c2 * cc + c3 * dd) / max(a + b + cc + dd, 0.001);
}


vec2 anchorPos(float idx, float nA, vec2 ctr, vec2 halfExt, float t, float morph) {
  float ang = 6.2831853 * idx / nA + t * morph * 0.13;
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 tt = halfExt / max(abs(dir), vec2(0.0001));
  float tedge = min(tt.x, tt.y);
  float br = 0.975 + 0.022 * sin(t * morph * 0.27 + idx * 1.7);
  return ctr + dir * tedge * br;
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

  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec3 acc = vec3(0.0);

  
  for (int i = 0; i < 24; i++) {
    if (float(i) >= nA) break;
    vec2 A = anchorPos(float(i), nA, ctr, rad, t, u_morphSpeed);
    for (int k = 1; k <= 12; k++) {
      if (float(k) > mPer) break;
      vec2 B = anchorPos(mod(float(i) + float(k), nA), nA, ctr, rad, t, u_morphSpeed);
      float h;
      float d = segDistH(fc, A, B, h);
      
      float core = smoothstep(lw, 0.0, d);
      float halo = lw / (d + lw * 1.3);
      halo = halo * halo * 0.6;
      
      vec3 cc = wheelCol(float(k) / mPer * 0.7 + float(i) * 0.013 + t * 0.02, c0, c1, c2, c3);
      
      float bead = exp(-pow((fract(h - t * u_glintSpeed * 0.25 + float(i) * 0.31) - 0.5) * 7.0, 2.0));
      acc += cc * (core * 1.3 + halo) * (0.75 + 0.7 * bead);
    }
  }

  
  for (int i = 0; i < 24; i++) {
    if (float(i) >= nA) break;
    vec2 A = anchorPos(float(i), nA, ctr, rad, t, u_morphSpeed);
    float dn = length(fc - A);
    float node = exp(-pow(dn / (lw * 3.5), 2.0));
    vec3 cc = wheelCol(float(i) / nA + t * 0.02, c0, c1, c2, c3);
    acc += cc * node * 1.4;
  }

  
  float rr = length((fc - ctr) / res);
  vec3 back = wheelCol(0.15 + rr * 0.6 + t * 0.01, c0, c1, c2, c3);
  vec3 col = back * (0.10 + 0.05 * (1.0 - rr)) + acc;

  
  float vign = 1.0 - smoothstep(0.62, 1.3, rr);
  col *= mix(0.85, 1.0, vign);

  gl_FragColor = vec4(col, 1.0);
}
