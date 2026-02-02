import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useTheme } from "~/hooks/use-theme";

interface MermaidProps {
  chart: string;
  className?: string;
}

// Counter for unique IDs
let idCounter = 0;

export function Mermaid({ chart, className = "" }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${++idCounter}`);
  const { theme } = useTheme();
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  // Detect theme changes
  useEffect(() => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setCurrentTheme(isDark ? "dark" : "light");
  }, [theme]);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        // Reinitialize mermaid with the current theme
        mermaid.initialize({
          startOnLoad: false,
          theme: currentTheme === "dark" ? "dark" : "default",
          securityLevel: "loose",
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: "basis",
          },
          themeVariables:
            currentTheme === "dark"
              ? {
                  primaryColor: "#4a90e2",
                  primaryTextColor: "#e5e5e5",
                  primaryBorderColor: "#6b8cae",
                  lineColor: "#6b8cae",
                  secondaryColor: "#2d3748",
                  tertiaryColor: "#1a202c",
                  background: "#1a202c",
                  mainBkg: "#2d3748",
                  secondBkg: "#1a202c",
                  labelColor: "#e5e5e5",
                  textColor: "#e5e5e5",
                  fontSize: "14px",
                }
              : {
                  primaryColor: "#4a90e2",
                  primaryTextColor: "#1a202c",
                  primaryBorderColor: "#2d3748",
                  lineColor: "#6b8cae",
                  secondaryColor: "#f7fafc",
                  tertiaryColor: "#ffffff",
                  background: "#ffffff",
                  mainBkg: "#f7fafc",
                  secondBkg: "#ffffff",
                  labelColor: "#1a202c",
                  textColor: "#1a202c",
                  fontSize: "14px",
                },
        });

        // Clear previous content
        containerRef.current.innerHTML = "";

        // Render the diagram
        const { svg } = await mermaid.render(idRef.current, chart);
        containerRef.current.innerHTML = svg;
      } catch (error) {
        console.error("Mermaid rendering error:", error);
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre class="text-destructive text-sm">Error rendering diagram: ${error instanceof Error ? error.message : "Unknown error"}</pre>`;
        }
      }
    };

    renderDiagram();
  }, [chart, currentTheme]);

  return <div ref={containerRef} className={`mermaid-diagram ${className}`} />;
}
