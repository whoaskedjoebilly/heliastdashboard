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
  /** Cockpit panes as rounded rectangles (superellipse exponent n). */
  panes: { t: number; theta: number; dt: number; dTheta: number; n: number }[];
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

  // Black rubber seals around the cockpit glazing
  for (const p of spec.panes) {
    c.strokeStyle = "rgba(28,29,32,0.95)";
    c.lineWidth = 7;
    c.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sx = Math.sign(ca) * Math.abs(ca) ** (2 / p.n);
      const sy = Math.sign(sa) * Math.abs(sa) ** (2 / p.n);
      const px = x(p.theta + sy * p.dTheta * 1.05);
      const py = y(p.t + sx * p.dt * 1.08);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.stroke();
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

  /** Small painted text laid along the fuselage, upright from the given side. */
  const stencil = (text: string, t: number, theta: number, heightUnits: number, color: string, weight = 600) => {
    const side = theta >= 0 ? 1 : -1;
    c.save();
    c.translate(x(theta), y(t));
    c.rotate(side > 0 ? -Math.PI / 2 : Math.PI / 2);
    c.scale(1, pxU / pxV);
    c.fillStyle = color;
    c.font = `${weight} ${Math.max(6, Math.round(heightUnits * pxV))}px "Helvetica Neue", Arial, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 0, 0);
    c.restore();
  };

  // --- Weathering: what separates a real airframe from a render ---
  const rand = (() => {
    let seed = 42;
    return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  })();
  // Engine exhaust soot along the tail cone sides
  for (const side of [1, -1]) {
    const cx = x(side * 1.45);
    const g = c.createLinearGradient(0, y(0.16), 0, y(0.0));
    g.addColorStop(0, "rgba(70,62,54,0)");
    g.addColorStop(0.6, "rgba(70,62,54,0.10)");
    g.addColorStop(1, "rgba(60,52,46,0.22)");
    c.fillStyle = g;
    c.save();
    c.beginPath();
    c.ellipse(cx, y(0.07), 0.55 * spec.radius * pxU, 0.1 * spec.length * pxV, 0, 0, Math.PI * 2);
    c.clip();
    c.fillRect(cx - 400, y(0.18), 800, y(0) - y(0.18));
    c.restore();
  }
  // APU soot at the very tail
  {
    const g = c.createLinearGradient(0, y(0.05), 0, y(0));
    g.addColorStop(0, "rgba(40,38,36,0)");
    g.addColorStop(1, "rgba(40,38,36,0.35)");
    c.fillStyle = g;
    c.fillRect(0, y(0.05), W, y(0) - y(0.05));
  }
  // Belly grime: darker toward the keel, heaviest behind the gear bays
  {
    const g = c.createLinearGradient(x(2.2), 0, x(Math.PI), 0);
    g.addColorStop(0, "rgba(90,86,80,0)");
    g.addColorStop(1, "rgba(90,86,80,0.12)");
    c.fillStyle = g;
    c.fillRect(x(2.2), y(0.8), x(Math.PI) - x(2.2), y(0.12) - y(0.8));
    const g2 = c.createLinearGradient(x(-Math.PI + 0.0001), 0, x(-2.2), 0);
    g2.addColorStop(0, "rgba(90,86,80,0.12)");
    g2.addColorStop(1, "rgba(90,86,80,0)");
    c.fillStyle = g2;
    c.fillRect(x(-Math.PI + 0.0001), y(0.8), x(-2.2) - x(-Math.PI + 0.0001), y(0.12) - y(0.8));
  }
  // Rain streaks trailing aft and down from windows, door and panels
  c.lineCap = "round";
  for (let i = 0; i < 160; i++) {
    const side = rand() < 0.5 ? 1 : -1;
    const t0 = 0.15 + rand() * 0.8;
    const th0 = side * (1.2 + rand() * 0.9);
    const len = 0.01 + rand() * 0.05;
    c.strokeStyle = `rgba(110,106,100,${0.03 + rand() * 0.05})`;
    c.lineWidth = 0.8 + rand() * 1.6;
    c.beginPath();
    c.moveTo(x(th0), y(t0));
    c.lineTo(x(th0 + side * len * 3), y(t0 - len));
    c.stroke();
  }
  // Landing-gear doors on the belly
  seam(2.2);
  for (const ctx of [b, c]) {
    rrect(ctx, 0.84, 0.905, Math.PI - 0.2, Math.PI - 0.001, 8);
    rrect(ctx, 0.84, 0.905, -Math.PI + 0.001, -Math.PI + 0.2, 8);
  }
  // Static ports and AOA sensor bases near the nose
  for (const side of [1, -1]) {
    for (const [t, th] of [
      [0.88, 1.62],
      [0.873, 1.62],
    ]) {
      c.strokeStyle = "rgba(80,82,86,0.9)";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(x(side * th), y(t), 7, 5, 0, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "rgba(20,20,22,0.9)";
      c.beginPath();
      c.arc(x(side * th), y(t), 1.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  // Safety stencils
  stencil("EMERGENCY EXIT", exitWin ? exitWin.t : 0.6, (exitWin ? exitWin.theta : 1.32) - 0.46, 0.028, "rgba(170,40,34,0.9)");
  stencil("PULL TO OPEN", 0.808, -0.66, 0.018, "rgba(60,62,68,0.8)");
  stencil("RESCUE", 0.808, -2.02, 0.022, "rgba(170,40,34,0.85)");
  stencil("NO STEP", 0.2, 1.95, 0.018, "rgba(60,62,68,0.7)");
  stencil("NO STEP", 0.2, -1.95, 0.018, "rgba(60,62,68,0.7)");
  stencil("GROUND POWER", 0.25, 2.35, 0.016, "rgba(60,62,68,0.7)");
  stencil("STATIC PORT — KEEP CLEAR", 0.876, 1.78, 0.012, "rgba(60,62,68,0.75)", 500);
  stencil("STATIC PORT — KEEP CLEAR", 0.876, -1.78, 0.012, "rgba(60,62,68,0.75)", 500);

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

/** Engine spinner: gloss black with the white spiral that shows the fan is turning. */
export function paintSpinner() {
  const S = 512;
  const [cc, c] = canvas(S, S);
  c.fillStyle = "#101114";
  c.fillRect(0, 0, S, S);
  // Lathe uv: u around the axis, v from tip (0) to base (1)
  c.strokeStyle = "#f4f2ee";
  c.lineWidth = 34;
  c.lineCap = "round";
  c.beginPath();
  for (let i = 0; i <= 60; i++) {
    const v = i / 60;
    const u = 0.1 + v * 0.55;
    const px = u * S;
    const py = (1 - (0.08 + v * 0.85)) * S;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.stroke();
  return texture(cc, true);
}

/** Large, soft blotches of slightly varied gloss so reflections never look perfectly uniform. */
export function roughnessVariation() {
  const S = 512;
  const [cc, c] = canvas(S, S);
  c.fillStyle = "rgb(200,200,200)";
  c.fillRect(0, 0, S, S);
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const px = rand() * S;
    const py = rand() * S;
    const r = 30 + rand() * 120;
    const v = Math.round(170 + rand() * 85);
    for (const [ox, oy] of [
      [0, 0],
      [S, 0],
      [-S, 0],
      [0, S],
      [0, -S],
    ]) {
      const g = c.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      c.fillStyle = g;
      c.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  const t = texture(cc, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Wing upper-surface markings: walkway outline, NO STEP stencils, fuel filler,
 * and faint flow grime behind the spoilers.
 */
export function paintWingColor(mainStations: number, totalStations: number) {
  const S = 2048;
  const [cc, c] = canvas(S, S);
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, S, S);
  const sSpan = (s: number) => (s * mainStations) / totalStations;
  const px = (xc: number, upper = true) => loopU(xc, upper) * S;
  const py = (s: number) => (1 - sSpan(s)) * S;

  // Flow grime streaking aft from the spoiler hinge
  let seed = 17;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const s0 = 0.18 + rand() * 0.45;
    c.strokeStyle = `rgba(120,116,110,${0.04 + rand() * 0.06})`;
    c.lineWidth = 1 + rand() * 3;
    c.beginPath();
    c.moveTo(px(0.62), py(s0));
    c.lineTo(px(0.98), py(s0 + (rand() - 0.5) * 0.01));
    c.stroke();
  }

  // Walkway: outlined area near the root with its label
  c.strokeStyle = "rgba(55,57,62,0.85)";
  c.lineWidth = 4;
  const walk = [
    [0.18, 0.02],
    [0.55, 0.02],
    [0.55, 0.13],
    [0.18, 0.13],
  ];
  c.beginPath();
  walk.forEach(([xc, s], i) => (i ? c.lineTo(px(xc), py(s)) : c.moveTo(px(xc), py(s))));
  c.closePath();
  c.stroke();

  const label = (text: string, xc: number, s: number, size: number, color: string) => {
    c.save();
    c.translate(px(xc), py(s));
    // text runs spanwise (canvas y), reading from the fuselage outward; the wing's
    // texture space is mirrored relative to the upper skin, so flip to read correctly
    c.rotate(-Math.PI / 2);
    c.scale(-1, 1);
    c.fillStyle = color;
    c.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 0, 0);
    c.restore();
  };
  label("WALKWAY", 0.36, 0.075, 30, "rgba(55,57,62,0.85)");
  for (const s of [0.24, 0.42, 0.58]) label("NO STEP", 0.68, s, 22, "rgba(55,57,62,0.7)");
  label("NO STEP", 0.7, 0.8, 20, "rgba(55,57,62,0.7)");

  // Fuel filler cap with its red warning ring
  const fx = px(0.42);
  const fy = py(0.74);
  c.strokeStyle = "rgba(170,40,34,0.9)";
  c.lineWidth = 5;
  c.beginPath();
  c.ellipse(fx, fy, 16, 22, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "rgba(150,152,156,1)";
  c.beginPath();
  c.ellipse(fx, fy, 9, 13, 0, 0, Math.PI * 2);
  c.fill();
  label("FUEL", 0.47, 0.74, 16, "rgba(170,40,34,0.9)");

  return texture(cc, true);
}
