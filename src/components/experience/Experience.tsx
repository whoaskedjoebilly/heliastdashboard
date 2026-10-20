"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { BRAND, CHAPTER_NAMES, NAV, ROUTES, SPECS } from "./content";
import type { JetScene } from "./scene/JetScene";
import "./experience.css";

const pad = (n: number) => String(n).padStart(2, "0");
/** Which side each chapter's copy sits on, so a soft shade can keep it legible over the aircraft. */
const COPY_SIDE = ["bottom", "left", "left", "right", "left", "left", "right", "bottom"];
/** Stagger index for the reveal animation. */
const delay = (n: number) => ({ "--d": n }) as CSSProperties;

function Stat({ spec, active }: { spec: (typeof SPECS)[number]; active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      setN(spec.value * (1 - Math.pow(1 - t, 4)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, spec.value]);
  return (
    <div className="xp-stat">
      <div className="xp-stat__value">
        {spec.prefix && <span className="xp-stat__unit">{spec.prefix}</span>}
        {spec.format(n)}
        {spec.unit && <span className="xp-stat__unit">{spec.unit}</span>}
      </div>
      <div className="xp-stat__label">{spec.label}</div>
    </div>
  );
}

export function Experience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<JetScene | null>(null);
  const storyRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const railRef = useRef<HTMLSpanElement>(null);
  const [sent, setSent] = useState(false);
  const [webgl, setWebgl] = useState(true);

  const getSections = () => Array.from(storyRef.current?.querySelectorAll<HTMLElement>("[data-chapter]") ?? []);

  // Boot the WebGL scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let scene: JetScene | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Preloader counter runs alongside the (fast) procedural build
    const t0 = performance.now();
    let counterRaf = 0;
    let ready = false;
    const count = (now: number) => {
      const t = Math.min(1, (now - t0) / (reducedMotion ? 200 : 1900));
      const shown = ready ? t : Math.min(t, 0.9);
      setProgress(Math.round(100 * (1 - Math.pow(1 - shown, 3))));
      if (shown < 1) counterRaf = requestAnimationFrame(count);
      else
        setTimeout(() => {
          if (disposed) return;
          setLoaded(true);
          scene?.startIntro();
        }, 250);
    };
    counterRaf = requestAnimationFrame(count);

    const onResize = () => scene?.resize(window.innerWidth, window.innerHeight);

    import("./scene/JetScene")
      .then(({ JetScene }) => {
        if (disposed) return;
        try {
          scene = new JetScene(canvas, { reducedMotion });
        } catch {
          setWebgl(false);
          ready = true;
          return;
        }
        sceneRef.current = scene;
        // Development aid: inspect the live scene from the browser console
        if (process.env.NODE_ENV !== "production") (window as unknown as { __xp?: JetScene }).__xp = scene;
        onResize();
        scene.warmup();
        scene.start();
        ready = true;
      })
      .catch(() => {
        setWebgl(false);
        ready = true;
      });

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      scene?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer);
    return () => {
      disposed = true;
      cancelAnimationFrame(counterRaf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Lock scrolling while the preloader is up
  useEffect(() => {
    document.documentElement.classList.toggle("xp-locked", !loaded);
    return () => document.documentElement.classList.remove("xp-locked");
  }, [loaded]);

  // Map scroll position → continuous chapter value
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      const y = window.scrollY;
      const centres = getSections().map((el) => el.offsetTop + el.offsetHeight / 2 - vh / 2);
      if (!centres.length) return;
      let chapter = 0;
      if (y <= centres[0]) chapter = 0;
      else if (y >= centres[centres.length - 1]) chapter = centres.length - 1;
      else {
        for (let i = 0; i < centres.length - 1; i++) {
          if (y >= centres[i] && y < centres[i + 1]) {
            chapter = i + (y - centres[i]) / Math.max(1, centres[i + 1] - centres[i]);
            break;
          }
        }
      }
      sceneRef.current?.setChapter(chapter);
      const rounded = Math.round(chapter);
      setActive(rounded);
      setSeen((prev) => {
        if (prev.has(rounded)) return prev;
        const next = new Set(prev);
        next.add(rounded);
        return next;
      });
      const max = document.documentElement.scrollHeight - vh;
      // Progress bar is updated directly: re-rendering the page every scroll frame is wasted work
      if (railRef.current) railRef.current.style.transform = `scaleY(${max > 0 ? y / max : 0})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const goTo = (chapter: number) => {
    const el = getSections()[chapter];
    if (!el) return;
    const top = el.offsetTop + el.offsetHeight / 2 - window.innerHeight / 2;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  const cls = (i: number, extra = "") =>
    `xp-chapter ${extra} ${seen.has(i) && loaded ? "is-in" : ""} ${active === i ? "is-active" : ""}`;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className={`xp ${loaded ? "is-loaded" : ""} ${webgl ? "" : "no-webgl"}`}>
      <canvas ref={canvasRef} className="xp-canvas" aria-hidden="true" />
      <div className="xp-vignette" aria-hidden="true" />
      <div className="xp-shade" data-side={COPY_SIDE[active]} aria-hidden="true" />
      <div className="xp-grain" aria-hidden="true" />

      {/* Preloader */}
      <div className="xp-loader" aria-hidden={loaded}>
        <div className="xp-loader__brand">{BRAND.name}</div>
        <div className="xp-loader__bar">
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <div className="xp-loader__count">{String(progress).padStart(3, "0")}</div>
      </div>

      {/* Chrome */}
      <header className="xp-header">
        <button className="xp-logo" onClick={() => goTo(0)} aria-label={`${BRAND.name} — back to top`}>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 3 L29 16 L16 29 L3 16 Z" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M3 16 H29" stroke="currentColor" strokeWidth="1" />
            <circle cx="16" cy="16" r="2.2" fill="currentColor" />
          </svg>
          <span>{BRAND.name}</span>
        </button>
        <nav className="xp-nav" aria-label="Chapters">
          {NAV.map((n) => (
            <button key={n.label} onClick={() => goTo(n.chapter)} className={active === n.chapter ? "is-current" : ""}>
              {n.label}
            </button>
          ))}
        </nav>
        <button className="xp-cta" onClick={() => goTo(CHAPTER_NAMES.length - 1)}>
          Enquire
          <span aria-hidden="true">→</span>
        </button>
      </header>

      <aside className="xp-rail" aria-hidden="true">
        <div className="xp-rail__count">
          <span>{pad(active)}</span>
          <i />
          <span>{pad(CHAPTER_NAMES.length - 1)}</span>
        </div>
        <div className="xp-rail__name">{CHAPTER_NAMES[active]}</div>
        <div className="xp-rail__track">
          <span ref={railRef} />
        </div>
      </aside>

      <main className="xp-story" ref={storyRef}>
        {/* 0 — Hero */}
        <section data-chapter={0} className={cls(0, "xp-hero")}>
          <div className="xp-hero__inner">
            <p className="xp-eyebrow xp-rise" style={delay(0)}>
              {BRAND.name} {BRAND.aircraft} — {BRAND.tagline}
            </p>
            <h1 className="xp-display xp-rise" style={delay(1)}>
              Above <em>everything.</em>
            </h1>
            <div className="xp-hero__foot xp-rise" style={delay(2)}>
              <p className="xp-lede">
                The longest-range aircraft in its class, shaped for silence and built around the people on board.
              </p>
              <button className="xp-link" onClick={() => goTo(1)}>
                Discover the {BRAND.aircraft}
              </button>
            </div>
          </div>
          <div className="xp-scrollcue" aria-hidden="true">
            <span>Scroll</span>
            <i />
          </div>
        </section>

        {/* 1 — The aircraft, seen from outside for the first time */}
        <section data-chapter={1} className={cls(1, "xp-left")}>
          <div className="xp-pin">
            <div className="xp-block">
              <p className="xp-eyebrow xp-rise" style={delay(0)}>
                01 — The aircraft
              </p>
              <h2 className="xp-title xp-rise" style={delay(1)}>
                Meet the <em>{BRAND.aircraft}.</em>
              </h2>
              <p className="xp-body xp-rise" style={delay(2)}>
                A long-range cabin wrapped in a quiet, swept-wing airframe, built to carry sixteen guests between almost
                any two cities on earth without stopping.
              </p>
            </div>
          </div>
        </section>

        {/* 2 — Design */}
        <section data-chapter={2} className={cls(2, "xp-left")}>
          <div className="xp-pin">
            <div className="xp-block">
              <p className="xp-eyebrow xp-rise" style={delay(0)}>
                02 — Design
              </p>
              <h2 className="xp-title xp-rise" style={delay(1)}>
                One continuous <em>line.</em>
              </h2>
              <p className="xp-body xp-rise" style={delay(2)}>
                A 33° swept wing, blended winglets and an unbroken fuselage profile. Every surface was drawn to move
                through air cleanly — and to look like it.
              </p>
              <dl className="xp-meta xp-rise" style={delay(3)}>
                <div>
                  <dt>Wingspan</dt>
                  <dd>31.4 m</dd>
                </div>
                <div>
                  <dt>Length</dt>
                  <dd>30.2 m</dd>
                </div>
                <div>
                  <dt>Height</dt>
                  <dd>8.1 m</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* 3 — Power */}
        <section data-chapter={3} className={cls(3, "xp-right")}>
          <div className="xp-pin">
            <div className="xp-block">
              <p className="xp-eyebrow xp-rise" style={delay(0)}>
                03 — Power
              </p>
              <h2 className="xp-title xp-rise" style={delay(1)}>
                Quiet, <em>by design.</em>
              </h2>
              <p className="xp-body xp-rise" style={delay(2)}>
                Twin high-bypass turbofans deliver 18,000 lbf of thrust each, with acoustic liners and a polished inlet
                lip that keeps the cabin at a whisper — 44 dB at cruise.
              </p>
              <dl className="xp-meta xp-rise" style={delay(3)}>
                <div>
                  <dt>Thrust</dt>
                  <dd>2 × 18,000 lbf</dd>
                </div>
                <div>
                  <dt>Cabin noise</dt>
                  <dd>44 dB</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* 4 — Cabin */}
        <section data-chapter={4} className={cls(4, "xp-left")}>
          <div className="xp-pin">
            <div className="xp-block">
              <p className="xp-eyebrow xp-rise" style={delay(0)}>
                04 — Cabin
              </p>
              <h2 className="xp-title xp-rise" style={delay(1)}>
                Four rooms. <em>No compromises.</em>
              </h2>
              <p className="xp-body xp-rise" style={delay(2)}>
                Eighteen panoramic windows flood a 15-metre cabin with daylight. A dining suite, a lounge, a private
                stateroom and a crew rest — pressurised to feel like 2,900 ft, so you land as you left.
              </p>
              <dl className="xp-meta xp-rise" style={delay(3)}>
                <div>
                  <dt>Cabin length</dt>
                  <dd>15.2 m</dd>
                </div>
                <div>
                  <dt>Cabin altitude</dt>
                  <dd>2,900 ft</dd>
                </div>
                <div>
                  <dt>Living zones</dt>
                  <dd>4</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* 5 — Performance */}
        <section data-chapter={5} className={cls(5, "xp-left xp-specs")}>
          <div className="xp-pin">
            <div className="xp-block">
              <p className="xp-eyebrow xp-rise" style={delay(0)}>
                05 — Performance
              </p>
              <h2 className="xp-title xp-rise" style={delay(1)}>
                Numbers that <em>shrink the map.</em>
              </h2>
              <div className="xp-stats xp-rise" style={delay(2)}>
                {SPECS.map((s) => (
                  <Stat key={s.label} spec={s} active={seen.has(5) && loaded} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 6 — Range */}
        <section data-chapter={6} className={cls(6, "xp-right")}>
          <div className="xp-pin">
            <div className="xp-block">
              <p className="xp-eyebrow xp-rise" style={delay(0)}>
                06 — Range
              </p>
              <h2 className="xp-title xp-rise" style={delay(1)}>
                Anywhere, <em>nonstop.</em>
              </h2>
              <ul className="xp-routes xp-rise" style={delay(2)}>
                {ROUTES.map((r) => (
                  <li key={r.from}>
                    <span>{r.from}</span>
                    <i aria-hidden="true" />
                    <span>{r.to}</span>
                    <time>{r.time}</time>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 7 — Enquire */}
        <section data-chapter={7} className={cls(7, "xp-final")} id="enquire">
          <div className="xp-pin">
            <div className="xp-block xp-block--center">
              <p className="xp-eyebrow xp-rise" style={delay(0)}>
                07 — Enquire
              </p>
              <h2 className="xp-display xp-rise" style={delay(1)}>
                Your sky <em>awaits.</em>
              </h2>
              {sent ? (
                <p className="xp-body xp-thanks xp-rise" style={delay(2)}>
                  Thank you. A member of our flight team will be in touch within the hour.
                </p>
              ) : (
                <form className="xp-form xp-rise" style={delay(2)} onSubmit={onSubmit}>
                  <label>
                    <span>Name</span>
                    <input name="name" autoComplete="name" required />
                  </label>
                  <label>
                    <span>Email</span>
                    <input name="email" type="email" autoComplete="email" required />
                  </label>
                  <label>
                    <span>From</span>
                    <input name="from" placeholder="City or airport" />
                  </label>
                  <label>
                    <span>To</span>
                    <input name="to" placeholder="City or airport" />
                  </label>
                  <button type="submit" className="xp-cta xp-cta--solid">
                    Request a flight <span aria-hidden="true">→</span>
                  </button>
                </form>
              )}
            </div>
          </div>
          <footer className="xp-footer">
            <span>
              © {new Date().getFullYear()} {BRAND.name} {BRAND.tagline}
            </span>
            <span>Geneva · London · Dubai · New York</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
