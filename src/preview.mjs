import {renderFrame,sceneAt,shotAt,clamp} from './film.mjs';
import {glitchToggle} from './glitch.mjs';
const $=id=>document.getElementById(id), film=$('film'),ctx=film.getContext('2d'),audio=$('audio');
const read=path=>fetch(path).then(r=>{if(!r.ok)throw Error(`加载失败 ${path}`);return r.json()});
const AUDIO_HINT='未找到音源：请把音频放到 assets/audio/song.m4a，或用「替换本地音源」载入。';
let audioMissing=false;
audio.addEventListener('error',()=>{audioMissing=true;$('status').textContent=AUDIO_HINT});
const [config,features,cues,lyrics,shots,lyricDirection]=await Promise.all(['./config.json','./data/audio_features.json','./data/cues.json','./data/lyrics.json','./data/shots.json','./data/lyric_direction.json'].map((p,i)=>i===3?read(p).catch(()=>({lines:[]})):i===5?read(p).catch(()=>({cues:[]})):read(p)));
const data={config,features,cues,lyrics,shots,lyricDirection},resources={rigData:config.rigs,gradeMap:config.fxAssets};
const characterFxCues=cues.characterFx||[];
const reviews=[['消去循环 · 中量崩坏',9,1.2],['临近循环 · 中量崩坏',23,1.2],['低语循环 · 中量崩坏',37,1.2],['黑星循环Ⅰ · 中量崩坏',50,1.2],['背向循环 · 中量崩坏',71,1.2],['黑星循环Ⅱ · 中量崩坏',83,1.2],['终章循环 · 中量崩坏',118,1.2],['道路透视',33],['眼部竖排',65],['盐晶与泪',68],['鱼群海面',80],['燕迹与云',98],['掌心曲线',104],['热异常',107],['现实裂解 · 高潮崩坏',109]];
const rhythmReviews=[['第一高潮 · 疾走快切',79.5],['最终高潮 · 加速',199.45],['核心失控 · 爆点',214.85]];
$('fxReview').replaceChildren(new Option('跳转查看歌词动画',''),...rhythmReviews.map(([label,t])=>new Option(`${label} · ${t.toFixed(2)}s`,String(t))),...reviews.map(([label,n,offset=.25])=>new Option(`${label} · ${lyrics.lines[n-1]?.time.toFixed(2)||'0'}s`,String((lyrics.lines[n-1]?.time||0)+offset))));
resources.makeCanvas=(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas};
window.MVResources=resources;
await Promise.all(Object.entries(config.images).map(async([key,path])=>{const im=new Image();im.src=path;await im.decode();resources[key]=im}));
await Promise.all(['Noto Serif JP','Noto Sans JP','Noto Sans SC'].map(name=>document.fonts.load(`32px "${name}"`)));await document.fonts.ready;window.MV={duration:config.duration,fps:config.fps};window.MVData=data;
let time=0,playing=false,clockOrigin=0;
const format=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}`;
window.renderAt=async(t,size={})=>{if(size.width&&film.width!==size.width){film.width=size.width;film.height=size.height||size.width*9/16}time=clamp(t,0,config.duration);renderFrame(ctx,time,resources,data,film.width,film.height);$('seek').value=time;$('clock').value=format(time);const sh=shotAt(time,data);$('scene').textContent=`${sceneAt(time,data).label} / SHOT ${String(sh.id).padStart(3,'0')} / ${sh.mode}`;drawWave();return true};
function drawWave(){const canvas=$('wave'),c=canvas.getContext('2d'),w=canvas.width;c.fillStyle='#0C171C';c.fillRect(0,0,w,88);const a=features.envelope;for(let i=0;i<w;i++){const v=a[Math.floor(i/w*a.length)]||0;c.fillStyle='#294f4c';c.fillRect(i,44-v*34,1,Math.max(1,v*68))}for(const s of shots.shots){const x=s.start/config.duration*w;c.fillStyle='#ED8B5040';c.fillRect(x,24,1,64)}for(const s of cues.scenes){const x=s.start/config.duration*w;c.fillStyle=s.color;c.fillRect(x,0,1,88);c.font='10px Consolas';c.fillText(String(s.id).padStart(2,'0'),x+4,14)}c.fillStyle='#e9acc8';c.fillRect(time/config.duration*w-1,0,2,88)}
function pause(){audio.pause();playing=false;$('play').textContent='播放'}
async function play(){if(playing){pause();return}if(audioMissing){clockOrigin=performance.now()-time*1000;playing=true;$('play').textContent='暂停';requestAnimationFrame(tick);return}audio.currentTime=time;try{await audio.play();playing=true;$('play').textContent='暂停';requestAnimationFrame(tick)}catch(e){$('status').textContent=e.message}}
function tick(){if(!playing)return;const t=audioMissing?Math.max(0,(performance.now()-clockOrigin)/1000):audio.currentTime;if(t>=config.duration){pause();window.renderAt(config.duration);return}window.renderAt(t);requestAnimationFrame(tick)}
function seek(t){pause();const v=clamp(t,0,config.duration);audio.currentTime=v;window.renderAt(v)}
$('fxEnabled').onchange=e=>{cues.characterFx=e.target.checked?characterFxCues:[];window.renderAt(time)};
$('glitchEnabled').onchange=e=>{glitchToggle.enabled=e.target.checked;window.renderAt(time)};
$('fxReview').onchange=e=>{if(!e.target.value)return;$('fxEnabled').checked=true;cues.characterFx=characterFxCues;seek(+e.target.value)};
$('play').onclick=play;$('prev').onclick=()=>seek(time-1/60);$('next').onclick=()=>seek(time+1/60);$('seek').oninput=e=>seek(+e.target.value);
$('wave').onclick=e=>seek((e.offsetX/$('wave').clientWidth)*config.duration);
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
$('status').textContent=audioMissing?AUDIO_HINT:lyrics.lines.length?`已加载 ${lyrics.lines.length} 行场景歌词 · ${lyrics.timingNote||'请检查演唱时间。'}`:'画面粗剪已就绪 · 尚未导入本地歌词。';
await window.renderAt(6);window.MV_READY=true;
