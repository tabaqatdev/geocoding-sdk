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
        SDK["GeoSDK"]
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

## Initialization

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
    SDK->>DuckDB: CREATE VIEW sa_governorates
    SDK->>DuckDB: CREATE VIEW sa_districts
    SDK-->>App: Ready (~140KB loaded)
```

## Reverse Geocoding

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

## Forward Geocoding

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

## Postcode Search

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

## DuckDB Query Examples

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
| SA Governorates | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_governorates_simple.parquet` | ~467KB |
| SA Districts    | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_districts_simple.parquet`    | ~500KB |
