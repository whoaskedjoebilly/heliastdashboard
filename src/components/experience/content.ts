/** All copy for the story lives here so it can be edited without touching layout code. */

export const BRAND = {
  name: "HELIAST",
  aircraft: "H‑7",
  tagline: "Private Aviation",
};

export const NAV = [
  { label: "Aircraft", chapter: 1 },
  { label: "Cabin", chapter: 4 },
  { label: "Performance", chapter: 5 },
  { label: "Range", chapter: 6 },
];

export const CHAPTER_NAMES = ["Window seat", "The aircraft", "Design", "Power", "Cabin", "Performance", "Range", "Enquire"];

export const SPECS = [
  { value: 7700, format: (n: number) => Math.round(n).toLocaleString("en-US"), unit: "nm", label: "Maximum range" },
  { value: 0.925, format: (n: number) => n.toFixed(3).replace(/^0/, ""), prefix: "M", unit: "", label: "Top speed" },
  { value: 51000, format: (n: number) => Math.round(n).toLocaleString("en-US"), unit: "ft", label: "Service ceiling" },
  { value: 16, format: (n: number) => Math.round(n).toString(), unit: "", label: "Passengers" },
];

export const ROUTES = [
  { from: "London", to: "Singapore", time: "12h 40m" },
  { from: "New York", to: "Hong Kong", time: "15h 55m" },
  { from: "Dubai", to: "Los Angeles", time: "15h 20m" },
];
