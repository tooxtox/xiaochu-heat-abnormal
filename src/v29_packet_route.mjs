// One path in room coordinates, driven by song time through the lens changes.
const route = [
  [134.65, -.55, 1.72, 7.25],
  [137.8333333333, -3.78, 2.46, 6.27],
  [138.88, -3.41, 2.70, 6.16],
  [139.9666666667, -2.75, 3.88, 4.26],
  [141.85, 1.2, 2.98, 2.22],
  [143.0833333333, 8.87, 2.43, -8.34],
  [144.34, 8.24, 4.19, -9.13],
  [144.95, 4.10, 4.36, -9.78],
  [145.7, 1.55, 2.78, -10.15],
  [148, -.74, 1.96, -17.50],
  [152.5833333333, -1.42, 2.61, -30.79],
  [154.8833333333, -.59, 2.66, -33.80],
  [157.5166666667, .16, 2.28, -36.74],
  [158.84, .40, 2.00, -41.25],
  [160.1333333333, -.36, 1.54, -48.68],
  [161.10, -.63, 2.85, -49.64],
  [163.22, -.36, 6.98, -49.13],
  [164.0666666667, .10, 8.05, -47.82],
  [165.55, .59, 6.69, -41.91],
  [166.48, .89, 6.07, -37.08],
  [168.0166666667, 1.12, 2.92, -28.18],
];

const segmentSlope = (i, axis) => (route[i+1][axis] - route[i][axis]) / (route[i+1][0] - route[i][0]);
const tangents = route.map((_, i) => [1,2,3].map(axis => {
  if (i === 0) return segmentSlope(0, axis);
  if (i === route.length - 1) return segmentSlope(i-1, axis);
  const before = segmentSlope(i-1, axis), after = segmentSlope(i, axis);
  // The harmonic mean preserves direction without ringing past a turning point.
  return before * after <= 0 ? 0 : 2 * before * after / (before + after);
}));

export function placeServerPacket(target, time) {
  const next = route.findIndex(point => point[0] > time + 1e-9);
  const i = next < 0 ? route.length - 2 : Math.max(0, next - 1);
  const a=route[i], b=route[i+1], dt=b[0]-a[0];
  const u=Math.min(1,Math.max(0,(time-a[0])/dt));
  const p=u*u, q=p*u;
  target.set(...[1,2,3].map((axis,k) =>
    (2*q-3*p+1)*a[axis] + (q-2*p+u)*dt*tangents[i][k] +
    (-2*q+3*p)*b[axis] + (q-p)*dt*tangents[i+1][k]));
}
