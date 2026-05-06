window.plethoraBit = {
  meta: {
    title: 'OutRun',
    author: 'plethora',
    description: 'Pseudo-3D road racing with sunset vibes.',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');

    let audioCtx = null, engineOsc = null, engineGain = null;
    function initAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
      engineOsc = audioCtx.createOscillator();
      engineGain = audioCtx.createGain();
      engineOsc.connect(engineGain); engineGain.connect(audioCtx.destination);
      engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 80;
      engineGain.gain.value = 0;
      engineOsc.start();
    }
    function beep(freq, dur, type='sine', vol=0.12) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function crashSound() { [400,250,150].forEach((f,i)=>setTimeout(()=>beep(f,0.2,'sawtooth',0.2),i*100)); }

    const ROAD_H = H * 0.5;
    const HORIZON = H * 0.42;
    const NUM_SEGS = 150;
    const SEG_H = ROAD_H / NUM_SEGS;
    const ROAD_W_BASE = W * 0.75;

    let pos, speed, curveAccum, score, gameOver, started, hs;
    let touchX = null, steerDir = 0;
    let carX, carWobble;
    let traffic, trafficTimer;

    const CURVES = [];
    function genCurves() {
      CURVES.length = 0;
      let x = 0;
      for (let i = 0; i < 40; i++) {
        const len = 200 + Math.random() * 400;
        const curve = (Math.random() - 0.5) * 0.006;
        CURVES.push({ start: x, end: x + len, curve });
        x += len;
      }
    }

    function getCurve(p) {
      for (const c of CURVES) {
        if (p >= c.start && p < c.end) return c.curve;
      }
      return 0;
    }

    function reset() {
      pos = 0; speed = 0; curveAccum = 0; score = 0;
      gameOver = false; started = false;
      carX = 0; carWobble = 0;
      traffic = []; trafficTimer = 0;
      genCurves();
    }

    hs = ctx.storage.get('hs_outrun') || 0;
    reset();

    ctx.listen(canvas, 'touchstart', e => {
      e.preventDefault();
      initAudio();
      const t = e.changedTouches[0];
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { reset(); return; }
      touchX = t.clientX;
      ctx.platform.interact({ type: 'tap' });
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', e => {
      e.preventDefault();
      touchX = e.changedTouches[0].clientX;
    }, { passive: false });

    ctx.listen(canvas, 'touchend', e => {
      e.preventDefault(); touchX = null;
    }, { passive: false });

    const TRAFFIC_COLORS = ['#f44','#44f','#f84','#4f4','#f4f','#fff'];

    ctx.raf(dt => {
      const spd = dt / 16;

      if (!started) {
        drawScene(0, 0, 0, []);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#fff';
        g.font = `bold ${Math.floor(H*0.07)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('OUTRUN', W/2, H*0.35);
        g.fillStyle = '#ffcc44';
        g.font = `${Math.floor(H*0.032)}px sans-serif`;
        g.fillText('DRAG LEFT / RIGHT TO STEER', W/2, H*0.45);
        g.fillText(`BEST: ${hs}`, W/2, H*0.52);
        return;
      }

      if (!gameOver) {
        // accelerate
        speed = Math.min(6 + score/200, 18);

        if (touchX !== null) {
          steerDir = (touchX - W/2) / (W/2);
        } else {
          steerDir *= 0.85;
        }

        const curve = getCurve(pos);
        curveAccum += curve * speed * spd;
        carX -= steerDir * 0.04 * speed * spd;
        carX += curve * speed * spd * 0.15; // road pushes car
        carWobble = steerDir * 0.12;

        // off road
        if (Math.abs(carX) > 1.2) {
          speed = Math.max(3, speed * 0.95);
          carWobble = Math.sin(Date.now() / 50) * 0.08;
        }
        if (Math.abs(carX) > 1.8) {
          crashSound();
          gameOver = true;
          ctx.platform.fail({ reason: 'off road' });
        }

        pos += speed * spd * 8;
        score = Math.floor(pos / 100);
        if (score > hs) { hs = score; ctx.storage.set('hs_outrun', hs); }
        ctx.platform.setScore(score);

        trafficTimer += dt;
        if (trafficTimer > Math.max(600, 1800 - score)) {
          trafficTimer = 0;
          traffic.push({
            lane: (Math.random()-0.5) * 1.6,
            z: NUM_SEGS - 5,
            color: TRAFFIC_COLORS[Math.floor(Math.random()*TRAFFIC_COLORS.length)]
          });
        }

        for (let i = traffic.length - 1; i >= 0; i--) {
          traffic[i].z -= speed * spd * 0.8;
          if (traffic[i].z < 0) { traffic.splice(i, 1); continue; }
          if (traffic[i].z < 8) {
            if (Math.abs(traffic[i].lane - carX) < 0.35) {
              crashSound();
              ctx.platform.haptic('heavy');
              gameOver = true;
              ctx.platform.fail({ reason: 'collision' });
            }
          }
        }

        if (engineGain && engineOsc) {
          engineGain.gain.value = 0.05;
          engineOsc.frequency.value = 60 + speed * 8;
        }
      }

      drawScene(pos, curveAccum, carX + carWobble, traffic);

      // HUD
      g.fillStyle = '#fff';
      g.font = `bold ${Math.floor(H*0.032)}px monospace`;
      g.textAlign = 'left';
      g.fillText(`${score}`, 10, Math.floor(H*0.055));
      g.textAlign = 'right';
      g.fillText(`BEST:${hs}`, W-10, Math.floor(H*0.055));

      // speedometer
      const speedPct = speed / 18;
      g.fillStyle = '#222';
      g.fillRect(W*0.35, H*0.92, W*0.3, H*0.025);
      g.fillStyle = `hsl(${120 - speedPct*120},100%,50%)`;
      g.fillRect(W*0.35, H*0.92, W*0.3*speedPct, H*0.025);
      g.fillStyle = '#aaa';
      g.font = `${Math.floor(H*0.022)}px monospace`;
      g.textAlign = 'center';
      g.fillText(`${Math.floor(speed*20)} KM/H`, W/2, H*0.96);

      if (gameOver) {
        if (engineGain) engineGain.gain.value = 0;
        g.fillStyle = 'rgba(0,0,0,0.72)';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#f44';
        g.font = `bold ${Math.floor(H*0.07)}px sans-serif`;
        g.textAlign = 'center';
        g.fillText('CRASH!', W/2, H*0.38);
        g.fillStyle = '#fff';
        g.font = `${Math.floor(H*0.04)}px monospace`;
        g.fillText(`DIST: ${score}`, W/2, H*0.48);
        g.fillText(`BEST: ${hs}`, W/2, H*0.55);
        g.fillStyle = '#aaa';
        g.font = `${Math.floor(H*0.032)}px monospace`;
        g.fillText('TAP TO RESTART', W/2, H*0.65);
      }

      function drawScene(pos2, curve, cX, traf) {
        // sky
        const skyGrd = g.createLinearGradient(0, 0, 0, HORIZON);
        skyGrd.addColorStop(0, '#ff6600');
        skyGrd.addColorStop(0.4, '#ffaa00');
        skyGrd.addColorStop(1, '#ffee88');
        g.fillStyle = skyGrd;
        g.fillRect(0, 0, W, HORIZON);

        // sun
        const sunY = HORIZON * 0.55;
        const sunGrd = g.createRadialGradient(W/2, sunY, 0, W/2, sunY, H*0.12);
        sunGrd.addColorStop(0, '#fff');
        sunGrd.addColorStop(0.3, '#ffee00');
        sunGrd.addColorStop(1, 'rgba(255,100,0,0)');
        g.fillStyle = sunGrd;
        g.fillRect(W*0.3, sunY - H*0.12, W*0.4, H*0.24);

        // silhouette trees
        g.fillStyle = '#221100';
        for (let tx = 0; tx < W; tx += W*0.07) {
          const th = H*0.05 + Math.sin(tx * 0.3 + pos2 * 0.001) * H*0.03;
          g.fillRect(tx, HORIZON - th, W*0.03, th);
          g.beginPath();
          g.arc(tx + W*0.015, HORIZON - th - W*0.015, W*0.02, 0, Math.PI*2);
          g.fill();
        }

        // road
        let cameraX = cX * 0.5;
        const curvePerSeg = getCurve(pos2) * 0.8;

        let x = W / 2;
        const trafficByZ = {};
        traf.forEach(t2 => { trafficByZ[Math.round(t2.z)] = t2; });

        for (let seg = NUM_SEGS - 1; seg >= 0; seg--) {
          const t2 = seg / NUM_SEGS;
          const y = HORIZON + t2 * ROAD_H;
          const roadW = ROAD_W_BASE * t2 * 0.5 + 10;
          const alt = (Math.floor((pos2 / 40 + seg) / 4) % 2);

          // grass
          g.fillStyle = alt ? '#228822' : '#33aa33';
          g.fillRect(0, y, W, SEG_H + 1);

          // road
          g.fillStyle = alt ? '#777' : '#888';
          g.fillRect(x - roadW/2 - cameraX*t2*W, y, roadW, SEG_H + 1);

          // edge stripes
          g.fillStyle = alt ? '#fff' : '#880000';
          const eW = roadW * 0.07;
          g.fillRect(x - roadW/2 - cameraX*t2*W, y, eW, SEG_H + 1);
          g.fillRect(x + roadW/2 - eW - cameraX*t2*W, y, eW, SEG_H + 1);

          // center stripe
          if (alt) {
            g.fillStyle = '#fff';
            g.fillRect(x - roadW*0.025 - cameraX*t2*W, y, roadW*0.05, SEG_H + 1);
          }

          // draw traffic at this Z
          const trfAtZ = trafficByZ[seg];
          if (trfAtZ) {
            const tx2 = x + (trfAtZ.lane - cX) * roadW * 0.4;
            const tw = roadW * 0.22, th = tw * 0.55;
            g.fillStyle = trfAtZ.color;
            g.fillRect(tx2 - tw/2, y - th, tw, th);
            g.fillStyle = 'rgba(0,0,0,0.4)';
            g.fillRect(tx2 - tw*0.35, y - th + th*0.1, tw*0.7, th*0.4);
          }

          x -= curvePerSeg * t2 * roadW * 0.03;
        }

        // player car
        const carW = W * 0.22, carH = H * 0.11;
        const carCX = W/2 + cX * ROAD_W_BASE * 0.22;
        const carTop = HORIZON + ROAD_H - carH - H*0.02;

        // shadow
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(carCX - carW*0.45, carTop + carH*0.9, carW*0.9, carH*0.15);

        // body
        g.fillStyle = '#ff3300';
        g.fillRect(carCX - carW/2, carTop, carW, carH);
        // hood
        const skew = cX * 15;
        g.fillStyle = '#cc2200';
        g.beginPath();
        g.moveTo(carCX - carW*0.45 + skew, carTop);
        g.lineTo(carCX + carW*0.45 + skew, carTop);
        g.lineTo(carCX + carW*0.48, carTop + carH*0.4);
        g.lineTo(carCX - carW*0.48, carTop + carH*0.4);
        g.closePath(); g.fill();
        // windshield
        g.fillStyle = 'rgba(100,180,255,0.6)';
        g.fillRect(carCX - carW*0.28 + skew*0.5, carTop + carH*0.05, carW*0.56, carH*0.38);
        // wheels
        g.fillStyle = '#111';
        [[-0.45, 0.6],[0.35, 0.6],[-0.48, 0.2],[0.38, 0.2]].forEach(([ox, oy]) => {
          g.beginPath();
          g.ellipse(carCX + ox*carW, carTop + oy*carH, carW*0.1, carH*0.14, 0, 0, Math.PI*2);
          g.fill();
        });
      }
    });

    ctx.platform.ready();
  },

  pause(ctx) {},
  resume(ctx) {},
};
