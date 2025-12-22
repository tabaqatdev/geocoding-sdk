/**
 * Lazy-loading Geocoding SDK using DuckDB-WASM
 *
 * Features:
 * - Loads only region index initially (~1KB)
 * - Lazy loads region data on demand (~10-50MB per region)
 * - Caches loaded regions in memory
 * - Supports Arabic and English
 *
 * Usage:
 * ```ts
 * const sdk = new GeoSDKLazy({ dataUrl: 'https://...' });
 * await sdk.initialize();  // Only loads index (~200KB total)
 *
 * // These will auto-load needed regions:
 * const results = await sdk.geocode('حي الروضة', { region: 'منطقة الرياض' });
 * const nearby = await sdk.reverseGeocode(24.7, 46.6);
 * ```
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { DEFAULT_DATA_URL } from './types';

export interface RegionInfo {
  region_ar: string;
  file_name: string;
  addr_count: number;
  min_lon: number;
  max_lon: number;
  min_lat: number;
  max_lat: number;
  file_size_kb: number;
}

export interface GeoSDKLazyConfig {
  dataUrl?: string;
  language?: 'ar' | 'en';
}

export interface GeocodingResult {
  addr_id: number;
  longitude: number;
  latitude: number;
  number: string;
  street: string;
  postcode: string;
  district_ar: string;
  district_en: string;
  city: string;
  gov_ar: string;
  gov_en: string;
  region_ar: string;
  region_en: string;
  full_address_ar: string;
  full_address_en: string;
  similarity?: number;
  distance_m?: number;
}

export interface CountryResult {
  iso_a3: string;
  iso_a2: string;
  name_en: string;
  name_ar: string;
  continent: string;
}

export class GeoSDKLazy {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private config: Required<GeoSDKLazyConfig>;
  private initialized = false;

  private regionIndex: RegionInfo[] = [];
  private loadedRegions: Set<string> = new Set();

  constructor(config: GeoSDKLazyConfig = {}) {
    this.config = {
      dataUrl: config.dataUrl ?? DEFAULT_DATA_URL,
      language: config.language ?? 'ar',
    };
  }

  /**
   * Initialize SDK - loads only index files (~200KB)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[GeoSDK] Initializing DuckDB-WASM...');

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

    console.log('[GeoSDK] Loading extensions...');
    await this.conn.query('INSTALL spatial; LOAD spatial;');

    const baseUrl = this.config.dataUrl;
    console.log('[GeoSDK] Loading index files from:', baseUrl);

    // Load region index (tiny file)
    const indexResult = await this.conn.query(`
      SELECT * FROM read_parquet('${baseUrl}/region_index.parquet')
    `);
    this.regionIndex = indexResult.toArray().map((row: any) => ({
      region_ar: row.region_ar,
      file_name: row.file_name,
      addr_count: row.addr_count,
      min_lon: row.min_lon,
      max_lon: row.max_lon,
      min_lat: row.min_lat,
      max_lat: row.max_lat,
      file_size_kb: row.file_size_kb,
    }));

    console.log(`[GeoSDK] Found ${this.regionIndex.length} regions`);

    // Load world countries (small)
    await this.conn.query(`
      CREATE VIEW world_countries AS
      SELECT * FROM read_parquet('${baseUrl}/world_countries_simple.parquet')
    `);

    // Load SA regions boundaries (small)
    await this.conn.query(`
      CREATE VIEW sa_regions AS
      SELECT * FROM read_parquet('${baseUrl}/sa_regions_simple.parquet')
    `);

    // Load SA districts boundaries (optional, ~500KB)
    await this.conn.query(`
      CREATE VIEW sa_districts AS
      SELECT * FROM read_parquet('${baseUrl}/sa_districts_simple.parquet')
    `);

    // Create empty addresses table (will be populated on demand)
    // quadkey is included for tile-based spatial query optimization (Yosegi pattern)
    await this.conn.query(`
      CREATE TABLE addresses (
        addr_id BIGINT,
        longitude DOUBLE,
        latitude DOUBLE,
        number VARCHAR,
        street VARCHAR,
        postcode VARCHAR,
        district_ar VARCHAR,
        district_en VARCHAR,
        city VARCHAR,
        gov_ar VARCHAR,
        gov_en VARCHAR,
        region_ar VARCHAR,
        region_en VARCHAR,
        full_address_ar VARCHAR,
        full_address_en VARCHAR,
        quadkey VARCHAR
      )
    `);

    this.initialized = true;
    console.log('[GeoSDK] Initialization complete (lazy mode)');
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.conn) {
      throw new Error('GeoSDK not initialized. Call initialize() first.');
    }
  }

  /**
   * Get list of available regions with stats
   */
  getRegions(): RegionInfo[] {
    return [...this.regionIndex];
  }

  /**
   * Get currently loaded regions
   */
  getLoadedRegions(): string[] {
    return [...this.loadedRegions];
  }

  /**
   * Load a specific region's address data
   */
  async loadRegion(regionAr: string): Promise<boolean> {
    this.ensureInitialized();

    if (this.loadedRegions.has(regionAr)) {
      console.log(`[GeoSDK] Region already loaded: ${regionAr}`);
      return true;
    }

    const regionInfo = this.regionIndex.find((r) => r.region_ar === regionAr);
    if (!regionInfo) {
      console.warn(`[GeoSDK] Region not found: ${regionAr}`);
      return false;
    }

    console.log(
      `[GeoSDK] Loading region: ${regionAr} (${regionInfo.file_size_kb} KB, ${regionInfo.addr_count.toLocaleString()} addresses)`
    );

    const baseUrl = this.config.dataUrl;
    await this.conn!.query(`
      INSERT INTO addresses
      SELECT * FROM read_parquet('${baseUrl}/regions/${regionInfo.file_name}')
    `);

    this.loadedRegions.add(regionAr);
    console.log(`[GeoSDK] Region loaded: ${regionAr}`);

    return true;
  }

  /**
   * Check if a point is in Saudi Arabia (fast bounding box + precise polygon)
   */
  async isInSaudiArabia(lat: number, lon: number): Promise<boolean> {
    this.ensureInitialized();
    // Quick bounding box check first (SA approximate bounds)
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
   * Load regions that contain a point (only if in Saudi Arabia)
   * Uses precise polygon containment instead of bounding box to avoid loading multiple regions
   */
  async loadRegionsForPoint(lat: number, lon: number): Promise<string[]> {
    this.ensureInitialized();

    // Smart check: skip loading SA regions if point is outside Saudi Arabia
    const inSA = await this.isInSaudiArabia(lat, lon);
    if (!inSA) {
      return [];
    }

    // Use precise polygon containment instead of bounding box
    // This prevents loading multiple overlapping regions
    const regionResult = await this.conn!.query(`
      SELECT name_ar FROM sa_regions
      WHERE ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);

    const regionRows = regionResult.toArray();
    if (regionRows.length === 0) {
      console.log(`[GeoSDK] Point (${lat}, ${lon}) not in any SA region polygon`);
      return [];
    }

    const regionName = (regionRows[0] as any).name_ar;
    console.log(`[GeoSDK] Point is in region: ${regionName}`);

    if (await this.loadRegion(regionName)) {
      return [regionName];
    }

    return [];
  }

  /**
   * Smart hierarchical lazy loading for forward geocoding
   * Uses admin hierarchy (region -> governorate -> city -> district) parsing
   * to intelligently detect and load only the required region(s)
   */
  private async detectRegionsFromAddress(address: string): Promise<string[]> {
    const detectedRegions = new Set<string>();

    // Step 1: Direct region name matching
    for (const r of this.regionIndex) {
      if (address.includes(r.region_ar) || address.includes(r.region_ar.replace('منطقة ', ''))) {
        detectedRegions.add(r.region_ar);
        console.log(`[GeoSDK] Detected region from text: ${r.region_ar}`);
      }
    }

    if (detectedRegions.size > 0) {
      return Array.from(detectedRegions);
    }

    // Step 2: Query sa_districts for city/governorate/district matches
    try {
      const cleanAddr = address.replace(/'/g, "''");

      const adminResult = await this.conn!.query(`
        SELECT DISTINCT region_ar, name_ar, city, gov_ar
        FROM sa_districts
        WHERE name_ar LIKE '%${cleanAddr}%'
           OR city LIKE '%${cleanAddr}%'
           OR gov_ar LIKE '%${cleanAddr}%'
        LIMIT 5
      `);

      for (const row of adminResult.toArray() as any[]) {
        if (row.region_ar && this.regionIndex.some((r) => r.region_ar === row.region_ar)) {
          detectedRegions.add(row.region_ar);
          console.log(`[GeoSDK] Inferred region from admin hierarchy: ${row.region_ar}`);
        }
      }

      // Step 3: Try partial word matching for common city names
      const words = address.split(/\s+/).filter((w) => w.length > 2);
      for (const word of words) {
        const wordResult = await this.conn!.query(`
          SELECT DISTINCT region_ar FROM sa_districts
          WHERE city LIKE '%${word.replace(/'/g, "''")}%'
             OR gov_ar LIKE '%${word.replace(/'/g, "''")}%'
          LIMIT 3
        `);
        for (const row of wordResult.toArray() as any[]) {
          if (row.region_ar && this.regionIndex.some((r) => r.region_ar === row.region_ar)) {
            detectedRegions.add(row.region_ar);
          }
        }
      }
    } catch (e) {
      console.warn('[GeoSDK] Admin hierarchy lookup failed:', e);
    }

    return Array.from(detectedRegions);
  }

  /**
   * Forward geocoding with lazy region loading
   */
  async geocode(
    address: string,
    options: { limit?: number; region?: string } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    const limit = options.limit ?? 10;

    // If region specified by user, load it
    if (options.region) {
      await this.loadRegion(options.region);
    } else {
      // Smart hierarchical detection: parse address for admin hierarchy hints
      const detectedRegions = await this.detectRegionsFromAddress(address);

      if (detectedRegions.length > 0) {
        for (const r of detectedRegions) {
          await this.loadRegion(r);
        }
      } else if (this.loadedRegions.size === 0) {
        // Fallback: load Riyadh (largest population center)
        console.log('[GeoSDK] No region detected, falling back to Riyadh');
        await this.loadRegion('منطقة الرياض');
      }
    }

    const cleanAddress = address.trim().replace(/'/g, "''").toUpperCase();

    const result = await this.conn!.query(`
      SELECT
        *,
        JACCARD('${cleanAddress}', UPPER(full_address_ar)) as similarity
      FROM addresses
      ${options.region ? `WHERE region_ar = '${options.region}'` : ''}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);

    return result.toArray().map((row: any) => ({
      addr_id: row.addr_id,
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
   * Get column list based on detail level for column projection optimization
   * This reduces data transfer by only fetching needed columns from Parquet files
   */
  private getColumnsForDetailLevel(level: 'minimal' | 'postcode' | 'region' | 'full'): string[] {
    const baseColumns = ['addr_id', 'longitude', 'latitude'];

    switch (level) {
      case 'minimal':
        // Just coordinates + distance (3 columns) -> ~3MB
        return baseColumns;
      case 'postcode':
        // + postcode + region (6 columns) -> ~4MB
        return [...baseColumns, 'postcode', 'region_ar', 'region_en'];
      case 'region':
        // + district + city (9 columns) -> ~6MB
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
        // All columns (16 columns) -> ~47MB
        return ['*'];
    }
  }

  /**
   * Map query results to GeocodingResult based on detail level
   */
  private mapResultsToGeocodingResult(
    rows: any[],
    detailLevel: 'minimal' | 'postcode' | 'region' | 'full'
  ): GeocodingResult[] {
    return rows.map((row: any) => {
      // Start with required fields (convert BigInt to Number)
      const result: any = {
        addr_id: Number(row.addr_id),
        longitude: row.longitude,
        latitude: row.latitude,
        distance_m: row.distance_m,
      };

      if (detailLevel === 'minimal') {
        return result as GeocodingResult;
      }

      if (detailLevel === 'postcode') {
        result.postcode = row.postcode;
        result.region_ar = row.region_ar;
        result.region_en = row.region_en;
        return result as GeocodingResult;
      }

      if (detailLevel === 'region') {
        result.postcode = row.postcode;
        result.district_ar = row.district_ar;
        result.district_en = row.district_en;
        result.city = row.city;
        result.region_ar = row.region_ar;
        result.region_en = row.region_en;
        return result as GeocodingResult;
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
      return result as GeocodingResult;
    });
  }

  /**
   * Reverse geocoding - queries Parquet files directly with column projection
   * Uses quadkey prefix matching for efficient row group pruning (Yosegi pattern)
   *
   * Column Projection Optimization:
   * - minimal: 3 columns → ~3MB via HTTP range requests (94% reduction)
   * - postcode: 6 columns → ~4MB via HTTP range requests (92% reduction)
   * - region: 9 columns → ~6MB via HTTP range requests (88% reduction)
   * - full: 16 columns → ~47MB (default, backward compatible)
   *
   * NOTE: This queries Parquet directly WITHOUT pre-loading into memory.
   * Each query fetches only the needed columns and rows via HTTP range requests.
   */
  async reverseGeocode(
    lat: number,
    lon: number,
    options: {
      limit?: number;
      radiusMeters?: number;
      detailLevel?: 'minimal' | 'postcode' | 'region' | 'full';
    } = {}
  ): Promise<GeocodingResult[]> {
    this.ensureInitialized();

    const limit = options.limit ?? 10;
    const radiusMeters = options.radiusMeters ?? 1000;
    const detailLevel = options.detailLevel ?? 'full';

    // Find which region contains this point
    const inSA = await this.isInSaudiArabia(lat, lon);
    if (!inSA) {
      console.log(`[GeoSDK] Point (${lat}, ${lon}) is outside Saudi Arabia`);
      return [];
    }

    // Get region name via polygon containment
    const regionResult = await this.conn!.query(`
      SELECT name_ar FROM sa_regions
      WHERE ST_Contains(geometry, ST_Point(${lon}, ${lat}))
      LIMIT 1
    `);

    const regionRows = regionResult.toArray();
    if (regionRows.length === 0) {
      console.log(`[GeoSDK] Point (${lat}, ${lon}) not in any SA region polygon`);
      return [];
    }

    const regionName = (regionRows[0] as any).name_ar;
    const regionInfo = this.regionIndex.find((r) => r.region_ar === regionName);

    if (!regionInfo) {
      console.warn(`[GeoSDK] Region file not found for: ${regionName}`);
      return [];
    }

    console.log(`[GeoSDK] Querying ${regionInfo.file_name} with detail level: ${detailLevel}`);

    // Calculate optimal zoom level for quadkey prefix matching
    // Use higher zoom for better row group pruning (more selective prefix)
    const zoomForRadius = Math.max(
      14,
      Math.min(23, Math.floor(20 - Math.log2(radiusMeters / 100)))
    );

    // Generate quadkey prefix for spatial filtering
    const quadkeyPrefix = await this.conn!.query(
      `
      SELECT ST_Quadkey(ST_Point(${lon}, ${lat}), ${zoomForRadius}) as qk
    `
    ).then((r) => r.toArray()[0]?.qk || '');

    console.log(
      `[GeoSDK] Using quadkey prefix: ${quadkeyPrefix} (zoom ${zoomForRadius}) for row group pruning`
    );

    const latRadians = (lat * Math.PI) / 180;
    const lonDegPerKm = 1 / (111.32 * Math.cos(latRadians));
    const latDegPerKm = 1 / 110.574;
    const radiusKm = radiusMeters / 1000;
    const lonDelta = radiusKm * lonDegPerKm;
    const latDelta = radiusKm * latDegPerKm;

    // Column projection: only fetch needed columns based on detail level
    const columns = this.getColumnsForDetailLevel(detailLevel);
    const columnList = columns.join(', ');

    const baseUrl = this.config.dataUrl;
    const parquetUrl = `${baseUrl}/regions/${regionInfo.file_name}`;

    // Query Parquet directly with column projection
    // Yosegi pattern: quadkey sorting + row group pruning + column projection
    // 1. quadkey LIKE filters row groups (thanks to ORDER BY quadkey in build)
    // 2. Bounding box filter provides additional pruning
    // 3. Column projection reduces data transfer via HTTP range requests
    const result = await this.conn!.query(`
      SELECT
        ${columnList},
        6371000 * 2 * ASIN(SQRT(
          POWER(SIN((RADIANS(latitude) - RADIANS(${lat})) / 2), 2) +
          COS(RADIANS(${lat})) * COS(RADIANS(latitude)) *
          POWER(SIN((RADIANS(longitude) - RADIANS(${lon})) / 2), 2)
        )) as distance_m
      FROM read_parquet('${parquetUrl}')
      WHERE quadkey LIKE '${quadkeyPrefix}%'
        AND longitude BETWEEN ${lon - lonDelta} AND ${lon + lonDelta}
        AND latitude BETWEEN ${lat - latDelta} AND ${lat + latDelta}
      ORDER BY distance_m
      LIMIT ${limit}
    `);

    return this.mapResultsToGeocodingResult(result.toArray(), detailLevel);
  }

  /**
   * Detect country from coordinates (works without loading regions)
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
   * Get admin hierarchy for a point (works without loading address regions)
   */
  async getAdminHierarchy(
    lat: number,
    lon: number
  ): Promise<{
    district?: { name_ar: string; name_en: string };
    region?: { name_ar: string; name_en: string };
  }> {
    this.ensureInitialized();

    // Try district first
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

    // Fallback to region
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
   * Get stats about loaded data
   */
  async getStats(): Promise<{
    regionsLoaded: number;
    totalRegions: number;
    addressesLoaded: number;
  }> {
    this.ensureInitialized();

    const countResult = await this.conn!.query('SELECT COUNT(*) as cnt FROM addresses');
    const addressCount = (countResult.toArray()[0] as any).cnt;

    return {
      regionsLoaded: this.loadedRegions.size,
      totalRegions: this.regionIndex.length,
      addressesLoaded: addressCount,
    };
  }

  /**
   * Close and cleanup
   */
  async close(): Promise<void> {
    if (this.conn) await this.conn.close();
    if (this.db) await this.db.terminate();
    this.initialized = false;
    this.loadedRegions.clear();
  }
}
