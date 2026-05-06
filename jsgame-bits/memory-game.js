// MEMORY GAME — Classic Card Matching (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Memory Match',
    author: 'plethora',
    description: 'Flip pairs of cards to match them all!',
    tags: ['game'],
    permissions: ['audio', 'haptics', 'storage'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const ACCENT = '#64FFDA';

    // --- Audio ---
    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    let voices = 0;
    function playTone(freq, type, dur, vol = 0.25) {
      if (!audioCtx || voices >= 8) return;
      voices++;
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      o.onended = () => voices--;
    }
    function playFlip()  { playTone(440, 'sine', 0.08, 0.2); }
    function playMatch() { [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.15, 0.3), i * 80)); }
    function playMiss()  { playTone(200, 'sawtooth', 0.12, 0.2); }
    function playWin()   { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.4), i * 100)); }

    // --- Info button ---
    const IBTN = { x: W - 22, y: 8, r: 14 };

    // --- Layout ---
    const HUD_H = 48;
    const COLS = 4, ROWS = 4;
    const PAD = 10;
    const GRID_TOP = HUD_H + PAD;
    const GRID_BOTTOM = H - SAFE - PAD;
    const GRID_H = GRID_BOTTOM - GRID_TOP;
    const GRID_W = W - PAD * 2;
    const CW = (GRID_W - PAD * (COLS - 1)) / COLS;
    const CH = (GRID_H - PAD * (ROWS - 1)) / ROWS;
    const RADIUS = 10;

    const EMOJIS = ['🌙', '⭐', '🎯', '🎲', '🎸', '🦋', '🌈', '🎪'];

    // --- State ---
    let cards, flipped, matched, moves, bestMoves, gameOver, started, showInfo;
    let flipQueue = []; // pending flip-back pairs
    let solveAnim = 0; // >0 during win wave anim

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function initGame() {
      const pairs = [...EMOJIS, ...EMOJIS];
      shuffle(pairs);
      cards = pairs.map((emoji, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        return {
          emoji,
          x: PAD + col * (CW + PAD),
          y: GRID_TOP + row * (CH + PAD),
          w: CW, h: CH,
          faceUp: false,
          matched: false,
          flipT: 0,      // 0=back, 1=front, animating in between
          flipDir: 0,    // +1 flipping to front, -1 flipping to back
          glowT: 0,      // glow pulse after match
          waveT: 0,      // win wave offset
        };
      });
      flipped = [];
      matched = 0;
      moves = 0;
      gameOver = false;
      started = false;
      showInfo = false;
      flipQueue = [];
      solveAnim = 0;
      bestMoves = ctx.storage.get('hs_memory') || null;
    }

    function cardAt(px, py) {
      return cards.find(c =>
        px >= c.x && px <= c.x + c.w &&
        py >= c.y && py <= c.y + c.h
      );
    }

    function tapCard(c) {
      if (!c || c.faceUp || c.matched || flipQueue.length > 0) return;
      if (flipped.length >= 2) return;

      c.faceUp = true;
      c.flipDir = 1;
      flipped.push(c);
      playFlip();

      if (flipped.length === 2) {
        moves++;
        const [a, b] = flipped;
        if (a.emoji === b.emoji) {
          // Match!
          ctx.timeout(() => {
            a.matched = b.matched = true;
            a.glowT = b.glowT = 1;
            matched += 2;
            playMatch();
            ctx.platform.haptic('medium');
            flipped = [];
            if (matched === cards.length) {
              gameOver = true;
              solveAnim = 0.001;
              playWin();
              ctx.platform.complete({ score: moves });
              if (!bestMoves || moves < bestMoves) {
                bestMoves = moves;
                ctx.storage.set('hs_memory', bestMoves);
              }
            }
          }, 300);
        } else {
          // No match — flip back after delay
          const pair = [a, b];
          flipQueue.push(pair);
          ctx.timeout(() => {
            pair.forEach(card => {
              card.faceUp = false;
              card.flipDir = -1;
            });
            flipped = [];
            flipQueue = flipQueue.filter(p => p !== pair);
            playMiss();
          }, 800);
        }
      }
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const px = t.clientX, py = t.clientY;

      // Info button check first
      const dx = px - IBTN.x, dy = py - IBTN.y;
      if (dx * dx + dy * dy <= IBTN.r * IBTN.r) {
        showInfo = !showInfo;
        return;
      }

      // Dismiss info card
      if (showInfo) {
        showInfo = false;
        return;
      }

      if (gameOver) {
        initGame();
        return;
      }

      // First real interaction
      if (!started && py > HUD_H) {
        started = true;
        ctx.platform.start();
      }

      const c = cardAt(px, py);
      if (c) {
        ctx.platform.interact({ type: 'tap' });
        tapCard(c);
      }
    }, { passive: false });

    initGame();

    // --- Render ---
    ctx.raf((dt) => {
      const sec = dt / 1000;

      // Update flip animations
      cards.forEach(c => {
        if (c.flipDir !== 0) {
          c.flipT += c.flipDir * sec * 6; // ~0.17s full flip
          if (c.flipT >= 1) { c.flipT = 1; c.flipDir = 0; }
          if (c.flipT <= 0) { c.flipT = 0; c.flipDir = 0; }
        }
        if (c.glowT > 0) {
          c.glowT = Math.max(0, c.glowT - sec * 1.5);
        }
      });

      // Win wave animation
      if (solveAnim > 0) {
        solveAnim += sec * 2;
        if (solveAnim > 6) solveAnim = 0;
      }

      // Background
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);

      // Subtle grid bg
      g.strokeStyle = 'rgba(100,255,218,0.04)';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 30) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
      for (let y = 0; y < H; y += 30) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }

      // Draw cards
      cards.forEach((c, idx) => {
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);

        // Wave offset for win anim
        let waveOff = 0;
        if (solveAnim > 0) {
          const dist = (col + row) * 0.4;
          waveOff = Math.sin((solveAnim - dist) * Math.PI) * 6;
        }

        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2 + waveOff;

        // Flip scale: 0→0.5 back phase, 0.5→1 front phase
        const scaleX = Math.abs(Math.cos(c.flipT * Math.PI));
        const isFrontVisible = c.flipT >= 0.5;

        g.save();
        g.translate(cx, cy);
        g.scale(scaleX, 1);

        const hw = c.w / 2, hh = c.h / 2;

        if (isFrontVisible || c.matched) {
          // Front face
          if (c.matched && c.glowT > 0) {
            g.shadowColor = ACCENT;
            g.shadowBlur = 20 * c.glowT;
          }
          // Card bg
          const grad = g.createLinearGradient(-hw, -hh, hw, hh);
          grad.addColorStop(0, '#1a2a28');
          grad.addColorStop(1, '#0d1a18');
          g.fillStyle = grad;
          drawRoundRect(g, -hw, -hh, c.w, c.h, RADIUS);
          g.fill();

          if (c.matched) {
            g.strokeStyle = ACCENT;
            g.lineWidth = 2;
            drawRoundRect(g, -hw, -hh, c.w, c.h, RADIUS);
            g.stroke();
          }

          g.shadowBlur = 0;

          // Emoji
          const fontSize = Math.min(c.w, c.h) * 0.5;
          g.font = `${fontSize}px serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(c.emoji, 0, 0);
        } else {
          // Back face
          const grad = g.createLinearGradient(-hw, -hh, hw, hh);
          grad.addColorStop(0, '#1e1e2e');
          grad.addColorStop(1, '#12121c');
          g.fillStyle = grad;
          drawRoundRect(g, -hw, -hh, c.w, c.h, RADIUS);
          g.fill();

          g.strokeStyle = 'rgba(100,255,218,0.15)';
          g.lineWidth = 1;
          drawRoundRect(g, -hw, -hh, c.w, c.h, RADIUS);
          g.stroke();

          // Decorative pattern
          g.strokeStyle = 'rgba(100,255,218,0.08)';
          g.lineWidth = 1;
          const inset = 6;
          drawRoundRect(g, -hw + inset, -hh + inset, c.w - inset * 2, c.h - inset * 2, RADIUS - 3);
          g.stroke();

          // Center dot
          g.fillStyle = 'rgba(100,255,218,0.12)';
          g.beginPath();
          g.arc(0, 0, 4, 0, Math.PI * 2);
          g.fill();
        }

        g.restore();
      });

      // HUD bar
      g.fillStyle = 'rgba(15,15,20,0.92)';
      g.fillRect(0, 0, W, HUD_H);
      g.strokeStyle = 'rgba(100,255,218,0.15)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, HUD_H); g.lineTo(W, HUD_H); g.stroke();

      g.font = 'bold 15px system-ui';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = ACCENT;
      g.fillText('Memory', 16, 24);

      g.textAlign = 'right';
      g.fillStyle = '#ffffff';
      const hsText = bestMoves ? ` · Best:${bestMoves}` : '';
      g.fillText(`Moves:${moves}${hsText}`, W - 50, 24);

      // Game over overlay
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.82)';
        g.fillRect(0, 0, W, H);

        g.textAlign = 'center';
        g.textBaseline = 'middle';

        g.font = 'bold 32px system-ui';
        g.fillStyle = ACCENT;
        g.fillText('Matched!', W / 2, H / 2 - 55);

        g.font = '18px system-ui';
        g.fillStyle = '#ffffff';
        g.fillText(`Moves: ${moves}`, W / 2, H / 2 - 10);

        if (bestMoves) {
          g.fillStyle = ACCENT;
          g.font = '15px system-ui';
          g.fillText(`Best: ${bestMoves} moves`, W / 2, H / 2 + 22);
        }

        g.font = '14px system-ui';
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillText('TAP TO PLAY AGAIN', W / 2, H / 2 + 60);
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);

        const boxW = W - 60, boxH = 240;
        const bx = 30, by = H / 2 - boxH / 2;

        g.fillStyle = '#1a1a2a';
        drawRoundRect(g, bx, by, boxW, boxH, 16);
        g.fill();
        g.strokeStyle = ACCENT;
        g.lineWidth = 1.5;
        drawRoundRect(g, bx, by, boxW, boxH, 16);
        g.stroke();

        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillStyle = ACCENT;
        g.font = 'bold 20px system-ui';
        g.fillText('How to Play', W / 2, by + 22);

        g.fillStyle = '#cccccc';
        g.font = '14px system-ui';
        const lines = [
          'Tap cards to flip them.',
          'Find matching emoji pairs.',
          'Match all 8 pairs to win!',
          'Fewest moves = best score.',
        ];
        lines.forEach((l, i) => g.fillText(l, W / 2, by + 60 + i * 28));

        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = '12px system-ui';
        g.textBaseline = 'bottom';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, by + boxH - 14);
      }

      // Info button (drawn LAST)
      g.save();
      g.beginPath();
      g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2);
      g.fillStyle = showInfo ? ACCENT : 'rgba(100,255,218,0.15)';
      g.fill();
      g.strokeStyle = ACCENT;
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = showInfo ? '#0f0f14' : ACCENT;
      g.font = 'bold 14px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('i', IBTN.x, IBTN.y);
      g.restore();
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};

function drawRoundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
