import * as THREE from '../node_modules/three/build/three.module.js';
import { addServerDetails } from './v20_server_details.mjs';
import { placeServerPacket } from './v29_packet_route.mjs';

const clamp = x => Math.max(0, Math.min(1, x));
const mix = (a, b, p) => a + (b - a) * p;
const ease = p => p * p * (3 - 2 * p);
const TAU = Math.PI * 2;
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const hash = i => {
  const value = Math.sin(i * 17.139 + 82.65) * 43758.5453;
  return value - Math.floor(value);
};

function boxes(parent, geometry, rows, material) {
  const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
  const object = new THREE.Object3D();
  const color = new THREE.Color();
  rows.forEach(([x, y, z, w, h, d, tint, yaw = 0], i) => {
    object.position.set(x, y, z);
    object.scale.set(w, h, d);
    object.rotation.y = yaw;
    object.updateMatrix();
    mesh.setMatrixAt(i, object.matrix);
    mesh.setColorAt(i, color.set(tint));
  });
  parent.add(mesh);
  return mesh;
}

function wires(parent, positions, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  parent.add(new THREE.LineSegments(geometry, material));
}

function mesh(parent, geometry, material, x, y, z) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z);
  parent.add(result);
  return result;
}

function archiveStructure(scene, cube, racks) {
  const body = [], luminous = [], trim = [], glass = [], ceiling = [];
  const grid = [], cables = [], crossbars = [], liftCables = [];
  // The deck stops at the lift opening. Close foreground rails remain in the same world as the rack rows.
  body.push([0, -.38, -13.5, 31.2, .7, 60, '#19384A'], [0, -.38, -60, 31.2, .7, 17, '#132b3a']);
  for (const side of [-1, 1]) {
    body.push([side * 11.25, -.4, -48, 8.7, .7, 12, '#193243']);
    body.push([side * 15.7, 5.15, -24.3, .48, 12, 92, '#132b3a']);
    for (let i = 0; i < 16; i++) {
      const z = 17 - i * 5.65;
      body.push([side * 14.95, 4.5, z, .68, 9, .73, '#28495a']);
      trim.push([side * 14.45, 8.45, z, .48, .68, .86, '#426474']);
      luminous.push([side * 14.58, 4.45, z + .39, .045, 6.55, .035, '#467f99']);
    }
    for (let k = 0; k < 4; k++) {
      const x = side * (3.35 + .145 * k);
      cables.push(x, 7.38 + k * .08, 17, x, 7.38 + k * .08, -42);
    }
    for (let i = 0; i < 12; i++) {
      const z = 8 - i * 4.25;
      body.push([side * 3.55, 7.13, z, .92, .20, .26, '#344c5b']);
      wiresForSag(crossbars, side * 3.53, 7.31, z, side * 5.05, 4.1, z - 1.1, .35);
    }
  }
  for (let r = 0; r < 12; r++) {
    const z = 10 - r * 5.2;
    ceiling.push([0, 8.68, z, 30.5, .4, .58, '#1d3649']);
    ceiling.push([0, 9.28, z - 2.5, 30.7, .18, 4.80, '#102330']);
    luminous.push([0, 8.43, z + .13, 8.2, .048, .057, '#648fa6']);
    luminous.push([0, .015, z, 7.38, .022, .037, '#2D5D6E']);
  }
  for (let x = -15; x <= 15; x += 1.5) {
    grid.push(x, -.017, 17, x, -.017, -43.5);
  }
  for (let z = 17; z >= -43; z -= 2.2) grid.push(-15.4, -.016, z, 15.4, -.016, z);
  for (const side of [-1, 1]) {
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 11; row++) {
        const z = -1.85 - row * 4.27;
        if (z < -31 && z > -40 && col === 0) continue;
        if (side > 0 && col > 0 && z > -15) continue;
        const id = row * 23 + col * 5 + (side > 0 ? 13 : 0);
        const x = side * (4.65 + col * 3.7) + (hash(id) - .5) * .18;
        const h = 3.1 + hash(id + 80) * .62;
        const w = 1.85 + hash(id + 13) * .37;
        const d = 1.27;
        const face = z + d * .5;
        const rear = z - d * .5;
        racks?.push({ id, x, z, h, w, d });
        body.push([x, h * .5, z, w, h, d, '#163449']);
        trim.push([x, h - .18, face, w * 1.018, .24, .19, '#3a6074']);
        glass.push([x, (h - .12) * .5, face + .092, w - .18, h - .42, .027, '#569fb4']);
        trim.push([x, 1.76, rear - .021, w - .29, 2.65, .073, '#254353']);
        trim.push([x + w * .28, 1.61, rear - .069, .075, 2.45, .048, '#467083']);
        for (const offset of [-1, 1]) {
          trim.push([x + offset * (w * .5 - .08), h * .5, face + .08, .105, h - .25, .155, '#345366']);
        }
        for (let shelf = 0; shelf < 8; shelf++) {
          const y = .42 + shelf * (h - .75) / 8;
          trim.push([x, y, face + .048, w - .32, .196, .072, '#0b2330']);
          luminous.push([x - w * .30, y, face + .092, .088, .051, .022, id % 11 === shelf ? '#d99c58' : '#508fa0']);
          luminous.push([x + w * .10, y, face + .09, w * .25, .017, .011, '#28566e']);
          if (shelf % 2 === 0) trim.push([x - w * .11, .62 + shelf * .30, rear - .061, w * .55, .085, .021, '#102737']);
        }
        luminous.push([x + w * .28, .64, rear - .098, .049, .104, .019, '#74959e']);
      }
    }
  }
  for (let level = -3; level <= 5; level++) {
    const y = level * 2.5 - .2;
    for (const side of [-1, 1]) {
      body.push([side * 4.55, y, -48, .52, .45, 9.8, '#213f55']);
      body.push([0, y, -48 + side * 4.78, 9.65, .45, .49, '#1e3e51']);
      luminous.push([side * 4.23, y + .23, -48, .045, .054, 8.8, '#557e91']);
      for (let i = -1; i <= 1; i++) {
        trim.push([side * 4.5, y + .75, -48 + i * 3.3, .09, 1.10, .09, '#456476']);
      }
    }
  }
  for (const side of [-1,1]) {
    for (const z of [-49.9,-50.73]) {
      liftCables.push(side*3.96,-7.2,z, side*3.96,13.6,z);
    }
    for (let r = -13; r < 27; r++) {
      const y = r * .51;
      liftCables.push(side*3.96,y,-49.9, side*3.96,y,-50.73);
    }
  }
  for (const side of [-1, 1]) {
    for (let z = -43.5; z <= -39.5; z += 1.3) {
      trim.push([side * 3.58, .57, z, .078, 1.15, .078, '#4b6978']);
    }
    trim.push([side * 3.58, 1.14, -41.8, .084, .067, 4.8, '#5b7f91']);
    trim.push([side * 1.45, .043, 6.67, .056, .035, 11, '#365864']);
  }
  const lambert = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  boxes(scene, cube, body, lambert);
  boxes(scene, cube, trim, lambert);
  boxes(scene, cube, luminous, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  boxes(scene, cube, glass, new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: .08, depthWrite: false,
  }));
  const roof = boxes(scene, cube, ceiling, lambert);
  wires(scene, grid, '#6498a8', .19);
  wires(scene, cables, '#56a3b7', .64);
  wires(scene, crossbars, '#6f8596', .45);
  wires(scene, liftCables, '#83a7b6', .72);
  return roof;
}

function wiresForSag(target, x1, y1, z1, x2, y2, z2, sag) {
  let previous = [x1, y1, z1];
  for (let i = 1; i <= 8; i++) {
    const q = i / 8;
    const next = [mix(x1, x2, q), mix(y1, y2, q) - sag * Math.sin(q * Math.PI), mix(z1, z2, q)];
    target.push(...previous, ...next);
    previous = next;
  }
}

function displayMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, phase: { value: 0 }, accent: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){
      vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float t;
      uniform float phase;
      uniform float accent;
      void main(){
        vec2 u=vUv;
        float chart=step(.07,u.x)*step(u.x,.93)*step(.17,u.y)*step(u.y,.78);
        float point=.15+phase*.72;
        float env=.035+.18*exp(-65.*pow(u.x-point,2.));
        float wave=.45+env*sin(51.*u.x-3.*t)*sin(14.*u.x+1.7*t);
        float scope=exp(-600.*abs(u.y-wave))*(.30+.70*exp(-2.*abs(u.x-point)));
        float tick=max(step(.976,fract(u.x*18.)),step(.965,fract(u.y*12.)));
        float strip=step(.08,u.x)*step(u.x,.49)*step(.84,u.y)*step(u.y,.866);
        float code=strip*step(.37,fract(u.x*78.));
        float scan=1.-abs(fract(u.y*106.)-.5)*.055;
        vec3 base=mix(vec3(.03,.10,.15),vec3(.10,.26,.33),.49+.51*exp(-5.*distance(u,vec2(.5))));
        vec3 color=base+vec3(.16,.43,.46)*(tick*.29+scope*.81)*chart;
        color+=code*vec3(.25,.39,.39);
        float signal=exp(-110.*distance(u,vec2(point,wave)));
        color+=vec3(.76,.41,.12)*signal*(.68+.24*accent);
        gl_FragColor=vec4(color*scan,1.);
      }
    `,
  });
}

function makeConsole(scene, cube) {
  const console = new THREE.Group();
  console.position.set(-4.55, 0, 5.5);
  console.rotation.y = .13;
  scene.add(console);
  const frame = new THREE.MeshLambertMaterial({ color: '#244853' });
  mesh(console, cube, frame, 0, .70, 0).scale.set(6.0, 1.35, 1.02);
  mesh(console, cube, frame, 0, 1.43, .35).scale.set(6.25, .13, 2.05);
  mesh(console, cube, new THREE.MeshBasicMaterial({ color: '#58939e' }), 0, 1.426, 1.39).scale.set(5.91, .034, .021);
  mesh(console, cube, frame, 0, 2.0, -.33).scale.set(1.14, 1.1, .30);
  mesh(console, cube, frame, 0, 2.72, -.11).scale.set(4.28, 2.04, .23);
  const material = displayMaterial();
  mesh(console, new THREE.PlaneGeometry(3.99, 1.77), material, 0, 2.72, .019);
  for (const x of [-2.33, 2.33]) {
    mesh(console, cube, frame, x, 2.09, -.19).scale.set(.63, 1.08, .2);
    mesh(console, new THREE.PlaneGeometry(.53, .91), material, x, 2.09, -.076);
  }
  const keys = [];
  for (let i = 0; i < 46; i++) {
    keys.push([(i % 23 - 11) * .16, 1.51, .25 + Math.floor(i / 23) * .25, .102, .018, .085,
      i % 13 === 7 ? '#b58446' : i % 4 === 2 ? '#36808c' : '#244f5e']);
  }
  boxes(console, cube, keys, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  return material;
}

function makeIris(scene, x, y, z, radius, portal) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);
  const ring = new THREE.MeshLambertMaterial({ color: '#447188' });
  mesh(group, new THREE.TorusGeometry(radius, .12, 6, 64), ring, 0, 0, 0);
  mesh(group, new THREE.TorusGeometry(radius * 1.13, .085, 5, 64), ring, 0, 0, -.09);
  const fine = new THREE.MeshBasicMaterial({ color: portal ? '#6B97AA' : '#496979' });
  mesh(group, new THREE.TorusGeometry(radius * .94, .023, 4, 80), fine, 0, 0, .012);
  mesh(group, new THREE.CircleGeometry(radius * .97, 64),
    new THREE.MeshBasicMaterial({ color: portal ? '#102735' : '#0b1b25' }), 0, 0, -.265);
  // Small moving rings surround physical objects inside the glass, with the bulkhead providing a near edge.
  const orbit = new THREE.Group();
  orbit.rotation.set(.99, .13, .24);
  group.add(orbit);
  const orbitMaterial = new THREE.MeshBasicMaterial({ color: portal ? '#9DB3C1' : '#9A7A58',
    transparent: true, opacity: .63, depthWrite: false });
  mesh(orbit, new THREE.TorusGeometry(radius * .74, .022, 5, 64), orbitMaterial, 0, 0, -.01);
  mesh(orbit, new THREE.TorusGeometry(radius * .57, .016, 4, 64), orbitMaterial, 0, 0, 0);
  mesh(group, new THREE.SphereGeometry(radius * .29, 24, 20), new THREE.MeshBasicMaterial({
    color: portal ? '#070e18' : '#181d26',
  }), 0, 0, .02);
  return { orbit, group };
}

function makePacket(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const core = mesh(group, new THREE.OctahedronGeometry(.31), new THREE.MeshBasicMaterial({ color: '#ffbf77' }), 0, 0, 0);
  const shell = mesh(group, new THREE.OctahedronGeometry(.52), new THREE.MeshBasicMaterial({
    color: '#ec944e', wireframe: true, transparent: true, opacity: .73, depthWrite: false,
  }), 0, 0, 0);
  const glow = mesh(group, new THREE.PlaneGeometry(3.9, 3.9), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { accent: { value: 0 } },
    vertexShader: 'varying vec2 uvp; void main(){uvp=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 uvp; uniform float accent;
      void main(){ float d=distance(uvp,vec2(.5)); gl_FragColor=vec4(1.,.57,.26,(.32+.16*accent)*exp(-11.*d)*(1.-smoothstep(.18,.49,d))); }
    `,
  }), 0, 0, 0);
  const lights = new THREE.PointLight('#e7a563', 10, 9, 1.8);
  group.add(lights);
  return { group, core, shell, glow, lights };
}

const shots = {
  archive: { c: [[-2.8, 4.6, 18.7], [-.2, 3.8, 13.3]], a: [[-.75, 2.25, .2], [1.38, 1.95, -4]], b: [[-.6, 1.7, 6], [.9, 1.9, -5]], roll: -.017 },
  console: { c: [[-1.35, 3.25, 12.96], [.6, 3.02, 11.58]], a: [[-3.25, 2.49, 5.03], [-2.83, 2.42, 4.02]], b: [[-4.3, 2.51, 5.90], [-3.14, 2.86, 5.04]], roll: .026 },
  trace: { c: [[-6.0, 3.0, 10.04], [-5.08, 2.93, 9.40]], a: [[-4.52, 2.79, 5.55], [-4.49, 2.68, 5.54]], b: [[-3.58, 2.55, 5.12], [-2.91, 2.63, 4.33]], roll: -.034 },
  window: { c: [[7.27, 4.03, -3.45], [8.11, 4.26, -5.32]], a: [[10.79, 3.32, -11.7], [10.99, 3.90, -11.7]], b: [[9.0, 2.40, -8.7], [8.12, 2.42, -8.87]], roll: .042 },
  gate: { c: [[-1.75, 3.72, -4], [1.25, 2.5, -12.6]], a: [[.24, 2.13, -20], [-.50, 2.02, -22]], b: [[-.45, 1.87, -9.4], [.15, 1.62, -18.22]], roll: -.016 },
  dive: { c: [[-2.07, 6.05, 4.5], [1.18, 1.96, -14.5]], a: [[-.8, 1.13, -10.9], [-.60, 1.33, -29.5]], b: [[.43, 1.58, -9.8], [-.98, 1.79, -23.10]], roll: -.066 },
  racks: { c: [[-4.63, 15.5, -15.6], [8.45, 18.02, -22.75]], a: [[-1.56, 0.9, -20.55], [1.02, 1.04, -26.1]], b: [[.92, 1.98, -16.78], [-1.98, 1.68, -25.52]], roll: .067 },
  eclipse: { c: [[-1.66, 3.44, -25.70], [2.08, 3.76, -28.65]], a: [[-.36, 2.95, -36.3], [.48, 3.44, -37.04]], b: [[-1.37, 2.68, -33.20], [-.61, 2.71, -34.14]], roll: -.056 },
  reach: { c: [[-3.06, 2.18, -25.3], [-1.49, 2.63, -28.40]], a: [[.08, 2.60, -34.85], [.43, 2.72, -35.32]], b: [[-1.87, 2.41, -32.38], [-1.29, 2.76, -33.48]], roll: -.052 },
  recover: { c: [[.7, 3.11, -28.5], [2.46, 4.3, -33.20]], a: [[.07, 2.26, -36.23], [.41, 2.07, -38.78]], b: [[-.77, 2.38, -35.48], [.34, 2.16, -37.48]], roll: .042 },
  lift: { c: [[1.33, -2.55, -45.65], [-.53, 6.65, -46.57]], a: [[0, 1.87, -49.8], [.22, 12.64, -49.1]], b: [[-.43, .96, -48.18], [.17, 10.26, -48.96]], roll: .062 },
  release: { c: [[-1.48, 2.91, -36.89], [2.45, 3.3, -37.41]], a: [[-.17, 1.89, -24.86], [-1.07, 2.34, -20.81]], b: [[-.55, 2.21, -25.66], [.56, 2.12, -7.22]], roll: -.033 },
};
shots.return = shots.console;
shots.oscilloscope = shots.trace;
shots.rebuild = shots.trace;
shots.orbit = shots.eclipse;

function place(target, points, t) {
  const [from, to] = points;
  target.set(mix(from[0], to[0], t), mix(from[1], to[1], t), mix(from[2], to[2], t));
}

export function createServerRoom({detail=false,continuousPacket=false}={}) {
  const scene = new THREE.Scene();
  const atmosphere = '#091823';
  scene.background = new THREE.Color(atmosphere);
  scene.fog = new THREE.FogExp2(atmosphere, .032);
  scene.add(new THREE.HemisphereLight('#90cbd7', '#374b63', 1.88));
  const overhead = new THREE.PointLight('#83b1cf', 110, 45, 1.65);
  overhead.position.set(1.8, 7.58, -5);
  scene.add(overhead);
  const cube = new THREE.BoxGeometry();
  const racks = detail ? [] : null;
  const roof = archiveStructure(scene, cube, racks);
  const terminal = makeConsole(scene, cube);
  const observation = makeIris(scene, 10.92, 3.46, -11.7, 2.85, true);
  const vault = makeIris(scene, .26, 3.08, -37.12, 2.5, false);
  const packet = makePacket(scene);
  const updateDetails = detail ? addServerDetails(scene, cube, racks, boxes, packet.group) : null;
  const shards = new THREE.Group();
  scene.add(shards);
  shards.position.set(.22, 2.41, -35.72);
  const shardMaterial = new THREE.MeshLambertMaterial({ color: '#3e6878' });
  for (let i = 0; i < 13; i++) {
    const shard = mesh(shards, cube, shardMaterial, 0, 0, 0);
    shard.scale.set(.32 + hash(i + 3) * .59, .29 + hash(i + 17) * .73, .07);
  }

  const aim = vector(0, 0, 0);
  const actor = { position: vector(2.47, -.015, 2.44), height: 2.18 };
  return ({ t, shot, music, camera }) => {
    const mode = shot.coldScene;
    const take = shots[mode];
    if (!take) return null;
    const p = clamp((t - shot.start) / Math.max(.001, shot.end - shot.start));
    const q = ease(p), onset = clamp(music?.onset || 0), tm = t - 134.65;
    if (continuousPacket) {
      placeServerPacket(packet.group.position,t);
    } else {
      place(packet.group.position, take.b, q);
      packet.group.position.y += .12 * Math.sin(p * Math.PI);
    }
    place(camera.position, take.c, q);
    place(aim, take.a, q);
    if (continuousPacket && (mode === 'lift' || mode === 'release')) {
      const {x,y,z}=packet.group.position;
      if (mode === 'lift') {
        camera.position.set(x+1.65-p*2.72,y-2.25+p*.75,z+4.06);
        aim.set(x+.02,y+.18,z-.22);
      } else {
        camera.position.set(x-2.1+p*3.2,y-1.85+1.85*Math.min(1,p*3.2),z+5.4+p*.9);
        aim.set(x+.25,y+.12,z-.48);
      }
    }
    camera.lookAt(aim);
    camera.rotateZ(take.roll * (.8 - .6 * q));
    roof.visible = mode !== 'racks' && mode !== 'lift';
    scene.userData.subject = !continuousPacket && mode === 'archive' ? actor : null;
    terminal.uniforms.t.value = tm;
    terminal.uniforms.phase.value = continuousPacket ? .48 + .32 * Math.sin(tm * .42 + .72)
      : mode === 'trace' ? q : .17 + .32 * Math.sin(tm * .68) ** 2;
    terminal.uniforms.accent.value = onset;
    observation.orbit.rotation.z = .42 + tm * .030;
    vault.orbit.rotation.z = -.34 - tm * .087;
    packet.core.rotation.set(tm * .95, tm * 1.19, tm * .66);
    packet.shell.rotation.set(-tm * .65, tm * .81, tm * .73);
    packet.glow.quaternion.copy(camera.quaternion);
    packet.glow.material.uniforms.accent.value = onset;
    packet.lights.intensity = 7 + onset * 4.2;
    packet.group.visible = mode !== 'trace' && mode !== 'oscilloscope' && mode !== 'rebuild';
    updateDetails?.({ t: tm, onset, roofVisible: roof.visible });
    shards.visible = mode === 'eclipse' || mode === 'orbit' || mode === 'reach' || mode === 'recover';
    if (shards.visible) {
      shards.children.forEach((shard, i) => {
        const motion = tm * (.093 + hash(i * 7) * .059);
        const r = 1.18 + hash(i * 9) * 1.87;
        const angle = i * TAU / shards.children.length + motion;
        shard.position.set(Math.cos(angle) * r, Math.sin(angle) * r * .53, Math.sin(angle + 1) * 2.15);
        shard.rotation.set(motion + i, -.4 * motion + 3.4 * hash(i), i * .93 + motion * 1.40);
      });
    }
    return scene;
  };
}
