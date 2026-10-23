// Lightweight vector metaphors keyed by authored lyric cues, never inferred speech.
import {activeLyricCues} from './lyric_art.mjs';
import {palette as P} from './palette.mjs';
import {signalWindowAt, hash2} from './signal_windows.mjs';

const TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n)};
// 阶梯曲线：意象动画改成逐格跳进，与歌词排版共用同一个信号节拍。
function stepEase(q,steps){q=clamp(q);const s=Math.max(1,steps|0);return Math.min(1,Math.floor(q*s+1e-9)/Math.max(1,s-1));}
const fract=n=>n-Math.floor(n);
const hash=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
const SIGNAL_HZ=15;
const seedOf=s=>[...String(s)].reduce((sum,ch,i)=>sum+ch.codePointAt(0)*(i+3),0);
export const motifNames=Object.freeze(['recursion','electric','flag','ship','bell-sand','salt-tear','fish-ocean','swallow','heat','blackstar-eye']);
const aliases={variable:'recursion',variables:'recursion',delete:'recursion','recursion-lattice':'recursion',veins:'electric','electric-veins':'electric',vascular:'electric',smoke:'electric',chain:'electric','burning-flag':'flag',burn:'flag','paper-ship':'ship',origami:'ship',fracture:'ship',bell:'bell-sand',sand:'bell-sand',salt:'salt-tear',tear:'salt-tear',crystal:'salt-tear',fish:'fish-ocean',ocean:'fish-ocean',cloud:'swallow','swallow-trails':'swallow',thermal:'heat','heat-rings':'heat',blackstar:'blackstar-eye','black-star':'blackstar-eye',eye:'blackstar-eye','star-eye':'blackstar-eye'};
function line(c,x,y,X,Y,width=1){c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.stroke()}
function path(c,points,width=1,closed=false){if(!points.length)return;c.lineWidth=width;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(closed)c.closePath();c.stroke()}
function circle(c,x,y,r,width=1){c.lineWidth=width;c.beginPath();c.arc(x,y,Math.max(.01,r),0,TAU);c.stroke()}
function traced(c,points,q,width=1){
 if(points.length<2||q<=0)return;const count=(points.length-1)*clamp(q),last=Math.floor(count),part=count-last,out=points.slice(0,last+1);
 if(last<points.length-1)out.push([points[last][0]+(points[last+1][0]-points[last][0])*part,points[last][1]+(points[last+1][1]-points[last][1])*part]);path(c,out,width);
}
function origin(cue){
 const a=cue.semantic.motifAnchor;if(!Array.isArray(a)||a.length<2||!a.every(Number.isFinite))return [1370,550];
 return Math.abs(a[0])<=1.5&&Math.abs(a[1])<=1.5?[a[0]*1920,a[1]*1080]:a;
}
function colorFor(cue){
 const role=cue.semantic.motifColor,roles={NORMAL:'mint',WARNING:'orange',CRITICAL:'red',MEMORY:'pink',OBSERVE:'teal',PAPER:'paper',SILENCE:'white'};
 return P[roles[role]||role]||(cue.scene===7?P.teal:cue.scene===8||cue.scene===9?P.mint:cue.scene===3||cue.scene===4?P.orange:P.mint);
}

function recursion(c,s){
 const nodes=[];for(let row=0;row<5;row++)for(let col=0;col<8;col++)nodes.push([-360+col*100,-200+row*95]);
 const erased=s.q>.55?smooth((s.q-.55)/.45):0;
 nodes.forEach(([x,y],i)=>{const row=Math.floor(i/8),col=i%8,drift=erased*(hash(i+s.seed)-.5)*160,show=smooth((s.age-hash(i+s.seed)*.35)/.45);if(show<=0)return;c.save();c.globalAlpha*=show*(1-erased*hash(i+4)*.6);c.translate(x+drift,y+erased*hash(i+6)*90);c.rotate(erased*(hash(i)-.5)*1.6);c.lineWidth=i%7===0?2:1;c.strokeRect(-8,-8,16,16);c.restore();
  if(col<7)traced(c,[[x+9,y],[x+100,y]],show*(1-erased*.7),.8);
  if(row<4&&i%3!==1)traced(c,[[x,y+9],[x,y+95]],show*(1-erased*.7),.8);
 });
 for(let i=0;i<9;i++){const z=fract(s.age*.32+i/9);c.save();c.globalAlpha*=Math.sin(z*Math.PI)*.65;const x=-380+z*800,y=-165+hash(i+3)*380;line(c,x,y,x+22,y-7,1.4);c.restore()}
}
function electric(c,s){
 for(let branch=0;branch<7;branch++){
  const points=[];for(let j=0;j<=22;j++){const q=j/22;points.push([-330+q*700,-160+branch*58+Math.sin(q*9+s.age*2+branch)*18+Math.sin(q*26+branch)*8])}
  traced(c,points,s.enter,branch%3?1:2);
  const q=fract(s.age*.58+branch*.13),index=q*22,j=Math.floor(index),a=points[j],b=points[Math.min(22,j+1)],x=a[0]+(b[0]-a[0])*(index-j),y=a[1]+(b[1]-a[1])*(index-j);circle(c,x,y,3,1.5);
 }
 c.save();c.globalAlpha*=.35;for(let i=0;i<8;i++){const z=fract(i/8+s.age*.12),x=-150+Math.sin(z*7+s.seed)*130,y=130-z*440;c.lineWidth=1;c.beginPath();c.moveTo(x,y+45);c.bezierCurveTo(x-55,y+5,x+90,y-65,x+10,y-115);c.stroke()}c.restore();
}
function flag(c,s){
 line(c,-245,340,-245,-330,2);const points=[],phase=s.age*2.9;
 for(let i=0;i<=25;i++){const q=i/25;points.push([-245+q*620,-310+Math.sin(q*8-phase)*q*30+q*45])}
 for(let i=25;i>=0;i--){const q=i/25;points.push([-245+q*620,-120+Math.sin(q*8-phase+.5)*q*42+q*50])}
 traced(c,[...points,points[0]],s.enter,2);
 for(let i=0;i<6;i++){const q=(i+.5)/6,x=-245+q*620;c.beginPath();c.moveTo(x,-310+Math.sin(q*8-phase)*q*30+q*45);c.bezierCurveTo(x+20,-240,x-12,-180,x,-120+Math.sin(q*8-phase+.5)*q*42+q*50);c.lineWidth=.8;c.stroke()}
 for(let i=0;i<15;i++){const z=fract(s.age*.45+i*.113),x=-210+hash(i+s.seed)*570,y=-70-z*270;c.save();c.globalAlpha*=Math.sin(z*Math.PI);path(c,[[x-9,y+24],[x+Math.sin(z*11+i)*16,y],[x+7,y+16]],1);c.restore()}
}
function ship(c,s){
 const split=smooth((s.q-.3)/.65),rock=Math.sin(s.age*1.7)*.035;
 c.save();c.translate(0,55+Math.sin(s.age*1.2)*14);c.rotate(rock);
 const fragments=[[[0,95],[-330,-10],[-90,-50]],[[0,95],[-90,-50],[50,-210]],[[0,95],[50,-210],[335,-15]],[[0,95],[335,-15],[175,120]]];
 fragments.forEach((points,i)=>{c.save();c.translate((i-1.5)*split*68,split*hash(i+s.seed)*100);c.rotate((i-1.5)*split*.13);traced(c,[...points,points[0]],s.enter,1.7);c.restore()});c.restore();
 c.save();c.globalAlpha*=.35;for(let row=0;row<4;row++){const points=[];for(let j=0;j<=44;j++)points.push([-440+j*20,240+row*34+Math.sin(j*.35-s.age*1.8+row)*9]);traced(c,points,s.enter,1)}c.restore();
}
function bellSand(c,s){
 const swing=Math.sin(s.age*6)*Math.exp(-s.age*.7)*.1;
 c.save();c.translate(0,-160);c.rotate(swing);c.lineWidth=2;c.beginPath();c.moveTo(-170,180);c.bezierCurveTo(-108,120,-140,-115,0,-130);c.bezierCurveTo(140,-115,108,120,170,180);c.stroke();path(c,[[-170,180],[170,180]],2);circle(c,0,-149,18,1.5);circle(c,0,175,18,1.5);c.restore();
 for(let i=0;i<4;i++){const z=fract(s.age*.42+i*.25);c.save();c.globalAlpha*=(1-z)*.6;c.lineWidth=1.2;c.beginPath();c.ellipse(0,60,80+z*300,20+z*90,0,0,TAU);c.stroke();c.restore()}
 for(let i=0;i<54;i++){const z=fract(s.age*(.28+hash(i)*.12)+hash(i+7)),x=(hash(i+s.seed)-.5)*(50+z*240),y=75+z*370;c.save();c.globalAlpha*=Math.sin(z*Math.PI);line(c,x,y,x+1,y+3+z*5,.8);c.restore()}
}
function saltTear(c,s){
 for(let i=0;i<13;i++){
  const a=hash(i+s.seed)*TAU,dist=90+hash(i+3)*230,z=fract(s.age*.12+hash(i+5)),x=Math.cos(a)*dist,y=Math.sin(a)*dist*.65+z*90;
  c.save();c.translate(x,y);c.rotate(s.age*.12*(i%2?1:-1)+i);const r=17+hash(i+1)*28,hex=[];for(let j=0;j<6;j++)hex.push([Math.cos(j/6*TAU)*r,Math.sin(j/6*TAU)*r]);traced(c,[...hex,hex[0]],s.enter,1.2);for(let j=0;j<6;j+=2)line(c,0,0,hex[j][0],hex[j][1],.7);c.restore();
 }
 const fall=fract(s.age*.24),y=-320+fall*680;c.save();c.translate(0,y);c.globalAlpha*=Math.sin(fall*Math.PI);c.lineWidth=1.8;c.beginPath();c.moveTo(0,-48);c.bezierCurveTo(-58,11,-24,52,0,52);c.bezierCurveTo(24,52,58,11,0,-48);c.stroke();line(c,0,-28,0,28,.7);c.restore();
}
function fishOcean(c,s){
 c.save();c.globalAlpha*=.4;for(let row=0;row<6;row++){const points=[];for(let j=0;j<=45;j++)points.push([-440+j*20,90+row*41+Math.sin(j*.28-s.age*1.5+row*.45)*(13+row*2)]);traced(c,points,s.enter,1)}c.restore();
 for(let i=0;i<5;i++){
  const z=fract(s.age*.095+i*.19),x=-420+z*850,y=-170+i*53+Math.sin(z*TAU+i)*35,size=25+i%3*9;
  c.save();c.translate(x,y);c.rotate(Math.cos(z*TAU+i)*.12);c.globalAlpha*=Math.sin(z*Math.PI);c.lineWidth=1.4;c.beginPath();c.moveTo(size,0);c.bezierCurveTo(size*.4,-size*.65,-size*.7,-size*.45,-size,0);c.bezierCurveTo(-size*.7,size*.45,size*.4,size*.65,size,0);c.stroke();path(c,[[-size,0],[-size*1.65,-size*.48],[-size*1.55,size*.48],[-size,0]],1.2);circle(c,size*.55,-2,1.3,.9);c.restore();
 }
}
function swallow(c,s){
 c.save();c.globalAlpha*=.35;c.strokeStyle=P.white;
 for(let i=0;i<7;i++){const x=-360+i*110,y=-220+Math.sin(i*.8)*42;c.lineWidth=1;c.beginPath();c.arc(x,y,40+hash(i)*25,Math.PI,TAU);c.stroke();line(c,x-50,y+35,x+80,y+35,.7)}c.restore();
 for(let bird=0;bird<3;bird++){
  const z=fract(s.age*.14+bird*.28),x=-420+z*850,y=210-z*460+Math.sin(z*Math.PI)*50,flap=Math.sin(s.age*8+bird)*14;
  c.save();c.translate(x,y);c.rotate(-.38);c.globalAlpha*=Math.sin(z*Math.PI);c.lineWidth=1.8;c.beginPath();c.moveTo(-47,-16-flap);c.bezierCurveTo(-21,-25,0,10,0,0);c.bezierCurveTo(4,8,21,-25,45,-14+flap);c.stroke();path(c,[[0,0],[-5,21],[7,13]],1);c.restore();
  c.save();c.globalAlpha*=.22*Math.sin(z*Math.PI);for(let trail=0;trail<3;trail++)line(c,x-95-trail*22,y+25+trail*5,x-45,y+12+trail*3,.8);c.restore();
 }
}
function heat(c,s){
 for(let ring=0;ring<6;ring++){
  const z=fract(s.age*.2+ring/6),radius=50+z*340,points=[];
  for(let j=0;j<=90;j++){const a=j/90*TAU,dist=radius+Math.sin(a*7+s.age*3.1+ring)*8*z+Math.sin(a*13-s.age*2)*3;points.push([Math.cos(a)*dist,Math.sin(a)*dist*.82-z*65])}
  c.save();c.globalAlpha*=Math.sin(z*Math.PI)*.68;path(c,points,ring%2?1:1.8);c.restore();
 }
 for(let i=0;i<9;i++){const points=[];for(let j=0;j<=25;j++)points.push([-300+i*77+Math.sin(j*.44+s.age*2+i)*8,-290+j*25]);c.save();c.globalAlpha*=.14;path(c,points,.8);c.restore()}
}
function blackstarEye(c,s){
 const growth=.65+s.q*.75,radius=140*growth;
 for(let i=0;i<4;i++){c.save();c.globalAlpha*=.7-i*.12;circle(c,0,-40,radius+i*34,1+i%2);c.restore()}
 c.save();c.translate(0,-40);c.rotate(s.age*.1);const star=[];for(let i=0;i<16;i++){const a=i/16*TAU,r=radius*(i%2?.28:.78);star.push([Math.cos(a)*r,Math.sin(a)*r])}traced(c,[...star,star[0]],s.enter,1.8);c.restore();
 const eyeWidth=330*growth,blink=1-.2*Math.sin(s.age*1.9)**8;c.lineWidth=1.5;c.beginPath();c.moveTo(-eyeWidth,-40);c.bezierCurveTo(-eyeWidth*.4,-40-160*blink,eyeWidth*.4,-40-160*blink,eyeWidth,-40);c.bezierCurveTo(eyeWidth*.4,-40+160*blink,-eyeWidth*.4,-40+160*blink,-eyeWidth,-40);c.stroke();
 const target=(Math.sin(s.age*.7)*.5+.5)*TAU;line(c,Math.cos(target)*(radius+50),-40+Math.sin(target)*(radius+50),Math.cos(target)*(radius+90),-40+Math.sin(target)*(radius+90),2);
}
const painters={recursion,electric,flag,ship,'bell-sand':bellSand,'salt-tear':saltTear,'fish-ocean':fishOcean,swallow,heat,'blackstar-eye':blackstarEye};

function foreground(c,s){
 // Foreground depth is confined to a few low strokes, away from the face and type.
 for(let i=0;i<3;i++){const z=fract(s.age*.25+i*.31),x=-260+z*560,y=360+i*18;c.save();c.globalAlpha*=Math.sin(z*Math.PI)*.45;line(c,x,y,x+35+i*12,y-9,1);c.restore()}
}

export function drawLyricMotifs(c,t,resources,data,plane='back'){
 if(!c||!Number.isFinite(t))return 0;const seen=new Set();let count=0;
 for(const cue of activeLyricCues(data,t)){
  if(cue.field==='translation')continue;
  const requested=cue.semantic?.motif,list=Array.isArray(requested)?requested:[requested];
  for(const rawName of list){
   const name=aliases[rawName]||rawName;if(!painters[name])continue;
   const key=`${cue.lineId}:${name}`;if(seen.has(key))continue;
   const authoredPlane=cue.semantic.motifPlane||cue.motifPlane||'back';
   if(authoredPlane!=='both'&&authoredPlane!==plane)continue;seen.add(key);
   const life=cue.end-cue.start,seed=seedOf(cue.lineId);
   // 意象时间同样锁在信号时钟上：所有插值都变成逐格跳进。
   const age=Math.floor((t-cue.start)*SIGNAL_HZ)/SIGNAL_HZ;
   const s={age,q:clamp((t-cue.start)/Math.max(.01,life)),enter:stepEase(age/Math.min(.5,life*.3),6),seed};
   const fade=s.enter*stepEase((cue.end-t)/Math.min(.4,life*.25),4),[ox,oy]=origin(cue);
   // 授权窗口内，意象整体产生一次量化错位，与崩坏后期同一张时间表。
   const window=signalWindowAt(t);let x=ox,y=oy;
   if(window){const tag=Math.floor(seed*65535);const k=hash2(tag*3+1,Math.floor(t*SIGNAL_HZ));x+=Math.round((k-.5)*26*window.corrupt);y+=Math.round((hash2(tag*5+2,Math.floor(t*SIGNAL_HZ))-.5)*16*window.corrupt);}
   c.save();try{
    c.translate(x,y);c.globalAlpha*=fade*(plane==='front'?.4:.58);c.strokeStyle=colorFor(cue);c.fillStyle=colorFor(cue);c.lineCap='round';c.lineJoin='round';
    if(plane==='front')foreground(c,s);else painters[name](c,s);count++;
   }finally{c.restore()}
  }
 }
 return count;
}
