precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

uniform float u_morph;          // melt speed between solids   (default 0.5)
uniform float u_bevel;          // edge rounding               (default 0.06)
uniform float u_light;          // key + specular strength     (default 0.6)
uniform float u_spin;           // tumble speed                (default 0.5)
uniform float u_mouseInfluence; // pointer parallax            (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// --- Platonic-solid SDF library (PHI-folded bounding planes) ---
const float PHI = 1.618033988749895;

float sdBox(vec3 p, float b){
  vec3 q = abs(p) - vec3(b);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdOcta(vec3 p, float s){
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}
float sdTetra(vec3 p, float r){
  return (max(max(-p.x - p.y - p.z, p.x + p.y - p.z),
              max(-p.x + p.y + p.z, p.x - p.y + p.z)) - r) * 0.57735027;
}
float sdDodeca(vec3 p, float r){
  p = abs(p);
  vec3 n = normalize(vec3(0.0, 1.0, PHI));
  float d = dot(p, n);
  d = max(d, dot(p, vec3(n.y, n.z, n.x)));
  d = max(d, dot(p, vec3(n.z, n.x, n.y)));
  return d - r;
}
float sdIcosa(vec3 p, float r){
  p = abs(p);
  vec3 b = normalize(vec3(0.0, 1.0 / PHI, PHI));
  float d = dot(p, normalize(vec3(1.0)));
  d = max(d, dot(p, b));
  d = max(d, dot(p, vec3(b.z, b.x, b.y)));
  d = max(d, dot(p, vec3(b.y, b.z, b.x)));
  return d - r;
}

float gBevel, gFr;
int gA, gB;

float solid(vec3 p, int idx){
  if (idx == 0) return sdTetra(p, 1.05);
  if (idx == 1) return sdBox(p, 0.78);
  if (idx == 2) return sdOcta(p, 1.18);
  if (idx == 3) return sdDodeca(p, 0.92);
  return sdIcosa(p, 0.95);
}

float map(vec3 p){
  float da = solid(p, gA);
  float db = solid(p, gB);
  return mix(da, db, gFr) - gBevel;
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0016, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

vec3 bg(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.10, c0 * 0.32, smoothstep(0.0, 0.7, y));
  col = mix(col, c2 * 0.55, smoothstep(0.55, 1.0, y));
  col += c1 * 0.18 * pow(max(rd.x * 0.5 + 0.5, 0.0), 4.0);
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  // which two solids, and the cross-fade between them
  float seq = u_time * u_morph * 0.16;
  float seg = floor(seq);
  gFr = smoothstep(0.0, 1.0, fract(seq));
  gA = int(mod(seg, 5.0));
  gB = int(mod(seg + 1.0, 5.0));
  gBevel = u_bevel;

  // camera
  vec3 ro = vec3(0.0, 0.0, 3.5);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.4;
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  // tumble the whole field on a diagonal axis
  float a = u_time * u_spin * 0.35;
  mat2 rxz = rot(a), ryz = rot(a * 0.7);

  float tt = 0.0, hit = 0.0;
  for (int i = 0; i < 90; i++){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    float d = map(p);
    if (d < 0.0012){ hit = 1.0; break; }
    if (tt > 8.0) break;
    tt += d * 0.7;
  }

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    vec3 n = calcNormal(p);

    // rotate the view direction into the same object space for lighting
    vec3 rdl = rd; rdl.xz = rxz * rdl.xz; rdl.yz = ryz * rdl.yz;

    vec3 L1 = normalize(vec3(0.55, 0.8, 0.4));
    vec3 L2 = normalize(vec3(-0.6, 0.35, 0.55));
    float dif = max(dot(n, L1), 0.0);
    float dif2 = max(dot(n, L2), 0.0);
    vec3 ref = reflect(rdl, n);
    float spec = pow(max(dot(ref, L1), 0.0), mix(16.0, 120.0, u_light));
    float fres = pow(1.0 - max(dot(-rdl, n), 0.0), 4.0);

    // satin body: palette-tinted diffuse with a cool fill and warm rim
    vec3 base = mix(c0, c2, n.y * 0.5 + 0.5) * 1.6 + 0.06;
    float key = 0.55 * dif + 0.30 * dif2 + 0.18;   // always some ambient fill
    col = base * (0.35 + 1.35 * key * (0.5 + 0.5 * u_light));
    col += c1 * 0.35 * dif2;
    col += vec3(1.0) * spec * (0.5 + 0.7 * u_light);
    col += c2 * fres * 0.8;            // grazing rim
    col *= 0.62 + 0.38 * (n.y * 0.5 + 0.5);
  } else {
    col = bg(rd);
  }

  gl_FragColor = vec4(col, 1.0);
}
