// DONKEY KONG — Climb to the top dodging barrels (Plethora Bit)
window.scrollerApp = {
  meta: {
    title: 'Donkey Kong',
    author: 'ArcadeBits',
    description: 'Climb ladders, jump barrels, save the day.',
    tags: ['game'],
  },

  init(container) {
    const self = this;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;background:#000;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);

    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#FF2222;text-shadow:0 0 6px #FF0000;pointer-events:none;z-index:3;';
    hud.innerHTML = '<span id="dk-score">SCORE 0</span><span id="dk-lives">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);

    const restart = document.createElement('button');
    restart.textContent = '↺ RESTART';
    restart.style.cssText = 'position:absolute;bottom:14px;right:14px;padding:8px 14px;font:bold 13px "Courier New",monospace;letter-spacing:2px;color:#FFF;background:linear-gradient(#B22222,#600);border:3px solid #FFD700;border-radius:4px;box-shadow:0 0 10px #FFD700;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);

    const jumpBtn = document.createElement('button');
    jumpBtn.textContent = 'JUMP';
    jumpBtn.style.cssText = 'position:absolute;bottom:14px;left:14px;width:90px;height:54px;font:bold 16px "Courier New",monospace;letter-spacing:3px;color:#000;background:linear-gradient(#FFE066,#FF9900);border:3px solid #FF0000;border-radius:50%;box-shadow:0 0 12px #FF0000;z-index:4;touch-action:manipulation;';
    wrap.appendChild(jumpBtn);

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.75);color:#FFD700;z-index:2;text-align:center;font-family:"Courier New",monospace;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let W, H;

    // Level: 5 platforms, alternating slopes
    // world coordinates in a virtual 200x300 space, scaled
    const VW = 200, VH = 300;
    const PLATFORMS = [
      { y: 280, x1: 5, x2: 195, slope: 0 },   // bottom (ground)
      { y: 230, x1: 5, x2: 195, slope: -0.1 },
      { y: 180, x1: 5, x2: 195, slope:  0.1 },
      { y: 130, x1: 5, x2: 195, slope: -0.1 },
      { y: 80,  x1: 5, x2: 195, slope: 0 },   // top where Kong is
    ];
    const LADDERS = [
      { x: 40,  y1: 230, y2: 280 },
      { x: 160, y1: 180, y2: 230 },
      { x: 50,  y1: 130, y2: 180 },
      { x: 150, y1: 80,  y2: 130 },
    ];

    let player, barrels, score, lives, running, win, particles, tick, spawnT;

    function platY(p, x) { return p.y + (x - p.x1) * p.slope; }
    function platAt(x, y) {
      for (let i=0;i<PLATFORMS.length;i++){
        const p = PLATFORMS[i];
        if (x>=p.x1 && x<=p.x2) {
          const py = platY(p, x);
          if (Math.abs(y - py) < 4) return p;
        }
      }
      return null;
    }

    function reset() {
      player = { x: 30, y: 280, vy: 0, onGround: true, climbing: false, jumpT:0, face:1 };
      barrels = [];
      score = 0; lives = 3; running = true; win = false;
      particles = []; tick=0; spawnT=0;
      updateHUD();
      overlay.style.display = 'none';
    }
    function updateHUD(){
      hud.querySelector('#dk-score').textContent = 'SCORE ' + score;
      hud.querySelector('#dk-lives').textContent = 'LIVES ' + '♥'.repeat(Math.max(0,lives));
    }

    function resize() {
      const r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W*dpr; canvas.height = H*dpr;
      canvas.style.width = W+'px'; canvas.style.height = H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();
    self._onResize = resize;
    window.addEventListener('resize', self._onResize);

    function W2X(x){ return x / VW * W; }
    function W2Y(y){ return y / VH * H; }
    function SX(){ return W/VW; }
    function SY(){ return H/VH; }

    // --- Drawing ---
    function drawBG() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,W,H);
      // CRT vertical neon columns
      const grad = ctx.createLinearGradient(0,0,0,H);
      grad.addColorStop(0,'rgba(255,0,80,0.08)');
      grad.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,W,H);
      // scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawGirder(p) {
      const y = W2Y(p.y);
      const y2 = W2Y(platY(p, p.x2));
      ctx.strokeStyle = '#FF00AA';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(W2X(p.x1), y);
      ctx.lineTo(W2X(p.x2), y2);
      ctx.stroke();
      // rivets
      ctx.fillStyle = '#FFE066';
      for (let x=p.x1+5;x<p.x2;x+=15){
        ctx.fillRect(W2X(x)-1, W2Y(platY(p,x))-1, 2, 2);
      }
    }
    function drawLadder(l) {
      ctx.strokeStyle = '#00FFDD';
      ctx.lineWidth = 2;
      const x1 = W2X(l.x-3), x2=W2X(l.x+3);
      const y1 = W2Y(l.y1), y2=W2Y(l.y2);
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x1,y2); ctx.moveTo(x2,y1); ctx.lineTo(x2,y2); ctx.stroke();
      for (let y=l.y1+4;y<l.y2;y+=6){
        const ys = W2Y(y);
        ctx.beginPath(); ctx.moveTo(x1,ys); ctx.lineTo(x2,ys); ctx.stroke();
      }
    }
    function drawKong() {
      const x = W2X(20), y = W2Y(80)-W2Y(20);
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(x, y, W2X(40)-W2X(0)+10, W2Y(20));
      ctx.fillStyle = '#D2691E';
      ctx.fillRect(x+4, y+4, 20*SX(), 10*SY());
      // eyes
      ctx.fillStyle = '#FFF';
      ctx.fillRect(x+8, y+6, 3, 4);
      ctx.fillRect(x+18, y+6, 3, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(x+9, y+7, 2, 2);
      ctx.fillRect(x+19, y+7, 2, 2);
    }
    function drawMario() {
      const px = W2X(player.x), py = W2Y(player.y);
      const w = 10*SX(), h = 16*SY();
      // hat
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(px-w/2, py-h, w, h*0.25);
      ctx.fillRect(px-w/2-1, py-h*0.78, w+2, h*0.12);
      // face
      ctx.fillStyle = '#FFCC99';
      ctx.fillRect(px-w/2+1, py-h*0.7, w-2, h*0.28);
      // eyes
      ctx.fillStyle = '#000';
      ctx.fillRect(px + (player.face>0?0:-w/2+1), py-h*0.6, 2, 2);
      // overalls
      ctx.fillStyle = '#2222FF';
      ctx.fillRect(px-w/2, py-h*0.4, w, h*0.4);
      // legs
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(px-w/2, py-h*0.15, w*0.45, h*0.15);
      ctx.fillRect(px+w*0.05, py-h*0.15, w*0.45, h*0.15);
      // shoes
      ctx.fillStyle = '#663300';
      ctx.fillRect(px-w/2, py-2, w*0.5, 2);
      ctx.fillRect(px+w*0.05, py-2, w*0.5, 2);
    }
    function drawBarrel(b){
      const bx = W2X(b.x), by = W2Y(b.y);
      ctx.save();
      ctx.translate(bx, by - 4*SY());
      ctx.rotate(b.rot);
      ctx.fillStyle = '#CC6600';
      ctx.fillRect(-5*SX(), -4*SY(), 10*SX(), 8*SY());
      ctx.fillStyle = '#663300';
      ctx.fillRect(-5*SX(), -3*SY(), 10*SX(), 1.5);
      ctx.fillRect(-5*SX(),  1.5*SY(), 10*SX(), 1.5);
      ctx.fillStyle = '#FF9933';
      ctx.fillRect(-4*SX(),-3*SY(),8*SX(),1);
      ctx.restore();
    }
    function drawPrincess(){
      const x = W2X(170), y = W2Y(75);
      ctx.fillStyle = '#FF69B4';
      ctx.fillRect(x-5, y-14, 10, 14);
      ctx.fillStyle = '#FFCC99';
      ctx.fillRect(x-4, y-20, 8, 6);
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(x-5, y-22, 10, 3);
      // HELP! text
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 8px "Courier New"';
      ctx.fillText('HELP!', x-10, y-26);
    }
    function drawParticles(){
      particles.forEach(p=>{
        ctx.globalAlpha = p.life/p.max;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x-1, p.y-1, 3, 3);
      });
      ctx.globalAlpha = 1;
    }
    function addParticles(x,y,c,n=12){
      for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-0.5)*4,vy:-Math.random()*3,c,life:24,max:24});
    }

    // --- Logic ---
    let leftDown=false, rightDown=false, upDown=false, downDown=false;

    function jump(){
      if (player.onGround && !player.climbing){
        player.vy = -3.5; player.onGround=false; player.jumpT=1;
      }
    }

    function step(){
      if (!running) return;
      tick++;

      // spawn barrels
      spawnT++;
      if (spawnT > 80){
        spawnT = 0;
        barrels.push({ x: 30, y: 80, vx: 0.9, vy: 0, rot:0, onPlat: PLATFORMS[4] });
      }

      // player movement
      const spd = 1.2;
      const onL = LADDERS.find(l=>Math.abs(l.x-player.x)<4 && player.y>=l.y1-2 && player.y<=l.y2+2);
      if (upDown && onL) { player.climbing = true; player.y -= spd; if (player.y<onL.y1) player.y=onL.y1; }
      else if (downDown && onL){ player.climbing = true; player.y += spd; if (player.y>onL.y2) player.y=onL.y2; }
      if (player.climbing && !onL) player.climbing=false;

      if (!player.climbing){
        if (leftDown) { player.x -= spd; player.face=-1; }
        if (rightDown){ player.x += spd; player.face=1; }
        // gravity
        player.vy += 0.25;
        player.y += player.vy;
        // landing
        const p = platAt(player.x, player.y);
        if (p && player.vy>=0){
          player.y = platY(p, player.x);
          player.vy = 0;
          if (!player.onGround){ player.onGround=true; player.jumpT=0; }
        } else {
          player.onGround=false;
        }
      }

      player.x = Math.max(5, Math.min(195, player.x));

      // reached top?
      if (player.y <= 82 && player.x > 160) { win=true; running=false; score+=500; updateHUD(); showOverlay('YOU WIN!', '#00FF88'); }

      // barrels
      barrels.forEach(b=>{
        b.rot += b.vx*0.2;
        b.x += b.vx;
        // find platform under
        const p2 = platAt(b.x, b.y);
        if (p2){ b.y = platY(p2,b.x); b.onPlat=p2; b.vy=0;
          // small chance to fall at ladder
          const nearL = LADDERS.find(l=>Math.abs(l.x-b.x)<2 && l.y1===p2.y);
          if (nearL && Math.random()<0.02){ b.y = p2.y + 2; }
        } else {
          b.vy += 0.25; b.y += b.vy;
        }
        // edge fall
        if (b.x<3 || b.x>197){ b.vx = -b.vx; }
        // jumped over?
        if (player.jumpT>0 && Math.abs(player.x - b.x) < 6 && Math.abs(player.y - b.y) < 14 && player.y < b.y-2){
          score += 100; updateHUD(); b.scored = true;
        }
        // collide
        if (Math.abs(player.x - b.x) < 5 && Math.abs(player.y - b.y) < 10){
          lives--; updateHUD();
          addParticles(W2X(player.x), W2Y(player.y), '#FF0000', 20);
          player.x = 30; player.y = 280; player.vy=0;
          if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
        }
      });
      barrels = barrels.filter(b=>b.y < 300);

      if (player.jumpT>0 && player.onGround) player.jumpT=0;

      particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.2;p.life--;});
      particles = particles.filter(p=>p.life>0);
    }

    function showOverlay(t,c){
      overlay.innerHTML = `<div style="font-size:28px;color:${c};text-shadow:0 0 14px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART to play again</div>`;
      overlay.style.display = 'flex';
    }

    function loop(){
      drawBG();
      PLATFORMS.forEach(drawGirder);
      LADDERS.forEach(drawLadder);
      drawKong();
      drawPrincess();
      barrels.forEach(drawBarrel);
      drawMario();
      drawParticles();
      step();
      self._raf = requestAnimationFrame(loop);
    }
    reset();
    self._raf = requestAnimationFrame(loop);

    // --- input ---
    // Tap zones on canvas: left half = left, right half = right, but use drag for up/down
    let tStart = null, tDir = null;
    self._onTouchStart = (e) => {
      const t = e.changedTouches[0];
      tStart = { x: t.clientX, y: t.clientY };
      tDir = null;
      // set initial direction based on half
      const rect = canvas.getBoundingClientRect();
      const rx = t.clientX - rect.left;
      if (rx < rect.width/2) { leftDown=true; rightDown=false; tDir='L'; }
      else { rightDown=true; leftDown=false; tDir='R'; }
    };
    self._onTouchMove = (e) => {
      e.preventDefault();
      if (!tStart) return;
      const t = e.changedTouches[0];
      const dy = t.clientY - tStart.y;
      upDown = dy < -18;
      downDown = dy > 18;
    };
    self._onTouchEnd = () => {
      leftDown=rightDown=upDown=downDown=false;
      tStart=null;
    };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});
    canvas.addEventListener('touchend', self._onTouchEnd);
    canvas.addEventListener('touchcancel', self._onTouchEnd);

    self._onKeyDown = (e) => {
      if (e.key==='ArrowLeft') leftDown=true;
      if (e.key==='ArrowRight') rightDown=true;
      if (e.key==='ArrowUp') upDown=true;
      if (e.key==='ArrowDown') downDown=true;
      if (e.key===' '||e.key==='z'||e.key==='Z') jump();
    };
    self._onKeyUp = (e) => {
      if (e.key==='ArrowLeft') leftDown=false;
      if (e.key==='ArrowRight') rightDown=false;
      if (e.key==='ArrowUp') upDown=false;
      if (e.key==='ArrowDown') downDown=false;
    };
    window.addEventListener('keydown', self._onKeyDown);
    window.addEventListener('keyup', self._onKeyUp);

    self._onJump = (e) => { e.preventDefault(); jump(); };
    jumpBtn.addEventListener('click', self._onJump);
    jumpBtn.addEventListener('touchstart', self._onJump, {passive:false});

    self._onRestart = (e) => { e.preventDefault(); reset(); };
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    self._wrap = wrap; self._canvas=canvas; self._restart=restart; self._jumpBtn=jumpBtn;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('touchend', this._onTouchEnd);
      this._canvas.removeEventListener('touchcancel', this._onTouchEnd);
    }
    if (this._jumpBtn){
      this._jumpBtn.removeEventListener('click', this._onJump);
      this._jumpBtn.removeEventListener('touchstart', this._onJump);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=this._jumpBtn=null;
  },
};
