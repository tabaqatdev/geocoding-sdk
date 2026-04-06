import { useState, useCallback, useEffect, useRef } from "react";
import Map, {
  Marker,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { useGeoSDK } from "~/context/geo-sdk-context";
import { useTheme } from "~/hooks/use-theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { CodeBlock } from "~/components/ui/code-block";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AdminHierarchy } from "@tabaqat/geocoding-sdk";
import type { Route } from "./+types/admin-hierarchy";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Admin Hierarchy - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Get administrative hierarchy for Saudi Arabia coordinates" },
  ];
}

const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

const RTL_PLUGIN_URL = "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js";

export default function AdminHierarchy() {
  const { t, language } = useTranslation();
  const { theme } = useTheme();
  const { sdk, initialized, loading, error, retry } = useGeoSDK();
  const [lat, setLat] = useState("24.7136");
  const [lon, setLon] = useState("46.6753");
  const [result, setResult] = useState<AdminHierarchy | null>(null);
  const [searching, setSearching] = useState(false);
  const [mapRef, setMapRef] = useState<MapRef | null>(null);
  const [markerPos, setMarkerPos] = useState<{ lat: number; lon: number } | null>(null);

  // Initialize RTL text plugin for Arabic support
  useEffect(() => {
    if (
      !maplibregl.getRTLTextPluginStatus ||
      maplibregl.getRTLTextPluginStatus() === "unavailable"
    ) {
      maplibregl.setRTLTextPlugin(RTL_PLUGIN_URL, true).catch((err) => {
        console.warn("RTL text plugin failed to load:", err);
      });
    }
  }, []);

  const mapStyle = theme === "dark" ? MAP_STYLES.dark : MAP_STYLES.light;

  const handleSearch = useCallback(
    async (searchLat?: number, searchLon?: number) => {
      if (!sdk) return;
      const latVal = searchLat ?? parseFloat(lat);
      const lonVal = searchLon ?? parseFloat(lon);
      if (isNaN(latVal) || isNaN(lonVal)) return;

      setSearching(true);
      try {
        const res = await sdk.getAdminHierarchy(latVal, lonVal);
        setResult(res);
        setMarkerPos({ lat: latVal, lon: lonVal });
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
    },
    [sdk, lat, lon]
  );

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const { lng, lat: clickLat } = e.lngLat;
      setLat(clickLat.toFixed(6));
      setLon(lng.toFixed(6));
      setMarkerPos({ lat: clickLat, lon: lng });
      handleSearch(clickLat, lng);
    },
    [handleSearch]
  );

  const handleManualSearch = useCallback(() => {
    const latVal = parseFloat(lat);
    const lonVal = parseFloat(lon);
    if (isNaN(latVal) || isNaN(lonVal)) return;
    setMarkerPos({ lat: latVal, lon: lonVal });
    mapRef?.flyTo({ center: [lonVal, latVal], zoom: 12, duration: 1200 });
    handleSearch(latVal, lonVal);
  }, [lat, lon, mapRef, handleSearch]);

  return (
    <Layout>
      <div className="h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* Map Panel */}
        <div className="h-[250px] lg:h-auto lg:flex-1 shrink-0 relative rounded-lg overflow-hidden border bg-card">
          {!initialized && (
            <div className="absolute inset-0 z-10 bg-background/80 flex items-center justify-center">
              <Card className="max-w-sm">
                <CardContent className="pt-6 text-center">
                  {error ? (
                    <>
                      <p className="text-destructive mb-4">{error.message}</p>
                      <Button onClick={retry}>Retry</Button>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {loading ? "Initializing SDK..." : "Loading..."}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <Map
            ref={(ref) => setMapRef(ref)}
            initialViewState={{
              longitude: 46.6753,
              latitude: 24.7136,
              zoom: 6,
            }}
            style={{ width: "100%", height: "100%" }}
            mapStyle={mapStyle}
            onClick={initialized ? handleMapClick : undefined}
            cursor={initialized ? "crosshair" : "default"}
            attributionControl={false}
          >
            <NavigationControl position="top-right" />

            {markerPos && (
              <Marker
                longitude={markerPos.lon}
                latitude={markerPos.lat}
                anchor="bottom"
                color="#1a73e8"
              />
            )}
          </Map>
        </div>

        {/* Sidebar */}
        <div className="flex-1 lg:flex-none lg:w-[420px] flex flex-col min-h-0 overflow-auto space-y-4">
          <div>
            <Badge variant="secondary" className="mb-2">
              API
            </Badge>
            <h1 className="text-3xl font-bold mb-2">{t("docs.adminHierarchy.title")}</h1>
            <p className="text-muted-foreground">{t("docs.adminHierarchy.description")}</p>
          </div>

          {/* Method Signature */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("common.methodSignature")}</CardTitle>
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
  settlement?: { id: string; name_ar: string; name_en: string; type?: string; distance_m?: number };
  major_city?: {
    id: string; name_ar: string; name_en: string;
    alt_name_ar?: string; alt_name_en?: string;
    city_type?: string; city_grade?: number;
    amana_id?: string; amana_name_ar?: string; amana_name_en?: string;
    distance_m?: number;
  };
}>`}
              />
            </CardContent>
          </Card>

          {/* Interactive Demo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("common.tryIt")}</CardTitle>
              <CardDescription>{t("docs.adminHierarchy.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error ? (
                <div className="space-y-2">
                  <p className="text-destructive text-sm">
                    SDK initialization failed: {error.message}
                  </p>
                  <Button variant="outline" size="sm" onClick={retry}>
                    Retry
                  </Button>
                </div>
              ) : !initialized ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{loading ? "Initializing SDK..." : "Loading..."}</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                    <div className="min-w-0">
                      <label className="text-sm text-muted-foreground">
                        {t("common.latitude")}
                      </label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="text-sm text-muted-foreground">
                        {t("common.longitude")}
                      </label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={lon}
                        onChange={(e) => setLon(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                    <Button
                      onClick={handleManualSearch}
                      disabled={searching}
                      className="whitespace-nowrap"
                    >
                      {searching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("common.getHierarchy")
                      )}
                    </Button>
                  </div>
                  {result && (
                    <div className="rounded-lg border bg-muted/50 overflow-hidden text-sm">
                      {result.region ||
                      result.governorate ||
                      result.municipality ||
                      result.district ||
                      result.major_city ? (
                        <table className="w-full">
                          <tbody className="divide-y divide-border">
                            {result.region && (
                              <tr>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap align-top w-0">
                                  {language === "ar" ? "المنطقة" : "Region"}
                                </td>
                                <td className="px-3 py-2 font-medium" dir="auto">
                                  {language === "ar"
                                    ? result.region.name_ar
                                    : result.region.name_en}
                                  <span className="text-xs text-muted-foreground font-mono ms-2">
                                    {result.region.id}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {result.governorate && (
                              <tr>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap align-top w-0">
                                  {language === "ar" ? "المحافظة" : "Governorate"}
                                </td>
                                <td className="px-3 py-2 font-medium" dir="auto">
                                  {language === "ar"
                                    ? result.governorate.name_ar
                                    : result.governorate.name_en}
                                  <span className="text-xs text-muted-foreground font-mono ms-2">
                                    {result.governorate.id}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {result.municipality && (
                              <tr>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap align-top w-0">
                                  {language === "ar" ? "البلدية" : "Municipality"}
                                </td>
                                <td className="px-3 py-2 font-medium" dir="auto">
                                  {language === "ar"
                                    ? result.municipality.name_ar
                                    : result.municipality.name_en}
                                  <span className="text-xs text-muted-foreground font-mono ms-2">
                                    {result.municipality.id}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {result.district && (
                              <tr>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap align-top w-0">
                                  {language === "ar" ? "الحي" : "District"}
                                </td>
                                <td className="px-3 py-2 font-medium" dir="auto">
                                  {language === "ar"
                                    ? result.district.name_ar
                                    : result.district.name_en}
                                  <span className="text-xs text-muted-foreground font-mono ms-2">
                                    {result.district.id}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {/* Settlement row hidden from UI
                            {result.settlement && (
                              <tr>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap align-top w-0">
                                  {language === "ar" ? "تجمع سكاني" : "Settlement"}
                                  {result.settlement.type && (
                                    <Badge variant="outline" className="ms-1 text-xs">
                                      {result.settlement.type}
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-medium" dir="auto">
                                  {language === "ar"
                                    ? result.settlement.name_ar
                                    : result.settlement.name_en}
                                  {result.settlement.distance_m != null && (
                                    <span className="text-xs text-muted-foreground ms-2">
                                      {result.settlement.distance_m >= 1000
                                        ? `${(result.settlement.distance_m / 1000).toFixed(1)} km`
                                        : `${result.settlement.distance_m} m`}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )}
                            */}
                            {result.major_city && (
                              <tr>
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap align-top w-0">
                                  {language === "ar" ? "مدينة رئيسية" : "Major City"}
                                  {result.major_city.city_grade != null && (
                                    <Badge variant="outline" className="ms-1 text-xs">
                                      {language === "ar"
                                        ? `درجة ${result.major_city.city_grade}`
                                        : `Grade ${result.major_city.city_grade}`}
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-medium" dir="auto">
                                  {language === "ar"
                                    ? result.major_city.name_ar
                                    : result.major_city.name_en}
                                  {result.major_city.id && (
                                    <span className="text-xs text-muted-foreground font-mono ms-2">
                                      {result.major_city.id}
                                    </span>
                                  )}
                                  {result.major_city.distance_m != null && (
                                    <span className="text-xs text-muted-foreground ms-2">
                                      {result.major_city.distance_m >= 1000
                                        ? `${(result.major_city.distance_m / 1000).toFixed(1)} km`
                                        : `${result.major_city.distance_m} m`}
                                    </span>
                                  )}
                                  {result.major_city.amana_id && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {language === "ar" ? "أمانة: " : "Amana: "}
                                      {language === "ar"
                                        ? result.major_city.amana_name_ar
                                        : result.major_city.amana_name_en}
                                      <span className="font-mono ms-1">
                                        {result.major_city.amana_id}
                                      </span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <div className="px-3 py-4 text-muted-foreground text-center">
                          {language === "ar"
                            ? "النقطة خارج حدود المناطق الإدارية السعودية"
                            : "Point is outside Saudi Arabia admin boundaries"}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Admin Levels */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {language === "ar" ? "المستويات الإدارية" : "Admin Levels"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-muted-foreground text-sm">
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
                {/* Settlement item hidden from UI
                <li>
                  <strong>{language === "ar" ? "التجمعات السكانية" : "Settlements"}</strong> - 6,416{" "}
                  {language === "ar"
                    ? "نقطة استيطان (أقرب نقطة)"
                    : "settlement points (nearest-point lookup)"}
                </li>
                */}
                <li>
                  <strong>{language === "ar" ? "المدن الرئيسية" : "Major Cities"}</strong> - 220{" "}
                  {language === "ar"
                    ? "مدينة رئيسية (أقرب نقطة)"
                    : "major city points (nearest-point lookup)"}
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Code Example */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("common.viewCode")}</CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock
                language="typescript"
                code={`import { GeoSDK } from "@tabaqat/geocoding-sdk";

const sdk = new GeoSDK();
await sdk.initialize();

// Get admin hierarchy for a point (6 levels)
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
}

if (hierarchy.major_city) {
  console.log("Major City:", hierarchy.major_city.name_en);
  console.log("Grade:", hierarchy.major_city.city_grade);
}`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
