// DIG DUG — Arcade Classic (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'Dig Dug',
    author: 'plethora',
    description: 'Drag to dig and move. Tap to pump enemies!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const SAFE = ctx.safeArea.bottom;

    let audioCtx = null;
    function ensureAudio() {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playTone(freq, dur, type = 'square', vol = 0.2) {
      if (!audioCtx) return;
      const o = audioCtx.createOscillator(), gain = audioCtx.createGain();
      o.connect(gain); gain.connect(audioCtx.destination);
      o.type = type; o.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
    }
    function playDig() { playTone(200, 0.05, 'square', 0.1); }
    function playPump() { playTone(600, 0.08, 'square', 0.2); }
    function playPop() {
      if (!audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource(), gain = audioCtx.createGain();
      src.buffer = buf; src.connect(gain); gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      src.start();
    }
    function playScore() { playTone(880, 0.1, 'sine', 0.2); }
    function playDie() { [400, 300, 200].forEach((f, i) => setTimeout(() => playTone(f, 0.18, 'sawtooth', 0.3), i * 100)); }
    function playGameOver() { [300, 240, 180].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.3), i * 120)); }

    const GH = H - SAFE;

    // Grid parameters
    const COLS = 14;
    const ROWS = 18;
    const TOP_OFFSET = 50; // HUD space
    const CELL = Math.min((W) / COLS, (GH - TOP_OFFSET) / ROWS);
    const OX = (W - COLS * CELL) / 2;
    const OY = TOP_OFFSET;

    let dug, enemies, rocks, particles, score, lives, level, gameOver, started, pumpTarget, pumpT;
    let player;

    function initLevel() {
      dug = [];
      for (let r = 0; r < ROWS; r++) {
        dug[r] = [];
        for (let c = 0; c < COLS; c++) dug[r][c] = false;
      }
      enemies = [];
      rocks = [];
      particles = [];
      pumpTarget = null;
      pumpT = 0;

      const enemyCount = 2 + level;
      for (let i = 0; i < enemyCount; i++) {
        const col = 2 + Math.floor(Math.random() * (COLS - 4));
        const row = 3 + Math.floor(Math.random() * (ROWS - 6));
        const type = Math.random() < 0.6 ? 'pooka' : 'fygar';
        enemies.push({
          col: col + 0.5, row: row + 0.5,
          vCol: (Math.random() - 0.5) * 1.5,
          vRow: (Math.random() - 0.5) * 1.5,
          type,
          inflate: 0,   // 0=normal, 1-4=inflating stages
          inflateT: 0,
          alive: true,
          ghostT: 0,    // timer for ghost mode (ignore walls)
        });
      }

      const rockCount = 4 + level;
      for (let i = 0; i < rockCount; i++) {
        const col = 1 + Math.floor(Math.random() * (COLS - 2));
        const row = 2 + Math.floor(Math.random() * (ROWS - 5));
        rocks.push({ col, row, state: 'idle', vy: 0 });
      }

      // Player starts at top center
      player = {
        col: Math.floor(COLS / 2) + 0.5,
        row: 1.5,
        vCol: 0,
        vRow: 0,
        face: 1, // 1=right, -1=left
        digT: 0,
      };
      // Dig initial position
      digAt(Math.floor(player.col), Math.floor(player.row));
    }

    function initGame() {
      score = 0; lives = 3; level = 1; gameOver = false;
      initLevel();
    }

    function digAt(c, r) {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
        if (!dug[r][c]) { dug[r][c] = true; playDig(); }
      }
    }

    function explode(x, y, c) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        particles.push({
          x, y,
          vx: Math.cos(a) * (60 + Math.random() * 80),
          vy: Math.sin(a) * (60 + Math.random() * 80),
          c, life: 0.5
        });
      }
    }

    // Touch input
    let touchX = null, touchY = null;
    let dragStartX = null, dragStartY = null;
    let isDragging = false;
    let moveDir = { dc: 0, dr: 0 };
    let moveAccum = 0;

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      if (!started) { started = true; ctx.platform.start(); return; }
      if (gameOver) { initGame(); return; }
      const t = e.changedTouches[0];
      touchX = t.clientX; touchY = t.clientY;
      dragStartX = t.clientX; dragStartY = t.clientY;
      isDragging = false;
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      if (touchX === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - dragStartX;
      const dy = t.clientY - dragStartY;
      if (Math.hypot(dx, dy) > 8) isDragging = true;
      touchX = t.clientX; touchY = t.clientY;
      // determine move direction
      if (Math.abs(dx) > Math.abs(dy)) {
        moveDir = { dc: dx > 0 ? 1 : -1, dr: 0 };
      } else {
        moveDir = { dc: 0, dr: dy > 0 ? 1 : -1 };
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchend', (e) => {
      e.preventDefault();
      if (!isDragging && started && !gameOver) {
        // Tap = pump nearest enemy
        let best = null, bestDist = Infinity;
        enemies.forEach(en => {
          if (!en.alive || en.inflate >= 4) return;
          const dist = Math.hypot(en.col - player.col, en.row - player.row);
          if (dist < bestDist && dist < 4) { bestDist = dist; best = en; }
        });
        if (best) {
          pumpTarget = best;
          pumpT = 500;
          best.inflate = Math.min(4, best.inflate + 1);
          best.inflateT = 1500; // auto-deflate if not pumped again soon
          playPump();
          ctx.platform.haptic('light');
        }
      }
      touchX = null; touchY = null;
      moveDir = { dc: 0, dr: 0 };
      isDragging = false;
    }, { passive: false });

    initGame();

    ctx.raf((dt) => {
      const sec = dt / 1000;

      if (started && !gameOver) {
        // Player movement from drag
        if (isDragging && (moveDir.dc !== 0 || moveDir.dr !== 0)) {
          moveAccum += dt;
          const moveInterval = 120;
          while (moveAccum >= moveInterval) {
            moveAccum -= moveInterval;
            const nc = player.col + moveDir.dc;
            const nr = player.row + moveDir.dr;
            const fc = Math.floor(nc), fr = Math.floor(nr);
            if (fc >= 0 && fc < COLS && fr >= 0 && fr < ROWS) {
              player.col = nc;
              player.row = nr;
              if (moveDir.dc > 0) player.face = 1;
              if (moveDir.dc < 0) player.face = -1;
              // dig cells player passes through
              digAt(Math.floor(player.col), Math.floor(player.row));
            }
          }
        } else {
          moveAccum = 0;
        }

        // Clamp player
        player.col = Math.max(0.5, Math.min(COLS - 0.5, player.col));
        player.row = Math.max(0.5, Math.min(ROWS - 0.5, player.row));

        // Pump timer
        if (pumpT > 0) {
          pumpT -= dt;
          if (pumpT <= 0) pumpTarget = null;
        }

        // Enemy inflate auto-deflate
        enemies.forEach(en => {
          if (!en.alive) return;
          if (en.inflate > 0) {
            en.inflateT -= dt;
            if (en.inflateT <= 0) {
              en.inflate = Math.max(0, en.inflate - 1);
              en.inflateT = 800;
            }
            if (en.inflate >= 4) {
              // POP!
              en.alive = false;
              const ex = OX + en.col * CELL, ey = OY + en.row * CELL;
              explode(ex, ey, en.type === 'fygar' ? '#FF4400' : '#FF00FF');
              playPop();
              score += 200 * level;
              ctx.platform.setScore(score);
              playScore();
              if (pumpTarget === en) pumpTarget = null;
            }
          }
        });

        // Enemy movement
        enemies.forEach(en => {
          if (!en.alive || en.inflate > 0) return;

          // Ghost mode: periodically move through walls
          en.ghostT -= dt;
          const ghost = en.ghostT > 0;

          const spd = (0.8 + level * 0.1) * sec;
          // Chase player loosely
          if (Math.random() < 0.02) {
            const dc = player.col - en.col, dr = player.row - en.row;
            if (Math.abs(dc) > Math.abs(dr)) {
              en.vCol = Math.sign(dc) * (0.8 + Math.random() * 0.4);
              en.vRow = 0;
            } else {
              en.vCol = 0;
              en.vRow = Math.sign(dr) * (0.8 + Math.random() * 0.4);
            }
          }

          const nc = en.col + en.vCol * spd * 5;
          const nr = en.row + en.vRow * spd * 5;
          const fc = Math.floor(nc), fr = Math.floor(nr);

          const canMove = ghost || (fc >= 0 && fc < COLS && fr >= 0 && fr < ROWS && dug[fr] && dug[fr][fc]);

          if (canMove && fc >= 0 && fc < COLS && fr >= 0 && fr < ROWS) {
            en.col = nc;
            en.row = nr;
          } else {
            // Bounce
            en.vCol *= -1;
            en.vRow *= -1;
            if (Math.random() < 0.4) {
              // randomize direction
              if (Math.random() < 0.5) {
                en.vCol = (Math.random() - 0.5) * 1.5;
                en.vRow = 0;
              } else {
                en.vCol = 0;
                en.vRow = (Math.random() - 0.5) * 1.5;
              }
            }
            // Occasionally enter ghost mode to avoid getting stuck
            if (Math.random() < 0.05) en.ghostT = 1000 + Math.random() * 1000;
          }

          en.col = Math.max(0.5, Math.min(COLS - 0.5, en.col));
          en.row = Math.max(0.5, Math.min(ROWS - 0.5, en.row));

          // Enemy hits player
          if (Math.abs(en.col - player.col) < 0.7 && Math.abs(en.row - player.row) < 0.7) {
            lives--;
            ctx.platform.haptic('heavy');
            explode(OX + player.col * CELL, OY + player.row * CELL, '#00FF00');
            playDie();
            player.col = Math.floor(COLS / 2) + 0.5;
            player.row = 1.5;
            if (lives <= 0) {
              gameOver = true;
              ctx.platform.fail({ reason: 'caught by enemy' });
              playGameOver();
            }
          }
        });

        // Rocks
        rocks.forEach(rock => {
          if (rock.state === 'idle') {
            // Check if cell below is dug
            const bc = Math.floor(rock.col);
            const br = rock.row + 1;
            if (br < ROWS && dug[br] && dug[br][bc]) {
              rock.state = 'wobble';
              rock.wobbleT = 400;
            }
          } else if (rock.state === 'wobble') {
            rock.wobbleT -= dt;
            if (rock.wobbleT <= 0) rock.state = 'falling';
          } else if (rock.state === 'falling') {
            rock.vy += 8 * sec;
            rock.row += rock.vy * sec;
            const bc = Math.floor(rock.col);
            const br = Math.floor(rock.row + 1);
            // Stop at floor or undig cell
            const atBottom = rock.row >= ROWS - 1;
            const blocked = br < ROWS && dug[br] && !dug[br][bc];
            if (atBottom || blocked) {
              rock.row = Math.floor(rock.row);
              rock.state = 'resting';
              rock.vy = 0;
              // crush enemies
              enemies.forEach(en => {
                if (!en.alive) return;
                if (Math.abs(en.col - rock.col) < 0.9 && Math.abs(en.row - rock.row) < 0.9) {
                  en.alive = false;
                  score += 400 * level;
                  ctx.platform.setScore(score);
                  explode(OX + en.col * CELL, OY + en.row * CELL, '#FFFF00');
                  playPop(); playScore();
                }
              });
              // crush player
              if (Math.abs(player.col - rock.col) < 0.9 && Math.abs(player.row - rock.row) < 0.9) {
                lives--;
                ctx.platform.haptic('heavy');
                playDie();
                player.col = Math.floor(COLS / 2) + 0.5;
                player.row = 1.5;
                if (lives <= 0) {
                  gameOver = true;
                  ctx.platform.fail({ reason: 'crushed by rock' });
                  playGameOver();
                }
              }
            }
          }
        });

        // Level complete
        const aliveCount = enemies.filter(e => e.alive).length;
        if (aliveCount === 0) {
          level++;
          score += 500;
          ctx.platform.setScore(score);
          playScore();
          initLevel();
        }

        particles = particles.filter(p => {
          p.x += p.vx * sec;
          p.y += p.vy * sec;
          p.life -= sec;
          return p.life > 0;
        });
      }

      // Draw
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

      // Ground background
      g.fillStyle = '#5C2E00';
      g.fillRect(OX, OY, COLS * CELL, ROWS * CELL);

      // Draw dug cells
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (dug[r][c]) {
            g.fillStyle = '#000';
            g.fillRect(OX + c * CELL, OY + r * CELL, CELL, CELL);
          }
        }
      }

      // Grid lines (subtle)
      g.strokeStyle = 'rgba(80,40,0,0.4)'; g.lineWidth = 0.5;
      for (let r = 0; r <= ROWS; r++) {
        g.beginPath(); g.moveTo(OX, OY + r * CELL); g.lineTo(OX + COLS * CELL, OY + r * CELL); g.stroke();
      }
      for (let c = 0; c <= COLS; c++) {
        g.beginPath(); g.moveTo(OX + c * CELL, OY); g.lineTo(OX + c * CELL, OY + ROWS * CELL); g.stroke();
      }

      // Rocks
      rocks.forEach(rock => {
        const rx = OX + rock.col * CELL - CELL * 0.45;
        const ry = OY + rock.row * CELL - CELL * 0.45;
        const wobble = rock.state === 'wobble' ? Math.sin(Date.now() * 0.02) * 2 : 0;
        g.save();
        g.translate(rx + CELL * 0.45, ry + CELL * 0.45);
        g.rotate(wobble * 0.1);
        g.fillStyle = rock.state === 'falling' ? '#FFD700' : '#888';
        g.beginPath();
        g.arc(0, 0, CELL * 0.42, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = rock.state === 'falling' ? '#FF8800' : '#555';
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      });

      // Enemies
      enemies.forEach(en => {
        if (!en.alive) return;
        const ex = OX + en.col * CELL;
        const ey = OY + en.row * CELL;
        const infl = en.inflate;
        const scale = 1 + infl * 0.25;
        const r = CELL * 0.38 * scale;
        g.save();
        g.translate(ex, ey);
        if (en.type === 'pooka') {
          // Round red mask
          g.fillStyle = infl > 0 ? `hsl(${infl * 20}, 100%, 60%)` : '#FF4444';
          g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#000';
          g.fillRect(-r * 0.35, -r * 0.2, r * 0.25, r * 0.3);
          g.fillRect(r * 0.1, -r * 0.2, r * 0.25, r * 0.3);
        } else {
          // Fygar - green dragon
          g.fillStyle = infl > 0 ? `hsl(${100 + infl * 20}, 100%, 50%)` : '#00BB44';
          g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#003300';
          g.fillRect(-r * 0.35, -r * 0.15, r * 0.25, r * 0.25);
          g.fillRect(r * 0.1, -r * 0.15, r * 0.25, r * 0.25);
          // snout
          g.fillStyle = '#00FF66';
          g.fillRect(r * 0.35, -r * 0.1, r * 0.3, r * 0.2);
        }
        if (infl > 0) {
          g.strokeStyle = '#FFFF00'; g.lineWidth = 1.5;
          g.beginPath(); g.arc(0, 0, r + 2, 0, Math.PI * 2); g.stroke();
        }
        g.restore();
      });

      // Player
      const px = OX + player.col * CELL;
      const py = OY + player.row * CELL;
      g.save();
      g.translate(px, py);
      g.scale(player.face, 1);
      // body
      g.fillStyle = '#3399FF';
      g.fillRect(-CELL * 0.3, -CELL * 0.4, CELL * 0.6, CELL * 0.5);
      // head
      g.fillStyle = '#FFCC88';
      g.beginPath(); g.arc(0, -CELL * 0.45, CELL * 0.22, 0, Math.PI * 2); g.fill();
      // helmet
      g.fillStyle = '#0055FF';
      g.fillRect(-CELL * 0.22, -CELL * 0.62, CELL * 0.44, CELL * 0.22);
      // pump (arm with tool)
      g.fillStyle = '#FFD700';
      g.fillRect(CELL * 0.25, -CELL * 0.3, CELL * 0.35, CELL * 0.1);
      g.restore();

      // Pump beam to target
      if (pumpTarget && pumpTarget.alive) {
        const tx = OX + pumpTarget.col * CELL;
        const ty = OY + pumpTarget.row * CELL;
        g.strokeStyle = '#FFD700'; g.lineWidth = 2;
        g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(px, py); g.lineTo(tx, ty); g.stroke();
        g.setLineDash([]);
      }

      // Particles
      particles.forEach(p => {
        g.globalAlpha = Math.max(0, p.life / 0.5);
        g.fillStyle = p.c; g.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      g.globalAlpha = 1;

      // Scanlines
      g.fillStyle = 'rgba(0,0,0,0.15)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);

      // HUD
      g.fillStyle = '#FFD700'; g.font = 'bold 16px "Courier New"';
      g.textAlign = 'left'; g.fillText('SCORE ' + score, 12, 32);
      g.textAlign = 'center'; g.fillText('LVL ' + level, W / 2, 32);
      g.textAlign = 'right'; g.fillText('LIVES ' + '♥'.repeat(Math.max(0, lives)), W - 12, 32);
      g.textAlign = 'left';

      if (!started) {
        g.fillStyle = 'rgba(0,0,30,0.88)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FFD700'; g.font = 'bold 28px "Courier New"'; g.textAlign = 'center';
        g.fillText('DIG DUG', W / 2, H / 2 - 40);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"';
        g.fillText('DRAG to dig and move', W / 2, H / 2 + 5);
        g.fillText('TAP to pump enemies!', W / 2, H / 2 + 30);
        g.fillText('Pump 4x to pop them!', W / 2, H / 2 + 55);
        g.fillStyle = '#FFD700'; g.font = 'bold 16px "Courier New"';
        g.fillText('TAP TO START', W / 2, H / 2 + 95);
        g.textAlign = 'left';
      }

      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.82)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#FF2244'; g.font = 'bold 30px "Courier New"'; g.textAlign = 'center';
        g.fillText('GAME OVER', W / 2, H / 2 - 20);
        g.fillStyle = '#FFFF00'; g.font = '20px "Courier New"'; g.fillText('SCORE ' + score, W / 2, H / 2 + 18);
        g.fillStyle = '#FFF'; g.font = '16px "Courier New"'; g.fillText('TAP TO RESTART', W / 2, H / 2 + 52);
        g.textAlign = 'left';
      }
    });

    ctx.platform.ready();
  },

  pause() {},
  resume() {},
};
