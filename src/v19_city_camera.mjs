import { PerspectiveCamera, Vector3 } from '../node_modules/three/build/three.module.js';

// All angles come from the two real 3D paths. The lens is fixed within the cut.
// Values are world coordinates. The wider crane routes clear the bridges above or stop short of them.
const tracks = {
  freight: {
    street: [
      [-6.9, 3.0, 20], [-5.2, 2.2, 12], [3.4, 2.8, 9], [5.45, 3.5, 5.5],
      [-3.9, 2.4, -10], [-1.6, 2.7, -17], [1.5, 3.65, -30], [2.3, 4.4, -36],
    ],
    pass: [
      [5.7, 13.8, 17], [5.5, 17.7, 6], [-5.6, 20.2, -11], [-5.1, 15.1, -35],
      [-4, 4.9, -22], [-3, 6.2, -30], [1.3, 6.4, -53], [4, 5.0, -67],
    ],
    close: [
      [4.4, 2.35, 9], [1.7, 2.3, 4], [-1.5, 2.65, -4], [-4.6, 3.25, -10],
      [5.1, 3.1, -15], [4.3, 3.6, -24], [-2.1, 4.25, -33], [-6, 5, -39],
    ],
  },
  plaza: {
    street: [
      [-10, 4.9, 22], [-5.8, 3.1, 15], [6.5, 3.9, 13], [9.8, 5.2, 9],
      [-3.6, 6.0, -29], [-1.2, 8.1, -38], [2.3, 10.5, -56], [6.2, 11, -68],
    ],
    pass: [
      [13.2, 9.4, 20], [14.3, 15.5, -5], [-9.8, 23.7, -14], [-13.5, 25.9, -37],
      [8.6, 12.7, -62], [5.8, 15, -79], [1.8, 16.7, -95], [1.9, 18.4, -103],
    ],
    close: [
      [-7.8, 3.1, 11], [-6.6, 3.5, 5], [.3, 4.4, -4], [8.7, 5.4, -14],
      [5.8, 6.4, -34], [4.9, 7.8, -44], [1.8, 8.3, -66], [-.4, 9.7, -88],
    ],
  },
  alley: {
    street: [
      [4.1, 2.4, 21], [3.4, 1.75, 15], [-3.6, 2.25, 13], [-4.0, 2.55, 8],
      [-3.9, 2.7, -12], [-3, 3.2, -21], [1.9, 4.7, -27], [4.3, 5.1, -34],
    ],
    pass: [
      [3.7, 2.1, 4], [-3.6, 2.55, -10], [3.9, 4.2, -26], [4.1, 6.9, -43],
      [-2, 4.3, -17], [-4.3, 4.95, -30], [7.9, 8.2, -40], [4.2, 11.4, -68],
    ],
    close: [
      [-3.9, 2.1, 6], [-3.85, 2.4, 2], [3.1, 3.25, -10], [4.0, 4.0, -17],
      [5, 3.2, -17], [5.25, 4.4, -30], [-4.8, 5, -30], [-5.2, 7.5, -44],
    ],
  },
  canal: {
    street: [
      [-6.8, 3.1, 17.5], [-4.85, 2.2, 14], [-7.3, 2.15, 12.1], [-3.9, 2.85, 6.5],
      [-10, 1.7, -14], [-7.6, 2.75, -20], [-5.3, 2.3, -26], [-1.6, 3.45, -32],
    ],
    pass: [
      [-6.9, 2.45, 18], [-8, 2.2, 4], [6.9, 7.9, -8], [5.8, 9.4, -36],
      [2.9, 2, -18], [6.5, 3, -28], [6.9, 5.2, -50], [3.8, 8, -70],
    ],
    close: [
      [5.5, 2.8, 10], [2.6, 3.3, 2], [-6, 3.7, -8], [-6.8, 4.0, -17],
      [-4.1, 2.4, -17], [-5.5, 2.8, -27], [-3.9, 4.1, -36], [1.3, 5.2, -54],
    ],
  },
  skyline: {
    street: [
      [-6.9, 3.4, 23], [-5.5, 2.9, 16], [4.7, 3.8, 12.8], [7, 4.7, 8.2],
      [-2.1, 6.0, -30], [1.5, 5.1, -39], [5, 7, -53], [4.2, 8, -67],
    ],
    pass: [
      [-8.5, 8.8, 23.8], [-5.7, 14.2, 8.5], [6.4, 19.2, -8.2], [6.0, 23.1, -29.7],
      [-7, 7.3, -37], [-4.7, 8.9, -52], [3.0, 12.8, -70], [6, 13.5, -82],
    ],
    close: [
      [7.7, 5.35, 14], [6.3, 6.8, 6], [-6.7, 8.7, -4], [-7.9, 11, -13],
      [5.6, 6.7, -32], [4.5, 7.9, -47], [-2.4, 8.8, -57], [-6.1, 11, -68],
    ],
  },
  fracture: {
    street: [
      [5.75, 5.6, 20], [3.5, 3.7, 15.5], [-4.8, 2.55, 11.7], [-5.3, 2.8, 6.2],
      [-1.4, 5.0, -17], [-4.7, 4.8, -24], [-6.9, 4.1, -36], [-4.4, 4.6, -50],
    ],
    pass: [
      [-5.6, 9.1, 17], [-5.8, 11.8, 2], [4.2, 7.1, -16], [5.7, 4.5, -36],
      [3.9, 7.3, -18], [7.5, 7.9, -30], [5.3, 6.4, -48], [1.4, 5.4, -68],
    ],
    close: [
      [5.1, 3.1, 10], [4.2, 2.9, 5], [-2.75, 3.45, -3], [-5.0, 4.8, -18],
      [-4.5, 5.7, -22], [-6.4, 6.1, -30], [1.9, 5.0, -46], [7.5, 6.7, -60],
    ],
  },
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = p => p * p * (3 - 2 * p);
const eye = new Vector3();
const focus = new Vector3();
const scratch = new PerspectiveCamera();
const ground = new Vector3();
const feet = new Vector3();
const head = new Vector3();
const headLift = new Vector3(0, 2.05, 0);
const cache = new WeakMap();
const paceSpeed = { held: 5.75, flow: 9.6, accent: 13.0 };

function point(track, offset, p, vec) {
  const u = 1 - p;
  const a = u * u * u, b = 3 * u * u * p, c = 3 * u * p * p, d = p * p * p;
  const p0 = track[offset], p1 = track[offset + 1], p2 = track[offset + 2], p3 = track[offset + 3];
  vec.set(
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  );
}

function speedLimit(t) {
  let bound = 0;
  for (let i = 1; i <= 3; i++) {
    bound = Math.max(bound, Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1], t[i][2] - t[i - 1][2]));
  }
  // The Bézier derivative is a positive blend of the three control-point deltas, multiplied by three.
  return 3 * bound;
}

function setPose(camera, setup, progress) {
  const { track, span, begin, fov, roll, reverse, mirror, quay } = setup;
  // Mostly constant-speed travel with a soft initial/tail easing, not a zoom on the focal point.
  const travel = .72 * progress + .28 * smooth(progress);
  const p = begin + span * (reverse ? 1 - travel : travel);
  point(track, 0, p, eye);
  point(track, 4, p, focus);
  eye.x *= mirror;
  focus.x *= mirror;
  if (quay) focus.x -= mirror * (1.1 + p * 5.8);
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.up.set(0, 1, 0);
  camera.position.copy(eye);
  camera.lookAt(focus);
  if (roll) camera.rotateZ(roll * (progress - .5));
  camera.updateMatrixWorld();
}

function fallbackAnchors(variant) {
  if (variant === 'canal') return [-1.6, 2, 4.8, 8.6].flatMap(z => [[-9.8, 0, z], [12.0, 0, z]]);
  return [-.3, 2.8, 5, 7.3, 9].flatMap(z => [-2.8, -1.65, 1.65, 2.8].map(x => [x, 0, z]));
}

function fromAnchor(anchor) {
  const item = anchor?.position ?? anchor;
  if (Array.isArray(item) && item.length === 3 && item.every(Number.isFinite)) return item;
  if (item && [item.x, item.y, item.z].every(Number.isFinite)) return [item.x, item.y, item.z];
  return null;
}

function resolveActor(anchors, variant, setup, camera, shot) {
  const supplied = Array.isArray(anchors) ? anchors : Object.values(anchors || {});
  const points = supplied.map(fromAnchor).filter(Boolean);
  const positions = [...points, ...fallbackAnchors(variant)];
  const faceSide = shot.id % 2 ? -1 : 1;
  const score = positions.map(() => 0);
  scratch.aspect = camera.aspect;
  scratch.near = camera.near;
  scratch.far = camera.far;
  scratch.fov = setup.fov;
  scratch.updateProjectionMatrix();
  const spill = x => Math.max(0, x);
  // Pick a point from the real scene floor, weighted by its worst framing across the shot.
  // Pick once: crossing a screen margin cannot switch the character to another anchor mid-cut.
  const worst = score.slice();
  for (let sample = 0; sample <= 10; sample++) {
    setPose(scratch, setup, sample / 10);
    positions.forEach((point, i) => {
      ground.set(...point);
      feet.copy(ground).project(scratch);
      head.copy(ground).add(headLift).project(scratch);
      const h = head.y - feet.y;
      const outside = spill(Math.abs(feet.x) - .83) + spill(-.99 - feet.y) + spill(feet.y + .46);
      const aim = Math.abs(feet.x - faceSide * .45) * .42 + Math.abs(feet.y + .76) * .6;
      const tiny = spill(.19 - h) * 3 + spill(h - .92) * 1.8;
      const cost = outside * 6 + aim + tiny + (feet.z < -1 || feet.z > 1 || h < 0 ? 50 : 0);
      score[i] += cost;
      worst[i] = Math.max(worst[i], cost);
    });
  }
  const best = positions.reduce((picked, _, i) => worst[i] + score[i] / 13 < worst[picked] + score[picked] / 13 ? i : picked, 0);
  return { position: new Vector3(...positions[best]), height: 2.05 };
}

function setupShot(camera, shot, cue, variant, anchors) {
  const actor = (shot.mode === 'wide' || shot.mode === 'world') && cue?.segment !== 33;
  const insert = shot.mode === 'eye' || shot.mode === 'hand';
  const portrait = shot.mode === 'portrait';
  const role = actor ? 'street' : (insert || portrait) ? 'close' : 'pass';
  const track = (tracks[variant] ?? tracks.freight)[role];
  const duration = Math.max(1 / 60, shot.end - shot.start);
  const speed = (paceSpeed[shot.musicPacing] ?? paceSpeed.flow) * (insert ? .52 : portrait ? .78 : 1);
  const span = Math.min(.86, duration * speed / (1.14 * speedLimit(track)));
  const seed = ((Number(shot.id) || 0) * 31 + (cue?.segment ?? 1) * 13) | 0;
  const center = actor ? shot.mode === 'wide' ? .56 : .43 : seed % 3 === 0 ? .39 : seed % 3 === 1 ? .54 : .63;
  const setup = {
    track, span, begin: clamp(center - span / 2, .06, .94 - span),
    reverse: role !== 'pass' && seed % 4 === 0,
    mirror: actor && (shot.mode === 'wide' || seed % 2 === 0) ? -1 : 1,
    fov: actor ? (shot.mode === 'wide' ? 50 : 46) : insert ? 46 : role === 'pass' ? 51 : 47,
    roll: variant === 'fracture' && role === 'pass' ? (seed % 2 ? .033 : -.033) : 0,
    duration, variant, aspect: camera.aspect, quay: actor && variant === 'canal',
  };
  setup.subject = actor ? resolveActor(anchors, variant, setup, camera, shot) : null;
  return setup;
}

/** Evaluate absolute song time and return a fixed floor anchor for compositing if this is a wide shot. */
export function updateDistrictCamera(camera, { t, shot, cue, variant, anchors }) {
  let setup = cache.get(shot);
  if (!setup || setup.variant !== variant || setup.aspect !== camera.aspect) {
    setup = setupShot(camera, shot, cue, variant, anchors);
    cache.set(shot, setup);
  }
  setPose(camera, setup, clamp((t - shot.start) / setup.duration, 0, 1));
  return setup.subject;
}
