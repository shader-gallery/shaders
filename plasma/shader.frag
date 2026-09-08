// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter <support@shader.gallery>
precision highp float;
uniform float u_time;        // seconds
uniform vec2  u_resolution;  // device px
uniform vec2  u_mouse;       // pointer device px, (0,0) at rest
uniform float u_pixelRatio;  // devicePixelRatio
uniform vec3  u_palette[4];  // four theme colours

// tweakable params (see meta.json; the runtime feeds defaults)
uniform float u_speed;          // flow speed of the interference        (default 0.55)
uniform float u_scale;          // band frequency across the frame       (default 1.4)
uniform float u_warp;           // domain warp depth, folds the bands    (default 0.9)
uniform float u_bands;          // colour cycles per interference swing  (default 1.6)
uniform float u_glow;           // brightness of the hot cores           (default 1.2)
uniform float u_filament;       // fine electric filament layer          (default 0.6)
uniform float u_mouseInfluence; // pointer bends the field toward it     (default 0.0)

// four-stop colour wheel: phase 0..1 walks c0 -> c1 -> c2 -> c3 -> c0
float wheelW(float s, float c){
  float d = abs(s - c);
  return max(0.0, 1.0 - min(d, 4.0 - d));
}
vec3 wheel(float ph, vec3 c0, vec3 c1, vec3 c2, vec3 c3){
  float s4 = fract(ph) * 4.0;
  float w0 = wheelW(s4, 0.0), w1 = wheelW(s4, 1.0), w2 = wheelW(s4, 2.0), w3 = wheelW(s4, 3.0);
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
}

void main(){
  vec3 c0 = u_palette[0], c1 = u_palette[1], c2 = u_palette[2], c3 = u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3) < 1e-5) {
    c0 = vec3(0.231,0.510,0.965); c1 = vec3(0.659,0.333,0.969);
    c2 = vec3(0.133,0.827,0.933); c3 = vec3(0.957,0.247,0.369);
  }

  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 pos = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  // optional pointer bend, gated and zero at rest (u_mouse==0 => no pointer)
  vec2 m = (u_mouse / u_resolution - 0.5) * vec2(aspect, 1.0);
  float mAmt = u_mouseInfluence * step(0.5, dot(u_mouse, u_mouse));
  vec2 toM = m - pos;
  pos += toM * mAmt * 0.6 * exp(-dot(toM, toM) * 2.5);

  float t = u_time * u_speed;
  vec2 p = pos * (3.2 * max(u_scale, 0.2));

  // domain warp: fold the plane through two slow sine sheets so the straight
  // interference bands bend and flow instead of sitting as stripes
  float wd = max(u_warp, 0.0);
  vec2 q = p;
  q += vec2(sin(p.y * 1.10 + t * 0.70), cos(p.x * 0.95 - t * 0.60)) * wd;
  q += vec2(sin(q.y * 0.55 - t * 0.45), cos(q.x * 0.60 + t * 0.50)) * wd * 0.7;

  // classic plasma: layered sines in x, y, the diagonal and two moving radial
  // centres interfere into slowly rolling bands (v spans about -1..1)
  vec2 cA = vec2(sin(t * 0.50), cos(t * 0.40)) * 1.6;
  vec2 cB = vec2(cos(t * 0.35), sin(t * 0.45)) * 1.6;
  float v = sin(q.x + t);
  v += sin(q.y * 1.30 + t * 1.10);
  v += sin((q.x + q.y) * 0.90 + t * 0.80);
  v += sin(length(q - cA) * 1.70 - t * 1.40);
  v += sin(length(q + cB) * 1.20 + t * 1.00);
  v *= 0.2;

  // colour: walk the palette wheel with the interference value so every band
  // sweeps all four hues in order, bright and saturated end to end
  float ph = v * u_bands + t * 0.05;
  vec3 col = wheel(ph, c0, c1, c2, c3);

  // hot cores: where the sines pile up in phase the band goes white-hot, a
  // luminous core that pushes past the palette rather than clipping flat
  float core = smoothstep(0.45, 1.0, abs(v));
  float core2 = core * core;
  vec3 hot = mix(col, vec3(1.0), 0.65);
  col = mix(col, hot, core2 * u_glow * 0.9);

  // fine electric filaments: open strands, the zero crossings of one warped
  // sine sheet, so they thread through the bands and never close into cells
  float f1 = sin(dot(q, vec2(2.4, 1.9)) + v * 5.0 - t * 2.0);
  float fil = 1.0 - smoothstep(0.0, 0.16, abs(f1));
  vec3 filCol = wheel(ph + 0.5, c0, c1, c2, c3);
  col += (filCol * 0.5 + vec3(0.25)) * fil * u_filament * (0.5 + 0.5 * core);

  // lift the whole field so the troughs stay lit: this is a bright plasma,
  // never a dark wash with glowing lines in it
  col = col * (0.85 + 0.35 * u_glow * core) + col * col * 0.25;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
