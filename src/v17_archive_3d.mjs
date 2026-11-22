import * as THREE from '../node_modules/three/build/three.module.js';
import { addArchiveDetails } from './v18_room_details.mjs';

const clamp = x => Math.min(1, Math.max(0, x));
const mix = (a, b, p) => a + (b - a) * p;
const smooth = p => p * p * (3 - 2 * p);
const random = i => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

function addBoxes(scene, geometry, material, items) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  items.forEach(([x, y, z, w, h, d, color, angle = 0], i) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, angle, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new THREE.Color(color));
  });
  scene.add(mesh);
  return mesh;
}

function addLines(scene, points, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  scene.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color, opacity, transparent: true,
  })));
}

function makeArchitecture(scene, cabinets) {
  const cube = new THREE.BoxGeometry();
  const bodies = [];
  const details = [];
  const lights = [];
  const ceiling = [];
  const ceilingLights = [];
  const rails = [];
  for (let row = 0; row < 10; row++) {
    const z = 5 - row * 6.9;
    const railWidth = row < 7 ? 22 : 12;
    ceiling.push([0, 7.7, z, railWidth * 2, .25, .65, '#193447']);
    ceilingLights.push([0, 7.54, z, railWidth * 1.96, .047, .065, '#46788D']);
    for (const side of [-1, 1]) {
      bodies.push([side * railWidth, 2.7, z, .48, 10.4, .95, '#173244']);
      bodies.push([side * (railWidth + .6), 2.7, z - 3.1, .35, 10.5, 6.2, '#102334']);
      lights.push([side * (railWidth - .25), 2.4, z, .04, 8.8, .06, '#336673']);
    }
    if (row >= 8) continue;
    for (let col = -3; col <= 3; col++) {
      if (!col || random(row * 71 + (col + 3) * 11) < .13) continue;
      const r = random(row * 13 + col * 27);
      const x = 5.7 * col + (r - .5) * .49;
      const cabinetZ = z - 1.8 + (r - .5) * .79;
      const h = 3.8 + r * 1.68, w = 2.05 + .43 * r, d = 1.52;
      const bottom = -3.03 + (r > .84 ? .62 : 0);
      const front = cabinetZ + d * .52;
      if (cabinets) cabinets.push({ x, z: cabinetZ, w, h, d, y: bottom, front, row, col });
      bodies.push([x, bottom + h * .5, cabinetZ, w, h, d, r < .55 ? '#1D4156' : '#24485E']);
      details.push([x, bottom + h - .15, cabinetZ, w * 1.04, .19, d * 1.06, '#355D70']);
      for (let shelf = 0; shelf < 7; shelf++) {
        const y = bottom + .38 + shelf * (h - .75) / 7;
        details.push([x, y, front, w * .83, .24, .10, '#091D2C']);
        lights.push([x - w * .30, y + .01, front + .060, .095, .06, .024,
          (shelf + row * 3 + Math.abs(col)) % 13 ? '#3B8798' : '#C09158']);
        lights.push([x + w * .04, y + .015, front + .062, w * .36, .015, .015, '#305E75']);
      }
      // Different sizes of stacked spines remain legible in the overhead shot.
      for (let lid = 0; lid < 4; lid++) {
        details.push([x, bottom + h - .035, cabinetZ + (lid - 1.5) * .26, w * .79, .10, .065, '#43758A']);
      }
      rails.push(x - w / 2, bottom, front, x - w / 2, bottom + h, front,
        x + w / 2, bottom, front, x + w / 2, bottom + h, front);
    }
  }
  for (let level = 0; level < 5; level++) {
    const y = level * 3.48 - 2.4;
    for (let side = -1; side < 2; side += 2) {
      bodies.push([side * 4.85, y, -50, .55, .48, 10, '#1B3B4F']);
      bodies.push([0, y, -50 + side * 4.85, 10, .48, .55, '#284F65']);
      lights.push([side * 4.52, y + .23, -50, .061, .036, 9.2, '#6DB0BD']);
    }
  }
  for (let i = -16; i <= 16; i++) {
    rails.push(i * 2.6, -3.01, 14, i * 2.6, -3.01, -81);
  }
  for (let z = 14; z > -82; z -= 4.2) rails.push(-30, -3.01, z, 30, -3.01, z);
  addBoxes(scene, cube, new THREE.MeshLambertMaterial({ color: 0xffffff }), bodies);
  addBoxes(scene, cube, new THREE.MeshLambertMaterial({ color: 0xffffff }), details);
  addBoxes(scene, cube, new THREE.MeshBasicMaterial({ color: 0xffffff }), lights);
  addLines(scene, rails, '#618F9F', .25);
  return [
    addBoxes(scene, cube, new THREE.MeshLambertMaterial({ color: 0xffffff }), ceiling),
    addBoxes(scene, cube, new THREE.MeshBasicMaterial({ color: 0xffffff }), ceilingLights),
  ];
}

function makeFloor(scene, detail) {
  const time = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ color: '#152936' });
  material.onBeforeCompile = shader => {
    shader.uniforms.archiveTime = time;
    shader.vertexShader = 'varying vec2 vArchiveFloor;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvArchiveFloor=position.xy;');
    shader.fragmentShader = 'uniform float archiveTime; varying vec2 vArchiveFloor;\n' +
      shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 at=vArchiveFloor;
        float bend=sin(at.y*.73 + sin(at.x*.31-archiveTime*.26)*2.44);
        float sweep=sin(at.x*.95 + sin(at.y*.55+archiveTime*.31)*1.51);
        float light=pow(max(0.0,bend*sweep),9.);
        float lightBank=0.43 + 0.57 * pow(0.5 + 0.5 * sin(at.y*.23-at.x*.27),2.);
        diffuseColor.rgb+=vec3(.019,.112,.145)*light*lightBank;
        ${detail ? `
          vec2 tiles=at*.32;
          vec2 grout=abs(fract(tiles-.5)-.5);
          float joints=1.-smoothstep(.003,.019,min(grout.x,grout.y));
          float ripples=sin(at.x*1.2+at.y*.69+sin(at.y*1.53-archiveTime*.4));
          float refraction=pow(max(0.,ripples*bend),12.)*.35;
          diffuseColor.rgb*=1.-joints*.32;
          diffuseColor.rgb+=refraction*vec3(.017,.092,.113)*lightBank;
        ` : ''}
      `);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 112), material);
  floor.rotation.x = -Math.PI * .5;
  floor.position.set(0, -3.10, -34);
  scene.add(floor);
  return time;
}

function makeWater(scene) {
  const time = { value: 0 };
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(58, 108), new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { archiveTime: time },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `
      varying vec2 vUv; uniform float archiveTime;
      void main(){
        vec2 p=vUv*vec2(20.,40.);
        float waves=sin(p.x + sin(p.y*.64+archiveTime*.53) + .85*sin(p.y*1.31+archiveTime*.35));
        float ridges=pow(max(0.,waves),8.) * (0.4 + 0.6*sin(p.y*.57-archiveTime*.36)*sin(p.y*.57-archiveTime*.36));
        float falloff=1.-smoothstep(.18,.52,abs(vUv.x-.5));
        float port=exp(-distance(vUv,vec2(.507,.648))*33.);
        gl_FragColor=vec4(.33,.67,.76,((.026+.25*ridges)*falloff)+port*.51);
      }`,
  }));
  surface.rotation.x = -Math.PI * .5;
  surface.position.set(0, 10.6, -33);
  scene.add(surface);
  return { surface, time };
}

function makeShaftLights(scene) {
  const rays = [];
  const height = 14.4;
  const geometry = new THREE.CylinderGeometry(.38, 4.6, height, 16, 1, true);
  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, intensity: { value: 1 }, seed: { value: 0 } },
    vertexShader: `
      varying vec3 localPos; varying vec3 viewNormal; varying vec3 eye;
      void main(){
        localPos=position;
        vec4 viewPos=modelViewMatrix*vec4(position,1.);
        eye=-viewPos.xyz; viewNormal=normalMatrix*normal;
        gl_Position=projectionMatrix*viewPos;
      }`,
    fragmentShader: `
      varying vec3 localPos; varying vec3 viewNormal; varying vec3 eye;
      uniform float time, intensity,seed;
      void main(){
        float h=clamp((localPos.y+7.2)/14.4,0.,1.);
        float rim=pow(abs(dot(normalize(viewNormal),normalize(eye))),1.4);
        float bands=.76+.24*sin(localPos.x*2.7+localPos.z*3.2+time*.87+seed);
        float falloff=pow(h,1.23)*(1.-smoothstep(.88,1.,h));
        gl_FragColor=vec4(.28,.60,.75,.15*rim*bands*falloff*intensity);
      }`,
  });
  const sourceGeometry = new THREE.RingGeometry(.35, .46, 24);
  const sourceMaterial = new THREE.MeshBasicMaterial({
    color: '#84D3DD', side: THREE.DoubleSide, transparent: true, opacity: .70,
  });
  [[-5.0, -3], [6.4, -17], [-4.5, -32], [.4, -49]].forEach(([x, z], i) => {
    const source = new THREE.Mesh(sourceGeometry, sourceMaterial);
    source.position.set(x, 9.5, z);
    source.rotation.x = Math.PI * .5;
    scene.add(source);
    const material = beamMaterial.clone();
    material.uniforms.seed.value = i * 1.618;
    const beam = new THREE.Mesh(geometry, material);
    beam.position.set(x - (i % 2 ? .6 : -.6), 2.52, z + 1.4);
    beam.rotation.set(-.18, 0, i % 2 ? -.10 : .11);
    scene.add(beam);
    rays.push({ beam, source });
  });
  return rays;
}

function makeDrift(scene) {
  const points = [], phases = [];
  for (let i = 0; i < 280; i++) {
    points.push((random(i * 4 + 7) - .5) * 43, random(i * 4 + 8) * 12.2 - 1.5, 12 - random(i * 4 + 9) * 78);
    phases.push(random(i * 4 + 10));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time },
    vertexShader: `
      uniform float time; attribute float phase; varying float brightness;
      void main(){
        vec3 p=position;
        p.x+=.24*sin(phase*41.+time*.39);
        p.y+=.38*sin(phase*33.+time*.53);
        p.z+=.19*cos(phase*74.+time*.32);
        vec4 view=modelViewMatrix*vec4(p,1.);
        float d=max(1.,-view.z);
        brightness=(.29+.57*phase)*exp(-.019*d);
        gl_PointSize=clamp((9.+32.*phase)/d,1.0,4.2);
        gl_Position=projectionMatrix*view;
      }`,
    fragmentShader: `
      varying float brightness;
      void main(){
        float a=1.-smoothstep(.14,.50,distance(gl_PointCoord,vec2(.5)));
        gl_FragColor=vec4(.50,.80,.89,a*brightness*.65);
      }`,
  });
  scene.add(new THREE.Points(geometry, material));
  return time;
}

function makePacket(scene) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(.31), new THREE.MeshBasicMaterial({ color: '#FFCD8A' }));
  const wire = new THREE.Mesh(new THREE.OctahedronGeometry(.43), new THREE.MeshBasicMaterial({
    color: '#FFA862', wireframe: true, transparent: true, opacity: .53, depthWrite: false,
  }));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { pulse: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float pulse;
      void main(){
        float r=distance(vUv,vec2(.5));
        float a=.44*exp(-13.*r)*(1.-smoothstep(.24,.50,r))*(.78+.22*pulse);
        gl_FragColor=vec4(1.,.56,.25,a);
      }`,
  }));
  group.add(core, wire, glow);
  scene.add(group);
  return { group, core, wire, glow };
}

export function createArchiveRoom({ detail = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#091827');
  scene.fog = new THREE.FogExp2('#091827', .034);
  scene.add(new THREE.HemisphereLight('#A1D3DE', '#262946', 1.72));
  const spot = new THREE.PointLight('#69C7E3', 130, 34, 1.67);
  scene.add(spot);
  const cabinets = detail ? [] : null;
  const ceiling = makeArchitecture(scene, cabinets);
  const floorTime = makeFloor(scene, detail);
  const water = makeWater(scene);
  const beams = makeShaftLights(scene);
  const driftTime = makeDrift(scene);
  const packet = makePacket(scene);
  const updateDetail = cabinets ? addArchiveDetails(scene, cabinets) : null;

  return ({ t, shot, music, camera }) => {
    const p = clamp((t - shot.start) / (shot.end - shot.start));
    const q = smooth(p);
    const onset = clamp(music?.onset || 0);
    camera.up.set(0, 1, 0);
    let roll;
    if (shot.coldScene === 'racks') {
      camera.position.set(mix(6.2, -4.8, q), mix(20.0, 14.7, q), mix(-9.6, -22.2, q));
      camera.lookAt(mix(-.95, .85, q), -1.8, mix(-15.8, -25.4, q));
      roll = mix(-.32, .15, q);
      packet.group.position.set(mix(-.8, .6, q), .15 + .3 * Math.sin(p * Math.PI), mix(-16.6, -26.35, q));
    } else if (shot.coldScene === 'lift') {
      camera.position.set(mix(2.05, .34, q), mix(-.5, 8.0, q), mix(-47.6, -47.92, q));
      camera.lookAt(-.12, mix(4.3, 14.4, q), mix(-50.1, -49.05, q));
      roll = mix(.20, -.09, q);
      packet.group.position.set(-.58 + Math.sin(p * Math.PI) * .58, mix(2.4, 11.45, q), -49.6);
    } else {
      camera.position.set(mix(-3.3, .18, q), mix(6.65, .88, q), mix(9.6, -9.75, q));
      camera.lookAt(mix(-.95, .65, q), mix(1.1, -.14, q), mix(-14.5, -24.3, q));
      roll = mix(.09, -.16, q);
      packet.group.position.set(mix(-.72, .66, q), mix(1.88, .2, q), mix(-12.4, -21.6, q));
    }
    camera.rotateZ(roll + Math.sin(t * 2.12) * .012);
    const underwater = shot.coldScene !== 'racks';
    water.surface.visible = underwater;
    ceiling.forEach(mesh => { mesh.visible = underwater; });
    water.time.value = floorTime.value = driftTime.value = t;
    const { x, y, z } = packet.group.position;
    spot.position.set(x - 2, y + 5, z + 3.8);
    spot.intensity = 116 + 25 * onset;
    beams.forEach(({ beam, source }, i) => {
      source.visible = underwater;
      beam.material.uniforms.time.value = t;
      beam.material.uniforms.intensity.value = .84 + .16 * Math.sin(t * .86 + i) + onset * .22;
    });
    packet.core.rotation.set(t * .53, t * .81, t * .37);
    packet.wire.rotation.set(t * .69, -t * .41, t * .24);
    packet.wire.scale.setScalar(1.1 + onset * .17);
    packet.glow.quaternion.copy(camera.quaternion);
    packet.glow.material.uniforms.pulse.value = onset;
    if (updateDetail) updateDetail(t, packet.group.position, shot);
    return scene;
  };
}
