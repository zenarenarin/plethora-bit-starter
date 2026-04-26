window.scrollerApp = {
  meta: {
    title: 'Bayes Trap',
    author: 'plethora',
    description: '"Positive test. 1% disease. 99% accurate. Chance you\'re sick?" Most say 99%. Answer: ~50%.',
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

    // Steps of the Bayesian walkthrough
    const STEPS = [
      {
        headline: '"You tested positive."',
        sub:      'A disease affects 1% of the population.\nThe test is 99% accurate.\nWhat are the odds you\'re actually sick?',
        guess:    true,
        guessLabel: 'Most people say: 99%',
        reveal:   false,
      },
      {
        headline: 'Let\'s examine 10,000 people.',
        sub:      '100 have the disease (1%)\n9,900 do not',
        show:     'population',
        reveal:   false,
      },
      {
        headline: 'Now we test everyone.',
        sub:      '99% accuracy means:\n• 99 sick people test positive ✓\n• 1 sick person tests negative ✗\n• 99 healthy people also test positive ✗\n• 9,801 healthy people test negative ✓',
        show:     'tested',
        reveal:   false,
      },
      {
        headline: 'Who tests positive?',
        sub:      '99 truly sick  +  99 false alarms\n= 198 positive tests total',
        show:     'positives',
        reveal:   false,
      },
      {
        headline: 'Your odds if positive:',
        sub:      '99 out of 198 = exactly 50%',
        show:     'answer',
        reveal:   true,
        answer:   '50%',
        answerSub:'Not 99%. The rare disease swamps\nthe test\'s false positives.\nThis is Bayes\' Theorem.',
      },
    ];

    let step = 0;
    let audioCtx = null;
    const ensureAudio = () => {
      if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };
    const playChime = (freq, vol=0.1) => {
      if (!audioCtx) return;
      try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = freq;
        const t = audioCtx.currentTime;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.start(t); o.stop(t + 0.6);
      } catch (_) {}
    };

    // Population grid: 100×100 dots
    const GRID_COLS = 50, GRID_ROWS = 20;  // 1000 dots representing 10000 scaled
    const TOTAL = GRID_COLS * GRID_ROWS;
    const SICK  = 10; // represents 100/10000 = 1%
    // In test step: true positives, false positives
    // sick = first SICK dots
    // TP = SICK - 0 (all sick test positive, ~99% so TP=9 FN=1)
    const TP = 9, FP = 9; // scaled

    const dotStatus = new Uint8Array(TOTAL); // 0=healthy, 1=sick
    for (let i = 0; i < SICK; i++) dotStatus[i] = 1;
    // shuffle
    for (let i = TOTAL - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [dotStatus[i], dotStatus[j]] = [dotStatus[j], dotStatus[i]];
    }
    const sickIndices  = [];
    const healthyIdxs  = [];
    for (let i = 0; i < TOTAL; i++) {
      if (dotStatus[i] === 1) sickIndices.push(i);
      else healthyIdxs.push(i);
    }
    // False positives: first FP healthy dots
    const fpIndices = healthyIdxs.slice(0, FP);

    const GRID_PAD  = W * 0.05;
    const GRID_W    = W - GRID_PAD * 2;
    const DOT_SIZE  = GRID_W / GRID_COLS - 2;
    const GRID_TOP  = H * 0.50;
    const GRID_H    = GRID_ROWS * (DOT_SIZE + 2);

    const dotPos = (idx) => {
      const col = idx % GRID_COLS, row = Math.floor(idx / GRID_COLS);
      const x = GRID_PAD + col * (DOT_SIZE + 2) + DOT_SIZE / 2;
      const y = GRID_TOP + row * (DOT_SIZE + 2) + DOT_SIZE / 2;
      return [x, y];
    };

    const wrapText = (text, x, y, maxW, lineH) => {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, x, y + i * lineH);
      });
      return lines.length;
    };

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.fillStyle = '#06060f';
      ctx.fillRect(0, 0, W, H);

      const s = STEPS[step];

      // Headline
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = `bold ${H*0.038}px -apple-system,sans-serif`;
      ctx.fillStyle = '#c8d8ff';
      ctx.fillText(s.headline, W/2, H*0.05);

      // Sub text
      ctx.font = `${H*0.023}px -apple-system,sans-serif`;
      ctx.fillStyle = 'rgba(160,185,230,0.72)';
      const subLines = s.sub.split('\n');
      subLines.forEach((line, i) => {
        ctx.fillText(line, W/2, H*0.115 + i * H*0.032);
      });

      // Grid
      if (s.show) {
        for (let i = 0; i < TOTAL; i++) {
          const [dx, dy] = dotPos(i);
          const isSick = dotStatus[i] === 1;
          const isFP   = fpIndices.includes(i);

          let color = 'rgba(40,60,120,0.45)';  // default: healthy, untested
          if (s.show === 'population') {
            color = isSick ? '#FF5050' : 'rgba(40,60,120,0.45)';
          } else if (s.show === 'tested') {
            if (isSick)        color = (sickIndices.indexOf(i) < TP) ? '#FF5050' : '#884444';
            else if (isFP)     color = '#FF9020';
            else               color = 'rgba(40,60,120,0.3)';
          } else if (s.show === 'positives' || s.show === 'answer') {
            const isTP = isSick && sickIndices.indexOf(i) < TP;
            const isFPPos = isFP;
            if (isTP)   color = '#FF5050';
            else if (isFPPos) color = '#FF9020';
            else        color = 'rgba(25,35,80,0.2)';
          }

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(dx, dy, DOT_SIZE / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Legend
        const legY = GRID_TOP + GRID_H + H*0.025;
        const items = [];
        if (s.show === 'population') {
          items.push(['#FF5050', `${SICK*10} sick (1%)`], ['rgba(40,60,120,0.7)', `${(TOTAL-SICK)*10} healthy`]);
        } else if (s.show === 'tested') {
          items.push(['#FF5050','True positive (sick+correct)'],['#884444','False negative (sick+missed)'],['#FF9020','False positive (healthy+wrong)']);
        } else {
          items.push(['#FF5050',`${TP*10} truly sick`],['#FF9020',`${FP*10} false alarms`]);
        }
        ctx.textBaseline = 'middle';
        let legX = W * 0.06;
        items.forEach(([col, label]) => {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(legX + 5, legY, 4, 0, Math.PI*2); ctx.fill();
          ctx.font = `${H*0.019}px -apple-system,sans-serif`;
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(140,165,210,0.6)';
          ctx.fillText(label, legX + 13, legY);
          legX += ctx.measureText(label).width + 24;
        });
      }

      // Big answer reveal
      if (s.show === 'answer') {
        ctx.textAlign = 'center';
        ctx.font = `bold ${H*0.095}px -apple-system,sans-serif`;
        ctx.fillStyle = '#FFD020';
        ctx.fillText(s.answer, W/2, GRID_TOP - H*0.11);
        ctx.font = `${H*0.022}px -apple-system,sans-serif`;
        ctx.fillStyle = 'rgba(200,180,100,0.65)';
        s.answerSub.split('\n').forEach((line, i) => {
          ctx.fillText(line, W/2, GRID_TOP - H*0.11 + H*0.085 + i*H*0.03);
        });
      }

      // Tap prompt
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.font = `${H*0.022}px -apple-system,sans-serif`;
      ctx.fillStyle = 'rgba(110,140,200,0.45)';
      ctx.fillText(
        step < STEPS.length - 1 ? 'tap to continue →' : 'tap to restart',
        W/2, H - H*0.025
      );
    };

    this._onTap = (e) => {
      e.preventDefault();
      ensureAudio();
      step = (step + 1) % STEPS.length;
      if (step === STEPS.length - 1) playChime(330, 0.12); // reveal
      else playChime(500 + step * 80, 0.07);
    };
    canvas.addEventListener('touchstart', this._onTap, { passive: false });
    canvas.addEventListener('click', this._onTap);

    raf = requestAnimationFrame(draw);
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
