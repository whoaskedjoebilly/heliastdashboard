// Turns a raw URL path ("/products/fl-41-glasses") into a name a human
// would actually use ("FL-41 glasses product page") — visitors browsing the
// Live feed or a page-performance report shouldn't have to read route
// slugs. The demo storefront's pages get an exact curated name; anything
// else (a real account's GA4 paths, which we don't control) falls back to
// a generic slug → title-case pass so it's still readable, just less
// polished.

const KNOWN_PAGE_LABELS: Record<string, string> = {
  "/": "Home page",
  "/cart": "Cart page",
  "/collections/all": "All products page",
  "/products/fl-41-glasses": "FL-41 glasses product page",
  "/products/blackout-eye-mask": "Blackout eye mask product page",
  "/blog/light-sensitivity-guide": "Light sensitivity guide blog post",
  "/pages/about": "About page",
};

const SECTION_LABELS: Record<string, string> = {
  products: "product page",
  collections: "collection page",
  blog: "blog post",
  pages: "page",
};

function titleCase(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function humanizePagePath(path: string): string {
  const known = KNOWN_PAGE_LABELS[path];
  if (known) return known;
  if (!path || path === "/") return "Home page";

  const segments = path.split("/").filter(Boolean);
  const [section, ...rest] = segments;
  const nameSegment = rest.length > 0 ? rest[rest.length - 1] : section;
  const name = titleCase(nameSegment);
  const suffix = rest.length > 0 ? (SECTION_LABELS[section] ?? "page") : "page";
  return `${name} ${suffix}`;
}
