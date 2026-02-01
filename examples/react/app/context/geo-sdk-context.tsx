import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

// SDK type definition (the actual import is dynamic)
type LogLevel = "debug" | "info" | "warn" | "error" | "none";

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

interface AutocompleteOptions {
  limit?: number;
  bbox?: [number, number, number, number];
  regions?: string[];
  types?: "all" | "district" | "postcode" | "region";
}

interface GeoSDKType {
  // Core methods
  initialize(): Promise<void>;
  close(): Promise<void>;
  getStats(): Promise<SDKStats>;
  getSearchMode(): "fts-bm25" | "jaccard";

  // Search methods
  geocode(query: string, options?: GeocodeOptions): Promise<GeocodingResult[]>;
  geocodeCached(query: string, options?: GeocodeOptions): Promise<GeocodingResult[]>;
  smartGeocode(query: string, options?: GeocodeOptions): Promise<GeocodingResult[]>;
  getAutocompleteSuggestions(
    query: string,
    options?: AutocompleteOptions
  ): Promise<{
    suggestions: Array<{
      type: "district" | "postcode" | "region";
      value: string;
      label_ar: string;
      label_en: string;
    }>;
    type: "district" | "postcode" | "general";
  }>;
  reverseGeocode(
    lat: number,
    lon: number,
    options?: ReverseGeocodeOptions
  ): Promise<GeocodingResult[]>;
  searchByPostcode(postcode: string, options?: PostcodeSearchOptions): Promise<GeocodingResult[]>;
  searchByNumber(number: string, options?: NumberSearchOptions): Promise<GeocodingResult[]>;

  // Location detection
  detectCountry(lat: number, lon: number): Promise<CountryDetectionResult | null>;
  getAdminHierarchy(lat: number, lon: number): Promise<AdminHierarchy>;
  isInSaudiArabia(lat: number, lon: number): Promise<boolean>;

  // Tile management
  getPostcodes(prefix?: string): PostcodeInfo[];
  getTiles(): TileInfo[];
  getLoadedTiles(): string[];
  getTilesByRegion(region: string): TileInfo[];
  getTilesForBbox(bbox: [number, number, number, number]): string[];

  // Debug & cache
  setDebug(enabled: boolean, level?: LogLevel): void;
  clearCache(): void;
  isFTSAvailable(): boolean;
}

interface GeocodeOptions {
  limit?: number;
  bbox?: [number, number, number, number];
  region?: string;
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
  bbox?: [number, number, number, number];
}

interface CountryDetectionResult {
  iso_a3: string;
  iso_a2: string;
  name_en: string;
  name_ar: string;
  continent: string;
}

interface AdminHierarchy {
  district?: { name_ar: string; name_en: string };
  governorate?: { name_ar: string; name_en: string };
  region?: { name_ar: string; name_en: string };
}

interface PostcodeInfo {
  postcode: string;
  region_ar?: string;
  region_en?: string;
  addr_count: number;
  tiles: string[];
}

export interface GeocodingResult {
  addr_id?: number;
  longitude: number;
  latitude: number;
  full_address_ar?: string;
  full_address_en?: string;
  postcode?: string;
  number?: string;
  street?: string;
  district_ar?: string;
  district_en?: string;
  city?: string;
  gov_ar?: string;
  gov_en?: string;
  region_ar?: string;
  region_en?: string;
  distance_m?: number;
  similarity?: number;
  h3_index?: string;
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

        const geoSDK = new GeoSDK({
          debug: true,
          logLevel: "debug",
        });
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
