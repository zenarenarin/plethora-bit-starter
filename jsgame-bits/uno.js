// UNO — Simplified 2-Player (Plethora Bit)
window.plethoraBit = {
  meta: {
    title: 'UNO',
    author: 'plethora',
    description: 'Play UNO against the CPU. Empty your hand to win!',
    tags: ['game'],
    permissions: [],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const SAFE = ctx.safeArea.bottom;
    const canvas = ctx.createCanvas2D();
    const g = canvas.getContext('2d');
    const ACCENT = '#FF5252';

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
      const gn = audioCtx.createGain();
      o.connect(gn); gn.connect(audioCtx.destination);
      o.type = type; o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gn.gain.setValueAtTime(vol, audioCtx.currentTime);
      gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.start(); o.stop(audioCtx.currentTime + dur);
      o.onended = () => voices--;
    }
    function playPlay()  { playTone(440, 'sine', 0.1, 0.2); }
    function playDraw()  { playTone(220, 'sawtooth', 0.12, 0.2); }
    function playAction() { playTone(600, 'square', 0.15, 0.25); }
    function playWin()   { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 'sine', 0.2, 0.35), i * 100)); }
    function playLose()  { [300, 220, 160].forEach((f, i) => setTimeout(() => playTone(f, 'sawtooth', 0.2, 0.3), i * 120)); }

    const IBTN = { x: W - 22, y: 8, r: 14 };

    // --- Card definitions ---
    const COLORS = ['red', 'blue', 'green', 'yellow'];
    const COLOR_HEX = { red: '#e53935', blue: '#1e88e5', green: '#43a047', yellow: '#fdd835', wild: '#333344' };
    const COLOR_LIGHT = { red: '#ff6659', blue: '#6ab7ff', green: '#76d275', yellow: '#ffff6b', wild: '#888899' };

    function makeCard(color, value) { return { color, value }; }

    function buildDeck() {
      const deck = [];
      for (const c of COLORS) {
        deck.push(makeCard(c, '0'));
        for (let n = 1; n <= 9; n++) {
          deck.push(makeCard(c, String(n)));
          deck.push(makeCard(c, String(n)));
        }
        for (const v of ['Skip', 'Reverse', '+2']) {
          deck.push(makeCard(c, v)); deck.push(makeCard(c, v));
        }
      }
      for (let i = 0; i < 4; i++) {
        deck.push(makeCard('wild', 'Wild'));
        deck.push(makeCard('wild', '+4'));
      }
      return deck;
    }

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // --- State ---
    let deck, discard, playerHand, cpuHand;
    let topCard, currentColor;
    let gameOver, playerWon, started, showInfo;
    let cpuTurnPending = false;
    let message = '', messageTimer = 0;
    let colorPicker = false;
    let pendingWildCard = null;
    let drawBtnAnim = 0; // press anim

    function deal() {
      deck = shuffle(buildDeck());
      playerHand = [];
      cpuHand = [];
      for (let i = 0; i < 7; i++) {
        playerHand.push(deck.pop());
        cpuHand.push(deck.pop());
      }
      // Find first non-wild card for discard
      let startCard;
      do { startCard = deck.pop(); } while (startCard.color === 'wild');
      discard = [startCard];
      topCard = startCard;
      currentColor = startCard.color;
      gameOver = false;
      playerWon = false;
      started = false;
      showInfo = false;
      colorPicker = false;
      pendingWildCard = null;
      cpuTurnPending = false;
      message = '';
    }

    function canPlay(card) {
      if (card.color === 'wild') return true;
      return card.color === currentColor || card.value === topCard.value;
    }

    function applyCard(card, isPlayer) {
      discard.push(card);
      topCard = card;
      if (card.color !== 'wild') currentColor = card.color;

      if (card.value === 'Skip') {
        showMessage(isPlayer ? 'CPU skipped!' : 'You are skipped!');
      } else if (card.value === 'Reverse') {
        showMessage(isPlayer ? 'CPU skipped!' : 'You are skipped!');
      } else if (card.value === '+2') {
        const target = isPlayer ? cpuHand : playerHand;
        for (let i = 0; i < 2; i++) target.push(deck.pop() || makeCard('red', '1'));
        showMessage(isPlayer ? 'CPU draws 2!' : 'You draw 2!');
        playAction();
      } else if (card.value === '+4') {
        const target = isPlayer ? cpuHand : playerHand;
        for (let i = 0; i < 4; i++) target.push(deck.pop() || makeCard('red', '1'));
        showMessage(isPlayer ? 'CPU draws 4!' : 'You draw 4!');
        playAction();
      }
    }

    function showMessage(msg, dur = 1800) {
      message = msg;
      messageTimer = dur;
    }

    function drawCard(target) {
      if (deck.length === 0) {
        // Reshuffle discard except top
        const top = discard.pop();
        deck = shuffle(discard);
        discard = [top];
      }
      if (deck.length > 0) target.push(deck.pop());
    }

    function playerPlayCard(card) {
      if (!canPlay(card)) {
        showMessage("Can't play that!", 1000);
        ctx.platform.haptic('light');
        return;
      }
      const idx = playerHand.indexOf(card);
      playerHand.splice(idx, 1);

      if (card.color === 'wild') {
        colorPicker = true;
        pendingWildCard = card;
        discard.push(card);
        topCard = card;
        return;
      }

      applyCard(card, true);
      playPlay();
      ctx.platform.haptic('light');
      ctx.platform.interact({ type: 'tap' });

      if (playerHand.length === 0) {
        gameOver = true;
        playerWon = true;
        playWin();
        ctx.platform.complete({ score: cpuHand.length });
        return;
      }

      // Skip/Reverse = CPU's turn skipped
      if (card.value === 'Skip' || card.value === 'Reverse') {
        // player goes again — do nothing
      } else {
        scheduleCpuTurn();
      }
    }

    function finishWildPlay(color) {
      currentColor = color;
      colorPicker = false;
      const card = pendingWildCard;
      pendingWildCard = null;
      playAction();
      ctx.platform.haptic('medium');

      if (card.value === '+4') {
        for (let i = 0; i < 4; i++) cpuHand.push(deck.pop() || makeCard('red', '1'));
        showMessage('CPU draws 4!');
      }

      if (playerHand.length === 0) {
        gameOver = true; playerWon = true; playWin();
        ctx.platform.complete({ score: cpuHand.length });
        return;
      }
      scheduleCpuTurn();
    }

    function scheduleCpuTurn() {
      if (cpuTurnPending) return;
      cpuTurnPending = true;
      ctx.timeout(() => {
        if (gameOver) { cpuTurnPending = false; return; }
        cpuTurnPending = false;
        doCpuTurn();
      }, 600);
    }

    function doCpuTurn() {
      // Find playable card
      let playable = cpuHand.filter(c => canPlay(c));
      if (playable.length === 0) {
        drawCard(cpuHand);
        playDraw();
        showMessage('CPU draws a card');
        // CPU might be able to play drawn card
        const drawn = cpuHand[cpuHand.length - 1];
        if (canPlay(drawn)) {
          ctx.timeout(() => {
            if (gameOver) return;
            playCpuCard(drawn);
          }, 400);
        }
        return;
      }

      // Prefer action cards, then number cards
      const actions = playable.filter(c => isNaN(c.value));
      const card = actions.length > 0 ? actions[0] : playable[0];
      playCpuCard(card);
    }

    function playCpuCard(card) {
      const idx = cpuHand.indexOf(card);
      if (idx === -1) return;
      cpuHand.splice(idx, 1);

      if (card.color === 'wild') {
        // CPU picks color most represented in hand
        const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
        cpuHand.forEach(c => { if (counts[c.color] !== undefined) counts[c.color]++; });
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        card._chosenColor = best;
        discard.push(card);
        topCard = card;
        currentColor = best;
        if (card.value === '+4') {
          for (let i = 0; i < 4; i++) playerHand.push(deck.pop() || makeCard('red', '1'));
          showMessage('You draw 4!');
          playAction();
        } else {
          playPlay();
        }
      } else {
        applyCard(card, false);
        playPlay();
      }

      ctx.platform.haptic('light');

      if (cpuHand.length === 0) {
        gameOver = true; playerWon = false; playLose();
        ctx.platform.fail({ reason: 'cpu won' });
        return;
      }

      // Skip/Reverse = CPU goes again
      if (card.value === 'Skip' || card.value === 'Reverse') {
        scheduleCpuTurn();
      }
    }

    // --- Layout helpers ---
    const CARD_W = Math.min(52, (W - 60) / 8);
    const CARD_H = CARD_W * 1.5;
    const CARD_R = 6;

    function drawCard2D(cx, cy, card, faceUp = true, angle = 0, scale = 1, alpha = 1) {
      g.save();
      g.globalAlpha = alpha;
      g.translate(cx, cy);
      g.rotate(angle);
      g.scale(scale, scale);

      const hw = CARD_W / 2, hh = CARD_H / 2;

      if (!faceUp) {
        // Back
        g.fillStyle = '#1a1a2e';
        roundRect(g, -hw, -hh, CARD_W, CARD_H, CARD_R);
        g.fill();
        g.strokeStyle = 'rgba(255,82,82,0.4)';
        g.lineWidth = 1.5;
        roundRect(g, -hw, -hh, CARD_W, CARD_H, CARD_R);
        g.stroke();
        // Pattern
        g.strokeStyle = 'rgba(255,82,82,0.12)';
        g.lineWidth = 1;
        roundRect(g, -hw + 4, -hh + 4, CARD_W - 8, CARD_H - 8, CARD_R - 2);
        g.stroke();
      } else {
        const bg = card._chosenColor ? COLOR_HEX[card._chosenColor] : COLOR_HEX[card.color];
        // Shadow
        g.shadowColor = 'rgba(0,0,0,0.4)';
        g.shadowBlur = 8;
        g.shadowOffsetY = 3;
        g.fillStyle = '#ffffff';
        roundRect(g, -hw, -hh, CARD_W, CARD_H, CARD_R);
        g.fill();
        g.shadowBlur = 0; g.shadowOffsetY = 0;

        // Color body
        g.fillStyle = bg;
        roundRect(g, -hw + 3, -hh + 3, CARD_W - 6, CARD_H - 6, CARD_R - 2);
        g.fill();

        // Oval decoration
        g.save();
        g.rotate(Math.PI / 5);
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.beginPath();
        g.ellipse(0, 0, hw * 0.65, hh * 0.9, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();

        // Value text
        const label = card.value === 'Wild' ? '🌈' : card.value === '+4' ? '+4' :
                       card.value === 'Skip' ? '🚫' : card.value === 'Reverse' ? '↩' :
                       card.value === '+2' ? '+2' : card.value;
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const fontSize = CARD_W * 0.35;
        g.font = `bold ${fontSize}px system-ui`;
        g.fillText(label, 0, 0);

        // Corner labels
        g.font = `bold ${CARD_W * 0.22}px system-ui`;
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(label.length > 2 ? label.substring(0, 2) : label, -hw + 4, -hh + 3);
      }

      g.restore();
    }

    function roundRect(g, x, y, w, h, r) {
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

    // Draw button position
    const DRAW_BTN = {
      x: W / 2 - 50,
      y: H - SAFE - CARD_H - 60,
      w: 100, h: 36,
    };

    // Hit test player card
    function playerCardHitIdx(px, py) {
      const n = playerHand.length;
      if (n === 0) return -1;
      const spread = Math.min(CARD_W + 4, (W - 40) / Math.max(n, 1));
      const totalW = spread * (n - 1) + CARD_W;
      const startX = W / 2 - totalW / 2;
      const cardY = H - SAFE - CARD_H - 10;
      // iterate in reverse for top-card priority
      for (let i = n - 1; i >= 0; i--) {
        const cx = startX + i * spread;
        if (px >= cx && px <= cx + CARD_W && py >= cardY && py <= cardY + CARD_H) {
          return i;
        }
      }
      return -1;
    }

    deal();

    // Touch handler
    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      const t = e.changedTouches[0];
      const px = t.clientX, py = t.clientY;

      // Info button first
      const dx = px - IBTN.x, dy = py - IBTN.y;
      if (dx * dx + dy * dy <= IBTN.r * IBTN.r) {
        showInfo = !showInfo;
        return;
      }
      if (showInfo) { showInfo = false; return; }

      if (gameOver) { deal(); return; }

      if (!started) { started = true; ctx.platform.start(); }

      // Color picker
      if (colorPicker) {
        const pickerY = H / 2 - 40;
        const pickerX = W / 2 - (COLORS.length * 44) / 2;
        for (let i = 0; i < COLORS.length; i++) {
          const cx = pickerX + i * 44 + 22;
          const cy = pickerY;
          if (Math.hypot(px - cx, py - cy) <= 22) {
            finishWildPlay(COLORS[i]);
            return;
          }
        }
        return;
      }

      if (cpuTurnPending) return;

      // Draw button
      if (px >= DRAW_BTN.x && px <= DRAW_BTN.x + DRAW_BTN.w &&
          py >= DRAW_BTN.y && py <= DRAW_BTN.y + DRAW_BTN.h) {
        drawBtnAnim = 0.15;
        drawCard(playerHand);
        playDraw();
        ctx.platform.haptic('light');
        ctx.platform.interact({ type: 'tap' });
        showMessage('You drew a card');
        scheduleCpuTurn();
        return;
      }

      // Player card tap
      const idx = playerCardHitIdx(px, py);
      if (idx >= 0) {
        playerPlayCard(playerHand[idx]);
      }
    }, { passive: false });

    ctx.listen(canvas, 'touchmove', (e) => { e.preventDefault(); }, { passive: false });

    ctx.raf((dt) => {
      const sec = dt / 1000;
      if (messageTimer > 0) messageTimer -= dt;
      if (drawBtnAnim > 0) drawBtnAnim = Math.max(0, drawBtnAnim - sec * 2);

      // Background
      g.fillStyle = '#0f0f14';
      g.fillRect(0, 0, W, H);

      // Table felt
      const feltGrad = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.6);
      feltGrad.addColorStop(0, 'rgba(20,40,30,0.6)');
      feltGrad.addColorStop(1, 'rgba(10,15,20,0)');
      g.fillStyle = feltGrad;
      g.fillRect(0, 0, W, H);

      // CPU hand (face-down cards at top)
      const cpuN = cpuHand.length;
      const cpuSpread = Math.min(CARD_W + 4, (W - 40) / Math.max(cpuN, 1));
      const cpuTotalW = cpuSpread * (cpuN - 1) + CARD_W;
      const cpuStartX = W / 2 - cpuTotalW / 2;
      const cpuCardY = 60 + CARD_H / 2;

      for (let i = 0; i < cpuN; i++) {
        const angle = ((i - (cpuN - 1) / 2) / Math.max(cpuN, 1)) * 0.12;
        drawCard2D(cpuStartX + i * cpuSpread + CARD_W / 2, cpuCardY, cpuHand[i], false, angle);
      }

      // CPU label
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.font = '12px system-ui';
      g.fillText(`CPU · ${cpuN} cards`, W / 2, 56 + CARD_H + 4);

      // Discard pile (center)
      const discardX = W / 2 + CARD_W * 0.7;
      const discardY = H / 2;
      // Color indicator ring
      g.beginPath();
      g.arc(discardX, discardY, CARD_H * 0.65, 0, Math.PI * 2);
      g.strokeStyle = (COLOR_HEX[currentColor] || ACCENT) + '55';
      g.lineWidth = 8;
      g.stroke();

      // Shadow cards in pile
      if (discard.length > 1) {
        for (let i = Math.max(0, discard.length - 3); i < discard.length - 1; i++) {
          const off = (i - (discard.length - 2)) * 1.5;
          drawCard2D(discardX + off, discardY + off, discard[i], true, off * 0.02, 1, 0.5);
        }
      }
      if (discard.length > 0) drawCard2D(discardX, discardY, topCard, true, 0);

      // Current color dot
      g.fillStyle = COLOR_HEX[currentColor] || '#888888';
      g.beginPath();
      g.arc(discardX + CARD_W * 0.7, discardY - CARD_H * 0.7, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1;
      g.stroke();

      // Draw deck (left of center)
      const deckX = W / 2 - CARD_W * 0.7;
      drawCard2D(deckX, H / 2, null, false, 0);
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.font = '10px system-ui';
      g.fillText(deck.length, deckX, H / 2 + CARD_H / 2 + 3);

      // Draw button
      const dbScale = 1 - drawBtnAnim * 0.1;
      g.save();
      g.translate(DRAW_BTN.x + DRAW_BTN.w / 2, DRAW_BTN.y + DRAW_BTN.h / 2);
      g.scale(dbScale, dbScale);
      g.fillStyle = cpuTurnPending ? 'rgba(80,80,80,0.6)' : 'rgba(255,82,82,0.25)';
      roundRect(g, -DRAW_BTN.w / 2, -DRAW_BTN.h / 2, DRAW_BTN.w, DRAW_BTN.h, 8);
      g.fill();
      g.strokeStyle = cpuTurnPending ? 'rgba(255,255,255,0.1)' : ACCENT;
      g.lineWidth = 1.5;
      roundRect(g, -DRAW_BTN.w / 2, -DRAW_BTN.h / 2, DRAW_BTN.w, DRAW_BTN.h, 8);
      g.stroke();
      g.fillStyle = cpuTurnPending ? 'rgba(255,255,255,0.3)' : '#ffffff';
      g.font = 'bold 13px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('DRAW', 0, 0);
      g.restore();

      // Player hand
      const pN = playerHand.length;
      if (pN > 0) {
        const spread = Math.min(CARD_W + 6, (W - 40) / Math.max(pN, 1));
        const totalW = spread * (pN - 1) + CARD_W;
        const startX = W / 2 - totalW / 2;
        const cardY = H - SAFE - CARD_H - 10;

        for (let i = 0; i < pN; i++) {
          const card = playerHand[i];
          const cx = startX + i * spread + CARD_W / 2;
          const cy = cardY + CARD_H / 2;
          const playable = canPlay(card) && !cpuTurnPending;
          const angle = ((i - (pN - 1) / 2) / Math.max(pN, 1)) * 0.08;
          const liftY = playable ? -5 : 0;

          if (playable) {
            g.shadowColor = ACCENT;
            g.shadowBlur = 10;
          }
          drawCard2D(cx, cy + liftY, card, true, angle);
          g.shadowBlur = 0;
        }
      }

      // Message banner
      if (messageTimer > 0) {
        const alpha = Math.min(1, messageTimer / 400);
        g.save();
        g.globalAlpha = alpha;
        g.fillStyle = 'rgba(0,0,0,0.7)';
        const msgW = 200, msgH = 32;
        roundRect(g, W / 2 - msgW / 2, H / 2 - 80, msgW, msgH, 10);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = '13px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(message, W / 2, H / 2 - 64);
        g.restore();
      }

      // Color picker overlay
      if (colorPicker) {
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(0, 0, W, H);
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillStyle = '#ffffff';
        g.font = 'bold 16px system-ui';
        g.fillText('Choose a color', W / 2, H / 2 - 50);

        const pickerY = H / 2 - 40;
        const pickerX = W / 2 - (COLORS.length * 44) / 2;
        for (let i = 0; i < COLORS.length; i++) {
          const cx = pickerX + i * 44 + 22;
          g.beginPath();
          g.arc(cx, pickerY, 22, 0, Math.PI * 2);
          g.fillStyle = COLOR_HEX[COLORS[i]];
          g.fill();
          g.strokeStyle = '#ffffff';
          g.lineWidth = 2;
          g.stroke();
        }
      }

      // HUD
      g.fillStyle = 'rgba(15,15,20,0.92)';
      g.fillRect(0, 0, W, 48);
      g.strokeStyle = 'rgba(255,82,82,0.15)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, 48); g.lineTo(W, 48); g.stroke();

      g.font = 'bold 15px system-ui';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = ACCENT;
      g.fillText('UNO', 16, 24);

      g.textAlign = 'right';
      g.fillStyle = '#ffffff';
      g.fillText(`You:${pN} CPU:${cpuN}`, W - 50, 24);

      // Game over
      if (gameOver) {
        g.fillStyle = 'rgba(0,0,0,0.85)';
        g.fillRect(0, 0, W, H);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = 'bold 34px system-ui';
        g.fillStyle = playerWon ? '#64FFDA' : ACCENT;
        g.fillText(playerWon ? 'YOU WIN!' : 'CPU WINS', W / 2, H / 2 - 30);
        g.font = '15px system-ui';
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillText('TAP TO PLAY AGAIN', W / 2, H / 2 + 30);
      }

      // Info overlay
      if (showInfo) {
        g.fillStyle = 'rgba(0,0,0,0.88)';
        g.fillRect(0, 0, W, H);
        const boxW = W - 60, boxH = 280;
        const bx = 30, by = H / 2 - boxH / 2;
        g.fillStyle = '#1a1a2a';
        roundRect(g, bx, by, boxW, boxH, 16);
        g.fill();
        g.strokeStyle = ACCENT;
        g.lineWidth = 1.5;
        roundRect(g, bx, by, boxW, boxH, 16);
        g.stroke();

        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillStyle = ACCENT;
        g.font = 'bold 20px system-ui';
        g.fillText('How to Play', W / 2, by + 22);

        g.fillStyle = '#cccccc';
        g.font = '13px system-ui';
        const lines = [
          'Tap a card in your hand to play it.',
          'Match by color OR number/symbol.',
          'Wild: play anytime, pick new color.',
          '+2 / +4: opponent draws cards.',
          'Skip/Reverse: CPU loses their turn.',
          'First to empty their hand wins!',
        ];
        lines.forEach((l, i) => g.fillText(l, W / 2, by + 56 + i * 26));

        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.font = '12px system-ui';
        g.textBaseline = 'bottom';
        g.fillText('TAP ANYWHERE TO CLOSE', W / 2, by + boxH - 14);
      }

      // Info button (drawn LAST)
      g.save();
      g.beginPath();
      g.arc(IBTN.x, IBTN.y, IBTN.r, 0, Math.PI * 2);
      g.fillStyle = showInfo ? ACCENT : 'rgba(255,82,82,0.15)';
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
