import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createAtmosphere, sunDirection, sunlight, MOON_DIR, type AtmosphereState } from "./atmosphere";
import { createJet } from "./jet";
import { SHOTS, type Shot } from "./shots";

const damp = (current: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const lerpAtmo = (a: AtmosphereState, b: AtmosphereState, t: number, out: AtmosphereState) => {
  out.sunElevation = THREE.MathUtils.lerp(a.sunElevation, b.sunElevation, t);
  out.sunAzimuth = THREE.MathUtils.lerp(a.sunAzimuth, b.sunAzimuth, t);
  out.turbidity = THREE.MathUtils.lerp(a.turbidity, b.turbidity, t);
  out.rayleigh = THREE.MathUtils.lerp(a.rayleigh, b.rayleigh, t);
  out.coverage = THREE.MathUtils.lerp(a.coverage, b.coverage, t);
  return out;
};

export type JetSceneOptions = {
  reducedMotion: boolean;
};

type ViewState = {
  camera: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  jetPos: THREE.Vector3;
  jetRot: THREE.Quaternion;
  atmo: AtmosphereState;
  fov: number;
  shiftX: number;
  shiftY: number;
  exposure: number;
  cloudSpeed: number;
  interior: number;
};

const viewState = (): ViewState => ({
  camera: new THREE.Vector3(),
  target: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  jetPos: new THREE.Vector3(),
  jetRot: new THREE.Quaternion(),
  atmo: { ...SHOTS[0].atmosphere },
  fov: 30,
  shiftX: 0,
  shiftY: 0,
  exposure: 1,
  cloudSpeed: 30,
  interior: 0,
});

/**
 * Owns the WebGL renderer and everything in the world. The page only feeds it a
 * continuous "chapter" value (0 = hero, 1 = next chapter, 1.5 = halfway between…).
 */
export class JetScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
  private jet = createJet();
  private jetRig = new THREE.Group();
  private atmosphere = createAtmosphere();
  private skyTarget: THREE.WebGLRenderTarget;
  private composer: EffectComposer;
  private ao: GTAOPass;
  private bloom: UnrealBloomPass;
  private cubeTarget = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
  private cubeCamera: THREE.CubeCamera;
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envDirty = true;
  private envCooldown = 0;
  private lastEnvKey = "";
  private key = new THREE.DirectionalLight(0xffffff, 3);
  private sun = new THREE.DirectionalLight(0xffffff, 0);
  /** Bounce light: sky from above, sunlit cloud deck from below. */
  private bounce = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.9);
  private frameTimes = 0;
  private frameCount = 0;
  /** Index into TIERS. Everyone starts on medium; fast machines are promoted to high. */
  private quality = 2;
  private downgraded = false;
  private fastWindows = 0;
  private timer = new THREE.Timer();
  private raf = 0;
  private width = 1;
  private height = 1;
  private reducedMotion: boolean;

  private chapterTarget = 0;
  private chapter = 0;
  private intro = 0;
  private introStarted = false;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();

  private goal = viewState();
  private cur = viewState();
  private tmpVec = new THREE.Vector3();
  private tmpVec2 = new THREE.Vector3();
  private tmpVec3 = new THREE.Vector3();
  private tmpColor = new THREE.Color();
  private moonColor = new THREE.Color(0.55, 0.65, 0.9);

  constructor(canvas: HTMLCanvasElement, opts: JetSceneOptions) {
    this.reducedMotion = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // The key light rides with the aircraft, so its shadows never change relative to it:
    // draw the shadow map once and reuse it instead of re-rendering it every frame
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;

    this.skyTarget = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.scene.background = this.skyTarget.texture;

    // Post: MSAA HDR buffer → ambient occlusion → lens bloom → tone map
    this.composer = new EffectComposer(
      this.renderer,
      new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 2 }),
    );
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new GTAOPass(this.scene, this.camera, 2, 2);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 2, thickness: 1.2, scale: 1.1, samples: 8 });
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.12, 0.35, 6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.cubeCamera = new THREE.CubeCamera(1, 1000, this.cubeTarget);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    // Key light: a flattering front-quarter light that takes the sun's colour
    this.key.position.set(5, 6, 11);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 3;
    const sc = this.key.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 1;
    sc.far = 40;
    this.jetRig.add(this.key, this.key.target);
    // Rim light from the true sun (or moon) direction
    this.scene.add(this.sun, this.sun.target, this.bounce);

    this.jetRig.add(this.jet.group);
    this.scene.add(this.jetRig);

    this.applyShot(0, 0);
    this.snap();
  }

  private applyShot(from: number, t: number) {
    const a: Shot = SHOTS[Math.max(0, Math.min(SHOTS.length - 1, from))];
    const b: Shot = SHOTS[Math.max(0, Math.min(SHOTS.length - 1, from + 1))];
    const g = this.goal;
    const mobile = this.width / this.height < 0.85;
    if (b.via) {
      // Quadratic Bézier: leaves along a → via, arrives at b
      const u = 1 - t;
      g.camera
        .copy(a.camera)
        .multiplyScalar(u * u)
        .addScaledVector(b.via, 2 * u * t)
        .addScaledVector(b.camera, t * t);
    } else g.camera.lerpVectors(a.camera, b.camera, t);
    g.interior = THREE.MathUtils.lerp(a.interior ?? 0, b.interior ?? 0, t);
    g.target.lerpVectors(a.target, b.target, t);
    g.up.lerpVectors(a.up, b.up, t).normalize();
    g.jetPos.lerpVectors(a.jetPosition, b.jetPosition, t);
    g.jetRot.slerpQuaternions(a.jetRotation, b.jetRotation, t);
    lerpAtmo(a.atmosphere, b.atmosphere, t, g.atmo);
    g.fov = THREE.MathUtils.lerp(a.fov, b.fov, t);
    g.shiftX = mobile ? 0 : THREE.MathUtils.lerp(a.shiftX, b.shiftX, t);
    g.shiftY = THREE.MathUtils.lerp(a.shiftY, b.shiftY, t) + (mobile ? 0.12 : 0);
    g.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);
    g.cloudSpeed = THREE.MathUtils.lerp(a.cloudSpeed, b.cloudSpeed, t);
  }

  private snap() {
    const g = this.goal;
    const c = this.cur;
    c.camera.copy(g.camera);
    c.target.copy(g.target);
    c.up.copy(g.up);
    c.jetPos.copy(g.jetPos);
    c.jetRot.copy(g.jetRot);
    Object.assign(c.atmo, g.atmo);
    c.fov = g.fov;
    c.shiftX = g.shiftX;
    c.shiftY = g.shiftY;
    c.exposure = g.exposure;
    c.cloudSpeed = g.cloudSpeed;
    c.interior = g.interior;
  }

  setChapter(value: number) {
    this.chapterTarget = value;
  }

  setPointer(x: number, y: number) {
    this.pointer.set(x, y);
  }

  /** Renders a frame synchronously so shaders are compiled before the reveal. */
  warmup() {
    this.renderer.compile(this.scene, this.camera);
    this.frame(0);
  }

  startIntro() {
    this.introStarted = true;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.applyQuality();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Render settings per quality tier. Resolution is the dominant cost on high-density
   * screens, so pixel ratio is capped well below the device's; clouds are soft, so their
   * pass runs at a fraction of screen resolution.
   */
  private static TIERS = [
    // lowest: renders below native resolution as a last resort
    { dpr: 0.75, sky: 0.25, steps: 18, ao: false, bloom: false, shadow: 1024 },
    // low
    { dpr: 1, sky: 0.3, steps: 22, ao: false, bloom: false, shadow: 1024 },
    // medium
    { dpr: 1.25, sky: 0.36, steps: 28, ao: false, bloom: true, shadow: 2048 },
    // high
    { dpr: 1.5, sky: 0.42, steps: 34, ao: true, bloom: true, shadow: 2048 },
  ];

  private applyQuality() {
    const tier = JetScene.TIERS[this.quality];
    const w = this.width;
    const h = this.height;
    const dpr = Math.min(window.devicePixelRatio || 1, tier.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.skyTarget.setSize(Math.ceil(w * tier.sky), Math.ceil(h * tier.sky));
    this.atmosphere.uniforms.uSteps.value = tier.steps;
    this.ao.enabled = tier.ao;
    this.bloom.enabled = tier.bloom;
    if (this.key.shadow.mapSize.x !== tier.shadow) {
      this.key.shadow.mapSize.set(tier.shadow, tier.shadow);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Drops a quality tier as soon as frame time shows sustained lag. */
  private adaptQuality(dt: number) {
    // Ignore hitches (shader compiles, tab switches) — they are not steady-state cost
    if (dt > 0.25) return;
    this.frameTimes += dt;
    this.frameCount++;
    if (this.frameCount < 40) return;
    const avg = this.frameTimes / this.frameCount;
    this.frameTimes = 0;
    this.frameCount = 0;
    if (avg > 1 / 48 && this.quality > 0) {
      this.quality--;
      this.downgraded = true;
      this.applyQuality();
      return;
    }
    // Promote once to the top tier only after two consistently fast windows
    const top = JetScene.TIERS.length - 1;
    if (!this.downgraded && this.quality < top && avg < 1 / 58) {
      if (++this.fastWindows >= 2) {
        this.quality++;
        this.fastWindows = 0;
        this.applyQuality();
      }
    } else this.fastWindows = 0;
  }

  start() {
    this.timer.connect(document);
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update(now);
      const dt = this.timer.getDelta();
      this.adaptQuality(dt);
      this.frame(Math.min(dt, 1 / 20));
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Re-captures the sky into the reflection map when the light has changed enough to notice. */
  private updateEnvironment() {
    const a = this.cur.atmo;
    const key = `${a.sunElevation.toFixed(1)}|${a.sunAzimuth.toFixed(0)}|${a.turbidity.toFixed(1)}|${a.coverage.toFixed(2)}`;
    if (key !== this.lastEnvKey) this.envDirty = true;
    if (this.envCooldown > 0) this.envCooldown--;
    if (!this.envDirty || this.envCooldown > 0) return;
    this.lastEnvKey = key;
    this.envDirty = false;
    // Reflections change slowly; refreshing rarely avoids stutters while scrolling
    this.envCooldown = 45;

    const u = this.atmosphere.uniforms;
    const steps = u.uSteps.value;
    u.uSteps.value = 12;
    this.cubeCamera.position.copy(this.jetRig.position);
    this.atmosphere.dome.position.copy(this.jetRig.position);
    this.cubeCamera.update(this.renderer, this.atmosphere.scene);
    u.uSteps.value = steps;
    this.envTarget = this.pmrem.fromCubemap(this.cubeTarget.texture, this.envTarget);
    this.scene.environment = this.envTarget.texture;
  }

  private frame(dt: number) {
    const time = this.timer.getElapsed();
    const rm = this.reducedMotion;

    // Scroll smoothing — gives the cinematic, weighted feel
    this.chapter = rm ? this.chapterTarget : damp(this.chapter, this.chapterTarget, 3.2, dt);
    const i = Math.floor(this.chapter);
    const k = this.chapter - i;
    const eased = easeInOut(THREE.MathUtils.smoothstep(k, 0.12, 0.88));
    this.applyShot(i, eased);

    const g = this.goal;
    const c = this.cur;
    const lambda = rm ? 60 : 6;
    const f = 1 - Math.exp(-lambda * dt);
    const fSlow = 1 - Math.exp(-lambda * 0.6 * dt);
    // Near the cabin the camera follows its path exactly (the chapter value is already
    // smoothed) so it can never cut a corner through the fuselage
    const inside = Math.max(g.interior, c.interior) > 0.001;
    const fCam = inside ? 1 : f;
    c.interior = inside ? g.interior : damp(c.interior, g.interior, lambda, dt);
    c.camera.lerp(g.camera, fCam);
    c.target.lerp(g.target, fCam);
    c.up.lerp(g.up, f).normalize();
    c.jetPos.lerp(g.jetPos, fSlow);
    c.jetRot.slerp(g.jetRot, fSlow);
    lerpAtmo(c.atmo, g.atmo, f, c.atmo);
    c.fov = damp(c.fov, g.fov, lambda, dt);
    c.shiftX = damp(c.shiftX, g.shiftX, lambda, dt);
    c.shiftY = damp(c.shiftY, g.shiftY, lambda, dt);
    c.exposure = damp(c.exposure, g.exposure, lambda, dt);
    c.cloudSpeed = damp(c.cloudSpeed, g.cloudSpeed, 2, dt);

    // Intro glide: camera starts wide and low, eases into the hero framing
    if (this.introStarted && this.intro < 1) this.intro = Math.min(1, this.intro + dt / (rm ? 0.01 : 3.4));
    const introE = 1 - Math.pow(1 - this.intro, 4);

    // Aircraft: gentle float in the air mass
    this.jetRig.position.copy(c.jetPos);
    this.jetRig.quaternion.copy(c.jetRot);
    if (!rm) {
      this.jetRig.position.y += Math.sin(time * 0.55) * 0.06 + Math.sin(time * 1.3) * 0.015;
      this.jetRig.rotateX(Math.sin(time * 0.4) * 0.012);
      this.jetRig.rotateZ(Math.sin(time * 0.5 + 1) * 0.008);
    }
    this.jetRig.updateMatrixWorld();

    // Camera
    const inCabin = c.interior;
    const pull = (1 - introE) * (1 - inCabin);
    const aspect = this.width / this.height;
    const fitOut = aspect < 1 ? THREE.MathUtils.clamp(1.25 / aspect, 1, 2.3) : 1;
    const fit = THREE.MathUtils.lerp(fitOut, 1, inCabin);
    this.tmpVec.subVectors(c.camera, c.target).multiplyScalar(fit * (1 + pull * 0.9));
    this.tmpVec.y -= pull * 3.5;
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-2.5 * dt));
    const parallax = rm ? 0 : THREE.MathUtils.lerp(0.35, 0.025, inCabin);
    const camPos = this.tmpVec2.copy(c.target).add(this.tmpVec);
    const camTarget = this.tmpVec3.copy(c.target);
    if (inCabin > 0) {
      // Inside, the camera rides with the aircraft
      camPos.lerp(this.jetRig.localToWorld(camPos.clone()), inCabin);
      camTarget.lerp(this.jetRig.localToWorld(camTarget.clone()), inCabin);
    }
    this.camera.position.copy(camPos);
    this.camera.up.copy(c.up);
    this.camera.lookAt(camTarget);
    this.camera.translateX(this.pointerSmooth.x * parallax);
    this.camera.translateY(-this.pointerSmooth.y * parallax * 0.6);
    // Portrait screens widen the lens inside instead of backing through the wall
    this.camera.fov = c.fov * (aspect < 1 ? THREE.MathUtils.lerp(1, 1.45, inCabin) : 1);
    this.camera.near = THREE.MathUtils.lerp(0.1, 0.008, Math.min(1, inCabin * 4));
    const w = this.width;
    const h = this.height;
    this.camera.setViewOffset(w, h, -c.shiftX * w, c.shiftY * h, w, h);
    this.camera.updateProjectionMatrix();

    if (this.ao.enabled) this.ao.updateGtaoMaterial({ radius: THREE.MathUtils.lerp(0.45, 0.05, inCabin) });

    this.jet.update(time, dt);

    // Atmosphere
    const u = this.atmosphere.uniforms;
    this.atmosphere.set(c.atmo);
    u.uTime.value = time;
    if (!rm) u.uWind.value.x += dt * c.cloudSpeed;
    const night = u.uNight.value;
    this.jet.setNight(night);

    // Lighting follows the sky
    const sunAmount = sunlight(c.atmo.sunElevation, this.tmpColor);
    this.key.color.copy(this.tmpColor).lerp(this.moonColor, night);
    this.key.intensity = THREE.MathUtils.lerp(0.5, 5.0, sunAmount);
    if (night > 0.5) this.sun.position.copy(MOON_DIR);
    else sunDirection(c.atmo.sunElevation, c.atmo.sunAzimuth, this.sun.position);
    this.sun.position.multiplyScalar(30).add(this.jetRig.position);
    this.sun.target.position.copy(this.jetRig.position);
    this.sun.color.copy(this.tmpColor).lerp(this.moonColor, night);
    this.sun.intensity = sunAmount * 3.2 + night * 0.4;
    this.scene.environmentIntensity = THREE.MathUtils.lerp(1.0, 0.8, night);
    this.bounce.color.setRGB(0.55, 0.68, 0.95).multiplyScalar(0.5 + 0.5 * sunAmount);
    this.bounce.groundColor.copy(this.tmpColor).lerp(this.moonColor, night).multiplyScalar(0.25 + 0.75 * sunAmount);
    this.bounce.intensity = THREE.MathUtils.lerp(0.25, 1.1, sunAmount);
    // Unshadowed fills would light the cabin as if it had no walls: fade them inside
    const cabinDim = 1 - 0.85 * c.interior;
    this.bounce.intensity *= cabinDim;
    this.sun.intensity *= cabinDim;
    this.scene.environmentIntensity *= 1 - 0.35 * c.interior;
    this.renderer.toneMappingExposure = c.exposure;

    u.uJetInv.value.copy(this.jetRig.matrixWorld).invert();
    this.updateEnvironment();

    // Sky + clouds into the reduced-resolution background target, then the aircraft on top
    this.atmosphere.dome.position.copy(this.camera.position);
    this.renderer.setRenderTarget(this.skyTarget);
    this.renderer.render(this.atmosphere.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.composer.render(dt);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.timer.dispose();
    this.jet.dispose();
    this.atmosphere.dispose();
    this.skyTarget.dispose();
    this.composer.dispose();
    this.cubeTarget.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
