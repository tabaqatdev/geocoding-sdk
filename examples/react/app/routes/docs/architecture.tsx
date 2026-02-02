import { Layout } from "~/components/layout/layout";
import { useTranslation } from "~/i18n/context";
import { Badge } from "~/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Mermaid } from "~/components/ui/mermaid";
import type { Route } from "./+types/architecture";
import { useMemo } from "react";
import architectureMdEn from "./ARCHITECTURE.en.md?raw";
import architectureMdAr from "./ARCHITECTURE.ar.md?raw";

export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Architecture - Saudi Arabia Geocoding SDK" },
    { name: "description", content: "Technical architecture and data flow documentation" },
  ];
}

interface MermaidSection {
  title: string;
  chart: string;
}

function extractMermaidDiagrams(markdown: string): {
  sections: MermaidSection[];
  remainingContent: string;
} {
  const sections: MermaidSection[] = [];
  let content = markdown;

  // Extract all mermaid code blocks with their preceding headers
  const mermaidRegex = /##\s+([^\n]+)\n+```mermaid\n([\s\S]+?)```/g;
  let match;

  while ((match = mermaidRegex.exec(markdown)) !== null) {
    const title = match[1].trim();
    const chart = match[2].trim();
    sections.push({ title, chart });
  }

  // Remove mermaid blocks from content
  content = content.replace(/```mermaid\n[\s\S]+?```/g, "");

  return { sections, remainingContent: content };
}

export default function Architecture() {
  const { language } = useTranslation();

  const architectureMd = language === "ar" ? architectureMdAr : architectureMdEn;

  const { sections, remainingContent } = useMemo(
    () => extractMermaidDiagrams(architectureMd),
    [architectureMd]
  );

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-8">
          <Badge variant="secondary" className="mb-2">
            {language === "ar" ? "وثائق تقنية" : "Technical Docs"}
          </Badge>
          <h1 className="text-3xl font-bold mb-2">
            {language === "ar" ? "هندسة النظام" : "Architecture"}
          </h1>
          <p className="text-muted-foreground">
            {language === "ar"
              ? "الهندسة المعمارية التقنية وتدفق البيانات"
              : "Technical architecture and data flow documentation"}
          </p>
        </div>

        {/* Render all Mermaid diagrams */}
        {sections.map((section, index) => (
          <div key={index} className="mb-8">
            <h2 className="text-2xl font-bold mb-4">{section.title}</h2>
            <div className="border rounded-lg p-6 bg-card overflow-x-auto">
              <Mermaid chart={section.chart} />
            </div>
          </div>
        ))}

        {/* Render remaining markdown content */}
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {remainingContent}
          </ReactMarkdown>
        </div>
      </div>
    </Layout>
  );
}
