// MS. PAC-MAN — Alternate maze, faster ghosts, fruit bonus (Plethora Bit)
window.scrollerApp = {
  meta: {
    title: 'Ms. Pac-Man',
    author: 'ArcadeBits',
    description: 'Faster ghosts, new maze, bonus fruits. Swipe to turn.',
    tags: ['game'],
  },
  init(container){
    const self=this;
    const wrap=document.createElement('div');
    wrap.style.cssText='position:absolute;inset:0;background:#000;overflow:hidden;font-family:"Courier New",monospace;';
    container.appendChild(wrap);
    const canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;image-rendering:pixelated;';
    wrap.appendChild(canvas);
    const hud=document.createElement('div');
    hud.style.cssText='position:absolute;top:8px;left:0;right:0;display:flex;justify-content:space-between;padding:0 14px;font:bold 14px "Courier New",monospace;letter-spacing:2px;color:#FF66CC;text-shadow:0 0 6px #FF0099;pointer-events:none;z-index:3;';
    hud.innerHTML='<span id="mp-s">SCORE 0</span><span id="mp-l">LIVES ♥♥♥</span>';
    wrap.appendChild(hud);
    const restart=document.createElement('button');
    restart.textContent='↺ RESTART';
    restart.style.cssText='position:absolute;bottom:14px;right:14px;padding:8px 18px;font:bold 14px "Courier New",monospace;letter-spacing:3px;color:#000;background:linear-gradient(#FF88CC,#CC3388);border:3px solid #FFFF00;border-radius:4px;box-shadow:0 0 12px #FF00AA;z-index:4;touch-action:manipulation;';
    wrap.appendChild(restart);
    
    // Virtual joystick lever
    const joystick=document.createElement('div');
    joystick.style.cssText='position:absolute;bottom:14px;left:14px;width:60px;height:60px;border:3px solid #00FF00;border-radius:50%;background:rgba(0,255,0,0.1);z-index:4;box-shadow:0 0 12px #00FF00;';
    wrap.appendChild(joystick);
    const stick=document.createElement('div');
    stick.style.cssText='position:absolute;width:30px;height:30px;border-radius:50%;background:#00FF00;top:50%;left:50%;transform:translate(-50%,-50%);box-shadow:0 0 8px #00FF00;transition:transform 0.05s ease-out;';
    joystick.appendChild(stick);
    let joyActive=false, joyStartX=0, joyStartY=0, joyTouch=null;
    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(0,0,0,0.75);z-index:2;text-align:center;font-weight:bold;letter-spacing:3px;';
    wrap.appendChild(overlay);

    const ctx=canvas.getContext('2d');
    const dpr=window.devicePixelRatio||1;
    let W,H,tile,offX,offY;

    // Different maze from Pac-Man
    const MAP=[
      '#####################',
      '#o.......#.#.......o#',
      '#.###.##.#.#.##.###.#',
      '#.#...#..#.#..#...#.#',
      '#.#.#.#.##.##.#.#.#.#',
      '#...#.........#.....#',
      '###.#.#######.#.###.#',
      '   #.#...#...#.#   #',
      '#####.##-.-##.#####.',
      '.....#.# GGG #.#.....',
      '#####.##---##.#####.',
      '   #.#.......#.#   #',
      '###.#.#######.#.###.#',
      '#.........P.........#',
      '#.#.##.#######.##.#.#',
      '#o#.#............#.#o',
      '##.#.#.#######.#.#.##',
      '#....##.........##..#',
      '#.##.##.##.##.##.##.#',
      '#...................#',
      '#####################',
    ];
    const ROWS=MAP.length, COLS=MAP[0].length;
    let walls, dots, pellets, pac, ghosts, score, lives, powerT, running, win, particles, tick, fruit;

    function reset(){
      walls=[]; dots=[]; pellets=[];
      for (let y=0;y<ROWS;y++){
        walls[y]=[]; dots[y]=[]; pellets[y]=[];
        for (let x=0;x<COLS;x++){
          const c=MAP[y][x];
          walls[y][x] = (c==='#');
          dots[y][x] = (c==='.');
          pellets[y][x] = (c==='o');
        }
      }
      pac={x:10,y:13,px:10,py:13,dir:3,next:3,t:0,dead:false};
      ghosts=[
        {x:9,y:9,px:9,py:9,color:'#FF0000',t:0,dx:1,dy:0,scared:0},
        {x:10,y:9,px:10,py:9,color:'#FFB8FF',t:0,dx:-1,dy:0,scared:0},
        {x:11,y:9,px:11,py:9,color:'#00FFFF',t:0,dx:0,dy:-1,scared:0},
        {x:10,y:8,px:10,py:8,color:'#FF8844',t:0,dx:0,dy:1,scared:0},
      ];
      score=0; lives=3; powerT=0; running=true; win=false; particles=[]; tick=0;
      fruit=null;
      updateHUD(); overlay.style.display='none';
    }
    function updateHUD(){
      hud.querySelector('#mp-s').textContent='SCORE '+score;
      hud.querySelector('#mp-l').textContent='LIVES '+'♥'.repeat(Math.max(0,lives));
    }
    function resize(){
      const r=wrap.getBoundingClientRect(); W=r.width; H=r.height;
      canvas.width=W*dpr; canvas.height=H*dpr;
      canvas.style.width=W+'px'; canvas.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const usable=Math.min(W, H-80);
      tile=Math.floor(usable/COLS);
      offX=Math.floor((W-tile*COLS)/2);
      offY=Math.floor((H-tile*ROWS)/2);
    }
    resize();
    self._onResize=resize; window.addEventListener('resize', self._onResize);

    function drawBG(){
      ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
      ctx.strokeStyle='rgba(255,0,200,0.07)'; ctx.lineWidth=1;
      for (let x=0;x<W;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
      for (let y=0;y<H;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
      ctx.fillStyle='rgba(0,0,0,0.22)';
      for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    }
    function drawMaze(){
      for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++){
        if (walls[y][x]){
          ctx.fillStyle='#FF00AA';
          ctx.fillRect(offX+x*tile, offY+y*tile, tile, tile);
          ctx.fillStyle='#AA0066';
          ctx.fillRect(offX+x*tile+1, offY+y*tile+1, tile-2, tile-2);
          ctx.fillStyle='#000';
          ctx.fillRect(offX+x*tile+3, offY+y*tile+3, tile-6, tile-6);
        } else if (dots[y][x]){
          ctx.fillStyle='#FFCC99';
          ctx.fillRect(offX+x*tile+tile/2-1, offY+y*tile+tile/2-1, 2, 2);
        } else if (pellets[y][x]){
          const s=2+Math.sin(tick*0.2)*1.5;
          ctx.fillStyle='#FFFF00';
          ctx.beginPath(); ctx.arc(offX+x*tile+tile/2, offY+y*tile+tile/2, s+2, 0, Math.PI*2); ctx.fill();
        }
      }
    }
    function drawPac(){
      const cx=offX+pac.px*tile+tile/2, cy=offY+pac.py*tile+tile/2, r=tile*0.45;
      const m=Math.abs(Math.sin(tick*0.3))*0.5+0.05;
      const dirRot={0:Math.PI,1:0,2:-Math.PI/2,3:Math.PI/2}[pac.dir]||0;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(dirRot);
      ctx.fillStyle='#FFFF00';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,r,m,Math.PI*2-m); ctx.closePath(); ctx.fill();
      // bow (Ms. signature)
      ctx.restore();
      // bow drawn on top
      ctx.fillStyle='#FF0066';
      ctx.beginPath();
      ctx.moveTo(cx-r*0.3, cy-r); ctx.lineTo(cx-r*0.7, cy-r*1.3); ctx.lineTo(cx-r*0.5, cy-r*0.7); ctx.closePath();
      ctx.moveTo(cx+r*0.3, cy-r); ctx.lineTo(cx+r*0.7, cy-r*1.3); ctx.lineTo(cx+r*0.5, cy-r*0.7); ctx.closePath();
      ctx.fill();
      ctx.fillStyle='#FFFF00';
      ctx.fillRect(cx-r*0.15, cy-r*0.9, r*0.3, r*0.15);
      // lipstick
      ctx.fillStyle='#FF0000';
      if (pac.dir===0) ctx.fillRect(cx+r*0.3, cy, r*0.3, 2);
      else if (pac.dir===1) ctx.fillRect(cx-r*0.6, cy, r*0.3, 2);
    }
    function drawGhost(g){
      const cx=offX+g.px*tile+tile/2, cy=offY+g.py*tile+tile/2, r=tile*0.45;
      const col = g.scared>0?(Math.floor(tick/4)%2?'#FFFFFF':'#0000FF'):g.color;
      ctx.fillStyle=col;
      ctx.beginPath();
      ctx.arc(cx,cy-1,r,Math.PI,0); ctx.lineTo(cx+r,cy+r);
      const n=4; const w=(2*r)/n;
      for (let i=0;i<n;i++){
        ctx.lineTo(cx+r-w*(i+0.5), cy+r-(i%2?4:0));
        ctx.lineTo(cx+r-w*(i+1), cy+r);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='#FFF';
      ctx.fillRect(cx-r*0.55, cy-r*0.3, r*0.4, r*0.5);
      ctx.fillRect(cx+r*0.15, cy-r*0.3, r*0.4, r*0.5);
      ctx.fillStyle='#0033FF';
      ctx.fillRect(cx-r*0.45,cy-r*0.15,r*0.18,r*0.22);
      ctx.fillRect(cx+r*0.25,cy-r*0.15,r*0.18,r*0.22);
    }
    function drawFruit(){
      if (!fruit) return;
      const cx=offX+fruit.x*tile+tile/2, cy=offY+fruit.y*tile+tile/2;
      ctx.fillStyle='#FF0000';
      ctx.beginPath(); ctx.arc(cx,cy,tile*0.35,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#008800';
      ctx.fillRect(cx-1, cy-tile*0.5, 2, 4);
      ctx.fillStyle='#00FF00';
      ctx.fillRect(cx+1, cy-tile*0.55, 3, 2);
    }
    function drawParticles(){
      particles.forEach(p=>{ ctx.globalAlpha=p.life/p.max; ctx.fillStyle=p.c; ctx.fillRect(p.x-1,p.y-1,3,3);});
      ctx.globalAlpha=1;
    }
    function addParticles(x,y,c,n=10){ for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3,c,life:20,max:20});}

    const DIRS=[[1,0],[-1,0],[0,-1],[0,1]];
    function canGo(x,y){
      if (y<0||y>=ROWS) return false;
      if (x<0) x+=COLS; if (x>=COLS) x-=COLS;
      return !walls[y][x];
    }
    function step(){
      if (!running) return;
      tick++;
      if (powerT>0) powerT--;
      particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.life--;});
      particles=particles.filter(p=>p.life>0);

      pac.t++;
      if (pac.t >= 5){ // Ms. Pac faster than Pac-Man
        pac.t=0;
        const [nx,ny]=DIRS[pac.next];
        if (canGo(pac.x+nx,pac.y+ny)) pac.dir=pac.next;
        const [dx,dy]=DIRS[pac.dir];
        if (canGo(pac.x+dx,pac.y+dy)){
          pac.x+=dx; pac.y+=dy;
          if (pac.x<0) pac.x=COLS-1;
          if (pac.x>=COLS) pac.x=0;
          if (dots[pac.y][pac.x]){ dots[pac.y][pac.x]=false; score+=10; updateHUD(); }
          if (pellets[pac.y][pac.x]){
            pellets[pac.y][pac.x]=false; score+=50; powerT=180;
            ghosts.forEach(g=>g.scared=180);
            addParticles(offX+pac.x*tile+tile/2, offY+pac.y*tile+tile/2, '#FF66CC', 18);
            updateHUD();
          }
          if (fruit && pac.x===fruit.x && pac.y===fruit.y){
            score += 200; fruit=null; updateHUD();
            addParticles(offX+pac.x*tile+tile/2, offY+pac.y*tile+tile/2, '#FF0000', 20);
          }
          let any=false;
          for (let yy=0;yy<ROWS&&!any;yy++) for (let xx=0;xx<COLS&&!any;xx++) if (dots[yy][xx]||pellets[yy][xx]) any=true;
          if (!any){ win=true; running=false; showOverlay('YOU WIN!','#FFFF00'); }
        }
      }
      pac.px += (pac.x-pac.px)*0.3;
      pac.py += (pac.y-pac.py)*0.3;

      // spawn fruit occasionally
      if (!fruit && Math.random()<0.004){
        // find random non-wall non-dot cell
        for (let tries=0;tries<20;tries++){
          const fx=(Math.random()*COLS)|0, fy=(Math.random()*ROWS)|0;
          if (!walls[fy][fx]){ fruit={x:fx,y:fy}; break; }
        }
      }

      ghosts.forEach(g=>{
        g.t++;
        if (g.scared>0) g.scared--;
        if (g.t>=8){ // faster than Pac-Man ghosts
          g.t=0;
          const opts = DIRS.filter(([dx,dy])=>canGo(g.x+dx,g.y+dy) && !(dx===-g.dx && dy===-g.dy));
          const choices = opts.length?opts:DIRS.filter(([dx,dy])=>canGo(g.x+dx,g.y+dy));
          if (choices.length){
            let best=choices[0], sc=Infinity;
            choices.forEach(c=>{
              const d=Math.hypot(g.x+c[0]-pac.x,g.y+c[1]-pac.y);
              const s=g.scared>0?-d:d;
              if (s<sc){sc=s;best=c;}
            });
            if (Math.random()<0.2) best=choices[(Math.random()*choices.length)|0];
            g.dx=best[0]; g.dy=best[1];
            g.x+=g.dx; g.y+=g.dy;
            if (g.x<0) g.x=COLS-1;
            if (g.x>=COLS) g.x=0;
          }
        }
        g.px += (g.x-g.px)*0.3;
        g.py += (g.y-g.py)*0.3;
        if (Math.abs(g.px-pac.px)<0.5 && Math.abs(g.py-pac.py)<0.5){
          if (g.scared>0){
            score+=200; updateHUD();
            addParticles(offX+g.px*tile+tile/2, offY+g.py*tile+tile/2, g.color, 20);
            g.x=10; g.y=9; g.scared=0;
          } else {
            lives--; updateHUD();
            addParticles(offX+pac.px*tile+tile/2, offY+pac.py*tile+tile/2,'#FFFF00',30);
            pac.x=10; pac.y=13; pac.px=10; pac.py=13;
            if (lives<=0){ running=false; showOverlay('GAME OVER','#FF2244'); }
          }
        }
      });
    }
    function showOverlay(t,c){
      overlay.innerHTML=`<div style="font-size:28px;color:${c};text-shadow:0 0 12px ${c};margin-bottom:14px;">${t}</div><div style="color:#FFF;font-size:14px;">SCORE ${score}</div><div style="color:#999;font-size:11px;margin-top:10px;">Tap RESTART</div>`;
      overlay.style.display='flex';
    }
    function loop(){
      drawBG(); drawMaze(); drawFruit(); ghosts.forEach(drawGhost); drawPac(); drawParticles(); step();
      self._raf=requestAnimationFrame(loop);
    }
    reset();
    self._raf=requestAnimationFrame(loop);

    // Joystick touch controls
    self._onJoyStart=(e)=>{
      const t=e.changedTouches[0];
      const rect=joystick.getBoundingClientRect();
      joyStartX=t.clientX-rect.left-30;
      joyStartY=t.clientY-rect.top-30;
      joyActive=true;
      joyTouch=t.identifier;
      e.preventDefault();
    };
    self._onJoyMove=(e)=>{
      if (!joyActive) return;
      e.preventDefault();
      for (let i=0; i<e.changedTouches.length; i++){
        if (e.changedTouches[i].identifier===joyTouch){
          const t=e.changedTouches[i];
          const rect=joystick.getBoundingClientRect();
          const x=t.clientX-rect.left-30;
          const y=t.clientY-rect.top-30;
          const dist=Math.hypot(x,y);
          const maxDist=30;
          let nx=x, ny=y;
          if (dist>maxDist){ nx=(x/dist)*maxDist; ny=(y/dist)*maxDist; }
          stick.style.transform=`translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
          const angle=Math.atan2(ny,nx);
          if (Math.abs(nx)>Math.abs(ny)){
            pac.next=nx>0?0:1;
          } else {
            pac.next=ny<0?2:3;
          }
          break;
        }
      }
    };
    self._onJoyEnd=(e)=>{
      for (let i=0; i<e.changedTouches.length; i++){
        if (e.changedTouches[i].identifier===joyTouch){
          joyActive=false;
          stick.style.transform='translate(-50%, -50%)';
          break;
        }
      }
    };
    joystick.addEventListener('touchstart', self._onJoyStart, {passive:false});
    joystick.addEventListener('touchmove', self._onJoyMove, {passive:false});
    joystick.addEventListener('touchend', self._onJoyEnd, {passive:true});
    joystick.addEventListener('touchcancel', self._onJoyEnd, {passive:true});

    self._onKey=(e)=>{
      if (e.key==='ArrowRight') pac.next=0;
      if (e.key==='ArrowLeft') pac.next=1;
      if (e.key==='ArrowUp') pac.next=2;
      if (e.key==='ArrowDown') pac.next=3;
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
    }
    if (this._restart){
      this._restart.removeEventListener('click', this._onRestart);
      this._restart.removeEventListener('touchstart', this._onRestart);
    }
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap=this._canvas=this._restart=null;
  },
};
