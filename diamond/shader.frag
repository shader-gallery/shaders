// diamond (Manifold) - a raymarched flight through a Schwarz Diamond surface, a
// triply-periodic minimal surface with sharper, more crystalline chambers than
// the gyroid. The camera drifts through; the thin walls are normal-shaded with
// crisp silhouette edges, hue turning with depth, fading into fog. Sibling to the
// gyroid on the same engine. Comments ASCII only (the headless poster compiler is
// fussy - no apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;  // cell frequency                  (default 1.6)
uniform float u_thick;  // wall thickness 0..1             (default 0.1)
uniform float u_speed;  // forward flight speed            (default 0.12)
uniform float u_glow;   // glow / rim 0..1                 (default 0.6)
uniform float u_warp;   // domain warp 0..1                (default 0.25)
uniform float u_hue;    // hue turn with depth 0..2        (default 1)
uniform float u_fog;    // depth fog 0..1                  (default 0.3)
uniform float u_rotate; // view roll, degrees              (default 10)
uniform float u_surface;// shape: diamond 0 .. gyroid 1    (default 0)
uniform float u_edge;   // crisp silhouette line strength  (default 0.5)
uniform float u_contour;// topographic lines on surface    (default 0)
uniform float u_twist;  // spiral the lattice 0..1          (default 0.11)
uniform float u_bias;   // iso-level: walls 0 .. pockets 1  (default 0.96)
uniform float u_contourFreq; // contour line density        (default 3)

float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}

float gmap(vec3 p){
  float F=max(u_scale,0.6);
  vec3 q=p*F;
  // twist around the flight axis -> spiralling chambers
  float tw=u_twist*0.6;
  float az=q.z*tw, cz=cos(az), sz=sin(az);
  q.xy=mat2(cz,-sz,sz,cz)*q.xy;
  q+=u_warp*0.5*sin(q.yzx*0.7+u_time*0.15);
  vec3 s=sin(q), c=cos(q);
  float dia=s.x*s.y*s.z + s.x*c.y*c.z + c.x*s.y*c.z + c.x*c.y*s.z; // Schwarz D
  float gyr=dot(s,c.yzx);                                          // gyroid
  float g=mix(dia,gyr,clamp(u_surface,0.0,1.0));
  // bias the iso-level: 0 keeps the thin minimal surface, high fattens one
  // channel into closed rounded pockets and tunnels (a different topology).
  float g2=g-u_bias*1.1;
  float th=mix(0.05,0.9,clamp(u_thick,0.0,1.0));
  return (abs(g2)-th)/(F*(3.2+abs(tw)*2.0));   // looser step when twisted
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

  // start at a generic off-axis point: ro on the x=z=0 axis at t=0 lands on a
  // lattice symmetry plane where the view degenerates to a near-flat wall, so the
  // cells only appear once the camera drifts off it - offset it so structure
  // reads immediately on load at any cell frequency.
  vec3 ro=vec3(0.9+sin(t*0.06)*0.5, 0.6+cos(t*0.045)*0.5, 0.7+t*u_speed);
  vec3 rd=normalize(vec3(uv,1.0));
  float a=u_rotate*0.0174532925+t*0.025;
  float ca=cos(a), sa=sin(a);
  rd.xy=mat2(ca,-sa,sa,ca)*rd.xy;

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

  vec3 fogc=wheelCol(0.6+t*0.01,c0,c1,c2,c3)*0.05;
  vec3 col =fogc;
  if (hit>0.5){
    vec3 n=calcN(p);
    vec3 lp=normalize(vec3(0.4,0.8,-0.5));
    float diff=0.3+0.7*max(dot(n,lp),0.0);
    float rim =pow(1.0-max(dot(n,-rd),0.0),2.5);
    float ao  =1.0-steps;
    float hue =u_hue*(dist*0.09+0.22*n.x+0.12*n.z)+t*0.03;
    vec3 base =wheelCol(hue,c0,c1,c2,c3);
    col=base*diff*(0.5+0.5*ao) + base*rim*(0.5+0.8*u_glow);

    float sil=1.0-abs(dot(n,rd));
    float ew =0.04+0.22*clamp(u_edge,0.0,1.0);
    float edgeLine=smoothstep(1.0-ew,1.0-ew*0.4,sil);
    col+=base*edgeLine*clamp(u_edge,0.0,1.0)*(0.7+0.7*u_glow);

    float cf=fract(p.x*max(u_contourFreq,0.0)-t*0.05);
    float cont=smoothstep(0.5,0.42,abs(cf-0.5))*clamp(u_contour,0.0,1.0);
    col+=base*cont*(0.5+0.6*u_glow);
  }

  float fog=1.0-exp(-dist*mix(0.05,0.30,clamp(u_fog,0.0,1.0)));
  col=mix(col,fogc,clamp(fog,0.0,1.0));
  col*=mix(1.0,0.7,smoothstep(0.6,1.1,length(uv)));

  gl_FragColor=vec4(col,1.0);
}
