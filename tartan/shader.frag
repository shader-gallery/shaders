// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// tartan (Loom) - a glowing dark tartan sett: translucent warp bands running
// vertical and weft bands running horizontal, crossing in an over-under weave so
// the overlaps brighten and the thread direction on top alternates square by
// square. The sett (the stripe recipe) repeats across the frame; a slow shimmer
// breathes through it and colour follows the band groups. Open crossing bands,
// read as cloth not as filled cells. Comments ASCII only (the headless poster
// compiler is fussy - no apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // sett (stripe-recipe) size in CSS px   (default 120)
uniform float u_thread;  // woven thread cell size in CSS px      (default 9)
uniform float u_weave;   // over-under contrast 0..1              (default 0.6)
uniform float u_glow;    // band glow strength 0..1               (default 0.6)
uniform float u_shimmer; // travelling shimmer amount 0..1        (default 0.5)
uniform float u_speed;   // shimmer speed                         (default 0.4)
uniform float u_hue;     // hue spread across the sett 0..2       (default 0.39)
uniform float u_rotate;  // rotation of the cloth, degrees        (default -45)
uniform float u_blur;    // band-edge softness 0 crisp .. 1 hazy  (default 0.15)
uniform float u_bg;      // lit background level 0..1             (default 0.5)

const float TAU = 6.28318530718;

float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}

// the sett: a band intensity profile repeating in 0..1. A few wide and narrow
// stripes give the tartan its recognisable grouping without any random cells.
float sett(float u, float soft){
  float v=fract(u);
  float w=1.0+soft*4.0;                                 // widen the falloff = blur
  float band=0.0;
  band=max(band,smoothstep(0.06*w,0.02,abs(v-0.12)));  // wide group edge
  band=max(band,smoothstep(0.05*w,0.015,abs(v-0.30))*0.8);
  band=max(band,smoothstep(0.10*w,0.03,abs(v-0.52)));   // broad central band
  band=max(band,smoothstep(0.04*w,0.01,abs(v-0.74))*0.7);
  band=max(band,smoothstep(0.05*w,0.015,abs(v-0.90))*0.9);
  return band;
}

void main(){
  float pr =u_pixelRatio;
  vec2  fc =gl_FragCoord.xy;
  vec2  res=u_resolution;
  float t  =u_time;
  float mn =min(res.x,res.y);
  float refScale=mn/(max(pr,1.0)*400.0);

  vec2  p=fc-res*0.5;
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa=sin(rad);
  p=vec2(ca*p.x+sa*p.y,-sa*p.x+ca*p.y);

  float setpx=max(u_scale,30.0)*refScale*pr;
  float thpx =max(u_thread,3.0)*refScale*pr;

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  // warp (vertical bands) keyed by x, weft (horizontal bands) keyed by y
  float soft=clamp(u_blur,0.0,1.0);
  float warp=sett(p.x/setpx,soft);
  float weft=sett(p.y/setpx,soft);

  // over-under weave: which thread sits on top alternates per thread cell
  vec2  tc=floor(p/thpx);
  float top=mod(tc.x+tc.y,2.0);                  // 0 = weft on top, 1 = warp on top
  float wv=mix(1.0,0.45,clamp(u_weave,0.0,1.0)); // dimming of the under thread
  float warpL=warp*mix(wv,1.0,top);
  float weftL=weft*mix(1.0,wv,top);

  // travelling shimmer so the cloth is not static
  float sh=1.0+u_shimmer*0.35*sin((p.x+p.y)/setpx*TAU*0.5 - t*u_speed*2.0);

  float hueW=0.5*floor(p.x/setpx*1.0)*0.0 + 0.18*(p.x/setpx)*u_hue + t*0.02;
  float hueF=0.18*(p.y/setpx)*u_hue+0.5+t*0.02;
  vec3  warpCol=wheelCol(hueW,c0,c1,c2,c3);
  vec3  weftCol=wheelCol(hueF,c0,c1,c2,c3);

  float g=(0.3+0.55*u_glow)*sh;
  vec3 col=warpCol*warpL*g + weftCol*weftL*g;
  // overlaps read brighter where warp and weft both pass
  col+=(warpCol+weftCol)*0.5*warpL*weftL*(0.3+0.5*u_glow);

  // lit ground, dialable
  float vr=length((fc-res*0.5)/res);
  col+=wheelCol(0.6+vr*0.3+t*0.01,c0,c1,c2,c3)*0.12*clamp(u_bg,0.0,1.0);
  col*=mix(1.0,0.7,smoothstep(0.6,1.3,vr));

  gl_FragColor=vec4(col,1.0);
}
