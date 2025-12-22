import { Link } from "react-router";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { CodeBlock } from "~/components/ui/code-block";
import {
  MapPin,
  RotateCcw,
  Mail,
  Languages,
  Server,
  Zap,
  ArrowRight,
  Database,
  Map,
  Layers,
} from "lucide-react";
import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Browser-based geocoding for Saudi Arabia using DuckDB-WASM" },
  ];
}

export default function Home() {
  const { t } = useTranslation();

  const features = [
    {
      icon: MapPin,
      title: t("home.features.forwardGeocoding.title"),
      description: t("home.features.forwardGeocoding.description"),
    },
    {
      icon: RotateCcw,
      title: t("home.features.reverseGeocoding.title"),
      description: t("home.features.reverseGeocoding.description"),
    },
    {
      icon: Mail,
      title: t("home.features.postcodeSearch.title"),
      description: t("home.features.postcodeSearch.description"),
    },
    {
      icon: Languages,
      title: t("home.features.bilingual.title"),
      description: t("home.features.bilingual.description"),
    },
    {
      icon: Server,
      title: t("home.features.zeroBackend.title"),
      description: t("home.features.zeroBackend.description"),
    },
    {
      icon: Zap,
      title: t("home.features.fastPerformance.title"),
      description: t("home.features.fastPerformance.description"),
    },
  ];

  const stats = [
    { value: "5.3M+", label: t("home.stats.addresses"), icon: Database },
    { value: "13", label: t("home.stats.regions"), icon: Map },
    { value: "717", label: t("home.stats.tiles"), icon: Layers },
    { value: "~140KB", label: t("home.stats.initialLoad"), icon: Zap },
  ];

  return (
    <Layout showSidebar={false}>
      {/* Hero Section */}
      <section className="relative py-20 px-6 lg:py-32 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-4">
            v0.1.0 - H3 Tile-Based
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl mb-6">
            {t("home.hero.title")}
          </h1>
          <p className="text-xl text-muted-foreground mb-4">{t("home.hero.subtitle")}</p>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t("home.hero.description")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" asChild>
              <Link to="/docs/getting-started">
                {t("home.hero.getStarted")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/playground">{t("home.hero.viewPlayground")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <stat.icon className="h-8 w-8 mx-auto mb-2 text-primary" />
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">{t("home.features.title")}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Code Example Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-8">Quick Start</h2>
          <Card>
            <CardContent className="pt-6">
              <CodeBlock
                language="typescript"
                code={`import { GeoSDK } from "@tabaqat/geocoding-sdk";

// Initialize the SDK
const sdk = new GeoSDK();
await sdk.initialize();

// Forward geocoding (address to coordinates)
const results = await sdk.geocode("حي الروضة الرياض");

// Reverse geocoding (coordinates to address)
const nearby = await sdk.reverseGeocode(24.7, 46.6);

// Search by postcode
const addresses = await sdk.searchByPostcode("13847");`}
              />
            </CardContent>
          </Card>
          <div className="text-center mt-8">
            <Button asChild>
              <Link to="/docs/getting-started">
                {t("common.learnMore")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>
            {t("footer.builtWith")} <span className="text-primary">DuckDB-WASM</span> & H3
          </p>
          <div className="flex justify-center gap-4 mt-2">
            <a
              href="https://github.com/tabaqatdev/geocoding-wasm"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {t("footer.github")}
            </a>
            <Link to="/docs/api-reference" className="hover:text-foreground transition-colors">
              {t("footer.docs")}
            </Link>
          </div>
        </div>
      </footer>
    </Layout>
  );
}
