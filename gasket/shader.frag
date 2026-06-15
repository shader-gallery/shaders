// gasket (Filament) - concentric glowing rings crossed by radial spokes, like a
// circular LED grid or a luminous manhole cover. Charge pulses outward through
// the rings while the hue turns with radius and angle, all over a semi-lit
// ground. Comments short/ASCII (the headless-gl poster compiler is fussy - no
// apostrophes, no pow of a negative base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // ring spacing in CSS px         (default 60)
uniform float u_line;    // tube core weight in CSS px      (default 2.8)
uniform float u_flow;    // speed of the outward charge     (default 0.6)
uniform float u_glow;    // halo / glow strength 0..1       (default 0.7)
uniform float u_spokes;  // number of radial spokes         (default 16)
uniform float u_colorBlend; // 0 half-wheel (seam) .. 1 seamless (default 0)
uniform float u_seed;    // pattern re-roll for the fill    (default 0)
uniform float u_fill;    // density of filled cells 0..1    (default 0)
uniform float u_fillSize; // filled-dot size within cell    (default 0.8)
uniform float u_fade;    // filled cells twinkle 0..1       (default 0)

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
  vec2  uv=(fc-ctr)/cell;

  float rr=length(uv);
  float ang=atan(uv.y,uv.x);
  float N=max(u_spokes,2.0);

  float ring=abs(fract(rr)-0.5);                       // distance to nearest ring
  float sp=abs(fract(ang/6.2831853*N+0.5)-0.5);
  float spD=sp*(6.2831853/N)*rr;                       // angular spoke -> spatial
  float d=min(ring,spD);

  float lw=max(u_line,0.5)*refScale*pr/cell;
  float core=smoothstep(lw,lw*0.25,d);
  float halo=lw/(d+lw*1.4);
  halo=halo*halo*(0.4+0.7*u_glow);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  // hue turns with radius and angle. The plain angle term is a half-wheel per
  // revolution, leaving a colour seam on the -x ray where atan wraps; the
  // continuous target is a full-wheel pinwheel (seamless at +-pi). u_colorBlend
  // crossfades the two in colour space so the seam shrinks smoothly to nothing.
  float hueR=rr*0.16+t*0.02;
  vec3 colSeam=wheelCol(hueR+ang/6.2831853*0.5,c0,c1,c2,c3);
  vec3 colCont=wheelCol(hueR+ang/6.2831853,c0,c1,c2,c3);
  vec3 pathCol=mix(colSeam,colCont,u_colorBlend);

  // charge ripples outward through the rings
  float phase=rr - t*u_flow*0.5;
  float pulse=0.5+0.5*sin(6.2831853*phase);
  pulse=pow(pulse,3.0);

  float lit=core*(0.85+1.0*pulse)+halo*(0.7+0.6*pulse);
  float fade=smoothstep(0.0,0.55,rr);                  // dim the crowded centre
  lit*=fade;

  // random filled cells: each polar cell (ring band x spoke sector) may light as
  // a soft dot, sized to fit its sector so it never spills past rings or spokes.
  float ric=floor(rr+0.5);                             // nearest ring-band centre
  float sidx=floor(ang/6.2831853*N);                   // spoke sector index
  vec2  cid=vec2(ric,sidx);
  vec2  sd=vec2(u_seed*31.7,u_seed*17.3);
  float fr=rr-ric;                                     // radial offset, band units
  float fas=(fract(ang/6.2831853*N)-0.5)*(6.2831853/N)*rr; // angular -> spatial
  float rfit=0.5*min(1.0,(6.2831853/N)*rr);            // dot radius that fits cell
  float frad=clamp(u_fillSize,0.0,1.0)*rfit;
  float fmask=step(1.0-u_fill, hash21(cid+sd+vec2(3.7,1.9)));
  float fs=smoothstep(frad,frad-0.06,length(vec2(fr,fas)))*fmask;
  float fph=hash21(cid+sd+vec2(5.1,2.9));
  float fd=mix(1.0,0.5+0.5*sin(6.2831853*(t*0.12+fph)),u_fade);
  float fhue=hueR+ang/6.2831853+hash21(cid+sd+vec2(1.3,2.7))*0.08;
  vec3 fillAdd=wheelCol(fhue,c0,c1,c2,c3)*(fs*fd*fade)*(0.30+0.45*u_glow);

  float vr=length((fc-ctr)/res);
  vec3 ground=wheelCol(0.55+vr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+fillAdd+pathCol*lit;
  col+=pathCol*core*pulse*0.7*fade;

  float vign=1.0-smoothstep(0.7,1.35,vr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
