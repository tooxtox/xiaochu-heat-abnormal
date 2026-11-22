import * as THREE from '../node_modules/three/build/three.module.js';
import { addReactorDetails } from './v18_room_details.mjs';

const TAU = Math.PI * 2;
const START = 212.58333333333334;
const END = 215.21666666666667;
const CENTER = new THREE.Vector3(-3.7, 4.4, -27);
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const fract = value => value - Math.floor(value);
const scatter = seed => fract(Math.sin(seed * 91.713 + 7.51) * 18189.67);
const box = new THREE.BoxGeometry();
const marker = new THREE.Object3D();

function staticBlocks(scene, parts) {
  const mesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), parts.length);
  parts.forEach(([x, y, z, width, height, depth, color, roll = 0], index) => {
    marker.position.set(x, y, z);
    marker.scale.set(width, height, depth);
    marker.rotation.set(0, 0, roll);
    marker.updateMatrix();
    mesh.setMatrixAt(index, marker.matrix);
    mesh.setColorAt(index, new THREE.Color(color));
  });
  scene.add(mesh);
}

function lines(scene, vertices, color, opacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({ color, opacity, transparent: true });
  scene.add(new THREE.LineSegments(geometry, material));
}

function reactorDeck(scene) {
  const parts = [
    [0, -.53, -25, 34, 1, 78, '#23151c'],
    [CENTER.x, .45, CENTER.z, 12, .9, 8, '#3d2327'],
    [CENTER.x, 1.15, CENTER.z, 8, .6, 5, '#66382f'],
    [0, 10.5, -29, 29, .36, 76, '#140f18'],
    [-11.7, 4.8, -29, .8, 9.7, 76, '#25131b'],
    [11.7, 4.8, -29, .8, 9.7, 76, '#28161d'],
  ];
  const seams = [];
  const guideLights = [];
  for (let i = 0; i < 13; i++) {
    const z = 7 - i * 4.9;
    parts.push([0, 8.91, z, 24, .40, .42, '#47292d']);
    seams.push(-11, -.015, z, 11, -.015, z);
    for (const side of [-1, 1]) {
      parts.push([side * 10.8, 4.45, z, .74, 8.9, .65, '#472c31']);
      parts.push([side * 9.9, 7.95, z - .06, .49, 2.2, .64, '#4c2a2d', side * -.72]);
      parts.push([side * (8.95 + .7 * scatter(i + side)), .205, z - .98, 2.18, .44, 2.08, '#3b2a30']);
      guideLights.push(side * 7.84, .013, z - 1.85, side * 7.84, .013, z + .85);
    }
  }
  for (const x of [-7.4, -3.9, 0, 3.9, 7.4]) seams.push(x, -.013, 11, x, -.013, -56);
  staticBlocks(scene, parts);
  lines(scene, seams, '#956858', .37);
  lines(scene, guideLights, '#c48663', .8);
}

function heatedCore() {
  const material = new THREE.ShaderMaterial({
    uniforms: { phase: { value: 0 }, swell: { value: 0 }, failure: { value: 0 } },
    vertexShader: `
      uniform float phase;
      uniform float swell;
      varying vec3 vHull;
      varying vec3 vNormal;
      void main() {
        vHull = normalize(position);
        vNormal = normalize(normalMatrix * normal);
        float blip = .022 * sin(11.*vHull.x + 5.*vHull.y + phase)
                   + .025 * sin(7.*vHull.z - 1.8*phase);
        gl_Position = projectionMatrix * modelViewMatrix
          * vec4(position * (1. + blip + swell * .045), 1.);
      }`,
    fragmentShader: `
      uniform float phase;
      uniform float failure;
      uniform float swell;
      varying vec3 vHull;
      varying vec3 vNormal;
      void main() {
        vec3 p = normalize(vHull);
        float border = 1. - abs(normalize(vNormal).z);
        float plate = sin(p.x*14. + sin(p.y*10.)) + sin(p.z*13. + p.y*9.)
                     + .32*sin(10.*p.z + p.x*17. + phase);
        float fracture = 1. - smoothstep(.04, .22 + failure*.13, abs(plate-.31));
        float specks = .5 + .5*sin(14.*p.y + 4.*p.z - phase*.7);
        vec3 shell = mix(vec3(.20,.075,.095), vec3(.43,.16,.12), specks*.7);
        vec3 hot = mix(vec3(.83,.28,.18), vec3(1.,.67,.37), swell*.38 + failure*.24);
        vec3 result = mix(shell, hot, clamp(fracture*.9 + pow(border,3.)*.83, 0., 1.));
        gl_FragColor = vec4(result,1.);
      }`,
  });
  return new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 4), material);
}

function orbitParts(scene) {
  const collar = new THREE.Group();
  collar.position.copy(CENTER);
  scene.add(collar);

  const frame = new THREE.TorusGeometry(1, .028, 7, 100);
  const frames = [3.05, 4.12, 5.18].map((radius, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: ['#d48f68', '#a66052', '#754e48'][index],
    });
    const mesh = new THREE.Mesh(frame, material);
    mesh.scale.setScalar(radius);
    collar.add(mesh);
    return mesh;
  });

  const sections = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), 32);
  sections.frustumCulled = false;
  for (let i = 0; i < sections.count; i++) {
    sections.setColorAt(i, new THREE.Color(i % 4 === 0 ? '#b67651' : i % 3 === 0 ? '#77433b' : '#35292b'));
  }
  sections.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  collar.add(sections);

  const rods = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: '#bb6f4b' }), 12);
  rods.frustumCulled = false;
  rods.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  collar.add(rods);

  return { collar, frames, sections, rods };
}

function sparks(scene) {
  const positions = new Float32Array(80 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.PointsMaterial({ color: '#cd8051', opacity: .70, transparent: true, depthWrite: false, size: .065 });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return points;
}

export function createReactorRoom({ detail = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#211520');
  scene.fog = new THREE.FogExp2('#341a24', .029);
  scene.add(new THREE.HemisphereLight('#f6bd9a', '#3c3e58', 1.52));
  const edge = new THREE.DirectionalLight('#ff8057', 1.78);
  edge.position.set(-6, 6, 3);
  scene.add(edge);
  const coreLight = new THREE.PointLight('#ed763a', 74, 19, 1.6);
  coreLight.position.copy(CENTER).add(new THREE.Vector3(1.2, -.4, 2.8));
  scene.add(coreLight);

  reactorDeck(scene);
  const core = heatedCore();
  const { collar, frames, sections, rods } = orbitParts(scene);
  collar.add(core);
  const glowPoints = sparks(scene);
  const updateDetail = detail ? addReactorDetails(scene, CENTER, frames) : null;

  return ({ t, shot, music, camera }) => {
    const progress = clamp((t - START) / (END - START));
    const age = Math.max(0, t - shot.start);
    const kick = Math.exp(-age * 15) * (shot.onset?.strength ?? .58);
    const heat = clamp(.55 * kick + .25 * (music.onset ?? 0) + .20 * (music.low ?? 0));
    const rupture = clamp((progress - .22) / .74);
    core.material.uniforms.phase.value = (t - START) * 3.4;
    core.material.uniforms.swell.value = heat;
    core.material.uniforms.failure.value = rupture;
    core.rotation.set(progress * .22, progress * .65, -.15);
    coreLight.intensity = 64 + heat * 27;
    if (updateDetail) updateDetail(heat);

    frames.forEach((mesh, index) => {
      mesh.rotation.set(.32 + index * .31 + Math.sin(progress * 2.6) * .11, -.22 + .46 * index, progress * (.31 + index * .15));
      mesh.position.z = index * .42 - 1.2 + rupture * index * .42;
    });
    for (let i = 0; i < sections.count; i++) {
      const lane = Math.floor(i / 16);
      const a = i / 16 * TAU + progress * (lane ? -.4 : .67) + lane * .17;
      const release = rupture * (i % 5 === 0 ? 1.6 : .37) * scatter(i + 22);
      const radius = 3.21 + lane * 1.73 + release + heat * .19;
      marker.position.set(Math.cos(a) * radius, Math.sin(a) * radius * .88, (lane - .6) * 1.82 + release * 2.9);
      marker.scale.set(.37 + lane * .11, .76 + lane * .32, .32 + lane * .24);
      marker.rotation.set(.16 * Math.cos(a) + release, release * .34, a + release * .72);
      marker.updateMatrix();
      sections.setMatrixAt(i, marker.matrix);
    }
    sections.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < rods.count; i++) {
      const a = i / 12 * TAU + progress * .35;
      const radius = 2.79 + rupture * (.8 + scatter(i + 50)) + heat * .18;
      marker.position.set(Math.cos(a) * radius, Math.sin(a) * radius * .93, .8 + rupture);
      marker.scale.set(.105, .112, .94 + heat * .6);
      marker.rotation.set(.37 * Math.sin(a), .43 * Math.cos(a), 0);
      marker.updateMatrix();
      rods.setMatrixAt(i, marker.matrix);
    }
    rods.instanceMatrix.needsUpdate = true;

    const positions = glowPoints.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const a = scatter(i * 4 + 1) * TAU + progress * (i % 2 ? .7 : -.28);
      const drift = fract(scatter(i * 4 + 2) + progress * (.20 + scatter(i * 4 + 3) * .85));
      const radius = 2.7 + drift * (4 + rupture * 3.1);
      positions.setXYZ(i, CENTER.x + Math.cos(a) * radius, CENTER.y + Math.sin(a) * radius * .83, CENTER.z - 1 + drift * 14);
    }
    positions.needsUpdate = true;

    const view = age / Math.max(.08, shot.end - shot.start);
    const turn = shot.id % 2 ? -1 : 1;
    if (shot.mode === 'portrait') {
      camera.position.set(5.15 + turn * .7 - view * .95, 2.35 + view * .22, 3.6 - view * 1.25);
      camera.lookAt(2.05, 4.18, CENTER.z);
    } else if (shot.mode === 'abstract') {
      camera.position.set(turn * (5.4 - view * 1.8), 5.4 - view * .66, -11.5 - view * 2.3);
      camera.lookAt(CENTER.x + .25, CENTER.y, CENTER.z);
    } else {
      camera.position.set(4.6 + turn * 2.2 - view * 1.45, 2.7 - turn * .52 + view * .55, 7.6 - view * 5.0);
      camera.lookAt(-.8, 4.07, CENTER.z);
    }
    return scene;
  };
}
