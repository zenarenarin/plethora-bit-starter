window.scrollerApp = {
  meta: {
    title: 'Sleep Cycle Calculator',
    author: 'plethora',
    description: 'Enter your wake time. Find the bedtimes that skip mid-sleep grogginess.',
    tags: ['education'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.style.background = '#06060f';

    const FALL_ASLEEP = 15;  // avg minutes to fall asleep
    const CYCLE_MIN   = 90;  // one sleep cycle in minutes

    // Wake time state (hour 24h, minute)
    let wakeH = 7, wakeM = 0;

    // Build DOM UI
    const root = document.createElement('div');
    root.style.cssText = `
      position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;padding-top:${H*0.06}px;font-family:-apple-system,system-ui,sans-serif;
      color:#e0e8ff;box-sizing:border-box;overflow:hidden;
    `;
    container.appendChild(root);

    // Title
    const title = document.createElement('div');
    title.style.cssText = `font-size:${H*0.032}px;font-weight:700;color:#a0b8ff;margin-bottom:${H*0.025}px;`;
    title.textContent = 'Sleep Cycle Calculator';
    root.appendChild(title);

    const sub = document.createElement('div');
    sub.style.cssText = `font-size:${H*0.019}px;color:rgba(120,150,210,0.65);margin-bottom:${H*0.04}px;text-align:center;`;
    sub.textContent = 'wake refreshed, not groggy';
    root.appendChild(sub);

    // Wake time picker
    const pickerLabel = document.createElement('div');
    pickerLabel.style.cssText = `font-size:${H*0.021}px;color:rgba(140,165,220,0.6);margin-bottom:${H*0.012}px;`;
    pickerLabel.textContent = 'I want to wake up at';
    root.appendChild(pickerLabel);

    const pickerRow = document.createElement('div');
    pickerRow.style.cssText = `display:flex;align-items:center;gap:${W*0.035}px;margin-bottom:${H*0.04}px;`;
    root.appendChild(pickerRow);

    const makeSpinner = (getValue, setValue, isHour) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:6px;`;

      const btnUp = document.createElement('button');
      btnUp.textContent = '▲';
      btnUp.style.cssText = `background:rgba(60,90,180,0.25);border:1px solid rgba(80,120,200,0.3);
        color:#8090e0;border-radius:8px;width:${W*0.1}px;height:${H*0.042}px;
        font-size:${H*0.02}px;cursor:pointer;touch-action:manipulation;`;

      const display = document.createElement('div');
      display.style.cssText = `font-size:${H*0.072}px;font-weight:700;color:#d0deff;
        font-variant-numeric:tabular-nums;min-width:${W*0.14}px;text-align:center;line-height:1;`;

      const btnDn = document.createElement('button');
      btnDn.textContent = '▼';
      btnDn.style.cssText = btnUp.style.cssText;

      const update = () => {
        const v = getValue();
        display.textContent = isHour
          ? `${v % 12 === 0 ? 12 : v % 12}`
          : String(v).padStart(2, '0');
        refreshBedtimes();
      };

      btnUp.addEventListener('click', () => {
        const max = isHour ? 23 : 59, step = isHour ? 1 : 15;
        setValue((getValue() + step) % (max + 1));
        update();
      });
      btnDn.addEventListener('click', () => {
        const max = isHour ? 23 : 59, step = isHour ? 1 : 15;
        setValue((getValue() - step + max + 1) % (max + 1));
        update();
      });

      wrap.appendChild(btnUp); wrap.appendChild(display); wrap.appendChild(btnDn);
      pickerRow.appendChild(wrap);
      update();
      return display;
    };

    makeSpinner(() => wakeH, v => { wakeH = v; }, true);

    const colon = document.createElement('div');
    colon.style.cssText = `font-size:${H*0.065}px;font-weight:700;color:#6070b0;margin-bottom:4px;`;
    colon.textContent = ':';
    pickerRow.appendChild(colon);

    makeSpinner(() => wakeM, v => { wakeM = v; }, false);

    const ampm = document.createElement('div');
    ampm.style.cssText = `font-size:${H*0.032}px;color:rgba(100,130,200,0.7);margin-left:4px;font-weight:600;align-self:center;`;
    pickerRow.appendChild(ampm);

    // Bedtime list
    const bedLabel = document.createElement('div');
    bedLabel.style.cssText = `font-size:${H*0.021}px;color:rgba(140,165,220,0.6);margin-bottom:${H*0.015}px;`;
    bedLabel.textContent = 'go to sleep at:';
    root.appendChild(bedLabel);

    const bedList = document.createElement('div');
    bedList.style.cssText = `display:flex;flex-direction:column;gap:${H*0.011}px;width:${W*0.82}px;`;
    root.appendChild(bedList);

    // Cycle legend
    const legend = document.createElement('div');
    legend.style.cssText = `margin-top:${H*0.03}px;font-size:${H*0.018}px;
      color:rgba(90,115,175,0.55);text-align:center;line-height:1.6;max-width:${W*0.82}px;`;
    legend.innerHTML = `Each sleep cycle ≈ 90 min · includes light, deep, and REM sleep<br>
      +${FALL_ASLEEP} min to fall asleep is already factored in`;
    root.appendChild(legend);

    const CYCLE_COLORS = ['#5eead4','#38bdf8','#818cf8','#c084fc','#f472b6'];

    const fmt12 = (h, m) => {
      const ap = h < 12 ? 'AM' : 'PM';
      const hh = h % 12 === 0 ? 12 : h % 12;
      return `${hh}:${String(m).padStart(2,'0')} ${ap}`;
    };

    const refreshBedtimes = () => {
      ampm.textContent = wakeH < 12 ? 'AM' : 'PM';
      const wakeTotal = wakeH * 60 + wakeM;
      bedList.innerHTML = '';

      for (let cycles = 6; cycles >= 2; cycles--) {
        const sleepMins = cycles * CYCLE_MIN + FALL_ASLEEP;
        let bedTotal = wakeTotal - sleepMins;
        while (bedTotal < 0) bedTotal += 1440;
        const bh = Math.floor(bedTotal / 60) % 24;
        const bm = bedTotal % 60;

        const row = document.createElement('div');
        row.style.cssText = `
          display:flex;align-items:center;justify-content:space-between;
          background:rgba(20,35,80,0.4);border:1px solid rgba(60,90,180,0.2);
          border-radius:10px;padding:${H*0.011}px ${W*0.04}px;
        `;

        const timeEl = document.createElement('div');
        timeEl.style.cssText = `font-size:${H*0.036}px;font-weight:700;color:${CYCLE_COLORS[6-cycles]};
          font-variant-numeric:tabular-nums;`;
        timeEl.textContent = fmt12(bh, bm);

        const infoEl = document.createElement('div');
        infoEl.style.cssText = `text-align:right;`;
        const cycleEl = document.createElement('div');
        cycleEl.style.cssText = `font-size:${H*0.021}px;color:rgba(180,200,255,0.75);font-weight:600;`;
        cycleEl.textContent = `${cycles} cycles`;
        const durEl = document.createElement('div');
        durEl.style.cssText = `font-size:${H*0.017}px;color:rgba(100,130,190,0.5);`;
        const hrs = Math.floor(cycles * 90 / 60);
        const mns = (cycles * 90) % 60;
        durEl.textContent = mns ? `${hrs}h ${mns}m` : `${hrs}h`;
        infoEl.appendChild(cycleEl); infoEl.appendChild(durEl);

        // Cycle dots
        const dots = document.createElement('div');
        dots.style.cssText = `display:flex;gap:3px;`;
        for (let d = 0; d < cycles; d++) {
          const dot = document.createElement('div');
          dot.style.cssText = `width:8px;height:8px;border-radius:50%;
            background:${CYCLE_COLORS[6-cycles]};opacity:0.6;`;
          dots.appendChild(dot);
        }

        row.appendChild(timeEl); row.appendChild(dots); row.appendChild(infoEl);
        bedList.appendChild(row);
      }
    };

    refreshBedtimes();
  },

  destroy() {},
};
