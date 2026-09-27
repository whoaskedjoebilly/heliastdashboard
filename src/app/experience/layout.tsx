import { Instrument_Serif } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  variable: "--font-xp-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export default function ExperienceLayout({ children }: LayoutProps<"/experience">) {
  return <div className={`${instrumentSerif.variable} contents`}>{children}</div>;
}
