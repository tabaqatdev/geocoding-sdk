import type { Config } from "@react-router/dev/config";

const isProduction = process.env.NODE_ENV === "production";

export default {
  // SPA mode for static GitHub Pages deployment
  ssr: false,
  // Base path for GitHub Pages (only in production)
  basename: isProduction ? "/geocoding-sdk/" : "/",
  // Enable lazy route discovery for better performance
  future: {
    unstable_optimizeDeps: true,
  },
} satisfies Config;
