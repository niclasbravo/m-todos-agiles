/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` → dist/ para Capacitor (Android) y para servir como PWA.
// `npm run demo` → un solo index.html autocontenido en dist-demo/ (demo para abrir en cualquier navegador).
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
  base: "./",
  plugins: [react(), ...(demo ? [viteSingleFile()] : [])],
  build: {
    outDir: demo ? "dist-demo" : "dist",
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: demo ? 100_000_000 : 4096,
  },
  test: { testTimeout: 120_000 },
  };
});
