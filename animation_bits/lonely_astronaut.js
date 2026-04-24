// Lonely Astronaut — a silent drifter in the deep.
window.scrollerApp = {
  meta: {
    title: 'Lonely Astronaut',
    author: 'plethora',
    description: 'A silent drifter in the deep.',
    tags: ['stories'],
  },

  _anims: [],
  _listeners: [],
  _svg: null,
  _planetTimer: null,
  _waving: false,

  init(container) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    // ── SVG root ──────────────────────────────────────────────────────────────
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.cssText = 'position:absolute;top:0;left:0;overflow:visible;';
    container.style.background = '#060812';
    container.appendChild(svg);
    this._svg = svg;

    // ── helpers ───────────────────────────────────────────────────────────────
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (parent) parent.appendChild(e);
      return e;
    };

    // ── stars ─────────────────────────────────────────────────────────────────
    const starData = [];
    for (let i = 0; i < 160; i++) {
      const r = Math.random() * 1.6 + 0.3;
      const cx = Math.random() * W;
      const cy = Math.random() * H;
      const opacity = Math.random() * 0.6 + 0.2;
      const star = el('circle', { cx, cy, r, fill: '#fff', opacity }, svg);
      starData.push({ star, opacity });
    }

    // twinkle: random subset
    starData.forEach(({ star, opacity }) => {
      if (Math.random() < 0.4) {
        const a = window.anime({
          targets: star,
          opacity: [opacity, opacity * 0.15, opacity],
          duration: 2500 + Math.random() * 4000,
          easing: 'easeInOutSine',
          loop: true,
          delay: Math.random() * 4000,
        });
        this._anims.push(a);
      }
    });

    // ── defs: gradients & clip ────────────────────────────────────────────────
    const defs = el('defs', {}, svg);

    // helmet visor gradient
    const vGrad = el('radialGradient', { id: 'visorGrad', cx: '40%', cy: '35%', r: '60%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#7ec8e3', 'stop-opacity': '0.9' }, vGrad);
    el('stop', { offset: '100%', 'stop-color': '#0a1628', 'stop-opacity': '0.95' }, vGrad);

    // suit gradient
    const sGrad = el('linearGradient', { id: 'suitGrad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#e8eaf0' }, sGrad);
    el('stop', { offset: '100%', 'stop-color': '#b0b4c8' }, sGrad);

    // planet gradients
    const pColors = [
      ['#8e44ad', '#4a235a'],   // purple
      ['#e67e22', '#784212'],   // orange
      ['#2980b9', '#1a4a6e'],   // blue
      ['#27ae60', '#145a32'],   // green
    ];
    pColors.forEach(([c1, c2], i) => {
      const pg = el('radialGradient', { id: `pGrad${i}`, cx: '35%', cy: '30%', r: '65%' }, defs);
      el('stop', { offset: '0%', 'stop-color': c1 }, pg);
      el('stop', { offset: '100%', 'stop-color': c2 }, pg);
    });

    // ── astronaut group ───────────────────────────────────────────────────────
    // We place astronaut centered; translate via group
    const astroGroup = el('g', { id: 'astroGroup' }, svg);
    // start off right edge
    const startX = W + 80;
    const midY = H * 0.5;
    astroGroup.setAttribute('transform', `translate(${startX}, ${midY})`);

    // body (torso)
    el('path', {
      d: 'M -18 10 Q -22 30 -18 55 L 18 55 Q 22 30 18 10 Z',
      fill: 'url(#suitGrad)',
      stroke: '#9aa0b8', 'stroke-width': '1.5',
    }, astroGroup);

    // backpack (life support)
    el('rect', {
      x: '13', y: '15', width: '12', height: '22', rx: '3',
      fill: '#c8cad8', stroke: '#9aa0b8', 'stroke-width': '1',
    }, astroGroup);

    // legs
    el('path', { d: 'M -12 54 L -14 82 L -6 82 L -4 54 Z', fill: 'url(#suitGrad)', stroke: '#9aa0b8', 'stroke-width': '1' }, astroGroup);
    el('path', { d: 'M 4 54 L 6 82 L 14 82 L 12 54 Z', fill: 'url(#suitGrad)', stroke: '#9aa0b8', 'stroke-width': '1' }, astroGroup);

    // boots
    el('ellipse', { cx: '-10', cy: '83', rx: '8', ry: '4', fill: '#7a7e92' }, astroGroup);
    el('ellipse', { cx: '10', cy: '83', rx: '8', ry: '4', fill: '#7a7e92' }, astroGroup);

    // LEFT arm (resting, pointing slightly down-left)
    const leftArm = el('g', { id: 'leftArm' }, astroGroup);
    el('path', {
      d: 'M -18 18 Q -32 28 -30 42',
      fill: 'none', stroke: 'url(#suitGrad)', 'stroke-width': '10', 'stroke-linecap': 'round',
    }, leftArm);
    // left glove
    el('circle', { cx: '-30', cy: '43', r: '6', fill: '#c8cad8' }, leftArm);

    // RIGHT arm — this is the wave arm, grouped with transform origin at shoulder
    const rightArmGroup = el('g', { id: 'rightArmGroup' }, astroGroup);
    rightArmGroup.setAttribute('transform', 'rotate(0, -18, 18)'); // shoulder pivot ~(-18,18) but we use translate trick
    const rightArm = el('g', {}, rightArmGroup);
    el('path', {
      d: 'M 18 18 Q 32 28 30 42',
      fill: 'none', stroke: 'url(#suitGrad)', 'stroke-width': '10', 'stroke-linecap': 'round',
    }, rightArm);
    el('circle', { cx: '30', cy: '43', r: '6', fill: '#c8cad8' }, rightArm);
    this._rightArmGroup = rightArmGroup;

    // helmet ring/collar
    el('ellipse', { cx: '0', cy: '8', rx: '16', ry: '6', fill: '#9aa0b8' }, astroGroup);

    // helmet sphere
    el('circle', { cx: '0', cy: '-12', r: '22', fill: '#d4d8e8', stroke: '#9aa0b8', 'stroke-width': '2' }, astroGroup);

    // visor
    el('ellipse', { cx: '0', cy: '-12', rx: '15', ry: '14', fill: 'url(#visorGrad)' }, astroGroup);

    // visor highlight
    el('ellipse', { cx: '-5', cy: '-18', rx: '5', ry: '4', fill: '#fff', opacity: '0.25' }, astroGroup);

    // chest light
    el('circle', { cx: '-6', cy: '25', r: '3', fill: '#4af', opacity: '0.8' }, astroGroup);
    el('circle', { cx: '2', cy: '32', r: '2', fill: '#fa4', opacity: '0.7' }, astroGroup);

    this._astroGroup = astroGroup;
    this._startX = startX;
    this._W = W;
    this._H = H;
    this._midY = midY;
    this._svg = svg;
    this._defs = defs;
    this._el = el;
    this._pColors = pColors;

    // ── load anime.js then kick off animations ────────────────────────────────
    const self = this;
    function loadAnime(cb) {
      if (window.anime) return cb();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
      s.onload = cb;
      document.head.appendChild(s);
      self._scriptTag = s;
    }

    loadAnime(() => {
      self._startAnimations(svg, astroGroup, rightArmGroup, W, H, midY, el, pColors);
    });

    // ── tap handler ───────────────────────────────────────────────────────────
    const onTap = (e) => {
      e.preventDefault();
      if (!self._waving && window.anime) self._doWave();
    };
    container.addEventListener('pointerdown', onTap);
    this._listeners.push({ target: container, type: 'pointerdown', fn: onTap });
    this._container = container;
  },

  _startAnimations(svg, astroGroup, rightArmGroup, W, H, midY, el, pColors) {
    // ── astronaut drift: right → left, slow sinusoidal ────────────────────────
    const amplitude = H * 0.14;
    const driftDur = 26000;

    // Use anime keyframes for sinusoidal path
    const driftAnim = window.anime({
      targets: astroGroup,
      translateX: [W + 80, -180],
      translateY: [
        { value: midY - amplitude, duration: driftDur * 0.25, easing: 'easeInOutSine' },
        { value: midY + amplitude, duration: driftDur * 0.25, easing: 'easeInOutSine' },
        { value: midY - amplitude * 0.5, duration: driftDur * 0.25, easing: 'easeInOutSine' },
        { value: midY, duration: driftDur * 0.25, easing: 'easeInOutSine' },
      ],
      duration: driftDur,
      easing: 'linear',
      loop: true,
    });
    this._anims.push(driftAnim);

    // ── astronaut slow tumble ─────────────────────────────────────────────────
    const tumbleAnim = window.anime({
      targets: astroGroup,
      rotate: ['-15deg', '15deg'],
      duration: 8000,
      easing: 'easeInOutSine',
      direction: 'alternate',
      loop: true,
    });
    this._anims.push(tumbleAnim);

    // ── planet spawner ────────────────────────────────────────────────────────
    this._spawnPlanet(svg, W, H, el, pColors);
    this._planetTimer = setInterval(() => {
      this._spawnPlanet(svg, W, H, el, pColors);
    }, 6000);
  },

  _spawnPlanet(svg, W, H, el, pColors) {
    const ns = 'http://www.w3.org/2000/svg';
    const idx = Math.floor(Math.random() * pColors.length);
    const r = 40 + Math.random() * 35;
    const y = H * 0.15 + Math.random() * H * 0.65;
    const startX = -r - 60;

    const group = document.createElementNS(ns, 'g');
    svg.insertBefore(group, svg.firstChild.nextSibling); // behind stars layer? actually put behind astro

    // ring (behind planet)
    const ring = el('ellipse', {
      cx: '0', cy: '0',
      rx: r * 1.7, ry: r * 0.35,
      fill: 'none',
      stroke: pColors[idx][0],
      'stroke-width': r * 0.22,
      opacity: '0.55',
    }, group);

    // planet body
    el('circle', {
      cx: '0', cy: '0', r,
      fill: `url(#pGrad${idx})`,
    }, group);

    // ring front half (clip trick: just draw again with clip)
    const ringFront = el('ellipse', {
      cx: '0', cy: '0',
      rx: r * 1.7, ry: r * 0.35,
      fill: 'none',
      stroke: pColors[idx][0],
      'stroke-width': r * 0.22,
      opacity: '0.7',
      'clip-path': `inset(0 0 50% 0)`,
    }, group);

    // alien porthole (small window on planet surface)
    const ph = el('circle', { cx: String(-r * 0.3), cy: String(-r * 0.2), r: String(r * 0.22), fill: '#0a1628', stroke: '#4af', 'stroke-width': '2' }, group);
    // alien face: two eyes
    el('circle', { cx: String(-r * 0.3 - r * 0.07), cy: String(-r * 0.22), r: String(r * 0.05), fill: '#4f8' }, group);
    el('circle', { cx: String(-r * 0.3 + r * 0.07), cy: String(-r * 0.22), r: String(r * 0.05), fill: '#4f8' }, group);
    // alien arm (wave target)
    const alienArm = el('line', {
      x1: String(-r * 0.3 + r * 0.18), y1: String(-r * 0.18),
      x2: String(-r * 0.3 + r * 0.32), y2: String(-r * 0.08),
      stroke: '#4f8', 'stroke-width': '2', 'stroke-linecap': 'round',
    }, group);
    this._alienArm = alienArm;
    this._alienArmGroup = group;

    group.setAttribute('transform', `translate(${startX}, ${y})`);

    // drift planet left→right slowly
    const dur = 18000 + Math.random() * 8000;
    const planetAnim = window.anime({
      targets: group,
      translateX: [startX, W + r + 60],
      translateY: y,
      duration: dur,
      easing: 'linear',
      complete: () => {
        if (group.parentNode) group.parentNode.removeChild(group);
      },
    });
    this._anims.push(planetAnim);
  },

  _doWave() {
    if (!window.anime || this._waving) return;
    this._waving = true;
    const arm = this._rightArmGroup;
    const self = this;

    // anime timeline: raise arm, wave 3x, lower
    const tl = window.anime.timeline({
      easing: 'easeInOutSine',
      complete: () => { self._waving = false; },
    });

    // raise
    tl.add({
      targets: arm,
      rotate: '-90deg',
      duration: 400,
      transformOrigin: '18px 18px',
    });

    // wave x3
    for (let i = 0; i < 3; i++) {
      tl.add({ targets: arm, rotate: '-70deg', duration: 200 });
      tl.add({ targets: arm, rotate: '-110deg', duration: 200 });
    }

    // lower
    tl.add({
      targets: arm,
      rotate: '0deg',
      duration: 500,
    });

    this._anims.push(tl);

    // alien waves back
    if (this._alienArm) {
      const alienTl = window.anime.timeline({ easing: 'easeInOutSine' });
      const arm2 = this._alienArm;
      const g = this._alienArmGroup;
      const r = parseFloat(g.querySelector('circle').getAttribute('r')) || 20;
      // wiggle alien arm y2
      for (let i = 0; i < 4; i++) {
        alienTl.add({ targets: arm2, y2: String(-r * 0.18 - 8), duration: 200 });
        alienTl.add({ targets: arm2, y2: String(-r * 0.08), duration: 200 });
      }
      this._anims.push(alienTl);
    }
  },

  destroy() {
    // pause all animes
    this._anims.forEach(a => { try { a.pause(); } catch (_) {} });
    this._anims = [];

    // clear planet timer
    if (this._planetTimer) { clearInterval(this._planetTimer); this._planetTimer = null; }

    // remove event listeners
    this._listeners.forEach(({ target, type, fn }) => {
      try { target.removeEventListener(type, fn); } catch (_) {}
    });
    this._listeners = [];

    // remove svg
    if (this._svg && this._svg.parentNode) {
      this._svg.parentNode.removeChild(this._svg);
    }
    this._svg = null;

    // reset container bg
    if (this._container) this._container.style.background = '';
    this._container = null;

    // nullify refs
    this._astroGroup = null;
    this._rightArmGroup = null;
    this._alienArm = null;
    this._alienArmGroup = null;
    this._waving = false;
  },
};
