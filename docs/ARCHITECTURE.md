# Geocoding SDK Architecture

> Browser-based geocoding for Saudi Arabia using DuckDB-WASM + H3 spatial indexing

## Quick Stats

| Metric        | Value  |
| ------------- | ------ |
| Addresses     | 5.3M+  |
| Regions       | 13     |
| H3 Tiles      | 717    |
| Postcodes     | 6,499  |
| Districts     | 5,478  |
| Avg Tile Size | 220KB  |
| Max Tile Size | 6MB    |
| Total Data    | ~154MB |

---

## System Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser Runtime"]
        App["React App"]
        SDK["GeoSDK-H3"]
        DuckDB["DuckDB-WASM"]

        subgraph Extensions["DuckDB Extensions"]
            Spatial["Spatial"]
            H3["H3"]
            FTS["FTS (optional)"]
        end

        subgraph Memory["In-Memory State"]
            TileIdx["Tile Index (50KB)"]
            PostIdx["Postcode Map (10KB)"]
            TileCache["Loaded Tiles Cache"]
            SearchCache["Search LRU Cache (100 entries)"]
            DistrictNames["District Names (AR/EN)"]
        end
    end

    subgraph CDN["CDN (source.coop)"]
        Indexes["Index Files"]
        Tiles["717 Tile Files"]
        Boundaries["Boundary Files"]
    end

    App --> SDK
    SDK --> DuckDB
    DuckDB --> Extensions
    DuckDB --> Memory
    DuckDB -->|HTTP Range Requests| CDN
```

---

## Data Flow

### Initialization

```mermaid
sequenceDiagram
    participant App
    participant SDK
    participant DuckDB
    participant CDN

    App->>SDK: initialize()
    SDK->>DuckDB: Load WASM
    SDK->>DuckDB: INSTALL spatial, h3, fts
    SDK->>CDN: GET tile_index.parquet
    SDK->>CDN: GET postcode_index.parquet
    SDK->>DuckDB: CREATE VIEW world_countries
    SDK->>DuckDB: CREATE VIEW sa_regions
    SDK->>DuckDB: CREATE VIEW sa_districts
    SDK-->>App: Ready (~140KB loaded)
```

### Reverse Geocoding

```mermaid
sequenceDiagram
    participant User
    participant SDK
    participant DuckDB
    participant CDN

    User->>SDK: reverseGeocode(lat, lon)
    SDK->>DuckDB: h3_latlng_to_cell(lat, lon, 5)
    DuckDB-->>SDK: h3_tile ID
    SDK->>SDK: Lookup tile in index
    SDK->>CDN: GET tiles/{h3_tile}.parquet
    SDK->>DuckDB: SELECT with Haversine distance
    DuckDB-->>SDK: Nearby addresses
    SDK-->>User: GeocodingResult[]
```

### Forward Geocoding

```mermaid
sequenceDiagram
    participant User
    participant SDK
    participant DuckDB
    participant CDN

    User->>SDK: geocode(query, {bbox?, region?, regions?})
    SDK->>SDK: Filter tiles by bbox/region/regions
    SDK->>SDK: Limit to 50 tiles max
    SDK->>CDN: GET tiles/*.parquet (parallel)

    alt FTS Available
        SDK->>DuckDB: CREATE temp FTS index
        SDK->>DuckDB: BM25 search with Arabic stemmer
    else JACCARD Fallback
        SDK->>DuckDB: JACCARD similarity + LIKE
    end

    DuckDB-->>SDK: Ranked results
    SDK-->>User: GeocodingResult[]
```

### Postcode Search

```mermaid
sequenceDiagram
    participant User
    participant SDK
    participant CDN

    User->>SDK: searchByPostcode("12345")
    SDK->>SDK: postcodeIndex.get("12345")
    Note right of SDK: Returns 1-3 tile IDs (avg 1.29)
    SDK->>CDN: GET only mapped tiles
    SDK-->>User: GeocodingResult[]
```

---

## Parquet Schema

### tile_index.parquet

```
h3_tile       VARCHAR   -- H3 cell ID (res 5)
addr_count    INTEGER   -- Addresses in tile
min_lon       DOUBLE    -- Bounding box
max_lon       DOUBLE
min_lat       DOUBLE
max_lat       DOUBLE
file_size_kb  INTEGER   -- Tile file size
region_ar     VARCHAR   -- Primary region (Arabic)
region_en     VARCHAR   -- Primary region (English)
```

### postcode_index.parquet

```
postcode      VARCHAR   -- 5-digit postcode
tiles         VARCHAR[] -- H3 tile IDs containing this postcode
addr_count    BIGINT    -- Total addresses
region_ar     VARCHAR
region_en     VARCHAR
```

### tiles/\*.parquet (Address Data)

```
addr_id         BIGINT   -- Unique address ID
longitude       DOUBLE
latitude        DOUBLE
number          VARCHAR  -- House/building number
street          VARCHAR  -- Street name (~96% coverage)
postcode        VARCHAR  -- Always present
district_ar     VARCHAR
district_en     VARCHAR
city            VARCHAR  -- City name (single field)
gov_ar          VARCHAR  -- Governorate Arabic
gov_en          VARCHAR  -- Governorate English
region_ar       VARCHAR
region_en       VARCHAR
full_address_ar VARCHAR  -- Concatenated full address
full_address_en VARCHAR
h3_index        VARCHAR  -- H3 cell (higher resolution)
```

### Boundary Files

```
-- world_countries_simple.parquet
iso_a3, iso_a2, name_en, name_ar, continent, geometry

-- sa_regions_simple.parquet
region_id, name_ar, name_en, centroid, geometry

-- sa_districts_simple.parquet
district_id, name_ar, name_en, city, region_ar, region_en, gov_ar, gov_en, centroid, geometry
```

---

## SDK API

### Configuration

```typescript
const sdk = new GeoSDK({
  dataUrl?: string,           // Custom CDN URL (default: source.coop)
  language?: 'ar' | 'en',     // Default language (default: 'ar')
  debug?: boolean,            // Enable debug logging (default: false)
  logLevel?: LogLevel         // 'debug' | 'info' | 'warn' | 'error' | 'none'
});

// Enable/disable debug at runtime
sdk.setDebug(true);
sdk.setDebug(true, 'debug');  // With log level
```

### Core Methods

```typescript
// Initialize (required first)
await sdk.initialize({ onProgress? })

// Reverse geocoding - coordinates to address
await sdk.reverseGeocode(lat, lon, {
  limit?: number,           // default: 10
  radiusMeters?: number,    // default: 1000
  detailLevel?: 'minimal' | 'postcode' | 'region' | 'full',
  includeNeighbors?: boolean
})

// Forward geocoding - address to coordinates
await sdk.geocode(query, {
  limit?: number,           // default: 10
  bbox?: [minLat, minLon, maxLat, maxLon],
  region?: string,          // single region name
  regions?: string[]        // multiple regions (NEW)
})

// Cached forward geocoding (LRU cache, 5min TTL)
await sdk.geocodeCached(query, options)

// Smart geocoding (auto-detects postcode/region in query)
await sdk.smartGeocode(query, options)

// Autocomplete suggestions
await sdk.getAutocompleteSuggestions(query, { limit?, bbox?, regions? })
// Returns: { suggestions: string[], type: 'district' | 'postcode' | 'general' }

// Postcode lookup (optimized - 1-3 tiles)
await sdk.searchByPostcode(postcode, {
  limit?: number,
  number?: string           // optional house number filter
})

// House number search
await sdk.searchByNumber(number, {
  limit?: number,
  region?: string,
  bbox?: [minLat, minLon, maxLat, maxLon]
})

// Country detection
await sdk.detectCountry(lat, lon)
// Returns: { iso_a3, iso_a2, name_en, name_ar, continent }

// Quick Saudi Arabia check
await sdk.isInSaudiArabia(lat, lon)
// Returns: boolean

// Admin hierarchy
await sdk.getAdminHierarchy(lat, lon)
// Returns: { district?, governorate?, region? } - each with {name_ar, name_en}

// Tile management
sdk.getTiles()                       // TileInfo[]
sdk.getLoadedTiles()                 // string[]
sdk.getTilesByRegion(region)         // TileInfo[]
await sdk.getTilesForBbox(bbox)      // string[]

// Utilities
sdk.getPostcodes(prefix?)            // PostcodeInfo[] for autocomplete
sdk.getSearchMode()                  // 'fts-bm25' | 'jaccard'
sdk.isFTSAvailable()                 // boolean
await sdk.getStats()                 // { totalTiles, totalAddresses, tilesLoaded, totalSizeKb }

// Cache management
sdk.clearCache()                     // Clear search result cache

// Cleanup
await sdk.close()
```

### Return Types

```typescript
interface GeocodingResult {
  addr_id: number;
  longitude: number;
  latitude: number;
  number?: string;
  street?: string;
  postcode?: string;
  district_ar?: string;
  district_en?: string;
  city?: string; // Note: single field, not city_ar/city_en
  gov_ar?: string;
  gov_en?: string;
  region_ar?: string;
  region_en?: string;
  full_address_ar?: string;
  full_address_en?: string;
  h3_index?: string; // H3 cell index (higher resolution)
  distance_m?: number; // reverse geocoding
  similarity?: number; // forward geocoding (0-1)
}

interface AdminHierarchy {
  district?: { name_ar: string; name_en: string };
  governorate?: { name_ar: string; name_en: string };
  region?: { name_ar: string; name_en: string };
}
```

---

## Frontend-SDK Alignment (FIXED)

### Changes Made

| Issue           | Before                       | After                                        |
| --------------- | ---------------------------- | -------------------------------------------- |
| Region filter   | `region: string` only        | `region?: string` + `regions?: string[]`     |
| Admin hierarchy | Missing governorate          | Includes `district`, `governorate`, `region` |
| Frontend types  | Mismatched with SDK          | Aligned with SDK return types                |
| City field      | Expected `city_ar/en`        | Uses `city` (single field)                   |
| h3_index        | Missing from GeocodingResult | Added `h3_index?: string`                    |
| Missing methods | 12 methods not exposed       | All SDK methods now in context               |
| Debug logging   | Not configurable             | `setDebug()` + log levels                    |
| Search cache    | Not available                | `geocodeCached()` + `clearCache()`           |

### SDK geocode() Options

```typescript
await sdk.geocode(query, {
  limit?: number,
  bbox?: [minLat, minLon, maxLat, maxLon],
  region?: string,        // Single region (backward compatible)
  regions?: string[]      // Multiple regions (NEW)
});
```

### AdminHierarchy Response

```typescript
// getAdminHierarchy() now returns:
{
  district?: { name_ar: string; name_en: string },
  governorate?: { name_ar: string; name_en: string },  // NEW
  region?: { name_ar: string; name_en: string }
}
```

### Playground Search Scope

The playground now includes toggles for:

- **Use visible map bounds** - limits search to current viewport bbox
- **Filter by region** - dropdown to select Saudi region

---

## Performance

| Operation                   | Cold   | Cached |
| --------------------------- | ------ | ------ |
| Reverse geocode             | <4s    | <100ms |
| Forward geocode (with bbox) | 2-5s   | <500ms |
| Postcode search             | <500ms | <100ms |
| Country detection           | <100ms | <50ms  |

### Column Projection (detailLevel)

| Level    | Columns | ~Transfer |
| -------- | ------- | --------- |
| minimal  | 3       | ~3MB      |
| postcode | 6       | ~4MB      |
| region   | 9       | ~6MB      |
| full     | 16      | ~47MB     |

---

## Caching & Search Optimization

### LRU Search Cache

The SDK maintains an in-memory LRU cache for forward geocoding results:

- **Cache size**: 100 entries max
- **TTL**: 5 minutes
- **Key**: Normalized query + options hash
- **Use**: `geocodeCached()` for repeated searches

```typescript
// Cached search - uses LRU cache
const results = await sdk.geocodeCached('الرياض', { limit: 10 });

// Clear cache manually
sdk.clearCache();
```

### Smart Geocoding

`smartGeocode()` auto-detects query patterns for optimized routing:

```typescript
// Detects postcode pattern → routes to searchByPostcode()
await sdk.smartGeocode('12345');

// Detects region in query → adds region filter
await sdk.smartGeocode('مكة الرياض'); // Filters to Riyadh region

// Regular query → uses standard geocode()
await sdk.smartGeocode('حي النخيل');
```

### Autocomplete

```typescript
// Get district/postcode suggestions
const { suggestions, type } = await sdk.getAutocompleteSuggestions('الر', {
  limit: 10,
  regions: ['منطقة الرياض'], // Optional region filter
});

// type: 'district' | 'postcode' | 'general'
// suggestions: ["الرياض", "الروضة", "الربوة", ...]
```

### Scope Filtering Best Practices

```typescript
// 1. Use bbox for map-based search (fastest)
await sdk.geocode(query, {
  bbox: [minLat, minLon, maxLat, maxLon], // Visible map bounds
});

// 2. Use regions for administrative filtering
await sdk.geocode(query, {
  regions: ['منطقة الرياض', 'المنطقة الشرقية'],
});

// 3. Combine for best results
await sdk.geocode(query, {
  bbox: mapBounds,
  regions: ['منطقة الرياض'], // Further narrows scope
});
```

---

## DuckDB SQL Patterns

```sql
-- H3 tile from coordinates
SELECT h3_h3_to_string(h3_latlng_to_cell(lat, lon, 5)) as h3_tile

-- Haversine distance
6371000 * 2 * ASIN(SQRT(
  POWER(SIN((RADIANS(latitude) - RADIANS(lat)) / 2), 2) +
  COS(RADIANS(lat)) * COS(RADIANS(latitude)) *
  POWER(SIN((RADIANS(longitude) - RADIANS(lon)) / 2), 2)
)) as distance_m

-- Spatial containment
SELECT * FROM sa_districts
WHERE ST_Contains(geometry, ST_Point(lon, lat))

-- FTS with Arabic stemmer
PRAGMA create_fts_index(table, id, field, stemmer='arabic')
SELECT fts_main_table.match_bm25(id, 'query') as score FROM table
```

---

## File Structure

```
geocoding-sdk/
├── src/
│   ├── index.ts          # Exports GeoSDK (alias for GeoSDKH3)
│   ├── types.ts          # Shared types, DEFAULT_DATA_URL
│   ├── geocoder-h3.ts    # Main SDK (~1440 lines) ← USE THIS
│   ├── logger.ts         # Debug logging system
│   ├── geocoder.ts       # Legacy region-based
│   └── geocoder-lazy.ts  # Legacy lazy-loading
├── examples/react/
│   └── app/
│       ├── context/geo-sdk-context.tsx  # SDK provider with all types
│       ├── routes/playground.tsx        # Interactive demo + search scope
│       └── routes/docs/*.tsx            # API documentation pages
├── docs/
│   └── ARCHITECTURE.md   # This file
└── dist/                 # Build output
```

---

## Source.coop Data URLs

### Base URL

```
https://data.source.coop/tabaqat/geocoding-cng/v0.1.0
```

### Index Files (Loaded at Init)

| File            | URL                                                                                    | Size   |
| --------------- | -------------------------------------------------------------------------------------- | ------ |
| Tile Index      | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tile_index.parquet`             | ~50KB  |
| Postcode Index  | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/postcode_index.parquet`         | ~10KB  |
| World Countries | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/world_countries_simple.parquet` | ~30KB  |
| SA Regions      | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_regions_simple.parquet`      | ~20KB  |
| SA Districts    | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_districts_simple.parquet`    | ~500KB |

### Top 20 Tile Files (by address count)

| H3 Tile           | Region  | Addresses | Size  | URL                                                                                   |
| ----------------- | ------- | --------- | ----- | ------------------------------------------------------------------------------------- |
| `855355d3fffffff` | Riyadh  | 177,152   | 6.0MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/855355d3fffffff.parquet` |
| `8553736bfffffff` | Riyadh  | 142,125   | 4.6MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553736bfffffff.parquet` |
| `8553a957fffffff` | Makkah  | 137,574   | 4.4MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553a957fffffff.parquet` |
| `8553736ffffffff` | Riyadh  | 130,881   | 4.3MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553736ffffffff.parquet` |
| `855355dbfffffff` | Riyadh  | 104,949   | 3.4MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/855355dbfffffff.parquet` |
| `8553110ffffffff` | Madinah | 101,765   | 3.5MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553110ffffffff.parquet` |
| `85534547fffffff` | Eastern | 94,802    | 2.6MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/85534547fffffff.parquet` |
| `855355c3fffffff` | Riyadh  | 87,993    | 2.4MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/855355c3fffffff.parquet` |
| `85536e53fffffff` | Eastern | 86,902    | 2.7MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/85536e53fffffff.parquet` |
| `852c960ffffffff` | Eastern | 85,379    | 2.5MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/852c960ffffffff.parquet` |
| `8553a92bfffffff` | Makkah  | 80,819    | 2.2MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553a92bfffffff.parquet` |
| `8553a923fffffff` | Makkah  | 77,239    | 2.2MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553a923fffffff.parquet` |
| `855354a7fffffff` | Riyadh  | 72,629    | 2.3MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/855354a7fffffff.parquet` |
| `85530cb7fffffff` | Qassim  | 69,501    | 2.1MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/85530cb7fffffff.parquet` |
| `85536327fffffff` | Eastern | 68,523    | 2.0MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/85536327fffffff.parquet` |
| `8553113bfffffff` | Madinah | 66,853    | 2.3MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553113bfffffff.parquet` |
| `8553a9cffffffff` | Makkah  | 65,643    | 1.9MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553a9cffffffff.parquet` |
| `8552021bfffffff` | Asir    | 63,273    | 1.8MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8552021bfffffff.parquet` |
| `8553a93bfffffff` | Makkah  | 62,613    | 1.7MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553a93bfffffff.parquet` |
| `85534573fffffff` | Eastern | 62,431    | 1.7MB | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/85534573fffffff.parquet` |

### Tile URL Pattern

```
https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/{h3_tile}.parquet
```

---

## Complete Data Sequence Flow

```mermaid
flowchart TD
    subgraph Init["SDK Initialization (~140KB)"]
        A1[Load DuckDB WASM] --> A2[Install Extensions]
        A2 --> A3[Load tile_index.parquet]
        A3 --> A4[Load postcode_index.parquet]
        A4 --> A5[Create boundary views]
    end

    subgraph Views["Boundary Views (SQL VIEWs)"]
        V1[world_countries]
        V2[sa_regions]
        V3[sa_districts]
    end

    subgraph Memory["In-Memory State"]
        M1["tileIndex: TileInfo[717]"]
        M2["postcodeIndex: Map&lt;string, PostcodeInfo&gt;"]
        M3["loadedTiles: Set&lt;string&gt;"]
    end

    A5 --> V1 & V2 & V3
    A3 --> M1
    A4 --> M2

    subgraph Reverse["Reverse Geocoding"]
        R1["Input: (lat, lon)"] --> R2["h3_latlng_to_cell()"]
        R2 --> R3["Lookup h3_tile in tileIndex"]
        R3 --> R4["HTTP GET tile parquet"]
        R4 --> R5["Haversine distance filter"]
        R5 --> R6["Return GeocodingResult[]"]
    end

    subgraph Forward["Forward Geocoding"]
        F1["Input: query string"] --> F0{"Check cache?"}
        F0 -->|Hit| F9["Return cached results"]
        F0 -->|Miss| F2["Filter tiles by bbox/region/regions"]
        F2 --> F3["Limit to 50 tiles"]
        F3 --> F4["HTTP GET tile parquets"]
        F4 --> F5{"FTS available?"}
        F5 -->|Yes| F6["BM25 search"]
        F5 -->|No| F7["JACCARD similarity"]
        F6 & F7 --> F8["Cache & return ranked results"]
    end

    subgraph Smart["Smart Geocoding"]
        S1["Input: query"] --> S2{"Detect pattern"}
        S2 -->|Postcode| S3["→ searchByPostcode()"]
        S2 -->|Region keyword| S4["→ geocode() + region filter"]
        S2 -->|General| S5["→ geocode()"]
    end

    subgraph Postcode["Postcode Search"]
        P1["Input: postcode"] --> P2["postcodeIndex.get()"]
        P2 --> P3["Get 1-3 tile IDs"]
        P3 --> P4["HTTP GET only those tiles"]
        P4 --> P5["Filter by postcode"]
        P5 --> P6["Return GeocodingResult[]"]
    end

    subgraph Country["Country Detection"]
        C1["Input: (lat, lon)"] --> C2["ST_Contains on world_countries"]
        C2 --> C3["Return CountryResult"]
    end

    subgraph Admin["Admin Hierarchy"]
        H1["Input: (lat, lon)"] --> H2["ST_Contains on sa_districts"]
        H2 --> H3["Get district + governorate"]
        H1 --> H4["ST_Contains on sa_regions"]
        H4 --> H5["Get region"]
        H3 & H5 --> H6["Return AdminHierarchy"]
    end

    M1 --> R3 & F2
    M2 --> P2
    V1 --> C2
    V3 --> H2
```

---

## HTTP Request Flow

```mermaid
sequenceDiagram
    participant Browser
    participant DuckDB as DuckDB-WASM
    participant CDN as source.coop CDN

    Note over Browser,CDN: Initialization Phase
    Browser->>DuckDB: new GeoSDK().initialize()
    DuckDB->>CDN: GET tile_index.parquet
    CDN-->>DuckDB: 717 tile metadata (~50KB)
    DuckDB->>CDN: GET postcode_index.parquet
    CDN-->>DuckDB: 6499 postcodes (~10KB)
    DuckDB->>CDN: GET world_countries_simple.parquet
    DuckDB->>CDN: GET sa_regions_simple.parquet
    DuckDB->>CDN: GET sa_districts_simple.parquet
    Note over DuckDB: Creates SQL VIEWs for boundaries

    Note over Browser,CDN: Reverse Geocode (24.7136, 46.6753)
    Browser->>DuckDB: reverseGeocode(lat, lon)
    DuckDB->>DuckDB: h3_latlng_to_cell → 855355d3fffffff
    DuckDB->>CDN: GET tiles/855355d3fffffff.parquet
    Note over CDN: HTTP Range Request (column projection)
    CDN-->>DuckDB: Address data (~220KB avg)
    DuckDB->>DuckDB: Haversine distance calculation
    DuckDB-->>Browser: GeocodingResult[]

    Note over Browser,CDN: Postcode Search (12345)
    Browser->>DuckDB: searchByPostcode("12345")
    DuckDB->>DuckDB: postcodeIndex.get("12345") → [tile1, tile2]
    DuckDB->>CDN: GET tiles/tile1.parquet
    DuckDB->>CDN: GET tiles/tile2.parquet
    Note over DuckDB: Only 1-3 tiles per postcode!
    CDN-->>DuckDB: Filtered data
    DuckDB-->>Browser: GeocodingResult[]

    Note over Browser,CDN: Forward Geocode with bbox
    Browser->>DuckDB: geocode("الرياض", {bbox})
    DuckDB->>DuckDB: Filter tileIndex by bbox
    DuckDB->>CDN: GET tiles/*.parquet (parallel, max 50)
    CDN-->>DuckDB: Address data
    alt FTS Extension Available
        DuckDB->>DuckDB: CREATE temp FTS index
        DuckDB->>DuckDB: BM25 Arabic search
    else Fallback
        DuckDB->>DuckDB: JACCARD + LIKE filter
    end
    DuckDB-->>Browser: Ranked GeocodingResult[]
```

---

## DuckDB Query Examples with URLs

```sql
-- Direct query to tile_index
SELECT * FROM read_parquet(
  'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tile_index.parquet'
);

-- Query specific tile
SELECT * FROM read_parquet(
  'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/855355d3fffffff.parquet'
) LIMIT 10;

-- Query multiple tiles
SELECT * FROM read_parquet([
  'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/855355d3fffffff.parquet',
  'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/8553736bfffffff.parquet'
]);

-- Postcode lookup
SELECT * FROM read_parquet(
  'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/postcode_index.parquet'
) WHERE postcode = '12345';

-- Country detection
SELECT * FROM read_parquet(
  'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/world_countries_simple.parquet'
) WHERE ST_Contains(geometry, ST_Point(46.6753, 24.7136));
```
