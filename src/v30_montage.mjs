const W=1920,H=1080;
const cuts = new Map([
  [4049,'paper-city'], [4051,'red-city'], [4053,'eye-ink'],
  [4059,'eye-negative'], [4068,'red-city'], [4069,'portrait-rgb'],
  [4072,'eye-mono'], [4075,'red-city'], [4077,'portrait-afterimage'],
  [4086,'paper-city'], [4088,'eye-ink'], [4092,'red-city'],
  [4093,'portrait-rgb'], [4094,'paper-city'], [4099,'eye-negative'],
  [4105,'red-city'], [4106,'eye-ink'], [4107,'paper-city'],
  [4109,'portrait-afterimage'], [4112,'red-city'],
]);
// The third value is the V32 hold in frames, ending on a beat or the shot cut.
const accents = new Map([
  [3070,['red-city',19,Infinity]], [3074,['portrait-afterimage',17]],
  [3075,['eye-ink',17,Infinity]], [3079,['paper-city',18,40]],
  [3084,['eye-negative',17,59]], [3091,['red-city',18,20]], [3096,['paper-city',17,40]],
  [4004,['red-city',19,60]], [4016,['paper-city',18,60]],
  [4028,['portrait-afterimage',16]], [4032,['eye-negative',18,59]],
]);
const buffers = new WeakMap();
const lineArtOffsets = new Map([
  [3079,20], [3084,39], [3091,20], [3096,20],
  [4004,40], [4016,39], [4032,39],
]);
const lineArtStyles = new Set(['red-city','paper-city','eye-ink','eye-negative']);
const flashSeconds=.13333333333333333;

export function lineArtEntry(shot) {
  const style=accents.get(shot?.id)?.[0]??cuts.get(shot?.id);
  if(!lineArtStyles.has(style))return null;
  const shotFrames=Math.round((shot.end-shot.start)*60);
  const offset=lineArtOffsets.get(shot.id)??Math.floor(shotFrames/2);
  return shot.start+offset/60;
}

export function montageAt(data, shot, time) {
  const entry=data.v33 ? lineArtEntry(shot) : null;
  if(entry!==null){
    return time+1e-8>=entry&&time+1e-8<shot.end
      ? accents.get(shot.id)?.[0]??cuts.get(shot.id) : undefined;
  }
  const accent=data.v31&&accents.get(shot?.id);
  if(accent){
    const [style, shortHold, lineHold=shortHold]=accent;
    const frames=data.v32 ? lineHold : shortHold;
    const end=Math.min(shot.end,shot.start+frames/60);
    if(time+1e-8>=shot.start&&time+1e-8<end)return style;
  }
  return data.v30 ? cuts.get(shot?.id) : undefined;
}

export const hasMontageAccent = (data, shot) => data.v31&&accents.has(shot?.id);
export const isPaperMontage = style => style==='paper-city'||style==='eye-ink';

function cityInk(c,t,resources,scene,shot,music,paper) {
  if(!resources.makeCanvas||!resources.frontSpace)return false;
  let state=buffers.get(resources);
  if(!state){
    const canvas=resources.makeCanvas(768,432);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    state={canvas,ctx,luma:new Float32Array(canvas.width*canvas.height)};
    buffers.set(resources,state);
  }
  const {canvas,ctx,luma}=state, w=canvas.width,h=canvas.height;
  ctx.setTransform(w/W,0,0,h/H,0,0);
  if(!resources.frontSpace(ctx,'city',t,shot,music,scene))return false;
  const frame=ctx.getImageData(0,0,w,h), rgba=frame.data;
  for(let i=0,j=0;i<luma.length;i++,j+=4)
    luma[i]=rgba[j]*.36+rgba[j+1]*.49+rgba[j+2]*.15;
  for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){
    const left=x===0?i:i-1, right=x===w-1?i:i+1;
    const upper=y===0?i:i-w, below=y===h-1?i:i+w;
    const dx=luma[right]-luma[left],dy=luma[below]-luma[upper];
    const edge=Math.min(1,Math.max(0,(Math.abs(dx)*.94+Math.abs(dy)*.86-8)/42));
    const j=i*4;
    if(paper){
      const white=246-24*(1-luma[i]/255);
      rgba[j]=white-edge*204; rgba[j+1]=white-2-edge*205; rgba[j+2]=white-7-edge*202;
    }else{
      rgba[j]=11+luma[i]*.05+edge*222; rgba[j+1]=6+edge*36; rgba[j+2]=13+edge*47;
    }
    rgba[j+3]=255;
  }
  ctx.putImageData(frame,0,0);
  c.drawImage(canvas,0,0,W,H);
  return true;
}

function eyes(c,resources,shot,age,style) {
  const image=style==='eye-ink'?resources.fx_ink_eyes
    :style==='eye-negative'?resources.fx_negative_eyes:resources.fx_mono_eyes;
  if(!image)return false;
  const width=image.naturalWidth||image.width, height=image.naturalHeight||image.height;
  const tight=shot.id%2===0;
  const sw=width*(tight?.75:.90), sh=sw*H/W;
  const sx=(width-sw)*(shot.id%3===0?.17:.81);
  const sy=Math.max(0,Math.min(height-sh,height*(tight?.14:.043)));
  const zoom=1+.095*Math.max(0,1-age*7);
  c.save();
  c.translate(W/2,H/2);c.scale(zoom,zoom);
  c.drawImage(image,sx,sy,sw,sh,-W/2,-H/2,W,H);
  c.restore();
  if(style!=='eye-ink'){
    c.save();c.globalCompositeOperation='multiply';c.globalAlpha=style==='eye-negative'?.37:.65;
    c.fillStyle=style==='eye-negative'?'#78d7dc':'#da3759';c.fillRect(0,0,W,H);c.restore();
  }
  c.fillStyle=style==='eye-ink'?'#15121e':'#0b0912';
  c.fillRect(0,0,W,39);c.fillRect(0,H-39,W,39);
  return true;
}

function portrait(c,t,resources,scene,shot,music,age,style) {
  const image=resources[shot.pose]||resources.fear||resources.full;
  if(!image)return false;
  if(!resources.frontSpace?.(c,'city',t,shot,music,scene)){
    c.fillStyle='#180e19';c.fillRect(0,0,W,H);
  }
  c.fillStyle='#0a06108a';c.fillRect(0,0,W,H);
  const h=1240, w=h*(image.naturalWidth||image.width)/(image.naturalHeight||image.height);
  const x=(shot.id%2?1280:750)-w/2,y=H-h+36;
  const decay=Math.exp(-age*9);
  c.save();
  if(style==='portrait-rgb'){
    c.globalCompositeOperation='screen';
    c.globalAlpha=.55;
    c.filter='grayscale(1) sepia(1) saturate(6) hue-rotate(312deg)';
    c.drawImage(image,x-53*decay-14,y+5,w,h);
    c.filter='grayscale(1) sepia(1) saturate(4) hue-rotate(142deg)';
    c.drawImage(image,x+63*decay+14,y-9,w,h);
    c.globalCompositeOperation='source-over';c.globalAlpha=1;c.filter='none';
    c.drawImage(image,x,y,w,h);
  }else{
    c.globalCompositeOperation='screen';
    for(let n=3;n>=1;n--){
      c.globalAlpha=.21-n*.028;
      c.filter='grayscale(1) sepia(1) saturate(5) hue-rotate(310deg)';
      c.drawImage(image,x+n*(40+37*decay),y-n*14,w,h);
    }
    c.globalCompositeOperation='source-over';
    c.globalAlpha=1;c.filter='grayscale(1) contrast(1.37)';
    c.drawImage(image,x,y,w,h);
  }
  c.restore();
  return true;
}

export function lineArtFlashAge(data, shot, time) {
  if(!data.v33)return null;
  const entry=lineArtEntry(shot);
  if(entry===null||time+1e-8<entry||time+1e-8>=shot.end)return null;
  const age=Math.max(0,time-entry);
  return age+1e-8<flashSeconds ? age : null;
}

export function drawLineArtFlash(c,shot,age,style,width,height){
  const red=style==='red-city', eye=style.startsWith('eye-');
  const x=eye?(shot.id%2===0?720:1140):960, y=eye?500:490;
  const phase=age/flashSeconds, strength=(1-phase)**2;
  const radius=590+860*phase;
  const color=red?'255,26,52':'255,255,255';
  c.save();
  c.setTransform(width/W,0,0,height/H,0,0);
  c.globalCompositeOperation='screen';
  const glow=c.createRadialGradient(x,y,0,x,y,radius);
  glow.addColorStop(0,'rgba('+color+',.94)');
  glow.addColorStop(.18,'rgba('+color+',.57)');
  glow.addColorStop(.54,'rgba('+color+',.17)');
  glow.addColorStop(1,'rgba('+color+',0)');
  c.globalAlpha=strength;
  c.fillStyle=glow;
  c.fillRect(0,0,W,H);

  const spread=245+760*phase;
  c.fillStyle=red?'#ff2348':'#ffffff';
  for(let i=0;i<26;i++){
    const angle=i*2*Math.PI/26+Math.sin(i*13.17+shot.id)*.14;
    const inner=spread*(.37+(i%5)*.115), outer=inner+300+(i%7)*96;
    const halfWidth=i%3===0?.014:.0055;
    c.globalAlpha=strength*(.26+(i%5)*.12);
    c.beginPath();
    c.moveTo(x+Math.cos(angle-halfWidth)*inner,y+Math.sin(angle-halfWidth)*inner);
    c.lineTo(x+Math.cos(angle)*outer,y+Math.sin(angle)*outer);
    c.lineTo(x+Math.cos(angle+halfWidth)*inner,y+Math.sin(angle+halfWidth)*inner);
    c.closePath();
    c.fill();
  }
  c.restore();
}

export function drawFinaleMontage(c,t,resources,scene,shot,music,style,entry=shot.start){
  if(style==='red-city'||style==='paper-city')return cityInk(c,t,resources,scene,shot,music,style==='paper-city');
  const age=Math.max(0,t-entry);
  return style.startsWith('eye-')?eyes(c,resources,shot,age,style):
    portrait(c,t,resources,scene,shot,music,age,style);
}
