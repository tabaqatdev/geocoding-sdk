# هندسة SDK للترميز الجغرافي

> ترميز جغرافي يعتمد على المتصفح للمملكة العربية السعودية باستخدام DuckDB-WASM + فهرسة H3 المكانية

## إحصائيات سريعة

| المقياس              | القيمة   |
| -------------------- | -------- |
| العناوين             | 5.3M+    |
| المناطق              | 13       |
| بلاطات H3            | 717      |
| الرموز البريدية      | 6,499    |
| الأحياء              | 5,478    |
| متوسط حجم البلاطة    | 220KB    |
| أقصى حجم للبلاطة     | 6MB      |
| إجمالي البيانات      | ~154MB   |

---

## هندسة النظام

```mermaid
flowchart TB
    subgraph Browser["بيئة المتصفح"]
        App["تطبيق React"]
        SDK["GeoSDK"]
        DuckDB["DuckDB-WASM"]

        subgraph Extensions["ملحقات DuckDB"]
            Spatial["Spatial"]
            H3["H3"]
            FTS["FTS (اختياري)"]
        end

        subgraph Memory["الحالة في الذاكرة"]
            TileIdx["فهرس البلاطات (50KB)"]
            PostIdx["خريطة الرموز البريدية (10KB)"]
            TileCache["ذاكرة التخزين المؤقت للبلاطات"]
            SearchCache["ذاكرة التخزين المؤقت LRU (100 إدخال)"]
            DistrictNames["أسماء الأحياء (عربي/إنجليزي)"]
        end
    end

    subgraph CDN["CDN (source.coop)"]
        Indexes["ملفات الفهرس"]
        Tiles["717 ملف بلاطة"]
        Boundaries["ملفات الحدود"]
    end

    App --> SDK
    SDK --> DuckDB
    DuckDB --> Extensions
    DuckDB --> Memory
    DuckDB -->|طلبات HTTP Range| CDN
```

---

## التهيئة

```mermaid
sequenceDiagram
    participant App as التطبيق
    participant SDK
    participant DuckDB
    participant CDN

    App->>SDK: initialize()
    SDK->>DuckDB: تحميل WASM
    SDK->>DuckDB: INSTALL spatial, h3, fts
    SDK->>CDN: GET tile_index.parquet
    SDK->>CDN: GET postcode_index.parquet
    SDK->>DuckDB: CREATE VIEW world_countries
    SDK->>DuckDB: CREATE VIEW sa_regions
    SDK->>DuckDB: CREATE VIEW sa_governorates
    SDK->>DuckDB: CREATE VIEW sa_districts
    SDK-->>App: جاهز (~140KB محمّل)
```

## الترميز الجغرافي العكسي

```mermaid
sequenceDiagram
    participant User as المستخدم
    participant SDK
    participant DuckDB
    participant CDN

    User->>SDK: reverseGeocode(lat, lon)
    SDK->>DuckDB: h3_latlng_to_cell(lat, lon, 5)
    DuckDB-->>SDK: معرف بلاطة h3
    SDK->>SDK: البحث عن البلاطة في الفهرس
    SDK->>CDN: GET tiles/{h3_tile}.parquet
    SDK->>DuckDB: SELECT مع مسافة Haversine
    DuckDB-->>SDK: العناوين القريبة
    SDK-->>User: GeocodingResult[]
```

## الترميز الجغرافي الأمامي

```mermaid
sequenceDiagram
    participant User as المستخدم
    participant SDK
    participant DuckDB
    participant CDN

    User->>SDK: geocode(query, {bbox?, region?, regions?})
    SDK->>SDK: تصفية البلاطات حسب bbox/region/regions
    SDK->>SDK: الحد الأقصى 50 بلاطة
    SDK->>CDN: GET tiles/*.parquet (متوازي)

    alt FTS متاح
        SDK->>DuckDB: CREATE temp FTS index
        SDK->>DuckDB: بحث BM25 مع معالج الكلمات العربية
    else بديل JACCARD
        SDK->>DuckDB: تشابه JACCARD + LIKE
    end

    DuckDB-->>SDK: نتائج مرتبة
    SDK-->>User: GeocodingResult[]
```

## البحث بالرمز البريدي

```mermaid
sequenceDiagram
    participant User as المستخدم
    participant SDK
    participant CDN

    User->>SDK: searchByPostcode("12345")
    SDK->>SDK: postcodeIndex.get("12345")
    Note right of SDK: يُرجع 1-3 معرفات بلاطة (متوسط 1.29)
    SDK->>CDN: GET فقط البلاطات المطابقة
    SDK-->>User: GeocodingResult[]
```

---

## الأداء

| العملية                              | بارد   | مخزن مؤقتاً |
| ------------------------------------ | ------ | ----------- |
| ترميز جغرافي عكسي                    | <4s    | <100ms      |
| ترميز جغرافي أمامي (مع bbox)         | 2-5s   | <500ms      |
| بحث بالرمز البريدي                   | <500ms | <100ms      |
| كشف الدولة                           | <100ms | <50ms       |

### إسقاط الأعمدة (detailLevel)

| المستوى  | الأعمدة | ~النقل   |
| -------- | ------- | -------- |
| minimal  | 3       | ~3MB     |
| postcode | 6       | ~4MB     |
| region   | 9       | ~6MB     |
| full     | 16      | ~47MB    |

---

## أمثلة استعلامات DuckDB

```sql
-- بلاطة H3 من الإحداثيات
SELECT h3_h3_to_string(h3_latlng_to_cell(lat, lon, 5)) as h3_tile

-- مسافة Haversine
6371000 * 2 * ASIN(SQRT(
  POWER(SIN((RADIANS(latitude) - RADIANS(lat)) / 2), 2) +
  COS(RADIANS(lat)) * COS(RADIANS(latitude)) *
  POWER(SIN((RADIANS(longitude) - RADIANS(lon)) / 2), 2)
)) as distance_m

-- الاحتواء المكاني
SELECT * FROM sa_districts
WHERE ST_Contains(geometry, ST_Point(lon, lat))

-- FTS مع معالج الكلمات العربية
PRAGMA create_fts_index(table, id, field, stemmer='arabic')
SELECT fts_main_table.match_bm25(id, 'query') as score FROM table
```

---

## عناوين بيانات Source.coop

### عنوان URL الأساسي

```
https://data.source.coop/tabaqat/geocoding-cng/v0.1.0
```

### ملفات الفهرس (محمّلة عند التهيئة)

| الملف                | عنوان URL                                                                              | الحجم  |
| -------------------- | -------------------------------------------------------------------------------------- | ------ |
| فهرس البلاطات        | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tile_index.parquet`             | ~50KB  |
| فهرس الرموز البريدية | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/postcode_index.parquet`         | ~10KB  |
| دول العالم           | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/world_countries_simple.parquet` | ~30KB  |
| مناطق السعودية       | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_regions_simple.parquet`      | ~20KB  |
| محافظات السعودية     | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_governorates_simple.parquet` | ~467KB |
| أحياء السعودية       | `https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_districts_simple.parquet`    | ~500KB |
