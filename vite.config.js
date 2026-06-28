import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  resolve: {
    // fileURLToPath(new URL(...)) works on all Node ESM versions
    // (avoids the Node 20.11+ requirement of import.meta.dirname).
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Default to loopback. Set VITE_HOST=0.0.0.0 only for the explicit LAN
    // dev workflow — binding the dev server to all interfaces on a shared
    // network exposes an unauthenticated frontend with a proxied dev API.
    host: process.env.VITE_HOST || "localhost",
    proxy: { "/api": "http://localhost:3001" },
  },
});
