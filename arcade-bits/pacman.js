// PAC-MAN — Arcade Classic (Plethora Bit)
window.scrollerApp = {
  meta: {
    title: 'Pac-Man',
    author: 'ArcadeBits',
    description: 'Chomp dots, dodge ghosts. Swipe to turn.',
    tags: ['game'],
  },

  init(container) {
    const self = this;
    // ---------- Stage ----------
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;background:#000;overflow:hidden;font-family:"Courier New",monospace;color:#FFCC00;';
    container.appendChild(wrap);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);

    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font-size:14px;font-weight:bold;letter-spacing:2px;color:#FFFF00;text-shadow:0 0 6px #FF00FF;pointer-events:none;z-index:3;';
    hud.innerHTML = '<span id="pm-score">SCORE 0</span><span id="pm-lives">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);

    const restart = document.createElement('button');
    restart.textContent = '↺ RESTART';
    restart.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 18px;font:bold 14px "Courier New",monospace;letter-spacing:3px;color:#000;background:linear-gradient(#FFFF00,#FF9900);border:3px solid #FF00FF;border-radius:4px;box-shadow:0 0 12px #FF00FF,inset 0 0 6px #000;cursor:pointer;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.7);color:#FFFF00;z-index:2;text-align:center;font-weight:bold;letter-spacing:4px;';
    wrap.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let W, H, tile, offX, offY;

    // ---------- Maze (21 x 21) ----------
    const MAP = [
      '#####################',
      '#.........#.........#',
      '#.##.###.#.#.###.##.#',
      '#.#o..............#.#',
      '#.#.##.#.###.#.##.#.#',
      '#......#..#..#......#',
      '####.####.#.####.####',
      '   #.#.........#.#   ',
      '####.#.##---##.#.####',
      '.......# GGG #.......',
      '####.#.#######.#.####',
      '   #.#.........#.#   ',
      '####.#.#######.#.####',
      '#.........#.........#',
      '#.##.###..#..###.##.#',
      '#o.#.....P.......#.o#',
      '##.#.#.#######.#.#.##',
      '#....#....#....#....#',
      '#.######.###.######.#',
      '#...................#',
      '#####################',
    ];
    const ROWS = MAP.length, COLS = MAP[0].length;

    let walls, dots, pellets, pac, ghosts, score, lives, powerT, running, win, particles, tick;

    function reset() {
      walls = []; dots = []; pellets = [];
      for (let y = 0; y < ROWS; y++) {
        walls[y] = []; dots[y] = []; pellets[y] = [];
        for (let x = 0; x < COLS; x++) {
          const c = MAP[y][x];
          walls[y][x] = (c === '#');
          dots[y][x]  = (c === '.');
          pellets[y][x] = (c === 'o');
        }
      }
      pac = { x: 10, y: 15, px:10, py:15, dir: 3, next: 3, t: 0, mouth: 0, dead: false };
      ghosts = [
        { x: 9,  y: 9, px:9, py:9, color: '#FF0000', t: 0, dx:1, dy:0, scared:0 },
        { x: 10, y: 9, px:10,py:9, color: '#FFB8FF', t: 0, dx:-1,dy:0, scared:0 },
        { x: 11, y: 9, px:11,py:9, color: '#00FFFF', t: 0, dx:0, dy:-1, scared:0 },
        { x: 10, y: 7, px:10,py:7, color: '#FFB852', t: 0, dx:0, dy:1, scared:0 },
      ];
      score = 0; lives = 3; powerT = 0; running = true; win = false; particles = []; tick = 0;
      updateHUD();
      overlay.style.display = 'none';
    }

    function updateHUD() {
      hud.querySelector('#pm-score').textContent = 'SCORE ' + score;
      hud.querySelector('#pm-lives').textContent = 'LIVES ' + '♥'.repeat(Math.max(0,lives));
    }

    function resize() {
      const rect = wrap.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      // fit maze
      const usable = Math.min(W, H - 80);
      tile = Math.floor(usable / COLS);
      offX = Math.floor((W - tile*COLS)/2);
      offY = Math.floor((H - tile*ROWS)/2);
    }
    resize();
    self._onResize = resize;
    window.addEventListener('resize', self._onResize);

    // ---------- Draw helpers ----------
    function drawBackdrop() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,W,H);
      // grid
      ctx.strokeStyle = 'rgba(255,0,255,0.06)';
      ctx.lineWidth = 1;
      for (let x=0;x<W;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for (let y=0;y<H;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      // scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawMaze() {
      for (let y=0;y<ROWS;y++){
        for (let x=0;x<COLS;x++){
          if (walls[y][x]) {
            ctx.fillStyle = '#0033CC';
            ctx.fillRect(offX+x*tile, offY+y*tile, tile, tile);
            ctx.fillStyle = '#1E90FF';
            ctx.fillRect(offX+x*tile+2, offY+y*tile+2, tile-4, tile-4);
            ctx.fillStyle = '#000';
            ctx.fillRect(offX+x*tile+4, offY+y*tile+4, tile-8, tile-8);
          } else if (dots[y][x]) {
            ctx.fillStyle = '#FFCC99';
            ctx.fillRect(offX+x*tile+tile/2-1, offY+y*tile+tile/2-1, 2, 2);
          } else if (pellets[y][x]) {
            const s = 2 + Math.sin(tick*0.2)*1.5;
            ctx.fillStyle = '#FFFF00';
            ctx.beginPath();
            ctx.arc(offX+x*tile+tile/2, offY+y*tile+tile/2, s+2, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }
    }
    function drawPac() {
      const cx = offX + pac.px*tile + tile/2;
      const cy = offY + pac.py*tile + tile/2;
      const r  = tile*0.45;
      const m  = Math.abs(Math.sin(tick*0.3))*0.5 + 0.05;
      const rot = [0, 0, Math.PI/2, Math.PI, -Math.PI/2][pac.dir+1] || 0; // up=0? just approximate
      const dirRot = {0:Math.PI, 1:0, 2:-Math.PI/2, 3:Math.PI/2}[pac.dir] || 0;
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(dirRot);
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.arc(0,0,r, m, Math.PI*2 - m);
      ctx.closePath();
      ctx.fill();
      // glow
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#FFFF88';
      ctx.beginPath(); ctx.arc(0,0,r+3,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    function drawGhost(g) {
      const cx = offX + g.px*tile + tile/2;
      const cy = offY + g.py*tile + tile/2;
      const r  = tile*0.45;
      const col = g.scared>0 ? (Math.floor(tick/4)%2?'#FFFFFF':'#0000FF') : g.color;
      ctx.fillStyle = col;
      // body
      ctx.beginPath();
      ctx.arc(cx, cy-1, r, Math.PI, 0);
      ctx.lineTo(cx+r, cy+r);
      // wavy skirt
      const n = 4; const w = (2*r)/n;
      for (let i=0;i<n;i++){
        ctx.lineTo(cx+r - w*(i+0.5), cy+r - (i%2?4:0));
        ctx.lineTo(cx+r - w*(i+1),   cy+r);
      }
      ctx.closePath();
      ctx.fill();
      // eyes
      ctx.fillStyle = '#FFF';
      ctx.fillRect(cx-r*0.55, cy-r*0.3, r*0.4, r*0.5);
      ctx.fillRect(cx+r*0.15, cy-r*0.3, r*0.4, r*0.5);
      ctx.fillStyle = '#0033FF';
      ctx.fillRect(cx-r*0.45 + (g.dx>0?r*0.15:g.dx<0?0:r*0.07), cy-r*0.15, r*0.18, r*0.22);
      ctx.fillRect(cx+r*0.25 + (g.dx>0?r*0.15:g.dx<0?0:r*0.07), cy-r*0.15, r*0.18, r*0.22);
    }
    function drawParticles(){
      particles.forEach(p=>{
        ctx.globalAlpha = Math.max(0,p.life/p.max);
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x-1,p.y-1,3,3);
      });
      ctx.globalAlpha = 1;
    }
    function addParticles(x,y,c,n=10){
      for(let i=0;i<n;i++){
        particles.push({x,y, vx:(Math.random()-0.5)*3, vy:(Math.random()-0.5)*3, c, life:20, max:20});
      }
    }

    // ---------- Logic ----------
    const DIRS = [[1,0],[-1,0],[0,-1],[0,1]]; // right left up down
    function canGo(x,y){
      if (y<0||y>=ROWS) return false;
      if (x<0) x+=COLS; if(x>=COLS) x-=COLS;
      return !walls[y][x];
    }
    function step() {
      if (!running) return;
      tick++;
      if (powerT>0) powerT--;
      // particle physics
      particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life--;});
      particles = particles.filter(p=>p.life>0);

      // Pac movement (grid step every N ticks)
      pac.t++;
      const speed = 6;
      if (pac.t >= speed) {
        pac.t = 0;
        const [nx,ny] = DIRS[pac.next];
        if (canGo(pac.x+nx, pac.y+ny)) pac.dir = pac.next;
        const [dx,dy] = DIRS[pac.dir];
        if (canGo(pac.x+dx, pac.y+dy)) {
          pac.x += dx; pac.y += dy;
          if (pac.x < 0) pac.x = COLS-1;
          if (pac.x >= COLS) pac.x = 0;
          // eat
          if (dots[pac.y][pac.x]) { dots[pac.y][pac.x]=false; score+=10; updateHUD(); }
          if (pellets[pac.y][pac.x]) {
            pellets[pac.y][pac.x]=false; score+=50; powerT = 180;
            ghosts.forEach(g=>g.scared=180);
            addParticles(offX+pac.x*tile+tile/2, offY+pac.y*tile+tile/2, '#FF00FF', 16);
            updateHUD();
          }
          // check win
          let any=false;
          for (let yy=0;yy<ROWS&&!any;yy++) for (let xx=0;xx<COLS&&!any;xx++) if (dots[yy][xx]||pellets[yy][xx]) any=true;
          if (!any) { win=true; running=false; showOverlay('YOU WIN!', '#00FF00'); }
        }
      }
      // smooth pac
      pac.px += (pac.x - pac.px)*0.25;
      pac.py += (pac.y - pac.py)*0.25;

      // Ghosts
      ghosts.forEach(g=>{
        g.t++;
        const gs = 10;
        if (g.scared>0) g.scared--;
        if (g.t>=gs){
          g.t=0;
          // choose direction: avoid reverse, prefer chase (or flee if scared)
          const opts = DIRS.filter(([dx,dy])=> canGo(g.x+dx,g.y+dy) && !(dx===-g.dx && dy===-g.dy));
          const choices = opts.length?opts:DIRS.filter(([dx,dy])=>canGo(g.x+dx,g.y+dy));
          if (choices.length){
            let best=choices[0], score2=Infinity;
            choices.forEach(c=>{
              const d = Math.hypot(g.x+c[0]-pac.x, g.y+c[1]-pac.y);
              const s = g.scared>0 ? -d : d;
              if (s<score2){score2=s;best=c;}
            });
            if (Math.random()<0.15) best = choices[(Math.random()*choices.length)|0];
            g.dx=best[0]; g.dy=best[1];
            g.x+=g.dx; g.y+=g.dy;
            if (g.x<0) g.x=COLS-1;
            if (g.x>=COLS) g.x=0;
          }
        }
        g.px += (g.x-g.px)*0.25;
        g.py += (g.y-g.py)*0.25;

        // collide
        if (Math.abs(g.px-pac.px)<0.5 && Math.abs(g.py-pac.py)<0.5){
          if (g.scared>0){
            score+=200; updateHUD();
            addParticles(offX+g.px*tile+tile/2,offY+g.py*tile+tile/2,g.color,20);
            g.x=10; g.y=9; g.scared=0;
          } else {
            lives--; updateHUD();
            addParticles(offX+pac.px*tile+tile/2,offY+pac.py*tile+tile/2,'#FFFF00',30);
            pac.x=10; pac.y=15; pac.px=10; pac.py=15;
            if (lives<=0){ running=false; showOverlay('GAME OVER','#FF0044'); }
          }
        }
      });
    }

    function showOverlay(text,color){
      overlay.innerHTML = `<div style="font-size:28px;color:${color};text-shadow:0 0 12px ${color};margin-bottom:14px;">${text}</div><div style="font-size:14px;color:#FFF;">SCORE ${score}</div><div style="font-size:12px;color:#999;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display = 'flex';
    }

    // ---------- Loop ----------
    function loop(){
      drawBackdrop();
      drawMaze();
      ghosts.forEach(drawGhost);
      drawPac();
      drawParticles();
      step();
      self._raf = requestAnimationFrame(loop);
    }
    reset();
    self._raf = requestAnimationFrame(loop);

    // ---------- Input ----------
    let sx=0, sy=0, swiped=false;
    self._onTouchStart = (e) => {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; swiped=false;
    };
    self._onTouchMove = (e) => {
      if (swiped) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.hypot(dx,dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) pac.next = dx>0?0:1;
      else pac.next = dy<0?2:3;
      swiped = true;
    };
    self._onKey = (e) => {
      if (e.key==='ArrowRight') pac.next=0;
      if (e.key==='ArrowLeft') pac.next=1;
      if (e.key==='ArrowUp') pac.next=2;
      if (e.key==='ArrowDown') pac.next=3;
    };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});
    window.addEventListener('keydown', self._onKey);

    self._onRestart = (e) => { e.preventDefault(); reset(); };
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    // stash
    self._wrap = wrap;
    self._canvas = canvas;
    self._restart = restart;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap = this._canvas = this._restart = null;
  },
};
