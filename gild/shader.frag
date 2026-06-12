precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_spin;           // rotation speed of the rings          (default 0.45)
uniform float u_thick;          // ring tube thickness                  (default 0.3)
uniform float u_polish;         // mirror finish / specular sharpness    (default 0.75)
uniform float u_metalTint;      // how strongly the metal takes palette  (default 0.45)
uniform float u_mouseInfluence; // pointer parallax                      (default 0.0)

vec3 c0, c1, c2, c3;
float gTime, gThick;

mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

float sdTorus(vec3 p, vec2 t){
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// three interlocking rings on different axes, slowly turning
float map(vec3 p){
  float th = gThick;
  float d = sdTorus(rotY(gTime) * p, vec2(1.15, th));
  d = min(d, sdTorus(rotX(1.571) * rotZ(gTime * 0.8) * p, vec2(1.15, th)));
  d = min(d, sdTorus(rotZ(1.0) * rotX(gTime * 0.6) * p, vec2(0.9, th * 0.92)));
  return d;
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

vec3 env(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.22, c0 * 1.1, smoothstep(0.0, 0.6, y));
  col = mix(col, c2 * 1.5, smoothstep(0.5, 1.0, y));
  col += c1 * 1.0 * pow(smoothstep(0.6, 1.0, y), 3.0);     // overhead softbox
  col += c2 * 0.3 * pow(max(rd.x * 0.5 + 0.5, 0.0), 4.0);  // side rim
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  gTime = u_time * u_spin;
  gThick = 0.14 + 0.42 * clamp(u_thick, 0.0, 1.0);

  vec3 ro = vec3(0.0, 0.1, 3.6);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 1.1;
  vec3 ww = normalize(vec3(0.0) - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  float tt = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 80; i++){
    vec3 p = ro + rd * tt;
    float d = map(p);
    if (d < 0.0015){ hit = 1.0; break; }
    if (tt > 9.0) break;
    tt += d * 0.9;
  }

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * tt;
    vec3 n = calcNormal(p);
    vec3 ref = reflect(rd, n);
    float fres = pow(1.0 - max(dot(-rd, n), 0.0), 5.0);

    vec3 reflCol = env(ref);
    vec3 L1 = normalize(vec3(-0.4, 0.85, 0.45));
    vec3 L2 = normalize(vec3(0.6, 0.3, 0.5));
    float shin = mix(20.0, 240.0, u_polish);
    float spec = pow(max(dot(ref, L1), 0.0), shin)
               + 0.5 * pow(max(dot(ref, L2), 0.0), shin * 0.6);

    // gold/metal BRDF: full mirror reflectance at all angles, warm palette tint
    vec3 tint = mix(vec3(0.95), c0 * 1.35, clamp(u_metalTint, 0.0, 1.0));
    col = reflCol * tint;
    col += reflCol * fres * 0.6;
    col += vec3(1.0) * spec * (0.5 + 0.5 * u_polish);
    col *= 0.6 + 0.4 * (n.y * 0.5 + 0.5);   // gentle vertical AO
  } else {
    col = env(rd) * 0.6;                     // filled, dimmer backdrop
  }

  gl_FragColor = vec4(col, 1.0);
}
