window.plethoraBit = {
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
};
