# Saudi Arabia Geocoding SDK

[![npm version](https://badge.fury.io/js/@tabaqat%2Fgeocoding-sdk.svg)](https://www.npmjs.com/package/@tabaqat/geocoding-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**v0.1.0** - A browser-based geocoding SDK for Saudi Arabia using DuckDB-WASM. Zero backend dependencies - runs entirely in the browser with automatic fallback to default data source.

## Live Examples

Check out the interactive documentation and demos:

- **[React Example App](https://tabaqatdev.github.io/geocoding-wasm/examples/react/)** - Comprehensive demo with all SDK features
  - Playground with forward/reverse geocoding, postcode search
  - Full API documentation with interactive examples
  - MapLibre GL integration example
  - Arabic/English RTL/LTR support

## Architecture

```mermaid
flowchart TB
    subgraph DataSources["Data Sources"]
        OA[("OpenAddresses<br/>5.3M addresses")]
        OM[("Overture Maps<br/>Street names")]
        GADM[("GADM<br/>Boundaries")]
    end

    subgraph BuildPipeline["Build Pipeline (Python)"]
        direction TB
        B1["Load & Clean CSV"]
        B2["Enrich with Admin Boundaries<br/>(Spatial Join)"]
        B3["Enrich Streets<br/>(Overture Maps)"]
        B4["Generate H3 Tiles<br/>(Resolution 5)"]
        B5["Create Indexes"]
    end

    subgraph CDN["CDN Storage (source.coop)"]
        TI[("tile_index.parquet<br/>717 tiles metadata")]
        PI[("postcode_index.parquet<br/>6,499 postcodes")]
        TILES[("tiles/*.parquet<br/>~220KB avg each")]
        BOUNDS[("Boundary files<br/>countries/regions/districts")]
    end

    subgraph Browser["Browser Runtime"]
        SDK["GeoSDK"]
        DUCKDB["DuckDB-WASM"]
        CACHE["Tile Cache"]

        subgraph Queries["Query Types"]
            FWD["Forward Geocode<br/>(text → coords)"]
            REV["Reverse Geocode<br/>(coords → address)"]
            POST["Postcode Search"]
            NUM["House Number Search"]
        end
    end

    OA --> B1
    OM --> B3
    GADM --> B2
    B1 --> B2 --> B3 --> B4 --> B5
    B5 --> TI & PI & TILES & BOUNDS

    SDK --> DUCKDB
    DUCKDB <-->|"HTTP Range Requests"| CDN
    DUCKDB --> CACHE
    SDK --> Queries

    TI -.->|"Region/Bbox Filter"| FWD
    PI -.->|"Postcode → Tiles"| POST
    TILES -.->|"H3 Tile Lookup"| REV
    TI -.->|"Region Filter"| NUM
```

### How It Works

1. **Initialization** (~140KB): Loads tile index, postcode index, and boundary files
2. **Reverse Geocoding**: Computes H3 cell from coordinates → loads only that tile (~220KB)
3. **Forward Geocoding**: Uses region/bbox filters → queries only relevant tiles
4. **Postcode Search**: Looks up postcode in index → loads mapped tiles (avg 1.3 tiles)
5. **All queries**: DuckDB-WASM executes SQL on Parquet via HTTP range requests

## Features

- **Forward Geocoding**: Convert addresses to coordinates with Jaccard similarity matching
- **Reverse Geocoding**: Find nearest addresses from coordinates with H3 tile-based spatial indexing
- **Postcode Search**: Ultra-fast postcode lookups using indexed tile mapping (~1.3 tiles per postcode)
- **House Number Search**: Search by building number with region/bbox filtering
- **Country Detection**: Identify country from coordinates using spatial containment
- **Admin Hierarchy**: Get district and region info for Saudi Arabia coordinates
- **H3 Tile Loading**: Ultra-fast on-demand loading (~220KB average per tile)
- **Region Filtering**: Filter searches by region name for targeted queries
- **Bbox Filtering**: Optimize forward geocoding by limiting search to visible map area
- **Bilingual**: Full support for Arabic and English

## Performance

| Metric                   | Value                       |
| ------------------------ | --------------------------- |
| Reverse geocode (cold)   | **< 4 seconds**             |
| Reverse geocode (cached) | **< 100ms**                 |
| Postcode search          | **< 500ms** (avg 1.3 tiles) |
| Average tile size        | **220 KB**                  |
| Largest tile             | **6 MB**                    |
| Total tiles              | **717**                     |
| Total postcodes          | **6,499**                   |
| Initial load             | **~140 KB**                 |

## Installation

```bash
# npm
npm install @tabaqat/geocoding-sdk

# bun
bun add @tabaqat/geocoding-sdk

# pnpm
pnpm add @tabaqat/geocoding-sdk

# yarn
yarn add @tabaqat/geocoding-sdk
```

## Quick Start

### Basic Usage

```typescript
import { GeoSDK } from '@tabaqat/geocoding-sdk';

// Initialize SDK (uses H3 tiles by default)
const sdk = new GeoSDK();
await sdk.initialize();

// Forward geocoding (address → coordinates)
const results = await sdk.geocode('حي الروضة الرياض');
console.log(results[0]);
// { addr_id: 123, latitude: 24.7, longitude: 46.6, full_address_ar: '...', similarity: 0.85 }

// Reverse geocoding (coordinates → address) - ultra fast!
const nearby = await sdk.reverseGeocode(24.7136, 46.6753);
console.log(nearby[0]);
// { addr_id: 456, distance_m: 50, full_address_ar: '...' }

// Country detection
const country = await sdk.detectCountry(24.7136, 46.6753);
console.log(country);
// { iso_a2: 'SA', name_ar: 'المملكة العربية السعودية', name_en: 'Saudi Arabia' }
```

### Postcode Search (Ultra Fast!)

```typescript
// Search by postcode - only loads 1-3 tiles (avg 1.3)
const results = await sdk.searchByPostcode('13847');
console.log(results);
// All addresses with this postcode

// Combine with house number for exact match
const exact = await sdk.searchByPostcode('13847', { number: '2808' });
console.log(exact[0]);
// { addr_id: 123, number: '2808', postcode: '13847', ... }
```

### House Number Search

```typescript
// Search by house number within a specific region
const results = await sdk.searchByNumber('4037', {
  region: 'منطقة الرياض', // Filter by region
  limit: 10,
});

// Or search within visible map area
const results = await sdk.searchByNumber('4037', {
  bbox: [24.5, 46.5, 24.9, 47.0],
});
```

### Postcode Autocomplete

```typescript
// Get all postcodes starting with prefix (for autocomplete)
const postcodes = sdk.getPostcodes('138');
console.log(postcodes);
// [{ postcode: '13844', tiles: [...], addr_count: 500, region_ar: 'منطقة الرياض' }, ...]
```

### With Map Bbox Optimization

```typescript
// Optimize forward geocoding by limiting search to visible map area
const results = await sdk.geocode('شارع الملك فهد', {
  limit: 10,
  bbox: [24.5, 46.5, 24.9, 47.0], // [minLat, minLon, maxLat, maxLon]
});

// Or filter by region name
const results = await sdk.geocode('شارع الملك فهد', {
  region: 'منطقة الرياض',
});
```

### React Integration

```tsx
import { useState, useEffect } from 'react';
import { GeoSDK } from '@tabaqat/geocoding-sdk';

function useGeoSDK() {
  const [sdk, setSDK] = useState<GeoSDK | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const geoSDK = new GeoSDK();
        await geoSDK.initialize();
        setSDK(geoSDK);
      } catch (e) {
        setError(e as Error);
      } finally {
        setLoading(false);
      }
    };
    init();

    return () => {
      sdk?.close();
    };
  }, []);

  return { sdk, loading, error };
}

function AddressSearch() {
  const { sdk, loading, error } = useGeoSDK();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async () => {
    if (!sdk || !query) return;
    const addresses = await sdk.geocode(query, { limit: 5 });
    setResults(addresses);
  };

  if (loading) return <div>Loading geocoder...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search address..."
      />
      <button onClick={handleSearch}>Search</button>
      <ul>
        {results.map((r) => (
          <li key={r.addr_id}>
            {r.full_address_ar} ({(r.similarity * 100).toFixed(0)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Vue 3 Integration

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { GeoSDK } from '@tabaqat/geocoding-sdk';

const sdk = ref<GeoSDK | null>(null);
const loading = ref(true);
const query = ref('');
const results = ref([]);

onMounted(async () => {
  sdk.value = new GeoSDK();
  await sdk.value.initialize();
  loading.value = false;
});

onUnmounted(() => {
  sdk.value?.close();
});

async function search() {
  if (!sdk.value || !query.value) return;
  results.value = await sdk.value.geocode(query.value, { limit: 5 });
}
</script>

<template>
  <div v-if="loading">Loading geocoder...</div>
  <div v-else>
    <input v-model="query" placeholder="Search address..." />
    <button @click="search">Search</button>
    <ul>
      <li v-for="r in results" :key="r.addr_id">
        {{ r.full_address_ar }} ({{ (r.similarity * 100).toFixed(0) }}%)
      </li>
    </ul>
  </div>
</template>
```

### Next.js Integration

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with DuckDB-WASM
const GeocoderComponent = dynamic(() => import('./GeocoderComponent'), {
  ssr: false,
  loading: () => <div>Loading geocoder...</div>,
});

export default function MapPage() {
  return (
    <div>
      <h1>Saudi Arabia Geocoder</h1>
      <GeocoderComponent />
    </div>
  );
}

// GeocoderComponent.tsx (client-only component)
import { GeoSDK } from '@tabaqat/geocoding-sdk';

export default function GeocoderComponent() {
  const [sdk, setSDK] = useState<GeoSDK | null>(null);

  useEffect(() => {
    const init = async () => {
      const geoSDK = new GeoSDK();
      await geoSDK.initialize();
      setSDK(geoSDK);
    };
    init();
    return () => {
      sdk?.close();
    };
  }, []);

  // ... rest of component
}
```

## API Reference

### `GeoSDK` Class

The default `GeoSDK` uses H3 tile-based partitioning (V3) for optimal performance.

#### Constructor

```typescript
const sdk = new GeoSDK(config?: GeoSDKConfig);

interface GeoSDKConfig {
  dataUrl?: string;  // Custom data URL (default: source.coop V3 CDN)
  language?: 'ar' | 'en';  // Preferred language
  cache?: boolean;  // Enable caching
}
```

#### `initialize(): Promise<void>`

Initialize the SDK. Must be called before any other methods.

```typescript
await sdk.initialize();
```

#### `geocode(address: string, options?: GeocodeOptions): Promise<GeocodingResult[]>`

Forward geocoding - convert an address to coordinates.

```typescript
const results = await sdk.geocode('حي الروضة الرياض', {
  limit: 10, // Max results (default: 10)
  bbox: [24.5, 46.5, 24.9, 47.0], // Optional: limit to visible map area
});
```

**Bbox Optimization**: When a bounding box is provided, only H3 tiles overlapping that area are queried, dramatically reducing data transfer for map-based searches.

#### `reverseGeocode(lat: number, lon: number, options?: ReverseGeocodeOptions): Promise<GeocodingResult[]>`

Reverse geocoding - find addresses near coordinates.

```typescript
const nearby = await sdk.reverseGeocode(24.7136, 46.6753, {
  limit: 10, // Max results (default: 10)
  radiusMeters: 1000, // Search radius (default: 1000)
  detailLevel: 'postcode', // Column projection level (default: 'full')
});
```

**H3 Tile Loading**: Automatically determines which H3 tile contains the point and loads only that tile (~220KB average).

**Column Projection Optimization**: Control data transfer by specifying detail level:

- `'minimal'`: Only coordinates + distance (3 columns)
- `'postcode'`: + postcode + region (6 columns)
- `'region'`: + district + city (9 columns)
- `'full'`: All address fields (16 columns, default)

#### `detectCountry(lat: number, lon: number): Promise<CountryResult | null>`

Detect which country a coordinate is in.

```typescript
const country = await sdk.detectCountry(30.0444, 31.2357);
// { iso_a2: 'EG', name_ar: 'مصر', name_en: 'Egypt', continent: 'Africa' }
```

#### `getAdminHierarchy(lat: number, lon: number): Promise<AdminHierarchy>`

Get administrative hierarchy for Saudi Arabia coordinates.

```typescript
const admin = await sdk.getAdminHierarchy(24.7136, 46.6753);
// {
//   district: { name_ar: 'العليا', name_en: 'Al Olaya' },
//   region: { name_ar: 'منطقة الرياض', name_en: 'Riyadh Region' }
// }
```

#### `searchByPostcode(postcode: string, options?): Promise<GeocodingResult[]>`

Ultra-fast postcode search using indexed tile mapping. Only loads 1-3 tiles per query.

```typescript
const results = await sdk.searchByPostcode('13847', {
  limit: 50, // Max results (default: 50)
  number: '2808', // Optional: filter by house number
});
```

#### `searchByNumber(number: string, options?): Promise<GeocodingResult[]>`

Search by house number with region or bbox filtering.

```typescript
const results = await sdk.searchByNumber('4037', {
  region: 'منطقة الرياض', // Filter by region name
  bbox: [24.5, 46.5, 24.9, 47.0], // Or filter by bbox
  limit: 20, // Max results (default: 20)
});
```

#### `getPostcodes(prefix?: string): PostcodeInfo[]`

Get available postcodes for autocomplete. Returns from in-memory index (instant).

```typescript
// Get all postcodes
const all = sdk.getPostcodes();

// Filter by prefix
const filtered = sdk.getPostcodes('138');
// [{ postcode: '13844', tiles: ['...'], addr_count: 500, region_ar: '...' }, ...]
```

#### `getTilesByRegion(region: string): TileInfo[]`

Get tiles for a specific region. Useful for preloading or statistics.

```typescript
const riyadhTiles = sdk.getTilesByRegion('منطقة الرياض');
console.log(`${riyadhTiles.length} tiles in Riyadh region`);
```

#### `getStats(): Promise<Stats>`

Get statistics about the tile index.

```typescript
const stats = await sdk.getStats();
// { totalTiles: 717, totalAddresses: 5338646, totalSizeKb: 158234 }
```

#### `close(): Promise<void>`

Close the database connection and free resources.

```typescript
await sdk.close();
```

## Legacy SDK (V2)

For backward compatibility, region-based SDKs are available:

```typescript
import { GeoSDKLegacy, GeoSDKLazyLegacy } from '@tabaqat/geocoding-sdk';

// GeoSDKLegacy - auto-loads regions (~10-70MB each)
const sdk = new GeoSDKLegacy();

// GeoSDKLazyLegacy - manual region loading control
const sdkLazy = new GeoSDKLazyLegacy();
```

## Result Types

### `GeocodingResult`

```typescript
interface GeocodingResult {
  addr_id: number;
  longitude: number;
  latitude: number;
  number: string; // Building number
  street: string; // Street name
  postcode: string;
  district_ar: string;
  district_en: string;
  city: string;
  gov_ar: string; // Governorate (Arabic)
  gov_en: string; // Governorate (English)
  region_ar: string;
  region_en: string;
  full_address_ar: string;
  full_address_en: string;
  similarity?: number; // For forward geocoding (0-1)
  distance_m?: number; // For reverse geocoding (meters)
}
```

### `CountryResult`

```typescript
interface CountryResult {
  iso_a3: string; // 'SAU'
  iso_a2: string; // 'SA'
  name_en: string; // 'Saudi Arabia'
  name_ar: string; // 'المملكة العربية السعودية'
  continent: string; // 'Asia'
}
```

### `PostcodeInfo`

```typescript
interface PostcodeInfo {
  postcode: string; // '13847'
  tiles: string[]; // ['85654c3ffffffff'] - H3 tiles containing this postcode
  addr_count: number; // Number of addresses with this postcode
  region_ar?: string; // 'منطقة الرياض'
  region_en?: string; // 'Riyadh Region'
}
```

### `TileInfo`

```typescript
interface TileInfo {
  h3_tile: string; // '85654c3ffffffff'
  addr_count: number; // Addresses in tile
  min_lon: number;
  max_lon: number;
  min_lat: number;
  max_lat: number;
  file_size_kb: number;
  region_ar?: string; // Primary region (Arabic)
  region_en?: string; // Primary region (English)
}
```

## Data Coverage

- **5.3M+ addresses** across all 13 Saudi Arabia regions
- **717 H3 tiles** using resolution 5 (~250km² each)
- **36%** have street names (enriched from Overture Maps)
- **100%** have postcode, district, governorate, region
- Average tile size: **220 KB**
- Initial load: **~140 KB** (metadata + boundaries)

## Browser Support

- Chrome 80+
- Firefox 78+
- Safari 14+
- Edge 80+

Requires WebAssembly and Web Workers support.

## Custom Data URL

To host your own data files:

```typescript
const sdk = new GeoSDK({
  dataUrl: 'https://your-cdn.com/geocoding-data/v0.1.0',
});
```

**Automatic Fallback**: If your custom URL fails, the SDK automatically falls back to the default source.coop CDN.

Your CDN should serve:

- `tile_index.parquet` - H3 tile metadata (includes region info)
- `postcode_index.parquet` - Postcode to tiles mapping
- `world_countries_simple.parquet`
- `sa_regions_simple.parquet`
- `sa_districts_simple.parquet`
- `tiles/*.parquet` (717 files)

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

## Contributing

Contributions are welcome! This project uses:

- Pre-commit hooks (husky + lint-staged)
- Conventional commits (commitlint)
- ESLint + Prettier for code quality

See [RELEASE.md](RELEASE.md) for release process.

## License

MIT

## Credits

- Address data: [OpenAddresses](https://openaddresses.io/)
- Street names: [Overture Maps](https://overturemaps.org/)
- Boundaries: [GADM](https://gadm.org/)
- Query engine: [DuckDB-WASM](https://duckdb.org/docs/api/wasm)
- Spatial indexing: [H3](https://h3geo.org/)
