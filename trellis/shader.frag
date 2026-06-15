// trellis (Filament) - an orthogonal circuit grid of glowing conduits with a
// bright pad lit at every junction, like a printed board carrying charge along
// its traces. The current runs the nearer axis of each crossing so the whole
// lattice reads as one routed network over a semi-lit ground. Comments
// short/ASCII (the headless-gl poster compiler is fussy - no apostrophes).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // grid cell size in CSS px       (default 46)
uniform float u_line;    // trace core weight in CSS px     (default 2.2)
uniform float u_flow;    // speed of the travelling charge  (default 0.22)
uniform float u_glow;    // halo / glow strength 0..1       (default 0.4)
uniform float u_rotate;  // grid orientation, degrees       (default 0)
uniform float u_pad;     // junction pad size 0..1          (default 0.4)
uniform float u_seed;    // reshuffles the per-cell hues    (default 0)

float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
float wheelW(float s,float c){ float d=abs(s-c); return max(0.0,1.0-min(d,4.0-d)); }
vec3 wheelCol(float k,vec3 c0,vec3 c1,vec3 c2,vec3 c3){
  float s=fract(k)*4.0;
  float a=wheelW(s,0.0),b=wheelW(s,1.0),cc=wheelW(s,2.0),dd=wheelW(s,3.0);
  return (c0*a+c1*b+c2*cc+c3*dd)/max(a+b+cc+dd,0.001);
}

void main(){
  float pr=u_pixelRatio;
  vec2  fc=gl_FragCoord.xy;
  vec2  res=u_resolution;
  vec2  ctr=res*0.5;
  float t=u_time;

  float refScale=min(res.x,res.y)/(max(pr,1.0)*400.0);
  float cell=max(u_scale,8.0)*refScale*pr;
  // rotate the whole board about screen centre (u_rotate in degrees) - a square
  // grid at 0, a diamond lattice at 45
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa=sin(rad);
  vec2  pp=fc-ctr;
  vec2  uv=vec2(ca*pp.x+sa*pp.y, -sa*pp.x+ca*pp.y)/cell;

  vec2 g=fract(uv)-0.5;
  float dx=abs(g.x), dy=abs(g.y);
  float d=min(dx,dy);
  float nd=length(g);                 // distance to the junction pad

  float lw=max(u_line,0.5)*refScale*pr/cell;
  float core=smoothstep(lw,lw*0.25,d);
  float padR=lw*mix(1.2,5.0,u_pad);   // junction pad radius, tiny via -> fat node
  float pad=smoothstep(padR,lw*0.6,nd);
  core=max(core,pad);
  float halo=lw/(d+lw*1.4);
  halo=halo*halo*(0.4+0.7*u_glow);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  vec2 cid=floor(uv);
  float hue=dot(cid,vec2(0.09,0.11))+hash21(cid+u_seed*vec2(1.7,2.3))*0.09+t*0.02;
  vec3 pathCol=wheelCol(hue,c0,c1,c2,c3);

  // charge runs the nearer axis of each trace, offset per parallel run
  float along=(dx<dy)?uv.y:uv.x;
  float cross=(dx<dy)?floor(uv.x):floor(uv.y);
  float dirn=(dx<dy)?1.0:-1.0;
  float phase=(along*0.5)*dirn - t*u_flow*0.5 + cross*0.5;
  float pulse=0.5+0.5*sin(6.2831853*phase);
  pulse=pow(pulse,3.0);
  pulse=max(pulse, pad*0.6*(0.5+0.5*sin(6.2831853*(nd-t*u_flow*0.5))));

  float lit=core*(0.85+1.0*pulse)+halo*(0.7+0.6*pulse);

  float rr=length((fc-ctr)/res);
  vec3 ground=wheelCol(0.55+rr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+pathCol*lit;
  col+=pathCol*core*pulse*0.7;

  float vign=1.0-smoothstep(0.7,1.35,rr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
