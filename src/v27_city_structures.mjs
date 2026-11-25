import * as THREE from '../node_modules/three/build/three.module.js';

const random = seed => {
  const value = Math.sin(seed * 71.143 + 8.73) * 43758.5453;
  return value - Math.floor(value);
};

export function structuralRuin(k, {x, z, w, d, h, floor, seed}) {
  const heavy = k.damage === 2;
  const side = Math.sign(x);
  const levels = Math.max(3, Math.round(h / 2.15));
  const step = h / levels;
  const left = -d * .5, right = d * .5;
  const street = -w * .5, rear = w * .5;
  const structure = heavy ? '#70616a' : '#786652';
  const inside = heavy ? '#30232b' : '#3c3230';
  const edge = heavy ? '#a58786' : '#a08d74';
  const steel = '#34262a';
  const destroyedFrom = heavy ? Math.max(1, Math.floor(levels * (.34 + .25 * random(seed+3)))) : Math.max(1, levels - 2);
  const breachBay = random(seed+10) < .5 ? 0 : 2;
  const solid = (u, y, v, du, dy, dv, color, roll=0, yaw=0, pitch=0) =>
    k.solid(x+side*u, y, z+v, du, dy, dv, color, roll*side, yaw*side, pitch);
  const wire = (u,y,v,a,b,c) => k.wire(x+side*u,y,z+v,x+side*a,b,z+c);
  k.buildings++;
  if (k.ruinSmoke && Math.abs(x)<43 && z>-90)
    k.ruinSmoke.push([x+side*(street+.45),floor+destroyedFrom*step+.58,z+left+d*(breachBay===0?.22:.77),heavy?3.3:1.85]);

  for (let level = 0; level < levels; level++) {
    const y = floor + level * step;
    const damaged = level >= destroyedFrom;
    const recede = heavy && damaged ? w * (.16 + .45 * (level-destroyedFrom+1)/(levels-destroyedFrom)) : 0;
    const end = heavy && damaged ? left + d * (.54 + .34 * random(seed+level*21)) : right;
    const brokenU = street + recede;
    const slabPoints = heavy && damaged ? [
      [brokenU + w*.09, left], [rear, left], [rear, end], [brokenU+w*.14, end],
      [brokenU, end-d*.15], [brokenU+w*.16, left+d*.31], [brokenU+w*.04, left+d*.16],
    ] : damaged ? [
      [street, left], [rear,left], [rear,right], [street,right],
      [street,left+d*(breachBay===0?.34:.84)], [street+w*.24,left+d*(breachBay===0?.24:.72)],
      [street+w*.13,left+d*(breachBay===0?.10:.62)], [street,left+d*(breachBay===0?.06:.53)],
    ] : [[street,left],[rear,left],[rear,right],[street,right]];
    k.wreckSlabs.push({
      x, z, side, y, height: .24, points: slabPoints, face: structure, edge,
    });
    solid(rear-.19,y+step*.48,(left+end)/2,.37,step*.94,end-left,inside);
    solid((rear+brokenU)*.5,y+step*.52,left+.10,rear-brokenU,step*.92,.21,structure);

    for(let bay=0;bay<3;bay++){
      const span=d/3, mid=left+(bay+.5)*span;
      const open=damaged&&(heavy||bay===breachBay);
      if(open){
        const post=left+bay*span+.05;
        const height=step*(heavy && level===levels-1 ? .52+.45*random(seed+bay*67) : 1);
        const u=brokenU+.23;
        if(mid>=end)continue;
        solid(u,y+height*.5,post,.20,height,.22,structure,(bay%2?.08:-.056));
        if(bay!==1||!heavy)solid(u+.15,y+step*.43,mid-.12,.12,.08,span*.85,steel,0,.14);
        for(let bar=0;bar<3;bar++){
          const start=mid+(bar-1)*span*.19;
          wire(u,y+.07,start,u-.46,y-.21,start+.09);
          wire(u-.46,y-.21,start+.09,u-.91,y-.42,start-.13);
        }
        if(heavy&&level>destroyedFrom&&bay===0)
          solid(brokenU+.36,y+.47,mid,.93,.23,span*.81,edge,.55,0,.34);
        continue;
      }
      const wall=street+.10;
      solid(wall,y+.24,mid,.22,.42,span,structure);
      solid(wall,y+step-.20,mid,.23,.39,span,structure);
      solid(wall,y+step*.50,mid-span*.44,.23,step*.97,span*.16,structure);
      solid(wall+.12,y+step*.50,mid,.05,step*.62,span*.88,inside);
      if(k.finishedWindows){
        const lit=level<destroyedFrom && random(seed+level*13+bay*32)>.74;
        k.window({x:x+side*(street-.027), y:y+step*.53, z:z+mid+span*.025,
          width:span*.76,height:step*.57,yaw:-side*Math.PI/2,roll:0,
          tone:lit?k.colors.light[1]:k.colors.dark,lit,seed:random(seed+level*9+bay)});
      }
    }
  }
  for(let i=0;i<(heavy?24:8);i++){
    const u=random(seed+i*13+90), v=random(seed+i*67+21);
    const size=(.24+u*u*1.6)*(heavy?1.25:.8);
    solid(street-.18-v*(heavy?3.9:1.5), floor+size*.20,
      (v-.45)*d*1.26, size*(.95+u),size*.44,size*(.57+v),
      i%3?structure:inside,(u-.45)*.75,v*Math.PI,(v-.50)*.72);
    if(i%5===0)wire(street-v*2,floor+size*.23,(v-.5)*d,street-v*2-.41,floor+.07,(v-.5)*d+.37);
  }
}

export function damagedStreet(k, variant) {
  const curb = {plaza: 17, freight: 8.6, alley: 5.5, skyline: 9.8, fracture: 6.3, canal: 10.8}[variant];
  const heavy = k.damage === 2;
  for (const [i,z] of (heavy ? [-6,-22,-40,-62] : [-9,-34]).entries()) {
    const side = i % 2 ? 1 : -1;
    const x = side * (curb - (heavy ? 2.1 : 2.6));
    const width = heavy ? 3.25 : 1.35;
    k.solid(x,.56,z,width,.26,width*1.31,'#8e7472',.19*side,.35*side,-.28);
    const beam = heavy ? 5.6 : 2.7;
    k.solid(x+side*.92,.49,z+.56,.24,.28,beam,'#4a3c3d',-.16*side,.78*side,.14);
    for(let n=0;n<(heavy?18:6);n++){
      const seed=i*91+n*23;
      const u=random(seed+5),v=random(seed+29),size=(.16+u*u*.85)*(heavy?1.45:.80);
      k.solid(x+(u-.5)*width*2.6,size*.22,z+(v-.5)*width*3,
        size*(.9+v),size*.45,size*(.65+u),n%4?'#746368':'#483c43',
        u*.66,v*3.14,-v*.27);
    }
  }
}

export function buildBrokenSlabs(rows) {
  const positions=[], colors=[];
  const color=new THREE.Color();
  const emit=(vertices, tone) => {
    color.set(tone);
    for (const point of vertices) {
      positions.push(...point);
      colors.push(color.r,color.g,color.b);
    }
  };
  for (const {points,x,y,z,side,height,face,edge} of rows) {
    const triangles=THREE.ShapeUtils.triangulateShape(points.map(([u,v])=>new THREE.Vector2(u,v)),[]);
    const top=points.map(([u,v])=>[x+side*u,y,z+v]);
    const bottom=top.map(([a,b,c])=>[a,b-height,c]);
    for(const [a,b,c] of triangles){
      emit([top[a],top[b],top[c]],face);
      emit([bottom[c],bottom[b],bottom[a]],face);
    }
    for(let i=0;i<top.length;i++){
      const j=(i+1)%top.length;
      emit([top[i],bottom[i],bottom[j],top[i],bottom[j],top[j]],edge);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  return new THREE.Mesh(geo,mat);
}
