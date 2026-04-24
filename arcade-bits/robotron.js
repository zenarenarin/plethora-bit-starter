// ROBOTRON: 2084 — Twin stick blaster (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Robotron: 2084', author: 'ArcadeBits', description: 'Left thumb moves, right thumb shoots. Save humans!', tags: ['game'] },
  init(container){
    const self=this;
    const wrap=document.createElement('div');
    wrap.style.cssText='position:absolute;inset:0;background:#000;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#00FFFF;text-shadow:0 0 6px #00FFFF;pointer-events:none;z-index:3;';
    hud.innerHTML='<span id="r-s">SCORE 0</span><span id="r-w">WAVE 1</span><span id="r-l">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;top:40px;right:14px;padding:6px 12px;font:bold 12px "Courier New",monospace;color:#FFF;background:#000;border:2px solid #00FFFF;border-radius:4px;box-shadow:0 0 10px #00FFFF;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    // two touchpads overlays
    const padLeft=document.createElement('div');
    padLeft.style.cssText='position:absolute;left:0;bottom:0;width:50%;height:50%;z-index:2;touch-action:none;';
    wrap.appendChild(padLeft);
    const padRight=document.createElement('div');
    padRight.style.cssText='position:absolute;right:0;bottom:0;width:50%;height:50%;z-index:2;touch-action:none;';
    wrap.appendChild(padRight);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.8);z-index:5;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);
    // stick indicators
    const leftStick=document.createElement('div');
    leftStick.style.cssText='position:absolute;left:30px;bottom:30px;width:80px;height:80px;border:2px dashed rgba(0,255,255,0.5);border-radius:50%;z-index:3;pointer-events:none;';
    wrap.appendChild(leftStick);
    const rightStick=document.createElement('div');
    rightStick.style.cssText='position:absolute;right:30px;bottom:30px;width:80px;height:80px;border:2px dashed rgba(255,0,255,0.5);border-radius:50%;z-index:3;pointer-events:none;';
    wrap.appendChild(rightStick);
    // labels
    const lbl=document.createElement('div');
    lbl.innerHTML='<div style="position:absolute;left:12px;bottom:115px;color:#00FFFF;font:bold 10px monospace;z-index:3;pointer-events:none;">MOVE</div><div style="position:absolute;right:12px;bottom:115px;color:#FF00FF;font:bold 10px monospace;z-index:3;pointer-events:none;">SHOOT</div>';
    wrap.appendChild(lbl);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;
    let player, enemies, humans, bullets, particles, score, lives, wave, running, tick, spawnT;
    let mvx=0,mvy=0, shx=0,shy=0;

    function reset(){
      resize();
      player = { x:W/2, y:H/2, cool:0, invul:60 };
      enemies = []; humans = []; bullets = []; particles = [];
      for (let i=0;i<3;i++) humans.push({x:Math.random()*(W-80)+40, y:Math.random()*(H-80)+40, alive:true});
      for (let i=0;i<6;i++) spawnEnemy('grunt');
      wave=1; score=0; lives=3; running=true; tick=0; spawnT=0;
      updateHUD(); overlay.style.display='none';
    }
    function spawnEnemy(type){
      const edge = (Math.random()*4)|0;
      let x,y;
      if (edge===0){x=Math.random()*W;y=20;}
      else if (edge===1){x=Math.random()*W;y=H-20;}
      else if (edge===2){x=20;y=Math.random()*H;}
      else {x=W-20;y=Math.random()*H;}
      enemies.push({x,y,type,alive:true,t:Math.random()*60, cool:Math.random()*60});
    }
    function updateHUD(){
      hud.querySelector('#r-s').textContent='SCORE '+score;
      hud.querySelector('#r-w').textContent='WAVE '+wave;
      hud.querySelector('#r-l').textContent='LIVES '+'♥'.repeat(Math.max(0,lives));
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
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      // grid
      ctx.strokeStyle='rgba(0,200,255,0.08)'; ctx.lineWidth=1;
      for (let x=0;x<W;x+=20){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
      for (let y=0;y<H;y+=20){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      // border
      ctx.strokeStyle='#00FFFF'; ctx.lineWidth=2;
      ctx.strokeRect(4, 44, W-8, H-48);
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawPlayer(){
      if (player.invul>0 && tick%6<3) return;
      const x=player.x,y=player.y;
      ctx.fillStyle='#FFFFFF';
      ctx.fillRect(x-6, y-8, 12, 16);
      ctx.fillStyle='#00FFFF';
      ctx.fillRect(x-6, y-8, 12, 4);
      ctx.fillStyle='#FF00FF';
      ctx.fillRect(x-4, y-4, 8, 4);
      ctx.fillStyle='#000';
      ctx.fillRect(x-3, y-7, 2, 2);
      ctx.fillRect(x+1, y-7, 2, 2);
    }
    function drawEnemy(e){
      if (!e.alive) return;
      const x=e.x, y=e.y;
      if (e.type==='grunt'){
        ctx.fillStyle='#FF2222';
        ctx.fillRect(x-6,y-8,12,16);
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(x-4,y-6,3,3);
        ctx.fillRect(x+1,y-6,3,3);
        ctx.fillStyle='#000';
        ctx.fillRect(x-3,y-5,1,1);
        ctx.fillRect(x+2,y-5,1,1);
      } else if (e.type==='hulk'){
        ctx.fillStyle='#00FF00';
        ctx.fillRect(x-8,y-10,16,20);
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(x-6,y-8,4,4);
        ctx.fillRect(x+2,y-8,4,4);
        ctx.fillStyle='#FF0000';
        ctx.fillRect(x-5,y-7,2,2);
        ctx.fillRect(x+3,y-7,2,2);
      } else {
        // brain
        ctx.fillStyle='#FF00FF';
        ctx.beginPath(); ctx.arc(x,y-2, 8, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle='#FFAAFF'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(x-2,y-2,2,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(x-1,y,2,2);
      }
    }
    function drawHuman(h){
      if (!h.alive) return;
      const x=h.x,y=h.y;
      ctx.fillStyle='#FFCC99';
      ctx.fillRect(x-2, y-8, 4, 4);
      ctx.fillStyle='#00FFFF';
      ctx.fillRect(x-2, y-4, 4, 5);
      ctx.fillStyle='#FFFFFF';
      ctx.fillRect(x-3, y+1, 2, 3);
      ctx.fillRect(x+1, y+1, 2, 3);
    }
    function drawBullets(){
      bullets.forEach(b=>{
        ctx.fillStyle=b.friendly?'#FFFFFF':'#FF4444';
        ctx.fillRect(b.x-2, b.y-2, 4, 4);
        ctx.fillStyle=b.friendly?'#00FFFF':'#FF0000';
        ctx.fillRect(b.x-3,b.y-3,6,6);
        ctx.globalAlpha=0.4;
        ctx.fillRect(b.x-5,b.y-5,10,10);
        ctx.globalAlpha=1;
      });
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function boom(x,y,c){ for(let i=0;i<16;i++) particles.push({x,y,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6,c,life:22,max:22});}

    function step(){
      if (!running) return;
      tick++;
      if (player.invul>0) player.invul--;
      // move
      player.x = Math.max(14, Math.min(W-14, player.x + mvx*3));
      player.y = Math.max(58, Math.min(H-14, player.y + mvy*3));
      // shoot
      if ((Math.abs(shx)>0.2 || Math.abs(shy)>0.2) && player.cool<=0){
        const m = Math.hypot(shx,shy);
        bullets.push({x:player.x, y:player.y, vx:shx/m*7, vy:shy/m*7, life:60, friendly:true});
        player.cool = 6;
      }
      if (player.cool>0) player.cool--;

      // enemies
      spawnT++;
      if (spawnT>180 && enemies.filter(e=>e.alive).length < 10+wave){ spawnT=0; spawnEnemy(wave>2&&Math.random()<0.3?'brain':(Math.random()<0.2?'hulk':'grunt')); }
      enemies.forEach(e=>{
        if (!e.alive) return;
        const dx = player.x - e.x, dy = player.y - e.y;
        const d = Math.hypot(dx,dy)||1;
        const sp = e.type==='hulk'?0.6:e.type==='brain'?0.8:1.1;
        e.x += dx/d*sp; e.y += dy/d*sp;
        // hulks hunt humans, brains fire
        if (e.type==='brain'){
          e.cool--;
          if (e.cool<=0 && Math.random()<0.01){
            bullets.push({x:e.x, y:e.y, vx:dx/d*3, vy:dy/d*3, life:120, friendly:false});
            e.cool=60;
          }
        }
        // hulks crush humans
        if (e.type==='hulk'){
          humans.forEach(h=>{ if (h.alive && Math.abs(h.x-e.x)<10 && Math.abs(h.y-e.y)<12){ h.alive=false; boom(h.x,h.y,'#FFCC99'); } });
        }
      });

      // bullets
      bullets.forEach(b=>{ b.x += b.vx; b.y += b.vy; b.life--; });
      bullets = bullets.filter(b=>b.life>0 && b.x>0 && b.x<W && b.y>40 && b.y<H);

      // collisions: friendly bullet vs enemy
      bullets.forEach(b=>{
        if (!b.friendly) return;
        enemies.forEach(e=>{
          if (!e.alive) return;
          if (Math.abs(b.x-e.x)<10 && Math.abs(b.y-e.y)<12){
            if (e.type==='hulk'){ // hulks not killable, knock back
              e.x += b.vx*2; e.y += b.vy*2; b.life=0;
            } else {
              e.alive=false; b.life=0;
              score += e.type==='brain'?500:100;
              boom(e.x,e.y, e.type==='brain'?'#FF00FF':'#FF2222');
              updateHUD();
            }
          }
        });
      });
      // enemy bullet / contact vs player
      if (player.invul<=0){
        bullets.forEach(b=>{
          if (b.friendly) return;
          if (Math.abs(b.x-player.x)<8 && Math.abs(b.y-player.y)<8){
            b.life=0; hit();
          }
        });
        enemies.forEach(e=>{
          if (!e.alive) return;
          if (Math.abs(e.x-player.x)<10 && Math.abs(e.y-player.y)<12){ hit(); }
        });
      }
      // rescue humans
      humans.forEach(h=>{
        if (!h.alive) return;
        if (Math.abs(h.x-player.x)<12 && Math.abs(h.y-player.y)<14){
          h.alive=false;
          score += 1000; updateHUD();
          boom(h.x,h.y, '#00FFFF');
        }
      });
      // wave advance when all grunts gone
      if (enemies.filter(e=>e.alive && e.type!=='hulk').length===0){
        wave++; score+=500; updateHUD();
        for (let i=0;i<3;i++) humans.push({x:Math.random()*(W-80)+40, y:Math.random()*(H-80)+40, alive:true});
        for (let i=0;i<6+wave;i++) spawnEnemy(Math.random()<0.25?'hulk':(Math.random()<0.15&&wave>1?'brain':'grunt'));
      }
      particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.life--;});
      particles = particles.filter(p=>p.life>0);
    }
    function hit(){
      lives--; updateHUD();
      boom(player.x, player.y, '#00FFFF');
      player.x=W/2; player.y=H/2; player.invul=90;
      if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score} · WAVE ${wave}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG();
      humans.forEach(drawHuman);
      enemies.forEach(drawEnemy);
      drawBullets();
      drawPlayer();
      drawParticles();
      step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    // Stick touch: each half. Tracks ID so multi-touch works
    let leftId=null, leftOrig={x:0,y:0};
    let rightId=null, rightOrig={x:0,y:0};
    function handleTouchStart(e){
      for (const t of e.changedTouches){
        const r = wrap.getBoundingClientRect();
        const x = t.clientX - r.left;
        if (x < W/2 && leftId===null){ leftId=t.identifier; leftOrig={x:t.clientX,y:t.clientY}; mvx=0; mvy=0; }
        else if (x >= W/2 && rightId===null){ rightId=t.identifier; rightOrig={x:t.clientX,y:t.clientY}; shx=0; shy=0; }
      }
    }
    function handleTouchMove(e){
      e.preventDefault();
      for (const t of e.changedTouches){
        if (t.identifier===leftId){
          const dx = t.clientX - leftOrig.x, dy = t.clientY - leftOrig.y;
          const d = Math.hypot(dx,dy);
          const max = 50;
          if (d > max){ mvx = dx/d; mvy = dy/d; } else { mvx = dx/max; mvy = dy/max; }
        } else if (t.identifier===rightId){
          const dx = t.clientX - rightOrig.x, dy = t.clientY - rightOrig.y;
          const d = Math.hypot(dx,dy);
          const max = 50;
          if (d > max){ shx = dx/d; shy = dy/d; } else { shx = dx/max; shy = dy/max; }
        }
      }
    }
    function handleTouchEnd(e){
      for (const t of e.changedTouches){
        if (t.identifier===leftId){ leftId=null; mvx=0; mvy=0; }
        if (t.identifier===rightId){ rightId=null; shx=0; shy=0; }
      }
    }
    wrap.addEventListener('touchstart', handleTouchStart, {passive:true});
    wrap.addEventListener('touchmove', handleTouchMove, {passive:false});
    wrap.addEventListener('touchend', handleTouchEnd);
    wrap.addEventListener('touchcancel', handleTouchEnd);
    self._onTouchStart=handleTouchStart;
    self._onTouchMove=handleTouchMove;
    self._onTouchEnd=handleTouchEnd;

    // Keyboard: WASD move, arrows shoot
    self._onKey=(e)=>{
      if (e.key==='w'||e.key==='W') mvy=-1;
      if (e.key==='s'||e.key==='S') mvy=1;
      if (e.key==='a'||e.key==='A') mvx=-1;
      if (e.key==='d'||e.key==='D') mvx=1;
      if (e.key==='ArrowUp') shy=-1;
      if (e.key==='ArrowDown') shy=1;
      if (e.key==='ArrowLeft') shx=-1;
      if (e.key==='ArrowRight') shx=1;
    };
    self._onKeyUp=(e)=>{
      if (e.key==='w'||e.key==='W'||e.key==='s'||e.key==='S') mvy=0;
      if (e.key==='a'||e.key==='A'||e.key==='d'||e.key==='D') mvx=0;
      if (e.key==='ArrowUp'||e.key==='ArrowDown') shy=0;
      if (e.key==='ArrowLeft'||e.key==='ArrowRight') shx=0;
    };
    window.addEventListener('keydown', self._onKey);
    window.addEventListener('keyup', self._onKeyUp);

    self._onRestart=(e)=>{e.preventDefault(); reset();};
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    self._wrap=wrap; self._canvas=canvas; self._restart=restart;
  },
  destroy(){
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this._wrap){
      this._wrap.removeEventListener('touchstart', this._onTouchStart);
      this._wrap.removeEventListener('touchmove', this._onTouchMove);
      this._wrap.removeEventListener('touchend', this._onTouchEnd);
      this._wrap.removeEventListener('touchcancel', this._onTouchEnd);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=null;
  },
};
