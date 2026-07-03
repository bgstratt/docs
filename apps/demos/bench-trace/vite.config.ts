import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Canonical dev port (matches scripts/dev-apps.ps1 and the demo host's
    // CORS/Origin allowlist). strictPort: a plain `npm run dev` on a busy
    // port fails loudly instead of drifting to a port the host rejects.
    port: 4179,
    strictPort: true
  }
});
