window.plethoraBit = {
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
};
