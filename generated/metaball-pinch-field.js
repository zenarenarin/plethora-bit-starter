window.plethoraBit = {
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
};
