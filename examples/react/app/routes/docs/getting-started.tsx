import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { CodeBlock } from "~/components/ui/code-block";
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
      </div>
    </Layout>
  );
}
