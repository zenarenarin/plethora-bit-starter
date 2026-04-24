window.scrollerApp = {
  meta: {
    title: 'The Letter',
    author: 'plethora',
    description: 'An unsent letter. Tap to read.',
    tags: ['stories'],
  },

  _root: null,
  _animes: [],
  _scene: 0,

  init(container) {
    this._scene = 0;
    this._animes = [];

    const root = document.createElement('div');
    root.style.cssText = `
      position: absolute;
      inset: 0;
      background: #0a0a0f;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-family: 'Georgia', serif;
      cursor: pointer;
    `;
    container.appendChild(root);
    this._root = root;

    function loadAnime(cb) {
      if (window.anime) return cb();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
      s.onload = cb;
      document.head.appendChild(s);
    }

    loadAnime(() => {
      if (!this._root) return;
      this._buildScene1();
    });
  },

  _buildScene1() {
    const root = this._root;
    root.innerHTML = '';

    // Envelope wrapper
    const envelopeWrap = document.createElement('div');
    envelopeWrap.id = 'envelope-wrap';
    envelopeWrap.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 28px;
    `;

    // SVG envelope
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('id', 'envelope-svg');
    svg.setAttribute('width', '220');
    svg.setAttribute('height', '160');
    svg.setAttribute('viewBox', '0 0 220 160');

    // Envelope body
    const body = document.createElementNS(svgNS, 'rect');
    body.setAttribute('x', '0');
    body.setAttribute('y', '30');
    body.setAttribute('width', '220');
    body.setAttribute('height', '130');
    body.setAttribute('rx', '6');
    body.setAttribute('fill', '#c9a96e');
    body.setAttribute('stroke', '#a07840');
    body.setAttribute('stroke-width', '2');

    // Envelope bottom-left triangle
    const triLeft = document.createElementNS(svgNS, 'polygon');
    triLeft.setAttribute('points', '0,160 0,60 90,110');
    triLeft.setAttribute('fill', '#b8924f');

    // Envelope bottom-right triangle
    const triRight = document.createElementNS(svgNS, 'polygon');
    triRight.setAttribute('points', '220,160 220,60 130,110');
    triRight.setAttribute('fill', '#b8924f');

    // Envelope bottom center triangle
    const triBottom = document.createElementNS(svgNS, 'polygon');
    triBottom.setAttribute('points', '0,160 220,160 110,100');
    triBottom.setAttribute('fill', '#c0a060');

    // Flap (top triangle) — will animate open
    const flap = document.createElementNS(svgNS, 'polygon');
    flap.setAttribute('id', 'envelope-flap');
    flap.setAttribute('points', '0,30 220,30 110,105');
    flap.setAttribute('fill', '#d4b47a');
    flap.setAttribute('stroke', '#a07840');
    flap.setAttribute('stroke-width', '1.5');
    flap.style.transformOrigin = '110px 30px';
    flap.style.transformBox = 'fill-box';

    // Flap crease line
    const crease = document.createElementNS(svgNS, 'line');
    crease.setAttribute('x1', '0');
    crease.setAttribute('y1', '30');
    crease.setAttribute('x2', '220');
    crease.setAttribute('y2', '30');
    crease.setAttribute('stroke', '#a07840');
    crease.setAttribute('stroke-width', '1.5');

    svg.appendChild(body);
    svg.appendChild(triLeft);
    svg.appendChild(triRight);
    svg.appendChild(triBottom);
    svg.appendChild(flap);
    svg.appendChild(crease);

    // Tap hint
    const hint = document.createElement('div');
    hint.id = 'tap-hint';
    hint.textContent = 'Tap to open';
    hint.style.cssText = `
      color: #8a7560;
      font-size: 15px;
      letter-spacing: 2px;
      text-transform: uppercase;
      opacity: 1;
    `;

    envelopeWrap.appendChild(svg);
    envelopeWrap.appendChild(hint);
    root.appendChild(envelopeWrap);

    // Float animation
    const floatAnim = anime({
      targets: '#envelope-wrap',
      translateY: [-8, 8],
      duration: 2000,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });
    this._animes.push(floatAnim);

    // Hint pulse
    const hintAnim = anime({
      targets: '#tap-hint',
      opacity: [0.3, 1],
      duration: 1400,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine',
    });
    this._animes.push(hintAnim);

    // Tap handler
    this._onTap = () => {
      if (this._scene !== 0) return;
      this._scene = 1;
      root.removeEventListener('pointerdown', this._onTap);
      this._openEnvelope();
    };
    root.addEventListener('pointerdown', this._onTap);
  },

  _openEnvelope() {
    // Pause float
    this._animes.forEach(a => a.pause());
    this._animes = [];

    const root = this._root;

    // Create letter paper (starts hidden inside envelope)
    const paper = document.createElement('div');
    paper.id = 'letter-paper-peek';
    paper.style.cssText = `
      position: absolute;
      width: 160px;
      height: 180px;
      background: #fdf6e3;
      border-radius: 4px;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) translateY(60px);
      opacity: 0;
      z-index: 1;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    `;
    root.appendChild(paper);

    // Flip flap open
    const flapEl = root.querySelector('#envelope-flap');

    const openAnim = anime.timeline({ easing: 'easeInOutCubic' });

    openAnim
      .add({
        targets: flapEl,
        rotateX: [0, -160],
        duration: 600,
      })
      .add({
        targets: '#letter-paper-peek',
        opacity: [0, 1],
        translateY: [60, -30],
        duration: 700,
        easing: 'easeOutCubic',
      }, '-=200')
      .add({
        targets: '#envelope-wrap',
        opacity: [1, 0],
        scale: [1, 0.9],
        duration: 500,
        easing: 'easeInCubic',
        complete: () => {
          if (!this._root) return;
          this._buildScene3();
        },
      }, '-=200');

    this._animes.push(openAnim);
  },

  _buildScene3() {
    const root = this._root;
    root.innerHTML = '';
    this._animes = [];

    const lines = [
      { text: 'Dear you,', cls: 'salutation' },
      { text: '', cls: 'spacer' },
      { text: "I know we haven't spoken in a while.", cls: 'body' },
      { text: "I've been thinking about the little things.", cls: 'body' },
      { text: "The way you laughed at nothing.", cls: 'body' },
      { text: "The way time felt slower then.", cls: 'body' },
      { text: '', cls: 'spacer' },
      { text: "I just wanted you to know —", cls: 'body' },
      { text: "you were not forgotten.", cls: 'body-em' },
      { text: '', cls: 'spacer' },
      { text: "Always,", cls: 'closing' },
      { text: "Someone who remembers", cls: 'signature' },
    ];

    // Paper card
    const card = document.createElement('div');
    card.id = 'letter-card';
    card.style.cssText = `
      position: relative;
      width: min(88vw, 420px);
      max-height: 82vh;
      background: #fdf6e3;
      border-radius: 10px;
      padding: 44px 40px 36px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      gap: 0;
      overflow: hidden;
      box-sizing: border-box;
      transform: translateY(30px);
      opacity: 0;
    `;

    // Ruled lines decoration
    for (let i = 0; i < 20; i++) {
      const line = document.createElement('div');
      line.style.cssText = `
        position: absolute;
        left: 40px;
        right: 40px;
        top: ${88 + i * 28}px;
        height: 1px;
        background: rgba(180,160,120,0.18);
        pointer-events: none;
      `;
      card.appendChild(line);
    }

    const textEls = [];

    lines.forEach(({ text, cls }) => {
      const el = document.createElement('div');
      el.className = 'letter-line ' + cls;

      if (cls === 'spacer') {
        el.style.cssText = 'height: 18px; flex-shrink: 0;';
      } else {
        el.textContent = text;
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        el.style.position = 'relative';
        el.style.zIndex = '1';
        el.style.lineHeight = '1.75';
        el.style.color = '#2c1810';
        el.style.flexShrink = '0';

        if (cls === 'salutation') {
          el.style.cssText += `
            font-size: 22px;
            font-style: italic;
            margin-bottom: 6px;
          `;
        } else if (cls === 'body') {
          el.style.cssText += `
            font-size: 16px;
            font-weight: 400;
          `;
        } else if (cls === 'body-em') {
          el.style.cssText += `
            font-size: 17px;
            font-style: italic;
            font-weight: 600;
            color: #1a0e08;
          `;
        } else if (cls === 'closing') {
          el.style.cssText += `
            font-size: 16px;
            font-style: italic;
          `;
        } else if (cls === 'signature') {
          el.style.cssText += `
            font-size: 18px;
            font-style: italic;
            color: #5a3520;
            margin-top: 2px;
          `;
        }
        textEls.push(el);
      }

      card.appendChild(el);
    });

    root.appendChild(card);

    // Fold & keep button (hidden initially)
    const btn = document.createElement('button');
    btn.id = 'fold-btn';
    btn.textContent = 'fold & keep';
    btn.style.cssText = `
      margin-top: 22px;
      padding: 12px 32px;
      background: transparent;
      border: 1px solid rgba(200,180,140,0.45);
      border-radius: 40px;
      color: #8a7560;
      font-family: 'Georgia', serif;
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: lowercase;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: border-color 0.3s, color 0.3s;
    `;
    btn.addEventListener('pointerover', () => {
      btn.style.borderColor = 'rgba(200,180,140,0.8)';
      btn.style.color = '#c8b480';
    });
    btn.addEventListener('pointerout', () => {
      btn.style.borderColor = 'rgba(200,180,140,0.45)';
      btn.style.color = '#8a7560';
    });
    root.appendChild(btn);

    // Animate card in
    const cardIn = anime({
      targets: '#letter-card',
      opacity: [0, 1],
      translateY: [30, 0],
      duration: 800,
      easing: 'easeOutCubic',
      complete: () => {
        if (!this._root) return;
        // Reveal lines staggered
        const revealAnim = anime({
          targets: textEls,
          opacity: [0, 1],
          translateY: [10, 0],
          delay: anime.stagger(260, { start: 200 }),
          duration: 700,
          easing: 'easeOutCubic',
          complete: () => {
            if (!this._root) return;
            // Show button
            const btnAnim = anime({
              targets: '#fold-btn',
              opacity: [0, 1],
              translateY: [8, 0],
              duration: 600,
              easing: 'easeOutCubic',
              begin: () => {
                btn.style.pointerEvents = 'auto';
              },
            });
            this._animes.push(btnAnim);
            this._scene = 2;

            btn.addEventListener('pointerdown', () => {
              if (this._scene !== 2) return;
              this._scene = 3;
              this._buildScene4();
            });
          },
        });
        this._animes.push(revealAnim);
      },
    });
    this._animes.push(cardIn);
  },

  _buildScene4() {
    const root = this._root;
    this._animes.forEach(a => { try { a.pause(); } catch(e) {} });
    this._animes = [];

    // Fold card away
    const foldAnim = anime.timeline({ easing: 'easeInCubic' });
    foldAnim
      .add({
        targets: '#letter-card',
        scaleY: [1, 0],
        scaleX: [1, 0.7],
        opacity: [1, 0],
        duration: 600,
      })
      .add({
        targets: '#fold-btn',
        opacity: [1, 0],
        duration: 300,
      }, 0)
      .add({
        // Fade entire root to black
        targets: root,
        backgroundColor: ['#0a0a0f', '#000000'],
        duration: 800,
        easing: 'easeInOutCubic',
        complete: () => {
          if (!this._root) return;
          root.innerHTML = '';
          this._buildStarScene();
        },
      });
    this._animes.push(foldAnim);
  },

  _buildStarScene() {
    const root = this._root;
    this._animes = [];

    // Single star
    const star = document.createElement('div');
    star.id = 'end-star';
    star.textContent = '★';
    star.style.cssText = `
      font-size: 32px;
      color: #e8d5a0;
      opacity: 0;
      text-shadow: 0 0 18px rgba(232,213,160,0.6), 0 0 40px rgba(232,213,160,0.3);
    `;
    root.appendChild(star);

    // Small note under star
    const note = document.createElement('div');
    note.id = 'end-note';
    note.textContent = 'kept safe';
    note.style.cssText = `
      margin-top: 18px;
      color: rgba(180,160,120,0.5);
      font-family: 'Georgia', serif;
      font-style: italic;
      font-size: 14px;
      letter-spacing: 3px;
      opacity: 0;
    `;
    root.appendChild(note);

    const starIn = anime.timeline();
    starIn
      .add({
        targets: '#end-star',
        opacity: [0, 1],
        scale: [0.3, 1],
        duration: 900,
        easing: 'easeOutElastic(1, 0.6)',
      })
      .add({
        targets: '#end-note',
        opacity: [0, 0.7],
        translateY: [6, 0],
        duration: 700,
        easing: 'easeOutCubic',
      }, '-=200')
      .add({
        targets: '#end-star',
        opacity: [1, 0.4, 1],
        scale: [1, 1.15, 1],
        duration: 2200,
        loop: true,
        direction: 'alternate',
        easing: 'easeInOutSine',
      });
    this._animes.push(starIn);
  },

  destroy() {
    this._animes.forEach(a => { try { a.pause(); } catch(e) {} });
    this._animes = [];
    if (this._root) {
      this._root.innerHTML = '';
      this._root = null;
    }
    this._scene = 0;
    this._onTap = null;
  },
};
