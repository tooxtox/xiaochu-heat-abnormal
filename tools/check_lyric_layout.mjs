// Actual supplied-text geometry, font coverage and seek QA. Optional full-film sheets.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {activeLyricCues,drawLyricArt} from '../src/lyric_art.mjs';
import {cameraAt} from '../src/transitions.mjs';
import {configurePalette,palette as P} from '../src/palette.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),filmSheets=args.includes('--film'),prefix=args.includes('--prefix')?args[args.indexOf('--prefix')+1]:'v5';
if(!/^[a-z0-9_-]+$/i.test(prefix||''))throw Error('--prefix must contain only letters, digits, hyphens or underscores.');
const req=createRequire(import.meta.url);let canvasModule;
try{canvasModule=req('@napi-rs/canvas')}catch{canvasModule=createRequire(path.join(process.env.CODEX_NODE_MODULES||path.join(process.cwd(), 'node_modules'),'package.json'))('@napi-rs/canvas')}
const {createCanvas,loadImage,GlobalFonts}=canvasModule;
const json=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const data={config:await json('config.json'),cues:await json('data/cues.json'),shots:await json('data/shots.json'),features:await json('data/audio_features.json'),lyrics:await json('data/lyrics.json'),lyricDirection:await json('data/lyric_direction.json'),sceneLayers:await json('data/scene_layers.json',{themes:{}})};
if(!data.lyrics.lines?.length||!data.lyricDirection.cues?.length)throw Error('Actual lyrics and direction cues must both be populated.');
configurePalette(data.config.palette);
const fontFiles=(await readdir(path.join(root,'assets/fonts'))).filter(f=>/\.(ttf|otf|ttc)$/i.test(f));
for(const file of fontFiles)GlobalFonts.registerFromPath(path.join(root,'assets/fonts',file));
if(existsSync('C:/Windows/Fonts/consola.ttf'))GlobalFonts.registerFromPath('C:/Windows/Fonts/consola.ttf');
const out=path.join(root,'work/qa');await mkdir(out,{recursive:true});
await mkdir(path.join(root,'export'),{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const W=1920,H=1080,canvas=createCanvas(W,H),context=canvas.getContext('2d'),resources={};
let records=[];
function point(m,x,y){return [m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f]}
function cameraPoint(camera,p){
 if(!camera.enabled)return p;const ax=W*camera.anchorX,ay=H*camera.anchorY,co=Math.cos(camera.roll),si=Math.sin(camera.roll),x=(p[0]-ax)*camera.zoom,y=(p[1]-ay)*camera.zoom;
 return [ax+camera.panX+x*co-y*si,ay+camera.panY+x*si+y*co];
}
const bounds=points=>({left:Math.min(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))});
const outside=b=>b.left<-.5||b.top<-.5||b.right>W+.5||b.bottom>H+.5;
const proxy=new Proxy(context,{
 get(target,key){
  if(key==='fillText')return (text,x,y,...rest)=>{
   const m=target.getTransform(),metrics=target.measureText(text),fontPixels=Number(target.font.match(/([\d.]+)px/)?.[1]||0),local=[[x-metrics.actualBoundingBoxLeft,y-metrics.actualBoundingBoxAscent],[x+metrics.actualBoundingBoxRight,y-metrics.actualBoundingBoxAscent],[x+metrics.actualBoundingBoxRight,y+metrics.actualBoundingBoxDescent],[x-metrics.actualBoundingBoxLeft,y+metrics.actualBoundingBoxDescent]],points=local.map(p=>point(m,...p));
   const sx=Math.hypot(m.a,m.b),sy=Math.hypot(m.c,m.d);
   records.push({text,font:target.font,fontPixels,effectiveEmX:fontPixels*sx,effectiveEmY:fontPixels*sy,alpha:target.globalAlpha,points,bounds:bounds(points)});
   return target.fillText(text,x,y,...rest);
  };
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 },set:(target,key,value)=>Reflect.set(target,key,value),
});
function isolate(index,cue){
 return {...data,lyrics:{...data.lyrics,lines:data.lyrics.lines.map((line,i)=>i===index?line:{...line,text:'',translation:''})},lyricDirection:{...data.lyricDirection,cues:[cue]}};
}
function phaseTime(cue,phase){
 const life=cue.end-cue.start;
 if(phase==='early-entrance')return cue.start+Math.min(.025,life*.045);
 if(phase==='entrance')return cue.start+Math.min(.1,life*.12);
 if(phase==='late-exit')return cue.end-Math.min(.025,life*.045);
 if(phase==='exit')return cue.end-Math.min(.075,life*.1);
 const explicit=cue.tokens.filter(token=>token.explicit).map(token=>token.time),last=explicit.length?Math.max(...explicit):cue.start;
 return Math.min(cue.end-Math.min(.12,life*.08),Math.max(cue.start+life*.56,last+Math.min(.18,Math.max(0,cue.end-last)*.3)));
}
function instrument(index,cue,time,withHash=false){
 context.reset();records=[];const filtered=isolate(index,cue),count=drawLyricArt(proxy,time,resources,filtered,cue.plane),actual=records.map(r=>r.text).join(''),resolved=activeLyricCues(filtered,time)[0],expected=resolved?.visibleText||'',cam=cameraAt(data,time,true);
 const visible=records.filter(r=>r.alpha>.01&&r.text.trim()),rawOutside=visible.filter(r=>outside(r.bounds)),cameraOutside=visible.filter(r=>outside(bounds(r.points.map(p=>cameraPoint(cam,p))))),minFont=visible.length?Math.min(...visible.map(r=>r.fontPixels)):null;
 return {time,count,expectedTokenCount:resolved?.tokens.filter(token=>token.visible).length||0,drawnTokenCount:records.length,gatingPassed:actual===expected,rawOutside:rawOutside.map(r=>({text:r.text,bounds:r.bounds,alpha:r.alpha})),cameraOutside:cameraOutside.map(r=>({text:r.text,bounds:bounds(r.points.map(p=>cameraPoint(cam,p))),alpha:r.alpha})),minimumFontPixels:minFont,minimumEffectiveEmX:visible.length?Math.min(...visible.map(r=>r.effectiveEmX)):null,minimumEffectiveEmY:visible.length?Math.min(...visible.map(r=>r.effectiveEmY)):null,hash:withHash?hash(context.getImageData(0,0,W,H).data):undefined,glyphCount:records.length};
}

// SFNT cmap lookup makes the bundled-font coverage check independent of rendering.
function fontCoverage(buffer){
 const tableCount=buffer.readUInt16BE(4);let cmap;
 for(let i=0;i<tableCount;i++){const at=12+i*16;if(buffer.toString('ascii',at,at+4)==='cmap'){cmap=buffer.readUInt32BE(at+8);break}}
 if(cmap===undefined)return ()=>false;const subtables=[];
 for(let i=0;i<buffer.readUInt16BE(cmap+2);i++){const at=cmap+4+i*8,offset=cmap+buffer.readUInt32BE(at+4),format=buffer.readUInt16BE(offset);if(format===4||format===12)subtables.push({offset,format})}
 return code=>subtables.some(({offset,format})=>{
  if(format===12){let lo=0,hi=buffer.readUInt32BE(offset+12);while(lo<hi){const mid=(lo+hi)>>>1,at=offset+16+mid*12,start=buffer.readUInt32BE(at),end=buffer.readUInt32BE(at+4);if(code<start)hi=mid;else if(code>end)lo=mid+1;else return buffer.readUInt32BE(at+8)+code-start!==0}return false}
  if(code>65535)return false;const segments=buffer.readUInt16BE(offset+6)/2,endAt=offset+14,startAt=endAt+segments*2+2,deltaAt=startAt+segments*2,rangeAt=deltaAt+segments*2;
  for(let i=0;i<segments;i++){const end=buffer.readUInt16BE(endAt+i*2);if(code>end)continue;const start=buffer.readUInt16BE(startAt+i*2);if(code<start)return false;const delta=buffer.readInt16BE(deltaAt+i*2),range=buffer.readUInt16BE(rangeAt+i*2);if(!range)return ((code+delta)&65535)!==0;const address=rangeAt+i*2+range+(code-start)*2;if(address+2>buffer.length)return false;const glyph=buffer.readUInt16BE(address);return glyph!==0&&((glyph+delta)&65535)!==0}return false;
 });
}
const coverages=[];for(const file of fontFiles.filter(f=>/\.ttf$/i.test(f)))coverages.push({file,has:fontCoverage(await readFile(path.join(root,'assets/fonts',file)))});
const uniqueChars=new Set(data.lyrics.lines.flatMap(line=>[...String(line.text||'')+String(line.translation||'')]).filter(ch=>!/^\s$/u.test(ch))),missingGlyphs=[...uniqueChars].filter(ch=>!coverages.some(font=>font.has(ch.codePointAt(0))));
const cueResults=[],lineResults=[],warnings=[];
for(let index=0;index<data.lyrics.lines.length;index++){
 const line=data.lyrics.lines[index],lineId=String(line.id??`L${String(index+1).padStart(3,'0')}`),middle=(line.time+line.end)/2,active=activeLyricCues(data,middle).filter(cue=>cue.lineId===lineId);
 const everyCue=new Map(active.map(cue=>[cue.id,cue]));
 for(const authored of data.lyricDirection.cues.filter(cue=>String(cue.lineId)===lineId)){
  const start=Number.isFinite(authored.start)?authored.start:line.time,end=Number.isFinite(authored.end)?authored.end:line.end;
  if(end<=start)continue;
  const resolved=activeLyricCues(data,(start+end)/2).find(cue=>cue.lineId===lineId&&(authored.id?cue.id===authored.id:cue.field===(authored.field||'text')&&cue.start===start));
  if(resolved)everyCue.set(resolved.id,resolved);
 }
 const after=activeLyricCues(data,line.end+1e-7).filter(cue=>cue.lineId===lineId);
 const lineEntry={lineId,index,start:line.time,end:line.end,duration:line.end-line.time,sourceTiming:line.timing,wordTiming:line.wordTiming,mainCues:active.filter(cue=>cue.field==='text'&&!cue.semantic.decorative).length,translationCues:active.filter(cue=>cue.field==='translation').length,decorativeCues:[...everyCue.values()].filter(cue=>cue.semantic.decorative).length,clearsAfterLineEnd:after.length===0};
 lineResults.push(lineEntry);
 for(const cue of everyCue.values()){
  const phases={};for(const phase of ['early-entrance','entrance','hold','exit','late-exit'])phases[phase]=instrument(index,cue,phaseTime(cue,phase),phase==='hold');
  const reverse=instrument(index,cue,phases.hold.time,true),minimum=cue.field==='translation'?18:48,small=phases.hold.minimumFontPixels!==null&&phases.hold.minimumFontPixels<minimum-.01;
  if(small)warnings.push({lineId,cueId:cue.id,kind:'font-below-target',field:cue.field,layout:cue.layout,actual:phases.hold.minimumFontPixels,target:minimum,longSplitException:cue.layout==='split-columns'&&cue.records.length>18});
  if(phases.hold.minimumEffectiveEmX!==null&&phases.hold.minimumEffectiveEmX<(cue.field==='translation'?16:36))warnings.push({lineId,cueId:cue.id,kind:'strong-horizontal-compression',field:cue.field,layout:cue.layout,effectiveEmX:phases.hold.minimumEffectiveEmX});
  cueResults.push({lineId,cueId:cue.id,field:cue.field,decorative:!!cue.semantic.decorative,layout:cue.layout,plane:cue.plane,font:cue.font,textGraphemes:cue.records.length,targetMinimumFontPixels:minimum,smallFontWarning:small,seekDeterminism:reverse.hash===phases.hold.hash,phases});
 }
}
const badBounds=cueResults.filter(cue=>Object.values(cue.phases).some(phase=>phase.rawOutside.length||phase.cameraOutside.length)),gatingFailures=cueResults.filter(cue=>Object.values(cue.phases).some(phase=>!phase.gatingPassed)),smallFontFailures=warnings.filter(w=>w.kind==='font-below-target'&&!w.longSplitException),sourceHashes={};
for(const file of ['src/lyric_art.mjs','src/lyric_motifs.mjs','src/film.mjs','src/cinema.mjs','data/lyrics.json','data/lyric_direction.json','data/shots.json','data/cues.json'])sourceHashes[file]=hash(await readFile(path.join(root,file)));
const report={schemaVersion:1,revision:prefix,generatedAt:new Date().toISOString(),sourceHashes,scope:'Actual user text. Native Canvas glyph-bound instrumentation at each active cue entrance, readable hold and exit; optional integrated-film hold contact sheets. Geometry checks do not certify face occlusion, contrast, vocal/word timing or human readability.',lyrics:{lines:data.lyrics.lines.length,authoredCues:data.lyricDirection.cues.length,checkedCues:cueResults.length,timingStatus:data.lyrics.timingStatus||data.lyrics.status||data.lyrics.timingNote||null},fonts:{bundled:fontFiles,uniqueCodepoints:uniqueChars.size,missingGlyphs,method:'Union of bundled TTF cmap format 4/12 coverage; actual chosen font fallback remains subject to visual review.'},checks:{passed:badBounds.length===0&&gatingFailures.length===0&&missingGlyphs.length===0&&smallFontFailures.length===0&&lineResults.every(line=>line.clearsAfterLineEnd&&line.mainCues>0)&&cueResults.every(cue=>cue.seekDeterminism),outOfBoundsCues:badBounds.map(cue=>({lineId:cue.lineId,cueId:cue.cueId,layout:cue.layout,phases:cue.phases})),gatingFailures:gatingFailures.map(cue=>cue.cueId),smallFontFailures,lineClearFailures:lineResults.filter(line=>!line.clearsAfterLineEnd),seekFailures:cueResults.filter(cue=>!cue.seekDeterminism).map(cue=>cue.cueId)},warnings,lines:lineResults,cues:cueResults,integratedFilmSheets:[]};
const reportPath=path.join(out,`${prefix}-lyrics-layout.json`);await writeFile(reportPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({phase:'geometry',passed:report.checks.passed,lines:lineResults.length,cues:cueResults.length,outOfBounds:badBounds.map(cue=>({lineId:cue.lineId,cueId:cue.cueId,layout:cue.layout,phases:Object.entries(cue.phases).filter(([,phase])=>phase.rawOutside.length||phase.cameraOutside.length).map(([name,phase])=>({phase:name,raw:phase.rawOutside,camera:phase.cameraOutside}))})),missingGlyphs,smallFontFailures,warnings,report:reportPath}));

if(filmSheets){
 const {renderFrame}=await import('../src/film.mjs'),filmResources={rigData:data.config.rigs,gradeMap:data.config.fxAssets,makeCanvas:createCanvas};
 for(const [key,file] of Object.entries(data.config.images))filmResources[key]=await loadImage(path.join(root,file));
 for(let offset=0;offset<data.lyrics.lines.length;offset+=16){
  const sheet=createCanvas(1920,1248),sheetContext=sheet.getContext('2d');sheetContext.fillStyle=P.black;sheetContext.fillRect(0,0,1920,1248);
  for(let local=0;local<Math.min(16,data.lyrics.lines.length-offset);local++){
   const index=offset+local,line=data.lyrics.lines[index],lineId=String(line.id??`L${String(index+1).padStart(3,'0')}`),cue=activeLyricCues(data,(line.time+line.end)/2).find(cue=>cue.lineId===lineId&&cue.field==='text'),time=cue?phaseTime(cue,'hold'):(line.time+line.end)/2;
   context.reset();renderFrame(context,time,filmResources,data,W,H);const snapshot=await loadImage(await canvas.encode('png')),x=local%4*480,y=Math.floor(local/4)*312;sheetContext.drawImage(snapshot,x,y,480,270);sheetContext.fillStyle=P.mint;sheetContext.font='15px Consolas';sheetContext.fillText(`${lineId} / ${cue?.layout||'NONE'} / ${time.toFixed(3)} s`,x+12,y+292);sheetContext.fillStyle=P.white;sheetContext.font='12px Consolas';sheetContext.fillText(`${(line.end-line.time).toFixed(3)} s / ${cue?.wordTiming||'NO WORD TIMES'}`,x+12,y+309);
  }
  const file=path.join(root,'export',`${prefix}-lyrics-layout-${String(offset/16+1).padStart(2,'0')}.png`);await writeFile(file,await sheet.encode('png'));report.integratedFilmSheets.push(path.relative(root,file));console.log(`Saved integrated hold sheet ${offset/16+1}/${Math.ceil(data.lyrics.lines.length/16)}.`);
 }
 await writeFile(reportPath,JSON.stringify(report,null,2));
}
process.exitCode=report.checks.passed?0:1;
