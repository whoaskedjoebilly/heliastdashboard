import * as THREE from "three";
import type { AtmosphereState } from "./atmosphere";

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
  atmosphere: AtmosphereState;
  exposure: number;
  /** Apparent ground speed of the cloud deck, world units per second. */
  cloudSpeed: number;
  /** 1 while the camera is inside the cabin: rides with the aircraft, tighter near plane. */
  interior?: number;
  /** Control point for a curved camera path arriving at this shot (e.g. out through a window). */
  via?: THREE.Vector3;
};

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const q = (roll: number, yaw: number, pitch: number) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, "YZX"));
const UP = v(0, 1, 0);
const atmo = (sunElevation: number, sunAzimuth: number, turbidity = 3, rayleigh = 1.4, coverage = 0.46): AtmosphereState => ({
  sunElevation,
  sunAzimuth,
  turbidity,
  rayleigh,
  coverage,
});

export const SHOTS: Shot[] = [
  // 0 — Welcome: wide rear-quarter view at golden hour
  {
    camera: v(-9.5, 1.1, 17.5),
    target: v(1.2, 0.15, 0),
    up: UP,
    fov: 32,
    shiftX: 0.12,
    shiftY: -0.02,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0.02, 0.1, 0.01),
    atmosphere: atmo(5, 225, 8, 2.4),
    exposure: 1.0,
    cloudSpeed: 34,
  },
  // 1 — Three-quarter front view
  {
    camera: v(7.2, 1.3, 11.5),
    target: v(-0.2, 0.2, 0),
    up: UP,
    fov: 30,
    shiftX: 0.16,
    shiftY: -0.04,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0.03, -0.12, 0.015),
    atmosphere: atmo(4.5, 150, 8, 2.4),
    exposure: 1.0,
    cloudSpeed: 34,
  },
  // 1 — Design: pure side profile
  {
    camera: v(0.3, 0.45, 21),
    target: v(0, 0.35, 0),
    up: UP,
    fov: 30,
    shiftX: 0.23,
    shiftY: 0,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0, 0, 0),
    atmosphere: atmo(8, 62, 6, 2),
    exposure: 1.0,
    cloudSpeed: 34,
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
    atmosphere: atmo(22, 55, 3, 1.3),
    exposure: 0.8,
    cloudSpeed: 40,
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
    atmosphere: atmo(26, 60, 3, 1.3),
    exposure: 0.8,
    cloudSpeed: 40,
  },
  // 4 — Specifications: plan view over the cloud deck
  {
    camera: v(0.001, 26, 0),
    target: v(0, 0, 0),
    up: v(1, 0, 0),
    fov: 34,
    shiftX: 0.22,
    shiftY: 0,
    jetPosition: v(0, 0, 0),
    jetRotation: q(0, 0, 0),
    atmosphere: atmo(75, 250, 3, 1.3, 0.4),
    exposure: 0.66,
    cloudSpeed: 44,
  },
  // 5 — Range: chase view, banking toward a setting sun
  {
    camera: v(-15, 1.2, 7.5),
    target: v(4, 1.2, -2.5),
    up: UP,
    fov: 30,
    shiftX: -0.12,
    shiftY: 0,
    jetPosition: v(0, 0.4, 0),
    jetRotation: q(-0.32, 0.18, 0.04),
    atmosphere: atmo(2.2, 16, 10, 3),
    exposure: 1.0,
    cloudSpeed: 36,
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
    atmosphere: atmo(-9, 10, 3, 1.4, 0.44),
    exposure: 1.25,
    cloudSpeed: 24,
  },
];
