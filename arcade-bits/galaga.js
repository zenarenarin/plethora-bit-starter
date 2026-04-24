// GALAGA — Blast alien squadrons (Plethora Bit)
window.scrollerApp = {
  meta: {
    title: 'Galaga',
    author: 'ArcadeBits',
    description: 'Drag to move, tap to fire. Destroy the swarm.',
    tags: ['game'],
  },
  init(container) {
    const self = this;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;background:#000008;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#FF2222;text-shadow:0 0 6px #FF0000;pointer-events:none;z-index:3;';
    hud.innerHTML = '<span id="g-s">SCORE 0</span><span id="g-w">WAVE 1</span><span id="g-l">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);
    const restart = document.createElement('button');
    restart.textContent = '↺ RESTART';
    restart.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 18px;font:bold 14px "Courier New",monospace;letter-spacing:3px;color:#000;background:linear-gradient(#FFFF44,#FF9900);border:3px solid #FF0055;border-radius:4px;box-shadow:0 0 12px #FF0055;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.75);z-index:2;text-align:center;font-family:"Courier New",monospace;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    let W, H;

    let stars, ship, bullets, enemies, eBullets, particles, score, wave, lives, running, tick, swoopT;

    function starField(){
      stars = [];
      for (let i=0;i<80;i++) stars.push({x:Math.random()*W, y:Math.random()*H, s:Math.random()*2+0.5, v:Math.random()*2+0.5});
    }
    function spawnWave(){
      enemies = [];
      const rows = 4, cols = 8;
      for (let r=0;r<rows;r++){
        for (let c=0;c<cols;c++){
          const type = r===0?'boss':r===1?'alien1':'alien2';
          enemies.push({
            x: 40 + c*32, y: 60 + r*28,
            baseX: 40 + c*32, baseY: 60 + r*28,
            type, alive: true, swoop:false, t:0, sx:0, sy:0,
          });
        }
      }
    }
    function reset(){
      ship = { x: 0, y: 0, cool:0 };
      bullets = []; eBullets=[]; particles=[];
      score = 0; wave = 1; lives = 3; running=true; tick=0; swoopT=0;
      resize();
      spawnWave();
      updateHUD();
      overlay.style.display = 'none';
    }
    function updateHUD(){
      hud.querySelector('#g-s').textContent = 'SCORE ' + score;
      hud.querySelector('#g-w').textContent = 'WAVE ' + wave;
      hud.querySelector('#g-l').textContent = 'LIVES ' + '♥'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      if (!ship) ship={x:0,y:0,cool:0};
      ship.x = W/2; ship.y = H - 70;
      starField();
    }
    self._onResize = resize;
    window.addEventListener('resize', self._onResize);

    function drawBG(){
      ctx.fillStyle='#000008'; ctx.fillRect(0,0,W,H);
      stars.forEach(s=>{
        s.y += s.v; if (s.y>H) { s.y=0; s.x=Math.random()*W; }
        ctx.fillStyle = s.s>1.3?'#FFF':'#AACCFF';
        ctx.fillRect(s.x, s.y, s.s, s.s);
      });
      // scanlines
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for(let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawShip(){
      const x=ship.x, y=ship.y;
      ctx.fillStyle='#FFF';
      ctx.fillRect(x-2, y-12, 4, 12);
      ctx.fillStyle='#00FFFF';
      ctx.fillRect(x-8, y-4, 16, 4);
      ctx.fillStyle='#FFF';
      ctx.fillRect(x-10, y, 20, 4);
      ctx.fillStyle='#FF0000';
      ctx.fillRect(x-1, y-10, 2, 2);
      // thrust
      ctx.fillStyle = tick%2?'#FF6600':'#FFFF00';
      ctx.fillRect(x-3, y+4, 6, 6);
    }
    function drawEnemy(e){
      const px = e.x, py = e.y;
      if (e.type==='boss'){
        ctx.fillStyle='#00FF00';
        ctx.fillRect(px-8, py-4, 16, 8);
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(px-6, py-6, 12, 4);
        ctx.fillStyle='#FF00FF';
        ctx.fillRect(px-4, py+2, 8, 2);
        ctx.fillStyle='#000';
        ctx.fillRect(px-5, py-2, 2, 2);
        ctx.fillRect(px+3, py-2, 2, 2);
      } else if (e.type==='alien1'){
        ctx.fillStyle='#FF0066';
        ctx.fillRect(px-7, py-5, 14, 10);
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(px-5, py-3, 4, 4);
        ctx.fillRect(px+1, py-3, 4, 4);
        ctx.fillStyle='#000';
        ctx.fillRect(px-4, py-2, 2, 2);
        ctx.fillRect(px+2, py-2, 2, 2);
      } else {
        ctx.fillStyle='#00CCFF';
        ctx.fillRect(px-6, py-4, 12, 8);
        ctx.fillStyle='#FF00FF';
        ctx.fillRect(px-4, py-2, 8, 4);
        ctx.fillStyle='#FFF';
        ctx.fillRect(px-2, py-4, 4, 2);
      }
    }
    function drawBullet(b){
      ctx.fillStyle = b.friendly?'#FFFF00':'#FF4444';
      ctx.fillRect(b.x-1, b.y-4, 2, 8);
      ctx.fillStyle = b.friendly?'#FFFFFF':'#FF9999';
      ctx.fillRect(b.x, b.y-3, 1, 4);
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3); });
      ctx.globalAlpha=1;
    }
    function addExplosion(x,y,c){
      for(let i=0;i<18;i++) particles.push({x,y,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5,c,life:24,max:24});
    }

    function step(){
      if (!running) return;
      tick++;
      // enemy formation sway
      const sway = Math.sin(tick*0.02)*12;
      enemies.forEach(e=>{
        if (!e.alive) return;
        if (e.swoop){
          e.t++;
          e.x += e.sx; e.y += e.sy;
          e.sy += 0.05;
          // random firing
          if (tick%5===0 && Math.random()<0.2) eBullets.push({x:e.x,y:e.y+4,vy:3});
          if (e.y > H+10){ e.x = e.baseX; e.y = -10; e.swoop=false; e.t=0; }
        } else {
          e.x = e.baseX + sway;
          e.y = e.baseY;
        }
      });
      // trigger swoop
      swoopT++;
      if (swoopT > 90){
        swoopT = 0;
        const alive = enemies.filter(e=>e.alive && !e.swoop);
        if (alive.length){
          const e = alive[(Math.random()*alive.length)|0];
          e.swoop = true;
          e.sx = (ship.x - e.x)*0.01;
          e.sy = 1;
        }
      }

      // bullets
      bullets.forEach(b=> b.y-=8);
      bullets = bullets.filter(b=> b.y>-20);
      eBullets.forEach(b=> b.y += b.vy);
      eBullets = eBullets.filter(b=> b.y < H+10);

      // collisions: bullets hit enemies
      bullets.forEach(b=>{
        enemies.forEach(e=>{
          if (!e.alive) return;
          if (Math.abs(b.x-e.x)<9 && Math.abs(b.y-e.y)<8){
            e.alive=false; b.y=-100;
            score += e.type==='boss'?150:e.type==='alien1'?80:50;
            addExplosion(e.x,e.y, e.type==='boss'?'#00FF00':e.type==='alien1'?'#FF0066':'#00CCFF');
            updateHUD();
          }
        });
      });
      // check wave clear
      if (enemies.every(e=>!e.alive)){
        wave++; updateHUD();
        spawnWave();
      }
      // enemy bullets hit ship
      eBullets.forEach(b=>{
        if (Math.abs(b.x-ship.x)<10 && Math.abs(b.y-ship.y)<10){
          b.y = H+100;
          lives--; updateHUD();
          addExplosion(ship.x, ship.y, '#FFFF00');
          if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
        }
      });
      // enemy swoop hits ship
      enemies.forEach(e=>{
        if (!e.alive || !e.swoop) return;
        if (Math.abs(e.x-ship.x)<12 && Math.abs(e.y-ship.y)<12){
          e.alive=false; lives--; updateHUD();
          addExplosion(ship.x, ship.y, '#FFFF00');
          if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
        }
      });

      if (ship.cool>0) ship.cool--;
      particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.life--; });
      particles = particles.filter(p=>p.life>0);
    }
    function fire(){
      if (!running) return;
      if (ship.cool<=0){ bullets.push({x:ship.x, y:ship.y-14, friendly:true}); ship.cool=12; }
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG();
      enemies.forEach(e=>e.alive && drawEnemy(e));
      bullets.concat(eBullets).forEach(drawBullet);
      drawShip();
      drawParticles();
      step();
      self._raf = requestAnimationFrame(loop);
    }
    reset();
    self._raf = requestAnimationFrame(loop);

    // Input: drag to move, tap to fire
    let dragging=false, lastTap=0;
    self._onTouchStart = (e)=>{
      const t = e.changedTouches[0];
      const r = canvas.getBoundingClientRect();
      const x = t.clientX - r.left;
      ship.x = x;
      dragging = true;
      lastTap = Date.now();
      fire();
    };
    self._onTouchMove = (e)=>{
      e.preventDefault();
      const t = e.changedTouches[0];
      const r = canvas.getBoundingClientRect();
      ship.x = Math.max(10, Math.min(W-10, t.clientX - r.left));
    };
    self._onTouchEnd = ()=>{ dragging=false; };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});
    canvas.addEventListener('touchend', self._onTouchEnd);

    self._onMouse = (e)=>{
      const r = canvas.getBoundingClientRect();
      ship.x = Math.max(10, Math.min(W-10, e.clientX - r.left));
    };
    self._onClick = ()=>{ fire(); };
    canvas.addEventListener('mousemove', self._onMouse);
    canvas.addEventListener('click', self._onClick);

    self._onKey = (e)=>{
      if (e.key==='ArrowLeft') ship.x = Math.max(10, ship.x-14);
      if (e.key==='ArrowRight') ship.x = Math.min(W-10, ship.x+14);
      if (e.key===' ') fire();
    };
    window.addEventListener('keydown', self._onKey);

    // autofire while holding
    self._autoFire = setInterval(()=>{ if (dragging) fire(); }, 180);

    self._onRestart = (e)=>{ e.preventDefault(); reset(); };
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    self._wrap=wrap; self._canvas=canvas; self._restart=restart;
  },
  destroy(){
    cancelAnimationFrame(this._raf);
    clearInterval(this._autoFire);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('touchend', this._onTouchEnd);
      this._canvas.removeEventListener('mousemove', this._onMouse);
      this._canvas.removeEventListener('click', this._onClick);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=null;
  },
};
