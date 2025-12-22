import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// SDK type definition (the actual import is dynamic)
interface GeoSDKType {
  initialize(): Promise<void>;
  close(): Promise<void>;
  getStats(): Promise<SDKStats>;
  getSearchMode(): "fts-bm25" | "jaccard";
  geocode(query: string, options?: GeocodeOptions): Promise<GeocodingResult[]>;
  reverseGeocode(
    lat: number,
    lon: number,
    options?: ReverseGeocodeOptions
  ): Promise<GeocodingResult[]>;
  searchByPostcode(postcode: string, options?: PostcodeSearchOptions): Promise<GeocodingResult[]>;
  searchByNumber(number: string, options?: NumberSearchOptions): Promise<GeocodingResult[]>;
  detectCountry(lat: number, lon: number): CountryDetectionResult | null;
  getAdminHierarchy(lat: number, lon: number): AdminHierarchy | null;
  getPostcodes(prefix?: string): PostcodeInfo[];
}

interface GeocodeOptions {
  limit?: number;
  bbox?: [number, number, number, number];
  regions?: string[];
}

interface ReverseGeocodeOptions {
  limit?: number;
  radiusMeters?: number;
  detailLevel?: "minimal" | "postcode" | "region" | "full";
  includeNeighbors?: boolean;
}

interface PostcodeSearchOptions {
  limit?: number;
  number?: string;
}

interface NumberSearchOptions {
  limit?: number;
  region?: string;
}

interface CountryDetectionResult {
  isInSaudiArabia: boolean;
  confidence: number;
}

interface AdminHierarchy {
  region_ar?: string;
  region_en?: string;
  city_ar?: string;
  city_en?: string;
  district_ar?: string;
  district_en?: string;
}

interface PostcodeInfo {
  postcode: string;
  region_ar?: string;
  region_en?: string;
  addr_count: number;
  tiles: string[];
}

export interface GeocodingResult {
  longitude: number;
  latitude: number;
  full_address_ar?: string;
  full_address_en?: string;
  postcode?: string;
  number?: string;
  street?: string;
  district_ar?: string;
  district_en?: string;
  city_ar?: string;
  city_en?: string;
  region_ar?: string;
  region_en?: string;
  distance_m?: number;
  similarity?: number;
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
        const { GeoSDK } = await import("@tabaqat/geocoding-sdk");

        const geoSDK = new GeoSDK();
        await geoSDK.initialize();

        const sdkStats = await geoSDK.getStats();
        const mode = geoSDK.getSearchMode();

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
