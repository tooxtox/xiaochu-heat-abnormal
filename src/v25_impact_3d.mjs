import * as THREE from '../node_modules/three/build/three.module.js';
import { makeCityLayout } from './v19_city_layouts.mjs';
import { createBlackStar, skyDome } from './v18_city_3d.mjs';
import { DIVE_START, IMPACT_BEAT, impactAge } from './v25_impact.mjs';

const views = [[21, 16, 9], [-17, 12, 12], [10, 9, -1], [-13, 7, -3], [8, 5, 9]];
const clamp = THREE.MathUtils.clamp;

export function createV25ImpactRoom({damage=0,structuralDamage=false,smoke=false}={}) {
  const district = makeCityLayout('plaza', {detail:true,red:true,finishedWindows:true,damage,structuralDamage,smoke});
  const scene = district.scene;
  const sky = skyDome();
  sky.material.uniforms.zenith.value.set('#650718');
  scene.add(sky);
  const eclipse = createBlackStar(scene);
  eclipse.object.children[0].material.color.set('#0d050a');
  eclipse.corona.material.uniforms.tint.value.set('#ff4a39');
  eclipse.tint.forEach((material, index) => material.color.set(index % 3 ? '#f43b42' : '#ffad79'));
  const impact = new THREE.Vector3(0, .09, -38);
  const wakePositions = new Float32Array(8 * 6);
  const wakeGeometry = new THREE.BufferGeometry();
  wakeGeometry.setAttribute('position', new THREE.BufferAttribute(wakePositions, 3));
  const wake = new THREE.LineSegments(wakeGeometry, new THREE.LineBasicMaterial({
    color: '#ff7961', transparent: true, opacity: .67, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  wake.frustumCulled = false;
  scene.add(wake);
  const light = new THREE.PointLight('#ff232a', 0, 116, 1.6);
  light.position.set(0, 4, -38);
  scene.add(light);
  const waveGeometry = new THREE.RingGeometry(.91, 1, 96);
  const waves = Array.from({ length: 3 }, () => {
    const material = new THREE.MeshBasicMaterial({ color: '#ff4a2f', transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(waveGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(impact);
    scene.add(mesh);
    return mesh;
  });

  return ({ t, shot, music, camera }) => {
    district.update(t, music);
    const age = impactAge(t) + 1e-8;
    const descent = clamp((t - DIVE_START) / (IMPACT_BEAT - DIVE_START), 0, 1) ** 1.7;
    const radius = THREE.MathUtils.lerp(11.8, 7.1, descent);
    eclipse.object.position.set(-23 * (1 - descent), radius + 29 * (1 - descent), -38 - 48 * (1 - descent));
    eclipse.object.scale.setScalar(radius * (age < 0 ? 1 : Math.max(.12, 1 - age * 8)));
    eclipse.object.visible = age < .14;
    eclipse.disc.rotation.set(1.1 + descent * .32, -.17, -.29 + descent * .70);
    eclipse.corona.material.uniforms.heat.value = descent * 4;
    const view = views[clamp(shot.id - 4114, 0, views.length - 1)];
    camera.position.set(view[0] + 2.6 * descent, view[1], view[2] - 4.7 * descent);
    camera.lookAt(eclipse.object.position.x * .45, 12 + eclipse.object.position.y * .18, eclipse.object.position.z * .78 - 8);
    eclipse.corona.quaternion.copy(camera.quaternion);
    wake.visible = age < 0 && descent > .08;
    if (wake.visible) {
      const { x, y, z } = eclipse.object.position;
      for (let i = 0; i < 8; i++) {
        const spread = (i - 3.5) * radius * .16;
        const length = (.28 + (i % 4) * .12) * (15 + descent * 36);
        wakePositions.set([x + spread - length * .42, y + length * .61, z - length,
          x + spread - radius * .39, y + radius * .45, z - radius * .59], i * 6);
      }
      wakeGeometry.attributes.position.needsUpdate = true;
      wake.material.opacity = .32 + descent * .56;
    }
    sky.position.copy(camera.position);
    sky.material.uniforms.time.value = t;
    sky.material.uniforms.horizon.value.set(age < 0 ? '#c12734' : '#e31c2b');
    light.intensity = age < 0 ? 55 * descent ** 4 : 9800 * Math.exp(-age * 8);
    waves.forEach((ring, i) => {
      const elapsed = age - .035 * i;
      ring.visible = elapsed >= 0;
      ring.scale.setScalar(2 + Math.max(0, elapsed) * (106 - i * 7));
      ring.material.opacity = .80 * Math.exp(-Math.max(0, elapsed) * (4.6 + i));
      ring.position.y = .09 + i * .025;
    });
    return scene;
  };
}
