import * as THREE from '../node_modules/three/build/three.module.js';
import { addBuildingDetails, addStreetDetails, blackStarPalette } from './v20_city_details.mjs';
import { buildCityWindows } from './v25_city_windows.mjs';
import { addCityFire, orangeDamagePalette, ruinedTower } from './v26_city_damage.mjs';
import { buildBrokenSlabs, damagedStreet, structuralRuin } from './v27_city_structures.mjs';
import { addRuinSmoke } from './v28_city_smoke.mjs';

const box = new THREE.BoxGeometry();
const pose = new THREE.Object3D();
const srgb = new THREE.Color();
const fract = x => x - Math.floor(x);
const random = seed => fract(Math.sin(seed * 68.791 + 7.23) * 53982.92);
const range = (seed, a, b) => a + (b - a) * random(seed);
const mix = (a, b, p) => a + (b - a) * p;
const clamp01 = x => Math.max(0, Math.min(1, x));

const DISTRICTS = {
  freight: { sky:'#483133', mist:'#674a46', upper:'#d7a181', lower:'#28313e', key:'#ffca8f', lamp:'#ffb46d',
    body:['#554944','#383a40','#4d514f','#58504b'], trim:'#776354', dark:'#302928', light:['#f1c17d','#d0a48b','#897b7b'], floor:'#393638' },
  plaza: { sky:'#391c31', mist:'#523947', upper:'#d5979d', lower:'#373353', key:'#ffac9f', lamp:'#ffbd9a',
    body:['#504350','#423c51','#5d5159','#3e4355'], trim:'#7c6476', dark:'#342b40', light:['#f5c497','#cc91a3','#8e93ac'], floor:'#49404d' },
  alley: { sky:'#3a212e', mist:'#553d49', upper:'#b68989', lower:'#362e54', key:'#e7b395', lamp:'#ff9b82',
    body:['#503b46','#575058','#423f52','#544757'], trim:'#75606c', dark:'#302635', light:['#ecad9b','#f0c186','#98c6bc'], floor:'#453947' },
  canal: { sky:'#243244', mist:'#43516a', upper:'#9fb8ce', lower:'#253351', key:'#c5c8cf', lamp:'#f4c389',
    body:['#354556','#4c4a59','#404b61','#515860'], trim:'#6e7d88', dark:'#253446', light:['#edca94','#b1d3cc','#a1a9cb'], floor:'#354353' },
  skyline: { sky:'#152837', mist:'#354b62', upper:'#8caeb9', lower:'#273958', key:'#b7d9d5', lamp:'#91d9c2',
    body:['#3a4e60','#38465e','#414e66','#3b5b6a'], trim:'#627a88', dark:'#242e49', light:['#b5e4c8','#82b6b9','#dfc795'], floor:'#364d60' },
  fracture: { sky:'#3a192c', mist:'#693747', upper:'#e18f8c', lower:'#2a284f', key:'#fa9480', lamp:'#eba484',
    body:['#593948','#493643','#55465f','#513644'], trim:'#82616c', dark:'#341f32', light:['#f0a286','#bf7b91','#a596ac'], floor:'#513746' },
};

function batch(rows, light = false) {
  const material = light ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(box, material, rows.length);
  rows.forEach(([x, y, z, w, h, d, color, roll = 0, yaw = 0, pitch = 0], i) => {
    pose.position.set(x, y, z);
    pose.scale.set(w, h, d);
    pose.rotation.set(pitch, yaw, roll);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, srgb.set(color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function paletteKit(scene, colors, architecturalVariant, finishedWindows, damage, structuralDamage, smoke) {
  const solids = [], glows = [], wiring = [], panes = [];
  return {
    colors,
    architecturalVariant,
    finishedWindows,
    damage,
    structuralDamage,
    fires: [],
    wreckSlabs: [],
    ruinSmoke: smoke ? [] : null,
    body: n => colors.body[Math.abs(Math.floor(n)) % colors.body.length],
    solid: (...row) => solids.push(row),
    glow: (...row) => glows.push(row),
    window: row => panes.push(row),
    wire: (x, y, z, X, Y, Z) => wiring.push(x, y, z, X, Y, Z),
    buildings: 0,
    addToScene() {
      if (solids.length) scene.add(batch(solids));
      if (glows.length) scene.add(batch(glows, true));
      if (panes.length) scene.add(buildCityWindows(panes, colors));
      if (this.wreckSlabs.length) scene.add(buildBrokenSlabs(this.wreckSlabs));
      if (wiring.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(wiring, 3));
        scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: colors.trim, transparent:true, opacity:.72 })));
      }
      scene.userData.buildingCount = this.buildings;
      scene.userData.instanceCount = solids.length + glows.length + panes.length;
    },
  };
}

function tower(k, { x, z, w, d, h, seed, floor = 0, kind = 'office', detail = true }) {
  const close = Math.abs(x) < 34 && z > -52;
  const chance = k.structuralDamage && close ? (k.damage === 2 ? .64 : .27) : (k.damage === 2 ? .38 : .11);
  const orangeFrontage = k.structuralDamage && k.damage === 1 && x < 0 && x > -21 && z > -18 && z < 1;
  if (k.damage && detail && Math.abs(x) < 64 && z > -105 && (orangeFrontage || random(seed * 2.83 + 31) < chance)) {
    (k.structuralDamage?structuralRuin:ruinedTower)(k,{x,z,w,d,h,floor,seed});
    return;
  }
  const { body, trim, dark, light } = k.colors;
  const tone = body[Math.floor(random(seed * 17) * body.length)];
  const roof = floor + h;
  k.buildings++;
  k.solid(x, floor + h * .5, z, w, h, d, tone);
  k.solid(x, floor + .13, z, w + .28, .22, d + .22, dark);

  if (kind === 'tower') {
    const step = Math.min(h * .24, 6.3);
    k.solid(x - w * .08, roof + step * .5, z, w * .76, step, d * .73, tone);
    k.solid(x - w * .10, roof + step * 1.20, z, w * .48, step * .43, d * .51, trim);
    k.solid(x - w * .10, roof + step * 1.57, z, .10, step * .48, .10, trim);
    k.glow(x - w * .10, roof + step * 1.81, z, .17, .15, .17, light[0]);
  } else if (kind === 'industrial') {
    for (let i = 0; i < 3; i++) {
      const tx = x + (i - 1) * w * .26;
      k.solid(tx, roof + .31, z, w * .27, .61, d * .76, trim, -.13);
      k.solid(tx, roof + .58, z - d * .19, w * .22, .15, d * .26, dark, -.13);
    }
  } else {
    k.solid(x, roof + .08, z, w + .35, .16, d + .33, trim);
    k.solid(x + w * .18, roof + .37, z - d * .22, w * .44, .73, d * .43, dark);
  }
  if (k.architecturalVariant && z > -117) {
    addBuildingDetails(k, { x, z, w, d, h, floor, seed, kind, detail });
  }
  if (!detail) return;

  const front = z + d / 2;
  const floorCount = Math.min(17, Math.max(2, Math.floor(h / (kind === 'industrial' ? 2.55 : 1.70))));
  const columns = kind === 'industrial' ? 4 : kind === 'tower' ? 4 : 3;
  for (let j = 0; j < floorCount; j++) {
    const f = (j + .55) / floorCount;
    const y = floor + h * f;
    const fHeight = h / floorCount;
    // Draw the long balcony ledges and shadowed reveals only on the street-facing sides.
    if (j % 3 === 0 && kind === 'housing') {
      k.solid(x, y - fHeight * .30, front + .22, w + .11, .14, .49, trim);
      k.solid(x, y - fHeight * .08, front + .44, w + .11, .07, .067, dark);
    }
    for (let col = 0; col < columns; col++) {
      const offset = w * ((col + .5) / columns - .5) * .91;
      const paneWidth = w * (kind === 'tower' ? .68 : .56) / columns;
      const value = random(seed * 4.2 + j * 13.1 + col * 84.9);
      const lit = value > .66;
      const paneTone = lit ? light[col % 3] : dark;
      if (k.finishedWindows) {
        k.window({ x: x + offset, y, z: front + .031, width: paneWidth, height: fHeight * .49,
          yaw: 0, roll: 0, tone: paneTone, lit, seed: value });
        if (z > -28 && Math.abs(x) < 29)
          k.solid(x + offset, y - fHeight * .24, front + .07, paneWidth * 1.10, .047, .17, trim);
      } else k.glow(x + offset, y, front + .025, paneWidth, fHeight * .44, .038, paneTone);
      if (kind === 'alley' && col === 1 && j % 4 === 0) {
        k.solid(x + offset, y - fHeight * .31, front + .14, paneWidth * 1.36, .09, .25, trim);
      }
    }
    for (const side of [-1, 1]) {
      const sideX = x + side * (w * .5 + .02);
      const value = random(seed + j * 12.3 + side * 2.1);
      if (k.finishedWindows) {
        for (const facing of [-1, 1]) {
          const paneZ = z + facing * d * .22;
          const seed = random(value * 97 + facing * 67);
          const lit = facing < 0 ? value > .71 : seed > .57;
          const width = d * (facing < 0 ? .21 : .23);
          k.window({x: sideX + side * .006, y, z: paneZ, width, height: fHeight * .49,
            yaw: side * Math.PI / 2, roll: 0, tone: lit ? light[facing < 0 ? 1 : 2] : dark, lit, seed});
          if (z > -28 && Math.abs(x) < 29)
            k.solid(sideX + side * .049, y - fHeight * .24, paneZ, .17, .047, width * 1.10, trim);
        }
      } else {
        k.glow(sideX, y, z - d * .22, .034, fHeight * .44, d * .18, value > .71 ? light[1] : dark);
        k.glow(sideX, y, z + d * .22, .034, fHeight * .44, d * .20, value > .58 ? light[2] : dark);
      }
    }
  }
  if (kind === 'alley') {
    const side = x < 0 ? 1 : -1;
    const signX = x + side * (w / 2 + .27);
    const signZ = z + d * .28, sy = floor + h * .55;
    k.solid(signX, sy, signZ, .58, h * .50, .70, dark);
    k.glow(signX + side * .30, sy, signZ, .036, h * .45, .53, light[Math.floor(random(seed) * 3)]);
    for (let i = 0; i < 8; i++) {
      k.solid(signX + side * .329, sy + (i - 3.5) * h * .051, signZ,
        .035, h * .026, i % 3 === 0 ? .27 : .36, dark);
    }
  }
}

function backdrop(k, seed, pattern) {
  // Two staggered backing strata prevent the near streets from exposing an empty horizon.
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 27; i++) {
    const source = seed + i * 17.71 + layer * 913;
    const x = (i - 13) * (layer ? 6.40 : 5.18) + range(source + 17, -1.35, 1.35);
    const z = -(layer ? 150 : 122) + range(source + 14, -7, 3);
    const h = range(source + 6, 9.5, pattern === 'skyline' ? 49 : 34);
    tower(k, { x, z, w:range(source, 3.6, 6.15), d:range(source + 1, 4, 6.8), h,
      seed:source, kind:i % 4 === 1 ? 'tower' : 'office', detail:i % 3 === 0 && !layer });
  }
}

function rail(k, x, z, length, step=3.2, elevation=0, direction='z') {
  const c = k.colors.trim;
  const alongZ = direction === 'z';
  for (let i = 0; i <= Math.ceil(length / step); i++) {
    const u = Math.min(length, i * step);
    k.solid(x+(alongZ?0:u), elevation + .56, z+(alongZ?-u:0), .13, 1.13, .15, c);
  }
  for (const y of [.49, 1.02]) {
    k.solid(x+(alongZ?0:length/2), elevation+y, z+(alongZ?-length/2:0),
      alongZ?.075:length, .071, alongZ?length:.071, c);
  }
}

function lamp(k, x, z, height=4.6, side=1, base=0) {
  k.solid(x, base+height*.50, z, .14, height, .14, k.colors.trim);
  k.solid(x + side * .53, base+height-.10, z, 1.08, .13, .16, k.colors.trim);
  k.solid(x + side * .96, base+height-.12, z, .42, .19, .29, k.colors.dark);
  k.glow(x + side * .96, base+height-.22, z, .34, .055, .24, k.colors.light[0]);
}

function overpass(k, z, y, width, span=4.8) {
  k.solid(0, y, z, width, .79, span, k.colors.trim);
  k.solid(0, y+.38, z, width-.18, .11, span-.20, k.colors.dark);
  for (const side of [-1, 1]) {
    k.solid(side*(width*.5-.84), (y-.51)/2, z, 1.12, y-.51, span*.66, k.colors.dark);
    k.solid(side*(width*.5-.84), y-.64, z, 2.10, .41, span*.85, k.colors.trim);
    rail(k,-width*.5,z+side*span*.46,width,2.8,y+.39,'x');
    for(let x=-width*.43;x<width*.44;x+=2.1) {
      k.solid(x,y-.49,z+side*(span*.40),.21,.43,span*.35,k.colors.dark);
    }
  }
  for(let x=-width*.43;x<width*.44;x+=4.2) {
    k.glow(x,y-.427,z,.76,.024,.28,k.colors.light[0]);
  }
}

function curvedWire(k, a, b, sag) {
  const point = u => [mix(a[0], b[0], u), mix(a[1], b[1], u) - Math.sin(u * Math.PI) * sag, mix(a[2], b[2], u)];
  for (let n = 0; n < 14; n++) k.wire(...point(n/14), ...point((n+1)/14));
}

function freight(k) {
  const c = k.colors;
  for (let row=0;row<8;row++) for (const side of [-1,1]) for (let depth=0;depth<2;depth++) {
    const seed=73+row*31+side*71+depth*113;
    const z=11-row*15.7+range(seed,-1.1,1.2);
    const x=side*(17+depth*13.0+range(seed+2,0,.9));
    tower(k,{x,z,w:range(seed+3,7.5,10.1),d:range(seed+4,8,12),h:range(seed+5,6.8,depth?15.3:11.3),
      seed,kind:'industrial'});
  }
  for(const side of [-1,1]) {
    const laneX = side*9.85;
    const depot = side*13.4;
    k.solid(laneX,-.12,-45,4.25,.21,139,c.dark);
    for(const x of [laneX-.82,laneX+.82]) k.solid(x,.013,-45,.06,.065,139,c.trim);
    for (let i=0;i<115;i++) k.solid(laneX,-.013,16-i*1.12,2.55,.06,.19,c.body[i%4]);
    for(let z=4;z>-95;z-=17.5) {
      lamp(k,side*8.0,z,4.2,-side);
      curvedWire(k,[side*8.0,4.6,z],[side*8,4.68,z-17.5],.55);
      if(z<-.1){
        k.solid(depot,.71,z,2.4,1.42,5.6,c.body[Math.abs(Math.floor(z))%4]);
        for(let j=0;j<9;j++) k.solid(depot-side*1.21,.70,z-2.5+j*.625,.059,1.21,.10,c.trim);
      }
    }
    rail(k,side*7.45,3.5,104,4.25);
  }
  overpass(k,-24,8.5,36,4.65);
  overpass(k,-65,11.5,44,4.15);
  for(let i=0;i<9;i++){
    const x=26 + i*5.6,z=-77+i*2.15,h=range(95+i,10,23);
    k.solid(x,h*.5,z,1.33,h,1.44,c.body[i%4]);
    k.solid(x,h,z,1.55,.45,1.60,c.trim);
    k.glow(x,h+.34,z,.21,.26,.21,c.light[0]);
  }
  return [[-2.3,0,6],[2.5,0,-7],[-2.25,0,-16],[3.1,0,-33]];
}

function plaza(k) {
  const c=k.colors;
  for(let i=0;i<10;i++) for(const side of [-1,1]) {
    const angle=i*Math.PI*.082;
    const x=side*(30-10.15*Math.sin(angle));
    const z=10-i*11.55;
    tower(k,{x,z,w:range(i+side*19,6.0,9.5),d:range(i+103,6.5,10.1),
      h:range(i*13+side,10.2,29.8),seed:31+i*11+side,kind:i===5||i===8?'tower':'office'});
    tower(k,{x:x+side*10.6,z:z-3,w:range(i+62,6.2,10.5),d:8.9,
      h:range(i*23-side,11,36),seed:110+i*11+side,kind:i%2?'tower':'housing'});
  }
  // Inlaid pavement and paired galleries leave an open civic square, not a road.
  k.solid(0,-.128,-31,44,.23,101,c.floor);
  for(let z=16;z>=-72;z-=3.4) k.solid(0,-.008,z,37,.02,.047,c.trim);
  for(let x=-18;x<=18;x+=3.4) k.solid(x,-.008,-29,.047,.02,101,c.trim);
  for(const side of [-1,1]){
    for(let i=0;i<10;i++) {
      const z=11-i*8.3, x=side*(17.7-.9*Math.sin(i*.48));
      k.solid(x,.17,z,2.12,.34,2.26,c.dark);
      k.solid(x,.45,z,1.30,.26,1.48,c.trim);
      lamp(k,x,z,3.15,-side,.55);
    }
  }
  for(let i=0;i<7;i++){
    k.solid(10.8, .1 + .09*i, -44.2, 5.15-i*.42, .20, 5.15-i*.42, c.body[i%4]);
  }
  return [[-5,0,4],[5.5,0,-11],[-4,0,-22],[5,0,-42]];
}

function alley(k) {
  const c=k.colors;
  for(let row=0;row<16;row++){
    const z=11-row*8.0;
    const gap=(z>-39&&z<-25)||(z>-79&&z<-65);
    for(const side of [-1,1]) for(let depth=0;depth<3;depth++) {
      if(gap&&depth===0) continue;
      const seed=256+row*13+side*73+depth*119;
      const x=side*(8.1+depth*8.7+range(seed,-.45,.83)+(z>8?5.6:0));
      const h=range(seed+3,depth?6.6:5.3,depth?30.8:17.9);
      tower(k,{x,z:z+range(seed+4,-.75,.75),w:range(seed+7,4.3,5.92),d:range(seed+5,5.0,6.85),
        h,seed,kind:depth===0?'alley':depth===1?'housing':'tower',detail:depth<2||row%2===1});
    }
  }
  k.solid(0,-.136,-56,14,.24,145,c.floor);
  for(const side of [-1,1]) {
    k.solid(side*5.06,.03,-54,1.24,.09,140,c.trim);
    for(let i=0;i<15;i++) {
      const z=6.7-i*7.0;
      lamp(k,side*5.28,z,3.55,-side,.074);
      if(i%2===0) curvedWire(k,[side*5.5,7.45,z],[-side*5.5,7.3,z-1.7],1.05);
      if(i%4===2) {
        k.solid(side*5.25,.86,z+.86,.46,1.60,.65,c.body[i%4]);
        k.glow(side*5.25-side*.255,1.62,z+.86,.034,.065,.29,c.light[2]);
      }
    }
  }
  for (const z of [-32,-72]) {
    k.solid(0,-.07,z,24,.13,2.75,c.dark);
    for(let x=-4.8;x<4.8;x+=.61) k.glow(x,.023,z,.29,.02,1.91,c.trim);
  }
  return [[-2.1,0,5],[1.95,0,-10],[-1.9,0,-28],[1.8,0,-44]];
}

function canal(k) {
  const c=k.colors;
  for(let row=0;row<9;row++) for(const side of [-1,1]) for(let depth=0;depth<3;depth++) {
    const seed=429+row*17+side*104+depth*153;
    const z=7-row*12.65+range(seed+1,-.76,1.25);
    const x=side*(16.1+depth*8.65+range(seed+2,.7,2.1)+(side>0?2:0));
    tower(k,{x,z,w:range(seed+7,4.7,6.5),d:range(seed+5,5.7,10.1),
      h:range(seed+3,depth?7:4.8,depth?29:12.4),seed,kind:depth===0?'industrial':depth===1?'housing':'tower',detail:depth<2||row%2===0});
  }
  for(const side of [-1,1]){
    const bankX=side*(side<0?13.5:14.8);
    k.solid(bankX,-.49,-44.4,10.5,.94,151,c.trim);
    k.solid(bankX,-.035,-44.4,10.5,.07,151,c.floor);
    rail(k,side*8.85,20,125,4.05);
    for(let i=0;i<21;i++) {
      const z=21-i*6.0;
      k.solid(side*8.63,-.25,z,.39,1.77,.42,c.dark);
      if(i%2) lamp(k,side*9.11,z,2.85,-side,.003);
    }
  }
  overpass(k,-45,7.1,44,3.65);
  overpass(k,-81,9.4,47,3.25);
  for(const [x,z,len] of [[7.33,-20,12.2],[-6.92,-36.5,8.5],[7.5,-59,8.9]]){
    k.solid(x,-.68,z,2.5,1.04,len,c.dark,.12*Math.sign(x));
    k.solid(x,-.18,z,2.65,.13,len*.91,c.body[2],.10*Math.sign(x));
    k.solid(x+.31,.34,z+.50,1.18,.98,len*.32,c.body[1],.11*Math.sign(x));
    for(let i=0;i<4;i++) k.glow(x-.34,.43,z+(i-1.5)*.69,.09,.24,.41,c.light[0]);
    curvedWire(k,[x,.08,z+len*.44],[Math.sign(x)*8.73,.22,z+len*.52],.46);
  }
  return [[-10.4,0,2],[-11.45,0,-13],[11.78,0,-27],[-11.9,0,-58]];
}

function skyline(k) {
  const c=k.colors;
  k.solid(0,-.62,-8,22.4,1.15,61,c.body[1]);
  k.solid(0,-.089,-8,22.58,.17,61,c.floor);
  for(let y=-1;y<.2;y+=.38) k.solid(0,y,-38.69,22.48,.075,.103,c.trim);
  rail(k,-11.35,22,60,4.2);
  rail(k,11.36,22,60,4.2);
  rail(k,-11.29,-38.5,22.55,3.81,0,'x');
  for (let n=0;n<7;n++) {
    for(const side of [-1,1]) {
      if(n%3!==0) k.solid(side*10.8,.65,19-n*8,1.08,1.29,2.68,c.body[n%4]);
      if(n%2===0) lamp(k,side*10.57,17-n*9,2.3,-side);
    }
  }
  for(let row=0;row<10;row++) for(const side of [-1,1]) for(let depth=0;depth<3;depth++) {
    const seed=823+row*19+side*101+depth*137;
    const x=side*(17.0+depth*10.4+range(seed,0,3.3));
    const z=12-row*12.25+range(seed+1,-1.46,.91);
    const h=range(seed+3,13.8,depth===0?37:50);
    tower(k,{x,z,w:range(seed+4,5.2,8.9),d:range(seed+5,5.9,8.2),h,floor:-9.5,seed,
      kind:row%3===1?'housing':'tower',detail:depth===0||row%3!==2});
  }
  // Roof across the far end frames a narrow skyline notch rather than another street.
  for(let row=0;row<5;row++) for(const side of [-1,1]) {
    const seed=891+side*39+row*53;
    tower(k,{x:side*(12.1+row*2.75),z:-59-row*9,w:range(seed,5.1,8.7),d:8.3,
      h:range(seed+2,13.5,29),floor:-9.5,seed,kind:'tower'});
  }
  return [[-3.8,0,5],[3.35,0,-8],[-5,0,-17],[5,0,-27]];
}

function fracture(k) {
  const c=k.colors;
  for(let row=0;row<9;row++) for(const side of [-1,1]) for(let depth=0;depth<3;depth++) {
    const seed=1172+row*21+side*81+depth*209;
    const bend=Math.sin(row*.67)*2.8;
    const x=side*(14.0+depth*9.8+range(seed,.32,2.4))+bend;
    const z=10-row*13+range(seed+1,-.72,.99);
    const h=range(seed+2,depth?9:5.7,depth?33.5:20.7);
    if(depth===0&&row%3===1){
      const sign=side*(row%2?1:-1);
      k.buildings++;
      k.solid(x,h/2,z,5.53,h,6.29,k.body(row),sign*.17,.18*sign);
      k.solid(x-sign*.55,h*.81,z+.22,5.49,2.01,6.83,c.trim,sign*.23,.10*sign);
      k.solid(x+sign*1.1,h*.17,z+2.79,3.2,.41,4.1,c.dark,sign*-.13,.39*sign);
      for (let f=0;f<7;f++) {
        const lit=f%3===1;
        const tone=lit?c.light[1]:c.dark;
        if(k.finishedWindows) {
          k.window({x:x-sign*f*.16,y:h*.12+f*h*.101,z:z+3.195,width:2.5,height:.42,
            yaw:.18*sign,roll:sign*.17,tone,lit,seed:random(seed+f*39)});
        } else k.glow(x-sign*f*.16,h*.12+f*h*.101,z+3.16,2.5,.19,.057,tone,sign*.17,.18*sign);
      }
    }else tower(k,{x,z,w:range(seed+5,5.3,8.1),d:range(seed+7,6.05,8.4),h,seed,kind:row%3===0?'tower':'office',detail:depth<2||row%3===1});
  }
  for(const side of [-1,1]) {
    for(let i=0;i<12;i++) {
      const z=12-i*9;
      const x=side*(6.85+Math.sin(i*.53)*.38);
      k.solid(x,.067,z,.75,.13,8.53,c.trim,0,side*.045);
      if(i%3!==1) rail(k,x+side*.56,z+3,5.0,2.2);
      if(i%2===0) lamp(k,x+side*.92,z+1.5,4.1,-side);
    }
  }
  overpass(k,-48,12,38,2.65);
  return [[-2.8,0,7],[2.8,0,-9],[-3.1,0,-22],[1.9,0,-35]];
}
const BUILD = { freight, plaza, alley, canal, skyline, fracture };
const STARS = {
  freight: [10,25,-106], plaza: [2,24,-106], alley: [-7,30,-115],
  canal: [9,17,-105], skyline: [11,26,-112], fracture: [-4,24,-100],
};

const FLOOR_VERTEX = [
  'varying vec3 point;',
  'void main(){',
  '  point=(modelMatrix*vec4(position,1.)).xyz;',
  '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);',
  '}',
].join('\n');

const FLOOR_FRAGMENT = [
  'varying vec3 point;',
  'uniform vec3 stone;',
  'uniform vec3 mist;',
  'uniform vec3 lightColor;',
  'uniform float time;',
  'uniform float kind;',
  'float grain(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}',
  'float edge(float v,float w){return 1.-smoothstep(w,w*1.9,abs(v));}',
  'void main(){',
  '  vec2 u=point.xz;',
  '  float x=abs(u.x);',
  '  float d=length(cameraPosition-point);',
  '  vec3 color=stone*(.83+.22*grain(floor(u*27.)));',
  '  if(kind==3.){',
  '    float ripple=.50+.29*sin(u.y*4.61+u.x*1.14-time*1.6)+.21*sin(u.y*11.6-u.x*2.5+time*.57);',
  '    float bands=sin(u.x*.91+sin(u.y*.68)*.26);',
  '    float reflection=exp(-pow((u.x-3.7+sin(u.y*1.85+time*.51)*.22)/3.20,2.));',
  '    float cyanStripe=exp(-pow((u.x+5.6+sin(u.y*.93-time*.79)*.53)/2.4,2.));',
  '    color=mix(stone*.61,mist*.83,.48+ripple*.11)+lightColor*reflection*(.05+.064*ripple);',
  '    color+=vec3(.013,.064,.082)*cyanStripe*(.48+.22*bands)*(.56+.44*ripple);',
  '  }else{',
  '    float wetness=smoothstep(.40,.73,sin(u.x*1.36+cos(u.y*.46))*sin(u.y*.86-u.x*.17));',
  '    color+=wetness*(mist*.26+lightColor*.044)*(.65+.35*sin(u.y*2.2-time*.64));',
  '    float edgeLines=edge(x-(kind==2.?4.45:5.95),.04);',
  '    float lane=edge(x-1.89,.046)*step(.60,fract(u.y*.161));',
  '    float cargo=kind==0.?edge(x-3.46,.065)*(.58+.42*step(.31,fract(u.y*.24))):0.;',
  '    float cross=edge(fract(u.y*.38)-.5,.022)*smoothstep(5.7,7.9,x);',
  '    if(kind==1.||kind==4.){lane=0.;edgeLines=0.;}',
  '    if(kind==5.){',
  '      float fault=edge(u.x-.67*sin(u.y*.32)-1.2*sin(u.y*.11),.075);',
  '      color*=1.-fault*.64;',
  '      lane=edge(abs(u.x-u.y*.027)-1.72,.044)*step(.65,fract(u.y*.166));',
  '    }',
  '    color+=lightColor*(lane*.083+edgeLines*.065+cargo*.082);',
  '    color*=1.-cross*.20;',
  '  }',
  '  #ifdef DETAILED_SURFACE',
  '  if(kind!=3.){',
  '    float seam=edge(fract(u.x*.43+step(.5,fract(u.y*.20))*.5)-.5,.009);',
  '    seam=max(seam,edge(fract(u.y*.40)-.5,.012));',
  '    float stonePatch=grain(floor(u*vec2(.43,.40)));',
  '    float abrasion=grain(floor(u*vec2(92.,144.)));',
  '    color*=.87+stonePatch*.22+abrasion*.08-seam*.19;',
  '    float wetRuts=pow(.5+.5*sin(u.x*2.05+sin(u.y*.36)*.48),9.);',
  '    float puddle=smoothstep(.31,.79,sin(u.y*.43+u.x*.8)*sin(u.y*.19-u.x*2.));',
  '    color+=lightColor*(wetRuts*.013+puddle*.033);',
  '  }',
  '  #endif',
  '  #ifdef BLACK_STAR_SURFACE',
  '  float axis=u.x+.55*sin(u.y*.19)+.19*sin(u.y*2.11);',
  '  float sheen=exp(-axis*axis*.051);',
  '  float rust=.59+.41*grain(floor(u*vec2(8.,2.9)));',
  '  color=vec3(color.r,color.g*.42,color.b*.40);',
  '  color+=vec3(.087,.006,.007)*sheen*rust;',
  '  color+=vec3(.027,.0015,.0029)*(.55+.45*exp(-abs(u.x)*.08));',
  '  #endif',
  '  color=mix(color,mist*.67,smoothstep(24.,134.,d)*.71);',
  '  gl_FragColor=vec4(color,1.);',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');

function ground(scene, kind, colors, detail, red) {
  const material = new THREE.ShaderMaterial({
    defines: { ...(detail && { DETAILED_SURFACE: 1 }), ...(red && { BLACK_STAR_SURFACE: 1 }) },
    uniforms: {
      stone: { value: new THREE.Color(colors.floor) },
      mist: { value: new THREE.Color(colors.mist) },
      lightColor: { value: new THREE.Color(colors.lamp) },
      kind: { value: Object.keys(DISTRICTS).indexOf(kind) },
      time: { value: 0 },
    },
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(310, 265), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, kind === 'canal' ? -.83 : kind === 'skyline' ? -9.52 : -.031, -85);
  scene.add(mesh);
  return material;
}

function plazaDisc(scene, color) {
  const mat = new THREE.MeshLambertMaterial({color});
  const center = new THREE.Group();
  center.position.set(10.8, .78, -44.2);
  for(let i=0;i<3;i++){
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1.38+i*.28,.055,6,48),mat);
    torus.rotation.set(.30+i*.48,.14,i*.61);
    center.add(torus);
  }
  scene.add(center);
}

function suspendedPanels(scene, variant, colors) {
  if(variant!=='fracture')return () => {};
  const count=27;
  const mesh=new THREE.InstancedMesh(box,new THREE.MeshLambertMaterial(),count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  for(let i=0;i<count;i++)mesh.setColorAt(i,srgb.set(i%5===0?colors.trim:colors.body[i%4]));
  scene.add(mesh);
  return (t,music) => {
    const push=clamp01(music.onset??0)*.14;
    for(let i=0;i<count;i++){
      const seed=7211+i*18.3;
      const p=fract(random(seed)+t*(.021+.015*random(seed+1)));
      const x=range(seed+3,7.6,19)*(i%2===0?-1:1);
      pose.position.set(x+Math.sin(p*3.1+i)*.49,range(seed+5,2.7,12.5)+3.6*Math.sin(p*Math.PI)+push,
        range(seed+8,-91,-5)+12*(p-.5));
      pose.scale.set(range(seed+11,.05,.75),range(seed+12,.06,.32),range(seed+14,.09,.57));
      pose.rotation.set(t*.21+i*.94,t*.37+i*.31,-t*.35+i*.52);
      pose.updateMatrix();
      mesh.setMatrixAt(i,pose.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
  };
}

/**
 * Build one real city district. World coordinates are shared with the V19 camera;
 * the returned ground anchors are available for stable character projection.
 */
export function makeCityLayout(variant, {detail=false,red=false,finishedWindows=false,damage=0,structuralDamage=false,smoke=false}={}) {
  const build = BUILD[variant];
  if(!build) throw new Error('Unknown city district: '+variant);
  const palette = DISTRICTS[variant];
  const colors = red ? blackStarPalette(palette, variant) : damage === 1 ? orangeDamagePalette(palette) : palette;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.sky);
  scene.fog = new THREE.FogExp2(colors.mist, variant === 'canal' ? .0138 : variant === 'alley' ? .0117 : .011);
  const fill = new THREE.HemisphereLight(colors.upper, colors.lower, red ? 1.54 : 1.93);
  const key = new THREE.DirectionalLight(colors.key, red ? 1.65 : 1.18);
  const near = new THREE.PointLight(colors.lamp, 43, 42, 1.75);
  key.position.set(variant === 'canal' ? 13 : -18, 25, -40);
  near.position.set(variant === 'plaza' ? 14 : -8, 6, -13);
  scene.add(fill,key,near);

  const surface = ground(scene,variant,colors,detail,red);
  const kit = paletteKit(scene,colors,detail ? variant : undefined,finishedWindows,damage,structuralDamage,smoke);
  const anchors = build(kit);
  if (detail) addStreetDetails(kit, variant);
  if (damage && structuralDamage) damagedStreet(kit,variant);
  backdrop(kit,1298+Object.keys(DISTRICTS).indexOf(variant)*78,variant);
  kit.addToScene();
  if(variant==='plaza') plazaDisc(scene,colors.trim);
  const movePanels = suspendedPanels(scene,variant,colors);
  const moveFire = damage && !structuralDamage ? addCityFire(scene, kit.fires, damage, variant) : null;
  const moveSmoke = damage && structuralDamage && smoke ? addRuinSmoke(scene,kit.ruinSmoke,damage,variant) : null;

  return {
    scene, colors, star: STARS[variant],
    anchors: anchors.map(point=>new THREE.Vector3(...point)),
    update(t,music = {}) {
      surface.uniforms.time.value=t;
      const energy=clamp01(music.energy??.45);
      fill.intensity=red ? 1.54+.07*energy : 1.84+.19*energy;
      near.intensity=red ? 46+4*energy : 38+8*energy+3.5*clamp01(music.onset??0);
      movePanels(t,music);
      moveFire?.(t);
      moveSmoke?.(t);
    },
  };
}
