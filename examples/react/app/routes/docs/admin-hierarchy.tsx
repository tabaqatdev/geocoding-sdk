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
    district?: { id: string; name_ar: string; name_en: string };
    municipality?: { id: string; name_ar: string; name_en: string };
    governorate?: { id: string; name_ar: string; name_en: string };
    region?: { id: string; name_ar: string; name_en: string };
    settlement?: { id: string; name_ar: string; name_en: string; type?: string };
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!sdk) return;
    setSearching(true);
    try {
      const res = await sdk.getAdminHierarchy(parseFloat(lat), parseFloat(lon));
      setResult(res);
      if (res && (res.region || res.district)) {
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
            <CardTitle>{t("common.methodSignature")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`getAdminHierarchy(
  lat: number,
  lon: number
): Promise<{
  district?: { id: string; name_ar: string; name_en: string };
  municipality?: { id: string; name_ar: string; name_en: string };
  governorate?: { id: string; name_ar: string; name_en: string };
  region?: { id: string; name_ar: string; name_en: string };
  settlement?: { id: string; name_ar: string; name_en: string; type?: string };
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
                    <label className="text-sm text-muted-foreground">{t("common.latitude")}</label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">{t("common.longitude")}</label>
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
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("common.getHierarchy")
                      )}
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
                            {result.region.id && (
                              <div className="text-xs text-muted-foreground font-mono">
                                ID: {result.region.id}
                              </div>
                            )}
                          </div>
                        )}
                        {result.governorate && (
                          <div>
                            <div className="text-sm text-muted-foreground">
                              {language === "ar" ? "المحافظة" : "Governorate"}
                            </div>
                            <div className="text-xl font-bold" dir="auto">
                              {language === "ar"
                                ? result.governorate.name_ar
                                : result.governorate.name_en}
                            </div>
                            {result.governorate.id && (
                              <div className="text-xs text-muted-foreground font-mono">
                                ID: {result.governorate.id}
                              </div>
                            )}
                          </div>
                        )}
                        {result.municipality && (
                          <div>
                            <div className="text-sm text-muted-foreground">
                              {language === "ar" ? "البلدية" : "Municipality"}
                            </div>
                            <div className="text-xl font-bold" dir="auto">
                              {language === "ar"
                                ? result.municipality.name_ar
                                : result.municipality.name_en}
                            </div>
                            {result.municipality.id && (
                              <div className="text-xs text-muted-foreground font-mono">
                                ID: {result.municipality.id}
                              </div>
                            )}
                          </div>
                        )}
                        {result.district && (
                          <div>
                            <div className="text-sm text-muted-foreground">
                              {language === "ar" ? "الحي" : "District"}
                            </div>
                            <div className="text-xl font-bold" dir="auto">
                              {language === "ar"
                                ? result.district.name_ar
                                : result.district.name_en}
                            </div>
                            {result.district.id && (
                              <div className="text-xs text-muted-foreground font-mono">
                                ID: {result.district.id}
                              </div>
                            )}
                          </div>
                        )}
                        {result.settlement && (
                          <div>
                            <div className="text-sm text-muted-foreground">
                              {language === "ar" ? "المستوطنات البشرية" : "Nearest Settlement"}
                              {result.settlement.type && (
                                <Badge variant="outline" className="ms-2 text-xs">
                                  {result.settlement.type}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xl font-bold" dir="auto">
                              {language === "ar"
                                ? result.settlement.name_ar
                                : result.settlement.name_en}
                            </div>
                            {result.settlement.id && (
                              <div className="text-xs text-muted-foreground font-mono">
                                ID: {result.settlement.id}
                              </div>
                            )}
                          </div>
                        )}
                        {!result.region && !result.district && !result.settlement && (
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
                <strong>{language === "ar" ? "المناطق" : "Regions"}</strong> - 13{" "}
                {language === "ar" ? "منطقة إدارية" : "administrative regions"}
              </li>
              <li>
                <strong>{language === "ar" ? "المحافظات" : "Governorates"}</strong> - 152{" "}
                {language === "ar" ? "محافظة" : "provincial level divisions"}
              </li>
              <li>
                <strong>{language === "ar" ? "البلديات" : "Municipalities"}</strong> - 285{" "}
                {language === "ar" ? "بلدية (تغطية 100%)" : "municipalities (100% coverage)"}
              </li>
              <li>
                <strong>{language === "ar" ? "الأحياء" : "Districts"}</strong> - 5,484{" "}
                {language === "ar" ? "حي (مناطق حضرية)" : "urban neighborhood boundaries"}
              </li>
              <li>
                <strong>{language === "ar" ? "المستوطنات" : "Settlements"}</strong> - 21,450{" "}
                {language === "ar"
                  ? "نقطة استيطان (أقرب نقطة)"
                  : "settlement points (nearest-point lookup)"}
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

// Get admin hierarchy for a point (5 levels)
const hierarchy = await sdk.getAdminHierarchy(24.7136, 46.6753);

if (hierarchy.region) {
  console.log("Region ID:", hierarchy.region.id);       // "001"
  console.log("Region:", hierarchy.region.name_en);      // "Riyadh Region"
}

if (hierarchy.governorate) {
  console.log("Governorate ID:", hierarchy.governorate.id); // "00100"
  console.log("Governorate:", hierarchy.governorate.name_en);
}

if (hierarchy.municipality) {
  console.log("Municipality ID:", hierarchy.municipality.id); // "00100100"
  console.log("Municipality:", hierarchy.municipality.name_en);
}

if (hierarchy.district) {
  console.log("District ID:", hierarchy.district.id);   // "00100001181"
  console.log("District:", hierarchy.district.name_en);
}

if (hierarchy.settlement) {
  console.log("Settlement:", hierarchy.settlement.name_en);
  console.log("Type:", hierarchy.settlement.type);       // "مدينة"
}`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
