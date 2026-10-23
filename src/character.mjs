const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
export function blinkAt(t){const q=((t+1.37)%4.73+4.73)%4.73;return q<.07?ease(q/.07):q<.13?1:q<.23?1-ease((q-.13)/.1):0}
export function layerAngle(layer,t,wind=.3){
 const phase=[...layer.name].reduce((a,c)=>a+c.charCodeAt(0)*.13,0),s=layer.name.startsWith('ear')?Math.sin(t*1.8+phase)*.68+Math.sin(t*4.1+phase)*.2:layer.name==='tail'?Math.sin(t*.9+phase):layer.name==='raised_hand'?Math.sin(t*.7+phase)*.7+.18*Math.sin(t*1.8):Math.sin(t*1.6+phase)*.8+Math.sin(t*2.8+phase)*.15;
 return (layer.amplitudeDeg||0)*Math.PI/180*s*(.38+.62*clamp(wind/1.2));
}
export function drawCharacter(c,resources,t,x,y,h,expression='full',wind=.3,opacity=1){
 const image=resources[expression]||resources.full;if(!image)return;
 const rig=resources.rigData?.[expression],sourceH=rig?.height||image.height,sourceW=rig?.width||image.width,scale=h/sourceH;
 c.save();c.globalAlpha*=opacity;c.translate(x,y+Math.sin(t*1.75)*1.5);c.rotate(Math.sin(t*.48)*.0035);c.scale(scale,scale*(1+Math.sin(t*1.75)*.0015));c.translate(-sourceW/2,-sourceH);
 if(rig?.layers?.length&&resources[rig.baseImageKey]){
  const ordered=[{name:'base',imageKey:rig.baseImageKey,drawOrder:rig.baseDrawOrder??20},...rig.layers.filter(l=>l.available)].sort((a,b)=>a.drawOrder-b.drawOrder);
  for(const layer of ordered){const im=resources[layer.imageKey];if(!im)continue;c.save();if(layer.pivot){const [px,py]=layer.pivot;c.translate(px,py);c.rotate(layerAngle(layer,t,wind));c.translate(-px,-py)}c.drawImage(im,0,0,sourceW,sourceH);c.restore()}
 }else c.drawImage(image,0,0,sourceW,sourceH);
 const blink=rig?.blink;if(blink?.available&&resources[blink.imageKey]){const a=blinkAt(t);if(a>0){c.save();c.globalAlpha*=a;c.drawImage(resources[blink.imageKey],0,0,sourceW,sourceH);c.restore()}}
 c.restore();
}
