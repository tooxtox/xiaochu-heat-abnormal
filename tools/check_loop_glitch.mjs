// Read-only parameter/data checks for every authored repeat cluster.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {projectRoot as root} from './serve.mjs';
import {SIGNAL_WINDOWS,signalWindowAt} from '../src/signal_windows.mjs';
import {glitchAt} from '../src/glitch.mjs';
import {activeLyricCues} from '../src/lyric_art.mjs';
import {characterFxAt,drawGradedImage} from '../src/character_fx.mjs';
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const data={config:await read('config.json'),lyrics:await read('data/lyrics.json'),lyricDirection:await read('data/lyric_direction.json'),cues:await read('data/cues.json'),shots:await read('data/shots.json'),features:await read('data/audio_features.json'),sceneLayers:await read('data/scene_layers.json',{themes:{}})};
const files=['src/signal_windows.mjs','src/glitch.mjs','src/lyric_art.mjs','src/lyric_motifs.mjs','src/character_fx.mjs','data/lyrics.json','data/lyric_direction.json','data/cues.json','data/shots.json','config.json'],hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sourceHashes={};
for(const p of files)sourceHashes[p]=hash(await readFile(path.join(root,p)));
const failures=[],warnings=[],check=(pass,name,detail)=>{if(!pass)failures.push({name,detail});return !!pass};
const baselinePath=path.resolve(root,process.argv[3]||'work/loop-glitch-baseline/src/glitch.mjs');
let baselineGlitchAt=null;
try{baselineGlitchAt=(await import(pathToFileURL(baselinePath).href)).glitchAt}catch(error){warnings.push(`Prior heavy baseline unavailable: ${error.message}`)}
const baselineComparison={available:!!baselineGlitchAt,path:baselinePath,sourceHashes:{},frames:0,activeHeavyFrames:0,mismatches:0,firstMismatches:[]};
if(baselineGlitchAt)for(const p of ['glitch.mjs','signal_windows.mjs'])baselineComparison.sourceHashes[p]=hash(await readFile(path.join(path.dirname(baselinePath),p)));
// The new metadata does not alter any old numeric/effect field outside medium overrides.
const comparable=g=>{if(!g)return null;const{strength,windowId,...fields}=g;return fields};
const ranges=[[9,16,'erase'],[23,30,'approach-I'],[37,44,'whisper'],[50,57,'blackstar-I'],[71,77,'turn-away'],[83,90,'blackstar-II'],[118,125,'approach-II']];
const clusters=ranges.map(([first,last,name])=>({first,last,name,start:data.lyrics.lines[first-1].time,end:data.lyrics.lines[last-1].end}));
const isMedium=w=>!!w&&w.strength===.60&&w.maxTier===3&&w.maxLevel===.60&&w.ceiling===.50&&w.corrupt===.32;
const cueCounts={main:0,translation:0,hardCut:0},lineChecks=[],damageClockChecks=[];
for(const cluster of clusters)for(let n=cluster.first;n<=cluster.last;n++){
 const l=data.lyrics.lines[n-1],cs=data.lyricDirection.cues.filter(c=>c.lineId===l.id&&!c.semantic?.decorative),life=l.end-l.time;
 cueCounts.main+=cs.filter(c=>c.field!=='translation').length;cueCounts.translation+=cs.filter(c=>c.field==='translation').length;cueCounts.hardCut+=cs.filter(c=>c.hardCut).length;
 const times=[l.time+1e-7,(l.time+l.end)/2,l.end-1e-7],profiles=times.map(t=>({time:t,id:signalWindowAt(t)?.id??null,medium:isMedium(signalWindowAt(t))}));
 check(profiles.every(p=>p.medium),'everyRepeatLineHasMediumProfile',{line:l.id,profiles});check(cs.length===2&&cs.every(c=>c.hardCut),'repeatReadingLayersHardCut',{line:l.id});
 lineChecks.push({lineId:l.id,start:l.time,end:l.end,cluster:cluster.name,profiles,readingCues:cs.length,hardCutCues:cs.filter(c=>c.hardCut).length,fullyDecodedHoldMinimum:life-Math.min(.62,life*.42)});
 const k=Math.ceil((l.time+life*.50)*15),t=k/15+.005;
 if(t+.035<l.end){const at=q=>activeLyricCues(data,q).filter(c=>c.lineId===l.id&&!c.semantic?.decorative).map(c=>({id:c.id,corruption:c.records.map(r=>r.corrupt)})),stable=JSON.stringify(at(t))===JSON.stringify(at(t+.035));check(stable,'damageStableInside15HzBucket',{line:l.id,t});damageClockChecks.push({lineId:l.id,times:[t,t+.035],bucket:Math.floor(t*15),stable})}
}
check(lineChecks.length===55&&cueCounts.main===55&&cueCounts.translation===55&&cueCounts.hardCut===110,'repeatLineAndReadingCounts',cueCounts);
const mediumStats={frames:0,activeFrames:0,edgeNullFrames:0,maxLevel:0,maxIntensity:0,maxTier:0,maxSplit:0,maxPixelate:0,maxNegative:0,maxBlocks:0,maxTear:0,maxMosh:0,characterOverrideFrames:0},heavyStats={frames:0,activeFrames:0,maxIntensity:0,maxTier:0},outsideStats={frames:0,violations:0},protectedOverlap={from:clusters.at(-1).start,to:clusters.at(-1).end,frames:0,nullFrames:0,wrongProfileFrames:0},readability={completedPhaseTokenSamples:0,droppedTokenSamples:0,allMainTokensDroppedFrames:0};
for(let frame=0;frame<Math.ceil(data.config.duration*60);frame++){
 const t=frame/60,w=signalWindowAt(t),g=glitchAt(data,t),cluster=clusters.find(c=>t>=c.start&&t<c.end);
 if(baselineGlitchAt&&!isMedium(w)){
  baselineComparison.frames++;const baseline=baselineGlitchAt(data,t);if(baseline)baselineComparison.activeHeavyFrames++;
  if(JSON.stringify(comparable(g))!==JSON.stringify(comparable(baseline))){baselineComparison.mismatches++;if(baselineComparison.firstMismatches.length<8)baselineComparison.firstMismatches.push({frame,time:t,current:comparable(g),baseline:comparable(baseline)})}
 }
 if(!w){outsideStats.frames++;if(g){outsideStats.violations++;failures.push({name:'glitchOutsideUnion',detail:{frame,time:t}})}continue}
 if(cluster){
  mediumStats.frames++;if(!isMedium(w))check(false,'mediumPriorityAtEveryFrame',{frame,time:t,id:w.id});
  const envelopeFrom=w.envelopeFrom??w.from,envelopeTo=w.envelopeTo??w.to,edgeDistance=Math.min(t-envelopeFrom,envelopeTo-t);
  if(!g){mediumStats.edgeNullFrames++;if(edgeDistance>.05)check(false,'unexpectedInteriorMediumNull',{frame,time:t,edgeDistance})}
  else{mediumStats.activeFrames++;for(const[key,field]of[['maxLevel','level'],['maxIntensity','intensity'],['maxTier','tier'],['maxSplit','split'],['maxPixelate','pixelate'],['maxNegative','negative'],['maxBlocks','blocks'],['maxTear','tear'],['maxMosh','mosh']])mediumStats[key]=Math.max(mediumStats[key],g[field]??0);
   check(g.level<=.60+1e-9&&g.intensity<=.50+1e-9&&g.tier<=3,'mediumCaps',{frame,time:t,level:g.level,intensity:g.intensity,tier:g.tier});check((g.split??0)===0&&(g.pixelate??0)===0&&(g.negative??0)===0,'noExtremeMediumChannels',{frame,time:t,split:g.split,pixelate:g.pixelate,negative:g.negative});if(g.character)mediumStats.characterOverrideFrames++;
  }
  if(t>=protectedOverlap.from&&t<protectedOverlap.to){protectedOverlap.frames++;if(!g)protectedOverlap.nullFrames++;if(!isMedium(w))protectedOverlap.wrongProfileFrames++}
  const line=data.lyrics.lines.find(l=>t>=l.time&&t<l.end);
  if(line&&t>=line.time+Math.min(.62,(line.end-line.time)*.42))for(const c of activeLyricCues(data,t).filter(c=>c.lineId===line.id&&!c.semantic?.decorative)){readability.completedPhaseTokenSamples+=c.records.length;const drops=c.records.filter(r=>r.corrupt?.drop).length;readability.droppedTokenSamples+=drops;if(c.field==='text'&&drops===c.records.length)readability.allMainTokensDroppedFrames++}
 }else if(t>=215.235875&&t<220.588875){heavyStats.frames++;if(g){heavyStats.activeFrames++;heavyStats.maxIntensity=Math.max(heavyStats.maxIntensity,g.intensity);heavyStats.maxTier=Math.max(heavyStats.maxTier,g.tier)}check(!isMedium(w),'realityRefrainStaysHeavy',{frame,time:t,id:w.id})}
}
check(outsideStats.violations===0,'noOutsideWindowEffects',outsideStats);check(protectedOverlap.nullFrames===0&&protectedOverlap.wrongProfileFrames===0,'noMediumOverrideNullHoleInsideClimax',protectedOverlap);check(readability.allMainTokensDroppedFrames===0,'noCompletedMainLineWhollyDropped',readability);
check(mediumStats.characterOverrideFrames===0,'mediumPreservesBaseCharacterGrade',mediumStats.characterOverrideFrames);
if(baselineGlitchAt)check(baselineComparison.mismatches===0,'priorHeavyParametersExactlyPreserved',baselineComparison);
readability.retainedTokenFraction=readability.completedPhaseTokenSamples?1-readability.droppedTokenSamples/readability.completedPhaseTokenSamples:1;check(readability.retainedTokenFraction>=.90,'completedPhaseAggregateReadable',readability);
// Boundary samples include exact edges and sub-frame points; final loop must stay
// active throughout its handoff to/from the surrounding heavy climax.
const boundaryChecks=SIGNAL_WINDOWS.flatMap(w=>[w.from,w.to].map(edge=>{
 const samples=[edge-1/60,edge-1e-6,edge,edge+1e-6,edge+1/60].map(t=>{const selected=signalWindowAt(t),g=glitchAt(data,t),expected=SIGNAL_WINDOWS.find(q=>t>=q.from&&t<q.to)||null;check(selected?.id===expected?.id,'firstPriorityWindowBoundary',{time:t,expected:expected?.id,actual:selected?.id});if(w.id===SIGNAL_WINDOWS[6].id)check(!!g,'finalMediumHeavyHandoffNeverNull',{edge,time:t,window:selected?.id});return{time:t,window:selected?.id??null,active:!!g,intensity:g?.intensity??0,tier:g?.tier??0}});
 return{windowId:w.id,edge,samples};
}));
// Query in reverse and unrelated order so cached state/history cannot affect data.
const determinismTimes=[...clusters.flatMap(c=>[c.start+1/60,(c.start+c.end)/2,c.end-1/60]),...boundaryChecks.flatMap(b=>b.samples.map(s=>s.time)),215.3,219.9];
const deterministicSnapshots=new Map(determinismTimes.map(t=>[t,JSON.stringify({glitch:glitchAt(data,t),lyrics:activeLyricCues(data,t)})]));
let deterministicMismatches=0;for(const t of [...determinismTimes].reverse()){glitchAt(data,(t*1.731)%data.config.duration);activeLyricCues(data,(t*2.913)%data.config.duration);if(deterministicSnapshots.get(t)!==JSON.stringify({glitch:glitchAt(data,t),lyrics:activeLyricCues(data,t)}))deterministicMismatches++}
const determinism={samples:determinismTimes.length,mismatches:deterministicMismatches};check(!deterministicMismatches,'sameTimeHistoryIndependentParametersAndLyrics',determinism);
// Exercise the real private styleFor path via drawGradedImage, without image/media IO.
const gradeResources={gradeMap:data.config.fxAssets};for(const key of Object.keys(data.config.images))gradeResources[key]={key};
function gradeAt(t){const draws=[],stack=[],c={globalAlpha:1,save(){stack.push(this.globalAlpha)},restore(){this.globalAlpha=stack.pop()},drawImage(im){draws.push({key:im.key,alpha:this.globalAlpha})}};gradeResources.fx=characterFxAt(data,t);drawGradedImage(c,gradeResources,'full',[0,0,1,1]);return {amount:gradeResources.fx.amount,mode:gradeResources.fx.mode,draws}}
const characterTailChecks=data.cues.characterFx.map(cue=>{const life=cue.end-cue.start,times=[cue.start+Math.min(.10,life*.1),(cue.start+cue.end)/2,cue.end-1/60],samples=times.map(gradeAt),stable=samples.every(s=>s.amount===samples[0].amount&&JSON.stringify(s.draws)===JSON.stringify(samples[0].draws));check(stable,'characterGradeHoldsUntilCut',{start:cue.start,end:cue.end,mode:cue.mode,samples});return {start:cue.start,end:cue.end,mode:cue.mode,times,samples,stable}});
const inputChanges=[];for(const p of files)if(sourceHashes[p]!==hash(await readFile(path.join(root,p))))inputChanges.push(p);check(!inputChanges.length,'inputsStableDuringCheck',inputChanges);
warnings.push('15 Hz checks concern per-glyph corruption after decoding. Exact decodeAt reveal thresholds are graphic choreography and are not claimed as vocal word timing.');
warnings.push('Parameter/data checks do not replace actual encoded-frame readability, contrast-transition screening or artistic playback review.');
const report={schemaVersion:1,scope:'All seven authored repeat clusters get medium glitch; actual parameter/cue calls and character grading path checked without media/source mutation.',sourceHashes,inputChanges,signalWindows:SIGNAL_WINDOWS,clusters,lineChecks,cueCounts,damageClockChecks,mediumStats,heavyStats,outsideStats,protectedOverlap,readability,boundaryChecks,baselineComparison,determinism,characterTailChecks,failures,warnings,passed:failures.length===0};
const output=path.resolve(root,process.argv[2]||'export/loop-glitch-regression.json');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,repeatClusters:clusters.length,repeatLines:lineChecks.length,cueCounts,damageClockChecks:damageClockChecks.length,mediumStats,heavyStats,outsideStats,protectedOverlap,readability,boundaryChecks:boundaryChecks.length,baselineComparison,determinism,characterTailChecks:characterTailChecks.length,failedChecks:failures.length,firstFailures:failures.slice(0,8),output},null,2));if(!report.passed)process.exitCode=1;
