window.scrollerApp = {
  meta: {
    title: 'Liquid Blobs',
    author: 'YourUsername',
    description: 'Drag to pull neon metaball blobs toward your finger',
    tags: ['creative'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(canvas);

    const gl = canvas.getContext('webgl2');
    if (!gl) { container.innerHTML = '<p style="color:#fff;padding:20px">WebGL2 required</p>'; return; }

    const vert = `#version 300 es
layout(location=0) in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;

    const frag = `#version 300 es
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform vec3 iMouse;
uniform vec3 iColor;
uniform vec3 iCursorColor;
uniform float iAnimationSize;
uniform int iBallCount;
uniform float iCursorBallSize;
uniform vec3 iMetaBalls[20];
out vec4 outColor;

float mb(vec2 c,float r,vec2 p){vec2 d=p-c;return(r*r)/dot(d,d);}

void main(){
  float sc=iAnimationSize/iResolution.y;
  vec2 coord=(gl_FragCoord.xy-iResolution.xy*.5)*sc;
  vec2 mw=(iMouse.xy-iResolution.xy*.5)*sc;
  float m1=0.;
  for(int i=0;i<20;i++){
    if(i>=iBallCount)break;
    m1+=mb(iMetaBalls[i].xy,iMetaBalls[i].z,coord);
  }
  float m2=mb(mw,iCursorBallSize,coord);
  float total=m1+m2;
  float f=smoothstep(-1.,1.,(total-1.3)/min(1.,fwidth(total)));
  vec3 c=vec3(0.);
  if(total>0.){c=iColor*(m1/total)+iCursorColor*(m2/total);}
  outColor=vec4(c*f,f);
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
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.04, 0.0, 0.08, 1);
    gl.viewport(0, 0, W, H);

    const U = n => gl.getUniformLocation(prog, n);
    const uTime   = U('iTime'), uRes   = U('iResolution'), uMouse = U('iMouse');
    const uColor  = U('iColor'), uCCol  = U('iCursorColor'), uASize = U('iAnimationSize');
    const uBCnt   = U('iBallCount'), uCSz   = U('iCursorBallSize');

    const BALL_COUNT = 14;
    gl.uniform3f(uRes, W, H, W / H);
    gl.uniform3f(uColor, 0.0, 1.0, 0.85);      // cyan
    gl.uniform3f(uCCol, 1.0, 0.1, 0.8);         // hot pink cursor
    gl.uniform1f(uASize, 28.0);
    gl.uniform1i(uBCnt, BALL_COUNT);
    gl.uniform1f(uCSz, 3.5);

    // Generate ball orbit params
    function fract(x) { return x - Math.floor(x); }
    function hash31(p) {
      let r = [fract(p*0.1031), fract(p*0.103), fract(p*0.0973)];
      const d = r[0]*(r[1]+33.33)+r[1]*(r[2]+33.33)+r[2]*(r[0]+33.33);
      return [fract(r[0]+d), fract(r[1]+d), fract(r[2]+d)];
    }
    function hash33(v) {
      let p = [fract(v[0]*0.1031), fract(v[1]*0.103), fract(v[2]*0.0973)];
      const d = p[0]*(p[1]+33.33)+p[1]*(p[0]+33.33)+p[2]*(p[1]+33.33);
      return [fract((p[0]+p[1])*(p[2]+d)), fract((p[1]+p[2])*(p[0]+d)), fract((p[2]+p[0])*(p[1]+d))];
    }

    const ballParams = [];
    for (let i = 0; i < BALL_COUNT; i++) {
      const h1 = hash31(i + 1);
      const h2 = hash33(h1);
      ballParams.push({
        st:        h1[0] * Math.PI * 2,
        dtFactor:  0.1*Math.PI + h1[1]*(0.4*Math.PI - 0.1*Math.PI),
        baseScale: 5.0 + h1[1]*5.0,
        toggle:    Math.floor(h2[0]*2),
        radius:    0.6 + h2[2]*1.4,
      });
    }

    const mbUniform = [];
    for (let i = 0; i < BALL_COUNT; i++) mbUniform.push([0,0,0]);

    let cMouseX = W/2, cMouseY = H/2, tMouseX = W/2, tMouseY = H/2;
    let inside = false;
    const start = performance.now();
    const SPEED = 0.25;

    this._onMove = e => {
      const pt = e.touches?.[0] ?? e;
      const r = canvas.getBoundingClientRect();
      tMouseX = (pt.clientX - r.left) * (W / r.width);
      tMouseY = (1 - (pt.clientY - r.top) / r.height) * H;
      inside = true;
    };
    this._onLeave = () => { inside = false; };
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerleave', this._onLeave);

    const loop = () => {
      const t = (performance.now() - start) * 0.001;

      for (let i = 0; i < BALL_COUNT; i++) {
        const p = ballParams[i];
        const dt = t * SPEED * p.dtFactor;
        const th = p.st + dt;
        mbUniform[i][0] = Math.cos(th) * p.baseScale;
        mbUniform[i][1] = Math.sin(th + dt * p.toggle) * p.baseScale;
        mbUniform[i][2] = p.radius;
        gl.uniform3f(gl.getUniformLocation(prog, `iMetaBalls[${i}]`), mbUniform[i][0], mbUniform[i][1], mbUniform[i][2]);
      }

      if (!inside) {
        tMouseX = W/2 + Math.cos(t*SPEED)*W*0.12;
        tMouseY = H/2 + Math.sin(t*SPEED)*H*0.12;
      }
      cMouseX += (tMouseX - cMouseX) * 0.06;
      cMouseY += (tMouseY - cMouseY) * 0.06;

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, t);
      gl.uniform3f(uMouse, cMouseX, cMouseY, 0);
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
      this._canvas.removeEventListener('pointerleave', this._onLeave);
    }
    this._gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this._canvas = null;
  },
};
