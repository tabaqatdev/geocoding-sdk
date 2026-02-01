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
  district?: { name_ar: string; name_en: string };
  governorate?: { name_ar: string; name_en: string };
  region?: { name_ar: string; name_en: string };
}

// H3 resolution for tile partitioning (matches build script)
const H3_TILE_RESOLUTION = 5;

export class GeoSDK {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private config: Required<GeoSDKConfig>;
  private initialized = false;
  private ftsAvailable = false;

  private tileIndex: TileInfo[] = [];
  private postcodeIndex: Map<string, PostcodeInfo> = new Map();
  private loadedTiles: Set<string> = new Set();

  // Caches for performance
  private searchCache: Map<string, { results: GeocodingResult[]; timestamp: number }> = new Map();
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
    } catch (e) {
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
        } catch (fallbackError) {
          throw new Error(`Failed to load tile index from both custom and default URLs: ${error}`);
        }
      } else {
        throw error;
      }
    }

    this.tileIndex = indexResult.toArray().map((row: any) => ({
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
    } catch (e) {
      sdkLogger.warn('Postcode index not available, searchByPostcode will be slower');
      report('postcodes', 'error', performance.now() - stepStart, 'Not available');
    }

    // Load world countries (small)
    await this.conn.query(`
      CREATE VIEW world_countries AS
      SELECT * FROM read_parquet('${actualBaseUrl}/world_countries_simple.parquet')
    `);

    // Load SA regions boundaries (small)
    await this.conn.query(`
      CREATE VIEW sa_regions AS
      SELECT * FROM read_parquet('${actualBaseUrl}/sa_regions_simple.parquet')
    `);

    // Load SA districts boundaries (optional, ~500KB)
    await this.conn.query(`
      CREATE VIEW sa_districts AS
      SELECT * FROM read_parquet('${actualBaseUrl}/sa_districts_simple.parquet')
    `);

    this.initialized = true;
    sdkLogger.info('Initialization complete');
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.conn) {
      throw new Error('GeoSDK not initialized. Call initialize() first.');
    }
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
    return rows.length > 0 ? (rows[0] as any).h3_tile : null;
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
    return result.toArray().map((row: any) => row.neighbor);
  }

  /**
   * Check if a point is in Saudi Arabia
   */
  async isInSaudiArabia(lat: number, lon: number): Promise<boolean> {
    this.ensureInitialized();
    // Quick bounding box check first
    if (lon < 34.5 || lon > 55.7 || lat < 16.3 || lat > 32.2) {
      return false;
    }
    // Precise polygon check
    const result = await this.conn!.query(`
      SELECT 1 FROM world_countries
      WHERE iso_a2 = 'SA' AND ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);
    return result.toArray().length > 0;
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
    rows: any[],
    detailLevel: 'minimal' | 'postcode' | 'region' | 'full'
  ): GeocodingResult[] {
    return rows.map((row: any) => {
      const result: any = {
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
   * Detect country from coordinates
   */
  async detectCountry(lat: number, lon: number): Promise<CountryResult | null> {
    this.ensureInitialized();

    const result = await this.conn!.query(`
      SELECT iso_a3, iso_a2, name_en, name_ar, continent
      FROM world_countries
      WHERE ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);

    const rows = result.toArray();
    if (rows.length === 0) return null;

    const row = rows[0] as any;
    return {
      iso_a3: row.iso_a3,
      iso_a2: row.iso_a2,
      name_en: row.name_en,
      name_ar: row.name_ar,
      continent: row.continent,
    };
  }

  /**
   * Get admin hierarchy for a point
   * Returns district, governorate, and region information
   */
  async getAdminHierarchy(
    lat: number,
    lon: number
  ): Promise<{
    district?: { name_ar: string; name_en: string };
    governorate?: { name_ar: string; name_en: string };
    region?: { name_ar: string; name_en: string };
  }> {
    this.ensureInitialized();

    const districtResult = await this.conn!.query(`
      SELECT name_ar, name_en, gov_ar, gov_en, region_ar, region_en
      FROM sa_districts
      WHERE ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);

    const districtRows = districtResult.toArray();
    if (districtRows.length > 0) {
      const row = districtRows[0] as any;
      return {
        district: { name_ar: row.name_ar, name_en: row.name_en },
        governorate:
          row.gov_ar || row.gov_en
            ? { name_ar: row.gov_ar || '', name_en: row.gov_en || '' }
            : undefined,
        region: { name_ar: row.region_ar, name_en: row.region_en },
      };
    }

    const regionResult = await this.conn!.query(`
      SELECT name_ar, name_en
      FROM sa_regions
      WHERE ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);

    const regionRows = regionResult.toArray();
    if (regionRows.length > 0) {
      const row = regionRows[0] as any;
      return {
        region: { name_ar: row.name_ar, name_en: row.name_en },
      };
    }

    return {};
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
      // Filter tiles by single region (backward compatible)
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
          WHERE ${addressField} IS NOT NULL
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
          AND (${containsConditions})
        ORDER BY similarity DESC
        LIMIT ${limit}
      `);
    }

    return result.toArray().map((row: any) => ({
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

    return result.toArray().map((row: any) => ({
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

    const result = await this.conn!.query(`
      SELECT
        addr_id, longitude, latitude,
        number, street, postcode,
        district_ar, district_en, city,
        gov_ar, gov_en, region_ar, region_en,
        full_address_ar, full_address_en
      FROM read_parquet([${parquetList}])
      WHERE number = '${cleanNumber}'
      ORDER BY postcode, street
      LIMIT ${limit}
    `);

    return result.toArray().map((row: any) => ({
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
      const result = await this.conn!.query(`
        SELECT DISTINCT name_ar, name_en FROM sa_districts
        ORDER BY name_ar
      `);

      const rows = result.toArray();
      this.districtNames.ar = rows.map((r: any) => r.name_ar).filter(Boolean);
      this.districtNames.en = rows.map((r: any) => r.name_en).filter(Boolean);

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
   * Close and cleanup
   */
  async close(): Promise<void> {
    if (this.conn) await this.conn.close();
    if (this.db) await this.db.terminate();
    this.initialized = false;
    this.loadedTiles.clear();
  }
}
