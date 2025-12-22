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
 * const sdk = new GeoSDKH3({ dataUrl: 'https://...' });
 * await sdk.initialize();
 *
 * const nearby = await sdk.reverseGeocode(24.7, 46.6);  // <4s first time
 * const nearby2 = await sdk.reverseGeocode(24.71, 46.61); // <100ms (same tile)
 * ```
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { DEFAULT_DATA_URL } from './types';

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

export interface GeoSDKH3Config {
  dataUrl?: string;
  language?: 'ar' | 'en';
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
  region?: { name_ar: string; name_en: string };
}

// H3 resolution for tile partitioning (matches build script)
const H3_TILE_RESOLUTION = 5;

export class GeoSDKH3 {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private config: Required<GeoSDKH3Config>;
  private initialized = false;
  private ftsAvailable = false;

  private tileIndex: TileInfo[] = [];
  private postcodeIndex: Map<string, PostcodeInfo> = new Map();
  private loadedTiles: Set<string> = new Set();

  constructor(config: GeoSDKH3Config = {}) {
    this.config = {
      dataUrl: config.dataUrl ?? DEFAULT_DATA_URL,
      language: config.language ?? 'ar',
    };
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
    console.log('[GeoSDK-H3] Initializing DuckDB-WASM...');

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
    console.log('[GeoSDK-H3] Loading extensions...');
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
      console.log('[GeoSDK-H3] FTS extension loaded - BM25 search available');
      report('fts', 'success', performance.now() - stepStart, 'BM25 Arabic');
    } catch (e) {
      this.ftsAvailable = false;
      console.log('[GeoSDK-H3] FTS extension not available, using JACCARD fallback');
      report('fts', 'error', performance.now() - stepStart, 'Fallback: JACCARD');
    }

    const baseUrl = this.config.dataUrl;
    console.log('[GeoSDK-H3] Loading index files from:', baseUrl);

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
        console.warn(`[GeoSDK-H3] Failed to load from custom URL: ${baseUrl}`);
        console.log(`[GeoSDK-H3] Falling back to default URL: ${DEFAULT_DATA_URL}`);
        report('tiles', 'error', performance.now() - stepStart, 'Trying fallback URL');

        try {
          indexResult = await this.conn.query(`
            SELECT * FROM read_parquet('${DEFAULT_DATA_URL}/tile_index.parquet')
          `);
          actualBaseUrl = DEFAULT_DATA_URL;
          this.config.dataUrl = DEFAULT_DATA_URL; // Update config to use fallback
          console.log('[GeoSDK-H3] Successfully loaded from fallback URL');
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
    console.log(`[GeoSDK-H3] Found ${this.tileIndex.length} H3 tiles`);
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
          console.warn(
            `[GeoSDK-H3] Unexpected tiles format for postcode ${row.postcode}:`,
            typeof row.tiles
          );
        }

        this.postcodeIndex.set(row.postcode, {
          postcode: row.postcode,
          tiles: tilesArray,
          addr_count: row.addr_count,
          region_ar: row.region_ar,
          region_en: row.region_en,
        });
      }
      console.log(`[GeoSDK-H3] Loaded ${this.postcodeIndex.size} postcodes`);
      report(
        'postcodes',
        'success',
        performance.now() - stepStart,
        `${this.postcodeIndex.size} postcodes`
      );
    } catch (e) {
      console.warn('[GeoSDK-H3] Postcode index not available, searchByPostcode will be slower');
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
    console.log('[GeoSDK-H3] Initialization complete');
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
      console.log(`[GeoSDK-H3] Point (${lat}, ${lon}) is outside Saudi Arabia`);
      return [];
    }

    // Get H3 tile for this point
    const h3Tile = await this.getH3TileForPoint(lat, lon);
    if (!h3Tile) {
      console.warn(`[GeoSDK-H3] Could not compute H3 tile for (${lat}, ${lon})`);
      return [];
    }

    // Check if this tile exists in our index
    const tileInfo = this.tileIndex.find((t) => t.h3_tile === h3Tile);
    if (!tileInfo) {
      console.log(`[GeoSDK-H3] No data tile for H3 cell: ${h3Tile}`);
      return [];
    }

    console.log(
      `[GeoSDK-H3] Querying tile ${h3Tile} (${tileInfo.file_size_kb} KB, ${tileInfo.addr_count.toLocaleString()} addresses)`
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
      console.log(`[GeoSDK-H3] Including ${tilesToQuery.length} tiles (neighbors)`);
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
   */
  async getAdminHierarchy(
    lat: number,
    lon: number
  ): Promise<{
    district?: { name_ar: string; name_en: string };
    region?: { name_ar: string; name_en: string };
  }> {
    this.ensureInitialized();

    const districtResult = await this.conn!.query(`
      SELECT name_ar, name_en, region_ar, region_en
      FROM sa_districts
      WHERE ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);

    const districtRows = districtResult.toArray();
    if (districtRows.length > 0) {
      const row = districtRows[0] as any;
      return {
        district: { name_ar: row.name_ar, name_en: row.name_en },
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
      console.log(`[GeoSDK-H3] Bbox filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`);
    } else if (options.region) {
      // Filter tiles by region using region_ar/region_en in tile_index
      tilesToQuery = this.tileIndex.filter(
        (t) => t.region_ar === options.region || t.region_en === options.region
      );
      console.log(
        `[GeoSDK-H3] Region filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`
      );
    } else {
      // No filter - search all tiles (slow)
      console.warn('[GeoSDK-H3] No bbox provided. Consider passing map bounds for faster search.');
      tilesToQuery = this.tileIndex;
    }

    if (tilesToQuery.length === 0) {
      console.log('[GeoSDK-H3] No tiles match the search area');
      return [];
    }

    // Limit max tiles for performance
    // When no bbox, sample tiles evenly across regions for better coverage
    const MAX_TILES = 50;
    if (tilesToQuery.length > MAX_TILES) {
      if (options.bbox || options.region) {
        // With filters, prefer smaller tiles (faster to load)
        tilesToQuery = tilesToQuery
          .sort((a, b) => a.file_size_kb - b.file_size_kb)
          .slice(0, MAX_TILES);
        console.log(`[GeoSDK-H3] Limited to ${MAX_TILES} smallest tiles`);
      } else {
        // Without filters, sample evenly for geographic coverage
        // Include mix of tile sizes to cover major cities too
        const step = Math.ceil(tilesToQuery.length / MAX_TILES);
        tilesToQuery = tilesToQuery.filter((_, i) => i % step === 0).slice(0, MAX_TILES);
        console.log(`[GeoSDK-H3] Sampled ${tilesToQuery.length} tiles evenly for coverage`);
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

        console.log(`[GeoSDK-H3] FTS BM25 search completed`);
      } catch (ftsError) {
        console.warn('[GeoSDK-H3] FTS search failed, falling back to JACCARD:', ftsError);
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
      console.warn('[GeoSDK-H3] FTS extension not available, falling back to JACCARD');
      return this.geocode(query, options);
    }

    // TODO: Implement FTS-based search when phrase_index is available
    console.warn('[GeoSDK-H3] FTS search not yet implemented, using JACCARD');
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
      console.log(`[GeoSDK-H3] Postcode ${postcode} not found in index`);
      return [];
    }

    console.log(
      `[GeoSDK-H3] Postcode ${postcode}: ${postcodeInfo.addr_count} addresses in ${postcodeInfo.tiles.length} tiles`
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
      console.log(
        `[GeoSDK-H3] Region filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`
      );
    } else if (options.bbox) {
      const [minLat, minLon, maxLat, maxLon] = options.bbox;
      tilesToQuery = this.tileIndex.filter(
        (t) =>
          t.min_lon <= maxLon && t.max_lon >= minLon && t.min_lat <= maxLat && t.max_lat >= minLat
      );
      console.log(`[GeoSDK-H3] Bbox filter: ${tilesToQuery.length}/${this.tileIndex.length} tiles`);
    } else {
      console.warn(
        '[GeoSDK-H3] No region or bbox filter. House numbers are not unique - consider adding a filter.'
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
