import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/geocoding-sdk/' : '/',
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  resolve: {
    alias: {
      '@tabaqat/geocoding-sdk': path.resolve(__dirname, '../../src/index.ts'),
    },
  },
  // Required headers for DuckDB-WASM (SharedArrayBuffer)
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // Optimize DuckDB-WASM bundle
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
    include: [
      "react",
      "react-dom",
      "react-router",
      "maplibre-gl",
    ],
  },
  build: {
    // Ensure WASM files are properly handled
    target: "esnext",
    // Optimize chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          "react-vendor": ["react", "react-dom", "react-router"],
          "map-vendor": ["maplibre-gl", "react-map-gl"],
          "ui-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-slider",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
          ],
        },
      },
    },
  },
});
