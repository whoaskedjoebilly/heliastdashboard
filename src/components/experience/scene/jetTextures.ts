import * as THREE from "three";

/**
 * Procedurally painted surface detail for the aircraft: panel seams (bump maps),
 * window gaskets, registration, soft contact shadows and a tail emblem.
 * Everything is drawn on 2D canvases once at load time.
 */

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};

const texture = (c: HTMLCanvasElement, srgb: boolean) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
};

/* ------------------------------------------------------------------ */
/* Fuselage                                                            */
/* ------------------------------------------------------------------ */

export type FuselageSpec = {
  length: number;
  radius: number;
  windows: { t: number; theta: number; dt: number; dTheta: number }[];
};

export function paintFuselage(spec: FuselageSpec) {
  const W = 1024;
  const H = 4096;
  const [bc, b] = canvas(W, H); // bump (height): mid grey = skin, dark = recessed seam
  const [cc, c] = canvas(W, H); // colour

  const x = (theta: number) => ((((theta / (Math.PI * 2)) % 1) + 1) % 1) * W;
  const y = (t: number) => (1 - t) * H;
  // pixels per world unit along each axis, used to keep shapes and text in proportion
  const pxU = W / (Math.PI * 2 * spec.radius);
  const pxV = H / spec.length;

  b.fillStyle = "rgb(128,128,128)";
  b.fillRect(0, 0, W, H);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, W, H);

  const seam = (w = 2.2) => {
    b.strokeStyle = "rgb(40,40,40)";
    b.lineWidth = w;
    c.strokeStyle = "rgba(90,92,96,0.35)";
    c.lineWidth = 1.2;
  };

  // Circumferential joints between fuselage sections
  seam();
  for (const t of [0.964, 0.905, 0.835, 0.62, 0.395, 0.255, 0.145]) {
    for (const ctx of [b, c]) {
      ctx.beginPath();
      ctx.moveTo(0, y(t));
      ctx.lineTo(W, y(t));
      ctx.stroke();
    }
  }
  // Radome has a subtly different paint batch
  c.fillStyle = "rgba(236,234,230,0.6)";
  c.fillRect(0, 0, W, y(0.964));

  const rrect = (ctx: CanvasRenderingContext2D, t0: number, t1: number, th0: number, th1: number, r: number) => {
    const X0 = Math.min(x(th0), x(th1));
    const X1 = Math.max(x(th0), x(th1));
    const Y0 = y(t1);
    const Y1 = y(t0);
    ctx.beginPath();
    ctx.roundRect(X0, Y0, X1 - X0, Y1 - Y0, r);
    ctx.stroke();
  };

  // Main entry door (port, forward) and its handle
  seam(2.6);
  for (const ctx of [b, c]) rrect(ctx, 0.79, 0.826, -0.62, -1.95, 16);
  c.fillStyle = "rgba(120,122,126,0.5)";
  c.fillRect(x(-1.25) - 10, y(0.8) - 3, 20, 6);
  // Baggage door (port, aft)
  for (const ctx of [b, c]) rrect(ctx, 0.27, 0.3, -1.1, -1.75, 10);
  // Over-wing emergency exit (starboard) around the fifth window
  const exitWin = spec.windows.filter((w) => w.theta > 0)[4];
  if (exitWin) {
    for (const ctx of [b, c])
      rrect(ctx, exitWin.t - exitWin.dt * 1.9, exitWin.t + exitWin.dt * 1.9, exitWin.theta - 0.36, exitWin.theta + 0.36, 12);
  }
  // Service and avionics access panels
  seam(1.8);
  const panels: [number, number, number, number][] = [
    [0.86, 0.885, 2.55, 3.05],
    [0.86, 0.885, -2.55, -3.05],
    [0.7, 0.72, 2.8, 3.48],
    [0.2, 0.235, 2.3, 2.9],
    [0.2, 0.235, -2.3, -2.9],
    [0.93, 0.945, 1.75, 2.1],
    [0.93, 0.945, -1.75, -2.1],
  ];
  for (const [t0, t1, a0, a1] of panels) for (const ctx of [b, c]) rrect(ctx, t0, t1, a0, a1, 6);

  // Rivet lines along the main joints (very faint, only catch grazing light)
  b.fillStyle = "rgb(112,112,112)";
  for (const t of [0.835, 0.62, 0.395]) {
    for (let px = 0; px < W; px += 7) {
      b.fillRect(px, y(t) - 6, 1.4, 1.4);
      b.fillRect(px, y(t) + 5, 1.4, 1.4);
    }
  }

  // Window gaskets: a thin grey reveal around each pane
  for (const w of spec.windows) {
    const cx = x(w.theta);
    const cy = y(w.t);
    const rx = w.dTheta * 1.22 * spec.radius * pxU;
    const ry = w.dt * 1.22 * spec.length * pxV;
    c.strokeStyle = "rgba(118,122,128,0.9)";
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    c.stroke();
    b.strokeStyle = "rgb(96,96,96)";
    b.lineWidth = 4;
    b.beginPath();
    b.ellipse(cx, cy, rx + 2, ry + 2, 0, 0, Math.PI * 2);
    b.stroke();
  }

  // Soft contact shadow where the wing and fairing meet the belly
  for (const side of [1, -1]) {
    const cx = x(side * 2.05);
    const g = c.createRadialGradient(cx, y(0.5), 0, cx, y(0.5), 160);
    g.addColorStop(0, "rgba(40,42,48,0.28)");
    g.addColorStop(1, "rgba(40,42,48,0)");
    c.save();
    c.translate(cx, y(0.5));
    c.scale(1, 3.2);
    c.translate(-cx, -y(0.5));
    c.fillStyle = g;
    c.fillRect(cx - 170, y(0.5) - 170, 340, 340);
    c.restore();
  }

  // Registration on the aft fuselage, readable from both sides
  const reg = "N7HL";
  for (const side of [1, -1]) {
    c.save();
    c.translate(x(side * 1.05), y(0.215));
    c.rotate(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    // text x runs along the fuselage (pxV), text y around it (pxU)
    c.scale(1, pxU / pxV);
    c.fillStyle = "rgba(60,62,68,0.85)";
    c.font = `500 ${Math.round(0.2 * pxV)}px "Helvetica Neue", Arial, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(reg, 0, 0);
    c.restore();
  }

  return { map: texture(cc, true), bump: texture(bc, false) };
}

/* ------------------------------------------------------------------ */
/* Lifting surfaces                                                    */
/* ------------------------------------------------------------------ */

/** u coordinate on an airfoil loop for chord fraction x (0 = LE, 1 = TE). */
const loopU = (xc: number, upper: boolean) => {
  const u = Math.acos(THREE.MathUtils.clamp(2 * xc - 1, -1, 1)) / (Math.PI * 2);
  return upper ? u : 1 - u;
};

type Line = { x0: number; x1: number; s0: number; s1: number };

/**
 * Paints hinge lines and panels for a lofted surface.
 * `sSpan` maps a spanwise fraction of the main surface to the loft's v coordinate.
 */
function paintSurface(lines: { upper?: Line[]; lower?: Line[] }, sSpan: (s: number) => number, dots: [number, number][] = []) {
  const S = 1024;
  const [bc, b] = canvas(S, S);
  b.fillStyle = "rgb(128,128,128)";
  b.fillRect(0, 0, S, S);
  b.strokeStyle = "rgb(36,36,36)";
  b.lineWidth = 2.4;
  const draw = (l: Line, upper: boolean) => {
    // Lines run either chordwise (s0 == s1) or spanwise (x0 == x1)
    const steps = 24;
    b.beginPath();
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const xc = THREE.MathUtils.lerp(l.x0, l.x1, k);
      const s = THREE.MathUtils.lerp(l.s0, l.s1, k);
      const px = loopU(xc, upper) * S;
      const py = (1 - sSpan(s)) * S;
      if (i === 0) b.moveTo(px, py);
      else b.lineTo(px, py);
    }
    b.stroke();
  };
  lines.upper?.forEach((l) => draw(l, true));
  lines.lower?.forEach((l) => draw(l, false));
  b.fillStyle = "rgb(60,60,60)";
  for (const [xc, s] of dots) {
    b.beginPath();
    b.arc(loopU(xc, true) * S, (1 - sSpan(s)) * S, 4, 0, Math.PI * 2);
    b.fill();
  }
  return texture(bc, false);
}

/** Outline of a control surface: hinge line, trailing-edge ends. */
const surfaceBox = (xHinge: number, s0: number, s1: number): Line[] => [
  { x0: xHinge, x1: xHinge, s0, s1 },
  { x0: xHinge, x1: 1, s0, s1: s0 },
  { x0: xHinge, x1: 1, s0: s1, s1 },
];

export function paintWing(mainStations: number, totalStations: number) {
  const sSpan = (s: number) => (s * mainStations) / totalStations;
  const flaps = [...surfaceBox(0.76, 0.08, 0.36), ...surfaceBox(0.76, 0.36, 0.62)];
  const aileron = surfaceBox(0.78, 0.64, 0.92);
  const spoilers: Line[] = [];
  for (let i = 0; i < 4; i++) {
    const s0 = 0.2 + i * 0.1;
    spoilers.push(
      { x0: 0.6, x1: 0.6, s0, s1: s0 + 0.1 },
      { x0: 0.6, x1: 0.76, s0, s1: s0 },
      { x0: 0.6, x1: 0.76, s0: s0 + 0.1, s1: s0 + 0.1 },
    );
  }
  // Fuel access and inspection panels on the lower surface
  const lowerPanels: Line[] = [];
  for (const s of [0.18, 0.34, 0.5, 0.66]) {
    lowerPanels.push(
      { x0: 0.3, x1: 0.44, s0: s, s1: s },
      { x0: 0.3, x1: 0.44, s0: s + 0.04, s1: s + 0.04 },
      { x0: 0.3, x1: 0.3, s0: s, s1: s + 0.04 },
      { x0: 0.44, x1: 0.44, s0: s, s1: s + 0.04 },
    );
  }
  return paintSurface(
    { upper: [...flaps, ...aileron, ...spoilers], lower: [...flaps, ...aileron, ...lowerPanels] },
    sSpan,
    [[0.42, 0.74]],
  );
}

export function paintTailSurface(hinge: number, s0: number, s1 = 1) {
  const box = surfaceBox(hinge, s0, s1);
  return paintSurface({ upper: box, lower: box }, (s) => s);
}

export function paintNacelle() {
  const S = 512;
  const [bc, b] = canvas(S, S);
  b.fillStyle = "rgb(128,128,128)";
  b.fillRect(0, 0, S, S);
  b.strokeStyle = "rgb(40,40,40)";
  b.lineWidth = 2.2;
  // Cowl joints (v runs along the nacelle) and the thrust-reverser split line
  for (const v of [0.2, 0.52, 0.8]) {
    b.beginPath();
    b.moveTo(0, (1 - v) * S);
    b.lineTo(S, (1 - v) * S);
    b.stroke();
  }
  for (const u of [0.25, 0.75]) {
    b.beginPath();
    b.moveTo(u * S, (1 - 0.2) * S);
    b.lineTo(u * S, (1 - 0.8) * S);
    b.stroke();
  }
  return texture(bc, false);
}

/** Fine "orange peel" normal map for the clear coat, tiled. */
export function orangePeel() {
  const S = 256;
  const [cc, c] = canvas(S, S);
  const img = c.createImageData(S, S);
  // Smooth value noise → height → normals
  const grid = 24;
  const rnd = new Float32Array((grid + 1) * (grid + 1));
  let seed = 9;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < rnd.length; i++) rnd[i] = rand();
  for (let gy = 0; gy <= grid; gy++) rnd[gy * (grid + 1) + grid] = rnd[gy * (grid + 1)];
  for (let gx = 0; gx <= grid; gx++) rnd[grid * (grid + 1) + gx] = rnd[gx];
  const height = (px: number, py: number) => {
    const fx = ((px / S) * grid) % grid;
    const fy = ((py / S) * grid) % grid;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const r = (a: number, b2: number) => rnd[b2 * (grid + 1) + a];
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(r(ix, iy), r(ix + 1, iy), sx),
      THREE.MathUtils.lerp(r(ix, iy + 1), r(ix + 1, iy + 1), sx),
      sy,
    );
  };
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const dx = height((px + 1) % S, py) - height((px - 1 + S) % S, py);
      const dy = height(px, (py + 1) % S) - height(px, (py - 1 + S) % S);
      const n = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize();
      const o = (py * S + px) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  const t = texture(cc, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tail emblem: a champagne diamond mark with the wordmark beneath. */
export function paintEmblem(name: string) {
  const W = 1024;
  const H = 1024;
  const [cc, c] = canvas(W, H);
  c.clearRect(0, 0, W, H);
  const gold = "#c8a46e";
  c.strokeStyle = gold;
  c.fillStyle = gold;
  c.lineWidth = 16;
  const cx = W / 2;
  const cy = 400;
  const r = 250;
  c.beginPath();
  c.moveTo(cx, cy - r);
  c.lineTo(cx + r, cy);
  c.lineTo(cx, cy + r);
  c.lineTo(cx - r, cy);
  c.closePath();
  c.stroke();
  c.beginPath();
  c.moveTo(cx - r, cy);
  c.lineTo(cx + r, cy);
  c.stroke();
  c.beginPath();
  c.arc(cx, cy, 30, 0, Math.PI * 2);
  c.fill();
  c.font = `500 96px "Helvetica Neue", Arial, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const spaced = name.split("").join(String.fromCharCode(8202, 8202));
  c.fillText(spaced, cx, 820);
  return texture(cc, true);
}
