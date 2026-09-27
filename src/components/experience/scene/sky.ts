import * as THREE from "three";

export type SkyPalette = {
  top: THREE.Color;
  mid: THREE.Color;
  horizon: THREE.Color;
  bottom: THREE.Color;
  sun: THREE.Color;
  stars: number;
};

export const palette = (
  top: string,
  mid: string,
  horizon: string,
  bottom: string,
  sun: string,
  stars = 0,
): SkyPalette => ({
  top: new THREE.Color(top),
  mid: new THREE.Color(mid),
  horizon: new THREE.Color(horizon),
  bottom: new THREE.Color(bottom),
  sun: new THREE.Color(sun),
  stars,
});

export const SUN_DIR = new THREE.Vector3(1, 0.055, -0.62).normalize();

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // pin to far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col;
    if (h > 0.0) {
      col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, pow(h, 0.8)));
      col = mix(col, uTop, smoothstep(0.18, 0.95, h));
    } else {
      col = mix(uHorizon, uBottom, smoothstep(0.0, 0.18, -h));
    }

    float s = max(dot(d, uSunDir), 0.0);
    col += uSun * (pow(s, 1400.0) * 6.0 + pow(s, 90.0) * 0.45 + pow(s, 9.0) * 0.28 + pow(s, 2.5) * 0.08);
    // warm haze band along the horizon, strongest toward the sun
    col += uSun * 0.12 * exp(-abs(h) * 22.0) * (0.35 + 0.65 * pow(s, 2.0));

    if (uStars > 0.0 && h > 0.0) {
      // Round, sub-cell stars: brightness falls off from a jittered point in each cell
      vec3 grid = d * 900.0;
      vec3 cell = floor(grid);
      float present = step(0.9965, hash(cell));
      vec3 centre = cell + 0.5 + (vec3(hash(cell + 1.7), hash(cell + 4.2), hash(cell + 8.9)) - 0.5) * 0.5;
      float core = smoothstep(0.42, 0.0, length(grid - centre));
      float twinkle = 0.65 + 0.35 * sin(uTime * 1.7 + hash(cell + 3.1) * 40.0);
      float mag = 0.35 + 0.65 * hash(cell + 11.3);
      col += vec3(0.9, 0.95, 1.0) * present * core * mag * twinkle * uStars * smoothstep(0.02, 0.4, h) * 1.6;
    }

    // subtle dithering to kill gradient banding
    col += (hash(vec3(gl_FragCoord.xy, uTime)) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(initial: SkyPalette) {
  const uniforms = {
    uTop: { value: initial.top.clone() },
    uMid: { value: initial.mid.clone() },
    uHorizon: { value: initial.horizon.clone() },
    uBottom: { value: initial.bottom.clone() },
    uSun: { value: initial.sun.clone() },
    uSunDir: { value: SUN_DIR.clone() },
    uStars: { value: initial.stars },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  const set = (p: SkyPalette) => {
    uniforms.uTop.value.copy(p.top);
    uniforms.uMid.value.copy(p.mid);
    uniforms.uHorizon.value.copy(p.horizon);
    uniforms.uBottom.value.copy(p.bottom);
    uniforms.uSun.value.copy(p.sun);
    uniforms.uStars.value = p.stars;
  };

  return { mesh, uniforms, set };
}

export function lerpPalette(a: SkyPalette, b: SkyPalette, t: number, out: SkyPalette) {
  out.top.lerpColors(a.top, b.top, t);
  out.mid.lerpColors(a.mid, b.mid, t);
  out.horizon.lerpColors(a.horizon, b.horizon, t);
  out.bottom.lerpColors(a.bottom, b.bottom, t);
  out.sun.lerpColors(a.sun, b.sun, t);
  out.stars = a.stars + (b.stars - a.stars) * t;
  return out;
}
