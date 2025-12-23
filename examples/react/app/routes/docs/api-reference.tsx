import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { CodeBlock } from "~/components/ui/code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { Route } from "./+types/api-reference";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "API Reference - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Complete TypeScript API documentation" },
  ];
}

export default function ApiReference() {
  const { t } = useTranslation();

  const methods = [
    {
      name: "initialize()",
      returns: "Promise<void>",
      description: "Initialize the SDK (loads index files ~140KB)",
    },
    {
      name: "geocode(address, options?)",
      returns: "Promise<GeocodingResult[]>",
      description: "Forward geocoding - address to coordinates",
    },
    {
      name: "reverseGeocode(lat, lon, options?)",
      returns: "Promise<GeocodingResult[]>",
      description: "Reverse geocoding - coordinates to addresses",
    },
    {
      name: "searchByPostcode(postcode, options?)",
      returns: "Promise<GeocodingResult[]>",
      description: "Search by postcode (optimized)",
    },
    {
      name: "searchByNumber(number, options?)",
      returns: "Promise<GeocodingResult[]>",
      description: "Search by house number",
    },
    {
      name: "detectCountry(lat, lon)",
      returns: "Promise<CountryResult | null>",
      description: "Detect country from coordinates",
    },
    {
      name: "isInSaudiArabia(lat, lon)",
      returns: "Promise<boolean>",
      description: "Check if point is in Saudi Arabia",
    },
    {
      name: "getAdminHierarchy(lat, lon)",
      returns: "Promise<AdminHierarchy>",
      description: "Get admin hierarchy for SA coordinates",
    },
    { name: "getTiles()", returns: "TileInfo[]", description: "Get list of available H3 tiles" },
    {
      name: "getLoadedTiles()",
      returns: "string[]",
      description: "Get list of currently loaded tile IDs",
    },
    {
      name: "getTilesByRegion(region)",
      returns: "TileInfo[]",
      description: "Get tiles filtered by region",
    },
    {
      name: "getPostcodes(prefix?)",
      returns: "PostcodeInfo[]",
      description: "Get available postcodes (for autocomplete)",
    },
    { name: "getStats()", returns: "Promise<SDKStats>", description: "Get SDK statistics" },
    {
      name: "isFTSAvailable()",
      returns: "boolean",
      description: "Check if FTS extension is available",
    },
    {
      name: "getSearchMode()",
      returns: "'fts-bm25' | 'jaccard'",
      description: "Get current text search mode",
    },
    { name: "close()", returns: "Promise<void>", description: "Cleanup and close SDK" },
  ];

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            Reference
          </Badge>
          <h1 className="text-3xl font-bold mb-2">{t("docs.apiReference.title")}</h1>
          <p className="text-muted-foreground">{t("docs.apiReference.description")}</p>
        </div>

        {/* Methods Table */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>GeoSDK Methods</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">Method</TableHead>
                    <TableHead className="w-[200px]">Returns</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {methods.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{m.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {m.returns}
                      </TableCell>
                      <TableCell>{m.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* GeocodingResult Type */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>GeocodingResult</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`interface GeocodingResult {
  addr_id: number;
  longitude: number;
  latitude: number;
  number?: string;           // House number
  street?: string;           // Street name
  postcode?: string;         // Postal code
  district_ar?: string;      // District (Arabic)
  district_en?: string;      // District (English)
  city?: string;             // City name
  gov_ar?: string;           // Governorate (Arabic)
  gov_en?: string;           // Governorate (English)
  region_ar?: string;        // Region (Arabic)
  region_en?: string;        // Region (English)
  full_address_ar?: string;  // Full address (Arabic)
  full_address_en?: string;  // Full address (English)
  h3_index?: string;         // H3 cell index
  distance_m?: number;       // Distance in meters (reverse geocoding)
  similarity?: number;       // Match score (forward geocoding)
}`}
            />
          </CardContent>
        </Card>

        {/* TileInfo Type */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>TileInfo</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`interface TileInfo {
  h3_tile: string;      // H3 cell ID at resolution 5
  addr_count: number;   // Number of addresses in tile
  min_lon: number;      // Bounding box
  max_lon: number;
  min_lat: number;
  max_lat: number;
  file_size_kb: number; // Tile file size
  region_ar?: string;   // Primary region (Arabic)
  region_en?: string;   // Primary region (English)
}`}
            />
          </CardContent>
        </Card>

        {/* PostcodeInfo Type */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>PostcodeInfo</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`interface PostcodeInfo {
  postcode: string;     // The postcode
  tiles: string[];      // H3 tiles containing this postcode
  addr_count: number;   // Number of addresses
  region_ar?: string;   // Region (Arabic)
  region_en?: string;   // Region (English)
}`}
            />
          </CardContent>
        </Card>

        {/* CountryResult Type */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>CountryResult</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`interface CountryResult {
  iso_a3: string;    // ISO 3166-1 alpha-3 code
  iso_a2: string;    // ISO 3166-1 alpha-2 code
  name_en: string;   // Country name (English)
  name_ar: string;   // Country name (Arabic)
  continent: string; // Continent
}`}
            />
          </CardContent>
        </Card>

        {/* Config Type */}
        <Card>
          <CardHeader>
            <CardTitle>GeoSDKH3Config</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`interface GeoSDKH3Config {
  dataUrl?: string;         // Base URL for parquet data
  language?: 'ar' | 'en';   // Default language
}

// Default data URL
const DEFAULT_DATA_URL_V3 =
  'https://data.source.coop/tabaqat/geocoding-cng/v0.1.0';`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
