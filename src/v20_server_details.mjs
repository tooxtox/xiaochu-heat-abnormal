import * as THREE from '../node_modules/three/build/three.module.js';

const instances = new THREE.Object3D();
const cold = '#72b5c3';
const brass = '#b88958';
const frame = '#345260';
const dark = '#152732';
const paint = '#536f7c';

function planes(parent, material, rows) {
  const geometry = new THREE.PlaneGeometry();
  geometry.setAttribute('unitId', new THREE.InstancedBufferAttribute(Float32Array.from(rows, (_, i) => i), 1));
  const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
  for (const [i, [x, y, z, width, height, yaw = 0]] of rows.entries()) {
    instances.position.set(x, y, z);
    instances.scale.set(width, height, 1);
    instances.rotation.set(0, yaw, 0);
    instances.updateMatrix();
    mesh.setMatrixAt(i, instances.matrix);
  }
  parent.add(mesh);
  return mesh;
}

function panelMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: { value: 0 }, onset: { value: 0 }, profile: { value: 0 } },
    vertexShader: `
      attribute float unitId;
      varying vec2 p;
      varying float id;
      varying vec3 vAngle;
      #include <fog_pars_vertex>
      void main() {
        p = uv;
        id = unitId;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.);
        vAngle = vec3(dot(-mvPosition.xyz, normalize((modelViewMatrix * instanceMatrix)[0].xyz)),
          dot(-mvPosition.xyz, normalize((modelViewMatrix * instanceMatrix)[1].xyz)),
          dot(-mvPosition.xyz, normalize((modelViewMatrix * instanceMatrix)[2].xyz)));
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec2 p;
      varying float id;
      varying vec3 vAngle;
      uniform float time;
      uniform float onset;
      uniform float profile;
      #include <fog_pars_fragment>
      float box(vec2 uv, vec2 lo, vec2 hi) {
        return step(lo.x, uv.x)*step(lo.y, uv.y)*step(uv.x, hi.x)*step(uv.y, hi.y);
      }
      void main() {
        vec3 color = vec3(.052,.083,.099);
        vec3 blue = vec3(.35,.75,.84);
        vec3 amber = vec3(.92,.45,.17);
        float live = .69 + .31*sin(id*2.9 + time*1.77);
        if (profile > .5) {
          color += box(p,vec2(.07,.16),vec2(.93,.76))*vec3(.029,.073,.087);
          float grid = max(step(.975,fract(p.x*16.)),step(.964,fract(p.y*8.)));
          color += grid*.14*blue*box(p,vec2(.07,.16),vec2(.93,.76));
          float ix = floor(p.x*27.);
          float height = .14 + .4*pow(.5 + .5*sin(ix*.43 + id + time*.49),2.);
          color += .48*mix(blue,amber,step(.86,fract(ix*.321+id)))*step(.22,fract(p.x*27.))*box(p,vec2(.09,.18),vec2(.91,.18+height));
          color += .56*blue*box(p,vec2(.08,.85),vec2(.92,.89))*step(.28,fract(p.x*42.+id));
          color += live*amber*box(p,vec2(.09,.075),vec2(.14,.105));
          color += .32*blue*box(p,vec2(.19,.08),vec2(.44,.10));
        } else {
          float shelf = floor(p.y*12.);
          vec2 slot = vec2(p.x,fract(p.y*12.));
          float seam = box(slot,vec2(.03,.05),vec2(.97,.90));
          float grille = step(.55,fract(slot.x*44.))*box(slot,vec2(.27,.30),vec2(.68,.72));
          color += (.052*seam+.19*grille)*blue;
          color += .09*box(slot,vec2(.22,.16),vec2(.88,.23))*blue;
          float off = step(.25,fract(shelf*.717+id*.375));
          color += off*(.37+.24*live)*mix(blue,amber,step(.84,fract(shelf*.29+id*.33)))*box(slot,vec2(.065,.35),vec2(.095,.63));
          color += .24*blue*box(slot,vec2(.12,.38),vec2(.134,.60));
          color += (.06+.12*onset)*blue*exp(-31.*abs(p.x+.12*p.y-.145));
          vec3 angle = normalize(vAngle);
          float glint = abs(p.x + .27*p.y + .43*angle.x - .55);
          color += (.094*exp(-44.*glint)+.055*exp(-13.*abs(glint-.14)))*blue;
        }
        gl_FragColor=vec4(color,1.);
        #include <fog_fragment>
      }
    `,
  });
}

function cableBatch(parts) {
  const geometry = new THREE.BufferGeometry();
  const count = parts.reduce((sum, part) => sum + part.attributes.position.count, 0);
  for (const key of ['position', 'normal']) {
    const values = new Float32Array(count * 3);
    let offset = 0;
    for (const part of parts) {
      const source = part.attributes[key].array;
      values.set(source, offset);
      offset += source.length;
    }
    geometry.setAttribute(key, new THREE.BufferAttribute(values, 3));
  }
  parts.forEach(part => part.dispose());
  return geometry;
}

function safetyPlates(scene, labels) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64 * labels.length;
  const ctx = canvas.getContext('2d');
  const positions = [], uvs = [];
  for (const [i, [label, x, y, z, width, height, yaw = 0]] of labels.entries()) {
    const top = i * 64;
    ctx.fillStyle = '#203b48';
    ctx.fillRect(3, top+4, 250, 56);
    ctx.fillStyle = '#b18152';
    ctx.fillRect(8, top+9, 7, 46);
    ctx.font = '600 30px monospace';
    ctx.fillStyle = '#9dbac1';
    ctx.fillText(label, 26, top+42, 214);
    for (const [u, v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]) {
      const w = (u - .5) * width;
      positions.push(x + w * Math.cos(yaw), y + (v - .5) * height, z - w * Math.sin(yaw));
      uvs.push(u, 1-(i+1-v)/labels.length);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, alphaTest: .5 })));
}

function deckWash(scene) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 deck;
      varying float depth;
      void main() {
        vec4 point = modelViewMatrix*vec4(position,1.);
        deck = (modelMatrix*vec4(position,1.)).xyz;
        depth = -point.z;
        gl_Position = projectionMatrix*point;
      }
    `,
    fragmentShader: `
      varying vec3 deck;
      varying float depth;
      void main() {
        float x = abs(deck.x);
        float rail = exp(-4.6*abs(x-2.42));
        float grout = .54 + .46*smoothstep(.018,.075,fract(deck.z/1.66));
        float light = .11 + .30*pow(.5+.5*cos(deck.z*1.75),6.);
        float bounce = exp(-pow((x-2.2)*.43,2.))*(.60+.40*cos(deck.z*1.18));
        vec2 vault = (deck.xz-vec2(.26,-36.8))*vec2(.58,.31);
        float warmth = .25*exp(-dot(vault,vault));
        float fade = 1.-smoothstep(6.,47.,depth);
        gl_FragColor = vec4(vec3(.24,.54,.67)*(rail*light*grout+bounce*.10)+vec3(.50,.27,.12)*warmth,fade);
      }
    `,
  });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(30.5, 59), material);
  wash.rotation.x = -Math.PI / 2;
  wash.position.set(0, -.012, -13.5);
  scene.add(wash);
}

function haze(scene) {
  const count = 280;
  const dots = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    dots[i * 3] = 12 * Math.sin(i * 47.51 + .4);
    dots[i * 3 + 1] = (i * .746 % 1) * 8 - .2;
    dots[i * 3 + 2] = 18 - (i * .61803 % 1) * 72;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(dots, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying float alpha;
      void main() {
        vec3 p = position;
        p.x += .28*sin(time*.42+position.z);
        p.y += .19*cos(time*.27+position.x);
        vec4 mv = modelViewMatrix * vec4(p,1.);
        gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(30./max(1.,-mv.z),1.,4.5);
        alpha = .33 * smoothstep(.8,3.5,-mv.z)*(1.-smoothstep(9.,44.,-mv.z));
      }
    `,
    fragmentShader: `
      varying float alpha;
      void main() {
        float b=1.-smoothstep(.04,.50,length(gl_PointCoord-.5));
        gl_FragColor=vec4(.48,.67,.75,alpha*b);
      }
    `,
  });
  scene.add(new THREE.Points(geometry, material));
  return material;
}

export function addServerDetails(scene, cube, racks, boxes, packet) {
  const facade = [], profiling = [], steel = [], lights = [], ladders = [], ladderLights = [];
  const cables = [[], []];
  const cableRadius = [.051, .039];
  const wire = (type, points) => {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    const tube = new THREE.TubeGeometry(path, 12, cableRadius[type], 4, false);
    cables[type].push(tube.toNonIndexed());
    tube.dispose();
  };

  for (const { x, z, h, w, d, id } of racks) {
    const front = z + d * .5 + .135;
    const back = z - d * .5 - .113;
    facade.push([x, .46 * h, front, w - .45, .70 * h]);
    facade.push([x, .46 * h, back, w - .45, .70 * h, Math.PI]);
    profiling.push([x, h - .49, front + .008, w * .38, .23]);
    const side = Math.sign(x);
    for (const dx of [-1, 1]) {
      steel.push([x + dx * (w / 2 - .15), .49 * h, front + .035, .047, h - .44, .079, paint]);
      steel.push([x + dx * (w / 2 - .15), .49 * h, back - .02, .052, h - .37, .085, frame]);
      steel.push([x + dx * w * .41, .10, z, .25, .20, d + .20, dark]);
    }
    steel.push([x, h + .034, z, w - .15, .064, d - .15, dark]);
    for (let slat = 0; slat < 7; slat++) {
      steel.push([x, h + .076, z - .40 + slat * .13, w - .30, .024, .048, slat % 3 ? frame : paint]);
    }
    const aisle = x - side * w * .5;
    for (const lift of [.42, h - .42]) {
      steel.push([aisle, lift, z, .037, .078, d * .92, paint]);
    }
    profiling.push([aisle - side * .023, h - .73, z, .55, .33, -side * Math.PI * .5]);
    lights.push([x + w * .3, h - .50, front + .039, .080, .079, .013, id % 4 ? cold : brass]);
    lights.push([aisle - side * .033, h - 1.04, z, .021, .082, .42, id % 7 ? '#446b78' : brass]);
    if (id % 4 === 0) {
      wire(1, [[x - .41, .46, back], [x - .39, .25, back - .20], [x - .05, .16, back - .32], [x + .43, .40, back - .31], [x + .45, 1.18, back]]);
    }
  }

  for (const side of [-1, 1]) {
    const x = side * 3.54;
    for (const dx of [-.36, .36]) {
      ladders.push([x + dx, 7.03, -13.5, .096, .23, 58, paint]);
      ladders.push([x + dx, 7.61, -13.5, .064, .10, 58, frame]);
    }
    for (let i = 0; i < 56; i++) {
      const z = 15 - i * 1.02;
      ladders.push([x, 6.96, z, .77, .062, .095, frame]);
      if (i % 5 === 0) {
        ladders.push([x - side * .43, 7.73, z, .075, 1.3, .069, frame]);
        ladderLights.push([x, 6.88, z, .53, .051, .23, i % 10 ? '#456e7f' : cold]);
      }
    }
    for (let i = 0; i < 12; i++) {
      const z = 9 - i * 4.22;
      for (const offset of [-.12, .04, .20]) {
        wire(offset < 0 ? 1 : 0, [[x+offset, 7.10, z], [x+offset, 6.85, z-.57], [x+side*.5+offset, 5.57, z-.93], [x+side*1.26+offset, 4.37, z-1.49], [x+side*1.31+offset, 3.53, z-1.93]]);
      }
    }

    for (let i = 0; i < 32; i++) {
      const z = 13 - i * 1.66;
      steel.push([side * 2.46, .018, z, .58, .051, .19, dark]);
      lights.push([side * 2.46, .048, z, .44, .007, .051, i % 4 ? '#3e6b79' : brass]);
      if (i % 4 === 1) {
        const x = side * 3.05;
        steel.push([x, .44, z, .28, .90, .28, dark], [x, .84, z, .36, .16, .34, paint]);
        lights.push([x, .86, z + .18, .23, .038, .023, i % 8 === 1 ? cold : brass]);
      }
    }

    for (let bay = 0; bay < 7; bay++) {
      const z = 11 - bay * 8.2;
      const x = side * 13.9;
      steel.push([x, 3.88, z, .86, 7.77, .70, dark]);
      steel.push([x - side * .52, 3.18, z + .44, .24, 5.64, .10, paint]);
      for (const height of [.59, 2.33, 4.11, 5.87]) {
        steel.push([x, height, z + .25, .97, .29, .61, frame]);
      }
      lights.push([x - side * .51, 3.09, z + .51, .07, 3.98, .035, '#577e8a']);
    }

    for (let level = -3; level <= 5; level++) {
      const y = level * 2.5;
      steel.push([side * 4.15, y + .91, -45.1, .10, 1.87, .095, paint]);
      steel.push([side * 4.15, y + .91, -51.8, .10, 1.87, .095, paint]);
      steel.push([side * 4.15, y + 1.02, -48.6, .085, .085, 6.45, frame]);
      steel.push([side * 3.5, y + .28, -52.5, .85, .70, .141, dark]);
      profiling.push([side * 3.5, y + .31, -52.415, .60, .34]);
      lights.push([side * 4.00, y + 1.1, -49.22, .13, 1.45, .08, level % 3 ? '#568799' : brass]);
    }
  }

  for (const [x, y, z, direction] of [[10.92, 3.46, -11.7, 1], [.26, 3.08, -37.12, -1]]) {
    const isWindow = direction > 0;
    const radius = isWindow ? 3.05 : 2.7;
    for (let i = 0; i < 48; i++) {
      const angle = i * Math.PI / 24;
      const markerX = x + Math.cos(angle) * radius;
      const markerY = y + Math.sin(angle) * radius;
      const size = i % 4 === 0 ? .105 : .049;
      lights.push([markerX, markerY, z + .034, size, size, .034, i % 12 === 0 ? brass : '#5a939e']);
    }
    for (const fraction of [-1, 1]) {
      const leg = x + fraction * radius * .82;
      steel.push([leg, y - .51, z - .24, .16, 4.79, .12, dark]);
      lights.push([leg, y + 1.33, z - .166, .075, .67, .05, '#4d7588']);
    }
    const px = x + direction * 2.1;
    steel.push([px, y - 1.64, z + .62, .69, .36, .22, dark]);
    profiling.push([px, y - 1.64, z + .736, .54, .25]);
  }

  const consoleYaw = .13;
  for (const sign of [-1, 1]) {
    const x = -4.55 + sign * 2.78;
    const z = 5.5 - sign * .36;
    steel.push([x, .76, z + .55, .50, 1.25, .10, paint, consoleYaw]);
    profiling.push([x, .89, z + .616, .35, .48, consoleYaw]);
    lights.push([x, 1.14, z + .63, .25, .05, .036, brass, consoleYaw]);
    wire(1, [[x, 1.43, z-.51], [x, .74, z-.82], [x+sign*.13, .14, z-1.16], [x+sign*.93, .065, z-1.82], [x+sign*1.24, .04, z-2.73]]);
  }

  safetyPlates(scene, [
    ['SIGNAL / 21', -4.48, 1.07, 6.022, 1.79, .43, consoleYaw],
    ['OBSV / 07', 12.58, 1.46, -10.961, .53, .13],
    ['VAULT / 03', -.72, 5.89, -36.984, 1.38, .28],
    ['BUS / A1', -3.62, 3.22, -9.62, .55, .16],
    ['BUS / B1', 3.63, 3.22, -9.62, .55, .16],
    ['LIFT / 02', -2.5, .70, -52.421, .92, .23],
  ]);
  deckWash(scene);

  const steelMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  boxes(scene, cube, steel, steelMaterial);
  boxes(scene, cube, lights, lightMaterial);
  const ladder = new THREE.Group();
  scene.add(ladder);
  boxes(ladder, cube, ladders, steelMaterial);
  boxes(ladder, cube, ladderLights, lightMaterial);
  for (const [index, parts] of cables.entries()) {
    const material = new THREE.MeshLambertMaterial({ color: index === 0 ? '#366f7a' : '#915b40' });
    scene.add(new THREE.Mesh(cableBatch(parts), material));
  }

  const racksMaterial = panelMaterial();
  const profileMaterial = racksMaterial.clone();
  profileMaterial.uniforms.profile.value = 1;
  planes(scene, racksMaterial, facade);
  planes(scene, profileMaterial, profiling);

  const dust = haze(scene);
  const cage = new THREE.Group();
  const cageMaterial = new THREE.MeshBasicMaterial({ color: '#ce986a', transparent: true, opacity: .63, depthWrite: false });
  const ring = new THREE.TorusGeometry(.69, .012, 4, 40);
  cage.add(new THREE.Mesh(ring, cageMaterial));
  const transverse = new THREE.Mesh(ring, cageMaterial);
  transverse.rotation.x = Math.PI / 2;
  cage.add(transverse);
  packet.add(cage);

  return ({ t, onset, roofVisible }) => {
    ladder.visible = roofVisible;
    dust.uniforms.time.value = t;
    cage.rotation.set(.68 + t*.20, t*.44, .37 + t*.29);
    cage.scale.setScalar(1 + .075 * onset);
    for (const material of [racksMaterial, profileMaterial]) {
      material.uniforms.time.value = t;
      material.uniforms.onset.value = onset;
    }
  };
}
