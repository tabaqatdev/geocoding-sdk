import { useState } from "react";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { useGeoSDK } from "~/context/geo-sdk-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { CodeBlock } from "~/components/ui/code-block";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Route } from "./+types/admin-hierarchy";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Admin Hierarchy - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Get administrative hierarchy for Saudi Arabia coordinates" },
  ];
}

export default function AdminHierarchy() {
  const { t, language } = useTranslation();
  const { sdk, initialized, loading } = useGeoSDK();
  const [lat, setLat] = useState("24.7136");
  const [lon, setLon] = useState("46.6753");
  const [result, setResult] = useState<{
    region?: { name_ar: string; name_en: string };
    district?: { name_ar: string; name_en: string };
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!sdk) return;
    setSearching(true);
    try {
      const res = await sdk.getAdminHierarchy(parseFloat(lat), parseFloat(lon));
      setResult(res as any);
      if (res && ((res as any).region || (res as any).district)) {
        toast.success("Admin hierarchy found");
      } else {
        toast.info("Point is outside Saudi Arabia admin boundaries");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Query failed");
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
          <h1 className="text-3xl font-bold mb-2">{t("docs.adminHierarchy.title")}</h1>
          <p className="text-muted-foreground">{t("docs.adminHierarchy.description")}</p>
        </div>

        {/* Method Signature */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Method Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`getAdminHierarchy(
  lat: number,
  lon: number
): Promise<{
  district?: { name_ar: string; name_en: string };
  region?: { name_ar: string; name_en: string };
}>`}
            />
          </CardContent>
        </Card>

        {/* Interactive Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.tryIt")}</CardTitle>
            <CardDescription>{t("docs.adminHierarchy.description")}</CardDescription>
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
                  <div>
                    <label className="text-sm text-muted-foreground">Latitude</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Longitude</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lon}
                      onChange={(e) => setLon(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleSearch} disabled={searching}>
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Hierarchy"}
                    </Button>
                  </div>
                </div>
                {result && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        {result.region && (
                          <div>
                            <div className="text-sm text-muted-foreground">
                              {language === "ar" ? "المنطقة" : "Region"}
                            </div>
                            <div className="text-xl font-bold" dir="auto">
                              {language === "ar" ? result.region.name_ar : result.region.name_en}
                            </div>
                          </div>
                        )}
                        {result.district && (
                          <div>
                            <div className="text-sm text-muted-foreground">
                              {language === "ar" ? "الحي / المحافظة" : "District / Governorate"}
                            </div>
                            <div className="text-xl font-bold" dir="auto">
                              {language === "ar"
                                ? result.district.name_ar
                                : result.district.name_en}
                            </div>
                          </div>
                        )}
                        {!result.region && !result.district && (
                          <div className="text-muted-foreground">
                            {language === "ar"
                              ? "النقطة خارج حدود المناطق الإدارية السعودية"
                              : "Point is outside Saudi Arabia admin boundaries"}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Admin Levels */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{language === "ar" ? "المستويات الإدارية" : "Admin Levels"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>{language === "ar" ? "المناطق" : "Regions"}</strong> - 13 administrative
                regions (منطقة)
              </li>
              <li>
                <strong>
                  {language === "ar" ? "المحافظات/الأحياء" : "Districts/Governorates"}
                </strong>{" "}
                - Sub-regional divisions
              </li>
            </ul>
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

// Get admin hierarchy for a point
const hierarchy = await sdk.getAdminHierarchy(24.7136, 46.6753);

if (hierarchy.region) {
  console.log("Region:", hierarchy.region.name_en);
  // "Riyadh Region"
  console.log("المنطقة:", hierarchy.region.name_ar);
  // "منطقة الرياض"
}

if (hierarchy.district) {
  console.log("District:", hierarchy.district.name_en);
  console.log("الحي:", hierarchy.district.name_ar);
}`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
