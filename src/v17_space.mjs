import * as THREE from '../node_modules/three/build/three.module.js';

const TAU = Math.PI * 2;
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const noise = i => (Math.sin(i * 91.713 + 7.51) * 18189.67) % 1 * .5 + .5;
const cube = new THREE.BoxGeometry(1, 1, 1);
const transform = new THREE.Object3D();

function blocks(scene, rows) {
  const mesh = new THREE.InstancedMesh(cube, new THREE.MeshLambertMaterial({ color: 0xffffff }), rows.length);
  rows.forEach(([x, y, z, w, h, d, color, roll = 0], i) => {
    transform.position.set(x, y, z);
    transform.scale.set(w, h, d);
    transform.rotation.set(0, 0, roll);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, new THREE.Color(color));
  });
  scene.add(mesh);
}

function lineSegments(scene, vertices, color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
}

function ring(inner, outer, color, opacity) {
  return new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), new THREE.MeshBasicMaterial({
    color, opacity, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  }));
}

function corridor(detail) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b191c');
  scene.fog = new THREE.FogExp2('#0b191c', .035);
  scene.add(new THREE.HemisphereLight('#a9edd4', '#293646', 2.4));
  const light = new THREE.PointLight('#8bc7bf', 45, 24, 1.6);
  light.position.set(-3, 3.4, 4);
  scene.add(light);
  const rows = [[0, -.4, -30, 18, .79, 104, '#1f3639']];
  const panels = [], grid = [], guides = [], wiring = [], badges = [], lights = [];
  for (let i = 0; i < 19; i++) {
    const z = 12 - i * 4.55;
    rows.push([0, 6.2, z, 13.1, .23, .5, '#384a4c']);
    grid.push(-7, .015, z, 7, .015, z);
    for (const side of [-1, 1]) {
      rows.push([side * 6.38, 2.86, z, .29, 5.8, .85, '#3d555a']);
      rows.push([side * 7.01, 2.49, z - 1.65, .74, 4.73, 2.84, i % 3 === 1 ? '#23383c' : '#19292e']);
      rows.push([side * 6.25, .48, z - .74, .66, .33, 2.81, '#34474c']);
      for (let n = 0; n < 4; n++) {
        const at = z - 2.4 + n * .39;
        panels.push(side * 6.6, 2.35, at, side * 6.6, 3.45, at);
      }
      if (detail) {
        // Service cabinets and recessed panel slots share the same shell mesh.
        rows.push([side * 6.43, 1.85, z - 1.65, .14, 2.75, 1.86, '#2e4850']);
        rows.push([side * 6.26, 2.06, z - 1.65, .05, 1.47, 1.46, '#152a32']);
        rows.push([side * 6.30, 2.94, z - 1.65, .09, .14, 1.40, '#637d80']);
        for (let n = 0; n < 8; n++) {
          const y = 1.45 + n * .15;
          panels.push(side * 6.22, y, z - 2.20, side * 6.22, y, z - 1.10);
          if (n % 3 === i % 3) badges.push(side * 6.19, y, z - 2.13, side * 6.19, y, z - 2.23);
        }
        lights.push(side * 4.85, 6.02, z - .75, side * 4.85, 6.02, z - 3.68);
        for (const x of [4.31, 4.58, 5.03]) {
          wiring.push(side * x, 5.62, z, side * x, 5.62, z - 4.55);
        }
        for (let n = 0; n < 3; n++) {
          const xx = side * (5.1 + n * .32);
          guides.push(xx, .028, z - .55, xx + side * .13, .028, z - .86);
        }
      }
    }
  }
  for (let i = -7; i <= 7; i++) grid.push(i, .015, 14, i, .015, -74);
  for (const x of [-5.95, -2.45, 2.45, 5.95]) guides.push(x, .025, 15, x, .025, -74);
  blocks(scene, rows);
  lineSegments(scene, grid, '#4e7f83', .46);
  lineSegments(scene, guides, '#9bd6c4', .58);
  lineSegments(scene, panels, '#afe7ca', .48);
  if (detail) {
    lineSegments(scene, wiring, '#577981', .56);
    lineSegments(scene, badges, '#ffb578', .83);
    lineSegments(scene, lights, '#b6ead8', .64);
  }
  const focal = new THREE.Group();
  focal.position.set(0, 2.45, -40);
  focal.add(ring(2.26, 2.29, '#b9f2da', .85));
  const outer = ring(3.31, 3.34, '#62b7ae', .59);
  outer.scale.set(1.15, .87, 1);
  focal.add(outer);
  scene.add(focal);
  return { scene, focal };
}

function starExit() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#361829');
  scene.fog = new THREE.FogExp2('#572533', .013);
  scene.add(new THREE.HemisphereLight('#ff9b78', '#332c4e', 2.25));
  const globe = new THREE.Group();
  globe.position.set(2.8, 6.4, -38);
  const dark = new THREE.Mesh(new THREE.SphereGeometry(7.2, 40, 24), new THREE.MeshBasicMaterial({ color: '#0b0b17', fog: false }));
  globe.add(dark);
  const disc = new THREE.Group();
  disc.rotation.set(1.26, 0, -.18);
  for (let i = 0; i < 9; i++) {
    const radius = 7.45 + i * .63;
    disc.add(ring(radius, radius + (i % 3 ? .055 : .21), i % 3 === 0 ? '#f3ad79' : '#d96961', .73 - .055 * i));
  }
  globe.add(disc);
  scene.add(globe);
  const haloGeometry = new THREE.PlaneGeometry(40, 40);
  const haloMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { charge: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv;
      uniform float charge;
      void main() {
        float r = distance(vUv,vec2(.5));
        float corona = .27 * exp(-abs(r - .185) * 19.);
        float rim = (.46 + charge * .12) * exp(-abs(r - .185) * 160.);
        float edge = 1. - smoothstep(.32, .5, r);
        gl_FragColor = vec4(1., .43 + rim*.45, .29 + rim*.30, (corona+rim)*edge);
      }`,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.position.set(2.8, 6.4, -46);
  scene.add(halo);
  const rows = [[0, -3.38, -21, 160, .30, 132, '#221c2a']];
  for (let i = 0; i < 90; i++) {
    const x = (noise(i * 4 + 1) - .5) * 124;
    const z = -27 - noise(i * 4 + 2) * 76;
    if (Math.abs(x) < 7 && z > -55) continue;
    const h = 1.4 + noise(i * 4 + 3) * 7.3, w = .6 + noise(i * 4 + 4) * 2.2;
    rows.push([x, -3.23 + h * .5, z, w, h, w * 1.33, i % 3 ? '#292329' : '#493039']);
  }
  const floorLines = [];
  for (let x = -28; x <= 28; x += 4) floorLines.push(x, -3.21, 25, x, -3.21, -92);
  for (let z = -92; z < 25; z += 4) floorLines.push(-28, -3.21, z, 28, -3.21, z);
  blocks(scene, rows);
  lineSegments(scene, floorLines, '#ac5c5c', .39);
  const rubble = new THREE.Group();
  const chip = new THREE.MeshLambertMaterial({ color: '#501f32' });
  for (let i = 0; i < 18; i++) {
    const piece = new THREE.Mesh(cube, chip);
    const width = .23 + .8 * noise(i + 14);
    piece.scale.set(width, width * .19, width * .67);
    rubble.add(piece);
  }
  scene.add(rubble);
  return { scene, globe, disc, halo, rubble };
}

export function drawV17SpaceFactory(additionalRooms = {}, { detail = false } = {}) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: false });
  renderer.setPixelRatio(1);
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, .12, 180);
  const rooms = {};
  function draw(c, which, t, shot, music, sceneCue = null) {
    draw.subject = null;
    const factory = additionalRooms[which];
    if (gl.isContextLost() || (!factory && which !== 'corridor' && which !== 'star')) return false;
    camera.up.set(0, 1, 0);
    if (camera.fov !== 45) {
      camera.fov = 45;
      camera.updateProjectionMatrix();
    }
    const scale = Math.hypot(c.getTransform().a, c.getTransform().b);
    const height = clamp(Math.round(1080 * scale), 270, detail ? 900 : 720);
    const width = Math.round(height * 16 / 9);
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const progress = clamp((t - shot.start) / (shot.end - shot.start), 0, 1);
    const direction = shot.id % 2 ? 1 : -1;
    const onset = music.onset || 0;
    let scene;
    if (factory) {
      const updateRoom = rooms[which] ??= factory();
      scene = updateRoom({ t, shot, music, camera, sceneCue });
      if (!scene) return false;
    } else if (which === 'corridor') {
      const room = rooms.corridor ??= corridor(detail);
      scene = room.scene;
      room.focal.rotation.z = t * .10;
      const close = shot.mode === 'portrait';
      const x = direction * (close ? 2.66 : 1.55) + Math.sin(t * .62) * .28;
      camera.position.set(x, 1.96 + Math.sin(t * .49) * .24, (close ? 4 : 11) - progress * (close ? 3.1 : 8.7));
      camera.lookAt(-x * .35, 2.12 + onset * .06, -34);
    } else {
      const room = rooms.star ??= starExit();
      scene = room.scene;
      const sweep = (progress - .5) * direction;
      camera.position.set(5.3 + sweep * 7 + Math.sin(t * .31) * 2, 2.2 + sweep * 2.5, 12 - progress * 7);
      camera.lookAt(-2.3 + sweep * 3, 3, -41);
      room.disc.rotation.set(1.22 + Math.sin(t * .34) * .10, 0, -.22 + Math.sin(t * .56) * .16);
      room.halo.material.uniforms.charge.value = onset;
      room.rubble.children.forEach((piece, i) => {
        const phase = (t * (.035 + i * .002) + noise(i * 13.1)) % 1;
        const a = noise(i * 3.1) * TAU + t * (i % 2 ? -.09 : .14);
        const radius = 4.4 + noise(i * 7.4) * 18;
        piece.position.set(2 + Math.cos(a) * radius, 3.8 + Math.sin(a) * radius * .51, -38 + phase * 41);
        piece.rotation.set(a, t * .2 + i, a * .7);
      });
    }
    renderer.render(scene, camera);
    const actor = scene.userData.subject;
    if (actor?.position && Number.isFinite(actor.height)) {
      const foot = actor.position.clone().project(camera);
      const head = actor.position.clone().add(new THREE.Vector3(0, actor.height, 0)).project(camera);
      draw.subject = { x: (1 + foot.x) * 960, y: (1 - foot.y) * 540, height: (head.y - foot.y) * 540, depth: foot.z };
    }
    c.drawImage(canvas, 0, 0, 1920, 1080);
    return true;
  }
  return draw;
}
