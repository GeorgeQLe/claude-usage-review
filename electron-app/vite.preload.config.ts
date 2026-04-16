import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/preload/index.ts"),
      fileName: () => "index.js",
      formats: ["cjs"]
    },
    outDir: "dist-electron/preload",
    rollupOptions: {
      external: ["electron"],
      output: {
        exports: "none"
      }
    },
    sourcemap: true
  }
});
