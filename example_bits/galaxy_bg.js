window.scrollerApp = {
  meta: {
    title: 'Star Nebula',
    author: 'YourUsername',
    description: 'Touch to repel stars in a living 4-layer galaxy',
    tags: ['creative'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(canvas);

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    const vert = `attribute vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;

    const frag = `precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform float uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071,-0.7071,0.7071,0.7071)
#define PERIOD 3.0

float Hash21(vec2 p){
  p=fract(p*vec2(123.34,456.21));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}
float tri(float x){return abs(fract(x)*2.-1.);}
float tris(float x){float t=fract(x);return 1.-smoothstep(0.,1.,abs(2.*t-1.));}
float trisn(float x){float t=fract(x);return 2.*(1.-smoothstep(0.,1.,abs(2.*t-1.)))-1.;}

vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.,2./3.,1./3.,3.);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
}

float Star(vec2 uv,float flare){
  float d=length(uv);
  float m=(.05*uGlowIntensity)/d;
  float rays=smoothstep(0.,1.,1.-abs(uv.x*uv.y*1000.));
  m+=rays*flare*uGlowIntensity;
  uv*=MAT45;
  rays=smoothstep(0.,1.,1.-abs(uv.x*uv.y*1000.));
  m+=rays*.3*flare*uGlowIntensity;
  m*=smoothstep(1.,.2,d);
  return m;
}

vec3 StarLayer(vec2 uv){
  vec3 col=vec3(0.);
  vec2 gv=fract(uv)-.5;
  vec2 id=floor(uv);
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec2 offset=vec2(float(x),float(y));
      vec2 si=id+offset;
      float seed=Hash21(si);
      float size=fract(seed*345.32);
      float glo=tri(uStarSpeed/(PERIOD*seed+1.));
      float fl=smoothstep(.9,1.,size)*glo;
      float red=smoothstep(STAR_COLOR_CUTOFF,1.,Hash21(si+1.))+STAR_COLOR_CUTOFF;
      float blu=smoothstep(STAR_COLOR_CUTOFF,1.,Hash21(si+3.))+STAR_COLOR_CUTOFF;
      float grn=min(red,blu)*seed;
      vec3 base=vec3(red,grn,blu);
      float hue=atan(base.g-base.r,base.b-base.r)/(2.*3.14159)+.5;
      hue=fract(hue+uHueShift/360.);
      float sat=length(base-vec3(dot(base,vec3(.299,.587,.114))))*uSaturation;
      float val=max(max(base.r,base.g),base.b);
      base=hsv2rgb(vec3(hue,sat,val));
      vec2 pad=vec2(tris(seed*34.+uTime*uSpeed/10.),tris(seed*38.+uTime*uSpeed/30.))-.5;
      float star=Star(gv-offset-pad,fl);
      float twinkle=trisn(uTime*uSpeed+seed*6.2831)*.5+1.;
      twinkle=mix(1.,twinkle,uTwinkleIntensity);
      star*=twinkle;
      col+=star*size*base;
    }
  }
  return col;
}

void main(){
  vec2 focalPx=uFocal*uResolution.xy;
  vec2 uv=(gl_FragCoord.xy-focalPx)/uResolution.y;

  vec2 mouseNorm=uMouse-vec2(.5);
  if(uMouseRepulsion>.5){
    vec2 mousePosUV=(uMouse*uResolution.xy-focalPx)/uResolution.y;
    float md=length(uv-mousePosUV);
    vec2 rep=normalize(uv-mousePosUV)*(uRepulsionStrength/(md+.1));
    uv+=rep*.05*uMouseActiveFactor;
  }else{
    uv+=mouseNorm*.1*uMouseActiveFactor;
  }

  float ang=uTime*uRotationSpeed;
  mat2 rot=mat2(cos(ang),-sin(ang),sin(ang),cos(ang));
  uv=rot*uv;

  vec3 col=vec3(0.);
  for(float i=0.;i<1.;i+=1./NUM_LAYER){
    float depth=fract(i+uStarSpeed*uSpeed);
    float scale=mix(20.*uDensity,.5*uDensity,depth);
    float fade=depth*smoothstep(1.,.9,depth);
    col+=StarLayer(uv*scale+i*453.32)*fade;
  }
  gl_FragColor=vec4(col,1.);
}`;

    function mkShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s); return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, mkShader(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, mkShader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const U = name => gl.getUniformLocation(prog, name);
    const uTime   = U('uTime'), uRes   = U('uResolution'), uFocal = U('uFocal');
    const uSS     = U('uStarSpeed'), uDen   = U('uDensity'), uHue   = U('uHueShift');
    const uSpd    = U('uSpeed'), uMouse = U('uMouse'), uGlow  = U('uGlowIntensity');
    const uSat    = U('uSaturation'), uRep   = U('uMouseRepulsion'), uTwk   = U('uTwinkleIntensity');
    const uRotSpd = U('uRotationSpeed'), uRStr  = U('uRepulsionStrength'), uMAF   = U('uMouseActiveFactor');

    gl.uniform3f(uRes, canvas.width, canvas.height, canvas.width / canvas.height);
    gl.uniform2f(uFocal, 0.5, 0.5);
    gl.uniform1f(uDen, 1.8);
    gl.uniform1f(uHue, 210.0);   // blue/violet nebula
    gl.uniform1f(uSpd, 0.8);
    gl.uniform1f(uGlow, 0.5);
    gl.uniform1f(uSat, 1.0);
    gl.uniform1f(uRep, 1.0);     // mouse repulsion on
    gl.uniform1f(uTwk, 0.6);
    gl.uniform1f(uRotSpd, 0.04);
    gl.uniform1f(uRStr, 2.5);
    gl.uniform1f(uMAF, 0.0);
    gl.uniform2f(uMouse, 0.5, 0.5);

    let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
    let mActive = 0, tmActive = 0;
    const start = performance.now();

    this._onMove = e => {
      const pt = e.touches?.[0] ?? e;
      const r = canvas.getBoundingClientRect();
      tmx = (pt.clientX - r.left) / r.width;
      tmy = 1.0 - (pt.clientY - r.top) / r.height;
      tmActive = 1.0;
    };
    this._onUp = () => { tmActive = 0.0; };
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointerleave', this._onUp);

    const loop = () => {
      const t = (performance.now() - start) * 0.001;
      mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
      mActive += (tmActive - mActive) * 0.05;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uSS, t * 0.05);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uMAF, mActive);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._canvas = canvas; this._gl = gl;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._canvas) {
      this._canvas.removeEventListener('pointermove', this._onMove);
      this._canvas.removeEventListener('pointerup', this._onUp);
      this._canvas.removeEventListener('pointerleave', this._onUp);
    }
    this._gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this._canvas = null;
  },
};
