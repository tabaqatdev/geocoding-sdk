import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("playground", "routes/playground.tsx"),
  // Documentation routes
  route("docs/getting-started", "routes/docs/getting-started.tsx"),
  route("docs/forward-geocoding", "routes/docs/forward-geocoding.tsx"),
  route("docs/reverse-geocoding", "routes/docs/reverse-geocoding.tsx"),
  route("docs/postcode-search", "routes/docs/postcode-search.tsx"),
  route("docs/house-number", "routes/docs/house-number.tsx"),
  route("docs/country-detection", "routes/docs/country-detection.tsx"),
  route("docs/admin-hierarchy", "routes/docs/admin-hierarchy.tsx"),
  route("docs/api-reference", "routes/docs/api-reference.tsx"),
] satisfies RouteConfig;
