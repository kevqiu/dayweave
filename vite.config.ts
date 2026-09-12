import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Alchemy uploads this directory as the Worker's static assets.
    outDir: "dist/web",
    emptyOutDir: true,
  },
  server: {
    // `vite dev` talks to a deployed or local Worker for anything under /api.
    proxy: { "/api": { target: process.env.API_ORIGIN ?? "http://127.0.0.1:8787", changeOrigin: true } },
  },
});
