import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CodeBlock } from "~/components/ui/code-block";
import { Hash, AlertCircle } from "lucide-react";
import type { Route } from "./+types/getting-started";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Getting Started - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Learn how to install and use the geocoding SDK" },
  ];
}

export default function GettingStarted() {
  const { t, language } = useTranslation();

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            Documentation
          </Badge>
          <h1 className="text-3xl font-bold mb-2">{t("docs.gettingStarted.title")}</h1>
          <p className="text-muted-foreground">{t("docs.gettingStarted.description")}</p>
        </div>

        {/* Installation */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("docs.gettingStarted.installation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="npm">
              <TabsList>
                <TabsTrigger value="npm">npm</TabsTrigger>
                <TabsTrigger value="yarn">yarn</TabsTrigger>
                <TabsTrigger value="pnpm">pnpm</TabsTrigger>
                <TabsTrigger value="bun">bun</TabsTrigger>
              </TabsList>
              <TabsContent value="npm">
                <CodeBlock code="npm install @tabaqat/geocoding-sdk" language="bash" />
              </TabsContent>
              <TabsContent value="yarn">
                <CodeBlock code="yarn add @tabaqat/geocoding-sdk" language="bash" />
              </TabsContent>
              <TabsContent value="pnpm">
                <CodeBlock code="pnpm add @tabaqat/geocoding-sdk" language="bash" />
              </TabsContent>
              <TabsContent value="bun">
                <CodeBlock code="bun add @tabaqat/geocoding-sdk" language="bash" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Quick Start */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("docs.gettingStarted.quickStart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CodeBlock
              language="typescript"
              code={`import { GeoSDK } from "@tabaqat/geocoding-sdk";

// Create SDK instance
const sdk = new GeoSDK();

// Initialize (loads ~140KB of index data)
await sdk.initialize();

// Now you can use all SDK methods!
console.log("SDK ready:", await sdk.getStats());`}
            />
          </CardContent>
        </Card>

        {/* Initialization Options */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("docs.gettingStarted.initialization")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {language === "ar"
                ? "يمكنك تخصيص SDK عند التهيئة:"
                : "You can customize the SDK during initialization:"}
            </p>
            <CodeBlock
              language="typescript"
              code={`import { GeoSDK } from "@tabaqat/geocoding-sdk";

const sdk = new GeoSDK({
  // Custom data URL (default: source.coop)
  dataUrl: "https://your-cdn.com/geocoding-data/v0.1.0",

  // Default language for results
  language: "ar" // or "en"
});

await sdk.initialize();`}
            />
          </CardContent>
        </Card>

        {/* Browser Requirements */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{language === "ar" ? "متطلبات المتصفح" : "Browser Requirements"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {language === "ar"
                ? "يتطلب SDK ميزات المتصفح الحديثة التالية:"
                : "The SDK requires the following modern browser features:"}
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>WebAssembly (WASM)</li>
              <li>SharedArrayBuffer (requires COOP/COEP headers)</li>
              <li>Web Workers</li>
              <li>IndexedDB (optional, for caching)</li>
            </ul>
            <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-sm">
                <strong>{language === "ar" ? "ملاحظة:" : "Note:"}</strong>{" "}
                {language === "ar"
                  ? "للتطوير المحلي، تحتاج إلى تكوين رؤوس COOP/COEP. راجع توثيق DuckDB-WASM للتفاصيل."
                  : "For local development, you need to configure COOP/COEP headers. See DuckDB-WASM documentation for details."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* TypeScript Support */}
        <Card>
          <CardHeader>
            <CardTitle>TypeScript</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {language === "ar"
                ? "SDK مكتوب بالكامل بـ TypeScript ويوفر أنواع كاملة:"
                : "The SDK is fully written in TypeScript and provides complete types:"}
            </p>
            <CodeBlock
              language="typescript"
              code={`import {
  GeoSDK,
  type GeocodingResult,
  type CountryResult,
  type TileInfo,
  type PostcodeInfo,
  type GeoSDKH3Config
} from "@tabaqat/geocoding-sdk";

// All methods are fully typed
const results: GeocodingResult[] = await sdk.geocode("address");`}
            />
          </CardContent>
        </Card>
        {/* Offline / Airgapped Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-5 h-5" />
              {t("gettingStarted.offlineUsage.title")}
            </CardTitle>
            <CardDescription>{t("gettingStarted.offlineUsage.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">{t("gettingStarted.offlineUsage.step1.title")}</h4>
              <p className="text-sm text-muted-foreground mb-3">
                {t("gettingStarted.offlineUsage.step1.description")}
              </p>
              <CodeBlock
                language="bash"
                code={`# Download all required Parquet files
mkdir -p ./public/geocoding-data/v0.1.0/tiles

# Download index files
curl -o ./public/geocoding-data/v0.1.0/tile_index.parquet \\
  https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tile_index.parquet

curl -o ./public/geocoding-data/v0.1.0/postcode_index.parquet \\
  https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/postcode_index.parquet

# Download boundary files
curl -o ./public/geocoding-data/v0.1.0/world_countries_simple.parquet \\
  https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/world_countries_simple.parquet

curl -o ./public/geocoding-data/v0.1.0/sa_regions_simple.parquet \\
  https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_regions_simple.parquet

curl -o ./public/geocoding-data/v0.1.0/sa_districts_simple.parquet \\
  https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/sa_districts_simple.parquet

# Download all tile files (717 files, ~158MB total)
# You can use a script or download selectively based on your region
for tile in $(curl -s https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/ | grep -o 'href="[^"]*\\.parquet"' | cut -d'"' -f2); do
  curl -o ./public/geocoding-data/v0.1.0/tiles/$tile \\
    https://data.source.coop/tabaqat/geocoding-cng/v0.1.0/tiles/$tile
done`}
              />
            </div>

            <div>
              <h4 className="font-semibold mb-2">{t("gettingStarted.offlineUsage.step2.title")}</h4>
              <p className="text-sm text-muted-foreground mb-3">
                {t("gettingStarted.offlineUsage.step2.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`import { GeoSDK } from '@tabaqat/geocoding-sdk';

// Point to your local data directory
const sdk = new GeoSDK({
  dataUrl: '/geocoding-data/v0.1.0', // Relative to your public folder
  language: 'ar'
});

await sdk.initialize();

// Now works completely offline!
const results = await sdk.reverseGeocode(24.7136, 46.6753);
console.log(results);`}
              />
            </div>

            <div>
              <h4 className="font-semibold mb-2">{t("gettingStarted.offlineUsage.step3.title")}</h4>
              <p className="text-sm text-muted-foreground mb-3">
                {t("gettingStarted.offlineUsage.step3.description")}
              </p>
              <CodeBlock
                language="typescript"
                code={`// For airgapped environments, configure your web server
// to serve the Parquet files with proper CORS headers

// Example nginx configuration:
location /geocoding-data/ {
    add_header 'Access-Control-Allow-Origin' '*';
    add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS';
    add_header 'Access-Control-Allow-Headers' 'Range';
    
    # Enable range requests for efficient loading
    add_header 'Accept-Ranges' 'bytes';
}

// Example Apache configuration:
# <Directory "/var/www/html/geocoding-data">
#     Header set Access-Control-Allow-Origin "*"
#     Header set Access-Control-Allow-Methods "GET, OPTIONS"
#     Header set Access-Control-Allow-Headers "Range"
#     Header set Accept-Ranges "bytes"
# </Directory>`}
              />
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {t("gettingStarted.offlineUsage.notes.title")}
              </h4>
              <ul className="text-sm space-y-2 list-disc list-inside text-muted-foreground">
                <li>{t("gettingStarted.offlineUsage.notes.note1")}</li>
                <li>{t("gettingStarted.offlineUsage.notes.note2")}</li>
                <li>{t("gettingStarted.offlineUsage.notes.note3")}</li>
                <li>{t("gettingStarted.offlineUsage.notes.note4")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
