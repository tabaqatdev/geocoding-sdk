import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
} from "react-router";
import { useEffect } from "react";
import { posthog } from "posthog-js";
import { PostHogProvider } from "@posthog/react";

import type { Route } from "./+types/root";
import "./app.css";
import { LanguageProvider } from "./i18n/context";
import { GeoSDKProvider } from "./context/geo-sdk-context";
import { Toaster } from "./components/ui/sonner";

// Initialize PostHog with EU region
if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    defaults: "2025-11-30",
    person_profiles: "identified_only",
  } as Parameters<typeof posthog.init>[1]);
}

// Base path for assets (handles both dev and production)
const basePath = import.meta.env.PROD ? "/geocoding-sdk" : "";

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: `${basePath}/favicon.svg` },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Cairo:wght@200..1000&display=swap",
  },
];

// SEO meta tags
export function meta() {
  return [
    { title: "Saudi Arabia Geocoding SDK - Browser-based Geocoding with DuckDB-WASM" },
    {
      name: "description",
      content:
        "Fast, privacy-focused geocoding SDK for Saudi Arabia. Works entirely in the browser using DuckDB-WASM. Supports Arabic and English, forward/reverse geocoding, and offline-first architecture.",
    },
    {
      name: "keywords",
      content:
        "geocoding, Saudi Arabia, DuckDB, WASM, offline, Arabic, reverse geocoding, browser-based, privacy",
    },
    { name: "author", content: "Tabaqat" },
    { name: "theme-color", content: "#1a73e8" },

    // Open Graph
    { property: "og:type", content: "website" },
    { property: "og:title", content: "Saudi Arabia Geocoding SDK" },
    {
      property: "og:description",
      content:
        "Fast, privacy-focused geocoding SDK for Saudi Arabia. Works entirely in the browser using DuckDB-WASM.",
    },
    { property: "og:url", content: "https://tabaqatdev.github.io/geocoding-sdk/" },
    { property: "og:site_name", content: "Tabaqat Geocoding SDK" },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Saudi Arabia Geocoding SDK" },
    {
      name: "twitter:description",
      content:
        "Fast, privacy-focused geocoding SDK for Saudi Arabia. Works entirely in the browser using DuckDB-WASM.",
    },

    // Additional SEO
    { name: "robots", content: "index, follow" },
    { name: "googlebot", content: "index, follow" },
    { name: "language", content: "English, Arabic" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="view-transition" content="same-origin" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigate = useNavigate();

  // Handle GitHub Pages SPA redirect
  useEffect(() => {
    const redirect = sessionStorage.getItem("redirect");
    if (redirect) {
      sessionStorage.removeItem("redirect");
      navigate(redirect.replace("/geocoding-sdk", ""));
    }
  }, [navigate]);
  return (
    <PostHogProvider client={posthog}>
      <LanguageProvider>
        <GeoSDKProvider>
          <Outlet />
          <Toaster />
        </GeoSDKProvider>
      </LanguageProvider>
    </PostHogProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
