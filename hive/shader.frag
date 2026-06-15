// hive (Filament) - a honeycomb of glowing hexagonal tubes, edge to edge, with
// charge chasing around each cell rim and the hue drifting cell to cell. The
// outlines glow over a semi-lit ground so the whole comb reads as one lit
// network. Comments short/ASCII (the headless-gl poster compiler is fussy - no
// apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // cell size in CSS px            (default 72)
uniform float u_line;    // tube core weight in CSS px      (default 2.8)
uniform float u_flow;    // speed of the chasing charge     (default 0.6)
uniform float u_glow;    // halo / glow strength 0..1       (default 0.7)

float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}
// distance from a point to the centre of its hex cell, in the hex metric
// (0 at centre, ~0.5 at the edge). max of the flat and the two slanted faces.
float hexMetric(vec2 p){ p=abs(p); float c=dot(p,vec2(0.5,0.8660254)); return max(c,p.x); }

void main(){
  float pr=u_pixelRatio;
  vec2  fc=gl_FragCoord.xy;
  vec2  res=u_resolution;
  vec2  ctr=res*0.5;
  float t=u_time;

  float refScale=min(res.x,res.y)/(max(pr,1.0)*400.0);
  float cell=max(u_scale,18.0)*refScale*pr;
  vec2  uv=(fc-ctr)/cell;

  // two interleaved hex lattices; nearest centre wins
  vec2 r=vec2(1.0,1.7320508), h=r*0.5;
  vec2 a=mod(uv,r)-h;
  vec2 b=mod(uv-h,r)-h;
  vec2 gv=dot(a,a)<dot(b,b)?a:b;
  vec2 cid=uv-gv;                      // cell centre coords
  float hm=hexMetric(gv);
  float d=abs(hm-0.5);                 // distance to the hex outline

  float lw=max(u_line,0.5)*refScale*pr/cell;
  float core=smoothstep(lw,lw*0.25,d);
  float halo=lw/(d+lw*1.4);
  halo=halo*halo*(0.4+0.7*u_glow);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  float hue=dot(cid,vec2(0.08,0.06))+hash21(floor(cid+0.5))*0.12+t*0.02;
  vec3 pathCol=wheelCol(hue,c0,c1,c2,c3);

  // charge chases around the rim of each cell (angle about its centre)
  float ang=atan(gv.y,gv.x)/6.2831853; // -0.5..0.5
  float dirn=mod(floor(cid.x+cid.y+0.5),2.0)<0.5?1.0:-1.0;
  float phase=ang*3.0*dirn - t*u_flow*0.5 + hash21(floor(cid+0.5))*3.0;
  float pulse=0.5+0.5*sin(6.2831853*phase);
  pulse=pow(pulse,3.0);

  float lit=core*(0.85+1.0*pulse)+halo*(0.7+0.6*pulse);

  float rr=length((fc-ctr)/res);
  vec3 ground=wheelCol(0.55+rr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+pathCol*lit;
  col+=pathCol*core*pulse*0.7;

  float vign=1.0-smoothstep(0.7,1.35,rr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
