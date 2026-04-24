// DEFENDER — Scrolling shooter, rescue humanoids (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Defender', author: 'ArcadeBits', description: 'Fly, shoot, rescue. Dont let them take the humans.', tags: ['game'] },
  init(container){
    const self=this;
    const wrap=document.createElement('div');
    wrap.style.cssText='position:absolute;inset:0;background:#000;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#00FF00;text-shadow:0 0 6px #00FF00;pointer-events:none;z-index:3;';
    hud.innerHTML='<span id="d-s">SCORE 0</span><span id="d-h">HUMANS 5</span><span id="d-l">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);
    const fireBtn=document.createElement('button');
    fireBtn.textContent='FIRE';
    fireBtn.style.cssText='position:absolute;bottom:14px;right:14px;width:80px;height:60px;font:bold 14px "Courier New",monospace;color:#000;background:linear-gradient(#00FFAA,#008844);border:3px solid #00FF00;border-radius:50%;box-shadow:0 0 12px #00FF00;z-index:4;touch-action:manipulation;';
    wrap.appendChild(fireBtn);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;bottom:14px;left:14px;padding:8px 12px;font:bold 12px "Courier New",monospace;color:#FFF;background:#003300;border:2px solid #00FF00;border-radius:4px;box-shadow:0 0 10px #00FF00;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.8);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;
    const WORLD=1600;
    let ship, bullets, enemies, humans, particles, score, lives, running, tick, cameraX;

    function reset(){
      resize();
      ship = { x: WORLD/2, y: H/2, vx:0, vy:0, face:1, cool:0 };
      bullets = []; enemies = []; humans = []; particles = [];
      for (let i=0;i<5;i++) humans.push({x: 200 + i*250, y: H-40, vy:0, captured:null, alive:true});
      for (let i=0;i<8;i++) enemies.push({x:Math.random()*WORLD, y:Math.random()*H*0.5 + 40, vx:0, vy:0, type:'lander', alive:true, t:0, target:null});
      score=0; lives=3; running=true; tick=0; cameraX=0;
      updateHUD(); overlay.style.display='none';
    }
    function updateHUD(){
      hud.querySelector('#d-s').textContent='SCORE '+score;
      hud.querySelector('#d-h').textContent='HUMANS '+humans.filter(h=>h.alive).length;
      hud.querySelector('#d-l').textContent='LIVES '+'♥'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r=wrap.getBoundingClientRect(); W=r.width; H=r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();
    self._onResize=resize; window.addEventListener('resize', self._onResize);

    function WX(x){ return ((x - cameraX) % WORLD + WORLD) % WORLD; }
    function onScreen(x){ const sx = WX(x); return sx < W+20; }

    function drawBG(){
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      // stars
      for (let i=0;i<80;i++){
        const sx = ((i*127 - cameraX*0.3)%W + W)%W;
        const sy = (i*67)%H;
        ctx.fillStyle = (i%3===0)?'#FFF':'#AACCFF';
        ctx.fillRect(sx, sy, 1, 1);
      }
      // terrain (jagged)
      ctx.strokeStyle='#00FF00';
      ctx.lineWidth=2;
      ctx.beginPath();
      for (let x=0;x<W+20;x+=10){
        const wx = (x + cameraX)%WORLD;
        const y = H-30 + Math.sin(wx*0.03)*8 + Math.sin(wx*0.1)*4;
        if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      // radar at top
      ctx.fillStyle='rgba(0,40,0,0.8)';
      ctx.fillRect(W*0.2, 28, W*0.6, 10);
      ctx.strokeStyle='#00FF00';
      ctx.strokeRect(W*0.2, 28, W*0.6, 10);
      // show player & enemies on radar
      const rw=W*0.6;
      ctx.fillStyle='#FFFF00';
      ctx.fillRect(W*0.2 + (ship.x/WORLD)*rw - 1, 30, 2, 6);
      enemies.forEach(e=>{ if (!e.alive) return;
        ctx.fillStyle=e.type==='lander'?'#FF2222':'#FF00FF';
        ctx.fillRect(W*0.2 + (e.x/WORLD)*rw - 1, 30, 2, 6);
      });
      humans.forEach(h=>{ if (!h.alive) return;
        ctx.fillStyle='#00FFFF';
        ctx.fillRect(W*0.2 + (h.x/WORLD)*rw - 1, 34, 1, 3);
      });
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawShip(){
      const x = WX(ship.x), y=ship.y;
      ctx.save(); ctx.translate(x,y); ctx.scale(ship.face, 1);
      ctx.fillStyle='#00FFFF';
      ctx.fillRect(-10, -4, 20, 8);
      ctx.fillRect(8, -2, 6, 4);
      ctx.fillStyle='#FFFF00';
      ctx.fillRect(-14, -2, 4, 4);
      ctx.fillStyle='#FFF';
      ctx.fillRect(0, -3, 4, 2);
      // thruster
      if (Math.abs(ship.vx)>0.5) { ctx.fillStyle = tick%2?'#FF6600':'#FFFF00'; ctx.fillRect(-16, -1, -4, 2); }
      ctx.restore();
    }
    function drawEnemy(e){
      if (!onScreen(e.x)) return;
      const x=WX(e.x), y=e.y;
      if (e.type==='lander'){
        ctx.fillStyle='#FF2222';
        ctx.fillRect(x-6, y-5, 12, 10);
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(x-3, y-3, 6, 4);
        ctx.fillStyle='#FFFFFF';
        ctx.fillRect(x-1, y-2, 2, 2);
        // legs
        ctx.strokeStyle='#FF2222'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(x-6, y+5); ctx.lineTo(x-8, y+9);
        ctx.moveTo(x+6, y+5); ctx.lineTo(x+8, y+9); ctx.stroke();
      } else {
        // mutant
        ctx.fillStyle='#FF00FF';
        ctx.fillRect(x-6, y-6, 12, 12);
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(x-4, y-4, 3, 3);
        ctx.fillRect(x+1, y-4, 3, 3);
      }
    }
    function drawHuman(h){
      if (!h.alive) return;
      if (!onScreen(h.x)) return;
      const x=WX(h.x), y=h.y;
      ctx.fillStyle='#00FFFF';
      ctx.fillRect(x-2, y-8, 4, 5);
      ctx.fillStyle='#FFCC99';
      ctx.fillRect(x-2, y-12, 4, 4);
      ctx.fillStyle='#FFFFFF';
      ctx.fillRect(x-3, y-3, 2, 3);
      ctx.fillRect(x+1, y-3, 2, 3);
      if (h.captured){
        ctx.strokeStyle='#FF00FF';
        ctx.beginPath(); ctx.moveTo(x, y-12); ctx.lineTo(WX(h.captured.x), h.captured.y+4); ctx.stroke();
      }
    }
    function drawBullets(){
      bullets.forEach(b=>{
        const x=WX(b.x);
        ctx.fillStyle = b.friendly?'#FFFF00':'#FF4444';
        ctx.fillRect(x-4, b.y-1, 8, 2);
        ctx.fillStyle='#FFF';
        ctx.fillRect(x-1, b.y-1, 2, 2);
      });
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function boom(x,y,c){ const sx=WX(x); for(let i=0;i<16;i++) particles.push({x:sx,y,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5,c,life:22,max:22});}

    function fire(){
      if (!running) return;
      if (ship.cool<=0){
        bullets.push({x:ship.x + ship.face*14, y:ship.y, vx:ship.face*12, friendly:true, life:30});
        ship.cool=6;
      }
    }

    let upD=false, downD=false, leftD=false, rightD=false;

    function step(){
      if (!running) return;
      tick++;
      // controls
      if (leftD){ ship.vx -= 0.3; ship.face=-1; }
      if (rightD){ ship.vx += 0.3; ship.face=1; }
      if (upD) ship.vy -= 0.3;
      if (downD) ship.vy += 0.3;
      ship.vx = Math.max(-6, Math.min(6, ship.vx*0.95));
      ship.vy = Math.max(-4, Math.min(4, ship.vy*0.92));
      ship.x = (ship.x + ship.vx + WORLD) % WORLD;
      ship.y = Math.max(60, Math.min(H-40, ship.y + ship.vy));
      cameraX = (ship.x - W/2 + WORLD) % WORLD;
      if (ship.cool>0) ship.cool--;

      bullets.forEach(b=>{ b.x = (b.x + b.vx + WORLD)%WORLD; b.life--; });
      bullets = bullets.filter(b=>b.life>0);

      enemies.forEach(e=>{
        if (!e.alive) return;
        e.t++;
        if (e.type==='lander'){
          // find nearest un-captured human
          if (!e.target){
            const avail = humans.filter(h=>h.alive && !h.captured);
            if (avail.length){
              e.target = avail[(Math.random()*avail.length)|0];
            }
          }
          if (e.target && e.target.alive && !e.target.captured){
            const dx = e.target.x - e.x, dy = e.target.y - e.y - 20;
            e.vx = Math.sign(dx)*0.7;
            e.vy = Math.sign(dy)*0.5;
            if (Math.abs(dx)<3 && Math.abs(e.y - e.target.y + 20)<4){
              e.target.captured = e;
            }
          } else {
            // random drift
            e.vy -= 0.05;
          }
          // carrying up
          if (e.target && e.target.captured===e){
            e.vy = -0.8;
            e.target.x = e.x; e.target.y = e.y + 12;
            if (e.y < 50){
              // became mutant
              e.type='mutant';
              e.target.alive=false;
              e.target.captured=null;
              e.target=null;
            }
          }
          // fire occasionally
          if (tick%80===0 && Math.abs(e.x - ship.x)<W/2){
            const dx = ship.x - e.x, dy = ship.y - e.y;
            const d = Math.hypot(dx,dy);
            bullets.push({x:e.x, y:e.y, vx:dx/d*3, vy:dy/d*3, friendly:false, life:80});
          }
        } else {
          // mutant: chase ship
          const dx = ship.x - e.x, dy = ship.y - e.y;
          const d = Math.hypot(dx,dy)||1;
          e.vx = dx/d*1.2; e.vy = dy/d*1.2;
        }
        e.x = (e.x + (e.vx||0) + WORLD)%WORLD;
        e.y = Math.max(40, Math.min(H-30, e.y + (e.vy||0)));
      });

      // collisions
      bullets.forEach(b=>{
        if (!b.friendly) return;
        enemies.forEach(e=>{
          if (!e.alive) return;
          let dx = e.x - b.x; if (dx>WORLD/2) dx-=WORLD; if (dx<-WORLD/2) dx+=WORLD;
          if (Math.abs(dx)<10 && Math.abs(e.y - b.y)<8){
            e.alive=false; b.life=0;
            score += e.type==='mutant'?150:50;
            if (e.target) e.target.captured=null;
            boom(e.x,e.y,e.type==='mutant'?'#FF00FF':'#FF2222');
            updateHUD();
          }
        });
      });
      // enemy bullet hits player
      bullets.forEach(b=>{
        if (b.friendly) return;
        let dx = ship.x - b.x; if (dx>WORLD/2) dx-=WORLD; if (dx<-WORLD/2) dx+=WORLD;
        if (Math.abs(dx)<10 && Math.abs(ship.y - b.y)<8){
          b.life=0; lives--; updateHUD();
          boom(ship.x, ship.y, '#00FFFF');
          if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
        }
      });

      // wave cleared
      if (enemies.every(e=>!e.alive)){
        for (let i=0;i<6;i++) enemies.push({x:Math.random()*WORLD, y:60+Math.random()*100, vx:0, vy:0, type:'lander', alive:true, t:0, target:null});
      }

      particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.life--;});
      particles = particles.filter(p=>p.life>0);
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG(); humans.forEach(drawHuman); enemies.forEach(drawEnemy); drawBullets(); drawShip(); drawParticles(); step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    // touch: drag to move, tap (quick) fires
    let sx=0, sy=0, touched=false, moveT=null;
    self._onTouchStart=(e)=>{
      const t=e.changedTouches[0];
      sx=t.clientX; sy=t.clientY; touched=true;
      moveT = t;
    };
    self._onTouchMove=(e)=>{
      e.preventDefault();
      const t=e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      leftD = dx < -12;
      rightD = dx > 12;
      upD = dy < -12;
      downD = dy > 12;
    };
    self._onTouchEnd=(e)=>{
      const t=e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.hypot(dx,dy)<12) fire();
      leftD=rightD=upD=downD=false; touched=false;
    };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});
    canvas.addEventListener('touchend', self._onTouchEnd);

    self._onKey=(e)=>{
      if (e.key==='ArrowLeft') leftD=true;
      if (e.key==='ArrowRight') rightD=true;
      if (e.key==='ArrowUp') upD=true;
      if (e.key==='ArrowDown') downD=true;
      if (e.key===' ') fire();
    };
    self._onKeyUp=(e)=>{
      if (e.key==='ArrowLeft') leftD=false;
      if (e.key==='ArrowRight') rightD=false;
      if (e.key==='ArrowUp') upD=false;
      if (e.key==='ArrowDown') downD=false;
    };
    window.addEventListener('keydown', self._onKey);
    window.addEventListener('keyup', self._onKeyUp);

    self._onFire=(e)=>{e.preventDefault(); fire();};
    fireBtn.addEventListener('click', self._onFire);
    fireBtn.addEventListener('touchstart', self._onFire, {passive:false});

    // autofire while dragging
    self._autoFire = setInterval(()=>{ if (touched && (leftD||rightD||upD||downD)) fire(); }, 150);

    self._onRestart=(e)=>{e.preventDefault(); reset();};
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    self._wrap=wrap; self._canvas=canvas; self._restart=restart; self._fireBtn=fireBtn;
  },
  destroy(){
    cancelAnimationFrame(this._raf);
    clearInterval(this._autoFire);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('touchend', this._onTouchEnd);
    }
    if (this._fireBtn){
      this._fireBtn.removeEventListener('click', this._onFire);
      this._fireBtn.removeEventListener('touchstart', this._onFire);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=this._fireBtn=null;
  },
};
