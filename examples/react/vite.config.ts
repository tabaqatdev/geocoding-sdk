import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/geocoding-sdk/' : '/',
  assetsInclude: ['**/*.wasm'],
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
    target: "esnext",
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Suppress sourcemap warnings from Radix UI / shadcn components
        if (warning.message?.includes("Can't resolve original location of error")) return;
        defaultHandler(warning);
      },
    },
  },
});
