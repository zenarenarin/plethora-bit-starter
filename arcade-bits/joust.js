// JOUST — Flap and collide (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Joust', author: 'ArcadeBits', description: 'Tap to flap. Hit enemies from above to win.', tags: ['game'] },
  init(container){
    const self=this;
    const wrap=document.createElement('div');
    wrap.style.cssText='position:absolute;inset:0;background:#000030;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#FFAA00;text-shadow:0 0 6px #FF6600;pointer-events:none;z-index:3;';
    hud.innerHTML='<span id="j-s">SCORE 0</span><span id="j-l">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);
    const flapBtn=document.createElement('button');
    flapBtn.textContent='FLAP';
    flapBtn.style.cssText='position:absolute;bottom:14px;right:14px;width:80px;height:60px;font:bold 14px "Courier New",monospace;color:#000;background:linear-gradient(#FFFF00,#FF9900);border:3px solid #FF0000;border-radius:50%;box-shadow:0 0 12px #FF0000;z-index:4;touch-action:manipulation;';
    wrap.appendChild(flapBtn);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;bottom:14px;left:14px;padding:8px 12px;font:bold 12px "Courier New",monospace;color:#FFF;background:#220044;border:2px solid #FFAA00;border-radius:4px;box-shadow:0 0 10px #FFAA00;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.8);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;
    let player, enemies, eggs, platforms, particles, score, lives, running, tick, wave, spawnQueue;

    function reset(){
      resize();
      platforms = [
        {x:W*0.05, y:H*0.3, w:W*0.35},
        {x:W*0.6, y:H*0.3, w:W*0.35},
        {x:W*0.25, y:H*0.55, w:W*0.5},
        {x:W*0.05, y:H*0.78, w:W*0.25},
        {x:W*0.7, y:H*0.78, w:W*0.25},
        {x:0, y:H-30, w:W}, // ground/lava edge
      ];
      player = { x: W/2, y: H*0.5, vx:0, vy:0, face:1, flapT:0, onGround:false };
      enemies = [];
      eggs = [];
      particles = [];
      spawnQueue = 3;
      wave=1;
      score=0; lives=3; running=true; tick=0;
      spawnEnemy(); spawnEnemy(); spawnEnemy();
      updateHUD(); overlay.style.display='none';
    }
    function spawnEnemy(){
      const ex = Math.random()<0.5 ? 30 : W-30;
      const types = ['bounder','hunter','shadow'];
      const t = types[Math.min(types.length-1, Math.floor(wave/2))];
      enemies.push({x:ex, y:H*0.2, vx: (Math.random()-0.5)*1, vy:0, face: ex<W/2?1:-1, type:t, flapT:0, alive:true});
    }
    function updateHUD(){
      hud.querySelector('#j-s').textContent='SCORE '+score;
      hud.querySelector('#j-l').textContent='LIVES '+'♥'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r=wrap.getBoundingClientRect(); W=r.width; H=r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();
    self._onResize=resize; window.addEventListener('resize', self._onResize);

    function drawBG(){
      ctx.fillStyle='#000030'; ctx.fillRect(0,0,W,H);
      // stars
      for (let i=0;i<60;i++){ const x=(i*97)%W, y=(i*53)%H; ctx.fillStyle='#FFF'; ctx.fillRect(x,y,1,1); }
      // lava at bottom
      const grad = ctx.createLinearGradient(0,H-30,0,H);
      grad.addColorStop(0,'#FF6600');
      grad.addColorStop(0.5,'#FFAA00');
      grad.addColorStop(1,'#FF0000');
      ctx.fillStyle=grad; ctx.fillRect(0,H-30,W,30);
      // lava bubbles
      for (let i=0;i<5;i++){
        const x=(i*173 + tick*2)%W;
        const y=H-10 - Math.sin(tick*0.1+i)*4;
        ctx.fillStyle='#FFFF00'; ctx.fillRect(x,y,3,3);
      }
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawPlatforms(){
      platforms.forEach(p=>{
        if (p.y > H-35) return; // skip ground (drawn as lava)
        ctx.fillStyle='#4488FF';
        ctx.fillRect(p.x, p.y, p.w, 8);
        ctx.fillStyle='#88CCFF';
        ctx.fillRect(p.x, p.y, p.w, 2);
        ctx.fillStyle='#002266';
        ctx.fillRect(p.x, p.y+6, p.w, 2);
      });
    }
    function drawRider(x,y,face,color,flap){
      // steed (bird) + rider
      const f = flap ? (Math.sin(tick*0.5)>0?1:0) : 0;
      ctx.save();
      ctx.translate(x,y);
      ctx.scale(face,1);
      // body
      ctx.fillStyle = color;
      ctx.fillRect(-8,-4, 16, 10);
      // wings
      ctx.fillStyle = color;
      ctx.fillRect(-12, -6 - f*4, 8, 4);
      ctx.fillRect(4, -6 - f*4, 8, 4);
      // neck/head
      ctx.fillStyle = color;
      ctx.fillRect(6, -8, 4, 6);
      // beak
      ctx.fillStyle = '#FFAA00';
      ctx.fillRect(10, -6, 3, 2);
      // rider lance
      ctx.fillStyle = '#C0C0C0';
      ctx.fillRect(10, -12, 12, 2);
      // rider body
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(-2, -14, 6, 8);
      // helmet
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(-3, -18, 8, 4);
      ctx.restore();
    }
    function drawEggs(){
      eggs.forEach(e=>{
        ctx.fillStyle='#FFFFCC';
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 5, 7, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle='#886600'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 5, 7, 0, 0, Math.PI*2); ctx.stroke();
      });
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function boom(x,y,c){ for(let i=0;i<16;i++) particles.push({x,y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,c,life:22,max:22});}

    function landOnPlatform(o){
      for (const p of platforms){
        if (o.x > p.x && o.x < p.x+p.w && o.vy>=0 && Math.abs(o.y - p.y) < 8){
          o.y = p.y;
          o.vy = 0;
          return true;
        }
      }
      return false;
    }

    function step(){
      if (!running) return;
      tick++;
      // player physics
      player.vy += 0.25;
      if (player.vy > 6) player.vy = 6;
      player.x += player.vx;
      player.y += player.vy;
      player.vx *= 0.98;
      // screen wrap
      if (player.x<0) player.x+=W;
      if (player.x>W) player.x-=W;
      // land
      player.onGround = landOnPlatform(player);
      // lava
      if (player.y > H-15){
        lives--; updateHUD(); boom(player.x, H-15, '#FF6600');
        player.x = W/2; player.y = H*0.5; player.vy=0; player.vx=0;
        if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
      }
      if (player.flapT>0) player.flapT--;

      // enemies
      enemies.forEach(e=>{
        if (!e.alive) return;
        e.vy += 0.18;
        if (e.vy>5) e.vy=5;
        // AI: chase player occasionally flap
        if (tick%30===0 && e.y > player.y + 20){ e.vy = -3; e.flapT=8; }
        if (Math.random()<0.02){ e.vx += Math.sign(player.x - e.x)*0.3; e.face = Math.sign(player.x - e.x)||1; }
        e.vx *= 0.98;
        e.x += e.vx; e.y += e.vy;
        if (e.x<0) e.x+=W; if (e.x>W) e.x-=W;
        landOnPlatform(e);
        if (e.y > H-15){ e.alive=false; boom(e.x, H-15, '#FF0000'); score+=50; updateHUD(); }
        if (e.flapT>0) e.flapT--;
        // collide with player
        if (Math.abs(e.x-player.x)<14 && Math.abs(e.y-player.y)<12){
          if (player.y < e.y - 4){
            // player wins
            e.alive=false; score+=250; updateHUD();
            eggs.push({x:e.x, y:e.y, vy:0, hatch:0});
            boom(e.x,e.y,'#FFFF00');
            player.vy = -3;
          } else if (e.y < player.y - 4){
            // player loses
            lives--; updateHUD();
            boom(player.x, player.y, '#FF4444');
            player.x = W/2; player.y = H*0.3; player.vy=0;
            if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
          } else {
            // bounce
            const dx = Math.sign(player.x - e.x)||1;
            player.vx = dx*4; e.vx = -dx*2;
          }
        }
      });
      enemies = enemies.filter(e=>e.alive);

      // eggs: fall, hatch
      eggs.forEach(e=>{
        if (!landOnPlatform(e)){ e.vy += 0.2; e.y += e.vy; }
        e.hatch++;
        if (e.y>H-15){ e.hatch=999; }
        if (e.hatch>180){
          e.done=true;
          if (e.y<H-15){
            enemies.push({x:e.x, y:e.y, vx:0, vy:0, face:1, type:'bounder', flapT:0, alive:true});
          }
        }
        // collect by player
        if (Math.abs(e.x-player.x)<10 && Math.abs(e.y-player.y)<12){ e.done=true; score+=50; updateHUD(); }
      });
      eggs = eggs.filter(e=>!e.done);

      // wave progression
      if (enemies.length===0 && eggs.length===0){
        wave++; score+=200; updateHUD();
        for (let i=0;i<Math.min(5, 2+wave); i++) spawnEnemy();
      }

      particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=0.1; p.life--;});
      particles = particles.filter(p=>p.life>0);
    }
    function flap(){
      if (!running) return;
      player.vy = -3.5;
      player.flapT = 10;
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score} · WAVE ${wave}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG(); drawPlatforms(); drawEggs();
      enemies.forEach(e=>drawRider(e.x,e.y,e.face,e.type==='bounder'?'#AAAAAA':e.type==='hunter'?'#FF2222':'#AA00AA', e.flapT>0));
      drawRider(player.x, player.y, player.face, '#FFFF00', player.flapT>0);
      drawParticles();
      step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    let lastTouchX = null;
    self._onTouchStart=(e)=>{
      const t=e.changedTouches[0];
      const r=canvas.getBoundingClientRect();
      lastTouchX = t.clientX - r.left;
      // steer by touch side
      if (lastTouchX < W/2){ player.vx -= 2; player.face=-1; }
      else { player.vx += 2; player.face=1; }
      flap();
    };
    self._onTouchMove=(e)=>{ e.preventDefault(); };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});

    self._onClick=(e)=>{
      const r=canvas.getBoundingClientRect();
      const x=e.clientX-r.left;
      if (x<W/2){ player.vx-=2; player.face=-1;} else { player.vx+=2; player.face=1;}
      flap();
    };
    canvas.addEventListener('click', self._onClick);

    self._onKey=(e)=>{
      if (e.key===' '||e.key==='ArrowUp') flap();
      if (e.key==='ArrowLeft'){ player.vx-=2; player.face=-1; }
      if (e.key==='ArrowRight'){ player.vx+=2; player.face=1; }
    };
    window.addEventListener('keydown', self._onKey);

    self._onFlap=(e)=>{e.preventDefault(); flap();};
    flapBtn.addEventListener('click', self._onFlap);
    flapBtn.addEventListener('touchstart', self._onFlap, {passive:false});

    self._onRestart=(e)=>{e.preventDefault(); reset();};
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    self._wrap=wrap; self._canvas=canvas; self._restart=restart; self._flapBtn=flapBtn;
  },
  destroy(){
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('click', this._onClick);
    }
    if (this._flapBtn){
      this._flapBtn.removeEventListener('click', this._onFlap);
      this._flapBtn.removeEventListener('touchstart', this._onFlap);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=this._flapBtn=null;
  },
};
