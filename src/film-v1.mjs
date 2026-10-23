// Pure, seekable Canvas 2D film. All scene motion is evaluated from song time.
export const W = 1920, H = 1080;
const TAU = Math.PI * 2;
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const fract=x=>x-Math.floor(x);
const hash=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
const P={mint:'#9DE4C2',teal:'#294F4C',orange:'#ED8B50',red:'#D93B4A',purple:'#241726',pink:'#E9ACC8',black:'#090C13',white:'#C8CCD1',paper:'#E9EDE5'};
const mono='Consolas, monospace', serif='"Noto Serif JP", "Yu Mincho", serif';
function line(c,x,y,X,Y,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.stroke()}
function circle(c,x,y,r,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.arc(x,y,Math.max(.01,r),0,TAU);c.stroke()}
function text(c,s,x,y,size=20,color=P.mint,font=mono){if(font===mono&&/[^\x00-\x7F]/.test(s))font=serif;c.font=`${size}px ${font}`;c.fillStyle=color;c.fillText(s,x,y)}
function spaced(c,s,x,y,size,gap,color){c.font=`${size}px ${mono}`;c.fillStyle=color;for(const ch of s){c.fillText(ch,x,y);x+=c.measureText(ch).width+gap}}
function path(c,pts,color,width=1,fill=false){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(fill)c.closePath();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=width;fill?c.fill():c.stroke()}
function feature(data,key,t){const f=data.features||{},a=f[key]||f.features?.[key];if(!a?.length)return 0;const i=clamp(Math.floor(t*(f.featureRate||20)),0,a.length-1);return +a[i]||0}
function pulse(data,t){const on=feature(data,'onsets',t);return clamp(on*1.7)}
function particles(c,t,color,count=80,strength=1){c.fillStyle=color;for(let i=0;i<count;i++){const x=hash(i*7.13)*W,y=(hash(i*3.71)*H-t*(7+hash(i)*22)*strength)%H;const size=hash(i*1.8)>0.95?3:1;c.globalAlpha=.12+hash(i+20)*.45;c.fillRect(x,y<0?y+H:y,size,size)}c.globalAlpha=1}
function grid(c,t,color,amount=.2){c.save();c.globalAlpha=amount;for(let i=0;i<15;i++)line(c,i*160+(t*4)%160,0,i*160+(t*4)%160,H,color);for(let j=0;j<9;j++)line(c,0,j*150,W,j*150,color);c.restore()}
function rings(c,x,y,r,t,color,energy=0){c.save();c.translate(x,y);c.rotate(t*.045);for(let j=0;j<4;j++){c.globalAlpha=.18+j*.13;circle(c,0,0,r+j*27,color,j===2?2:1)}c.globalAlpha=.65;for(let j=0;j<64;j++){const a=j/64*TAU,rr=r+100;line(c,Math.cos(a)*rr,Math.sin(a)*rr,Math.cos(a)*(rr+(j%4?6:15)),Math.sin(a)*(rr+(j%4?6:15)),color)}c.rotate(t*.07);c.lineWidth=3;c.strokeStyle=color;c.beginPath();c.arc(0,0,r+58,t*.1,t*.1+1.2+energy*.2);c.stroke();c.restore()}
function blackStar(c,x,y,r,t,color,energy=0){c.save();rings(c,x,y,r,t,color,energy);c.fillStyle=P.black;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.save();c.beginPath();c.arc(x,y,r,0,TAU);c.clip();c.globalAlpha=.35;for(let j=0;j<19;j++){const yy=y-r+j*r/9;line(c,x-r,yy,x+r,yy+18*Math.sin(j+t*.9),P.purple,1)}c.restore();c.globalAlpha=.8;circle(c,x,y,r,color,2);c.restore()}
function waveform(c,data,t,x,y,width,height,color){const f=data.features||{},arr=f.envelope||[];c.strokeStyle=color;c.lineWidth=1.4;c.beginPath();for(let i=0;i<180;i++){const tt=t-4+i/180*8,j=Math.floor(tt*(f.featureRate||20)),v=arr[j]||0;const xx=x+i/179*width,yy=y-v*height*(i%2?1:-1);i?c.lineTo(xx,yy):c.moveTo(xx,yy)}c.stroke();line(c,x+width/2,y-height,x+width/2,y+height,color,.8)}
function city(c,t,color,collapse=0,scale=1){c.save();c.translate(0,730);c.scale(scale,scale);for(let layer=0;layer<3;layer++){const count=28;c.globalAlpha=.32+layer*.22;for(let i=0;i<count;i++){const x=i*85-140+layer*31-(t*(layer+1)*1.6)%85,h=70+hash(i+layer*33)*300,w=28+hash(i+77)*45;const fall=collapse*Math.max(0,Math.sin(i*9.1+layer));c.save();c.translate(x,layer*48);c.rotate(fall*(hash(i)-.5)*.65);c.fillStyle=layer===2?'#0D151B':color;c.fillRect(0,-h+fall*130,w,h);if(layer===2){c.strokeStyle=color;c.lineWidth=1;c.strokeRect(0,-h+fall*130,w,h);for(let j=0;j<5;j++)if(hash(i*7+j)>.42){c.globalAlpha*=.55;c.fillStyle=color;c.fillRect(7+j%3*10,-h+30+j*35,3,8);c.globalAlpha=.76}}c.restore()}}c.restore()}
function floor(c,t,color){c.save();c.globalAlpha=.22;for(let i=-9;i<15;i++)line(c,960+i*35,590,960+i*230,1100,color);for(let j=0;j<15;j++){const v=fract(j/15+t*.018),yy=590+Math.pow(v,2)*550;line(c,0,yy,W,yy,color)}c.restore()}
function terminal(c,t,data,x,y,w,h,color,mode='OBSERVE'){c.save();c.fillStyle='#0C171C';c.fillRect(x,y,w,h);c.strokeStyle=color;c.lineWidth=1;c.strokeRect(x,y,w,h);line(c,x,y+38,x+w,y+38,color);text(c,`XIAOCHU / ${mode}`,x+18,y+25,15,color);const logs=mode==='RETRY'?['DELETE MEMORY INDEX','RECONSTRUCTING…','CHECKSUM MISMATCH','RETRY / NO RESPONSE']:['OBSERVATORY / LAST NODE','CHANNEL: DEEP SPACE','PACKET / MEMORY.ARCHIVE','AWAITING RESPONSE_'];for(let i=0;i<logs.length;i++)text(c,logs[i],x+20,y+76+i*33,Math.min(17,w/22),i===logs.length-1?P.white:color);waveform(c,data,t,x+20,y+h-40,w-40,24,color);c.restore()}
function observatory(c,t,data,color){const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0C1B20');g.addColorStop(1,P.black);c.fillStyle=g;c.fillRect(0,0,W,H);c.save();c.globalAlpha=.5;for(let i=0;i<4;i++){c.strokeStyle=color;c.lineWidth=i?1:12;c.beginPath();c.ellipse(960,520,860+i*90,650+i*70,0,Math.PI,TAU);c.stroke()}for(let i=0;i<11;i++)line(c,960,85,180+i*156,800,color);c.restore();floor(c,t,color);blackStar(c,1010,380,133,t,color);c.fillStyle='#0A1118';path(c,[[0,690],[500,660],[910,850],[1720,680],[1920,740],[1920,1080],[0,1080]],'#0A1118',1,true);terminal(c,t,data,95,640,370,230,color);terminal(c,t,data,1475,580,340,210,color);line(c,0,952,W,952,color,2)}
function imageFit(c,img,x,y,h){if(!img)return;const w=img.width/img.height*h;c.drawImage(img,x-w/2,y-h,w,h)}
function seatedTerminal(c,resources,t,data,x=1320,y=1030,h=740){
 c.fillStyle='#12252A';c.fillRect(x+100,y-h*.58,24,h*.57);c.fillRect(x-60,y-h*.28,270,17);line(c,x+105,y-h*.32,x+210,y,P.teal,7);
 character(c,resources,t,x,y,h,'seated',.16);
 c.fillStyle='#142B2E';path(c,[[x-500,y-h*.5],[x-180,y-h*.5],[x-60,y-h*.36],[x-470,y-h*.36]],'#142B2E',1,true);
 line(c,x-480,y-h*.36,x-480,y+20,P.teal,6);line(c,x-90,y-h*.36,x-90,y+20,P.teal,6);
 terminal(c,t,data,x-590,y-h*.87,330,220,P.mint);
 for(let i=0;i<11;i++)line(c,x-430+i*21,y-h*.45,x-408+i*21,y-h*.41,P.mint,.6);
}
function character(c,resources,t,x,y,h,expression='full',wind=.3,opacity=1){const img=resources[expression]||resources.full;if(!img)return;c.save();c.globalAlpha=opacity;c.translate(x,y+Math.sin(t*1.9)*2);c.rotate(Math.sin(t*.55)*.006);const w=img.width/img.height*h;const slices=expression==='full'?42:26;for(let i=0;i<slices;i++){const sy=i/slices*img.height,sh=img.height/slices+1,q=i/slices;const sway=Math.sin(t*1.8-q*4)*wind*12*Math.pow(q,1.6)+Math.sin(t*3.1+q*8)*wind*2;const dst=sy/img.height*h-h;c.drawImage(img,0,sy,img.width,Math.min(sh,img.height-sy),-w/2+sway,dst,w,Math.min(sh,img.height-sy)/img.height*h+.4)}c.restore()}
function flower(c,x,y,r,t,color,alpha=1){c.save();c.translate(x,y);c.rotate(t*.04);c.globalAlpha=alpha;for(let layer=0;layer<3;layer++){const pts=[];for(let j=0;j<=300;j++){const a=j/300*TAU,rr=r*(.47+.5*Math.cos(a*5+layer*.23));pts.push([Math.cos(a)*rr,Math.sin(a)*rr])}path(c,pts,color,layer?1:2);c.rotate(.17)}for(let i=0;i<20;i++){const a=i/20*TAU;line(c,Math.cos(a)*r*.22,Math.sin(a)*r*.22,Math.cos(a)*r*.9,Math.sin(a)*r*.9,color,.6)}circle(c,0,0,r*.13,color);c.restore()}
function hud(c,t,data,scene,color){c.save();c.globalAlpha=.8;spaced(c,'LAST SIGNAL',64,54,14,4,color);text(c,`${String(scene.id).padStart(2,'0')} / ${scene.label}`,64,81,13,P.white);c.textAlign='right';text(c,`OBSERVER  XIAOCHU    /    ${scene.state}`,1856,54,13,color);text(c,`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}`,1856,81,13,P.white);c.textAlign='left';for(const [x,y,sx,sy] of [[44,108,1,1],[1876,108,-1,1],[44,1000,1,-1],[1876,1000,-1,-1]]){line(c,x,y,x+sx*24,y,color);line(c,x,y,x,y+sy*24,color)}line(c,64,1021,1856,1021,color,.6);c.fillStyle=color;c.fillRect(64,1019,1792*clamp(t/(data.config?.duration||242.538333)),3);text(c,'LAST OBSERVATORY / FICTIONAL TELEMETRY',64,1051,11,P.white);c.textAlign='right';text(c,'熱異常  /  ARCHIVE 0001',1856,1051,13,color);c.restore()}
function glyphTunnel(c,t,color,amount=1){c.save();c.translate(960,520);for(let j=0;j<15;j++){const z=fract(j/15+t*.07),s=Math.pow(z,2)*2.4;c.save();c.rotate(j*.16+t*.08);c.globalAlpha=Math.sin(z*Math.PI)*.24*amount;c.strokeStyle=color;c.lineWidth=1;c.strokeRect(-600*s,-350*s,1200*s,700*s);text(c,`0${j}  ERROR / RECURSION`,-580*s,-320*s,24*s,color);c.restore()}c.restore()}
function largeWords(c,word,x,y,size,color,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.font=`700 ${size}px ${/[^\x00-\x7F]/.test(word)?serif:mono}`;c.fillStyle=color;c.fillText(word,0,0);c.restore()}
function lyrics(c,t,data,color,scene){const lines=data.lyrics?.lines||[],a=lines.find(l=>t>=l.time&&t<l.end);if(!a)return;const words=a.words||[],visible=words.filter(w=>t>=w.time).map(w=>w.text).join('')||a.text;c.save();c.textAlign='center';c.font=`32px "Noto Sans JP", sans-serif`;const tw=c.measureText(a.text).width;c.fillStyle='#090C13DD';c.fillRect(960-tw/2-28,908,tw+56,62);c.fillStyle=P.paper;c.fillText(a.text,960,951);if(words.length&&scene.id>=4){c.globalAlpha=.16;c.font=`100px ${serif}`;c.fillStyle=color;c.fillText(visible,960,560)}c.restore()}
export function sceneAt(t,data){const scenes=data.cues?.scenes||[];return scenes.find((s,i)=>t>=s.start&&t<(scenes[i+1]?.start??data.config.duration+.01))||scenes[0]||{id:1,start:0,label:'INIT',state:'NORMAL',color:P.mint}}
export function renderFrame(c,t,resources,data,width=W,height=H){
 c.save();c.setTransform(1,0,0,1,0,0);c.fillStyle=P.black;c.fillRect(0,0,width,height);c.scale(width/W,height/H);
 const s=sceneAt(t,data),local=t-s.start,end=data.cues.scenes[s.id]?.start??data.config.duration,progress=clamp(local/(end-s.start)),e=pulse(data,t),color=s.color||P.mint;
 const shot=Math.floor(local/6.2),variant=shot%3;
 if(s.id===1){
  observatory(c,t,data,color);c.fillStyle='#090C1380';c.fillRect(0,0,W,H);
  if(variant===0)seatedTerminal(c,resources,t,data,1360,1040,760);else character(c,resources,t,1370-progress*100,variant===2?1200:1040,variant===2?1300:1010,variant===2?'calm':'full',.14,ease((t-2.5)/2));
  largeWords(c,'LAST',100,370,164,P.paper);largeWords(c,'SIGNAL',92,520,164,color);
  spaced(c,'SYSTEM TEMPERATURE : NOMINAL',103,578,16,2,color);
  text(c,'世界の終わりを、記録する。',107,631,28,P.white,serif);
  const logs=['INITIALIZING…','OBSERVER: XIAOCHU','STATUS: ONLINE'];logs.forEach((l,i)=>{if(t>i*.9+.2)text(c,l.slice(0,Math.floor((t-i*.9-.2)*25)),107,737+i*33,18,color)});
  if(t<2.73){c.fillStyle=P.black;c.globalAlpha=1-ease((t-1.9)/.8);c.fillRect(0,0,W,H);text(c,'_',137,580,48,color);c.globalAlpha=1}
 }else if(s.id===2){
  grid(c,t,color,.11);glyphTunnel(c,t,color,.5);
  const close=variant===1;character(c,resources,t,close?1405:1190,close?1210:1050,close?1300:960,close?'calm':'full',.35);
  text(c,'01 / DEAD VARIABLES',115,205,18,color);largeWords(c,'RETURN',98,340,116,P.paper);largeWords(c,'NULL',98,466,116,color);
  for(let j=0;j<3;j++){terminal(c,t+j*.1,data,120+j*38,540+j*78,540,230,color,j===2?'RETRY':'OBSERVE')}
  for(let i=0;i<9;i++){const yy=180+i*77;const x=1745+Math.sin(t*.4+i)*18;text(c,`[${i.toString(16).padStart(2,'0')}]`,x,yy,15,color)}
 }else if(s.id===3){
  observatory(c,t,data,P.teal);city(c,t,P.teal,0);character(c,resources,t,variant===1?1350:1230,1100,variant===1?1200:1010,variant===1?'fear':'full',.45);
  c.save();c.globalAlpha=.6;const pts=[];for(let i=0;i<160;i++){const x=90+i*9,yy=800-Math.pow(i/160,2)*(380+e*30)+Math.sin(i*.12+t*1.8)*12;pts.push([x,yy])}path(c,pts,P.orange,3);c.restore();
  largeWords(c,'異常検知',110,330,98,P.paper);text(c,'TEMPERATURE RISING',119,390,25,P.orange);text(c,`${(31+progress*18).toFixed(2)} °C`,110,530,90,P.orange);line(c,107,570,680,570,P.orange,2);text(c,'THRESHOLD / 42.00',112,603,17,P.orange);
 }else if(s.id===4){
  glyphTunnel(c,t,P.orange,1);const beat=Math.floor(local*2.3),word=beat%2?'RETRY':'DELETE';
  for(let j=0;j<5;j++){const z=fract(j/5+local*.12),sz=1+z*.35;c.save();c.translate(960,540);c.rotate((j-2)*.035*Math.sin(local*.5));c.globalAlpha=.12+z*.13;c.strokeStyle=P.orange;c.lineWidth=1;c.strokeRect(-680*sz,-310*sz,1360*sz,620*sz);c.restore()}
  largeWords(c,word,-30+Math.sin(local*1.7)*20,385,225,P.paper);largeWords(c,word,950,890,185,P.orange,Math.PI);
  character(c,resources,t,970+Math.sin(t*.5)*30,1040,965,'full',.8);text(c,`LOOP ${String(beat).padStart(4,'0')}  /  CHECKSUM MISMATCH`,130,925,19,P.orange);
 }else if(s.id===5){
  blackStar(c,1080,485,230+progress*180+e*4,t,P.white,e);particles(c,t,P.white,160,.4);
  if(variant===1){character(c,resources,t,570,1320,1500,'fear',.1);c.fillStyle='#090C1320';c.fillRect(0,0,W,H);circle(c,582,380,160,P.orange,1)}else character(c,resources,t,460,1110,1040,'full',.5);
  text(c,'BLACK STAR',1140,878,36,P.white);text(c,'ABSORPTION / NO EMISSION',1140,915,15,P.white);text(c,'観測不能',98,253,65,P.paper,serif);
  line(c,1050,150,1660,150,P.white);text(c,`α ${((t*.018)%1).toFixed(4)}    δ −04.0021`,1320,130,15,P.white);
 }else if(s.id===6){
  const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#35212B');g.addColorStop(1,P.black);c.fillStyle=g;c.fillRect(0,0,W,H);blackStar(c,1310,320,205,t,P.orange);city(c,t,P.orange,progress*.9);floor(c,t,P.orange);
  if(variant===2){character(c,resources,t,1550,1400,1600,'fear',.55);largeWords(c,'落下',96,605,220,P.paper)}else{character(c,resources,t,1080+Math.sin(local*.1)*180,1080,1000,'full',1.4);for(let i=0;i<4;i++){const tx=160+i*128;['世','界','崩','壊'].forEach((ch,j)=>text(c,ch,tx+(i%2)*120,225+j*155,130,i%2?P.orange:P.paper,serif));break}}
  particles(c,t,P.orange,140,2);text(c,'ALL CHANNELS LOST / CITY SECTOR 07',112,922,18,P.orange);
 }else if(s.id===7){
  c.fillStyle=P.paper;c.fillRect(0,0,W,H);grid(c,t,P.teal,.08);c.save();c.globalAlpha=.3;for(let i=0;i<8;i++)line(c,180+i*250,0,500+i*250,H,P.pink,50);c.restore();
  flower(c,440,495,235,t,P.teal,.7);character(c,resources,t,1310,1180,1290,variant===2?'peace':'sad',.15);
  text(c,'MEMORY / 0001',122,207,18,P.teal);largeWords(c,'STILL',112,396,111,P.teal);largeWords(c,'HERE.',112,515,111,P.teal);text(c,'消せない記録。',123,680,39,P.teal,serif);text(c,'ARCHIVE / SUNLIGHT / WIND / A SMALL FLOWER',124,742,14,P.teal);
  c.save();c.globalAlpha=.35;line(c,930,140,930,900,P.teal);text(c,'PLAYBACK',124,895,15,P.teal);c.restore();
 }else if(s.id===8){
  c.fillStyle='#521C2D';c.fillRect(0,0,W,H);c.fillStyle=P.red;c.beginPath();c.arc(960,520,560+e*12,0,TAU);c.fill();blackStar(c,960,505,340+progress*70,t,P.black,e);
  for(let i=0;i<5;i++){c.save();c.translate(960,520);c.rotate(t*.04+i*.61);c.globalAlpha=.25;line(c,-1300,0,1300,0,P.paper,1);c.restore()}
  glyphTunnel(c,t,P.paper,.9);character(c,resources,t,980,1080,1010,'full',1.8);
  text(c,'THERMAL',90,335,98,P.paper);text(c,'RUNAWAY',88,435,98,P.paper);text(c,'CORE STATUS: CRITICAL',1070,820,29,P.paper);text(c,'RECOVERY FAILED',1070,865,29,P.paper);text(c,'臨界',1555,325,105,P.paper,serif);
  for(let i=0;i<11;i++){const x=85+i*162;c.fillStyle=i<8?P.paper:'#521C2D';c.fillRect(x,949,130,9)}
 }else if(s.id===9){
  glyphTunnel(c,t,P.red,1.7);floor(c,-t,P.red);particles(c,t,P.red,180,3);blackStar(c,980,440,310,t,P.red,e);
  c.save();c.translate(960,540);c.rotate(Math.sin(local*.15)*.08);for(let j=0;j<8;j++){const x=(hash(j)*2200-1100+local*42)%2200;c.globalAlpha=.35;line(c,x,-800,x+200,800,P.red,j%3?1:5)}c.restore();
  character(c,resources,t,980+Math.sin(local*.18)*90,1040+Math.sin(local*.3)*34,1030,'full',2);
  if(variant===1){c.save();c.globalAlpha=.09;character(c,resources,t-.06,1015,1040,1030,'full',2);c.restore()}
  const targetX=1420,targetY=410;circle(c,targetX,targetY,11+Math.sin(t*2)*2,P.mint,2);line(c,1120,570,targetX,targetY,P.mint,.6);text(c,'ONE SIGNAL REMAINS',1160,655,25,P.mint);largeWords(c,'REALITY',70,300,110,P.paper);largeWords(c,'ERROR',70,419,110,P.red);
 }else if(s.id===10){
  particles(c,t,P.white,140,.35);const send=ease((progress-.35)/.3);
  if(progress<.53){observatory(c,t,data,P.teal);if(progress<.29)seatedTerminal(c,resources,t,data,1410,1035,780);else character(c,resources,t,1270,1220,1340,'peace',.1);text(c,'THE LAST MESSAGE',105,290,62,P.paper);terminal(c,t,data,108,420,640,270,P.mint);text(c,'SEND / MEMORY.ARCHIVE',130,743,24,P.mint)}
  else {const x=mix(180,1370,send),y=mix(830,280,send);line(c,170,840,x,y,P.mint,2);circle(c,x,y,5,P.mint,2);flower(c,x,y,ease((progress-.62)/.28)*340,t,P.mint,1-ease((progress-.87)/.13));text(c,'TRANSMISSION',112,300,60,P.paper);text(c,'TO: UNKNOWN',116,350,19,P.mint);text(c,'すべての記憶を、光に。',116,810,32,P.white,serif)}
 }else{
  observatory(c,t,data,P.teal);c.fillStyle=P.black;c.globalAlpha=.66+progress*.34;c.fillRect(0,0,W,H);c.globalAlpha=1;
  const ls=['OBSERVER: XIAOCHU','LAST SIGNAL: SENT','RESPONSE: UNKNOWN'];ls.forEach((l,i)=>{if(local>i*.9)text(c,l,610,480+i*45,27,i===1?P.mint:P.white)});if(progress<.78)text(c,'_',610,645,30,P.mint);
 }
 if(s.id!==7)particles(c,t,color,55,.2);
 // Deliberate tears are confined to a thin band and never invert the whole frame.
 const tearEvents=data.cues.events?.filter(e=>e.type==='tear')||[];for(const ev of tearEvents){const dt=t-ev.time;if(dt>=0&&dt<.14){const yy=220+hash(ev.time)*570;c.fillStyle='#090C1370';c.fillRect(60,yy,1800,16);line(c,60,yy,1860,yy,color,1)}}
 lyrics(c,t,data,color,s);hud(c,t,data,s,s.id===7?P.teal:color);
 // Restrained texture; no random source, flicker, full-screen bloom, or history buffers.
 c.save();c.globalAlpha=.045;c.fillStyle=s.id===7?P.teal:P.white;for(let i=0;i<64;i++)c.fillRect(0,i*17,W,.6);c.restore();
 if(t>data.config.duration-1.25){c.fillStyle=P.black;c.globalAlpha=ease((t-(data.config.duration-1.25))/1.2);c.fillRect(0,0,W,H);c.globalAlpha=1}
 c.restore();
}
