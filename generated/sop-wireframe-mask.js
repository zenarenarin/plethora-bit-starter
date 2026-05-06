window.plethoraBit = {
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
};
