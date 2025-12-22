/**
 * Geocoding SDK Types
 * Supports Arabic and English for Saudi Arabia
 */

export type Language = 'ar' | 'en';

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

export interface AdminResult {
  id: string;
  name_ar: string;
  name_en: string;
  level: 'region' | 'governorate' | 'district';
  parent_id?: string;
}

/** Default data URL hosted on source.coop */
export const DEFAULT_DATA_URL = 'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0';

export interface GeoSDKConfig {
  /** Base URL for parquet data files (default: source.coop) */
  dataUrl?: string;
  /** Default language for results */
  language?: Language;
  /** Enable caching in IndexedDB */
  cache?: boolean;
}

export interface GeocodeOptions {
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity score (0-1) */
  minSimilarity?: number;
  /** Filter by region (Arabic name) */
  region?: string;
  /** Filter by city name */
  city?: string;
  /** Language for output */
  language?: Language;
}

export type ReverseGeocodeDetailLevel =
  | 'minimal' // Just coordinates + distance (3 columns)
  | 'postcode' // + postcode + region (6 columns)
  | 'region' // + district + city (9 columns)
  | 'full'; // All fields (16 columns, default)

export interface ReverseGeocodeOptions {
  /** Maximum number of results */
  limit?: number;
  /** Maximum search radius in meters */
  radiusMeters?: number;
  /** Detail level for results (affects data transfer) */
  detailLevel?: ReverseGeocodeDetailLevel;
  /** Language for output */
  language?: Language;
}

export interface DetectCountryOptions {
  /** Language for country name output */
  language?: Language;
}
