// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// origami (Facet) - a sheet of folded paper: a regular diagonal crease grid
// split into beveled triangular facets, each a flat shaded plane lit by a single
// raking light that sweeps across so mountain and valley folds catch and lose the
// light in turn. Crisp bevel highlights ride every crease. Not a random cell
// tiling - the facets come from a regular triangular fold grid. Comments ASCII
// only (the headless poster compiler is fussy - no apostrophes, no pow of a
// negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;  // fold cell size in CSS px            (default 110)
uniform float u_depth;  // crease relief / shading contrast 0..1(default 0.6)
uniform float u_bevel;  // crisp highlight width on creases 0..1(default 0.5)
uniform float u_sweep;  // speed the raking light travels       (default 0.5)
uniform float u_glow;   // overall luminance lift 0..1          (default 0.5)
uniform float u_hue;    // hue spread across facets 0..2        (default 0.72)
uniform float u_rotate; // rotation of the whole sheet, degrees (default 30)
uniform float u_vary;   // per-facet tone variation 0..1        (default 0.6)
uniform float u_warp;   // gentle ripple in the fold grid 0..1  (default 0)

const float PI = 3.14159265359;

float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}
float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }

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

  float cell=max(u_scale,24.0)*refScale*pr;
  // optional ripple: bend the whole crease grid so the sheet folds organically
  p+=cell*clamp(u_warp,0.0,1.0)*0.5*vec2(sin(p.y/cell*0.6+t*0.15),
                                         cos(p.x/cell*0.6+t*0.12));
  vec2  g=p/cell;

  // square grid split into two triangles by the main diagonal -> beveled facets.
  vec2  ci=floor(g);
  vec2  f=fract(g);
  float lower=step(f.x,f.y);                 // 0 = upper-right tri, 1 = lower-left
  vec2  tid=ci+vec2(0.0,lower*0.5);          // unique id per triangular facet

  // each facet has a fixed surface normal in the fold pattern: alternate
  // mountain/valley by parity so the sheet reads as a crisp accordion of creases.
  float par=mod(ci.x+ci.y,2.0);
  vec2  nrm=normalize(vec2(lower>0.5?-1.0:1.0, par>0.5?1.0:-1.0));
  float tip=0.4+0.3*hash21(tid+1.7);          // slight per-facet tilt variety

  // a single raking light sweeps around; facet brightness = how it faces light.
  // each facet also carries a fixed flat base tone so neighbouring triangles read
  // as distinctly-angled planes even before the light reaches them.
  float la=t*u_sweep*0.5;
  vec2  ld=vec2(cos(la),sin(la));
  float lit=0.5+0.5*dot(nrm,ld)*tip;
  lit=pow(clamp(lit,0.0,1.0),0.7);            // lift the shaded planes out of black
  float plane=mix(0.6,0.2+0.8*hash21(tid+0.3),clamp(u_vary,0.0,1.0)); // facet tone
  float face=mix(0.6,mix(plane,lit,0.6),clamp(u_depth,0.0,1.0));

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  float hue=0.12*(ci.x-ci.y)*u_hue+0.05*par+t*0.02;
  vec3  facetCol=wheelCol(hue,c0,c1,c2,c3);

  // crisp bevel: bright lines along the three creases bounding each facet
  float bw=0.02+0.12*clamp(u_bevel,0.0,1.0);
  float eEdge=min(f.x,1.0-f.x);              // vertical creases
  eEdge=min(eEdge,min(f.y,1.0-f.y));         // horizontal creases
  eEdge=min(eEdge,abs(f.x-f.y)*0.7071);      // the diagonal crease
  float bevel=smoothstep(bw,0.0,eEdge);

  vec3 col=facetCol*face*(0.5+0.9*u_glow);
  col+=facetCol*bevel*(0.3+0.45*u_glow);     // lit crease lines, subordinate to faces

  // gentle vignette so the sheet sits in space
  float vr=length((fc-res*0.5)/res);
  col*=mix(1.0,0.6,smoothstep(0.5,1.25,vr));

  gl_FragColor=vec4(col,1.0);
}
