// GYRUSS — Tube shooter, orbit around the ring (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Gyruss', author: 'ArcadeBits', description: 'Drag around the ring. Auto-fires. Blast space waves!', tags: ['game'] },
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
    hud.innerHTML='<span id="gy-s">SCORE 0</span><span id="gy-l">LIVES ▲▲▲</span>';
    wrap.appendChild(hud);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;top:40px;right:14px;padding:6px 12px;font:bold 12px "Courier New",monospace;color:#FFF;background:#000;border:2px solid #00FFFF;border-radius:4px;box-shadow:0 0 10px #00FFFF;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.8);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;
    let cx,cy,R;
    let ship, enemies, bullets, eBullets, particles, score, lives, running, tick, stars, wave, spawnT;

    function reset(){
      resize();
      ship = { a: Math.PI/2, cool:0, invul:60 };
      enemies=[]; bullets=[]; eBullets=[]; particles=[];
      stars=[];
      for (let i=0;i<60;i++) stars.push({a:Math.random()*Math.PI*2, r:Math.random()*R, v:0.5+Math.random()*2});
      score=0; lives=3; running=true; tick=0; wave=1; spawnT=0;
      updateHUD(); overlay.style.display='none';
    }
    function updateHUD(){
      hud.querySelector('#gy-s').textContent='SCORE '+score;
      hud.querySelector('#gy-l').textContent='LIVES '+'▲'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r=wrap.getBoundingClientRect(); W=r.width; H=r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      cx=W/2; cy=H/2+10; R=Math.min(W,H)*0.42;
    }
    resize();
    self._onResize=resize; window.addEventListener('resize', self._onResize);

    function drawBG(){
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      // starfield coming toward you
      stars.forEach(s=>{
        s.r += s.v;
        if (s.r > R) { s.r = 2; s.a = Math.random()*Math.PI*2; }
        const x = cx + Math.cos(s.a)*s.r;
        const y = cy + Math.sin(s.a)*s.r;
        const size = 0.5 + s.r/R*2.5;
        ctx.fillStyle = `rgba(${150+s.r/R*105|0},${150+s.r/R*105|0},255,${0.3+s.r/R*0.7})`;
        ctx.fillRect(x-size/2, y-size/2, size, size);
      });
      // big outer ring
      ctx.strokeStyle='rgba(0,255,255,0.3)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.stroke();
      // inner rings for depth
      for (let i=1;i<=5;i++){
        const rr = R * i/6;
        ctx.strokeStyle = `rgba(0,${100+i*20},255,${0.05+i*0.04})`;
        ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
      }
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawShip(){
      if (ship.invul>0 && tick%6<3) return;
      const x = cx + Math.cos(ship.a)*R;
      const y = cy + Math.sin(ship.a)*R;
      ctx.save(); ctx.translate(x,y); ctx.rotate(ship.a + Math.PI/2);
      ctx.fillStyle='#00FFFF';
      ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(-8,8); ctx.lineTo(0,4); ctx.lineTo(8,8); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#FFFFFF';
      ctx.fillRect(-2,-8,4,4);
      ctx.fillStyle='#FFFF00';
      ctx.fillRect(-6,-2,2,6); ctx.fillRect(4,-2,2,6);
      // thrust
      ctx.fillStyle = tick%2?'#FF9900':'#FFFF00';
      ctx.fillRect(-3, 8, 6, 4);
      ctx.restore();
    }
    function drawEnemy(e){
      // enemies spiral in from center outward
      const x = cx + Math.cos(e.a)*e.r;
      const y = cy + Math.sin(e.a)*e.r;
      const scale = 0.3 + e.r/R*0.9;
      ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale); ctx.rotate(e.a+Math.PI/2);
      if (e.type==='fighter'){
        ctx.fillStyle='#FF2222';
        ctx.fillRect(-8,-6,16,12);
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(-4,-4,8,4);
        ctx.fillStyle='#FFF';
        ctx.fillRect(-1,-2,2,2);
      } else {
        ctx.fillStyle='#FF00FF';
        ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#FFFF00';
        ctx.fillRect(-5,-3,3,3); ctx.fillRect(2,-3,3,3);
      }
      ctx.restore();
    }
    function drawBullet(b){
      // bullets travel outward in the same projected plane
      const x = cx + Math.cos(b.a)*b.r;
      const y = cy + Math.sin(b.a)*b.r;
      const scale = 0.3 + b.r/R*0.9;
      ctx.fillStyle = b.friendly?'#FFFF00':'#FF4444';
      ctx.fillRect(x-2*scale, y-4*scale, 4*scale, 8*scale);
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function boom(x,y,c){ for(let i=0;i<16;i++) particles.push({x,y,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5,c,life:22,max:22});}

    function fire(){
      if (!running) return;
      // bullets start at ship (R) moving inward (r decreases)? Classic Gyruss: bullets go OUTWARD from player toward center? Actually ship is on outer ring, enemies come FROM center, so bullets fire INWARD (toward center). We'll track b.r decreasing from R to 0.
      bullets.push({a: ship.a, r: R-10, friendly:true, life: 60});
    }

    function step(){
      if (!running) return;
      tick++;
      if (ship.invul>0) ship.invul--;
      if (ship.cool>0) ship.cool--;
      // autofire
      if (tick%8===0) fire();

      // spawn waves
      spawnT++;
      if (spawnT > Math.max(20, 60 - wave*3) && enemies.length < 15){
        spawnT = 0;
        // spawn in arc
        const a = Math.random()*Math.PI*2;
        enemies.push({a, r: 10, vr: 0.6 + wave*0.1, va: (Math.random()-0.5)*0.03, type: Math.random()<0.7?'fighter':'saucer', cool: 60+Math.random()*60});
      }

      enemies.forEach(e=>{
        e.r += e.vr;
        e.a += e.va;
        // occasional firing
        e.cool--;
        if (e.cool<=0 && e.r > R*0.3){
          eBullets.push({a:e.a, r:e.r, friendly:false, life:80, vr: 0.8});
          e.cool = 80;
        }
        // reached outside (passed player)
        if (e.r > R+15){
          e.done = true;
        }
      });
      // outbound enemy: hurts ship if matches angle
      enemies.forEach(e=>{
        if (e.done) return;
        const da = ((e.a - ship.a + Math.PI*3) % (Math.PI*2)) - Math.PI;
        if (Math.abs(e.r - R) < 12 && Math.abs(da) < 0.3){
          e.done = true;
          if (ship.invul<=0) hit();
          boom(cx + Math.cos(e.a)*e.r, cy + Math.sin(e.a)*e.r, '#FF2222');
        }
      });
      enemies = enemies.filter(e=>!e.done);

      // bullets: friendly move INWARD
      bullets.forEach(b=>{ b.r -= 6; b.life--; });
      bullets = bullets.filter(b=> b.r>5 && b.life>0);
      // enemy bullets move OUTWARD
      eBullets.forEach(b=>{ b.r += b.vr*3; b.life--; });
      eBullets = eBullets.filter(b=>b.r<R+20 && b.life>0);

      // friendly bullet hits enemy (same angle+radius)
      bullets.forEach(b=>{
        enemies.forEach(e=>{
          if (e.done) return;
          const da = ((e.a - b.a + Math.PI*3) % (Math.PI*2)) - Math.PI;
          if (Math.abs(da) < 0.2 && Math.abs(e.r - b.r) < 10){
            e.done = true; b.life = 0;
            score += e.type==='saucer'?100:50;
            boom(cx+Math.cos(e.a)*e.r, cy+Math.sin(e.a)*e.r, e.type==='saucer'?'#FF00FF':'#FF2222');
            updateHUD();
          }
        });
      });
      // enemy bullet hits ship
      eBullets.forEach(b=>{
        const da = ((b.a - ship.a + Math.PI*3) % (Math.PI*2)) - Math.PI;
        if (Math.abs(da) < 0.2 && Math.abs(b.r - R) < 12 && ship.invul<=0){
          b.life=0; hit();
        }
      });

      // wave tracking: after N kills advance
      if (score > wave*1500) { wave++; }

      particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.life--;});
      particles = particles.filter(p=>p.life>0);
    }
    function hit(){
      lives--; updateHUD();
      boom(cx+Math.cos(ship.a)*R, cy+Math.sin(ship.a)*R, '#00FFFF');
      ship.invul=90;
      if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG(); enemies.forEach(drawEnemy); eBullets.forEach(drawBullet); bullets.forEach(drawBullet); drawShip(); drawParticles(); step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    function setAngleFromPoint(px,py){
      const dx = px-cx, dy=py-cy;
      ship.a = Math.atan2(dy, dx);
    }
    self._onTouchStart=(e)=>{ const t=e.changedTouches[0]; const r=canvas.getBoundingClientRect(); setAngleFromPoint(t.clientX-r.left, t.clientY-r.top); };
    self._onTouchMove=(e)=>{ e.preventDefault(); const t=e.changedTouches[0]; const r=canvas.getBoundingClientRect(); setAngleFromPoint(t.clientX-r.left, t.clientY-r.top); };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});

    self._onMouse=(e)=>{ const r=canvas.getBoundingClientRect(); setAngleFromPoint(e.clientX-r.left, e.clientY-r.top); };
    canvas.addEventListener('mousemove', self._onMouse);

    self._onKey=(e)=>{
      if (e.key==='ArrowLeft') ship.a -= 0.15;
      if (e.key==='ArrowRight') ship.a += 0.15;
      if (e.key===' ') fire();
    };
    window.addEventListener('keydown', self._onKey);

    self._onRestart=(e)=>{e.preventDefault(); reset();};
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart, {passive:false});

    self._wrap=wrap; self._canvas=canvas; self._restart=restart;
  },
  destroy(){
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('mousemove', this._onMouse);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=null;
  },
};
