import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, "src/ui/index.html"),
        consent: resolve(__dirname, "src/auth/consent.html")
      }
    }
  }
});
