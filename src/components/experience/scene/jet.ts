import * as THREE from "three";

/**
 * Procedurally modelled long-range business jet.
 * Local space: nose points +X, up is +Y, starboard wing extends along +Z.
 * Units are roughly metres / 3 (fuselage is 10 units long).
 *
 * Slender fuselage, 31° swept wing with raked tips, under-wing engines on pylons,
 * and a navy-and-gold livery painted onto canvas textures at load time.
 */

/* ------------------------------------------------------------------ */
/* Surface helpers                                                     */
/* ------------------------------------------------------------------ */

function gridSurface(nu: number, nv: number, fn: (u: number, v: number, target: THREE.Vector3) => void, flip = false) {
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
  return gridSurface(
    nu,
    nv,
    (u, v, target) => {
      const j = Math.round(v * nv);
      const i = Math.round(u * nu);
      const s = stations[j];
      const [x, y] = loops[j][i];
      const up = new THREE.Vector3(0, Math.cos(s.bank), -Math.sin(s.bank));
      // Chord runs aft from the leading edge
      target
        .copy(s.le)
        .add(new THREE.Vector3(-x * s.chord, 0, 0))
        .addScaledVector(up, y * s.chord);
    },
    true,
  );
}

/** Materials the engine builder needs. */
type EngineMaterials = {
  nacelle: THREE.Material;
  chrome: THREE.Material;
  liner: THREE.Material;
  fanFace: THREE.Material;
  spinner: THREE.Material;
  fan: THREE.Material;
  exhaust: THREE.Material;
};

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

function buildEngine(materials: EngineMaterials) {
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
/* Aircraft                                                            */
/* ------------------------------------------------------------------ */

export type Jet = {
  group: THREE.Group;
  update: (time: number, dt: number) => void;
  /** 0 = day, 1 = night: warms the cabin windows. */
  setNight: (n: number) => void;
  dispose: () => void;
};

const PI = Math.PI;
const TAU = PI * 2;
/** Fuselage radius, length and tail position. */
const R = 0.46;
const L = 10;
const X0 = -5;

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};

const texture = (c: HTMLCanvasElement, srgb = true, aniso = 8) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
};

/** Fuselage radius along normalised length v (0 = tail, 1 = nose). */
const rad = (v: number) => {
  let r = R;
  if (v > 0.88) {
    const n = (v - 0.88) / 0.12;
    r = R * Math.pow(Math.max(0, 1 - Math.pow(n, 2.1)), 0.56);
  } else if (v < 0.24) {
    const n = (0.24 - v) / 0.24;
    r = R * Math.pow(Math.max(0, 1 - Math.pow(n, 1.85)), 0.6);
  }
  return Math.max(r, 0.03);
};

/** Centreline height: nose droop and tail upsweep. */
const yc = (v: number) => {
  if (v > 0.88) return -0.05 * Math.pow((v - 0.88) / 0.12, 1.7);
  if (v < 0.3) return 0.17 * Math.pow((0.3 - v) / 0.3, 1.9);
  return 0;
};

/** Point on the skin; phi is measured from the top toward starboard. */
const pos = (v: number, phi: number, off: number, t: THREE.Vector3) => {
  const r = rad(v) + off;
  return t.set(X0 + v * L, yc(v) + r * Math.cos(phi), r * Math.sin(phi));
};

/** Averages normals across the u seam of a wrapped grid so it shades smoothly. */
const seam = (g: THREE.BufferGeometry, nu: number, nv: number) => {
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const i0 = j * (nu + 1);
    const i1 = i0 + nu;
    a.fromBufferAttribute(n, i0);
    b.fromBufferAttribute(n, i1);
    a.add(b).normalize();
    n.setXYZ(i0, a.x, a.y, a.z);
    n.setXYZ(i1, a.x, a.y, a.z);
  }
  n.needsUpdate = true;
  return g;
};

/** Door positions along the fuselage (both sides). */
const DOORS = [0.845, 0.655, 0.5, 0.325];

export function createJet(): Jet {
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  /* ---------- livery textures ---------- */
  const W = 1024;
  const H = 4096;
  const px = (p: number) => (p / TAU) * W;
  const py = (v: number) => (1 - v) * H;
  const [fc, f] = canvas(W, H);
  f.fillStyle = "#f3f1ec";
  f.fillRect(0, 0, W, H);
  for (let i = 0; i < 9e4; i++) {
    f.fillStyle = rng() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(70,60,50,.035)";
    f.fillRect(rng() * W, rng() * H, 1.4, 1.4);
  }

  // Grey belly with a soft edge
  {
    const g = f.createLinearGradient(px(1.95), 0, px(2.45), 0);
    g.addColorStop(0, "rgba(150,154,162,0)");
    g.addColorStop(1, "rgba(150,154,162,1)");
    f.fillStyle = g;
    f.fillRect(px(1.95), 0, px(2.45) - px(1.95), H);
    f.fillStyle = "#969aa2";
    f.fillRect(px(2.45), 0, px(TAU - 2.45) - px(2.45), H);
    const g2 = f.createLinearGradient(px(TAU - 2.45), 0, px(TAU - 1.95), 0);
    g2.addColorStop(0, "rgba(150,154,162,1)");
    g2.addColorStop(1, "rgba(150,154,162,0)");
    f.fillStyle = g2;
    f.fillRect(px(TAU - 2.45), 0, px(TAU - 1.95) - px(TAU - 2.45), H);
  }

  // Cheatline: navy band under the windows rising over the tail, gold pinstripe
  const band = (a0: number, a1: number, col: string) => {
    for (const m of [1, -1]) {
      f.fillStyle = col;
      f.beginPath();
      const pts: [number, number][] = [];
      for (let k = 0; k <= 60; k++) {
        const v = 0.86 - (k / 60) * 0.86;
        const rise = Math.pow(Math.max(0, (0.42 - v) / 0.42), 1.7) * 1.05;
        pts.push([v, a0 - rise]);
      }
      for (let k = 60; k >= 0; k--) {
        const v = 0.86 - (k / 60) * 0.86;
        const rise = Math.pow(Math.max(0, (0.42 - v) / 0.42), 1.7) * 1.05;
        pts.push([v, a1 - rise * (1 - 0.55 * Math.min(1, Math.max(0, (0.2 - v) / 0.2)))]);
      }
      pts.forEach(([v, a], i) => {
        const aa = m > 0 ? a : TAU - a;
        const x = px(aa);
        const y = py(v);
        if (i) f.lineTo(x, y);
        else f.moveTo(x, y);
      });
      f.closePath();
      f.fill();
    }
  };
  band(1.6, 1.84, "#141f33");
  band(1.88, 1.915, "#c8a96e");

  // Navy tail cone
  f.fillStyle = "#141f33";
  f.fillRect(0, py(0.075), W, H - py(0.075));

  // Panel lines
  f.strokeStyle = "rgba(70,76,88,.34)";
  f.lineWidth = 1.6;
  for (let v = 0.05; v < 0.93; v += 0.0385) {
    f.beginPath();
    f.moveTo(0, py(v));
    f.lineTo(W, py(v));
    f.stroke();
  }
  f.lineWidth = 1.2;
  for (const a of [0.55, 1.05, 2.1, 2.7]) {
    for (const m of [1, -1]) {
      const x = px(m > 0 ? a : TAU - a);
      f.beginPath();
      f.moveTo(x, py(0.92));
      f.lineTo(x, py(0.04));
      f.stroke();
    }
  }

  // Doors and their handles
  f.strokeStyle = "rgba(50,56,68,.75)";
  f.lineWidth = 2.2;
  for (const d of DOORS) {
    for (const m of [1, -1]) {
      const xa = px(m > 0 ? 1.0 : TAU - 1.62);
      const xb = px(m > 0 ? 1.62 : TAU - 1.0);
      const ya = py(d + 0.022);
      const yb = py(d - 0.022);
      f.beginPath();
      f.roundRect(xa, ya, xb - xa, yb - ya, 22);
      f.stroke();
      f.fillStyle = "rgba(40,44,54,.5)";
      f.fillRect((xa + xb) / 2 - 5, (ya + yb) / 2 - 4, 10, 8);
    }
  }

  // Wordmark above the windows, reading correctly from each side
  f.save();
  f.font = "600 74px Geist, 'Helvetica Neue', Arial, sans-serif";
  f.fillStyle = "#141f33";
  f.textAlign = "center";
  f.textBaseline = "middle";
  if ("letterSpacing" in f) f.letterSpacing = "26px";
  for (const [m, a] of [
    [1, 1.04],
    [-1, TAU - 1.04],
  ]) {
    f.save();
    f.translate(px(a), py(0.67));
    f.scale(m > 0 ? 1 : -1, 1);
    f.rotate(-PI / 2);
    f.fillText("HELIAST", 0, 0);
    f.restore();
  }
  f.restore();
  const fusMap = texture(fc);

  /* ---------- wing / tail textures ---------- */
  const paintSurface = (base: string, lines: (x: CanvasRenderingContext2D) => void) => {
    const [c, x] = canvas(1024, 1024);
    x.fillStyle = base;
    x.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 4e4; i++) {
      x.fillStyle = rng() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(60,60,60,.04)";
      x.fillRect(rng() * 1024, rng() * 1024, 1.5, 1.5);
    }
    x.strokeStyle = "rgba(60,66,78,.5)";
    x.lineWidth = 2;
    lines(x);
    return texture(c);
  };
  // Airfoil loop u coordinate for chord fraction r on the upper / lower skin
  const uU = (r: number) => Math.acos(2 * r - 1) / PI / 2;
  const uL = (r: number) => 1 - uU(r);
  const seg = (x: CanvasRenderingContext2D, u: number, d0: number, d1: number) => {
    x.beginPath();
    x.moveTo(u * 1024, (1 - d0) * 1024);
    x.lineTo(u * 1024, (1 - d1) * 1024);
    x.stroke();
  };
  const hline = (x: CanvasRenderingContext2D, d: number, u0: number, u1: number) => {
    x.beginPath();
    x.moveTo(u0 * 1024, (1 - d) * 1024);
    x.lineTo(u1 * 1024, (1 - d) * 1024);
    x.stroke();
  };
  const wingMap = paintSurface("#ebe9e4", (x) => {
    for (const [r, a, b] of [
      [0.74, 0.12, 0.58],
      [0.8, 0.64, 0.9],
      [0.12, 0.1, 0.95],
    ])
      for (const u of [uU(r), uL(r)]) seg(x, u, a, b);
    for (const d of [0.12, 0.58, 0.64, 0.9])
      for (const [r0, r1] of [
        [0.74, 1],
        [0.8, 1],
      ])
        for (const [a, b] of [
          [uU(r1), uU(r0)],
          [uL(r0), uL(r1)],
        ])
          hline(x, d, a, b);
    x.strokeStyle = "rgba(60,66,78,.35)";
    for (let d = 0.27; d < 0.56; d += 0.06) {
      x.strokeRect(uU(0.74) * 1024, (1 - d - 0.04) * 1024, (uU(0.6) - uU(0.74)) * 1024, 0.04 * 1024);
    }
    x.fillStyle = "rgba(70,70,76,.38)";
    x.fillRect(uU(1) * 1024, 0, (uU(0.95) - uU(1)) * 1024, 1024);
  });
  const stabMap = paintSurface("#e9e7e2", (x) => {
    for (const u of [uU(0.7), uL(0.7)]) seg(x, u, 0.04, 0.97);
  });
  // Navy fin with a rudder line and the gold diamond emblem on both sides
  const [fnc, fnx] = canvas(1024, 1024);
  fnx.fillStyle = "#121b2d";
  fnx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 4e4; i++) {
    fnx.fillStyle = rng() < 0.5 ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.08)";
    fnx.fillRect(rng() * 1024, rng() * 1024, 1.5, 1.5);
  }
  fnx.strokeStyle = "rgba(150,160,180,.35)";
  fnx.lineWidth = 2;
  for (const u of [uU(0.68), uL(0.68)]) seg(fnx, u, 0.03, 0.98);
  for (const u of [uU(0.45), uL(0.45)]) {
    fnx.save();
    fnx.translate(u * 1024, 0.5 * 1024);
    fnx.strokeStyle = "#dcbd8c";
    fnx.fillStyle = "#dcbd8c";
    fnx.lineWidth = 5;
    fnx.beginPath();
    fnx.moveTo(0, -95);
    fnx.lineTo(95, 0);
    fnx.lineTo(0, 95);
    fnx.lineTo(-95, 0);
    fnx.closePath();
    fnx.stroke();
    fnx.beginPath();
    fnx.moveTo(-95, 0);
    fnx.lineTo(95, 0);
    fnx.stroke();
    fnx.beginPath();
    fnx.arc(0, 0, 16, 0, TAU);
    fnx.fill();
    fnx.restore();
  }
  const finMap = texture(fnc);

  /* ---------- materials ---------- */
  const clear = (o: THREE.MeshPhysicalMaterialParameters) =>
    new THREE.MeshPhysicalMaterial({
      roughness: 0.3,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1,
      ...o,
    });
  const m = {
    fus: clear({ color: 0xffffff, map: fusMap, roughness: 0.32 }),
    wing: clear({ color: 0xffffff, map: wingMap, roughness: 0.36 }),
    stab: clear({ color: 0xffffff, map: stabMap, roughness: 0.36 }),
    fin: clear({ color: 0xffffff, map: finMap, roughness: 0.28 }),
    nacelle: clear({ color: 0xf1f2ec, roughness: 0.3 }),
    belly: clear({ color: 0xbdbdbd, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x060717,
      roughness: 0.04,
      metalness: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0,
      envMapIntensity: 1.8,
      emissive: new THREE.Color(1, 0.68, 0.38),
      emissiveIntensity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.6, side: THREE.DoubleSide }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xd9dde2, roughness: 0.12, metalness: 1 }),
    fan: new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 0.28, metalness: 1 }),
    fanFace: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.7, metalness: 0.3 }),
    liner: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide }),
    spinner: new THREE.MeshPhysicalMaterial({
      color: 0xf3f1f3,
      roughness: 0.25,
      metalness: 0.4,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    exhaust: new THREE.MeshPhysicalMaterial({
      color: 0x7a6a5c,
      roughness: 0.42,
      metalness: 1,
      iridescence: 0.55,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [250, 600],
      side: THREE.DoubleSide,
    }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15) }),
    green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 4, 0.8) }),
    strobe: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6, 6) }),
    beacon: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.25, 0.2) }),
  };

  const g = new THREE.Group();
  g.name = "jet";
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, recv = true) => {
    const o = new THREE.Mesh(geo, mat);
    o.castShadow = cast;
    o.receiveShadow = recv;
    g.add(o);
    return o;
  };

  /* ---------- fuselage ---------- */
  add(
    seam(
      gridSurface(96, 300, (u, w, t) => pos(w, u * TAU, 0, t)),
      96,
      300,
    ),
    m.fus,
  );

  /** Rounded-rect patch following the fuselage skin (windows, cockpit glazing). */
  const patch = (v0: number, p0: number, dv: number, dp: number, n: number, off: number) =>
    gridSurface(18, 3, (u, w, t) => {
      const q = u * TAU;
      const c = Math.cos(q);
      const s = Math.sin(q);
      const ie = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const je = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      pos(v0 + ie * w * dv, p0 + je * w * dp, off, t);
    });
  const glazing: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const side = (a: number) => (s > 0 ? a : TAU - a);
    for (let v = 0.805; v > 0.2; v -= 0.0095) {
      if (DOORS.some((d) => Math.abs(v - d) < 0.03)) continue;
      glazing.push(patch(v, side(1.44), 0.0031, 0.072, 2.6, 0.0025));
    }
    glazing.push(patch(0.93, side(0.52), 0.017, 0.27, 3.4, 0.003), patch(0.915, side(1.02), 0.012, 0.2, 3.4, 0.003));
    glazing.push(patch(0.944, side(0.18), 0.012, 0.15, 3.4, 0.003));
  }
  add(mergeGeometries(glazing), m.glass, false, false);

  // Belly fairing
  {
    const a = add(new THREE.SphereGeometry(1, 48, 24), m.belly, true, true);
    a.scale.set(1.95, 0.2, 0.5);
    a.position.set(0.05, -0.345, 0);
  }

  /* ---------- wing ---------- */
  const wz0 = 0.28;
  const span = 4.4;
  const x0 = 0.8;
  const y0 = -0.3;
  const sweep = Math.tan(THREE.MathUtils.degToRad(31));
  const dihedral = Math.tan(THREE.MathUtils.degToRad(5.5));
  const NW = 14;
  const secs: Station[] = [];
  for (let h = 0; h <= NW; h++) {
    const d = h / NW;
    const chord =
      d < 0.3
        ? THREE.MathUtils.lerp(1.85, 1.2, d / 0.3)
        : THREE.MathUtils.lerp(1.2, 0.34, Math.pow((d - 0.3) / 0.7, 0.92));
    // Raked wingtip
    const rake = d > 0.84 ? Math.pow((d - 0.84) / 0.16, 1.6) * 0.42 : 0;
    secs.push({
      le: new THREE.Vector3(
        x0 - d * span * sweep - rake,
        y0 + d * span * dihedral + (d > 0.9 ? (d - 0.9) * 0.5 : 0),
        wz0 + d * span,
      ),
      chord,
      thick: THREE.MathUtils.lerp(0.14, 0.088, d),
      bank: 0,
      camber: 0.016,
    });
  }
  const wingAt = (d: number) => {
    const f2 = THREE.MathUtils.clamp(d, 0, 1) * NW;
    const i = Math.min(NW - 1, Math.floor(f2));
    const s2 = f2 - i;
    return {
      le: secs[i].le.clone().lerp(secs[i + 1].le, s2),
      chord: THREE.MathUtils.lerp(secs[i].chord, secs[i + 1].chord, s2),
      thick: THREE.MathUtils.lerp(secs[i].thick, secs[i + 1].thick, s2),
    };
  };
  const wing = loftSurface(secs);
  add(wing, m.wing);
  add(mirrorZ(wing), m.wing);

  // Flap-track fairings
  {
    const pod = lathe(
      [
        [0, 0],
        [-0.05, 0.04],
        [-0.28, 0.062],
        [-0.7, 0.052],
        [-1, 0.024],
        [-1.1, 0],
      ],
      20,
    );
    const pods: THREE.BufferGeometry[] = [];
    for (const d of [0.2, 0.34, 0.5, 0.72]) {
      const w = wingAt(d);
      const p = pod.clone();
      p.scale(0.85 + 0.2 * (1 - d), 0.8, 0.85 + 0.2 * (1 - d));
      p.translate(w.le.x - w.chord * 0.52, w.le.y - w.chord * w.thick * 0.52 - 0.02, w.le.z);
      pods.push(p);
    }
    pod.dispose();
    const pf = mergeGeometries(pods);
    add(pf, m.stab);
    add(mirrorZ(pf), m.stab);
  }

  /* ---------- tail ---------- */
  const fin: Station[] = [];
  for (let i = 0; i <= 10; i++) {
    const d = i / 10;
    fin.push({
      le: new THREE.Vector3(-3.1 - d * 1.32 * 0.78, 0.3 + d * 1.34, 0),
      chord: THREE.MathUtils.lerp(1.75, 0.72, Math.pow(d, 0.9)),
      thick: THREE.MathUtils.lerp(0.115, 0.08, d),
      bank: PI / 2,
    });
  }
  add(loftSurface(fin), m.fin);
  const stab: Station[] = [];
  for (let i = 0; i <= 8; i++) {
    const d = i / 8;
    const z = 0.08 + d * 1.72;
    stab.push({
      le: new THREE.Vector3(
        -3.55 - z * Math.tan(THREE.MathUtils.degToRad(34)),
        0.1 + z * Math.tan(THREE.MathUtils.degToRad(4.5)),
        z,
      ),
      chord: THREE.MathUtils.lerp(1.15, 0.38, d),
      thick: THREE.MathUtils.lerp(0.095, 0.07, d),
      bank: 0,
    });
  }
  const stabGeo = loftSurface(stab);
  add(stabGeo, m.stab);
  add(mirrorZ(stabGeo), m.stab);

  // Tail-cone APU exhaust, antennas and probes
  {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.036, 0.14, 20, 1, true).rotateZ(PI / 2), m.exhaust);
    e.position.set(X0 - 0.02, yc(0), 0);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.1, 8), m.dark);
    ant.position.set(2.3, R + 0.04, 0);
    const ant2 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.07, 8), m.dark);
    ant2.position.set(-0.8, R + 0.03, 0.12);
    const blister = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), m.dark);
    blister.scale.set(0.18, 0.03, 0.06);
    blister.position.set(1.05, -R, 0);
    g.add(e, ant, ant2, blister);
  }
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6).rotateZ(PI / 2), m.chrome);
    const q = pos(0.915, s > 0 ? 1.5 : TAU - 1.5, 0, new THREE.Vector3());
    p.position.set(q.x + 0.08, q.y, q.z);
    g.add(p);
  }

  /* ---------- engines on under-wing pylons ---------- */
  const engines: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const ez = 1.78;
    const w = wingAt((ez - wz0) / span);
    const ex = 0.5;
    const ey = w.le.y - 0.36;
    const e = buildEngine(m);
    e.scale.setScalar(0.74);
    e.position.set(ex, ey, s * ez);
    g.add(e);
    engines.push(e);
    const shape = new THREE.Shape();
    shape.moveTo(0.3, 0);
    shape.lineTo(-1.0, 0);
    shape.lineTo(-1.25, 0.5);
    shape.lineTo(-0.15, 0.5);
    shape.closePath();
    const pg = new THREE.ExtrudeGeometry(shape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      bevelSegments: 2,
    });
    pg.translate(0, 0, -0.0275);
    const pylon = new THREE.Mesh(pg, m.nacelle);
    pylon.position.set(ex, ey + 0.17, s * ez);
    pylon.castShadow = pylon.receiveShadow = true;
    g.add(pylon);
  }

  /* ---------- lights ---------- */
  const tip = secs[secs.length - 1].le;
  const lightGeo = new THREE.SphereGeometry(0.032, 12, 8);
  const navR = new THREE.Mesh(lightGeo, m.red);
  navR.position.set(tip.x - 0.12, tip.y + 0.02, -(tip.z + 0.02));
  const navG = new THREE.Mesh(lightGeo, m.green);
  navG.position.set(tip.x - 0.12, tip.y + 0.02, tip.z + 0.02);
  const strobeGeo = new THREE.SphereGeometry(0.035, 12, 8);
  const tailStrobe = new THREE.Mesh(strobeGeo, m.strobe);
  tailStrobe.position.set(-4.95, 0.55, 0);
  const tipStrobe = new THREE.Mesh(strobeGeo, m.strobe);
  tipStrobe.position.set(tip.x - 0.35, tip.y + 0.02, tip.z + 0.01);
  const tipStrobe2 = tipStrobe.clone();
  tipStrobe2.position.z = -tipStrobe.position.z;
  const beaconGeo = new THREE.SphereGeometry(0.04, 12, 8);
  const beaconTop = new THREE.Mesh(beaconGeo, m.beacon);
  beaconTop.position.set(0.25, R + 0.012, 0);
  const beaconLow = new THREE.Mesh(beaconGeo, m.beacon);
  beaconLow.position.set(-0.3, -R, 0);
  g.add(navR, navG, tailStrobe, tipStrobe, tipStrobe2, beaconTop, beaconLow);

  return {
    group: g,
    update: (time, dt) => {
      for (const e of engines) (e.userData.fan as THREE.Group).rotation.x += dt * 9;
      const q = time % 1.6;
      const on = q < 0.06 || (q > 0.18 && q < 0.24);
      tailStrobe.visible = tipStrobe.visible = tipStrobe2.visible = on;
      beaconTop.visible = time % 1.2 < 0.5;
      beaconLow.visible = (time + 0.6) % 1.2 < 0.5;
    },
    setNight: (n) => {
      m.glass.emissiveIntensity = n * 0.55;
    },
    dispose: () => {
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      for (const mat of Object.values(m)) {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      }
    },
  };
}
