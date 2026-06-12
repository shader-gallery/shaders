precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_flow;           // how fast the film thickness churns   (default 0.45)
uniform float u_iridescence;    // strength of the thin-film colour      (default 0.8)
uniform float u_bands;          // interference band frequency           (default 0.6)
uniform float u_size;           // how much of the frame the bubble fills (default 1.0)
uniform float u_mouseInfluence; // pointer parallax                      (default 0.0)

vec3 c0, c1, c2, c3;
float gTime;

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n0 = mix(mix(hash(i.xy + i.z * 37.0), hash(i.xy + vec2(1.0,0.0) + i.z*37.0), f.x),
                 mix(hash(i.xy + vec2(0.0,1.0) + i.z*37.0), hash(i.xy + vec2(1.0,1.0) + i.z*37.0), f.x), f.y);
  float n1 = mix(mix(hash(i.xy + (i.z+1.0)*37.0), hash(i.xy + vec2(1.0,0.0) + (i.z+1.0)*37.0), f.x),
                 mix(hash(i.xy + vec2(0.0,1.0) + (i.z+1.0)*37.0), hash(i.xy + vec2(1.0,1.0) + (i.z+1.0)*37.0), f.x), f.y);
  return mix(n0, n1, f.z);
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.02 + vec3(7.0, 3.0, 11.0); a *= 0.5; }
  return s;
}

// cyclic 4-stop palette ramp (loops c0->c1->c2->c3->c0) for thin-film colour
vec3 cyc(float x){
  x = fract(x) * 4.0;
  if (x < 1.0) return mix(c0, c1, x);
  else if (x < 2.0) return mix(c1, c2, x - 1.0);
  else if (x < 3.0) return mix(c2, c3, x - 2.0);
  else return mix(c3, c0, x - 3.0);
}

vec3 env(vec3 rd){
  float y = rd.y * 0.5 + 0.5;
  vec3 col = mix(c3 * 0.30, c0 * 0.75, smoothstep(0.0, 0.65, y));
  col = mix(col, c2 * 0.9, smoothstep(0.5, 1.0, y));
  return col;
}

void main(){
  c0 = u_palette[0]; c1 = u_palette[1]; c2 = u_palette[2]; c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
  gTime = u_time * u_flow;

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec2 mo = (u_mouse / u_resolution - 0.5);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  ro.xy += mo * mAmt * 0.8;
  vec3 ww = normalize(vec3(0.0) - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  float R = 1.4 * clamp(u_size, 0.5, 1.4);
  float b = dot(ro, rd);
  float cc = dot(ro, ro) - R * R;
  float disc = b * b - cc;

  vec3 col;
  if (disc > 0.0){
    float tHit = -b - sqrt(disc);
    vec3 p = ro + rd * tHit;
    vec3 n = p / R;
    float ndv = max(dot(-rd, n), 0.0);
    float fres = pow(1.0 - ndv, 3.0);

    // film thickness: a slow churning field over the bubble surface
    float thick = 0.5 + 0.5 * fbm3(n * 2.6 + vec3(0.0, 0.0, gTime));

    // thin-film interference: optical path ~ thickness / cos(view angle); thin
    // shells go iridescent at grazing where the path stretches
    float phase = thick * (3.0 + 8.0 * u_bands) + (1.0 - ndv) * 3.5;
    vec3 irid = cyc(phase);

    // the bubble is mostly transparent — env shows through, washed with the
    // interference colour; fresnel drives the colour up toward the rim
    vec3 bg = env(rd);
    float irAmt = u_iridescence * (0.25 + 0.75 * fres);
    col = mix(bg, irid, clamp(irAmt, 0.0, 0.92));

    // bright iridescent rim + a sharp surface highlight
    col += irid * fres * 0.6 * u_iridescence;
    vec3 L = normalize(vec3(-0.4, 0.8, 0.5));
    float spec = pow(max(dot(reflect(rd, n), L), 0.0), 200.0);
    col += vec3(1.0) * spec * 0.7;
  } else {
    col = env(rd) * 0.85;
  }

  gl_FragColor = vec4(col, 1.0);
}
