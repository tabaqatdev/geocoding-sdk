# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] - 2026-04-06

### Added

- **`region_id` and `city_id` on `GeocodingResult`** - Forward and reverse geocoding results now include stable region and city identifiers, resolved via in-memory lookups built at init from `sa_municipalities` and `sa_settlements`

### Changed

- **Data URL updated to v0.4.2** - `DEFAULT_DATA_URL` now points to `v0.4.2`

## [0.4.1] - 2026-02-24

### Added

- **Major cities layer** (`sa_major_cities.parquet`) — 220 major Saudi cities with grade, amana, and alternate names
- **`MajorCityInfo` type** — Exported interface with `id`, `name_ar`, `name_en`, `alt_name_ar`, `alt_name_en`, `city_type`, `city_grade`, `amana_id`, `amana_name_ar`, `amana_name_en`, `distance_m`
- **`major_city` field in `AdminHierarchy`** — 4th LATERAL JOIN in `getAdminHierarchy()` returns nearest major city (no distance limit, only 220 rows)
- **`distance_m` on settlement and major_city** — Haversine distance in meters from query point to nearest settlement/major city

### Changed

- **Settlement search widened to ±0.5° (~55km)** — Was ±0.1° (~11km), causing NULL results in rural/desert areas
- **Major city search has no distance limit** — Removed bbox filter entirely (220 rows, <1ms full scan); always returns nearest major city within Saudi Arabia
- **Settlement and major_city gated on municipality** — Results only populated when point falls inside a Saudi municipality polygon, preventing leakage to other countries
- **Eager loading of all boundary tables** — All 5 tables (world_countries, municipalities, districts, settlements, major_cities) loaded in parallel during `initialize()` instead of lazy loading on first `getAdminHierarchy()` call. Total ~2MB — too small to justify lazy loading
- **Removed lazy loading infrastructure** — Deleted `ensureAdminViews()` method, `adminViewsReady`, `adminViewsPromise`, and `actualBaseUrl` fields
- **Data URL updated to v0.4.1** — `DEFAULT_DATA_URL` now points to `v0.4.1`
- **Filename cleanup** — Dropped `_simple` suffix from `sa_municipalities.parquet` and `sa_districts.parquet`
- **Column rename** — `is_geosa_major_city` → `is_major_city` in settlements schema
- **English transliteration normalization** — All 6,416 settlements now have consistent English names
- **6-level admin hierarchy** — `getAdminHierarchy()` now returns region → governorate → municipality → district → settlement → major city (up from 5 levels)

### Removed

- `data/SA_ADMIN_HIERARCHY_REPORT.md` — Internal research document removed from repository

## [0.4.0] - 2026-02-24

### Added

- **Municipality admin level** (`sa_municipalities_simple.parquet`) - 285 municipalities with polygon boundaries, 100% Saudi Arabia coverage
- **Settlement admin level** (`sa_settlements.parquet`) - 21,450 settlement points with nearest-point lookup
- **`municipality` field in `AdminHierarchy`** - Returns `id`, `name_ar`, `name_en` via ST_Contains polygon query
- **`settlement` field in `AdminHierarchy`** - Returns `id`, `name_ar`, `name_en`, `type` via nearest-point query
- **R-tree spatial indexes** on all polygon boundary tables for fast ST_Contains queries (graceful fallback if unsupported)
- **Country detection cache** - `detectCountry()` caches last result; `isInSaudiArabia()` reuses it to eliminate redundant world_countries queries
- **Native `console.time` init profiling** - Each initialization step shows timing in browser DevTools (wasm, spatial, h3, fts, tile index, postcode index, world_countries, admin tables)

### Changed

- **5-level admin hierarchy** - `getAdminHierarchy()` now returns region → governorate → municipality → district → settlement (up from 3 levels)
- **Data URL updated to v0.4.0** - All boundary files now use consistent column naming (`district_name_ar` instead of `name_ar`, `governorate_id` instead of `gov_id`, etc.)
- **In-memory TABLEs instead of VIEWs** - Admin boundary data loaded into DuckDB in-memory tables instead of views over remote Parquet, eliminating repeated HTTP fetches on every query
- **3 tables instead of 5** - Region and governorate info derived from municipality columns (100% coverage), eliminating separate `sa_regions` and `sa_governorates` parquet fetches. Only `sa_municipalities` + `sa_districts` + `sa_settlements` loaded (~1.9MB total)
- **Single LATERAL JOIN query** - `getAdminHierarchy()` uses one combined SQL query with 3 `LEFT JOIN LATERAL` instead of 5 separate queries, eliminating JS→Worker round-trips
- **Lazy admin table loading** - Municipalities, districts, and settlements tables are loaded on first `getAdminHierarchy()` call (not at init), keeping SDK initialization fast
- **Native console logging** - Replaced custom Logger class with `console.debug`/`console.info`/`console.warn`/`console.error` gated by `debug` config flag. Removed `logLevel` config — browser DevTools handles filtering natively. Production apps can strip via `esbuild: { drop: ['console'] }`
- **DuckDB-WASM upgraded to 1.33.1-dev18.0** (from dev5.0)
- **RTL text plugin downgraded to 0.2.3** — UMD format compatible with MapLibre's `importScripts` worker loading (0.3.0 ES modules broke it)
- District autocomplete uses new `district_name_ar`/`district_name_en` column names
- `close()` now properly drops in-memory tables and resets all state

## [0.3.0] - 2026-02-10

### Added

- **Governorate boundary layer** (`sa_governorates_simple.parquet`) - 133 governorates with geometry, derived from district boundaries
- **Admin IDs in `getAdminHierarchy()`** - Returns `id` for district (`district_id`), governorate (`gov_id`), and region (`region_id`) alongside `name_ar`/`name_en`
- **`sa_governorates` SQL view** created during SDK initialization
- **`DuckDBRow` type alias** - Replaces scattered `any` annotations for DuckDB query results

### Changed

- `AdminHierarchy` interface now includes `id: string` on `district`, `governorate`, and `region`
- `getAdminHierarchy()` queries all three admin levels (district, governorate, region) in parallel for better performance
- Governorate data now comes from dedicated boundary file instead of district table columns

### Fixed

- Resolved all 18 eslint warnings (unused catch variables, explicit `any` types)

## [0.2.3] - 2026-02-03

### Fixed

- **Region and district filtering now works correctly in SQL queries** - Previously, region/district filters only worked at the tile-selection level. Now filters are properly applied in SQL WHERE clauses:
  - `searchByNumber()` - Filters results by `region_ar`/`region_en` when `options.region` is provided
  - `geocode()` FTS mode - Filters temp table creation by `region`/`regions` options
  - `geocode()` JACCARD mode - Filters results by `region`/`regions` options
  - Verified with DuckDB CLI testing (house number 3293: 73 total results → 63 Riyadh-only when filtered)

### Changed

- Removed misleading "backward compatible" comment from region filtering code

## [0.2.2] - 2026-02-02

### Fixed

- **Added `similarity` property to `GeocodingResult` interface** - Resolves TypeScript errors when using similarity scores in geocoding results

### Changed

- Scoped SDK lint-staged to `src/**/*.{ts,tsx}` to avoid linting generated files
- Added YAML file formatting support to lint-staged configuration

## [0.2.1] - 2026-02-01

### Fixed

- **TypeScript definitions now included in npm package** - Added `clean` step to build to prevent stale `.d.ts` files
- Added `build:check` script to verify type definitions are generated

### Changed

- Pre-commit hook now runs typecheck and build verification
- `prepublishOnly` now uses `build:check` to ensure types are generated

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

[0.4.1]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.4.1
[0.4.0]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.4.0
[0.3.0]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.3.0
[0.2.3]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.2.3
[0.2.2]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.2.2
[0.2.1]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.2.1
[0.2.0]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.2.0
[0.1.2]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.1.2
[0.1.1]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.1.1
[0.1.0]: https://github.com/tabaqatdev/geocoding-sdk/releases/tag/v0.1.0
