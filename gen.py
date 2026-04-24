import sys
sys.path.insert(0, 'C:/Users/patil/AppData/Roaming/Python/Python314/site-packages')

with open('D:/Scroller/plethora-bit-starter/mushroom_b64.txt') as f:
    b64 = f.read().strip()

js = r"""window.scrollerApp = {
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

    const IMG_B64 = '___B64___';

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
"""

js = js.replace('___B64___', b64)

with open('D:/Scroller/plethora-bit-starter/src/index.js', 'w') as f:
    f.write(js)

print('done, total chars:', len(js))
