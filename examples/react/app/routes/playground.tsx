import { useState, useCallback, useMemo, useEffect } from "react";
import Map, {
  Marker,
  Popup,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { useGeoSDK, type GeocodingResult } from "~/context/geo-sdk-context";
import { useTheme } from "~/hooks/use-theme";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Input } from "~/components/ui/input";
import { Slider } from "~/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Loader2,
  RotateCcw,
  Mail,
  Hash,
  CheckCircle,
  AlertCircle,
  Search,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import type { Route } from "./+types/playground";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Playground - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Interactive demo of the geocoding SDK" },
  ];
}

interface MarkerData {
  longitude: number;
  latitude: number;
  address: string;
  postcode?: string;
  distance?: number;
  isResult?: boolean;
}

// Map styles for light and dark mode
const MAP_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

// RTL text plugin URL
const RTL_PLUGIN_URL =
  "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js";

export default function Playground() {
  const { t, language } = useTranslation();
  const { theme } = useTheme();
  const { sdk, loading: _loading, error, stats, initialized, searchMode, retry } = useGeoSDK();

  // Map state
  const [mapRef, setMapRef] = useState<MapRef | null>(null);
  const [clickMarker, setClickMarker] = useState<MarkerData | null>(null);
  const [resultMarkers, setResultMarkers] = useState<MarkerData[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);

  // Forward geocoding state
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardResults, setForwardResults] = useState<GeocodingResult[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);

  // Reverse geocoding state
  const [reverseLat, setReverseLat] = useState("24.7136");
  const [reverseLon, setReverseLon] = useState("46.6753");
  const [reverseRadius, setReverseRadius] = useState([1000]);
  const [reverseDetailLevel] = useState<"minimal" | "postcode" | "region" | "full">("full");
  const [reverseResults, setReverseResults] = useState<GeocodingResult[]>([]);
  const [reverseLoading, setReverseLoading] = useState(false);

  // Postcode autocomplete state
  const [postcodeQuery, setPostcodeQuery] = useState("");
  const [selectedPostcode, setSelectedPostcode] = useState<string | null>(null);
  const [postcodeResults, setPostcodeResults] = useState<GeocodingResult[]>([]);
  const [postcodeLoading, setPostcodeLoading] = useState(false);

  // House number search state
  const [houseNumber, setHouseNumber] = useState("");
  const [houseRegion, setHouseRegion] = useState("");
  const [houseResults, setHouseResults] = useState<GeocodingResult[]>([]);
  const [houseLoading, setHouseLoading] = useState(false);

  // Admin hierarchy state
  const [adminHierarchy, setAdminHierarchy] = useState<{
    country?: string;
    region?: string;
    governorate?: string;
    district?: string;
  } | null>(null);

  // Active tab for syncing with map
  const [activeTab, setActiveTab] = useState("reverse");

  // Initialize RTL text plugin for Arabic support
  useEffect(() => {
    // Check if plugin is already loaded
    if (
      !maplibregl.getRTLTextPluginStatus ||
      maplibregl.getRTLTextPluginStatus() === "unavailable"
    ) {
      maplibregl.setRTLTextPlugin(RTL_PLUGIN_URL, true).catch((error) => {
        console.warn("RTL text plugin failed to load:", error);
      });
    }
  }, []);

  // Get current map style based on theme
  const mapStyle = theme === "dark" ? MAP_STYLES.dark : MAP_STYLES.light;

  // Filter postcodes for autocomplete
  const filteredPostcodes = useMemo(() => {
    if (!sdk || !postcodeQuery || selectedPostcode) return [];
    return sdk.getPostcodes(postcodeQuery).slice(0, 15);
  }, [sdk, postcodeQuery, selectedPostcode]);

  // Handle map click for reverse geocoding
  const handleMapClick = useCallback(
    async (e: MapLayerMouseEvent) => {
      if (!sdk) return;

      const { lng, lat } = e.lngLat;
      setMapLoading(true);
      setReverseLat(lat.toFixed(6));
      setReverseLon(lng.toFixed(6));

      // Get country and admin hierarchy for clicked location
      try {
        const [countryResult, hierarchyResult] = await Promise.all([
          sdk.detectCountry(lat, lng),
          sdk.getAdminHierarchy(lat, lng),
        ]);

        setAdminHierarchy({
          country: language === "ar" ? countryResult?.name_ar : countryResult?.name_en,
          region:
            language === "ar" ? hierarchyResult?.region?.name_ar : hierarchyResult?.region?.name_en,
          governorate:
            language === "ar"
              ? hierarchyResult?.governorate?.name_ar
              : hierarchyResult?.governorate?.name_en,
          district:
            language === "ar"
              ? hierarchyResult?.district?.name_ar
              : hierarchyResult?.district?.name_en,
        });
      } catch (err) {
        console.error("Failed to get location hierarchy:", err);
      }

      // Perform reverse geocoding
      try {
        const results = await sdk.reverseGeocode(lat, lng, {
          limit: 5,
          radiusMeters: reverseRadius[0],
          detailLevel: "full",
        });

        if (results.length > 0) {
          const result = results[0];
          const address = language === "ar" ? result.full_address_ar : result.full_address_en;

          setClickMarker({
            longitude: result.longitude,
            latitude: result.latitude,
            address: address || "Unknown",
            postcode: result.postcode,
            distance: result.distance_m,
          });
          setShowPopup(true);
          setReverseResults(results);

          // Show other results as markers
          setResultMarkers(
            results.slice(1).map((r) => ({
              longitude: r.longitude,
              latitude: r.latitude,
              address: (language === "ar" ? r.full_address_ar : r.full_address_en) || "",
              postcode: r.postcode,
              distance: r.distance_m,
              isResult: true,
            }))
          );

          toast.success(`Found ${results.length} nearby addresses`);
        } else {
          setClickMarker(null);
          setShowPopup(false);
          setResultMarkers([]);
          toast.info("No addresses found nearby");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Geocoding failed");
      } finally {
        setMapLoading(false);
      }
    },
    [sdk, language, reverseRadius]
  );

  // Fly to location on map
  const flyTo = useCallback(
    (lat: number, lng: number, zoom = 14) => {
      mapRef?.flyTo({ center: [lng, lat], zoom, duration: 1500 });
    },
    [mapRef]
  );

  // Show results on map
  const showResultsOnMap = useCallback(
    (results: GeocodingResult[]) => {
      if (results.length === 0) return;

      const markers = results.map((r) => ({
        longitude: r.longitude,
        latitude: r.latitude,
        address: (language === "ar" ? r.full_address_ar : r.full_address_en) || "",
        postcode: r.postcode,
        distance: r.distance_m,
        isResult: true,
      }));

      setResultMarkers(markers);
      setClickMarker(null);

      // Fly to first result
      if (results[0]) {
        flyTo(results[0].latitude, results[0].longitude);
      }
    },
    [language, flyTo]
  );

  const handleForwardGeocode = async () => {
    if (!sdk || !forwardQuery.trim()) return;
    setForwardLoading(true);
    try {
      const bbox = mapRef?.getBounds();
      const results = await sdk.geocode(forwardQuery, {
        limit: 10,
        bbox: bbox ? [bbox.getSouth(), bbox.getWest(), bbox.getNorth(), bbox.getEast()] : undefined,
      });
      setForwardResults(results);
      showResultsOnMap(results);
      toast.success(`Found ${results.length} results`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setForwardLoading(false);
    }
  };

  const handleReverseGeocode = async () => {
    if (!sdk) return;
    setReverseLoading(true);
    try {
      const lat = parseFloat(reverseLat);
      const lon = parseFloat(reverseLon);
      const results = await sdk.reverseGeocode(lat, lon, {
        limit: 10,
        radiusMeters: reverseRadius[0],
        detailLevel: reverseDetailLevel,
      });
      setReverseResults(results);
      showResultsOnMap(results);
      flyTo(lat, lon);
      toast.success(`Found ${results.length} nearby addresses`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reverse geocoding failed");
    } finally {
      setReverseLoading(false);
    }
  };

  const handleSelectPostcode = async (postcode: string) => {
    if (!sdk) return;
    setSelectedPostcode(postcode);
    setPostcodeQuery(postcode);
    setPostcodeLoading(true);

    try {
      const results = await sdk.searchByPostcode(postcode, { limit: 50 });
      setPostcodeResults(results);
      showResultsOnMap(results.slice(0, 20));
      toast.success(`Found ${results.length} addresses`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Postcode search failed");
    } finally {
      setPostcodeLoading(false);
    }
  };

  const handleHouseNumberSearch = async () => {
    if (!sdk || !houseNumber.trim()) return;
    setHouseLoading(true);
    try {
      const results = await sdk.searchByNumber(houseNumber, {
        limit: 20,
        region: houseRegion || undefined,
      });
      setHouseResults(results);
      showResultsOnMap(results);
      toast.success(`Found ${results.length} addresses`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "House number search failed");
    } finally {
      setHouseLoading(false);
    }
  };

  const getAddress = (result: GeocodingResult) => {
    return language === "ar" ? result.full_address_ar : result.full_address_en;
  };

  const getRegion = (result: GeocodingResult) => {
    return language === "ar" ? result.region_ar : result.region_en;
  };

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 p-4 overflow-hidden">
        {/* Map Panel */}
        <div className="h-[250px] sm:h-[350px] lg:h-auto lg:flex-1 shrink-0 relative rounded-lg overflow-hidden border bg-card">
          {mapLoading && (
            <div className="absolute top-4 left-4 z-10 bg-background/80 rounded-full p-2">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {/* SDK Status Overlay */}
          {!initialized && (
            <div className="absolute inset-0 z-10 bg-background/80 flex items-center justify-center">
              <Card className="max-w-sm">
                <CardContent className="pt-6 text-center">
                  {error ? (
                    <>
                      <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
                      <p className="text-destructive mb-4">{error.message}</p>
                      <Button onClick={retry}>Retry</Button>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                      <p className="text-muted-foreground">{t("playground.initializing")}</p>
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
              zoom: 10,
            }}
            style={{ width: "100%", height: "100%" }}
            mapStyle={mapStyle}
            onClick={initialized ? handleMapClick : undefined}
            cursor={initialized ? "crosshair" : "default"}
          >
            <NavigationControl position="top-right" />

            {/* Click marker (primary) */}
            {clickMarker && (
              <Marker
                longitude={clickMarker.longitude}
                latitude={clickMarker.latitude}
                anchor="bottom"
                color="#1a73e8"
                onClick={() => setShowPopup(true)}
              />
            )}

            {/* Result markers */}
            {resultMarkers.map((marker, i) => (
              <Marker
                key={i}
                longitude={marker.longitude}
                latitude={marker.latitude}
                anchor="bottom"
                color={i === 0 && !clickMarker ? "#1a73e8" : "#ff9800"}
                scale={i === 0 && !clickMarker ? 1 : 0.7}
              />
            ))}

            {/* Popup */}
            {clickMarker && showPopup && (
              <Popup
                longitude={clickMarker.longitude}
                latitude={clickMarker.latitude}
                anchor="bottom"
                offset={25}
                onClose={() => setShowPopup(false)}
                closeButton={true}
                closeOnClick={false}
                className={theme === "dark" ? "dark-popup" : ""}
              >
                <div
                  style={{ direction: language === "ar" ? "rtl" : "ltr" }}
                  className={`p-1 min-w-[200px] ${theme === "dark" ? "bg-zinc-800 text-white" : ""}`}
                >
                  <strong className="block text-sm">{clickMarker.address}</strong>
                  {clickMarker.postcode && (
                    <span className="text-xs text-muted-foreground block mt-1">
                      {clickMarker.postcode}
                    </span>
                  )}
                  {clickMarker.distance !== undefined && (
                    <span className="text-xs text-muted-foreground block">
                      {clickMarker.distance.toFixed(0)} m
                    </span>
                  )}
                </div>
              </Popup>
            )}
          </Map>

          {/* Map Stats Overlay */}
          {initialized && stats && (
            <div className="absolute bottom-4 left-4 z-10 bg-background/90 backdrop-blur rounded-lg px-3 py-2 text-xs flex gap-4">
              <span>{stats.totalTiles} tiles</span>
              <span>{(stats.totalAddresses / 1000000).toFixed(1)}M addresses</span>
              <Badge variant="secondary" className="text-xs">
                {searchMode === "fts-bm25" ? "FTS BM25" : "JACCARD"}
              </Badge>
            </div>
          )}

          {/* Admin Hierarchy Overlay */}
          {adminHierarchy && (
            <div
              className="absolute bottom-4 right-4 z-10 bg-background/90 backdrop-blur rounded-lg px-3 py-2 text-xs space-y-1 max-w-[250px]"
              dir={language === "ar" ? "rtl" : "ltr"}
            >
              <div className="font-semibold text-muted-foreground mb-1">
                {language === "ar" ? "التسلسل الإداري" : "Admin Hierarchy"}
              </div>
              {adminHierarchy.country && (
                <div className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  <span className="font-medium">{adminHierarchy.country}</span>
                </div>
              )}
              {adminHierarchy.region && (
                <div className="flex items-center gap-1 ml-4">
                  <span className="text-muted-foreground">→</span>
                  <span>{adminHierarchy.region}</span>
                </div>
              )}
              {adminHierarchy.governorate && (
                <div className="flex items-center gap-1 ml-6">
                  <span className="text-muted-foreground">→</span>
                  <span>{adminHierarchy.governorate}</span>
                </div>
              )}
              {adminHierarchy.district && (
                <div className="flex items-center gap-1 ml-8">
                  <span className="text-muted-foreground">→</span>
                  <span>{adminHierarchy.district}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Panel */}
        <div
          className="flex-1 lg:flex-none lg:w-[400px] flex flex-col min-h-0 overflow-hidden"
          dir={language === "ar" ? "rtl" : "ltr"}
        >
          <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                {initialized ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin" />
                )}
                {t("playground.title")}
              </CardTitle>
              <CardDescription className="text-xs">
                {language === "ar"
                  ? "انقر على الخريطة أو استخدم أدوات البحث"
                  : "Click on map or use search tools"}
              </CardDescription>
            </CardHeader>

            <CardContent
              className="flex-1 min-h-0 overflow-hidden p-0"
              dir={language === "ar" ? "rtl" : "ltr"}
            >
              {initialized ? (
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="h-full flex flex-col"
                >
                  <div className="px-4 pt-2 shrink-0">
                    <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1 rounded-lg w-full">
                      <TabsTrigger
                        value="reverse"
                        className="flex-1 min-w-[120px] data-[state=active]:bg-background"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        {t("playground.tabs.reverse")}
                      </TabsTrigger>
                      <TabsTrigger
                        value="forward"
                        className="flex-1 min-w-[120px] data-[state=active]:bg-background"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        {t("playground.tabs.forward")}
                      </TabsTrigger>
                      <TabsTrigger
                        value="postcode"
                        className="flex-1 min-w-[120px] data-[state=active]:bg-background"
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        {t("playground.tabs.postcode")}
                      </TabsTrigger>
                      <TabsTrigger
                        value="house"
                        className="flex-1 min-w-[120px] data-[state=active]:bg-background"
                      >
                        <Hash className="w-4 h-4 mr-2" />
                        {t("playground.tabs.number")}
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="flex-1 min-h-0 overflow-auto">
                    {/* Forward Geocoding Tab */}
                    <TabsContent value="forward" className="m-0 p-4 data-[state=active]:block">
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            placeholder={t("docs.forwardGeocoding.addressPlaceholder")}
                            value={forwardQuery}
                            onChange={(e) => setForwardQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleForwardGeocode()}
                            dir="auto"
                            className="text-sm"
                          />
                          <Button
                            onClick={handleForwardGeocode}
                            disabled={forwardLoading}
                            size="sm"
                          >
                            {forwardLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Search className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {forwardResults.length > 0 && (
                          <ResultsList
                            results={forwardResults}
                            getAddress={getAddress}
                            getRegion={getRegion}
                            onSelect={(r) => flyTo(r.latitude, r.longitude)}
                            showSimilarity
                          />
                        )}
                      </div>
                    </TabsContent>

                    {/* Reverse Geocoding Tab */}
                    <TabsContent value="reverse" className="m-0 p-4 data-[state=active]:block">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted-foreground">
                              {language === "ar" ? "خط العرض" : "Lat"}
                            </label>
                            <Input
                              type="number"
                              step="0.0001"
                              value={reverseLat}
                              onChange={(e) => setReverseLat(e.target.value)}
                              className="text-sm"
                              dir="ltr"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">
                              {language === "ar" ? "خط الطول" : "Lng"}
                            </label>
                            <Input
                              type="number"
                              step="0.0001"
                              value={reverseLon}
                              onChange={(e) => setReverseLon(e.target.value)}
                              className="text-sm"
                              dir="ltr"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">
                            {language === "ar"
                              ? `نصف القطر: ${reverseRadius[0]}م`
                              : `Radius: ${reverseRadius[0]}m`}
                          </label>
                          <Slider
                            value={reverseRadius}
                            onValueChange={setReverseRadius}
                            min={100}
                            max={5000}
                            step={100}
                          />
                        </div>
                        <Button
                          onClick={handleReverseGeocode}
                          disabled={reverseLoading}
                          size="sm"
                          className="w-full"
                        >
                          {reverseLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          {t("common.search")}
                        </Button>
                        {reverseResults.length > 0 && (
                          <ResultsList
                            results={reverseResults}
                            getAddress={getAddress}
                            getRegion={getRegion}
                            onSelect={(r) => flyTo(r.latitude, r.longitude)}
                            showDistance
                          />
                        )}
                      </div>
                    </TabsContent>

                    {/* Postcode Search Tab */}
                    <TabsContent value="postcode" className="m-0 p-4 data-[state=active]:block">
                      <div className="space-y-3">
                        <div className="relative">
                          <Input
                            placeholder={t("docs.postcodeSearch.postcodePlaceholder")}
                            value={postcodeQuery}
                            onChange={(e) => {
                              setPostcodeQuery(e.target.value);
                              setSelectedPostcode(null);
                            }}
                            className="text-sm"
                            dir="ltr"
                          />
                          {/* Autocomplete Dropdown */}
                          {filteredPostcodes.length > 0 && (
                            <Card
                              className="absolute top-full left-0 right-0 mt-1 z-20 max-h-[200px] overflow-auto"
                              dir="ltr"
                            >
                              <div className="p-1">
                                {filteredPostcodes.map((pc) => (
                                  <button
                                    key={pc.postcode}
                                    onClick={() => handleSelectPostcode(pc.postcode)}
                                    className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent flex justify-between items-center"
                                  >
                                    <span className="font-mono font-bold">{pc.postcode}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {pc.addr_count.toLocaleString()}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </Card>
                          )}
                        </div>
                        {postcodeLoading ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : postcodeResults.length > 0 ? (
                          <ResultsList
                            results={postcodeResults}
                            getAddress={getAddress}
                            getRegion={getRegion}
                            onSelect={(r) => flyTo(r.latitude, r.longitude)}
                          />
                        ) : null}
                      </div>
                    </TabsContent>

                    {/* House Number Search Tab */}
                    <TabsContent value="house" className="m-0 p-4 data-[state=active]:block">
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            placeholder={t("docs.houseNumber.numberPlaceholder")}
                            value={houseNumber}
                            onChange={(e) => setHouseNumber(e.target.value)}
                            className="text-sm w-24"
                            dir="ltr"
                          />
                          <Select
                            value={houseRegion || "all"}
                            onValueChange={(v) => setHouseRegion(v === "all" ? "" : v)}
                          >
                            <SelectTrigger className="flex-1 text-sm">
                              <SelectValue placeholder={t("docs.houseNumber.regionFilter")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t("regions.all")}</SelectItem>
                              <SelectItem value="منطقة الرياض">{t("regions.riyadh")}</SelectItem>
                              <SelectItem value="منطقة مكة المكرمة">
                                {t("regions.makkah")}
                              </SelectItem>
                              <SelectItem value="المنطقة الشرقية">
                                {t("regions.eastern")}
                              </SelectItem>
                              <SelectItem value="منطقة المدينة المنورة">
                                {t("regions.madinah")}
                              </SelectItem>
                              <SelectItem value="منطقة القصيم">{t("regions.qassim")}</SelectItem>
                              <SelectItem value="منطقة عسير">{t("regions.asir")}</SelectItem>
                              <SelectItem value="منطقة جازان">{t("regions.jazan")}</SelectItem>
                              <SelectItem value="منطقة تبوك">{t("regions.tabuk")}</SelectItem>
                              <SelectItem value="منطقة حائل">{t("regions.hail")}</SelectItem>
                              <SelectItem value="منطقة نجران">{t("regions.najran")}</SelectItem>
                              <SelectItem value="منطقة الجوف">{t("regions.jawf")}</SelectItem>
                              <SelectItem value="منطقة الباحة">{t("regions.bahah")}</SelectItem>
                              <SelectItem value="منطقة الحدود الشمالية">
                                {t("regions.northern")}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          onClick={handleHouseNumberSearch}
                          disabled={houseLoading}
                          size="sm"
                          className="w-full"
                        >
                          {houseLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          {t("common.search")}
                        </Button>
                        {houseResults.length > 0 && (
                          <ResultsList
                            results={houseResults}
                            getAddress={getAddress}
                            getRegion={getRegion}
                            onSelect={(r) => flyTo(r.latitude, r.longitude)}
                          />
                        )}
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              ) : (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-8 w-1/2" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dark mode popup styles */}
      <style>{`
        .dark-popup .maplibregl-popup-content {
          background: #27272a;
          color: white;
        }
        .dark-popup .maplibregl-popup-tip {
          border-top-color: #27272a;
        }
        .dark-popup .maplibregl-popup-close-button {
          color: white;
        }
      `}</style>
    </Layout>
  );
}

interface ResultsListProps {
  results: GeocodingResult[];
  getAddress: (r: GeocodingResult) => string | undefined;
  getRegion: (r: GeocodingResult) => string | undefined;
  onSelect?: (r: GeocodingResult) => void;
  showDistance?: boolean;
  showSimilarity?: boolean;
}

function ResultsList({
  results,
  getAddress,
  getRegion: _getRegion,
  onSelect,
  showDistance,
  showSimilarity,
}: ResultsListProps) {
  return (
    <div className="space-y-2">
      {results.map((result, i) => (
        <div
          key={i}
          onClick={() => onSelect?.(result)}
          className="p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
        >
          <div className="font-medium text-sm leading-tight" dir="auto">
            {getAddress(result) || "-"}
          </div>
          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
            {result.postcode && <span>{result.postcode}</span>}
            {showDistance && result.distance_m !== undefined && (
              <Badge variant="secondary" className="text-xs px-1 py-0">
                {result.distance_m.toFixed(0)}m
              </Badge>
            )}
            {showSimilarity && result.similarity !== undefined && (
              <Badge variant="secondary" className="text-xs px-1 py-0">
                {(result.similarity * 100).toFixed(0)}%
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
