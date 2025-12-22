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
import type { Route } from "./+types/country-detection";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Country Detection - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Identify country from coordinates" },
  ];
}

export default function CountryDetection() {
  const { t, language } = useTranslation();
  const { sdk, initialized, loading } = useGeoSDK();
  const [lat, setLat] = useState("24.7136");
  const [lon, setLon] = useState("46.6753");
  const [result, setResult] = useState<{
    iso_a3: string;
    iso_a2: string;
    name_en: string;
    name_ar: string;
    continent: string;
  } | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!sdk) return;
    setSearching(true);
    try {
      const res = await sdk.detectCountry(parseFloat(lat), parseFloat(lon));
      setResult(res as any);
      if (res) {
        toast.success(
          `Detected: ${language === "ar" ? (res as any).name_ar : (res as any).name_en}`
        );
      } else {
        toast.info("Point is not in any country (ocean/disputed territory)");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Detection failed");
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
          <h1 className="text-3xl font-bold mb-2">{t("docs.countryDetection.title")}</h1>
          <p className="text-muted-foreground">{t("docs.countryDetection.description")}</p>
        </div>

        {/* Method Signature */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Method Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`detectCountry(
  lat: number,
  lon: number
): Promise<CountryResult | null>

interface CountryResult {
  iso_a3: string;    // "SAU"
  iso_a2: string;    // "SA"
  name_en: string;   // "Saudi Arabia"
  name_ar: string;   // "المملكة العربية السعودية"
  continent: string; // "Asia"
}`}
            />
          </CardContent>
        </Card>

        {/* Interactive Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.tryIt")}</CardTitle>
            <CardDescription>{t("docs.countryDetection.description")}</CardDescription>
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
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Detect"}
                    </Button>
                  </div>
                </div>
                {result && (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">Country</div>
                          <div className="text-xl font-bold" dir="auto">
                            {language === "ar" ? result.name_ar : result.name_en}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">ISO Codes</div>
                          <div className="font-mono">
                            {result.iso_a2} / {result.iso_a3}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Continent</div>
                          <div>{result.continent}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Also: isInSaudiArabia */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>isInSaudiArabia()</CardTitle>
            <CardDescription>
              {language === "ar"
                ? "تحقق سريع مما إذا كانت النقطة داخل المملكة العربية السعودية"
                : "Quick check if a point is inside Saudi Arabia"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`// Quick Saudi Arabia boundary check
const inSA = await sdk.isInSaudiArabia(24.7136, 46.6753);
// Returns: true

// Uses quick bounding box check first, then polygon check
// Faster than detectCountry() for this specific use case`}
            />
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

// Detect country from coordinates
const country = await sdk.detectCountry(24.7136, 46.6753);

if (country) {
  console.log(country.name_en);  // "Saudi Arabia"
  console.log(country.name_ar);  // "المملكة العربية السعودية"
  console.log(country.iso_a2);   // "SA"
  console.log(country.continent); // "Asia"
} else {
  console.log("Point is in ocean or disputed territory");
}`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
