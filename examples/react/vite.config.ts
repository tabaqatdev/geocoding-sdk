import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/geocoding-sdk/examples/react/' : '/',
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
  },
  build: {
    // Ensure WASM files are properly handled
    target: "esnext",
  },
});
