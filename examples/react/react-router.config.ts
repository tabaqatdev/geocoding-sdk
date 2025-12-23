import type { Config } from "@react-router/dev/config";

export default {
  // SPA mode for static GitHub Pages deployment
  ssr: false,
  // Base path for GitHub Pages: /geocoding-sdk/
  basename: "/geocoding-sdk/",
} satisfies Config;
