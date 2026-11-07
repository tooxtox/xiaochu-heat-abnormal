// Pure, seekable Canvas 2D film. All scene motion is evaluated from song time.
import {architecture,ruinedWorld,spaceBody,eyeInsert,handInsert,citySky,citySkyline} from './cinema.mjs';
import {drawCharacter} from './character.mjs';
import {palette as P,configurePalette,resolveInk} from './palette.mjs';
import {drawCharacterFx,characterFxAt} from './character_fx.mjs';
import {renderMotionFrame,cameraAt,editorialShotAt} from './transitions.mjs';
import {activeLyricCues,drawLyricArt} from './lyric_art.mjs';
import {applyGlitch,glitchAt} from './glitch.mjs';
import {drawLyricMotifs} from './lyric_motifs.mjs';
import {
  composeLayers,composeForeground,musicState,contactShadow,castShadow,reactorDeck,nearBarrier,mixHex,
} from './scene_layers.mjs';
export const W = 1920, H = 1080;
const TAU = Math.PI * 2;
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const fract=x=>x-Math.floor(x);
const hash=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
const mono='Consolas, monospace', serif='"Noto Serif JP", "Yu Mincho", serif';
// 把 #RRGGBB 变成带透明度的 rgba()，用于天空、辉光与轮廓光。
function alpha(hex,a){const h=String(hex).replace('#','');const n=h.length===3?h.split('').map(x=>x+x).join(''):h;const r=parseInt(n.slice(0,2),16),g=parseInt(n.slice(2,4),16),b=parseInt(n.slice(4,6),16);return `rgba(${r},${g},${b},${a})`}
const stages=new WeakMap();
function line(c,x,y,X,Y,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.stroke()}
function circle(c,x,y,r,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,Math.max(.01,r),0,TAU);c.stroke()}
function kineticLine(c,s,x,y,size,color,font,heavy=false){
 const state=stages.get(c),age=state?.age??9,chars=[...s],delay=Math.min(.28,chars.length*.032);
 c.save();c.translate(x,y);c.font=`${heavy?'700 ':''}${size}px ${font}`;c.fillStyle=color;
 if(age>.64+delay||!state){c.fillText(s,0,0);c.restore();return}
 const width=c.measureText(s).width;c.beginPath();c.rect(-24,-size*1.3,width+48,size*1.56);c.clip();let xx=0;
 chars.forEach((ch,i)=>{const q=clamp((age-i*delay/Math.max(1,chars.length-1))/.64),spring=1-Math.exp(-7*q)*Math.cos(9*q);c.save();c.globalAlpha*=ease(q/.35);c.translate(xx,(1-spring)*size*.92);c.rotate((1-q)*-.1);c.fillText(ch,0,0);c.restore();xx+=c.measureText(ch).width});c.restore();
}
function text(c,s,x,y,size=20,color=P.mint,font=mono){if(size>=34&&stages.get(c)?.hasLyrics)return;if(font===mono&&/[^\x00-\x7F]/.test(s))font=serif;if(size>=54&&stages.get(c)?.s.id<11){kineticLine(c,s,x,y,size,color,font);return}c.font=`${size}px ${font}`;c.fillStyle=color;c.fillText(s,x,y)}
function spaced(c,s,x,y,size,gap,color){c.font=`${size}px ${mono}`;c.fillStyle=color;for(const ch of s){c.fillText(ch,x,y);x+=c.measureText(ch).width+gap}}
function path(c,pts,color,width=1,fill=false){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(fill)c.closePath();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=width;fill?c.fill():c.stroke()}
function feature(data,key,t){const f=data.features||{},a=f[key]||f.features?.[key];if(!a?.length)return 0;const i=clamp(Math.floor(t*(f.featureRate||20)),0,a.length-1);return +a[i]||0}
function pulse(data,t){const on=feature(data,'onsets',t);return clamp(on*1.7)}
// 找到最后一个 <= t 的事件下标：场景的磨损、裂痕与灯的熄灭都由它累积。
function lastEventIndex(events,t){let lo=0,hi=events.length;while(lo<hi){const m=(lo+hi)>>>1;if(events[m]<=t)lo=m+1;else hi=m}return lo}
function particles(c,t,color,count=80,strength=1){c.save();c.fillStyle=color;for(let i=0;i<count;i++){const z=fract(hash(i*7.13)+t*(.018+strength*.019)),depth=.13+z*z*1.48,dx=(hash(i*3.71)-.5)*W,dy=(hash(i*5.19)-.5)*H,x=960+dx*depth,y=510+dy*depth,size=.6+z*z*z*(strength>1?5:2);c.globalAlpha=Math.sin(z*Math.PI)*(.12+hash(i+20)*.45);if(strength>1&&z>.55)line(c,x,y,x-dx*.012*strength*z,y-dy*.012*strength*z,color,Math.min(2,size));c.fillRect(x,y,size,size)}c.restore()}
// 黑星：红与黑。核心是纯粹的吸积黑洞，外缘是有厚度的吸积盘，
// 周围的星点被引力拉成放射线——它必须吞掉空间，而不是贴一张黑圆片。
function blackStar(c,x,y,r,t,rim,energy=0,core=P.black,halo=rim){
 c.save();
 // 引力透镜：靠近黑星的星点沿径向被拉长
 c.save();
 for(let i=0;i<110;i++){
  const a=hash(i*7.7)*TAU+t*.016,d=r*1.15+hash(i*11.3)*r*2.6;
  const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d*.84;
  const stretch=1+7*Math.max(0,1-(d-r*1.05)/(r*1.6));
  c.globalAlpha=.12+hash(i*3.3)*.42;c.fillStyle=halo;
  c.fillRect(px,py,1.3*stretch,1.3);
 }
 c.restore();
 // 吸积盘：倾斜的椭圆盘，内外缘都淡出，切向粒子流沿盘面旋转
 c.save();c.translate(x,y);c.rotate(-.34+Math.sin(t*.031)*.05);
 c.beginPath();c.ellipse(0,0,r*1.55,r*.27,0,0,TAU);c.clip();
 const disk=c.createRadialGradient(0,0,r*.9,0,0,r*1.6);
 disk.addColorStop(0,alpha('#FFD2A0',.46));disk.addColorStop(.42,alpha(rim,.26));disk.addColorStop(1,alpha(rim,0));
 c.fillStyle=disk;c.fillRect(-r*1.7,-r*.5,r*3.4,r);
 c.restore();
 for(let i=0;i<84;i++){const q=fract(hash(i*3.1)+t*.11);const a=q*TAU*1.5+t*.42;const rr=r*(1.02+q*.85);
  const px=x+Math.cos(a)*rr*1.5,py=y+Math.sin(a)*rr*.27-Math.sin(a)*rr*.05;
  c.globalAlpha=Math.sin(q*Math.PI)*.42;c.fillStyle=i%5?rim:halo;c.fillRect(px,py,2+q*3.4,1.6);}
 c.restore();
 // 灼热光晕：用 lighter 叠在天空与城市之上
 const glow=c.createRadialGradient(x,y,r*.78,x,y,r*2.9);
 glow.addColorStop(0,alpha(halo,.5));glow.addColorStop(.42,alpha(halo,.14));glow.addColorStop(1,alpha(halo,0));
 c.globalCompositeOperation='lighter';c.fillStyle=glow;c.beginPath();c.arc(x,y,r*2.9,0,TAU);c.fill();
 c.globalCompositeOperation='source-over';
 // 碎片拖尾：先画黑芯再叠红边，形成红黑双色的硬边
 for(let i=0;i<54;i++){const q=fract(hash(i+17)+t*.14),rr=r+18+(1-q)**2*760,a=hash(i+61)*TAU+t*.13+q*q*2.1,xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr*.73,len=7+q*19,ex=xx+Math.cos(a+.65)*len,ey=yy+Math.sin(a+.65)*len;
  c.globalAlpha=Math.sin(q*Math.PI)*.64;line(c,xx,yy,ex,ey,core,2.8+hash(i)*2.4);line(c,xx,yy,ex,ey,rim,1+hash(i)*1.3)}
 const state=stages.get(c),events=state?.data.shots?.loopOnsets||[],last=events[lastEventIndex(events,t)-1],dt=t-last;if(dt>=0&&dt<.6){c.globalAlpha=(1-dt/.6)*.3;circle(c,x,y,r+45+dt*390,rim,2.4)}
 c.globalAlpha=1;
 // 纯黑内核，内缘烧出一圈红
 const inner=c.createRadialGradient(x,y,r*.18,x,y,r);
 inner.addColorStop(0,'#000000');inner.addColorStop(.70,'#040207');inner.addColorStop(.92,alpha(rim,.30));inner.addColorStop(1,alpha(rim,.9));
 c.fillStyle=inner;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
 // 内核裂纹
 c.save();c.beginPath();c.arc(x,y,r,0,TAU);c.clip();c.globalAlpha=.5;
 for(let j=0;j<19;j++){const yy=y-r+j*r/9;line(c,x-r,yy,x+r,yy+18*Math.sin(j+t*.9),alpha(rim,.5),1.1)}
 c.restore();
 // 外缘：粗黑圈 + 细红环
 c.globalAlpha=1;c.strokeStyle=core;c.lineWidth=7;c.beginPath();c.arc(x,y,r+3,0,TAU);c.stroke();
 c.strokeStyle=rim;c.lineWidth=2.6;c.beginPath();c.arc(x,y,r+1,0,TAU);c.stroke();
 c.globalAlpha=.42;c.strokeStyle=rim;c.lineWidth=1;c.beginPath();c.arc(x,y,r*1.34,0,TAU);c.stroke();
 c.restore();
}
// 熔毁的核心：不规则熔融轮廓、内部裂纹、温度梯度，以及向内塌陷的结构环。
function coreStructure(c,t,opts={},ctx={}){
 const x=opts.x??960,y=opts.y??520,r=opts.r??340,color=opts.color??P.red;
 const energy=ctx.energy??0,progress=ctx.progress??0;
 c.save();
 // 向内塌陷的结构环：每一圈都更靠近核心，节奏随音乐能量加快。
 for(let i=0;i<7;i++){
  const q=fract(i/7+t*(.035+energy*.05));
  const rr=r*(2.35-q*1.18);
  c.globalAlpha=.07+q*.20;c.strokeStyle=color;c.lineWidth=1.6+q*4.5;
  c.beginPath();
  for(let a=0;a<=72;a++){
   const ang=a/72*TAU;
   const wob=1+Math.sin(ang*5+t*.55+i)*.055+Math.sin(ang*9-t*.4+i)*.03;
   const px=x+Math.cos(ang)*rr*wob,py=y+Math.sin(ang)*rr*.6*wob;
   a?c.lineTo(px,py):c.moveTo(px,py);
  }
  c.closePath();c.stroke();
 }
 c.globalAlpha=1;
 // 熔融外壳：不规则的轮廓，而不是一个正圆。
 const shell=c.createRadialGradient(x,y,r*.12,x,y,r*1.05);
 shell.addColorStop(0,alpha('#FFD2A0',.92));shell.addColorStop(.30,alpha('#FF7A4A',.86));
 shell.addColorStop(.62,alpha(color,.88));shell.addColorStop(.88,alpha('#4A0E18',.92));shell.addColorStop(1,alpha('#2A0509',.96));
 c.fillStyle=shell;c.beginPath();
 for(let a=0;a<=120;a++){const ang=a/120*TAU;
  const wob=1+Math.sin(ang*7+t*.9)*.022+Math.sin(ang*13-t*.5)*.014+Math.sin(ang*3+t*.25)*.016;
  const px=x+Math.cos(ang)*r*wob,py=y+Math.sin(ang)*r*.86*wob;
  a?c.lineTo(px,py):c.moveTo(px,py);}
 c.closePath();c.fill();
 // 熔融边缘：外圈一条炽热的亮线，核心因此有体积而不是一块色斑。
 c.save();c.globalCompositeOperation='lighter';c.strokeStyle=alpha('#FFB27A',.5);c.lineWidth=3;
 c.beginPath();
 for(let a=0;a<=120;a++){const ang=a/120*TAU;
  const wob=1+Math.sin(ang*7+t*.9)*.022+Math.sin(ang*13-t*.5)*.014+Math.sin(ang*3+t*.25)*.016;
  const px=x+Math.cos(ang)*r*wob,py=y+Math.sin(ang)*r*.86*wob;
  a?c.lineTo(px,py):c.moveTo(px,py);}
 c.closePath();c.stroke();c.restore();
 // 内部裂纹：热浪把核心撕开。
 c.save();c.beginPath();c.ellipse(x,y,r*.98,r*.84,0,0,TAU);c.clip();
 c.strokeStyle=alpha('#FFE6C0',.34);c.lineWidth=1.6;
 for(let i=0;i<22;i++){
  const a=hash(i*3.7)*TAU,len=r*(.3+hash(i*5.1)*.6);
  c.beginPath();c.moveTo(x+Math.cos(a)*r*.1,y+Math.sin(a)*r*.1);
  c.lineTo(x+Math.cos(a+.1)*len,y+Math.sin(a+.1)*len*.86);c.stroke();
 }
 // 冷却的壳：暗色板块之间露出炽热的裂缝。
 for(let i=0;i<13;i++){
  const a0=hash(i*7.3)*TAU,a1=a0+(.28+hash(i*11.1)*.42);
  const r0=r*(.12+hash(i*9.7)*.26),r1=r*(.55+hash(i*13.3)*.42);
  c.globalAlpha=.40+hash(i*17.9)*.24;
  c.fillStyle='#2A0E18';
  c.beginPath();
  c.moveTo(x+Math.cos(a0)*r0,y+Math.sin(a0)*r0*.86);
  c.lineTo(x+Math.cos(a0)*r1,y+Math.sin(a0)*r1*.86);
  for(let s2=1;s2<=6;s2++){const aa=a0+(a1-a0)*s2/6,rr=r1*(1-.05*Math.sin(s2));c.lineTo(x+Math.cos(aa)*rr,y+Math.sin(aa)*rr*.86);}
  c.lineTo(x+Math.cos(a1)*r0,y+Math.sin(a1)*r0*.86);
  c.closePath();c.fill();
 }
 c.restore();
 // 外缘的蒸汽与碎屑
 c.globalAlpha=.5;
 for(let i=0;i<40;i++){const q=fract(hash(i*13.1)+t*.09);const a=hash(i*17.3)*TAU+q*1.4;
  const d=r*(1+q*.45);c.fillStyle=alpha(i%3?'#FF7A4A':'#FFD2A0',(1-q)*.5);
  c.fillRect(x+Math.cos(a)*d,y+Math.sin(a)*d*.86,2+q*4,2+q*3);}
 c.restore();
}
// 记忆的房间：一扇过曝的窗、百叶投下的斜影、斜切进来的桌面与桌上的物件。
// 明度层次：过曝的窗光 → 暖白墙面 → 中灰地面 → 深色桌沿，避免整幅画面一片白。
function memoryRoom(c,t,opts={}){
 c.save();
 const g=c.createLinearGradient(0,0,1920,1080);
 g.addColorStop(0,'#F6F4EA');g.addColorStop(.46,'#EDEEE4');g.addColorStop(.74,'#D9DACE');g.addColorStop(1,'#BFC2B4');
 c.fillStyle=g;c.fillRect(0,0,1920,1080);
 // 墙裙与地板：把房间分成上下两个明度区。
 c.fillStyle='#C9C6B8';c.fillRect(0,742,1920,26);
 c.fillStyle='#AFAD9E';c.fillRect(0,768,1920,312);
 c.save();c.globalAlpha=.22;c.strokeStyle='#8E8B7C';c.lineWidth=1.2;
 for(let i=0;i<9;i++){const y=782+Math.pow(i/9,1.6)*298;c.beginPath();c.moveTo(0,y);c.lineTo(1920,y);c.stroke();}
 c.restore();
 // 窗：过曝的白，配窗框与中挺。窗在右上角，压在人物后面形成轮廓光。
 c.fillStyle='#FFFFFF';c.fillRect(1180,54,740,606);
 c.save();c.strokeStyle='#B0AB9C';c.lineWidth=11;c.strokeRect(1180,54,740,606);
 c.lineWidth=7;c.beginPath();c.moveTo(1550,54);c.lineTo(1550,660);c.moveTo(1180,360);c.lineTo(1920,360);c.stroke();
 c.globalAlpha=.13;c.strokeStyle='#8E9382';c.lineWidth=6;
 for(let i=0;i<5;i++){const x=1230+i*160;c.beginPath();c.moveTo(x,660);c.bezierCurveTo(x+20,480,x-26,380,x+12,250);c.stroke();}
 c.restore();
 // 百叶窗影：只落在上半墙，强度随高度衰减，避免整幅画布满条纹。
 c.save();
 for(let i=0;i<11;i++){
  const y=-190+i*70;
  c.globalAlpha=.085-i*.006;
  c.fillStyle='#8E8877';
  c.beginPath();c.moveTo(-120,y);c.lineTo(1180,y-430);c.lineTo(1180,y-392);c.lineTo(-120,y+38);c.closePath();c.fill();
 }
 c.restore();
 // 窗光在墙脚与地面上的落点：房间因此有方向。
 c.save();
 const wash=c.createLinearGradient(1430,135,250,1060);
 wash.addColorStop(0,alpha('#FFF3DC',.35));wash.addColorStop(.65,alpha('#FFF3DC',.16));wash.addColorStop(1,alpha('#FFF3DC',0));
 c.fillStyle=wash;c.beginPath();c.moveTo(1180,60);c.lineTo(1920,60);c.lineTo(430,1080);c.lineTo(-120,1080);c.closePath();c.fill();
 c.restore();
 // 桌面：从左下角斜切进来，占住画面下缘，作为前景层。
 c.save();
 c.fillStyle='#B4A88F';c.beginPath();c.moveTo(-40,1080);c.lineTo(880,806);c.lineTo(1180,860);c.lineTo(760,1080);c.closePath();c.fill();
 c.fillStyle='#C8BCA2';c.beginPath();c.moveTo(-40,1080);c.lineTo(880,806);c.lineTo(900,826);c.lineTo(-20,1080);c.closePath();c.fill();
 c.save();c.globalAlpha=.16;c.fillStyle='#FFF6E0';
 c.beginPath();c.moveTo(120,1080);c.lineTo(880,830);c.lineTo(960,858);c.lineTo(260,1080);c.closePath();c.fill();
 c.restore();
 // 相框：斜靠在桌上，里面是一张很小的风景照。
 c.save();c.translate(300,988);c.rotate(-.16);c.fillStyle='#8A8271';c.fillRect(-92,-62,184,124);
 c.fillStyle='#F4F1E7';c.fillRect(-82,-52,164,104);
 c.save();c.beginPath();c.rect(-82,-52,164,104);c.clip();
 c.fillStyle='#C9D2C4';c.fillRect(-82,-52,164,104);
 c.fillStyle='#A9B79E';c.fillRect(-82,6,164,46);
 c.fillStyle='#E6E2D2';c.beginPath();c.arc(34,-24,15,0,TAU);c.fill();
 c.strokeStyle='#8E9C86';c.lineWidth=2;c.beginPath();c.moveTo(-82,18);c.lineTo(-20,-16);c.lineTo(24,18);c.stroke();
 c.restore();c.restore();
 // 杯子与一叠纸
 c.save();c.translate(640,962);c.fillStyle='#F4F1E8';c.beginPath();c.moveTo(-32,-30);c.lineTo(32,-30);c.lineTo(24,34);c.lineTo(-24,34);c.closePath();c.fill();
 c.strokeStyle='#C4BFB0';c.lineWidth=4;c.beginPath();c.arc(34,-6,14,-1.2,1.2);c.stroke();
 c.fillStyle='#8E9583';c.beginPath();c.ellipse(0,-30,32,9,0,0,TAU);c.fill();c.restore();
 c.save();c.translate(820,900);c.rotate(.05);
 for(let i=0;i<5;i++){c.fillStyle=i%2?'#EDEAE0':'#DFDBCF';c.fillRect(i*3,-i*4,150,84);}
 c.globalAlpha=.45;c.strokeStyle='#8E8A7A';c.lineWidth=1.2;
 for(let i=0;i<5;i++){c.beginPath();c.moveTo(16,-52+i*15);c.lineTo(128,-52+i*15);c.stroke();}
 c.restore();
 c.restore();
 c.restore();
}
function waveform(c,data,t,x,y,width,height,color){const f=data.features||{},arr=f.envelope||[];c.strokeStyle=color;c.lineWidth=1.4;c.beginPath();for(let i=0;i<180;i++){const tt=t-4+i/180*8,j=Math.floor(tt*(f.featureRate||20)),v=arr[j]||0;const xx=x+i/179*width,yy=y-v*height*(i%2?1:-1);i?c.lineTo(xx,yy):c.moveTo(xx,yy)}c.stroke();line(c,x+width/2,y-height,x+width/2,y+height,color,.8)}
function terminal(c,t,data,x,y,w,h,color,mode='OBSERVE'){
 const age=stages.get(c)?.age??9,build=ease((age-(x%120)*.0015)/.48);c.save();if(stages.get(c)?.hasLyrics)c.globalAlpha*=.22;c.beginPath();c.rect(x,y,w,h*build);c.clip();c.fillStyle='#0C171C';c.fillRect(x,y,w,h);c.strokeStyle=color;c.lineWidth=1;c.strokeRect(x,y,w,h);line(c,x,y+38,x+w,y+38,color);text(c,`XIAOCHU / ${mode}`,x+18,y+25,15,color);
 const logs=mode==='RETRY'?['DELETE MEMORY INDEX','RECONSTRUCTING…','CHECKSUM MISMATCH','RETRY / NO RESPONSE']:['OBSERVATORY / LAST NODE','CHANNEL: DEEP SPACE','PACKET / MEMORY.ARCHIVE','AWAITING RESPONSE_'];
 for(let i=0;i<logs.length;i++){const typed=logs[i].slice(0,Math.max(0,Math.floor((age-.14-i*.09)*64)));text(c,typed,x+20,y+76+i*33,Math.min(17,w/22),i===logs.length-1?P.white:color)}
 c.save();c.globalAlpha=.12;c.fillStyle=color;c.fillRect(x+1,y+fract(t*.35+x*.001)*h,w-2,3);c.restore();waveform(c,data,t,x+20,y+h-40,w-40,24,color);
 for(let i=0;i<3;i++){const d=fract(t*.24+i/3)*(2*w+2*h);let xx=x,yy=y;if(d<w)xx+=d;else if(d<w+h){xx+=w;yy+=d-w}else if(d<2*w+h){xx+=2*w+h-d;yy+=h}else yy+=2*w+2*h-d;c.fillStyle=color;c.fillRect(xx-3,yy-2,6,4)}c.restore();
}
function observatory(c,t,data,color){architecture(c,t,color);terminal(c,t,data,95,640,370,230,color);terminal(c,t,data,1475,580,340,210,color)}
// Stable shoe landmarks measured from the existing transparent originals (near shoe last).
const FOOTPRINT={full:{w:1024,h:1536,shoes:[[454,1498,43],[555,1527,46]]},seated:{w:1536,h:1024,shoes:[[329,977,54],[521,1013,58]]}};
const FLOOR_TRAVEL={1:.04,2:.55,3:.04,4:.6,5:.4,6:.05,7:.04,8:.10,9:.42,10:.18};
const STAGE_LIGHT={
 1:{key:'#BCDCD6',bounce:'#3D7770',shadow:'#101B29',sourceX:980},
 2:{key:'#ABD8CD',bounce:'#37746E',shadow:'#101C2A',sourceX:930},
 3:{key:'#F9CD9A',bounce:'#9B5649',shadow:'#251622',sourceX:860},
 4:{key:'#F3BC8A',bounce:'#9B503D',shadow:'#261720',sourceX:960},
 5:{key:'#FFB080',bounce:'#96383D',shadow:'#281420',sourceX:1080},
 6:{key:'#EDAA85',bounce:'#A35342',shadow:'#24141F',sourceX:990},
 7:{key:'#FFF1CC',bounce:'#A29E71',shadow:'#4A483D',sourceX:1550},
 8:{key:'#FFD19B',bounce:'#B13843',shadow:'#311525',sourceX:960},
 9:{key:'#F7A078',bounce:'#9A334A',shadow:'#231221',sourceX:980},
 10:{key:'#ABDAD0',bounce:'#326866',shadow:'#0C1A28',sourceX:1390},
};
function floorX(c,x){const s=stages.get(c);return s?x-(s.t-s.s.start)*(THEME_TRAVEL[s.s.id]??12)*(FLOOR_TRAVEL[s.s.id]??0):x}
const drawPlanted=(...args)=>drawCharacter(...args,true);
// The lyric back plane is a reading layer, not part of the scene drawing, so it must not
// inherit the alpha or the transform of whatever call site happened to trigger it. The
// trigger is the first character() call of the frame, and scene 2 draws three ghost
// copies at 4.5% opacity — without this reset the whole line inherited that 4.5% and
// became invisible.
function paintLyricBack(c,resources){
  const st=stages.get(c);
  if(!st||st.lyricBackDrawn)return;
  st.lyricBackDrawn=true;
  if(!resources.jizuraDraw){drawLyricMotifs(c,st.t,resources,st.data,'back');drawLyricArt(c,st.t,resources,st.data,'back');return;}
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.scale(st.scaleX,st.scaleY);
  c.globalAlpha=1;
  c.globalCompositeOperation='source-over';
  resources.jizuraDraw(c,st.t,st.data,'back');
  c.restore();
}
function stageShadows(c,x,y,h,pose,light,daylight){
 const d=FOOTPRINT[pose],q=h/d.h;
 const shoes=d.shoes.map(([sx,sy,rx])=>[x+(sx-d.w/2)*q,y+(sy-d.shoes[1][1])*q,rx*q]);
 const center=(shoes[0][0]+shoes[1][0])*.5,depth=(shoes[0][1]+shoes[1][1])*.5;
 const dx=clamp((center-light.sourceX)*(daylight?.38:.24),-222,202),dy=daylight?67:72;
 const color=daylight?'#59554A':'#05080F';
 if(!daylight)contactShadow(c,{x:center,y:depth+10,rx:h*.20,ry:h*.052,color:light.bounce,strength:.23});
 castShadow(c,{x:center,y:depth,dx,dy,width:h*(pose==='seated'?.11:.103),color,strength:daylight?.39:.58});
 contactShadow(c,{x:center,y:depth+6,rx:h*.175,ry:h*.037,color,strength:daylight?.31:.54});
 for(const [sx,sy,rx] of shoes){
  contactShadow(c,{x:sx,y:sy-1,rx:rx*1.38,ry:Math.max(9,h*.021),color,strength:daylight?.76:.98});
 }
 return y+(d.h-d.shoes[1][1])*q;
}
function litCharacter(c,resources,t,x,y,h,pose,wind,opacity,light,planted){
 const draw=planted?drawPlanted:drawCharacter,im=resources[pose]||resources.full;
 if(!light||!im||!resources.makeCanvas||opacity<.9||c.globalAlpha<.8){drawCharacterFx(c,resources,t,x,y,h,pose,wind,opacity,draw);return}
 // Only the character's compact RGBA bounds are relit; no second full-frame filter or readback.
 const artWidth=h*im.width/im.height,pad=42,m=c.getTransform(),raster=clamp(Math.hypot(m.a,m.b),.25,1);
 const w=Math.ceil((artWidth+2*pad)*raster),hh=Math.ceil((h+2*pad)*raster),key=`${w}x${hh}`;
 resources.stageCharacterCanvases??=new Map();
 let cache=resources.stageCharacterCanvases.get(key);
 if(!cache){cache=resources.makeCanvas(w,hh);resources.stageCharacterCanvases.set(key,cache);if(resources.stageCharacterCanvases.size>8)resources.stageCharacterCanvases.delete(resources.stageCharacterCanvases.keys().next().value)}
 const local=cache.getContext('2d');if(local.reset)local.reset();else{local.setTransform(1,0,0,1,0,0);local.globalAlpha=1;local.globalCompositeOperation='source-over'}
 local.clearRect(0,0,w,hh);local.scale(raster,raster);
 const anchor=artWidth/2+pad,base=h+pad;
 drawCharacterFx(local,resources,t,anchor,base,h,pose,wind,1,draw);
 const tone=resources.fxOverride?.style||resources.fx?.mode,mono=['mono','ink','print','fade'].includes(tone);
 const left=x>light.sourceX,keyColor=mono?'#D1D1D1':light.key,bounce=mono?'#5B5B5B':light.bounce,shadow=mono?'#171717':light.shadow;
 const g=local.createLinearGradient(left?pad:artWidth+pad,pad,left?artWidth+pad:pad,base);
 g.addColorStop(0,alpha(keyColor,.30));g.addColorStop(.39,alpha(keyColor,.025));g.addColorStop(.67,alpha(bounce,.145));g.addColorStop(1,alpha(shadow,.34));
 local.globalCompositeOperation='source-atop';local.fillStyle=g;local.fillRect(0,0,w/raster,hh/raster);
 c.save();c.globalAlpha*=opacity;c.drawImage(cache,x-anchor,y-base,w/raster,hh/raster);c.restore();
}
function character(c,resources,t,x,y,h,expression='full',wind=.3,opacity=1,{placed=false}={}){
 const st=stages.get(c),light=STAGE_LIGHT[st?.s.id],planted=Boolean(FOOTPRINT[expression]);
 if(!placed)x=floorX(c,x);
 if(light&&planted&&opacity>=.9&&c.globalAlpha>=.8)y=stageShadows(c,x,y,h,expression,light,st.s.id===7);
 paintLyricBack(c,resources);
 litCharacter(c,resources,t,x,y,h,expression,wind,opacity,light,planted);
}
function chair(c,x,y,h,daylight=false){
 const q=h/1024,px=v=>x+(v-768)*q,py=v=>y+(v-1013)*q;
 const body=daylight?'#756B58':'#17262D',top=daylight?'#A7997B':'#324550',rim=daylight?'#D8C6A7':'#7BAFAE';
 // Backrest and seat pad align to the pelvis in the seated art, not to the PNG center.
 path(c,[[px(1020),py(806)],[px(1058),py(505)],[px(1250),py(541)],[px(1170),py(867)]],body,1,true);
 path(c,[[px(1045),py(519)],[px(1250),py(541)],[px(1230),py(558)],[px(1042),py(539)]],top,1,true);
 for(const [sx,ex] of [[760,718],[1118,1144]]){
  path(c,[[px(sx-20),py(824)],[px(sx+18),py(824)],[px(ex+17),y],[px(ex-19),y]],body,1,true);
  contactShadow(c,{x:px(ex),y:y+1,rx:35*q,ry:10*q,strength:daylight?.60:.84});
 }
 line(c,px(749),py(925),px(1128),py(925),body,9*q);
 path(c,[[px(711),py(821)],[px(1090),py(797)],[px(1194),py(826)],[px(805),py(854)]],top,1,true);
 path(c,[[px(805),py(854)],[px(1194),py(826)],[px(1194),py(858)],[px(805),py(880)]],body,1,true);
 line(c,px(808),py(853),px(1184),py(826),rim,Math.max(1,2*q));
}
function seatedTerminal(c,resources,t,data,x=1320,y=978,h=740){
 x=floorX(c,x);const q=h/1024,px=v=>x+(v-768)*q,py=v=>y+(v-1013)*q;
 chair(c,x,y,h);
 // Desk supports meet the same floor as the chair; the keyboard lines up with her wrists.
 for(const [sx,ex] of [[178,119],[483,520]]){
  path(c,[[px(sx-22),py(505)],[px(sx+20),py(505)],[px(ex+19),y],[px(ex-22),y]],'#101D27',1,true);
  contactShadow(c,{x:px(ex),y:y+3,rx:43*q,ry:12*q,strength:.84});
 }
 character(c,resources,t,x,y,h,'seated',.16,1,{placed:true});
 const desktop=[[px(-150),py(452)],[px(477),py(453)],[px(547),py(526)],[px(-90),py(526)]];
 path(c,desktop,'#263C46',1,true);
 path(c,[[px(-90),py(526)],[px(547),py(526)],[px(547),py(563)],[px(-90),py(560)]],'#111F28',1,true);
 line(c,px(-90),py(526),px(547),py(526),alpha(P.mint,.45),1.5);
 path(c,[[px(295),py(460)],[px(495),py(460)],[px(518),py(508)],[px(324),py(508)]],'#0D1921',1,true);
 for(let i=0;i<10;i++)line(c,px(314+i*18),py(473),px(325+i*18),py(493),alpha(P.mint,.36),1.2);
 terminal(c,t,data,px(-120),py(156),310*q,248*q,P.mint);
}
function flower(c,x,y,r,t,color,alpha=1){
 const age=stages.get(c)?.age??9;c.save();c.translate(x,y);c.rotate(t*.055);c.globalAlpha=alpha;r*=.8+.2*ease(age/1.25);
 for(let layer=0;layer<3;layer++){const pts=[],grow=ease((age-layer*.14)/1.2);for(let j=0;j<=Math.floor(300*grow);j++){const a=j/300*TAU,rr=r*(.47+.5*Math.cos(a*5+layer*.23))*(1+Math.sin(t*.9+a*2)*.025);pts.push([Math.cos(a)*rr,Math.sin(a)*rr])}if(pts.length>1)path(c,pts,color,layer?1:2);c.rotate(.17)}
 for(let i=0;i<20;i++){const a=i/20*TAU,grow=ease((age-.35-i*.015)/.7);line(c,Math.cos(a)*r*.22,Math.sin(a)*r*.22,Math.cos(a)*r*(.22+.68*grow),Math.sin(a)*r*(.22+.68*grow),color,.6)}circle(c,0,0,r*.13,color);
 for(let i=0;i<7;i++){const q=clamp((age-2.1-i*.12)/2.5);if(q<=0||q>=1)continue;const a=i/7*TAU;c.save();c.globalAlpha*=Math.sin(q*Math.PI)*.7;c.translate(Math.cos(a)*(r*.8+q*135),Math.sin(a)*r*.8-q*125);c.rotate(a+q*2);c.beginPath();c.ellipse(0,0,5,17,0,0,TAU);c.strokeStyle=color;c.lineWidth=1;c.stroke();c.restore()}c.restore();
}
function hud(c,t,data,scene,color){c.save();c.globalAlpha=.8;spaced(c,'LAST SIGNAL',64,54,14,4,color);text(c,`${String(scene.id).padStart(2,'0')} / ${scene.label}`,64,81,13,P.white);c.textAlign='right';text(c,`OBSERVER  XIAOCHU    /    ${scene.state}`,1856,54,13,color);text(c,`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}`,1856,81,13,P.white);c.textAlign='left';for(const [x,y,sx,sy] of [[44,108,1,1],[1876,108,-1,1],[44,1000,1,-1],[1876,1000,-1,-1]]){line(c,x,y,x+sx*24,y,color);line(c,x,y,x,y+sy*24,color)}line(c,64,1021,1856,1021,color,.6);c.fillStyle=color;c.fillRect(64,1019,1792*clamp(t/(data.config?.duration||242.538333)),3);text(c,'LAST OBSERVATORY / FICTIONAL TELEMETRY',64,1051,11,P.white);c.textAlign='right';text(c,'熱異常  /  ARCHIVE 0001',1856,1051,13,color);c.restore()}
function largeWords(c,word,x,y,size,color,angle=0){if(stages.get(c)?.hasLyrics)return;c.save();c.translate(x,y);c.rotate(angle);const st=stages.get(c);if(st?.s.id===4&&st.age>1)c.transform(1,0,st.energy*.025,1,st.energy*7,0);kineticLine(c,word,0,0,size,color,/[^\x00-\x7F]/.test(word)?serif:mono,true);c.restore()}
export function sceneAt(t,data){const scenes=data.cues?.scenes||[];return scenes.find((s,i)=>t>=s.start&&t<(scenes[i+1]?.start??data.config.duration+.01))||scenes[0]||{id:1,start:0,label:'INIT',state:'NORMAL',color:P.mint}}
function sceneEnd(scene,data){const index=data.cues.scenes.indexOf(scene);return data.cues.scenes[index+1]?.start??data.config.duration}
export function shotAt(t,data){return editorialShotAt(data,t)||{id:1,start:sceneAt(t,data).start,end:data.config.duration,mode:'wide',variant:0,expression:'calm'}}

// ── 场景环境堆栈 ────────────────────────────────────────────────────────────
// 层表在 data/scene_layers.json：每个主题的背景层、前景层、视差速度与配色都在那里。
// 视差来自场景自身的推进速度，因此前景快、远景慢，纵深来自速度差而不是素材量。
const THEME_TRAVEL={1:9,2:24,3:11,4:32,5:15,6:20,7:5,8:26,9:18,10:13,11:3};
function themeTable(data){return data.sceneLayers?.themes||{}}
const LAYER_DISPATCH_EXTRA={
 observatory:(c,t,o,ctx)=>architecture(c,t,o.color??ctx.color??P.mint,o.dim||0),
 ruins:(c,t,o,ctx)=>ruinedWorld(c,t,o.color??ctx.color??P.orange,o.collapse??0,ctx.local??0,o),
 blackstar:(c,t,o,ctx)=>blackStar(c,o.x,o.y,o.r,t,o.color??ctx.color??P.red,ctx.energy??0,o.core,o.halo),
 memoryroom:(c,t,o)=>memoryRoom(c,t,o),
 corestructure:(c,t,o,ctx)=>coreStructure(c,t,o,ctx),
};
function sceneContext(data,scene,color,extra={}){
 const local=extra.local??0;
 return {
  travel:local*(THEME_TRAVEL[scene.id]??12),
  local,color,energy:extra.energy??0,progress:extra.progress??0,
  dispatch:LAYER_DISPATCH_EXTRA,
  overrides:extra.overrides||{},
 };
}
function environment(c,t,data,scene,color,extra={}){composeLayers(c,t,themeTable(data),scene.id,sceneContext(data,scene,color,extra))}
function foregroundLayer(c,t,data,scene,color,extra={}){
 if(scene.id===5||scene.id===6||scene.id===9){
  const side=stages.get(c)?.shot.mode==='world'?-1:1;
  nearBarrier(c,t,{side,y:974,reach:scene.id===6?475:510,rim:scene.id===5?'#C67459':color,travel:(extra.local??0)*7});
 }
 composeForeground(c,t,themeTable(data),scene.id,sceneContext(data,scene,color,extra));
}

function worldShot(c,t,resources,data,scene,shot,color,progress){
 const music=musicState(data,t);
 if(scene.id===1||scene.id===3){
  environment(c,t,data,scene,color,{local:t-scene.start,energy:music.energy,progress,
   overrides:{skyline:{ruin:scene.id===3?music.onset*.8:0}}});
  seatedTerminal(c,resources,t,data,1450,949,610);
  if(scene.id===1){largeWords(c,'LAST SIGNAL',100,330,98,P.paper);text(c,'世界最後の観測所',107,390,29,P.mint,serif);text(c,'OBSERVER / XIAOCHU',109,443,15,P.mint)}
  else{line(c,890,180,1170,385,P.orange,3);text(c,'警報  /  温度上昇',115,295,54,P.paper,serif);text(c,'SENSOR 07 / THRESHOLD EXCEEDED',120,352,18,P.orange)}
 }
 else if(scene.id===2){
  environment(c,t,data,scene,color,{local:t-scene.start,energy:music.energy,progress,
   overrides:{corridor:{speed:.085+music.energy*.06}}});
  terminal(c,t,data,115,245,610,275,color,'RETRY');
  text(c,'同じ答えが、また戻る。',120,600,36,P.paper,serif);
 }
 else if(scene.id===5||scene.id===6||scene.id===9){
  const accent=scene.id===6?color:P.red,en=music.onset;
  if(scene.id===5){
   environment(c,t,data,scene,accent,{local:t-scene.start,energy:music.energy,progress,
    overrides:{sky:{skyMid:mixHex('#7A1920','#D8402E',music.energy),glowX:1080},skyline:{ruin:music.onset*.7+progress*.25},blackstar:{r:268+progress*40+music.energy*36}}});
  }else if(scene.id===6){
   environment(c,t,data,scene,accent,{local:t-scene.start,energy:music.energy,progress,
    overrides:{ruins:{collapse:progress*.9}}});
   blackStar(c,1310,300,205,t,P.orange);
  }else{
   environment(c,t,data,scene,accent,{local:t-scene.start,energy:music.energy,progress,
    overrides:{sky:{skyMid:mixHex('#6B151C','#C0303A',music.energy)},skyline:{ruin:music.onset*.6+progress*.3},blackstar:{r:310+music.energy*30}}});
  }
  character(c,resources,t,scene.id===9?1410:scene.id===6?1408:1480,scene.id===6?925:938,scene.id===9?710:685,'full',scene.id===5?.6:1.8);
  if(scene.id===5)text(c,'観測不能',110,290,67,P.paper,serif);
  if(scene.id===6)text(c,'ここには、誰もいない。',110,270,42,P.paper,serif);
  if(scene.id===9){circle(c,440,410,10,P.mint,2);line(c,1350,560,440,410,P.mint,.8)}
 }else return false;
 foregroundLayer(c,t,data,scene,color,{local:t-scene.start,energy:music.energy,progress});
 return true;
}
function transmission(c,t,data,color){
 const age=t-(sceneAt(t,data).start+1.2),send=ease(age/5.2),origin=[340,830],target=[1450,300];
 function point(p,lane){const a=1-p,cy=lane===0?260:lane===1?980:540;return [a*a*a*origin[0]+3*a*a*p*760+3*a*p*p*1040+p*p*p*target[0],a*a*a*origin[1]+3*a*a*p*cy+3*a*p*p*(cy-120)+p*p*p*target[1]]}
 c.save();
 for(let i=0;i<36;i++){const q=ease(age/1.5),a=hash(i)*TAU,r=(1-q)*(200+hash(i+11)*380),xx=origin[0]+Math.cos(a)*r,yy=origin[1]+Math.sin(a)*r*.5;c.globalAlpha=(1-q)*.7;c.fillStyle=color;c.fillRect(xx,yy,3,3)}
 for(let lane=0;lane<3;lane++){c.globalAlpha=.2;const pts=[];for(let j=0;j<=48;j++)pts.push(point(j/48*send,lane));path(c,pts,color,1);for(let i=0;i<11;i++){const p=fract(Math.max(0,age)*.23+i/11+lane*.17)*send,[xx,yy]=point(p,lane),[tx,ty]=point(Math.max(0,p-.032),lane);c.globalAlpha=ease(age/.6)*(.25+.65*p);line(c,tx,ty,xx,yy,color,1.4+p*2);c.fillStyle=P.paper;c.fillRect(xx-1,yy-1,3+p*3,3+p*3)}}
 c.globalAlpha=1;circle(c,origin[0],origin[1],10+Math.sin(t*2)*3,color,2);flower(c,target[0],target[1],80+send*230,t,color,ease(age/1.5)*(1-ease((age-7.5)/2)));text(c,'TRANSMISSION',112,300,60,P.paper);text(c,'TO: UNKNOWN',116,350,19,color);text(c,'すべての記憶を、光に。',116,810,32,P.white,serif);c.restore();
}
function renderBaseFrame(c,t,resources,data,width=W,height=H){
 configurePalette(data.config.palette);
 resources.fx=characterFxAt(data,t);
 // 崩坏后期只求值一次：人物降级与 HUD 计量条共用同一份结果。
 const glitch=glitchAt(data,t);resources.glitch=glitch;resources.fxOverride=glitch?.character||null;
 c.save();c.setTransform(1,0,0,1,0,0);c.fillStyle=P.black;c.fillRect(0,0,width,height);c.scale(width/W,height/H);
 const s=sceneAt(t,data),local=t-s.start,end=sceneEnd(s,data),progress=clamp(local/(end-s.start)),e=pulse(data,t),color=resolveInk(s.color)||P.mint;
 const music=musicState(data,t);
 const shot=shotAt(t,data),baseShot=shot.baseShot||shot,mode=shot.mode,variant=mode==='portrait'?1:mode==='wide'?0:shot.variant,shotProgress=clamp((t-baseShot.start)/(baseShot.end-baseShot.start));
 // 快切只换取景；人物到场、终端与意象沿原镜头时间继续，避免反复重启动画。
 const narrativeShot=shot.baseShot?{...shot,start:baseShot.start,end:baseShot.end}:shot;
 const hasLyrics=resources.jizuraDraw?(data.lyrics?.lines||[]).some(line=>t>=line.time&&t<line.end):activeLyricCues(data,t).length>0;
 stages.set(c,{t,data,s,shot:shot.baseShot?{...narrativeShot,id:baseShot.id}:shot,age:t-baseShot.start,progress:shotProgress,energy:e,hasLyrics,lyricBackDrawn:false,music,scaleX:width/W,scaleY:height/H});
 resources.lyricActive=hasLyrics;resources.drawLyricBack=context=>paintLyricBack(context,resources);
 const ctxExtra={local,energy:music.energy,progress};
 c.save();
 if(mode==='eye'&&s.id<10){eyeInsert(c,t,resources,s,narrativeShot,color)}
 else if(mode==='hand'&&s.id<11){handInsert(c,t,resources,s,narrativeShot,color,flower)}
 else if(mode==='world'&&worldShot(c,t,resources,data,s,shot,color,progress)){}
 else if(s.id===1){
  environment(c,t,data,s,color,ctxExtra);
  // 仍在运行的终端：房间里"有人值守"的证据。
  terminal(c,t,data,95,640,370,230,color);terminal(c,t,data,1475,580,340,210,color);
  seatedTerminal(c,resources,t,data,1360,971,760);
  largeWords(c,'LAST',100,370,164,P.paper);largeWords(c,'SIGNAL',92,520,164,color);
  spaced(c,'SYSTEM TEMPERATURE : NOMINAL',103,578,16,2,color);
  text(c,'世界の終わりを、記録する。',107,631,28,P.white,serif);
  const logs=['INITIALIZING…','OBSERVER: XIAOCHU','STATUS: ONLINE'];logs.forEach((l,i)=>{if(t>i*.9+.2)text(c,l.slice(0,Math.floor((t-i*.9-.2)*25)),107,737+i*33,18,color)});
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===2){
  // 无限数据空间：走廊有明确的透视与纵深，窗口挂在空间里而不是铺在画面上。
  environment(c,t,data,s,color,{...ctxExtra,overrides:{corridor:{speed:.085+music.energy*.07}}});
  const close=variant===1;
  // 复制、重叠、错位的小初残影：同一个答案在数据空间里不断返回。
  for(let i=3;i>=1;i--){
   const d=i*1.35;
   c.save();c.globalAlpha=.15-i*.035;
   character(c,resources,t-d*.11,(close?1405:1190)-i*52+i*11,(close?1130:941)-i*7,(close?1160:765)*(1-i*.012),'calm',.35);
   c.restore();
  }
  character(c,resources,t,close?1405:1190,close?1130:941,close?1160:765,close?'calm':'full',.35);
  text(c,'01 / DEAD VARIABLES',115,205,18,color);largeWords(c,'RETURN',98,340,116,P.paper);largeWords(c,'NULL',98,466,116,color);
  for(let i=0;i<3;i++){terminal(c,t+i*.1,data,120+i*38,540+i*78,540,230,color,i===2?'RETRY':'OBSERVE')}
  for(let i=0;i<9;i++){const yy=180+i*77;const x=1745+Math.sin(t*.4+i)*18;text(c,`[${i.toString(16).padStart(2,'0')}]`,x,yy,15,color)}
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===3){
  // 温度真的升起来：机柜过热、屏幕报警、曲线失控、空气开始扰动。
  environment(c,t,data,s,P.teal,{...ctxExtra,overrides:{racks:{color:'#ED8B50'},monitors:{color:'#ED8B50'},trace:{volatility:1.4+music.energy*1.8}}});
  character(c,resources,t,variant===1?1350:1230,variant===1?1110:941,variant===1?1130:776,variant===1?'fear':'full',.45);
  c.save();c.globalAlpha=.6;const pts=[];for(let i=0;i<160;i++){const x=90+i*9,yy=800-Math.pow(i/160,2)*(380+e*30)+Math.sin(i*.12+t*1.8)*12;pts.push([x,yy])}path(c,pts,P.orange,3);c.restore();
  largeWords(c,'異常検知',110,330,98,P.paper);text(c,'TEMPERATURE RISING',119,390,25,P.orange);text(c,`${(31+progress*18).toFixed(2)} °C`,110,530,90,P.orange);line(c,107,570,680,570,P.orange,2);text(c,'THRESHOLD / 42.00',112,603,17,P.orange);
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===4){
  // 循环要磨损：每一轮循环多一道裂痕、一块污渍、一盏灭掉的灯。
  const onsetEvents=data.shots?.loopOnsets||data.features.onsetTimes||[];
  const beat=lastEventIndex(onsetEvents,t)-lastEventIndex(onsetEvents,s.start),word=beat%2?'RETRY':'DELETE';
  const wear=clamp(beat/14);
  environment(c,t,data,s,color,{...ctxExtra,overrides:{corridor:{speed:.16+music.energy*.08},panels:{count:5+Math.floor(wear*4)}}});
  for(let j=0;j<5;j++){const z=fract(j/5+local*.12),sz=1+z*.35;c.save();c.translate(960,540);c.rotate((j-2)*.035*Math.sin(local*.5));c.globalAlpha=.12+z*.13;c.strokeStyle=P.orange;c.lineWidth=1;c.strokeRect(-680*sz,-310*sz,1360*sz,620*sz);c.restore()}
  // 循环磨损：裂纹与熄灭的灯随次数累积。
  c.save();c.globalAlpha=.5+wear*.4;c.strokeStyle=P.orange;c.lineWidth=1.4;
  for(let i=0;i<Math.floor(wear*7);i++){const x=hash(i*3.7)*1920,y=hash(i*5.1)*1080;c.beginPath();c.moveTo(x,y);c.lineTo(x+(hash(i*7.3)-.5)*260,y+(hash(i*9.1)-.5)*220);c.stroke()}
  c.restore();
  largeWords(c,word,-30+Math.sin(local*1.7)*20,385,225,P.paper);largeWords(c,word,950,890,185,P.orange,Math.PI);
  character(c,resources,t,mode==='portrait'?1340:970,mode==='portrait'?1155:929,mode==='portrait'?1235:750,mode==='portrait'?'fear':'full',.8);text(c,`LOOP ${String(beat).padStart(4,'0')}  /  CHECKSUM MISMATCH`,130,925,19,P.orange);
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===5){
  // 黑星：它在天际线之后升起，城市因此有了前后关系。
  environment(c,t,data,s,P.red,{...ctxExtra,overrides:{
   sky:{skyMid:mixHex('#7A1920','#D8402E',music.energy),glowX:1080},
   skyline:{ruin:music.onset*.7+progress*.25},
   blackstar:{r:268+progress*40+music.energy*36},
  }});
  if(variant===1){character(c,resources,t,570,1158,1320,'fear',.1);c.fillStyle='#090C1320';c.fillRect(0,0,W,H);circle(c,582,380,160,P.orange,1)}
  else character(c,resources,t,460,939,759,'full',.5);
  text(c,'BLACK STAR',1140,878,36,P.white);text(c,'ABSORPTION / NO EMISSION',1140,915,15,P.white);text(c,'観測不能',98,253,65,P.paper,serif);
  line(c,1050,150,1660,150,P.white);text(c,`α ${((t*.018)%1).toFixed(4)}    δ −04.0021`,1320,130,15,P.white);
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===6){
  environment(c,t,data,s,color,{...ctxExtra,overrides:{ruins:{collapse:progress*.9}}});
  if(mode==='portrait'){character(c,resources,t,1390,1145,1200,'fear',.55);text(c,'落下',100,410,150,P.paper,serif)}
  else{character(c,resources,t,1160,931,758,'full',1.4);['世','界','崩','壊'].forEach((ch,j)=>text(c,ch,160,225+j*155,130,P.paper,serif))}
  particles(c,t,P.orange,140,2);text(c,'ALL CHANNELS LOST / CITY SECTOR 07',112,922,18,P.orange);
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===7){
  // 最安静的一段：一间有阳光的窗边房间。
  environment(c,t,data,s,P.teal,ctxExtra);
  // 桌上的小花：玻璃杯里的花，有影子、有窗光落在桌面。
  const fx=520,fy=868;
  c.save();
  c.globalAlpha=.30;c.fillStyle='#7E8474';
  c.beginPath();c.ellipse(fx+26,fy+96,74,15,0,0,TAU);c.fill();
  c.globalAlpha=.9;c.fillStyle='rgba(214,222,206,.55)';
  c.beginPath();c.moveTo(fx-34,fy+96);c.lineTo(fx+34,fy+96);c.lineTo(fx+26,fy+150);c.lineTo(fx-26,fy+150);c.closePath();c.fill();
  c.strokeStyle='rgba(236,242,226,.8)';c.lineWidth=2;c.stroke();
  c.strokeStyle=P.teal;c.lineWidth=3;
  c.beginPath();c.moveTo(fx,fy+100);c.quadraticCurveTo(fx+6,fy+40,fx-2,fy-10);c.stroke();
  c.restore();
  const glow=c.createRadialGradient(fx,fy-14,10,fx,fy-14,230);glow.addColorStop(0,alpha(P.teal,.26));glow.addColorStop(1,alpha(P.teal,0));
  c.save();c.globalCompositeOperation='lighter';c.fillStyle=glow;c.fillRect(fx-240,fy-250,480,480);c.restore();
  flower(c,fx,fy-24,84,t,P.teal,.85);
  if(mode==='portrait'){
   character(c,resources,t,1360,1095,1140,shot.expression==='peace'?'peace':'sad',.15);
   // A nearby sill runs in front of the cropped body, with warmer light on its top edge.
   path(c,[[1040,1080],[1200,943],[1940,948],[1940,1080]],'#A89C84',1,true);
   path(c,[[1115,1057],[1200,943],[1940,948],[1940,973],[1230,968],[1155,1064]],'#D7C8AA',1,true);
   line(c,1200,943,1935,949,'#EEE0C1',2.4);
  }else{
   const x=floorX(c,1390),y=959,h=710;
   chair(c,x,y,h,true);character(c,resources,t,x,y,h,'seated',.15,1,{placed:true});
  }
  text(c,'MEMORY / 0001',122,207,18,P.teal);largeWords(c,'STILL',112,396,111,P.teal);largeWords(c,'HERE.',112,515,111,P.teal);text(c,'消せない記録。',123,680,39,P.teal,serif);if(!hasLyrics)text(c,'ARCHIVE / SUNLIGHT / WIND / A SMALL FLOWER',124,742,14,P.teal);
  c.save();c.globalAlpha=.35;line(c,930,140,930,900,P.teal);text(c,'PLAYBACK',124,895,15,P.teal);c.restore();
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===8){
  // 核心在熔毁：结构向内塌陷，地面开裂，空气扭曲。
  environment(c,t,data,s,P.red,{...ctxExtra,overrides:{corestructure:{r:520+progress*30+music.energy*30}}});
  for(let i=0;i<5;i++){c.save();c.translate(960,520);c.rotate(t*.04+i*.61);c.globalAlpha=.25;line(c,-1300,0,1300,0,P.paper,1);c.restore()}
  reactorDeck(c,t,{vanishX:floorX(c,1020),energy:music.energy});
  character(c,resources,t,mode==='portrait'?1350:980,mode==='portrait'?1142:916,mode==='portrait'?1230:748,mode==='portrait'?'fear':'full',1.8);
  text(c,'THERMAL',90,335,98,P.paper);text(c,'RUNAWAY',88,435,98,P.paper);c.save();c.globalAlpha=.68;text(c,'CORE STATUS: CRITICAL',mode==='portrait'?110:1510,863,17,P.paper);text(c,'RECOVERY FAILED',mode==='portrait'?110:1510,890,17,P.paper);c.restore();text(c,'臨界',mode==='portrait'?105:1555,mode==='portrait'?620:325,105,P.paper,serif);
  for(let i=0;i<11;i++){const x=(mode==='portrait'?110:1510)+i*24;c.fillStyle=i<8?'#A85F4A':'#521C2D';c.fillRect(x,909,18,3)}
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===9){
  // 世界失效要留下证据：翻转的城市剖面、网格化的地面、仍在下落的碎片。
  environment(c,t,data,s,P.red,{...ctxExtra,overrides:{
   sky:{skyMid:mixHex('#6B151C','#C0303A',music.energy)},
   skyline:{ruin:music.onset*.6+progress*.3},
  }});
  c.save();c.translate(960,540);c.rotate(Math.sin(local*.15)*.08);for(let j=0;j<8;j++){const x=(hash(j)*2200-1100+local*42)%2200;c.globalAlpha=.35;line(c,x,-800,x+200,800,P.red,j%3?1:5)}c.restore();
  character(c,resources,t,mode==='portrait'?1360:980,mode==='portrait'?1138:925,mode==='portrait'?1196:766,mode==='portrait'?'fear':'full',2);
  if(mode!=='portrait'&&variant===1){c.save();c.globalAlpha=.09;character(c,resources,t-.06,1015,929,766,'full',2);c.restore()}
  const targetX=1420,targetY=410;circle(c,targetX,targetY,11+Math.sin(t*2)*2,P.mint,2);line(c,1120,570,targetX,targetY,P.mint,.6);text(c,'ONE SIGNAL REMAINS',1160,655,25,P.mint);largeWords(c,'REALITY',70,300,110,P.paper);largeWords(c,'ERROR',70,419,110,P.red);
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else if(s.id===10){
  // 信号要有出处，也要有去处：从观测站出发，穿过城市上空，指向星空。
  environment(c,t,data,s,P.mint,ctxExtra);
  if(mode==='portrait'){character(c,resources,t,1270,1118,1175,'peace',.1);nearBarrier(c,t,{side:1,y:966,reach:820,rim:P.mint});text(c,'THE LAST MESSAGE',105,290,62,P.paper);terminal(c,t,data,108,420,640,270,P.mint);text(c,'SEND / MEMORY.ARCHIVE',130,743,24,P.mint)}
  else transmission(c,t,data,P.mint);
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }else{
  // 结尾：她不在了，但系统还在。灯由远及近逐盏熄灭，只剩一点薄荷绿。
  environment(c,t,data,s,P.teal,{...ctxExtra,overrides:{racks:{color:'#C8CCD1'},monitors:{color:'#C8CCD1'}}});
  const lamps=8;
  for(let i=0;i<lamps;i++){
   const off=clamp((progress-.1)*lamps-i*.5,0,1);
   if(off>=1)continue;
   const lx=200+i*224,ly=128;
   // 吊灯的灯罩与吊线
   c.save();c.globalAlpha=(1-off)*.9;
   c.strokeStyle=alpha(P.paper,.35);c.lineWidth=1.4;c.beginPath();c.moveTo(lx,0);c.lineTo(lx,ly-10);c.stroke();
   c.fillStyle=alpha('#0A1218',.9);c.beginPath();c.moveTo(lx-26,ly+6);c.lineTo(lx+26,ly+6);c.lineTo(lx+14,ly-10);c.lineTo(lx-14,ly-10);c.closePath();c.fill();
   c.strokeStyle=alpha(P.paper,.5);c.lineWidth=1.4;c.stroke();
   c.fillStyle=alpha(P.paper,.85);c.beginPath();c.ellipse(lx,ly+7,22,5,0,0,TAU);c.fill();
   // 灯下的光锥
   c.globalCompositeOperation='lighter';
   const cone=c.createLinearGradient(lx,ly, lx,ly+520);
   cone.addColorStop(0,alpha(P.paper,.16));cone.addColorStop(1,alpha(P.paper,0));
   c.fillStyle=cone;
   c.beginPath();c.moveTo(lx-22,ly+7);c.lineTo(lx+22,ly+7);c.lineTo(lx+150,ly+520);c.lineTo(lx-150,ly+520);c.closePath();c.fill();
   const g=c.createRadialGradient(lx,ly+7,2,lx,ly+7,150);g.addColorStop(0,alpha(P.paper,.30));g.addColorStop(1,alpha(P.paper,0));
   c.fillStyle=g;c.fillRect(lx-160,ly-140,320,320);
   c.restore();
  }
  // 她站过的地方留下的东西：椅子与掉在地上的发带。
  c.save();c.fillStyle='#0C171D';c.fillRect(1290,880,170,26);c.fillRect(1300,906,14,120);c.fillRect(1436,906,14,120);
  c.strokeStyle='#7A5C86';c.lineWidth=5;c.beginPath();c.moveTo(1370,860);c.bezierCurveTo(1400,930,1330,960,1380,1010);c.stroke();c.restore();
  // 唯一剩下的薄荷绿光点
  c.save();c.globalCompositeOperation='lighter';const g=c.createRadialGradient(1348,930,2,1348,930,220);
  g.addColorStop(0,alpha(P.mint,.30));g.addColorStop(1,alpha(P.mint,0));c.fillStyle=g;c.fillRect(1128,710,440,440);c.restore();
  circle(c,1348,930,5,P.mint,1.4);
  c.fillStyle=P.black;c.globalAlpha=.28+progress*.36;c.fillRect(0,0,W,H);c.globalAlpha=1;
  const ls=['OBSERVER: XIAOCHU','LAST SIGNAL: SENT','RESPONSE: UNKNOWN'];ls.forEach((l,i)=>{if(local>i*.9)text(c,l,610,480+i*45,27,i===1?P.mint:P.white)});if(progress<.78)text(c,'_',610,645,30,P.mint);
  foregroundLayer(c,t,data,s,color,ctxExtra);
 }
 c.restore();
 if(s.id!==7&&mode!=='eye')particles(c,t,color,55,.2);
 // Deliberate tears are confined to a thin band and never invert the whole frame.
 const tearEvents=data.cues.events?.filter(e=>e.type==='tear')||[];for(const ev of tearEvents){const dt=t-ev.time;if(dt>=0&&dt<.14){const yy=220+hash(ev.time)*570;c.fillStyle='#090C1370';c.fillRect(60,yy,1800,16);line(c,60,yy,1860,yy,color,1)}}
 paintLyricBack(c,resources);
 if(!resources.jizuraDraw)drawLyricMotifs(c,t,resources,data,'front');
 c.restore();
}
function renderOverlay(c,t,resources,data,width,height){
 const s=sceneAt(t,data),shot=shotAt(t,data),mode=shot.mode,color=resolveInk(s.color)||P.mint;
 c.save();c.setTransform(1,0,0,1,0,0);c.scale(width/W,height/H);
 if(mode==='abstract'||s.id===2||s.id===3)hud(c,t,data,s,s.id===7?P.teal:color);
 else if(mode!=='eye'&&s.id!==11){spaced(c,'LAST SIGNAL',70,61,12,4,s.id===7?P.teal:color);text(c,`REC ${String(shot.id).padStart(3,'0')}`,1700,61,13,s.id===7?P.teal:color)}
 // 崩坏计量条：重复段与高潮段显示信号损坏程度。
 const g=resources.glitch??glitchAt(data,t);
 if(g){const seg=10,sw=14,gap=3,right=1700,lit=g.intensity*seg;
  for(let i=0;i<seg;i++){const on=lit>i;c.fillStyle=on?(i>6?P.red:i>3?P.orange:color):'#9DE4C21F';c.fillRect(right-(seg-i)*(sw+gap)+gap,80,sw,4)}
  text(c,'DECONSTRUCT',right,73,10,g.intensity>.45?P.red:P.white);}
 // Restrained texture; no random source, flicker, full-screen bloom, or history buffers.
 c.save();c.globalAlpha=.045;c.fillStyle=s.id===7?P.teal:P.white;for(let i=0;i<64;i++)c.fillRect(0,i*17,W,.6);c.restore();
 if(t<2.73){c.fillStyle=P.black;c.globalAlpha=1-ease((t-1.9)/.8);c.fillRect(0,0,W,H);c.globalAlpha=1;if(t<2.2)text(c,'_',137,580,48,P.mint)}
 if(t>data.config.duration-1.25){c.fillStyle=P.black;c.globalAlpha=ease((t-(data.config.duration-1.25))/1.2);c.fillRect(0,0,W,H);c.globalAlpha=1}
 c.restore();
}
export function renderFrame(c,t,resources,data,width=W,height=H){
 renderMotionFrame(c,t,resources,data,width,height,renderBaseFrame);
 const shot=shotAt(t,data);resources.lyricContrast=!!shot.rhythm&&(shot.mode==='eye'||shot.mode==='hand');
 // The current reading layer follows the incoming camera, but remains intact during
 // image wipes. Background keyword echoes still receive true scene occlusion.
 const camera=cameraAt(data,t,true);c.save();c.setTransform(1,0,0,1,0,0);
 if(camera.enabled){const ax=width*camera.anchorX,ay=height*camera.anchorY;c.translate(ax+camera.panX*width/W,ay+camera.panY*height/H);c.rotate(camera.roll);c.scale(camera.zoom,camera.zoom);c.translate(-ax,-ay)}
 c.scale(width/W,height/H);if(resources.jizuraDraw)resources.jizuraDraw(c,t,data,'front');else drawLyricArt(c,t,resources,data,'front');c.restore();
 renderOverlay(c,t,resources,data,width,height);
 // 崩坏后期：整幅画面（含阅读层与 HUD）统一失序，只由歌曲时间驱动。
 applyGlitch(c,t,data,resources,width,height);
}
