import { useState, useEffect } from "react";
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
  const [suggestions, setSuggestions] = useState<
    Array<{
      type: "district" | "region" | "postcode";
      value: string;
      label_ar: string;
      label_en: string;
    }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounced autocomplete
  useEffect(() => {
    if (!sdk || !query.trim() || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const result = await sdk.getAutocompleteSuggestions(query, {
          limit: 8,
          types: "all",
        });
        setSuggestions(result || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error("Autocomplete error:", error);
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, sdk]);

  const handleSearch = async () => {
    if (!sdk || !query.trim()) return;
    setSearching(true);
    setShowSuggestions(false);
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

  const handleSuggestionClick = (suggestion: (typeof suggestions)[0]) => {
    const label = language === "ar" ? suggestion.label_ar : suggestion.label_en;
    setQuery(label);
    setShowSuggestions(false);
    setSuggestions([]);
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
            <CardTitle>{t("common.methodSignature")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`geocode(
  address: string,
  options?: {
    limit?: number;        // Max results (default: 10)
    bbox?: [minLat, minLon, maxLat, maxLon];  // Visible map bounds
    region?: string;       // Filter by single region name
    regions?: string[];    // Filter by multiple region names
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
                <div className="flex gap-2 relative">
                  <div className="flex-1 relative">
                    <Input
                      placeholder={t("docs.forwardGeocoding.addressPlaceholder")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSearch();
                        } else if (e.key === "Escape") {
                          setShowSuggestions(false);
                        }
                      }}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      dir={language === "ar" ? "rtl" : "ltr"}
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <Card className="absolute z-10 w-full mt-1 shadow-lg">
                        <CardContent className="p-2">
                          <div className="space-y-1">
                            {suggestions.map((suggestion, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="w-full text-start p-2 hover:bg-accent rounded-md transition-colors"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex-1" dir={language === "ar" ? "rtl" : "ltr"}>
                                    {language === "ar" ? suggestion.label_ar : suggestion.label_en}
                                  </span>
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    {suggestion.type === "district"
                                      ? language === "ar"
                                        ? "حي"
                                        : "District"
                                      : suggestion.type === "region"
                                        ? language === "ar"
                                          ? "منطقة"
                                          : "Region"
                                        : language === "ar"
                                          ? "رمز بريدي"
                                          : "Postcode"}
                                  </Badge>
                                </div>
                              </button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                  <Button onClick={handleSearch} disabled={searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.search")}
                  </Button>
                </div>
                {results.length > 0 && (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("results.address")}</TableHead>
                          <TableHead>{t("results.coordinates")}</TableHead>
                          <TableHead>{t("results.similarity")}</TableHead>
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

// With single region filter
const results = await sdk.geocode("address", {
  region: "منطقة الرياض"
});

// With multiple regions filter
const results = await sdk.geocode("address", {
  regions: ["منطقة الرياض", "المنطقة الشرقية"]
});`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
