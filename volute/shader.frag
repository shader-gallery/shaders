// volute (Filament) - a glowing tube wound into a spiral that fills the frame,
// charge spinning outward along the coil while the hue turns with each turn.
// One or several arms over a semi-lit ground. Comments short/ASCII (the
// headless-gl poster compiler is fussy - no apostrophes, no pow of a negative
// base).
//
// Uniforms: u_time, u_resolution, u_mouse, u_pixelRatio, u_palette[4]
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_pixelRatio;
uniform vec3  u_palette[4];

uniform float u_scale;   // coil pitch in CSS px           (default 66)
uniform float u_line;    // tube core weight in CSS px      (default 3.0)
uniform float u_flow;    // speed of the spinning charge    (default 0.6)
uniform float u_glow;    // halo / glow strength 0..1       (default 0.7)
uniform float u_arms;    // number of spiral arms (integer) (default 1)
uniform float u_twist;   // hue turns per radius, 1=base    (default 1)
uniform float u_fill;    // density of lit beads on coil    (default 0)
uniform float u_fillSize;// bead size within its cell       (default 0.7)
uniform float u_fade;    // beads twinkle 0..1              (default 0)
uniform float u_seed;    // pattern re-roll for the beads   (default 0)
uniform float u_centerX; // vortex eye x, short-axis units  (default 0)
uniform float u_centerY; // vortex eye y, short-axis units  (default 0)
uniform float u_rotate;  // spin the whole spiral, degrees  (default 0)
uniform float u_tilt;    // fore/back perspective tilt -1..1 (default 0)
uniform float u_skew;    // left/right lean -1..1           (default 0)

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
  vec2  sctr=res*0.5;                                  // screen centre (vignette/ground)
  float mn=min(res.x,res.y);
  vec2  octr=sctr+vec2(u_centerX,u_centerY)*(0.5*mn);  // movable vortex eye
  float t=u_time;

  float refScale=mn/(max(pr,1.0)*400.0);
  float cell=max(u_scale,8.0)*refScale*pr;

  // place the eye, spin it, then a perspective-ish shear: skew leans the spiral
  // left/right with height, tilt rocks it fore/back with width, so the flat coil
  // can read as a vortex tunnel lying back in space.
  vec2  p=fc-octr;
  float rad=u_rotate*0.0174532925;
  float ca=cos(rad), sa=sin(rad);
  p=vec2(ca*p.x+sa*p.y,-sa*p.x+ca*p.y);
  float nx=p.x/(0.5*mn), ny=p.y/(0.5*mn);
  p.x*=1.0+u_skew*ny;
  p.y*=1.0+u_tilt*nx-u_skew*0.18*ny;
  vec2  uv=p/cell;

  float rr=length(uv);
  float ang=atan(uv.y,uv.x)/6.2831853;  // -0.5..0.5
  float arms=max(floor(u_arms+0.5),1.0);

  // spiral coordinate: radius advances one cell per turn, scaled by arm count.
  // arms integer keeps fract continuous across the atan branch cut.
  float spi=(rr-ang)*arms;
  float d=abs(fract(spi)-0.5)/arms;     // radial distance to nearest arm

  float lw=max(u_line,0.5)*refScale*pr/cell;
  float core=smoothstep(lw,lw*0.25,d);
  float halo=lw/(d+lw*1.4);
  halo=halo*halo*(0.4+0.7*u_glow);

  vec3 c0=u_palette[0],c1=u_palette[1],c2=u_palette[2],c3=u_palette[3];
  if (dot(c0,c0)+dot(c1,c1)+dot(c2,c2)+dot(c3,c3)<1e-5){
    c0=vec3(0.231,0.510,0.965); c1=vec3(0.659,0.333,0.969);
    c2=vec3(0.133,0.827,0.933); c3=vec3(0.957,0.247,0.369);
  }
  // hue turns with radius (twist scales the rate) and a full wheel per
  // revolution via ang - the integer wrap keeps it seamless at the -x ray.
  float hue=rr*0.12*u_twist+ang+t*0.02;
  vec3 pathCol=wheelCol(hue,c0,c1,c2,c3);

  // charge spins outward along the coil
  float phase=spi - t*u_flow*0.5;
  float pulse=0.5+0.5*sin(6.2831853*phase);
  pulse=pow(pulse,3.0);

  float lit=core*(0.85+1.0*pulse)+halo*(0.7+0.6*pulse);
  float fade=smoothstep(0.0,0.35,rr);   // dim the crowded centre
  lit*=fade;

  // lit beads strung along the coil: each cell is one winding band crossed with
  // one angular wedge; a fraction light as soft dots that ride the tube. Sized to
  // fit the cell so they never spill past the neighbouring windings.
  float M=14.0;                                        // beads per turn
  float angF=ang+0.5;                                  // 0..1 around the eye
  float wid=floor(spi);                                // winding band index
  float sidx=floor(angF*M);                            // angular wedge index
  vec2  cid=vec2(wid,sidx);
  vec2  sd=vec2(u_seed*31.7,u_seed*17.3);
  float fr=(fract(spi)-0.5)/arms;                      // radial offset, uv units
  float fas=(fract(angF*M)-0.5)*(6.2831853/M)*rr;      // angular -> arc length
  float rfit=0.5*min(1.0/arms,(6.2831853/M)*rr);       // dot radius that fits cell
  float frad=clamp(u_fillSize,0.0,1.0)*rfit;
  float fmask=step(1.0-u_fill, hash21(cid+sd+vec2(3.7,1.9)));
  float fs=smoothstep(frad,frad-0.04,length(vec2(fr,fas)))*fmask;
  float fph=hash21(cid+sd+vec2(5.1,2.9));
  float fd=mix(1.0,0.5+0.5*sin(6.2831853*(t*0.12+fph)),u_fade);
  float fhue=rr*0.12*u_twist+ang+hash21(cid+sd+vec2(1.3,2.7))*0.08;
  vec3 fillAdd=wheelCol(fhue,c0,c1,c2,c3)*(fs*fd*fade)*(0.32+0.45*u_glow);

  float vr=length((fc-sctr)/res);
  vec3 ground=wheelCol(0.55+vr*0.3+t*0.01,c0,c1,c2,c3)*0.16;

  vec3 col=ground+fillAdd+pathCol*lit;
  col+=pathCol*core*pulse*0.7*fade;

  float vign=1.0-smoothstep(0.7,1.35,vr);
  col*=mix(0.9,1.0,vign);

  gl_FragColor=vec4(col,1.0);
}
