import * as THREE from "three";

/**
 * Tileable 3D noise volume for the volumetric clouds.
 *   R: Perlin-Worley (billowy cumulus base shapes)
 *   G: Worley fBm at higher frequency (edge erosion detail)
 * Built once on the CPU; ~64³ voxels keeps it quick while the preloader runs.
 */

const SIZE = 64;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Feature points for a periodic Worley grid with `cells` cells per axis. */
function worleyPoints(cells: number, rand: () => number) {
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < cells * cells * cells; i++) {
    pts[i * 3] = rand();
    pts[i * 3 + 1] = rand();
    pts[i * 3 + 2] = rand();
  }
  return pts;
}

function worley(x: number, y: number, z: number, cells: number, pts: Float32Array) {
  // x,y,z in [0,1)
  const px = x * cells;
  const py = y * cells;
  const pz = z * cells;
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const cz = Math.floor(pz);
  let min = 1e9;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ix = cx + dx;
        const iy = cy + dy;
        const iz = cz + dz;
        const wx = ((ix % cells) + cells) % cells;
        const wy = ((iy % cells) + cells) % cells;
        const wz = ((iz % cells) + cells) % cells;
        const k = (wz * cells * cells + wy * cells + wx) * 3;
        const fx = ix + pts[k] - px;
        const fy = iy + pts[k + 1] - py;
        const fz = iz + pts[k + 2] - pz;
        const d = fx * fx + fy * fy + fz * fz;
        if (d < min) min = d;
      }
    }
  }
  return 1 - Math.min(1, Math.sqrt(min));
}

/** Periodic gradient (Perlin) noise. */
function makePerlin(rand: () => number) {
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h: number, x: number, y: number, z: number) => {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
    return ((g & 1) === 0 ? u : -u) + ((g & 2) === 0 ? v : -v);
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number, z: number, period: number) => {
    const X = Math.floor(x);
    const Y = Math.floor(y);
    const Z = Math.floor(z);
    const xf = x - X;
    const yf = y - Y;
    const zf = z - Z;
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const h = (i: number, j: number, k: number) =>
      perm[perm[perm[((X + i) % period) & 255] + (((Y + j) % period) & 255)] + (((Z + k) % period) & 255)];
    const lerp = THREE.MathUtils.lerp;
    return lerp(
      lerp(
        lerp(grad(h(0, 0, 0), xf, yf, zf), grad(h(1, 0, 0), xf - 1, yf, zf), u),
        lerp(grad(h(0, 1, 0), xf, yf - 1, zf), grad(h(1, 1, 0), xf - 1, yf - 1, zf), u),
        v,
      ),
      lerp(
        lerp(grad(h(0, 0, 1), xf, yf, zf - 1), grad(h(1, 0, 1), xf - 1, yf, zf - 1), u),
        lerp(grad(h(0, 1, 1), xf, yf - 1, zf - 1), grad(h(1, 1, 1), xf - 1, yf - 1, zf - 1), u),
        v,
      ),
      w,
    );
  };
}

const remap = (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a)) * (d - c);

export function createCloudNoise() {
  const rand = mulberry32(1337);
  const perlin = makePerlin(rand);
  const w4 = worleyPoints(4, rand);
  const w8 = worleyPoints(8, rand);
  const w16 = worleyPoints(16, rand);
  const w32 = worleyPoints(32, rand);

  const data = new Uint8Array(SIZE * SIZE * SIZE * 2);
  let o = 0;
  for (let z = 0; z < SIZE; z++) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const nx = x / SIZE;
        const ny = y / SIZE;
        const nz = z / SIZE;
        // Perlin fBm, periodic
        let pf = 0;
        let amp = 1;
        let norm = 0;
        for (let oct = 0, per = 4; oct < 3; oct++, per *= 2) {
          pf += amp * perlin(nx * per, ny * per, nz * per, per);
          norm += amp;
          amp *= 0.5;
        }
        pf = pf / norm * 0.5 + 0.5;
        const wA = worley(nx, ny, nz, 4, w4);
        const wB = worley(nx, ny, nz, 8, w8);
        const wC = worley(nx, ny, nz, 16, w16);
        const wf = wA * 0.625 + wB * 0.25 + wC * 0.125;
        const pw = THREE.MathUtils.clamp(remap(pf, wf - 1, 1, 0, 1), 0, 1);
        const detail = wB * 0.5 + wC * 0.3 + worley(nx, ny, nz, 32, w32) * 0.2;
        data[o++] = Math.round(pw * 255);
        data[o++] = Math.round(detail * 255);
      }
    }
  }

  const tex = new THREE.Data3DTexture(data, SIZE, SIZE, SIZE);
  tex.format = THREE.RGFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
