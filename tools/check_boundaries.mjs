import {createRequire} from 'node:module';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {projectRoot} from './serve.mjs';
let canvasModule;try{canvasModule=createRequire(import.meta.url)('@napi-rs/canvas')}catch{canvasModule=createRequire(path.join(process.env.CODEX_NODE_MODULES||path.join(process.cwd(), 'node_modules'),'package.json'))('@napi-rs/canvas')}
const {createCanvas,loadImage,GlobalFonts}=canvasModule;
const positional=[],overrides={};
for(let i=2;i<process.argv.length;i++){const arg=process.argv[i];if(arg==='--lyrics'||arg==='--lyric-direction'){if(!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error(`Missing value for ${arg}`);overrides[arg]=process.argv[++i]}else if(arg.startsWith('--'))throw Error(`Unknown option ${arg}`);else positional.push(arg)}
const root=projectRoot,out=path.join(root,'export'),prefix=positional[0]||'v3';
if(!/^[a-z0-9_-]+$/i.test(prefix))throw Error('Invalid report prefix');
const{renderFrame,shotAt}=await import(pathToFileURL(path.join(root,'src/film.mjs')));
const readJSON=async(f,fallback)=>{try{return JSON.parse(await readFile(path.resolve(root,f),'utf8'))}catch(error){if(error.code==='ENOENT'&&fallback!==undefined)return fallback;throw error}};
const lyricFiles={lyrics:overrides['--lyrics']||'data/lyrics.json',lyricDirection:overrides['--lyric-direction']||'data/lyric_direction.json'};
const data={config:await readJSON('config.json'),features:await readJSON('data/audio_features.json'),cues:await readJSON('data/cues.json'),lyrics:await readJSON(lyricFiles.lyrics,overrides['--lyrics']?undefined:{lines:[]}),lyricDirection:await readJSON(lyricFiles.lyricDirection,overrides['--lyric-direction']?undefined:{cues:[]}),shots:await readJSON('data/shots.json'),sceneLayers:await readJSON('data/scene_layers.json',{themes:{}})};
const fonts=[];
for(const file of ['C:/Windows/Fonts/consola.ttf',...await readdir(path.join(root,'assets/fonts')).then(fs=>fs.filter(f=>/\.(ttf|otf|ttc)$/i.test(f)).map(f=>path.join(root,'assets/fonts',f)))])if(existsSync(file)){GlobalFonts.registerFromPath(file);fonts.push(file)}
const resources={rigData:data.config.rigs,gradeMap:data.config.fxAssets,makeCanvas:createCanvas};
for(const[key,file]of Object.entries(data.config.images))resources[key]=await loadImage(path.join(root,file));
const frame=createCanvas(1920,1080),ctx=frame.getContext('2d'),sample=createCanvas(64,36),sampleCtx=sample.getContext('2d'),fps=60;
const qa={schemaVersion:1,scope:'All 48 actual shot boundaries using current character effects; not legacy chapter-only samples.',fps,renderWidth:1920,renderHeight:1080,shotCount:data.shots.shots.length,sampleCount:0,method:'FIRST = ceil(start*60)/60; LAST = (ceil(end*60)-1)/60; MID = nearest global frame to midpoint, clamped to the shot. ctx.reset() is called before every frame.',fonts,sourceHashes:{},pages:[],samples:[],generationErrors:[],visualReview:{status:'pending',inspectedPages:[]},limits:['Three samples per shot do not inspect every intermediate frame or every internal scene event.','Shot timing remains audio-derived editorial candidates; this QA does not verify bar, voice or word alignment.','Contact sheets can expose major visual defects; small final-resolution typography and compression still require playback inspection.']};
qa.lyricInputs=Object.fromEntries(Object.entries(lyricFiles).map(([key,file])=>[key,path.resolve(root,file)]));
for(const file of ['src/film.mjs','src/cinema.mjs','src/transitions.mjs','src/character.mjs','src/character_fx.mjs','src/palette.mjs','config.json','data/shots.json','data/cues.json','assets/character/rig/full-blink.png',...['src/lyric_art.mjs',...Object.values(lyricFiles)].filter(file=>existsSync(path.resolve(root,file)))])qa.sourceHashes[file]=createHash('sha256').update(await readFile(path.resolve(root,file))).digest('hex');
for(let offset=0;offset<qa.shotCount;offset+=6){
 const page=createCanvas(1440,1884),c=page.getContext('2d');c.fillStyle='#101C1D';c.fillRect(0,0,1440,1884);
 const shots=data.shots.shots.slice(offset,offset+6);
 for(let row=0;row<shots.length;row++){
  const shot=shots[row],end=shot.end??data.shots.shots[offset+row+1]?.start??data.config.duration;
  const first=Math.ceil(shot.start*fps),last=Math.ceil(end*fps)-1,mid=Math.max(first,Math.min(last,Math.round((shot.start+end)/2*fps)));
  for(const[column,label,number]of [[0,'FIRST',first],[1,'MID',mid],[2,'LAST',last]]){
   const time=+(number/fps).toFixed(9),x=column*480,y=row*314;
   ctx.reset();renderFrame(ctx,time,resources,data,1920,1080);sampleCtx.reset();sampleCtx.drawImage(frame,0,0,64,36);
   const pixels=sampleCtx.getImageData(0,0,64,36).data;let sum=0,min=255,max=0,opaque=0;
   for(let i=0;i<pixels.length;i+=4){const l=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];sum+=l;min=Math.min(min,l);max=Math.max(max,l);opaque+=pixels[i+3]===255}
   c.drawImage(frame,x,y,480,270);c.fillStyle='#C8CCD1';c.font='15px Consolas';c.fillText(`${String(shot.id).padStart(2,'0')} / ${shot.mode.toUpperCase()} / SCENE ${shot.scene} / ${label}`,x+10,y+289);
   c.fillStyle='#9DE4C2';c.font='12px Consolas';c.fillText(`frame ${number} / ${time.toFixed(6)}s / ${shot.start.toFixed(3)}-${end.toFixed(3)}s`,x+10,y+308);
   const actual=shotAt(time,data);if(actual.id!==shot.id)qa.generationErrors.push({shot:shot.id,label,frame:number,time,actualShot:actual.id});
   qa.samples.push({shot:shot.id,scene:shot.scene,mode:shot.mode,label,frame:number,time,actualShot:actual.id,luma:{mean:+(sum/(64*36)).toFixed(4),min:+min.toFixed(4),max:+max.toFixed(4)},opaqueSamples:opaque,totalSamples:64*36});
  }
 }
 const filename=`${prefix}-boundaries-${String(offset/6+1).padStart(2,'0')}.png`;await writeFile(path.join(out,filename),await page.encode('png'));qa.pages.push({file:`export/${filename}`,shots:shots.map(s=>s.id),samples:shots.length*3});
}
qa.sampleCount=qa.samples.length;qa.generated=true;qa.generationPassed=qa.sampleCount===144&&qa.generationErrors.length===0;await writeFile(path.join(out,`${prefix}-boundary-qa.json`),JSON.stringify(qa,null,2));
console.log(JSON.stringify({pages:qa.pages.length,samples:qa.sampleCount,generationPassed:qa.generationPassed,errors:qa.generationErrors,review:qa.visualReview.status}));
