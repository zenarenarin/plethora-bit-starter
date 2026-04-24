// TEMPEST — Vector tunnel shooter (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Tempest', author: 'ArcadeBits', description: 'Drag around the rim. Shoot the tunnel crawlers.', tags: ['game'] },
  init(container){
    const self=this;
    const wrap=document.createElement('div');
    wrap.style.cssText='position:absolute;inset:0;background:#000;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#FF00FF;text-shadow:0 0 6px #FF00FF;pointer-events:none;z-index:3;';
    hud.innerHTML='<span id="t-s">SCORE 0</span><span id="t-l">LIVES ▲▲▲</span>';
    wrap.appendChild(hud);
    const fireBtn=document.createElement('button');
    fireBtn.textContent='FIRE';
    fireBtn.style.cssText='position:absolute;bottom:14px;right:14px;width:80px;height:60px;font:bold 14px "Courier New",monospace;color:#000;background:linear-gradient(#FF66FF,#CC00CC);border:3px solid #FF00FF;border-radius:50%;box-shadow:0 0 14px #FF00FF;z-index:4;touch-action:manipulation;';
    wrap.appendChild(fireBtn);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;bottom:14px;left:14px;padding:8px 12px;font:bold 12px "Courier New",monospace;color:#FFF;background:#000;border:2px solid #FF00FF;border-radius:4px;box-shadow:0 0 10px #FF00FF;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.8);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;
    const LANES=16;
    let cx,cy, R, rInner;
    let playerLane, enemies, bullets, particles, score, lives, running, tick, spawnT;

    function reset(){
      resize();
      playerLane=0; enemies=[]; bullets=[]; particles=[]; score=0; lives=3; running=true; tick=0; spawnT=0;
      updateHUD(); overlay.style.display='none';
    }
    function updateHUD(){
      hud.querySelector('#t-s').textContent='SCORE '+score;
      hud.querySelector('#t-l').textContent='LIVES '+'▲'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r=wrap.getBoundingClientRect(); W=r.width; H=r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      cx=W/2; cy=H/2; R=Math.min(W,H)*0.42; rInner=R*0.15;
    }
    resize();
    self._onResize=resize; window.addEventListener('resize', self._onResize);

    function laneAngle(i){ return (i/LANES)*Math.PI*2 - Math.PI/2; }
    function posOnRim(lane, t){
      // t: 1 = at rim (player); 0 = at center
      const a=laneAngle(lane);
      const r=rInner + (R-rInner)*t;
      return [cx+Math.cos(a)*r, cy+Math.sin(a)*r];
    }

    function drawBG(){
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      // glow center
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,R*1.2);
      g.addColorStop(0,'rgba(255,0,255,0.25)');
      g.addColorStop(0.3,'rgba(60,0,90,0.15)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
      // scanlines
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawTunnel(){
      // draw concentric rings with lines from center radiating outward
      ctx.strokeStyle='#8800FF';
      ctx.lineWidth=1;
      for (let t=0.15;t<=1;t+=0.14){
        ctx.beginPath();
        for (let i=0;i<=LANES;i++){
          const [px,py]=posOnRim(i%LANES, t);
          if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      // spokes
      for (let i=0;i<LANES;i++){
        const a=laneAngle(i);
        ctx.strokeStyle = i===playerLane?'#FFFF00':'#6600AA';
        ctx.lineWidth = i===playerLane?2:1;
        ctx.beginPath();
        ctx.moveTo(cx+Math.cos(a)*rInner, cy+Math.sin(a)*rInner);
        ctx.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R);
        ctx.stroke();
      }
      // outer rim
      ctx.strokeStyle='#FF00FF';
      ctx.lineWidth=2;
      ctx.beginPath();
      for (let i=0;i<=LANES;i++){
        const [px,py]=posOnRim(i%LANES, 1);
        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath(); ctx.stroke();
    }
    function drawPlayer(){
      const a1=laneAngle(playerLane);
      const a2=laneAngle((playerLane+1)%LANES);
      const mid=(a1+a2)/2;
      // player "claw" at rim between two lanes
      const r=R;
      const p1=[cx+Math.cos(a1)*r, cy+Math.sin(a1)*r];
      const p2=[cx+Math.cos(a2)*r, cy+Math.sin(a2)*r];
      const pmid=[cx+Math.cos(mid)*(r+6), cy+Math.sin(mid)*(r+6)];
      ctx.strokeStyle='#FFFF00';
      ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(p1[0],p1[1]); ctx.lineTo(pmid[0],pmid[1]); ctx.lineTo(p2[0],p2[1]); ctx.stroke();
      ctx.fillStyle='#FFF';
      ctx.beginPath(); ctx.arc(pmid[0], pmid[1], 3, 0, Math.PI*2); ctx.fill();
    }
    function drawEnemy(e){
      const [px,py]=posOnRim(e.lane, e.t);
      const size = 6 + e.t*8;
      ctx.fillStyle = e.type==='flipper'?'#FF2222':'#00FF66';
      ctx.beginPath(); ctx.moveTo(px, py-size); ctx.lineTo(px+size, py); ctx.lineTo(px, py+size); ctx.lineTo(px-size, py); ctx.closePath(); ctx.fill();
      ctx.strokeStyle='#FFF'; ctx.lineWidth=1; ctx.stroke();
    }
    function drawBullets(){
      bullets.forEach(b=>{
        const [px,py]=posOnRim(b.lane, b.t);
        ctx.fillStyle='#FFFF00';
        ctx.beginPath(); ctx.arc(px,py,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,255,0,0.3)';
        ctx.beginPath(); ctx.arc(px,py,8,0,Math.PI*2); ctx.fill();
      });
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function boom(x,y,c){ for(let i=0;i<18;i++) particles.push({x,y,vx:(Math.random()-0.5)*5,vy:(Math.random()-0.5)*5,c,life:22,max:22});}

    function fire(){
      if (!running) return;
      bullets.push({lane:playerLane, t:1});
    }

    function step(){
      if (!running) return;
      tick++;
      spawnT++;
      if (spawnT>40){ spawnT=0; enemies.push({lane:(Math.random()*LANES)|0, t:0.1, type:Math.random()<0.7?'flipper':'spiker', flip:0}); }
      enemies.forEach(e=>{
        e.t += 0.006;
        // flippers occasionally hop to adjacent lane
        if (e.type==='flipper' && Math.random()<0.01){
          e.lane = (e.lane + (Math.random()<0.5?1:-1) + LANES)%LANES;
        }
      });
      // bullets move toward center then outward? In tempest bullets travel outward from center to rim (opposite enemies). We'll do inward (player shoots into tunnel, from t=1 to t=0).
      bullets.forEach(b=> b.t -= 0.04);
      bullets = bullets.filter(b=> b.t>0);

      // collisions
      for (let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];
        for (let j=bullets.length-1;j>=0;j--){
          const b=bullets[j];
          if (b.lane===e.lane && Math.abs(b.t - e.t)<0.06){
            bullets.splice(j,1); enemies.splice(i,1);
            const [px,py]=posOnRim(e.lane, e.t);
            boom(px,py, e.type==='flipper'?'#FF2222':'#00FF66');
            score += e.type==='flipper'?50:100; updateHUD();
            break;
          }
        }
      }
      // enemy reaches rim?
      enemies.forEach((e,i)=>{
        if (e.t>=1){
          if (e.lane===playerLane || e.lane===(playerLane+1)%LANES){
            lives--; updateHUD();
            const [px,py]=posOnRim(e.lane,1);
            boom(px,py,'#FFFF00');
            enemies.splice(i,1);
            if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
          } else {
            enemies.splice(i,1);
          }
        }
      });

      particles.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.life--;});
      particles = particles.filter(p=>p.life>0);
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG(); drawTunnel(); enemies.forEach(drawEnemy); drawBullets(); drawPlayer(); drawParticles(); step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    function setLaneFromPoint(px,py){
      const dx=px-cx, dy=py-cy;
      const a=Math.atan2(dy,dx) + Math.PI/2;
      let lane=Math.floor(((a % (Math.PI*2)) + Math.PI*2) % (Math.PI*2) / (Math.PI*2) * LANES);
      playerLane = lane;
    }

    self._onTouchStart=(e)=>{ const t=e.changedTouches[0]; const r=canvas.getBoundingClientRect(); setLaneFromPoint(t.clientX-r.left, t.clientY-r.top); fire(); };
    self._onTouchMove=(e)=>{ e.preventDefault(); const t=e.changedTouches[0]; const r=canvas.getBoundingClientRect(); setLaneFromPoint(t.clientX-r.left, t.clientY-r.top); };
    canvas.addEventListener('touchstart', self._onTouchStart,{passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove,{passive:false});

    self._onMouseMove=(e)=>{ const r=canvas.getBoundingClientRect(); setLaneFromPoint(e.clientX-r.left, e.clientY-r.top); };
    self._onMouseDown=()=>fire();
    canvas.addEventListener('mousemove', self._onMouseMove);
    canvas.addEventListener('mousedown', self._onMouseDown);

    self._onKey=(e)=>{
      if (e.key==='ArrowLeft') playerLane=(playerLane-1+LANES)%LANES;
      if (e.key==='ArrowRight') playerLane=(playerLane+1)%LANES;
      if (e.key===' ') fire();
    };
    window.addEventListener('keydown', self._onKey);

    self._onFire=(e)=>{e.preventDefault(); fire();};
    fireBtn.addEventListener('click', self._onFire);
    fireBtn.addEventListener('touchstart', self._onFire,{passive:false});

    self._onRestart=(e)=>{e.preventDefault(); reset();};
    restart.addEventListener('click', self._onRestart);
    restart.addEventListener('touchstart', self._onRestart,{passive:false});

    // auto-fire on drag periodically
    self._autoFire = setInterval(()=>{ if (running && tick%1===0) {/* noop - user needs to tap */} }, 120);

    self._wrap=wrap; self._canvas=canvas; self._restart=restart; self._fireBtn=fireBtn;
  },
  destroy(){
    cancelAnimationFrame(this._raf);
    clearInterval(this._autoFire);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    if (this._canvas){
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
      this._canvas.removeEventListener('touchmove', this._onTouchMove);
      this._canvas.removeEventListener('mousemove', this._onMouseMove);
      this._canvas.removeEventListener('mousedown', this._onMouseDown);
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
