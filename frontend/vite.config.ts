import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Output is written to the project-level `public/` dir so Vercel's static
// builder serves the dashboard at the domain root next to /api functions.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});