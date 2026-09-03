"use client";

import { useEffect, useMemo, useState } from "react";
import type { Visitor } from "./types";
import {
  GLOBE_CENTER,
  GLOBE_LAMBDA0_START,
  GLOBE_PHI0,
  GLOBE_R,
  buildGraticule,
  projectToGlobe,
  sweepWedgePath,
} from "./globe-utils";

interface GlobeProps {
  visitors: Visitor[];
}

export function Globe({ visitors }: GlobeProps) {
  const [lambda0, setLambda0] = useState(GLOBE_LAMBDA0_START);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // requestAnimationFrame + delta time instead of a fixed setInterval step:
    // a ~90ms interval only updates ~11 times/sec, which reads as a jerky
    // stutter rather than a spin. rAF drives a proper ~60fps tween, and a
    // faster rate (full turn in ~22s vs. the old ~54s) makes the rotation
    // actually noticeable at a glance instead of blending into a still image.
    // A reduced-motion preference tones this down to a slow crawl rather
    // than freezing it outright — this globe *is* the page's live-status
    // indicator, so leaving it fully static would defeat its purpose.
    const DEG_PER_SEC = reduceMotion ? 2 : 16;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setLambda0((prev) => (prev + DEG_PER_SEC * dt) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The graticule rotates with lambda0 too, so the wireframe and the
  // visitor dots move together as one coherent sphere instead of a static
  // grid with dots sliding across it.
  const graticule = useMemo(() => buildGraticule(lambda0, GLOBE_PHI0, GLOBE_R), [lambda0]);

  const dots = useMemo(() => {
    return visitors
      .map((v) => {
        const p = projectToGlobe(v.lat, v.lng, lambda0, GLOBE_PHI0, GLOBE_R);
        return { ...p, id: v.id, location: v.location };
      })
      .filter((p) => p.z > -0.08)
      .sort((a, b) => a.z - b.z);
  }, [visitors, lambda0]);

  return (
    <div className="globe-wrap">
      <svg viewBox="0 0 260 260" className="globe-svg" role="img" aria-label="Live rotating map of visitor locations">
        <defs>
          <radialGradient id="globeFill" cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#1C2C23" />
            <stop offset="55%" stopColor="#11201A" />
            <stop offset="85%" stopColor="#0B1512" />
            <stop offset="100%" stopColor="#08110E" />
          </radialGradient>
          <radialGradient id="limbGlow" cx="50%" cy="50%" r="50%">
            <stop offset="76%" stopColor="#3EF28C" stopOpacity="0" />
            <stop offset="100%" stopColor="#3EF28C" stopOpacity="0.24" />
          </radialGradient>
          <radialGradient id="sphereHighlight" cx="32%" cy="26%" r="38%">
            <stop offset="0%" stopColor="#8FF7C2" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#8FF7C2" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#8FF7C2" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="dropShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sweepGradient" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={GLOBE_R} y2="0">
            <stop offset="0%" stopColor="#3EF28C" stopOpacity="0" />
            <stop offset="100%" stopColor="#3EF28C" stopOpacity="0.16" />
          </linearGradient>
          <filter id="dotGlow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="globeClip">
            <circle cx="0" cy="0" r={GLOBE_R} />
          </clipPath>
        </defs>

        <ellipse cx={GLOBE_CENTER} cy={GLOBE_CENTER + GLOBE_R + 10} rx={GLOBE_R * 0.75} ry="10" fill="url(#dropShadow)" />
        <circle className="globe-limb-glow" cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_R + 7} fill="url(#limbGlow)" />
        <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_R} fill="url(#globeFill)" stroke="#223028" strokeWidth="1" />

        <g transform={`translate(${GLOBE_CENTER}, ${GLOBE_CENTER})`} clipPath="url(#globeClip)">
          {graticule.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#2B3B32" strokeWidth="0.6" opacity="0.75" />
          ))}
          <g className="globe-sweep">
            <path d={sweepWedgePath(GLOBE_R, 22)} fill="url(#sweepGradient)" />
          </g>
          {dots.map((d) => (
            <g key={d.id} transform={`translate(${d.x.toFixed(2)}, ${d.y.toFixed(2)})`}>
              <circle
                r={2.4 + d.z * 1.3}
                fill="#3EF28C"
                filter="url(#dotGlow)"
                opacity={Math.max(0.35, (d.z + 1) / 2)}
              />
            </g>
          ))}
        </g>

        {/* Fixed screen-space highlight and rim — these stay put as the sphere
            turns underneath them, the way light doesn't rotate with a globe. */}
        <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_R} fill="url(#sphereHighlight)" pointerEvents="none" />
        <circle cx={GLOBE_CENTER} cy={GLOBE_CENTER} r={GLOBE_R} fill="none" stroke="#3EF28C" strokeOpacity="0.18" strokeWidth="1" />
      </svg>
      <div className="globe-caption">The globe rotates in real time — pins glow brighter as they face you.</div>
    </div>
  );
}
