/**
 * @tabaqat/geocoding-sdk v0.1.0
 *
 * Browser-based geocoding SDK for Saudi Arabia using DuckDB-WASM
 * Supports Arabic and English with zero backend dependencies
 *
 * Main SDK uses H3 tile-based partitioning for ultra-fast queries
 * Legacy SDKs use region-based partitioning for backward compatibility
 *
 * H3 tiles (~220KB avg) provide <4s reverse geocoding
 * Initial load is ~140KB (index + boundaries)
 */

// Main SDK - H3 tile-based - RECOMMENDED
export { GeoSDKH3 as GeoSDK } from './geocoder-h3';

// Also export as GeoSDKH3 for explicit usage
export { GeoSDKH3 } from './geocoder-h3';

// Export H3 specific types
export type {
  TileInfo,
  PostcodeInfo,
  GeoSDKH3Config,
  AdminHierarchy,
  CountryDetectionResult,
} from './geocoder-h3';

// Legacy SDKs (region-based) - for backward compatibility
export { GeoSDK as GeoSDKLegacy } from './geocoder';
export { GeoSDKLazy as GeoSDKLazyLegacy } from './geocoder-lazy';

// Shared types
export type {
  GeocodingResult,
  CountryResult,
  AdminResult,
  GeoSDKConfig,
  GeocodeOptions,
  ReverseGeocodeOptions,
  ReverseGeocodeDetailLevel,
  DetectCountryOptions,
  Language,
} from './types';

export { DEFAULT_DATA_URL } from './types';
