export const DOCS_URL = "https://docs.nodalmerge.com";
export const STUDIO_DOCS_URL = "https://docs.nodalmerge.com/studio";
export const GITHUB_URL = "https://github.com/bgstratt/nodalmerge";

export const primaryNav = [
  { label: "Studio", href: "/studio" },
  { label: "Demos", href: "/demos" },
  { label: "Playground", href: "/playground" },
  { label: "Docs", href: DOCS_URL, external: true },
];

export const footerNav = {
  Product: [
    { label: "Overview", href: "/" },
    { label: "NodalMerge Studio", href: "/studio" },
    { label: "Demos", href: "/demos" },
    { label: "Playground", href: "/playground" },
  ],
  Docs: [
    { label: "Documentation", href: DOCS_URL, external: true },
    { label: "Quickstart", href: `${DOCS_URL}/quickstart`, external: true },
    { label: "Studio docs", href: STUDIO_DOCS_URL, external: true },
    { label: "API reference", href: `${DOCS_URL}/api-reference/introduction`, external: true },
  ],
  Project: [
    { label: "GitHub", href: GITHUB_URL, external: true },
    { label: "Architecture", href: `${DOCS_URL}/architecture/overview`, external: true },
    { label: "Benchmarks", href: `${DOCS_URL}/benchmarks/performance-overview`, external: true },
  ],
};
