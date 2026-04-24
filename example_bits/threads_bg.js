window.scrollerApp = {
  meta: {
    title: 'Thread Flow',
    author: 'YourUsername',
    description: 'Slide your finger through 40 flowing noise threads',
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
uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;
uniform float uMouseActive;
const int LINE_COUNT=20;
const float LINE_W=9.;
const float LINE_BLUR=11.;

float Perlin2D(vec2 P){
  vec2 Pi=floor(P);
  vec4 Pf=P.xyxy-vec4(Pi,Pi+1.);
  vec4 Pt=vec4(Pi.xy,Pi.xy+1.);
  Pt=Pt-floor(Pt*(1./71.))*71.;
  Pt+=vec2(26.,161.).xyxy;Pt*=Pt;Pt=Pt.xzxz*Pt.yyww;
  vec4 hx=fract(Pt*(1./951.135664));
  vec4 hy=fract(Pt*(1./642.949883));
  vec4 gx=hx-.49999,gy=hy-.49999;
  vec4 gr=inversesqrt(gx*gx+gy*gy)*(gx*Pf.xzxz+gy*Pf.yyww);
  gr*=1.4142135623730950;
  vec2 bl=Pf.xy*Pf.xy*Pf.xy*(Pf.xy*(Pf.xy*6.-15.)+10.);
  vec4 b2=vec4(bl,vec2(1.)-bl);
  return dot(gr,b2.zxzx*b2.wwyy);
}

float px(float c){return(1./max(iResolution.x,iResolution.y))*c;}

float lineFn(vec2 st,float width,float perc,vec2 mouse,float time,float amp,float dist){
  // start wiggling right from the left edge
  float spt=perc*.08;
  float an=smoothstep(spt,spt+.35,st.x);
  float fa=an*.5*amp;
  float ts=time/10.;
  float blur=smoothstep(spt,spt+.08,st.x)*perc*.6;
  float xn=mix(Perlin2D(vec2(ts,st.x+perc)*2.5),
               Perlin2D(vec2(ts,st.x+ts)*3.5)/1.5,st.x*.3);
  float lineY=.5+(perc-.5)*dist;
  // finger attraction: threads bend toward touch x/y
  float dx=st.x-mouse.x;
  float pull=exp(-dx*dx*7.)*(mouse.y-lineY)*0.55*uMouseActive;
  float y=lineY+xn/2.*fa+pull;
  float ls=smoothstep(y+(width/2.)+(LINE_BLUR*px(1.)*blur),y,st.y);
  float le=smoothstep(y,y-(width/2.)-(LINE_BLUR*px(1.)*blur),st.y);
  return clamp(ls-le,0.,1.);
}

void main(){
  vec2 uv=gl_FragCoord.xy/iResolution.xy;
  vec2 uvM=vec2(uv.x,1.-uv.y);   // mirrored — fills top half symmetrically
  float s1=1.,s2=1.;
  for(int i=0;i<LINE_COUNT;i++){
    float p=float(i)/float(LINE_COUNT);
    float w=LINE_W*px(1.)*(1.-p*.35);
    s1*=(1.-lineFn(uv, w,p,uMouse,iTime,uAmplitude,uDistance));
    s2*=(1.-lineFn(uvM,w,p,uMouse,iTime,uAmplitude,uDistance));
  }
  float v=1.-s1*s2;
  gl_FragColor=vec4(uColor*v,v);
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

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.02, 0.01, 0.06, 1);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const uTime        = gl.getUniformLocation(prog, 'iTime');
    const uRes         = gl.getUniformLocation(prog, 'iResolution');
    const uColor       = gl.getUniformLocation(prog, 'uColor');
    const uAmp         = gl.getUniformLocation(prog, 'uAmplitude');
    const uDist        = gl.getUniformLocation(prog, 'uDistance');
    const uMouse       = gl.getUniformLocation(prog, 'uMouse');
    const uMouseActive = gl.getUniformLocation(prog, 'uMouseActive');

    gl.uniform3f(uColor, 0.55, 0.15, 1.0);
    gl.uniform1f(uAmp, 1.8);
    gl.uniform1f(uDist, 0.88);
    gl.uniform3f(uRes, canvas.width, canvas.height, canvas.width / canvas.height);
    gl.uniform2f(uMouse, 0.5, 0.5);
    gl.uniform1f(uMouseActive, 0.0);

    let mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5;
    let active = 0, tActive = 0;
    const start = performance.now();

    this._onDown = e => {
      const pt = e.touches?.[0] ?? e;
      const r = canvas.getBoundingClientRect();
      tmx = (pt.clientX - r.left) / r.width;
      tmy = 1.0 - (pt.clientY - r.top) / r.height;
      tActive = 1.0;
    };
    this._onMove = e => {
      const pt = e.touches?.[0] ?? e;
      const r = canvas.getBoundingClientRect();
      tmx = (pt.clientX - r.left) / r.width;
      tmy = 1.0 - (pt.clientY - r.top) / r.height;
    };
    this._onUp = () => { tActive = 0.0; };

    canvas.addEventListener('pointerdown',   this._onDown);
    canvas.addEventListener('pointermove',   this._onMove);
    canvas.addEventListener('pointerup',     this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);

    const loop = () => {
      mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
      active += (tActive - active) * 0.08;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, (performance.now() - start) * 0.001);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uMouseActive, active);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._canvas = canvas; this._gl = gl;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown',   this._onDown);
      this._canvas.removeEventListener('pointermove',   this._onMove);
      this._canvas.removeEventListener('pointerup',     this._onUp);
      this._canvas.removeEventListener('pointercancel', this._onUp);
    }
    this._gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this._canvas = null;
  },
};
