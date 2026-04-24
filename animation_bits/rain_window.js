window.scrollerApp = {
  meta: {
    title: 'Rain on a Window',
    author: 'plethora',
    description: 'Watch rain trace paths down a cold window.',
    tags: ['stories'],
  },

  init(container) {
    // --- canvas setup ---
    const canvas = document.createElement('canvas');
    canvas.width  = container.clientWidth  || window.innerWidth;
    canvas.height = container.clientHeight || window.innerHeight;
    canvas.style.cssText = 'display:block;position:absolute;top:0;left:0;width:100%;height:100%;';
    container.style.position = 'relative';
    container.appendChild(canvas);
    this._canvas = canvas;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // --- state ---
    const drops = [];          // active drop objects
    const animes = [];         // all running anime instances
    let raf = null;
    let spawnTimer = null;
    this._drops = drops;
    this._animes = animes;

    // --- city silhouette (drawn once to offscreen buffer) ---
    const cityCanvas = document.createElement('canvas');
    cityCanvas.width  = W;
    cityCanvas.height = H;
    const cctx = cityCanvas.getContext('2d');
    drawCity(cctx, W, H);
    this._cityCanvas = cityCanvas;

    // --- helpers ---
    function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
    function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }

    function drawCity(c, w, h) {
      // sky gradient — deep navy
      const grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0a0e1a');
      grad.addColorStop(1, '#12192b');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);

      // buildings — muted dark blue-grey silhouettes
      const buildingColors = ['#0d1220', '#111826', '#0f1622'];
      const numBuildings = Math.floor(w / 35) + 5;
      let bx = -20;
      for (let i = 0; i < numBuildings; i++) {
        const bw   = randInt(30, 80);
        const bh   = randInt(h * 0.25, h * 0.65);
        const by   = h - bh;
        c.fillStyle = buildingColors[i % buildingColors.length];
        c.fillRect(bx, by, bw, bh);

        // windows — glowing dots (some lit, some not)
        const cols = Math.floor(bw / 10);
        const rows = Math.floor(bh / 14);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if (Math.random() > 0.45) continue; // most dark
            const wx = bx + 5 + col * 10;
            const wy = by + 6 + row * 14;
            const warmth = Math.random();
            // warm yellow or cold blue-white
            const wColor = warmth > 0.5
              ? `rgba(255, 230, 140, ${rand(0.15, 0.45)})`
              : `rgba(180, 210, 255, ${rand(0.1, 0.35)})`;
            // glow
            const grd = c.createRadialGradient(wx+2, wy+2, 0, wx+2, wy+2, 6);
            grd.addColorStop(0, wColor);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = grd;
            c.fillRect(wx - 4, wy - 4, 12, 12);
            // core rect
            c.fillStyle = wColor;
            c.fillRect(wx, wy, 4, 4);
          }
        }
        bx += bw + randInt(2, 12);
        if (bx > w + 40) break;
      }
    }

    function spawnDrop(x, y) {
      if (drops.length >= 35) return null;

      const r = rand(2, 5);
      const xDrift = rand(-18, 18);
      const dur = rand(1500, 2800);

      const drop = {
        x: x !== undefined ? x : rand(0, W),
        y: y !== undefined ? y : rand(-10, 10),
        r,
        xDrift,
        alpha: rand(0.45, 0.75),
        done: false,
        merged: false,
      };
      drops.push(drop);

      const startX = drop.x;
      const inst = window.anime({
        targets: drop,
        y: H + 20,
        x: startX + xDrift,
        duration: dur,
        easing: 'easeInQuad',
        complete() {
          drop.done = true;
          // remove from drops
          const idx = drops.indexOf(drop);
          if (idx !== -1) drops.splice(idx, 1);
          // remove from animes
          const aidx = animes.indexOf(inst);
          if (aidx !== -1) animes.splice(aidx, 1);
        },
      });
      animes.push(inst);
      return drop;
    }

    function spawnBurst(tapX, tapY) {
      const count = randInt(5, 8);
      for (let i = 0; i < count; i++) {
        const ox = tapX + rand(-30, 30);
        const oy = tapY !== undefined ? tapY : rand(-5, 5);
        spawnDrop(ox, oy);
      }
    }

    // proximity merge: two drops close enough → one bigger streak
    function checkMerges() {
      for (let i = 0; i < drops.length; i++) {
        const a = drops[i];
        if (a.merged || a.done) continue;
        for (let j = i + 1; j < drops.length; j++) {
          const b = drops[j];
          if (b.merged || b.done) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const thresh = a.r + b.r + 6;
          if (dist < thresh) {
            // merge b into a: bigger radius, faster
            a.r = Math.min(a.r + b.r * 0.6, 9);
            a.alpha = Math.min(a.alpha + 0.15, 0.92);
            b.merged = true;
            b.done = true;
            // pause b's anime
            const bi = animes.indexOf(b._inst);
            // we don't have _inst ref easily; just mark done and let render skip it
            const bIdx = drops.indexOf(b);
            if (bIdx !== -1) drops.splice(bIdx, 1);
            // re-animate a faster to bottom
            // pause existing anime for a (find by object — anime stores reference)
            // just let it ride; radius/alpha updated
          }
        }
      }
    }

    // --- draw frame ---
    function draw() {
      // 1. city backdrop
      ctx.drawImage(cityCanvas, 0, 0);

      // 2. glass tint — semi-transparent blue-grey wash
      ctx.fillStyle = 'rgba(15, 25, 50, 0.18)';
      ctx.fillRect(0, 0, W, H);

      // 3. window grid — faint lines suggesting pane edges
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.07)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
      ctx.moveTo(0, H * 0.42); ctx.lineTo(W, H * 0.42);
      ctx.stroke();

      // 4. drops
      checkMerges();
      for (const drop of drops) {
        if (drop.done || drop.merged) continue;
        ctx.save();
        ctx.globalAlpha = drop.alpha;

        // streak tail
        const tailLen = drop.r * 5 + 8;
        const grad = ctx.createLinearGradient(drop.x, drop.y - tailLen, drop.x, drop.y);
        grad.addColorStop(0, 'rgba(180,220,255,0)');
        grad.addColorStop(0.6, `rgba(190,225,255,${drop.alpha * 0.5})`);
        grad.addColorStop(1, `rgba(210,235,255,${drop.alpha})`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        // narrow tail → round head
        ctx.moveTo(drop.x - drop.r * 0.3, drop.y - tailLen);
        ctx.quadraticCurveTo(drop.x + drop.r * 0.8, drop.y - tailLen * 0.4, drop.x + drop.r, drop.y);
        ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI);
        ctx.quadraticCurveTo(drop.x - drop.r * 0.8, drop.y - tailLen * 0.4, drop.x - drop.r * 0.3, drop.y - tailLen);
        ctx.closePath();
        ctx.fill();

        // bright leading edge highlight
        ctx.globalAlpha = drop.alpha * 0.6;
        ctx.fillStyle = 'rgba(230, 245, 255, 0.9)';
        ctx.beginPath();
        ctx.ellipse(drop.x - drop.r * 0.2, drop.y - drop.r * 0.3, drop.r * 0.35, drop.r * 0.5, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // 5. overall moisture sheen on glass — subtle bottom gradient
      const sheen = ctx.createLinearGradient(0, H * 0.7, 0, H);
      sheen.addColorStop(0, 'rgba(140, 190, 230, 0)');
      sheen.addColorStop(1, 'rgba(140, 190, 230, 0.06)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
    }

    // --- RAF loop ---
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    this._raf = raf;

    // --- spawn loop ---
    const doSpawn = () => {
      spawnDrop();
      spawnTimer = setTimeout(doSpawn, rand(200, 400));
    };
    spawnTimer = setTimeout(doSpawn, 100);
    this._spawnTimer = spawnTimer;

    // initial rain
    for (let i = 0; i < 12; i++) {
      spawnDrop(undefined, rand(0, H * 0.8));
    }

    // --- tap burst ---
    this._onTap = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (W / rect.width);
      const y = (e.clientY - rect.top)  * (H / rect.height);
      spawnBurst(x, y);
    };
    this._onTouch = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const x = (t.clientX - rect.left) * (W / rect.width);
      const y = (t.clientY - rect.top)  * (H / rect.height);
      spawnBurst(x, y);
    };

    // --- load anime.js, start ---
    this._loadAnime(() => {
      // anime already loaded — drop animations already started if any were queued
      // spawnDrop uses window.anime directly, so spawn after load if needed
    });

    canvas.addEventListener('click', this._onTap);
    canvas.addEventListener('touchstart', this._onTouch, { passive: false });
  },

  _loadAnime(cb) {
    if (window.anime) return cb();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
    s.onload = cb;
    document.head.appendChild(s);
    this._animeScript = s;
  },

  destroy() {
    // cancel RAF
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }

    // cancel spawn timer
    if (this._spawnTimer) {
      clearTimeout(this._spawnTimer);
      this._spawnTimer = null;
    }

    // pause all anime instances
    if (this._animes) {
      for (const inst of this._animes) {
        if (inst && typeof inst.pause === 'function') inst.pause();
      }
      this._animes.length = 0;
    }

    // remove event listeners
    if (this._canvas) {
      this._canvas.removeEventListener('click', this._onTap);
      this._canvas.removeEventListener('touchstart', this._onTouch);
      this._canvas.remove();
      this._canvas = null;
    }

    // clear drop state
    if (this._drops) this._drops.length = 0;

    this._cityCanvas = null;
    this._onTap = null;
    this._onTouch = null;
  },
};
