import * as THREE from "three";
import { palette, type SkyPalette } from "./sky";

/** One camera "shot" per story chapter. The scene eases between neighbours as you scroll. */
export type Shot = {
  camera: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
  /** Horizontal framing offset as a fraction of viewport width (+ pushes subject right). Desktop only. */
  shiftX: number;
  /** Vertical framing offset as a fraction of viewport height (+ pushes subject up). */
  shiftY: number;
  jetPosition: THREE.Vector3;
  jetRotation: THREE.Quaternion;
  sky: SkyPalette;
  exposure: number;
  cloudSpeed: number;
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const q = (roll: number, yaw: number, pitch: number) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, "YZX"));
const UP = v(0, 1, 0);

const GOLDEN = palette("#0e1a2c", "#34506f", "#e9b07a", "#3a3a4a", "#ffc98a");
const HIGH = palette("#07152b", "#1f4570", "#9fb8cf", "#46566b", "#ffe2b8");
const DUSK = palette("#070b16", "#1c2742", "#c9825a", "#2a2533", "#ff9e62");
const NIGHT = palette("#020308", "#060c1a", "#1d2a44", "#05070d", "#6d7fa6", 1);

export const SHOTS: Shot[] = [
  // 0 — Hero: three-quarter front, sunset
  {
    camera: v(7.2, 1.3, 11.5),
    target: v(-0.2, 0.2, 0),
    up: UP,
    fov: 30,
    shiftX: 0,
    shiftY: -0.04,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0.03, -0.12, 0.015),
    sky: GOLDEN,
    exposure: 1.0,
    cloudSpeed: 14,
  },
  // 1 — Design: pure side profile
  {
    camera: v(0.3, 0.45, 19),
    target: v(0, 0.35, 0),
    up: UP,
    fov: 30,
    shiftX: 0.17,
    shiftY: 0,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0, 0, 0),
    sky: GOLDEN,
    exposure: 1.0,
    cloudSpeed: 14,
  },
  // 2 — Engines: close on the polished inlet
  {
    camera: v(1.4, 1.5, 4.6),
    target: v(-2.0, 0.6, 1.1),
    up: UP,
    fov: 32,
    shiftX: -0.2,
    shiftY: 0,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0, 0, 0),
    sky: HIGH,
    exposure: 1.05,
    cloudSpeed: 18,
  },
  // 3 — Cabin: along the window line
  {
    camera: v(5.8, 1.1, 5.4),
    target: v(0.9, 0.5, 0),
    up: UP,
    fov: 30,
    shiftX: 0.24,
    shiftY: 0,
    jetPosition: v(0, 0, 0),
    jetRotation: q(-0.04, 0.06, 0),
    sky: HIGH,
    exposure: 1.05,
    cloudSpeed: 18,
  },
  // 4 — Specifications: plan view over the cloud deck
  {
    camera: v(0.001, 25, 0),
    target: v(0, 0, 0),
    up: v(1, 0, 0),
    fov: 34,
    shiftX: 0.16,
    shiftY: 0,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0, 0, 0),
    sky: HIGH,
    exposure: 1.0,
    cloudSpeed: 20,
  },
  // 5 — Range: chase view, banking toward the sun
  {
    camera: v(-15, 1.2, 7.5),
    target: v(4, 1.2, -2.5),
    up: UP,
    fov: 30,
    shiftX: -0.12,
    shiftY: 0,
    jetPosition: v(0, 0.4, 0),
    jetRotation: q(-0.32, 0.18, 0.04),
    sky: DUSK,
    exposure: 1.0,
    cloudSpeed: 16,
  },
  // 6 — Enquire: aircraft recedes into the night
  {
    camera: v(-15, 1.5, 7.5),
    target: v(20, 3.5, -8),
    up: UP,
    fov: 30,
    shiftX: 0,
    shiftY: 0.08,
    jetPosition: v(70, 9, -38),
    jetRotation: q(-0.12, 0.42, 0.08),
    sky: NIGHT,
    exposure: 0.95,
    cloudSpeed: 10,
  },
];
