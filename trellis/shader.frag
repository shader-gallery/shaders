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
uniform float u_blend;   // 0 = hard per-cell colours, 1 = blended (default 1)
uniform float u_jitter;  // per-trace position scatter 0..1 (default 0)
uniform float u_depth;   // per-trace depth spread 0..1     (default 0)

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

  float lw=max(u_line,0.5)*refScale*pr/cell;
  vec2 K1=u_seed*vec2(1.7,2.3), K2=u_seed*vec2(2.3,1.1);

  // nearest VERTICAL trace: each column may be jittered off its nominal x and
  // carries its own depth, so scan the three nearest columns and keep the best
  float bestVx=uv.x; float vId=0.0; float dV=1e9;
  for (int i=-1;i<=1;i++){
    float n=floor(uv.x)+float(i);
    float lx=n+0.5+(hash21(vec2(n,3.0)+K1)-0.5)*u_jitter*0.9;
    float dd=abs(uv.x-lx);
    if (dd<dV){ dV=dd; bestVx=lx; vId=n; }
  }
  // nearest HORIZONTAL trace
  float bestHy=uv.y; float hId=0.0; float dH=1e9;
  for (int i=-1;i<=1;i++){
    float m=floor(uv.y)+float(i);
    float ly=m+0.5+(hash21(vec2(7.0,m)+K2)-0.5)*u_jitter*0.9;
    float dd=abs(uv.y-ly);
    if (dd<dH){ dH=dd; bestHy=ly; hId=m; }
  }

  // per-trace depth: near traces (depth~1) brighter and fatter, far ones dimmer
  float vDepth=1.0-hash21(vec2(vId,11.0)+K1)*u_depth*0.7;
  float hDepth=1.0-hash21(vec2(13.0,hId)+K2)*u_depth*0.7;
  float lwV=lw*mix(0.6,1.0,vDepth);
  float lwH=lw*mix(0.6,1.0,hDepth);

  float coreV=smoothstep(lwV,lwV*0.25,dV);
  float coreH=smoothstep(lwH,lwH*0.25,dH);
  float haloV=lwV/(dV+lwV*1.4); haloV=haloV*haloV*(0.4+0.7*u_glow);
  float haloH=lwH/(dH+lwH*1.4); haloH=haloH*haloH*(0.4+0.7*u_glow);

  // junction pad at the crossing of the nearest vertical and horizontal traces
  float nd=length(uv-vec2(bestVx,bestHy));
  float padR=lw*mix(1.2,5.0,u_pad);
  float pDepth=max(vDepth,hDepth);
  float pad=smoothstep(padR,lw*0.6,nd);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  // hue: u_blend crossfades from the hard per-cell step (colour switches at every
  // cell edge a trace crosses) to a continuous bilinear field that blends smoothly
  vec2 ip=floor(uv), fp=fract(uv);
  vec2 sp=fp*fp*(3.0-2.0*fp);
  float h00=hash21(ip+K1), h10=hash21(ip+vec2(1.0,0.0)+K1);
  float h01=hash21(ip+vec2(0.0,1.0)+K1), h11=hash21(ip+vec2(1.0,1.0)+K1);
  float hcell=mix(mix(h00,h10,sp.x),mix(h01,h11,sp.x),sp.y);
  float hueStep=dot(ip,vec2(0.09,0.11))+h00*0.09;
  float hueSmooth=dot(uv,vec2(0.09,0.11))+hcell*0.09;
  float hue=mix(hueStep,hueSmooth,u_blend)+t*0.02;
  vec3 pathCol=wheelCol(hue,c0,c1,c2,c3);

  // charge runs each trace along its own axis, offset per parallel run
  float pulseV=pow(0.5+0.5*sin(6.2831853*(uv.y*0.5 - t*u_flow*0.5 + vId*0.5)),3.0);
  float pulseH=pow(0.5+0.5*sin(6.2831853*(-uv.x*0.5 - t*u_flow*0.5 + hId*0.5)),3.0);
  float padPulse=pad*0.6*(0.5+0.5*sin(6.2831853*(nd-t*u_flow*0.5)));
  pulseV=max(pulseV,padPulse); pulseH=max(pulseH,padPulse);

  float litV=(coreV*(0.85+1.0*pulseV)+haloV*(0.7+0.6*pulseV))*vDepth;
  float litH=(coreH*(0.85+1.0*pulseH)+haloH*(0.7+0.6*pulseH))*hDepth;
  float padLit=pad*(0.85+1.0*padPulse)*pDepth;

  float rr=length((fc-ctr)/res);
  vec3 ground=wheelCol(0.55+rr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+pathCol*(litV+litH+padLit);
  col+=pathCol*max(max(coreV,coreH),pad)*max(pulseV,pulseH)*0.7;

  float vign=1.0-smoothstep(0.7,1.35,rr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
