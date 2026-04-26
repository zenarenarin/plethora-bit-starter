window.scrollerApp = {
  meta: {
    title: 'Stroop Effect',
    author: 'plethora',
    description: 'Tap the INK color — not what the word says. Measures your cognitive conflict cost.',
    tags: ['education'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.style.background = '#06060f';

    const COLORS = [
      { name: 'RED',    hex: '#FF4040' },
      { name: 'GREEN',  hex: '#30D060' },
      { name: 'BLUE',   hex: '#2090FF' },
      { name: 'YELLOW', hex: '#FFD020' },
    ];
    const TRIALS = 12;
    const CONGRUENT_EVERY = 3;  // every 3rd trial is congruent

    let phase = 'intro';   // intro | trial | feedback | summary
    let trialIdx = 0;
    let wordColor = null, inkColor = null, congruent = false;
    let trialStart = 0;
    let lastRT = 0, correct = false;
    const rtCong = [], rtInc = [];

    let audioCtx = null;
    const ensureAudio = () => {
      if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      if (audioCtx?.state === 'suspended') audioCtx.resume().catch(() => {});
    };
    const playTone = (freq, vol, dur, type='sine') => {
      if (!audioCtx) return;
      try {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = type; o.frequency.value = freq;
        const t = audioCtx.currentTime;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.start(t); o.stop(t + dur);
      } catch (_) {}
    };

    const root = document.createElement('div');
    root.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;`;
    container.appendChild(root);

    // Word display area
    const wordArea = document.createElement('div');
    wordArea.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;
      justify-content:center;width:100%;`;
    root.appendChild(wordArea);

    const wordLabel = document.createElement('div');
    wordLabel.style.cssText = `font-size:${H*0.038}px;color:rgba(100,130,200,0.55);
      font-weight:500;margin-bottom:${H*0.02}px;letter-spacing:0.05em;text-transform:uppercase;`;
    wordLabel.textContent = 'tap the ink color';
    wordArea.appendChild(wordLabel);

    const wordEl = document.createElement('div');
    wordEl.style.cssText = `font-size:${H*0.12}px;font-weight:800;letter-spacing:0.03em;
      text-transform:uppercase;transition:opacity 0.1s;min-height:${H*0.15}px;
      display:flex;align-items:center;`;
    wordArea.appendChild(wordEl);

    const trialCounter = document.createElement('div');
    trialCounter.style.cssText = `font-size:${H*0.022}px;color:rgba(100,130,200,0.45);
      margin-top:${H*0.01}px;`;
    wordArea.appendChild(trialCounter);

    const feedbackEl = document.createElement('div');
    feedbackEl.style.cssText = `font-size:${H*0.032}px;font-weight:700;margin-top:${H*0.015}px;
      min-height:${H*0.05}px;text-align:center;`;
    wordArea.appendChild(feedbackEl);

    // Color buttons
    const btnGrid = document.createElement('div');
    btnGrid.style.cssText = `display:grid;grid-template-columns:1fr 1fr;
      gap:${W*0.025}px;padding:${H*0.02}px ${W*0.05}px;
      width:100%;box-sizing:border-box;padding-bottom:${H*0.03}px;`;
    root.appendChild(btnGrid);

    const buttons = COLORS.map(c => {
      const btn = document.createElement('button');
      btn.style.cssText = `background:rgba(${hexToRgb(c.hex)},0.12);
        border:2px solid rgba(${hexToRgb(c.hex)},0.4);border-radius:14px;
        color:${c.hex};font-size:${H*0.038}px;font-weight:700;
        height:${H*0.095}px;cursor:pointer;touch-action:manipulation;
        letter-spacing:0.04em;transition:background 0.1s,transform 0.08s;`;
      btn.textContent = c.name;
      btn.addEventListener('click', () => handleAnswer(c));
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleAnswer(c); }, { passive: false });
      btnGrid.appendChild(btn);
      return btn;
    });

    function hexToRgb(hex) {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return `${r},${g},${b}`;
    }

    const nextTrial = () => {
      congruent = (trialIdx % CONGRUENT_EVERY === 0);
      const inkIdx  = Math.floor(Math.random() * COLORS.length);
      let wordIdx   = inkIdx;
      if (!congruent) {
        do { wordIdx = Math.floor(Math.random() * COLORS.length); } while (wordIdx === inkIdx);
      }
      inkColor  = COLORS[inkIdx];
      wordColor = COLORS[wordIdx];

      wordEl.style.color = inkColor.hex;
      wordEl.textContent = wordColor.name;
      trialCounter.textContent = `${trialIdx + 1} of ${TRIALS}`;
      feedbackEl.textContent = '';
      phase = 'trial';
      trialStart = performance.now();
      setButtonsEnabled(true);
    };

    const setButtonsEnabled = (on) => {
      buttons.forEach(b => { b.style.opacity = on ? '1' : '0.5'; b.disabled = !on; });
    };

    const handleAnswer = (chosen) => {
      if (phase !== 'trial') return;
      phase = 'feedback';
      setButtonsEnabled(false);
      ensureAudio();

      const rt = (performance.now() - trialStart) / 1000;
      correct = chosen === inkColor;
      lastRT  = rt;

      if (correct) {
        if (congruent) rtCong.push(rt); else rtInc.push(rt);
        feedbackEl.style.color = '#30D060';
        feedbackEl.textContent = `✓  ${(rt * 1000).toFixed(0)} ms`;
        playTone(660, 0.12, 0.18);
      } else {
        feedbackEl.style.color = '#FF4040';
        feedbackEl.textContent = `✗  wrong color`;
        playTone(200, 0.1, 0.25, 'sawtooth');
      }

      trialIdx++;
      if (trialIdx >= TRIALS) {
        setTimeout(showSummary, 700);
      } else {
        setTimeout(nextTrial, 650);
      }
    };

    const showSummary = () => {
      phase = 'summary';
      btnGrid.style.display = 'none';
      wordArea.innerHTML = '';

      const avgCong = rtCong.length ? rtCong.reduce((a,b)=>a+b,0)/rtCong.length : 0;
      const avgInc  = rtInc.length  ? rtInc.reduce((a,b)=>a+b,0)/rtInc.length   : 0;
      const costMs  = Math.round((avgInc - avgCong) * 1000);

      const s = document.createElement('div');
      s.style.cssText = `display:flex;flex-direction:column;align-items:center;
        justify-content:center;height:100%;padding:${H*0.04}px ${W*0.06}px;gap:${H*0.018}px;`;

      const addText = (text, size, color, weight='400') => {
        const el = document.createElement('div');
        el.style.cssText = `font-size:${size}px;color:${color};font-weight:${weight};
          text-align:center;line-height:1.4;`;
        el.textContent = text;
        s.appendChild(el);
        return el;
      };

      addText('Stroop Effect', H*0.038, '#8090d0', '700');

      // Bar chart
      const chartEl = document.createElement('div');
      chartEl.style.cssText = `display:flex;align-items:flex-end;gap:${W*0.08}px;
        height:${H*0.18}px;margin:${H*0.02}px 0;`;

      const maxRT = Math.max(avgCong, avgInc, 0.5);
      [['Matching', avgCong, '#30D060'], ['Conflicting', avgInc, '#FF4040']].forEach(([label, val, color]) => {
        const col = document.createElement('div');
        col.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:6px;`;
        const bar = document.createElement('div');
        const barH = val ? (val / maxRT) * H * 0.14 : 4;
        bar.style.cssText = `width:${W*0.18}px;height:${barH}px;background:${color};
          border-radius:6px 6px 0 0;opacity:0.85;align-self:flex-end;`;
        const ms = document.createElement('div');
        ms.style.cssText = `font-size:${H*0.028}px;color:${color};font-weight:700;`;
        ms.textContent = val ? `${(val*1000).toFixed(0)}ms` : '—';
        const lbl = document.createElement('div');
        lbl.style.cssText = `font-size:${H*0.018}px;color:rgba(160,180,220,0.55);`;
        lbl.textContent = label;
        col.appendChild(ms); col.appendChild(bar); col.appendChild(lbl);
        chartEl.appendChild(col);
      });
      s.appendChild(chartEl);

      if (costMs > 0) {
        addText(`Conflict cost: +${costMs} ms`, H*0.032, '#FFD020', '700');
        addText('Your brain must suppress reading to name ink colors.', H*0.02, 'rgba(160,180,220,0.65)');
        addText('Reading is automatic. Color-naming requires effort.', H*0.02, 'rgba(130,155,200,0.5)');
      } else {
        addText('Impressive! Nearly no conflict cost.', H*0.027, '#30D060', '700');
      }

      const restartBtn = document.createElement('button');
      restartBtn.textContent = 'Try again';
      restartBtn.style.cssText = `margin-top:${H*0.015}px;padding:${H*0.018}px ${W*0.12}px;
        background:rgba(60,80,180,0.3);border:1px solid rgba(100,130,220,0.35);
        border-radius:12px;color:#8090e0;font-size:${H*0.026}px;cursor:pointer;
        touch-action:manipulation;`;
      restartBtn.addEventListener('click', restart);
      restartBtn.addEventListener('touchstart', (e) => { e.preventDefault(); restart(); }, { passive: false });
      s.appendChild(restartBtn);

      wordArea.appendChild(s);
      playTone(440, 0.1, 0.5); setTimeout(() => playTone(550, 0.08, 0.4), 180);
    };

    const restart = () => {
      ensureAudio();
      trialIdx = 0; rtCong.length = 0; rtInc.length = 0;
      btnGrid.style.display = 'grid';
      wordArea.innerHTML = '';
      wordArea.appendChild(wordLabel); wordArea.appendChild(wordEl);
      wordArea.appendChild(trialCounter); wordArea.appendChild(feedbackEl);
      nextTrial();
    };

    // Intro screen
    wordEl.style.color = COLORS[2].hex;
    wordEl.textContent = 'RED';
    wordLabel.textContent = '↑ what color is that word?';
    feedbackEl.style.color = 'rgba(120,150,200,0.55)';
    feedbackEl.style.fontSize = `${H*0.022}px`;
    feedbackEl.textContent = 'tap any color button to start';
    trialCounter.textContent = `${TRIALS} trials`;
    buttons.forEach(b => b.addEventListener('click', () => { if (phase === 'intro') { ensureAudio(); nextTrial(); } }, { once: true }));

    phase = 'intro';
    setButtonsEnabled(true);
  },

  destroy() {},
};
