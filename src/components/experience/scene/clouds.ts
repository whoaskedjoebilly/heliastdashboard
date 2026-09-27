import * as THREE from "three";

/** Seeded PRNG so the cloudscape is identical on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paints a soft cumulus puff: many overlapping radial gradients, lit from above. */
function cloudTexture(seed: number) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(seed);
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.pow(rand(), 0.7) * size * 0.26;
    const x = size / 2 + Math.cos(a) * d * 1.25;
    const y = size / 2 + Math.sin(a) * d * 0.6;
    const r = size * (0.08 + rand() * 0.14);
    const shade = 255 - Math.max(0, (y - size / 2) / (size * 0.3)) * 55;
    const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
    g.addColorStop(0, `rgba(${shade},${shade},${shade},0.34)`);
    g.addColorStop(0.55, `rgba(${shade},${shade},${shade},0.14)`);
    g.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Puff = { sprite: THREE.Sprite; speed: number };

export function createClouds() {
  const group = new THREE.Group();
  const textures = [11, 23, 37, 51].map(cloudTexture);
  const materials = textures.map(
    (map) =>
      new THREE.SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        fog: true,
        color: 0xffffff,
      }),
  );
  const rand = mulberry32(7);
  const puffs: Puff[] = [];
  const RANGE_X = 140;

  const spawn = (count: number, y: [number, number], z: [number, number], scale: [number, number], opacity: number) => {
    for (let i = 0; i < count; i++) {
      const mat = materials[Math.floor(rand() * materials.length)].clone();
      mat.opacity = opacity * (0.6 + rand() * 0.4);
      const s = new THREE.Sprite(mat);
      const sc = scale[0] + rand() * (scale[1] - scale[0]);
      s.scale.set(sc * 1.8, sc, 1);
      s.position.set(
        (rand() - 0.5) * RANGE_X,
        y[0] + rand() * (y[1] - y[0]),
        z[0] + rand() * (z[1] - z[0]),
      );
      s.material.rotation = (rand() - 0.5) * 0.15;
      group.add(s);
      puffs.push({ sprite: s, speed: 0.8 + rand() * 0.4 });
    }
  };

  // Dense deck below the aircraft
  spawn(170, [-10, -6.5], [-70, 40], [7, 16], 0.95);
  // Wisps near flight level for parallax
  spawn(22, [-3.5, 3], [-40, -12], [4, 9], 0.35);
  // Distant towering bank on the horizon
  spawn(40, [-6, 6], [-200, -120], [26, 48], 0.8);

  const tint = new THREE.Color();

  const update = (dt: number, speed: number, light: THREE.Color, shadow: THREE.Color) => {
    for (const p of puffs) {
      p.sprite.position.x -= dt * speed * p.speed;
      if (p.sprite.position.x < -RANGE_X / 2) p.sprite.position.x += RANGE_X;
      // Lower puffs sit in shadow; blend toward the shadow tone
      const k = THREE.MathUtils.clamp((p.sprite.position.y + 10) / 16, 0, 1);
      tint.lerpColors(shadow, light, 0.55 + 0.45 * k);
      (p.sprite.material as THREE.SpriteMaterial).color.copy(tint);
    }
  };

  const dispose = () => {
    textures.forEach((t) => t.dispose());
    puffs.forEach((p) => (p.sprite.material as THREE.Material).dispose());
    materials.forEach((m) => m.dispose());
  };

  return { group, update, dispose };
}
