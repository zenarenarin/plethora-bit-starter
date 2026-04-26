// QIX — Claim territory with line drawing (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Qix', author: 'ArcadeBits', description: 'Drag to draw. Claim 75% while dodging the Qix.', tags: ['game'] },
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
    hud.innerHTML='<span id="q-s">SCORE 0</span><span id="q-p">CLAIMED 0%</span><span id="q-l">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 18px;font:bold 14px "Courier New",monospace;letter-spacing:3px;color:#000;background:linear-gradient(#00FFFF,#0088CC);border:3px solid #FF00FF;border-radius:4px;box-shadow:0 0 12px #00FFFF;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.8);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;
    const GRID=40, FX=20, FY=60;
    let cells; // GxG; 0=empty, 1=filled, 2=trail
    let player, trail, drawing, qix, particles, score, lives, claimed, running, tick;
    let gw, gh;

    function reset(){
      resize();
      gw = GRID; gh = Math.floor((H-100)/( (W-40)/GRID )) ; if (gh<10) gh=10;
      // simpler: square grid
      cells = [];
      for (let y=0;y<gh;y++){ cells[y]=[]; for (let x=0;x<gw;x++) cells[y][x]=0; }
      // edges count as filled borders implicit (we treat borders outside)
      player = { x: 0, y: 0, face:'right' };
      trail = []; drawing = false;
      qix = { x: gw/2, y: gh/2, vx: 0.25, vy: 0.17, t:0 };
      particles = []; tick=0;
      score=0; lives=3; claimed=0; running=true;
      updateHUD(); overlay.style.display='none';
    }
    function updateHUD(){
      hud.querySelector('#q-s').textContent='SCORE '+score;
      hud.querySelector('#q-p').textContent='CLAIMED '+Math.floor(claimed)+'%';
      hud.querySelector('#q-l').textContent='LIVES '+'♥'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r=wrap.getBoundingClientRect(); W=r.width; H=r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();
    self._onResize=resize; window.addEventListener('resize', self._onResize);

    function cellSize(){ return Math.min((W-40)/gw, (H-100)/gh); }
    function CX(x){ return FX + x*cellSize(); }
    function CY(y){ return FY + y*cellSize(); }

    function drawBG(){
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      // colorful grid background
      const cs=cellSize();
      for (let y=0;y<gh;y++) for (let x=0;x<gw;x++){
        if (cells[y][x]===1){
          // rainbow claimed fill
          const h = (x*6 + y*4 + tick)%360;
          ctx.fillStyle=`hsl(${h},80%,40%)`;
          ctx.fillRect(CX(x), CY(y), cs+1, cs+1);
        } else if (cells[y][x]===2){
          ctx.fillStyle='#FFFF00';
          ctx.fillRect(CX(x), CY(y), cs+1, cs+1);
        }
      }
      // border
      ctx.strokeStyle='#00FFFF'; ctx.lineWidth=3;
      ctx.strokeRect(CX(0)-1, CY(0)-1, gw*cs+2, gh*cs+2);
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawPlayer(){
      const cs=cellSize();
      const x=CX(player.x), y=CY(player.y);
      ctx.fillStyle='#FFFF00';
      ctx.fillRect(x-4, y-4, 8, 8);
      ctx.fillStyle='#FF0000';
      ctx.fillRect(x-2, y-2, 4, 4);
    }
    function drawQix(){
      const cs=cellSize();
      const qx=CX(qix.x), qy=CY(qix.y);
      // sparkly line creature
      ctx.save(); ctx.translate(qx,qy);
      for (let i=0;i<6;i++){
        const a = tick*0.05 + i*Math.PI/3;
        const r1 = 8 + i*2;
        const r2 = 20 + Math.sin(tick*0.1+i)*6;
        ctx.strokeStyle = `hsl(${(tick*5+i*60)%360},100%,60%)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*r1, Math.sin(a)*r1);
        ctx.lineTo(Math.cos(a+Math.PI)*r2, Math.sin(a+Math.PI)*r2);
        ctx.stroke();
      }
      ctx.restore();
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function boom(x,y,c){ for(let i=0;i<14;i++) particles.push({x,y,vx:(Math.random()-0.5)*4,vy:(Math.random()-0.5)*4,c,life:18,max:18});}

    function onBorder(x,y){
      if (x===0||x===gw-1||y===0||y===gh-1) return true;
      // filled cells are safe border territory
      if (cells[y][x]===1) return true;
      // check if on edge of a filled area
      const adj=[[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx,dy] of adj){
        const nx=x+dx, ny=y+dy;
        if (nx<0||nx>=gw||ny<0||ny>=gh) return true;
        if (cells[ny][nx]===1) return true;
      }
      return false;
    }

    function tryMove(dx,dy){
      if (!running) return;
      const nx = player.x + dx, ny = player.y + dy;
      if (nx<0||nx>=gw||ny<0||ny>=gh) return;
      // filled cells are passable safe territory — stop drawing if we reach one
      if (cells[ny][nx]===2) {
        // self trail crossing = die
        die(); return;
      }
      // if currently on border (safe) and moving into empty (not border) => start drawing trail
      if (!drawing){
        if (!onBorder(nx,ny)){
          drawing = true;
          trail = [{x:player.x, y:player.y}];
          cells[player.y][player.x] = 2;
        }
      }
      player.x = nx; player.y = ny;
      if (drawing){
        if (onBorder(nx,ny)){
          // complete trail: fill smaller area
          completeTrail();
        } else {
          cells[ny][nx] = 2;
          trail.push({x:nx, y:ny});
        }
      }
    }

    function completeTrail(){
      drawing = false;
      // flood fill from Qix position
      const visited=[]; for (let y=0;y<gh;y++){visited[y]=[]; for (let x=0;x<gw;x++) visited[y][x]=false;}
      const qx = Math.floor(qix.x), qy = Math.floor(qix.y);
      const stack = [[qx,qy]];
      while (stack.length){
        const [x,y]=stack.pop();
        if (x<0||x>=gw||y<0||y>=gh) continue;
        if (visited[y][x]) continue;
        if (cells[y][x]===1 || cells[y][x]===2) continue;
        visited[y][x] = true;
        stack.push([x+1,y]); stack.push([x-1,y]); stack.push([x,y+1]); stack.push([x,y-1]);
      }
      // fill non-visited empty cells as claimed (smaller region)
      let filled=0, total=0;
      for (let y=0;y<gh;y++) for (let x=0;x<gw;x++){
        if (cells[y][x]===2){ cells[y][x]=1; filled++; }
        else if (cells[y][x]===0 && !visited[y][x]){ cells[y][x]=1; filled++; }
        if (cells[y][x]===1) total++;
      }
      trail = [];
      score += filled*5;
      claimed = total / (gw*gh) * 100;
      updateHUD();
      // check win
      if (claimed >= 75){ running=false; showOverlay('YOU WIN!','#00FF00'); }
    }

    function die(){
      lives--; updateHUD();
      trail.forEach(t=>{ cells[t.y][t.x]=0; });
      trail=[]; drawing=false;
      // respawn at nearest border
      player.x=0; player.y=0;
      boom(CX(player.x), CY(player.y), '#FFFF00');
      if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
    }

    function step(){
      if (!running) return;
      tick++;
      qix.t++;
      qix.x += qix.vx; qix.y += qix.vy;
      if (Math.floor(qix.x)<0 || Math.floor(qix.x)>=gw){ qix.vx = -qix.vx; qix.x = Math.max(0, Math.min(gw-1, qix.x)); }
      if (Math.floor(qix.y)<0 || Math.floor(qix.y)>=gh){ qix.vy = -qix.vy; qix.y = Math.max(0, Math.min(gh-1, qix.y)); }
      // bounce on filled
      const qcx = Math.floor(qix.x), qcy = Math.floor(qix.y);
      if (cells[qcy] && cells[qcy][qcx]===1){ qix.vx = -qix.vx; qix.vy = -qix.vy; qix.x += qix.vx*2; qix.y += qix.vy*2; }
      // qix hits trail -> die
      if (cells[qcy] && cells[qcy][qcx]===2) die();
      if (Math.random()<0.01){ qix.vx += (Math.random()-0.5)*0.1; qix.vy += (Math.random()-0.5)*0.1;
        const s=Math.hypot(qix.vx,qix.vy); qix.vx = qix.vx/s*0.3; qix.vy = qix.vy/s*0.3;
      }

      particles.forEach(p=>{p.x+=p.vx; p.y+=p.vy; p.life--;});
      particles = particles.filter(p=>p.life>0);
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score} · ${Math.floor(claimed)}%</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG(); drawQix(); drawPlayer(); drawParticles(); step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    // input: drag direction
    let lastMove = 0;
    let heldDir = null;
    self._onTouchStart=(e)=>{
      const t=e.changedTouches[0];
      heldDir = {sx:t.clientX, sy:t.clientY};
    };
    self._onTouchMove=(e)=>{
      e.preventDefault();
      if (!heldDir) return;
      const t=e.changedTouches[0];
      const dx=t.clientX-heldDir.sx, dy=t.clientY-heldDir.sy;
      if (Math.hypot(dx,dy)<10) return;
      const now=Date.now();
      if (now-lastMove<45) return;
      lastMove = now;
      if (Math.abs(dx)>Math.abs(dy)) tryMove(dx>0?1:-1, 0);
      else tryMove(0, dy>0?1:-1);
      heldDir.sx = t.clientX; heldDir.sy = t.clientY;
    };
    self._onTouchEnd=()=>{ heldDir=null; };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});
    canvas.addEventListener('touchend', self._onTouchEnd);

    self._onKey=(e)=>{
      if (e.key==='ArrowUp') tryMove(0,-1);
      if (e.key==='ArrowDown') tryMove(0,1);
      if (e.key==='ArrowLeft') tryMove(-1,0);
      if (e.key==='ArrowRight') tryMove(1,0);
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
      this._canvas.removeEventListener('touchend', this._onTouchEnd);
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=null;
  },
};
