// Scene typography for locally supplied text. Geometry depends only on song time.
//
// Authored material plans follow the Vocaloid 文字PV / JIZURA curation method.
// Layout, entrance, hold, exit and accents are independently chosen per phrase.
// Main words are never dropped by the graphic effects; the text clock stays authoritative.
import {palette as P} from './palette.mjs';
import {signalCorrupt, hash2, quantTime} from './signal_windows.mjs';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n)};
// 阶梯曲线：把连续进度切成离散台阶，动画因此获得逐格跳进的卡顿感。
function stepEase(q,steps){q=clamp(q);const s=Math.max(1,steps|0);return Math.min(1,Math.floor(q*s+1e-9)/Math.max(1,s-1));}
const finite=(n,fallback)=>n!==null&&n!==''&&Number.isFinite(+n)?+n:fallback;
const segmenter=typeof Intl?.Segmenter==='function'?new Intl.Segmenter('ja',{granularity:'grapheme'}):null;
const glyphs=text=>segmenter?[...segmenter.segment(String(text))].map(s=>s.segment):Array.from(String(text));
const layouts=['vertical','orbital','road','poster','split-columns','bezier','ink-reveal'];
const aliases={columns:'vertical',orbit:'orbital',perspective:'road',diagonal:'poster',split:'split-columns',flow:'bezier',quiet:'ink-reveal',handwritten:'ink-reveal'};
const colorRoles={NORMAL:'mint',OBSERVE:'teal',WARNING:'orange',CRITICAL:'red',CORRUPTED:'purple',MEMORY:'pink',VOID:'black',SILENCE:'white',PAPER:'paper'};
const family={serif:'"Noto Serif JP", "Noto Sans SC", "Yu Mincho", serif',sans:'"Noto Sans JP", "Noto Sans SC", sans-serif',cn:'"Noto Sans SC", "Noto Sans JP", sans-serif',mono:'Consolas, monospace'};
const SIGNAL_HZ=15;
const celMaterials=new Set(['register','dispatch','erase','whisper','turn','approach','thermal','refusal','fracture']);
const directionIndex=new WeakMap();
function cuesByLine(cues){
 if(directionIndex.has(cues))return directionIndex.get(cues);
 const index=new Map();
 for(const cue of cues){if(!cue)continue;const key=String(cue.lineId),list=index.get(key)||[];list.push(cue);index.set(key,list)}
 directionIndex.set(cues,index);return index;
}

function seedOf(text){let h=2166136261;for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}return (h>>>0)/4294967296}

// 信号损坏：只在授权窗口内出现。纯时间 + 纯索引求值，同一刻必得同一结果。
function corruptionOf(t,index,seed){
  const level=signalCorrupt(t);
  if(level<=0)return null;
  const step=Math.floor(t*SIGNAL_HZ);
  const h=hash2(index*131+7,step*17+Math.floor(seed*65535));
  const pDrop=.030*level,pRed=.085*level,pTeal=.075*level,pShift=.160*level;
  let top=1;
  if(h>top-pDrop)return{level,drop:true};
  top-=pDrop;
  if(h>top-pRed)return{level,color:P.red};
  top-=pRed;
  if(h>top-pTeal)return{level,color:P.teal};
  top-=pTeal;
  if(h>top-pShift){const k=(h-(top-pShift))/Math.max(1e-6,pShift);return{level,dx:Math.round(k*18-9),dy:Math.round((k-.5)*5)}}
  return{level};
}

function sceneShot(data,t){
 const scenes=data.cues?.scenes||[],shots=data.shots?.shots||[];
 let scene=1;for(const s of scenes){if(s.start>t)break;scene=s.id??scene}
 return {scene,shot:shots.find(s=>t>=s.start&&t<s.end)||{mode:'wide'}};
}
function defaultLayout(index,scene,mode){
 if(mode==='eye')return index%2?'vertical':'ink-reveal';
 if(scene===7)return 'ink-reveal';
 if(scene===10)return index%2?'bezier':'ink-reveal';
 if(mode==='portrait')return ['vertical','poster','split-columns'][index%3];
 if(scene===5)return 'orbital';if(scene===6)return 'road';
 return layouts[index%layouts.length];
}
function plane(value,fallback){return value==='back'||value==='behind'?'back':value==='front'||value==='foreground'?'front':fallback}
function timingRecords(line){
 const text=String(line.text||''),chars=glyphs(text),records=chars.map((text,index)=>({text,index,explicit:false}));
 let cursor=0;
 for(const word of Array.isArray(line.words)?line.words:[]){
  const token=String(word.text||''),position=text.indexOf(token,cursor);if(!token||position<0)continue;
  const start=glyphs(text.slice(0,position)).length,length=glyphs(token).length;
  const explicit=String(word.timing||line.wordTiming||'').startsWith('explicit');
  for(let i=start;i<start+length&&i<records.length;i++)if(explicit&&Number.isFinite(finite(word.time,NaN)))records[i]={...records[i],explicit:true,wordTime:+word.time};
  cursor=position+token.length;
 }
 return records;
}
function selectedRecords(line,range){
 const records=timingRecords(line);if(!range)return records;
 if(!Array.isArray(range)&&range.unit==='word'){
  const words=Array.isArray(line.words)?line.words:[],first=clamp(Math.floor(finite(range.start,0)),0,words.length),last=clamp(Math.floor(finite(range.end,words.length)),first,words.length);
  if(first===last)return [];
  const text=String(line.text||'');let cursor=0,start=-1,end=-1;
  for(let i=0;i<words.length;i++){const token=String(words[i].text||''),position=text.indexOf(token,cursor);if(position<0||!token)continue;if(i===first)start=position;if(i===last-1)end=position+token.length;cursor=position+token.length}
  if(start<0||end<start)return [];
  return records.slice(glyphs(text.slice(0,start)).length,glyphs(text.slice(0,end)).length);
 }
 const first=Array.isArray(range)?range[0]:range.start,last=Array.isArray(range)?range[1]:range.end;
 const from=clamp(Math.floor(finite(first,0)),0,records.length),to=clamp(Math.floor(finite(last,records.length)),from,records.length);
 return records.slice(from,to);
}

// Manual tokenRange arrays are half-open grapheme indices; unit:'word' is explicit.
export function activeLyricCues(data,t){
 if(!Number.isFinite(t)||!Array.isArray(data?.lyrics?.lines))return [];
 const lines=data.lyrics.lines,direction=cuesByLine(Array.isArray(data.lyricDirection?.cues)?data.lyricDirection.cues:[]),active=[];
 lines.forEach((line,index)=>{
  if(!line||!String(line.text||line.translation||'').trim())return;
  const time=finite(line.time,NaN);if(!Number.isFinite(time))return;
  const givenEnd=finite(line.end,NaN),next=Number.isFinite(givenEnd)?null:lines.slice(index+1).find(l=>finite(l?.time,-1)>time);
  const end=Number.isFinite(givenEnd)?givenEnd:finite(next?.time,Math.min(finite(data.config?.duration,time+4),time+4));
  if(end<=time)return;
  const lineId=String(line.id??`L${String(index+1).padStart(3,'0')}`),manual=direction.get(lineId)||[];
  const candidates=manual.length?manual:[{}];
  candidates.forEach((cue,cueIndex)=>{
   const start=finite(cue.start,time),stop=finite(cue.end,end);if(t<start||t>=stop||stop<=start)return;
   const translated=cue.field==='translation',sourceLine=translated?{...line,text:String(line.translation||''),words:line.translationWords||[],wordTiming:line.translationWordTiming||'unspecified'}:line;
   const records=selectedRecords(sourceLine,cue.tokenRange);if(!records.length)return;
   const {scene,shot}=sceneShot(data,start),chosen=aliases[cue.layout]||cue.layout||defaultLayout(index,scene,shot.mode),layout=layouts.includes(chosen)?chosen:'ink-reveal';
   const back=['vertical','orbital','road'].includes(layout),eye=shot.mode==='eye';
   const mainSize=eye?48:layout==='poster'?104:layout==='orbital'?47:58,baseAnchor=eye?[112,230]:layout==='orbital'?[850,530]:layout==='bezier'?[140,650]:[135,250];
   const translationAnchor=layout==='vertical'?[baseAnchor[0]+mainSize*1.7,baseAnchor[1]]:layout==='poster'?[baseAnchor[0]+12,baseAnchor[1]+Math.ceil(glyphs(String(line.text||'')).length/7)*mainSize*1.15+30]:[baseAnchor[0]+12,baseAnchor[1]+mainSize*1.5];
   const material=cue.semantic?.material,total=records.length,life=stop-start,seed=seedOf(lineId);
   // Short refrains land whole; longer lines reveal at most the opening fraction.
   const span=material?(cue.hardCut?0:Math.min(material==='translation'?.10:.24,life*.22)):Math.min(.62,life*.42);
   const level=material?signalCorrupt(t):0;
   records.forEach((record,i)=>{
    record.decode=i;
    record.decodeAt=start+(total<=1?0:(i/Math.max(1,total-1))*span);
    record.corrupt=material?(level?{level}:null):corruptionOf(t,i,seed);
    record.live=(!record.explicit||t>=record.wordTime)&&t>=record.decodeAt&&!(record.corrupt&&record.corrupt.drop);
   });
   const resolvedText=records.map(r=>r.text).join(''),tokens=records.map(record=>({...record,time:record.wordTime,visible:record.live}));
   active.push({...cue,id:String(cue.id??`${lineId}:${cueIndex+1}`),lineId,lineIndex:index,
    text:resolvedText,resolvedText,visibleText:tokens.filter(token=>token.visible).map(token=>token.text).join(''),tokens,field:translated?'translation':'text',fullText:String(sourceLine.text),records,start,end:stop,
    plane:plane(cue.plane,back?'back':'front'),layout,scene,mode:shot.mode,
    anchor:cue.anchor??(translated?translationAnchor:baseAnchor),
    safeArea:cue.safeArea??(eye?[80,165,360,730]:[105,155,755,760]),
    size:clamp(finite(cue.size,mainSize*(translated?.43:1)),18,220),
    font:cue.font||'serif',colorRole:cue.colorRole||(scene===7?'OBSERVE':'PAPER'),
    enter:cue.enter??{duration:.5},exit:cue.exit??{duration:.35},
    semantic:cue.semantic&&typeof cue.semantic==='object'?cue.semantic:{label:cue.semantic||''},
    wordTiming:sourceLine.wordTiming||'unspecified',endTiming:Number.isFinite(givenEnd)?(line.endTiming||'provided'):(next?'next-line':'fallback-estimated'),manual:!!manual.length,
   });
  });
 });
 return active;
}

function anchorOf(cue){
 let a=cue.anchor;if(a&&typeof a==='object'&&!Array.isArray(a))a=[a.x,a.y];
 if(!Array.isArray(a))a=cue.layout==='orbital'?[850,530]:[135,250];
 const x=finite(a[0],135),y=finite(a[1],250);return Math.abs(x)<=1.5&&Math.abs(y)<=1.5?[x*1920,y*1080]:[x,y];
}
function fontOf(cue,size=cue.size){
 const font=family[cue.font]||String(cue.font).replace(/[;{}]/g,'');return `${cue.layout==='poster'?'700 ':''}${size}px ${font}`;
}
function ink(cue){return P[colorRoles[cue.colorRole]||cue.colorRole]||P.paper}
function metrics(c,resources,font,text){
 resources.lyricArtCache??=new Map();const cache=resources.lyricArtCache,key=`${font}\u0000${text}`;
 if(cache.has(key)){const width=cache.get(key);cache.delete(key);cache.set(key,width);return width}
 c.font=font;const width=c.measureText(text).width;cache.set(key,width);while(cache.size>512)cache.delete(cache.keys().next().value);return width;
}
function duration(value,fallback){return clamp(finite(typeof value==='object'?value?.duration:undefined,fallback),.08,2)}
// 入场与退场都锁在信号时钟上，并切成离散台阶：淡入淡出不再连续滑动。
function stateAt(cue,t){
 const life=cue.end-cue.start,entrance=Math.min(duration(cue.enter,.5),life*.32),exit=Math.min(duration(cue.exit,.35),life*.25);
 const material=cue.semantic.material;
 if(material){
  const rawAge=Math.max(0,t-cue.start),age=celMaterials.has(material)?quantTime(rawAge,30):rawAge;
  const enter=celMaterials.has(material)?stepEase(age/entrance,8):smooth(age/entrance);
  const decay=smooth((cue.end-t)/exit),impactAt=finite(cue.semantic.impactAt,NaN),ageOfImpact=t-impactAt;
  const pulse=ageOfImpact>=0&&ageOfImpact<.17?(1-ageOfImpact/.17)**2:0;
  return {material,age,enter,exit:decay,entrance,exitSeconds:exit,phase:clamp(rawAge/life),
   pressure:clamp(finite(cue.semantic.pressure,0)),pulse,accent:P[cue.semantic.accent]||P.mint,seed:seedOf(cue.lineId)};
 }
 const clock=quantTime(t,SIGNAL_HZ),age=clock-cue.start;
 return {age,enter:stepEase(age/entrance,8),exit:stepEase((cue.end-clock)/exit,5),entrance,exitSeconds:exit};
}
// 词命中强调：改成硬切，不再用连续衰减。
function charStyle(c,t,cue,record,color){
 const dt=t-record.wordTime;
 const hit=record.explicit&&Number.isFinite(dt)&&dt>=0&&dt<.42?Math.max(0,1-Math.floor(dt/.07)/6):0;
 const corrupt=record.corrupt||{};
 c.fillStyle=corrupt.color||(hit>.5?(cue.scene===7?P.teal:P.mint):color);return hit;
}
// 记录这块文字实际占据的范围，用于绘制终端装饰。
function markBox(s,x,y,size,advance){
 const w=advance??size;
 if(!s.box){s.box={x:x-w*.5,y:y-size*.95,r:x+w,b:y+size*.32};return}
 s.box.x=Math.min(s.box.x,x-w*.5);s.box.y=Math.min(s.box.y,y-size*.95);
 s.box.r=Math.max(s.box.r,x+w);s.box.b=Math.max(s.box.b,y+size*.32);
}
function drawGlyph(c,t,cue,record,s,x,y,size,color,angle=0,scaleX=1){
 if(!record.live)return;
 const corrupt=record.corrupt||{};
 // 全角字按一个字宽估算，半角按 0.58 个字宽，装饰框才不会压住最后一个字。
 const advance=size*(/[\u3000-\u9fff\u3040-\u30ff\uff00-\uffef]/.test(record.text)?1:.58);
 markBox(s,x,y,size,advance);
 const hit=charStyle(c,t,cue,record,color);
 if(s.material){
  const arriving=1-s.enter,leaving=(1-s.exit)*(cue.hardCut?.24:1),i=record.index,polarity=i%2?1:-1;
  switch(s.material){
   case 'register': x+=arriving*(i%3)*7;y+=arriving*polarity*17;break;
   case 'dispatch': x+=arriving*-31+leaving*24;break;
   case 'filament': x+=arriving*polarity*17;y-=arriving*42;angle+=polarity*arriving*.13;break;
   case 'erase': y+=arriving*polarity*18;scaleX*=1-.11*arriving;break;
   case 'whisper': y+=Math.sin(i*1.31)*arriving*18;scaleX*=.92+.08*s.enter;break;
   case 'turn': x+=arriving*polarity*27;scaleX*=.81+.19*s.enter;break;
   case 'fracture': x+=polarity*(arriving*20+leaving*32);y+=leaving*(18+i%4*8);angle+=polarity*leaving*.12;break;
   case 'thermal': case 'refusal': x+=polarity*(arriving*12+s.pulse*15);y+=arriving*(i%3-1)*29;angle+=s.pulse*polarity*.045;break;
   case 'tidal': y+=Math.sin(s.age*1.6+i*.49)*5+arriving*23;break;
   case 'trace': case 'thread': x-=arriving*26;y+=arriving*(i%3)*10;break;
   case 'silt': case 'crystal': y+=-arriving*(22+i%3*10)+leaving*(15+i%4*8);break;
  }
  const key=cue.semantic.keyRange;
  if(Array.isArray(key)&&record.index>=key[0]&&record.index<key[1]&&cue.colorRole!=='teal'){
   if(['thermal','refusal','ember','filament'].includes(s.material))c.fillStyle='#FFE3B8';
  }
 }
 c.save();c.translate(x+(corrupt.dx||0),y+(corrupt.dy||0));c.rotate(angle);
 const pop=1+hit*.05;c.scale(scaleX*pop,pop);c.font=fontOf(cue,size);c.lineJoin='round';
 // 硬边套印偏移：把柔和光晕换成印刷式的错位暗影，贴合终端排版。
 c.save();c.globalAlpha*=s.contrast?.96:s.material?.81:.40;c.strokeStyle='#04060A';c.lineWidth=Math.max(1.2,size*(s.contrast?.102:s.material?.065:.052));
 c.strokeText(record.text,size*.022,size*.026);c.restore();
 const accentGhost=s.material&&['erase','thermal','refusal','fracture','filament'].includes(s.material)?
  Math.min(.57,(1-s.enter)*.44+s.pulse*.56+(corrupt.level||0)*.10):0;
 if(accentGhost>.015){
  c.save();c.globalAlpha*=accentGhost;c.strokeStyle=s.accent;c.lineWidth=Math.max(1.1,size*.022);
  c.strokeText(record.text,(-1+(record.index%2)*2)*size*.19,-size*.10);
  c.strokeText(record.text,size*.10,size*.09);c.restore();
 }
 if(corrupt.level>0&&!s.material){
  // 色散边只出现在被授权的窗口内，与崩坏后期共用同一张时间表。
  // 描边必须比字画细，否则中文细笔画会被红青色糊成一团。
  c.save();c.globalAlpha*=.55;c.lineWidth=Math.max(.8,size*.016);
  c.strokeStyle=P.red;c.strokeText(record.text,-size*.013,0);
  c.strokeStyle=P.teal;c.strokeText(record.text,size*.013,0);c.restore();
 }else{
  c.save();c.globalAlpha*=.75;c.strokeStyle=cue.scene===7||cue.colorRole==='black'||cue.colorRole==='teal'?P.paper:'#04060A';
  c.lineWidth=Math.max(.8,size*.026);c.strokeText(record.text,0,0);c.restore();
 }
 c.fillText(record.text,0,0);c.restore();
}
function rowsOf(records,count){const rows=[];for(let i=0;i<records.length;i+=count)rows.push(records.slice(i,i+count));return rows}
function widthOf(c,r,cue,records,size){const font=fontOf(cue,size);return records.reduce((sum,a)=>sum+metrics(c,r,font,a.text),0)}

function vertical(c,t,r,cue,s,color){
 const [x,y]=anchorOf(cue),maxRows=clamp(Math.round(finite(cue.semantic.rows,8)),3,18),columns=Math.ceil(cue.records.length/maxRows),size=Math.min(cue.size,cue.safeArea[3]/(Math.min(maxRows,cue.records.length)*1.14),cue.safeArea[2]/(columns*1.4));
 cue.records.forEach((record,i)=>{const row=i%maxRows,col=Math.floor(i/maxRows),delay=(row+col*.7)/Math.max(1,maxRows+columns)*.18,q=cue.hardCut?s.enter:stepEase((s.age-delay)/Math.max(.08,s.entrance-.18),6);drawGlyph(c,t,cue,record,s,x+(columns-1-col)*size*1.4,y+row*size*1.14+(1-q)*-65,size,color,(1-q)*.09)});
}
function orbital(c,t,r,cue,s,color){
 const [x,y]=anchorOf(cue),rows=rowsOf(cue.records,s.material?10:16),size=Math.min(cue.size,s.material?76:rows.length>3?33:48),sweep=clamp(finite(cue.semantic.sweep,2.15),.8,3);
 rows.forEach((row,j)=>{
  const radius=clamp(finite(cue.semantic.radius,230),100,440)+j*size*1.16,width=widthOf(c,r,cue,row,size),fit=Math.min(1,radius*sweep/Math.max(1,width));let used=0;
  row.forEach(record=>{const w=metrics(c,r,fontOf(cue,size),record.text)*fit,fraction=(used+w/2)/Math.max(width*fit,1),lower=cue.semantic.side==='lower',
   sweepMove=s.material?(1-s.enter)*.16:0,a=(lower?Math.PI/2+sweep/2-fraction*sweep:-Math.PI/2-sweep/2+fraction*sweep)+sweepMove,rr=radius+(1-s.enter)*(s.material?64:90);
   drawGlyph(c,t,cue,record,s,x+Math.cos(a)*rr,y+Math.sin(a)*rr,size,color,(lower?a-Math.PI/2:a+Math.PI/2)+(1-s.enter)*-.28,fit);used+=w});
 });
}
function road(c,t,r,cue,s,color){
 const [x,y]=anchorOf(cue),rows=rowsOf(cue.records,14),size=Math.min(cue.size,86,Math.max(150,970-y-380)/Math.max(1,rows.length)/1.25);
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 rows.forEach((row,j)=>{
  const tx=x+(1-s.enter)*-100+j*28,ty=y+380+j*size*1.13;
  const width=widthOf(c,r,cue,row,size),rise=s.material?-.105:-.18,fit=Math.min(1,(s.material?finite(cue.semantic.width,830):760)/Math.max(1,width));let xx=0;
  c.save();c.translate(tx,ty);c.transform(1,rise,s.material?-.29:-.46,s.material?.83:.66,0,0);
  row.forEach(record=>{drawGlyph(c,t,cue,record,s,xx,0,size,color,0,fit);xx+=metrics(c,r,fontOf(cue,size),record.text)*fit});c.restore();
  const end=tx+xx;
  minX=Math.min(minX,tx);maxX=Math.max(maxX,end);minY=Math.min(minY,ty+rise*xx);maxY=Math.max(maxY,ty);
 });
 // 透视平面：装饰框换算回世界坐标。
 if(Number.isFinite(minX))s.box={x:minX,y:minY,r:maxX,b:maxY};
}
function poster(c,t,r,cue,s,color){
 const [x,y]=anchorOf(cue),columns=clamp(Math.round(finite(cue.semantic.columns,cue.mode==='eye'?4:7)),2,20),rows=rowsOf(cue.records,columns),size=Math.min(cue.size,cue.safeArea[3]/(rows.length*1.12),cue.safeArea[2]/(columns*1.02));
 const rotation=finite(cue.semantic.rotation,-.065);
 c.save();c.translate(x,y);c.rotate(rotation);
 rows.forEach((row,j)=>{let xx=(j%2)*size*.35;row.forEach((record,k)=>{const q=cue.hardCut?s.enter:stepEase((s.age-(j*.035+k*.018))/Math.max(.12,s.entrance-.12),6),snap=Math.floor(q*5)/5;drawGlyph(c,t,cue,record,s,xx+(1-snap)*100,j*size*1.12+(1-q)*60,size,color,(1-q)*-.16);xx+=metrics(c,r,fontOf(cue,size),record.text)})});
 // 海报整体有旋转，装饰框换算回世界坐标再算外接矩形。
 if(s.box){const b=s.box,cos=Math.cos(rotation),sin=Math.sin(rotation),corners=[[b.x,b.y],[b.r,b.y],[b.x,b.b],[b.r,b.b]].map(([px,py])=>[x+px*cos-py*sin,y+px*sin+py*cos]);
  s.box={x:Math.min(...corners.map(p=>p[0])),y:Math.min(...corners.map(p=>p[1])),r:Math.max(...corners.map(p=>p[0])),b:Math.max(...corners.map(p=>p[1]))};}
 c.restore();
}
function splitColumns(c,t,r,cue,s,color){
 const [x,y]=anchorOf(cue),half=Math.ceil(cue.records.length/2),parts=[cue.records.slice(0,half),cue.records.slice(half)],width=Math.min(cue.safeArea[2],finite(cue.semantic.width,660)),size=Math.min(cue.size,width/7.2),column=width/2+18;
 parts.forEach((part,j)=>{const rows=rowsOf(part,Math.max(2,Math.floor((width/2-24)/size))),q=cue.hardCut?s.enter:stepEase((s.age-j*.12)/Math.max(.12,s.entrance-.12),6);rows.forEach((row,k)=>{let xx=x+j*column+(1-q)*(j?95:-95);row.forEach(record=>{drawGlyph(c,t,cue,record,s,xx,y+j*size*1.4+k*size*1.25,size,color);xx+=metrics(c,r,fontOf(cue,size),record.text)})})});
 c.save();c.globalAlpha*=.35*s.enter;c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(x+column-24,y-size*.7);c.lineTo(x+column-24,y+Math.min(560,Math.ceil(half/4)*size*1.25));c.stroke();c.restore();
}
function bezierPoint(points,u){const v=1-u;return [v*v*v*points[0][0]+3*v*v*u*points[1][0]+3*v*u*u*points[2][0]+u*u*u*points[3][0],v*v*v*points[0][1]+3*v*v*u*points[1][1]+3*v*u*u*points[2][1]+u*u*u*points[3][1]]}
function flowing(c,t,r,cue,s,color){
 const [x,y]=anchorOf(cue),custom=cue.semantic.path,points=Array.isArray(custom)&&custom.length===4&&custom.every(p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite))?custom:[[x,y],[x+480,y+130],[x+70,y-400],[x+650,y-370]],rows=rowsOf(cue.records,20),size=Math.min(cue.size,54);
 const table=[{u:0,length:0,point:bezierPoint(points,0)}];for(let i=1;i<=48;i++){const point=bezierPoint(points,i/48),prev=table[i-1];table.push({u:i/48,length:prev.length+Math.hypot(point[0]-prev.point[0],point[1]-prev.point[1]),point})}const length=table.at(-1).length;
 rows.forEach((row,j)=>{const width=widthOf(c,r,cue,row,size),fit=Math.min(1,length*.92/Math.max(1,width));let distance=length*.04;
  row.forEach(record=>{const w=metrics(c,r,fontOf(cue,size),record.text)*fit,target=s.material?clamp(distance+w/2-(1-s.enter)*length*.025,0,length):(distance+w/2)*s.enter,entry=table.findIndex(p=>p.length>=target),b=table[Math.max(1,entry)],a=table[Math.max(0,entry-1)],u=a.u+(b.u-a.u)*clamp((target-a.length)/Math.max(.001,b.length-a.length)),point=bezierPoint(points,u),next=bezierPoint(points,Math.min(1,u+.003)),angle=clamp(Math.atan2(next[1]-point[1],next[0]-point[0]),-.65,.65);drawGlyph(c,t,cue,record,s,point[0],point[1]+j*size*1.2,size,color,angle,fit);distance+=w});
 });
}
function inkReveal(c,t,r,cue,s,color){
 const [x,y]=anchorOf(cue),width=finite(cue.semantic.width,cue.mode==='eye'?330:710),perRow=Math.max(3,Math.floor(width/cue.size)),rows=rowsOf(cue.records,perRow),size=Math.min(cue.size,cue.safeArea[3]/Math.max(1,rows.length)/1.3);
 rows.forEach((row,j)=>{const rowWidth=widthOf(c,r,cue,row,size),fit=Math.min(1,width/Math.max(1,rowWidth)),baseline=y+j*size*1.32;c.save();if(!s.material){c.beginPath();c.rect(x-4,baseline-size*1.3,(rowWidth*fit+8)*(cue.hardCut?1:s.enter),size*1.6);c.clip()}let xx=x;row.forEach(record=>{drawGlyph(c,t,cue,record,s,xx,baseline,size,color,0,fit);xx+=metrics(c,r,fontOf(cue,size),record.text)*fit});c.restore();
  if(s.material)return;
  const length=rowWidth*fit*s.enter;c.save();c.strokeStyle=color;c.lineWidth=Math.max(1,size*.018);c.globalAlpha*=.4;c.beginPath();c.moveTo(x,baseline+size*.17);c.bezierCurveTo(x+length*.3,baseline+size*.22,x+length*.7,baseline+size*.08,x+length,baseline+size*.14);c.stroke();c.restore();
 });
}
const painters={vertical,orbital,road,poster,'split-columns':splitColumns,bezier:flowing,'ink-reveal':inkReveal};

// 终端装饰：四角括号 + 解码进度条。全部用矩形绘制，不追加任何文字。
function furniture(c,cue,s,color){
 const box=s.box;if(!box)return;
 const base=c.globalAlpha;
 const pad=13,arm=Math.min(26,Math.max(10,Math.min(box.r-box.x,box.b-box.y)*.16)),th=Math.max(1.4,2);
 const x=Math.max(26,box.x-pad),y=Math.max(22,box.y-pad),r=Math.min(1894,box.r+pad),b=Math.min(1058,box.b+pad);
 c.save();c.fillStyle=color;
 c.globalAlpha=base*.30;
 [[x,y,1,1],[r,y,-1,1],[x,b,1,-1],[r,b,-1,-1]].forEach(([cx,cy,sx,sy])=>{
  c.fillRect(sx>0?cx:cx-arm,cy,arm,th);
  c.fillRect(sx>0?cx:cx-th,cy,th,arm);
 });
 const stripY=b+9,stripW=Math.max(60,(r-x)*.82),stripX=x,total=Math.max(1,cue.tokens.length),decoded=cue.tokens.filter(token=>token.visible).length;
 // 解码缓冲：每一格对应一个字，已解码的格子点亮，进度直接可读。
 const cells=Math.min(total,40),gap=Math.min(3,stripW/cells*.22),cellW=Math.max(1,(stripW-gap*(cells-1))/cells);
 c.globalAlpha=base*.18;c.fillRect(stripX,stripY,stripW,1);
 for(let i=0;i<cells;i++){
  const on=i<Math.round(decoded/total*cells);
  c.globalAlpha=on?base*.80:base*.14;
  c.fillRect(stripX+i*(cellW+gap),stripY-1.5,cellW,3);
 }
 c.globalAlpha=base*.20;for(let i=0;i<=4;i++)c.fillRect(stripX+stripW*i/4,stripY+4,1,4);
 c.restore();c.globalAlpha=base;
}

// Small marks share the same physical vocabulary as the words, instead of
// stamping a terminal frame on a sky, eye, or memory shot.
function materialMark(c,cue,s){
 const box=s.box;if(!box||cue.semantic.decorative)return;
 if(s.material==='register'){furniture(c,cue,s,s.accent);return}
 const x=clamp(box.x,112,1780),y=clamp(box.y,136,925),r=clamp(box.r,x+12,1795),b=clamp(box.b,y+10,968),
  w=r-x,base=c.globalAlpha,arriving=1-s.enter;
 const rule=(a,f,g,h)=>{c.beginPath();c.moveTo(a,f);c.lineTo(g,h);c.stroke()};
 c.save();c.strokeStyle=s.accent;c.fillStyle=s.accent;c.lineWidth=1.6;
 c.globalAlpha=base*.49;
 switch(s.material){
  case 'translation': c.lineWidth=1.25;rule(x-8,y+4,x-8,Math.min(b,y+24));break;
  case 'dispatch':
   rule(x,b+13,x+w*s.enter,b+13);rule(x+w*s.enter,b+13,x+w*s.enter+22,b-1);
   c.fillRect(x+w*s.enter-2,b+10,5,6);break;
  case 'erase': {
   const sweep=smooth((s.phase-.55)/.45);
   c.globalAlpha=base*(.24+.34*sweep);rule(x-12,b+12,r+8,b+12);
   if(sweep>0){c.globalAlpha=base*sweep*.34;rule(x-6,(y+b)*.51,x+w*sweep,(y+b)*.51)}
   const steps=1+(cue.semantic.repeatIndex||0);
   c.globalAlpha=base*.31;
   for(let i=0;i<steps;i++)c.fillRect(x+i*13,b+27,8,2.7);
   break;
  }
  case 'approach': case 'turn':
   for(let i=0;i<3;i++){const cx=x-15-i*(11+s.pressure*4),cy=y+(b-y)*.53+arriving*12;
    c.beginPath();c.moveTo(cx-10,cy-10);c.lineTo(cx,cy);c.lineTo(cx-10,cy+10);c.stroke()}
   rule(x,b+13,x+Math.min(w,72+s.pressure*170),b+13);break;
  case 'thermal': case 'refusal': case 'filament': {
   c.globalAlpha=base*(.35+.42*s.pulse);c.lineWidth=2.25;
   c.beginPath();c.moveTo(x,b+20);c.lineTo(x+w*.27,b+20);c.lineTo(x+w*.37,b+10-s.pulse*22);
   c.lineTo(x+w*.43,b+30);c.lineTo(x+w*.50,b+20);c.lineTo(r,b+20);c.stroke();
   for(let i=0;i<5;i++){const off=(i%2?1:-1)*s.pulse*24;c.fillRect(x+w*(.1+i*.17)+off,b+31,6+i*1.2,2)}
   break;
  }
  case 'whisper':
   c.globalAlpha=base*.32;rule(x-4,b+11,x+w*.29,b+11);rule(x+w*.68,y-8,r,y-8);break;
  case 'fracture': case 'ember':
   c.beginPath();c.moveTo(x,b+11);c.lineTo(x+w*.34,b+11);c.lineTo(x+w*.42,b+4);
   c.moveTo(x+w*.47,b+15);c.lineTo(x+w*.59,b+9);c.lineTo(r,b+9);c.stroke();break;
  case 'silt': case 'crystal':
   for(let i=0;i<11;i++){
    const z=(s.age*.75+hash2(i,Math.floor(s.seed*65535)))%1,cx=x+w*hash2(i,173),cy=b+10+z*48;
    c.globalAlpha=base*.46*Math.sin(z*Math.PI);
    if(s.material==='crystal'&&i%3===0){c.beginPath();c.moveTo(cx,cy-3.8);c.lineTo(cx+3.1,cy);c.lineTo(cx,cy+3.8);c.lineTo(cx-3.1,cy);c.closePath();c.stroke()}
    else c.fillRect(cx,cy,1.8,1.8);
   }break;
  case 'tidal': case 'trace': case 'thread': case 'eclipse': break; // their own motif paths carry the decoration
 }
 c.restore();
}

export function drawLyricArt(c,t,resources,data,whichPlane='front'){
 if(!c||!resources)return 0;const cues=activeLyricCues(data,t).filter(cue=>cue.plane===plane(whichPlane,'front'));let count=0;
 for(const cue of cues){const s=stateAt(cue,t);s.box=null;s.contrast=cue.plane==='front'&&resources.lyricContrast;c.save();try{
  c.globalAlpha*=(cue.hardCut?1:s.material?(.38+.62*s.enter)*s.exit:s.enter*s.exit)*clamp(finite(cue.opacity,cue.plane==='back'?.84:1));c.textAlign='left';c.textBaseline='alphabetic';
  if(s.material&&s.material!=='translation'){
   const [ax,ay]=anchorOf(cue),q=1-s.enter;
   if(s.material==='approach'){
    const scale=1-q*(.22+.14*s.pressure);c.translate(ax+q*50,ay-q*18);c.scale(scale,scale);c.translate(-ax,-ay);
   }else if(s.material==='thermal'||s.material==='refusal'){
    const scale=1+.075*q+.039*s.pulse;c.translate(ax,ay);c.scale(scale,scale);c.translate(-ax,-ay);
   }else if(s.material==='dispatch'){c.translate(q*-35,0)}
  }
  const enterType=typeof cue.enter==='string'?cue.enter:cue.enter?.type;
  if(enterType==='rise')c.translate(0,(1-s.enter)*70);else if(enterType==='fall')c.translate(0,-(1-s.enter)*70);else if(enterType==='slide')c.translate(-(1-s.enter)*80,0);
  else if(enterType==='slam'){const [x,y]=anchorOf(cue);c.translate(x,y);c.scale(1+(1-s.enter)*.16,1+(1-s.enter)*.16);c.translate(-x,-y)}
  const exitType=typeof cue.exit==='string'?cue.exit:cue.exit?.type;
  if(exitType==='rise')c.translate(0,-(1-s.exit)*35);else if(exitType==='fall')c.translate(0,(1-s.exit)*35);
  painters[cue.layout](c,t,resources,cue,s,ink(cue));
  if(plane(whichPlane,'front')==='front'){if(s.material)materialMark(c,cue,s);else furniture(c,cue,s,ink(cue))}
  count++;
 }finally{c.restore()}}
 return count;
}
