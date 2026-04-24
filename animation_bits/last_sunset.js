window.scrollerApp = {
  meta: {
    title: 'Last Sunset',
    author: 'plethora',
    description: 'Twenty seconds of sky. Tap to rush it.',
    tags: ['stories'],
  },

  _anim: null,
  _canvas: null,
  _ctx: null,
  _state: null,
  _timeouts: [],
  _fast: false,
  _ended: false,
  _endOpacity: 0,
  _hintOpacity: 1,

  init(container) {
    const self = this;
    self._fast = false;
    self._ended = false;
    self._endOpacity = 0;
    self._hintOpacity = 1;
    self._timeouts = [];

    // -- Canvas setup --
    const canvas = document.createElement('canvas');
    canvas.width  = container.clientWidth  || window.innerWidth;
    canvas.height = container.clientHeight || window.innerHeight;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:manipulation;';
    container.appendChild(canvas);
    self._canvas = canvas;
    self._ctx = canvas.getContext('2d');

    const W = canvas.width;
    const H = canvas.height;

    // -- Stars (pre-generate) --
    const STAR_COUNT = 40;
    self._stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      self._stars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.55,
        r: 0.5 + Math.random() * 1.5,
      });
    }

    // -- State --
    self._state = { t: 0 };

    // -- Load anime.js then run --
    function loadAnime(cb) {
      if (window.anime) return cb();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
      s.onload = cb;
      document.head.appendChild(s);
    }

    loadAnime(() => {
      if (!self._canvas) return; // destroyed before load

      function startAnim() {
        self._ended = false;
        self._endOpacity = 0;
        self._state.t = 0;

        self._anim = anime({
          targets: self._state,
          t: 1,
          duration: 20000,
          easing: 'linear',
          update: () => drawFrame(self._state.t),
          complete: () => {
            self._ended = true;
            // fade in "The End"
            self._endAnim = anime({
              targets: self,
              _endOpacity: 1,
              duration: 1500,
              easing: 'easeInQuad',
              complete: () => {
                const tid = setTimeout(() => {
                  // loop
                  self._endAnim && self._endAnim.pause && self._endAnim.pause();
                  startAnim();
                }, 2000);
                self._timeouts.push(tid);
              }
            });
          }
        });
      }

      startAnim();

      // fade hint after 3s
      const hintTid = setTimeout(() => {
        anime({ targets: self, _hintOpacity: 0, duration: 800, easing: 'easeOutQuad' });
      }, 3000);
      self._timeouts.push(hintTid);
    });

    // -- Tap to toggle speed --
    canvas.addEventListener('pointerdown', self._onTap = () => {
      self._fast = !self._fast;
      if (self._anim) self._anim.timeScale = self._fast ? 3 : 1;
    });

    // -- Helpers --
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(c1, c2, t) {
      return {
        r: Math.round(lerp(c1.r, c2.r, t)),
        g: Math.round(lerp(c1.g, c2.g, t)),
        b: Math.round(lerp(c1.b, c2.b, t)),
      };
    }
    function rgb(c) { return `rgb(${c.r},${c.g},${c.b})`; }
    function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${a})`; }

    // Sample a multi-stop color gradient at position t
    function sampleGradient(stops, t) {
      // stops: [{t, color}, ...]
      if (t <= stops[0].t) return stops[0].color;
      if (t >= stops[stops.length - 1].t) return stops[stops.length - 1].color;
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (t >= a.t && t <= b.t) {
          const local = (t - a.t) / (b.t - a.t);
          return lerpColor(a.color, b.color, local);
        }
      }
      return stops[stops.length - 1].color;
    }

    // Sky color stops — top and bottom separately
    const skyTopStops = [
      { t: 0.0,  color: { r: 10,  g: 5,   b: 40  } }, // deep purple-blue dawn
      { t: 0.15, color: { r: 30,  g: 20,  b: 80  } }, // dark indigo
      { t: 0.25, color: { r: 80,  g: 60,  b: 140 } }, // lavender sunrise
      { t: 0.4,  color: { r: 40,  g: 100, b: 200 } }, // bright blue
      { t: 0.55, color: { r: 20,  g: 90,  b: 200 } }, // peak midday
      { t: 0.7,  color: { r: 200, g: 100, b: 30  } }, // amber golden hour
      { t: 0.82, color: { r: 140, g: 30,  b: 10  } }, // deep red dusk
      { t: 0.92, color: { r: 30,  g: 10,  b: 30  } }, // dark purple
      { t: 1.0,  color: { r: 5,   g: 5,   b: 20  } }, // night
    ];

    const skyBotStops = [
      { t: 0.0,  color: { r: 30,  g: 20,  b: 70  } },
      { t: 0.15, color: { r: 100, g: 60,  b: 80  } },
      { t: 0.25, color: { r: 255, g: 160, b: 100 } }, // warm sunrise near horizon
      { t: 0.4,  color: { r: 140, g: 200, b: 255 } }, // sky blue horizon
      { t: 0.55, color: { r: 120, g: 190, b: 255 } }, // midday horizon
      { t: 0.7,  color: { r: 255, g: 180, b: 60  } }, // golden horizon
      { t: 0.82, color: { r: 255, g: 80,  b: 20  } }, // red dusk horizon
      { t: 0.92, color: { r: 80,  g: 20,  b: 40  } },
      { t: 1.0,  color: { r: 10,  g: 5,   b: 25  } },
    ];

    // Sun color stops
    const sunStops = [
      { t: 0.0,  color: { r: 255, g: 200, b: 100 } },
      { t: 0.2,  color: { r: 255, g: 230, b: 150 } },
      { t: 0.45, color: { r: 255, g: 255, b: 230 } }, // white midday
      { t: 0.55, color: { r: 255, g: 255, b: 200 } },
      { t: 0.7,  color: { r: 255, g: 180, b: 40  } }, // golden
      { t: 0.82, color: { r: 255, g: 80,  b: 10  } }, // red sunset
      { t: 0.9,  color: { r: 200, g: 40,  b: 0   } },
      { t: 1.0,  color: { r: 120, g: 20,  b: 0   } },
    ];

    // Glow color stops (sun halo)
    const glowStops = [
      { t: 0.0,  color: { r: 255, g: 180, b: 80  } },
      { t: 0.25, color: { r: 255, g: 220, b: 120 } },
      { t: 0.5,  color: { r: 255, g: 255, b: 180 } },
      { t: 0.7,  color: { r: 255, g: 160, b: 30  } },
      { t: 0.85, color: { r: 255, g: 60,  b: 0   } },
      { t: 1.0,  color: { r: 150, g: 20,  b: 0   } },
    ];

    function drawFrame(t) {
      if (!self._ctx || !self._canvas) return;
      const ctx = self._ctx;
      ctx.clearRect(0, 0, W, H);

      // -- Sky gradient --
      const topColor = sampleGradient(skyTopStops, t);
      const botColor = sampleGradient(skyBotStops, t);
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, rgb(topColor));
      skyGrad.addColorStop(1, rgb(botColor));
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      // -- Atmospheric glow band near horizon --
      const horizonY = H * 0.62;
      if (t > 0.15 && t < 0.92) {
        const glowAlpha = Math.min(1, Math.sin(Math.PI * (t - 0.15) / 0.77)) * 0.4;
        const glowC = sampleGradient(glowStops, t);
        const horizGrad = ctx.createLinearGradient(0, horizonY - H * 0.15, 0, horizonY + H * 0.08);
        horizGrad.addColorStop(0, rgba(glowC, 0));
        horizGrad.addColorStop(0.5, rgba(glowC, glowAlpha));
        horizGrad.addColorStop(1, rgba(glowC, 0));
        ctx.fillStyle = horizGrad;
        ctx.fillRect(0, horizonY - H * 0.15, W, H * 0.23);
      }

      // -- Sun position: parabolic arc --
      // x: left → right as t: 0 → 1
      // y: starts at horizonY, peaks at top, ends below horizonY
      const sunX = lerp(W * 0.05, W * 0.95, t);
      // parabola: y = horizonY - height * 4 * t * (1 - t)
      const arcHeight = H * 0.72;
      const sunY = horizonY - arcHeight * 4 * t * (1 - t);

      // Sun radius: larger near horizon, smaller at peak
      const peakFactor = 4 * t * (1 - t); // 0 at edges, 1 at peak
      const sunR = lerp(28, 16, peakFactor) * (W / 400);

      const sunColor = sampleGradient(sunStops, t);
      const glowColor = sampleGradient(glowStops, t);

      // Only draw sun if above visible horizon (with some bleed)
      const sunVisible = sunY < horizonY + sunR;
      if (sunVisible) {
        // glow
        const glowR = sunR * 3.5;
        const glowGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, glowR);
        glowGrad.addColorStop(0, rgba(glowColor, 0.5));
        glowGrad.addColorStop(1, rgba(glowColor, 0));
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, glowR, 0, Math.PI * 2);
        ctx.fill();

        // sun disk
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
        sunGrad.addColorStop(0, `rgb(255,255,${Math.round(lerp(200, 100, t))})`);
        sunGrad.addColorStop(0.6, rgb(sunColor));
        sunGrad.addColorStop(1, rgba(sunColor, 0.8));
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();

        // horizon clipping: cover sun below horizon
        ctx.fillStyle = ctx.createLinearGradient(0, horizonY - 2, 0, horizonY + 4);
        // We'll draw it after landscape anyway — landscape covers horizon
      }

      // -- Stars --
      if (t > 0.65) {
        const starAlpha = Math.min(1, (t - 0.65) / 0.25);
        ctx.fillStyle = `rgba(255,255,255,${starAlpha})`;
        for (const star of self._stars) {
          // twinkle: slight opacity variation
          const twinkle = 0.6 + 0.4 * Math.sin(star.x * 0.1 + star.y * 0.07 + t * 20);
          ctx.globalAlpha = starAlpha * twinkle;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // -- Moon --
      if (t > 0.78) {
        const moonAlpha = Math.min(1, (t - 0.78) / 0.15);
        const moonX = W * 0.18;
        const moonY = H * 0.22;
        const moonR = 14 * (W / 400);

        // full circle
        ctx.save();
        ctx.globalAlpha = moonAlpha;
        ctx.fillStyle = 'rgb(230,230,210)';
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
        ctx.fill();

        // crescent cutout — offset circle to create crescent
        const topC = sampleGradient(skyTopStops, t);
        ctx.fillStyle = rgb(topC);
        ctx.beginPath();
        ctx.arc(moonX + moonR * 0.4, moonY - moonR * 0.1, moonR * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // -- Landscape silhouette --
      ctx.save();
      ctx.fillStyle = '#0d0d1a';

      // Mountain range
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, horizonY + H * 0.04);

      // left rolling hills
      ctx.bezierCurveTo(W * 0.05, horizonY - H * 0.04, W * 0.1, horizonY - H * 0.06, W * 0.15, horizonY - H * 0.02);
      ctx.bezierCurveTo(W * 0.18, horizonY + H * 0.01, W * 0.22, horizonY - H * 0.03, W * 0.28, horizonY - H * 0.08);

      // left mountain peak
      ctx.bezierCurveTo(W * 0.32, horizonY - H * 0.18, W * 0.36, horizonY - H * 0.22, W * 0.38, horizonY - H * 0.20);
      ctx.bezierCurveTo(W * 0.40, horizonY - H * 0.18, W * 0.43, horizonY - H * 0.10, W * 0.46, horizonY - H * 0.06);

      // center valley
      ctx.bezierCurveTo(W * 0.48, horizonY - H * 0.02, W * 0.50, horizonY + H * 0.01, W * 0.52, horizonY - H * 0.02);

      // right mountain peak (taller)
      ctx.bezierCurveTo(W * 0.55, horizonY - H * 0.08, W * 0.60, horizonY - H * 0.26, W * 0.63, horizonY - H * 0.28);
      ctx.bezierCurveTo(W * 0.66, horizonY - H * 0.26, W * 0.70, horizonY - H * 0.15, W * 0.74, horizonY - H * 0.07);

      // rolling right hills
      ctx.bezierCurveTo(W * 0.76, horizonY - H * 0.04, W * 0.80, horizonY - H * 0.05, W * 0.83, horizonY - H * 0.03);
      ctx.bezierCurveTo(W * 0.86, horizonY - H * 0.01, W * 0.90, horizonY - H * 0.02, W * 0.93, horizonY - H * 0.04);
      ctx.bezierCurveTo(W * 0.96, horizonY - H * 0.05, W * 0.98, horizonY, W, horizonY + H * 0.01);

      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // Foreground darker hill
      ctx.fillStyle = '#080810';
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, H * 0.82);
      ctx.bezierCurveTo(W * 0.1, H * 0.78, W * 0.2, H * 0.75, W * 0.35, H * 0.78);
      ctx.bezierCurveTo(W * 0.45, H * 0.80, W * 0.5, H * 0.79, W * 0.6, H * 0.76);
      ctx.bezierCurveTo(W * 0.75, H * 0.73, W * 0.88, H * 0.77, W, H * 0.80);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // -- Trees (right side silhouette) --
      ctx.fillStyle = '#060610';

      // Tree 1 — pine, right
      drawPineTree(ctx, W * 0.82, H * 0.76, 18 * (W / 400), 60 * (H / 800));
      // Tree 2 — slightly left, shorter
      drawPineTree(ctx, W * 0.75, H * 0.78, 12 * (W / 400), 42 * (H / 800));
      // Tree 3 — far right
      drawPineTree(ctx, W * 0.91, H * 0.80, 14 * (W / 400), 48 * (H / 800));

      ctx.restore();

      // -- "The End" overlay --
      if (self._ended && self._endOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = self._endOpacity;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = self._endOpacity;
        ctx.fillStyle = '#e8d5a3';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.round(W / 12);
        ctx.font = `300 ${fontSize}px Georgia, serif`;
        ctx.fillText('The End', W / 2, H / 2);
        ctx.restore();
      }

      // -- Speed hint --
      if (self._hintOpacity > 0) {
        ctx.save();
        ctx.globalAlpha = self._hintOpacity * 0.8;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        const hw = 180 * (W / 400);
        const hh = 30 * (H / 800);
        const hx = W / 2 - hw / 2;
        const hy = H * 0.88;
        ctx.beginPath();
        ctx.roundRect(hx, hy, hw, hh, 15);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(12 * W / 400)}px -apple-system, sans-serif`;
        ctx.fillText('Tap to speed up', W / 2, hy + hh / 2);
        ctx.restore();
      }
    }

    function drawPineTree(ctx, x, baseY, halfW, height) {
      // 3-tiered pine
      ctx.beginPath();
      // tier 3 (bottom widest)
      ctx.moveTo(x - halfW * 1.0, baseY);
      ctx.lineTo(x,              baseY - height * 0.45);
      ctx.lineTo(x + halfW * 1.0, baseY);
      ctx.closePath();
      ctx.fill();
      // tier 2
      ctx.beginPath();
      ctx.moveTo(x - halfW * 0.75, baseY - height * 0.30);
      ctx.lineTo(x,                baseY - height * 0.70);
      ctx.lineTo(x + halfW * 0.75, baseY - height * 0.30);
      ctx.closePath();
      ctx.fill();
      // tier 1 (top)
      ctx.beginPath();
      ctx.moveTo(x - halfW * 0.45, baseY - height * 0.55);
      ctx.lineTo(x,                baseY - height);
      ctx.lineTo(x + halfW * 0.45, baseY - height * 0.55);
      ctx.closePath();
      ctx.fill();
      // trunk
      ctx.fillRect(x - halfW * 0.12, baseY, halfW * 0.24, height * 0.12);
    }
  },

  destroy() {
    if (this._anim)    { this._anim.pause();    this._anim = null; }
    if (this._endAnim) { this._endAnim.pause(); this._endAnim = null; }
    for (const t of (this._timeouts || [])) clearTimeout(t);
    this._timeouts = [];
    if (this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._onTap);
      this._canvas.remove();
      this._canvas = null;
    }
    this._ctx   = null;
    this._state = null;
    this._stars = null;
    this._ended = false;
  },
};
