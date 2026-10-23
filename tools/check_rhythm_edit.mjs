// Read-only V11 EDL, camera, lyric isolation and actual native-frame regression.
// node tools/check_rhythm_edit.mjs [REPORT.json] [BASELINE_DIRECTORY]
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as equal} from 'node:util';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {projectRoot as root} from './serve.mjs';
import {cameraAt,transitionAt,editorialShotAt} from '../src/transitions.mjs';
import {shotAt,sceneAt} from '../src/film.mjs';
import {glitchAt} from '../src/glitch.mjs';
import {SIGNAL_WINDOWS,signalWindowAt} from '../src/signal_windows.mjs';

const baselineRoot=path.resolve(root,process.argv[3]||'work/v11-baseline');
const json=async(p,base=root)=>JSON.parse(await readFile(path.join(base,p),'utf8'));
const data={config:await json('config.json'),features:await json('data/audio_features.json'),cues:await json('data/cues.json'),shots:await json('data/shots.json'),sceneLayers:await json('data/scene_layers.json',{themes:{}}),lyrics:await json('data/lyrics.json'),lyricDirection:await json('data/lyric_direction.json')};
data.audio=data.audioFeatures=data.features;
const baselineData={...data,shots:await json('data/shots.json',baselineRoot)};
const baselineMotion=await import(pathToFileURL(path.join(baselineRoot,'src/transitions.mjs')).href);
const baselineFilm=await import(pathToFileURL(path.join(baselineRoot,'src/film.mjs')).href);
const baselineGlitch=await import(pathToFileURL(path.join(baselineRoot,'src/glitch.mjs')).href);
const hash=b=>createHash('sha256').update(b).digest('hex');
const tracked=['config.json','tools/check_rhythm_edit.mjs',...(await readdir(path.join(root,'src'))).filter(p=>p.endsWith('.mjs')&&!['preview.mjs','film-v1.mjs'].includes(p)).map(p=>'src/'+p),...(await readdir(path.join(root,'data'))).map(p=>'data/'+p)];
const inputHashes={};for(const p of tracked)inputHashes[p]=hash(await readFile(path.join(root,p)));
const failures=[];let failedChecks=0;
const check=(ok,name,detail)=>{if(!ok){failedChecks++;if(failures.length<30)failures.push({name,detail})}return !!ok};
const shots=data.shots.shots,parents=baselineData.shots.shots,parentById=new Map(parents.map(p=>[p.id,p]));
check(parents.length===63,'frozen63NarrativeParents',parents.length);
check(shots[0].start===0&&shots.at(-1).end===data.config.duration,'fullTimelineEndpoints');
check(new Set(shots.map(s=>s.id)).size===shots.length,'uniqueShotIds');
for(let i=0;i<shots.length;i++){
 const s=shots[i];check(s.end-s.start>=.30-1e-8,'storedMinimumShotDuration',{id:s.id,start:s.start,end:s.end});
 if(i)check(s.start===shots[i-1].end,'noTimelineGapOrOverlap',{id:s.id});
 if(s.baseShot)check(equal(s.baseShot,parentById.get(s.baseShot.id)),'exactNarrativeParent',{id:s.id});
}
const parentChecks=parents.map(p=>{const children=shots.filter(s=>(s.baseShot||s).id===p.id),ok=children.length>0&&children[0].start===p.start&&children.at(-1).end===p.end&&children.every(s=>s.scene===p.scene&&s.segment===p.segment);check(ok,'allOriginalParentsPreserved',{id:p.id});return{id:p.id,start:p.start,end:p.end,children:children.length,passed:ok}});
const parentStarts=new Set(parents.map(p=>p.start));
const newCuts=shots.filter(s=>!parentStarts.has(s.start)).map(s=>{
 const nearest=data.features.onsetTimes.reduce((best,t,i)=>Math.abs(t-s.start)<Math.abs(best.time-s.start)?{time:t,index:i}:best,{time:Infinity,index:-1});
 const error=Math.abs(nearest.time-s.start),ok=error<=1/120+1e-9&&Math.abs(s.start*60-Math.round(s.start*60))<1e-7&&!!signalWindowAt(s.start);
 check(ok,'newCutOnMeasuredOnsetAndAuthorisedClock',{id:s.id,time:s.start,error});return{shot:s.id,time:s.start,onsetIndex:nearest.index,measuredOnset:nearest.time,error,passed:ok};
});
check(newCuts.length===shots.length-parents.length,'newCutCountMatchesEDL');
const unchangedLyrics={};for(const p of ['data/lyrics.json','data/lyric_direction.json','data/lyrics_user_supplied.tsv','data/cues.json']){unchangedLyrics[p]=hash(await readFile(path.join(root,p)))===hash(await readFile(path.join(baselineRoot,p)));check(unchangedLyrics[p],'lyricAndCharacterTimingUnchanged',p)}

// Evaluate actual image-shot identities between every EDL AND profile boundary.
const edges=[...new Set([0,data.config.duration,...shots.flatMap(s=>[s.start,s.end,...(s.rhythm?[s.rhythm.from,s.rhythm.to]:[])])])].filter(t=>t>=0&&t<=data.config.duration).sort((a,b)=>a-b);
const visibleHolds=[];
for(let i=0;i<edges.length-1;i++){
 const start=edges[i],end=edges[i+1],s=editorialShotAt(data,(start+end)/2),last=visibleHolds.at(-1);
 if(last&&last.shot===s.id&&last.fast===!!s.rhythm)last.end=end;
 else visibleHolds.push({shot:s.id,baseShot:(s.baseShot||s).id,start,end,mode:s.mode,fast:!!s.rhythm,kind:s.rhythm?.kind});
}
for(const h of visibleHolds){h.duration=h.end-h.start;if(h.fast)check(h.duration>=.30-1e-8,'actualVisibleFastHoldAtLeast300ms',h)}
const originalId=id=>{const s=shots.find(s=>s.id===id);return(s?.baseShot||s)?.id??id};
const comparableTransition=tr=>tr?{...tr,fromShot:originalId(tr.fromShot),toShot:originalId(tr.toShot)}:tr;
const finite=v=>typeof v==='number'?Number.isFinite(v):v&&typeof v==='object'?Object.values(v).every(finite):true;
const scan={frames:0,fastFrames:0,quietFrames:0,readingCameraMismatches:0,quietCameraMismatches:0,quietTransitionMismatches:0,shotHelperMismatches:0,nonFiniteCameraFrames:0,fastTransitionFrames:0,maxFastTransitionSeconds:0,mediumFrames:0,mediumParameterMismatches:0,mediumExtremeFrames:0,mediumSpatialFrames:0,outsideGlitchFrames:0};
const mediumWindows=SIGNAL_WINDOWS.filter(w=>w.kind==='medium');
check(mediumWindows.length===7,'sevenMediumLoops',mediumWindows.length);
const coverage=SIGNAL_WINDOWS.map(w=>({id:w.id,from:w.from,to:w.to,frames:0,fastFrames:0}));
for(let frame=0;frame<Math.ceil(data.config.duration*60);frame++){
 const t=frame/60,s=editorialShotAt(data,t),image=cameraAt(data,t),reading=cameraAt(data,t,true),old=baselineMotion.cameraAt(baselineData,t),window=signalWindowAt(t),g=glitchAt(data,t);scan.frames++;
 if(!equal(reading,old)){scan.readingCameraMismatches++;check(false,'readingCameraExactlyMatchesOriginal',{frame,time:t,reading,original:old})}
 if(!equal(shotAt(t,data),s)||s.scene!==sceneAt(t,data).id){scan.shotHelperMismatches++;check(false,'filmAndImageShotHelpersAgree',{frame,time:t})}
 if(!finite(image)||!finite(reading)){scan.nonFiniteCameraFrames++;check(false,'finiteCameras',{frame,time:t})}
 if(s.rhythm){scan.fastFrames++;check(!!window,'noFastImageOutsideAuthorisedProfile',{frame,time:t});const tr=transitionAt(data,t);if(tr){scan.fastTransitionFrames++;scan.maxFastTransitionSeconds=Math.max(scan.maxFastTransitionSeconds,tr.duration);check(tr.duration<=4/60+1e-9&&tr.toShot===s.id,'fastTransitionAtMost4Frames',{frame,time:t,tr})}}
 if(!window){scan.quietFrames++;if(!equal(image,old)){scan.quietCameraMismatches++;check(false,'quietImageCameraUnchanged',{frame,time:t,image,original:old})}const now=comparableTransition(transitionAt(data,t)),before=baselineMotion.transitionAt(baselineData,t);if(!equal(now,before)){scan.quietTransitionMismatches++;check(false,'quietDefaultTransitionUnchanged',{frame,time:t,now,original:before})}if(g){scan.outsideGlitchFrames++;check(false,'outsideProfilesHasNoGlitch',{frame,time:t})}}
 else{const q=coverage.find(q=>q.id===window.id);q.frames++;if(s.rhythm)q.fastFrames++}
 if(window?.kind==='medium'){
  scan.mediumFrames++;if(!equal(g,baselineGlitch.glitchAt(baselineData,t))){scan.mediumParameterMismatches++;check(false,'mediumParametersExactlyUnchanged',{frame,time:t})}
  if(g){if(g.intensity>.50+1e-9||g.tier>3||g.level>.60+1e-9||g.split||g.pixelate||g.negative||g.character){scan.mediumExtremeFrames++;check(false,'mediumCapsAndBaseCharacterGrade',{frame,time:t,g})}if(g.shutter||g.fragments||g.zoomEcho){scan.mediumSpatialFrames++;check(false,'noNewSpatialChannelsInMedium',{frame,time:t,g})}}
 }
}
for(const c of coverage){c.fastFraction=c.frames?c.fastFrames/c.frames:0;check(c.fastFrames>0,'everyRequestedProfileHasFastMontage',c)}
// Sub-frame edge tests catch profile/shot switching that the 60fps scan can miss.
const boundaryTimes=[...new Set([...shots.map(s=>s.start),...SIGNAL_WINDOWS.flatMap(w=>[w.from,w.to])])].flatMap(t=>[t-1e-7,t,t+1e-7]).filter(t=>t>=0&&t<data.config.duration);
for(const t of boundaryTimes){check(equal(shotAt(t,data),editorialShotAt(data,t)),'subframeHelperAgreement',t);check(equal(cameraAt(data,t,true),baselineMotion.cameraAt(baselineData,t)),'subframeReadingCameraAgreement',t);check(finite(cameraAt(data,t)),'subframeFiniteImageCamera',t)}

const native={dimensions:[640,360],targets:[],quietBaselinePixels:[],narrativeStateChecks:[],passed:false};
try{
 const require=createRequire(import.meta.url);let canvasAPI;try{canvasAPI=require('@napi-rs/canvas')}catch{canvasAPI=createRequire(path.join(process.env.CODEX_NODE_MODULES||path.join(process.cwd(), 'node_modules'),'package.json'))('@napi-rs/canvas')}
 const{createCanvas,loadImage,GlobalFonts}=canvasAPI;globalThis.Path2D??=canvasAPI.Path2D;globalThis.ImageData??=canvasAPI.ImageData;
 for(const name of ['msyh.ttc','simsun.ttc','simhei.ttf','NotoSerifJP-VF.ttf','NotoSansJP-VF.ttf','consola.ttf']){const p='C:/Windows/Fonts/'+name;if(existsSync(p))GlobalFonts.registerFromPath(p)}
 for(const name of await readdir(path.join(root,'assets/fonts')))if(/\.(ttf|otf|ttc)$/i.test(name))GlobalFonts.registerFromPath(path.join(root,'assets/fonts',name));
 const images={};for(const[key,p]of Object.entries(data.config.images))images[key]=await loadImage(path.join(root,p));
 const resources=()=>({images,...images,makeCanvas:createCanvas,rigData:data.config.rigs,gradeMap:data.config.fxAssets});
 // Read-only export of the private stage; function bodies are the exact file bytes.
 const filmPath=path.join(root,'src/film.mjs'),filmSource=await readFile(filmPath,'utf8');
 const exposed=filmSource.replace(/from\s*(['"])(\.{1,2}\/[^'"]+)\1/g,(_,q,p)=>`from ${q}${new URL(p,pathToFileURL(filmPath)).href}${q}`)+'\nexport const qaStage = context => stages.get(context);\n';
 const actualFilm=await import('data:text/javascript;base64,'+Buffer.from(exposed).toString('base64'));
 function runner(module,source){const r=resources(),canvas=createCanvas(...native.dimensions),c=canvas.getContext('2d');return t=>{c.reset();module.renderFrame(c,t,r,source,...native.dimensions);if(module.qaStage){const ctx=r.motionCanvases.get('current-raw').getContext('2d'),stage=module.qaStage(ctx),base=editorialShotAt(source,t).baseShot||editorialShotAt(source,t),progress=Math.max(0,Math.min(1,(t-base.start)/(base.end-base.start))),ok=!!stage&&stage.age===t-base.start&&stage.progress===progress&&stage.shot.id===base.id&&stage.shot.start===base.start&&stage.shot.end===base.end;check(ok,'actualFilmKeepsNarrativeAgeProgressAndIdentity',{time:t,baseId:base.id,stageAge:stage?.age,expectedAge:t-base.start});native.narrativeStateChecks.push({time:t,baseId:base.id,age:stage?.age,progress:stage?.progress,passed:ok})}return Buffer.from(canvas.data())}}
 const snap=shots.find(s=>s.rhythm?.cut==='snap'),targets=[30.45,79.8,199.95,214.9,227.15,...(snap?[snap.start+1/60]:[]),95,140,234],warm=runner(actualFilm,data);
 warm(12);
 for(const t of targets){const cold=runner(actualFilm,data)(t),hot=warm(t);warm((t+37.123)%data.config.duration);const history=warm(t),ok=cold.equals(hot)&&cold.equals(history);check(ok,'nativeColdWarmAndDifferentHistoryPixels',{time:t});native.targets.push({time:t,sha256:hash(cold),coldWarmEqual:cold.equals(hot),historyEqual:cold.equals(history),passed:ok})}
 const prior=runner(baselineFilm,baselineData);for(const t of [95,140,234]){const a=warm(t),b=prior(t),ok=a.equals(b);check(ok,'quietActualFilmPixelsUnchanged',{time:t});native.quietBaselinePixels.push({time:t,currentSha256:hash(a),baselineSha256:hash(b),passed:ok})}
 native.passed=native.targets.every(s=>s.passed)&&native.quietBaselinePixels.every(s=>s.passed)&&native.narrativeStateChecks.every(s=>s.passed);
}catch(error){native.error=error.stack;check(false,'nativeRendererChecksCompleted',String(error))}
const inputChanges=[];for(const p of tracked)if(inputHashes[p]!==hash(await readFile(path.join(root,p))))inputChanges.push(p);check(!inputChanges.length,'testedInputsUnchangedDuringQA',inputChanges);
const report={schemaVersion:1,baselineRoot,inputHashes,inputChanges,shotCount:shots.length,baselineShotCount:parents.length,newOnsetCuts:newCuts,parentChecks,unchangedLyrics,minimumStoredShotSeconds:Math.min(...shots.map(s=>s.end-s.start)),minimumVisibleFastHoldSeconds:Math.min(...visibleHolds.filter(s=>s.fast).map(s=>s.duration)),visibleHolds,coverage,scan,subframeSamples:boundaryTimes.length,native,failedChecks,failures,passed:failedChecks===0,limitations:['Native pixel tests use nine selected actual-film frames at 640x360 with full source character/font assets, not a full video export.','Quiet transition comparisons normalize child shot IDs to original source IDs; all visible time/geometry parameters must match.','Existing automatic onset/tempo confidence is unchanged; no vocal-word alignment claim.']};
const output=path.resolve(root,process.argv[2]||'export/v11-rhythm-qa.json');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,shotCount:shots.length,baselineShotCount:parents.length,newOnsetCuts:newCuts.length,minimumStoredShotSeconds:report.minimumStoredShotSeconds,minimumVisibleFastHoldSeconds:report.minimumVisibleFastHoldSeconds,scan,coverage,subframeSamples:boundaryTimes.length,native:{targets:native.targets.length,quietBaselinePixels:native.quietBaselinePixels.length,narrativeStateChecks:native.narrativeStateChecks.length,passed:native.passed,error:native.error},failedChecks,firstFailures:failures.slice(0,8),output},null,2));
if(!report.passed)process.exitCode=1;
