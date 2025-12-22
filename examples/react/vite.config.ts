import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  // Base path for GitHub Pages deployment
  base: "/geocoding-wasm/examples/react/",
  // Resolve the linked SDK package
  resolve: {
    alias: {
      "@tabaqat/geocoding-sdk": path.resolve(__dirname, "../../dist/index.js"),
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
  },
  build: {
    // Ensure WASM files are properly handled
    target: "esnext",
  },
});
