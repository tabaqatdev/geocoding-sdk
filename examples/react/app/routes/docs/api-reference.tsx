import { useMemo } from "react";
import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { CodeBlock } from "~/components/ui/code-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { parseTypeDocJson, type MethodInfo, type InterfaceInfo } from "~/lib/api-docs-parser";
import apiDocsJson from "~/data/api-docs.json";
import type { Route } from "./+types/api-reference";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "API Reference - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Complete TypeScript API documentation" },
  ];
}

export default function ApiReference() {
  const { t, language } = useTranslation();

  // Parse the TypeDoc JSON
  const { methods, interfaces } = useMemo(() => parseTypeDocJson(apiDocsJson), []);

  // Group methods by category
  const methodsByCategory = useMemo(() => {
    const grouped = new Map<string, MethodInfo[]>();
    for (const method of methods) {
      const existing = grouped.get(method.category) || [];
      existing.push(method);
      grouped.set(method.category, existing);
    }
    return grouped;
  }, [methods]);

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            {language === "ar" ? "مرجع" : "Reference"}
          </Badge>
          <h1 className="text-3xl font-bold mb-2">{t("docs.apiReference.title")}</h1>
          <p className="text-muted-foreground">{t("docs.apiReference.description")}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {language === "ar"
              ? "يتم إنشاء هذه الوثائق تلقائيًا من الكود المصدري"
              : "Auto-generated from source code using TypeDoc"}
          </p>
        </div>

        {/* Methods by Category */}
        {Array.from(methodsByCategory.entries()).map(([category, categoryMethods]) => (
          <Card key={category} className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span dir="ltr">{category}</span>
                <Badge variant="outline" className="text-xs">
                  {categoryMethods.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto" dir="ltr">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">
                        {language === "ar" ? "الدالة" : "Method"}
                      </TableHead>
                      <TableHead className="w-[200px]">
                        {language === "ar" ? "النوع المُرجع" : "Returns"}
                      </TableHead>
                      <TableHead>{language === "ar" ? "الوصف" : "Description"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryMethods.map((m) => (
                      <TableRow key={m.name}>
                        <TableCell className="font-mono text-sm">
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{m.name}()</code>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {m.returns}
                        </TableCell>
                        <TableCell className="text-sm">{m.description || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Interfaces */}
        <h2 className="text-2xl font-bold mt-12 mb-6">{language === "ar" ? "الأنواع" : "Types"}</h2>

        {interfaces.map((iface) => (
          <InterfaceCard key={iface.name} iface={iface} />
        ))}
      </div>
    </Layout>
  );
}

function InterfaceCard({ iface }: { iface: InterfaceInfo }) {
  const code = useMemo(() => {
    const props = iface.properties
      .map((p) => {
        const comment = p.description ? `  /** ${p.description} */\n` : "";
        return `${comment}  ${p.name}${p.optional ? "?" : ""}: ${p.type};`;
      })
      .join("\n");
    return `interface ${iface.name} {\n${props}\n}`;
  }, [iface]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="font-mono text-lg">
          <span dir="ltr">{iface.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div dir="ltr">
          <CodeBlock language="typescript" code={code} />
        </div>
      </CardContent>
    </Card>
  );
}
