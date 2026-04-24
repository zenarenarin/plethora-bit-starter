window.scrollerApp = {
  meta: {
    title: 'Mushroom Coloring',
    author: 'YourUsername',
    description: 'Tap to color the kawaii mushroom scene',
    tags: ['creative'],
  },

  init(container) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    const PAL_H  = 114;
    const PAD    = 14;
    const IMG_SZ = 400;
    const scale  = Math.min((W - PAD * 2) / IMG_SZ, (H - PAL_H - PAD * 2) / IMG_SZ);
    const iW     = IMG_SZ * scale;
    const iH     = IMG_SZ * scale;
    const iX     = Math.round((W - iW) / 2);
    const iY     = Math.round((H - PAL_H - iH) / 2);

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Color state: hue 0-360, lightness 12-88, saturation fixed
    let hue = 0, lit = 52;
    const SAT = 78;

    function hslToHex(h, s, l) {
      s /= 100; l /= 100;
      const a = s * Math.min(l, 1 - l);
      const f = n => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
          .toString(16).padStart(2, '0');
      };
      return '#' + f(0) + f(8) + f(4);
    }

    const getColor = () => hslToHex(hue, SAT, lit);

    // Palette layout
    const PT    = H - PAL_H;
    const SW    = 62;
    const SX    = 14;
    const SLX   = SX + SW + 18;
    const SLW   = W - SLX - 14;
    const SLH   = 20;
    const HUE_Y = PT + 24;
    const LIT_Y = HUE_Y + SLH + 18;

    function drawPalette() {
      ctx.fillStyle = '#18181f';
      ctx.fillRect(0, PT, W, PAL_H);

      // Swatch
      const swY = PT + (PAL_H - SW) / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = getColor();
      ctx.beginPath();
      ctx.roundRect(SX, swY, SW, SW, 10);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(SX, swY, SW, SW, 10);
      ctx.stroke();

      // Hue bar
      const hueGrad = ctx.createLinearGradient(SLX, 0, SLX + SLW, 0);
      for (let i = 0; i <= 12; i++)
        hueGrad.addColorStop(i / 12, `hsl(${i * 30},85%,55%)`);
      ctx.beginPath();
      ctx.roundRect(SLX, HUE_Y, SLW, SLH, SLH / 2);
      ctx.fillStyle = hueGrad;
      ctx.fill();

      // Hue thumb
      const hTX = SLX + (hue / 360) * SLW;
      ctx.beginPath();
      ctx.arc(hTX, HUE_Y + SLH / 2, SLH / 2 + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      ctx.arc(hTX, HUE_Y + SLH / 2, SLH / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue},85%,55%)`; ctx.fill();

      // Lightness bar
      const litGrad = ctx.createLinearGradient(SLX, 0, SLX + SLW, 0);
      litGrad.addColorStop(0,    `hsl(${hue},${SAT}%,12%)`);
      litGrad.addColorStop(0.42, `hsl(${hue},${SAT}%,50%)`);
      litGrad.addColorStop(1,    `hsl(${hue},${SAT}%,88%)`);
      ctx.beginPath();
      ctx.roundRect(SLX, LIT_Y, SLW, SLH, SLH / 2);
      ctx.fillStyle = litGrad; ctx.fill();

      // Lightness thumb
      const lTX = SLX + ((lit - 12) / 76) * SLW;
      ctx.beginPath();
      ctx.arc(lTX, LIT_Y + SLH / 2, SLH / 2 + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      ctx.arc(lTX, LIT_Y + SLH / 2, SLH / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = getColor(); ctx.fill();

      // Labels
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('HUE',   SLX, HUE_Y - 5);
      ctx.fillText('LIGHT', SLX, LIT_Y - 5);
    }

    const IMG_B64 = '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';

    function drawScene() {
      ctx.fillStyle = '#fdf6ec';
      ctx.fillRect(iX - 4, iY - 4, iW + 8, iH + 8);
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, iX, iY, iW, iH); drawPalette(); };
      img.src = 'data:image/png;base64,' + IMG_B64;
    }

    drawScene();

    // Flood fill — BFS with typed array queue
    function hexToRgb(hex) {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function floodFill(sx, sy) {
      const imageData = ctx.getImageData(0, 0, W, H);
      const d = imageData.data;
      const idx = (sy * W + sx) * 4;
      const r0 = d[idx], g0 = d[idx+1], b0 = d[idx+2];
      if (r0 < 100 && g0 < 100 && b0 < 100) return;
      const [fr, fg, fb] = hexToRgb(getColor());
      if (r0 === fr && g0 === fg && b0 === fb) return;

      const queue = new Int32Array(W * H * 2);
      const visited = new Uint8Array(W * H);
      let head = 0, tail = 0;
      queue[tail++] = sx; queue[tail++] = sy;
      visited[sy * W + sx] = 1;

      while (head < tail) {
        const x = queue[head++], y = queue[head++];
        const i = (y * W + x) * 4;
        d[i] = fr; d[i+1] = fg; d[i+2] = fb; d[i+3] = 255;
        const nb = [x-1,y, x+1,y, x,y-1, x,y+1];
        for (let n = 0; n < 8; n += 2) {
          const nx = nb[n], ny = nb[n+1];
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const vi = ny * W + nx;
          if (visited[vi]) continue;
          visited[vi] = 1;
          const ni = vi * 4;
          if (d[ni] < 100 && d[ni+1] < 100 && d[ni+2] < 100) continue;
          queue[tail++] = nx; queue[tail++] = ny;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      drawPalette();
    }

    // Input
    let activeSlider = null;

    function canvasXY(e) {
      const r = canvas.getBoundingClientRect();
      return [
        Math.round((e.clientX - r.left) * (W / r.width)),
        Math.round((e.clientY - r.top)  * (H / r.height)),
      ];
    }

    function inBar(x, y, barY) {
      return x >= SLX - 14 && x <= SLX + SLW + 14
          && y >= barY - 10 && y <= barY + SLH + 10;
    }

    function applySlider(x) {
      const t = Math.max(0, Math.min(1, (x - SLX) / SLW));
      if (activeSlider === 'hue') hue = Math.round(t * 360);
      else                        lit  = Math.round(12 + t * 76);
      drawPalette();
    }

    this._onDown = e => {
      const [x, y] = canvasXY(e);
      if (y >= PT) {
        if (inBar(x, y, HUE_Y)) { activeSlider = 'hue'; applySlider(x); return; }
        if (inBar(x, y, LIT_Y)) { activeSlider = 'lit'; applySlider(x); return; }
        return;
      }
      if (x >= iX && x < iX + iW && y >= iY && y < iY + iH) floodFill(x, y);
    };

    this._onMove = e => {
      if (!activeSlider) return;
      const [x] = canvasXY(e);
      applySlider(x);
    };

    this._onUp = () => { activeSlider = null; };

    canvas.addEventListener('pointerdown',   this._onDown);
    canvas.addEventListener('pointermove',   this._onMove);
    canvas.addEventListener('pointerup',     this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);

    this._canvas = canvas;
  },

  destroy() {
    const c = this._canvas;
    if (c) {
      c.removeEventListener('pointerdown',   this._onDown);
      c.removeEventListener('pointermove',   this._onMove);
      c.removeEventListener('pointerup',     this._onUp);
      c.removeEventListener('pointercancel', this._onUp);
    }
    this._canvas = null;
  },
};
