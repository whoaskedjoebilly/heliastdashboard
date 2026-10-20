import * as THREE from "three";
import { gridSurface, hullPoint, L, lathe, R, windowLayout } from "./jet";

/**
 * The cabin around the over-wing window the story opens on: leather sidewall with
 * real window reveals and dust panes, a pull-down shade, a walnut side ledge with a
 * champagne flute, warm cove lighting and sunlight spilling through the window.
 */

const T0 = 0.405;
const T1 = 0.815;
/** Sidewall sits this far inside the outer skin. */
const WALL = 0.055;
/** Starboard window the camera looks through (4th from the rear, over the wing). */
export const HERO_WINDOW = windowLayout().filter((w) => w.theta > 0)[3];

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Sidewall colour, window holes (alpha) and cove light (emissive), all in (θ, t) space. */
function paintLining() {
  const W = 2048;
  const H = 1024;
  const [cc, c] = canvas(W, H);
  const [ac, a] = canvas(W, H);
  const [ec, e] = canvas(W, H);
  const rIn = R - WALL;
  const x = (theta: number) => ((((theta / (Math.PI * 2)) % 1) + 1) % 1) * W;
  const y = (t: number) => (1 - (t - T0) / (T1 - T0)) * H;
  const pxU = W / (Math.PI * 2 * rIn);
  const pxV = H / ((T1 - T0) * L);

  // Zones: ceiling, leather sidewall, dark lower dado; symmetric on both sides
  const band = (th0: number, th1: number, color: string) => {
    for (const side of [1, -1]) {
      const xa = x(side * th0);
      const xb = x(side * th1);
      c.fillStyle = color;
      c.fillRect(Math.min(xa, xb), 0, Math.abs(xb - xa), H);
    }
  };
  c.fillStyle = "#ece6dc";
  c.fillRect(0, 0, W, H);
  band(0.8, 1.97, "#d6c9b4");
  band(1.97, 3.1415, "#4a3f37");

  // Leather grain: fine speckle
  const rand = rng(11);
  for (let i = 0; i < 26000; i++) {
    const px = rand() * W;
    const py = rand() * H;
    c.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(60,40,20,0.05)";
    c.fillRect(px, py, 1.5, 1.5);
  }
  // Stitched seams between zones and between window bays
  c.strokeStyle = "rgba(120,100,80,0.55)";
  c.lineWidth = 2;
  c.setLineDash([6, 5]);
  for (const side of [1, -1]) {
    for (const th of [0.8, 1.97]) {
      c.beginPath();
      c.moveTo(x(side * th), 0);
      c.lineTo(x(side * th), H);
      c.stroke();
    }
  }
  c.setLineDash([]);

  // Soft light falloff: brighter at window height, darker toward ledge and ceiling
  for (const side of [1, -1]) {
    const xa = x(side * 0.8);
    const xb = x(side * 1.97);
    const g = c.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, "rgba(70,50,30,0.22)");
    g.addColorStop(0.45, "rgba(255,245,230,0.06)");
    g.addColorStop(1, "rgba(50,34,20,0.34)");
    c.fillStyle = g;
    c.fillRect(Math.min(xa, xb), 0, Math.abs(xb - xa), H);
  }
  // Vertical panel joints midway between window bays
  c.strokeStyle = "rgba(90,70,50,0.12)";
  c.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    const tj = 0.43 - 0.0215 + i * 0.043;
    for (const side of [1, -1]) {
      c.beginPath();
      c.moveTo(x(side * 0.8), y(tj));
      c.lineTo(x(side * 1.97), y(tj));
      c.stroke();
    }
  }

  // Window surrounds: a softly shaded bezel, and the hole itself in the alpha map
  a.fillStyle = "#fff";
  a.fillRect(0, 0, W, H);
  const wins = windowLayout();
  for (const w of wins) {
    const cx = x(w.theta);
    const cy = y(w.t);
    const rx = w.dTheta * 1.12 * rIn * pxU;
    const ry = w.dt * 1.12 * L * pxV;
    const g = c.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.9, cx, cy, Math.max(rx, ry) * 1.55);
    g.addColorStop(0, "#f3eee6");
    g.addColorStop(0.7, "#e5dccf");
    g.addColorStop(1, "rgba(214,201,180,0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, cy, rx * 1.45, ry * 1.4, 0, 0, Math.PI * 2);
    c.fill();
    a.fillStyle = "#000";
    a.beginPath();
    a.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    a.fill();
  }

  // Warm indirect cove light where ceiling meets sidewall
  e.fillStyle = "#000";
  e.fillRect(0, 0, W, H);
  for (const side of [1, -1]) {
    const cx = x(side * 0.78);
    const g = e.createLinearGradient(cx - 26, 0, cx + 26, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "#ffd9a8");
    g.addColorStop(1, "rgba(0,0,0,0)");
    e.fillStyle = g;
    e.fillRect(cx - 26, 0, 52, H);
  }

  const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(cc, true), alpha: tex(ac, false), emissive: tex(ec, true) };
}

/** Walnut burl veneer for the side ledge. */
function paintWood() {
  const [cc, c] = canvas(1024, 256);
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#4a2c1a");
  g.addColorStop(1, "#5c3721");
  c.fillStyle = g;
  c.fillRect(0, 0, 1024, 256);
  const rand = rng(5);
  for (let i = 0; i < 140; i++) {
    const y0 = rand() * 256;
    c.strokeStyle = `rgba(${rand() < 0.5 ? "30,16,8" : "120,80,50"},${0.15 + rand() * 0.25})`;
    c.lineWidth = 0.6 + rand() * 2.2;
    c.beginPath();
    c.moveTo(0, y0);
    for (let xx = 0; xx <= 1024; xx += 32) c.lineTo(xx, y0 + Math.sin(xx * 0.01 + i) * 6 + (rand() - 0.5) * 3);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cc);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function createInterior() {
  const group = new THREE.Group();
  group.name = "interior";
  const lining = paintLining();
  const wood = paintWood();

  const mats = {
    lining: new THREE.MeshStandardMaterial({
      map: lining.map,
      alphaMap: lining.alpha,
      alphaTest: 0.5,
      emissive: new THREE.Color(1, 0.8, 0.55),
      emissiveMap: lining.emissive,
      emissiveIntensity: 1.4,
      roughness: 0.72,
      envMapIntensity: 0.12,
    }),
    reveal: new THREE.MeshStandardMaterial({ color: 0xebe4d8, roughness: 0.55, envMapIntensity: 0.15, side: THREE.DoubleSide }),
    pane: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      envMapIntensity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    shade: new THREE.MeshStandardMaterial({
      color: 0xe9e1d3,
      roughness: 0.85,
      emissive: new THREE.Color(1, 0.78, 0.5),
      emissiveIntensity: 0.18,
      envMapIntensity: 0.15,
      side: THREE.DoubleSide,
    }),
    wood: new THREE.MeshPhysicalMaterial({
      map: wood,
      roughness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 0.3,
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0xc9b089, metalness: 1, roughness: 0.22, envMapIntensity: 0.5 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x5b5048, roughness: 1, envMapIntensity: 0.05 }),
    // Plain transparency rather than physical transmission: transmission forces a
    // second full-scene render every frame just for this glass
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.02,
      metalness: 0,
      clearcoat: 1,
      envMapIntensity: 1.2,
      depthWrite: false,
    }),
    wine: new THREE.MeshPhysicalMaterial({
      color: 0xe8c36a,
      transparent: true,
      opacity: 0.8,
      roughness: 0.05,
      clearcoat: 1,
      emissive: new THREE.Color(0.35, 0.22, 0.05),
      emissiveIntensity: 0.4,
      envMapIntensity: 0.8,
    }),
  };

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = cast;
    o.receiveShadow = true;
    group.add(o);
    return o;
  };

  // Sidewall / ceiling lining, facing inward
  mesh(
    gridSurface(192, 64, (u, v, p) => hullPoint(THREE.MathUtils.lerp(T0, T1, v), u * Math.PI * 2, -WALL, p), true),
    mats.lining,
    false,
  );

  // Window reveals (tunnels from lining to skin) and dust panes
  for (const w of windowLayout()) {
    mesh(
      gridSurface(40, 3, (u, v, p) => {
        const a = u * Math.PI * 2;
        const k = THREE.MathUtils.lerp(1.12, 1.0, v);
        hullPoint(w.t + Math.cos(a) * w.dt * k, w.theta + Math.sin(a) * w.dTheta * k, THREE.MathUtils.lerp(-WALL, -0.004, v), p);
      }),
      mats.reveal,
      true,
    );
    mesh(
      gridSurface(32, 3, (u, v, p) => {
        const a = u * Math.PI * 2;
        hullPoint(w.t + Math.cos(a) * w.dt * v, w.theta + Math.sin(a) * w.dTheta * v, -0.028, p);
      }),
      mats.pane,
      false,
    );
  }

  // Pull-down shade in the hero window, rebuilt as it opens
  const hw = HERO_WINDOW;
  const SU = 24;
  const SV = 8;
  const shadeGeo = gridSurface(SU, SV, (u, v, p) => p.set(0, 0, 0));
  const shade = mesh(shadeGeo, mats.shade, true);
  shade.frustumCulled = false;
  const tmp = new THREE.Vector3();
  let lastOpen = -1;
  const setShade = (open: number) => {
    const o = THREE.MathUtils.clamp(open, 0, 1);
    if (Math.abs(o - lastOpen) < 0.002) return;
    lastOpen = o;
    const pos = shadeGeo.getAttribute("position") as THREE.BufferAttribute;
    const h = -1 + 2 * o; // bottom edge in window-local vertical units (+1 = top)
    let k = 0;
    for (let j = 0; j <= SV; j++) {
      for (let i = 0; i <= SU; i++) {
        const aa = -1 + (2 * i) / SU;
        const ext = Math.sqrt(Math.max(0, 1 - aa * aa));
        const lo = Math.min(Math.max(h, -ext), ext);
        const vy = THREE.MathUtils.lerp(lo, ext, j / SV);
        hullPoint(hw.t + aa * hw.dt * 1.06, hw.theta - vy * hw.dTheta * 1.06, -WALL + 0.012, tmp);
        pos.setXYZ(k++, tmp.x, tmp.y, tmp.z);
      }
    }
    pos.needsUpdate = true;
    shadeGeo.computeVertexNormals();
    shadeGeo.computeBoundingSphere();
  };
  setShade(0.18);

  // Walnut side ledges with a brushed-brass inlay, both sides
  const ledgeY = -0.07;
  for (const side of [1, -1]) {
    const box = new THREE.BoxGeometry((T1 - T0 - 0.02) * L, 0.035, 0.13);
    const uv = box.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 6);
    const ledge = mesh(box, mats.wood, true);
    const xMid = -L / 2 + ((T0 + T1) / 2) * L;
    ledge.position.set(xMid, ledgeY, side * 0.475);
    const inlay = mesh(new THREE.BoxGeometry((T1 - T0 - 0.02) * L, 0.004, 0.006), mats.trim, false);
    inlay.position.set(xMid, ledgeY + 0.0, side * 0.408);
  }

  // Carpeted floor
  const floor = mesh(new THREE.PlaneGeometry((T1 - T0) * L, 1.1).rotateX(-Math.PI / 2), mats.carpet, false);
  floor.position.set(-L / 2 + ((T0 + T1) / 2) * L, -0.36, 0);

  // Champagne flute on the ledge beside the window
  const flute = new THREE.Group();
  const glassGeo = lathe(
    [
      [0, 0.0001],
      [0.0008, 0.012],
      [0.002, 0.0016],
      [0.028, 0.0014],
      [0.034, 0.006],
      [0.05, 0.0115],
      [0.07, 0.0118],
      [0.078, 0.0112],
    ],
    40,
  );
  glassGeo.rotateZ(Math.PI / 2); // lathe helper lays the axis along X; stand it up
  const glassMesh = new THREE.Mesh(glassGeo, mats.glass);
  glassMesh.castShadow = true;
  flute.add(glassMesh);
  const wineGeo = lathe(
    [
      [0.033, 0.0001],
      [0.036, 0.0055],
      [0.05, 0.0104],
      [0.062, 0.0106],
      [0.0621, 0.0001],
    ],
    32,
  );
  wineGeo.rotateZ(Math.PI / 2);
  const wine = new THREE.Mesh(wineGeo, mats.wine);
  wine.castShadow = true;
  flute.add(wine);
  const hwPos = hullPoint(hw.t, hw.theta, 0);
  flute.position.set(hwPos.x + 0.07, ledgeY + 0.0175, 0.47);
  group.add(flute);

  // Lighting: warm cabin fill, plus sunlight spilling through the hero window
  const cabinLight = new THREE.PointLight(0xffd2a0, 1.1, 2.4, 2);
  cabinLight.position.set(hwPos.x + 0.3, 0.38, -0.1);
  group.add(cabinLight);

  const windowSun = new THREE.SpotLight(0xffe0b0, 3, 1.6, 0.75, 0.55, 1.2);
  const inward = hullPoint(hw.t, hw.theta, -0.012);
  windowSun.position.copy(inward).add(new THREE.Vector3(0.02, 0.05, 0));
  windowSun.target.position.set(hwPos.x + 0.05, ledgeY, 0.3);
  windowSun.castShadow = true;
  windowSun.shadow.mapSize.set(1024, 1024);
  windowSun.shadow.camera.near = 0.005;
  windowSun.shadow.camera.far = 1.6;
  windowSun.shadow.bias = -0.0005;
  group.add(windowSun, windowSun.target);

  /** Position of the hero window in jet space, and its outward normal. */
  const windowCentre = hwPos.clone();
  const windowNormal = new THREE.Vector3(0, Math.cos(hw.theta), Math.sin(hw.theta)).normalize();

  const update = (sun: THREE.Color, sunAmount: number, night: number, visible: boolean) => {
    group.visible = visible;
    windowSun.color.copy(sun);
    windowSun.intensity = 4 * sunAmount * (0.2 + 0.8 * lastOpen);
    windowSun.castShadow = visible;
    cabinLight.intensity = THREE.MathUtils.lerp(1.1, 1.4, night);
  };

  const dispose = () => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    Object.values(mats).forEach((m) => m.dispose());
    [lining.map, lining.alpha, lining.emissive, wood].forEach((t) => t.dispose());
  };

  return { group, setShade, update, windowCentre, windowNormal, dispose };
}
