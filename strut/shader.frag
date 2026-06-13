precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_gauge;          // edge-tube thickness   (default 0.45)
uniform float u_glow;           // brightness            (default 0.7)
uniform float u_depth;          // far-edge dimming      (default 0.6)
uniform float u_spin;           // tumble speed          (default 0.5)
uniform float u_mouseInfluence; // pointer parallax      (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// 20 icosahedron face normals (= normalised dodecahedron vertices).
// Keep top-two plane dots so an edge is where the two largest tie.
const float A = 0.57735027;   // 1/sqrt(3)
const float P = 0.93417236;   // phi / sqrt(3)
const float Q = 0.35682209;   // (1/phi) / sqrt(3)

void acc(vec3 p, vec3 n, inout float m1, inout float m2){
  float d = dot(p, n);
  if (d > m1){ m2 = m1; m1 = d; } else if (d > m2){ m2 = d; }
}

// returns vec2(largest, second-largest) face dot
vec2 faceTop2(vec3 p){
  float m1 = -1e9, m2 = -1e9;
  acc(p, vec3( A, A, A), m1, m2); acc(p, vec3( A, A,-A), m1, m2);
  acc(p, vec3( A,-A, A), m1, m2); acc(p, vec3( A,-A,-A), m1, m2);
  acc(p, vec3(-A, A, A), m1, m2); acc(p, vec3(-A, A,-A), m1, m2);
  acc(p, vec3(-A,-A, A), m1, m2); acc(p, vec3(-A,-A,-A), m1, m2);
  acc(p, vec3(0.0, Q, P), m1, m2); acc(p, vec3(0.0, Q,-P), m1, m2);
  acc(p, vec3(0.0,-Q, P), m1, m2); acc(p, vec3(0.0,-Q,-P), m1, m2);
  acc(p, vec3( P, 0.0, Q), m1, m2); acc(p, vec3( P, 0.0,-Q), m1, m2);
  acc(p, vec3(-P, 0.0, Q), m1, m2); acc(p, vec3(-P, 0.0,-Q), m1, m2);
  acc(p, vec3( Q, P, 0.0), m1, m2); acc(p, vec3( Q,-P, 0.0), m1, m2);
  acc(p, vec3(-Q, P, 0.0), m1, m2); acc(p, vec3(-Q,-P, 0.0), m1, m2);
  return vec2(m1, m2);
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  vec3 ro = vec3(0.0, 0.0, 3.3);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.4;
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  float a = u_time * u_spin * 0.4;
  mat2 rxz = rot(a), ryz = rot(a * 0.65);

  // intersect a bounding sphere; accumulate edge glow through the volume
  const float R = 1.45;
  float r = 1.0;                       // face inradius the cage sits on
  float bq = dot(ro, rd);
  float cq = dot(ro, ro) - R * R;
  float hq = bq * bq - cq;

  vec3 col = c3 * 0.04 + c0 * 0.03;    // deep background
  if (hq > 0.0){
    hq = sqrt(hq);
    float t0 = max(-bq - hq, 0.0);
    float t1 = -bq + hq;
    float edgeK = mix(110.0, 26.0, u_gauge);  // sharpness of the tubes
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 80; i++){
      float f = (float(i) + 0.5) / 80.0;
      float t = mix(t0, t1, f);
      vec3 p = ro + rd * t;
      p.xz = rxz * p.xz; p.yz = ryz * p.yz;
      vec2 m = faceTop2(p);
      // near the shell (m1 ~ r) AND near an edge (m1 ~ m2)
      float shell = exp(-pow((m.x - r) * 15.0, 2.0));
      float edge = exp(-(m.x - m.y) * edgeK);
      float dens = shell * edge;
      // depth tint + dimming: near edges cool/bright, far edges warm/dim
      float dep = mix(1.0, 1.0 - f * 0.85, u_depth);
      vec3 ec = mix(c2, c1, f) + c0 * 0.2;
      glow += dens * ec * dep;
    }
    col += glow * ((t1 - t0) / 80.0) * (1.6 + 3.0 * u_glow);
  }

  gl_FragColor = vec4(col, 1.0);
}
