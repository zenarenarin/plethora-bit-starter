window.scrollerApp = {
  meta: {
    title: 'Calorie Density',
    author: 'plethora',
    description: 'How much broccoli = one handful of chips? Tap foods to compare by calorie.',
    tags: ['education'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    container.style.overflow = 'hidden';
    container.style.touchAction = 'none';
    container.style.background = '#06060f';

    // Calories per 100g
    const FOODS = [
      { name: 'Broccoli',     emoji: '🥦', kcal: 34,  color: '#4ade80' },
      { name: 'Strawberries', emoji: '🍓', kcal: 32,  color: '#f87171' },
      { name: 'Apple',        emoji: '🍎', kcal: 52,  color: '#fb923c' },
      { name: 'Chicken',      emoji: '🍗', kcal: 165, color: '#fbbf24' },
      { name: 'Rice',         emoji: '🍚', kcal: 130, color: '#e5e5e5' },
      { name: 'Almonds',      emoji: '🥜', kcal: 579, color: '#d97706' },
      { name: 'Chips',        emoji: '🍟', kcal: 536, color: '#f59e0b' },
      { name: 'Chocolate',    emoji: '🍫', kcal: 546, color: '#7c3aed' },
      { name: 'Avocado',      emoji: '🥑', kcal: 160, color: '#65a30d' },
      { name: 'Coca-Cola',    emoji: '🥤', kcal: 42,  color: '#dc2626' },
    ];

    const BASE_FOOD = FOODS.find(f => f.name === 'Chips'); // reference
    const BASE_G = 30; // a handful ~30g

    let selectedA = FOODS.find(f => f.name === 'Broccoli');
    let selectedB = FOODS.find(f => f.name === 'Chips');

    const root = document.createElement('div');
    root.style.cssText = `position:absolute;inset:0;display:flex;flex-direction:column;
      align-items:center;font-family:-apple-system,system-ui,sans-serif;color:#e0e8ff;
      overflow:hidden;padding:0 ${W*0.04}px;box-sizing:border-box;`;
    container.appendChild(root);

    // Title
    const title = document.createElement('div');
    title.style.cssText = `font-size:${H*0.028}px;font-weight:700;color:#a0b8ff;
      margin-top:${H*0.05}px;margin-bottom:${H*0.008}px;`;
    title.textContent = 'Calorie Density Comparison';
    root.appendChild(title);

    const sub = document.createElement('div');
    sub.style.cssText = `font-size:${H*0.018}px;color:rgba(120,150,210,0.55);
      margin-bottom:${H*0.025}px;text-align:center;`;
    sub.textContent = `same calories, very different amounts`;
    root.appendChild(sub);

    // Comparison display
    const compRow = document.createElement('div');
    compRow.style.cssText = `display:flex;align-items:center;justify-content:space-around;
      width:100%;margin-bottom:${H*0.022}px;`;
    root.appendChild(compRow);

    const makeCompCol = () => {
      const col = document.createElement('div');
      col.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;`;
      const emoji = document.createElement('div');
      emoji.style.cssText = `font-size:${H*0.075}px;line-height:1;`;
      const grams = document.createElement('div');
      grams.style.cssText = `font-size:${H*0.042}px;font-weight:800;`;
      const name  = document.createElement('div');
      name.style.cssText = `font-size:${H*0.019}px;color:rgba(150,175,225,0.65);`;
      const kcalEl = document.createElement('div');
      kcalEl.style.cssText = `font-size:${H*0.016}px;color:rgba(100,130,190,0.5);`;
      col.appendChild(emoji); col.appendChild(grams); col.appendChild(name); col.appendChild(kcalEl);
      return { col, emoji, grams, name, kcalEl };
    };

    const colA = makeCompCol(), colB = makeCompCol();
    compRow.appendChild(colA.col);

    const equalSign = document.createElement('div');
    equalSign.style.cssText = `font-size:${H*0.045}px;color:rgba(120,150,210,0.5);font-weight:300;flex:0 0 auto;`;
    equalSign.textContent = '=';
    compRow.appendChild(equalSign);
    compRow.appendChild(colB.col);

    // Bar comparison
    const barSection = document.createElement('div');
    barSection.style.cssText = `width:100%;margin-bottom:${H*0.018}px;`;
    root.appendChild(barSection);

    const makeBar = (color) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = `width:100%;height:${H*0.032}px;background:rgba(20,35,80,0.35);
        border-radius:6px;overflow:hidden;margin-bottom:4px;`;
      const fill = document.createElement('div');
      fill.style.cssText = `height:100%;background:${color};border-radius:6px;transition:width 0.4s ease;`;
      wrap.appendChild(fill);
      barSection.appendChild(wrap);
      return fill;
    };

    const barA = makeBar('#4ade80');
    const barB = makeBar('#f59e0b');

    const insightEl = document.createElement('div');
    insightEl.style.cssText = `font-size:${H*0.022}px;color:rgba(200,220,255,0.75);
      text-align:center;min-height:${H*0.05}px;margin-bottom:${H*0.018}px;font-weight:600;`;
    root.appendChild(insightEl);

    // Food grid
    const gridLabel = document.createElement('div');
    gridLabel.style.cssText = `font-size:${H*0.018}px;color:rgba(110,140,200,0.5);
      margin-bottom:${H*0.01}px;align-self:flex-start;`;
    gridLabel.textContent = 'tap to swap comparison:';
    root.appendChild(gridLabel);

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(5,1fr);
      gap:${W*0.018}px;width:100%;`;
    root.appendChild(grid);

    let swapSide = 'A';  // next tap swaps food A or B

    const updateDisplay = () => {
      const targetKcal = selectedB.kcal * BASE_G / 100;
      const gOfA = targetKcal / selectedA.kcal * 100;

      colA.emoji.textContent = selectedA.emoji;
      colA.grams.style.color = selectedA.color;
      colA.grams.textContent = gOfA >= 1000
        ? `${(gOfA/1000).toFixed(1)}kg`
        : `${Math.round(gOfA)}g`;
      colA.name.textContent  = selectedA.name;
      colA.kcalEl.textContent = `${selectedA.kcal} kcal/100g`;

      colB.emoji.textContent = selectedB.emoji;
      colB.grams.style.color = selectedB.color;
      colB.grams.textContent = `${BASE_G}g`;
      colB.name.textContent  = selectedB.name;
      colB.kcalEl.textContent = `${selectedB.kcal} kcal/100g`;

      const maxG = Math.max(gOfA, BASE_G, 1);
      barA.style.width = `${Math.min(100, (gOfA / maxG) * 100)}%`;
      barA.style.background = selectedA.color;
      barB.style.width = `${Math.min(100, (BASE_G / maxG) * 100)}%`;
      barB.style.background = selectedB.color;

      const ratio = (gOfA / BASE_G).toFixed(1);
      if (gOfA > BASE_G * 1.5) {
        insightEl.textContent = `${ratio}× more ${selectedA.name} for same calories`;
      } else if (gOfA < BASE_G * 0.7) {
        const r = (BASE_G / gOfA).toFixed(1);
        insightEl.textContent = `${selectedB.name} is ${r}× more calorie-dense`;
      } else {
        insightEl.textContent = 'similar calorie density!';
      }

      // Highlight selected in grid
      grid.querySelectorAll('.food-btn').forEach(btn => {
        const name = btn.dataset.name;
        const isA = name === selectedA.name, isB = name === selectedB.name;
        btn.style.border = isA ? `2px solid ${selectedA.color}` : isB ? `2px solid ${selectedB.color}` : '2px solid rgba(40,65,140,0.25)';
        btn.style.background = isA || isB ? 'rgba(40,65,140,0.4)' : 'rgba(15,25,60,0.5)';
      });
    };

    FOODS.forEach(food => {
      const btn = document.createElement('button');
      btn.className = 'food-btn';
      btn.dataset.name = food.name;
      btn.style.cssText = `background:rgba(15,25,60,0.5);border:2px solid rgba(40,65,140,0.25);
        border-radius:10px;padding:${H*0.008}px ${W*0.005}px;cursor:pointer;
        display:flex;flex-direction:column;align-items:center;gap:2px;touch-action:manipulation;`;
      const emojiEl = document.createElement('div');
      emojiEl.style.cssText = `font-size:${H*0.032}px;line-height:1;`;
      emojiEl.textContent = food.emoji;
      const nameEl = document.createElement('div');
      nameEl.style.cssText = `font-size:${H*0.014}px;color:rgba(150,175,225,0.65);`;
      nameEl.textContent = food.name;
      btn.appendChild(emojiEl); btn.appendChild(nameEl);

      const pick = () => {
        if (swapSide === 'A') { selectedA = food; swapSide = 'B'; }
        else                   { selectedB = food; swapSide = 'A'; }
        updateDisplay();
      };
      btn.addEventListener('click', pick);
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); pick(); }, { passive: false });
      grid.appendChild(btn);
    });

    const hint = document.createElement('div');
    hint.style.cssText = `font-size:${H*0.016}px;color:rgba(80,110,170,0.45);
      margin-top:${H*0.012}px;text-align:center;`;
    hint.textContent = 'alternates A ↔ B on each tap';
    root.appendChild(hint);

    updateDisplay();
  },

  destroy() {},
};
