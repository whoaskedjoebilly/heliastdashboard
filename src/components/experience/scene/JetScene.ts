import * as THREE from "three";
import { createClouds } from "./clouds";
import { createJet } from "./jet";
import { SHOTS, type Shot } from "./shots";
import { createSky, lerpPalette, palette, SUN_DIR } from "./sky";

const damp = (current: number, target: number, lambda: number, dt: number) =>
  THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export type JetSceneOptions = {
  reducedMotion: boolean;
};

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
  private clouds = createClouds();
  private sky: ReturnType<typeof createSky>;
  private sun = new THREE.DirectionalLight(0xfff1e0, 3.2);
  private hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a3440, 0.6);
  private timer = new THREE.Timer();
  private raf = 0;
  private width = 1;
  private height = 1;
  private reducedMotion: boolean;

  /** Target chapter from scroll and the smoothed value actually rendered. */
  private chapterTarget = 0;
  private chapter = 0;
  /** 0 → 1 over the first seconds after reveal: camera glides in. */
  private intro = 0;
  private introStarted = false;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();

  private cur = {
    camera: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
    jetPos: new THREE.Vector3(),
    jetRot: new THREE.Quaternion(),
    sky: palette("#000", "#000", "#000", "#000", "#000"),
    fov: 30,
    shiftX: 0,
    shiftY: 0,
    exposure: 1,
    cloudSpeed: 14,
  };

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

    this.sky = createSky(SHOTS[0].sky);
    this.scene.add(this.sky.mesh);
    this.scene.fog = new THREE.Fog(0x9aa8b8, 40, 260);

    this.buildEnvironment();

    // Key light positioned for a flattering front-quarter read of the aircraft
    this.sun.position.set(6, 12, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const sc = this.sun.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 1;
    sc.far = 40;
    this.jetRig.add(this.sun, this.sun.target);

    // Warm rim from the actual sun direction
    const rim = new THREE.DirectionalLight(0xffb27a, 1.4);
    rim.position.copy(SUN_DIR).multiplyScalar(20);
    this.jetRig.add(rim);

    this.scene.add(this.hemi);
    this.jetRig.add(this.jet.group);
    this.scene.add(this.jetRig);
    this.scene.add(this.clouds.group);

    this.applyShot(0, 0);
    this.snap();
  }

  /** Image-based lighting: a blurred copy of the sunset sky plus soft studio cards. */
  private buildEnvironment() {
    const envScene = new THREE.Scene();
    const envSky = createSky(palette("#1b2c46", "#4d6d93", "#f0c9a0", "#4a4650", "#ffd6a3"));
    envScene.add(envSky.mesh);
    const card = (w: number, h: number, pos: THREE.Vector3, intensity: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }),
      );
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    // Long overhead softbox gives the fuselage its crisp highlight streak
    card(260, 40, new THREE.Vector3(0, 300, 60), 3.2);
    card(120, 60, new THREE.Vector3(200, 60, 240), 1.6);
    card(120, 60, new THREE.Vector3(-260, 40, 120), 0.9);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.9;
    pmrem.dispose();
  }

  private applyShot(from: number, t: number) {
    const a: Shot = SHOTS[Math.max(0, Math.min(SHOTS.length - 1, from))];
    const b: Shot = SHOTS[Math.max(0, Math.min(SHOTS.length - 1, from + 1))];
    const c = this.goal;
    const mobile = this.width / this.height < 0.85;
    c.camera.lerpVectors(a.camera, b.camera, t);
    c.target.lerpVectors(a.target, b.target, t);
    c.up.lerpVectors(a.up, b.up, t).normalize();
    c.jetPos.lerpVectors(a.jetPosition, b.jetPosition, t);
    c.jetRot.slerpQuaternions(a.jetRotation, b.jetRotation, t);
    lerpPalette(a.sky, b.sky, t, c.sky);
    c.fov = THREE.MathUtils.lerp(a.fov, b.fov, t);
    c.shiftX = mobile ? 0 : THREE.MathUtils.lerp(a.shiftX, b.shiftX, t);
    c.shiftY = THREE.MathUtils.lerp(a.shiftY, b.shiftY, t) + (mobile ? 0.12 : 0);
    c.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);
    c.cloudSpeed = THREE.MathUtils.lerp(a.cloudSpeed, b.cloudSpeed, t);
  }

  private goal = {
    camera: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
    jetPos: new THREE.Vector3(),
    jetRot: new THREE.Quaternion(),
    sky: palette("#000", "#000", "#000", "#000", "#000"),
    fov: 30,
    shiftX: 0,
    shiftY: 0,
    exposure: 1,
    cloudSpeed: 14,
  };

  private snap() {
    const g = this.goal;
    const c = this.cur;
    c.camera.copy(g.camera);
    c.target.copy(g.target);
    c.up.copy(g.up);
    c.jetPos.copy(g.jetPos);
    c.jetRot.copy(g.jetRot);
    lerpPalette(g.sky, g.sky, 0, c.sky);
    c.fov = g.fov;
    c.shiftX = g.shiftX;
    c.shiftY = g.shiftY;
    c.exposure = g.exposure;
    c.cloudSpeed = g.cloudSpeed;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 800 ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.timer.connect(document);
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update(now);
      this.frame(Math.min(this.timer.getDelta(), 1 / 20));
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tmpVec = new THREE.Vector3();

  private frame(dt: number) {
    const time = this.timer.getElapsed();
    const rm = this.reducedMotion;

    // Scroll smoothing — gives the cinematic, weighted feel
    this.chapter = rm ? this.chapterTarget : damp(this.chapter, this.chapterTarget, 3.2, dt);
    const i = Math.floor(this.chapter);
    const k = this.chapter - i;
    // Hold each shot briefly while its chapter is centred, then ease across
    const eased = easeInOut(THREE.MathUtils.smoothstep(k, 0.12, 0.88));
    this.applyShot(i, eased);

    const g = this.goal;
    const c = this.cur;
    const lambda = rm ? 60 : 6;
    c.camera.lerp(g.camera, 1 - Math.exp(-lambda * dt));
    c.target.lerp(g.target, 1 - Math.exp(-lambda * dt));
    c.up.lerp(g.up, 1 - Math.exp(-lambda * dt)).normalize();
    c.jetPos.lerp(g.jetPos, 1 - Math.exp(-lambda * 0.6 * dt));
    c.jetRot.slerp(g.jetRot, 1 - Math.exp(-lambda * 0.6 * dt));
    lerpPalette(c.sky, g.sky, 1 - Math.exp(-lambda * dt), c.sky);
    c.fov = damp(c.fov, g.fov, lambda, dt);
    c.shiftX = damp(c.shiftX, g.shiftX, lambda, dt);
    c.shiftY = damp(c.shiftY, g.shiftY, lambda, dt);
    c.exposure = damp(c.exposure, g.exposure, lambda, dt);
    c.cloudSpeed = damp(c.cloudSpeed, g.cloudSpeed, 2, dt);

    // Intro glide: camera starts wide and low, eases into the hero framing
    if (this.introStarted && this.intro < 1) this.intro = Math.min(1, this.intro + dt / (rm ? 0.01 : 3.4));
    const introE = 1 - Math.pow(1 - this.intro, 4);

    // Camera
    const pull = 1 - introE;
    const aspect = this.width / this.height;
    const fit = aspect < 1 ? THREE.MathUtils.clamp(1.25 / aspect, 1, 2.3) : 1;
    this.tmpVec.subVectors(c.camera, c.target).multiplyScalar(fit * (1 + pull * 0.9));
    this.tmpVec.y -= pull * 3.5;
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-2.5 * dt));
    const parallax = rm ? 0 : 0.35;
    this.camera.position.copy(c.target).add(this.tmpVec);
    this.camera.up.copy(c.up);
    this.camera.lookAt(c.target);
    // Pointer parallax in screen space
    this.camera.translateX(this.pointerSmooth.x * parallax);
    this.camera.translateY(-this.pointerSmooth.y * parallax * 0.6);
    this.camera.fov = c.fov;
    const w = this.width;
    const h = this.height;
    this.camera.setViewOffset(w, h, -c.shiftX * w, c.shiftY * h, w, h);
    this.camera.updateProjectionMatrix();

    // Aircraft: gentle float in the air mass
    this.jetRig.position.copy(c.jetPos);
    this.jetRig.quaternion.copy(c.jetRot);
    if (!rm) {
      this.jetRig.position.y += Math.sin(time * 0.55) * 0.06 + Math.sin(time * 1.3) * 0.015;
      this.jetRig.rotateX(Math.sin(time * 0.4) * 0.012);
      this.jetRig.rotateZ(Math.sin(time * 0.5 + 1) * 0.008);
    }
    this.jet.update(time, dt);

    // Atmosphere
    this.sky.set(c.sky);
    this.sky.uniforms.uTime.value = time;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(c.sky.horizon).lerp(c.sky.mid, 0.35);
    this.hemi.color.copy(c.sky.mid).lerp(new THREE.Color(1, 1, 1), 0.5);
    this.hemi.groundColor.copy(c.sky.bottom);
    const night = c.sky.stars;
    this.sun.intensity = THREE.MathUtils.lerp(3.2, 0.5, night);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.95, 0.35, night);
    this.renderer.toneMappingExposure = c.exposure;

    const cloudLight = this.tmpColorA.copy(c.sky.horizon).lerp(new THREE.Color(1, 1, 1), 0.55 - night * 0.4);
    const cloudShadow = this.tmpColorB.copy(c.sky.bottom).lerp(c.sky.mid, 0.4);
    this.clouds.update(dt, rm ? 0 : c.cloudSpeed, cloudLight, cloudShadow);

    this.renderer.render(this.scene, this.camera);
  }

  private tmpColorA = new THREE.Color();
  private tmpColorB = new THREE.Color();

  dispose() {
    cancelAnimationFrame(this.raf);
    this.timer.dispose();
    this.jet.dispose();
    this.clouds.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
