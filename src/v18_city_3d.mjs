import * as THREE from '../node_modules/three/build/three.module.js';

const TAU = Math.PI * 2;
const fract = x => x - Math.floor(x);
const rand = seed => fract(Math.sin(seed * 93.771 + 61.41) * 47834.53);
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const unitBox = new THREE.BoxGeometry();
const transform = new THREE.Object3D();
const screenPoint = new THREE.Vector3();

const LOOKS = {
  star: { sky: '#311322', horizon: '#8b3438', zenith: '#171323', fog: '#5b2e37', sun: '#ff9477', shade: '#5b6a84', road: '#352936', water: '#fd855c', light: '#ffca94' },
  ruin: { sky: '#35222a', horizon: '#92503e', zenith: '#251a24', fog: '#6d423b', sun: '#ff9c6b', shade: '#77727d', road: '#392e36', water: '#d98968', light: '#ffc692' },
  flood: { sky: '#241e31', horizon: '#704853', zenith: '#191e2c', fog: '#514050', sun: '#e9a686', shade: '#677c9d', road: '#33304a', water: '#cf887a', light: '#d3e1de' },
  collapse: { sky: '#291320', horizon: '#932a33', zenith: '#170d1e', fog: '#652b39', sun: '#ff6e66', shade: '#715374', road: '#392531', water: '#e03e55', light: '#ffb59a' },
  last: { sky: '#15232f', horizon: '#375a66', zenith: '#131a2d', fog: '#314456', sun: '#77bead', shade: '#7483ad', road: '#263746', water: '#6cd2be', light: '#97decd' },
};
for (const look of Object.values(LOOKS)) {
  for (const key of Object.keys(look)) look[key] = new THREE.Color(look[key]);
}

function batchBoxes(rows, material) {
  const box = new THREE.InstancedMesh(unitBox, material, rows.length);
  rows.forEach(([x, y, z, w, h, d, color, roll = 0, yaw = 0], i) => {
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.rotation.set(0, yaw, roll);
    transform.updateMatrix();
    box.setMatrixAt(i, transform.matrix);
    box.setColorAt(i, new THREE.Color(color));
  });
  return box;
}

function edgeLines(vertices, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, opacity, transparent: true }));
}

function building(rows, accents, glass, x, z, size, floors, seed) {
  const w = size * (.80 + rand(seed + 3) * .32);
  const d = size * (.68 + rand(seed + 17) * .45);
  const floor = size * (.145 + rand(seed + 9) * .06);
  const h = floors * floor;
  const front = z + d / 2;
  const shade = ['#353243', '#393240', '#403744', '#2b3543', '#302d3a'][Math.floor(rand(seed + 7) * 5)];
  const variant = Math.floor(rand(seed + 26) * 4);
  rows.push([x, h / 2, z, w, h, d, shade]);
  accents.push([x, h + .11, z, w + .38, .23, d + .40, '#4b4148']);
  accents.push([x, .24, z, w + .24, .47, d + .24, '#473b43']);
  if (variant === 0) {
    const setback = .82 + rand(seed * 15) * 1.83;
    accents.push([x - w * .11, h + setback * .5, z - d * .11, w * .77, setback, d * .68, '#55464f']);
    accents.push([x - w * .11, h + setback, z - d * .11, w * .79, .13, d * .71, '#706473']);
  } else if (variant === 1) {
    // Roof plant and high-visibility marker on taller tower tops.
    accents.push([x - w * .14, h + .54, z - .12, w * .65, .91, d * .58, shade]);
    accents.push([x - w * .26, h + 2, z, .07, 3.35, .07, '#624e56']);
    accents.push([x - w * .26, h + 2.65, z, 1.10, .08, .075, '#796b74']);
    glass.push([x - w * .26, h + 3.68, z, .22, .12, .22, '#ffe4c2']);
  } else if (variant === 2) {
    // Hammer-shaped rooftop and repeating balcony slabs cast real shadow eaves.
    accents.push([x, h + .37, front - d * .16, w * .94, .64, d * .30, '#54444e']);
    const balconies = Math.min(floors - 1, 8);
    for (let i = 1; i < balconies; i++) {
      accents.push([x, floor * (i + .16), front + .23, w * .80, .11, .58, '#594852']);
    }
  } else {
    // Roll-up access door and a single narrow utility stall at street height.
    accents.push([x - w * .20, floor * .55, front + .055, w * .35, floor * .92, .10, '#59505a']);
    for (let i = 0; i < 5; i++) accents.push([x - w * .20, floor * (.18 + i * .15), front + .12, w * .34, .036, .05, '#796776']);
    accents.push([x, floor * 1.07, front + .29, w * .91, .13, .71, '#665661']);
    glass.push([x + w * .30, floor * .91, front + .091, .27, .18, .09, '#f4d59c']);
  }
  const cols = floors > 5 ? 4 : 3;
  for (let f = 1; f < floors; f++) {
    const y = floor * (f + .44);
    if (f % 3 === 0) accents.push([x, floor * f + .04, front + .05, w + .10, .07, .11, '#514852']);
    for (let n = 0; n < cols; n++) {
      const pane = w * (.36 / cols + .038), ox = w * ((n + .52) / cols - .5) * .95;
      const on = rand(seed + f * 7 + n * 1009);
      glass.push([x + ox, y, front + .022, pane, floor * .37, .032,
        on > .86 ? '#e7c999' : on > .71 ? '#887177' : '#1e1e2c']);
    }
    if (f % 2) {
      const side = x - Math.sign(x) * (w * .5 + .02);
      for (let n = -1; n <= 1; n++) glass.push([side, y, z + n * d * .25, .028, floor * .33, d * .13,
        rand(seed + f + n * 73) > .8 ? '#bca289' : '#222837']);
    }
  }
  for (const offset of [-.45, .45]) accents.push([x + w * offset, h / 2, front + .066, .11, h, .13, '#4c414b']);
}

function makeDistrict(scene) {
  const mass = [], trim = [], glass = [], cables = [];
  for (let r = 0; r < 7; r++) {
    for (const side of [-1, 1]) {
      for (let n = 0; n < 3; n++) {
        const seed = r * 71 + side * 31 + n * 7.17;
        const z = -13 - r * 13.4 - rand(seed + 4) * 6.4;
        const x = side * (12.9 + n * 7.8 + rand(seed) * 3.5 + r * .42);
        building(mass, trim, glass, x, z, 4.4 + rand(seed + 4) * 3.45,
          Math.round(3 + rand(seed + 12) * (n ? 7 : 8)), seed);
      }
    }
  }
  for (let i = 0; i < 29; i++) {
    const x = (i - 14) * 4.72 + rand(i + 1) * 3.8;
    const z = -118 - 19 * rand(i + 10);
    const h = 6 + 17 * Math.pow(rand(i + 38), 1.9);
    const w = 2.6 + rand(i + 34) * 3;
    mass.push([x, h / 2, z, w, h, 3.7 + rand(i + 40) * 2, '#54404b']);
    if (i % 4 === 0) {
      trim.push([x + w * .2, h + 2.6, z, .07, 5.42, .08, '#714e52']);
      glass.push([x + w * .2, h + 5.38, z, .20, .11, .17, '#fac793']);
    }
  }

  // The road keeps a clear path for the actor. The near traffic stops at the curbs and lanes.
  for (const side of [-1, 1]) {
    mass.push([side * 8.5, -.11, -50, 4.8, .195, 146, '#443640']);
    trim.push([side * 5.94, .087, -43, .16, .18, 139, '#5b4653']);
    trim.push([side * 10.95, .063, -43, .14, .13, 139, '#594852']);
    for (let i = 0; i < 16; i++) {
      const z = 23 - i * 6.0;
      const x = side * 6.53;
      trim.push([x, .57, z, .13, 1.10, .13, '#554951']);
      trim.push([x, .057, z, .28, .11, .22, '#594753']);
      trim.push([x, 1.075, z - 3, .08, .07, 6.06, '#6d5660']);
      trim.push([x, .66, z - 3, .062, .048, 6.08, '#524551']);
      if (i % 3 !== 2) continue;
      trim.push([side * 7.44, 2.30, z, .15, 4.6, .15, '#4f4048']);
      trim.push([side * 6.66, 4.58, z, 1.6, .13, .12, '#584952']);
      trim.push([side * 5.89, 4.58, z, .54, .16, .31, '#4e3c4b']);
      glass.push([side * 5.91, 4.481, z, .49, .031, .24, '#faf1c8']);
      const wire = q => [Math.sin(q * Math.PI) * .21 + side * 7.4, 4.68 - Math.sin(q * Math.PI) * .84, z - q * 18];
      for (let n = 0; n < 14; n++) cables.push(...wire(n / 14), ...wire((n + 1) / 14));
    }
  }
  for (const z of [-18.2, -42.45, -68.9]) {
    const catenary = q => [15.7 * (q - .5), 6.13 - Math.sin(q * Math.PI) * 1.12, z + Math.sin(q * Math.PI) * 1.3];
    for (let i = 0; i < 22; i++) cables.push(...catenary(i / 22), ...catenary((i + 1) / 22));
  }
  for (const [x, z, color, yaw] of [[4.0, -13.6, '#805852', .14], [-4.42, -22.4, '#546271', -.18], [4.57, -53, '#57505d', .04]]) {
    mass.push([x, .47, z, 1.64, .72, 3.08, color, 0, yaw]);
    trim.push([x, 1.04, z - .25, 1.43, .47, 1.47, '#2f3849', 0, yaw]);
    trim.push([x, 1.29, z - .28, 1.46, .11, 1.5, color, 0, yaw]);
    trim.push([x, .17, z, 1.8, .22, 2.18, '#201d2b', 0, yaw]);
    glass.push([x + .58, .58, z + 1.54, .23, .14, .08, '#bc7175', 0, yaw]);
    glass.push([x - .58, .58, z + 1.54, .23, .14, .08, '#bc7175', 0, yaw]);
  }

  // Crossing between towers, with repeated ribs, stair landings and illuminated handrails.
  const overpassZ = -46.7, overpassY = 6.55;
  mass.push([0, overpassY, overpassZ, 19.5, .69, 2.75, '#4c3f4c']);
  for (const side of [-1, 1]) {
    trim.push([side * 8.85, overpassY * .49, overpassZ, .69, overpassY * .95, .65, '#5e5059']);
    trim.push([side * 8.85, overpassY * .95, overpassZ, .77, .29, 3.50, '#66515a']);
    trim.push([side * 8.8, overpassY + .20, overpassZ + 3.7, 2.1, .30, 5.8, '#574a56']);
    const x = side * 10.1;
    for (let j = 0; j < 9; j++) trim.push([x, (j + 1) * .41, overpassZ + 8.3 - j * .47, 1.6, .15, .52, '#6b555f']);
  }
  for (const side of [-1, 1]) {
    const z = overpassZ + side * 1.27;
    trim.push([0, overpassY + 1.38, z, 19.3, .085, .10, '#7a6170']);
    glass.push([0, overpassY + .54, z, 18.9, .04, .07, '#9a6960']);
    for (let j = -6; j < 7; j++) trim.push([j * 1.47, overpassY + .87, z, .045, 1.05, .062, '#765d69']);
  }

  // Nearby warning signal and curb islands remain distinct as the camera passes them.
  for (const side of [-1, 1]) {
    const x = side * 6.02, z = side > 0 ? -6.0 : -12.8;
    trim.push([x, .24, z, .42, .46, 3.55, '#74635c']);
    trim.push([x, 1.66, z, .08, 2.93, .08, '#55515e']);
    trim.push([x, 3.13, z, .32, .75, .33, '#403643']);
    glass.push([x, 3.34, z + .179, .19, .14, .019, '#f59a86']);
    glass.push([x, 3.10, z + .179, .19, .12, .020, '#836666']);
    glass.push([x, 2.89, z + .179, .19, .12, .020, '#414d53']);
  }

  const sideShell = new THREE.MeshLambertMaterial({ color: 0xffffff });
  scene.add(batchBoxes(mass, sideShell), batchBoxes(trim, sideShell));
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  scene.add(batchBoxes(glass, lampMaterial), edgeLines(cables, '#51424f', .91));
  return lampMaterial;
}

export function skyDome() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color() }, zenith: { value: new THREE.Color() }, time: { value: 0 }},
    vertexShader: 'varying vec3 ray; void main(){ray=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec3 ray;
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform float time;
      void main(){
        vec3 p=normalize(ray);
        float h=smoothstep(-.10,.73,p.y);
        float drift=sin(p.y*53.+sin(p.x*21.)*1.9+sin(p.z*9.+time*.035)*1.7);
        float cloud=sin(p.y*15.+sin(p.x*13.+time*.019)*1.3)*.6 + drift*.40;
        float strata=pow(max(cloud,0.),3.)*smoothstep(-.07,.05,p.y)*(1.-smoothstep(.41,.72,p.y));
        vec3 base=mix(horizon,zenith,h)*(.91+.12*p.x);
        gl_FragColor=vec4(base*(.92-.28*strata),1.);
        #include <colorspace_fragment>
      }`,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(155, 28, 16), material);
  shell.renderOrder = -8;
  return shell;
}

function wetStreet() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      roadColor: { value: new THREE.Color() }, glare: { value: new THREE.Color() },
      sky: { value: new THREE.Color() }, time: { value: 0 }, wetness: { value: .4 },
    },
    vertexShader: `
      varying vec3 pavement;
      void main(){
        pavement=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      varying vec3 pavement;
      uniform vec3 roadColor;
      uniform vec3 glare;
      uniform vec3 sky;
      uniform float time;
      uniform float wetness;
      float jitter(vec2 p){return fract(sin(dot(p,vec2(17.62,29.45)))*26782.1);}
      void main(){
        vec2 p=pavement.xz;
        float x=abs(p.x);
        float grain=jitter(floor(p*58.));
        float distanceToCamera=distance(p,cameraPosition.xz);
        vec3 asphalt=roadColor*(.72+.19*grain+.16*sin(p.y*.23)*sin(p.x*.63));
        float dashes=step(.50,fract((p.y+1.)/5.25))*(1.-smoothstep(.046,.095,abs(x-1.65)));
        float curb=1.-smoothstep(.025,.085,abs(x-5.63));
        float crossing=(1.-smoothstep(.48,.63,abs(mod(p.y+26.,48.)-24.))) * step(.45,fract(p.x*1.11)) * (1.-smoothstep(5.56,5.62,x));
        float joint=(1.-smoothstep(.015,.038,abs(fract(p.y*.73)-.5))) * smoothstep(6.0,7.0,x);
        float crack=1.-smoothstep(.008,.026,abs(sin(p.y*.92+p.x*.65)+.65*sin(p.x*1.91)));
        asphalt += vec3(.092,.062,.063) * clamp((dashes+curb+crossing*.72)*(.79+grain*.3),0.,1.);
        asphalt *= 1.-.32*max(joint,crack*.57);
        float basin=sin(p.x*1.03+.81*sin(p.y*.83)) * sin(p.y*.61+p.x*.32)
          + .23*sin(p.y*3.51-p.x*1.25);
        float lake=smoothstep(.38-wetness*.44,.58-wetness*.47,basin);
        float lamplight=exp(-pow(abs(x-5.85)*(.72+.06*sin(p.y*.56)),2.))*max(0.,sin((p.y+4.8)*.349));
        float reflectedSky=exp(-pow((p.x-1.82+sin(p.y*1.75+time*.91)*.16)/3.3,2.));
        float ripple=.80+.088*sin(p.y*31.+time*2.6)+.085*sin(p.y*17.2-p.x*9.5-time*.82);
        vec3 mirror=asphalt*.65+(glare*(.16*lamplight+.075*reflectedSky)+sky*.21)*ripple;
        vec3 color=mix(asphalt,mirror,lake*(.58+wetness*.34));
        color=mix(color,sky*.59,smoothstep(16.,146.,distanceToCamera)*.77);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 247), material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -.018, -65);
  return ground;
}

export function createBlackStar(scene) {
  const object = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshBasicMaterial({ color: '#101221', fog: false }));
  object.add(sphere);
  const disc = new THREE.Group();
  const tint = [];
  for (let i = 0; i < 8; i++) {
    const r = 1.12 + i * .117;
    const material = new THREE.MeshBasicMaterial({
      color: '#de7958', side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: .63 - .06 * i, fog: false,
    });
    disc.add(new THREE.Mesh(new THREE.RingGeometry(r, r + (i % 3 ? .014 : .042), 84), material));
    tint.push(material);
  }
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tint: { value: new THREE.Color() }, heat: { value: 0 }},
    vertexShader: 'varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `
      varying vec2 coord;
      uniform vec3 tint;
      uniform float heat;
      void main(){
        vec2 p=coord-.5;
        float a=atan(p.y,p.x);
        float gap=abs(length(p)-.181);
        float waves=.84+.10*sin(5.*a+.94)+.06*cos(13.*a);
        float light=(.13*exp(-14.*gap)+(.53+heat*.07)*exp(-137.*gap))*waves;
        gl_FragColor=vec4(tint,light*(1.-smoothstep(.30,.50,length(p))));
        #include <colorspace_fragment>
      }`,
  }));
  corona.position.z = -.80;
  object.add(disc, corona);
  scene.add(object);
  return { object, disc, corona, tint };
}

function ruins(scene) {
  const wreck = [], girders = [], wire = [];
  for (const side of [-1, 1]) {
    const x = side * 11.8, z = -24.6 - (side > 0 ? 4.1 : 0);
    wreck.push([x, 2.0, z, 3.8, 4.17, 4.35, '#635051', side * .16]);
    wreck.push([x + side * 2.7, 7.48, z - 1.3, 4.5, 12.4, 4.2, '#665252', side * .205]);
    wreck.push([x + side * .7, .9, z + 3.91, 4.9, .49, 1.8, '#6f5458', side * -.64]);
    wreck.push([x - side * 1.9, .95, z + 4.7, 1.58, .43, 3.7, '#4c4656', side * .36]);
    for (let i = 0; i < 12; i++) {
      const ez = z + 4.43 + rand(i + side * 83) * 6.5;
      const ex = side * (7.15 + rand(i + side * 37) * 7.0);
      const size = .20 + rand(i * 3 + 31) * .71;
      wreck.push([ex, size * .30, ez, size * 1.4, size * .57, size, '#614b50', rand(i + 83), rand(i + 72) * TAU]);
    }
    const gx = side * 21.7, gz = -59 - side * 5;
    for (let i = 0; i < 3; i++) girders.push([gx + i * .49, 6, gz, .27, 12.15, .39, '#6b494c']);
    girders.push([gx - side * 3.3, 11.58, gz, 9.8, .38, .49, '#856061']);
    girders.push([gx - side * 2.9, 10.53, gz, 6.82, .21, .29, '#72575b']);
    for (let i = 0; i < 7; i++) wire.push(gx - side * i * .90, 10.5, gz, gx - side * (i + .5) * .90, 11.55, gz);
    wire.push(gx - side * 7.72, 11.58, gz, gx - side * 7.76, 5.46, gz);
  }
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  group.add(batchBoxes(wreck, material), batchBoxes(girders, material), edgeLines(wire, '#8b6d6a', .66));
  scene.add(group);
  return group;
}

function floodDock(scene) {
  const dock = new THREE.Group();
  const banks = [], lamps = [];
  for (const side of [-1, 1]) {
    const x = side * 8.05;
    for (let i = 0; i < 9; i++) {
      const z = 4.3 - i * 8.4;
      banks.push([x, .19, z, .54, .42, 7.9, '#52616f']);
      banks.push([x, .91, z + 2.82, .23, 1.41, .23, '#788390']);
      banks.push([x, 1.69, z + 2.82, .31, .18, .31, '#626776']);
      lamps.push([x, 1.76, z + 2.82, .29, .07, .29, '#f0cba7']);
    }
    const carrierX=side * (side === 1 ? 13.9 : 16.2);
    const carrierZ=side === 1 ? -19.5 : -28.1;
    banks.push([carrierX, .69, carrierZ, 3.6, 1.35, 14.2, '#4c4657', side * .17, side * .17]);
    banks.push([carrierX, 1.47, carrierZ - 1.12, 3.45, .31, 11.02, '#746376', side * .13, side * .17]);
    banks.push([carrierX + .72, 2.02, carrierZ + 1.91, 1.68, 1.19, 4.80, '#5e566a', side * .13, side * .17]);
    for (let j = 0; j < 5; j++) {
      lamps.push([carrierX - 1.12 + j * .042, 1.55 + j * .02, carrierZ + 3.1 - j * 1.11, .031, .10, .45, '#cf9d9d']);
    }
  }
  dock.add(batchBoxes(banks, new THREE.MeshLambertMaterial()), batchBoxes(lamps, new THREE.MeshBasicMaterial()));
  scene.add(dock);
  return dock;
}

function flight(scene) {
  const falling = new THREE.InstancedMesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff }), 34);
  falling.frustumCulled = false;
  falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < falling.count; i++) falling.setColorAt(i, new THREE.Color(i % 7 === 0 ? '#925747' : '#593748'));
  scene.add(falling);
  const geometry = new THREE.BufferGeometry();
  const points = new Float32Array(136 * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3).setUsage(THREE.DynamicDrawUsage));
  const air = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: '#ffd0a1', size: .08, opacity: .57, transparent: true, depthWrite: false,
  }));
  air.frustumCulled = false;
  scene.add(air);
  return { falling, air };
}

function setCamera(camera, shot, cue, t, density, flood) {
  const sign = shot.id % 2 ? 1 : -1;
  const progress = clamp((t - shot.start) / Math.max(.14, shot.end - shot.start));
  const ease = progress * progress * (3 - 2 * progress);
  const drift = Math.sin(t * .55 + shot.scene) * .21;
  const period = cue.segment;
  const isPortrait = shot.mode === 'portrait';
  const isDetail = shot.mode === 'eye' || shot.mode === 'hand';
  if (period === 33) {
    camera.position.set(-3.6 + 1.5 * ease, 5.2 + ease * 1.14, 22 - ease * 4.3);
    camera.lookAt(3.8, 5.7, -71);
  } else if (flood && !isPortrait && !isDetail) {
    camera.position.set(-3.94 + ease * 1.55, 1.56 + ease * .35, 18.7 - 3.13 * ease);
    camera.lookAt(10.5, 3.56, -53);
  } else if (shot.mode === 'abstract' && (cue.id === 5 || cue.id === 9)) {
    camera.position.set(2.2 - sign * (5.0 - ease * 2.9), 8.45 + ease * 4.8, 2.3 - ease * 6.4);
    camera.lookAt(1.9, 10.2 + ease * 1.15, -77);
  } else if (isPortrait || isDetail) {
    camera.position.set(2.7 * sign + drift, 2.95 + ease * .42, 16.5 - 4.5 * ease);
    camera.lookAt(-sign * (isDetail ? 1.65 : 5.44), 5.6, -71);
  } else if (shot.mode === 'wide' || shot.mode === 'abstract') {
    camera.position.set(-3.3 * sign + drift, 3.98 - .30 * ease, 23.8 - 5.4 * ease);
    camera.lookAt(sign * 3.2, 4.0 + density * .7, -62);
  } else {
    camera.position.set(1.6 * sign + drift, 2.41 + .39 * ease, 17.1 - ease * (2.5 + density));
    camera.lookAt(-sign * 1.9, 4.2, -62);
  }
  if (cue.id === 9 && !isDetail) camera.rotateZ(sign * density * .032);
}

function updateSubject(scene, camera, shot, cue, anchor, flood) {
  const subjectShot = shot.mode === 'world' || shot.mode === 'wide';
  if (!subjectShot || cue.segment === 33) {
    scene.userData.subject = null;
    return;
  }
  // A fixed position in the safe part of the asphalt, with lane selection by shot framing.
  const sign = shot.id % 2 ? 1 : -1;
  const wide = shot.mode === 'wide';
  if (flood) anchor.position.set(-4.7, 0, 7.96);
  else anchor.position.set(sign * (wide ? 2.32 : -1.88), 0, wide ? 9.1 : 7.10);
  screenPoint.copy(anchor.position).project(camera);
  scene.userData.subject = screenPoint.x < -.93 || screenPoint.x > .93 || screenPoint.y < -1.03 ? null : anchor;
}

export function createCityRoom() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x683948, .013);
  scene.background = new THREE.Color(0x321824);
  const sky = skyDome();
  const street = wetStreet();
  const lamps = makeDistrict(scene);
  const broken = ruins(scene);
  const dock = floodDock(scene);
  const { object, disc, corona, tint } = createBlackStar(scene);
  const { falling, air } = flight(scene);
  const hem = new THREE.HemisphereLight(0xffffff, 0x2c273c, 2.15);
  const key = new THREE.DirectionalLight(0xffffff, 1.38);
  key.position.set(-24, 18, -45);
  const beacon = new THREE.PointLight(0xffffff, 52, 40, 1.6);
  beacon.position.set(8.6, 4.9, -18);
  scene.add(sky, street, hem, key, beacon);

  const anchor = { position: new THREE.Vector3(), height: 2.05 };
  return ({ t, shot, music, camera, sceneCue }) => {
    const cue = sceneCue ?? { id: shot.scene, segment: shot.segment };
    const flood = cue.id === 6 && [9, 19, 23].includes(cue.segment);
    const state = cue.id === 10 ? 'last' : cue.id === 9 ? 'collapse' : cue.id === 5 ? 'star' : flood ? 'flood' : 'ruin';
    const look = LOOKS[state];
    const energy = clamp(music.energy ?? .45);
    const onset = clamp(music.onset ?? 0);
    scene.background.copy(look.sky);
    scene.fog.color.copy(look.fog);
    scene.fog.density = state === 'last' ? .012 : state === 'ruin' || flood ? .0148 : .0106;
    hem.color.copy(look.horizon);
    hem.groundColor.copy(look.shade);
    hem.intensity = 1.94 + .27 * energy;
    key.color.copy(look.sun);
    key.intensity = state === 'last' ? .96 : 1.34;
    beacon.color.copy(look.light);
    beacon.intensity = 35 + 14 * energy + 4.2 * onset;
    lamps.color.copy(look.light);
    sky.material.uniforms.horizon.value.copy(look.horizon);
    sky.material.uniforms.zenith.value.copy(look.zenith);
    sky.material.uniforms.time.value = t;
    street.material.uniforms.roadColor.value.copy(look.road);
    street.material.uniforms.glare.value.copy(look.water);
    street.material.uniforms.sky.value.copy(look.horizon);
    street.material.uniforms.wetness.value = flood ? .93 : state === 'last' ? .54 : .31;
    street.material.uniforms.time.value = t;
    broken.visible = (cue.id === 6 && !flood) || cue.id === 9;
    dock.visible = flood;
    object.visible = state !== 'last';
    object.position.set(cue.id === 5 ? 7.1 : cue.id === 9 ? 2.36 : -8.4, cue.id === 6 ? 12.4 : 15.8, -79.5);
    object.scale.setScalar(cue.id === 5 ? 12.05 : cue.id === 9 ? 10.4 : 7.75);
    disc.rotation.set(1.24 + Math.sin(t * .22) * .11, -.14, .4 * Math.sin(t * .075));
    corona.material.uniforms.tint.value.copy(look.sun);
    corona.material.uniforms.heat.value = onset;
    tint.forEach((material, i) => {
      material.color.copy(i % 3 === 0 ? look.sun : look.horizon);
    });

    falling.visible = state === 'collapse' || (state === 'ruin' && energy > .24);
    if (falling.visible) {
      for (let i = 0; i < falling.count; i++) {
        const seed = i * 12.07;
        const p = fract(rand(seed) + t * (.036 + .035 * rand(seed + 2)));
        const z = -53.5 + 63 * p;
        const x = (rand(seed + 3) - .5) * 31;
        const y = 1.02 + rand(seed + 5) * 9.8 + Math.sin(p * Math.PI) * 2.5;
        const w = .1 + rand(seed + 7) * .68;
        transform.position.set(x, y, z);
        transform.scale.set(w, .18 * w, .61 * w);
        transform.rotation.set(p * 2.2, i + p * 4.3, i * .21 - t * .51);
        transform.updateMatrix();
        falling.setMatrixAt(i, transform.matrix);
      }
      falling.instanceMatrix.needsUpdate = true;
    }
    const points = air.geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const z = rand(i * 3.13) * 108 - 90;
      const x = fract(rand(i * 3.7 + 2) + t * .009) * 47 - 23.5;
      const y = rand(i * 9.51 + 1) * (flood ? 4.8 : 10.5) + .54 + Math.sin(i + t * .7) * .20;
      points.setXYZ(i, x, y, z);
    }
    points.needsUpdate = true;
    air.material.color.copy(state === 'last' ? look.light : look.sun);
    air.material.opacity = state === 'last' ? .37 : .53;

    setCamera(camera, shot, cue, t, energy, flood);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    corona.quaternion.copy(camera.quaternion);
    updateSubject(scene, camera, shot, cue, anchor, flood);
    return scene;
  };
}
