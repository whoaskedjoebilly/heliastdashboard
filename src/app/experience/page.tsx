import type { Metadata, Viewport } from "next";
import { Experience } from "@/components/experience/Experience";

export const metadata: Metadata = {
  title: "Heliast H‑7 — Above everything",
  description: "A scroll-driven 3D journey around the Heliast H‑7 long-range private jet.",
};

export const viewport: Viewport = {
  themeColor: "#05070b",
};

export default function ExperiencePage() {
  return <Experience />;
}
