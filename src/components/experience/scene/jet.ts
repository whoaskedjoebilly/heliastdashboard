import * as THREE from "three";

/**
 * Procedurally modelled long-range business jet.
 * Local space: nose points +X, up is +Y, starboard wing extends along +Z.
 * Units are roughly metres / 3 (fuselage is 10 units long).
 */

const L = 10; // fuselage length
const R = 0.62; // max fuselage radius
const X_TAIL = -L / 2;

const smooth = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Fuselage radius along normalised length t (0 = tail, 1 = nose). */
function radiusAt(t: number) {
  if (t >= 0.8) {
    const s = (t - 0.8) / 0.2;
    return R * Math.pow(Math.max(0, 1 - Math.pow(s, 2.1)), 0.58);
  }
  if (t <= 0.34) {
    const s = t / 0.34;
    return R * (0.1 + 0.9 * Math.pow(smooth(0, 1, s), 0.72));
  }
  return R;
}

/** Vertical offset of the fuselage centreline (tail upsweep + nose droop). */
function centreAt(t: number) {
  let c = 0;
  if (t < 0.38) c += 0.5 * R * Math.pow((0.38 - t) / 0.38, 1.7);
  if (t > 0.84) c -= 0.1 * R * Math.pow((t - 0.84) / 0.16, 1.4);
  return c;
}

const Z_SQUASH = 0.97;

/** Point on the fuselage skin. theta is measured from the top (0) towards starboard (+PI/2). */
function hullPoint(t: number, theta: number, offset = 0, target = new THREE.Vector3()) {
  const r = radiusAt(t) + offset;
  return target.set(X_TAIL + t * L, centreAt(t) + r * Math.cos(theta), r * Math.sin(theta) * Z_SQUASH);
}

/** Builds an indexed grid surface from a parametric function. */
function gridSurface(
  nu: number,
  nv: number,
  fn: (u: number, v: number, target: THREE.Vector3) => void,
  flip = false,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      fn(i / nu, j / nv, p);
      positions.push(p.x, p.y, p.z);
      uvs.push(i / nu, j / nv);
    }
  }
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (flip) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function mergeGeometries(geos: THREE.BufferGeometry[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const g of geos) {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
    const idx = g.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    offset += pos.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  out.setIndex(indices);
  return out;
}

/** Mirrors a geometry across the XY plane (port side), keeping faces outward. */
function mirrorZ(g: THREE.BufferGeometry) {
  const m = g.clone();
  m.scale(1, 1, -1);
  const idx = m.getIndex();
  if (idx) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
  }
  m.computeVertexNormals();
  return m;
}

/* ------------------------------------------------------------------ */
/* Lifting surfaces                                                    */
/* ------------------------------------------------------------------ */

type Station = {
  /** leading edge position */
  le: THREE.Vector3;
  chord: number;
  /** thickness / chord */
  thick: number;
  /** angle of the surface's "up" (thickness) direction around X, 0 = +Y, PI/2 = -Z */
  bank: number;
  camber?: number;
};

const AIRFOIL_N = 28;

/** Upper then lower airfoil ordinates (closed loop, trailing edge -> LE -> trailing edge). */
function airfoil(thick: number, camber: number) {
  const pts: [number, number][] = [];
  const yt = (x: number) =>
    5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x: number) => (x < 0.4 ? (camber / 0.16) * (0.8 * x - x * x) : (camber / 0.36) * (0.2 + 0.8 * x - x * x));
  for (let i = 0; i <= AIRFOIL_N; i++) {
    const x = 0.5 * (1 + Math.cos((Math.PI * i) / AIRFOIL_N)); // 1 -> 0
    pts.push([x, yc(x) + yt(x)]);
  }
  for (let i = 1; i <= AIRFOIL_N; i++) {
    const x = 0.5 * (1 - Math.cos((Math.PI * i) / AIRFOIL_N)); // 0 -> 1
    pts.push([x, yc(x) - yt(x)]);
  }
  return pts;
}

function loftSurface(stations: Station[]) {
  const loops = stations.map((s) => airfoil(s.thick, s.camber ?? 0));
  const nu = loops[0].length - 1;
  const nv = stations.length - 1;
  return gridSurface(nu, nv, (u, v, target) => {
    const j = Math.round(v * nv);
    const i = Math.round(u * nu);
    const s = stations[j];
    const [x, y] = loops[j][i];
    const up = new THREE.Vector3(0, Math.cos(s.bank), -Math.sin(s.bank));
    target.copy(s.le).add(new THREE.Vector3(x * s.chord, 0, 0)).addScaledVector(up, y * s.chord);
  }, true);
}

function wingStations(): Station[] {
  const st: Station[] = [];
  const rootLe = new THREE.Vector3(0.35, -0.36, 0.2);
  const span = 5.1;
  const sweep = Math.tan(THREE.MathUtils.degToRad(33));
  const dihedral = Math.tan(THREE.MathUtils.degToRad(4.5));
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const z = rootLe.z + s * span;
    // Kinked trailing edge: extra root chord (yehudi) fades out by 35% span
    const chord = THREE.MathUtils.lerp(2.35, 0.78, s) + 0.75 * Math.pow(Math.max(0, 1 - s / 0.35), 2);
    st.push({
      le: new THREE.Vector3(rootLe.x - s * span * sweep, rootLe.y + s * span * dihedral, z),
      chord,
      thick: THREE.MathUtils.lerp(0.13, 0.095, s),
      bank: 0,
      camber: 0.02,
    });
  }
  // Blended winglet: quarter arc then near-vertical fin
  const tip = st[st.length - 1];
  const arcR = 0.32;
  const arcN = 7;
  for (let i = 1; i <= arcN; i++) {
    const a = (i / arcN) * (Math.PI / 2) * 0.93;
    st.push({
      le: new THREE.Vector3(
        tip.le.x - 0.16 * (i / arcN),
        tip.le.y + arcR * (1 - Math.cos(a)),
        tip.le.z + arcR * Math.sin(a),
      ),
      chord: THREE.MathUtils.lerp(tip.chord, 0.66, i / arcN),
      thick: 0.09,
      bank: a,
      camber: 0.01,
    });
  }
  const top = st[st.length - 1];
  const wingletH = 0.95;
  const wn = 5;
  for (let i = 1; i <= wn; i++) {
    const s = i / wn;
    st.push({
      le: new THREE.Vector3(top.le.x - s * 0.55, top.le.y + s * wingletH, top.le.z + s * 0.1),
      chord: THREE.MathUtils.lerp(top.chord, 0.3, s),
      thick: i === wn ? 0.02 : 0.08,
      bank: Math.PI / 2 * 0.93,
      camber: 0,
    });
  }
  return st;
}

function finStations(): Station[] {
  const st: Station[] = [];
  const h = 2.05;
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    // Dorsal fillet blends into the fuselage near the root
    const fillet = Math.pow(1 - s, 3);
    st.push({
      le: new THREE.Vector3(-3.35 - 1.15 * s + 0.75 * fillet, 0.25 + s * h, 0),
      chord: THREE.MathUtils.lerp(1.6, 1.15, s) + 0.7 * fillet,
      thick: 0.11,
      bank: Math.PI / 2,
    });
  }
  return st;
}

function stabStations(finTop: Station): Station[] {
  const st: Station[] = [];
  const rootLe = finTop.le.clone().add(new THREE.Vector3(0.05, 0.04, 0));
  const span = 1.95;
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    st.push({
      le: new THREE.Vector3(rootLe.x - s * 0.95, rootLe.y + s * span * 0.04, s * span),
      chord: THREE.MathUtils.lerp(1.12, 0.5, s),
      thick: i === n ? 0.03 : 0.09,
      bank: 0,
    });
  }
  return st;
}

/* ------------------------------------------------------------------ */
/* Engines                                                             */
/* ------------------------------------------------------------------ */

function lathe(points: [number, number][], segments = 72) {
  // points: [x along axis, radius]; lathe around Y then rotate so axis -> +X.
  // Lathe faces point outward only when the profile runs in +axis order.
  const ordered = points[0][0] > points[points.length - 1][0] ? [...points].reverse() : points;
  const g = new THREE.LatheGeometry(
    ordered.map(([x, r]) => new THREE.Vector2(r, x)),
    segments,
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}

function buildEngine(materials: JetMaterials) {
  const engine = new THREE.Group();

  // Nacelle body: front at x = 0, exhaust at x = -2.3 (after rotation the lathe runs +x)
  const body = lathe([
    [0.02, 0.338],
    [-0.1, 0.356],
    [-0.5, 0.366],
    [-1.3, 0.358],
    [-1.85, 0.318],
    [-2.18, 0.262],
    [-2.26, 0.248],
  ]);
  engine.add(new THREE.Mesh(body, materials.paint));

  // Polished inlet lip
  const lip = lathe([
    [-0.22, 0.27],
    [-0.06, 0.272],
    [0.03, 0.29],
    [0.05, 0.31],
    [0.035, 0.332],
    [0.02, 0.338],
  ]);
  engine.add(new THREE.Mesh(lip, materials.chrome));

  // Inlet duct
  const duct = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.26, 0.5, 48, 1, true).rotateZ(Math.PI / 2),
    materials.darkMetal,
  );
  duct.position.x = -0.45;
  engine.add(duct);

  // Fan: spinner + blades, spins every frame
  const fan = new THREE.Group();
  fan.position.x = -0.42;
  const spinner = new THREE.Mesh(
    lathe([
      [0.14, 0.0],
      [0.1, 0.05],
      [0.0, 0.085],
      [-0.06, 0.09],
    ], 32),
    materials.chrome,
  );
  fan.add(spinner);
  const bladeGeo = new THREE.BoxGeometry(0.018, 0.19, 0.05);
  bladeGeo.translate(0, 0.17, 0);
  for (let i = 0; i < 22; i++) {
    const blade = new THREE.Mesh(bladeGeo, materials.fan);
    blade.rotation.x = (i / 22) * Math.PI * 2;
    blade.rotateY(0.55);
    fan.add(blade);
  }
  engine.add(fan);
  engine.userData.fan = fan;

  // Exhaust: dark liner + centre plug
  const liner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.4, 48, 1, true).rotateZ(Math.PI / 2),
    materials.exhaust,
  );
  liner.position.x = -2.08;
  engine.add(liner);
  const plug = new THREE.Mesh(
    lathe([
      [-1.95, 0.17],
      [-2.2, 0.15],
      [-2.42, 0.06],
      [-2.46, 0.0],
    ], 32),
    materials.exhaust,
  );
  engine.add(plug);

  engine.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return engine;
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

export type JetMaterials = ReturnType<typeof createMaterials>;

function createMaterials() {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: 0xf2f0eb,
      roughness: 0.32,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.0,
    }),
    belly: new THREE.MeshPhysicalMaterial({
      color: 0x2a2d33,
      roughness: 0.38,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),
    chrome: new THREE.MeshPhysicalMaterial({
      color: 0xd9dde2,
      roughness: 0.12,
      metalness: 1,
    }),
    accent: new THREE.MeshPhysicalMaterial({
      color: 0xb7955d,
      roughness: 0.28,
      metalness: 0.85,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x05070a,
      roughness: 0.03,
      metalness: 0.4,
      clearcoat: 1,
      clearcoatRoughness: 0.0,
      envMapIntensity: 1.6,
    }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }),
    fan: new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.35, metalness: 0.9 }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.55, metalness: 0.8, side: THREE.DoubleSide }),
    navRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15) }),
    navGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 4, 0.8) }),
    strobe: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6), transparent: true }),
  };
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

export type Jet = {
  group: THREE.Group;
  update: (time: number, dt: number) => void;
  dispose: () => void;
};

export function createJet(): Jet {
  const mats = createMaterials();
  const group = new THREE.Group();
  group.name = "jet";

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
    return mesh;
  };

  // Fuselage
  add(
    gridSurface(96, 220, (u, v, p) => hullPoint(v, u * Math.PI * 2, 0, p)),
    mats.paint,
  );

  // Cockpit windshield: a tapered band wrapping the nose
  const ws = (t0: number, t1: number, thetaA: number, thetaB: number) =>
    gridSurface(24, 16, (u, v, p) => {
      const t = THREE.MathUtils.lerp(t0, t1, v);
      // Round the corners by pulling the angular extent in near the ends
      const edge = Math.sin(Math.PI * v) ** 0.35;
      const mid = (thetaA + thetaB) / 2;
      const half = ((thetaB - thetaA) / 2) * edge;
      hullPoint(t, mid - half + 2 * half * u, 0.004, p);
    });
  add(ws(0.868, 0.918, -0.95, 0.95), mats.glass, false);
  add(ws(0.855, 0.885, 1.08, 1.42), mats.glass, false);
  add(ws(0.855, 0.885, -1.42, -1.08), mats.glass, false);

  // Cabin windows: large ovals on both sides
  const windows: THREE.BufferGeometry[] = [];
  const winTheta = 1.32;
  const count = 9;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < count; i++) {
      const tc = 0.43 + i * 0.043;
      windows.push(
        gridSurface(28, 4, (u, v, p) => {
          const a = u * Math.PI * 2;
          hullPoint(tc + Math.cos(a) * v * 0.0118, side * (winTheta + Math.sin(a) * v * 0.135), 0.004, p);
        }),
      );
    }
  }
  add(mergeGeometries(windows), mats.glass, false);

  // Champagne cheatline below the windows, tapering toward nose and tail
  for (let side = -1; side <= 1; side += 2) {
    add(
      gridSurface(4, 160, (u, v, p) => {
        const t = THREE.MathUtils.lerp(0.14, 0.955, v);
        const taper = Math.min(1, v / 0.12, (1 - v) / 0.08);
        const w = 0.028 * taper;
        hullPoint(t, side * (1.6 + (u - 0.5) * w), 0.003, p);
      }, side < 0),
      mats.accent,
      false,
    );
  }

  // Belly fairing to blend the wing root
  const fairing = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mats.paint);
  fairing.scale.set(2.0, 0.26, 0.5);
  fairing.position.set(-0.6, -0.4, 0);
  fairing.castShadow = fairing.receiveShadow = true;
  group.add(fairing);

  // Wings
  const wing = loftSurface(wingStations());
  add(wing, mats.paint);
  add(mirrorZ(wing), mats.paint);

  // Leading-edge polished strip
  const leStrip = (stations: Station[]) => {
    const main = stations.slice(0, 15);
    return gridSurface(10, main.length - 1, (u, v, p) => {
      const s = main[Math.round(v * (main.length - 1))];
      const a = (u - 0.5) * Math.PI * 0.9;
      const r = s.chord * s.thick * 0.52;
      p.copy(s.le).add(new THREE.Vector3(r * (1 - Math.cos(a)) - 0.004, Math.sin(a) * r + 0.02 * s.chord * 0.1, 0));
    });
  };
  const leGeo = leStrip(wingStations());
  add(leGeo, mats.chrome, false);
  add(mirrorZ(leGeo), mats.chrome, false);

  // Tail
  const finSt = finStations();
  add(loftSurface(finSt), mats.paint);
  const stab = loftSurface(stabStations(finSt[finSt.length - 1]));
  add(stab, mats.paint);
  add(mirrorZ(stab), mats.paint);

  // Engines on pylons
  const engines: THREE.Group[] = [];
  for (let side = -1; side <= 1; side += 2) {
    const e = buildEngine(mats);
    e.position.set(-1.72, 0.52, side * 1.12);
    group.add(e);
    engines.push(e);
  }
  const pylon = loftSurface(
    [0, 1].map((i) => ({
      le: new THREE.Vector3(-2.35 - i * 0.15, 0.45 + i * 0.05, 0.3 + i * 0.55),
      chord: 1.25,
      thick: 0.14,
      bank: 0,
    })),
  );
  add(pylon, mats.paint);
  add(mirrorZ(pylon), mats.paint);

  // Tail cone APU exhaust
  const apu = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 24, 1, true).rotateZ(Math.PI / 2), mats.exhaust);
  apu.position.set(X_TAIL - 0.02, centreAt(0), 0);
  group.add(apu);

  // Navigation lights on the winglet tips and a tail strobe
  const wingTip = wingStations();
  const tipLe = wingTip[14].le;
  const navGeo = new THREE.SphereGeometry(0.035, 12, 8);
  const navR = new THREE.Mesh(navGeo, mats.navRed);
  navR.position.set(tipLe.x - 0.1, tipLe.y + 0.02, -(tipLe.z + 0.12));
  const navG = new THREE.Mesh(navGeo, mats.navGreen);
  navG.position.set(tipLe.x - 0.1, tipLe.y + 0.02, tipLe.z + 0.12);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), mats.strobe);
  const finTop = finSt[finSt.length - 1];
  strobe.position.set(finTop.le.x - 0.95, finTop.le.y + 0.12, 0);
  const beacon = new THREE.Mesh(navGeo, mats.navRed);
  beacon.position.set(0.2, radiusAt(0.52) + 0.02, 0);
  group.add(navR, navG, strobe, beacon);

  const update = (time: number, dt: number) => {
    for (const e of engines) (e.userData.fan as THREE.Group).rotation.x += dt * 38;
    const phase = time % 1.6;
    mats.strobe.opacity = phase < 0.06 || (phase > 0.18 && phase < 0.24) ? 1 : 0;
    beacon.visible = time % 1.2 < 0.5;
  };

  const dispose = () => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    Object.values(mats).forEach((m) => m.dispose());
  };

  return { group, update, dispose };
}
