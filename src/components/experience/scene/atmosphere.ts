import * as THREE from "three";
import { createCloudNoise } from "./noise3d";

/**
 * Physically based sky (Preetham scattering, as in three's Sky) plus a raymarched
 * volumetric cumulus deck far below flight level, stars and a moon.
 * Rendered into a half-resolution HDR target and used as the scene background, and
 * captured into a cube map for the aircraft's reflections.
 */

export type AtmosphereState = {
  sunElevation: number; // degrees
  sunAzimuth: number; // degrees, 0 = +X, 90 = -Z
  turbidity: number;
  rayleigh: number;
  coverage: number;
};

export const sunDirection = (elevationDeg: number, azimuthDeg: number, target = new THREE.Vector3()) => {
  const e = THREE.MathUtils.degToRad(elevationDeg);
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  return target.set(Math.cos(e) * Math.cos(a), Math.sin(e), -Math.cos(e) * Math.sin(a));
};

export const MOON_DIR = sunDirection(22, 48);

export const CLOUD_BASE = -150;
export const CLOUD_TOP = -68;

const vertexShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uRayleigh;
  uniform float uTurbidity;
  uniform float uMie;

  varying vec3 vWorldPosition;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;

  const float e = 2.718281828459045;
  const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
  const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
  const float cutoffAngle = 1.6110731556870734;
  const float steepness = 1.5;
  const float EE = 1000.0;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    gl_Position.z = gl_Position.w;

    float zc = clamp(uSunDir.y, -1.0, 1.0);
    vSunE = EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zc)) / steepness)));
    vBetaR = totalRayleigh * uRayleigh;
    float c = (0.2 * uTurbidity) * 10E-18;
    vBetaM = 0.434 * c * MieConst * uMie;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uNight;
  uniform float uTime;
  uniform float uGain;
  uniform float uCoverage;
  uniform vec3 uWind;
  uniform sampler3D uNoise;
  uniform float uSteps;

  varying vec3 vWorldPosition;
  varying vec3 vBetaR;
  varying vec3 vBetaM;
  varying float vSunE;

  const float PI = 3.141592653589793;
  const float rayleighZenithLength = 8.4E3;
  const float mieZenithLength = 1.25E3;
  const float sunAngularDiameterCos = 0.99995;
  const float CLOUD_BASE = ${CLOUD_BASE.toFixed(1)};
  const float CLOUD_TOP = ${CLOUD_TOP.toFixed(1)};

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 extinction(vec3 dir) {
    float zenithAngle = acos(max(0.0, dir.y));
    float inv = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / PI), -1.253));
    return exp(-(vBetaR * rayleighZenithLength * inv + vBetaM * mieZenithLength * inv));
  }

  float hg(float c, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
  }

  /** Ozone transmittance of sunlight: keeps the zenith blue through golden hour and twilight. */
  vec3 ozone() {
    float za = acos(clamp(uSunDir.y, 0.0, 1.0));
    float inv = 1.0 / (cos(za) + 0.15 * pow(93.885 - ((za * 180.0) / PI), -1.253));
    return exp(-vec3(3.0e-6, 5.5e-6, 0.2e-6) * rayleighZenithLength * inv);
  }

  /** Preetham sky radiance (already scaled into display range). */
  vec3 sky(vec3 dir, bool disc) {
    vec3 Fex = extinction(dir);
    float cosTheta = dot(dir, uSunDir);
    float rPhase = (3.0 / (16.0 * PI)) * (1.0 + pow(cosTheta * 0.5 + 0.5, 2.0));
    vec3 betaRTheta = vBetaR * rPhase;
    vec3 betaMTheta = vBetaM * hg(cosTheta, 0.78);
    vec3 scatter = vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM));
    vec3 Lin = pow(scatter * (1.0 - Fex), vec3(1.5));
    Lin *= mix(vec3(1.0), pow(scatter * Fex, vec3(0.5)), clamp(pow(1.0 - uSunDir.y, 5.0), 0.0, 1.0));
    Lin *= ozone();
    vec3 L0 = vec3(0.1) * Fex;
    vec3 col = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);

    if (disc) {
      float sd = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
      // Kept well inside half-float range so it stays a clean, white-hot disc
      col += sd * 90.0 * Fex * ozone() * step(-0.01, uSunDir.y);
    }

    // Night: deep blue base, stars and a moon
    if (uNight > 0.0) {
      float h = max(dir.y, 0.0);
      vec3 nightSky = mix(vec3(0.012, 0.018, 0.035), vec3(0.002, 0.004, 0.012), pow(h, 0.5));
      col += nightSky * uNight;
      if (disc && dir.y > 0.0) {
        vec3 grid = dir * 700.0;
        vec3 cell = floor(grid);
        float present = step(0.9955, hash13(cell));
        vec3 centre = cell + 0.5 + (vec3(hash13(cell + 1.7), hash13(cell + 4.2), hash13(cell + 8.9)) - 0.5) * 0.6;
        float core = smoothstep(0.45, 0.0, length(grid - centre));
        float mag = pow(hash13(cell + 11.3), 3.0);
        float tw = 0.7 + 0.3 * sin(uTime * 1.6 + hash13(cell + 3.1) * 50.0);
        col += vec3(0.85, 0.92, 1.0) * present * core * (0.15 + 1.2 * mag) * tw * uNight * smoothstep(0.0, 0.25, h);
        float cm = dot(dir, uMoonDir);
        col += vec3(0.9, 0.93, 1.0) * smoothstep(0.99986, 0.99990, cm) * 1.8 * uNight;
        col += vec3(0.35, 0.42, 0.6) * (pow(max(cm, 0.0), 300.0) * 0.12 + pow(max(cm, 0.0), 12.0) * 0.02) * uNight;
      }
    }
    return col;
  }

  float remap(float v, float a, float b, float c, float d) {
    return c + (v - a) / (b - a) * (d - c);
  }

  float density(vec3 p, bool detail) {
    float h = (p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
    if (h <= 0.0 || h >= 1.0) return 0.0;
    vec3 q = p + uWind;
    // weather map: where the cells are and how tall they grow
    vec2 wm = texture(uNoise, vec3(q.xz * 0.0011, 0.31)).rg;
    float cov = clamp(uCoverage + (wm.r - 0.5) * 1.3, 0.0, 1.0);
    float tallness = mix(0.45, 1.0, wm.g);
    float grad = smoothstep(0.0, 0.07, h) * smoothstep(tallness, tallness * 0.35, h);
    float shape = texture(uNoise, q * 0.0048).r;
    float base = remap(shape * grad, 1.0 - cov, 1.0, 0.0, 1.0);
    if (base <= 0.0) return 0.0;
    if (!detail) return base;
    vec3 dq = q * 0.022 + vec3(0.0, -uTime * 0.02, 0.0);
    float d = texture(uNoise, dq).g;
    float erode = mix(d, 1.0 - d, clamp(h * 4.0, 0.0, 1.0)) * 0.42;
    return clamp(remap(base, erode, 1.0, 0.0, 1.0), 0.0, 1.0);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPosition - cameraPosition);

    vec3 bg = sky(rd, true);
    vec3 horizonDir = normalize(vec3(rd.x, 0.0, rd.z) + vec3(0.0001));
    vec3 haze = sky(normalize(horizonDir + vec3(0.0, 0.02, 0.0)), false);

    if (rd.y >= -0.0005) {
      gl_FragColor = vec4(bg * uGain, 1.0);
      return;
    }

    // Below the horizon: we are always above the cloud deck
    float tTop = (CLOUD_TOP - ro.y) / rd.y;
    float tBase = (CLOUD_BASE - ro.y) / rd.y;
    float marchLen = min(tBase - tTop, 900.0);
    float steps = uSteps;
    float stepLen = marchLen / steps;
    float jitter = hash12(gl_FragCoord.xy);
    float t = tTop + stepLen * jitter;

    // Lighting terms
    bool night = uNight > 0.5;
    vec3 lightDir = night ? uMoonDir : uSunDir;
    vec3 sunLight = vSunE * extinction(uSunDir) * ozone() * 0.04 * 0.55 * step(-0.02, uSunDir.y);
    vec3 moonLight = vec3(0.05, 0.065, 0.1) * uNight;
    vec3 lightCol = night ? moonLight : sunLight;
    vec3 ambTop = sky(vec3(0.0, 1.0, 0.0), false) * 1.1 + vec3(0.004, 0.006, 0.012) * uNight;
    vec3 ambBot = haze * 0.55;
    float cosT = dot(rd, lightDir);
    float phase = mix(hg(cosT, 0.55), hg(cosT, -0.2), 0.4) * 4.0 * PI;

    vec3 scat = vec3(0.0);
    float T = 1.0;
    float sigma = 0.16;
    float firstHit = -1.0;

    for (int i = 0; i < 64; i++) {
      if (float(i) >= steps || T < 0.02) break;
      vec3 p = ro + rd * t;
      float dCheap = density(p, false);
      if (dCheap > 0.0) {
        float d = density(p, true);
        if (d > 0.001) {
          if (firstHit < 0.0) firstHit = t;
          // light march toward the sun
          float od = 0.0;
          float ls = 5.0;
          vec3 lp = p;
          for (int j = 0; j < 4; j++) {
            lp += lightDir * ls;
            od += density(lp, false) * ls;
            ls *= 1.8;
          }
          float h = clamp((p.y - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE), 0.0, 1.0);
          float beer = exp(-od * sigma * 0.9) + 0.25 * exp(-od * sigma * 0.2);
          float powder = 1.0 - exp(-d * 12.0);
          vec3 direct = lightCol * beer * mix(1.0, powder, 0.6) * phase;
          vec3 amb = mix(ambBot, ambTop, pow(h, 0.7));
          // Energy-conserving step integration (albedo ~1): radiance approaches the light it scatters
          float dT = exp(-d * sigma * stepLen);
          scat += T * (direct + amb) * (1.0 - dT);
          T *= dT;
        }
      }
      t += stepLen;
    }

    // Whatever lies beneath the deck: dim, hazy
    vec3 below = mix(vec3(0.004, 0.012, 0.028), haze * 0.25, 0.5);
    vec3 col = scat + T * below;

    // Aerial perspective: distant cloud tops dissolve into the horizon haze
    float dist = firstHit > 0.0 ? firstHit : tTop;
    float fog = 1.0 - exp(-dist * 0.00042);
    col = mix(col, haze, clamp(fog, 0.0, 1.0));
    // Melt seamlessly into the sky right at the horizon
    col = mix(col, bg, smoothstep(-0.02, 0.0, rd.y));

    gl_FragColor = vec4(col * uGain, 1.0);
  }
`;

export function createAtmosphere() {
  const noise = createCloudNoise();
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() },
    uMoonDir: { value: MOON_DIR.clone() },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uGain: { value: 0.32 },
    uCoverage: { value: 0.45 },
    uWind: { value: new THREE.Vector3() },
    uNoise: { value: noise },
    uSteps: { value: 48 },
    uRayleigh: { value: 1.5 },
    uTurbidity: { value: 4 },
    uMie: { value: 0.005 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), material);
  dome.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(dome);

  const set = (s: AtmosphereState) => {
    sunDirection(s.sunElevation, s.sunAzimuth, uniforms.uSunDir.value);
    uniforms.uTurbidity.value = s.turbidity;
    uniforms.uRayleigh.value = s.rayleigh;
    uniforms.uCoverage.value = s.coverage;
    uniforms.uNight.value = THREE.MathUtils.smoothstep(-s.sunElevation, 0.5, 7);
  };

  const dispose = () => {
    noise.dispose();
    material.dispose();
    dome.geometry.dispose();
  };

  return { scene, dome, uniforms, set, dispose };
}

/** Approximate direct sunlight colour/intensity for lighting the aircraft. */
export function sunlight(elevationDeg: number, out: THREE.Color) {
  const e = THREE.MathUtils.clamp(elevationDeg, -10, 60);
  const warm = new THREE.Color(1.0, 0.55, 0.28);
  const noon = new THREE.Color(1.0, 0.96, 0.9);
  out.copy(warm).lerp(noon, THREE.MathUtils.smoothstep(e, 0, 28));
  const intensity = e < -1 ? 0 : THREE.MathUtils.smoothstep(e, -1, 6);
  return intensity;
}
