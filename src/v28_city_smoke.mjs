import * as THREE from '../node_modules/three/build/three.module.js';

const vertex = /* glsl */ `
  uniform float time;
  attribute vec3 cloud;
  varying vec2 pane;
  varying vec2 plume;
  void main(){
    float age=fract(time*cloud.z+cloud.x);
    vec3 origin=instanceMatrix[3].xyz;
    float seed=cloud.y;
    float width=instanceMatrix[0].x;
    float rise=instanceMatrix[1].y;
    vec3 positionAt=origin+vec3(
      age*age*rise*.32+age*sin(age*5.+seed*7.)*width*.59,
      age*rise,
      -age*age*rise*.12
    );
    vec4 mv=modelViewMatrix*vec4(positionAt,1.);
    mv.xy+=position.xy*vec2(1.,1.27)*width*(.57+1.72*age);
    gl_Position=projectionMatrix*mv;
    pane=uv;
    plume=vec2(age,seed);
  }
`;

const fragment = /* glsl */ `
  uniform float time;
  uniform float density;
  varying vec2 pane;
  varying vec2 plume;
  float hash(vec2 v){ return fract(sin(dot(v, vec2(27.17,81.73)))*43758.54); }
  float noise(vec2 v){
    vec2 p=floor(v), u=fract(v);
    u=u*u*(3.-2.*u);
    return mix(mix(hash(p),hash(p+vec2(1.,0.)),u.x),
               mix(hash(p+vec2(0.,1.)),hash(p+1.),u.x),u.y);
  }
  void main(){
    vec2 p=pane-.5;
    vec2 flow=p*3.7+vec2(plume.y*13.,-time*.38);
    vec2 curl=vec2(noise(flow+3.),noise(flow-7.))-.5;
    vec2 q=flow+curl*.83;
    float grain=.56*noise(q)+.28*noise(q*2.18)+.16*noise(q*4.07);
    float shape=1.-smoothstep(.20,.50,length(p+curl*.15));
    float fade=smoothstep(0.,.12,plume.x)*(1.-smoothstep(.53,1.,plume.x));
    float cover=shape*smoothstep(.17,.67,grain)*fade*density;
    vec3 soot=mix(vec3(.006,.005,.008),vec3(.029,.014,.019),clamp((p.y+.35)*grain,0.,1.));
    gl_FragColor=vec4(soot,cover);
    #include <colorspace_fragment>
  }
`;

export function addRuinSmoke(scene, origins, damage, variant) {
  const heavy = damage === 2;
  const curb = {plaza: 17, freight: 8.6, alley: 5.5, skyline: 9.8, fracture: 6.3, canal: 10.8}[variant];
  const streets = (heavy ? [-7,-21,-39,-60] : [-14]).map((z, i) =>
    [(i % 2 ? 1 : -1) * (curb - 1.9), 1, z, heavy ? 2.7 : 1.8]);
  const near = [...origins].sort((a,b) => b[2] - a[2]);
  const sites = [...streets, ...near.filter((_, i) => i % 2 === 0).slice(0, heavy ? 6 : 2)];
  const particles = heavy ? 9 : 5;
  const geometry = new THREE.PlaneGeometry();
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment,
    uniforms: { time: {value: 0}, density: {value: heavy ? .85 : .53} },
    transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, sites.length * particles);
  mesh.frustumCulled = false;
  const cloud = new Float32Array(sites.length * particles * 3);
  const transform = new THREE.Matrix4();
  sites.forEach(([x,y,z,size], site) => {
    for (let i=0; i<particles; i++) {
      const seed = ((site * 17 + i * 23) % 91) / 91;
      const index = site*particles+i;
      transform.makeScale(size*(1+seed*.42),size*(heavy?9.5:5.1),1);
      transform.setPosition(x+(seed-.5)*.82,y,z+(seed-.5)*.56);
      mesh.setMatrixAt(index,transform);
      cloud.set([(i+.33*seed)/particles,seed,.086+site%3*.007],index*3);
    }
  });
  geometry.setAttribute('cloud',new THREE.InstancedBufferAttribute(cloud,3));
  scene.add(mesh);
  return time => { material.uniforms.time.value=time; };
}
