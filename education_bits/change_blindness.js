window.scrollerApp = {
  meta: {
    title: 'Change Blindness',
    author: 'plethora',
    description: 'Two scenes flash alternately. Find what changed. Most people take 10+ seconds.',
    tags: ['education'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let audioCtx = null;
    const ensureAudio = () => {
      if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };
    const playPop = (freq) => {
      if (!audioCtx) return;
      try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        const t = audioCtx.currentTime;
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.start(t); o.stop(t + 0.2);
      } catch (_) {}
    };

    // Scene definitions — a simple city rooftop scene
    // changeIdx picks which element changes between scene A and B
    const SCENES = [
      {
        label: 'Round 1',
        changeDesc: 'the traffic light color',
        // changeIdx 0 = traffic light; alternate between red/green
        draw: (version) => {
          // Sky gradient
          const sky = ctx.createLinearGradient(0, 0, 0, H*0.6);
          sky.addColorStop(0, '#0d1b3e'); sky.addColorStop(1, '#1a3560');
          ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H*0.6);

          // Ground
          ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, H*0.6, W, H*0.4);
          ctx.fillStyle = '#2a2a3e'; ctx.fillRect(0, H*0.62, W, H*0.02);

          // Building left
          ctx.fillStyle = '#223055'; ctx.fillRect(W*0.02, H*0.18, W*0.18, H*0.44);
          // windows
          for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
            ctx.fillStyle = (r+c)%2===0 ? '#ffdf80' : '#223055';
            ctx.fillRect(W*0.04 + c*W*0.055, H*0.22 + r*H*0.07, W*0.04, H*0.05);
          }

          // Building right
          ctx.fillStyle = '#1e2a48'; ctx.fillRect(W*0.80, H*0.22, W*0.18, H*0.40);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
            ctx.fillStyle = r%3===0 ? '#ffdf80' : '#1e2a48';
            ctx.fillRect(W*0.82+c*W*0.07, H*0.26+r*H*0.08, W*0.05, H*0.055);
          }

          // Building center-left
          ctx.fillStyle = '#182640'; ctx.fillRect(W*0.28, H*0.28, W*0.14, H*0.34);
          // Building center-right
          ctx.fillStyle = '#1c2e50'; ctx.fillRect(W*0.58, H*0.24, W*0.16, H*0.38);

          // Road lane markings
          ctx.fillStyle = 'rgba(255,255,200,0.3)';
          for (let i = 0; i < 6; i++) ctx.fillRect(W*0.1 + i*W*0.14, H*0.64, W*0.07, H*0.008);

          // Car on road
          ctx.fillStyle = '#4080c0';
          ctx.beginPath(); ctx.roundRect(W*0.25, H*0.63, W*0.18, H*0.06, 4); ctx.fill();
          ctx.fillStyle = '#60a0e0';
          ctx.beginPath(); ctx.roundRect(W*0.28, H*0.615, W*0.12, H*0.03, 4); ctx.fill();
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(W*0.29, H*0.69, H*0.025, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(W*0.40, H*0.69, H*0.025, 0, Math.PI*2); ctx.fill();

          // Second car
          ctx.fillStyle = '#c04060';
          ctx.beginPath(); ctx.roundRect(W*0.54, H*0.635, W*0.15, H*0.055, 4); ctx.fill();
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(W*0.57, H*0.69, H*0.022, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(W*0.66, H*0.69, H*0.022, 0, Math.PI*2); ctx.fill();

          // Traffic light pole
          ctx.fillStyle = '#404050';
          ctx.fillRect(W*0.47 - 3, H*0.38, 6, H*0.24);
          // Light box
          ctx.fillStyle = '#222230';
          ctx.beginPath(); ctx.roundRect(W*0.47 - 10, H*0.38, 20, H*0.12, 4); ctx.fill();
          // Lights
          ctx.fillStyle = version === 0 ? '#ff2020' : '#222';  // RED in A
          ctx.beginPath(); ctx.arc(W*0.47, H*0.40, 6, 0, Math.PI*2); ctx.fill();
          if (version === 0) { ctx.fillStyle = 'rgba(255,30,30,0.3)'; ctx.beginPath(); ctx.arc(W*0.47, H*0.40, 12, 0, Math.PI*2); ctx.fill(); }

          ctx.fillStyle = '#222';
          ctx.beginPath(); ctx.arc(W*0.47, H*0.435, 6, 0, Math.PI*2); ctx.fill();

          ctx.fillStyle = version === 1 ? '#20dd20' : '#222'; // GREEN in B
          ctx.beginPath(); ctx.arc(W*0.47, H*0.47, 6, 0, Math.PI*2); ctx.fill();
          if (version === 1) { ctx.fillStyle = 'rgba(20,220,20,0.3)'; ctx.beginPath(); ctx.arc(W*0.47, H*0.47, 12, 0, Math.PI*2); ctx.fill(); }

          // Stars
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          [[0.1,0.06],[0.25,0.1],[0.65,0.08],[0.85,0.05],[0.9,0.14],[0.4,0.04],[0.55,0.12]].forEach(([sx,sy]) => {
            ctx.beginPath(); ctx.arc(sx*W, sy*H, 1.2, 0, Math.PI*2); ctx.fill();
          });
        },
      },
      {
        label: 'Round 2',
        changeDesc: 'the color of the left building windows',
        draw: (version) => {
          const sky = ctx.createLinearGradient(0, 0, 0, H*0.6);
          sky.addColorStop(0, '#0d1b3e'); sky.addColorStop(1, '#1a3560');
          ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H*0.6);
          ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, H*0.6, W, H*0.4);
          ctx.fillStyle = '#2a2a3e'; ctx.fillRect(0, H*0.62, W, H*0.02);

          // Building left — window color changes
          ctx.fillStyle = '#223055'; ctx.fillRect(W*0.02, H*0.18, W*0.18, H*0.44);
          const winColor = version === 0 ? '#ffdf80' : '#60c0ff';  // yellow vs blue
          for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
            ctx.fillStyle = (r+c)%2===0 ? winColor : '#223055';
            ctx.fillRect(W*0.04 + c*W*0.055, H*0.22 + r*H*0.07, W*0.04, H*0.05);
          }
          ctx.fillStyle = '#1e2a48'; ctx.fillRect(W*0.80, H*0.22, W*0.18, H*0.40);
          for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
            ctx.fillStyle = r%3===0 ? '#ffdf80' : '#1e2a48';
            ctx.fillRect(W*0.82+c*W*0.07, H*0.26+r*H*0.08, W*0.05, H*0.055);
          }
          ctx.fillStyle = '#182640'; ctx.fillRect(W*0.28, H*0.28, W*0.14, H*0.34);
          ctx.fillStyle = '#1c2e50'; ctx.fillRect(W*0.58, H*0.24, W*0.16, H*0.38);
          ctx.fillStyle = '#404050'; ctx.fillRect(W*0.47 - 3, H*0.38, 6, H*0.24);
          ctx.fillStyle = '#222230'; ctx.beginPath(); ctx.roundRect(W*0.47-10, H*0.38, 20, H*0.12, 4); ctx.fill();
          ctx.fillStyle = '#ff2020'; ctx.beginPath(); ctx.arc(W*0.47, H*0.40, 6, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(W*0.47, H*0.435, 6, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(W*0.47, H*0.47, 6, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#4080c0'; ctx.beginPath(); ctx.roundRect(W*0.25, H*0.63, W*0.18, H*0.06, 4); ctx.fill();
          ctx.fillStyle = '#60a0e0'; ctx.beginPath(); ctx.roundRect(W*0.28, H*0.615, W*0.12, H*0.03, 4); ctx.fill();
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(W*0.29, H*0.69, H*0.025, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(W*0.40, H*0.69, H*0.025, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#c04060'; ctx.beginPath(); ctx.roundRect(W*0.54, H*0.635, W*0.15, H*0.055, 4); ctx.fill();
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(W*0.57, H*0.69, H*0.022, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(W*0.66, H*0.69, H*0.022, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          [[0.1,0.06],[0.25,0.1],[0.65,0.08],[0.85,0.05],[0.9,0.14],[0.4,0.04],[0.55,0.12]].forEach(([sx,sy]) => {
            ctx.beginPath(); ctx.arc(sx*W, sy*H, 1.2, 0, Math.PI*2); ctx.fill();
          });
        },
      },
    ];

    let sceneIdx   = 0;
    let version    = 0;       // 0 or 1 — alternates
    let flashAlpha = 0;       // white flash between transitions
    let startTime  = performance.now();
    let found      = false;
    let elapsed    = 0;
    let phase      = 'running';  // running | revealed
    let raf;

    const SCENE_DUR = 0.55;   // seconds each version shows
    const FLASH_DUR = 0.12;   // white flash duration

    const nextScene = () => {
      sceneIdx = (sceneIdx + 1) % SCENES.length;
      version  = 0;
      found    = false;
      startTime = performance.now();
      elapsed  = 0;
      phase    = 'running';
    };

    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      if (phase === 'running') elapsed = (performance.now() - startTime) / 1000;

      const scene = SCENES[sceneIdx];
      const cycleT = elapsed % (SCENE_DUR * 2 + FLASH_DUR * 2);

      if (cycleT < SCENE_DUR) {
        version = 0;
        flashAlpha = 0;
      } else if (cycleT < SCENE_DUR + FLASH_DUR) {
        version = 0;
        flashAlpha = 1 - (cycleT - SCENE_DUR) / FLASH_DUR;
        flashAlpha = 1 - flashAlpha; // ramp up
      } else if (cycleT < SCENE_DUR * 2 + FLASH_DUR) {
        version = 1;
        flashAlpha = 0;
      } else {
        version = 1;
        flashAlpha = (cycleT - (SCENE_DUR * 2 + FLASH_DUR)) / FLASH_DUR;
      }

      ctx.fillStyle = '#06060f';
      ctx.fillRect(0, 0, W, H);

      if (phase === 'running') {
        scene.draw(version);
      } else {
        // Revealed — show both versions side by side
        ctx.save();
        ctx.scale(0.5, 0.5); scene.draw(0); ctx.restore();
        ctx.save();
        ctx.translate(W*0.5, 0); ctx.scale(0.5, 0.5); scene.draw(1); ctx.restore();

        // Labels
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = `${H*0.025}px monospace`;
        ctx.fillStyle = 'rgba(180,200,255,0.7)';
        ctx.fillText('A', W*0.25, H*0.01);
        ctx.fillText('B', W*0.75, H*0.01);
      }

      // White flash overlay
      if (flashAlpha > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.85})`;
        ctx.fillRect(0, 0, W, H);
      }

      // HUD
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';

      if (phase === 'running') {
        ctx.font = `bold ${H*0.032}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(180,200,255,0.75)';
        ctx.fillText('What changes between flashes?', W/2, H*0.005);

        ctx.font = `${H*0.025}px monospace`;
        ctx.fillStyle = 'rgba(120,150,200,0.5)';
        ctx.fillText(`${Math.floor(elapsed)}s  •  ${scene.label}`, W/2, H*0.048);

        ctx.textBaseline = 'bottom';
        ctx.font = `${H*0.024}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(120,150,200,0.5)';
        ctx.fillText('tap when you see it', W/2, H*0.97);
      } else {
        // Reveal screen
        ctx.fillStyle = 'rgba(20,30,60,0.85)';
        ctx.fillRect(0, H*0.46, W, H*0.54);

        ctx.font = `bold ${H*0.032}px -apple-system,sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#FFD020';
        ctx.fillText(`It was: ${scene.changeDesc}`, W/2, H*0.48);

        const timeMsg = found
          ? `You spotted it in ${elapsed.toFixed(1)}s`
          : `It took ${elapsed.toFixed(0)}s`;
        ctx.font = `${H*0.026}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(180,200,255,0.65)';
        ctx.fillText(timeMsg, W/2, H*0.535);

        ctx.font = `${H*0.021}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(120,150,200,0.5)';
        ctx.fillText('Your brain fills in what it expects to see,', W/2, H*0.59);
        ctx.fillText('not what\'s actually there.', W/2, H*0.622);

        ctx.textBaseline = 'bottom';
        ctx.font = `${H*0.024}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(120,150,200,0.5)';
        const hasNext = sceneIdx < SCENES.length - 1;
        ctx.fillText(hasNext ? 'tap for next round' : 'tap to restart', W/2, H*0.97);
      }
    };

    this._onTap = (e) => {
      e.preventDefault();
      ensureAudio();
      if (phase === 'running') {
        phase = 'revealed';
        found = true;
        playPop(660);
      } else {
        if (sceneIdx < SCENES.length - 1) {
          sceneIdx++;
          version = 0; found = false; startTime = performance.now(); elapsed = 0; phase = 'running';
        } else {
          nextScene();
        }
      }
    };

    canvas.addEventListener('touchstart', this._onTap, { passive: false });
    canvas.addEventListener('click', this._onTap);

    raf = requestAnimationFrame(loop);
    this._raf = () => cancelAnimationFrame(raf);
    this._canvas = canvas;
  },

  destroy() {
    this._raf?.();
    if (this._canvas) {
      this._canvas.removeEventListener('touchstart', this._onTap);
      this._canvas.removeEventListener('click', this._onTap);
    }
    this._canvas = null;
  },
};
