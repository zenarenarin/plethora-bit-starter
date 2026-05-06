window.plethoraBit = {
  meta: {
    title: 'explore',
    author: 'plethora',
    description: 'Swipe to explore a sprawling dystopian city.',
    tags: ['creative'],
    permissions: ['networkFetch'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;

    await ctx.loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');

    // Offscreen canvas — panned image drawn here each frame, used as Three.js texture
    const contentCanvas = document.createElement('canvas');
    contentCanvas.width = W;
    contentCanvas.height = H;
    const g = contentCanvas.getContext('2d');

    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = ctx.assets.url('thatdystopiancity.jpg');
    });

    const ZOOM = 2.0;
    const scale = (H / img.naturalHeight) * ZOOM;
    const imgW = img.naturalWidth * scale;
    const imgH = img.naturalHeight * scale;
    const maxCamX = Math.max(0, imgW - W);
    const maxCamY = Math.max(0, imgH - H);
    let camX = maxCamX * 0.5, camY = maxCamY * 0.5;
    let velX = 0, velY = 0;
    let dragging = false, lastX = 0, lastY = 0, lastT = 0;
    let touched = false, hintAlpha = 1.0;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // Three.js water sim
    const simScale = W < 768 ? 0.4 : 0.6;
    const resX = Math.max(1, Math.floor(W * simScale));
    const resY = Math.max(1, Math.floor(H * simScale));

    const scene = new THREE.Scene();
    const cam3 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false });
    renderer.setSize(W, H);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    ctx.container.appendChild(renderer.domElement);
    ctx.onDestroy(() => {
      rtA.dispose(); rtB.dispose();
      contentTex.dispose();
      simMat.dispose(); displayMat.dispose();
      geo.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    });

    const rtOpts = {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat, type: THREE.HalfFloatType,
    };
    const rtA = new THREE.WebGLRenderTarget(resX, resY, rtOpts);
    const rtB = rtA.clone();

    const contentTex = new THREE.CanvasTexture(contentCanvas);

    const simMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture:    { value: null },
        uResolution: { value: new THREE.Vector2(resX, resY) },
        uMouse:      { value: new THREE.Vector3(-1, -1, 0) },
        uDelta:      { value: 1.0 },
        uDamping:    { value: 0.98 },
        uRippleSize: { value: 20.0 },
      },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform vec2 uResolution;
        uniform vec3 uMouse;
        uniform float uDelta,uDamping,uRippleSize;
        varying vec2 vUv;
        void main(){
          vec2 t=1./uResolution,c=vUv;
          vec4 d=texture2D(uTexture,c);
          float p=d.x,v=d.y;
          float pr=texture2D(uTexture,c+vec2(t.x,0)).x;
          float pl=texture2D(uTexture,c-vec2(t.x,0)).x;
          float pu=texture2D(uTexture,c+vec2(0,t.y)).x;
          float pd=texture2D(uTexture,c-vec2(0,t.y)).x;
          float ptr=texture2D(uTexture,c+t).x;
          float ptl=texture2D(uTexture,c+vec2(-t.x,t.y)).x;
          float pbr=texture2D(uTexture,c+vec2(t.x,-t.y)).x;
          float pbl=texture2D(uTexture,c-t).x;
          if(c.x<t.x)pl=pr;if(c.x>1.-t.x)pr=pl;
          if(c.y<t.y)pd=pu;if(c.y>1.-t.y)pu=pd;
          float lap=(pr+pl+pu+pd)*.2+(ptr+ptl+pbr+pbl)*.05-p;
          v+=uDelta*lap*2.;
          p+=uDelta*v;
          p=mix(p,(pr+pl+pu+pd)*.3,.05);
          v-=.002*uDelta*p;
          v*=1.-.01*uDelta;
          p*=uDamping;
          if(uMouse.z>.5){
            float dist=distance(c*uResolution,uMouse.xy);
            p+=exp(-dist*dist/(uRippleSize*uRippleSize*.5));
          }
          p=clamp(p,-1.5,1.5);v=clamp(v,-1.5,1.5);
          gl_FragColor=vec4(p,v,(pr-pl)*.5,(pu-pd)*.5);
        }`,
    });

    const displayMat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture:        { value: null },
        uContentTexture: { value: contentTex },
      },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform sampler2D uTexture,uContentTexture;
        varying vec2 vUv;
        void main(){
          vec4 data=texture2D(uTexture,vUv);
          vec2 dist=data.zw*.25;
          float wh=data.x;
          vec3 color=texture2D(uContentTexture,vUv+dist).rgb;
          vec3 normal=normalize(vec3(-data.z*4.,0.5,-data.w*4.));
          vec3 light=normalize(vec3(-2.,5.,3.));
          float spec=pow(max(0.,dot(normal,light)),800.);
          color+=vec3(1.)*spec*1.2;
          color+=vec3(.2,.5,.9)*abs(wh)*.6;
          float spec2=pow(max(0.,dot(normal,light)),50.);
          color+=vec3(.9,.95,1.)*spec2*.6;
          gl_FragColor=vec4(color,1.);
        }`,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    const simMesh = new THREE.Mesh(geo, simMat);
    const displayMesh = new THREE.Mesh(geo, displayMat);

    let rtCur = rtA, rtPrev = rtB;
    const mouse = new THREE.Vector2(-1, -1);
    let mouseActive = false;

    // Use a real canvas for touch capture (pointer-events on WebGL canvas is disabled)
    const hitCanvas = ctx.createCanvas2D();
    hitCanvas.style.cssText = 'position:absolute;inset:0;opacity:0;';

    ctx.listen(hitCanvas, 'touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      dragging = true;
      lastX = t.clientX; lastY = t.clientY; lastT = performance.now();
      velX = velY = 0;
      mouseActive = true;
      mouse.set(t.clientX * simScale, (H - t.clientY) * simScale);
      if (!touched) { touched = true; ctx.platform.start(); }
    }, { passive: false });

    ctx.listen(hitCanvas, 'touchmove', (e) => {
      e.preventDefault();
      if (!dragging) return;
      const t = e.changedTouches[0];
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const dx = lastX - t.clientX, dy = lastY - t.clientY;
      camX = clamp(camX + dx, 0, maxCamX);
      camY = clamp(camY + dy, 0, maxCamY);
      velX = (dx / dt) * 16; velY = (dy / dt) * 16;
      lastX = t.clientX; lastY = t.clientY; lastT = now;
      mouse.set(t.clientX * simScale, (H - t.clientY) * simScale);
    }, { passive: false });

    ctx.listen(hitCanvas, 'touchend', (e) => {
      e.preventDefault();
      dragging = false;
      mouseActive = false;
    }, { passive: false });

    ctx.raf((dt) => {
      // Pan physics
      if (!dragging) {
        const friction = Math.pow(0.88, (dt / 1000) * 60);
        velX *= friction; velY *= friction;
        if (Math.abs(velX) < 0.1) velX = 0;
        if (Math.abs(velY) < 0.1) velY = 0;
        camX = clamp(camX + velX, 0, maxCamX);
        camY = clamp(camY + velY, 0, maxCamY);
      }

      // Draw panned image to content canvas
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.drawImage(img, -camX, -camY, imgW, imgH);

      if (hintAlpha > 0) {
        if (touched) hintAlpha = Math.max(0, hintAlpha - dt / 600);
        g.fillStyle = 'rgba(0,0,0,' + hintAlpha * 0.45 + ')';
        g.fillRect(0, 0, W, H);
        g.font = (H * 0.042) + 'px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,255,255,' + hintAlpha * 0.85 + ')';
        g.fillText('swipe to explore', W / 2, H / 2);
      }

      contentTex.needsUpdate = true;

      // Water sim pass
      simMat.uniforms.uTexture.value = rtPrev.texture;
      simMat.uniforms.uMouse.value.set(mouse.x, mouse.y, mouseActive ? 1 : 0);
      renderer.setRenderTarget(rtCur);
      scene.add(simMesh);
      renderer.render(scene, cam3);
      scene.remove(simMesh);

      // Display pass
      displayMat.uniforms.uTexture.value = rtCur.texture;
      renderer.setRenderTarget(null);
      scene.add(displayMesh);
      renderer.render(scene, cam3);
      scene.remove(displayMesh);

      [rtCur, rtPrev] = [rtPrev, rtCur];
    });

    ctx.platform.ready();
  },

  pause(ctx)  {},
  resume(ctx) {},
};
