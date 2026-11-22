import {
  W, H, alpha, arc, circle, clamp, contactShadow, fract, hash,
  line, mix, path, smooth, volumeBeam,
} from './scene_layers.mjs';

const navy='#06121E', near='#0A1C2B', teal='#3A7792', cyan='#8BDCF1';
const pale='#D1EFFF', dark='#03101A', ember='#F4C48C';
const TAU=2*Math.PI;

function fill(c,color,x=0,y=0,w=W,h=H){
  c.fillStyle=color;
  c.fillRect(x,y,w,h);
}

function light(c,x,y,r,color,strength){
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,alpha(color,strength));
  g.addColorStop(.28,alpha(color,strength*.58));
  g.addColorStop(1,alpha(color,0));
  fill(c,g,x-r,y-r,2*r,2*r);
}

function ellipse(c,x,y,rx,ry,color,w=0,rotation=0){
  c.beginPath();
  c.ellipse(x,y,rx,ry,rotation,0,TAU);
  if(w){
    c.lineWidth=w;
    c.strokeStyle=color;
    c.stroke();
  }else{
    c.fillStyle=color;
    c.fill();
  }
}

function label(c,jp,en,x,y,color=pale){
  c.save();
  c.fillStyle=alpha(color,.9);
  c.font='25px "Noto Sans JP",sans-serif';
  c.fillText(jp,x,y);
  c.fillStyle=alpha(color,.52);
  c.font='14px Consolas,monospace';
  c.fillText(en,x+1,y+27);
  c.restore();
}

// The same small amber pulse carries the signal through all locations.
function packet(c,x,y,r,t,strength=.7){
  light(c,x,y,r*9,ember,.54*strength);
  c.beginPath();
  const rotation=t*.82;
  for(let i=0;i<4;i++){
    const a=rotation+i*Math.PI/2, px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;
    if(i)c.lineTo(px,py);else c.moveTo(px,py);
  }
  c.closePath();
  c.fillStyle=alpha(ember,.83*strength);
  c.fill();
  fill(c,alpha('#FFF3CE',strength),x-r*.23,y-r*.23,r*.46,r*.46);
}

function floes(c,t,count,amount,x=960,y=500){
  for(let i=0;i<count;i++){
    const q=fract(hash(i*8.1)+t*(.012+hash(i*.42)*.027));
    const dx=(hash(i+13.5)-.5)*2600;
    const dy=(hash(i*.41+213)-.5)*1550;
    const z=.55+q*q*.83;
    const xx=x+dx*z,yy=y+dy*z;
    const opacity=Math.sin(q*Math.PI)*(.045+.31*hash(i*8.8))*amount;
    const r=.65+hash(i*22.9)*q*q*4;
    const tail=.011+.006*amount;
    if(i%7===0)line(c,xx,yy,xx-dx*tail,yy-dy*tail,alpha(cyan,opacity*.7),r*.68);
    fill(c,alpha(i%13?pale:ember,opacity),xx,yy,r,r);
  }
}

function surface(c,t,horizon,vx,level=.8){
  const g=c.createLinearGradient(0,horizon,0,H);
  g.addColorStop(0,alpha('#153D55',.73));
  g.addColorStop(.24,alpha('#102939',.94));
  g.addColorStop(1,navy);
  fill(c,g,0,horizon,W,H-horizon);
  for(let i=0;i<14;i++){
    const y=horizon+Math.pow(i/14,2.8)*(H-horizon+120);
    line(c,-20,y,W+20,y,alpha(teal,.22*level),.8+i*.08);
  }
  for(let i=-10;i<=10;i++){
    line(c,vx+i*13,horizon-5,vx+i*208,H+80,alpha(teal,.32*level),1.2);
  }
  for(let i=0;i<65;i++){
    const q=hash(i+48),r=hash(i*8+64);
    const x=r*W,y=horizon+(H-horizon)*q;
    const stretch=(20+110*q)*(.45+hash(i+4));
    const blink=.53+.47*Math.sin(i*2.1+t*(1.0+.5*q));
    line(c,x,y,x+stretch,y,alpha(cyan,(.055+.16*q)*level*blink),.7+q*1.4);
  }
}

function door(c,x,y,w,h,opening,t,onset){
  const x0=x-w/2,x1=x+w/2,y1=y+h;
  const cut=30;
  path(c,[[x0,y+cut],[x0+cut,y],[x1-cut,y],[x1,y+cut],[x1,y1],[x0,y1]],'#0B1A29',true);
  c.save();
  c.beginPath();
  c.rect(x0+24,y+19,w-48,h-19);
  c.clip();
  const g=c.createLinearGradient(x,0,x1,0);
  g.addColorStop(0,'#74AFC4');
  g.addColorStop(1,'#17354A');
  fill(c,g,x0,y,w,h);
  for(let i=0;i<8;i++)line(c,x0,y+35+i*(h-25)/8,x1,y+41+i*(h-25)/8,alpha(pale,.20),2);
  const width=(w/2-3)*(1-opening);
  fill(c,'#112939',x0,y,width,h);
  fill(c,'#112939',x1-width,y,width,h);
  for(const px of [x0+width,x1-width]){
    line(c,px,y+14,px,y1,alpha(cyan,.37+onset*.42),4);
    light(c,px,y1-5,140,cyan,.34);
  }
  c.restore();
  path(c,[[x0,y1],[x0,y+cut],[x0+cut,y],[x1-cut,y],[x1,y+cut],[x1,y1]],alpha(cyan,.38),false,4);
  const led=opening>.32?cyan:ember;
  fill(c,alpha(led,.62+.22*Math.cos(t*2)),x-16,y-15,32,4);
}

function trace(c,data,t,x,y,w,h,read=1){
  const f=data.features||{};
  const bars=52;
  for(let i=0;i<=bars;i++){
    const k=Math.floor((t+(i/bars-.78)*2.45)*(f.featureRate||20));
    const value=f.envelope?.[k]??0;
    const px=x+w*i/bars, size=(.05+value*.85)*h;
    if(i%4===0)line(c,px,y-h*.45,px,y+h*.45,alpha(teal,.18),1);
    if(i/bars<=read){
      line(c,px,y-size*.5,px,y+size*.5,alpha(cyan,.40+value*.40),1.3);
    }
  }
  line(c,x,y,x+w*read,y,alpha(pale,.49),1);
}

function archive(c,s){
  const {t,shot,music,p,resources,drawCharacter,drawLyricBack}=s;
  const far=shot.coldScene==='archive';
  const returnShot=shot.coldScene==='return';
  const hx=far?990:returnShot?1120:1200;
  const hy=far?654:665;
  fill(c,navy);
  light(c,hx,365,940,teal,.42);
  for(let i=4;i>=0;i--){
    const z=i/4,xx=mix(350,52,z),yy=mix(249,-110,z);
    path(c,[[xx-8,hy+260*z],[xx+30,yy+175],[xx+185,yy],[W-xx-185,yy],[W-xx-30,yy+175],[W-xx+8,hy+260*z]],alpha(teal,.11+.24*(1-z)),false,2+z*5);
  }
  for(let i=0;i<5;i++){
    const x=159+i*401;
    volumeBeam(c,t,{x,y:144,spread:64,length:492,angle:-.28,color:cyan,strength:.081,dust:false});
  }
  surface(c,t,hy,hx,.6);
  door(c,hx,376,far?285:255,hy-376,far?.08:returnShot?.21:.035,t,music.onset);
  for(const direction of [-1,1]){
    const x=hx+direction*580;
    path(c,[[x-112,495],[x+140,505],[x+176,849],[x-120,842]],near,true);
    path(c,[[x-94,504],[x+127,513],[x+152,728],[x-104,718]],alpha(teal,.36),true);
    for(let j=0;j<6;j++){
      const y=522+j*31;
      line(c,x-88,y,x+120+j*3,y+8,alpha(cyan,.09+j*.024),2);
    }
  }
  if(far){
    light(c,hx,hy+16,290,cyan,.23);
    drawLyricBack?.();
    drawCharacter?.(1360,931,397,'full',.13,.98,{placed:true});
    label(c,'浸水アーカイブ','SUBLEVEL / ARCHIVE',141,866);
    rail(c,0,972,610,806);
    rail(c,W,981,1595,834);
    return;
  }
  const x=returnShot?1208:1330,y=1008;
  const pose=resources.v16Look?'v16Look':'calm';
  drawLyricBack?.();
  drawCharacter?.(x,y,returnShot?845:796,pose,.19,1,{placed:true});
  light(c,814,722,474,cyan,.15+music.onset*.09);
  contactShadow(c,{x:1120,y:1039,rx:570,ry:35,color:dark,strength:.76});
  const face=[[215,883],[1330,834],[1597,944],[388,1010]];
  path(c,face,'#112B3B',true);
  path(c,[[388,1010],[1597,944],[1597,1065],[388,1130]],dark,true);
  line(c,388,1010,1597,944,alpha(cyan,.50),4);
  path(c,[[271,908],[665,888],[739,937],[345,964]],'#12374B',true);
  for(let i=0;i<11;i++){
    const q=i/11;
    line(c,mix(294,669,q),mix(917,900,q),mix(355,716,q),mix(949,926,q),alpha(cyan,.35),2);
  }
  c.save();
  c.transform(1,-.089,.16,1,547,711);
  fill(c,'#102B3C',0,0,552,143);
  fill(c,alpha(cyan,.18),6,5,540,132);
  light(c,274,59,227,returnShot?ember:cyan,.27);
  trace(c,s.data,t,37,68,469,76,.94);
  packet(c,490,66,8+music.onset*4,t,.58+p*.31);
  c.restore();
  label(c,returnShot?'復元完了':'微弱な応答',returnShot?'PACKET RECOVERED':'WEAK RETURN',156,755);
}

function rail(c,x,y,endX,endY){
  line(c,x,y+9,endX,endY+9,'#06121E',18);
  line(c,x,y,endX,endY,alpha('#739DB8',.55),4);
  for(let i=0;i<4;i++){
    const r=i/4,px=mix(x,endX,r),py=mix(y,endY,r);
    line(c,px,py,px,py+90*(1-r),alpha(dark,.95),12*(1-r));
  }
}

function screen(c,s,rebuild=false){
  const {t,p,data,music,drawLyricBack}=s;
  fill(c,'#081625');
  light(c,914,570,950,teal,.34);
  c.save();
  c.translate(960,540);
  c.rotate(rebuild?-.075:.065);
  c.scale(1+p*.055,1+p*.055);
  fill(c,dark,-782,-424,1564,850);
  fill(c,'#173E51',-756,-397,1512,796);
  const panel=c.createLinearGradient(0,-378,0,378);
  panel.addColorStop(0,'#0C2433');
  panel.addColorStop(1,'#112F43');
  fill(c,panel,-743,-383,1486,762);
  for(let j=-7;j<=7;j++)line(c,-738,j*49,738,j*49,alpha(cyan,.085),1);
  for(let j=-10;j<=10;j++)line(c,j*68,-383,j*68,379,alpha(cyan,.085),1);
  for(let i=0;i<4;i++){
    const y=-194+i*128;
    trace(c,data,t-i*.43,-661,y,1322,i===1?246:129,rebuild?.25+.72*smooth(p*1.8):1);
  }
  const pos=(rebuild?638*smooth(p*1.5):40+445*p)-285;
  line(c,pos,-344,pos,304,alpha(ember,.54),1);
  packet(c,pos,-61,20+music.onset*10,t,.94);
  label(c,rebuild?'信号を再構成':'音声ではない',rebuild?'RECONSTRUCTING SIGNAL':'UNCLASSIFIED RETURN',-668,-267);
  for(let i=0;i<21;i++)fill(c,alpha(i%7===0?ember:cyan,.18+hash(i)*.22),-664+i*63,318,22,5);
  c.restore();
  drawLyricBack?.();
}

function waterColumn(c,x,y,angle,span,color,brightness){
  const g=c.createLinearGradient(x,y,x+Math.cos(angle)*span,y+Math.sin(angle)*span);
  g.addColorStop(0,alpha(color,brightness));
  g.addColorStop(.84,alpha(color,brightness*.31));
  g.addColorStop(1,alpha(color,0));
  path(c,[[x-34,y],[x+38,y],[x+Math.cos(angle)*span+290,y+Math.sin(angle)*span],[x+Math.cos(angle)*span-261,y+Math.sin(angle)*span]],g,true);
}

function caustics(c,t,x,y,r,strength){
  c.save();
  c.translate(x,y);
  c.rotate(-.12);
  c.scale(1,.29);
  for(let i=0;i<19;i++){
    const q=fract(i*.1442+t*.058),a=hash(i+45)*TAU+t*.17;
    const size=r*(.18+.92*q);
    c.beginPath();
    for(let j=0;j<=32;j++){
      const angle=a+j/(32)*(1.03+hash(i+30)*1.15);
      const wave=size+(8+q*32)*Math.sin(angle*3+t*.63+i*.42);
      const px=Math.cos(angle)*wave,py=Math.sin(angle)*wave;
      if(j)c.lineTo(px,py);else c.moveTo(px,py);
    }
    c.strokeStyle=alpha(cyan,strength*Math.sin(q*Math.PI));
    c.lineWidth=.8+q*2.7;
    c.stroke();
  }
  c.restore();
}

function rackFrame(c,x,y,scale,turn){
  const offset=112*scale*turn,w=244*scale, h=351*scale;
  const ax=x-w/2,bx=x+w/2;
  path(c,[[ax,y-h],[bx,y-h],[bx+offset,y-h-63*scale],[ax+offset,y-h-63*scale]],'#264655',true);
  path(c,[[bx,y-h],[bx+offset,y-h-63*scale],[bx+offset,y-63*scale],[bx,y]],'#0A202F',true);
  fill(c,'#173142',ax,y-h,w,h);
  const edge=alpha(cyan,.24);
  line(c,ax,y-h,bx,y-h,edge,1.7*scale);
  for(let j=0;j<9;j++){
    const yy=y-9*scale-j*36*scale;
    fill(c,dark,ax+13*scale,yy-27*scale,w-29*scale,19*scale);
    fill(c,alpha(j%3?cyan:ember,.46),ax+23*scale,yy-22*scale,6*scale,5*scale);
    line(c,ax+50*scale,yy-18*scale,bx-30*scale,yy-18*scale,alpha(teal,.63),1.3*scale);
  }
}

function overhead(c,s){
  const {t,p,music,drawLyricBack}=s;
  fill(c,navy);
  light(c,830,510,1080,teal,.56);
  c.save();
  c.translate(928-68*p,590+36*p);
  c.rotate(-.34+.16*smooth(p));
  c.scale(1.13,1.13);
  for(let i=-5;i<=5;i++){
    line(c,-1200,i*185,1200,i*185,alpha(teal,.39),1.2);
    line(c,i*215,-900,i*215,900,alpha(teal,.32),1.2);
  }
  for(let row=-2;row<=2;row++){
    for(let i=-4;i<=4;i++){
      if(i===0)continue;
      const x=i*283,y=row*255;
      path(c,[[x-139,y-34],[x+137,y-34],[x+137,y+154],[x-139,y+154]],alpha(dark,.64),true);
      path(c,[[x-95,y-86],[x+95,y-86],[x+112,y+76],[x-108,y+76]],'#182D3D',true);
      path(c,[[x-108,y+76],[x+112,y+76],[x+137,y+113],[x-138,y+113]],'#0A1C2C',true);
      line(c,x-95,y-86,x+95,y-86,alpha('#6BA1B6',.55),3);
      for(let j=0;j<7;j++){
        line(c,x-77,y-58+j*17,x+79,y-58+j*17,alpha(teal,.44),2);
      }
      fill(c,alpha(cyan,.46),x+74,y-59,8,8);
    }
  }
  waterColumn(c,-565,-760,1.19,1570,cyan,.13);
  caustics(c,t,-5,147,750,.14);
  const axisY=-286+573*smooth(p);
  line(c,0,-740,0,635,alpha(cyan,.33),3);
  for(let i=0;i<8;i++){
    const q=fract(t*.78+i/8);
    line(c,0,axisY-q*265,0,axisY-q*265+24,alpha(cyan,.34*(1-q)),3);
  }
  packet(c,0,axisY,12+music.onset*7,t,.95);
  c.restore();
  floes(c,t,85,.87,806,565);
  drawLyricBack?.();
}

function vault(c,s){
  const {t,shot,p,music,drawLyricBack}=s;
  const descent=shot.coldScene==='dive';
  const gateway=shot.coldScene==='gate';
  const ascent=shot.coldScene==='lift';
  const x=960+(gateway?185:descent?-125:ascent?95:-110)+45*Math.sin(p*Math.PI);
  const y=gateway?594:descent?466+220*smooth(p):ascent?570-250*smooth(p):590;
  fill(c,navy);
  light(c,x,y,gateway?640:1270,teal,.64);
  surface(c,t,y,x,gateway?1:.32);
  if(gateway)door(c,x,y-340,470,340,smooth(p*1.42),t,music.onset);
  for(let i=7;i>=0;i--){
    const offset=descent ? p*.53 : ascent ? -p*.41 : p*.24;
    const q=fract(.035+(i+offset)/8);
    const z=.13+q*q*1.76;
    const distance=(245+900*q)*z;
    const height=y+(gateway?640:490)*z;
    for(const side of [-1,1]){
      const xx=x+side*distance;
      if(i%2===0)rackFrame(c,xx,height,z,side===-1?1:-1);
      else{
        const top=y-790*z;
        path(c,[[xx-40*z,height],[xx-45*z,top+184*z],[xx+(x-xx)*.42,top],[x*2-(xx+(x-xx)*.42),top],[x*2-xx+45*z,top+184*z],[x*2-xx+40*z,height]],alpha(cyan,.11+q*.12),false,8*z);
      }
    }
  }
  waterColumn(c,x+80,-80,1.91,940,cyan,.21);
  waterColumn(c,x+460,-130,1.84,1200,cyan,.11);
  caustics(c,t,x,y+146,700,descent?.16:.085);
  const axisX=x+(gateway?0:36)*(1-p),axisY=y-(gateway?110:82)+25*Math.sin(p*Math.PI);
  for(let i=0;i<5;i++){
    const q=fract(i/5+t*.24),r=19+q*q*150;
    ellipse(c,axisX,axisY+q*170,r,r*.34,alpha(cyan,.28*(1-q)),1.6);
  }
  packet(c,axisX,axisY,9+music.onset*4,t,.87);
  floes(c,t,78,descent?1.24:.8,x,y);
  drawLyricBack?.();
  if(gateway){
    rail(c,0,926,606,727);
    rail(c,W,956,1553,737);
    label(c,'下層へ','DESCEND',138,819);
  }else if(ascent){
    const reveal=smooth(p);
    light(c,x,120,770,cyan,.77*reveal);
    for(let i=0;i<7;i++){
      const q=fract(i/7+.66*p);
      const w=(56+q*q*510);
      const yy=70+Math.pow(q,1.7)*1100;
      line(c,x-w,yy,x+w,yy,alpha(cyan,.38*Math.sin(q*Math.PI)),1+q*7);
    }
    line(c,x,70,x,axisY,alpha(cyan,.25*reveal),5);
    label(c,'浮上','ASCENT',133,851);
  }
}

function constellation(c,x,y,r,t,angle,strength){
  c.save();
  c.translate(x,y);
  c.rotate(angle);
  for(let i=0;i<7;i++){
    const rr=r*(1.0+i*.093),ry=rr*(.22+i*.02);
    ellipse(c,0,0,rr*1.7,ry,alpha(i%3===0?teal:cyan,strength*(.19+(i%3)*.068)),1+i%3*.42);
  }
  for(let i=0;i<28;i++){
    const a=hash(i*41.3)*TAU,t2=t*(.13+hash(i+2)*.15);
    const rr=(1.10+hash(i+31)*.55)*r, xx=Math.cos(a+t2)*rr*1.7,yy=Math.sin(a+t2)*rr*.36;
    fill(c,alpha(i%9===0?ember:pale,strength*(.26+hash(i+100)*.38)),xx,yy,1.4+i%5*.82,1.4+i%5*.82);
  }
  c.restore();
}

function occultation(c,s){
  const {t,shot,p,music,resources,drawCharacter,drawLyricBack}=s;
  const window=shot.coldScene==='window';
  const absorption=shot.coldScene==='eclipse';
  const x=window?1130:absorption?956:813,y=window?409:absorption?526:493;
  const r=(window?133:absorption?285:226)*(.97+p*(absorption?.17:.07));
  fill(c,navy);
  light(c,x,y,r*5,teal,window?.61:.78);
  floes(c,t,100,.91);
  constellation(c,x,y,r,t,window?-.28:absorption?.23:-.44,.95);
  light(c,x+r*.22,y-r*.08,r*2.0,cyan,.52+music.onset*.11);
  ellipse(c,x,y,r,r,window?'#0A1827':'#020710');
  arc(c,x,y,r,-1.75,2.7,alpha(cyan,.72),3+music.onset*4);
  arc(c,x,y,r+13,-1.58,2.3,alpha(pale,.37),1.6);
  arc(c,x,y,r+29,1.82,2.05,alpha(teal,.76),1.6);
  const bearing=2.74+p*.61;
  const px=x+Math.cos(bearing)*r*1.64,py=y+Math.sin(bearing)*r;
  packet(c,px,py,window?6:10,t,.94);
  drawLyricBack?.();
  if(window){
    const tx=468,ty=535;
    // The foreground window seals off the outside and gives the profile a depth anchor.
    path(c,[[0,0],[W,0],[W,168],[285,204],[129,747],[0,838]],'#071624',true);
    path(c,[[0,814],[246,753],[W,866],[W,H],[0,H]],'#0A1F2F',true);
    line(c,246,753,W,866,alpha(cyan,.49),5);
    line(c,286,195,132,748,alpha(teal,.72),10);
    line(c,1587,132,1510,840,alpha('#132939',.95),24);
    const crack=[[1517,680],[1417,641],[1320,656],[1205,558],[1140,539]];
    path(c,crack,alpha(cyan,.24),false,1.6);
    path(c,[[1320,656],[1294,716],[1220,740]],alpha(cyan,.21),false,1.3);
    path(c,[[1417,641],[1452,580],[1464,530]],alpha(cyan,.21),false,1.3);
    if(resources.v16Look){
      drawCharacter?.(tx,1100,743,'v16Look',.11,.95,{placed:true});
    }else{
      drawCharacter?.(tx,1095,757,'sad',.08,.96,{placed:true});
    }
    path(c,[[0,920],[828,877],[1045,H],[0,H]],'#081824',true);
    line(c,0,919,828,877,alpha(cyan,.25),2);
    label(c,'窓の向こう','THE FAR SIDE',1331,821);
  }else if(absorption){
    const rays=20;
    for(let i=0;i<rays;i++){
      const a=i/rays*TAU, len=42+hash(i*13)*190;
      line(c,x+Math.cos(a)*(r+58),y+Math.sin(a)*(r+58),x+Math.cos(a)*(r+58+len),y+Math.sin(a)*(r+58+len),alpha(cyan,.12+hash(i+130)*.16),1.2);
    }
  }else{
    const ox=x+167,oy=y+29;
    for(let i=0;i<32;i++){
      const a=-Math.PI*.18+i*TAU/32, rr=483;
      line(c,ox+rr*Math.cos(a),oy+rr*Math.sin(a),ox+(rr+11+i%3*8)*Math.cos(a),oy+(rr+11+i%3*8)*Math.sin(a),alpha(cyan,.37),1.4);
    }
    label(c,'黒い星','COLD ORBIT / ZERO RETURN',1250,755);
  }
}

function courier(c,s,release=false){
  const {t,p,music,drawLyricBack}=s;
  fill(c,navy);
  const x=release?650:394,y=release?475:730,ex=release?1450:1548,ey=release?530:325;
  light(c,ex,ey,960,teal,.46);
  const point=q=>{
    const u=1-q;
    return [u*u*x+2*u*q*790+q*q*ex,u*u*y+2*u*q*(release?825:285)+q*q*ey];
  };
  for(let j=-2;j<=2;j++){
    c.beginPath();
    for(let i=0;i<=55;i++){
      const q=i/55,[px,py]=point(q);
      const dis=j*(35+Math.sin(q*Math.PI)*90);
      if(i)c.lineTo(px,py+dis);
      else c.moveTo(px,py+dis);
    }
    c.strokeStyle=alpha(cyan,j?.24:.62);
    c.lineWidth=j?1.4:3.5;
    c.stroke();
  }
  for(let i=0;i<17;i++){
    const q=fract(.068*i+t*.16),[px,py]=point(q);
    circle(c,px,py,2.2+3.4*q,alpha(cyan,.37+.24*q),1.2);
  }
  for(let i=0;i<4;i++)ellipse(c,ex,ey,61+i*45,105+i*45,alpha(cyan,.57-i*.105),1.6,-.03);
  const [px,py]=point(release?smooth(p*1.35):.12+.83*smooth(p));
  packet(c,px,py,13+music.onset*7,t,.94);
  floes(c,t,70,.68);
  drawLyricBack?.();
  if(release){
    const q=smooth((p-.50)*2.4);
    // Match the outgoing packet to the recurring corridor vanishing point.
    light(c,ex,ey,760,cyan,.39*q);
    line(c,ex-470*q,ey,ex+227*q,ey,alpha(cyan,.4*q),3);
    label(c,'再送','RETURN TO OBSERVATION',143,812);
  }else{
    label(c,'返ってきた信号','TRACE THE RETURN',143,865);
  }
}

function fragment(c,s,recovered=false){
  const {t,p,music,resources,drawCharacter,drawLyricBack}=s;
  fill(c,'#071B2A');
  const px=recovered?972:777+88*smooth(p),py=recovered?467:443+28*Math.sin(p*Math.PI);
  light(c,px,py,827,teal,.65);
  waterColumn(c,1277,-115,1.94,1180,cyan,.25);
  floes(c,t,90,.72);
  for(let i=0;i<13;i++){
    const q=hash(i*17.6),a=hash(i*.52)*TAU + p*.27;
    const x=px+Math.cos(a)*(240+q*565),y=py+Math.sin(a)*(195+q*410);
    const wh=36+q*101,ht=41+q*94;
    c.save();
    c.translate(x,y);
    c.rotate(a*.8+t*.044);
    path(c,[[-wh,-ht*.38],[wh*.42,-ht],[wh,ht*.34],[-wh*.33,ht]],alpha(teal,.37),true);
    path(c,[[-wh,-ht*.38],[wh*.42,-ht],[wh,ht*.34]],alpha(cyan,.26+i%3*.095),false,2);
    if(recovered && i%4===0){
      for(let j=0;j<6;j++)line(c,-wh*.45,-ht*.1+j*7,wh*.45,-ht*.1+j*7,alpha(pale,.28),1);
    }
    c.restore();
  }
  for(let i=0;i<4;i++){
    const r=103+i*63;
    ellipse(c,px,py,r,r*.72,alpha(cyan,.42-i*.078),1.7,-.23);
  }
  drawLyricBack?.();
  if(!recovered){
    const reach=resources.v16Reach?'v16Reach':'hand';
    const existing=reach==='hand';
    drawCharacter?.(existing?1390:1425,existing?1010:1100,existing?736:942,reach,.36,1,{placed:true});
  }
  packet(c,px,py,(recovered?30:18)+music.onset*9,t,.94);
  if(recovered){
    path(c,[[px-159,py-106],[px-161,py+105],[px+153,py+121],[px+153,py-89]],alpha(cyan,.45),false,2);
    const amount=4+Math.floor(p*12);
    for(let i=0;i<16;i++){
      fill(c,alpha(i<amount?cyan:teal,i<amount?.78:.29),px-130+i*16,py+164,11,4);
    }
    label(c,'断片を保存','RECOVERED MEMORY',1260,791);
  }
}

export function drawColdInterlude(c,{t,shot,data,resources,music,drawCharacter,drawLyricBack}){
  const s={t,shot,data,resources,music,drawCharacter,drawLyricBack,p:clamp((t-shot.start)/(shot.end-shot.start))};
  c.save();
  switch(shot.coldScene){
    case 'archive': case 'console': case 'return': archive(c,s); break;
    case 'oscilloscope': screen(c,s); break;
    case 'rebuild': screen(c,s,true); break;
    case 'window': case 'orbit': case 'eclipse': occultation(c,s); break;
    case 'gate': case 'dive': case 'lift': vault(c,s); break;
    case 'racks': overhead(c,s); break;
    case 'trace': courier(c,s); break;
    case 'release': courier(c,s,true); break;
    case 'reach': fragment(c,s); break;
    case 'recover': fragment(c,s,true); break;
  }
  // Soft edge falloff keeps the screen and the character in the same blue scene.
  const rim=c.createRadialGradient(956,520,454,956,520,1124);
  rim.addColorStop(0,alpha(dark,0));
  rim.addColorStop(1,alpha(dark,.57));
  fill(c,rim);
  c.restore();
}
