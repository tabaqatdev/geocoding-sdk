/**
 * H3-Tile Based Geocoding SDK using DuckDB-WASM
 *
 * V3 Architecture:
 * - Uses H3 hexagonal tiles at resolution 5 (~250km²)
 * - Each tile is a small parquet file (~500KB-2MB)
 * - Single row group per tile = 1-2 HTTP requests
 * - Dramatically faster reverse geocoding (<4s cold, <100ms cached)
 *
 * Usage:
 * ```ts
 * import { GeoSDK } from '@tabaqat/geocoding-sdk';
 *
 * const sdk = new GeoSDK();
 * await sdk.initialize();
 *
 * const nearby = await sdk.reverseGeocode(24.7, 46.6);  // <4s first time
 * const nearby2 = await sdk.reverseGeocode(24.71, 46.61); // <100ms (same tile)
 * ```
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { DEFAULT_DATA_URL } from './types';
import { logger as sdkLogger, type LogLevel } from './logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DuckDBRow = Record<string, any>;

/**
 * Convert Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to Western numerals (0123456789)
 * Also handles Persian digits (۰۱۲۳۴۵۶۷۸۹)
 */
function toWesternDigits(str: string): string {
  // Convert Arabic-Indic digits [٠-٩]
  const arabicStart = '٠'.charCodeAt(0);
  str = str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - arabicStart));

  // Convert Persian digits [۰-۹]
  const persianStart = '۰'.charCodeAt(0);
  str = str.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - persianStart));

  return str;
}

export interface TileInfo {
  h3_tile: string;
  addr_count: number;
  min_lon: number;
  max_lon: number;
  min_lat: number;
  max_lat: number;
  file_size_kb: number;
  region_ar?: string;
  region_en?: string;
}

export interface PostcodeInfo {
  postcode: string;
  tiles: string[];
  addr_count: number;
  region_ar?: string;
  region_en?: string;
}

export interface GeoSDKConfig {
  /** Base URL for parquet data files */
  dataUrl?: string;
  /** Default language for results */
  language?: 'ar' | 'en';
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Log level when debug is enabled (default: 'info') */
  logLevel?: LogLevel;
}

export interface GeocodingResult {
  addr_id: number;
  longitude: number;
  latitude: number;
  number?: string;
  street?: string;
  postcode?: string;
  district_ar?: string;
  district_en?: string;
  city?: string;
  gov_ar?: string;
  gov_en?: string;
  region_ar?: string;
  region_en?: string;
  full_address_ar?: string;
  full_address_en?: string;
  h3_index?: string;
  distance_m?: number;
  similarity?: number;
}

export interface CountryResult {
  iso_a3: string;
  iso_a2: string;
  name_en: string;
  name_ar: string;
  continent: string;
}

// Alias for backward compatibility
export type CountryDetectionResult = CountryResult;

export interface AdminHierarchy {
  district?: { id: string; name_ar: string; name_en: string };
  municipality?: { id: string; name_ar: string; name_en: string };
  governorate?: { id: string; name_ar: string; name_en: string };
  region?: { id: string; name_ar: string; name_en: string };
  settlement?: { id: string; name_ar: string; name_en: string; type?: string };
}

// H3 resolution for tile partitioning (matches build script)
const H3_TILE_RESOLUTION = 5;

export class GeoSDK {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private config: Required<GeoSDKConfig>;
  private initialized = false;
  private ftsAvailable = false;
  private adminViewsReady = false;
  private adminViewsPromise: Promise<void> | null = null;
  private actualBaseUrl = '';

  private tileIndex: TileInfo[] = [];
  private postcodeIndex: Map<string, PostcodeInfo> = new Map();
  private loadedTiles: Set<string> = new Set();

  // Caches for performance
  private searchCache: Map<string, { results: GeocodingResult[]; timestamp: number }> = new Map();
  private adminCache: Map<string, { result: AdminHierarchy; timestamp: number }> = new Map();
  private lastCountryResult: { lat: number; lon: number; result: CountryResult | null } | null =
    null;
  private districtNames: { ar: string[]; en: string[] } = { ar: [], en: [] };
  private streetNames: Map<string, string[]> = new Map(); // tile -> streets
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  constructor(config: GeoSDKConfig = {}) {
    this.config = {
      dataUrl: config.dataUrl ?? DEFAULT_DATA_URL,
      language: config.language ?? 'ar',
      debug: config.debug ?? false,
      logLevel: config.logLevel ?? 'info',
    };

    // Configure logger
    sdkLogger.configure({
      enabled: this.config.debug,
      level: this.config.logLevel,
      prefix: '[GeoSDK]',
    });
  }

  /**
   * Enable or disable debug logging at runtime
   */
  setDebug(enabled: boolean, level?: LogLevel): void {
    this.config.debug = enabled;
    if (level) this.config.logLevel = level;
    sdkLogger.setDebug(enabled);
    if (level) sdkLogger.setLevel(level);
  }

  /**
   * Progress callback for initialization steps
   */
  private onProgress?: (
    step: string,
    status: 'loading' | 'success' | 'error',
    timeMs?: number,
    details?: string
  ) => void;

  /**
   * Initialize SDK - loads only index files (~50KB)
   * @param options.onProgress - Optional callback for initialization progress
   */
  async initialize(
    options: {
      onProgress?: (
        step: string,
        status: 'loading' | 'success' | 'error',
        timeMs?: number,
        details?: string
      ) => void;
    } = {}
  ): Promise<void> {
    if (this.initialized) return;

    this.onProgress = options.onProgress;
    const report = (
      step: string,
      status: 'loading' | 'success' | 'error',
      timeMs?: number,
      details?: string
    ) => {
      if (this.onProgress) this.onProgress(step, status, timeMs, details);
    };

    let stepStart = performance.now();

    // Step 1: Load DuckDB WASM
    report('wasm', 'loading');
    sdkLogger.info('Initializing DuckDB-WASM...');

    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: 'text/javascript',
      })
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    this.conn = await this.db.connect();
    report('wasm', 'success', performance.now() - stepStart);

    // Step 2: Load Spatial extension
    stepStart = performance.now();
    report('spatial', 'loading');
    sdkLogger.info('Loading extensions...');
    await this.conn.query('INSTALL spatial; LOAD spatial;');
    report('spatial', 'success', performance.now() - stepStart);

    // Step 3: Load H3 extension
    stepStart = performance.now();
    report('h3', 'loading');
    await this.conn.query('INSTALL h3 FROM community; LOAD h3;');
    report('h3', 'success', performance.now() - stepStart);

    // Step 4: Try to load FTS extension
    stepStart = performance.now();
    report('fts', 'loading');
    try {
      await this.conn.query('INSTALL fts; LOAD fts;');
      this.ftsAvailable = true;
      sdkLogger.info('FTS extension loaded - BM25 search available');
      report('fts', 'success', performance.now() - stepStart, 'BM25 Arabic');
    } catch {
      this.ftsAvailable = false;
      sdkLogger.info('FTS extension not available, using JACCARD fallback');
      report('fts', 'error', performance.now() - stepStart, 'Fallback: JACCARD');
    }

    const baseUrl = this.config.dataUrl;
    sdkLogger.info('Loading index files from:', baseUrl);

    // Step 5: Load tile index with fallback
    stepStart = performance.now();
    report('tiles', 'loading');

    let indexResult;
    let actualBaseUrl = baseUrl;

    try {
      indexResult = await this.conn.query(`
        SELECT * FROM read_parquet('${baseUrl}/tile_index.parquet')
      `);
    } catch (error) {
      // If custom URL fails, try fallback to default
      if (baseUrl !== DEFAULT_DATA_URL) {
        sdkLogger.warn(`Failed to load from custom URL: ${baseUrl}`);
        sdkLogger.info(`Falling back to default URL: ${DEFAULT_DATA_URL}`);
        report('tiles', 'error', performance.now() - stepStart, 'Trying fallback URL');

        try {
          indexResult = await this.conn.query(`
            SELECT * FROM read_parquet('${DEFAULT_DATA_URL}/tile_index.parquet')
          `);
          actualBaseUrl = DEFAULT_DATA_URL;
          this.config.dataUrl = DEFAULT_DATA_URL; // Update config to use fallback
          sdkLogger.info('Successfully loaded from fallback URL');
        } catch {
          throw new Error(`Failed to load tile index from both custom and default URLs: ${error}`);
        }
      } else {
        throw error;
      }
    }

    this.tileIndex = indexResult.toArray().map((row: DuckDBRow) => ({
      h3_tile: row.h3_tile,
      addr_count: row.addr_count,
      min_lon: row.min_lon,
      max_lon: row.max_lon,
      min_lat: row.min_lat,
      max_lat: row.max_lat,
      file_size_kb: row.file_size_kb,
      region_ar: row.region_ar,
      region_en: row.region_en,
    }));
    sdkLogger.info(`Found ${this.tileIndex.length} H3 tiles`);
    report('tiles', 'success', performance.now() - stepStart, `${this.tileIndex.length} tiles`);

    // Step 6: Load postcode index
    stepStart = performance.now();
    report('postcodes', 'loading');
    try {
      const postcodeResult = await this.conn.query(`
        SELECT * FROM read_parquet('${actualBaseUrl}/postcode_index.parquet')
      `);
      for (const row of postcodeResult.toArray()) {
        // Convert DuckDB list to JavaScript array
        let tilesArray: string[];
        if (Array.isArray(row.tiles)) {
          tilesArray = row.tiles;
        } else if (row.tiles && typeof row.tiles.toArray === 'function') {
          tilesArray = row.tiles.toArray();
        } else if (row.tiles && typeof row.tiles === 'object') {
          tilesArray = Array.from(row.tiles);
        } else {
          tilesArray = [];
          sdkLogger.warn(`Unexpected tiles format for postcode ${row.postcode}:`, typeof row.tiles);
        }

        this.postcodeIndex.set(row.postcode, {
          postcode: row.postcode,
          tiles: tilesArray,
          addr_count: row.addr_count,
          region_ar: row.region_ar,
          region_en: row.region_en,
        });
      }
      sdkLogger.info(`Loaded ${this.postcodeIndex.size} postcodes`);
      report(
        'postcodes',
        'success',
        performance.now() - stepStart,
        `${this.postcodeIndex.size} postcodes`
      );
    } catch {
      sdkLogger.warn('Postcode index not available, searchByPostcode will be slower');
      report('postcodes', 'error', performance.now() - stepStart, 'Not available');
    }

    // Load world countries into memory (needed for isInSaudiArabia/detectCountry)
    // Region/governorate info is derived from municipality matches (100% coverage)
    stepStart = performance.now();
    report('boundaries', 'loading');
    await this.conn.query(`
      CREATE TABLE world_countries AS
      SELECT * FROM read_parquet('${actualBaseUrl}/world_countries_simple.parquet')
    `);

    // R-tree spatial index for fast ST_Contains queries
    try {
      await this.conn.query(
        `CREATE INDEX idx_world_geom ON world_countries USING RTREE (geometry)`
      );
    } catch {
      sdkLogger.warn('R-tree indexes not supported, continuing without spatial indexes');
    }
    report('boundaries', 'success', performance.now() - stepStart);

    // Admin boundary views (governorates, municipalities, districts, settlements)
    // are created lazily on first getAdminHierarchy() call to speed up init
    this.actualBaseUrl = actualBaseUrl;

    this.initialized = true;
    sdkLogger.info('Initialization complete');
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.conn) {
      throw new Error('GeoSDK not initialized. Call initialize() first.');
    }
  }

  /**
   * Lazily load admin boundary tables into memory on first use.
   * Only 3 tables needed: municipalities (100% coverage, contains region+gov columns),
   * districts (urban only), and settlements (nearest-point).
   * Region and governorate info is derived from the municipality match.
   */
  private async ensureAdminViews(): Promise<void> {
    if (this.adminViewsReady) return;

    // Deduplicate concurrent calls
    if (!this.adminViewsPromise) {
      this.adminViewsPromise = (async () => {
        const url = this.actualBaseUrl;
        const start = performance.now();
        sdkLogger.info('Loading admin boundary tables into memory...');
        await Promise.all([
          this.conn!.query(`
            CREATE TABLE IF NOT EXISTS sa_municipalities AS
            SELECT * FROM read_parquet('${url}/sa_municipalities_simple.parquet')
          `),
          this.conn!.query(`
            CREATE TABLE IF NOT EXISTS sa_districts AS
            SELECT * FROM read_parquet('${url}/sa_districts_simple.parquet')
          `),
          this.conn!.query(`
            CREATE TABLE IF NOT EXISTS sa_settlements AS
            SELECT * FROM read_parquet('${url}/sa_settlements.parquet')
          `),
        ]);

        // R-tree spatial indexes for polygon containment queries
        try {
          await Promise.all([
            this.conn!.query(
              `CREATE INDEX IF NOT EXISTS idx_muni_geom ON sa_municipalities USING RTREE (geometry)`
            ),
            this.conn!.query(
              `CREATE INDEX IF NOT EXISTS idx_dist_geom ON sa_districts USING RTREE (geometry)`
            ),
          ]);
          sdkLogger.info('R-tree spatial indexes created');
        } catch {
          sdkLogger.warn('R-tree indexes not supported, continuing without');
        }

        this.adminViewsReady = true;
        sdkLogger.info(
          `Admin boundary tables loaded in ${(performance.now() - start).toFixed(0)}ms`
        );
      })();
    }

    await this.adminViewsPromise;
  }

  /**
   * Get list of available tiles with stats
   */
  getTiles(): TileInfo[] {
    return [...this.tileIndex];
  }

  /**
   * Get currently loaded tiles
   */
  getLoadedTiles(): string[] {
    return [...this.loadedTiles];
  }

  /**
   * Check if FTS (Full Text Search) with BM25 scoring is available
   * When available, geocode() uses better Arabic-aware text search
   */
  isFTSAvailable(): boolean {
    return this.ftsAvailable;
  }

  /**
   * Get the search mode being used for text search
   */
  getSearchMode(): 'fts-bm25' | 'jaccard' {
    return this.ftsAvailable ? 'fts-bm25' : 'jaccard';
  }

  /**
   * Calculate H3 cell ID for a point at the tile resolution
   * Uses DuckDB's H3 extension
   */
  private async getH3TileForPoint(lat: number, lon: number): Promise<string | null> {
    const result = await this.conn!.query(`
      SELECT h3_h3_to_string(h3_latlng_to_cell(${lat}, ${lon}, ${H3_TILE_RESOLUTION})) as h3_tile
    `);
    const rows = result.toArray();
    return rows.length > 0 ? (rows[0] as DuckDBRow).h3_tile : null;
  }

  /**
   * Get neighboring H3 tiles (for edge cases near tile boundaries)
   */
  private async getNeighborTiles(h3Tile: string): Promise<string[]> {
    const result = await this.conn!.query(`
      SELECT h3_h3_to_string(cell) as neighbor
      FROM (
        SELECT UNNEST(h3_grid_disk(h3_string_to_h3('${h3Tile}'), 1)) as cell
      )
    `);
    return result.toArray().map((row: DuckDBRow) => row.neighbor);
  }

  /**
   * Check if a point is in Saudi Arabia.
   * Reuses detectCountry() to avoid duplicate world_countries queries.
   */
  async isInSaudiArabia(lat: number, lon: number): Promise<boolean> {
    this.ensureInitialized();
    // Quick bounding box check first
    if (lon < 34.5 || lon > 55.7 || lat < 16.3 || lat > 32.2) {
      return false;
    }
    const country = await this.detectCountry(lat, lon);
    return country?.iso_a2 === 'SA';
  }

  /**
   * Reverse geocoding using H3 tiles
   *
   * Performance:
   * - Cold start: <4 seconds (fetches only one small tile)
   * - Cached: <100ms (tile already in browser cache)
   */
  async reverseGeocode(
    lat: number,
    lon: number,
    options: {
      limit?: number;
      radiusMeters?: number;
      detailLevel?: 'minimal' | 'postcode' | 'region' | 'full';
      includeNeighbors?: boolean;
    } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    const limit = options.limit ?? 10;
    const radiusMeters = options.radiusMeters ?? 1000;
    const detailLevel = options.detailLevel ?? 'full';
    const includeNeighbors = options.includeNeighbors ?? false;

    // Check if point is in Saudi Arabia
    const inSA = await this.isInSaudiArabia(lat, lon);
    if (!inSA) {
      sdkLogger.info(`Point (${lat}, ${lon}) is outside Saudi Arabia`);
      return [];
    }

    // Get H3 tile for this point
    const h3Tile = await this.getH3TileForPoint(lat, lon);
    if (!h3Tile) {
      sdkLogger.warn(`Could not compute H3 tile for (${lat}, ${lon})`);
      return [];
    }

    // Check if this tile exists in our index
    const tileInfo = this.tileIndex.find((t) => t.h3_tile === h3Tile);
    if (!tileInfo) {
      sdkLogger.info(`No data tile for H3 cell: ${h3Tile}`);
      return [];
    }

    sdkLogger.info(
      `Querying tile ${h3Tile} (${tileInfo.file_size_kb} KB, ${tileInfo.addr_count.toLocaleString()} addresses)`
    );

    // Column projection based on detail level
    const columns = this.getColumnsForDetailLevel(detailLevel);
    const columnList = columns.join(', ');

    const baseUrl = this.config.dataUrl;
    const tilesToQuery = [h3Tile];

    // Optionally include neighboring tiles for points near tile boundaries
    if (includeNeighbors) {
      const neighbors = await this.getNeighborTiles(h3Tile);
      for (const neighbor of neighbors) {
        if (this.tileIndex.some((t) => t.h3_tile === neighbor)) {
          tilesToQuery.push(neighbor);
        }
      }
      sdkLogger.info(`Including ${tilesToQuery.length} tiles (neighbors)`);
    }

    // Build bounding box for spatial filter
    const latRadians = (lat * Math.PI) / 180;
    const lonDegPerKm = 1 / (111.32 * Math.cos(latRadians));
    const latDegPerKm = 1 / 110.574;
    const radiusKm = radiusMeters / 1000;
    const lonDelta = radiusKm * lonDegPerKm;
    const latDelta = radiusKm * latDegPerKm;

    // Build query for all tiles
    const tileUrls = tilesToQuery.map((t) => `'${baseUrl}/tiles/${t}.parquet'`);
    const parquetList = tileUrls.join(', ');

    // Query tile(s) directly with column projection
    const result = await this.conn!.query(`
      SELECT
        ${columnList},
        6371000 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(latitude) - RADIANS(${lat})) / 2), 2) +
          COS(RADIANS(${lat})) * COS(RADIANS(latitude)) *
          POWER(SIN((RADIANS(longitude) - RADIANS(${lon})) / 2), 2)
        )) as distance_m
      FROM read_parquet([${parquetList}])
      WHERE longitude BETWEEN ${lon - lonDelta} AND ${lon + lonDelta}
        AND latitude BETWEEN ${lat - latDelta} AND ${lat + latDelta}
      ORDER BY distance_m
      LIMIT ${limit}
    `);

    this.loadedTiles.add(h3Tile);
    return this.mapResultsToGeocodingResult(result.toArray(), detailLevel);
  }

  /**
   * Get column list based on detail level
   */
  private getColumnsForDetailLevel(level: 'minimal' | 'postcode' | 'region' | 'full'): string[] {
    const baseColumns = ['addr_id', 'longitude', 'latitude'];

    switch (level) {
      case 'minimal':
        return baseColumns;
      case 'postcode':
        return [...baseColumns, 'postcode', 'region_ar', 'region_en'];
      case 'region':
        return [
          ...baseColumns,
          'postcode',
          'district_ar',
          'district_en',
          'city',
          'region_ar',
          'region_en',
        ];
      case 'full':
      default:
        return ['*'];
    }
  }

  /**
   * Map query results to GeocodingResult
   */
  private mapResultsToGeocodingResult(
    rows: DuckDBRow[],
    detailLevel: 'minimal' | 'postcode' | 'region' | 'full'
  ): GeocodingResult[] {
    return rows.map((row: DuckDBRow) => {
      const result: GeocodingResult = {
        addr_id: Number(row.addr_id),
        longitude: row.longitude,
        latitude: row.latitude,
        distance_m: row.distance_m,
      };

      if (detailLevel === 'minimal') return result;

      if (detailLevel === 'postcode') {
        result.postcode = row.postcode;
        result.region_ar = row.region_ar;
        result.region_en = row.region_en;
        return result;
      }

      if (detailLevel === 'region') {
        result.postcode = row.postcode;
        result.district_ar = row.district_ar;
        result.district_en = row.district_en;
        result.city = row.city;
        result.region_ar = row.region_ar;
        result.region_en = row.region_en;
        return result;
      }

      // Full detail
      result.number = row.number;
      result.street = row.street;
      result.postcode = row.postcode;
      result.district_ar = row.district_ar;
      result.district_en = row.district_en;
      result.city = row.city;
      result.gov_ar = row.gov_ar;
      result.gov_en = row.gov_en;
      result.region_ar = row.region_ar;
      result.region_en = row.region_en;
      result.full_address_ar = row.full_address_ar;
      result.full_address_en = row.full_address_en;
      result.h3_index = row.h3_index;
      return result;
    });
  }

  /**
   * Detect country from coordinates.
   * Caches the last result so consecutive calls with the same coordinates
   * (e.g., detectCountry + reverseGeocode) don't re-query world_countries.
   */
  async detectCountry(lat: number, lon: number): Promise<CountryResult | null> {
    this.ensureInitialized();

    // Return cached result for same coordinates
    if (
      this.lastCountryResult &&
      this.lastCountryResult.lat === lat &&
      this.lastCountryResult.lon === lon
    ) {
      return this.lastCountryResult.result;
    }

    const result = await this.conn!.query(`
      SELECT iso_a3, iso_a2, name_en, name_ar, continent
      FROM world_countries
      WHERE ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);

    const rows = result.toArray();
    const countryResult =
      rows.length === 0
        ? null
        : {
            iso_a3: (rows[0] as DuckDBRow).iso_a3,
            iso_a2: (rows[0] as DuckDBRow).iso_a2,
            name_en: (rows[0] as DuckDBRow).name_en,
            name_ar: (rows[0] as DuckDBRow).name_ar,
            continent: (rows[0] as DuckDBRow).continent,
          };

    this.lastCountryResult = { lat, lon, result: countryResult };
    return countryResult;
  }

  /**
   * Round coordinate to a grid cell for caching (~500m grid)
   */
  private adminCacheKey(lat: number, lon: number): string {
    // ~0.005 degrees ≈ 500m — nearby clicks hit the same cache entry
    return `${(lat * 200).toFixed(0)},${(lon * 200).toFixed(0)}`;
  }

  /**
   * Get admin hierarchy for a point
   * Returns district, municipality, governorate, region, and nearest settlement
   *
   * Performance optimizations:
   * - Grid-based cache (~500m) avoids re-querying for nearby clicks
   * - Settlement uses bbox pre-filter on lat/lon columns (21K → ~tens of rows)
   * - Polygon layers (region/gov/municipality) run as one batch, settlement separate
   */
  async getAdminHierarchy(lat: number, lon: number): Promise<AdminHierarchy> {
    this.ensureInitialized();

    // Check cache first (~500m grid)
    const cacheKey = this.adminCacheKey(lat, lon);
    const cached = this.adminCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      sdkLogger.debug(`Admin hierarchy cache hit for (${lat}, ${lon})`);
      return cached.result;
    }

    // Ensure admin boundary tables are loaded (lazy, first call only)
    await this.ensureAdminViews();

    // Single combined query using 3 LATERAL JOINs on in-memory tables.
    // Municipality (100% SA coverage) provides region + governorate columns,
    // eliminating the need for separate sa_regions and sa_governorates tables.
    const result = await this.conn!.query(`
      WITH point AS (SELECT ST_Point(${lon}, ${lat}) AS geom)
      SELECT
        m.region_id, m.region_name_ar, m.region_name_en,
        m.governorate_id, m.governorate_name_ar, m.governorate_name_en,
        m.municipality_id, m.municipality_name_ar, m.municipality_name_en,
        d.district_id, d.district_name_ar, d.district_name_en,
        s.city_id, s.city_name_ar, s.city_name_en, s.city_type
      FROM point p
      LEFT JOIN LATERAL (
        SELECT municipality_id, municipality_name_ar, municipality_name_en,
               governorate_id, governorate_name_ar, governorate_name_en,
               region_id, region_name_ar, region_name_en
        FROM sa_municipalities WHERE ST_Contains(geometry, p.geom) LIMIT 1
      ) m ON TRUE
      LEFT JOIN LATERAL (
        SELECT district_id, district_name_ar, district_name_en
        FROM sa_districts WHERE ST_Contains(geometry, p.geom) LIMIT 1
      ) d ON TRUE
      LEFT JOIN LATERAL (
        SELECT city_id, city_name_ar, city_name_en, city_type
        FROM sa_settlements
        WHERE longitude BETWEEN ${lon} - 0.1 AND ${lon} + 0.1
          AND latitude BETWEEN ${lat} - 0.1 AND ${lat} + 0.1
        ORDER BY ST_Distance(geometry, p.geom)
        LIMIT 1
      ) s ON TRUE
    `);

    const hierarchy: AdminHierarchy = {};
    const rows = result.toArray();

    if (rows.length > 0) {
      const row = rows[0] as DuckDBRow;
      if (row.region_id) {
        hierarchy.region = {
          id: row.region_id,
          name_ar: row.region_name_ar,
          name_en: row.region_name_en,
        };
      }
      if (row.governorate_id) {
        hierarchy.governorate = {
          id: row.governorate_id,
          name_ar: row.governorate_name_ar,
          name_en: row.governorate_name_en,
        };
      }
      if (row.municipality_id) {
        hierarchy.municipality = {
          id: row.municipality_id,
          name_ar: row.municipality_name_ar,
          name_en: row.municipality_name_en,
        };
      }
      if (row.district_id) {
        hierarchy.district = {
          id: row.district_id,
          name_ar: row.district_name_ar,
          name_en: row.district_name_en,
        };
      }
      if (row.city_id) {
        hierarchy.settlement = {
          id: row.city_id,
          name_ar: row.city_name_ar,
          name_en: row.city_name_en,
          type: row.city_type,
        };
      }
    }

    // Cache the result
    if (this.adminCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.adminCache.keys().next().value;
      if (oldestKey) this.adminCache.delete(oldestKey);
    }
    this.adminCache.set(cacheKey, { result: hierarchy, timestamp: Date.now() });

    return hierarchy;
  }

  /**
   * Get H3 tiles that intersect a bounding box
   * This is the key optimization for forward geocoding with visible map area
   */
  async getTilesForBbox(
    minLat: number,
    minLon: number,
    maxLat: number,
    maxLon: number
  ): Promise<string[]> {
    // Filter tiles by bounding box intersection
    const matchingTiles = this.tileIndex.filter(
      (t) =>
        t.min_lon <= maxLon && t.max_lon >= minLon && t.min_lat <= maxLat && t.max_lat >= minLat
    );
    return matchingTiles.map((t) => t.h3_tile);
  }

  /**
   * Forward geocoding with bounding box optimization
   *
   * When the user is viewing a map, pass the visible bbox to only search
   * tiles that intersect the visible area. This dramatically reduces
   * the search space and data transfer.
   *
   * @param address - Search query (Arabic or English)
   * @param options.bbox - Visible map bounding box [minLat, minLon, maxLat, maxLon]
   * @param options.limit - Max results to return
   */
  async geocode(
    address: string,
    options: {
      limit?: number;
      bbox?: [number, number, number, number]; // [minLat, minLon, maxLat, maxLon]
      region?: string;
      regions?: string[]; // Support multiple regions
    } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    const limit = options.limit ?? 10;
    const baseUrl = this.config.dataUrl;
    // Normalize Arabic-Indic numerals and clean the address
    const normalizedAddress = toWesternDigits(address.trim());
    const cleanAddress = normalizedAddress.replace(/'/g, "''");

    let tilesToQuery: TileInfo[];

    // If bbox provided, only search tiles in visible area
    if (options.bbox) {
      const [minLat, minLon, maxLat, maxLon] = options.bbox;
      tilesToQuery = this.tileIndex.filter(
        (t) =>
          t.min_lon <= maxLon && t.max_lon >= minLon && t.min_lat <= maxLat && t.max_lat >= minLat
      );
      sdkLogger.info(`Bbox filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`);
    } else if (options.regions && options.regions.length > 0) {
      // Filter tiles by multiple regions
      tilesToQuery = this.tileIndex.filter(
        (t) =>
          options.regions!.includes(t.region_ar ?? '') ||
          options.regions!.includes(t.region_en ?? '')
      );
      sdkLogger.info(
        `Regions filter (${options.regions.length}): ${tilesToQuery.length}/${this.tileIndex.length} tiles`
      );
    } else if (options.region) {
      // Filter tiles by single region
      tilesToQuery = this.tileIndex.filter(
        (t) => t.region_ar === options.region || t.region_en === options.region
      );
      sdkLogger.info(`Region filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`);
    } else {
      // No filter - search all tiles (slow)
      sdkLogger.warn('No bbox provided. Consider passing map bounds for faster search.');
      tilesToQuery = this.tileIndex;
    }

    if (tilesToQuery.length === 0) {
      sdkLogger.info('No tiles match the search area');
      return [];
    }

    // Limit max tiles for performance
    // When no bbox, sample tiles evenly across regions for better coverage
    const MAX_TILES = 50;
    if (tilesToQuery.length > MAX_TILES) {
      if (options.bbox || options.region || (options.regions && options.regions.length > 0)) {
        // With filters, prefer smaller tiles (faster to load)
        tilesToQuery = tilesToQuery
          .sort((a, b) => a.file_size_kb - b.file_size_kb)
          .slice(0, MAX_TILES);
        sdkLogger.info(`Limited to ${MAX_TILES} smallest tiles`);
      } else {
        // Without filters, sample evenly for geographic coverage
        // Include mix of tile sizes to cover major cities too
        const step = Math.ceil(tilesToQuery.length / MAX_TILES);
        tilesToQuery = tilesToQuery.filter((_, i) => i % step === 0).slice(0, MAX_TILES);
        sdkLogger.info(`Sampled ${tilesToQuery.length} tiles evenly for coverage`);
      }
    }

    const tileUrls = tilesToQuery.map((t) => `'${baseUrl}/tiles/${t.h3_tile}.parquet'`);
    const parquetList = tileUrls.join(', ');

    // Detect if query is primarily Arabic or English
    const isArabic = /[\u0600-\u06FF]/.test(cleanAddress);
    const addressField = isArabic ? 'full_address_ar' : 'full_address_en';

    let result;

    // Use FTS with BM25 if available (better ranking for text search)
    if (this.ftsAvailable) {
      try {
        // Build WHERE clause for region filtering
        let regionFilter = `${addressField} IS NOT NULL`;
        if (options.regions && options.regions.length > 0) {
          const regionList = options.regions.map((r) => `'${r}'`).join(', ');
          regionFilter += ` AND (region_ar IN (${regionList}) OR region_en IN (${regionList}))`;
        } else if (options.region) {
          regionFilter += ` AND (region_ar = '${options.region}' OR region_en = '${options.region}')`;
        }

        // Create temp table with search data
        const tempTable = `fts_search_${Date.now()}`;
        await this.conn!.query(`
          CREATE OR REPLACE TABLE ${tempTable} AS
          SELECT
            addr_id, longitude, latitude,
            number, street, postcode,
            district_ar, district_en, city,
            gov_ar, gov_en, region_ar, region_en,
            full_address_ar, full_address_en
          FROM read_parquet([${parquetList}])
          WHERE ${regionFilter}
        `);

        // Create FTS index with Arabic stemmer
        const stemmer = isArabic ? 'arabic' : 'porter';
        await this.conn!.query(`
          PRAGMA create_fts_index(${tempTable}, addr_id, ${addressField}, stemmer='${stemmer}')
        `);

        // Run BM25 search
        result = await this.conn!.query(`
          SELECT
            addr_id, longitude, latitude,
            number, street, postcode,
            district_ar, district_en, city,
            gov_ar, gov_en, region_ar, region_en,
            full_address_ar, full_address_en,
            fts_main_${tempTable}.match_bm25(addr_id, '${cleanAddress}', fields := '${addressField}') as similarity
          FROM ${tempTable}
          WHERE similarity IS NOT NULL
          ORDER BY similarity DESC
          LIMIT ${limit}
        `);

        // Cleanup temp table
        await this.conn!.query(`DROP TABLE IF EXISTS ${tempTable}`);

        sdkLogger.info(`FTS BM25 search completed`);
      } catch (ftsError) {
        sdkLogger.warn('FTS search failed, falling back to JACCARD:', ftsError);
        // Fall through to JACCARD fallback
        result = null;
      }
    }

    // Fallback: JACCARD + LIKE filtering (when FTS not available or fails)
    if (!result) {
      // Extract search terms for CONTAINS filtering
      // Split on common delimiters and filter short words
      const searchTerms = cleanAddress
        .split(/[\s,،]+/)
        .filter((term) => term.length >= 2)
        .slice(0, 5); // Max 5 terms to avoid performance issues

      // Build CONTAINS conditions - at least one term must match
      const containsConditions =
        searchTerms.length > 0
          ? searchTerms
              .map((term) =>
                isArabic
                  ? `${addressField} LIKE '%${term}%'`
                  : `UPPER(${addressField}) LIKE UPPER('%${term}%')`
              )
              .join(' OR ')
          : 'TRUE';

      // Build region filter
      let regionWhereClause = '';
      if (options.regions && options.regions.length > 0) {
        const regionList = options.regions.map((r) => `'${r}'`).join(', ');
        regionWhereClause = ` AND (region_ar IN (${regionList}) OR region_en IN (${regionList}))`;
      } else if (options.region) {
        regionWhereClause = ` AND (region_ar = '${options.region}' OR region_en = '${options.region}')`;
      }

      // Use combination of CONTAINS (for relevance) + JACCARD (for ranking)
      result = await this.conn!.query(`
        SELECT
          addr_id, longitude, latitude,
          number, street, postcode,
          district_ar, district_en, city,
          gov_ar, gov_en, region_ar, region_en,
          full_address_ar, full_address_en,
          CASE
            WHEN ${isArabic} THEN JACCARD('${cleanAddress}', ${addressField})
            ELSE JACCARD(UPPER('${cleanAddress}'), UPPER(${addressField}))
          END as similarity
        FROM read_parquet([${parquetList}])
        WHERE ${addressField} IS NOT NULL
          AND (${containsConditions})${regionWhereClause}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `);
    }

    return result.toArray().map((row: DuckDBRow) => ({
      addr_id: Number(row.addr_id),
      longitude: row.longitude,
      latitude: row.latitude,
      number: row.number,
      street: row.street,
      postcode: row.postcode,
      district_ar: row.district_ar,
      district_en: row.district_en,
      city: row.city,
      gov_ar: row.gov_ar,
      gov_en: row.gov_en,
      region_ar: row.region_ar,
      region_en: row.region_en,
      full_address_ar: row.full_address_ar,
      full_address_en: row.full_address_en,
      similarity: row.similarity,
    }));
  }

  /**
   * Search with FTS (Full-Text Search) if available
   * Requires FTS index to be built during preprocessing
   *
   * Note: FTS provides better ranking than JACCARD for text search
   * but requires the FTS extension and pre-built index
   */
  async geocodeFTS(
    query: string,
    options: {
      limit?: number;
      bbox?: [number, number, number, number];
    } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    // Check if FTS extension is available
    try {
      await this.conn!.query('LOAD fts;');
    } catch {
      sdkLogger.warn('FTS extension not available, falling back to JACCARD');
      return this.geocode(query, options);
    }

    // TODO: Implement FTS-based search when phrase_index is available
    sdkLogger.warn('FTS search not yet implemented, using JACCARD');
    return this.geocode(query, options);
  }

  /**
   * Search addresses by postcode (highly optimized!)
   *
   * Uses postcode index to query only 1-3 tiles instead of all 717.
   * Average 1.29 tiles per postcode = very fast lookups.
   *
   * @param postcode - The postcode to search for (e.g., "13847", "24231")
   * @param options.limit - Max results to return
   * @param options.number - Optional house number filter
   */
  async searchByPostcode(
    postcode: string,
    options: {
      limit?: number;
      number?: string;
    } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    const limit = options.limit ?? 50;
    const baseUrl = this.config.dataUrl;

    // Normalize Arabic-Indic numerals to Western numerals
    const normalizedPostcode = toWesternDigits(postcode.trim());
    const normalizedNumber = options.number ? toWesternDigits(options.number.trim()) : undefined;

    // Look up postcode in index
    const postcodeInfo = this.postcodeIndex.get(normalizedPostcode);

    if (!postcodeInfo) {
      sdkLogger.info(`Postcode ${postcode} not found in index`);
      return [];
    }

    sdkLogger.info(
      `Postcode ${postcode}: ${postcodeInfo.addr_count} addresses in ${postcodeInfo.tiles.length} tiles`
    );

    // Query only the tiles that contain this postcode
    const tileUrls = postcodeInfo.tiles.map((t) => `'${baseUrl}/tiles/${t}.parquet'`);
    const parquetList = tileUrls.join(', ');

    // Build query with optional number filter
    const numberFilter = normalizedNumber
      ? `AND number = '${normalizedNumber.replace(/'/g, "''")}'`
      : '';

    const result = await this.conn!.query(`
      SELECT
        addr_id, longitude, latitude,
        number, street, postcode,
        district_ar, district_en, city,
        gov_ar, gov_en, region_ar, region_en,
        full_address_ar, full_address_en
      FROM read_parquet([${parquetList}])
      WHERE postcode = '${postcode}'
        ${numberFilter}
      ORDER BY number
      LIMIT ${limit}
    `);

    return result.toArray().map((row: DuckDBRow) => ({
      addr_id: Number(row.addr_id),
      longitude: row.longitude,
      latitude: row.latitude,
      number: row.number,
      street: row.street,
      postcode: row.postcode,
      district_ar: row.district_ar,
      district_en: row.district_en,
      city: row.city,
      gov_ar: row.gov_ar,
      gov_en: row.gov_en,
      region_ar: row.region_ar,
      region_en: row.region_en,
      full_address_ar: row.full_address_ar,
      full_address_en: row.full_address_en,
    }));
  }

  /**
   * Search by house number within a region or bbox
   *
   * Note: House numbers are not unique, so region filtering is recommended.
   *
   * @param number - House number to search (e.g., "2808", "4037")
   * @param options.region - Region name to filter by (e.g., "منطقة الرياض")
   * @param options.bbox - Bounding box to filter [minLat, minLon, maxLat, maxLon]
   * @param options.limit - Max results to return
   */
  async searchByNumber(
    number: string,
    options: {
      region?: string;
      bbox?: [number, number, number, number];
      limit?: number;
    } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    const limit = options.limit ?? 20;
    const baseUrl = this.config.dataUrl;
    // Normalize Arabic-Indic numerals to Western numerals
    const cleanNumber = toWesternDigits(number.trim()).replace(/'/g, "''");

    let tilesToQuery: TileInfo[];

    // Filter tiles by region (using new region_ar field in tile_index)
    if (options.region) {
      tilesToQuery = this.tileIndex.filter(
        (t) => t.region_ar === options.region || t.region_en === options.region
      );
      sdkLogger.info(`Region filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`);
    } else if (options.bbox) {
      const [minLat, minLon, maxLat, maxLon] = options.bbox;
      tilesToQuery = this.tileIndex.filter(
        (t) =>
          t.min_lon <= maxLon && t.max_lon >= minLon && t.min_lat <= maxLat && t.max_lat >= minLat
      );
      sdkLogger.info(`Bbox filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`);
    } else {
      sdkLogger.warn(
        'No region or bbox filter. House numbers are not unique - consider adding a filter.'
      );
      // Only search first 20 tiles to avoid huge queries
      tilesToQuery = this.tileIndex.slice(0, 20);
    }

    if (tilesToQuery.length === 0) {
      return [];
    }

    const tileUrls = tilesToQuery.map((t) => `'${baseUrl}/tiles/${t.h3_tile}.parquet'`);
    const parquetList = tileUrls.join(', ');

    // Build WHERE clause with region filtering
    let whereClause = `WHERE number = '${cleanNumber}'`;
    if (options.region) {
      whereClause += ` AND (region_ar = '${options.region}' OR region_en = '${options.region}')`;
    }

    const result = await this.conn!.query(`
      SELECT
        addr_id, longitude, latitude,
        number, street, postcode,
        district_ar, district_en, city,
        gov_ar, gov_en, region_ar, region_en,
        full_address_ar, full_address_en
      FROM read_parquet([${parquetList}])
      ${whereClause}
      ORDER BY postcode, street
      LIMIT ${limit}
    `);

    return result.toArray().map((row: DuckDBRow) => ({
      addr_id: Number(row.addr_id),
      longitude: row.longitude,
      latitude: row.latitude,
      number: row.number,
      street: row.street,
      postcode: row.postcode,
      district_ar: row.district_ar,
      district_en: row.district_en,
      city: row.city,
      gov_ar: row.gov_ar,
      gov_en: row.gov_en,
      region_ar: row.region_ar,
      region_en: row.region_en,
      full_address_ar: row.full_address_ar,
      full_address_en: row.full_address_en,
    }));
  }

  /**
   * Get list of available postcodes (for autocomplete)
   *
   * @param prefix - Optional prefix to filter (e.g., "138" -> "13844", "13847", "13848")
   */
  getPostcodes(prefix?: string): PostcodeInfo[] {
    const postcodes = Array.from(this.postcodeIndex.values());

    if (prefix) {
      return postcodes.filter((p) => p.postcode.startsWith(prefix));
    }

    return postcodes;
  }

  /**
   * Get autocomplete suggestions for address search
   * Returns matching districts, regions, and postcodes for quick selection
   *
   * @param query - Partial search query
   * @param options.limit - Max suggestions (default: 10)
   * @param options.types - Types to include: 'district' | 'region' | 'postcode' | 'all'
   */
  async getAutocompleteSuggestions(
    query: string,
    options: {
      limit?: number;
      types?: ('district' | 'region' | 'postcode')[] | 'all';
    } = {}
  ): Promise<
    Array<{
      type: 'district' | 'region' | 'postcode';
      value: string;
      label_ar: string;
      label_en: string;
      metadata?: Record<string, unknown>;
    }>
  > {
    this.ensureInitialized();

    const limit = options.limit ?? 10;
    const types =
      options.types === 'all'
        ? ['district', 'region', 'postcode']
        : (options.types ?? ['district', 'region', 'postcode']);
    const normalizedQuery = toWesternDigits(query.trim().toLowerCase());
    const isArabic = /[\u0600-\u06FF]/.test(query);

    const suggestions: Array<{
      type: 'district' | 'region' | 'postcode';
      value: string;
      label_ar: string;
      label_en: string;
      metadata?: Record<string, unknown>;
    }> = [];

    // Load district names if not cached
    if (this.districtNames.ar.length === 0) {
      await this.loadDistrictNames();
    }

    // Search postcodes
    if (types.includes('postcode') && /^\d+$/.test(normalizedQuery)) {
      const matchingPostcodes = this.getPostcodes(normalizedQuery).slice(0, limit);
      for (const pc of matchingPostcodes) {
        suggestions.push({
          type: 'postcode',
          value: pc.postcode,
          label_ar: pc.postcode,
          label_en: pc.postcode,
          metadata: { addr_count: pc.addr_count, region: pc.region_ar },
        });
      }
    }

    // Search districts
    if (types.includes('district')) {
      const searchField = isArabic ? this.districtNames.ar : this.districtNames.en;
      const matches = searchField
        .filter((name) => name.toLowerCase().includes(normalizedQuery))
        .slice(0, limit);

      for (const match of matches) {
        const idx = searchField.indexOf(match);
        suggestions.push({
          type: 'district',
          value: match,
          label_ar: this.districtNames.ar[idx] || match,
          label_en: this.districtNames.en[idx] || match,
        });
      }
    }

    // Search regions
    if (types.includes('region')) {
      const regions = this.tileIndex
        .map((t) => ({ ar: t.region_ar, en: t.region_en }))
        .filter((r, i, arr) => arr.findIndex((x) => x.ar === r.ar) === i);

      const matchingRegions = regions.filter((r) =>
        isArabic
          ? r.ar?.toLowerCase().includes(normalizedQuery)
          : r.en?.toLowerCase().includes(normalizedQuery)
      );

      for (const region of matchingRegions.slice(0, limit)) {
        suggestions.push({
          type: 'region',
          value: region.ar || region.en || '',
          label_ar: region.ar || '',
          label_en: region.en || '',
        });
      }
    }

    return suggestions.slice(0, limit);
  }

  /**
   * Load district names for autocomplete
   */
  private async loadDistrictNames(): Promise<void> {
    try {
      await this.ensureAdminViews();
      const result = await this.conn!.query(`
        SELECT DISTINCT district_name_ar, district_name_en FROM sa_districts
        ORDER BY district_name_ar
      `);

      const rows = result.toArray();
      this.districtNames.ar = rows.map((r: DuckDBRow) => r.district_name_ar).filter(Boolean);
      this.districtNames.en = rows.map((r: DuckDBRow) => r.district_name_en).filter(Boolean);

      sdkLogger.info(`Loaded ${this.districtNames.ar.length} district names for autocomplete`);
    } catch (e) {
      sdkLogger.warn('Failed to load district names:', e);
    }
  }

  /**
   * Fast geocode with caching - ideal for autocomplete/typeahead
   * Returns cached results if available, otherwise performs search
   *
   * @param query - Search query
   * @param options - Same as geocode()
   */
  async geocodeCached(
    query: string,
    options: {
      limit?: number;
      bbox?: [number, number, number, number];
      region?: string;
      regions?: string[];
    } = {}
  ): Promise<GeocodingResult[]> {
    const cacheKey = this.buildCacheKey(query, options);

    // Check cache
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      sdkLogger.debug(`Cache hit for: ${query}`);
      return cached.results;
    }

    // Perform search
    const results = await this.geocode(query, options);

    // Store in cache (with LRU eviction)
    if (this.searchCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey) this.searchCache.delete(oldestKey);
    }
    this.searchCache.set(cacheKey, { results, timestamp: Date.now() });

    return results;
  }

  /**
   * Build cache key for search
   */
  private buildCacheKey(
    query: string,
    options: { limit?: number; bbox?: unknown; region?: string; regions?: string[] }
  ): string {
    return JSON.stringify({
      q: query.toLowerCase().trim(),
      l: options.limit,
      r: options.region,
      rs: options.regions,
      b: options.bbox ? 'bbox' : undefined,
    });
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.searchCache.clear();
    this.adminCache.clear();
    sdkLogger.info('Search cache cleared');
  }

  /**
   * Smart geocode - analyzes query to optimize search strategy
   * Detects postcodes, districts, regions in query for faster results
   *
   * @param query - Search query (can include postcode, district, region hints)
   * @param options - Search options
   */
  async smartGeocode(
    query: string,
    options: {
      limit?: number;
      bbox?: [number, number, number, number];
    } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    const normalizedQuery = toWesternDigits(query.trim());
    const limit = options.limit ?? 10;

    // Detect postcode in query (5 digits)
    const postcodeMatch = normalizedQuery.match(/\b(\d{5})\b/);
    if (postcodeMatch && postcodeMatch[1]) {
      const postcode = postcodeMatch[1];
      const postcodeInfo = this.postcodeIndex.get(postcode);
      if (postcodeInfo) {
        sdkLogger.info(`Smart search: detected postcode ${postcode}`);
        // Search by postcode first, then filter by remaining query
        const results = await this.searchByPostcode(postcode, { limit: limit * 2 });

        // If there's more to the query, filter results
        const remainingQuery = normalizedQuery.replace(new RegExp(postcode, 'g'), '').trim();
        if (remainingQuery.length > 2) {
          const isArabic = /[\u0600-\u06FF]/.test(remainingQuery);
          return results
            .filter((r) => {
              const address = isArabic ? r.full_address_ar : r.full_address_en;
              return address?.toLowerCase().includes(remainingQuery.toLowerCase());
            })
            .slice(0, limit);
        }

        return results.slice(0, limit);
      }
    }

    // Detect region in query
    const detectedRegion = this.detectRegionInQuery(normalizedQuery);
    if (detectedRegion) {
      sdkLogger.info(`Smart search: detected region ${detectedRegion}`);
      return this.geocode(normalizedQuery, {
        ...options,
        region: detectedRegion,
        limit,
      });
    }

    // Fall back to regular geocode with caching
    return this.geocodeCached(normalizedQuery, { ...options, limit });
  }

  /**
   * Detect region name in query
   */
  private detectRegionInQuery(query: string): string | null {
    const lowerQuery = query.toLowerCase();

    // Check for region names in query
    const regions = [
      { ar: 'منطقة الرياض', en: 'riyadh' },
      { ar: 'منطقة مكة المكرمة', en: 'makkah' },
      { ar: 'المنطقة الشرقية', en: 'eastern' },
      { ar: 'منطقة المدينة المنورة', en: 'madinah' },
      { ar: 'منطقة القصيم', en: 'qassim' },
      { ar: 'منطقة عسير', en: 'asir' },
      { ar: 'منطقة تبوك', en: 'tabuk' },
      { ar: 'منطقة حائل', en: 'hail' },
      { ar: 'منطقة الحدود الشمالية', en: 'northern' },
      { ar: 'منطقة جازان', en: 'jazan' },
      { ar: 'منطقة نجران', en: 'najran' },
      { ar: 'منطقة الباحة', en: 'bahah' },
      { ar: 'منطقة الجوف', en: 'jawf' },
    ];

    for (const region of regions) {
      if (query.includes(region.ar) || lowerQuery.includes(region.en)) {
        return region.ar;
      }
    }

    return null;
  }

  /**
   * Get tiles filtered by region
   *
   * @param region - Region name (Arabic or English)
   */
  getTilesByRegion(region: string): TileInfo[] {
    return this.tileIndex.filter((t) => t.region_ar === region || t.region_en === region);
  }

  /**
   * Get stats about tiles
   */
  async getStats(): Promise<{
    tilesLoaded: number;
    totalTiles: number;
    totalAddresses: number;
    totalSizeKb: number;
  }> {
    this.ensureInitialized();

    return {
      tilesLoaded: this.loadedTiles.size,
      totalTiles: this.tileIndex.length,
      totalAddresses: this.tileIndex.reduce((sum, t) => sum + t.addr_count, 0),
      totalSizeKb: this.tileIndex.reduce((sum, t) => sum + t.file_size_kb, 0),
    };
  }

  /**
   * Close and cleanup — drops in-memory tables to free memory
   */
  async close(): Promise<void> {
    if (this.conn) {
      try {
        await this.conn.query(`
          DROP TABLE IF EXISTS world_countries;
          DROP TABLE IF EXISTS sa_municipalities;
          DROP TABLE IF EXISTS sa_districts;
          DROP TABLE IF EXISTS sa_settlements;
        `);
      } catch {
        // Ignore errors during cleanup
      }
      await this.conn.close();
    }
    if (this.db) await this.db.terminate();
    this.initialized = false;
    this.adminViewsReady = false;
    this.adminViewsPromise = null;
    this.lastCountryResult = null;
    this.loadedTiles.clear();
    this.searchCache.clear();
    this.adminCache.clear();
  }
}
