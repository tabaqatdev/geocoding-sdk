# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- `isInSaudiArabia()` - Quick boundary check
- `getPostcodes()` - Postcode autocomplete
- `getTilesByRegion()` - Region-based tile filtering

### Data

- Data hosted at `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/`
- 717 H3 tiles (resolution 5, ~250km² each)
- Average tile size: 220 KB
- 6,499 postcodes indexed
- Initial load: ~140 KB (index + boundaries)

### Developer Experience

- Pre-commit hooks prevent commits with lint/format errors
- Conventional commit messages enforced
- ESLint + Prettier for code quality
- Full TypeScript support with type declarations

[0.1.0]: https://github.com/tabaqatdev/geocoding-wasm/releases/tag/v0.1.0
