import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));

// Multi-page build: every existing HTML page is an entry point so the whole
// site (not just the 3D landing page) is produced by `npm run build`.
export default defineConfig({
  root,
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        library: resolve(root, "library.html"),
        lab: resolve(root, "lab.html"),
        wonders: resolve(root, "wonders.html"),
      },
    },
  },
});
