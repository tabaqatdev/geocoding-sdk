/**
 * @tabaqat/geocoding-sdk
 *
 * Browser-based geocoding SDK for Saudi Arabia using DuckDB-WASM
 * Supports Arabic and English with zero backend dependencies
 *
 * Uses H3 tile-based partitioning for ultra-fast queries
 * H3 tiles (~220KB avg) provide <4s reverse geocoding
 * Initial load is ~140KB (index + boundaries)
 */

// Main SDK export
export { GeoSDK } from './geocoder-h3';

// Export all types from the SDK
export type {
  TileInfo,
  PostcodeInfo,
  GeoSDKConfig,
  GeocodingResult,
  CountryResult,
  CountryDetectionResult,
  AdminHierarchy,
  MajorCityInfo,
} from './geocoder-h3';

// Export logger utility
export { createLogger, type SDKLogger } from './logger';

// Export default data URL
export { DEFAULT_DATA_URL } from './types';
