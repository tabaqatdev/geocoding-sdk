import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "./button";
import { Check, Copy } from "lucide-react";
import { useTheme } from "~/hooks/use-theme";
import { cn } from "~/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  className?: string;
  filename?: string;
}

export function CodeBlock({
  code,
  language = "typescript",
  showLineNumbers = false,
  className,
  filename,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative group", className)} dir="ltr">
      {/* Filename header */}
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted border-b border-border rounded-t-lg">
          <span className="text-xs font-mono text-muted-foreground">{filename}</span>
        </div>
      )}

      {/* Copy button */}
      <Button
        size="icon"
        variant="ghost"
        className={cn(
          "absolute z-10 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity",
          filename ? "top-10 right-2" : "top-2 right-2"
        )}
        onClick={handleCopy}
        aria-label="Copy code"
      >
        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
      </Button>

      {/* Code block */}
      <div className={cn("overflow-x-auto", filename ? "rounded-b-lg" : "rounded-lg")}>
        <SyntaxHighlighter
          language={language}
          style={theme === "dark" ? oneDark : oneLight}
          showLineNumbers={showLineNumbers}
          customStyle={{
            margin: 0,
            borderRadius: filename ? "0 0 0.5rem 0.5rem" : "0.5rem",
            fontSize: "0.875rem",
            padding: "1rem",
          }}
          codeTagProps={{
            style: {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
