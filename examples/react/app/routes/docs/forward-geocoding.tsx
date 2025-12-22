import { useState } from "react";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { useGeoSDK } from "~/context/geo-sdk-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { CodeBlock } from "~/components/ui/code-block";
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
import type { Route } from "./+types/forward-geocoding";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Forward Geocoding - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Convert addresses to coordinates" },
  ];
}

export default function ForwardGeocoding() {
  const { t, language } = useTranslation();
  const { sdk, initialized, loading } = useGeoSDK();
  const [query, setQuery] = useState("");
  interface GeocodingResult {
    latitude: number;
    longitude: number;
    full_address_ar?: string;
    full_address_en?: string;
    similarity?: number;
  }
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!sdk || !query.trim()) return;
    setSearching(true);
    try {
      const res = await sdk.geocode(query, { limit: 10 });
      setResults(res);
      toast.success(`Found ${res.length} results`);
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
          <h1 className="text-3xl font-bold mb-2">{t("docs.forwardGeocoding.title")}</h1>
          <p className="text-muted-foreground">{t("docs.forwardGeocoding.description")}</p>
        </div>

        {/* Method Signature */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Method Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`geocode(
  address: string,
  options?: {
    limit?: number;        // Max results (default: 10)
    bbox?: [minLat, minLon, maxLat, maxLon];  // Visible map bounds
    region?: string;       // Filter by region name
  }
): Promise<GeocodingResult[]>`}
            />
          </CardContent>
        </Card>

        {/* Interactive Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.tryIt")}</CardTitle>
            <CardDescription>{t("docs.forwardGeocoding.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!initialized ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{loading ? "Initializing SDK..." : "Loading..."}</span>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("docs.forwardGeocoding.addressPlaceholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    dir="auto"
                  />
                  <Button onClick={handleSearch} disabled={searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.search")}
                  </Button>
                </div>
                {results.length > 0 && (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Address</TableHead>
                          <TableHead>Coordinates</TableHead>
                          <TableHead>Similarity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell dir="auto">
                              {language === "ar" ? r.full_address_ar : r.full_address_en}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                            </TableCell>
                            <TableCell>
                              {r.similarity ? `${(r.similarity * 100).toFixed(1)}%` : "-"}
                            </TableCell>
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

// Basic forward geocoding
const results = await sdk.geocode("حي الروضة الرياض");

// With bbox optimization (for visible map area)
const results = await sdk.geocode("Riyadh", {
  limit: 5,
  bbox: [24.5, 46.5, 25.0, 47.0] // [minLat, minLon, maxLat, maxLon]
});

// With region filter
const results = await sdk.geocode("address", {
  region: "منطقة الرياض"
});`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
