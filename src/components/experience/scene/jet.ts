import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { orangePeel, paintEmblem, paintFuselage, paintNacelle, paintSpinner, paintTailSurface, paintWing, paintWingColor, roughnessVariation } from "./jetTextures";

/**
 * Procedurally modelled long-range business jet.
 * Local space: nose points +X, up is +Y, starboard wing extends along +Z.
 * Units are roughly metres / 3 (fuselage is 10 units long).
 */

export const L = 10; // fuselage length
export const R = 0.62; // max fuselage radius
export const X_TAIL = -L / 2;

const smooth = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Fuselage radius along normalised length t (0 = tail, 1 = nose). */
export function radiusAt(t: number) {
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
export function centreAt(t: number) {
  let c = 0;
  if (t < 0.38) c += 0.5 * R * Math.pow((0.38 - t) / 0.38, 1.7);
  if (t > 0.84) c -= 0.1 * R * Math.pow((t - 0.84) / 0.16, 1.4);
  return c;
}

export const Z_SQUASH = 0.97;

/** Point on the fuselage skin. theta is measured from the top (0) towards starboard (+PI/2). */
export function hullPoint(t: number, theta: number, offset = 0, target = new THREE.Vector3()) {
  const r = radiusAt(t) + offset;
  return target.set(X_TAIL + t * L, centreAt(t) + r * Math.cos(theta), r * Math.sin(theta) * Z_SQUASH);
}

/** Builds an indexed grid surface from a parametric function. */
export function gridSurface(
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

export function mergeGeometries(geos: THREE.BufferGeometry[]) {
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
    else for (let i = 0; i < pos.count; i++) indices.push(i + offset);
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
    // Chord runs aft from the leading edge
    target.copy(s.le).add(new THREE.Vector3(-x * s.chord, 0, 0)).addScaledVector(up, y * s.chord);
  }, true);
}

function wingStations(): Station[] {
  const st: Station[] = [];
  const rootLe = new THREE.Vector3(1.35, -0.36, 0.2);
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

export function lathe(points: [number, number][], segments = 72) {
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

/** A single fan blade: thin, tapered and twisted from root to tip. */
function fanBlade() {
  const g = new THREE.BoxGeometry(0.012, 0.19, 0.075, 1, 8, 1);
  const pos = g.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const s = (v.y + 0.095) / 0.19; // 0 root → 1 tip
    const twist = THREE.MathUtils.lerp(0.25, 1.05, s);
    const chord = THREE.MathUtils.lerp(0.8, 1.15, s);
    const z = v.z * chord;
    const x = v.x;
    v.x = x * Math.cos(twist) - z * Math.sin(twist);
    v.z = x * Math.sin(twist) + z * Math.cos(twist);
    // slight sweep toward the tip
    v.x -= s * s * 0.02;
    pos.setXYZ(i, v.x, v.y + 0.175, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function buildEngine(materials: JetMaterials) {
  const engine = new THREE.Group();

  // Nacelle outer skin: front at x = 0, exhaust at x = -2.26
  const body = lathe([
    [0.02, 0.338],
    [-0.1, 0.356],
    [-0.5, 0.366],
    [-1.3, 0.358],
    [-1.85, 0.318],
    [-2.18, 0.262],
    [-2.26, 0.248],
  ]);
  engine.add(new THREE.Mesh(body, materials.nacelle));

  // Polished inlet lip, wrapping into the intake
  const lip = lathe([
    [-0.24, 0.268],
    [-0.06, 0.272],
    [0.03, 0.29],
    [0.05, 0.31],
    [0.035, 0.332],
    [0.02, 0.338],
  ]);
  engine.add(new THREE.Mesh(lip, materials.chrome));

  // One continuous inner wall from intake to nozzle so the nacelle is never see-through
  const innerWall = lathe(
    [
      [-0.24, 0.268],
      [-0.62, 0.262],
      [-1.2, 0.262],
      [-2.0, 0.244],
      [-2.26, 0.236],
    ],
    72,
  );
  engine.add(new THREE.Mesh(innerWall, materials.liner));
  // Trailing-edge lip of the nozzle joining outer skin to inner wall
  engine.add(
    new THREE.Mesh(
      lathe([
        [-2.26, 0.248],
        [-2.265, 0.242],
        [-2.26, 0.236],
      ]),
      materials.exhaust,
    ),
  );

  // Fan face: solid hub disc behind the blades
  const fanFace = new THREE.Mesh(new THREE.CircleGeometry(0.262, 64).rotateY(Math.PI / 2), materials.fanFace);
  fanFace.position.x = -0.62;
  engine.add(fanFace);

  // Fan: painted spinner + twisted titanium blades, spins every frame
  const fan = new THREE.Group();
  fan.position.x = -0.5;
  const spinner = new THREE.Mesh(
    lathe(
      [
        [0.16, 0.0],
        [0.13, 0.035],
        [0.06, 0.07],
        [-0.02, 0.088],
        [-0.1, 0.092],
      ],
      48,
    ),
    materials.spinner,
  );
  fan.add(spinner);
  const bladeGeo = fanBlade();
  const blades = 24;
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.Mesh(bladeGeo, materials.fan);
    blade.rotation.x = (i / blades) * Math.PI * 2;
    fan.add(blade);
  }
  engine.add(fan);
  engine.userData.fan = fan;

  // Exhaust: heat-tinted core nozzle and centre plug, sealed by a dark bulkhead
  const bulkhead = new THREE.Mesh(new THREE.CircleGeometry(0.24, 48).rotateY(-Math.PI / 2), materials.fanFace);
  bulkhead.position.x = -1.7;
  engine.add(bulkhead);
  engine.add(
    new THREE.Mesh(
      lathe([
        [-1.7, 0.2],
        [-1.95, 0.19],
        [-2.14, 0.165],
        [-2.15, 0.155],
      ]),
      materials.exhaust,
    ),
  );
  engine.add(
    new THREE.Mesh(
      lathe(
        [
          [-1.7, 0.13],
          [-2.1, 0.12],
          [-2.34, 0.06],
          [-2.4, 0.0],
        ],
        40,
      ),
      materials.exhaust,
    ),
  );

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

/** Cockpit glazing layout, shared by the glass geometry and the painted seals. */
function cockpitPanes() {
  const out: { t: number; theta: number; dt: number; dTheta: number; n: number }[] = [];
  for (const side of [1, -1]) {
    out.push({ t: 0.893, theta: side * 0.47, dt: 0.021, dTheta: 0.4, n: 5 });
    out.push({ t: 0.874, theta: side * 1.2, dt: 0.015, dTheta: 0.19, n: 5 });
    out.push({ t: 0.851, theta: side * 1.28, dt: 0.0075, dTheta: 0.13, n: 5 });
  }
  return out;
}

/** Cabin window positions on the hull, shared by the glass geometry and the painted gaskets. */
export function windowLayout() {
  const out: { t: number; theta: number; dt: number; dTheta: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) out.push({ t: 0.43 + i * 0.043, theta: side * 1.32, dt: 0.0118, dTheta: 0.135 });
  }
  return out;
}

function createMaterials() {
  const peel = orangePeel();
  const rough = roughnessVariation();
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xe4e2dd,
    roughness: 0.34,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.0,
  });
  /** A paint variant carrying its own seam bump map and tiled orange-peel clear coat. */
  const detailed = (bump: THREE.Texture | null, repeat: [number, number], map: THREE.Texture | null = null) => {
    const m = paint.clone();
    const n = peel.clone();
    // Orange peel is millimetre-scale: tile it finely so it only breaks up reflections
    n.repeat.set(repeat[0] * 8, repeat[1] * 8);
    m.clearcoatNormalMap = n;
    m.clearcoatNormalScale = new THREE.Vector2(0.06, 0.06);
    if (bump) {
      m.bumpMap = bump;
      m.bumpScale = 1.4;
    }
    if (map) m.map = map;
    const r = rough.clone();
    r.repeat.set(repeat[0] / 4, repeat[1] / 4);
    m.roughnessMap = r;
    return m;
  };
  const windows = windowLayout();
  const fus = paintFuselage({ length: L, radius: R, windows, panes: cockpitPanes() });
  const wingStationCount = wingStations().length;
  return {
    peel,
    paint: detailed(null, [4, 4]),
    fuselage: detailed(fus.bump, [7, 18], fus.map),
    fuselageTextures: [fus.map, fus.bump],
    wing: detailed(paintWing(14, wingStationCount - 1), [10, 6], paintWingColor(14, wingStationCount - 1)),
    fin: detailed(paintTailSurface(0.7, 0.12, 0.97), [5, 5]),
    stab: detailed(paintTailSurface(0.7, 0.06, 0.94), [5, 3]),
    nacelle: detailed(paintNacelle(), [8, 3]),
    emblem: new THREE.MeshPhysicalMaterial({
      map: paintEmblem("HELIAST"),
      transparent: true,
      metalness: 0.75,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
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
      emissive: new THREE.Color(1.0, 0.68, 0.38),
      emissiveIntensity: 0,
    }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }),
    fan: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.28, metalness: 1 }),
    fanFace: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.7, metalness: 0.3 }),
    liner: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide }),
    spinner: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: paintSpinner(),
      roughness: 0.25,
      metalness: 0.4,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    // Heat-treated metal: faint bronze/blue iridescence like a real exhaust cone
    exhaust: new THREE.MeshPhysicalMaterial({
      color: 0x7a6a5c,
      roughness: 0.42,
      metalness: 1,
      iridescence: 0.55,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [250, 600],
      side: THREE.DoubleSide,
    }),
    lens: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      roughness: 0.02,
      metalness: 0,
      clearcoat: 1,
      depthWrite: false,
    }),
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
  /** 0 = day, 1 = night: warms the cabin windows. */
  setNight: (n: number) => void;
  dispose: () => void;
};

/** A thin cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

/** Wing station interpolated at spanwise fraction s of the main (pre-winglet) wing. */
function wingAt(s: number) {
  const st = wingStations().slice(0, 15);
  const f = THREE.MathUtils.clamp(s, 0, 1) * 14;
  const i = Math.min(13, Math.floor(f));
  const k = f - i;
  return {
    le: st[i].le.clone().lerp(st[i + 1].le, k),
    chord: THREE.MathUtils.lerp(st[i].chord, st[i + 1].chord, k),
    thick: THREE.MathUtils.lerp(st[i].thick, st[i + 1].thick, k),
  };
}

/** Flap-track fairings, antennas, pitot probes and static wicks. */
function addSmallParts(group: THREE.Group, mats: JetMaterials) {
  const place = (geo: THREE.BufferGeometry, mat: THREE.Material, mirror: boolean, shadows = true) => {
    const a = new THREE.Mesh(geo, mat);
    a.castShadow = a.receiveShadow = shadows;
    group.add(a);
    if (mirror) {
      const b = new THREE.Mesh(mirrorZ(geo), mat);
      b.castShadow = b.receiveShadow = shadows;
      group.add(b);
    }
  };

  // Flap-track fairings ("canoes") under the trailing edge
  const canoe = lathe(
    [
      [0, 0],
      [-0.06, 0.045],
      [-0.3, 0.07],
      [-0.75, 0.062],
      [-1.05, 0.03],
      [-1.14, 0],
    ],
    24,
  );
  canoe.scale(0.9, 0.8, 0.9);
  const canoes: THREE.BufferGeometry[] = [];
  for (const s of [0.26, 0.45, 0.63]) {
    const w = wingAt(s);
    const g = canoe.clone();
    g.translate(w.le.x - w.chord * 0.3, w.le.y - w.chord * w.thick * 0.4, w.le.z);
    canoes.push(g);
  }
  canoe.dispose();
  place(mergeGeometries(canoes), mats.paint, true);

  // Blade antennas on the crown and belly
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0.1, 0);
  bladeShape.lineTo(-0.08, 0);
  bladeShape.lineTo(-0.1, 0.16);
  bladeShape.lineTo(-0.05, 0.165);
  bladeShape.closePath();
  const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
  blade.translate(0, 0, -0.007);
  const antennas: THREE.BufferGeometry[] = [];
  for (const [t, down] of [
    [0.66, false],
    [0.3, false],
    [0.56, true],
  ] as const) {
    const g = blade.clone();
    if (down) g.rotateX(Math.PI);
    const y = centreAt(t) + (down ? -1 : 1) * (radiusAt(t) - 0.01);
    g.translate(X_TAIL + t * L, y, 0);
    antennas.push(g);
  }
  blade.dispose();
  place(mergeGeometries(antennas), mats.paint, false);

  // Pitot probes either side of the nose
  const probe = new THREE.CylinderGeometry(0.007, 0.007, 0.16, 8).rotateZ(Math.PI / 2);
  const mast = new THREE.CylinderGeometry(0.01, 0.014, 0.07, 8);
  const probes: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const base = hullPoint(0.905, side * 1.95, 0);
    const n = new THREE.Vector3(0, Math.cos(side * 1.95), Math.sin(side * 1.95) * Z_SQUASH).normalize();
    const m = mast.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    probes.push(m.translate(base.x, base.y + n.y * 0.035, base.z + n.z * 0.035));
    probes.push(probe.clone().translate(base.x + 0.07, base.y + n.y * 0.07, base.z + n.z * 0.07));
  }
  probe.dispose();
  mast.dispose();
  place(mergeGeometries(probes), mats.chrome, false, false);

  // Angle-of-attack vanes either side of the nose
  const vaneShape = new THREE.Shape();
  vaneShape.moveTo(0.02, 0);
  vaneShape.lineTo(-0.03, 0);
  vaneShape.lineTo(-0.05, 0.06);
  vaneShape.lineTo(-0.025, 0.062);
  vaneShape.closePath();
  const vane = new THREE.ExtrudeGeometry(vaneShape, { depth: 0.004, bevelEnabled: false });
  vane.translate(0, 0, -0.002);
  const vanes: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const th = side * 1.95;
    const base = hullPoint(0.876, th, 0);
    const n = new THREE.Vector3(0, Math.cos(th), Math.sin(th) * Z_SQUASH).normalize();
    const g = vane.clone();
    // shape Y → surface normal, shape X stays along the fuselage axis
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), n, new THREE.Vector3(1, 0, 0).cross(n));
    g.applyMatrix4(basis).translate(base.x, base.y, base.z);
    vanes.push(g);
  }
  vane.dispose();
  place(mergeGeometries(vanes), mats.darkMetal, false, false);

  // Static discharge wicks on the outer trailing edge
  const wick = new THREE.CylinderGeometry(0.0035, 0.0035, 0.13, 6).rotateZ(Math.PI / 2);
  const wicks: THREE.BufferGeometry[] = [];
  for (const s of [0.74, 0.84, 0.94]) {
    const w = wingAt(s);
    wicks.push(wick.clone().translate(w.le.x - w.chord - 0.05, w.le.y + 0.005, w.le.z));
  }
  wick.dispose();
  place(mergeGeometries(wicks), mats.darkMetal, true, false);
}

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
    gridSurface(128, 260, (u, v, p) => hullPoint(v, u * Math.PI * 2, 0, p)),
    mats.fuselage,
  );

  // Cockpit glazing: separate panes with painted frame posts between them
  const pane = (tc: number, thc: number, dt: number, dth: number, n = 5) =>
    gridSurface(48, 6, (u, v, p) => {
      const a = u * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sx = Math.sign(ca) * Math.abs(ca) ** (2 / n);
      const sy = Math.sign(sa) * Math.abs(sa) ** (2 / n);
      hullPoint(tc + sx * v * dt, thc + sy * v * dth, 0.004, p);
    });
  add(mergeGeometries(cockpitPanes().map((p) => pane(p.t, p.theta, p.dt, p.dTheta, p.n))), mats.glass, false);

  // Windscreen wipers parked along the lower frame
  for (const side of [1, -1]) {
    const a = hullPoint(0.8735, side * 0.8, 0.012);
    const b = hullPoint(0.8765, side * 0.2, 0.012);
    group.add(rod(a, b, 0.0045, mats.darkMetal));
  }

  // Cabin windows: large ovals on both sides  // Cabin windows: large ovals on both sides
  const windows = windowLayout().map((w) =>
    gridSurface(28, 4, (u, v, p) => {
      const a = u * Math.PI * 2;
      hullPoint(w.t + Math.cos(a) * v * w.dt, w.theta + Math.sin(a) * v * w.dTheta, 0.004, p);
    }),
  );
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
  fairing.position.set(0.1, -0.4, 0);
  fairing.castShadow = fairing.receiveShadow = true;
  group.add(fairing);

  // Wings
  const wing = loftSurface(wingStations());
  add(wing, mats.wing);
  add(mirrorZ(wing), mats.wing);

  // Leading-edge polished strip
  const leStrip = (stations: Station[]) => {
    const main = stations.slice(0, 15);
    return gridSurface(10, main.length - 1, (u, v, p) => {
      const s = main[Math.round(v * (main.length - 1))];
      const a = (u - 0.5) * Math.PI * 0.9;
      const r = s.chord * s.thick * 0.52;
      p.copy(s.le).add(new THREE.Vector3(-r * (1 - Math.cos(a)) + 0.004, Math.sin(a) * r + 0.002 * s.chord, 0));
    });
  };
  const leGeo = leStrip(wingStations());
  add(leGeo, mats.chrome, false);
  add(mirrorZ(leGeo), mats.chrome, false);

  // Tail
  const finSt = finStations();
  const finMesh = add(loftSurface(finSt), mats.fin);
  const stab = loftSurface(stabStations(finSt[finSt.length - 1]));
  add(stab, mats.stab);
  add(mirrorZ(stab), mats.stab);

  // Tail emblem, projected onto both sides of the fin
  finMesh.updateMatrixWorld(true);
  for (const side of [1, -1]) {
    const decal = new THREE.Mesh(
      new DecalGeometry(
        finMesh,
        new THREE.Vector3(-4.62, 1.42, side * 0.06),
        new THREE.Euler(0, side > 0 ? 0 : Math.PI, 0),
        new THREE.Vector3(0.78, 0.78, 0.12),
      ),
      mats.emblem,
    );
    decal.receiveShadow = true;
    group.add(decal);
  }

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

  addSmallParts(group, mats);

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
  const beaconLow = new THREE.Mesh(navGeo, mats.navRed);
  beaconLow.position.set(-0.4, centreAt(0.45) - radiusAt(0.45) - 0.03, 0);
  const tailLight = new THREE.Mesh(navGeo, mats.strobe);
  tailLight.position.set(X_TAIL - 0.06, centreAt(0), 0);
  group.add(navR, navG, strobe, beacon, beaconLow, tailLight);
  // Clear lens fairings over the lights
  const lensGeo = new THREE.SphereGeometry(1, 20, 12);
  for (const light of [navR, navG, beacon, beaconLow]) {
    const lens = new THREE.Mesh(lensGeo, mats.lens);
    lens.position.copy(light.position);
    lens.scale.set(0.075, 0.045, 0.045);
    group.add(lens);
  }

  const setNight = (n: number) => {
    mats.glass.emissiveIntensity = n * 0.55;
  };

  const update = (time: number, dt: number) => {
    for (const e of engines) (e.userData.fan as THREE.Group).rotation.x += dt * 9;
    const phase = time % 1.6;
    mats.strobe.opacity = phase < 0.06 || (phase > 0.18 && phase < 0.24) ? 1 : 0;
    beacon.visible = time % 1.2 < 0.5;
    beaconLow.visible = (time + 0.6) % 1.2 < 0.5;
  };

  const dispose = () => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const v of Object.values(mats)) {
      if (Array.isArray(v)) v.forEach((t) => t.dispose());
      else v.dispose();
    }
    for (const m of [mats.wing, mats.fin, mats.stab, mats.nacelle]) m.bumpMap?.dispose();
    mats.wing.map?.dispose();
    mats.emblem.map?.dispose();
  };

  return { group, update, setNight, dispose };
}
