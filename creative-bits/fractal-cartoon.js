// Fractal Cartoon — ported from ShaderToy "Fractal Cartoon" by Kali
// Original: https://www.shadertoy.com/view/XsBXW
window.plethoraBit = {
  meta: {
    title: 'Fractal Cartoon',
    author: 'plethora',
    description: 'Fly through Kali\'s raymarched fractal world.',
    tags: ['creative'],
    permissions: ['audio', 'haptics'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;

    // Render landscape (H×W) at half-res, rotated 90° CW via CSS
    const SCALE = 0.5;
    const RW = Math.floor(H * SCALE);  // landscape width
    const RH = Math.floor(W * SCALE);  // landscape height

    const canvas = ctx.createCanvas({ touchAction: 'none' });
    canvas.width = RW;
    canvas.height = RH;
    // CSS: element is H px wide, W px tall; rotate 90° CW about top-left
    canvas.style.cssText = `position:absolute;top:0;left:0;width:${H}px;height:${W}px;transform-origin:0 0;transform:translate(${W}px,0) rotate(90deg);image-rendering:pixelated;touch-action:none;`;

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      const c2 = ctx.createCanvas2D();
      const g = c2.getContext('2d');
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff';
      g.font = '16px sans-serif';
      g.textAlign = 'center';
      g.fillText('WebGL not available', W / 2, H / 2);
      ctx.platform.ready();
      return;
    }

    const VS = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;

    const FS = `
      precision highp float;
      uniform vec2  iResolution;
      uniform float iTime;
      uniform vec4  iMouse;

      #define RAY_STEPS 75
      #define BRIGHTNESS 1.2
      #define GAMMA      1.4
      #define SATURATION 0.65
      #define detail     0.001

      float gDet  = 0.0;
      float gEdge = 0.0;

      mat2 rot(float a) {
        float c = cos(a), s = sin(a);
        return mat2(c, s, -s, c);
      }

      vec4 formula(vec4 p) {
        p.xz = abs(p.xz + 1.0) - abs(p.xz - 1.0) - p.xz;
        p.y  -= 0.25;
        p.xy *= rot(radians(35.0));
        p     = p * 2.0 / clamp(dot(p.xyz, p.xyz), 0.2, 1.0);
        return p;
      }

      float de(vec3 pos) {
        float ti = iTime * 0.5;
        pos.y += sin(pos.z - ti * 6.0) * 0.15;
        vec3 tpos = pos;
        tpos.z = abs(3.0 - mod(tpos.z, 6.0));
        vec4 p = vec4(tpos, 1.0);
        for (int i = 0; i < 4; i++) { p = formula(p); }
        float fr = (length(max(vec2(0.0), p.yz - 1.5)) - 1.0) / p.w;
        float ro = max(abs(pos.x + 1.0) - 0.3,  pos.y - 0.35);
              ro = max(ro, -max(abs(pos.x + 1.0) - 0.1, pos.y - 0.5));
        pos.z    = abs(0.25 - mod(pos.z, 0.5));
              ro = max(ro, -max(abs(pos.z) - 0.2,  pos.y - 0.3));
              ro = max(ro, -max(abs(pos.z) - 0.01, -pos.y + 0.32));
        return min(fr, ro);
      }

      vec3 path(float ti) {
        ti *= 1.5;
        return vec3(sin(ti), (1.0 - sin(ti * 2.0)) * 0.5, -ti * 5.0) * 0.5;
      }

      vec3 calcNormal(vec3 p) {
        vec3 e  = vec3(0.0, gDet * 5.0, 0.0);
        float d1 = de(p - e.yxx), d2 = de(p + e.yxx);
        float d3 = de(p - e.xyx), d4 = de(p + e.xyx);
        float d5 = de(p - e.xxy), d6 = de(p + e.xxy);
        float d  = de(p);
        gEdge  = abs(d - 0.5*(d1+d2))
               + abs(d - 0.5*(d3+d4))
               + abs(d - 0.5*(d5+d6));
        gEdge  = min(1.0, pow(gEdge, 0.55) * 15.0);
        return normalize(vec3(d1-d2, d3-d4, d5-d6));
      }

      vec3 raymarch(vec3 from, vec3 dir) {
        gDet = 0.0; gEdge = 0.0;
        vec3  p = from;
        float d = 100.0, totdist = 0.0;
        for (int i = 0; i < RAY_STEPS; i++) {
          if (d > gDet && totdist < 25.0) {
            p        = from + totdist * dir;
            d        = de(p);
            gDet     = detail * exp(0.13 * totdist);
            totdist += d;
          }
        }
        p -= (gDet - d) * dir;
        vec3 norm = calcNormal(p);
        vec3 col  = (1.0 - abs(norm)) * max(0.0, 1.0 - gEdge * 0.8);

        totdist = clamp(totdist, 0.0, 26.0);
        dir.y  -= 0.02;

        float sunsize = 7.0;
        float an = atan(dir.x, dir.y) + iTime * 1.5;
        float s  = pow(clamp(1.0 - length(dir.xy)*sunsize          - abs(0.2-mod(an,0.4)), 0.0,1.0), 0.1);
        float sb = pow(clamp(1.0 - length(dir.xy)*(sunsize-0.2)    - abs(0.2-mod(an,0.4)), 0.0,1.0), 0.1);
        float sg = pow(clamp(1.0 - length(dir.xy)*(sunsize-4.5) - 0.5*abs(0.2-mod(an,0.4)), 0.0,1.0), 3.0);
        float y  = mix(0.45, 1.2, pow(smoothstep(0.0,1.0,0.75-dir.y), 2.0)) * (1.0 - sb*0.5);

        vec3 backg  = vec3(0.5,0.0,1.0) * ((1.0-s)*(1.0-sg)*y + (1.0-sb)*sg*vec3(1.0,0.8,0.15)*3.0);
             backg += vec3(1.0,0.9,0.1) * s;
             backg  = max(backg, sg * vec3(1.0,0.9,0.5));

        col = mix(vec3(1.0,0.9,0.3), col, exp(-0.004*totdist*totdist));
        if (totdist > 25.0) col = backg;

        col = pow(col, vec3(GAMMA)) * BRIGHTNESS;
        col = mix(vec3(length(col)), col, SATURATION);
        col *= vec3(1.0, 0.9, 0.85);
        return col;
      }

      vec3 move(inout vec3 dir) {
        float ti    = iTime * 0.5;
        vec3 go     = path(ti);
        vec3 adv    = path(ti + 0.7);
        vec3 advec  = normalize(adv - go);
        float an    = adv.x - go.x;
        an         *= min(1.0, abs(adv.z-go.z)) * sign(adv.z-go.z) * 0.7;
        dir.xy *= rot(an);
        an      = advec.y * 1.7;
        dir.yz *= rot(an);
        an      = atan(advec.x, advec.z);
        dir.xz *= rot(an);
        return go;
      }

      void main() {
        vec2 fc    = gl_FragCoord.xy;
        vec2 uv    = fc / iResolution.xy * 2.0 - 1.0;
        vec2 oriuv = uv;
        uv.y      *= iResolution.y / iResolution.x;

        vec2 mouse = (iMouse.xy / iResolution.xy - 0.5) * 3.0;
        if (iMouse.z < 1.0) mouse = vec2(0.0, -0.05);

        float fov  = 0.9 - max(0.0, 0.7 - iTime * 0.3);
        vec3  dir  = normalize(vec3(uv * fov, 1.0));
        dir.yz    *= rot(mouse.y);
        dir.xz    *= rot(mouse.x);

        vec3 origin = vec3(-1.0, 0.7, 0.0);
        vec3 from   = origin + move(dir);
        vec3 color  = raymarch(from, dir);

        color = mix(vec3(0.0), color,
                    pow(max(0.0, 0.95 - length(oriuv*oriuv*oriuv*vec2(1.05,1.1))), 0.3));

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function compileShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(prog));
    }

    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime  = gl.getUniformLocation(prog, 'iTime');
    const uRes   = gl.getUniformLocation(prog, 'iResolution');
    const uMouse = gl.getUniformLocation(prog, 'iMouse');

    gl.uniform2f(uRes, RW, RH);

    // Smooth touch targets and smoothed values (in landscape canvas coords)
    let tmx = RW / 2, tmy = RH / 2;
    let smx = RW / 2, smy = RH / 2;
    let mz = 0;
    let started = false;
    const startTime = performance.now();

    // Web Audio — exact port of ShaderToy mainSound shader
    // fract(sin(2π*440*t)*100) * exp(-t) * min(1,t), repeating mod(t-5, 12)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.onDestroy(() => audioCtx.close());

    // ScriptProcessorNode: exact port of mainSound shader
    // fract(sin(2π*440*t)*100) * exp(-t) * min(1,t), mod(t-5, 12)
    let soundSamples = 0;
    const proc = audioCtx.createScriptProcessor(2048, 0, 1);
    proc.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      const sr = audioCtx.sampleRate;
      for (let i = 0; i < out.length; i++) {
        const t = (soundSamples + i) / sr;
        const lt = ((t - 5) % 12 + 12) % 12;
        const wave = ((Math.sin(6.2831 * 440 * lt) * 100) % 1 + 1) % 1;
        out[i] = wave * Math.exp(-lt) * Math.min(1, lt) * 0.3;
      }
      soundSamples += out.length;
    };
    proc.connect(audioCtx.destination);

    // Touch: portrait coords → landscape canvas coords
    // With CSS rotate(90deg): portrait clientY → landscape X, portrait clientX → landscape Y
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      audioCtx.resume();
      if (!started) { started = true; ctx.platform.start(); }
      const t = e.changedTouches[0];
      tmx = t.clientY * SCALE;
      tmy = t.clientX * SCALE;
      mz = 1;
      ctx.platform.haptic('light');
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      tmx = t.clientY * SCALE;
      tmy = t.clientX * SCALE;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      mz = 0;
    }, { passive: false });

    ctx.raf(() => {
      const iTime = (performance.now() - startTime) / 1000;

      // Lerp mouse toward target
      smx += (tmx - smx) * 0.06;
      smy += (tmy - smy) * 0.06;

      gl.uniform1f(uTime, iTime);
      gl.uniform4f(uMouse, smx, smy, mz, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
