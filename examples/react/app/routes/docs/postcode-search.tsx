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
import type { Route } from "./+types/postcode-search";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Postcode Search - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Search addresses by postcode" },
  ];
}

export default function PostcodeSearch() {
  const { t, language } = useTranslation();
  const { sdk, initialized, loading } = useGeoSDK();
  const [postcode, setPostcode] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  interface GeocodingResult {
    latitude: number;
    longitude: number;
    number?: string;
    street?: string;
    district_ar?: string;
    district_en?: string;
  }
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!sdk || !postcode.trim()) return;
    setSearching(true);
    try {
      const res = await sdk.searchByPostcode(postcode, {
        limit: 20,
        number: houseNumber || undefined,
      });
      setResults(res);
      toast.success(`Found ${res.length} addresses`);
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
          <h1 className="text-3xl font-bold mb-2">{t("docs.postcodeSearch.title")}</h1>
          <p className="text-muted-foreground">{t("docs.postcodeSearch.description")}</p>
        </div>

        {/* Method Signature */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Method Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`searchByPostcode(
  postcode: string,
  options?: {
    limit?: number;    // Max results (default: 50)
    number?: string;   // Optional house number filter
  }
): Promise<GeocodingResult[]>`}
            />
          </CardContent>
        </Card>

        {/* Performance Note */}
        <Card className="mb-6 border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-green-600">
              {language === "ar" ? "أداء محسّن" : "Optimized Performance"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {language === "ar"
                ? "البحث بالرمز البريدي محسّن للغاية! يستخدم فهرس الرموز البريدية للاستعلام من 1-3 مربعات فقط بدلاً من 717 مربع. متوسط 1.29 مربع لكل رمز بريدي."
                : "Postcode search is highly optimized! Uses postcode index to query only 1-3 tiles instead of all 717. Average 1.29 tiles per postcode."}
            </p>
          </CardContent>
        </Card>

        {/* Interactive Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.tryIt")}</CardTitle>
            <CardDescription>{t("docs.postcodeSearch.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!initialized ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{loading ? "Initializing SDK..." : "Loading..."}</span>
              </div>
            ) : (
              <>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    placeholder={t("docs.postcodeSearch.postcodePlaceholder")}
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="w-40"
                  />
                  <Input
                    placeholder={t("docs.postcodeSearch.houseNumberPlaceholder")}
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    className="w-40"
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
                          <TableHead>#</TableHead>
                          <TableHead>Street</TableHead>
                          <TableHead>District</TableHead>
                          <TableHead>Coordinates</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>{r.number || "-"}</TableCell>
                            <TableCell dir="auto">{r.street || "-"}</TableCell>
                            <TableCell dir="auto">
                              {language === "ar" ? r.district_ar : r.district_en}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
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

// Search all addresses in a postcode
const addresses = await sdk.searchByPostcode("13847");

// Filter by house number
const specific = await sdk.searchByPostcode("13847", {
  number: "2808"
});

// Get available postcodes (for autocomplete)
const allPostcodes = sdk.getPostcodes();
const filtered = sdk.getPostcodes("138"); // Prefix filter`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
