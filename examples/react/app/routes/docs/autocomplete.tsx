import { useState, useEffect } from "react";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { useGeoSDK } from "~/context/geo-sdk-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { CodeBlock } from "~/components/ui/code-block";
import { Loader2, Sparkles } from "lucide-react";
import type { Route } from "./+types/autocomplete";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Autocomplete - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Real-time address autocomplete suggestions" },
  ];
}

export default function Autocomplete() {
  const { t, language } = useTranslation();
  const { sdk, initialized, loading } = useGeoSDK();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ address_ar: string; address_en: string }>>(
    []
  );
  const [searching, setSearching] = useState(false);

  // Fetch autocomplete suggestions (debounced)
  useEffect(() => {
    if (!sdk || !query.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await sdk.getAutocompleteSuggestions(query, {
          limit: 10,
        });
        setSuggestions(result?.suggestions || []);
      } catch (e) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [sdk, query]);

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            API
          </Badge>
          <h1 className="text-3xl font-bold mb-2">{t("docs.autocomplete.title")}</h1>
          <p className="text-muted-foreground">{t("docs.autocomplete.description")}</p>
        </div>

        {/* Method Signature */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.methodSignature")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`getAutocompleteSuggestions(
  query: string,
  options?: {
    limit?: number;        // Max suggestions (default: 10)
    bbox?: [minLat, minLon, maxLat, maxLon];  // Visible map bounds
    region?: string;       // Filter by single region name
  }
): Promise<{
  suggestions: Array<{
    address_ar: string;
    address_en: string;
  }>;
}>`}
            />
          </CardContent>
        </Card>

        {/* Interactive Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("common.tryIt")}</CardTitle>
            <CardDescription>{t("docs.autocomplete.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!initialized ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{loading ? "Initializing SDK..." : "Loading..."}</span>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Input
                    placeholder={t("docs.autocomplete.placeholder")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    dir={language === "ar" ? "rtl" : "ltr"}
                    className="w-full"
                  />
                  {searching && (
                    <div className="absolute right-3 top-3">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {suggestions.length > 0 && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {suggestions.map((suggestion, i) => (
                          <button
                            key={i}
                            className="w-full px-4 py-3 text-left hover:bg-accent transition-colors"
                            onClick={() => {
                              setQuery(
                                language === "ar" ? suggestion.address_ar : suggestion.address_en
                              );
                              setSuggestions([]);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                              <div className="flex-1" dir="auto">
                                {language === "ar" ? suggestion.address_ar : suggestion.address_en}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {query.trim() && !searching && suggestions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {language === "ar" ? "لم يتم العثور على اقتراحات" : "No suggestions found"}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Features */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{language === "ar" ? "المميزات" : "Features"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-muted-foreground">
              <li>
                <strong>{language === "ar" ? "سريع وفعال" : "Fast & Efficient"}</strong> -{" "}
                {language === "ar"
                  ? "اقتراحات فورية أثناء الكتابة"
                  : "Real-time suggestions as you type"}
              </li>
              <li>
                <strong>{language === "ar" ? "ذكي" : "Smart"}</strong> -{" "}
                {language === "ar"
                  ? "مطابقة جزئية للنص العربي والإنجليزي"
                  : "Fuzzy matching for both Arabic and English text"}
              </li>
              <li>
                <strong>{language === "ar" ? "قابل للتخصيص" : "Customizable"}</strong> -{" "}
                {language === "ar"
                  ? "تصفية حسب المنطقة أو حدود الخريطة"
                  : "Filter by region or map bounds"}
              </li>
              <li>
                <strong>{language === "ar" ? "ثنائي اللغة" : "Bilingual"}</strong> -{" "}
                {language === "ar"
                  ? "يعمل مع العناوين العربية والإنجليزية"
                  : "Works with both Arabic and English addresses"}
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
import { useState, useEffect } from "react";

const sdk = new GeoSDK();
await sdk.initialize();

function AddressAutocomplete() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  // Debounced autocomplete
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      const result = await sdk.getAutocompleteSuggestions(query, {
        limit: 10,
      });
      setSuggestions(result?.suggestions || []);
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type an address..."
      />
      <ul>
        {suggestions.map((s, i) => (
          <li key={i} onClick={() => setQuery(s.address_en)}>
            {s.address_en}
          </li>
        ))}
      </ul>
    </div>
  );
}`}
            />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
