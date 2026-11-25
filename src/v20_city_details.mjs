const STREETS = {
  freight: { edge: 6.82, end: -96, step: 7.80, front: 24, signs: ['YARD', 'RAIL'] },
  plaza: { edge: 14.5, end: -73, step: 7.35, front: 31, signs: ['HALL', 'METRO'] },
  alley: { edge: 4.83, end: -101, step: 6.15, front: 17, signs: ['RELAY', 'CAFE'] },
  canal: { edge: 9.45, end: -100, step: 6.00, front: 25, signs: ['PIER', 'LOCK'] },
  skyline: { edge: 9.69, end: -35, step: 7.20, front: 23, signs: ['ROOF', 'LEVEL'] },
  fracture: { edge: 6.27, end: -101, step: 8.45, front: 22, signs: ['VOID', 'RELAY'] },
};

const RED_ASPHALT = {
  freight:'#4c1b18', plaza:'#49151e', alley:'#42141d', canal:'#410c17', skyline:'#481119', fracture:'#501521',
};

export function blackStarPalette(colors, variant) {
  return {
    ...colors,
    sky:'#88141e', mist:'#9b232b', upper:'#ff7056', lower:'#7c061c', key:'#ff6045', lamp:'#ff3928',
    body:['#733039','#46141f','#59232b','#7e3238'], trim:'#a54a44', dark:'#36131d',
    light:['#ff8260','#eb4d46','#b43c49'], floor:RED_ASPHALT[variant],
  };
}

const random = seed => {
  const value = Math.sin(seed * 63.19 + 8.127) * 43173.183;
  return value - Math.floor(value);
};

const GLYPHS = {
  A: [2, 5, 7, 5, 5], C: [7, 4, 4, 4, 7], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], O: [7, 5, 5, 5, 7], P: [7, 5, 7, 4, 4],
  R: [6, 5, 6, 5, 5], T: [7, 2, 2, 2, 2], V: [5, 5, 5, 5, 2], Y: [5, 5, 2, 2, 2],
};

function lettering(draw, word, x, y, height, color, rise) {
  const unit = height / 5;
  for (let letter = 0; letter < word.length; letter++) {
    const glyph = GLYPHS[word[letter]];
    const left = letter * 4 - (word.length * 4 - 2) / 2;
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if (glyph[row] & (4 >> col)) draw(x + (left + col) * unit, y + (2 - row) * unit,
        unit * .83, unit * .84, .014, color, rise);
    }
  }
}

function roofEquipment(k, { x, z, w, d, h, floor, seed, kind }) {
  const c = k.colors;
  const roof = floor + h;
  const rx = x + w * (kind === 'tower' ? .33 : -.24);
  const rz = z + d * (random(seed + 4) > .5 ? .24 : -.28);
  if (kind === 'industrial') {
    k.solid(x, roof + .60, z - d * .36, w * .75, .18, .34, c.dark);
    for (const s of [-1, 1]) {
      k.solid(x + s * w * .27, roof + .69, z - d * .36, .20, 1.06, .22, c.trim);
      k.solid(x + s * w * .27, roof + 1.23, z - d * .36, .32, .13, .31, c.dark);
    }
    return;
  }
  k.solid(rx, roof + .25, rz, 1.16, .36, .78, c.dark);
  k.solid(rx, roof + .53, rz, 1.02, .43, .69, c.body[2]);
  for (const dz of [-.26, 0, .26]) k.solid(rx, roof + .76, rz + dz, .90, .032, .045, c.trim);
  if (random(seed + 53) > .50) {
    const mx = x - w * .31, mz = z + d * .35;
    k.solid(mx, roof + .74, mz, .08, 1.30, .083, c.trim);
    k.solid(mx, roof + 1.14, mz, .83, .055, .085, c.trim);
    k.glow(mx, roof + 1.42, mz, .108, .092, .107, c.light[1]);
  }
}

export function addBuildingDetails(k, dimensions) {
  const { x, z, w, d, h, floor, seed, kind, detail } = dimensions;
  const variant = k.architecturalVariant;
  const street = STREETS[variant];
  const c = k.colors;
  const side = x < 0 ? 1 : -1;
  const wall = x + side * w / 2;
  const groundFront = Math.abs(x) < street.front && detail && floor > -1;
  const makeFace = add => (u, y, width, height, depth, color, offset = depth * .5) => {
    add(wall + offset * side, floor + y, z - u * side, depth, height, width, color);
  };
  const face = makeFace(k.solid), light = makeFace(k.glow);

  if (detail || random(seed + 11) > .72) roofEquipment(k, dimensions);
  if (!detail) return;

  if (groundFront) {
    const panel = Math.min(d * .24, 1.98);
    const bay = kind === 'industrial' || (variant === 'alley' && random(seed + 23) > .51);
    const frontHeight = Math.min(2.63, h * .36);
    face(0, frontHeight * .50, d * .87, frontHeight, .14, c.dark);
    face(0, frontHeight + .04, d * .94, .15, .27, c.trim);
    for (const u of [-d * .45, d * .45]) face(u, frontHeight * .51, .12, frontHeight, .28, c.trim);
    if (bay) {
      for (const u of [-d * .24, d * .24]) {
        face(u, frontHeight * .47, panel * 1.23, frontHeight * .86, .07, c.body[2], .17);
        for (let slat = .23; slat < frontHeight * .82; slat += .24) {
          face(u, slat, panel * 1.21, .044, .036, c.trim, .23);
        }
        face(u, .17, panel * 1.27, .13, .32, c.dark, .20);
      }
    } else {
      face(0, frontHeight * .48, d * .70, frontHeight * .72, .045, c.body[2], .12);
      for (const u of [-d * .265, -d * .086, d * .086, d * .265]) {
        face(u, frontHeight * .49, .055, frontHeight * .70, .071, c.trim, .17);
        light(u + .11, frontHeight * .67, d * .097, .068, .017, c.light[1], .16);
      }
      face(0, frontHeight * .32, d * .72, .064, .054, c.trim, .17);
    }
    if (variant === 'alley' || variant === 'plaza' || variant === 'canal') {
      face(0, frontHeight + .22, d * .74, .15, variant === 'alley' ? .99 : 1.26, c.body[1], .62);
      face(0, frontHeight + .07, d * .74, .17, .084, c.trim, 1.15);
      light(0, frontHeight + .13, d * .57, .027, .11, c.light[1], .87);
    }
    if (random(seed + 71) > .76 && frontHeight > 1.72) {
      const word = street.signs[Math.floor(random(seed + 47) * street.signs.length)];
      const signWidth = Math.min(d * .62, 2.65);
      const y = frontHeight + (variant === 'plaza' ? .68 : .55);
      face(0, y, signWidth, .59, .15, c.dark, .18);
      face(0, y - .31, signWidth, .055, .15, c.trim, .18);
      lettering(light, word, 0, y, .43, c.light[1], .26);
    }
  }

  const conduit = d * (.33 + random(seed + 90) * .10);
  face(conduit, h * .48, .098, h * .91, .13, c.trim, .13);
  face(conduit - .15, h * .927, .36, .10, .13, c.trim, .13);
  for (let y = 1.4; y < h * .90; y += 3.7) {
    face(conduit, y, .22, .073, .14, c.dark, .15);
  }

  if (kind === 'alley' || (kind === 'housing' && Math.abs(x) < 34 && random(seed + 51) > .40)) {
    const u = -d * .32;
    for (let y = 3.1; y < h - .82; y += 2.9) {
      face(u, y, 1.12, .102, .74, c.dark, .46);
      face(u, y + .56, 1.13, .063, .046, c.trim, .84);
      for (const end of [-.48, .48]) face(u + end, y + .31, .052, .63, .053, c.trim, .84);
      face(u - .45, y - .89, .078, 1.83, .08, c.trim, .56);
      face(u - .13, y - .89, .078, 1.83, .08, c.trim, .56);
      for (let rung = .26; rung <= 1.81; rung += .26) face(u - .29, y - rung, .34, .039, .050, c.trim, .57);
    }
  } else if (variant === 'fracture' || kind === 'tower') {
    for (const u of [-d * .385, d * .38]) face(u, h * .52, .16, h * .88, .20, c.body[2], .13);
    const y = h * (.70 + random(seed + 77) * .16);
    face(0, y, d * .99, .13, .33, c.trim, .16);
    if (kind === 'tower') light(0, y + .09, d * .78, .041, .022, c.light[2], .22);
  }
}

function drain(k, x, z, y) {
  const c = k.colors;
  k.solid(x, y + .025, z, .42, .047, .89, c.dark);
  for (let slot = -3; slot <= 3; slot++) k.solid(x, y + .055, z + .111 * slot, .34, .020, .033, c.trim);
}

function utility(k, x, z, side, y) {
  const c = k.colors;
  k.solid(x, y + .41, z, .49, .78, .71, c.body[1]);
  k.solid(x, y + .83, z, .53, .082, .76, c.trim);
  k.solid(x - side * .250, y + .43, z, .018, .62, .55, c.dark);
  k.glow(x - side * .268, y + .67, z + .12, .021, .030, .12, c.light[1]);
  for (let i = 0; i < 3; i++) k.solid(x - side * .269, y + .32 + i * .065, z, .021, .023, .32, c.trim);
}

function freightSide(k, x, z, side, i) {
  const c = k.colors;
  k.solid(x - side * .59, .016, z, .090, .022, 2.38, c.trim);
  k.solid(x - side * .85, .017, z - 1.19, .60, .024, .08, c.trim);
  if (i % 4 !== 1) return;
  for (let slat = 0; slat < 5; slat++) k.solid(x - side * 1.13, .021, z + slat * .32, .62, .026, .054, c.trim, 0, side * -.49);
  k.solid(side * 12.05, .57, z + 1, .12, 1.13, .12, c.dark);
  const signalX = side * 12.05;
  k.solid(signalX, 1.06, z + 1, .22, .37, .29, c.trim);
  k.glow(signalX - side * .12, 1.12, z + 1, .024, .094, .081, c.light[1]);
}

function plazaSide(k, x, z, side, i) {
  const c = k.colors;
  if (i % 2 === 0) {
    k.solid(x + side * .58, .19, z, 1.67, .385, 2.69, c.dark);
    k.solid(x + side * .58, .42, z, 1.93, .135, 2.91, c.trim);
    k.solid(x + side * .64, .51, z, 1.48, .091, 2.45, c.body[1]);
    for (const dz of [-1.05, 1.05]) k.glow(x - side * .41, .35, z + dz, .027, .048, .40, c.light[1]);
  }
  for (let n = -1; n <= 1; n++) k.solid(x - side * (1.12 + n * .31), .011, z, .11, .022, 2.95, c.trim);
  if (i % 3 === 1) {
    // Paired raised islands frame the field and put nearer forms between the camera and towers.
    const island = x - side * 3.15;
    k.solid(island, .14, z, 2.35, .27, 5.44, c.dark);
    k.solid(island, .34, z, 2.41, .14, 5.50, c.trim);
    k.solid(island, .42, z, 2.05, .04, 5.18, c.body[1]);
    for (const dz of [-1.78, 1.78]) {
      k.solid(island, .76, z + dz, .31, .69, .32, c.trim);
      k.solid(island, 1.10, z + dz, .45, .12, .46, c.dark);
      k.glow(island - side * .168, .99, z + dz, .029, .092, .22, c.light[1]);
    }
    k.solid(island - side * .79, .57, z, .21, .28, 3.81, c.dark);
    k.glow(island - side * .91, .67, z, .014, .025, 3.65, c.light[2]);
  }
}

function alleySide(k, x, z, side, i) {
  const c = k.colors;
  if (i % 3 === 0) utility(k, x + side * .50, z + 1.12, side, .074);
  for (const shift of [-.88, .88]) k.solid(x - side * .99, .017, z + shift, .10, .028, .56, c.trim, 0, .31 * side);
  if (i % 4 !== 0) return;
  k.solid(x + side * .85, .47, z - .74, .55, .80, .63, c.dark);
  k.solid(x + side * .85, .87, z - .74, .62, .096, .70, c.trim);
  k.solid(x - side * .83, .36, z + 1.31, .092, .68, .092, c.dark);
  k.glow(x - side * .83, .68, z + 1.31, .104, .12, .105, c.light[1]);
}

function canalSide(k, x, z, side, i) {
  const c = k.colors;
  if (i % 2 === 0) {
    k.solid(x - side * .61, .175, z, .27, .34, .27, c.dark);
    k.solid(x - side * .61, .362, z, .35, .105, .35, c.trim);
  }
  if (i % 4 !== 1) return;
  for (const shift of [-.26, .26]) k.solid(side * 8.26, -.31, z + shift, .08, 1.67, .077, c.trim);
  for (let y = -.78; y < .48; y += .23) k.solid(side * 8.25, y, z, .072, .067, .57, c.trim);
  k.glow(side * 8.56, .11, z, .048, .10, .21, c.light[1]);
  k.solid(x + side * 2.49, .29, z - 1.09, 1.23, .57, 1.17, c.dark);
  k.solid(x + side * 2.49, .59, z - 1.09, 1.24, .069, 1.17, c.trim);
}

function skylineSide(k, x, z, side, i) {
  const c = k.colors;
  k.solid(x, .026, z, .11, .027, 2.85, c.trim);
  if (i % 3 === 0) {
    utility(k, x + side * .25, z + 1, side, 0);
    k.solid(x + side * .49, .08, z - .27, .14, .13, 2.58, c.dark);
    k.glow(x + side * 1.32, .20, z + 1.8, .21, .072, .22, c.light[1]);
  }
  if (i % 3 === 1) {
    const air = x - side * 1.20;
    k.solid(air, .16, z, 2.12, .24, 3.48, c.dark);
    k.solid(air, .73, z, 1.91, .90, 3.17, c.body[2]);
    k.solid(air, 1.19, z, 2.03, .11, 3.28, c.trim);
    for (const dz of [-.90, 0, .9]) {
      k.solid(air, 1.28, z + dz, 1.0, .071, .71, c.dark);
      for (let n = -2; n <= 2; n++) k.solid(air, 1.325, z + dz + n * .115, .84, .019, .03, c.trim);
    }
    for (let slot = 0; slot < 6; slot++) {
      k.solid(air - side * .961, .45 + slot * .103, z, .024, .041, 2.40, c.dark);
    }
    k.glow(air - side * .980, 1.04, z + 1.39, .021, .054, .13, c.light[1]);
  }
}

function fractureSide(k, x, z, side, i) {
  const c = k.colors;
  k.solid(x - side * .62, .027, z, .46, .054, 1.43, c.body[1], 0, side * .33);
  if (i % 3 === 1) {
    k.solid(x + side * 1.76, .63, z + .68, 1.26, 1.13, 2.06, c.body[2], side * .37, i * .17);
    k.solid(x + side * 1.87, .15, z - .76, 1.34, .24, .27, c.trim, side * .24, i * -.27);
    k.glow(x + side * 1.23, .86, z + 1.19, .052, .11, .46, c.light[2], side * .37, i * .17);
  }
}

const SIDE_DETAILS = {
  freight: freightSide, plaza: plazaSide, alley: alleySide, canal: canalSide,
  skyline: skylineSide, fracture: fractureSide,
};

export function addStreetDetails(k, variant) {
  const { edge, end, step } = STREETS[variant];
  const c = k.colors;
  for (const side of [-1, 1]) {
    for (let i = 0, z = 15 + 1.8 * side; z > end; i++, z -= step) {
      const x = edge * side;
      const y = variant === 'alley' ? .074 : 0;
      if (variant !== 'canal') drain(k, x + side * .27, z + 1.95, y);
      SIDE_DETAILS[variant](k, x, z, side, i);
    }
  }
  if (variant === 'skyline') {
    for (let i = 0; i < 11; i++) {
      const z = 20 - i * 5.33;
      k.solid(0, .005, z, 21.26, .014, .058, c.dark);
      for (const side of [-1, 1]) {
        k.solid(side * (i % 2 ? 4.8 : 6.3), .006, z - 2.65, .039, .015, 5.28, c.dark);
      }
    }
    for (const x of [-2.4, 2.4]) {
      k.solid(x, .011, -19.5, .087, .024, 6.4, c.trim);
      for (const z of [-22.7, -16.3]) k.solid(x * .79, .012, z, 1.10, .026, .089, c.trim);
    }
    for (const x of [-.53, .53]) k.solid(x, .012, -19.5, .107, .025, 2.22, c.trim);
    k.solid(0, .012, -19.5, 1.12, .026, .096, c.trim);
  }
}
