import { useState } from "react";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { useGeoSDK } from "~/context/geo-sdk-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Slider } from "~/components/ui/slider";
import { CodeBlock } from "~/components/ui/code-block";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Route } from "./+types/reverse-geocoding";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Reverse Geocoding - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Find addresses near coordinates" },
  ];
}

export default function ReverseGeocoding() {
  const { t, language } = useTranslation();
  const { sdk, initialized, loading } = useGeoSDK();
  const [lat, setLat] = useState("24.7136");
  const [lon, setLon] = useState("46.6753");
  const [radius, setRadius] = useState([1000]);
  const [detailLevel, setDetailLevel] = useState<"minimal" | "postcode" | "region" | "full">(
    "full"
  );
  interface GeocodingResult {
    latitude: number;
    longitude: number;
    full_address_ar?: string;
    full_address_en?: string;
    postcode?: string;
    distance_m?: number;
  }
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!sdk) return;
    setSearching(true);
    try {
      const res = await sdk.reverseGeocode(parseFloat(lat), parseFloat(lon), {
        limit: 10,
        radiusMeters: radius[0],
        detailLevel,
      });
      setResults(res);
      toast.success(`Found ${res.length} nearby addresses`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            API
          </Badge>
          <h1 className="text-3xl font-bold mb-2">{t("docs.reverseGeocoding.title")}</h1>
          <p className="text-muted-foreground">{t("docs.reverseGeocoding.description")}</p>
        </div>

        {/* Method Signature */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Method Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`reverseGeocode(
  lat: number,
  lon: number,
  options?: {
    limit?: number;              // Max results (default: 10)
    radiusMeters?: number;       // Search radius (default: 1000)
    detailLevel?: "minimal" | "postcode" | "region" | "full";
    includeNeighbors?: boolean;  // Include neighboring H3 tiles
  }
): Promise<GeocodingResult[]>`}
            />
          </CardContent>
        </Card>

        {/* Interactive Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.tryIt")}</CardTitle>
            <CardDescription>{t("docs.reverseGeocoding.clickMap")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!initialized ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{loading ? "Initializing SDK..." : "Loading..."}</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Latitude</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Longitude</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lon}
                      onChange={(e) => setLon(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">
                      {t("docs.reverseGeocoding.radius")} ({radius[0]}m)
                    </label>
                    <Slider
                      value={radius}
                      onValueChange={setRadius}
                      min={100}
                      max={5000}
                      step={100}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">
                      {t("docs.reverseGeocoding.detailLevel")}
                    </label>
                    <Select
                      value={detailLevel}
                      onValueChange={(v) => setDetailLevel(v as typeof detailLevel)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal">Minimal (3 cols)</SelectItem>
                        <SelectItem value="postcode">Postcode (6 cols)</SelectItem>
                        <SelectItem value="region">Region (9 cols)</SelectItem>
                        <SelectItem value="full">Full (16 cols)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.search")}
                </Button>
                {results.length > 0 && (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Address</TableHead>
                          <TableHead>Distance</TableHead>
                          <TableHead>Postcode</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell dir="auto">
                              {language === "ar" ? r.full_address_ar : r.full_address_en}
                            </TableCell>
                            <TableCell>{r.distance_m?.toFixed(0)} m</TableCell>
                            <TableCell>{r.postcode || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Code Example */}
        <Card>
          <CardHeader>
            <CardTitle>{t("common.viewCode")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`import { GeoSDK } from "@tabaqat/geocoding-sdk";

const sdk = new GeoSDK();
await sdk.initialize();

// Basic reverse geocoding (Riyadh coordinates)
const nearby = await sdk.reverseGeocode(24.7136, 46.6753);

// With options
const nearby = await sdk.reverseGeocode(24.7136, 46.6753, {
  limit: 5,
  radiusMeters: 500,
  detailLevel: "postcode" // Faster, less data transfer
});

// Performance:
// - Cold start: < 4 seconds (single tile fetch ~200KB)
// - Cached: < 100ms (same tile)`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
