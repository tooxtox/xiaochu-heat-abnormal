// Pure-time editorial camera and image-to-image transitions. No frame history.
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const fract=x=>x-Math.floor(x);
const hash=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
const shotsOf=data=>data.shots?.shots||[];
function shotIndex(shots,t){
 let lo=0,hi=shots.length;while(lo<hi){const m=(lo+hi)>>>1;if(shots[m].start<=t)lo=m+1;else hi=m}return Math.max(0,lo-1);
}
export function editorialShotAt(data,t){
 const shots=shotsOf(data),shot=shots[shotIndex(shots,t)];
 if(shot?.baseShot&&shot.rhythm&&(t<shot.rhythm.from||t>=shot.rhythm.to))return shot.baseShot;
 return shot;
}
function sceneId(data,shot,t){
 if(shot?.scene!=null)return shot.scene;
 const scenes=data.cues?.scenes||[];return scenes[shotIndex(scenes,t)]?.id||1;
}
function onsetImpact(data,t){
 const events=data.shots?.loopOnsets||data.features?.onsetTimes||[];let lo=0,hi=events.length;
 while(lo<hi){const m=(lo+hi)>>>1;if(events[m]<=t)lo=m+1;else hi=m}
 const dt=t-(events[lo-1]??-100);return dt>=0&&dt<.24?Math.exp(-dt*18):0;
}

// Per-theme framing for the background camera. The reading layer keeps its own
// camera so the lyric typography never inherits these moves.
const FRAME={
 1:{zoom:1.02},                 // INIT: stable, room-wide
 2:{zoom:1.09,roll:-.008},       // DEAD VARIABLES: pushing down the corridor
 3:{zoom:1.04},                 // FEAR: locked off, the room closes in
 4:{zoom:1.10,roll:.009},        // ERASE: the frame starts to slip
 5:{zoom:.985},                  // BLACK STAR: extreme wide, she becomes small
 6:{zoom:1.07},                  // THE FALL: forward rush
 7:{zoom:1.005},                 // MEMORY: calm, large negative space
 8:{zoom:1.11,roll:-.010},       // CORE: the frame collapses with the core
 9:{zoom:1.05,roll:.012},        // REALITY: dutch angle
 10:{zoom:1.02},                 // SIGNAL: held
 11:{zoom:.99},                  // SHUTDOWN: the room empties out
};
// Positions are canonical pixels; anchors are normalized. Overscan covers roll/pan.
export function cameraAt(data,t,reading=false){
 const editShot=editorialShotAt(data,t)||{id:1,start:0,end:data.config?.duration||243,mode:'world'};
 // 主阅读层保持原叙事镜头的平稳机位，画面可在字后快速切换。
 const shot=reading?(editShot.baseShot||editShot):editShot,rhythm=reading?null:shot.rhythm;
 const scene=sceneId(data,shot,t),p=clamp((t-shot.start)/Math.max(.001,shot.end-shot.start));
 const duration=data.config?.duration||243;
 if(t<2.73||scene===11||t>duration-1.3)return {enabled:false,shotId:shot.id,scene,mode:shot.mode,progress:p,zoom:1,panX:0,panY:0,roll:0,anchorX:.5,anchorY:.5};
 const quiet=scene===7||scene===10,critical=scene===4||scene===8||scene===9;
 const direction=shot.id%2?1:-1,travel=direction===1?smooth(p):1-smooth(p);
 const span=quiet?.026:shot.mode==='eye'?.10:shot.mode==='abstract'?.095:shot.mode==='hand'?.08:.085;
 const impact=critical?onsetImpact(data,t):0;
 const frame=reading?null:(FRAME[scene]||null);
 let zoom=(1.035+span*travel+impact*.0025)*(frame?.zoom??1);
 if(rhythm){
  const age=t-shot.start,level=rhythm.level??.6,kick=Math.exp(-age*19),sweep=direction*(1-Math.exp(-p*5));
  zoom+=level*(.045+.085*kick+.035*smooth(p));
  const mx=(zoom-1)*960,my=(zoom-1)*540;
  return {enabled:true,shotId:shot.id,scene,mode:shot.mode,progress:p,zoom,
   panX:mx*(.24+sweep*.18),panY:direction*Math.min(my*.32,14*level)*(1-smooth(p)),
   roll:direction*level*(.006+.013*kick)*(1-.65*smooth(p))+(frame?.roll??0),
   anchorX:shot.mode==='portrait'?.66:shot.mode==='eye'?.53:.5,anchorY:shot.mode==='portrait'?.44:.5,
   impact:Math.max(impact,kick),rhythm};
 }
 const marginX=(zoom-1)*960,marginY=(zoom-1)*540;
 // Positive pan preserves x≈100 titles while the image pushes into the subject.
 const panX=marginX*.57+Math.sin(p*Math.PI)*direction*Math.min(7,marginX*.11);
 const panY=Math.sin(p*Math.PI*1.1+shot.id*.7)*(quiet?2:6)+impact*direction*1.3;
 const roll=Math.sin(p*Math.PI)*direction*(quiet?.0005:critical?.0032:.0018)+impact*direction*.0008+(frame?.roll??0);
 return {enabled:true,shotId:shot.id,scene,mode:shot.mode,progress:p,zoom,panX,panY:clamp(panY,-marginY*.45,marginY*.45),roll,anchorX:.5,anchorY:shot.mode==='portrait'?.43:shot.mode==='hand'?.55:.5,impact};
}

// 前后场景的视觉反差：色板明度差 + 场景族差异 + 英雄主题加权。
// 反差越大，越应该给观众一个"世界被换掉"的强转场。
function sceneContrast(data,previousScene,scene){
  const colors={};
  for(const seg of data.cues?.scenes||[])if(colors[seg.id]===undefined)colors[seg.id]=seg.color;
  const lum=hex=>{const h=String(hex||'#090C13').replace('#','');const n=h.length===3?h.split('').map(x=>x+x).join(''):h;return .2126*parseInt(n.slice(0,2),16)+.7152*parseInt(n.slice(2,4),16)+.0722*parseInt(n.slice(4,6),16);};
  const a=lum(colors[previousScene]),b=lum(colors[scene]);
  let diff=Math.abs(a-b);
  const family=s=>s===7?'memory':(s===2||s===4)?'data':(s===5||s===8)?'void':s===11?'silence':'world';
  if(family(previousScene)!==family(scene))diff+=42;
  if(scene===5||scene===8||scene===9)diff+=18;
  return diff;
}

export function transitionAt(data,t){
  const shots=shotsOf(data);if(shots.length<2)return null;
  const to=editorialShotAt(data,t);if(!to||to.start<=0)return null;
  const from=editorialShotAt(data,to.start-1/60);if(!from)return null;
  const index=(to.baseShot||to).id-1,scene=sceneId(data,to,t),previousScene=sceneId(data,from,from.end-1/60);
  const dt=t-to.start;
  // Every transition is described the same way so the composite stage stays declarative.
  const make=(type,duration)=>{
    if(dt<0||dt>=duration)return null;
    const progress=clamp(dt/duration);
    const tint=type==='climax-burst'?'#ED8B50':type==='glass-crack'?'#E9ACC8':scene===9?'#D93B4A':'#9DE4C2';
    return {type,start:to.start,cut:to.start,end:to.start+duration,duration,progress,eased:smooth(progress),
      fromShot:from.id,toShot:to.id,scene,direction:to.id%2?1:-1,tint,contrast,
      outgoingTime:Math.max(from.start,to.start-1/60),
      centerX:to.mode==='portrait'?.65:to.mode==='hand'?.56:.5,centerY:to.mode==='eye'?.47:.48};
  };
  const sceneChanged=scene!==previousScene;
  const contrast=sceneContrast(data,previousScene,scene);
  if(to.rhythm){
    // 前后反差强的段落首切：哪怕这一镜是快切，也要给观众一个"世界被换掉"的强转场。
    if(sceneChanged&&contrast>=56&&scene!==7&&scene!==11&&scene!==10){
      return make('climax-burst',Math.min(.28,(to.end-to.start)*.45));
    }
    if(to.rhythm.cut!=='snap'){
      // 崩坏段落的段落首切改成撕纸：场景在强鼓点处被撕开。
      if((scene===4||scene===8)&&sceneChanged)return make('paper-tear',.34);
      return null;
    }
    // 疾走段落优先用有方向性与空间连续性的转场：前景高速掠过，遮挡镜头完成切换。
    const duration=Math.min(4/60,(to.end-to.start)*.22);
    return make(to.id%2?'foreground-wipe':'angular-shutter',duration);
  }
  // 前后画面反差强的地方（尤其是进入高潮）升级为多重特效转场。
  const heroEntry=contrast>=56&&scene!==7&&scene!==11&&scene!==10&&to.mode!=='eye'&&to.mode!=='hand';
  // 通过玻璃裂痕进入废墟：记忆空间崩解的那一刀（自带光环与速度线，是最重的转场之一）。
  if(previousScene===7&&scene!==7&&scene!==10&&scene!==11)return make('glass-crack',.54);
  if(heroEntry)return make('climax-burst',.56);
  // 冲入显示器：进出数字空间时，镜头直接扎进屏幕。
  if(sceneChanged&&(scene===2||previousScene===2||scene===10||previousScene===10))return make('monitor-dive',.54);
  // 高速甩镜：进出末日都市时使用，比旋转更有方向感。
  if(sceneChanged&&(scene===5||scene===6||scene===9||previousScene===5||previousScene===6||previousScene===9))return make('whip-pan',.46);
  // 强鼓点像撕纸一样把场景撕开。
  if(scene===4||scene===8)return make('paper-tear',.42);
  if(scene===7||previousScene===7||scene>=10)return make('memory-dissolve',scene===11?.65:.62);
  if(sceneChanged&&(scene===5||scene===8))return make('star-aperture',.56);
  if(to.mode==='eye')return make('iris',.46);
  if(to.mode==='hand')return make('angular-shutter',.44);
  if((scene===4||scene===9)&&(to.mode==='abstract'||to.mode==='portrait'))return make('datamosh',.38);
  // 世界之间的切换：既不是数字空间也不是都市，就让旧世界碎掉。
  if(sceneChanged&&!(scene===2||previousScene===2||scene===10||previousScene===10)&&!(scene===5||scene===6||scene===9||previousScene===5||previousScene===6||previousScene===9))return make('shatter',.46);
  if(sceneChanged)return make('light-slash',.42);
  const fallback=['shatter','light-slash','zoom-echo','digital-slices'][index%4];
  return make(fallback,fallback==='star-aperture'?.52:fallback==='angular-shutter'?.44:.40);
}

function canvasFor(resources,key,width,height){
 resources.motionCanvases??=new Map();let canvas=resources.motionCanvases.get(key);
 if(!canvas){canvas=resources.makeCanvas(width,height);resources.motionCanvases.set(key,canvas)}
 if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;return canvas;
}
// reset() 只重置绘制状态，不会清空画布；复用画布时必须显式清一次。
function reset(c,w,h){if(c.reset)c.reset();else{c.setTransform(1,0,0,1,0,0)}c.clearRect(0,0,w,h);c.globalAlpha=1;c.globalCompositeOperation='source-over'}
function drawCamera(c,image,camera,w,h){
 c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';
 if(!camera.enabled){c.drawImage(image,0,0,w,h);c.restore();return}
 const ax=w*camera.anchorX,ay=h*camera.anchorY;
 c.translate(ax+camera.panX*w/1920,ay+camera.panY*h/1080);c.rotate(camera.roll);c.scale(camera.zoom,camera.zoom);c.translate(-ax,-ay);c.drawImage(image,0,0,w,h);c.restore();
}
// 放射状速度线只进入画面外缘，位于歌词阅读层下方；短促爆发后迅速收束。
function drawRush(c,t,data,w,h){
 const shot=editorialShotAt(data,t),r=shot?.rhythm;if(!r)return;
 const age=t-shot.start,hit=Math.exp(-age*14),level=r.level??.6;
 if(hit<.06)return;
 const seed=shot.id,vanishX=w*(shot.mode==='portrait'?.64:.51),vanishY=h*.46;
 c.save();c.setTransform(1,0,0,1,0,0);
 for(let i=0;i<Math.round(14+level*15);i++){
  const a=(i+hash(seed+i*3.1))/(14+level*15)*TAU,rr=.60+hash(seed*1.7+i)*.30;
  const dx=Math.cos(a)*w*.86,dy=Math.sin(a)*h*.94;
  const x=vanishX+dx*rr,y=vanishY+dy*rr;
  // 左侧主要阅读区留空，靠近脸部中心也不落线。
  if(x<w*.43&&y>h*.19&&y<h*.83)continue;
  c.globalAlpha=hit*level*(.15+.23*hash(i+seed));c.strokeStyle=i%4?'#D93B4A':'#9DE4C2';
  c.lineWidth=Math.max(.6,w/1920*(i%5?1:2.2));c.beginPath();c.moveTo(x,y);
  c.lineTo(x+dx*(.075+.15*hit),y+dy*(.075+.15*hit));c.stroke();
 }
 c.restore();
}
function drawScaled(c,image,w,h,scale=1,x=.5,y=.5,alpha=1){
 c.save();c.globalAlpha*=alpha;c.translate(w*x,h*y);c.scale(scale,scale);c.drawImage(image,-w*x,-h*y,w,h);c.restore();
}
function aperturePath(c,type,x,y,r,rotation=0){
 c.beginPath();if(type==='iris'){c.arc(x,y,Math.max(.001,r),0,TAU);return}
 for(let i=0;i<16;i++){const a=rotation+i/16*TAU-Math.PI/2,rr=r*(i%2?.44:1),xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr;i?c.lineTo(xx,yy):c.moveTo(xx,yy)}c.closePath();
}
function compositeTransition(c,outgoing,incoming,tr,w,h){
 const p=tr.progress,e=tr.eased,direction=tr.direction;
 c.drawImage(outgoing,0,0,w,h);
 if(tr.type==='memory-dissolve'){
  drawScaled(c,incoming,w,h,1+.022*(1-e),tr.centerX,tr.centerY,e);return;
 }
 // 镜头冲入显示器：屏幕矩形从画面中央长大，新场景从屏幕内部推出来。
 if(tr.type==='monitor-dive'){
  const x=w*tr.centerX,y=h*tr.centerY;
  const sw=w*(.06+.94*e),sh=h*(.05+.95*e);
  c.save();c.beginPath();c.rect(x-sw/2,y-sh/2,sw,sh);c.clip();
  drawScaled(c,incoming,w,h,1+(1-e)*1.8,tr.centerX,tr.centerY);
  c.globalAlpha=.18;c.fillStyle='#9DE4C2';
  for(let y2=y-sh/2;y2<y+sh/2;y2+=6)c.fillRect(x-sw/2,y2,sw,2);
  c.restore();
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*.85;c.strokeStyle='#9DE4C2';c.lineWidth=Math.max(2,w/960*3);
  c.strokeRect(x-sw/2,y-sh/2,sw,sh);c.restore();
  return;
 }
 // 高速甩镜：旧画面被甩出，新画面从另一侧甩入，带横向拖影。
 if(tr.type==='whip-pan'){
  const travel=w*1.25;
  c.save();
  c.drawImage(outgoing,-direction*travel*e,0,w,h);
  c.drawImage(incoming,direction*travel*(1-e),0,w,h);
  c.restore();
  for(let i=0;i<18;i++){
   const y=(hash(i*7.3+tr.toShot)*h+(i%3)*9)%h;
   const len=w*(.12+hash(i*5.1)*.5),x=hash(i*11.7)*w;
   c.globalAlpha=Math.sin(p*Math.PI)*(.16+hash(i*3.7)*.28);
   c.fillStyle=i%3?tr.tint||'#C8CCD1':'#ED8B50';
   c.fillRect(x-direction*e*travel,y,len*(.3+e),1+hash(i*13.3)*2.4);
  }
  return;
 }
 // 世界碎裂：旧画面裂成碎片向外飞开，露出下面已经是新的世界。
 if(tr.type==='shatter'){
  const x=w*tr.centerX,y=h*tr.centerY,shards=20;
  c.drawImage(incoming,0,0,w,h);
  for(let i=0;i<shards;i++){
   const a=hash(i*7.3+tr.toShot*3.1)*TAU;
   const r0=.16+hash(i*3.3)*.26,r1=r0+.30+hash(i*5.7)*.34;
   const spread=.09+hash(i*7.1)*.12,a0=a-spread,a1=a+spread;
   c.save();c.beginPath();
   c.moveTo(x+Math.cos(a0)*r0*w,y+Math.sin(a0)*r0*h);
   c.lineTo(x+Math.cos(a0)*r1*w,y+Math.sin(a0)*r1*h);
   c.lineTo(x+Math.cos(a1)*r1*w,y+Math.sin(a1)*r1*h);
   c.lineTo(x+Math.cos(a1)*r0*w,y+Math.sin(a1)*r0*h);
   c.closePath();c.clip();
   const fly=e*e*(.35+hash(i*17.1)*.55)*w;
   c.globalAlpha=1-e*e*.85;
   c.translate(Math.cos(a)*fly,Math.sin(a)*fly*.62);
   c.drawImage(outgoing,0,0,w,h);
   c.restore();
  }
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*.3;c.strokeStyle=tr.tint||'#E9EDE5';c.lineWidth=Math.max(1,w/1920*1.6);
  for(let i=0;i<10;i++){const a=hash(i*13.1+tr.toShot)*TAU,r0=.1+hash(i*17.3)*.2,r1=r0+.4+hash(i*19.7)*.5;
   c.beginPath();c.moveTo(x+Math.cos(a)*r0*w,y+Math.sin(a)*r0*h);
   c.lineTo(x+Math.cos(a+.05)*r1*w,y+Math.sin(a+.05)*r1*h);c.stroke();}
  c.restore();
  return;
 }
 // 数字块位移：新画面被旧画面的条带切碎错位盖住，再逐条让开。
 if(tr.type==='datamosh'){
  c.drawImage(incoming,0,0,w,h);
  const bands=16;
  for(let i=0;i<bands;i++){
   const q=smooth(clamp((e-hash(i*3.1)*.55)/.45));
   if(q<=0)continue;
   const y0=i*h/bands,bh=h/bands+1;
   const off=(hash(i*7.3)-.5)*260*q*(hash(i*11.1)>.5?1:-1);
   c.save();c.globalAlpha=1-q*.9;
   c.drawImage(outgoing,0,y0,w,bh,off,y0,w,bh);
   c.restore();
   if(q<1){c.save();c.globalAlpha=Math.sin(q*Math.PI)*.5;c.fillStyle=tr.tint||'#9DE4C2';c.fillRect(0,y0,w,1.4);c.restore();}
  }
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*.22;c.fillStyle='#04070B';
  for(let y2=0;y2<h;y2+=4)c.fillRect(0,y2,w,1.6);
  c.restore();
  return;
 }
 // 斜光切开：旧画面被一道斜切的光分开，新画面从切口里推出来。
 if(tr.type==='light-slash'){
  const slant=.38,x0=w*(-.6+e*1.6);
  c.drawImage(outgoing,0,0,w,h);
  c.save();c.beginPath();
  c.moveTo(x0,0);c.lineTo(x0+w*slant,0);c.lineTo(x0+w*slant-w*slant,h);c.lineTo(x0-w*slant,h);
  c.closePath();c.clip();
  c.drawImage(incoming,0,0,w,h);
  c.restore();
  c.save();c.globalAlpha=Math.sin(p*Math.PI);c.strokeStyle='#E9EDE5';c.lineWidth=Math.max(1.6,w/1920*2.6);
  c.beginPath();c.moveTo(x0,0);c.lineTo(x0+w*slant,h);c.stroke();
  c.globalAlpha=Math.sin(p*Math.PI)*.5;c.strokeStyle=tr.tint||'#ED8B50';c.lineWidth=Math.max(1,w/1920*1.4);
  c.beginPath();c.moveTo(x0-w*slant*1.03,0);c.lineTo(x0-w*slant*1.03+w*slant,h);c.stroke();
  c.restore();
  return;
 }
 // 高潮爆发：放射速度线 + 中心推出 + 扩散光环 + 旧画面碎片 + 色散。
 // 用来处理前后反差最强的地方（进入高潮、记忆坠入核心、数字空间转入实景）。
 if(tr.type==='climax-burst'){
  const x=w*tr.centerX,y=h*tr.centerY,tint=tr.tint||'#ED8B50';
  // 反差越大，这一刀越重：速度线、光环与碎片都跟着放大。
  const k=Math.max(.34,Math.min(1,(tr.contrast??70-50)/90));
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*(.28+k*.34);
  for(let i=0;i<Math.round(22+k*26);i++){
   const a=(i/44)*TAU+tr.toShot*.7,r0=w*.10,r1=w*(.30+.55*hash(i*3.1))*(.35+e*.9);
   c.strokeStyle=i%3?tint:'#E9EDE5';c.lineWidth=1+hash(i*7.7)*2.6;
   c.beginPath();c.moveTo(x+Math.cos(a)*r0,y+Math.sin(a)*r0*.62);c.lineTo(x+Math.cos(a)*r1,y+Math.sin(a)*r1*.62);c.stroke();
  }
  c.restore();
  c.save();c.globalAlpha=e;drawScaled(c,incoming,w,h,1+(1-e)*.55,tr.centerX,tr.centerY);c.restore();
  for(let i=0;i<Math.round(6+k*10);i++){
   const a=hash(i*5.7+tr.toShot)*TAU,r0=.12+hash(i*7.1)*.2,r1=r0+.24+hash(i*9.3)*.3;
   c.save();c.beginPath();
   c.moveTo(x+Math.cos(a)*r0*w,y+Math.sin(a)*r0*h);
   c.lineTo(x+Math.cos(a)*r1*w,y+Math.sin(a)*r1*h);
   c.lineTo(x+Math.cos(a+.2)*r1*w,y+Math.sin(a+.2)*r1*h);
   c.lineTo(x+Math.cos(a+.2)*r0*w,y+Math.sin(a+.2)*r0*h);
   c.closePath();c.clip();
   const fly=e*e*(.3+hash(i*13.1)*.5)*w;
   c.globalAlpha=1-e*.9;
   c.translate(Math.cos(a)*fly,Math.sin(a)*fly*.6);
   c.drawImage(outgoing,0,0,w,h);
   c.restore();
  }
  // 扩散光环：不是全屏白场，而是一道扫过的亮环
  c.save();c.globalCompositeOperation='lighter';c.globalAlpha=Math.sin(p*Math.PI)*(.20+k*.30);
  const rr=w*(.06+e*.5);
  const g=c.createRadialGradient(x,y,rr*.88,x,y,rr*1.08);
  g.addColorStop(0,'rgba(255,210,160,0)');g.addColorStop(.5,'rgba(255,210,160,.85)');g.addColorStop(1,'rgba(255,210,160,0)');
  c.fillStyle=g;c.fillRect(0,0,w,h);
  c.restore();
  // 色散
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*.16;c.globalCompositeOperation='lighter';
  c.drawImage(incoming,-6,0,w,h);
  c.restore();
  return;
 }
 // 通过玻璃裂痕进入废墟：裂纹把新画面切成碎块逐块落位。
 if(tr.type==='glass-crack'){
  const x=w*tr.centerX,y=h*tr.centerY,shards=16;
  for(let i=0;i<shards;i++){
   const a=hash(i+tr.toShot*3.1)*TAU;
   const r0=.16+hash(i*3.3)*.26,r1=r0+.30+hash(i*5.7)*.34;
   const spread=.10+hash(i*7.1)*.12;
   const a0=a-spread,a1=a+spread;
   const q=smooth(clamp((e-hash(i*11.3)*.55)/.45));
   c.save();c.beginPath();
   c.moveTo(x+Math.cos(a0)*r0*w,y+Math.sin(a0)*r0*h);
   c.lineTo(x+Math.cos(a0)*r1*w,y+Math.sin(a0)*r1*h);
   c.lineTo(x+Math.cos(a1)*r1*w,y+Math.sin(a1)*r1*h);
   c.lineTo(x+Math.cos(a1)*r0*w,y+Math.sin(a1)*r0*h);
   c.closePath();c.clip();
   drawScaled(c,incoming,w,h,1+(1-q)*.14,tr.centerX,tr.centerY,q);
   c.restore();
  }
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*.6;c.strokeStyle='#C8CCD1';c.lineWidth=Math.max(1,w/1920*1.6);
  for(let i=0;i<9;i++){const a=hash(i*13.1+tr.toShot)*TAU,r0=.1+hash(i*17.3)*.2,r1=r0+.4+hash(i*19.7)*.5;
   c.beginPath();c.moveTo(x+Math.cos(a)*r0*w,y+Math.sin(a)*r0*h);
   c.lineTo(x+Math.cos(a+.06)*r1*w,y+Math.sin(a+.06)*r1*h);c.stroke();}
  c.restore();
  // 玻璃碎裂时的速度线与光环：这一刀是全片最重的转场之一
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*.42;
  for(let i=0;i<26;i++){
   const a=(i/26)*TAU+tr.toShot,r0=w*.14,r1=w*(.35+.5*hash(i*3.1))*(.4+e*.8);
   c.strokeStyle=i%3?'#C8CCD1':(tr.tint||'#E9ACC8');c.lineWidth=1+hash(i*7.7)*2.2;
   c.beginPath();c.moveTo(x+Math.cos(a)*r0,y+Math.sin(a)*r0*.62);c.lineTo(x+Math.cos(a)*r1,y+Math.sin(a)*r1*.62);c.stroke();
  }
  c.restore();
  c.save();c.globalCompositeOperation='lighter';c.globalAlpha=Math.sin(p*Math.PI)*.38;
  const rr=w*(.08+e*.46);
  const g=c.createRadialGradient(x,y,rr*.9,x,y,rr*1.06);
  g.addColorStop(0,'rgba(233,172,200,0)');g.addColorStop(.5,'rgba(233,172,200,.8)');g.addColorStop(1,'rgba(233,172,200,0)');
  c.fillStyle=g;c.fillRect(0,0,w,h);
  c.restore();
  return;
 }
 // 强鼓点像撕纸一样把场景撕开：横向纸条被撕掉，后面是新场景。
 if(tr.type==='paper-tear'){
  const strips=7;
  for(let i=0;i<strips;i++){
   const y0=i*h/strips,bh=h/strips+2;
   const q=smooth(clamp((e-hash(i*3.1)*.3)/.7));
   if(q<=0)continue;
   c.save();c.beginPath();c.rect(0,y0,w,bh);c.clip();
   // 被撕掉的边缘是锯齿状的，不是直线。
   const edge=direction>0?q*w:-q*w;
   c.beginPath();
   c.moveTo(direction>0?edge:-w,y0);
   for(let k=0;k<=12;k++){
    const jag=(hash(i*7.7+k*3.1)*.5+.5)*bh*.55;
    c.lineTo(direction>0?edge+(k%2?jag:-jag):-w+(k%2?jag:-jag),y0+k*bh/12);
   }
   c.lineTo(direction>0?edge:-w,y0+bh);
   c.closePath();
   c.save();c.clip();c.drawImage(incoming,0,y0,w,bh);c.restore();
   c.restore();
  }
  return;
 }
 // 前景物体高速掠过并遮挡镜头，完成自然转场。
 if(tr.type==='foreground-wipe'){
  c.save();c.globalAlpha=e;c.drawImage(incoming,0,0,w,h);c.restore();
  for(let i=0;i<7;i++){
   const q=clamp(e*1.5-hash(i*3.7)*.45);
   const x=-w*.35+q*w*1.75*direction;
   const wd=70+hash(i*5.1)*260,ht=w*.9;
   c.save();c.translate(x,h*.5+(hash(i*7.3)-.5)*h*.5);c.rotate((hash(i*11.7)-.5)*.16);
   c.fillStyle='#04070B';c.fillRect(-wd/2,-ht/2,wd,ht);
   c.fillStyle='rgba(43,58,68,.35)';c.fillRect(-wd/2,-ht/2,3,ht);
   c.restore();
  }
  return;
 }
 if(tr.type==='zoom-echo'){
  drawScaled(c,outgoing,w,h,1+e*.09,tr.centerX,tr.centerY);
  for(let i=1;i<=2;i++)drawScaled(c,outgoing,w,h,1+e*.09+i*.035*Math.sin(p*Math.PI),tr.centerX,tr.centerY,(1-e)*.09);
  drawScaled(c,incoming,w,h,1+.16*(1-e),tr.centerX,tr.centerY,e);return;
 }
 if(tr.type==='iris'||tr.type==='star-aperture'){
  const x=w*tr.centerX,y=h*tr.centerY,far=Math.hypot(Math.max(x,w-x),Math.max(y,h-y));
  const radius=e*far*(tr.type==='iris'?1.02:2.34),rotation=direction*(1-e)*.11;
  c.save();aperturePath(c,tr.type,x,y,radius,rotation);c.clip();drawScaled(c,incoming,w,h,1+.025*(1-e),tr.centerX,tr.centerY);c.restore();
  if(p>.03&&p<.97){c.save();c.globalAlpha=Math.sin(p*Math.PI)*.28;c.strokeStyle='#9DE4C2';c.lineWidth=Math.max(1,w/1920*2);aperturePath(c,tr.type,x,y,radius,rotation);c.stroke();c.restore()}return;
 }
 if(tr.type==='digital-slices'){
  const bands=9;
  for(let i=0;i<bands;i++){
   const q=smooth(p*1.43-hash(i+tr.toShot*3.7)*.39),y=i*h/bands,bh=Math.ceil(h/bands)+1;
   c.save();c.beginPath();c.rect(0,y,w,bh);c.clip();
   // 只搬运可见的那一条带，而不是整帧贴上去再裁掉。
   c.drawImage(incoming,0,y,w,bh,direction*(i%2?1:-1)*w*(1-q),y,w,bh);c.restore();
   if(q>0&&q<1){c.save();c.globalAlpha=Math.sin(q*Math.PI)*.18;c.fillStyle='#9DE4C2';c.fillRect(0,y,w,Math.max(1,h/1080));c.restore()}
  }return;
 }
 // Three diagonal panels enter at different times instead of a single wipe.
 for(let i=0;i<3;i++){
  const q=smooth(p*1.36-i*.15),y=i*h/3,bh=h/3+1,slant=w*.115,edge=(w+slant*2)*q-slant;
  c.save();if(direction<0){c.translate(w,0);c.scale(-1,1)}
  c.beginPath();c.moveTo(-slant*2,y);c.lineTo(edge-slant,y);c.lineTo(edge+slant,y+bh);c.lineTo(-slant*2,y+bh);c.closePath();c.clip();
  if(direction<0){c.translate(w,0);c.scale(-1,1)}
  // 面板只覆盖三分之一高度，按可见条带搬运即可。
  c.drawImage(incoming,0,y,w,bh,0,y,w,bh);c.restore();
  if(q>0&&q<1){c.save();c.globalAlpha=Math.sin(q*Math.PI)*.3;c.strokeStyle='#9DE4C2';c.lineWidth=Math.max(1,w/1920*2);c.beginPath();c.moveTo(direction>0?edge-slant:w-edge+slant,y);c.lineTo(direction>0?edge+slant:w-edge-slant,y+bh);c.stroke();c.restore()}
 }
}

export function renderMotionFrame(c,t,resources,data,width=1920,height=1080,renderBaseFrame){
 if(typeof renderBaseFrame!=='function')throw new TypeError('renderMotionFrame requires the unwrapped renderBaseFrame callback.');
 if(!resources.makeCanvas){renderBaseFrame(c,t,resources,data,width,height);return}
 const current=canvasFor(resources,'current-raw',width,height),currentContext=current.getContext('2d');reset(currentContext,width,height);renderBaseFrame(currentContext,t,resources,data,width,height);
 const currentFx=resources.fx,currentGlitch=resources.glitch,currentOverride=resources.fxOverride,camera=cameraAt(data,t),tr=transitionAt(data,t);
 if(!tr){drawCamera(c,current,camera,width,height);drawRush(c,t,data,width,height);return}
 const incoming=canvasFor(resources,'incoming-camera',width,height),incomingContext=incoming.getContext('2d');reset(incomingContext,width,height);drawCamera(incomingContext,current,camera,width,height);
 const previous=canvasFor(resources,'previous-raw',width,height),previousContext=previous.getContext('2d');reset(previousContext,width,height);renderBaseFrame(previousContext,tr.outgoingTime,resources,data,width,height);
 resources.fx=currentFx;resources.glitch=currentGlitch;resources.fxOverride=currentOverride;
 const outgoing=canvasFor(resources,'outgoing-camera',width,height),outgoingContext=outgoing.getContext('2d');reset(outgoingContext,width,height);drawCamera(outgoingContext,previous,cameraAt(data,tr.outgoingTime),width,height);
 c.save();c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';compositeTransition(c,outgoing,incoming,tr,width,height);c.restore();
 drawRush(c,t,data,width,height);
}
