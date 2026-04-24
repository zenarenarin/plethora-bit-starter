// FROGGER — Hop across traffic and water (Plethora Bit)
window.scrollerApp = {
  meta: { title: 'Frogger', author: 'ArcadeBits', description: 'Swipe to hop. Cross the road and the river.', tags: ['game'] },
  init(container){
    const self = this;
    const wrap = document.createElement('div');
    wrap.style.cssText='position:absolute;inset:0;background:#000;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#00FF88;text-shadow:0 0 6px #00FF00;pointer-events:none;z-index:3;';
    hud.innerHTML='<span id="f-s">SCORE 0</span><span id="f-h">HOMES 0/5</span><span id="f-l">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 18px;font:bold 14px "Courier New",monospace;letter-spacing:3px;color:#000;background:linear-gradient(#00FF66,#00AA33);border:3px solid #FFFF00;border-radius:4px;box-shadow:0 0 12px #00FF66;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.75);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H;

    // Virtual grid: 11 rows x 13 cols
    const COLS=13, ROWS=13;
    // Rows: 0=goal, 1-4=water with logs, 5=safe, 6-10=road, 11=safe start, 12=start
    let frog, lanes, homes, score, lives, running, tick, hopT;

    function reset(){
      frog = { col:6, row:12, px:6, py:12, hopT:0 };
      lanes = [
        { row:1, type:'log', spd:0.03, items:[{x:0,len:3},{x:6,len:2},{x:10,len:2}] },
        { row:2, type:'turtle', spd:-0.04, items:[{x:1,len:2},{x:5,len:3},{x:10,len:2}] },
        { row:3, type:'log', spd:0.025, items:[{x:0,len:4},{x:7,len:3}] },
        { row:4, type:'turtle', spd:-0.05, items:[{x:2,len:2},{x:6,len:2},{x:10,len:2}] },
        { row:6, type:'truck', spd:0.04, items:[{x:0,len:2,c:'#FF4444'},{x:7,len:2,c:'#FF4444'}] },
        { row:7, type:'car', spd:-0.06, items:[{x:2,len:1,c:'#FFFF00'},{x:6,len:1,c:'#FFFF00'},{x:10,len:1,c:'#FFFF00'}] },
        { row:8, type:'car', spd:0.05, items:[{x:0,len:1,c:'#00FFFF'},{x:4,len:1,c:'#00FFFF'},{x:9,len:1,c:'#00FFFF'}] },
        { row:9, type:'truck', spd:-0.035, items:[{x:1,len:2,c:'#FF00FF'},{x:8,len:2,c:'#FF00FF'}] },
        { row:10, type:'car', spd:0.07, items:[{x:0,len:1,c:'#FF8800'},{x:3,len:1,c:'#FF8800'},{x:7,len:1,c:'#FF8800'},{x:11,len:1,c:'#FF8800'}] },
      ];
      homes = [false,false,false,false,false];
      score=0; lives=3; running=true; tick=0; hopT=0;
      updateHUD();
      overlay.style.display='none';
    }
    function updateHUD(){
      hud.querySelector('#f-s').textContent='SCORE '+score;
      hud.querySelector('#f-h').textContent='HOMES '+homes.filter(Boolean).length+'/5';
      hud.querySelector('#f-l').textContent='LIVES '+'♥'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r=wrap.getBoundingClientRect();
      W=r.width; H=r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();
    self._onResize=resize; window.addEventListener('resize',self._onResize);

    function CW(){ return W/COLS; }
    function CH(){ return (H-100)/ROWS; }
    function OY(){ return 40; }

    function drawBG(){
      ctx.fillStyle='#000';
      ctx.fillRect(0,0,W,H);
      const cw=CW(), ch=CH(), oy=OY();
      for (let r=0;r<ROWS;r++){
        const y = oy + r*ch;
        if (r===0){
          // goal water with home slots
          ctx.fillStyle='#002060';
          ctx.fillRect(0,y,W,ch);
          ctx.fillStyle='#003399';
          for(let i=0;i<W;i+=6){ctx.fillRect(i,y+ch/2,3,1);}
        } else if (r>=1 && r<=4){
          // water
          ctx.fillStyle='#001F5C';
          ctx.fillRect(0,y,W,ch);
          ctx.strokeStyle = 'rgba(0,200,255,0.3)';
          ctx.beginPath();
          for(let i=0;i<W;i+=8){
            ctx.moveTo(i,y+ch/2 + Math.sin((i+tick*2)*0.1)*2);
            ctx.lineTo(i+4,y+ch/2 + Math.sin((i+4+tick*2)*0.1)*2);
          }
          ctx.stroke();
        } else if (r===5||r===11||r===12){
          ctx.fillStyle = r===0 ? '#004400' : '#2d2d2d';
          if (r===5 || r===11){
            ctx.fillStyle='#440066';
            ctx.fillRect(0,y,W,ch);
          } else {
            ctx.fillStyle='#004400';
            ctx.fillRect(0,y,W,ch);
          }
        } else {
          // road
          ctx.fillStyle='#202020';
          ctx.fillRect(0,y,W,ch);
          // lane dashes
          ctx.fillStyle='#FFFF00';
          for (let i=0;i<W;i+=20) ctx.fillRect(i, y+ch/2-1, 10, 2);
        }
      }
      // home slots
      for (let i=0;i<5;i++){
        const hx = i*(W/5) + W/10;
        ctx.fillStyle = homes[i] ? '#FFFF00' : '#111';
        ctx.fillRect(hx-10, oy+4, 20, CH()-8);
        if (homes[i]){ ctx.fillStyle='#00FF88'; ctx.fillRect(hx-5, oy+ch-12, 10, 6); }
      }
      // scanlines
      ctx.fillStyle='rgba(0,0,0,0.2)'; for(let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }

    function drawLaneItems(){
      const cw=CW(), ch=CH(), oy=OY();
      lanes.forEach(l=>{
        const y = oy + l.row*ch;
        l.items.forEach(it=>{
          const x = ((it.x + l.spd*tick) % COLS + COLS) % COLS;
          const px = x*cw;
          for (let part=0; part<it.len; part++){
            const pxx = ((x+part)%COLS)*cw;
            if (l.type==='log'){
              ctx.fillStyle='#8B4513';
              ctx.fillRect(pxx+1, y+3, cw-2, ch-6);
              ctx.fillStyle='#A0522D';
              ctx.fillRect(pxx+1, y+3, cw-2, 2);
            } else if (l.type==='turtle'){
              ctx.fillStyle='#228822';
              ctx.fillRect(pxx+2, y+4, cw-4, ch-8);
              ctx.fillStyle='#44CC44';
              ctx.fillRect(pxx+cw/2-3, y+ch/2-3, 6, 6);
            } else if (l.type==='car'){
              ctx.fillStyle=it.c;
              ctx.fillRect(pxx+2, y+3, cw-4, ch-6);
              ctx.fillStyle='#FFF';
              ctx.fillRect(pxx+cw-4, y+ch/2-2, 2, 4);
            } else if (l.type==='truck'){
              ctx.fillStyle=it.c;
              ctx.fillRect(pxx+1, y+3, cw-2, ch-6);
              if (part===0){ ctx.fillStyle='#000'; ctx.fillRect(pxx+2, y+5, 4, ch-10); }
            }
          }
        });
      });
    }
    function drawFrog(){
      const cw=CW(), ch=CH(), oy=OY();
      const x = frog.px*cw + cw/2;
      const y = oy + frog.py*ch + ch/2;
      const hopScale = 1 + (frog.hopT>0 ? 0.3*Math.sin((1-frog.hopT)*Math.PI) : 0);
      ctx.save(); ctx.translate(x,y); ctx.scale(hopScale, hopScale);
      ctx.fillStyle='#00FF00'; ctx.fillRect(-6,-6,12,12);
      ctx.fillStyle='#009900'; ctx.fillRect(-7,-2,2,4); ctx.fillRect(5,-2,2,4);
      ctx.fillStyle='#FFFF00'; ctx.fillRect(-4,-5,3,3); ctx.fillRect(1,-5,3,3);
      ctx.fillStyle='#000'; ctx.fillRect(-3,-4,2,2); ctx.fillRect(2,-4,2,2);
      ctx.restore();
    }

    function step(){
      if (!running) return;
      tick++;
      if (frog.hopT>0){ frog.hopT = Math.max(0, frog.hopT - 0.12);
        frog.px += (frog.col - frog.px)*0.3;
        frog.py += (frog.row - frog.py)*0.3;
      } else { frog.px = frog.col; frog.py = frog.row; }
      // on water?
      if (frog.row>=1 && frog.row<=4){
        const lane = lanes.find(l=>l.row===frog.row);
        let onItem=false;
        lane.items.forEach(it=>{
          const x = ((it.x + lane.spd*tick) % COLS + COLS) % COLS;
          for (let p=0;p<it.len;p++){
            const cx = (x+p)%COLS;
            if (Math.abs(cx - frog.col) < 0.5) onItem = true;
          }
        });
        if (onItem){
          frog.col += lane.spd;
          if (frog.col<0 || frog.col>COLS-1) die();
        } else die();
      }
      // on road?
      if (frog.row>=6 && frog.row<=10){
        const lane = lanes.find(l=>l.row===frog.row);
        lane.items.forEach(it=>{
          const x = ((it.x + lane.spd*tick) % COLS + COLS) % COLS;
          for (let p=0;p<it.len;p++){
            const cx = (x+p)%COLS;
            if (Math.abs(cx - frog.col) < 0.7) die();
          }
        });
      }
      // home zone
      if (frog.row===0){
        // check home slot (5 slots)
        const slotW = COLS/5;
        const idx = Math.floor(frog.col / slotW);
        if (idx>=0 && idx<5 && !homes[idx]){
          const targetCol = idx*slotW + slotW/2;
          if (Math.abs(frog.col - targetCol) < 1){
            homes[idx] = true; score += 200;
            if (homes.every(Boolean)){ running=false; showOverlay('YOU WIN!','#00FF00'); }
            else { frog.col=6; frog.row=12; frog.px=6; frog.py=12; }
            updateHUD();
          } else die();
        } else die();
      }
    }
    function die(){
      lives--; updateHUD();
      frog.col=6; frog.row=12; frog.px=6; frog.py=12;
      if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
    }
    function hop(dx,dy){
      if (!running || frog.hopT>0) return;
      const nc = Math.max(0, Math.min(COLS-1, frog.col+dx));
      const nr = Math.max(0, Math.min(ROWS-1, frog.row+dy));
      frog.col = nc; frog.row = nr;
      frog.hopT = 1;
      score += 10; updateHUD();
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }

    function loop(){
      drawBG(); drawLaneItems(); drawFrog(); step();
      self._raf = requestAnimationFrame(loop);
    }
    reset();
    self._raf = requestAnimationFrame(loop);

    let sx=0,sy=0;
    self._onTouchStart=(e)=>{ const t=e.changedTouches[0]; sx=t.clientX; sy=t.clientY; };
    self._onTouchEnd=(e)=>{
      const t=e.changedTouches[0];
      const dx=t.clientX-sx, dy=t.clientY-sy;
      if (Math.hypot(dx,dy)<16){ hop(0,-1); return; } // tap = up
      if (Math.abs(dx)>Math.abs(dy)) hop(dx>0?1:-1, 0);
      else hop(0, dy>0?1:-1);
    };
    self._onTouchMove=(e)=>{ e.preventDefault(); };
    canvas.addEventListener('touchstart', self._onTouchStart, {passive:true});
    canvas.addEventListener('touchmove', self._onTouchMove, {passive:false});
    canvas.addEventListener('touchend', self._onTouchEnd);

    self._onKey=(e)=>{
      if (e.key==='ArrowUp') hop(0,-1);
      if (e.key==='ArrowDown') hop(0,1);
      if (e.key==='ArrowLeft') hop(-1,0);
      if (e.key==='ArrowRight') hop(1,0);
    };
    window.addEventListener('keydown', self._onKey);

    self._onRestart=(e)=>{ e.preventDefault(); reset(); };
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
