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
import type { Route } from "./+types/house-number";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "House Number Search - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Search by house number within a region" },
  ];
}

export default function HouseNumber() {
  const { t, language } = useTranslation();
  const { sdk, initialized, loading } = useGeoSDK();
  const [number, setNumber] = useState("");
  const [region, setRegion] = useState("");
  interface GeocodingResult {
    number?: string;
    full_address_ar?: string;
    full_address_en?: string;
    postcode?: string;
    region_ar?: string;
    region_en?: string;
  }
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!sdk || !number.trim()) return;
    setSearching(true);
    try {
      const res = await sdk.searchByNumber(number, {
        limit: 20,
        region: region || undefined,
      });
      setResults(res);
      toast.success(`Found ${res.length} addresses`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const regions = [
    { value: "منطقة الرياض", label: t("regions.riyadh") },
    { value: "منطقة مكة المكرمة", label: t("regions.makkah") },
    { value: "المنطقة الشرقية", label: t("regions.eastern") },
    { value: "منطقة المدينة المنورة", label: t("regions.madinah") },
    { value: "منطقة القصيم", label: t("regions.qassim") },
    { value: "منطقة عسير", label: t("regions.asir") },
    { value: "منطقة جازان", label: t("regions.jazan") },
    { value: "منطقة تبوك", label: t("regions.tabuk") },
    { value: "منطقة حائل", label: t("regions.hail") },
    { value: "منطقة نجران", label: t("regions.najran") },
    { value: "منطقة الجوف", label: t("regions.jawf") },
    { value: "منطقة الباحة", label: t("regions.bahah") },
    { value: "منطقة الحدود الشمالية", label: t("regions.northern") },
  ];

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            API
          </Badge>
          <h1 className="text-3xl font-bold mb-2">{t("docs.houseNumber.title")}</h1>
          <p className="text-muted-foreground">{t("docs.houseNumber.description")}</p>
        </div>

        {/* Method Signature */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Method Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`searchByNumber(
  number: string,
  options?: {
    region?: string;   // Region name to filter by
    bbox?: [minLat, minLon, maxLat, maxLon];  // Bounding box filter
    limit?: number;    // Max results (default: 20)
  }
): Promise<GeocodingResult[]>`}
            />
          </CardContent>
        </Card>

        {/* Warning Note */}
        <Card className="mb-6 border-yellow-500/50 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="text-yellow-600">
              {language === "ar" ? "ملاحظة مهمة" : "Important Note"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {language === "ar"
                ? "أرقام المباني ليست فريدة في جميع أنحاء المملكة العربية السعودية. يوصى بشدة بتصفية النتائج حسب المنطقة أو نطاق الخريطة للحصول على نتائج ذات صلة."
                : "House numbers are not unique across Saudi Arabia. Filtering by region or bbox is highly recommended for relevant results."}
            </p>
          </CardContent>
        </Card>

        {/* Interactive Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.tryIt")}</CardTitle>
            <CardDescription>{t("docs.houseNumber.description")}</CardDescription>
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
                    placeholder={t("docs.houseNumber.numberPlaceholder")}
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="w-40"
                  />
                  <Select
                    value={region || "all"}
                    onValueChange={(v) => setRegion(v === "all" ? "" : v)}
                  >
                    <SelectTrigger className="w-60">
                      <SelectValue placeholder={t("docs.houseNumber.regionFilter")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("regions.all")}</SelectItem>
                      {regions.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                          <TableHead>Address</TableHead>
                          <TableHead>Postcode</TableHead>
                          <TableHead>Region</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>{r.number}</TableCell>
                            <TableCell dir="auto">
                              {language === "ar" ? r.full_address_ar : r.full_address_en}
                            </TableCell>
                            <TableCell>{r.postcode}</TableCell>
                            <TableCell dir="auto">
                              {language === "ar" ? r.region_ar : r.region_en}
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

// Search by house number (no filter - may return many results)
const addresses = await sdk.searchByNumber("2808");

// Filter by region (recommended)
const filtered = await sdk.searchByNumber("2808", {
  region: "منطقة الرياض"
});

// Filter by visible map bbox
const inView = await sdk.searchByNumber("2808", {
  bbox: [24.5, 46.5, 25.0, 47.0]
});`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
