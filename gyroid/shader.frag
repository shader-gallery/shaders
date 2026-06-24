// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 E. T. Carter
// gyroid (Manifold) - a raymarched flight through a gyroid, a triply-periodic
// minimal surface that tiles all of space into one smooth interwoven labyrinth.
// The camera drifts forward through the lattice; the thickened surface glows
// volumetrically, shaded by its own normals, hue turning with depth, fading into
// fog. A real 3D engine, not strokes on black - it fills the frame because it is
// a solid the eye flies through. Comments ASCII only (the headless poster
// compiler is fussy - no apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;  // gyroid cell frequency           (default 2.2)
uniform float u_thick;  // surface thickness 0..1           (default 0.5)
uniform float u_speed;  // forward flight speed             (default 0.3)
uniform float u_glow;   // volumetric glow 0..1             (default 0.5)
uniform float u_warp;   // domain warp of the lattice 0..1  (default 0.3)
uniform float u_hue;    // hue turn with depth 0..2         (default 1)
uniform float u_fog;    // depth fog 0..1                   (default 0.18)
uniform float u_rotate; // view roll, degrees               (default 39)
uniform float u_surface;// shape: gyroid 0 .. Schwarz-P 1   (default 0)
uniform float u_edge;   // crisp silhouette line strength   (default 0.25)
uniform float u_contour;// topographic lines on surface 0..1(default 0)
uniform float u_twist;  // spiral the lattice 0..1          (default 0)
uniform float u_bias;   // iso-level: walls 0 .. pockets 1  (default 0)

float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}

float gmap(vec3 p){
  float F=max(u_scale,0.6);
  vec3 q=p*F;
  float tw=u_twist*0.6;
  float az=q.z*tw, cz=cos(az), sz=sin(az);
  q.xy=mat2(cz,-sz,sz,cz)*q.xy;                   // twist around flight axis
  q+=u_warp*0.5*sin(q.yzx*0.7+u_time*0.15);      // slow domain warp
  float gyr=dot(sin(q),cos(q.yzx));              // gyroid implicit surface
  float sch=cos(q.x)+cos(q.y)+cos(q.z);          // Schwarz-P chamber lattice
  float g=mix(gyr,sch,clamp(u_surface,0.0,1.0)); // morph between the two shapes
  g=g-u_bias*1.1;                                 // iso-level: walls -> pockets
  // thin walls keep the camera in the open void so rays travel and strike the
  // lattice at varying depths (fat walls put the camera inside the solid -> every
  // ray hits at zero distance -> a flat uniform wash).
  float th=mix(0.05,0.9,clamp(u_thick,0.0,1.0));
  // divide by ~Lipschitz bound (F * ~2.6) so the step underestimates distance
  // and the march actually lands on the walls instead of overshooting them.
  return (abs(g)-th)/(F*(2.6+abs(tw)*2.0));
}

vec3 calcN(vec3 p){
  vec2 e=vec2(0.0015,0.0);
  return normalize(vec3(
    gmap(p+e.xyy)-gmap(p-e.xyy),
    gmap(p+e.yxy)-gmap(p-e.yxy),
    gmap(p+e.yyx)-gmap(p-e.yyx)));
}

void main(){
  vec2  res=u_resolution;
  vec2  uv=(gl_FragCoord.xy-0.5*res)/min(res.x,res.y);
  float t =u_time;

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }

  // camera flies forward, with a gentle drift so the labyrinth never repeats flat
  // start off the x=z=0 symmetry axis so structure reads on load (see diamond)
  vec3 ro=vec3(0.9+sin(t*0.07)*0.6, 0.6+cos(t*0.05)*0.6, 0.7+t*u_speed);
  vec3 rd=normalize(vec3(uv,1.0));
  float a=u_rotate*0.0174532925+t*0.03;
  float ca=cos(a), sa=sin(a);
  rd.xy=mat2(ca,-sa,sa,ca)*rd.xy;                // roll the view

  float dist=0.0, hit=0.0, steps=0.0;
  vec3  p=ro;
  for (int i=0;i<150;i++){
    p=ro+rd*dist;
    float d=gmap(p);
    if (d<0.0008){ hit=1.0; break; }
    dist+=d*0.5;
    steps+=1.0;
    if (dist>20.0) break;
  }
  steps=steps/150.0;

  vec3  fogc=wheelCol(0.62+t*0.01,c0,c1,c2,c3)*0.05;
  vec3  col =fogc;                                // escaped rays = deep background
  if (hit>0.5){
    vec3 n=calcN(p);
    vec3 lp=normalize(vec3(0.5,0.7,-0.6));
    float diff=0.32+0.68*max(dot(n,lp),0.0);
    float rim =pow(1.0-max(dot(n,-rd),0.0),2.5); // bright facing-away edges
    float ao  =1.0-steps;                         // crude crevice darkening
    float hue =u_hue*(dist*0.08+0.2*n.y+0.1*n.x)+t*0.03;
    vec3 base =wheelCol(hue,c0,c1,c2,c3);
    col=base*diff*(0.5+0.5*ao) + base*rim*(0.5+0.8*u_glow);

    // crisp silhouette line: a bright contour where the wall turns away from view
    float sil=1.0-abs(dot(n,rd));
    float ew =0.04+0.22*clamp(u_edge,0.0,1.0);
    float edgeLine=smoothstep(1.0-ew,1.0-ew*0.4,sil);
    col+=base*edgeLine*clamp(u_edge,0.0,1.0)*(0.7+0.7*u_glow);

    // topographic lines wrapping the surface by world height
    float cf=fract(p.y*mix(0.0,3.0,clamp(u_contour,0.0,1.0))-t*0.05);
    float cont=smoothstep(0.5,0.42,abs(cf-0.5))*clamp(u_contour,0.0,1.0);
    col+=base*cont*(0.5+0.6*u_glow);
  }

  // depth fog so the far lattice recedes into the tinted ground
  float fog=1.0-exp(-dist*mix(0.05,0.30,clamp(u_fog,0.0,1.0)));
  col=mix(col,fogc,clamp(fog,0.0,1.0));

  // mild vignette
  float vr=length(uv);
  col*=mix(1.0,0.7,smoothstep(0.6,1.1,vr));

  gl_FragColor=vec4(col,1.0);
}
