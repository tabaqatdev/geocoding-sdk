# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-01

### ⚠️ BREAKING CHANGES

- **Removed legacy SDKs**: `GeoSDKLegacy` and `GeoSDKLazyLegacy` have been removed. Use `GeoSDK` instead.
- **Renamed type**: `GeoSDKH3Config` renamed to `GeoSDKConfig`
- **Simplified exports**: Only `GeoSDK` is now exported (previously aliased as `GeoSDKH3`)

### Added

#### New SDK Methods

- `geocodeCached()` - Forward geocoding with LRU cache (100 entries, 5min TTL)
- `smartGeocode()` - Auto-detects postcodes/regions in query for optimized routing
- `getAutocompleteSuggestions()` - District/postcode/region suggestions for typeahead
- `isInSaudiArabia()` - Quick boundary check for coordinates
- `setDebug()` - Enable/disable debug logging at runtime
- `clearCache()` - Clear the search result cache

#### New Options

- `regions[]` filter for multi-region queries in `geocode()`
- `includeNeighbors` option for reverse geocoding to search adjacent H3 tiles
- `logLevel` option in config: `'debug' | 'info' | 'warn' | 'error' | 'none'`

#### Logging System

- New configurable logger with multiple log levels
- Runtime control via `setDebug(enabled, level?)`
- Prefixed logs with `[GeoSDK]` for easy filtering

#### Documentation

- Added `docs/ARCHITECTURE.md` with detailed system documentation
- Auto-generated API documentation using TypeDoc
- New `docs:json` script to generate API docs for React example
- CI workflow regenerates API docs on SDK source changes

#### Example App Improvements

- Search method selector (Standard/Cached/Smart)
- Cache clear button in playground
- Bbox scope toggle for house number search
- Improved mobile responsiveness in header
- API reference page now displays all 23 SDK methods

### Changed

- Unified SDK class name from `GeoSDKH3` to `GeoSDK`
- Logger prefix changed from `[GeoSDK-H3]` to `[GeoSDK]`
- Simplified `src/index.ts` exports
- Simplified `src/types.ts` to only `DEFAULT_DATA_URL`
- Updated README with complete API documentation

### Removed

- `src/geocoder.ts` (legacy region-based SDK)
- `src/geocoder-lazy.ts` (legacy lazy-loading SDK)
- `GeoSDKLegacy` export
- `GeoSDKLazyLegacy` export
- Legacy type exports from `types.ts`

### Fixed

- Mobile header text now has proper padding from screen edges
- API reference page correctly parses TypeDoc output

### Developer Experience

- Added `typedoc.json` configuration
- Added `api-docs-parser.ts` utility for parsing TypeDoc output
- Updated dependencies (React, MapLibre, Tailwind, TypeScript, etc.)

## [0.1.2] - 2026-01-15

- Repository URL fix
- CI/CD workflow improvements

## [0.1.1] - 2026-01-14

- Initial npm publish setup
- README URL fixes

## [0.1.0] - 2025-12-23

### Added

- Initial release of Saudi Arabia Geocoding SDK
- H3 tile-based geocoding with ultra-fast reverse geocoding (<4s cold, <100ms cached)
- Forward geocoding with BM25/JACCARD similarity matching
- Postcode search with indexed tile mapping (avg 1.3 tiles per postcode)
- House number search with region/bbox filtering
- Country detection using spatial containment
- Admin hierarchy lookup for Saudi Arabia
- Bilingual support (Arabic and English)
- Column projection optimization for reduced data transfer
- Pre-commit hooks with husky, lint-staged, and commitlint
- Comprehensive TypeScript type definitions
- 717 H3 tiles covering 5.3M+ addresses

### Features

- `reverseGeocode()` - Find addresses near coordinates
- `geocode()` - Convert addresses to coordinates
- `searchByPostcode()` - Ultra-fast postcode lookups
- `searchByNumber()` - House number search
- `detectCountry()` - Identify country from coordinates
- `getAdminHierarchy()` - Get district and region info
- `getPostcodes()` - Postcode autocomplete
- `getTilesByRegion()` - Region-based tile filtering

### Data

- Data hosted at `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/`
- 717 H3 tiles (resolution 5, ~250km² each)
- Average tile size: 220 KB
- 6,499 postcodes indexed
- Initial load: ~140 KB (index + boundaries)

[0.2.0]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.2.0
[0.1.2]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.1.2
[0.1.1]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.1.1
[0.1.0]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.1.0
