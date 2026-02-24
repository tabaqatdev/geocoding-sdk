import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { GeocodingResult as SDKGeocodingResult } from "@tabaqat/geocoding-sdk";
import duckdbMvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbEhWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

// Re-export for consumers
export type GeocodingResult = SDKGeocodingResult;

// SDK type definition (the actual import is dynamic)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeoSDKType = any;

interface TileInfo {
  tile_id: string;
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  addr_count: number;
  file_size_kb: number;
  region_ar?: string;
  region_en?: string;
}

interface SDKStats {
  totalTiles: number;
  totalAddresses: number;
  totalSizeKb: number;
  tilesLoaded: number;
}

type InitStatus = "idle" | "loading" | "ready" | "error";

interface GeoSDKContextValue {
  sdk: GeoSDKType | null;
  status: InitStatus;
  error: Error | null;
  stats: SDKStats | null;
  searchMode: "fts-bm25" | "jaccard" | null;
  initialized: boolean;
  loading: boolean;
  retry: () => void;
}

const GeoSDKContext = createContext<GeoSDKContextValue | null>(null);

interface GeoSDKProviderProps {
  children: ReactNode;
}

// Global singleton to persist across hot reloads and route changes
let globalSDK: GeoSDKType | null = null;
let globalStats: SDKStats | null = null;
let globalSearchMode: "fts-bm25" | "jaccard" | null = null;
let globalStatus: InitStatus = "idle";
let globalError: Error | null = null;
let initPromise: Promise<void> | null = null;

export function GeoSDKProvider({ children }: GeoSDKProviderProps) {
  const [sdk, setSDK] = useState<GeoSDKType | null>(globalSDK);
  const [status, setStatus] = useState<InitStatus>(globalStatus);
  const [error, setError] = useState<Error | null>(globalError);
  const [stats, setStats] = useState<SDKStats | null>(globalStats);
  const [searchMode, setSearchMode] = useState<"fts-bm25" | "jaccard" | null>(globalSearchMode);

  const initializeSDK = useCallback(async () => {
    // If already initialized, skip
    if (globalSDK) {
      setSDK(globalSDK);
      setStats(globalStats);
      setSearchMode(globalSearchMode);
      setStatus("ready");
      return;
    }

    // If already initializing, wait for that
    if (initPromise) {
      await initPromise;
      setSDK(globalSDK);
      setStats(globalStats);
      setSearchMode(globalSearchMode);
      setStatus(globalStatus);
      setError(globalError);
      return;
    }

    // Start initialization
    globalStatus = "loading";
    setStatus("loading");
    setError(null);
    globalError = null;

    initPromise = (async () => {
      try {
        // Dynamic import to avoid SSR issues
        console.log("[GeoSDK-Context] Importing SDK module...");
        const { GeoSDK } = await import("@tabaqat/geocoding-sdk");
        console.log("[GeoSDK-Context] SDK module imported, creating instance...");

        const geoSDK = new GeoSDK({
          debug: true,
          wasmBundles: {
            mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
            eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
          },
        });

        console.log("[GeoSDK-Context] Calling initialize()...");
        await geoSDK.initialize();
        console.log("[GeoSDK-Context] initialize() complete");

        const sdkStats = await geoSDK.getStats();
        const mode = geoSDK.getSearchMode();
        console.log("[GeoSDK-Context] Ready — mode:", mode, "tiles:", sdkStats.totalTiles);

        // Store in global singleton
        globalSDK = geoSDK;
        globalStats = sdkStats;
        globalSearchMode = mode;
        globalStatus = "ready";
        globalError = null;

        setSDK(geoSDK);
        setStats(sdkStats);
        setSearchMode(mode);
        setStatus("ready");
      } catch (e) {
        console.error("[GeoSDK-Context] Initialization failed:", e);
        const err = e instanceof Error ? e : new Error("Failed to initialize SDK");
        globalError = err;
        globalStatus = "error";
        setError(err);
        setStatus("error");
      } finally {
        initPromise = null;
      }
    })();

    await initPromise;
  }, []);

  const retry = useCallback(() => {
    // Reset global state and retry
    globalSDK = null;
    globalStats = null;
    globalSearchMode = null;
    globalStatus = "idle";
    globalError = null;
    initPromise = null;
    initializeSDK();
  }, [initializeSDK]);

  // Auto-initialize on mount
  useEffect(() => {
    initializeSDK();
  }, [initializeSDK]);

  const value: GeoSDKContextValue = {
    sdk,
    status,
    error,
    stats,
    searchMode,
    initialized: status === "ready",
    loading: status === "loading",
    retry,
  };

  return <GeoSDKContext.Provider value={value}>{children}</GeoSDKContext.Provider>;
}

export function useGeoSDK(): GeoSDKContextValue {
  const context = useContext(GeoSDKContext);
  if (!context) {
    throw new Error("useGeoSDK must be used within a GeoSDKProvider");
  }
  return context;
}
