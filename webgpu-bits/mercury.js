window.plethoraBit = {
  meta: {
    title: 'mercury',
    author: 'plethora',
    description: 'Sing to morph the mercury. Touch to move it.',
    tags: ['creative'],
    permissions: ['microphone'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;

    const PARAMS = {
      sphereR:          0.24,
      bubbleCount:      8,
      bubbleRadiusMin:  0.06,
      bubbleRadiusMax:  0.14,
      bubbleSpeed:      0.7,
      mouseSmoothing:   0.05,
    };
    const N = PARAMS.bubbleCount;

    // VFX-JS needs an HTML element as its source texture — a dark gradient bg
    const bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;inset:0;background:#000;';
    ctx.container.appendChild(bg);
    ctx.onDestroy(() => { if (bg.parentNode) bg.parentNode.removeChild(bg); });

    // Dynamic import — VFX-JS is ESM-only
    const { VFX } = await import('https://esm.sh/@vfx-js/core@0.11.1');

    const postEffectShader = `
      precision highp float;
      uniform sampler2D src;
      uniform vec2 resolution;
      uniform vec2 offset;
      uniform vec2 mouse;
      uniform vec2 lag;
      uniform float time;
      uniform float clickTime;
      uniform int clickCount;
      uniform float sphereR;
      out vec4 outColor;

      const float DISP        = 0.025;
      const int   DISP_STEPS  = 12;
      const float DISP_LO     = 0.0;
      const float DISP_HI     = 1.0;
      const float SCATTER     = 0.03;
      const int   N_BUBBLES   = ${N};
      const float BUBBLE_SMOOTH = 0.025;
      uniform float bubbleData[${N * 4}];
      const vec3 ABSORB = vec3(2.0, 1.2, 1.0) * 3.;

      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5*(b-a)/k, 0., 1.);
        return mix(b, a, h) - k*h*(1.-h);
      }
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
        p3 += dot(p3, p3.yzx+33.33);
        return fract((p3.xx+p3.yz)*p3.zy)*2.-1.;
      }
      mat2 rot(float t) { float c=cos(t),s=sin(t); return mat2(c,-s,s,c); }
      float sdSphere(vec3 p, float r) { return length(p)-r; }
      float sdBox(vec3 p, vec3 b, float r) {
        vec3 q=abs(p)-b+r;
        return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;
      }
      float sdRing(vec3 p, vec2 r) {
        float s=length(p.xy)-r.x;
        return length(vec2(s,p.z))-r.y;
      }
      float map(vec3 p, vec3 c) {
        vec3 q = p-c;
        float tt = clickTime*5.;
        float bounce = exp(-tt)*sin(tt)*5.+(1.-exp(-tt));
        float s = bounce*.5+.5;
        q /= s;
        q.xz *= rot(exp(-clickTime*3.)*8.);
        vec3 sp = q;
        sp.y += sin(sp.z*29.+time*6.5)*.01;
        sp.z += sin(sp.x*23.+sp.y*11.+time*7.)*.01;
        sp.xy *= rot(time*1.3);
        sp.xz *= rot(time*1.1);
        float d;
        int obj = clickCount%3;
        if (obj==0)      d = sdSphere(sp, sphereR);
        else if (obj==1) d = sdBox(sp, vec3(sphereR*.8), .01);
        else             d = sdRing(sp, vec2(sphereR*1.1, .015));
        for (int i=0; i<N_BUBBLES; i++) {
          int b=i*4;
          vec3 bp=vec3(bubbleData[b],bubbleData[b+1],bubbleData[b+2]);
          float r=bubbleData[b+3];
          d=smin(d, sdSphere(q-bp, max(r,.001)), BUBBLE_SMOOTH);
        }
        return d*s;
      }
      vec3 calcNormal(vec3 p, vec3 c) {
        vec2 e=vec2(.001,0.);
        return normalize(vec3(
          map(p+e.xyy,c)-map(p-e.xyy,c),
          map(p+e.yxy,c)-map(p-e.yxy,c),
          map(p+e.yyx,c)-map(p-e.yyx,c)
        ));
      }
      vec3 spectrum(float x) {
        return clamp(vec3(
          1.5-abs(4.*x-1.),
          1.5-abs(4.*x-2.),
          1.5-abs(4.*x-3.)
        ),0.,1.);
      }
      vec4 getSrc(vec2 uv) {
        vec4 c=texture(src,uv);
        return mix(vec4(1),c,c.a);
      }
      void main() {
        vec2 uv  = (gl_FragCoord.xy-offset)/resolution;
        float asp = resolution.y/resolution.x;
        vec2 p   = (uv-.5)*vec2(1.,asp);
        vec2 mp  = ((mouse+lag)/resolution-.5)*vec2(1.,asp);
        vec3 ro  = vec3(0.,0.,-2.);
        vec3 rd  = normalize(vec3(p, 2.));
        vec3 c   = vec3(mp, 0.);

        vec3 firstN=vec3(0.), lastN=vec3(0.);
        int hitCount=0;
        float thickness=0., tEntry=0., t=0.;
        bool inside=false;

        for (int i=0; i<50; i++) {
          if (t>10.) break;
          vec3 pos=ro+rd*t;
          float d=map(pos,c);
          float step=inside?-d:d;
          if (step<3e-4) {
            vec3 n=calcNormal(pos,c);
            if (hitCount==0) firstN=n;
            lastN=n;
            if (!inside) tEntry=t;
            else thickness+=t-tEntry;
            hitCount++;
            if (hitCount>=4) break;
            inside=!inside;
            t+=.01;
          } else { t+=step; }
        }

        if (hitCount>0) {
          vec2 baseDisp=-(firstN.xy+lastN.xy)*.5*DISP;
          float NdotR=max(dot(firstN,-rd),0.);
          float scatter=pow(1.-NdotR,2.)*SCATTER;
          vec3 acc=vec3(0.), wsum=vec3(0.);
          for (int i=0; i<DISP_STEPS; i++) {
            float wl=float(i)/float(DISP_STEPS-1);
            float k=mix(DISP_LO,DISP_HI,wl)*(1.3+float(hitCount)*.2);
            vec2 h=hash22(uv*1000.+float(i)*7.13+time)*scatter;
            vec3 w=spectrum(wl);
            acc+=getSrc(uv+baseDisp*k+h).rgb*w;
            wsum+=w;
          }
          vec3 col=acc/wsum*.99;
          col-=float(hitCount)*.05;
          col+=.1;
          float fres=pow(1.-NdotR,5.);
          col*=1.+fres;
          float f2=1.-pow(NdotR,3.);
          col*=mix(vec3(1),exp(-ABSORB*thickness),f2);
          col*=1.+f2;
          vec3 ld=normalize(vec3(.5,.9,-.3));
          float spec=pow(max(dot(reflect(-ld,firstN),-rd),0.),200.);
          col+=spec*30.;
          ld=normalize(vec3(-.9,.4,-.3));
          spec=pow(max(dot(reflect(-ld,firstN),-rd),0.),300.);
          col+=spec*3.;
          ld=normalize(vec3(-.1,-.9,-.1));
          spec=pow(max(dot(reflect(-ld,firstN),-rd),0.),30.);
          col+=spec*.5;
          col=min(col,1.);
          col=1.-abs(col+fres*.5-1.);
          outColor=vec4(col,1.);
        } else {
          outColor=getSrc(uv);
        }
      }
    `;

    // ── State ─────────────────────────────────────────────────────────────────
    const frac = (x) => x - Math.floor(x);
    const rot2d = (x, y, t) => {
      const c = Math.cos(t), s = Math.sin(t);
      return [x*c - y*s, x*s + y*c];
    };

    const p0 = { x: W/2, y: H/2 };
    const p1 = { x: W/2, y: H/2 };
    const p2 = { x: W/2, y: H/2 };
    let lastClickTime = performance.now() / 1000;
    let clickCount = 0;
    let centerBlend = 1.0;
    let hasMouse = false;
    let touched = false;

    const bubbles = new Float32Array(N * 4);
    const t0 = performance.now() / 1000;

    // ── Audio state ───────────────────────────────────────────────────────────
    let mic = null;
    let smoothAmp = 0;
    const bandEnergy = new Float32Array(N);

    // ── Touch input ───────────────────────────────────────────────────────────
    ctx.listen(ctx.container, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      p0.x = t.clientX;
      p0.y = H - t.clientY;
      lastClickTime = performance.now() / 1000;
      clickCount++;
      hasMouse = true;
      if (!touched) {
        touched = true;
        ctx.platform.start();
        // Start mic on first gesture (iOS requires user interaction)
        ctx.microphone.start({ fftSize: 1024, smoothing: 0.75 })
          .then(m => { mic = m; })
          .catch(() => {});
      }
      ctx.platform.haptic('light');
    }, { passive: false });

    ctx.listen(ctx.container, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      p0.x = t.clientX;
      p0.y = H - t.clientY;
    }, { passive: false });

    ctx.listen(ctx.container, 'touchend', (e) => {
      e.preventDefault();
    }, { passive: false });

    // ── Bubble + audio animation ──────────────────────────────────────────────
    ctx.raf(() => {
      const time = performance.now() / 1000 - t0;
      const sm = PARAMS.mouseSmoothing;
      p1.x += (p0.x - p1.x) * sm;
      p1.y += (p0.y - p1.y) * sm;
      p2.x += (p1.x - p2.x) * sm;
      p2.y += (p1.y - p2.y) * sm;

      if (hasMouse) centerBlend *= 0.95;

      // Read mic data and update audio state
      if (mic) {
        const timeDom = mic.getTimeDomainData();
        let rms = 0;
        for (let k = 0; k < timeDom.length; k++) rms += timeDom[k] * timeDom[k];
        rms = Math.sqrt(rms / timeDom.length);
        smoothAmp += (Math.min(rms * 3, 1) - smoothAmp) * 0.12;

        const freq = mic.getFrequencyData();
        const binHz = mic.sampleRate / mic.fftSize;
        // Map 8 bubbles to log-spaced frequency bands from 80 Hz → 4000 Hz
        for (let i = 0; i < N; i++) {
          const t0b = i / N, t1b = (i + 1) / N;
          const fLo = 80 * Math.pow(4000 / 80, t0b);
          const fHi = 80 * Math.pow(4000 / 80, t1b);
          const bLo = Math.max(0, Math.floor(fLo / binHz));
          const bHi = Math.min(freq.length - 1, Math.ceil(fHi / binHz));
          let sum = 0, count = 0;
          for (let b = bLo; b <= bHi; b++) { sum += freq[b] / 255; count++; }
          const energy = count > 0 ? sum / count : 0;
          bandEnergy[i] += (energy - bandEnergy[i]) * 0.18;
        }
      }

      for (let i = 0; i < N; i++) {
        const life = frac(time * PARAMS.bubbleSpeed + i / N);
        const orbitR = PARAMS.sphereR * (0.3 + life * 0.8);
        const orbitAngle = time * (0.8 + frac(i * 0.618) * 0.7) + i * 1.256;

        let bx = Math.cos(orbitAngle) * orbitR;
        let by = 0;
        let bz = Math.sin(orbitAngle) * orbitR;

        [bx, by] = rot2d(bx, by, i * 2.3);
        [by, bz] = rot2d(by, bz, i * 1.8);

        by += life * 0.1;
        bx += Math.sin(time * 2.7 + i * 4.1) * 0.008 * life;
        bz += Math.cos(time * 3.1 + i * 3.7) * 0.008 * life;

        bx += ((p2.x - p1.x) / W) * (H / W);
        by += (p2.y - p1.y) / H;

        const range = PARAMS.bubbleRadiusMax - PARAMS.bubbleRadiusMin;
        const maxR  = PARAMS.bubbleRadiusMin + range * frac(i * 0.618);
        const audioScale = 1 + bandEnergy[i] * 3.0;
        const j = i * 4;
        bubbles[j]     = bx;
        bubbles[j + 1] = by;
        bubbles[j + 2] = bz;
        bubbles[j + 3] = maxR * Math.sin(life * Math.PI) * audioScale;
      }
    });

    // ── VFX-JS setup ─────────────────────────────────────────────────────────
    const vfx = new VFX({
      postEffect: {
        shader: postEffectShader,
        uniforms: {
          lag: () => {
            const dpr = window.devicePixelRatio || 1;
            const lx  = (p1.x - p0.x) * dpr;
            const ly  = (p1.y - p0.y) * dpr;
            const cx  = W/2 * dpr * centerBlend;
            const cy  = H/2 * dpr * centerBlend;
            return [cx + lx, cy + ly];
          },
          sphereR:    () => PARAMS.sphereR * (1 + smoothAmp * 0.7),
          clickTime:  () => performance.now() / 1000 - lastClickTime,
          clickCount: () => clickCount,
          bubbleData: () => bubbles,
        },
      },
    });

    ctx.onDestroy(() => { try { vfx.destroy(); } catch(_) {} });

    await vfx.addHTML(bg, { shader: 'none' });
    vfx.play();

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;1,300&display=swap';
    document.head.appendChild(fontLink);
    ctx.onDestroy(() => { if (fontLink.parentNode) fontLink.parentNode.removeChild(fontLink); });

    const label = document.createElement('div');
    label.textContent = 'Sing, queen.';
    label.style.cssText = `
      position:fixed;
      left:0; right:0;
      bottom:${ctx.safeArea.bottom + H * 0.12}px;
      text-align:center;
      color:rgba(255,255,255,0.75);
      font-family:'Cormorant Garamond',Georgia,serif;
      font-weight:300;
      font-style:italic;
      font-size:${W * 0.072}px;
      letter-spacing:0.12em;
      pointer-events:none;
      z-index:9999;
    `;
    document.body.appendChild(label);
    ctx.onDestroy(() => { if (label.parentNode) label.parentNode.removeChild(label); });

    const label2 = document.createElement('div');
    label2.textContent = 'tap to evolve';
    label2.style.cssText = `
      position:fixed;
      left:0; right:0;
      bottom:${ctx.safeArea.bottom + H * 0.065}px;
      text-align:center;
      color:rgba(255,255,255,0.3);
      font-family:'Cormorant Garamond',Georgia,serif;
      font-weight:300;
      font-size:${W * 0.034}px;
      letter-spacing:0.2em;
      text-transform:uppercase;
      pointer-events:none;
      z-index:9999;
    `;
    document.body.appendChild(label2);
    ctx.onDestroy(() => { if (label2.parentNode) label2.parentNode.removeChild(label2); });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
