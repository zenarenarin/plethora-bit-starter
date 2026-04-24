window.scrollerApp = {
  meta: {
    title: 'Mario in Rajasthan',
    author: 'YourUsername',
    description: 'Collect marigolds, stomp peacocks, reach the palace!',
    tags: ['game'],
  },

  init(container) {
    const W = container.clientWidth, H = container.clientHeight;
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const GY        = H - 72;   // ground y
    const GRAVITY   = 0.45;
    const JUMP_V    = -12.5;
    const SPEED     = 3.4;
    const LEVEL_W   = W * 7;
    const PW = 30, PH = 46;     // player width/height

    // ── Level data ────────────────────────────────────────────────────────────

    const platforms = [
      // ground (split with one gap so it's interesting)
      {x:0,          y:GY, w:W*2.2,      h:90, t:'g'},
      {x:W*2.4,      y:GY, w:LEVEL_W,    h:90, t:'g'},
      // floating blocks
      {x:W*.55,      y:GY-110, w:110, h:20, t:'b'},
      {x:W*.9,       y:GY-170, w:90,  h:20, t:'b'},
      {x:W*1.2,      y:GY-110, w:110, h:20, t:'b'},
      {x:W*1.55,     y:GY-190, w:90,  h:20, t:'b'},
      {x:W*1.8,      y:GY-120, w:80,  h:20, t:'b'},
      // after gap
      {x:W*2.5,      y:GY-150, w:100, h:20, t:'b'},
      {x:W*2.8,      y:GY-100, w:130, h:20, t:'b'},
      {x:W*3.1,      y:GY-180, w:90,  h:20, t:'b'},
      {x:W*3.4,      y:GY-240, w:80,  h:20, t:'b'},
      {x:W*3.7,      y:GY-120, w:120, h:20, t:'b'},
      {x:W*4.0,      y:GY-200, w:100, h:20, t:'b'},
      {x:W*4.3,      y:GY-140, w:110, h:20, t:'b'},
      {x:W*4.6,      y:GY-100, w:150, h:20, t:'b'},
      {x:W*5.0,      y:GY-170, w:90,  h:20, t:'b'},
      {x:W*5.3,      y:GY-260, w:80,  h:20, t:'b'},
      {x:W*5.6,      y:GY-120, w:130, h:20, t:'b'},
      {x:W*6.1,      y:GY-160, w:100, h:20, t:'b'},
    ];

    const pf = platforms; // shorthand for coin placement

    const coins = [
      // ground run
      130,150,170, 300,320,340,
      // on platforms (above each)
    ].map(x => ({x, y:GY-36, col:false, a:Math.random()*6.28}));

    // platform coins
    const platCoins = [
      [2, 3], [2, 1], [2, -1],       // plat 2
      [3, 2], [3, 0], [3, -2],
      [4, 2], [4, 0],
      [7, 2], [7, -1],
      [8, 2], [8, 0], [8, -2],
      [10, 2],[10, 0],
      [12, 2],[12, -1],
      [14, 2],[14, 0],[14,-2],
      [15, 2],[15, -1],
      [16, 2],
      [17, 2],[17, 0],
      [18, 2],[18, 0],
    ];
    platCoins.forEach(([pi, off]) => {
      const p = pf[pi];
      coins.push({x: p.x + p.w/2 + off*22, y: p.y - 28, col: false, a: Math.random()*6.28});
    });

    const ENEMY_DEFS = [
      {x:350,  y:GY-34,      vx:-1.2, pl:null},
      {x:W*.6+30, y:pf[2].y-34, vx:1.2,  pl:2},
      {x:W*.93+20,y:pf[3].y-34, vx:-1.2, pl:3},
      {x:W*1.22, y:pf[4].y-34, vx:1.2,  pl:4},
      {x:W*1.6+10,y:pf[5].y-34,vx:-1.2, pl:5},
      {x:W*2.55+20,y:pf[7].y-34,vx:1.2, pl:7},
      {x:W*2.82+30,y:pf[8].y-34,vx:-1.2,pl:8},
      {x:W*3.45+10,y:pf[10].y-34,vx:1.2,pl:10},
      {x:W*3.75+20,y:pf[11].y-34,vx:-1.5,pl:11},
      {x:W*4.05+10,y:pf[12].y-34,vx:1.2, pl:12},
      {x:W*4.35+20,y:pf[13].y-34,vx:-1.2,pl:13},
      {x:W*4.65+30,y:pf[14].y-34,vx:1.2, pl:14},
      {x:W*5.35+10,y:pf[16].y-34,vx:-1.5,pl:16},
      {x:W*5.65+20,y:pf[17].y-34,vx:1.2, pl:17},
    ];
    const enemies = ENEMY_DEFS.map(d => ({...d, w:34,h:34, alive:true, stomped:false, stompT:0, _x:d.x}));
    const endX = LEVEL_W - 180;

    // ── State ─────────────────────────────────────────────────────────────────

    const player = {x:60, y:GY-PH, vx:0, vy:0, onGround:false, facing:1, inv:0};
    let camX = 0, score = 0, lives = 3;
    let state = 'playing'; // playing | dead | gameover | won
    let stateT = 0;
    const keys = {l:false, r:false, j:false};
    let lastJ = false;

    // ── Helpers ───────────────────────────────────────────────────────────────

    function overlap(ax,ay,aw,ah, bx,by,bw,bh) {
      return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
    }

    function collidePlayer() {
      player.onGround = false;
      for (const p of platforms) {
        if (!overlap(player.x,player.y,PW,PH, p.x,p.y,p.w,p.h)) continue;
        const prevBot = player.y + PH - player.vy;
        if (prevBot <= p.y + 4 && player.vy >= 0) {
          player.y = p.y - PH;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0) {
          player.y = p.y + p.h;
          player.vy = 0;
        }
      }
    }

    function resetGame() {
      player.x=60; player.y=GY-PH; player.vx=0; player.vy=0;
      player.inv=0; camX=0; score=0; lives=3;
      coins.forEach(c=>c.col=false);
      enemies.forEach((e,i)=>{Object.assign(e,ENEMY_DEFS[i]); e.alive=true; e.stomped=false; e.stompT=0;});
      state='playing'; stateT=0;
    }

    function respawn() {
      player.x=60; player.y=GY-PH; player.vx=0; player.vy=0;
      player.inv=90; camX=0; state='playing'; stateT=0;
    }

    // ── Draw helpers ──────────────────────────────────────────────────────────

    function drawBg() {
      // Sky
      const sk = ctx.createLinearGradient(0,0,0,GY);
      sk.addColorStop(0,'#7b1c1c');
      sk.addColorStop(0.25,'#c0392b');
      sk.addColorStop(0.55,'#e67e22');
      sk.addColorStop(0.85,'#f5c06e');
      sk.addColorStop(1,'#fde8b0');
      ctx.fillStyle=sk; ctx.fillRect(0,0,W,H);

      // Sun (slow parallax)
      const sunX = W*0.72 - camX*0.01;
      ctx.beginPath(); ctx.arc(sunX,H*0.14,32,0,Math.PI*2);
      ctx.fillStyle='#ffe082'; ctx.fill();
      ctx.beginPath(); ctx.arc(sunX,H*0.14,25,0,Math.PI*2);
      ctx.fillStyle='#fffde7'; ctx.fill();

      // Palace silhouette (far parallax)
      const px = W*0.5 - camX*0.06, py = H*0.38;
      ctx.fillStyle='#8b2500';
      ctx.fillRect(px-90,py,180,H*0.28);
      // towers
      for (const tx of [px-105,px+75]) {
        ctx.fillRect(tx,py-36,34,H*0.32);
        ctx.beginPath(); ctx.arc(tx+17,py-36,18,Math.PI,0); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx+10,py-36); ctx.lineTo(tx+17,py-54); ctx.lineTo(tx+24,py-36);
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(px,py-8,28,Math.PI,0); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px-10,py-8); ctx.lineTo(px,py-30); ctx.lineTo(px+10,py-8); ctx.fill();
      // arched windows
      ctx.fillStyle='#c0392b';
      for (let i=-2;i<=2;i++) {
        const wx=px+i*30;
        ctx.fillRect(wx-7,py+22,14,22);
        ctx.beginPath(); ctx.arc(wx,py+22,7,Math.PI,0); ctx.fill();
      }

      // Dunes (near parallax)
      ctx.fillStyle='#c87941';
      for (let d=0;d<6;d++) {
        const dx = (d*W*0.38 - camX*0.22 + W*6) % (W*2.3) - W*0.3;
        const dh = 55+d*12;
        ctx.beginPath();
        ctx.moveTo(dx-160,H*0.81);
        ctx.quadraticCurveTo(dx,H*0.81-dh,dx+160,H*0.81);
        ctx.lineTo(dx+160,H); ctx.lineTo(dx-160,H); ctx.fill();
      }
    }

    function drawPlatform(p) {
      const sx = p.x - camX;
      if (sx+p.w<0||sx>W) return;
      if (p.t==='g') {
        ctx.fillStyle='#c87a3a';
        ctx.fillRect(sx,p.y,p.w,p.h);
        ctx.fillStyle='#d4944e';
        ctx.fillRect(sx,p.y,p.w,6);
        // pebble dots
        ctx.fillStyle='#a86028';
        for (let i=0;i<Math.ceil(p.w/28);i++) {
          ctx.beginPath();
          ctx.arc(sx+i*28+14,p.y+12+((i%3)*7),2,0,Math.PI*2); ctx.fill();
        }
        return;
      }
      // sandstone block
      ctx.fillStyle='#c96040';
      ctx.beginPath(); ctx.roundRect(sx,p.y,p.w,p.h,4); ctx.fill();
      ctx.fillStyle='#de7a58';
      ctx.fillRect(sx+4,p.y,p.w-8,5);
      // joint lines
      ctx.strokeStyle='#a04830'; ctx.lineWidth=1;
      for (let bx=sx+38;bx<sx+p.w-5;bx+=38) {
        ctx.beginPath(); ctx.moveTo(bx,p.y); ctx.lineTo(bx,p.y+p.h); ctx.stroke();
      }
      // jaali arch hint
      ctx.strokeStyle='rgba(255,200,150,0.5)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(sx+p.w/2,p.y,p.w*0.28,Math.PI+0.4,-0.4); ctx.stroke();
    }

    function drawCoin(c) {
      if (c.col) return;
      const sx = c.x - camX;
      if (sx<-25||sx>W+25) return;
      const bob = Math.sin(performance.now()*0.003*2+c.a)*3;
      const cy = c.y + bob;
      // marigold petals
      for (let i=0;i<8;i++) {
        const a=i/8*Math.PI*2;
        ctx.fillStyle=i%2?'#ffa000':'#ffc107';
        ctx.beginPath();
        ctx.ellipse(sx+Math.cos(a)*7,cy+Math.sin(a)*7,5,3,a,0,Math.PI*2);
        ctx.fill();
      }
      ctx.fillStyle='#ffee58';
      ctx.beginPath(); ctx.arc(sx,cy,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#f57f17';
      ctx.beginPath(); ctx.arc(sx,cy,2.5,0,Math.PI*2); ctx.fill();
    }

    function drawEnemy(e) {
      if (!e.alive&&e.stompT<=0) return;
      const sx = e.x - camX + e.w/2;
      if (sx<-60||sx>W+60) return;
      const by = e.y;

      if (e.stomped) {
        ctx.fillStyle='#2e7d32';
        ctx.beginPath();
        ctx.ellipse(sx,by+e.h-3,e.w/2,5,0,0,Math.PI*2); ctx.fill();
        return;
      }

      // Tail feathers
      const COLS=['#1565c0','#00838f','#2e7d32','#6a1b9a','#0277bd'];
      for (let i=-2;i<=2;i++) {
        const a=(i/2.8)*0.75-Math.PI/2;
        const len=22;
        ctx.strokeStyle=COLS[i+2]; ctx.lineWidth=3;
        ctx.beginPath();
        ctx.moveTo(sx,by+e.h*0.55);
        ctx.lineTo(sx+Math.cos(a)*len,by+e.h*0.55+Math.sin(a)*len);
        ctx.stroke();
        ctx.fillStyle=COLS[i+2];
        ctx.beginPath(); ctx.arc(sx+Math.cos(a)*len,by+e.h*0.55+Math.sin(a)*len,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#ffeb3b';
        ctx.beginPath(); ctx.arc(sx+Math.cos(a)*len,by+e.h*0.55+Math.sin(a)*len,2,0,Math.PI*2); ctx.fill();
      }
      // body
      ctx.fillStyle='#388e3c';
      ctx.beginPath(); ctx.ellipse(sx,by+e.h*0.68,12,11,0,0,Math.PI*2); ctx.fill();
      // neck+head
      ctx.fillStyle='#1b5e20';
      const dir=e.vx>0?1:-1;
      ctx.beginPath(); ctx.ellipse(sx+dir*3,by+e.h*0.32,6,8,0,0,Math.PI*2); ctx.fill();
      // crest
      ctx.fillStyle='#00bcd4';
      for (let i=0;i<3;i++) {
        ctx.beginPath();
        ctx.arc(sx+dir*3+(i-1)*4,by+e.h*0.08-i*3.5,2.5,0,Math.PI*2); ctx.fill();
      }
      // eye
      ctx.fillStyle='#ffeb3b';
      ctx.beginPath(); ctx.arc(sx+dir*6,by+e.h*0.26,3,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#111';
      ctx.beginPath(); ctx.arc(sx+dir*7,by+e.h*0.26,1.5,0,Math.PI*2); ctx.fill();
      // legs
      const lt=performance.now()*0.01;
      ctx.strokeStyle='#33691e'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(sx-5,by+e.h-6); ctx.lineTo(sx-5+Math.sin(lt)*4,by+e.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx+5,by+e.h-6); ctx.lineTo(sx+5-Math.sin(lt)*4,by+e.h); ctx.stroke();
    }

    function drawPlayer() {
      const sx = player.x - camX;
      const py = player.y;
      const dir = player.facing;

      if (player.inv>0 && Math.floor(player.inv/4)%2) return; // blink

      // shadow
      ctx.fillStyle='rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(sx+PW/2,py+PH+2,14,4,0,0,Math.PI*2); ctx.fill();

      const cx=sx+PW/2;
      const wt=player.onGround&&Math.abs(player.vx)>0.5 ? Math.sin(performance.now()*0.015)*7 : 0;

      // dhoti - saffron orange
      ctx.fillStyle='#f57c00';
      ctx.beginPath(); ctx.roundRect(cx-11,py+26,22,20,3); ctx.fill();
      ctx.strokeStyle='#e65100'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(cx,py+28); ctx.lineTo(cx,py+44); ctx.stroke();

      // kurta - ivory with embroidery
      ctx.fillStyle='#fff8e1';
      ctx.beginPath(); ctx.roundRect(cx-12,py+14,24,14,4); ctx.fill();
      ctx.strokeStyle='#ff8f00'; ctx.lineWidth=1.5;
      ctx.beginPath();
      for (let i=0;i<3;i++) {
        ctx.arc(cx-6+i*6,py+20,2,0,Math.PI*2); ctx.moveTo(cx-6+i*6+4,py+20);
      }
      ctx.stroke();

      // arms
      ctx.fillStyle='#f5cba7';
      ctx.beginPath(); ctx.roundRect(cx+12,py+14+wt,7,13,3); ctx.fill();
      ctx.beginPath(); ctx.roundRect(cx-19,py+14-wt,7,13,3); ctx.fill();

      // feet
      ctx.fillStyle='#4e342e';
      ctx.beginPath(); ctx.roundRect(cx-11,py+40+wt,10,7,2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(cx+1,py+40-wt,10,7,2); ctx.fill();

      // neck
      ctx.fillStyle='#f0b27a'; ctx.fillRect(cx-4,py+9,8,7);

      // head
      ctx.fillStyle='#f0b27a';
      ctx.beginPath(); ctx.arc(cx,py+7,10,0,Math.PI*2); ctx.fill();

      // turban
      ctx.fillStyle='#c62828';
      ctx.beginPath();
      ctx.arc(cx,py+4,11.5,Math.PI,0); ctx.fill();
      ctx.fillRect(cx-11.5,py+4,23,5);
      ctx.strokeStyle='#ffb300'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx,py+5,10.5,Math.PI+0.2,-0.2); ctx.stroke();
      ctx.fillStyle='#ffee58';
      ctx.beginPath(); ctx.arc(cx+dir*5,py+3,3,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff1744';
      ctx.beginPath(); ctx.arc(cx+dir*5,py+3,1.5,0,Math.PI*2); ctx.fill();

      // eyes + mustache
      ctx.fillStyle='#333';
      ctx.beginPath(); ctx.arc(cx+dir*4,py+7,1.8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(cx+dir*3.5,py+6.5,0.8,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#5d4037'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(cx+3,py+10,2.5,Math.PI,0,true); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx-3,py+10,2.5,Math.PI,0,true); ctx.stroke();
    }

    function drawEndPalace() {
      const sx = endX - camX;
      if (sx<-200||sx>W+200) return;
      const gW=100, gy=GY-130;

      ctx.fillStyle='#b85c38';
      ctx.fillRect(sx-gW/2,gy,gW,GY-gy);

      // gate arch
      ctx.fillStyle='#3d1c02';
      ctx.fillRect(sx-18,gy+70,36,GY-gy-70);
      ctx.beginPath(); ctx.arc(sx,gy+70,18,Math.PI,0); ctx.fill();

      // domes
      ctx.fillStyle='#d4725a';
      for (let i=-1;i<=1;i++) {
        const tx=sx+i*36;
        ctx.beginPath(); ctx.arc(tx,gy,16,Math.PI,0); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx-8,gy); ctx.lineTo(tx,gy-18); ctx.lineTo(tx+8,gy); ctx.fill();
      }

      // flag waving
      const ft=performance.now()*0.003;
      ctx.fillStyle='#ff9800';
      ctx.beginPath();
      ctx.moveTo(sx,gy-24);
      ctx.lineTo(sx+20+Math.sin(ft)*6,gy-16);
      ctx.lineTo(sx,gy-8);
      ctx.fill();
      ctx.strokeStyle='#5d4037'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(sx,GY); ctx.lineTo(sx,gy-24); ctx.stroke();
    }

    function drawHUD() {
      ctx.fillStyle='rgba(0,0,0,0.38)';
      ctx.beginPath(); ctx.roundRect(10,10,170,52,8); ctx.fill();
      ctx.fillStyle='#ffee58'; ctx.font='bold 14px system-ui'; ctx.textAlign='left';
      ctx.fillText('\uD83C\uDF3C ' + score + ' pts', 20, 33);
      ctx.fillStyle='#ef5350';
      ctx.fillText('♥'.repeat(Math.max(0,lives)), 20, 54);
    }

    function drawControls() {
      // Left arrow
      ctx.fillStyle='rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(52, H-52, 34, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.font='bold 26px system-ui'; ctx.textAlign='center';
      ctx.fillText('◀', 52, H-44);

      // Right arrow
      ctx.fillStyle='rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.arc(130, H-52, 34, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.fillText('▶', 130, H-44);

      // Jump button
      ctx.fillStyle='rgba(255,200,0,0.38)';
      ctx.beginPath(); ctx.arc(W-58, H-56, 40, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.font='bold 15px system-ui';
      ctx.fillText('JUMP', W-58, H-50);
    }

    function drawOverlay(title, sub, sub2) {
      ctx.fillStyle='rgba(0,0,0,0.58)';
      ctx.fillRect(0,0,W,H);
      ctx.textAlign='center';
      ctx.fillStyle='#ffee58';
      ctx.font=`bold ${Math.round(W*0.09)}px system-ui`;
      ctx.fillText(title, W/2, H/2-28);
      ctx.fillStyle='#fff';
      ctx.font=`${Math.round(W*0.045)}px system-ui`;
      ctx.fillText(sub, W/2, H/2+14);
      if (sub2) { ctx.font=`${Math.round(W*0.036)}px system-ui`; ctx.fillText(sub2, W/2, H/2+46); }
    }

    // ── Touch input ───────────────────────────────────────────────────────────

    const evalTouches = list => {
      keys.l=false; keys.r=false; keys.j=false;
      const r = canvas.getBoundingClientRect();
      for (let i=0;i<list.length;i++) {
        const t=list[i];
        const tx=(t.clientX-r.left)*(W/r.width);
        const ty=(t.clientY-r.top)*(H/r.height);
        if (Math.hypot(tx-(W-58),ty-(H-56))<52) { keys.j=true; continue; }
        if (ty>H-100 && tx<95)  { keys.l=true; continue; }
        if (ty>H-100 && tx<175) { keys.r=true; continue; }
      }
    };

    this._onDown = e => {
      if (state!=='playing') {
        if (stateT>40) {
          if (state==='won'||state==='gameover') resetGame();
          else respawn();
        }
        return;
      }
      evalTouches(e.touches||[e]);
    };
    this._onMove = e => evalTouches(e.touches||[e]);
    this._onUp   = e => evalTouches(e.touches||[]);

    canvas.addEventListener('touchstart',  this._onDown, {passive:true});
    canvas.addEventListener('touchmove',   this._onMove, {passive:true});
    canvas.addEventListener('touchend',    this._onUp,   {passive:true});
    canvas.addEventListener('touchcancel', this._onUp,   {passive:true});
    canvas.addEventListener('mousedown',   this._onDown);
    canvas.addEventListener('mousemove',   e=>{if(e.buttons)evalTouches([e]);});
    canvas.addEventListener('mouseup',     this._onUp);

    // ── Update ────────────────────────────────────────────────────────────────

    const update = () => {
      if (state!=='playing') { stateT++; return; }

      // Player move
      if (keys.l) { player.vx=-SPEED; player.facing=-1; }
      else if (keys.r) { player.vx=SPEED; player.facing=1; }
      else player.vx*=0.7;

      if (keys.j&&!lastJ&&player.onGround) { player.vy=JUMP_V; }
      lastJ=keys.j;

      player.vy=Math.min(player.vy+GRAVITY, 18);
      player.x+=player.vx; player.y+=player.vy;

      if (player.x<0) { player.x=0; player.vx=0; }
      if (player.x+PW>LEVEL_W) { player.x=LEVEL_W-PW; }

      collidePlayer();

      if (player.y>H+60) {
        lives--;
        state=(lives<=0)?'gameover':'dead';
        stateT=0; return;
      }

      if (player.inv>0) player.inv--;

      // Coins
      for (const c of coins) {
        if (c.col) continue;
        if (Math.abs(c.x-(player.x+PW/2))<20 && Math.abs(c.y-(player.y+PH/2))<22) {
          c.col=true; score+=10;
        }
      }

      // Enemies
      for (const e of enemies) {
        if (!e.alive) { e.stompT=Math.max(0,e.stompT-1); continue; }
        if (e.stomped) { e.stompT--; if(e.stompT<=0) e.alive=false; continue; }

        e.x+=e.vx;
        if (e.pl!==null) {
          const p=pf[e.pl];
          if (e.x<p.x+4||e.x+e.w>p.x+p.w-4) e.vx*=-1;
        } else {
          if (e.x<4||e.x+e.w>LEVEL_W-4) e.vx*=-1;
        }

        if (player.inv<=0 && overlap(player.x,player.y,PW,PH, e.x,e.y,e.w,e.h)) {
          const prevBot=player.y+PH-player.vy;
          if (prevBot<=e.y+6&&player.vy>0) {
            e.stomped=true; e.stompT=28; player.vy=-9; score+=50;
          } else {
            lives--; player.inv=100; player.vy=-7;
            if (lives<=0) { state='gameover'; stateT=0; }
          }
        }
      }

      // Win
      if (Math.abs((player.x+PW/2)-endX)<55&&player.y+PH>GY-160) {
        state='won'; stateT=0;
      }

      // Camera
      const tCam=player.x-W*0.38;
      camX+=(tCam-camX)*0.12;
      camX=Math.max(0,Math.min(LEVEL_W-W,camX));
    };

    // ── Loop ─────────────────────────────────────────────────────────────────

    const loop = () => {
      ctx.clearRect(0,0,W,H);
      update();
      drawBg();
      for (const p of platforms) drawPlatform(p);
      for (const c of coins) drawCoin(c);
      drawEndPalace();
      for (const e of enemies) drawEnemy(e);
      drawPlayer();
      drawHUD();
      drawControls();

      if (state==='won')
        drawOverlay('Pahuch Gaye! 🏰','Score: '+score,'Tap to play again');
      else if (state==='gameover')
        drawOverlay('Game Over 😵','Score: '+score,'Tap to restart');
      else if (state==='dead')
        drawOverlay('Arre yaar! 💀','Lives: '+'♥'.repeat(lives),'Tap to continue');

      this._raf=requestAnimationFrame(loop);
    };
    this._raf=requestAnimationFrame(loop);
    this._canvas=canvas;
  },

  destroy() {
    cancelAnimationFrame(this._raf);
    if (this._canvas) {
      this._canvas.removeEventListener('touchstart',  this._onDown);
      this._canvas.removeEventListener('touchmove',   this._onMove);
      this._canvas.removeEventListener('touchend',    this._onUp);
      this._canvas.removeEventListener('touchcancel', this._onUp);
      this._canvas.removeEventListener('mousedown',   this._onDown);
      this._canvas.removeEventListener('mouseup',     this._onUp);
    }
    this._canvas=null;
  },
};
