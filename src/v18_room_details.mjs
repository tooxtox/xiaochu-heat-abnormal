import * as THREE from '../node_modules/three/build/three.module.js';

const box = new THREE.BoxGeometry();
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const up = new THREE.Vector3(0, 1, 0);
const step = new THREE.Vector3();
const dummy = new THREE.Object3D();
const TAU = Math.PI * 2;

function batch(scene, geometry, material, parts, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
  parts.forEach((part, i) => {
    place(part);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new THREE.Color(part.at(-1)));
  });
  scene.add(mesh);
  return mesh;
}

function panels(scene, parts, material = new THREE.MeshLambertMaterial()) {
  return batch(scene, box, material, parts, ([x, y, z, w, h, d]) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.quaternion.identity();
  });
}

function conduits(scene, parts) {
  return batch(scene, cylinder, new THREE.MeshLambertMaterial(), parts, ([a, b, radius]) => {
    step.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    dummy.position.set(a[0] + step.x * .5, a[1] + step.y * .5, a[2] + step.z * .5);
    dummy.scale.set(radius, step.length(), radius);
    dummy.quaternion.setFromUnitVectors(up, step.normalize());
  });
}

const panelMetal = '#426978';
const edgeTrim = '#4CA9B1';
const live = '#68BAC8';
const amber = '#CE9B65';

export function addArchiveDetails(scene, cabinets) {
  const metal = [], lights = [], cables = [], doors = [];
  cabinets.forEach(({ x, z, w, h, d, y, front, row, col }) => {
    for (const side of [-1, 1]) {
      metal.push([x + side * w * .439, y + h * .5, front + .10, .13, h * .9, .13, panelMetal]);
      metal.push([x + side * (w * .5 + .025), y + h * .51, z + .24, .045, h * .57, .23, '#366A7E']);
      metal.push([x + side * w * .444, y + .12, z + .55, .21, .23, .26, '#638295']);
    }
    // Lid ID bars and interrupted vents give the straight-down view a different surface detail.
    metal.push([x, y + h + .08, z + d * .30, w * .83, .12, .20, '#263B4B']);
    for (let i = 0; i < 5; i++) {
      const k = (i + row - col + 10) % 5;
      metal.push([x + (i - 2) * .24, y + h + .15, z + d * .30, .07 + .022 * k, .021, .134, '#85ADB2']);
    }
    lights.push([x, y + h + .145, z - d * .34, w * .67, .016, .045, row % 4 === 1 ? amber : edgeTrim]);
    // Inset status panel with distinct socket banks above the original shelves.
    metal.push([x + w * .194, y + h - .47, front + .14, w * .46, .26, .16, '#172C3C']);
    for (let i = 0; i < 4; i++) {
      lights.push([x + w * (.035 + i * .098), y + h - .44, front + .237, w * .027, .045, .03,
        (row + col + i) % 7 === 0 ? amber : live]);
    }
    metal.push([x - w * .32, y + h * .5, front + .20, .09, .68, .18, '#679096']);

    if (row % 2 === 0) {
      doors.push([x, y + h * .53, front + .11, w * .79, h * .73, .035, '#589AA9']);
    }
    if (Math.abs(col) === 1 && row % 2 === 0) {
      const side = Math.sign(col);
      const connection = x - side * w * .27;
      cables.push([[connection, y + h, z], [connection, 3.4, z], .048, '#57656A']);
      cables.push([[connection, 3.4, z], [side * 4.03, 5.7, z - .8], .054, '#57656A']);
      cables.push([[side * 4.03, 5.7, z - .8], [side * 4.03, 6.43, z - .8], .054, '#48616A']);
    }
  });

  for (const side of [-1, 1]) {
    for (let row = 0; row < 11; row++) {
      const z = 10 - row * 5.4;
      metal.push([side * 4.15, 6.37, z - 2.7, .77, .095, 5.36, '#233F50']);
      metal.push([side * 4.15, 6.48, z, .93, .33, .18, '#416473']);
      lights.push([side * 4.28, 6.28, z - .44, .065, .035, .64, '#5FA4BE']);
    }
    for (let i = 0; i < 3; i++) {
      const x = side * (3.85 + i * .19);
      cables.push([[x, 6.55, 10], [x, 6.55, -49], .058, i === 1 ? '#5E7E88' : '#314C60']);
    }
  }

  for (let level = 0; level < 5; level++) {
    const y = level * 3.48 - 2.4;
    for (const side of [-1, 1]) {
      // Inspection ledges and guard rails encircle the lift shaft.
      metal.push([side * 4.3, y + .23, -50, .74, .11, 8.7, '#315669']);
      for (let i = 0; i < 6; i++) {
        const z = -54 + i * 1.6;
        const x = side * 3.96;
        metal.push([x, y + .68, z, .10, .70, .10, '#507584']);
        lights.push([x, y + .92, z, .12, .034, .12, '#67ADBC']);
      }
      cables.push([[side * 3.96, y + .99, -54.15], [side * 3.96, y + .99, -45.9], .065, '#4C6878']);
      cables.push([[side * 4.05, y + .53, -54.15], [side * 4.05, y + .53, -45.9], .035, '#496677']);
    }
  }
  panels(scene, metal);
  panels(scene, lights, new THREE.MeshBasicMaterial());
  conduits(scene, cables);
  panels(scene, doors, new THREE.MeshPhongMaterial({
    transparent: true, opacity: .15, depthWrite: false, shininess: 58, specular: '#99BDCA',
  }));

  const scan = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 scanUv;
      void main(){scanUv=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 scanUv; uniform float time;
      void main(){
        float r=length(scanUv);
        float a=atan(scanUv.y,scanUv.x);
        float hatch=smoothstep(.16,.52,sin(a*32.));
        float pulse=fract(time*.24);
        float outer=1.-smoothstep(.006,.014,abs(r-.38));
        float inner=1.-smoothstep(.003,.012,abs(r-.265));
        float echo=1.-smoothstep(.005,.014,abs(r-(.11+.25*pulse)));
        float intensity=.30*outer*hatch+.12*inner+.14*echo*(1.-pulse);
        gl_FragColor=vec4(.19,.65,.74,intensity);
      }`,
  }));
  scan.rotation.x = -Math.PI * .5;
  scene.add(scan);
  return (t, packet, shot) => {
    scan.visible = shot.coldScene !== 'lift';
    scan.position.set(packet.x, -2.985, packet.z);
    scan.material.uniforms.time.value = t;
  };
}

export function addReactorDetails(scene, center, frames) {
  const steel = '#704D4C', darkSteel = '#483847', hotMetal = '#B27256';
  const metal = [], lamps = [], pipes = [];
  for (const side of [-1, 1]) {
    const walkX = side > 0 ? 6.6 : -8.7;
    for (let i = 0; i < 14; i++) {
      const z = 9 - i * 4.25;
      metal.push([walkX, .21, z - 1.65, 1.88, .16, 3.94, darkSteel]);
      metal.push([walkX - side * 1.0, .47, z, .13, .82, .13, steel]);
      for (let stripe = 0; stripe < 3; stripe++) {
        lamps.push([walkX - side * .94, .301, z - .23 - stripe * .235, .125, .027, .14, '#AD7151']);
      }
      for (let grate = 1; grate < 5; grate++) {
        metal.push([walkX, .308, z - grate * .65, 1.74, .021, .032, '#785851']);
      }
      metal.push([side * 9.75, 2.24, z, .53, .43, .22, darkSteel]);
      metal.push([side * 9.73, 3.10, z, .40, .34, .20, darkSteel]);
      lamps.push([side * 9.48, 2.31, z, .036, .18, .23, i % 3 === 1 ? '#CA7654' : '#7E5446']);
      metal.push([side * 9.5, 8.40, z - .47, 1.85, .31, .71, steel]);
      lamps.push([side * 9.45, 8.21, z - .46, 1.60, .050, .22, '#B47B57']);
    }
    for (const y of [.58, .86]) pipes.push([[walkX - side * .99, y, 9.20], [walkX - side * .99, y, -46.75], .053, steel]);
    for (const y of [2.27, 3.1]) pipes.push([[side * 9.77, y, 9.45], [side * 9.77, y, -45.65], .14, steel]);
    pipes.push([[side * 9.77, 2.27, center.z + 1.7], [side * 9.0, 1.68, center.z + 1.8], .16, hotMetal]);
    pipes.push([[side * 9.0, 1.68, center.z + 1.8], [center.x + side * 4.2, 1.68, center.z + 1.8], .16, hotMetal]);
    for (let i = 0; i < 8; i++) {
      const x = center.x + side * (.48 + i * .52);
      metal.push([x, 1.465, center.z + 2.44, .20, .09, .15, steel]);
      lamps.push([x, 1.51, center.z + 2.50, .08, .016, .05, '#c47658']);
    }
  }
  panels(scene, metal);
  const alarms = panels(scene, lamps, new THREE.MeshBasicMaterial());
  conduits(scene, pipes);

  for (const [index, frame] of frames.entries()) {
    // Mechanical keys rotate and move with each existing constraint ring.
    const keys = Array.from({ length: 24 }, (_, i) => {
      const phase = i * TAU / 24;
      const radius = 1 + (i % 4 === 0 ? .018 : .006);
      const color = i % 6 === 0 ? '#AD795E' : index === 2 ? '#463740' : '#734D49';
      return [phase, radius, i, color];
    });
    batch(frame, box, new THREE.MeshLambertMaterial(), keys, ([angle, radius, i]) => {
      dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, .04);
      dummy.scale.set(i % 4 === 0 ? .18 : .088, .048, .086 + index * .008);
      dummy.rotation.set(0, 0, angle);
    });
  }
  return heat => alarms.material.color.setScalar(.77 + heat * .20);
}
