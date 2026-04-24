// MISSILE COMMAND — Defend the cities (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Missile Command', author: 'ArcadeBits', description: 'Tap anywhere to launch counter-missiles. Protect the cities!', tags: ['game'] },
  init(container){
    const self=this;
    const wrap=document.createElement('div');
    wrap.style.cssText='position:absolute;inset:0;background:#000010;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#FFFF00;text-shadow:0 0 6px #FFAA00;pointer-events:none;z-index:3;';
    hud.innerHTML='<span id="m-s">SCORE 0</span><span id="m-c">CITIES 🏛️🏛️🏛️🏛️🏛️🏛️</span><span id="m-w">WAVE 1</span>';
    wrap.appendChild(hud);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;top:40px;right:14px;padding:6px 12px;font:bold 12px "Courier New",monospace;color:#FFF;background:#220000;border:2px solid #FF0000;border-radius:4px;box-shadow:0 0 10px #FF0000;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.8);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;
    let cities, bases, incoming, counter, explosions, particles, score, wave, running, tick, spawnT, enemiesLeft;

    function reset(){
      resize();
      cities = [];
      for (let i=0;i<6;i++) cities.push({x:W*(0.1 + i*0.14 + (i>=3?0.1:0)), alive:true});
      bases = [
        {x:W*0.08, ammo:10},
        {x:W*0.5, ammo:10},
        {x:W*0.92, ammo:10},
      ];
      incoming=[]; counter=[]; explosions=[]; particles=[];
      score=0; wave=1; running=true; tick=0; spawnT=0; enemiesLeft=12;
      updateHUD(); overlay.style.display='none';
    }
    function updateHUD(){
      hud.querySelector('#m-s').textContent='SCORE '+score;
      hud.querySelector('#m-c').textContent='CITIES '+ (cities?'🏛️'.repeat(cities.filter(c=>c.alive).length):'');
      hud.querySelector('#m-w').textContent='WAVE '+wave;
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
      // stars
      ctx.fillStyle='#000010'; ctx.fillRect(0,0,W,H);
      for (let i=0;i<40;i++){
        const x=(i*137)%W, y=(i*89)%H;
        ctx.fillStyle = (tick+i)%120<60?'#FFF':'#88AACC';
        ctx.fillRect(x,y,1,1);
      }
      // ground
      ctx.fillStyle='#222244'; ctx.fillRect(0,H-40,W,40);
      ctx.fillStyle='#001133';
      ctx.fillRect(0,H-44,W,4);
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawCities(){
      cities.forEach(c=>{
        if (!c.alive) return;
        const x=c.x, y=H-40;
        ctx.fillStyle='#44AAFF';
        ctx.fillRect(x-8, y-20, 16, 20);
        ctx.fillStyle='#0066CC';
        ctx.fillRect(x-10, y-22, 20, 4);
        ctx.fillStyle='#FFFF00';
        for (let i=0;i<3;i++) for (let j=0;j<2;j++){
          if ((tick+i+j)%80<40) ctx.fillRect(x-6+i*5, y-15+j*6, 2, 3);
        }
      });
    }
    function drawBases(){
      bases.forEach(b=>{
        const x=b.x, y=H-40;
        ctx.fillStyle = b.ammo>0?'#00FF66':'#666666';
        ctx.beginPath(); ctx.moveTo(x,y-20); ctx.lineTo(x-12,y); ctx.lineTo(x+12,y); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#FFFFFF';
        ctx.font='bold 10px "Courier New"';
        ctx.fillText(b.ammo, x-4, y-6);
      });
    }
    function drawIncoming(){
      incoming.forEach(m=>{
        ctx.strokeStyle='#FF4444';
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(m.sx, m.sy); ctx.lineTo(m.x, m.y); ctx.stroke();
        ctx.fillStyle='#FFFF00';
        ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, Math.PI*2); ctx.fill();
      });
    }
    function drawCounter(){
      counter.forEach(m=>{
        ctx.strokeStyle='#00FFFF';
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(m.sx,m.sy); ctx.lineTo(m.x,m.y); ctx.stroke();
        ctx.fillStyle='#FFFFFF';
        ctx.beginPath(); ctx.arc(m.x, m.y, 2, 0, Math.PI*2); ctx.fill();
      });
    }
    function drawExplosions(){
      explosions.forEach(e=>{
        const r = (1-e.life/e.max)*e.maxR;
        ctx.fillStyle = `rgba(255,${200*(e.life/e.max)+55|0},0,${e.life/e.max*0.8})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle='#FFFFFF';
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI*2); ctx.stroke();
      });
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function addExplosion(x,y,r=40){ explosions.push({x,y,life:40,max:40,maxR:r}); }

    function step(){
      if (!running) return;
      tick++;
      spawnT++;
      if (spawnT>Math.max(20, 80-wave*5) && enemiesLeft>0){
        spawnT=0;
        const sx=Math.random()*W;
        const targets = cities.filter(c=>c.alive);
        if (targets.length===0){ running=false; showOverlay('GAME OVER','#FF2244'); return; }
        const target = targets[(Math.random()*targets.length)|0];
        const angle = Math.atan2(H-60-0, target.x - sx);
        const s = 1.2 + wave*0.15;
        incoming.push({x:sx, y:0, sx, sy:0, vx:Math.cos(angle)*s, vy:Math.sin(angle)*s, target});
        enemiesLeft--;
      }
      incoming.forEach(m=>{ m.x+=m.vx; m.y+=m.vy; });
      counter.forEach(m=>{
        const dx=m.tx-m.x, dy=m.ty-m.y;
        const d=Math.hypot(dx,dy);
        if (d<4){ addExplosion(m.tx,m.ty,36); m.done=true; }
        else { m.x += dx/d*4; m.y += dy/d*4; }
      });
      counter = counter.filter(m=>!m.done);

      // explosions kill missiles
      explosions.forEach(e=>{
        const r=(1-e.life/e.max)*e.maxR;
        for (let i=incoming.length-1;i>=0;i--){
          const m=incoming[i];
          if (Math.hypot(m.x-e.x, m.y-e.y) < r){
            incoming.splice(i,1); score+=25; updateHUD();
            for(let k=0;k<10;k++) particles.push({x:m.x,y:m.y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,c:'#FFFF00',life:20,max:20});
          }
        }
        e.life--;
      });
      explosions = explosions.filter(e=>e.life>0);

      // incoming hits ground
      for (let i=incoming.length-1;i>=0;i--){
        const m=incoming[i];
        if (m.y >= H-40){
          addExplosion(m.x,m.y,30);
          // kill city if near
          cities.forEach(c=>{ if (c.alive && Math.abs(c.x-m.x)<12) c.alive=false; });
          incoming.splice(i,1); updateHUD();
        }
      }

      // wave complete
      if (incoming.length===0 && enemiesLeft<=0){
        wave++; enemiesLeft = 12 + wave*2;
        bases.forEach(b=> b.ammo = 10);
        score += 100 + cities.filter(c=>c.alive).length*100;
        updateHUD();
      }
      if (cities.every(c=>!c.alive)){ running=false; showOverlay('GAME OVER','#FF2244'); }

      particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.life--;});
      particles = particles.filter(p=>p.life>0);
    }
    function shoot(tx,ty){
      if (!running) return;
      // find closest base with ammo
      const avail = bases.filter(b=>b.ammo>0);
      if (!avail.length) return;
      let best=avail[0], bd=Infinity;
      avail.forEach(b=>{ const d=Math.abs(b.x-tx); if (d<bd){bd=d; best=b;} });
      best.ammo--;
      counter.push({x:best.x, y:H-40, sx:best.x, sy:H-40, tx, ty, done:false});
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score} · WAVE ${wave}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }

    function loop(){
      drawBG(); drawCities(); drawBases(); drawIncoming(); drawCounter(); drawExplosions(); drawParticles(); step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    self._onTouchStart=(e)=>{
      const t=e.changedTouches[0];
      const r=canvas.getBoundingClientRect();
      shoot(t.clientX-r.left, t.clientY-r.top);
    };
    self._onTouchMove=(e)=>{ e.preventDefault(); };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});

    self._onClick=(e)=>{
      const r=canvas.getBoundingClientRect();
      shoot(e.clientX-r.left, e.clientY-r.top);
    };
    canvas.addEventListener('click', self._onClick);

    self._onRestart=(e)=>{e.preventDefault(); reset();};
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    self._wrap=wrap; self._canvas=canvas; self._restart=restart;
  },
  destroy(){
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
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
