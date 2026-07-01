import { defineConfig } from "astro/config";

// @astrojs/sitemap is intentionally not wired in yet — 3.x crashes against this
// Astro 4.16 build hook shape (`_routes` undefined). Re-add once versions align.
export default defineConfig({
  site: "https://nodalmerge.com",
});
