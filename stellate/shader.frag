precision highp float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_spike;          // point length/sharpness (default 0.55)
uniform float u_pulse;          // breathing             (default 0.45)
uniform float u_glow;           // tip heat              (default 0.6)
uniform float u_spin;           // tumble speed          (default 0.5)
uniform float u_mouseInfluence; // pointer parallax      (default 0.0)

vec3 c0, c1, c2, c3;

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdTetra(vec3 p, float r){
  return (max(max(-p.x - p.y - p.z, p.x + p.y - p.z),
              max(-p.x + p.y + p.z, p.x - p.y + p.z)) - r) * 0.57735027;
}

float gR;
// stella octangula = a tetrahedron unioned with its point-reflection
float map(vec3 p){
  return min(sdTetra(p, gR), sdTetra(-p, gR));
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

vec3 bg(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  return mix(c3 * 0.05, c0 * 0.16, smoothstep(0.0, 0.8, y)) + c3 * 0.03;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0, c0) + dot(c1, c1) + dot(c2, c2) + dot(c3, c3) < 1e-5){
    c0 = vec3(0.231, 0.510, 0.965); c1 = vec3(0.659, 0.333, 0.969);
    c2 = vec3(0.133, 0.827, 0.933); c3 = vec3(0.957, 0.247, 0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;

  // breathing: smaller r => longer, sharper spikes
  float breathe = u_pulse * 0.16 * sin(u_time * 0.8);
  gR = mix(0.95, 0.5, u_spike) + breathe;

  vec3 ro = vec3(0.0, 0.0, 3.6);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.4;
  vec3 ta = vec3(0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  float a = u_time * u_spin * 0.35;
  mat2 rxz = rot(a), ryz = rot(a * 0.66);

  float tt = 0.0, hit = 0.0;
  for (int i = 0; i < 90; i++){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    float d = map(p);
    if (d < 0.0013){ hit = 1.0; break; }
    if (tt > 8.0) break;
    tt += d * 0.75;
  }

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    p.xz = rxz * p.xz; p.yz = ryz * p.yz;
    vec3 n = calcNormal(p);
    vec3 rdl = rd; rdl.xz = rxz * rdl.xz; rdl.yz = ryz * rdl.yz;

    vec3 L1 = normalize(vec3(0.5, 0.8, 0.45));
    float dif = max(dot(n, L1), 0.0);
    vec3 ref = reflect(rdl, n);
    float spec = pow(max(dot(ref, L1), 0.0), 50.0);
    float fres = pow(1.0 - max(dot(-rdl, n), 0.0), 3.0);

    vec3 base = mix(c3, c0, n.y * 0.5 + 0.5) * 0.9 + 0.03;
    col = base * (0.22 + 0.85 * dif);
    col += vec3(1.0) * spec * 0.45;

    // hot spike tips: glow concentrated on the outer points only
    float tip = smoothstep(0.92, 1.35, length(p));
    float pulse = 0.7 + 0.3 * sin(u_time * 0.8);
    vec3 hot = mix(c1, c2, 0.4) + c2 * 0.3;
    col += hot * tip * (0.5 + 1.8 * u_glow) * pulse;
    col += c1 * fres * (0.3 + 0.6 * u_glow);   // edge rim
  } else {
    col = bg(rd);
  }

  gl_FragColor = vec4(col, 1.0);
}
