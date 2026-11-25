import * as THREE from '../node_modules/three/build/three.module.js';

const fract = x => x - Math.floor(x);
const noise = n => fract(Math.sin(n * 72.361 + 4.38) * 43758.5453);

export function cityDamageLevel(variant, cue, red) {
  if (cue.segment === 33) return 0;
  if (red || variant === 'fracture') return 2;
  return variant === 'freight' || cue.segment === 25 ? 1 : 0;
}

export const orangeDamagePalette = colors => ({
  ...colors, sky: '#572918', mist: '#754725', upper: '#dfad7b', lamp: '#ffae59', key: '#ffc692',
});

export function ruinedTower(k, { x, z, w, d, h, floor, seed }) {
  const severe = k.damage === 2;
  const remain = h * (severe ? .31 + noise(seed + 2) * .33 : .73);
  const roof = floor + remain, side = Math.sign(x);
  const char = severe ? '#321a20' : '#3c2b25';
  const concrete = severe ? '#695058' : '#715544';
  k.buildings++;
  k.solid(x, floor + remain / 2, z, w, remain, d, char);
  for (let i = 0; i < 3; i++) {
    const offset = (i - 1) * w * .29;
    const high = h * (.09 + noise(seed + i * 13) * (severe ? .55 : .23));
    k.solid(x + offset, roof + high / 2, z - d * .23, w * .26, high, d * .53, concrete,
      (noise(seed + i + 31) - .5) * .16);
    const column = high * (1.24 + noise(seed + i + 51) * .47);
    k.solid(x + offset, roof + column / 2, z + d * .36, .15, column, .19, '#422e2e', .19 * side);
    k.solid(x + offset, roof + high * .35, z + d * .12, w * .29, .24, d * .68, concrete, .18 * side, -.29);
    k.wire(x + offset, roof + high, z + d * .39, x + offset - side * 1.3, roof - .9, z + d * .53);
  }
  for (let i = 0; i < (severe ? 10 : 4); i++) {
    const u = noise(seed + i * 11 + 13), v = noise(seed + i * 17 + 7);
    const height = .28 + u * 1.38;
    k.solid(x - side * (w * .48 + v * (severe ? 5.0 : 1.7)), floor + height * .34,
      z + (v - .42) * d * 1.7, 1 + u * 2.7, height, .75 + v * 2.75,
      i % 3 ? char : concrete, (v - .5) * .66, u * Math.PI, (u - .5) * .65);
  }
  if (Math.abs(x) < 36 && z > -82) k.fires.push([x - side * w * .52, roof - .4, z + d * .26, severe ? 2.2 : 1.25]);
}

const vertex = /* glsl */ `
  attribute vec3 plume;
  attribute float seed;
  uniform float time;
  varying vec2 p;
  varying vec2 fx;
  varying float vType;
  void main(){
    float age=fract(time*(.09+seed*.11)+seed);
    vec3 center=vec3(instanceMatrix[3]);
    float smoke=step(.5,plume.z);
    center.x+=smoke*(sin(age*4.+seed*11.)*age*2.7+age*4.);
    center.y+=smoke*age*plume.y*.71;
    if(plume.z>1.5){
      center.y+=age*(5.+seed*9.);
      center.x+=age*3.*sin(seed*57.);
    }
    vec4 mv=modelViewMatrix*vec4(center,1.);
    mv.xy+=position.xy*plume.xy*mix(1.,.74+age*.65,smoke);
    gl_Position=projectionMatrix*mv;
    p=uv;
    fx=vec2(age,seed);
    vType=plume.z;
  }
`;
const fragment = /* glsl */ `
  uniform float time;
  uniform float severe;
  varying vec2 p;
  varying vec2 fx;
  varying float vType;
  float hash(vec2 v){return fract(sin(dot(v,vec2(25.7,63.91)))*42758.5);}
  float n(vec2 v){
    vec2 q=floor(v), f=fract(v); f=f*f*(3.-2.*f);
    return mix(mix(hash(q),hash(q+vec2(1,0)),f.x),mix(hash(q+vec2(0,1)),hash(q+1.),f.x),f.y);
  }
  void main(){
    float y=p.y, x=p.x-.5;
    vec3 color;
    float alpha;
    if(vType<.5){
      vec2 flow=vec2(x*5.+fx.y*9.,y*4.-time*2.85);
      float broad=n(flow)*.67+n(flow*2.31)*.33;
      float wedge=.46*(1.-y)*(.66+broad*.55);
      float tongue=abs(x+.078*sin(y*7.+time*4.+fx.y*10.)*y)+.17*y*(1.-broad);
      float rim=1.-smoothstep(wedge*.60,wedge+.047,tongue);
      float heat=clamp(rim*(1.-y*.83)*(.44+broad*.91),0.,1.);
      color=mix(vec3(.72,.023,.005),vec3(1.,.27,.022),smoothstep(.04,.58,heat));
      color=mix(color,vec3(1.,.88,.32),smoothstep(.54,.92,heat));
      alpha=rim*smoothstep(.012,.13,y)*(1.-smoothstep(.52,.99,y))*.92;
    }else if(vType<1.5){
      vec2 uv=vec2(x*3.+fx.y*9.,y*3.-time*.24);
      float volume=.54*n(uv)+.30*n(uv*2.09)+.16*n(uv*4.);
      float edge=1.-smoothstep(.26,.51,length(vec2(x,y-.51)));
      alpha=edge*smoothstep(.19,.66,volume)*sin(fx.x*3.14159)*mix(.42,.84,severe);
      color=mix(vec3(.018,.012,.019),vec3(.11,.047,.036),volume*.65);
    }else{
      color=vec3(1.,.47,.09);
      alpha=(1.-smoothstep(.08,.47,length(p-.5)))*sin(fx.x*3.14159);
    }
    gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
  }
`;

export function addCityFire(scene, roofFires, damage, variant) {
  const severe = damage === 2;
  const offset = { plaza: 15, freight: 9.6, alley: 5.7, skyline: 11, fracture: 7, canal: 10 }[variant];
  const groundFires = (severe ? [-5,-17,-30,-43,-56,-72] : [-8,-23,-48]).map((z, i) =>
    [(i % 2 ? 1 : -1) * (offset * (severe ? 1 : .82) + noise(i + 39) * 2), 0, z, severe ? 2.4 : 1.65]);
  const sites = [...groundFires, ...roofFires.filter((_, i) => i % (severe ? 2 : 4) === 0)];
  const rows = [];
  sites.forEach(([x, y, z, size], i) => {
    for (let j = 0; j < (severe ? 4 : 2); j++) {
      const spread = (noise(i * 9 + j) - .5) * size * 1.5;
      const height = size * (1.34 + noise(i + j * 17));
      rows.push([x + spread, y + height / 2, z + spread * .8, size * 1.35, height, 0, noise(i * 17 + j + 13)]);
    }
    for (let j = 0; j < (severe ? 5 : 3); j++) {
      const height = size * (severe ? 5.3 : 3.6) * (1 + .12 * j);
      rows.push([x + .4 * j, y + 2.4 + height * .30 + j * 1.7, z - j * .45, size * (severe ? 3.15 : 2.2), height, 1, noise(i * 33 + j + 97)]);
    }
    for(let j=0;j<(severe?9:3);j++){
      const seed=noise(i*43+j*13+41);
      rows.push([x+(seed-.5)*size*1.6, y+1.7+noise(seed*38)*3, z, .08+seed*.08, .12+seed*.13, 2, seed]);
    }
  });
  const geometry = new THREE.PlaneGeometry();
  const attributes = new Float32Array(rows.length * 3);
  const seeds = new Float32Array(rows.length);
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment,
    uniforms: { time: { value: 0 }, severe: { value: Number(severe) } }, transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, rows.length);
  const pose = new THREE.Matrix4();
  rows.forEach(([x,y,z,w,h,type,seed], i) => {
    mesh.setMatrixAt(i, pose.makeTranslation(x, y, z));
    attributes.set([w, h, type], i * 3);
    seeds[i] = seed;
  });
  geometry.setAttribute('plume', new THREE.InstancedBufferAttribute(attributes, 3));
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 1));
  mesh.frustumCulled = false;
  scene.add(mesh);
  const perSite = severe ? 14 : 6;
  const rubble = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial({ color: '#5b3836' }),
    groundFires.length * perSite);
  const stone = new THREE.Object3D();
  groundFires.forEach(([x,,z], site) => {
    for (let i = 0; i < perSite; i++) {
      const seed = site * 137 + i * 23;
      const u = noise(seed + 1), v = noise(seed + 2);
      const size = (.35 + noise(seed + 4) * 1.55) * (severe ? 1.2 : .75);
      stone.position.set(x + (u - .5) * 7, size * .23, z + (v - .5) * 5.5);
      stone.scale.set(size, size * .48, size * (.57 + v));
      stone.rotation.set(u * .35, v * 3.14, v * .72);
      stone.updateMatrix();
      rubble.setMatrixAt(site * perSite + i, stone.matrix);
    }
  });
  scene.add(rubble);
  const lights = groundFires.slice(0, severe ? 3 : 1).map(([x,y,z]) => {
    const light = new THREE.PointLight('#ff591e', 70, 19, 1.25);
    light.position.set(x, y + 2, z);
    scene.add(light);
    return light;
  });
  const falling = severe ? roofFires.filter((_, i) => i % 2 === 0).slice(0, 7).map(([x,y,z,size], i) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(size * .8, .28, size * .64),
      new THREE.MeshLambertMaterial({ color: i % 2 ? '#4d3132' : '#65454b' }));
    scene.add(piece);
    return { piece, x, y, z, seed: noise(i * 13 + 7) };
  }) : [];
  return time => {
    material.uniforms.time.value = time;
    lights.forEach((light,i) => { light.intensity = (severe ? 108 : 59) * (.78 + .23 * Math.sin(time * 7.3 + i * 2.7)); });
    falling.forEach(({piece, x, y, z, seed}) => {
      const travel = fract(time * (.28 + seed * .16) + seed);
      piece.visible = travel < .81;
      piece.position.set(x - Math.sign(x) * travel * 4, y - travel ** 2 * (y + 3) * 1.9, z + travel * 2.8);
      piece.rotation.set(travel * 2.9, seed * 6 + travel * 1.7, travel * 4.6);
    });
  };
}
