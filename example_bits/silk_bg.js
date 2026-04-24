window.scrollerApp = {
  meta: {
    title: 'Silk Waves',
    author: 'YourUsername',
    description: 'Drag to twist rippling silk — tap to change color',
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
varying vec2 vUv;
void main(){
  vUv=position*.5+.5;
  gl_Position=vec4(position,0.,1.);
}`;

    const frag = `precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float E=2.71828182845904523536;

float noise(vec2 tc){
  float G=E;
  vec2 r=(G*sin(G*tc));
  return fract(r.x*r.y*(1.+tc.x));
}

vec2 rot(vec2 uv,float a){
  float c=cos(a),s=sin(a);
  return mat2(c,-s,s,c)*uv;
}

void main(){
  float rnd=noise(gl_FragCoord.xy);
  vec2 uv=rot(vUv*uScale,uRotation);
  vec2 tex=uv*uScale;
  float to=uSpeed*uTime;
  tex.y+=.03*sin(8.*tex.x-to);
  float pat=.6+.4*sin(5.*(tex.x+tex.y+cos(3.*tex.x+5.*tex.y)+.02*to)+sin(20.*(tex.x+tex.y-.1*to)));
  vec4 col=vec4(uColor,1.)*vec4(pat)-rnd/15.*uNoiseIntensity;
  col.a=1.;
  gl_FragColor=col;
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

    const uTime  = gl.getUniformLocation(prog, 'uTime');
    const uColor = gl.getUniformLocation(prog, 'uColor');
    const uSpeed = gl.getUniformLocation(prog, 'uSpeed');
    const uScale = gl.getUniformLocation(prog, 'uScale');
    const uRot   = gl.getUniformLocation(prog, 'uRotation');
    const uNoise = gl.getUniformLocation(prog, 'uNoiseIntensity');

    // Colour palette: deep jade teal → violet → rose → gold (cycles on tap)
    const PALETTES = [
      [0.0, 0.62, 0.55],   // jade teal
      [0.5, 0.1,  0.9],    // deep violet
      [0.9, 0.15, 0.4],    // rose
      [0.9, 0.6,  0.1],    // gold
      [0.1, 0.4,  0.9],    // ocean blue
    ];
    let palIdx = 0;
    gl.uniform3f(uColor, ...PALETTES[0]);
    gl.uniform1f(uSpeed, 5.0);
    gl.uniform1f(uScale, 2.2);
    gl.uniform1f(uRot, 0.0);
    gl.uniform1f(uNoise, 1.5);

    let rotation = 0.0, targetRot = 0.0;
    let dragging = false, dragDist = 0, lastX = 0;
    const start = performance.now();

    this._onDown = e => {
      const pt = e.touches?.[0] ?? e;
      dragging = true; dragDist = 0; lastX = pt.clientX;
    };
    this._onMove = e => {
      if (!dragging) return;
      const pt = e.touches?.[0] ?? e;
      const dx = pt.clientX - lastX;
      dragDist += Math.abs(dx);
      targetRot += dx * 0.012;
      lastX = pt.clientX;
    };
    this._onUp = () => {
      if (dragDist < 8) {
        palIdx = (palIdx + 1) % PALETTES.length;
        gl.useProgram(prog);
        gl.uniform3f(uColor, ...PALETTES[palIdx]);
      }
      dragging = false;
    };
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup',   this._onUp);

    const loop = () => {
      rotation += (targetRot - rotation) * 0.04;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, (performance.now() - start) * 0.001);
      gl.uniform1f(uRot, rotation);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this._canvas = canvas; this._gl = gl;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onDown);
      this._canvas.removeEventListener('pointermove', this._onMove);
      this._canvas.removeEventListener('pointerup',   this._onUp);
    }
    this._gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this._canvas = null;
  },
};
