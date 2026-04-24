window.scrollerApp = {
  meta: {
    title: 'The Seed',
    author: 'plethora',
    description: 'Tap to grow a tree from a single seed.',
    tags: ['stories'],
  },

  _svg: null,
  _timelines: [],
  _loops: [],
  _stage: 0,
  _tapHandler: null,
  _hint: null,
  _fireflies: [],

  init(container) {
    this._stage = 0;
    this._timelines = [];
    this._loops = [];
    this._fireflies = [];

    const W = container.clientWidth;
    const H = container.clientHeight;
    const cx = W / 2;
    const ground = H * 0.72;

    // SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';
    container.appendChild(svg);
    this._svg = svg;

    // Sky gradient
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <radialGradient id="seed-sky" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#1a0f2e"/>
        <stop offset="100%" stop-color="#0a0a0a"/>
      </radialGradient>
      <radialGradient id="seed-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#4a7c3f" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#4a7c3f" stop-opacity="0"/>
      </radialGradient>
      <filter id="seed-blur">
        <feGaussianBlur stdDeviation="3"/>
      </filter>
      <filter id="seed-glow-filter">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    svg.appendChild(defs);

    // Background rect
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', 'url(#seed-sky)');
    svg.appendChild(bg);

    // Stars
    for (let i = 0; i < 60; i++) {
      const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      star.setAttribute('cx', Math.random() * W);
      star.setAttribute('cy', Math.random() * ground * 0.8);
      const r = Math.random() * 1.2 + 0.3;
      star.setAttribute('r', r);
      star.setAttribute('fill', '#fff');
      star.setAttribute('opacity', (Math.random() * 0.5 + 0.2).toFixed(2));
      svg.appendChild(star);
    }

    // Ground
    const groundPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    groundPath.setAttribute('d', `M0,${ground} Q${W*0.25},${ground-8} ${W*0.5},${ground} Q${W*0.75},${ground+8} ${W},${ground} L${W},${H} L0,${H} Z`);
    groundPath.setAttribute('fill', '#2d1a0e');
    svg.appendChild(groundPath);

    const groundHighlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    groundHighlight.setAttribute('d', `M0,${ground} Q${W*0.25},${ground-8} ${W*0.5},${ground} Q${W*0.75},${ground+8} ${W},${ground}`);
    groundHighlight.setAttribute('stroke', '#4a2e14');
    groundHighlight.setAttribute('stroke-width', '2');
    groundHighlight.setAttribute('fill', 'none');
    svg.appendChild(groundHighlight);

    // Layer groups (hidden initially)
    const groups = {};
    ['seed', 'sprout', 'sapling', 'youngtree', 'canopy', 'fireflies'].forEach(name => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.id = `seed-group-${name}`;
      g.style.opacity = '0';
      svg.appendChild(g);
      groups[name] = g;
    });
    this._groups = groups;

    // --- Stage 0: Seed ---
    const seedG = groups.seed;
    // Soil mound
    const mound = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    mound.setAttribute('cx', cx);
    mound.setAttribute('cy', ground + 4);
    mound.setAttribute('rx', 28);
    mound.setAttribute('ry', 8);
    mound.setAttribute('fill', '#3d2010');
    seedG.appendChild(mound);
    // Seed oval
    const seedShape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    seedShape.id = 'seed-oval';
    seedShape.setAttribute('cx', cx);
    seedShape.setAttribute('cy', ground - 2);
    seedShape.setAttribute('rx', 8);
    seedShape.setAttribute('ry', 11);
    seedShape.setAttribute('fill', '#6b3d1e');
    seedShape.setAttribute('stroke', '#8b5e3c');
    seedShape.setAttribute('stroke-width', '1.5');
    seedG.appendChild(seedShape);
    // Seed line detail
    const seedLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    seedLine.setAttribute('x1', cx);
    seedLine.setAttribute('y1', ground - 11);
    seedLine.setAttribute('x2', cx);
    seedLine.setAttribute('y2', ground + 5);
    seedLine.setAttribute('stroke', '#8b5e3c');
    seedLine.setAttribute('stroke-width', '0.8');
    seedG.appendChild(seedLine);

    // --- Stage 1: Sprout ---
    const sproutG = groups.sprout;
    // Stem
    const stem1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    stem1.id = 'seed-stem1';
    stem1.setAttribute('d', `M${cx},${ground} C${cx},${ground-20} ${cx},${ground-45} ${cx},${ground-55}`);
    stem1.setAttribute('stroke', '#4a7c3f');
    stem1.setAttribute('stroke-width', '4');
    stem1.setAttribute('fill', 'none');
    stem1.setAttribute('stroke-linecap', 'round');
    const stemLen1 = 58;
    stem1.style.strokeDasharray = stemLen1;
    stem1.style.strokeDashoffset = stemLen1;
    sproutG.appendChild(stem1);
    // Left leaf
    const leaf1L = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaf1L.setAttribute('d', `M${cx},${ground-40} C${cx-22},${ground-55} ${cx-28},${ground-38} ${cx},${ground-35}`);
    leaf1L.setAttribute('fill', '#3d6e34');
    leaf1L.setAttribute('opacity', '0');
    leaf1L.style.transformOrigin = `${cx}px ${ground-40}px`;
    leaf1L.style.transform = 'scale(0)';
    sproutG.appendChild(leaf1L);
    // Right leaf
    const leaf1R = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaf1R.setAttribute('d', `M${cx},${ground-40} C${cx+22},${ground-55} ${cx+28},${ground-38} ${cx},${ground-35}`);
    leaf1R.setAttribute('fill', '#4a8040');
    leaf1R.setAttribute('opacity', '0');
    leaf1R.style.transformOrigin = `${cx}px ${ground-40}px`;
    leaf1R.style.transform = 'scale(0)';
    sproutG.appendChild(leaf1R);

    // --- Stage 2: Sapling ---
    const saplingG = groups.sapling;
    const stemTop2 = ground - 120;
    const stem2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    stem2.id = 'seed-stem2';
    stem2.setAttribute('d', `M${cx},${ground-55} C${cx-4},${ground-80} ${cx+3},${ground-100} ${cx},${stemTop2}`);
    stem2.setAttribute('stroke', '#5a6e3a');
    stem2.setAttribute('stroke-width', '5');
    stem2.setAttribute('fill', 'none');
    stem2.setAttribute('stroke-linecap', 'round');
    const stemLen2 = 70;
    stem2.style.strokeDasharray = stemLen2;
    stem2.style.strokeDashoffset = stemLen2;
    saplingG.appendChild(stem2);
    // Sapling leaves cluster
    const sapLeaves = [
      { dx: -30, dy: -20, rx: 18, ry: 12, rot: -20, fill: '#3d6e34' },
      { dx: 30, dy: -15, rx: 20, ry: 13, rot: 15, fill: '#4a8040' },
      { dx: -18, dy: -38, rx: 16, ry: 10, rot: -10, fill: '#5a9048' },
      { dx: 18, dy: -42, rx: 14, ry: 9, rot: 10, fill: '#3d6e34' },
      { dx: 0, dy: -50, rx: 18, ry: 12, rot: 0, fill: '#4a8040' },
    ];
    sapLeaves.forEach(l => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      el.setAttribute('cx', cx + l.dx);
      el.setAttribute('cy', stemTop2 + l.dy);
      el.setAttribute('rx', l.rx);
      el.setAttribute('ry', l.ry);
      el.setAttribute('fill', l.fill);
      el.setAttribute('opacity', '0');
      el.setAttribute('transform', `rotate(${l.rot},${cx+l.dx},${stemTop2+l.dy})`);
      el.style.transformOrigin = `${cx+l.dx}px ${stemTop2+l.dy}px`;
      el.style.transform = 'scale(0)';
      saplingG.appendChild(el);
    });
    this._sapLeafEls = saplingG.querySelectorAll ? Array.from(saplingG.children).slice(1) : [];

    // --- Stage 3: Young tree ---
    const treeG = groups.youngtree;
    const trunkTop = ground - 200;
    // Trunk (thicker)
    const trunk = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trunk.setAttribute('d', `M${cx-3},${ground-115} C${cx-5},${ground-150} ${cx+4},${ground-180} ${cx},${trunkTop}`);
    trunk.setAttribute('stroke', '#5c3d1e');
    trunk.setAttribute('stroke-width', '9');
    trunk.setAttribute('fill', 'none');
    trunk.setAttribute('stroke-linecap', 'round');
    const trunkLen = 100;
    trunk.style.strokeDasharray = trunkLen;
    trunk.style.strokeDashoffset = trunkLen;
    treeG.appendChild(trunk);
    // Branches
    const branches = [
      { d: `M${cx},${trunkTop+30} C${cx-35},${trunkTop+10} ${cx-60},${trunkTop-10} ${cx-70},${trunkTop-25}`, len: 80 },
      { d: `M${cx},${trunkTop+30} C${cx+35},${trunkTop+10} ${cx+60},${trunkTop-10} ${cx+70},${trunkTop-25}`, len: 80 },
      { d: `M${cx},${trunkTop+10} C${cx-20},${trunkTop-10} ${cx-40},${trunkTop-30} ${cx-45},${trunkTop-50}`, len: 65 },
      { d: `M${cx},${trunkTop+10} C${cx+20},${trunkTop-10} ${cx+40},${trunkTop-30} ${cx+45},${trunkTop-50}`, len: 65 },
    ];
    const branchEls = [];
    branches.forEach(b => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('d', b.d);
      el.setAttribute('stroke', '#5c3d1e');
      el.setAttribute('stroke-width', '5');
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke-linecap', 'round');
      el.style.strokeDasharray = b.len;
      el.style.strokeDashoffset = b.len;
      treeG.appendChild(el);
      branchEls.push(el);
    });
    this._branchEls = branchEls;
    // Leaf clusters on branches
    const youngLeaves = [
      { cx: cx-68, cy: trunkTop-30, r: 28, fill: '#3d6e34' },
      { cx: cx+68, cy: trunkTop-30, r: 28, fill: '#4a8040' },
      { cx: cx-44, cy: trunkTop-58, r: 22, fill: '#5a9048' },
      { cx: cx+44, cy: trunkTop-58, r: 22, fill: '#3d7838' },
      { cx: cx, cy: trunkTop-15, r: 24, fill: '#4a8040' },
    ];
    const youngLeafEls = [];
    youngLeaves.forEach(l => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('cx', l.cx);
      el.setAttribute('cy', l.cy);
      el.setAttribute('r', l.r);
      el.setAttribute('fill', l.fill);
      el.setAttribute('opacity', '0');
      el.style.transformOrigin = `${l.cx}px ${l.cy}px`;
      el.style.transform = 'scale(0)';
      treeG.appendChild(el);
      youngLeafEls.push(el);
    });
    this._youngLeafEls = youngLeafEls;

    // --- Stage 4: Full canopy + fireflies ---
    const canopyG = groups.canopy;
    const ffG = groups.fireflies;
    // Extra big canopy clusters
    const canopyClusters = [
      { cx: cx, cy: trunkTop-80, r: 55, fill: '#2d5e28', opacity: 0.9 },
      { cx: cx-80, cy: trunkTop-40, r: 40, fill: '#3d6e34', opacity: 0.85 },
      { cx: cx+80, cy: trunkTop-40, r: 40, fill: '#4a7c3f', opacity: 0.85 },
      { cx: cx-50, cy: trunkTop-100, r: 38, fill: '#4a8040', opacity: 0.9 },
      { cx: cx+50, cy: trunkTop-100, r: 38, fill: '#3d7838', opacity: 0.9 },
      { cx: cx-20, cy: trunkTop-140, r: 32, fill: '#5a9048', opacity: 0.85 },
      { cx: cx+20, cy: trunkTop-140, r: 30, fill: '#4a8040', opacity: 0.85 },
      { cx: cx, cy: trunkTop-170, r: 28, fill: '#6aa050', opacity: 0.8 },
    ];
    const canopyEls = [];
    canopyClusters.forEach(c => {
      // Glow underneath
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      glow.setAttribute('cx', c.cx);
      glow.setAttribute('cy', c.cy);
      glow.setAttribute('r', c.r + 10);
      glow.setAttribute('fill', c.fill);
      glow.setAttribute('opacity', '0');
      glow.setAttribute('filter', 'url(#seed-blur)');
      canopyG.appendChild(glow);
      canopyEls.push(glow);

      const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      el.setAttribute('cx', c.cx);
      el.setAttribute('cy', c.cy);
      el.setAttribute('r', c.r);
      el.setAttribute('fill', c.fill);
      el.setAttribute('opacity', '0');
      el.style.transformOrigin = `${c.cx}px ${c.cy}px`;
      el.style.transform = 'scale(0)';
      canopyG.appendChild(el);
      canopyEls.push(el);
    });
    this._canopyEls = canopyEls;

    // Fireflies
    const ffData = [];
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 120;
      const ffCx = cx + Math.cos(angle) * dist;
      const ffCy = (trunkTop - 60) + Math.sin(angle) * dist * 0.6;
      const ff = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ff.setAttribute('cx', ffCx);
      ff.setAttribute('cy', ffCy);
      ff.setAttribute('r', 2.5);
      ff.setAttribute('fill', '#d4f080');
      ff.setAttribute('opacity', '0');
      ff.setAttribute('filter', 'url(#seed-glow-filter)');
      ffG.appendChild(ff);
      ffData.push({ el: ff, cx: ffCx, cy: ffCy });
    }
    this._ffData = ffData;

    // Hint text
    const hint = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    hint.setAttribute('x', cx);
    hint.setAttribute('y', H * 0.88);
    hint.setAttribute('text-anchor', 'middle');
    hint.setAttribute('fill', '#a08060');
    hint.setAttribute('font-size', '16');
    hint.setAttribute('font-family', 'Georgia, serif');
    hint.setAttribute('letter-spacing', '2');
    hint.textContent = 'tap to grow';
    hint.style.opacity = '0';
    svg.appendChild(hint);
    this._hint = hint;

    // Stage counter dots
    const dotsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    dotsG.id = 'seed-dots';
    const dotCount = 5;
    const dotSpacing = 14;
    const dotsX = cx - (dotCount - 1) * dotSpacing / 2;
    this._dotEls = [];
    for (let i = 0; i < dotCount; i++) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', dotsX + i * dotSpacing);
      dot.setAttribute('cy', H * 0.93);
      dot.setAttribute('r', 3);
      dot.setAttribute('fill', i === 0 ? '#a08060' : '#3d2a18');
      dot.style.opacity = '0.7';
      dotsG.appendChild(dot);
      this._dotEls.push(dot);
    }
    svg.appendChild(dotsG);

    const self = this;

    function loadAnime(cb) {
      if (window.anime) return cb();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
      s.onload = cb;
      document.head.appendChild(s);
    }

    loadAnime(() => {
      // Show seed stage
      self._groups.seed.style.opacity = '1';
      // Pulse seed
      const seedPulse = anime({
        targets: '#seed-oval',
        scaleX: [1, 1.08, 1],
        scaleY: [1, 1.08, 1],
        duration: 1800,
        loop: true,
        easing: 'easeInOutSine',
        transformOrigin: ['50% 50%'],
      });
      self._loops.push(seedPulse);

      // Fade in hint
      const hintTl = anime({
        targets: self._hint,
        opacity: [0, 0.85],
        translateY: [8, 0],
        duration: 1200,
        delay: 600,
        easing: 'easeOutQuad',
      });
      self._timelines.push(hintTl);

      // Fade in dots
      anime({
        targets: self._dotEls,
        opacity: [0, 0.7],
        duration: 800,
        delay: anime.stagger(100, { start: 800 }),
        easing: 'easeOutQuad',
      });

      // Tap handler
      self._tapHandler = () => self._advance();
      container.addEventListener('pointerdown', self._tapHandler);
    });
  },

  _advance() {
    if (this._stage >= 4) return;
    this._stage++;
    this._updateDots();

    // Fade hint on first tap
    if (this._stage === 1) {
      anime({ targets: this._hint, opacity: 0, duration: 600, easing: 'easeOutQuad' });
    }

    if (this._stage === 1) this._growSprout();
    else if (this._stage === 2) this._growSapling();
    else if (this._stage === 3) this._growYoungTree();
    else if (this._stage === 4) this._growFullCanopy();
  },

  _updateDots() {
    if (!this._dotEls) return;
    this._dotEls.forEach((d, i) => {
      d.setAttribute('fill', i < this._stage ? '#7ab860' : i === this._stage ? '#a08060' : '#3d2a18');
    });
  },

  _growSprout() {
    const g = this._groups.sprout;
    g.style.opacity = '1';
    const stem = g.querySelector('#seed-stem1');
    const leaves = Array.from(g.children).filter(el => el !== stem);

    const tl = anime.timeline({ easing: 'easeOutQuart' });
    tl.add({
      targets: stem,
      strokeDashoffset: [58, 0],
      duration: 700,
    }).add({
      targets: leaves,
      opacity: [0, 1],
      scale: [0, 1],
      duration: 500,
      delay: anime.stagger(120),
    }, '-=100');
    this._timelines.push(tl);
  },

  _growSapling() {
    const g = this._groups.sapling;
    g.style.opacity = '1';
    const stem = g.querySelector('#seed-stem2');
    const leaves = Array.from(g.children).slice(1);

    const tl = anime.timeline({ easing: 'easeOutQuart' });
    tl.add({
      targets: stem,
      strokeDashoffset: [70, 0],
      duration: 700,
    }).add({
      targets: leaves,
      opacity: [0, 1],
      scale: [0, 1],
      duration: 450,
      delay: anime.stagger(80),
    }, '-=200');
    this._timelines.push(tl);
  },

  _growYoungTree() {
    const g = this._groups.youngtree;
    g.style.opacity = '1';
    const trunk = g.children[0];
    const branches = this._branchEls;
    const youngLeaves = this._youngLeafEls;

    const tl = anime.timeline({ easing: 'easeOutQuart' });
    tl.add({
      targets: trunk,
      strokeDashoffset: [100, 0],
      duration: 600,
    }).add({
      targets: branches,
      strokeDashoffset: (el) => [parseInt(el.style.strokeDasharray), 0],
      duration: 500,
      delay: anime.stagger(80),
    }, '-=100').add({
      targets: youngLeaves,
      opacity: [0, 1],
      scale: [0, 1],
      duration: 500,
      delay: anime.stagger(60),
    }, '-=200');
    this._timelines.push(tl);
  },

  _growFullCanopy() {
    const canopyG = this._groups.canopy;
    canopyG.style.opacity = '1';
    const ffG = this._groups.fireflies;
    ffG.style.opacity = '1';

    const canopyEls = this._canopyEls;
    const tl = anime.timeline({ easing: 'easeOutBack' });
    tl.add({
      targets: canopyEls,
      opacity: [0, (el) => parseFloat(el.getAttribute('opacity')) || 0.85],
      scale: [0, 1],
      duration: 600,
      delay: anime.stagger(50),
    });
    this._timelines.push(tl);

    // Firefly loops
    this._ffData.forEach((ff, i) => {
      const driftX = (Math.random() - 0.5) * 80;
      const driftY = (Math.random() - 0.5) * 50;
      const anim = anime({
        targets: ff.el,
        translateX: [0, driftX, 0],
        translateY: [0, driftY, 0],
        opacity: [0, 0.9, 0.2, 0.8, 0],
        duration: 2500 + Math.random() * 2000,
        delay: i * 220 + Math.random() * 300,
        loop: true,
        direction: 'alternate',
        easing: 'easeInOutSine',
      });
      this._loops.push(anim);
    });

    // Gentle canopy sway
    const sway = anime({
      targets: [canopyG],
      translateX: [0, 4, -3, 0],
      duration: 4000,
      loop: true,
      direction: 'alternate',
      easing: 'easeInOutSine',
    });
    this._loops.push(sway);
  },

  destroy() {
    // Pause all timelines
    this._timelines.forEach(tl => { if (tl && tl.pause) tl.pause(); });
    this._timelines = [];
    // Pause all loops
    this._loops.forEach(a => { if (a && a.pause) a.pause(); });
    this._loops = [];

    // Remove anime targets
    if (window.anime) {
      if (this._svg) anime.remove(this._svg.querySelectorAll('*'));
    }

    // Remove event listener
    if (this._tapHandler && this._svg) {
      // container is svg's parent
      const container = this._svg.parentElement;
      if (container) container.removeEventListener('pointerdown', this._tapHandler);
    }
    this._tapHandler = null;

    // Remove SVG
    if (this._svg && this._svg.parentElement) {
      this._svg.parentElement.removeChild(this._svg);
    }
    this._svg = null;
    this._hint = null;
    this._groups = null;
    this._dotEls = null;
    this._ffData = [];
    this._branchEls = [];
    this._youngLeafEls = [];
    this._canopyEls = [];
    this._stage = 0;
  },
};
