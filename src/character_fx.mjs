// Precomputed grades preserve fast, deterministic cutout animation.
const fract=x=>x-Math.floor(x);
export function characterFxAt(data,t){
 const cue=data.cues.characterFx?.find(c=>t>=c.start&&t<c.end);if(!cue)return {mode:'none',amount:0};
 const p=(t-cue.start)/(cue.end-cue.start);
 const a=data.features?.onsets||[],pulse=+a[Math.min(a.length-1,Math.max(0,Math.round(t*(data.features?.featureRate||20))))]||0;
 // 调色持续到切镜；图像转场负责衔接，不能先退回原色再切走。
 return {...cue,progress:p,amount:cue.intensity??1,pulse,t};
}
function styleFor(fx){
 const a=fx?.amount||0;if(a<.001)return {style:null,mix:0};
 switch(fx.mode){
  case 'mono':return {style:'mono',mix:a};
  case 'defocus':return {style:'soft',mix:a};
  case 'print':return {style:'ink',mix:a};
  case 'blueprint':return {style:'negative',mix:a};
  case 'thermal':return {style:'ink',mix:a*.8};
  case 'ghost':return {style:'soft',mix:a*.65};
  case 'memory':return {style:'soft',mix:a*.22};
  case 'fade':return {style:'mono',mix:a*.9};
  default:return {style:null,mix:0};
 }
}
function gradeSet(resources,style){
 if(!style||!resources.gradeMap?.[style])return resources;
 resources.gradeSets??=new Map();if(resources.gradeSets.has(style))return resources.gradeSets.get(style);
 const set=Object.create(resources);for(const [key,fxkey] of Object.entries(resources.gradeMap[style]))if(resources[fxkey])set[key]=resources[fxkey];resources.gradeSets.set(style,set);return set;
}
export function drawGradedImage(c,resources,key,args){
 const original=resources[key];if(!original)return;const {style,mix}=styleFor(resources.fx),graded=gradeSet(resources,style)[key];
 c.drawImage(original,...args);if(mix>.001&&graded!==original){c.save();c.globalAlpha*=mix;c.drawImage(graded,...args);c.restore()}
}
function canvasFor(resources,key,width,height){
 if(!resources.makeCanvas)return null;resources.characterFxCache??=new Map();
 // 尺寸进键，且画布一旦创建就不再改尺寸：改 canvas.width 会让浏览器换一条重采样路径，
 // 同一时刻的两次渲染因此出现亚像素差异（转场会把上一镜的画布改成不同尺寸）。
 const slot=`${key}@${width}x${height}`;
 let canvas=resources.characterFxCache.get(slot);
 if(!canvas){canvas=resources.makeCanvas(width,height);resources.characterFxCache.set(slot,canvas);
  while(resources.characterFxCache.size>24)resources.characterFxCache.delete(resources.characterFxCache.keys().next().value)}
 return canvas;
}
// reset() 只重置绘制状态，不会清空画布；复用画布时必须显式清一次，
// 否则上一帧的分级层会叠加累积，同一时刻的两次渲染就不一样了。
function reset(ctx,w,h){if(ctx.reset)ctx.reset();else{ctx.setTransform(1,0,0,1,0,0)}ctx.clearRect(0,0,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over'}
function bodyCanvas(resources,pose,t,wind,targetH,drawRaw,key,style=null,mix=0){
 const im=resources[pose]||resources.full;if(!im)return null;const rig=resources.rigData?.[pose],w=rig?.width||im.width,h=rig?.height||im.height,pad=32,raster=Math.min(1,targetH/h);
 const canvas=canvasFor(resources,`${pose}:${key}`,Math.ceil((w+pad*2)*raster),Math.ceil((h+pad*2)*raster));if(!canvas)return null;const ctx=canvas.getContext('2d');reset(ctx,canvas.width,canvas.height);ctx.scale(raster,raster);
 if(mix<.999)drawRaw(ctx,resources,t,w/2+pad,h+pad,h,pose,wind,1);
 if(style&&mix>.001){ctx.globalAlpha=mix;drawRaw(ctx,gradeSet(resources,style),t,w/2+pad,h+pad,h,pose,wind,1)}
 return {canvas,w,h,pad,raster};
}
// 染色只需要角色的形状，半分辨率足够：整帧尺寸的拷贝是全片最贵的像素搬运之一。
const TINT_SCALE=.5;
function tint(resources,source,color,key){
 const w=Math.max(1,Math.round(source.canvas.width*TINT_SCALE)),h=Math.max(1,Math.round(source.canvas.height*TINT_SCALE));
 const canvas=canvasFor(resources,key,w,h),ctx=canvas.getContext('2d');reset(ctx,w,h);ctx.drawImage(source.canvas,0,0,w,h);ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';return canvas;
}
export function drawCharacterFx(c,resources,t,x,y,h,pose,wind,opacity,drawRaw){
 // 崩坏后期的人物降级：授权窗口内的人物短暂换成线稿 / 黑白 / 灰度。
 const override=resources.fxOverride;
 if(override&&override.style&&override.mix>.001){
  const degraded=bodyCanvas(resources,pose,t,wind,h,drawRaw,'degrade',override.style,override.mix);
  if(degraded){
   const k=h/degraded.h,dx=x-(degraded.w/2+degraded.pad)*k,dy=y-(degraded.h+degraded.pad)*k,dw=degraded.canvas.width*k/degraded.raster,dh=degraded.canvas.height*k/degraded.raster;
   c.save();c.globalAlpha*=opacity;c.drawImage(degraded.canvas,dx,dy,dw,dh);c.restore();return;
  }
 }
 const fx=resources.fx||{mode:'none',amount:0},a=fx.amount||0;
 if(a<.001){drawRaw(c,resources,t,x,y,h,pose,wind,opacity);return}
 const {style,mix}=styleFor(fx),source=bodyCanvas(resources,pose,t,wind,h,drawRaw,'current',style,mix);
 if(!source){drawRaw(c,gradeSet(resources,style),t,x,y,h,pose,wind,opacity);return}
 const k=h/source.h,dx=x-(source.w/2+source.pad)*k,dy=y-(source.h+source.pad)*k,dw=source.canvas.width*k/source.raster,dh=source.canvas.height*k/source.raster;
 c.save();c.globalAlpha*=opacity;
 if(fx.mode==='thermal'||fx.mode==='ghost'||fx.mode==='blueprint'){
  const past=bodyCanvas(resources,pose,Math.max(0,t-.085),wind,h,drawRaw,'past','mono',1);c.save();c.globalAlpha*=a*.19;c.drawImage(past.canvas,dx-15*a,dy+4*a,dw,dh);c.restore();
 }
 if(fx.mode==='thermal'||fx.mode==='blueprint'){
  const shift=(4+fx.pulse*7)*a,cyan=tint(resources,source,'#9DE4C2',`${pose}:cyan`),red=tint(resources,source,'#D93B4A',`${pose}:red`);
  c.save();c.globalAlpha*=a*.43;c.drawImage(cyan,dx-shift,dy-2*a,dw,dh);c.drawImage(red,dx+shift,dy+2*a,dw,dh);c.restore();
 }
 c.drawImage(source.canvas,dx,dy,dw,dh);
 if(fx.mode==='thermal'&&a>.1){
  const step=Math.floor(t*5),band=source.h*(.45+fract(Math.sin(step*12.7)*43758)*.32),bh=source.h*.012;
  c.save();c.beginPath();c.rect(dx,dy+(band+source.pad)*k,dw,bh*k);c.clip();c.globalAlpha*=a*.5;c.drawImage(source.canvas,dx+Math.sin(step*8.13)*12*a,dy,dw,dh);c.restore();
 }
 c.restore();
}
