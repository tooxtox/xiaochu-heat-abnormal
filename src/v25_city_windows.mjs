import * as THREE from '../node_modules/three/build/three.module.js';

const vertex = /* glsl */ `
  attribute vec2 room;
  varying vec2 pane;
  varying vec2 interior;
  varying vec3 tint;
  varying vec3 view;
  #include <fog_pars_vertex>
  void main() {
    vec4 local = instanceMatrix * vec4(position, 1.);
    vec4 mvPosition = modelViewMatrix * local;
    vec3 towardCamera = normalize(cameraPosition - (modelMatrix * local).xyz);
    vec3 horizontal = normalize(mat3(modelMatrix) * instanceMatrix[0].xyz);
    vec3 vertical = normalize(mat3(modelMatrix) * instanceMatrix[1].xyz);
    view = vec3(dot(towardCamera, horizontal), dot(towardCamera, vertical),
                dot(towardCamera, normalize(cross(horizontal, vertical))));
    pane = uv;
    interior = room;
    tint = instanceColor;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragment = /* glsl */ `
  uniform vec3 frameTint;
  uniform vec3 reflectedSky;
  varying vec2 pane;
  varying vec2 interior;
  varying vec3 tint;
  varying vec3 view;
  #include <fog_pars_fragment>

  float boxMask(vec2 p, vec2 a, vec2 b) {
    vec2 f = max(fwidth(p)*.70, vec2(.004));
    vec2 m = smoothstep(a-f,a+f,p) * (1.-smoothstep(b-f,b+f,p));
    return m.x*m.y;
  }
  void main() {
    vec2 p = pane;
    vec2 edge = min(p,1.-p);
    float lightOn = interior.x;
    float seed = interior.y;
    vec2 depthRay = view.xy / max(.34,abs(view.z));
    vec2 roomUV = p + clamp(depthRay * .24,vec2(-.49),vec2(.49));
    float back = boxMask(roomUV, vec2(.08,.17), vec2(.92,.93));
    float shade = mix(.37,.99,smoothstep(.03,.99,roomUV.y)) * (.56 + .44*back);
    vec3 glass = tint * shade * mix(.55,.67,lightOn);

    // An illuminated ceiling, desks and a slightly offset screen sit behind the glass.
    float furniture = boxMask(roomUV,vec2(.10,.08),vec2(.89,.32));
    float monitor = boxMask(roomUV,vec2(.15+seed*.31,.31),vec2(.38+seed*.31,.59));
    float screen = boxMask(roomUV,vec2(.176+seed*.31,.36),vec2(.354+seed*.31,.56));
    float bookcase = boxMask(roomUV,vec2(.71,.15),vec2(.90,.74)) * step(.64,seed);
    glass = mix(glass,glass*.24,max(furniture,max(monitor,bookcase))*lightOn*.84);
    glass += tint * (boxMask(roomUV,vec2(.24,.79),vec2(.79,.87))*.57 +
              screen*.21) * lightOn;

    // Only some rooms have lowered blinds. Their separation remains visible in close passes.
    float slatsCoord = (p.y+.03)*15.;
    float slats = 1.-smoothstep(.12,.23,abs(fract(slatsCoord)-.5));
    slats *= (1.-smoothstep(.17,.5,fwidth(slatsCoord))) * step(.61,seed) *
             smoothstep(.49+seed*.19,.53+seed*.19,p.y);
    glass = mix(glass,glass*.37,slats*.75);
    float skew = p.x+.55*p.y+.47*view.x+.19*seed;
    float reflection = exp(-pow((skew-.77)*5.5,2.)) * (.18+.43*(1.-abs(view.z)));
    glass += reflectedSky * (.10+.32*reflection) * (1.-.51*lightOn);
    glass += reflectedSky * boxMask(p,vec2(.08,.75),vec2(.93,.78))*.13;

    // Layered reveals and a bevel catch a different light than the pane.
    float sash = 1.-boxMask(p,vec2(.076,.088),vec2(.924,.916));
    float recess = 1.-boxMask(p,vec2(.109,.126),vec2(.891,.878));
    float bevel = (boxMask(p,vec2(.022,.039),vec2(.979,.967)) -
                  boxMask(p,vec2(.045,.070),vec2(.956,.939))) * (p.y*.65+.32);
    float mullionAt = mix(.46,.54,seed);
    float mullion = boxMask(p,vec2(mullionAt-.025,.09),vec2(mullionAt+.025,.915));
    float transom = boxMask(p,vec2(.08,.69),vec2(.92,.725))*step(.32,seed);
    vec3 metal = frameTint * (.57 + .52*bevel);
    glass = mix(glass,glass*.38,recess*.58);
    glass = mix(glass,metal,max(sash,max(mullion,transom)));
    gl_FragColor = vec4(glass,1.);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function buildCityWindows(rows, colors) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      frameTint: { value: new THREE.Color(colors.trim) },
      reflectedSky: { value: new THREE.Color(colors.upper) },
    },
    fog: true, vertexShader: vertex, fragmentShader: fragment,
  });
  const windows = new THREE.InstancedMesh(geometry, material, rows.length);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const rooms = new Float32Array(rows.length * 2);
  rows.forEach(({ x, y, z, width, height, yaw, roll, tone, lit, seed }, i) => {
    transform.position.set(x, y, z);
    transform.rotation.set(0, yaw, roll, 'YXZ');
    transform.scale.set(width, height, 1);
    transform.updateMatrix();
    windows.setMatrixAt(i, transform.matrix);
    windows.setColorAt(i, color.set(tone));
    rooms.set([Number(lit), seed], i * 2);
  });
  geometry.setAttribute('room', new THREE.InstancedBufferAttribute(rooms, 2));
  windows.computeBoundingSphere();
  return windows;
}
