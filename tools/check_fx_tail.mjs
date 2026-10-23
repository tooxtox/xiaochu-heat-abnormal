// Regression: shot grades remain applied up to the cut, for both body and inserts.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {characterFxAt,drawCharacterFx,drawGradedImage} from '../src/character_fx.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let native;try{native=createRequire(import.meta.url)('@napi-rs/canvas')}catch{native=createRequire(path.join(process.env.CODEX_NODE_MODULES||path.join(process.cwd(), 'node_modules'),'package.json'))('@napi-rs/canvas')}
const {createCanvas}=native;
const data={cues:JSON.parse(await readFile(path.join(root,'data/cues.json'),'utf8')),features:JSON.parse(await readFile(path.join(root,'data/audio_features.json'),'utf8'))};
const swatch=color=>{const im=createCanvas(16,16),c=im.getContext('2d');c.fillStyle=color;c.fillRect(0,0,16,16);return im};
const resources={makeCanvas:createCanvas,full:swatch('#30a060'),mono:swatch('#909090'),soft:swatch('#bcc0c4'),ink:swatch('#222222'),negative:swatch('#c06090'),gradeMap:Object.fromEntries(['mono','soft','ink','negative'].map(s=>[s,{full:s}]))};
const canvas=createCanvas(64,64),c=canvas.getContext('2d');
const raw=(ctx,res,t,x,y,h)=>ctx.drawImage(res.full,x-h/2,y-h,h,h);
const pixel=(fx,body)=>{c.reset();c.clearRect(0,0,64,64);resources.fx=fx;if(body)drawCharacterFx(c,resources,fx.t,32,48,16,'full',0,1,raw);else drawGradedImage(c,resources,'full',[24,32,16,16]);return [...c.getImageData(32,40,1,1).data]};
const closeBody=(actual,expected,message)=>assert(actual.every((v,i)=>Math.abs(v-expected[i])<=2),message);
const report={scope:'Actual Canvas body and macro grading on controlled color swatches. All current cue tails sampled at 60Hz; body tolerance 2 channel levels for thermal subpixel bands, macro exact. Checks color persistence, not complete film appearance.',shots:[],tailSamples:0,passed:false};
for(const cue of data.cues.characterFx){
 const mid=characterFxAt(data,(cue.start+cue.end)/2),macro=pixel(mid,false),body=pixel(mid,true);let count=0;
 for(let frame=Math.ceil(Math.max(cue.start,cue.end-2)*60);frame/60<cue.end;frame++){
  const t=frame/60,fx=characterFxAt(data,t);
  assert.equal(fx.mode,cue.mode);assert.deepEqual(pixel(fx,false),macro,`${cue.mode} macro loses grade at ${t}`);closeBody(pixel(fx,true),body,`${cue.mode} body loses grade at ${t}`);count++;
 }
 const last=characterFxAt(data,cue.end-1/60);assert.deepEqual(pixel(last,false),macro);closeBody(pixel(last,true),body,`${cue.mode} loses grade on last frame`);
 assert.notDeepEqual(macro,pixel({mode:'none',amount:0,t:cue.end},false),`${cue.mode} never applies a grade`);
 report.shots.push({start:cue.start,end:cue.end,mode:cue.mode,samples:count,macro,body});report.tailSamples+=count;
}
assert.equal(characterFxAt({cues:{characterFx:[]}},20).amount,0);
assert.deepEqual(characterFxAt({cues:{characterFx:[{start:1,end:2,mode:'mono',intensity:1}]}},2),{mode:'none',amount:0});
assert.deepEqual(pixel({mode:'mono',amount:0,t:1},false),pixel({mode:'none',amount:0,t:1},false));
report.passed=true;await writeFile(path.join(root,'export/fx-tail-regression.json'),JSON.stringify(report,null,2));
console.log(`PASS: ${report.shots.length} cue tails, ${report.tailSamples} samples; body/macro grades held through last frame, outside cues/toggle-off ungraded.`);
