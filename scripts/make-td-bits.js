const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'generated');

const bits = {
  'feedback-face-tunnel.js': String.raw`window.plethoraBit = {
  meta: {
    title: 'Feedback Face Tunnel',
    author: 'plethora',
    description: 'A recursive camera tunnel that bends like a TouchDesigner feedback network.',
    tags: ['camera', 'design', 'interactive'],
    permissions: ['camera', 'haptics'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d');
    const fb = ctx.createCanvas2D();
    fb.style.display = 'none';
    fb.width = W; fb.height = H;
    const fg = fb.getContext('2d');
    let video = null, started = false, loading = false, err = null, running = true;
    let touch = { x: W / 2, y: H / 2, down: false };
    let swirl = 0, zoom = 0.985, pulse = 0;

    function start() {
      if (loading || started) return;
      loading = true;
      ctx.camera.start({ facing: 'user' }).then((v) => {
        video = v; started = true; loading = false;
        ctx.platform.start();
        ctx.platform.haptic('light');
      }).catch((e) => { err = e.message || 'Camera denied'; loading = false; });
    }

    function coverDraw(target) {
      if (!video || !ctx.camera.ready) return;
      const vw = video.videoWidth || ctx.camera.width || W;
      const vh = video.videoHeight || ctx.camera.height || H;
      const sc = Math.max(W / vw, H / vh);
      const dw = vw * sc, dh = vh * sc;
      const dx = (W - dw) / 2, dy = (H - dh) / 2;
      target.save();
      target.translate(W, 0);
      target.scale(-1, 1);
      target.drawImage(video, dx, dy, dw, dh);
      target.restore();
    }

    function screen() {
      g.fillStyle = '#05070b';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '800 ' + Math.max(22, H * 0.045) + 'px sans-serif';
      g.fillStyle = err ? '#ff6177' : '#fff';
      g.fillText(err || (loading ? 'opening camera' : 'tap to start'), W / 2, H * 0.47);
      g.font = Math.max(12, H * 0.02) + 'px sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillText('drag to bend the feedback tunnel', W / 2, H * 0.54);
    }

    ctx.listen(canvas, 'touchstart', (e) => {
      e.preventDefault(); start();
      const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY, down: true };
    }, { passive: false });
    ctx.listen(canvas, 'touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; touch.x = t.clientX; touch.y = t.clientY;
      pulse = Math.min(1, pulse + 0.08);
    }, { passive: false });
    ctx.listen(canvas, 'touchend', (e) => { e.preventDefault(); touch.down = false; }, { passive: false });

    ctx.raf((dt) => {
      if (!running) return;
      if (!started) { screen(); return; }
      const t = performance.now() * 0.001;
      swirl += (touch.down ? 0.034 : 0.012) * (dt / 16.67);
      pulse *= 0.94;
      zoom = 0.982 + Math.sin(t * 0.9) * 0.006 - pulse * 0.014;

      fg.save();
      fg.globalCompositeOperation = 'source-over';
      fg.fillStyle = 'rgba(2,4,10,0.08)';
      fg.fillRect(0, 0, W, H);
      fg.translate(W / 2, H / 2);
      fg.rotate(Math.sin(swirl) * 0.012 + (touch.x - W / 2) / W * 0.018);
      fg.scale(1 / zoom, 1 / zoom);
      fg.translate(-W / 2 + (touch.x - W / 2) * 0.014, -H / 2 + (touch.y - H / 2) * 0.014);
      fg.globalAlpha = 0.92;
      fg.drawImage(canvas, 0, 0, W, H);
      fg.restore();

      fg.globalCompositeOperation = 'screen';
      fg.globalAlpha = 0.62;
      coverDraw(fg);
      fg.globalAlpha = 1;
      fg.globalCompositeOperation = 'source-over';

      g.drawImage(fb, 0, 0);
      const cx = touch.x, cy = touch.y;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.58);
      grd.addColorStop(0, 'rgba(110,255,230,0.18)');
      grd.addColorStop(0.42, 'rgba(255,62,182,0.08)');
      grd.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const r = (i + 1) * Math.min(W, H) * 0.055 + Math.sin(t * 1.7 + i) * 8;
        g.strokeStyle = 'hsla(' + (180 + i * 17 + t * 40) + ',100%,70%,' + (0.18 - i * 0.012) + ')';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(cx, cy, r * 1.25, r * 0.72, swirl + i * 0.18, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    });

    ctx.platform.ready();
    ctx.onDestroy(() => { running = false; try { ctx.camera.stop(); } catch {} });
  },
  pause(ctx) { ctx.camera.pause(); },
  resume(ctx) { ctx.camera.resume(); },
};`,

  'hand-chop-synth.js': String.raw`window.plethoraBit = {
  meta: {
    title: 'Hand CHOP Synth',
    author: 'plethora',
    description: 'Finger joints become CHOP-style control signals for a neon visual synth.',
    tags: ['camera', 'hands', 'design'],
    permissions: ['camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d');
    const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
    const CONNECTORS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    let video = null, hands = null, modelReady = false, cameraReady = false, started = false, loading = false, err = null;
    let lastResults = null, busy = false, lastDetect = 0, phase = 0, energy = 0, spread = 0, pinch = 0, roll = 0;
    const waves = Array.from({ length: 64 }, () => 0);

    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
    function cover(){const vw=video?.videoWidth||ctx.camera.width||W,vh=video?.videoHeight||ctx.camera.height||H,sc=Math.max(W/vw,H/vh);return{dw:vw*sc,dh:vh*sc,dx:(W-vw*sc)/2,dy:(H-vh*sc)/2};}
    function pt(lm){const c=cover();return{x:W-(c.dx+lm.x*c.dw),y:c.dy+lm.y*c.dh,z:lm.z||0};}
    function drawVideo(){if(!video||!ctx.camera.ready)return;const c=cover();g.save();g.translate(W,0);g.scale(-1,1);g.drawImage(video,c.dx,c.dy,c.dw,c.dh);g.restore();g.fillStyle='rgba(0,0,0,0.62)';g.fillRect(0,0,W,H);}

    async function load(){try{await ctx.loadScript(MP_BASE+'/hands.js');hands=new window.Hands({locateFile:f=>MP_BASE+'/'+f});hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:0.62,minTrackingConfidence:0.55});hands.onResults(r=>{lastResults=r||null;});modelReady=true;}catch(e){err=e.message||'hands failed';}}
    async function start(){if(loading||cameraReady)return;loading=true;try{video=await ctx.camera.start({facing:'user'});cameraReady=true;started=true;loading=false;ctx.platform.start();ctx.platform.haptic('light');}catch(e){err=e.message||'Camera denied';loading=false;}}
    async function detect(){if(!modelReady||!cameraReady||!ctx.camera.ready||busy)return;const now=performance.now();if(now-lastDetect<33)return;lastDetect=now;busy=true;try{await hands.send({image:video});}catch(e){err=e.message||'detection failed';}finally{busy=false;}}
    function startScreen(){g.fillStyle='#050608';g.fillRect(0,0,W,H);g.textAlign='center';g.textBaseline='middle';g.font='800 '+Math.max(22,H*.045)+'px sans-serif';g.fillStyle=err?'#ff6177':'#fff';g.fillText(err||(modelReady?'tap to start':'loading hand synth'),W/2,H*.47);g.font=Math.max(12,H*.02)+'px sans-serif';g.fillStyle='rgba(255,255,255,.46)';g.fillText('spread, pinch, and roll both hands',W/2,H*.54);}
    function drawHand(pts,i){g.save();g.lineCap='round';g.lineJoin='round';g.lineWidth=Math.max(2,W*.006);g.strokeStyle=i?'#ff66d8':'#79ffd7';g.shadowColor=g.strokeStyle;g.shadowBlur=14;for(const [a,b] of CONNECTORS){g.beginPath();g.moveTo(pts[a].x,pts[a].y);g.lineTo(pts[b].x,pts[b].y);g.stroke();}for(let k=0;k<pts.length;k++){const p=pts[k],tip=[4,8,12,16,20].includes(k);g.fillStyle=tip?'#fff36e':(i?'#ff66d8':'#79ffd7');g.beginPath();g.arc(p.x,p.y,tip?7:3.5,0,Math.PI*2);g.fill();}g.restore();}
    function signals(){let all=[];const lm=lastResults?.multiHandLandmarks||[];for(let i=0;i<lm.length;i++){const pts=lm[i].map(pt);all.push(pts);drawHand(pts,i);}if(!all.length){energy*=.94;spread*=.94;pinch=pinch*.9+.1;return;}let spreads=[],pinches=[],angles=[];for(const pts of all){spreads.push((dist(pts[4],pts[20])+dist(pts[8],pts[16]))/(W*.55));pinches.push(dist(pts[4],pts[8])/(W*.28));angles.push(Math.atan2(pts[9].y-pts[0].y,pts[9].x-pts[0].x));}spread=spread*.82+clamp(spreads.reduce((a,b)=>a+b,0)/spreads.length,0,1)*.18;pinch=pinch*.82+clamp(pinches.reduce((a,b)=>a+b,0)/pinches.length,0,1)*.18;roll=roll*.86+(angles.reduce((a,b)=>a+b,0)/angles.length)*.14;energy=energy*.86+clamp(spread+(1-pinch)*.7,0,1)*.14;}
    function drawSynth(dt){phase+=dt*.001*(1.4+energy*4);waves.push(Math.sin(phase*2.1+roll)*energy);waves.shift();g.save();g.globalCompositeOperation='lighter';for(let band=0;band<7;band++){const y=H*(.18+band*.105);g.beginPath();for(let i=0;i<waves.length;i++){const x=i/(waves.length-1)*W;const a=waves[i]*Math.sin(i*.31+phase+band);const yy=y+a*H*(.04+band*.006)+Math.sin(i*.24+phase*band)*18*spread;if(i)g.lineTo(x,yy);else g.moveTo(x,yy);}g.strokeStyle='hsla('+(170+band*34+roll*80)+',100%,'+(58+band*3)+'%,'+(.35+energy*.38)+')';g.lineWidth=2+energy*5;g.shadowBlur=22;g.shadowColor=g.strokeStyle;g.stroke();}for(let i=0;i<48;i++){const a=i/48*Math.PI*2+roll;const r=Math.min(W,H)*(.12+.24*spread)+Math.sin(phase*2+i)*28*(1-pinch);const x=W/2+Math.cos(a)*r;const y=H/2+Math.sin(a)*r*.72;g.fillStyle='hsla('+(i*8+phase*60)+',100%,70%,'+(.2+energy*.45)+')';g.beginPath();g.arc(x,y,2+energy*7,0,Math.PI*2);g.fill();}g.restore();g.font='700 '+Math.max(12,H*.018)+'px monospace';g.fillStyle='rgba(255,255,255,.72)';g.fillText('SPREAD '+Math.round(spread*100)+'  PINCH '+Math.round((1-pinch)*100)+'  ENERGY '+Math.round(energy*100),18,30);}

    ctx.listen(canvas,'touchstart',e=>{e.preventDefault();if(modelReady)start();},{passive:false});
    load();ctx.platform.ready();
    ctx.raf(dt=>{if(!started){startScreen();return;}drawVideo();detect();signals();drawSynth(dt);});
    ctx.onDestroy(()=>{try{ctx.camera.stop();hands?.close?.();}catch{}});
  },
  pause(ctx){ctx.camera.pause();},
  resume(ctx){ctx.camera.resume();},
};`,

  'thermal-feedback-mirror.js': String.raw`window.plethoraBit = {
  meta: {
    title: 'Thermal Feedback Mirror',
    author: 'plethora',
    description: 'A heatmap camera mirror with burning trails pulled around by your hands.',
    tags: ['camera', 'hands', 'design'],
    permissions: ['camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const W = ctx.width, H = ctx.height;
    const canvas = ctx.createCanvas2D({ touchAction: 'none' });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const small = ctx.createCanvas2D(); small.style.display = 'none'; small.width = 180; small.height = Math.max(2, Math.round(180 * H / W));
    const sg = small.getContext('2d', { willReadFrequently: true });
    const fb = ctx.createCanvas2D(); fb.style.display = 'none'; fb.width = W; fb.height = H;
    const fg = fb.getContext('2d');
    const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
    let video=null,hands=null,modelReady=false,cameraReady=false,started=false,loading=false,err=null,lastResults=null,busy=false,lastDetect=0;
    const hot=[];
    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function heat(v){const t=v/255;if(t<.22)return[20*t*8,0,70+130*t];if(t<.45){const k=(t-.22)/.23;return[0,80+160*k,255];}if(t<.7){const k=(t-.45)/.25;return[255*k,240,255*(1-k)];}const k=(t-.7)/.3;return[255,240*(1-k)+255*k,30*(1-k)+230*k];}
    function cover(target,w,h){const vw=video?.videoWidth||ctx.camera.width||w,vh=video?.videoHeight||ctx.camera.height||h,sc=Math.max(w/vw,h/vh);return{dw:vw*sc,dh:vh*sc,dx:(w-vw*sc)/2,dy:(h-vh*sc)/2};}
    function drawCamSmall(){const c=cover(sg,small.width,small.height);sg.save();sg.translate(small.width,0);sg.scale(-1,1);sg.drawImage(video,c.dx,c.dy,c.dw,c.dh);sg.restore();}
    function pt(lm){const c=cover(g,W,H);return{x:W-(c.dx+lm.x*c.dw),y:c.dy+lm.y*c.dh};}
    async function load(){try{await ctx.loadScript(MP_BASE+'/hands.js');hands=new window.Hands({locateFile:f=>MP_BASE+'/'+f});hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.62,minTrackingConfidence:.55});hands.onResults(r=>lastResults=r||null);modelReady=true;}catch(e){err=e.message||'hands failed';}}
    async function start(){if(loading||cameraReady)return;loading=true;try{video=await ctx.camera.start({facing:'user'});cameraReady=true;started=true;loading=false;ctx.platform.start();ctx.platform.haptic('light');}catch(e){err=e.message||'Camera denied';loading=false;}}
    async function detect(){if(!modelReady||!cameraReady||busy||!ctx.camera.ready)return;const now=performance.now();if(now-lastDetect<45)return;lastDetect=now;busy=true;try{await hands.send({image:video});}catch(e){err=e.message||'detect failed';}finally{busy=false;}}
    function startScreen(){g.fillStyle='#050608';g.fillRect(0,0,W,H);g.textAlign='center';g.textBaseline='middle';g.font='800 '+Math.max(22,H*.045)+'px sans-serif';g.fillStyle=err?'#ff6177':'#fff';g.fillText(err||(modelReady?'tap to start':'loading thermal mirror'),W/2,H*.47);g.font=Math.max(12,H*.02)+'px sans-serif';g.fillStyle='rgba(255,255,255,.46)';g.fillText('move hands to burn heat into the frame',W/2,H*.54);}
    function thermalize(){drawCamSmall();const img=sg.getImageData(0,0,small.width,small.height);const d=img.data;for(let i=0;i<d.length;i+=4){const lum=d[i]*.299+d[i+1]*.587+d[i+2]*.114;const edge=Math.abs(d[i]-(d[Math.max(0,i-4)]||d[i]))+Math.abs(d[i+1]-(d[Math.max(0,i-small.width*4)]||d[i+1]));const c=heat(clamp(lum+edge*.55,0,255));d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];}sg.putImageData(img,0,0);}
    function handHeat(){const lm=lastResults?.multiHandLandmarks||[];for(let i=0;i<lm.length;i++){for(const idx of [4,8,12,16,20]){const p=pt(lm[i][idx]);hot.push({x:p.x,y:p.y,r:22+idx,life:1,h:idx*18+i*90});}}while(hot.length>160)hot.shift();}
    ctx.listen(canvas,'touchstart',e=>{e.preventDefault();if(modelReady)start();},{passive:false});
    load();ctx.platform.ready();
    ctx.raf(dt=>{if(!started){startScreen();return;}detect();thermalize();fg.save();fg.globalAlpha=.91;fg.translate(W/2,H/2);fg.scale(1.012,1.012);fg.rotate(Math.sin(performance.now()*.0006)*.006);fg.translate(-W/2,-H/2);fg.drawImage(canvas,0,0,W,H);fg.restore();fg.globalCompositeOperation='screen';fg.globalAlpha=.7;fg.drawImage(small,0,0,W,H);fg.globalAlpha=1;fg.globalCompositeOperation='source-over';handHeat();for(let i=hot.length-1;i>=0;i--){const p=hot[i];p.life-=dt*.0012;p.r+=dt*.035;if(p.life<=0){hot.splice(i,1);continue;}const grd=fg.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);grd.addColorStop(0,'hsla('+p.h+',100%,72%,'+(p.life*.42)+')');grd.addColorStop(1,'rgba(0,0,0,0)');fg.fillStyle=grd;fg.beginPath();fg.arc(p.x,p.y,p.r,0,Math.PI*2);fg.fill();}g.drawImage(fb,0,0);g.fillStyle='rgba(0,0,0,.12)';g.fillRect(0,0,W,H);g.font='700 '+Math.max(12,H*.018)+'px monospace';g.fillStyle='rgba(255,255,255,.72)';g.fillText('THERMAL FEEDBACK '+hot.length,18,30);});
    ctx.onDestroy(()=>{try{ctx.camera.stop();hands?.close?.();}catch{}});
  },
  pause(ctx){ctx.camera.pause();},
  resume(ctx){ctx.camera.resume();},
};`,

  'metaball-pinch-field.js': String.raw`window.plethoraBit = {
  meta: {
    title: 'Metaball Pinch Field',
    author: 'plethora',
    description: 'Fingertips spawn liquid blobs that fuse into a glowing membrane when you pinch.',
    tags: ['camera', 'hands', 'design'],
    permissions: ['camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const W=ctx.width,H=ctx.height,canvas=ctx.createCanvas2D({touchAction:'none'}),g=canvas.getContext('2d');
    const field=ctx.createCanvas2D();field.style.display='none';field.width=160;field.height=Math.max(2,Math.round(160*H/W));const f=field.getContext('2d',{willReadFrequently:true});
    const MP_BASE='https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
    let video=null,hands=null,modelReady=false,cameraReady=false,started=false,loading=false,err=null,lastResults=null,busy=false,lastDetect=0,popLatch=false;
    function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
    function cover(){const vw=video?.videoWidth||ctx.camera.width||W,vh=video?.videoHeight||ctx.camera.height||H,sc=Math.max(W/vw,H/vh);return{dw:vw*sc,dh:vh*sc,dx:(W-vw*sc)/2,dy:(H-vh*sc)/2};}
    function pt(lm){const c=cover();return{x:W-(c.dx+lm.x*c.dw),y:c.dy+lm.y*c.dh};}
    function drawVideo(){if(!video||!ctx.camera.ready)return;const c=cover();g.save();g.translate(W,0);g.scale(-1,1);g.drawImage(video,c.dx,c.dy,c.dw,c.dh);g.restore();g.fillStyle='rgba(0,0,0,.66)';g.fillRect(0,0,W,H);}
    async function load(){try{await ctx.loadScript(MP_BASE+'/hands.js');hands=new window.Hands({locateFile:x=>MP_BASE+'/'+x});hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.62,minTrackingConfidence:.55});hands.onResults(r=>lastResults=r||null);modelReady=true;}catch(e){err=e.message||'hands failed';}}
    async function start(){if(loading||cameraReady)return;loading=true;try{video=await ctx.camera.start({facing:'user'});cameraReady=true;started=true;loading=false;ctx.platform.start();ctx.platform.haptic('light');}catch(e){err=e.message||'Camera denied';loading=false;}}
    async function detect(){if(!modelReady||!cameraReady||busy||!ctx.camera.ready)return;const now=performance.now();if(now-lastDetect<33)return;lastDetect=now;busy=true;try{await hands.send({image:video});}catch(e){err=e.message||'detect failed';}finally{busy=false;}}
    function startScreen(){g.fillStyle='#050608';g.fillRect(0,0,W,H);g.textAlign='center';g.textBaseline='middle';g.font='800 '+Math.max(22,H*.045)+'px sans-serif';g.fillStyle=err?'#ff6177':'#fff';g.fillText(err||(modelReady?'tap to start':'loading liquid field'),W/2,H*.47);g.font=Math.max(12,H*.02)+'px sans-serif';g.fillStyle='rgba(255,255,255,.46)';g.fillText('pinch thumb and index to fuse the membrane',W/2,H*.54);}
    function blobs(){const lm=lastResults?.multiHandLandmarks||[],tips=[],pinches=[];for(let i=0;i<lm.length;i++){const pts=lm[i].map(pt);for(const idx of [4,8,12,16,20])tips.push({...pts[idx],h:idx*22+i*80,r:idx===4||idx===8?34:24});pinches.push(Math.hypot(pts[4].x-pts[8].x,pts[4].y-pts[8].y));g.strokeStyle=i?'rgba(255,102,216,.45)':'rgba(121,255,215,.45)';g.lineWidth=2;for(const [a,b] of [[4,8],[8,12],[12,16],[16,20]]){g.beginPath();g.moveTo(pts[a].x,pts[a].y);g.lineTo(pts[b].x,pts[b].y);g.stroke();}}const pinch=pinches.length?Math.min(...pinches):999;if(pinch<24&&!popLatch){popLatch=true;ctx.platform.haptic('medium');ctx.platform.milestone('metaball-fuse',{pinch});}if(pinch>42)popLatch=false;f.clearRect(0,0,field.width,field.height);f.globalCompositeOperation='source-over';for(const p of tips){const x=p.x/W*field.width,y=p.y/H*field.height,r=p.r/W*field.width*(pinch<45?1.8:1);const grd=f.createRadialGradient(x,y,0,x,y,r);grd.addColorStop(0,'rgba(255,255,255,1)');grd.addColorStop(1,'rgba(255,255,255,0)');f.fillStyle=grd;f.beginPath();f.arc(x,y,r,0,Math.PI*2);f.fill();}const img=f.getImageData(0,0,field.width,field.height),d=img.data;for(let i=0;i<d.length;i+=4){const a=d[i];if(a>62){const hot=clamp((a-62)/193,0,1);d[i]=60+195*hot;d[i+1]=210+45*Math.sin(hot*Math.PI);d[i+2]=255-90*hot;d[i+3]=120+110*hot;}else d[i+3]=0;}f.putImageData(img,0,0);g.save();g.globalCompositeOperation='screen';g.imageSmoothingEnabled=true;g.drawImage(field,0,0,W,H);g.restore();for(const p of tips){g.fillStyle='hsla('+p.h+',100%,72%,.95)';g.shadowBlur=18;g.shadowColor=g.fillStyle;g.beginPath();g.arc(p.x,p.y,5,0,Math.PI*2);g.fill();}g.shadowBlur=0;g.fillStyle='rgba(255,255,255,.72)';g.font='700 '+Math.max(12,H*.018)+'px monospace';g.fillText('FUSE '+(pinch<999?Math.round(Math.max(0,100-pinch)):0),18,30);}
    ctx.listen(canvas,'touchstart',e=>{e.preventDefault();if(modelReady)start();},{passive:false});load();ctx.platform.ready();ctx.raf(dt=>{if(!started){startScreen();return;}drawVideo();detect();blobs();});ctx.onDestroy(()=>{try{ctx.camera.stop();hands?.close?.();}catch{}});
  },
  pause(ctx){ctx.camera.pause();},
  resume(ctx){ctx.camera.resume();},
};`,

  'kinect-ghost.js': String.raw`window.plethoraBit = {
  meta: {
    title: 'Kinect Ghost',
    author: 'plethora',
    description: 'A camera-motion point cloud that turns your silhouette into a depth-like ghost.',
    tags: ['camera', 'design', 'interactive'],
    permissions: ['camera', 'haptics'],
  },

  async init(ctx) {
    const W=ctx.width,H=ctx.height,canvas=ctx.createCanvas2D({touchAction:'none'}),g=canvas.getContext('2d');
    const s=ctx.createCanvas2D();s.style.display='none';s.width=120;s.height=Math.max(2,Math.round(120*H/W));const sg=s.getContext('2d',{willReadFrequently:true});
    let video=null,started=false,loading=false,err=null,prev=null,points=[],running=true;
    function cover(w,h){const vw=video?.videoWidth||ctx.camera.width||w,vh=video?.videoHeight||ctx.camera.height||h,sc=Math.max(w/vw,h/vh);return{dw:vw*sc,dh:vh*sc,dx:(w-vw*sc)/2,dy:(h-vh*sc)/2};}
    function start(){if(loading||started)return;loading=true;ctx.camera.start({facing:'user'}).then(v=>{video=v;started=true;loading=false;ctx.platform.start();ctx.platform.haptic('light');}).catch(e=>{err=e.message||'Camera denied';loading=false;});}
    function screen(){g.fillStyle='#050608';g.fillRect(0,0,W,H);g.textAlign='center';g.textBaseline='middle';g.font='800 '+Math.max(22,H*.045)+'px sans-serif';g.fillStyle=err?'#ff6177':'#fff';g.fillText(err||(loading?'opening camera':'tap to start'),W/2,H*.47);g.font=Math.max(12,H*.02)+'px sans-serif';g.fillStyle='rgba(255,255,255,.46)';g.fillText('move slowly for a depth ghost',W/2,H*.54);}
    function sample(){const c=cover(s.width,s.height);sg.save();sg.translate(s.width,0);sg.scale(-1,1);sg.drawImage(video,c.dx,c.dy,c.dw,c.dh);sg.restore();const img=sg.getImageData(0,0,s.width,s.height),d=img.data;if(!prev){prev=new Uint8ClampedArray(d);return;}for(let y=0;y<s.height;y+=3){for(let x=0;x<s.width;x+=3){const i=(y*s.width+x)*4;const lum=d[i]*.299+d[i+1]*.587+d[i+2]*.114;const old=prev[i]*.299+prev[i+1]*.587+prev[i+2]*.114;const motion=Math.abs(lum-old);if(motion>16&&Math.random()<.32){points.push({x:x/s.width*W,y:y/s.height*H,z:motion/55,life:1,h:180+motion*2,vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.6});}}}prev.set(d);while(points.length>900)points.splice(0,points.length-900);}
    ctx.listen(canvas,'touchstart',e=>{e.preventDefault();start();},{passive:false});ctx.platform.ready();
    ctx.raf(dt=>{if(!running)return;if(!started){screen();return;}sample();g.fillStyle='rgba(1,4,10,.26)';g.fillRect(0,0,W,H);const t=performance.now()*.001;g.save();g.globalCompositeOperation='lighter';for(let i=points.length-1;i>=0;i--){const p=points[i];p.life-=dt*.00055;p.x+=p.vx+Math.sin(t+p.y*.01)*p.z*.35;p.y+=p.vy-Math.cos(t+p.x*.01)*p.z*.18;if(p.life<=0){points.splice(i,1);continue;}const r=1.2+p.z*5;g.fillStyle='hsla('+(p.h+t*40)+',100%,72%,'+(p.life*.55)+')';g.beginPath();g.arc(p.x+(p.z-.5)*18,p.y,r,0,Math.PI*2);g.fill();}g.restore();g.fillStyle='rgba(255,255,255,.7)';g.font='700 '+Math.max(12,H*.018)+'px monospace';g.fillText('POINT CLOUD '+points.length,18,30);});
    ctx.onDestroy(()=>{running=false;try{ctx.camera.stop();}catch{}});
  },
  pause(ctx){ctx.camera.pause();},
  resume(ctx){ctx.camera.resume();},
};`,

  'sop-wireframe-mask.js': String.raw`window.plethoraBit = {
  meta: {
    title: 'SOP Wireframe Mask',
    author: 'plethora',
    description: 'Hand landmarks become triangulated SOP-style masks filled with live camera texture.',
    tags: ['camera', 'hands', 'design'],
    permissions: ['camera', 'haptics', 'networkFetch'],
  },

  async init(ctx) {
    const W=ctx.width,H=ctx.height,canvas=ctx.createCanvas2D({touchAction:'none'}),g=canvas.getContext('2d');
    const MP_BASE='https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
    const tris=[[0,5,9],[0,9,13],[0,13,17],[5,6,9],[6,9,10],[9,10,13],[10,13,14],[13,14,17],[14,17,18],[5,8,12],[9,12,16],[13,16,20],[4,8,0],[8,12,9],[12,16,13],[16,20,17]];
    const lines=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    let video=null,hands=null,modelReady=false,cameraReady=false,started=false,loading=false,err=null,lastResults=null,busy=false,lastDetect=0;
    function cover(){const vw=video?.videoWidth||ctx.camera.width||W,vh=video?.videoHeight||ctx.camera.height||H,sc=Math.max(W/vw,H/vh);return{dw:vw*sc,dh:vh*sc,dx:(W-vw*sc)/2,dy:(H-vh*sc)/2};}
    function pt(lm){const c=cover();return{x:W-(c.dx+lm.x*c.dw),y:c.dy+lm.y*c.dh};}
    function drawCam(alpha=.22){if(!video||!ctx.camera.ready)return;const c=cover();g.save();g.globalAlpha=alpha;g.translate(W,0);g.scale(-1,1);g.drawImage(video,c.dx,c.dy,c.dw,c.dh);g.restore();}
    async function load(){try{await ctx.loadScript(MP_BASE+'/hands.js');hands=new window.Hands({locateFile:f=>MP_BASE+'/'+f});hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:.62,minTrackingConfidence:.55});hands.onResults(r=>lastResults=r||null);modelReady=true;}catch(e){err=e.message||'hands failed';}}
    async function start(){if(loading||cameraReady)return;loading=true;try{video=await ctx.camera.start({facing:'user'});cameraReady=true;started=true;loading=false;ctx.platform.start();ctx.platform.haptic('light');}catch(e){err=e.message||'Camera denied';loading=false;}}
    async function detect(){if(!modelReady||!cameraReady||busy||!ctx.camera.ready)return;const now=performance.now();if(now-lastDetect<33)return;lastDetect=now;busy=true;try{await hands.send({image:video});}catch(e){err=e.message||'detect failed';}finally{busy=false;}}
    function screen(){g.fillStyle='#050608';g.fillRect(0,0,W,H);g.textAlign='center';g.textBaseline='middle';g.font='800 '+Math.max(22,H*.045)+'px sans-serif';g.fillStyle=err?'#ff6177':'#fff';g.fillText(err||(modelReady?'tap to start':'loading wireframe'),W/2,H*.47);g.font=Math.max(12,H*.02)+'px sans-serif';g.fillStyle='rgba(255,255,255,.46)';g.fillText('show hands for live texture triangles',W/2,H*.54);}
    function drawMasks(){const lm=lastResults?.multiHandLandmarks||[];for(let h=0;h<lm.length;h++){const pts=lm[h].map(pt),hue=h?305:174;for(let i=0;i<tris.length;i++){const [a,b,c]=tris[i];g.save();g.beginPath();g.moveTo(pts[a].x,pts[a].y);g.lineTo(pts[b].x,pts[b].y);g.lineTo(pts[c].x,pts[c].y);g.closePath();g.clip();drawCam(.95);g.globalCompositeOperation='screen';g.fillStyle='hsla('+(hue+i*7)+',100%,62%,.18)';g.fillRect(0,0,W,H);g.restore();}g.save();g.globalCompositeOperation='lighter';g.lineCap='round';g.lineJoin='round';g.shadowBlur=18;g.shadowColor='hsl('+hue+',100%,65%)';for(const [a,b] of lines){g.strokeStyle='hsla('+hue+',100%,70%,.72)';g.lineWidth=2.2;g.beginPath();g.moveTo(pts[a].x,pts[a].y);g.lineTo(pts[b].x,pts[b].y);g.stroke();}for(let i=0;i<pts.length;i++){g.fillStyle=[4,8,12,16,20].includes(i)?'#fff36e':'hsl('+hue+',100%,70%)';g.beginPath();g.arc(pts[i].x,pts[i].y,[4,8,12,16,20].includes(i)?5.8:3.2,0,Math.PI*2);g.fill();}g.restore();}}
    ctx.listen(canvas,'touchstart',e=>{e.preventDefault();if(modelReady)start();},{passive:false});load();ctx.platform.ready();ctx.raf(dt=>{if(!started){screen();return;}g.fillStyle='#03060b';g.fillRect(0,0,W,H);drawCam(.18);detect();drawMasks();g.fillStyle='rgba(255,255,255,.7)';g.font='700 '+Math.max(12,H*.018)+'px monospace';g.fillText('SOP TRIANGLES '+((lastResults?.multiHandLandmarks?.length||0)*tris.length),18,30);});ctx.onDestroy(()=>{try{ctx.camera.stop();hands?.close?.();}catch{}});
  },
  pause(ctx){ctx.camera.pause();},
  resume(ctx){ctx.camera.resume();},
};`,
};

fs.mkdirSync(outDir, { recursive: true });
for (const [file, source] of Object.entries(bits)) {
  fs.writeFileSync(path.join(outDir, file), source + '\n');
  console.log(file);
}
