import {renderFrame,sceneAt,shotAt,clamp} from './film.mjs';
import {glitchToggle} from './glitch.mjs';
const $=id=>document.getElementById(id), film=$('film'),ctx=film.getContext('2d'),audio=$('audio');
const read=path=>fetch(path).then(r=>{if(!r.ok)throw Error(`加载失败 ${path}`);return r.json()});
const query=new URLSearchParams(location.search),requestedVersion=query.get('v');
const version=requestedVersion==='21'?'20':requestedVersion;
const v33=version==='33',v32=v33||version==='32',v31=v32||version==='31',v30=v31||version==='30',v29=v30||version==='29',v28=v29||version==='28',v27=v28||version==='27',v26=v27||version==='26',v25=v26||version==='25',v24=v25||version==='24',v23=v24||version==='23',v22=v23||version==='22',v20=v22||version==='20',v19=v20||version==='19',v18=v19||version==='18',v17=v18||version==='17',v16=v17||version==='16',exporting=query.get('export')==='1';
const AUDIO_HINT='未找到音源：请把音频放到 assets/audio/song.m4a，或用「替换本地音源」载入。';
let audioMissing=false;
audio.addEventListener('error',()=>{audioMissing=true;$('status').textContent=AUDIO_HINT});
const [config,features,cues,lyrics,baseShots,lyricDirection,sceneLayers,jizuraDirection]=await Promise.all([
 read('./config.json'),read('./data/audio_features.json'),read('./data/cues.json'),
 read('./data/lyrics.json').catch(()=>({lines:[]})),read('./data/shots.json'),
 read('./data/lyric_direction.json').catch(()=>({cues:[]})),read('./data/scene_layers.json'),
 read('./data/jizura_direction.json').catch(()=>({lines:[]})).then(d=>d.lines&&d.lines.length?d:{lines:[],plans:{},interludes:[]}),
]);
const data={config,features,cues,lyrics,shots:baseShots,lyricDirection,sceneLayers,jizuraDirection};
if(v16){
 const [{applyV16Edit},cold,climax]=await Promise.all([
  import('./v16_edit.mjs'),read('./data/v16_cold_shots.json'),read('./data/v16_climax_shots.json'),
 ]);
 applyV16Edit(data,cold,climax);
 $('edition').textContent=`XIAOCHU — LAST OBSERVATORY / V${version}`;
}
if(v17){
 const [{applyV17Edit},front]=await Promise.all([import('./v17_edit.mjs'),read('./data/v17_front_shots.json')]);
 applyV17Edit(data,front);
}
if(v18){
 const [{applyV18Edit},edit]=await Promise.all([import('./v18_edit.mjs'),read('./data/v18_shots.json')]);
 applyV18Edit(data,edit);
}
if(v19)data.v19=true;
if(v20){
 const [{applyV20Edit},edit]=await Promise.all([import('./v20_edit.mjs'),read('./data/v20_finale_shots.json')]);
 applyV20Edit(data,edit);
}
const shots=data.shots,resources={rigData:config.rigs,gradeMap:config.fxAssets};
if(v22){
 const [rhythm,{drawV22Glitch}]=await Promise.all([read('./data/v22_rhythm.json'),import('./v22_glitch.mjs')]);
 data.v22=true;
 data.v22Rhythm=rhythm;
 resources.beatGlitch=drawV22Glitch;
}
if(v23){
 const {drawV23FirstImpact}=await import('./v23_first_impact.mjs');
 data.v23=true;
 resources.firstImpact=drawV23FirstImpact;
}
if(v24){
 const {applyV24Finale}=await import('./v24_finale.mjs');
 applyV24Finale(data);
}
if(v25)data.v25=true;
if(v29)data.v29=true;
if(v30)data.v30=true;
if(v31)data.v31=true;
if(v32)data.v32=true;
if(v33)data.v33=true;
if(v17){
 const [effects,space,reactor,archive,city,server,impact]=await Promise.all([
  import('./v17_front_fx.mjs'),import('./v17_space.mjs'),import('./v17_reactor_3d.mjs'),
  import('./v17_archive_3d.mjs'),v19?import('./v19_city_3d.mjs'):v18?import('./v18_city_3d.mjs'):null,
  v19?import('./v19_server_3d.mjs'):null,
  v25?import('./v25_impact_3d.mjs'):null,
 ]);
 resources.frontEffects=effects.drawFrontEffects;
 resources.frontSpace=space.drawV17SpaceFactory({
  reactor:()=>reactor.createReactorRoom({detail:v18}),
  archive:()=>archive.createArchiveRoom({detail:v18}),
  city:v19?()=>city.createV19CityRoom({detail:v20,finishedWindows:v25,damageGrades:v26,structuralDamage:v27,smoke:v28}):city?.createCityRoom,
  server:v19?()=>server.createServerRoom({detail:v20,continuousPacket:v29}):undefined,
  impact:v25?()=>impact.createV25ImpactRoom({damage:v26?2:0,structuralDamage:v27,smoke:v28}):undefined,
 },{detail:v18});
}
const wantsJizura=v16||query.get('jizura')==='1';
const hasJizuraInputs=lyrics.lines.length>0&&jizuraDirection.lines.length>0;
if(wantsJizura&&!hasJizuraInputs&&exporting){
 throw Error('导出 JIZURA 版本需要 data/lyrics.json 和 data/jizura_direction.json。');
}
if(wantsJizura&&hasJizuraInputs){
 const {createJizuraLayer}=await import('./jizura_layer.mjs');
 const jizura=await createJizuraLayer(data);resources.jizuraDraw=jizura.draw;resources.finaleReadingAt=jizura.finaleReadingAt;window.JIZURA_INFO=jizura.info;window.JIZURA_LRC=jizura.lrc;
}
const characterFxCues=cues.characterFx||[];
const reviews=[['消去循环 · 中量崩坏',9,1.2],['临近循环 · 中量崩坏',23,1.2],['低语循环 · 中量崩坏',37,1.2],['黑星循环Ⅰ · 中量崩坏',50,1.2],['背向循环 · 中量崩坏',71,1.2],['黑星循环Ⅱ · 中量崩坏',83,1.2],['终章循环 · 中量崩坏',118,1.2],['道路透视',33],['眼部竖排',65],['盐晶与泪',68],['鱼群海面',80],['燕迹与云',98],['掌心曲线',104],['热异常',107],['现实裂解 · 高潮崩坏',109]];
const sceneReviews=[['消去 · 眼部刻印',31.35],['燃旗 · 街道落点',47.8],['黑星 · 轨道字',63.1],['归海 · 城市远景',190.6],[v20?'燕迹 · 红云压城':'燕迹 · 窗边记忆',195.8],['热异常 · 核心断版',214.5]];
if(v16)sceneReviews.unshift(['冷色过渡 · 潜入档案',134.8],['冷色过渡 · 黑星与信号',148],['终章 · 对拍剪辑',199.47],['终章 · 核心熔毁',212.7]);
if(v17)sceneReviews.unshift(['前段 · 终端扫光',5.7],['前段 · 温度警报',25.65],['前段 · 删除循环',32.2],['前段 · 黑星引力',64.2],['冷色段 · 立体下潜',146.8],['高潮 · 立体反应堆',213.05]);
if(v18)sceneReviews.unshift(['V18 · 废城街道',48],['V18 · 黑星城上空',63.8],['V18 · 窗边长镜',96],['V18 · 临界城市',217.7],['V18 · 最后的城市灯光',234.1]);
if(v19)sceneReviews.unshift(['货运高架',47.9],['水淹码头',60.1],['黑星广场',63.9],['服务器大厅',135.4],['机柜俯拍',149.2],['竖井上升',162.3],['天际线尾声',234.1]);
if(v20)sceneReviews.unshift(['V20 · 黑星压城',63.9],['V20 · 机房冷通道',141.9],['V20 · 高潮入口',194.3],['V20 · 黑星回潮',206],['V20 · 城市终段',228]);
if(v22)sceneReviews.unshift(['V22 · 警报色差',24.4],['V22 · 废城信号错位',68.98],['V22 · 机房扫描故障',145.72],['V22 · 终章字形变化',203.13],['V22 · 反应堆重拍',216.88],['V22 · 黑星信号故障',227.68]);
if(v23)sceneReviews.unshift(['第一高潮 · 信号故障',68.99],['终章 · 前奏镜头',194.58],['终章 · 反应堆近景',213.43]);
if(v24)sceneReviews.unshift(['V24 · 牵手句起拍',data.finaleEdit.fastFrom],['V24 · 黑星故障峰值',229.68]);
if(v25)sceneReviews.unshift(['V25 · 城市窗户',42.65],['V25 · 黑星俯冲',229.64],['V25 · 黑星触地红光',231.28]);
if(v30)sceneReviews.unshift(['V30 · 城市线稿快切',210.32],['V30 · 眼部插镜',211.67]);
if(v33)sceneReviews.unshift(['线稿放射 · 第一高潮',76.533333],['线稿放射 · 终章快切',210.45]);
if(v32)sceneReviews.unshift(['线稿延时 · 第一高潮',76.60],['线稿延时 · 终章前段',199.90]);
if(v31)sceneReviews.unshift(['V31 · 第一高潮插镜',70.67],['V31 · 终章前段插镜',195.58]);
if(v29)sceneReviews.unshift(['V29 · 机房入场',134.68],['V29 · 竖井到返程',164.05]);
if(v28)sceneReviews.unshift(['V28 · 红城黑烟',66.2],['V28 · 橙城薄烟',36.6]);
if(v26)sceneReviews.unshift(['深色正常街区',42.65],[v27?'橙色 · 局部墙面破损':'橙色 · 局部起火',48.15],['红色 · 楼层坍塌',66.20]);
$('fxReview').replaceChildren(new Option('跳转查看歌词与场景',''),...sceneReviews.map(([label,t])=>new Option(`${label} · ${t.toFixed(2)}s`,String(t))),...reviews.map(([label,n,offset=.25])=>new Option(`${label} · ${lyrics.lines[n-1]?.time.toFixed(2)||'0'}s`,String((lyrics.lines[n-1]?.time||0)+offset))));
resources.makeCanvas=(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas};
window.MVResources=resources;
await Promise.all(Object.entries(config.images).map(async([key,path])=>{const im=new Image();im.src=path;await im.decode();resources[key]=im}));
await Promise.all(['Noto Serif JP','Noto Sans JP','Noto Sans SC'].map(name=>document.fonts.load(`32px "${name}"`)));await document.fonts.ready;window.MV={duration:config.duration,fps:config.fps};window.MVData=data;
let time=0,playing=false,clockOrigin=0;
const format=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}`;
window.renderAt=async(t,size={})=>{if(size.width&&film.width!==size.width){film.width=size.width;film.height=size.height||size.width*9/16}time=clamp(t,0,config.duration);renderFrame(ctx,time,resources,data,film.width,film.height);if(!exporting){$('seek').value=time;$('clock').value=format(time);const sh=shotAt(time,data);$('scene').textContent=`${sceneAt(time,data).label} / SHOT ${String(sh.id).padStart(3,'0')} / ${sh.mode}`;drawWave()}return true};
function drawWave(){const canvas=$('wave'),c=canvas.getContext('2d'),w=canvas.width;c.fillStyle='#0C171C';c.fillRect(0,0,w,88);const a=features.envelope;for(let i=0;i<w;i++){const v=a[Math.floor(i/w*a.length)]||0;c.fillStyle='#294f4c';c.fillRect(i,44-v*34,1,Math.max(1,v*68))}for(const s of shots.shots){const x=s.start/config.duration*w;c.fillStyle='#ED8B5040';c.fillRect(x,24,1,64)}for(const s of cues.scenes){const x=s.start/config.duration*w;c.fillStyle=s.color;c.fillRect(x,0,1,88);c.font='10px Consolas';c.fillText(String(s.id).padStart(2,'0'),x+4,14)}c.fillStyle='#e9acc8';c.fillRect(time/config.duration*w-1,0,2,88)}
function pause(){audio.pause();playing=false;$('play').textContent='播放'}
async function play(){if(playing){pause();return}if(audioMissing){clockOrigin=performance.now()-time*1000;playing=true;$('play').textContent='暂停';requestAnimationFrame(tick);return}audio.currentTime=time;try{await audio.play();playing=true;$('play').textContent='暂停';requestAnimationFrame(tick)}catch(e){$('status').textContent=e.message}}
function tick(){if(!playing)return;const t=audioMissing?Math.max(0,(performance.now()-clockOrigin)/1000):audio.currentTime;if(t>=config.duration){pause();window.renderAt(config.duration);return}window.renderAt(t);requestAnimationFrame(tick)}
function seek(t){pause();const v=clamp(t,0,config.duration);audio.currentTime=v;window.renderAt(v)}
$('fxEnabled').onchange=e=>{cues.characterFx=e.target.checked?characterFxCues:[];window.renderAt(time)};
$('glitchEnabled').onchange=e=>{glitchToggle.enabled=e.target.checked;window.renderAt(time)};
$('fxReview').onchange=e=>{if(!e.target.value)return;$('fxEnabled').checked=true;cues.characterFx=characterFxCues;seek(+e.target.value)};
$('play').onclick=play;$('prev').onclick=()=>seek(time-1/60);$('next').onclick=()=>seek(time+1/60);$('seek').oninput=e=>seek(+e.target.value);
$('wave').onclick=e=>seek((e.offsetX/($('wave').clientWidth))*config.duration);
audio.onended=()=>{pause();window.renderAt(config.duration)};
for(const s of cues.scenes){const b=document.createElement('button');b.textContent=`${String(s.segment||s.id).padStart(2,'0')} ${s.label}`;b.onclick=()=>seek(s.start+.1);$('chapters').append(b)}
$('quality').onchange=e=>{film.width=+e.target.value;film.height=film.width*9/16;window.renderAt(time)};
$('still').onclick=()=>{const a=document.createElement('a');a.href=film.toDataURL('image/png');a.download=`LAST-SIGNAL-${time.toFixed(3)}.png`;a.click()};
document.onkeydown=e=>{if(/INPUT|SELECT|BUTTON/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();play()}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seek(time+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:1/60))}};
$('audioFile').onchange=e=>{const file=e.target.files[0];if(!file)return;pause();audio.src=URL.createObjectURL(file);$('status').textContent='已替换预览音源；离线导出请同步替换 assets/audio/song.m4a 并重新分析。'};
function parseLyrics(raw,isJson){
  let result;
  if(isJson)result=JSON.parse(raw);
  else{
   const offset=Number(raw.match(/\[offset:\s*([+-]?\d+)\s*\]/i)?.[1]||0)/1000,rows=[];
   for(const line of raw.split(/\r?\n/)){
    if(!/^\s*\[\d+:/.test(line))continue;
    const stamps=[...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text=line.replace(/^(?:\s*\[\d+:\d+(?:\.\d+)?\])+\s*/, '');
    if(/<\d+:\d+(?:\.\d+)?>/.test(text))throw Error('增强 LRC 请先用 tools/import_lyrics.py 转为 JSON。');
    for(const stamp of stamps)rows.push({time:Math.max(0,Number(stamp[1])*60+Number(stamp[2])+offset),text,words:[]});
   }
   if(!rows.length)throw Error('未找到 [mm:ss.xx] 时间标签。');
   result={lines:rows,offsetSeconds:offset};
  }
  if(!result||!Array.isArray(result.lines))throw Error('JSON 必须包含 lines 数组。');
  const lines=result.lines.map((line,i)=>{
   if(!line||!Number.isFinite(line.time)||line.time<0||line.time>config.duration||typeof line.text!=='string')throw Error(`第 ${i+1} 行需要有效的 time 与 text。`);
   if(line.end!==undefined&&(!Number.isFinite(line.end)||line.end<line.time))throw Error(`第 ${i+1} 行 end 无效。`);
   if(line.words!==undefined&&(!Array.isArray(line.words)||line.words.some(w=>!w||!Number.isFinite(w.time)||w.time<0||typeof w.text!=='string')))throw Error(`第 ${i+1} 行 words 无效。`);
   return{...line,words:line.words||[]};
  }).sort((a,b)=>a.time-b.time);
  for(const line of lines)line.end=Math.min(config.duration,line.end??lines.find(l=>l.time>line.time)?.time??config.duration);
  return{...result,lines};
}
$('lyricFile').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;const previous=data.lyrics;
 try{
  const next=parseLyrics(await f.text(),f.name.toLowerCase().endsWith('.json'));
  data.lyrics=next;await window.renderAt(time);
  $('status').textContent=`已加载 ${next.lines.length} 行本地歌词；${next.lines.some(l=>l.words.length)?'包含导入的词级时间，请检查对齐。':'仅含行级时间，未声明逐字对齐。'}`;
 }catch(err){data.lyrics=previous;$('status').textContent=`歌词格式错误：${err.message}`}
};
$('status').textContent=audioMissing?AUDIO_HINT:wantsJizura&&!hasJizuraInputs?'画面已就绪 · JIZURA 歌词需在本地准备（见 README）。':lyrics.lines.length?`已加载 ${lyrics.lines.length} 行场景歌词 · ${lyrics.timingNote||'请检查演唱时间。'}`:'画面粗剪已就绪 · 尚未导入本地歌词。';
await window.renderAt(6);window.MV_READY=true;
