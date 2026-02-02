import { useEffect, useRef } from "react";
import mermaid from "mermaid";

interface MermaidProps {
  chart: string;
  className?: string;
}

// Initialize mermaid with configuration
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis",
  },
});

// Counter for unique IDs
let idCounter = 0;

export function Mermaid({ chart, className = "" }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${++idCounter}`);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        // Clear previous content
        containerRef.current.innerHTML = "";

        // Render the diagram
        const { svg } = await mermaid.render(idRef.current, chart);
        containerRef.current.innerHTML = svg;
      } catch (error) {
        console.error("Mermaid rendering error:", error);
        containerRef.current.innerHTML = `<pre class="text-destructive text-sm">Error rendering diagram: ${error instanceof Error ? error.message : "Unknown error"}</pre>`;
      }
    };

    renderDiagram();
  }, [chart]);

  return <div ref={containerRef} className={`mermaid-diagram ${className}`} />;
}
